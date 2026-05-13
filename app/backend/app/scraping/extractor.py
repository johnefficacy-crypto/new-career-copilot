"""HTML fetcher + Claude extractor (port of ``lib/scraping/extractor.ts``).

Behaviour parity with the TS reference:

* Fetch page text with a 15-second timeout and a Career-Copilot UA.
* Strip script/style tags; collapse whitespace.
* Send the first 16 000 chars to Claude with a strict system prompt.
* Confidence defaults to 0.5 if missing; clipped to [0, 1].
* On any failure the pipeline returns ``None`` (caller logs and continues).

Mock mode:
    If ``ANTHROPIC_API_KEY`` is empty/placeholder/explicitly set to ``mock``,
    or if the caller passes ``mock=True``, the extractor returns a
    deterministic synthetic ExtractedRecruitment for testing without
    burning model credits. The mock encodes the source URL into the
    output so dedup keys are stable across runs.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import date, timedelta
from typing import Any

from .fetcher import fetch_page_html, fetch_page_text  # noqa: F401  (re-export)
from .schemas import ExtractedPost, ExtractedRecruitment

logger = logging.getLogger("career_copilot.scraping.extractor")
PROMPT_VERSION = "scraper-extractor-v2"


SYSTEM_PROMPT = """You are a specialist data extraction agent for Indian government recruitment notifications.
You receive raw HTML or text scraped from official government job portals.
Your job is to extract structured recruitment information and return ONLY valid JSON.

HARD RULES:
- Extract ONLY factual information present in the text. Never fabricate data.
- Dates → ISO 8601 (YYYY-MM-DD). If only a month is known use the 1st.
- If a field is genuinely not mentioned, set it to null. Do NOT guess.
- But DO search the ENTIRE document before returning null — eligibility details
  are often in a separate "Eligibility Criteria" / "Age Limit" / "Educational
  Qualification" section far from the post list.
- Vacancies = total across all categories unless the text clearly separates posts.
- org_type must be one of: UPSC, SSC, Banking, Railway, State, Insurance, Defence, Other.
- Return ONLY JSON. No markdown, no explanation, no preamble.

Use the GENERAL / unreserved category for min_age and max_age. The downstream
engine applies category relaxations separately.

Put the RAW education phrase into education_required so the downstream mapper
can classify it (class_10, class_12, diploma, graduate, postgraduate, phd).
If specific disciplines are listed (Civil Engineering, Computer Science,
Economics, Law, etc.), put them into the "disciplines" array.

If a notification has multiple posts/cadres, split them into separate items under posts.
Do not merge unrelated post age/education into one post.
If vacancy data is category-wise only, keep post.vacancies null unless a post total is explicit.

