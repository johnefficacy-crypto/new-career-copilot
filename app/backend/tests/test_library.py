"""Tests for the PR1 Document Asset Foundation (`app.api.library`).

Mirrors the pattern used by `test_community_runtime.py` and the rest of the
admin/persona test suite: FastAPI sub-app with the router mounted under
`/api`, `get_current_user` overridden per test, and a hand-rolled in-memory
Supabase stub. Storage is faked too — `create_signed_*` and `download` are
patched onto the stub so no network is needed.
"""
from __future__ import annotations

import hashlib
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import library as library_api
from app.core.auth import get_current_user


USER_A = {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "a@example.com",
    "role": "user",
    "plan": "free",
}
USER_B = {
    "id": "22222222-2222-2222-2222-222222222222",
    "email": "b@example.com",
    "role": "user",
    "plan": "free",
}


# ── Tiny Supabase stub ─────────────────────────────────────────────────────


class _R:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, table: str, db: dict[str, list[dict]]):
        self.table = table
        self.db = db
        self._filters: list[tuple[str, str, Any]] = []
        self._order_key: str | None = None
        self._desc = False
        self._limit: int | None = None
        self._op = "select"
        self._payload: Any = None

    def select(self, *a, **kw):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, patch):
        self._op = "update"
        self._payload = patch
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, key, val):
        self._filters.append((key, "eq", val))
        return self

    def neq(self, key, val):
        self._filters.append((key, "neq", val))
        return self

    def lt(self, key, val):
        self._filters.append((key, "lt", val))
        return self

    def order(self, key, desc=False, **kw):
        self._order_key = key
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _match(self, row) -> bool:
        for k, op, v in self._filters:
            cell = row.get(k)
            if op == "eq" and cell != v:
                return False
            if op == "neq" and cell == v:
                return False
            if op == "lt" and not (cell is not None and cell < v):
                return False
        return True

    def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self._op == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for p in payloads:
                r = dict(p)
                r.setdefault("id", str(uuid4()))
                r.setdefault("created_at", f"2026-05-18T00:00:{len(rows):02d}Z")
                r.setdefault("updated_at", r["created_at"])
                rows.append(r)
                inserted.append(r)
            return _R(inserted)
        if self._op == "update":
            updated = []
            for r in rows:
                if self._match(r):
                    r.update(self._payload or {})
                    updated.append(r)
            return _R(updated)
        if self._op == "delete":
            keep, removed = [], []
            for r in rows:
                (removed if self._match(r) else keep).append(r)
            self.db[self.table] = keep
            return _R(removed)
        matched = [dict(r) for r in rows if self._match(r)]
        if self._order_key:
            matched.sort(key=lambda x: x.get(self._order_key) or "", reverse=self._desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        return _R(matched)


class _FakeStorageObject:
    """Per-bucket facade. Captures uploads so `download` can return them."""

    def __init__(self, bucket: str, parent: "_FakeStorage"):
        self.bucket = bucket
        self.parent = parent

    def create_signed_upload_url(self, path: str) -> dict:
        return {
            "signed_url": f"https://fake-storage.local/{self.bucket}/{path}?upload=1",
            "token": f"token-{path}",
        }

    def create_signed_url(self, path: str, expires_in: int) -> dict:
        return {
            "signed_url": f"https://fake-storage.local/{self.bucket}/{path}?ttl={expires_in}",
        }

    def download(self, path: str) -> bytes | None:
        return self.parent.objects.get((self.bucket, path))


class _FakeStorage:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def from_(self, bucket: str) -> _FakeStorageObject:
        return _FakeStorageObject(bucket, self)


class _SB:
    def __init__(self, *, db: dict | None = None):
        self.db: dict[str, list[dict]] = db or {}
        self.storage = _FakeStorage()

    def table(self, name: str) -> _Q:
        return _Q(name, self.db)


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def sb(monkeypatch):
    fake = _SB()
    monkeypatch.setattr(library_api, "get_supabase_admin", lambda: fake)
    return fake


def _app(sb: _SB, user: dict) -> TestClient:
    app = FastAPI()
    app.include_router(library_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


# Convenience: pre-upload bytes into the fake storage so complete-upload can
# verify them. Returns (storage_path, sha256_hex, size).
def _stage_object(sb: _SB, *, user_id: str, filename: str, data: bytes, bucket: str = "library"):
    path = f"{user_id}/2026/05/18/abc/{filename}"
    sb.storage.objects[(bucket, path)] = data
    return path, hashlib.sha256(data).hexdigest(), len(data)


# ── Tests ─────────────────────────────────────────────────────────────────


def test_complete_upload_creates_row_with_owner(sb):
    path, _, size = _stage_object(sb, user_id=USER_A["id"], filename="note.pdf", data=b"%PDF-1.4 hi")
    client = _app(sb, USER_A)
    r = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": "note.pdf",
            "mime_type": "application/pdf",
            "size_bytes": size,
            "document_kind": "note_pdf",
            "title": "Polity Notes",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scope"] == "personal_library"
    assert body["status"] == "uploaded"
    assert body["original_filename"] == "note.pdf"
    assert body["metadata"]["hash_verified"] is True

    rows = sb.db["document_assets"]
    assert len(rows) == 1
    assert rows[0]["owner_user_id"] == USER_A["id"]
    assert rows[0]["uploaded_by"] == USER_A["id"]
    assert rows[0]["content_hash"] == hashlib.sha256(b"%PDF-1.4 hi").hexdigest()


def test_list_returns_only_own_documents(sb):
    sb.db["document_assets"] = [
        {
            "id": "doc-a-1", "owner_user_id": USER_A["id"], "scope": "personal_library",
            "document_kind": "note_pdf", "original_filename": "a.pdf", "mime_type": "application/pdf",
            "storage_bucket": "library", "storage_path": "a/1", "content_hash": "h1",
            "status": "uploaded", "metadata": {}, "created_at": "2026-05-18T10:00:00Z",
            "updated_at": "2026-05-18T10:00:00Z", "processing_policy": "store_only",
            "visibility": "private", "file_size_bytes": 10,
        },
        {
            "id": "doc-b-1", "owner_user_id": USER_B["id"], "scope": "personal_library",
            "document_kind": "note_pdf", "original_filename": "b.pdf", "mime_type": "application/pdf",
            "storage_bucket": "library", "storage_path": "b/1", "content_hash": "h2",
            "status": "uploaded", "metadata": {}, "created_at": "2026-05-18T10:00:00Z",
            "updated_at": "2026-05-18T10:00:00Z", "processing_policy": "store_only",
            "visibility": "private", "file_size_bytes": 10,
        },
    ]
    r = _app(sb, USER_A).get("/api/library/items")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == "doc-a-1"


def test_user_b_404_on_user_a_document(sb):
    sb.db["document_assets"] = [
        {
            "id": "33333333-3333-3333-3333-333333333333", "owner_user_id": USER_A["id"],
            "scope": "personal_library", "document_kind": "note_pdf",
            "original_filename": "a.pdf", "mime_type": "application/pdf",
            "storage_bucket": "library", "storage_path": "a/1", "content_hash": "h1",
            "status": "uploaded", "metadata": {}, "created_at": "2026-05-18T10:00:00Z",
            "updated_at": "2026-05-18T10:00:00Z", "processing_policy": "store_only",
            "visibility": "private", "file_size_bytes": 10,
        }
    ]
    r = _app(sb, USER_B).get("/api/library/items/33333333-3333-3333-3333-333333333333")
    assert r.status_code == 404


def test_invalid_mime_rejected(sb):
    client = _app(sb, USER_A)
    r = client.post(
        "/api/library/upload-url",
        json={
            "filename": "evil.exe",
            "mime_type": "application/x-msdownload",
            "size_bytes": 1024,
            "document_kind": "other",
        },
    )
    assert r.status_code == 400


def test_oversize_rejected(sb, monkeypatch):
    monkeypatch.setattr(
        library_api,
        "_max_bytes",
        lambda: 1024,  # 1 KB cap for this test
    )
    client = _app(sb, USER_A)
    r = client.post(
        "/api/library/upload-url",
        json={
            "filename": "huge.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 5000,
            "document_kind": "note_pdf",
        },
    )
    assert r.status_code == 400
    assert "file_too_large" in r.text


def test_normal_user_cannot_use_admin_scope(sb):
    path, _, size = _stage_object(sb, user_id=USER_A["id"], filename="syl.pdf", data=b"%PDF-1.4 syl")
    client = _app(sb, USER_A)
    r = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": "syl.pdf",
            "mime_type": "application/pdf",
            "size_bytes": size,
            "document_kind": "syllabus",
            "scope": "admin_exam_intelligence",
        },
    )
    assert r.status_code == 403


