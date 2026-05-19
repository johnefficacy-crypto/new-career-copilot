from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import Any

from app.db.supabase_client import get_supabase_admin


@dataclass
class CheckResult:
    name: str
    status: str  # PASS | WARN | FAIL
    detail: str
    hard_fail: bool = False


def _rows(sb: Any, table: str, select: str, **eq_filters: Any) -> list[dict[str, Any]]:
    q = sb.table(table).select(select)
    for key, value in eq_filters.items():
        q = q.eq(key, value)
    out = q.limit(5000).execute().data
    return out or []


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--exam-slug", required=True)
    p.add_argument("--strict", action="store_true")
    args = p.parse_args()

    sb = get_supabase_admin()
    results: list[CheckResult] = []

    exams = _rows(sb, "exams", "id,slug,name,is_active", slug=args.exam_slug)
    if not exams:
        results.append(CheckResult("Exam registry", "FAIL", "exam not found", True))
        _print(args.exam_slug, results)
        return 1 if args.strict else 0
    exam = exams[0]
    exam_id = exam["id"]
    active = exam.get("is_active", True)
    results.append(CheckResult("Exam registry", "PASS" if active else "FAIL", "exam exists and active" if active else "exam exists but inactive", not active))

    cycles = _rows(sb, "exam_cycles", "id,status,exam_start,exam_end", exam_id=exam_id)
    cycle_ok = any((c.get("status") in {"open", "upcoming", "active", "expected"}) for c in cycles)
    results.append(CheckResult("Cycle", "PASS" if cycle_ok else "FAIL", f"{len(cycles)} cycle row(s)", not cycle_ok))

    phases = _rows(sb, "exam_phases", "id,phase_name,status", exam_id=exam_id)
    results.append(CheckResult("Phases", "PASS" if phases else "FAIL", f"{len(phases)} phase row(s)", not bool(phases)))

    locked_cov = _rows(sb, "exam_topic_coverage", "id,topic_id,source_basis,reviewer_status,reviewer_notes", exam_id=exam_id)
    locked_cov = [r for r in locked_cov if r.get("reviewer_status") == "locked"]

    topic_rows = _rows(sb, "topics", "id,is_active")
    active_topics = {t["id"] for t in topic_rows if t.get("is_active", True)}
    tax_ok = len(active_topics) > 0 and len(_rows(sb, "subjects", "id", is_active=True)) > 0
    results.append(CheckResult("Taxonomy", "PASS" if tax_ok else "FAIL", f"subjects/topics present: {tax_ok}", not tax_ok))

    results.append(CheckResult("Locked coverage", "PASS" if locked_cov else "FAIL", f"{len(locked_cov)} locked rows", not bool(locked_cov)))

    unresolved = [r["topic_id"] for r in locked_cov if r.get("topic_id") not in active_topics]
    if unresolved:
        results.append(CheckResult("Locked topic resolution", "FAIL", f"{len(unresolved)} locked rows reference missing/inactive topics", True))
    else:
        results.append(CheckResult("Locked topic resolution", "PASS", "all locked topics resolve to active topics"))

    verified_mentions = _rows(sb, "syllabus_topic_mentions", "topic_id,reviewer_status,reviewer_notes", exam_id=exam_id)
    verified_mention_topics = {r.get("topic_id") for r in verified_mentions if r.get("reviewer_status") == "verified"}

    tags = _rows(sb, "pyq_question_topic_tags", "question_id,topic_id,reviewer_status", )
    q_by_id = {q["id"]: q for q in _rows(sb, "pyq_questions", "id,reviewer_status")}
    verified_tag_topics = {
        t.get("topic_id")
        for t in tags
        if t.get("reviewer_status") == "verified" and q_by_id.get(t.get("question_id"), {}).get("reviewer_status") == "verified"
    }

    unsupported = []
    for row in locked_cov:
        tid = row.get("topic_id")
        if tid in verified_mention_topics or tid in verified_tag_topics:
            continue
        if row.get("source_basis") == "admin_review" and (row.get("reviewer_notes") or "").strip():
            continue
        unsupported.append(row.get("id"))
    results.append(CheckResult("Evidence linkage", "PASS" if not unsupported else "FAIL", "all locked rows have verified evidence or admin review notes" if not unsupported else f"{len(unsupported)} locked rows lack evidence chain", bool(unsupported)))

    results.append(CheckResult("PYQ tags", "PASS" if verified_tag_topics else "WARN", f"{len(verified_tag_topics)} verified topic tag(s)"))

    cm_rows = _rows(sb, "exam_competition_metrics", "id,reviewer_status", exam_id=exam_id)
    readable_cm = [r for r in cm_rows if r.get("reviewer_status") in {"reviewed", "locked"}]
    results.append(CheckResult("Competition context", "PASS" if readable_cm else "WARN", f"{len(readable_cm)} reviewed/locked row(s)"))

    policy = _rows(sb, "exam_policy_updates", "id,source_type,reviewer_status,affects_plan,affects_deadline,affects_eligibility,affects_documents,affects_syllabus,affects_vacancy", exam_id=exam_id)
    affect_keys = ["affects_plan","affects_deadline","affects_eligibility","affects_documents","affects_syllabus","affects_vacancy"]
    bad_official = []
    bad_discovery = []
    for r in policy:
        has_affect = any(bool(r.get(k)) for k in affect_keys)
        if has_affect and not (r.get("source_type") == "official" and r.get("reviewer_status") == "verified"):
            bad_official.append(r["id"])
        if r.get("source_type") in {"aggregator", "research", "opportunity"} and has_affect:
            bad_discovery.append(r["id"])
    status = "PASS" if not bad_official and not bad_discovery else "FAIL"
    results.append(CheckResult("Policy updates", status, f"bad_official={len(bad_official)}, bad_discovery={len(bad_discovery)}", status == "FAIL"))

    _print(args.exam_slug, results)
    if args.strict and any(r.hard_fail for r in results):
        return 1
    return 0


def _print(slug: str, results: list[CheckResult]) -> None:
    print(f"Exam Intelligence Readiness: {slug}\n")
    for r in results:
        print(f"{r.name}: {r.status} — {r.detail}")


if __name__ == "__main__":
    raise SystemExit(main())
