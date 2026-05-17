from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from urllib.parse import urlparse
import requests
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin
from app.eligibility.recompute_queue import enqueue_eligibility_recompute

logger = logging.getLogger("career_copilot.api.admin_trust")
router = APIRouter(tags=["admin-trust"])

# Cap so a single publish click never enqueues more than this many rows; the
# manual fan-out endpoint (admin_eligibility.recompute-eligibility) uses the
# same limit and exposes ``cap_hit`` for the rare case where it matters.
PUBLISH_RECOMPUTE_FANOUT_CAP = 10_000

ALLOWED_SOURCE_TYPES = {
    "aggregator",
    "official_html",
    "official_pdf",
    "rss",
    "api",
    "sitemap",
}

SOURCE_CONFIG_FIELDS = {
    "organization_id",
    "source_name",
    "short_code",
    "source_type",
    "category",
    "jurisdiction",
    "state",
    "parent_org",
    # ``source_url`` removed by migration 074 — ``official_url`` is canonical.
    "official_url",
    "notification_url",
    "rss_url",
    "api_url",
    "pdf_bulletin_url",
    "adapter_type",
    "scrape_interval_hours",
    "tier",
    "trust_score",
    "anti_bot_risk",
    "requires_playwright",
    "requires_login",
    "has_captcha",
    "pdf_only",
    "is_active",
    "is_verified",
    "is_official_source",
    "can_publish_directly",
    "discovery_only",
    "requires_official_confirmation",
    "notes",
    "org_state",
    "insecure_tls",
    "selectors",
    "parser_config",
    "scrape_config",
    "trust_config",
    "adapter_config",
}


def _audit(sb, admin: dict, action: str, entity_type: str, entity_id: str, before_payload=None, after_payload=None, metadata=None):
    sb.table("admin_audit_logs").insert({
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "actor_id": admin.get("id"),
        "actor_email": admin.get("email"),
        "old_value": before_payload,
        "new_value": after_payload,
        "notes": str(metadata or "")
    }).execute()


def _is_suspicious_domain(host: str) -> bool:
    risky = ("blogspot", "tinyurl", "bit.ly", "t.me", "telegram", "facebook")
    return any(x in host for x in risky)


def _verify_url(url: str):
    checks, warnings, errors = [], [], []
    if not url:
        return checks, warnings, ["missing_url"], "unknown", []
    redirects = []
    ctype = "unknown"
    try:
        resp = requests.get(url, timeout=10, allow_redirects=True)
        redirects = [h.url for h in resp.history] + [resp.url]
        checks.append("reachable")
        ct = (resp.headers.get("content-type") or "").lower()
        if "html" in ct:
            ctype = "html"
        elif "pdf" in ct:
            ctype = "pdf"
        elif "rss" in ct or "xml" in ct:
            ctype = "rss"
        elif "json" in ct:
            ctype = "api"
    except Exception as exc:
        errors.append(f"unreachable:{exc}")
    if url and not url.lower().startswith("https://"):
        warnings.append("non_https_official_url")
    host = (urlparse(url).hostname or "").lower()
    if _is_suspicious_domain(host):
        warnings.append("suspicious_domain")
    if any(x in host for x in ("sarkari", "freejobalert", "adda247")):
        warnings.append("aggregator_domain")
    return checks, warnings, errors, ctype, redirects