def test_delete_archives_and_filtering(sb):
    path, _, size = _stage_object(sb, user_id=USER_A["id"], filename="n.pdf", data=b"%PDF-1.4 n")
    client = _app(sb, USER_A)
    created = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path, "original_filename": "n.pdf",
            "mime_type": "application/pdf", "size_bytes": size, "document_kind": "note_pdf",
        },
    ).json()
    item_id = created["id"]

    # Default list shows the row.
    visible = client.get("/api/library/items").json()["items"]
    assert any(i["id"] == item_id for i in visible)

    # Archive it.
    d = client.delete(f"/api/library/items/{item_id}")
    assert d.status_code == 200
    assert d.json()["status"] == "archived"

    # Hidden by default.
    assert not any(
        i["id"] == item_id for i in client.get("/api/library/items").json()["items"]
    )
    # Visible when including archived.
    with_archived = client.get(
        "/api/library/items", params={"include_archived": "true"}
    ).json()["items"]
    assert any(i["id"] == item_id and i["status"] == "archived" for i in with_archived)


def test_processing_jobs_visible_only_to_owner(sb):
    doc_id = "44444444-4444-4444-4444-444444444444"
    sb.db["document_assets"] = [
        {
            "id": doc_id, "owner_user_id": USER_A["id"], "scope": "personal_library",
            "document_kind": "note_pdf", "original_filename": "x.pdf",
            "mime_type": "application/pdf", "storage_bucket": "library",
            "storage_path": "x/1", "content_hash": "h", "status": "uploaded",
            "metadata": {}, "created_at": "2026-05-18T10:00:00Z",
            "updated_at": "2026-05-18T10:00:00Z", "processing_policy": "store_only",
            "visibility": "private", "file_size_bytes": 10,
        }
    ]
    # Service-role inserts a job row directly (simulating later PR worker).
    sb.db["document_processing_jobs"] = [
        {
            "id": "job-1", "document_id": doc_id, "job_type": "text_extract",
            "status": "queued", "attempt_count": 0, "metrics": {},
            "created_at": "2026-05-18T10:01:00Z",
        }
    ]

    # Owner sees the job.
    r = _app(sb, USER_A).get(f"/api/library/items/{doc_id}/jobs")
    assert r.status_code == 200
    jobs = r.json()["jobs"]
    assert len(jobs) == 1 and jobs[0]["job_type"] == "text_extract"

    # Non-owner cannot reach the doc — gets 404 before any job read.
    r2 = _app(sb, USER_B).get(f"/api/library/items/{doc_id}/jobs")
    assert r2.status_code == 404


