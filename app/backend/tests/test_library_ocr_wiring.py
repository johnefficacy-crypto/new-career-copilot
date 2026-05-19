"""PR3 — OCR job wiring tests.

Covers the OCR control surface (schema + state machine + enqueue) with
``LIBRARY_OCR_ENGINE='none'``. PR4 will replace `none` with a real
engine; nothing in this file should bind to engine-specific behavior.

Reuses the in-memory Supabase stub from
``test_library_text_extract.py``. The stub already supports every
operator the OCR service uses (``eq``, ``in_``, ``order``, ``limit``,
``insert``, ``update``).
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import library as library_api
from app.core import config as config_mod
from app.core.auth import get_current_user
from app.library import ocr as ocr_svc
from app.library import text_extract as text_extract_svc

from tests.test_library_text_extract import (
    _SB,
    USER_A,
    USER_B,
    _seed_doc,
    _patch_parser,
)


@pytest.fixture
def sb(monkeypatch):
    fake = _SB()
    monkeypatch.setattr(library_api, "get_supabase_admin", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def reset_settings_cache():
    """Settings is constructed once and cached via lru_cache; flip the
    cached instance between tests so each test starts clean."""
    config_mod.get_settings.cache_clear()
    yield
    config_mod.get_settings.cache_clear()


def _force_engine(monkeypatch, value: str) -> None:
    """`Settings.LIBRARY_OCR_ENGINE` is a class-level default evaluated
    at module import (`os.getenv` runs once). `monkeypatch.setenv` runs
    too late to affect it. Patch the class attribute directly so each
    fresh ``Settings()`` instance reads the test-specific engine."""
    monkeypatch.setattr(config_mod.Settings, "LIBRARY_OCR_ENGINE", value)
    config_mod.get_settings.cache_clear()


def _client(sb_: _SB, user: dict) -> TestClient:
    app = FastAPI()
    app.include_router(library_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


# ── auto-enqueue via text extract (engine=none) ───────────────────────────


def test_auto_enqueue_creates_skipped_job_with_engine_none(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb"
    _seed_doc(sb, doc_id=doc_id)
    # Force all pages to look empty so likely_needs_ocr → True.
    _patch_parser(monkeypatch, ["", "", ""], page_count=3)

    r = _client(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 200, r.text
    assert r.json()["job"]["metrics"]["likely_needs_ocr"] is True

    jobs = sb.db.get("library_ocr_jobs", [])
    assert len(jobs) == 1
    job = jobs[0]
    assert job["item_id"] == doc_id
    assert job["user_id"] == USER_A["id"]
    assert job["status"] == "skipped"
    assert job["error_message"] == "ocr_engine_disabled"
    assert job["trigger_reason"] == "auto_likely_needs_ocr"
    assert job["engine"] == "none"


def test_rerun_text_extract_does_not_duplicate_active_job(sb, monkeypatch):
    # With engine='none' the first auto-enqueue immediately moves to
    # `skipped` (terminal), so a *second* extract run is free to create
    # another row. Pin the engine to a non-none value so the first job
    # stays in `pending` and the partial unique index guards the second.
    _force_engine(monkeypatch, "tesseract-stub")
    doc_id = "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb"
    _seed_doc(sb, doc_id=doc_id)
    _patch_parser(monkeypatch, ["", "", ""], page_count=3)

    _client(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    first_jobs = list(sb.db.get("library_ocr_jobs", []))
    assert len(first_jobs) == 1
    assert first_jobs[0]["status"] == "pending"

    # Second extract run: auto_enqueue_from_text_extract sees the
    # active job and returns it instead of inserting a duplicate.
    _client(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    second_jobs = sb.db.get("library_ocr_jobs", [])
    assert len(second_jobs) == 1
    assert second_jobs[0]["id"] == first_jobs[0]["id"]


# ── POST /ocr (manual request) ────────────────────────────────────────────


def test_post_ocr_creates_job_when_none_exists(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "cccccccc-1111-1111-1111-cccccccccccc"
    _seed_doc(sb, doc_id=doc_id)

    r = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enqueued"] is True
    assert body["job"]["status"] == "skipped"
    assert body["job"]["trigger_reason"] == "manual_request"


def test_post_ocr_returns_409_when_active_job_exists(sb, monkeypatch):
    _force_engine(monkeypatch, "tesseract-stub")
    doc_id = "cccccccc-2222-2222-2222-cccccccccccc"
    _seed_doc(sb, doc_id=doc_id)

    first = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    assert first.status_code == 200
    first_job = first.json()["job"]
    assert first_job["status"] == "pending"

    second = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    # The endpoint returns 200 with `enqueued=False` and the existing
    # job body. The 409 semantic is preserved in the `code` field.
    assert second.status_code == 200
    body = second.json()
    assert body["enqueued"] is False
    assert body["code"] == "ocr_active_job_exists"
    assert body["job"]["id"] == first_job["id"]


def test_post_ocr_on_non_owned_item_404(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "cccccccc-3333-3333-3333-cccccccccccc"
    _seed_doc(sb, doc_id=doc_id, owner=USER_A)
    r = _client(sb, USER_B).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    assert r.status_code == 404


def test_post_ocr_rejects_invalid_trigger_reason(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "cccccccc-4444-4444-4444-cccccccccccc"
    _seed_doc(sb, doc_id=doc_id)
    r = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "auto_likely_needs_ocr"},  # not allowed manually
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "invalid_trigger_reason"


# ── retry from a terminal state ───────────────────────────────────────────


def test_retry_after_terminal_state_creates_new_job(sb, monkeypatch):
    """A `skipped` (terminal) job does NOT block a fresh `retry` request.

    The partial unique index only covers active statuses, so terminal
    rows never participate in the uniqueness check.
    """
    _force_engine(monkeypatch, "none")
    doc_id = "dddddddd-1111-1111-1111-dddddddddddd"
    _seed_doc(sb, doc_id=doc_id)

    first = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    assert first.status_code == 200
    first_job = first.json()["job"]
    assert first_job["status"] == "skipped"

    second = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "retry"},
    )
    assert second.status_code == 200
    second_job = second.json()["job"]
    assert second_job["id"] != first_job["id"]
    assert second_job["trigger_reason"] == "retry"
    assert second_job["status"] == "skipped"  # engine='none' finalizes again


# ── GET /ocr ──────────────────────────────────────────────────────────────


def test_get_latest_ocr_returns_404_when_none(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "eeeeeeee-1111-1111-1111-eeeeeeeeeeee"
    _seed_doc(sb, doc_id=doc_id)
    r = _client(sb, USER_A).get(f"/api/library/items/{doc_id}/ocr")
    assert r.status_code == 404


def test_get_latest_ocr_returns_most_recent(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "eeeeeeee-2222-2222-2222-eeeeeeeeeeee"
    _seed_doc(sb, doc_id=doc_id)
    _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "retry"},
    )
    r = _client(sb, USER_A).get(f"/api/library/items/{doc_id}/ocr")
    assert r.status_code == 200
    assert r.json()["job"]["trigger_reason"] == "retry"


def test_get_latest_ocr_non_owner_404(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "eeeeeeee-3333-3333-3333-eeeeeeeeeeee"
    _seed_doc(sb, doc_id=doc_id, owner=USER_A)
    _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    r = _client(sb, USER_B).get(f"/api/library/items/{doc_id}/ocr")
    assert r.status_code == 404


# ── GET /ocr/jobs/{id} ────────────────────────────────────────────────────


def test_get_ocr_job_owner_read(sb, monkeypatch):
    _force_engine(monkeypatch, "none")
    doc_id = "ffffffff-1111-1111-1111-ffffffffffff"
    _seed_doc(sb, doc_id=doc_id)
    created = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    job_id = created.json()["job"]["id"]

    r = _client(sb, USER_A).get(f"/api/library/ocr/jobs/{job_id}")
    assert r.status_code == 200
    assert r.json()["job"]["id"] == job_id


def test_get_ocr_job_non_owner_returns_404(sb, monkeypatch):
    """Authenticated non-owner sees zero rows — the API filters by
    user_id, equivalent to the RLS `owner_select` policy in migration 114."""
    _force_engine(monkeypatch, "none")
    doc_id = "ffffffff-2222-2222-2222-ffffffffffff"
    _seed_doc(sb, doc_id=doc_id, owner=USER_A)
    created = _client(sb, USER_A).post(
        f"/api/library/items/{doc_id}/ocr",
        json={"trigger_reason": "manual_request"},
    )
    job_id = created.json()["job"]["id"]

    r = _client(sb, USER_B).get(f"/api/library/ocr/jobs/{job_id}")
    assert r.status_code == 404


# ── service-level helpers (no HTTP) ───────────────────────────────────────


def test_enqueue_ocr_job_idempotent_at_service_layer(sb, monkeypatch):
    _force_engine(monkeypatch, "tesseract-stub")
    doc_id = "abcdef00-0000-0000-0000-abcdef000001"
    _seed_doc(sb, doc_id=doc_id)

    first, enqueued1 = ocr_svc.enqueue_ocr_job(
        sb, item_id=doc_id, user_id=USER_A["id"], trigger_reason="manual_request"
    )
    assert enqueued1 is True
    assert first["status"] == "pending"

    with pytest.raises(ocr_svc.OcrJobConflict) as exc_info:
        ocr_svc.enqueue_ocr_job(
            sb, item_id=doc_id, user_id=USER_A["id"], trigger_reason="retry"
        )
    assert exc_info.value.existing["id"] == first["id"]


def test_invalid_uuid_inputs_rejected(sb):
    with pytest.raises(ocr_svc.OcrJobError) as exc:
        ocr_svc.enqueue_ocr_job(
            sb, item_id="not-a-uuid", user_id=USER_A["id"],
            trigger_reason="manual_request",
        )
    assert exc.value.code == "invalid_item_id"

    with pytest.raises(ocr_svc.OcrJobError) as exc:
        ocr_svc.enqueue_ocr_job(
            sb, item_id=str(uuid4()), user_id="bad",
            trigger_reason="manual_request",
        )
    assert exc.value.code == "invalid_user_id"

    with pytest.raises(ocr_svc.OcrJobError) as exc:
        ocr_svc.enqueue_ocr_job(
            sb, item_id=str(uuid4()), user_id=USER_A["id"],
            trigger_reason="bogus",
        )
    assert exc.value.code == "invalid_trigger_reason"
