"""Personal Library — Document Asset Foundation (PR1).

Backend foundation for user file uploads. Storage-only: no parsing, no OCR,
no extraction, no frontend. Two-step upload flow:

    1. POST /library/upload-url       → server mints signed URL + storage_path
    2. (client uploads bytes directly to Supabase Storage)
    3. POST /library/complete-upload  → server verifies + writes metadata row

Auth is mirrored from `notes.py` (Supabase access-token via get_current_user).
RLS in migration 111 is the durable owner-only gate; this module adds a
defense layer that rejects admin scopes from non-admin callers and always
derives `owner_user_id` from the auth dependency.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.library")

router = APIRouter(prefix="/library", tags=["library"])


# ── Allow-listed inputs ───────────────────────────────────────────────────

ALLOWED_MIME_TYPES: set[str] = {
    "application/pdf",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/webp",
}

# Extensions cross-checked against the MIME type. Both must agree.
ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    "application/pdf": {"pdf"},
    "text/plain": {"txt"},
    "image/png": {"png"},
    "image/jpeg": {"jpg", "jpeg"},
    "image/webp": {"webp"},
}

ALLOWED_DOCUMENT_KINDS: set[str] = {
    "note_pdf",
    "image",
    "text_file",
    "pyq_paper",
    "syllabus",
    "notification",
    "corrigendum",
    "answer_key",
    "other",
}

# Document kinds permitted under personal_library. Admin-only kinds are
# rejected at the API layer in addition to the RLS gate.
PERSONAL_LIBRARY_KINDS: set[str] = {
    "note_pdf",
    "image",
    "text_file",
    "other",
}


# ── Helpers ───────────────────────────────────────────────────────────────


def _is_uuid(value: Any) -> bool:
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _extension(filename: str) -> str:
    return (os.path.splitext(filename or "")[1] or "").lstrip(".").lower()


_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename_fragment(filename: str) -> str:
    base = os.path.basename(filename or "")
    cleaned = _SAFE_FILENAME_RE.sub("-", base).strip("-._") or "file"
    return cleaned[:80]


def _max_bytes() -> int:
    return get_settings().LIBRARY_MAX_UPLOAD_MB * 1024 * 1024


def _bucket() -> str:
    return get_settings().LIBRARY_STORAGE_BUCKET


def _shape(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "scope": row.get("scope"),
        "document_kind": row.get("document_kind"),
        "title": row.get("title"),
        "original_filename": row.get("original_filename"),
        "mime_type": row.get("mime_type"),
        "file_size_bytes": row.get("file_size_bytes"),
        "storage_bucket": row.get("storage_bucket"),
        "storage_path": row.get("storage_path"),
        "content_hash": row.get("content_hash"),
        "language_hint": row.get("language_hint"),
        "page_count": row.get("page_count"),
        "processing_policy": row.get("processing_policy"),
        "visibility": row.get("visibility"),
        "status": row.get("status"),
        "metadata": row.get("metadata") or {},
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _validate_upload_request(
    filename: str, mime_type: str, size_bytes: int | None
) -> None:
    if not filename or not filename.strip():
        raise HTTPException(status_code=400, detail="filename is required")
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Unsupported mime_type: {mime_type!r}"
        )
    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS[mime_type]:
        raise HTTPException(
            status_code=400,
            detail=f"Extension '.{ext}' does not match mime_type {mime_type!r}",
        )
    if size_bytes is None or size_bytes <= 0:
        raise HTTPException(status_code=400, detail="size_bytes must be > 0")
    if size_bytes > _max_bytes():
        raise HTTPException(
            status_code=400,
            detail={
                "code": "file_too_large",
                "message": f"File exceeds {get_settings().LIBRARY_MAX_UPLOAD_MB} MB limit.",
                "max_bytes": _max_bytes(),
            },
        )


def _storage_path_for(user_id: str, filename: str) -> str:
    today = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    return f"{user_id}/{today}/{uuid4()}/{_safe_filename_fragment(filename)}"


def _try_download_bytes(bucket: str, path: str) -> bytes | None:
    """Best-effort fetch of the freshly-uploaded object so we can verify size
    and compute a server-side sha256. Returns ``None`` if the storage client
    raises (transient network, oversize, missing object) — callers fall back
    to the client-supplied hash with `hash_verified=false`.
    """
    try:
        sb = get_supabase_admin()
        data = sb.storage.from_(bucket).download(path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("storage download failed for %s/%s: %s", bucket, path, exc)
        return None
    return bytes(data) if data is not None else None


def _sha256_hex(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


# ── Pydantic schemas ──────────────────────────────────────────────────────


class UploadUrlRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=120)
    size_bytes: int = Field(ge=1)
    document_kind: str = Field(default="other", max_length=60)


class UploadUrlResponse(BaseModel):
    storage_bucket: str
    storage_path: str
    upload_url: str
    upload_token: str | None = None
    expires_in: int


class CompleteUploadRequest(BaseModel):
    storage_path: str = Field(min_length=1, max_length=512)
    original_filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=120)
    size_bytes: int = Field(ge=1)
    document_kind: str = Field(default="other", max_length=60)
    title: str | None = Field(default=None, max_length=200)
    client_hash: str | None = Field(default=None, max_length=128)
    language_hint: str | None = Field(default=None, max_length=16)
    # Caller may declare scope explicitly; non-admins are forced to
    # 'personal_library' and rejected on any other value.
    scope: str = Field(default="personal_library", max_length=40)


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/upload-url", response_model=UploadUrlResponse)
def create_upload_url(
    body: UploadUrlRequest, user: dict = Depends(get_current_user)
) -> UploadUrlResponse:
    """Mint a one-shot signed URL the client uses to PUT bytes into storage.

    Validation: MIME allow-list, extension/MIME agreement, size ≤
    `LIBRARY_MAX_UPLOAD_MB`. `document_kind` is constrained to the personal
    library subset; admin kinds require a separate admin endpoint (later PR).
    """
    _validate_upload_request(body.filename, body.mime_type, body.size_bytes)
    if body.document_kind not in PERSONAL_LIBRARY_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"document_kind {body.document_kind!r} not allowed for personal library",
        )

    bucket = _bucket()
    path = _storage_path_for(user["id"], body.filename)
    settings = get_settings()

    sb = get_supabase_admin()
    try:
        signed = sb.storage.from_(bucket).create_signed_upload_url(path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("create_signed_upload_url failed")
        raise HTTPException(status_code=502, detail=f"Storage error: {exc}") from exc

    # storage3 returns either {"signed_url": ..., "token": ...} or
    # {"signedUrl": ..., "token": ...} depending on version — normalise.
    upload_url = (
        signed.get("signed_url")
        or signed.get("signedUrl")
        or signed.get("signedURL")
        or ""
    )
    token = signed.get("token")
    if not upload_url:
        raise HTTPException(status_code=502, detail="Storage did not return a signed URL")

    return UploadUrlResponse(
        storage_bucket=bucket,
        storage_path=path,
        upload_url=upload_url,
        upload_token=token,
        expires_in=settings.LIBRARY_UPLOAD_URL_TTL_SECONDS,
    )


@router.post("/complete-upload")
def complete_upload(
    body: CompleteUploadRequest, user: dict = Depends(get_current_user)
) -> dict:
    """Persist a row for an object the client has finished uploading.

    Server reads the object from storage when possible to compute a verified
    sha256. When the storage client can't return bytes (transient failure or
    network policy), the client-supplied hash is recorded instead and
    `metadata.hash_verified = false` so later jobs can re-verify.
    """
    _validate_upload_request(body.original_filename, body.mime_type, body.size_bytes)
    if body.document_kind not in ALLOWED_DOCUMENT_KINDS:
        raise HTTPException(status_code=400, detail="Invalid document_kind")
    # API-layer defense in depth on top of RLS: a normal caller may only
    # write the personal_library scope. Admin scopes require service-role
    # writes routed through a separate (later-PR) admin endpoint.
    if body.scope != "personal_library":
        raise HTTPException(
            status_code=403,
            detail="Only the 'personal_library' scope is writable through this endpoint",
        )
    if body.document_kind not in PERSONAL_LIBRARY_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"document_kind {body.document_kind!r} not allowed for personal library",
        )

    bucket = _bucket()
    metadata: dict[str, Any] = {}

    # Server-side hash if the storage client can stream the object back.
    object_bytes = _try_download_bytes(bucket, body.storage_path)
    content_hash: str
    if object_bytes is not None:
        if len(object_bytes) != body.size_bytes:
            # Mismatch is a hard failure: the client lied about size or the
            # object was tampered with between upload and complete.
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "size_mismatch",
                    "expected": body.size_bytes,
                    "actual": len(object_bytes),
                },
            )
        content_hash = _sha256_hex(object_bytes)
        if body.client_hash and body.client_hash.lower() != content_hash:
            metadata["client_hash_mismatch"] = True
            metadata["client_hash"] = body.client_hash
        metadata["hash_verified"] = True
    else:
        if not body.client_hash:
            raise HTTPException(
                status_code=400,
                detail="content_hash unavailable: storage read failed and no client_hash provided",
            )
        content_hash = body.client_hash.lower()
        metadata["hash_verified"] = False

    payload = {
        "owner_user_id": user["id"],
        "uploaded_by": user["id"],
        "scope": "personal_library",
        "document_kind": body.document_kind,
        "title": body.title,
        "original_filename": body.original_filename,
        "mime_type": body.mime_type,
        "file_size_bytes": body.size_bytes,
        "storage_bucket": bucket,
        "storage_path": body.storage_path,
        "content_hash": content_hash,
        "language_hint": body.language_hint,
        "processing_policy": "store_only",
        "visibility": "private",
        "status": "uploaded",
        "metadata": metadata,
    }

    sb = get_supabase_admin()
    inserted = sb.table("document_assets").insert(payload).execute().data
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to record document asset")
    row = inserted[0]

    # PR2: auto-enqueue text extraction for PDFs in the personal library.
    # Failures here must not fail the upload — log and move on.
    if (
        body.mime_type == "application/pdf"
        and body.document_kind in {"note_pdf", "other"}
    ):
        try:
            from app.library.text_extract import enqueue_text_extract_job

            enqueue_text_extract_job(sb, row["id"])
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "text_extract enqueue failed for document %s: %s", row.get("id"), exc
            )

    return _shape(row)


@router.get("/items")
def list_items(
    include_archived: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None, max_length=40),
    user: dict = Depends(get_current_user),
) -> dict:
    """List the caller's document assets, newest first. Cursor is the
    `created_at` of the last row from the previous page (RFC3339)."""
    sb = get_supabase_admin()
    query = (
        sb.table("document_assets")
        .select("*")
        .eq("owner_user_id", user["id"])
    )
    if not include_archived:
        query = query.neq("status", "archived")
    if cursor:
        query = query.lt("created_at", cursor)
    rows = (
        query.order("created_at", desc=True).limit(limit).execute().data or []
    )
    next_cursor = rows[-1].get("created_at") if len(rows) == limit else None
    return {
        "items": [_shape(r) for r in rows],
        "count": len(rows),
        "next_cursor": next_cursor,
    }


@router.get("/items/{item_id}")
def get_item(item_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    rows = (
        sb.table("document_assets")
        .select("*")
        .eq("id", item_id)
        .eq("owner_user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    return _shape(rows[0])


@router.get("/items/{item_id}/download-url", response_model=DownloadUrlResponse)
def get_download_url(
    item_id: str, user: dict = Depends(get_current_user)
) -> DownloadUrlResponse:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    rows = (
        sb.table("document_assets")
        .select("storage_bucket,storage_path,owner_user_id")
        .eq("id", item_id)
        .eq("owner_user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    row = rows[0]
    ttl = get_settings().LIBRARY_DOWNLOAD_URL_TTL_SECONDS
    try:
        signed = sb.storage.from_(row["storage_bucket"]).create_signed_url(
            row["storage_path"], ttl
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("create_signed_url failed")
        raise HTTPException(status_code=502, detail=f"Storage error: {exc}") from exc
    url = (
        signed.get("signed_url")
        or signed.get("signedUrl")
        or signed.get("signedURL")
        or ""
    )
    if not url:
        raise HTTPException(status_code=502, detail="Storage did not return a signed URL")
    return DownloadUrlResponse(url=url, expires_in=ttl)


@router.get("/items/{item_id}/jobs")
def list_processing_jobs(
    item_id: str, user: dict = Depends(get_current_user)
) -> dict:
    """Return processing-job rows for a document the caller owns. PR1 never
    writes here; this is a read endpoint for clients that want to render
    processing status once later PRs start enqueuing jobs."""
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    owned = (
        sb.table("document_assets")
        .select("id")
        .eq("id", item_id)
        .eq("owner_user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Document not found")
    rows = (
        sb.table("document_processing_jobs")
        .select("*")
        .eq("document_id", item_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"jobs": rows, "count": len(rows)}


@router.delete("/items/{item_id}")
def archive_item(item_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    updated = (
        sb.table("document_assets")
        .update({"status": "archived"})
        .eq("id", item_id)
        .eq("owner_user_id", user["id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True, "id": item_id, "status": "archived"}


# ── PR2: text extraction ──────────────────────────────────────────────────


@router.post("/items/{item_id}/process-text")
def process_text(item_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Run synchronous text extraction over a PDF the caller owns.

    404 — not owned; 409 — archived or a job is already running; 400 — id
    invalid or document is not a PDF. PR1-era uploads with no existing job
    are handled by lazily enqueuing then claiming.
    """
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")

    sb = get_supabase_admin()
    rows = (
        sb.table("document_assets")
        .select("*")
        .eq("id", item_id)
        .eq("owner_user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    document = rows[0]

    if document.get("status") == "archived":
        raise HTTPException(status_code=409, detail="Document is archived")
    if document.get("mime_type") != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Text extraction only supports application/pdf"
        )

    from app.library.text_extract import (
        TextExtractError,
        run_text_extract_for_document,
    )

    try:
        result = run_text_extract_for_document(sb, item_id, user_id=user["id"])
    except TextExtractError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    job = result["job"]
    doc = result["document"]
    return {
        "job": {
            "id": job.get("id"),
            "status": job.get("status"),
            "job_type": job.get("job_type"),
            "attempt_count": job.get("attempt_count"),
            "metrics": job.get("metrics") or {},
            "error_code": job.get("error_code"),
            "error_message": job.get("error_message"),
        },
        "document": {
            "id": doc.get("id"),
            "status": doc.get("status"),
            "page_count": doc.get("page_count"),
        },
    }


@router.get("/items/{item_id}/pages")
def list_pages(
    item_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
) -> dict:
    """Return extracted pages for a document the caller owns.

    Pages are ordered by `page_number asc`. `text_content` is included
    inline; a future flag (`include_text=false`, PR3) will trim payloads
    for clients that just want page metadata.
    """
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    owned = (
        sb.table("document_assets")
        .select("id")
        .eq("id", item_id)
        .eq("owner_user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Document not found")
    rows = (
        sb.table("document_pages")
        .select("*")
        .eq("document_id", item_id)
        .order("page_number", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
        .data
        or []
    )
    shaped = [
        {
            "id": r.get("id"),
            "page_number": r.get("page_number"),
            "text_content": r.get("text_content") or "",
            "char_count": r.get("char_count") or 0,
            "extraction_status": r.get("extraction_status"),
            "parser_engine": r.get("parser_engine"),
            "parser_version": r.get("parser_version"),
            "metadata": r.get("metadata") or {},
        }
        for r in rows
    ]
    return {"pages": shaped, "count": len(shaped), "limit": limit, "offset": offset}
