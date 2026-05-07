from __future__ import annotations

from datetime import date, datetime, timezone
from urllib.parse import urlparse
import requests
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin

router = APIRouter(tags=["admin-trust"])


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
    rows = sb.table("source_registry").select("*, organizations(id, official_domain, name)").eq("id", source_id).limit(1).execute().data or []
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
    org = src.get("organizations") or {}
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
    rec_rows = sb.table("recruitments").select("*, organizations(*), recruitment_sources(source_id, source_registry(is_verified, verification_status)), posts(id)").eq("id", recruitment_id).limit(1).execute().data or []
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
    if not rec.get("posts") and not rec.get("posts_unavailable"):
        blocking.append("posts_missing")
    if not rec.get("rules_unavailable") and not rec.get("min_age") and not rec.get("max_age"):
        blocking.append("eligibility_rules_missing")
    prov = rec.get("recruitment_sources") or []
    if not prov:
        blocking.append("source_provenance_missing")
    elif any(not (p.get("source_registry") or {}).get("is_verified") for p in prov):
        blocking.append("unverified_source_provenance")
    return {"ready": len(blocking) == 0, "blocking_issues": blocking, "warnings": warnings}


@router.post("/admin/recruitments/{recruitment_id}/validate-publish")
def validate_publish(recruitment_id: str, admin: dict = Depends(require_permission("recruitments.manage"))):
    result = validate_recruitment_publish_readiness(recruitment_id, admin)
    _audit(get_supabase_admin(), admin, "recruitment.validate_publish", "recruitment", recruitment_id, after_payload=result)
    return result


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
    return {"ok": True}

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
    rows=sb.table("recruitments").select("id,name,publish_status,status,official_notification_url,official_apply_url,published_by,published_at,review_notes,organizations(name,is_verified),recruitment_sources(source_id)").order("created_at", desc=True).limit(200).execute().data or []
    items=[]
    for r in rows:
        ready=validate_recruitment_publish_readiness(r.get("id"), _admin)
        org=(r.get("organizations") or {})
        items.append({"id":r.get("id"),"name":r.get("name"),"publish_status":r.get("publish_status"),"lifecycle_status":r.get("status"),"organization":org.get("name"),"organization_verified":org.get("is_verified"),"official_notification_url":r.get("official_notification_url"),"official_apply_url":r.get("official_apply_url"),"source_provenance":len(r.get("recruitment_sources") or []),"blocking_issues":ready.get("blocking_issues",[]),"warnings":ready.get("warnings",[]),"published_by":r.get("published_by"),"published_at":r.get("published_at"),"review_notes":r.get("review_notes")})
    return {"items": items}

@router.get("/admin/organizations")
def admin_organizations(_admin: dict = Depends(require_permission("organizations.manage"))):
    sb = get_supabase_admin()
    rows = sb.table("organizations").select("id,name,type,state,website_url,official_domain,is_verified,trust_tier,verification_notes,verified_at").limit(200).execute().data or []
    items=[]
    for o in rows:
        src = sb.table("source_registry").select("id", count="exact").eq("organization_id", o["id"]).execute().count or 0
        rec = sb.table("recruitments").select("id", count="exact").eq("organization_id", o["id"]).execute().count or 0
        items.append({**o, "linked_sources_count": src, "linked_recruitments_count": rec})
    return {"items": items}


_ALLOWED_STATUS={"upcoming","open","closed","result_declared"}

def _validate_common(payload: dict):
    if "trust_score" in payload and payload.get("trust_score") is not None:
        ts=float(payload["trust_score"])
        if ts<0 or ts>1: raise HTTPException(status_code=400, detail="trust_score must be between 0 and 1")
    if payload.get("apply_start_date") and payload.get("apply_end_date"):
        if str(payload["apply_start_date"])>str(payload["apply_end_date"]):
            raise HTTPException(status_code=400, detail="apply dates reversed")

@router.post("/admin/sources")
def create_source(body: dict, admin: dict = Depends(require_permission("sources.manage"))):
    if not body.get("official_url"):
        raise HTTPException(status_code=400, detail="official_url required")
    _validate_common(body)
    sb=get_supabase_admin()
    ex=sb.table("source_registry").select("id").eq("official_url", body["official_url"]).limit(1).execute().data or []
    if ex: raise HTTPException(status_code=409, detail="official_url must be unique")
    payload={k:v for k,v in body.items() if k in {"source_name","short_code","source_type","category","jurisdiction","state","parent_org","official_url","notification_url","rss_url","api_url","pdf_bulletin_url","adapter_type","scrape_interval_hours","tier","trust_score","anti_bot_risk","requires_playwright","requires_login","has_captcha","pdf_only","is_active","is_verified","notes","org_state","insecure_tls","selectors","requires_official_confirmation"}}
    row=(sb.table("source_registry").insert(payload).execute().data or [{}])[0]
    _audit(sb, admin, "source.create", "source", row.get("id","new"), after_payload=payload)
    return {"ok":True,"item":row}

@router.put("/admin/sources/{source_id}")
def update_source(source_id: str, body: dict, admin: dict = Depends(require_permission("sources.manage"))):
    _validate_common(body); sb=get_supabase_admin(); old=(sb.table("source_registry").select("*").eq("id",source_id).limit(1).execute().data or [None])[0]
    if not old: raise HTTPException(status_code=404, detail="Source not found")
    payload={k:v for k,v in body.items() if k in old and k!="id"}
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
