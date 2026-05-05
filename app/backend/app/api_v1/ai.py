"""AI surfaces (Phase 1 placeholder).

Deterministic, safe, no LLM calls. Returns scripted responses that keep the
UI functional. Phase 2 will wire a real provider.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.security import get_current_user, iso, now_utc
from app.server_deps import get_db

router = APIRouter(prefix="/ai", tags=["ai"])


GUIDANCE_PROMPTS = [
    {"id": "weekly-review", "title": "Summarise my week", "icon": "sparkles"},
    {"id": "explain-eligibility", "title": "Explain my eligibility verdict", "icon": "shield"},
    {"id": "plan-tomorrow", "title": "Plan tomorrow in 6 blocks", "icon": "calendar"},
    {"id": "weak-topics", "title": "What should I drill next?", "icon": "target"},
]


@router.get("/guidance")
async def guidance(user: dict = Depends(get_current_user)):
    return {
        "greeting": f"Hey {user.get('name') or 'there'} — here's what I'd focus on next.",
        "prompts": GUIDANCE_PROMPTS,
        "note": "Career Copilot AI explains official data. It never overrides eligibility verdicts.",
    }


class ChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    prompt_id: str | None = None


def _scripted_reply(message: str, prompt_id: str | None) -> str:
    msg = message.lower()
    if prompt_id == "weekly-review" or "week" in msg:
        return (
            "Last 7 days at a glance: 28.2h studied vs 35h planned (80% adherence). "
            "Strongest block was Sat (5.8h). Mock trend is +12 points over the last five sits. "
            "Correction: 2h on Polity Ch.4 backlog before Thursday; keep sleep ≥6.5h."
        )
    if prompt_id == "explain-eligibility" or "eligible" in msg:
        return (
            "You're marked 'eligible' on SSC CGL 2026 for 17 of 21 posts. Age and qualification "
            "windows match. 4 posts require domain-specific marks you haven't filled — open your "
            "profile to add them and I'll re-check deterministically."
        )
    if prompt_id == "plan-tomorrow" or "plan" in msg:
        return (
            "Proposed 6 blocks · 5h 30m\n"
            "• 06:30–08:00 Quant: Geometry drill\n"
            "• 08:15–09:00 Editorial read + vocabulary 15\n"
            "• 14:00–15:00 Mock SSC CGL Set 43\n"
            "• 15:15–16:00 Mock analysis + weakness log\n"
            "• 19:00–20:00 Polity Ch.4 revision\n"
            "• 20:15–21:00 Reasoning: Input–Output 20Qs"
        )
    if prompt_id == "weak-topics" or "weak" in msg:
        return (
            "Top 3 by estimated score lift: 1) Quant geometry (last 3 mocks accuracy 41%), "
            "2) Polity Ch.4 Parliament (unattempted Qs rising), 3) English para-jumbles."
        )
    return (
        "I can explain eligibility, review your week, plan tomorrow, and surface weak topics. "
        "Try one of the quick prompts on the left, or ask about any specific exam."
    )


@router.post("/chat")
async def chat(body: ChatBody, user: dict = Depends(get_current_user)):
    db = get_db()
    reply = _scripted_reply(body.message, body.prompt_id)
    await db.ai_messages.insert_one(
        {
            "user_id": user["_id"],
            "message": body.message,
            "reply": reply,
            "prompt_id": body.prompt_id,
            "created_at": now_utc(),
        }
    )
    return {
        "reply": reply,
        "created_at": iso(now_utc()),
        "disclaimer": "AI guidance · explanatory only · does not override official data",
    }


@router.get("/history")
async def history(user: dict = Depends(get_current_user)):
    db = get_db()
    items = []
    async for m in db.ai_messages.find({"user_id": user["_id"]}).sort("created_at", -1).limit(30):
        items.append(
            {
                "message": m["message"],
                "reply": m["reply"],
                "created_at": iso(m.get("created_at")),
            }
        )
    return {"items": list(reversed(items))}