CONFIDENCE CALIBRATION:
  1.0 — title, org, all three dates, total_vacancies, AND every post has min_age/max_age/education_required.
  0.7 — title, org, dates, vacancies, but some posts missing age or education.
  0.5 — only title/org/dates — post-level data missing or ambiguous.
  <0.3 — text appears to be a listing/index page, not a real notification."""


# ─── Mock-aware Claude extractor ────────────────────────────────────────────


def _is_mock_mode(explicit: bool | None) -> bool:
    if explicit is True:
        return True
    if explicit is False:
        return False
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip().lower()
    return key in {"", "mock", "test", "fake", "placeholder"} or key.startswith("xxx")


def _anthropic_api_key_available() -> bool:
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip().lower()
    return bool(key) and key not in {"mock", "test", "fake", "placeholder"} and not key.startswith("xxx")


def extract_recruitment_data(
    raw_text: str,
    source_url: str,
    source_name: str,
    *,
    mock: bool | None = None,
) -> dict[str, Any] | None:
    """Returns ``{"data": ExtractedRecruitment, "confidence": float}`` or ``None``."""
    truncated = raw_text[:16000]

    if _is_mock_mode(mock):
        return _mock_extract(truncated, source_url, source_name)

    if not _anthropic_api_key_available():
        logger.warning("[extractor] ANTHROPIC_API_KEY missing or placeholder; AI extraction disabled, using deterministic extraction")
        return _mock_extract(truncated, source_url, source_name, provider="deterministic_no_ai")

    try:
        import anthropic
    except ImportError:
        logger.warning("[extractor] anthropic SDK not installed; AI extraction disabled, using deterministic extraction")
        return _mock_extract(truncated, source_url, source_name, provider="deterministic_no_anthropic_sdk")

    user_prompt = (
        f"Extract all recruitment notification data from the following text scraped from "
        f"{source_name} ({source_url}).\n\n"
        f'Return a JSON object matching this EXACT shape:\n'
        f'{{\n'
        f'  "title": "string",\n'
        f'  "organization_name": "string",\n'
        f'  "org_type": "UPSC|SSC|Banking|Railway|State|Insurance|Defence|Other",\n'
        f'  "notification_date": "YYYY-MM-DD or null",\n'
        f'  "apply_start_date": "YYYY-MM-DD or null",\n'
        f'  "apply_end_date":   "YYYY-MM-DD or null",\n'
        f'  "total_vacancies":  number or null,\n'
        f'  "year":             number,\n'
        f'  "source_pdf_url":   "string or null",\n'
        f'  "official_notification_url": "{source_url}",\n'
        f'  "official_apply_url": "string or null",\n'
        f'  "posts": [{{\n'
        f'    "post_name": "string",\n'
        f'    "group_type": "A|B|C|D or null",\n'
        f'    "pay_level": "string or null",\n'
        f'    "vacancies": number or null,\n'
        f'    "min_age": number or null,\n'
        f'    "max_age": number or null,\n'
        f'    "age_cutoff_date": "YYYY-MM-DD or null (use the separate \\"age as on\\" date if given; otherwise null)",\n'
        f'    "education_required": "string or null",\n'
        f'    "raw_requirement_text": "string or null (the full verbatim eligibility paragraph for this post if present)",\n'
        f'    "disciplines": ["string"] or null,\n'
        f'    "fees": {{"general": number, "obc": number, "sc": number, "st": number, "ews": number, "pwbd": number, "currency": "INR"}} or null,\n'
        f'    "category_vacancies": {{"UR": number, "SC": number, "ST": number, "OBC": number, "EWS": number}} or null,\n'
        f'    "age_relaxation": {{"SC": number, "ST": number, "OBC": number, "PwBD": number, "ExServiceman": number}} or null,\n'
        f'    "selection_process": ["string"] or null (e.g. ["tier_1", "tier_2", "interview", "skill_test"]),\n'
        f'    "exam_pattern": [{{"section": "string", "questions": number, "marks": number, "duration_minutes": number, "negative_marking": number or null}}] or null,\n'
        f'    "skill_tests": [{{"type": "string", "wpm": number or null, "duration_minutes": number or null}}] or null,\n'
        f'    "certificates": ["string"] or null (e.g. ["caste", "domicile", "pwbd", "ex_serviceman"]),\n'
        f'    "job_location": "string or null",\n'
        f'    "requires_domicile": boolean or null (true ONLY if the notification text explicitly says candidates must be a domicile of the recruiting state; null if the text is silent on domicile),\n'
        f'    "source_evidence": {{"page": number or null, "section": "string or null", "char_offset": number or null}} or null\n'
        f'  }}],\n'
        f'  "confidence": 0.0-1.0\n'
        f'}}\n\n'
        f'Only set rich fields (fees, category_vacancies, age_relaxation, exam_pattern, skill_tests, certificates, job_location, source_evidence, raw_requirement_text, age_cutoff_date) when they are explicitly present in the text. Set null otherwise. Do NOT fabricate.\n\n'
        f'SCRAPED TEXT:\n{truncated}'
    )

    try:
        client = anthropic.Anthropic()
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = "".join(
            getattr(b, "text", "") for b in resp.content if getattr(b, "type", None) == "text"
        ).strip()
        try:
            parsed = json.loads(text)
        except Exception:
            repaired = _extract_json_object(text)
            if not repaired:
                logger.warning("[extractor] invalid_json source=%s", source_name)
                return None
            try:
                parsed = json.loads(repaired)
            except Exception:
                logger.warning("[extractor] invalid_json source=%s", source_name)
                return None
        confidence = parsed.pop("confidence", 0.5)
        confidence = max(0.0, min(1.0, float(confidence)))
        data = ExtractedRecruitment(**parsed)
        return {"data": data, "confidence": confidence}
    except Exception as exc:  # noqa: BLE001
        logger.warning("[extractor] Claude call failed: %s", exc)
        return None


def _extract_json_object(text: str) -> str | None:
    clean = re.sub(r"^```json\s*", "", text.strip(), flags=re.IGNORECASE)
    clean = re.sub(r"^```\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean).strip()
    start = clean.find("{")
    end = clean.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return clean[start : end + 1].strip()


def _mock_extract(raw_text: str, source_url: str, source_name: str, *, provider: str = "mock") -> dict[str, Any]:
    """Deterministic synthetic extraction for tests + dry runs without a model."""
    digest = hashlib.sha1(f"{source_url}|{source_name}".encode()).hexdigest()
    today = date.today()
    apply_start = today + timedelta(days=14)
    apply_end = today + timedelta(days=44)

    title = f"{source_name} Recruitment {today.year}"
    if "ssc" in source_name.lower():
        title = f"SSC CGL {today.year}"
    elif "ibps" in source_name.lower():
        title = f"IBPS PO {today.year}"
    elif "rbi" in source_name.lower():
        title = f"RBI Grade B {today.year}"

    inspector_vacancies = int(digest[3:6], 16) % 800 + 50
    junior_vacancies = int(digest[6:9], 16) % 1500 + 100
    data = ExtractedRecruitment(
        title=title,
        organization_name=source_name,
        org_type=_guess_org_type(source_name),
        notification_date=today.isoformat(),
        apply_start_date=apply_start.isoformat(),
        apply_end_date=apply_end.isoformat(),
        total_vacancies=inspector_vacancies + junior_vacancies,
        year=today.year,
        official_notification_url=source_url,
        official_apply_url=source_url,
        source_pdf_url=None,
        posts=[
            ExtractedPost(
                post_name="Inspector",
                group_type="B",
                pay_level="7",
                vacancies=inspector_vacancies,
                min_age=18,
                max_age=32,
                age_cutoff_date=apply_end.isoformat(),
                education_required="Bachelor's degree from a recognised university",
                raw_requirement_text="Bachelor's degree in any discipline from a recognised university.",
                disciplines=None,
                fees={"general": 100, "obc": 100, "sc": 0, "st": 0, "ews": 100, "pwbd": 0, "currency": "INR"},
                category_vacancies={
                    "UR": int(inspector_vacancies * 0.5),
                    "OBC": int(inspector_vacancies * 0.27),
                    "SC": int(inspector_vacancies * 0.15),
                    "ST": int(inspector_vacancies * 0.075),
                    "EWS": int(inspector_vacancies * 0.10),
                },
                selection_process=["tier_1", "tier_2", "interview"],
                certificates=["caste"],
                job_location="Pan India",
            ),
            ExtractedPost(
                post_name="Junior Assistant",
                group_type="C",
                pay_level="2",
                vacancies=junior_vacancies,
                min_age=18,
                max_age=27,
                education_required="12th pass / Senior Secondary",
                disciplines=None,
                category_vacancies={
                    "UR": int(junior_vacancies * 0.5),
                    "OBC": int(junior_vacancies * 0.27),
                    "SC": int(junior_vacancies * 0.15),
                    "ST": int(junior_vacancies * 0.075),
                    "EWS": int(junior_vacancies * 0.10),
                },
                selection_process=["tier_1", "skill_test"],
                skill_tests=[{"type": "typing", "wpm": 35, "duration_minutes": 10}],
            ),
        ],
    )
    confidence = 0.7  # mocks are mid-confidence to force admin review
    return {"data": data, "confidence": confidence, "is_mock": True, "provider": provider}


def _guess_org_type(source_name: str) -> str:
    s = source_name.lower()
    if "upsc" in s:
        return "UPSC"
    if "ssc" in s:
        return "SSC"
    if "ibps" in s or "rbi" in s or "sbi" in s or "bank" in s:
        return "Banking"
    if "rrb" in s or "railway" in s:
        return "Railway"
    if "lic" in s or "insurance" in s:
        return "Insurance"
    if "defence" in s or "navy" in s or "army" in s or "air force" in s:
        return "Defence"
    if "psc" in s or "state" in s:
        return "State"
    return "Other"


# ─── Dedup key ──────────────────────────────────────────────────────────────


def recruitment_key(org_name: str | None, year: int | None, title: str | None) -> str:
    """Canonical similarity key. Used identically for canonical recruitments,
    open queue rows, and new extractions so the three indexes stay aligned."""
    norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())  # noqa: E731
    return f"{norm(org_name)}-{year or 0}-{norm(title)[:30]}"


def compute_similarity_key(data: ExtractedRecruitment) -> str:
    return recruitment_key(data.organization_name, data.year, data.title)


def build_recruitment_key(org_name: str, year: int | None, name: str) -> str:
    return recruitment_key(org_name, year, name)