def test_upload_url_returns_signed_url(sb):
    client = _app(sb, USER_A)
    r = client.post(
        "/api/library/upload-url",
        json={
            "filename": "note.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 2048,
            "document_kind": "note_pdf",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["storage_bucket"] == "library"
    assert body["storage_path"].startswith(USER_A["id"] + "/")
    assert body["upload_url"].startswith("https://fake-storage.local/library/")
    assert body["expires_in"] > 0


def test_size_mismatch_rejected(sb):
    # Stage 10 bytes, claim 9999 → server detects.
    path, _, _ = _stage_object(sb, user_id=USER_A["id"], filename="t.pdf", data=b"ten-bytes!")
    client = _app(sb, USER_A)
    r = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path, "original_filename": "t.pdf",
            "mime_type": "application/pdf", "size_bytes": 9999, "document_kind": "note_pdf",
        },
    )
    assert r.status_code == 400
    assert "size_mismatch" in r.text


def test_download_url_owner_only(sb):
    doc_id = "55555555-5555-5555-5555-555555555555"
    sb.db["document_assets"] = [
        {
            "id": doc_id, "owner_user_id": USER_A["id"], "scope": "personal_library",
            "document_kind": "note_pdf", "original_filename": "x.pdf",
            "mime_type": "application/pdf", "storage_bucket": "library",
            "storage_path": "users/a/x.pdf", "content_hash": "h",
            "status": "uploaded", "metadata": {}, "created_at": "2026-05-18T10:00:00Z",
            "updated_at": "2026-05-18T10:00:00Z", "processing_policy": "store_only",
            "visibility": "private", "file_size_bytes": 10,
        }
    ]
    ok = _app(sb, USER_A).get(f"/api/library/items/{doc_id}/download-url")
    assert ok.status_code == 200
    assert ok.json()["url"].startswith("https://fake-storage.local/library/")

    deny = _app(sb, USER_B).get(f"/api/library/items/{doc_id}/download-url")
    assert deny.status_code == 404
