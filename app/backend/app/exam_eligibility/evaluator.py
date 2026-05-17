"""Exam-level baseline eligibility evaluator.

Reads the verified rows from ``exam_eligibility_rules`` and a small slice
of the user's profile and decides one of four outcomes per exam:

  * ``eligible``     — every applicable rule passes on the data we have.
  * ``conditional``  — every rule we *could* check passes, but at least
                       one applicable rule needs a field we don't have yet.
  * ``not_eligible`` — at least one is_knockout rule fails on data we have.
  * ``unknown``      — no rule is checkable yet (no profile data overlaps
                       with any applicable rule).

The four states map to the product decision discussed in the spec: only
``eligible`` and ``conditional`` are shown to users at onboarding; the
others either drop trust (``not_eligible``) or carry no signal yet
(``unknown``).

This module never writes data, never decides verdicts at the recruitment
level, and never raises into a request — its caller wraps any DB error.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any, Iterable

logger = logging.getLogger("career_copilot.exam_eligibility.evaluator")


# Ordered enum used by the ``education_min_level`` rule. A user with the
# value at index N satisfies any rule asking for level at index ≤ N.
_EDUCATION_LEVEL_ORDER: tuple[str, ...] = (
    "10th",
    "12th",
    "diploma",
    "graduation",
    "post_graduation",
    "phd",
)


def _education_rank(level: str | None) -> int | None:
    if not level:
        return None
    try:
        return _EDUCATION_LEVEL_ORDER.index(level.lower().strip())
    except ValueError:
        return None


def _age_in_years(dob: str | None, reference: date | None = None) -> int | None:
    if not dob:
        return None
    try:
        born = date.fromisoformat(str(dob)[:10])
    except ValueError:
        return None
    ref = reference or date.today()
    years = ref.year - born.year - ((ref.month, ref.day) < (born.month, born.day))
    return years


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


def _user_scopes(profile: dict[str, Any]) -> list[str]:
    """Scopes that potentially apply to this user, most-specific first.

    For category-driven rules, the most specific scope wins. PWD overrides
    category (matches the typical product policy of "PWD relaxation is
    more lenient than category relaxation").
    """
    scopes: list[str] = []
    pwbd = _normalize_text(profile.get("pwbd_status"))
    is_pwd = pwbd not in (None, "", "none", "no", "false")
    if is_pwd:
        scopes.append("pwd")
    cat = _normalize_text(profile.get("category"))
    if cat in {"general", "obc", "sc", "st", "ews"}:
        scopes.append(cat)
    if profile.get("ex_serviceman"):
        scopes.append("ex_serviceman")
    gender = _normalize_text(profile.get("gender"))
    if gender in {"female", "woman", "women"}:
        scopes.append("women")
    # ``all`` is always a fallback.
    scopes.append("all")
    return scopes


def _pick_rule(
    rules: list[dict[str, Any]], rule_type: str, user_scopes: Iterable[str]
) -> dict[str, Any] | None:
    """Return the rule whose scope best matches the user, or None.

    Walks ``user_scopes`` in most-specific-first order; the first rule
    found wins. Falls through to ``all`` as the implicit baseline if
    nothing more specific was set up.
    """
    by_scope = {r.get("scope"): r for r in rules if r.get("rule_type") == rule_type}
    for scope in user_scopes:
        if scope in by_scope:
            return by_scope[scope]
    return None


def evaluate_exam_for_user(
    rules: list[dict[str, Any]],
    profile: dict[str, Any],
    *,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Decide one exam against one user profile. Pure function.

    ``rules`` is the list of verified rows for one exam. ``profile`` is the
    slimmed-down dict ``summarize_user_eligibility`` builds — we never
    touch the DB here.
    """
    if not rules:
        return {
            "status": "unknown",
            "reasons": [],
            "missing_fields": [],
        }

    scopes = _user_scopes(profile)
    user_age = _age_in_years(profile.get("date_of_birth") or profile.get("dob"), reference_date)
    user_education_rank = _education_rank(profile.get("education_level"))
    user_nationality = _normalize_text(profile.get("nationality"))
    user_gender = _normalize_text(profile.get("gender"))
    user_attempts_used = profile.get("attempts_used")

    reasons: list[str] = []
    missing: list[str] = []
    any_rule_checked = False

    # ── age_min ──
    rule = _pick_rule(rules, "age_min", scopes)
    if rule:
        if user_age is None:
            missing.append("date_of_birth")
        else:
            any_rule_checked = True
            if user_age < int(rule["value_num"]):
                reasons.append(
                    f"Age must be at least {int(rule['value_num'])} (you are {user_age})."
                )
                return _decision("not_eligible", reasons, missing)

    # ── age_max ──
    rule = _pick_rule(rules, "age_max", scopes)
    if rule:
        if user_age is None:
            missing.append("date_of_birth")
        else:
            any_rule_checked = True
            if user_age > int(rule["value_num"]):
                reasons.append(
                    f"Age must be at most {int(rule['value_num'])} for scope "
                    f"{rule.get('scope')} (you are {user_age})."
                )
                return _decision("not_eligible", reasons, missing)

    # ── education_min_level ──
    rule = _pick_rule(rules, "education_min_level", scopes)
    if rule:
        required = (rule.get("value_text") or "").lower().strip()
        required_rank = _education_rank(required)
        if user_education_rank is None:
            missing.append("education_level")
        elif required_rank is None:
            # Mis-seeded rule — ignore rather than punish the user.
            pass
        else:
            any_rule_checked = True
            if user_education_rank < required_rank:
                reasons.append(
                    f"Requires at least {required.replace('_', ' ')} education."
                )
                return _decision("not_eligible", reasons, missing)

    # ── nationality ──
    rule = _pick_rule(rules, "nationality", scopes)
    if rule:
        required = (rule.get("value_text") or "").lower().strip()
        if not user_nationality:
            missing.append("nationality")
        elif required:
            any_rule_checked = True
            if user_nationality != required:
                reasons.append(
                    f"Open to {required.title()} nationals only."
                )
                return _decision("not_eligible", reasons, missing)

    # ── gender ──
    rule = _pick_rule(rules, "gender", scopes)
    if rule:
        required = (rule.get("value_text") or "").lower().strip()
        if not user_gender:
            missing.append("gender")
        elif required:
            any_rule_checked = True
            if user_gender != required:
                reasons.append(f"Restricted to {required} candidates.")
                return _decision("not_eligible", reasons, missing)

    # ── attempts_max ──
    rule = _pick_rule(rules, "attempts_max", scopes)
    if rule and user_attempts_used is not None:
        any_rule_checked = True
        if int(user_attempts_used) >= int(rule["value_num"]):
            reasons.append(
                f"Already used {user_attempts_used} of {int(rule['value_num'])} attempts."
            )
            return _decision("not_eligible", reasons, missing)

    # All known checks passed.
    if missing:
        return _decision("conditional", reasons, missing)
    if not any_rule_checked:
        return _decision("unknown", reasons, missing)
    return _decision("eligible", reasons, missing)


def _decision(status: str, reasons: list[str], missing: list[str]) -> dict[str, Any]:
    return {
        "status": status,
        "reasons": reasons,
        "missing_fields": sorted(set(missing)),
    }


# ── DB-aware wrapper ─────────────────────────────────────────────────────


def _safe(call, default=None):
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("exam_eligibility supabase call failed: %s", exc)
        return default


def _load_user_profile(supabase: Any, user_id: str) -> dict[str, Any]:
    """Project the minimum profile fields the evaluator needs."""
    prof_rows = _safe(
        lambda: (
            supabase.table("profiles")
            .select(
                "id, date_of_birth, dob, category, pwbd_status, nationality, "
                "gender, ex_serviceman, govt_employee"
            )
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    profile: dict[str, Any] = dict(prof_rows[0]) if prof_rows else {}

    # Education level: pick the highest level on file. A user with both 12th
    # and graduation rows must satisfy a "graduation" rule with the latter.
    edu_rows = _safe(
        lambda: (
            supabase.table("aspirant_education")
            .select("level, is_completed")
            .eq("user_id", user_id)
            .limit(20)
            .execute()
            .data
        ),
        default=[],
    ) or []
    best_rank = -1
    best_level = None
    for row in edu_rows:
        if row.get("is_completed") is False:
            continue
        rank = _education_rank(row.get("level"))
        if rank is not None and rank > best_rank:
            best_rank = rank
            best_level = row.get("level")
    if best_level:
        profile["education_level"] = best_level

    return profile


def _load_rules_by_exam(
    supabase: Any, exam_ids: list[str]
) -> dict[str, list[dict[str, Any]]]:
    if not exam_ids:
        return {}
    rows = _safe(
        lambda: (
            supabase.table("exam_eligibility_rules")
            .select(
                "exam_id, scope, rule_type, value_num, value_text, "
                "is_knockout, source_url, reviewer_status"
            )
            .in_("exam_id", exam_ids)
            .eq("reviewer_status", "verified")
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    out: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        out.setdefault(r["exam_id"], []).append(r)
    return out


def summarize_user_eligibility(supabase: Any, user_id: str) -> dict[str, Any]:
    """Return the four-bucket summary for the dashboard / onboarding card.

    Output shape::

        {
            "eligible":      [{exam_id, slug, name, reasons, missing_fields}, ...],
            "conditional":   [...],
            "not_eligible":  [...],
            "unknown":       [...],
            "evaluated_at":  "<iso>",
            "rule_count":    int
        }

    Only ``eligible`` and ``conditional`` are intended for the user-facing
    onboarding/dashboard surfaces (PR-D3). ``not_eligible`` and ``unknown``
    are included so the admin tool / debug surfaces can audit coverage.
    """
    exam_rows = _safe(
        lambda: (
            supabase.table("exams")
            .select("id, slug, name, is_active, exam_family_id")
            .eq("is_active", True)
            .order("name")
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []

    rules_by_exam = _load_rules_by_exam(supabase, [e["id"] for e in exam_rows])
    profile = _load_user_profile(supabase, user_id)

    buckets: dict[str, list[dict[str, Any]]] = {
        "eligible": [],
        "conditional": [],
        "not_eligible": [],
        "unknown": [],
    }
    rule_count = 0
    for exam in exam_rows:
        rules = rules_by_exam.get(exam["id"], [])
        rule_count += len(rules)
        # Exams with no verified rules are intentionally omitted from
        # ``unknown`` — they carry no signal to admins yet either.
        if not rules:
            continue
        result = evaluate_exam_for_user(rules, profile)
        buckets[result["status"]].append(
            {
                "exam_id": exam["id"],
                "slug": exam.get("slug"),
                "name": exam.get("name"),
                "reasons": result["reasons"],
                "missing_fields": result["missing_fields"],
            }
        )

    from datetime import datetime, timezone
    return {
        **buckets,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "rule_count": rule_count,
    }
