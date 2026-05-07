from __future__ import annotations
import re
from typing import Any

BLOCKED = {"private_job", "tender", "coaching_ad", "blog_only", "irrelevant"}


def classify_item(item: dict[str, Any]) -> dict[str, Any]:
    text = " ".join(str(x or "") for x in [item.get("source_name"), item.get("source_url"), (item.get("extracted_data") or {}).get("title"), (item.get("extracted_data") or {}).get("name")]).lower()
    reasons=[]
    def has(*k): return any(x in text for x in k)
    cat="unknown"; evt="other"; conf=55
    if has("private", "walk-in", "mnc"): cat="private_job"; conf=90; reasons.append("private keywords")
    elif has("tender", "eoi", "bid"): cat="tender"; conf=90; reasons.append("tender keywords")
    elif has("coaching", "admission open", "batch"): cat="coaching_ad"; conf=88
    elif has("blog", "opinion", "tips"): cat="blog_only"; conf=75
    elif has("admit card"): cat="admit_card"; evt="admit_card"; conf=85
    elif has("result", "score card"): cat="result"; evt="result"; conf=85
    elif has("answer key"): cat="answer_key"; evt="answer_key"; conf=85
    elif has("corrigendum", "addendum"): cat="corrigendum"; evt="corrigendum"; conf=85
    elif has("calendar"): cat="exam_calendar"; evt="calendar"; conf=70
    elif has("railway", "rrb"): cat="railway"; evt="new_recruitment"; conf=80
    elif has("bank", "ibps", "sbi", "rbi"): cat="banking_recruitment"; evt="new_recruitment"; conf=80
    elif has("psu", "corporation", "limited"): cat="psu_recruitment"; evt="new_recruitment"; conf=75
    elif has("commission", "recruitment", "vacancy", "notification"): cat="government_recruitment"; evt="new_recruitment"; conf=75
    relevant = cat not in BLOCKED
    return {"relevance_category":cat,"is_recruitment_relevant":relevant,"lifecycle_event_type":evt,"confidence":conf,"reasons":reasons}


def duplicate_candidates(extracted: dict[str, Any], existing: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out=[]
    eurl=(extracted.get("official_notification_url") or "").strip().lower()
    ename=re.sub(r"[^a-z0-9]+"," ",(extracted.get("title") or extracted.get("name") or "").lower()).strip()
    eyear=str(extracted.get("year") or "")
    for r in existing:
        score=0; reasons=[]
        rurl=(r.get("official_notification_url") or "").strip().lower()
        if eurl and rurl and eurl==rurl: score+=70; reasons.append("official_url_exact")
        rname=re.sub(r"[^a-z0-9]+"," ",(r.get("name") or "").lower()).strip()
        if ename and rname and (ename in rname or rname in ename): score+=20; reasons.append("title_similarity")
        if eyear and str(r.get("year") or "")==eyear: score+=10; reasons.append("year_match")
        if score>0:
            out.append({"recruitment_id":r.get("id"),"name":r.get("name"),"score":min(score,100),"reasons":reasons})
    return sorted(out,key=lambda x:x["score"], reverse=True)