@router.post("/admin/sources/{source_id}/verify")
def verify_source(source_id: str, admin: dict = Depends(require_permission("sources.manage"))):
    sb = get_supabase_admin()
    rows = sb.table("source_registry").select("*").eq("id", source_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Source not found")
    src = rows[0]
    checks, warnings, errors, ctype, redirects = _verify_url(src.get("official_url"))
    if src.get("has_captcha") or src.get("anti_bot_risk") in {"high", "critical"}:
        warnings.append("captcha_or_antibot_risk")
    if src.get("notification_url"):
        _, w2, e2, _, _ = _verify_url(src.get("notification_url"))
        warnings.extend([f"notification:{w}" for w in w2])
        errors.extend([f"notification:{e}" for e in e2])
    org = {}
    if src.get("organization_id"):
        org_rows = (
            sb.table("organizations")
            .select("id, official_domain, name")
            .eq("id", src["organization_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        org = org_rows[0] if org_rows else {}
    if org and org.get("official_domain"):
        host = (urlparse(src.get("official_url") or "").hostname or "").lower()
        if host and org.get("official_domain") not in host:
            warnings.append("domain_mismatch_with_organization")

    status = "verified" if checks and not errors and not warnings else ("failed" if errors else "needs_review")
    update = {
        "verification_status": status,
        "last_error": "; ".join(errors) if errors else None,
        "notes": f"content_type={ctype}; redirects={redirects}",
    }
    if status == "verified":
        update.update({"is_verified": True, "verified_by": admin.get("id"), "verified_at": datetime.now(timezone.utc).isoformat()})
    sb.table("source_registry").update(update).eq("id", source_id).execute()
    _audit(sb, admin, "source.verify", "source", source_id, before_payload=src, after_payload=update, metadata={"checks": checks, "warnings": warnings, "errors": errors})
    return {"ok": True, "source_id": source_id, "checks": checks, "warnings": warnings, "errors": errors}


def validate_recruitment_publish_readiness(recruitment_id: str, admin: dict):
    sb = get_supabase_admin()
    blocking, warnings = [], []
    rec_rows = sb.table("recruitments").select("*, organizations(*), posts(id)").eq("id", recruitment_id).limit(1).execute().data or []
    if not rec_rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    rec = rec_rows[0]
    org = rec.get("organizations") or {}
    if not rec.get("organization_id"):
        blocking.append("organization_missing")
    if rec.get("organization_id") and not org.get("is_verified"):
        blocking.append("organization_unverified")
    if not rec.get("official_notification_url"):
        blocking.append("official_notification_url_missing")
    if rec.get("status") == "open" and not rec.get("official_apply_url"):
        blocking.append("official_apply_url_missing_while_open")
    s, e = rec.get("apply_start_date"), rec.get("apply_end_date")
    if s and e:
        try:
            if date.fromisoformat(str(s)) > date.fromisoformat(str(e)):
                blocking.append("apply_dates_reversed")
        except Exception:
            blocking.append("apply_dates_invalid")
    posts = rec.get("posts") or []
    if not posts and not rec.get("posts_unavailable"):
        blocking.append("posts_missing")
    if not rec.get("rules_unavailable"):
        post_ids = [p.get("id") for p in posts if p.get("id")]
        has_post_rules = False
        if post_ids:
            age_rows = sb.table("age_criteria").select("id").in_("post_id", post_ids).limit(1).execute().data or []
            edu_rows = sb.table("education_criteria").select("id").in_("post_id", post_ids).limit(1).execute().data or []
            has_post_rules = bool(age_rows or edu_rows)
        if not has_post_rules and not rec.get("min_age") and not rec.get("max_age"):
            blocking.append("eligibility_rules_missing")
    source = None
    if rec.get("source_id"):
        source_rows = (
            sb.table("source_registry")
            .select("id,is_verified,verification_status")
            .eq("id", rec["source_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        source = source_rows[0] if source_rows else None
    if not rec.get("source_id"):
        blocking.append("source_provenance_missing")
    elif not source:
        blocking.append("source_provenance_not_found")
    elif not source.get("is_verified"):
        blocking.append("unverified_source_provenance")
    return {"ready": len(blocking) == 0, "blocking_issues": blocking, "warnings": warnings}


@router.post("/admin/recruitments/{recruitment_id}/validate-publish")
def validate_publish(recruitment_id: str, admin: dict = Depends(require_permission("recruitments.manage"))):
    result = validate_recruitment_publish_readiness(recruitment_id, admin)
    _audit(get_supabase_admin(), admin, "recruitment.validate_publish", "recruitment", recruitment_id, after_payload=result)
    return result


@router.post("/admin/recruitments/{recruitment_id}/draft-sources")
def draft_sources_from_recruitment(
    recruitment_id: str,
    admin: dict = Depends(require_permission("sources.manage")),
):
    """Auto-create draft ``source_registry`` rows for every official-URL
    host on this recruitment that isn't already registered.

    Sister endpoint to ``/admin/scrape/items/{queue_id}/draft-sources``
    — the helper is shared. Recruitments expose the same URL field
    shape (``official_notification_url`` / ``official_apply_url`` /
    ``source_pdf_url``), so we feed those keys into the same
    ``extract_candidate_hosts`` and idempotent draft writer.
    """
    from app.scraping.source_drafts import extract_candidate_hosts, upsert_draft_sources

    sb = get_supabase_admin()
    rows = (
        sb.table("recruitments")
        .select("id, official_notification_url, official_apply_url, source_pdf_url")
        .eq("id", recruitment_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    rec = rows[0]
    # ``extract_candidate_hosts`` takes a dict with the URL fields under
    # top-level keys — the recruitment row already matches.
    candidates = extract_candidate_hosts({
        "official_notification_url": rec.get("official_notification_url"),
        "official_apply_url": rec.get("official_apply_url"),
        "source_pdf_url": rec.get("source_pdf_url"),
    })
    if not candidates:
        return {"recruitment_id": recruitment_id, "created": [], "existing": [], "candidates": []}

    result = upsert_draft_sources(sb, candidates, queue_id=None)
    if result.get("created"):
        _audit(
            sb, admin,
            "source.auto_draft_from_recruitment", "recruitment", recruitment_id,
            after_payload={
                "created_ids": [r.get("id") for r in result["created"]],
                "candidate_hosts": [h for h, _ in candidates],
            },
        )
    return {
        "recruitment_id": recruitment_id,
        "created": result["created"],
        "existing": result["existing"],
        "candidates": [{"host": h, "source_url": u} for h, u in candidates],
    }



@router.post("/admin/recruitments/{recruitment_id}/verify")
def verify_recruitment(recruitment_id: str, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin(); ready = validate_recruitment_publish_readiness(recruitment_id, admin)
    if not ready["ready"]:
        raise HTTPException(status_code=409, detail={"message": "Not ready", **ready})
    update = {"publish_status": "verified"}
    sb.table("recruitments").update(update).eq("id", recruitment_id).execute(); _audit(sb, admin, "recruitment.verify", "recruitment", recruitment_id, after_payload=update)
    return {"ok": True, "recruitment_id": recruitment_id, "publish_status": "verified"}

@router.post("/admin/recruitments/{recruitment_id}/publish")
def publish_recruitment(recruitment_id: str, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin(); ready = validate_recruitment_publish_readiness(recruitment_id, admin)
    if not ready["ready"]:
        raise HTTPException(status_code=409, detail={"message": "Not ready", **ready})
    update = {"publish_status": "published", "published_by": admin.get("id"), "published_at": datetime.now(timezone.utc).isoformat()}
    sb.table("recruitments").update(update).eq("id", recruitment_id).execute(); _audit(sb, admin, "recruitment.publish", "recruitment", recruitment_id, after_payload=update)
    fanout = _fanout_recompute_on_publish(sb, recruitment_id, admin)
    return {"ok": True, "recompute": fanout}


def _fanout_recompute_on_publish(sb, recruitment_id: str, admin: dict) -> dict:
    """Enqueue an eligibility recompute for every onboarded user the moment a
    recruitment is published.

    Publish is the only moment we know the canonical record is live, so
    deferring fan-out to a manual button creates a window where users see a
    published recruitment but no eligibility result. Best-effort: per-user
    failures are logged and counted but never propagate, so the publish
    response stays a 200. The recruitment drawer's RecomputeStatusPanel
    surfaces the resulting queue depth.
    """
    enqueued = 0
    errors = 0
    try:
        profiles = (
            sb.table("profiles").select("id").eq("onboarding_completed", True)
            .limit(PUBLISH_RECOMPUTE_FANOUT_CAP).execute().data or []
        )
    except Exception:
        logger.exception("publish fanout profile fetch failed recruitment_id=%s", recruitment_id)
        return {"enqueued": 0, "errors": 0, "cap_hit": False, "candidate_user_count": 0}
    for prof in profiles:
        uid = prof.get("id")
        if not uid:
            continue
        try:
            enqueue_eligibility_recompute(
                sb, user_id=uid, reason="recruitment.publish",
                recruitment_id=recruitment_id,
                metadata={"triggered_by": "publish", "actor_id": admin.get("id")},
            )
            enqueued += 1
        except Exception:  # noqa: BLE001
            errors += 1
    _audit(sb, admin, "eligibility.recompute.publish_fan_out", "recruitment", recruitment_id,
           after_payload={"enqueued": enqueued, "errors": errors, "candidate_user_count": len(profiles)})
    return {
        "enqueued": enqueued,
        "errors": errors,
        "candidate_user_count": len(profiles),
        "cap_hit": len(profiles) >= PUBLISH_RECOMPUTE_FANOUT_CAP,
    }

for action in ("archive", "withdraw"):
    def _make(a):
        def _h(recruitment_id: str, admin: dict = Depends(require_permission("recruitments.manage"))):
            sb = get_supabase_admin(); sb.table("recruitments").update({"publish_status": a}).eq("id", recruitment_id).execute(); _audit(sb, admin, f"recruitment.{a}", "recruitment", recruitment_id, after_payload={"publish_status": a}); return {"ok": True}
        return _h
    router.post(f"/admin/recruitments/{{recruitment_id}}/{action}")(_make(action))

@router.post("/admin/organizations/{organization_id}/verify")
def verify_organization(organization_id: str, admin: dict = Depends(require_permission("organizations.manage"))):
    sb = get_supabase_admin()
    rows = sb.table("organizations").select("*").eq("id", organization_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Organization not found")
    org = rows[0]
    checks, warnings, errors, _, _ = _verify_url(org.get("website_url"))
    domain = (urlparse(org.get("website_url") or "").hostname or "").lower()
    status = "verified" if checks and not errors and not warnings else ("failed" if errors else "needs_review")
    update = {"trust_tier": "verified" if status=="verified" else ("unverified" if status=="failed" else "unknown"), "verification_notes": f"status={status}", "official_domain": domain or org.get("official_domain")}
    if status == "verified":
        update.update({"is_verified": True, "verified_by": admin.get("id"), "verified_at": datetime.now(timezone.utc).isoformat()})
    sb.table("organizations").update(update).eq("id", organization_id).execute(); _audit(sb, admin, "organization.verify", "organization", organization_id, before_payload=org, after_payload=update)
    return {"ok": True, "organization_id": organization_id, "checks": checks, "warnings": warnings, "errors": errors}


@router.get("/admin/recruitments")
def admin_recruitments(_admin: dict = Depends(require_permission("recruitments.manage"))):
    sb=get_supabase_admin()
    # Inline blocker-fix form needs editable fields (organization_id, source_id,
    # apply window, total_vacancies, notification_date) — select them too so the
    # Operations Console can pre-fill the form without a per-row GET.
    rows=sb.table("recruitments").select(
        "id,name,publish_status,status,organization_id,source_id,"
        "official_notification_url,official_apply_url,source_pdf_url,"
        "apply_start_date,apply_end_date,notification_date,total_vacancies,"
        "published_by,published_at,review_notes,organizations(name,is_verified)"
    ).order("created_at", desc=True).limit(200).execute().data or []
    items=[]
    for r in rows:
        try:
            ready=validate_recruitment_publish_readiness(r.get("id"), _admin)
        except Exception as exc:  # noqa: BLE001
            ready={"blocking_issues":["readiness_check_failed"],"warnings":[str(exc)]}
        org=(r.get("organizations") or {})
        items.append({
            "id":r.get("id"),
            "name":r.get("name"),
            "publish_status":r.get("publish_status"),
            "lifecycle_status":r.get("status"),
            "organization":org.get("name"),
            "organization_id":r.get("organization_id"),
            "organization_verified":org.get("is_verified"),
            "source_id":r.get("source_id"),
            "official_notification_url":r.get("official_notification_url"),
            "official_apply_url":r.get("official_apply_url"),
            "source_pdf_url":r.get("source_pdf_url"),
            "apply_start_date":r.get("apply_start_date"),
            "apply_end_date":r.get("apply_end_date"),
            "notification_date":r.get("notification_date"),
            "total_vacancies":r.get("total_vacancies"),
            "source_provenance":1 if r.get("source_id") else 0,
            "blocking_issues":ready.get("blocking_issues",[]),
            "warnings":ready.get("warnings",[]),
            "published_by":r.get("published_by"),
            "published_at":r.get("published_at"),
            "review_notes":r.get("review_notes"),
        })
    return {"items": items}

@router.get("/admin/organizations")
def admin_organizations(_admin: dict = Depends(require_permission("organizations.manage"))):
    sb = get_supabase_admin()
    rows = sb.table("organizations").select("id,name,type,state,website_url,official_domain,is_verified,trust_tier,verification_notes,verified_at").limit(200).execute().data or []
    org_ids = [o["id"] for o in rows]
    source_counts = {oid: 0 for oid in org_ids}
    recruitment_counts = {oid: 0 for oid in org_ids}
    if org_ids:
        source_rows = sb.table("source_registry").select("id,organization_id").in_("organization_id", org_ids).execute().data or []
        for src in source_rows:
            if src.get("organization_id") in source_counts:
                source_counts[src["organization_id"]] += 1
        recruitment_rows = sb.table("recruitments").select("id,organization_id").in_("organization_id", org_ids).execute().data or []
        for rec in recruitment_rows:
            if rec.get("organization_id") in recruitment_counts:
                recruitment_counts[rec["organization_id"]] += 1
    items=[]
    for o in rows:
        src = source_counts.get(o["id"], 0)
        rec = recruitment_counts.get(o["id"], 0)
        items.append({**o, "linked_sources_count": src, "linked_recruitments_count": rec})
    return {"items": items}


def _normalize_timeline_event(row: dict):
    return {
        "id": row.get("id"),
        "event_type": row.get("action") or "unknown",
        "actor": {"id": row.get("actor_id"), "email": row.get("actor_email")} if row.get("actor_id") or row.get("actor_email") else None,
        "created_at": row.get("created_at"),
        "before": row.get("old_value"),
        "after": row.get("new_value"),
        "notes": row.get("notes"),
    }


@router.get("/admin/sources/{source_id}/audit")
def source_audit_timeline(source_id: str, _admin: dict = Depends(require_permission("sources.manage"))):
    sb = get_supabase_admin()
    rows = sb.table("admin_audit_logs").select("id,action,actor_id,actor_email,old_value,new_value,notes,created_at").eq("entity_type", "source").eq("entity_id", source_id).order("created_at", desc=False).limit(500).execute().data or []
    return {"items": [_normalize_timeline_event(r) for r in rows]}


@router.get("/admin/organizations/{organization_id}/audit")
def organization_audit_timeline(organization_id: str, _admin: dict = Depends(require_permission("organizations.manage"))):
    sb = get_supabase_admin()
    rows = sb.table("admin_audit_logs").select("id,action,actor_id,actor_email,old_value,new_value,notes,created_at").eq("entity_type", "organization").eq("entity_id", organization_id).order("created_at", desc=False).limit(500).execute().data or []
    return {"items": [_normalize_timeline_event(r) for r in rows]}


_ALLOWED_STATUS={"upcoming","open","closed","result_declared"}

def _validate_common(payload: dict):
    if "trust_score" in payload and payload.get("trust_score") is not None:
        ts=float(payload["trust_score"])
        if ts<0 or ts>1: raise HTTPException(status_code=400, detail="trust_score must be between 0 and 1")
    if payload.get("apply_start_date") and payload.get("apply_end_date"):
        if str(payload["apply_start_date"])>str(payload["apply_end_date"]):
            raise HTTPException(status_code=400, detail="apply dates reversed")


def _validate_source_type(body: dict, *, required: bool) -> str | None:
    raw = body.get("source_type")
    if raw is None or str(raw).strip() == "":
        if required:
            raise HTTPException(status_code=400, detail="source_type is required")
        return None
    value = str(raw).strip().lower()
    if value not in ALLOWED_SOURCE_TYPES:
        allowed = ", ".join(sorted(ALLOWED_SOURCE_TYPES))
        raise HTTPException(status_code=400, detail=f"invalid source_type; allowed: {allowed}")
    return value


def _source_payload(body: dict, *, existing: dict | None = None, require_type: bool = False) -> dict:
    source_type = _validate_source_type(body, required=require_type)
    payload = {k: v for k, v in body.items() if k in SOURCE_CONFIG_FIELDS}
    if source_type:
        payload["source_type"] = source_type
    # The legacy ``source_registry.source_url`` column was dropped by
    # migration 074. ``official_url`` is now the only canonical URL field;
    # the Sprint 5 server-side mirror is gone with the column.

    effective_type = source_type or (existing or {}).get("source_type")
    if effective_type == "aggregator":
        payload["is_verified"] = False
        payload["is_official_source"] = False
        payload["can_publish_directly"] = False
        payload["discovery_only"] = True
        payload["requires_official_confirmation"] = True
        payload["verification_status"] = "needs_review"
        trust_config = dict((existing or {}).get("trust_config") or {})
        trust_config.update(
            {
                "discovery_only": True,
                "manual_review_required": True,
                "requires_official_source": True,
                "evidence_required": True,
                "auto_promote": False,
            }
        )
        payload["trust_config"] = trust_config

    scrape_config = payload.get("scrape_config")
    if isinstance(scrape_config, dict) and "max_items_per_run" in scrape_config:
        try:
            scrape_config["max_items_per_run"] = max(1, min(int(scrape_config["max_items_per_run"]), 100))
        except Exception:
            raise HTTPException(status_code=400, detail="scrape_config.max_items_per_run must be a number")
    return payload

@router.post("/admin/sources")
def create_source(body: dict, admin: dict = Depends(require_permission("sources.manage"))):
    if not body.get("official_url"):
        raise HTTPException(status_code=400, detail="official_url required")
    _validate_common(body)
    sb=get_supabase_admin()
    ex=sb.table("source_registry").select("id").eq("official_url", body["official_url"]).limit(1).execute().data or []
    if ex: raise HTTPException(status_code=409, detail="official_url must be unique")
    payload=_source_payload(body, require_type=True)
    row=(sb.table("source_registry").insert(payload).execute().data or [{}])[0]
    _audit(sb, admin, "source.create", "source", row.get("id","new"), after_payload=payload)
    return {"ok":True,"item":row}

@router.put("/admin/sources/{source_id}")
def update_source(source_id: str, body: dict, admin: dict = Depends(require_permission("sources.manage"))):
    _validate_common(body); sb=get_supabase_admin(); old=(sb.table("source_registry").select("*").eq("id",source_id).limit(1).execute().data or [None])[0]
    if not old: raise HTTPException(status_code=404, detail="Source not found")
    payload={k:v for k,v in _source_payload(body, existing=old, require_type=False).items() if (k in old or k in SOURCE_CONFIG_FIELDS) and k!="id"}
    sb.table("source_registry").update(payload).eq("id",source_id).execute(); _audit(sb,admin,"source.update","source",source_id,before_payload=old,after_payload=payload)
    return {"ok":True}

@router.post("/admin/sources/{source_id}/deactivate")
def deactivate_source(source_id: str, admin: dict = Depends(require_permission("sources.manage"))):
    sb=get_supabase_admin(); old=(sb.table("source_registry").select("*").eq("id",source_id).limit(1).execute().data or [None])[0]
    if not old: raise HTTPException(status_code=404, detail="Source not found")
    sb.table("source_registry").update({"is_active":False}).eq("id",source_id).execute(); _audit(sb,admin,"source.deactivate","source",source_id,before_payload=old,after_payload={"is_active":False}); return {"ok":True}

@router.post("/admin/sources/{source_id}/activate")
def activate_source(source_id: str, admin: dict = Depends(require_permission("sources.manage"))):
    sb=get_supabase_admin(); old=(sb.table("source_registry").select("*").eq("id",source_id).limit(1).execute().data or [None])[0]
    if not old: raise HTTPException(status_code=404, detail="Source not found")
    sb.table("source_registry").update({"is_active":True}).eq("id",source_id).execute(); _audit(sb,admin,"source.activate","source",source_id,before_payload=old,after_payload={"is_active":True}); return {"ok":True}

@router.put("/admin/recruitments/{recruitment_id}")
def update_recruitment(recruitment_id: str, body: dict, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb=get_supabase_admin(); old=(sb.table("recruitments").select("*").eq("id",recruitment_id).limit(1).execute().data or [None])[0]
    if not old: raise HTTPException(status_code=404, detail="Recruitment not found")
    if body.get("status") and body["status"] not in _ALLOWED_STATUS: raise HTTPException(status_code=400, detail="invalid status")
    if body.get("year") and (int(body["year"])<2000 or int(body["year"])>2100): raise HTTPException(status_code=400, detail="invalid year")
    _validate_common(body)
    editable={"name","year","organization_id","notification_date","apply_start_date","apply_end_date","status","total_vacancies","official_notification_url","source_pdf_url","official_apply_url","source_id","review_notes"}
    payload={k:v for k,v in body.items() if k in editable}
    critical={"official_notification_url","official_apply_url","apply_start_date","apply_end_date","organization_id","total_vacancies"}
    if old.get("publish_status")=="published" and any(k in payload and payload[k]!=old.get(k) for k in critical): payload["publish_status"]="needs_review"
    sb.table("recruitments").update(payload).eq("id",recruitment_id).execute(); _audit(sb,admin,"recruitment.update","recruitment",recruitment_id,before_payload=old,after_payload=payload)
    return {"ok":True}


# ════════════════════════════════════════════════════════════════════════════
#  Canonical criteria editor
#  Resolves posts_missing and eligibility_rules_missing blockers without
#  needing direct DB access. validate-publish remains source of truth for
#  publish readiness; nothing here changes publish_status.
# ════════════════════════════════════════════════════════════════════════════

_QUALIFICATION_LEVELS = {"10th", "12th", "diploma", "graduate", "postgraduate", "phd"}


def _ensure_recruitment_exists(sb, recruitment_id: str) -> dict:
    rows = sb.table("recruitments").select("id, publish_status").eq("id", recruitment_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    return rows[0]


def _maybe_demote_published(sb, recruitment_id: str, recruitment: dict) -> None:
    """Critical-field edits to a published recruitment force it back to
    needs_review so admins re-validate before re-publishing."""
    if recruitment.get("publish_status") == "published":
        sb.table("recruitments").update({"publish_status": "needs_review"}).eq("id", recruitment_id).execute()


@router.get("/admin/recruitments/{recruitment_id}/criteria")
def get_recruitment_criteria(recruitment_id: str, _admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin()
    _ensure_recruitment_exists(sb, recruitment_id)
    posts = sb.table("posts").select("id, post_name, group_type, pay_level, job_type, recruitment_unit_id, language_requirements").eq("recruitment_id", recruitment_id).execute().data or []
    post_ids = [p["id"] for p in posts]
    age_rows = []
    edu_rows = []
    if post_ids:
        age_rows = sb.table("age_criteria").select("id, post_id, min_age, max_age, cutoff_date").in_("post_id", post_ids).execute().data or []
        edu_rows = sb.table("education_criteria").select("id, post_id, min_qualification_level, allowed_disciplines, raw_requirement_text").in_("post_id", post_ids).execute().data or []
    by_post = {p["id"]: {**p, "age_criteria": [], "education_criteria": []} for p in posts}
    for a in age_rows:
        if a.get("post_id") in by_post:
            by_post[a["post_id"]]["age_criteria"].append(a)
    for e in edu_rows:
        if e.get("post_id") in by_post:
            by_post[e["post_id"]]["education_criteria"].append(e)
    return {"recruitment_id": recruitment_id, "posts": list(by_post.values())}


def _validate_post_body(body: dict) -> dict:
    payload = {}
    if "post_name" in body:
        name = (body.get("post_name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="post_name required")
        payload["post_name"] = name
    for key in ("group_type", "pay_level", "job_type"):
        if key in body and body.get(key) is not None:
            payload[key] = str(body[key])
    if "language_requirements" in body and body.get("language_requirements") is not None:
        if not isinstance(body["language_requirements"], list):
            raise HTTPException(status_code=400, detail="language_requirements must be a list")
        payload["language_requirements"] = body["language_requirements"]
    if "recruitment_unit_id" in body:
        payload["recruitment_unit_id"] = body["recruitment_unit_id"]
    return payload


@router.post("/admin/recruitments/{recruitment_id}/posts")
def create_recruitment_post(recruitment_id: str, body: dict, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin()
    rec = _ensure_recruitment_exists(sb, recruitment_id)
    payload = _validate_post_body(body or {})
    if "post_name" not in payload:
        raise HTTPException(status_code=400, detail="post_name required")
    payload["recruitment_id"] = recruitment_id
    payload.setdefault("job_type", "direct")
    inserted = sb.table("posts").insert(payload).execute().data or []
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create post")
    _maybe_demote_published(sb, recruitment_id, rec)
    _audit(sb, admin, "recruitment.post.create", "recruitment", recruitment_id, after_payload=inserted[0])
    return {"ok": True, "post": inserted[0]}


@router.put("/admin/recruitments/{recruitment_id}/posts/{post_id}")
def update_recruitment_post(recruitment_id: str, post_id: str, body: dict, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin()
    rec = _ensure_recruitment_exists(sb, recruitment_id)
    old = sb.table("posts").select("*").eq("id", post_id).eq("recruitment_id", recruitment_id).limit(1).execute().data or []
    if not old:
        raise HTTPException(status_code=404, detail="Post not found")
    payload = _validate_post_body(body or {})
    if not payload:
        return {"ok": True, "unchanged": True}
    sb.table("posts").update(payload).eq("id", post_id).execute()
    _maybe_demote_published(sb, recruitment_id, rec)
    _audit(sb, admin, "recruitment.post.update", "recruitment", recruitment_id, before_payload=old[0], after_payload=payload)
    return {"ok": True}


def _validate_age_body(body: dict) -> dict:
    payload = {}
    for key in ("min_age", "max_age"):
        if key in body and body.get(key) is not None:
            try:
                payload[key] = int(body[key])
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"{key} must be an integer")
    if "cutoff_date" in body and body.get("cutoff_date"):
        payload["cutoff_date"] = body["cutoff_date"]
    if "min_age" in payload and "max_age" in payload and payload["min_age"] > payload["max_age"]:
        raise HTTPException(status_code=400, detail="min_age cannot exceed max_age")
    return payload


@router.post("/admin/recruitments/{recruitment_id}/posts/{post_id}/age-criteria")
def create_age_criteria(recruitment_id: str, post_id: str, body: dict, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin()
    rec = _ensure_recruitment_exists(sb, recruitment_id)
    post = sb.table("posts").select("id").eq("id", post_id).eq("recruitment_id", recruitment_id).limit(1).execute().data or []
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    payload = _validate_age_body(body or {})
    payload["post_id"] = post_id
    inserted = sb.table("age_criteria").insert(payload).execute().data or []
    _maybe_demote_published(sb, recruitment_id, rec)
    _audit(sb, admin, "recruitment.age_criteria.create", "recruitment", recruitment_id, after_payload=inserted[0] if inserted else payload)
    return {"ok": True, "age_criteria": inserted[0] if inserted else None}


@router.put("/admin/recruitments/{recruitment_id}/posts/{post_id}/age-criteria/{criteria_id}")
def update_age_criteria(recruitment_id: str, post_id: str, criteria_id: str, body: dict, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin()
    rec = _ensure_recruitment_exists(sb, recruitment_id)
    old = sb.table("age_criteria").select("*").eq("id", criteria_id).eq("post_id", post_id).limit(1).execute().data or []
    if not old:
        raise HTTPException(status_code=404, detail="Age criteria not found")
    payload = _validate_age_body(body or {})
    if not payload:
        return {"ok": True, "unchanged": True}
    sb.table("age_criteria").update(payload).eq("id", criteria_id).execute()
    _maybe_demote_published(sb, recruitment_id, rec)
    _audit(sb, admin, "recruitment.age_criteria.update", "recruitment", recruitment_id, before_payload=old[0], after_payload=payload)
    return {"ok": True}


def _validate_education_body(body: dict) -> dict:
    payload = {}
    if "min_qualification_level" in body and body.get("min_qualification_level"):
        level = str(body["min_qualification_level"]).lower().strip()
        if level not in _QUALIFICATION_LEVELS:
            raise HTTPException(status_code=400, detail=f"min_qualification_level must be one of {sorted(_QUALIFICATION_LEVELS)}")
        payload["min_qualification_level"] = level
    if "allowed_disciplines" in body and body.get("allowed_disciplines") is not None:
        # Free-form JSON; the schema stores it as jsonb. We accept either
        # the legacy {primary: [...]} shape or a flat list.
        val = body["allowed_disciplines"]
        if isinstance(val, list):
            payload["allowed_disciplines"] = {"primary": val}
        elif isinstance(val, dict):
            payload["allowed_disciplines"] = val
        else:
            raise HTTPException(status_code=400, detail="allowed_disciplines must be a list or object")
    if "raw_requirement_text" in body and body.get("raw_requirement_text") is not None:
        payload["raw_requirement_text"] = str(body["raw_requirement_text"])
    return payload


@router.post("/admin/recruitments/{recruitment_id}/posts/{post_id}/education-criteria")
def create_education_criteria(recruitment_id: str, post_id: str, body: dict, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin()
    rec = _ensure_recruitment_exists(sb, recruitment_id)
    post = sb.table("posts").select("id").eq("id", post_id).eq("recruitment_id", recruitment_id).limit(1).execute().data or []
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    payload = _validate_education_body(body or {})
    if "min_qualification_level" not in payload:
        raise HTTPException(status_code=400, detail="min_qualification_level required")
    payload["post_id"] = post_id
    inserted = sb.table("education_criteria").insert(payload).execute().data or []
    _maybe_demote_published(sb, recruitment_id, rec)
    _audit(sb, admin, "recruitment.education_criteria.create", "recruitment", recruitment_id, after_payload=inserted[0] if inserted else payload)
    return {"ok": True, "education_criteria": inserted[0] if inserted else None}


@router.put("/admin/recruitments/{recruitment_id}/posts/{post_id}/education-criteria/{criteria_id}")
def update_education_criteria(recruitment_id: str, post_id: str, criteria_id: str, body: dict, admin: dict = Depends(require_permission("recruitments.manage"))):
    sb = get_supabase_admin()
    rec = _ensure_recruitment_exists(sb, recruitment_id)
    old = sb.table("education_criteria").select("*").eq("id", criteria_id).eq("post_id", post_id).limit(1).execute().data or []
    if not old:
        raise HTTPException(status_code=404, detail="Education criteria not found")
    payload = _validate_education_body(body or {})
    if not payload:
        return {"ok": True, "unchanged": True}
    sb.table("education_criteria").update(payload).eq("id", criteria_id).execute()
    _maybe_demote_published(sb, recruitment_id, rec)
    _audit(sb, admin, "recruitment.education_criteria.update", "recruitment", recruitment_id, before_payload=old[0], after_payload=payload)
    return {"ok": True}


@router.get("/admin/eligibility-ops")
def eligibility_ops(_admin: dict = Depends(require_permission("scraper.manage"))):
    """Downstream eligibility recompute monitoring.

    Distinct from /admin/eligibility-queue, which is upstream promotion
    of scraped candidates. This endpoint surfaces signals admins need
    after publish: recompute backlog, failures, stale results, and
    published recruitments that have not yet been recomputed for users.
    """
    sb = get_supabase_admin()

    def _count(table: str, filters):
        try:
            q = sb.table(table).select("id", count="exact")
            for col, val in filters.items():
                q = q.eq(col, val)
            return q.execute().count or 0
        except Exception:
            return 0

    pending = _count("eligibility_recompute_queue", {"status": "pending"})
    queued = _count("eligibility_recompute_queue", {"status": "queued"})
    processing = _count("eligibility_recompute_queue", {"status": "processing"})
    failed = _count("eligibility_recompute_queue", {"status": "failed"})
    processed = _count("eligibility_recompute_queue", {"status": "processed"})

    stale = 0
    try:
        stale_rows = (
            sb.table("eligibility_results")
            .select("id", count="exact")
            .eq("is_stale", True)
            .execute()
        )
        stale = stale_rows.count or 0
    except Exception:
        stale = 0

    published_awaiting = 0
    try:
        pub_ids = [
            r.get("id") for r in (
                sb.table("recruitments").select("id").eq("publish_status", "published").limit(500).execute().data or []
            )
            if r.get("id")
        ]
        if pub_ids:
            published_awaiting = (
                sb.table("eligibility_recompute_queue")
                .select("recruitment_id", count="exact")
                .in_("recruitment_id", pub_ids)
                .eq("status", "pending")
                .execute()
                .count
                or 0
            )
    except Exception:
        published_awaiting = 0

    # Failed-row payload powers the EligibilityOps page's retry list. Without
    # it the page knew the failure count but could not let admins act on it.
    failed_rows: list[dict] = []
    try:
        failed_rows = (
            sb.table("eligibility_recompute_queue")
            .select("id, user_id, recruitment_id, reason, status, queued_at, attempt_count, error_message, last_error")
            .eq("status", "failed")
            .order("queued_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
        for row in failed_rows:
            if row.get("attempt_count") is not None and "attempts" not in row:
                row["attempts"] = row.get("attempt_count")
    except Exception:
        failed_rows = []

    onboarded_users = 0
    try:
        onboarded_users = (
            sb.table("profiles").select("id", count="exact").eq("onboarding_completed", True).execute().count or 0
        )
    except Exception:
        onboarded_users = 0

    return {
        "pending_recomputes": pending,
        "failed_recomputes": failed,
        "queued": queued,
        "processing": processing,
        "processed": processed,
        "stale_results": stale,
        "published_awaiting": published_awaiting,
        "failed_rows": failed_rows,
        "onboarded_users": onboarded_users,
    }


@router.put("/admin/organizations/{organization_id}")
def update_organization(organization_id: str, body: dict, admin: dict = Depends(require_permission("organizations.manage"))):
    sb=get_supabase_admin(); old=(sb.table("organizations").select("*").eq("id",organization_id).limit(1).execute().data or [None])[0]
    if not old: raise HTTPException(status_code=404, detail="Organization not found")
    editable={"name","type","state","website_url","official_domain","trust_tier","verification_notes"}
    payload={k:v for k,v in body.items() if k in editable}
    if ("website_url" in payload and payload["website_url"]!=old.get("website_url")) or ("official_domain" in payload and payload["official_domain"]!=old.get("official_domain")):
        payload.update({"is_verified":False})
    sb.table("organizations").update(payload).eq("id",organization_id).execute(); _audit(sb,admin,"organization.update","organization",organization_id,before_payload=old,after_payload=payload)
    return {"ok":True}
