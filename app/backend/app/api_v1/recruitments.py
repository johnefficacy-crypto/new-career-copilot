"""Recruitments (canonical entity) + saved list."""
from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.security import get_current_user, get_optional_user, iso
from app.server_deps import get_db

router = APIRouter(prefix="/recruitments", tags=["recruitments"])


def _serialize(r: dict) -> dict:
    r = dict(r)
    r.pop("_id", None)
    r["created_at"] = iso(r.get("created_at"))
    return r


@router.get("")
async def list_recruitments(
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user: dict | None = Depends(get_optional_user),
):
    db = get_db()
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"organization": {"$regex": q, "$options": "i"}},
        ]
    items = []
    async for r in db.recruitments.find(query).sort("stage", 1):
        items.append(_serialize(r))

    saved_slugs: set[str] = set()
    if user is not None:
        async for s in db.saved_recruitments.find({"user_id": user["_id"]}):
            saved_slugs.add(s["recruitment_slug"])

    for item in items:
        item["saved"] = item["slug"] in saved_slugs

    counts = {
        "all": len(items),
        "eligible": sum(1 for x in items if x["status"] == "eligible"),
        "urgent": sum(1 for x in items if x["status"] == "urgent"),
        "conditional": sum(1 for x in items if x["status"] == "conditional"),
    }
    return {"items": items, "counts": counts}


@router.get("/saved")
async def saved_recruitments(user: dict = Depends(get_current_user)):
    db = get_db()
    slugs = [s["recruitment_slug"] async for s in db.saved_recruitments.find({"user_id": user["_id"]})]
    if not slugs:
        return {"items": []}
    items = []
    async for r in db.recruitments.find({"slug": {"$in": slugs}}):
        items.append(_serialize(r))
    return {"items": items}


@router.post("/{slug}/save")
async def toggle_save(slug: str, user: dict = Depends(get_current_user)):
    db = get_db()
    rec = await db.recruitments.find_one({"slug": slug})
    if not rec:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    existing = await db.saved_recruitments.find_one(
        {"user_id": user["_id"], "recruitment_slug": slug}
    )
    if existing:
        await db.saved_recruitments.delete_one({"_id": existing["_id"]})
        return {"saved": False}
    await db.saved_recruitments.insert_one(
        {
            "user_id": user["_id"],
            "recruitment_id": rec["_id"],
            "recruitment_slug": slug,
        }
    )
    return {"saved": True}


@router.get("/{slug}")
async def get_recruitment(slug: str, user: dict | None = Depends(get_optional_user)):
    db = get_db()
    r = await db.recruitments.find_one({"slug": slug})
    if not r:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    out = _serialize(r)
    if user is not None:
        saved = await db.saved_recruitments.find_one(
            {"user_id": user["_id"], "recruitment_slug": slug}
        )
        out["saved"] = bool(saved)
    else:
        out["saved"] = False

    # Attach an eligibility preview — deterministic placeholder (Phase 2 will
    # port the real engine). We surface enough structure for the UI to show a
    # realistic verdict breakdown.
    out["eligibility_preview"] = {
        "verdict": out.get("status", "pending"),
        "matched_posts": out.get("posts_matched", 0),
        "total_posts": out.get("posts_total", 0),
        "reasons": [
            {"field": "age", "ok": True, "note": f"Within {out.get('min_age', 18)}–{out.get('max_age', 32)}"},
            {"field": "qualification", "ok": True, "note": out.get("min_qualification", "Graduate")},
            {"field": "category", "ok": True, "note": "Category window satisfied"},
        ],
        "computed_at": None,
        "source": "placeholder · Phase-1",
    }
    return out
