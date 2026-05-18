"""Admin exam intelligence API tests (PR5)."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_intelligence as admin_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _build_app(sb: SBStub, role: str = "super_admin"):
    app = FastAPI()
    app.include_router(admin_api.router, prefix="/api")
    admin_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    user_dict = {
        "id": "admin-1",
        "role": role,
        "permissions": ["exam_intelligence.review"] if role == "admin" else [],
    }
    app.dependency_overrides[get_current_user] = lambda: user_dict
    return app


def _seed():
    return {
        "exams": [
            {"id": "e1", "slug": "ssc-cgl", "name": "SSC CGL", "exam_type": "recruitment", "is_active": True},
            {"id": "e2", "slug": "ibps-po", "name": "IBPS PO", "exam_type": "recruitment", "is_active": True},
        ],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "e1", "topic_id": "t1", "raw_text": "Percentages",
             "normalized_text": "percentages", "mention_type": "explicit", "confidence_score": 0.9,
             "reviewer_status": "pending", "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "m2", "exam_id": "e1", "topic_id": "t2", "raw_text": "Ratios",
             "normalized_text": "ratios", "mention_type": "explicit", "confidence_score": 0.8,
             "reviewer_status": "verified", "created_at": "2026-04-30T00:00:00+00:00"},
            {"id": "m3", "exam_id": "e2", "topic_id": "t1", "reviewer_status": "pending",
             "created_at": "2026-04-29T00:00:00+00:00"},
        ],
        "exam_topic_coverage": [
            {"id": "c1", "exam_id": "e1", "topic_id": "t1", "is_active": True,
             "exam_phase_id": "ph1", "coverage_depth": "core", "expected_difficulty": "medium",
             "exam_priority_score": 84, "is_high_yield": True, "confidence_score": 0.78,
             "source_basis": "official_syllabus", "reviewer_status": "locked",
             "reviewed_at": "2026-05-02T00:00:00+00:00", "metadata": {"evidence_count": 3},
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "c2", "exam_id": "e1", "topic_id": "t2", "is_active": True,
             "exam_phase_id": "ph1", "coverage_depth": "normal", "expected_difficulty": "easy",
             "exam_priority_score": 40, "is_high_yield": False, "confidence_score": 0.30,
             "source_basis": "pyq_analysis", "reviewer_status": "draft",
             "metadata": {}, "created_at": "2026-04-30T00:00:00+00:00"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentages", "slug": "percentages", "subject_id": "sub1"},
            {"id": "t2", "name": "Ratios", "slug": "ratios", "subject_id": "sub1"},
        ],
        "subjects": [
            {"id": "sub1", "name": "Quantitative Aptitude"},
        ],
        "pyq_papers": [{"id": "p1", "exam_id": "e1"}],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "p1", "question_type": "mcq", "reviewer_status": "pending",
             "created_at": "2026-05-01T00:00:00+00:00"},
        ],
        "pyq_question_topic_tags": [
            {"id": "tag1", "question_id": "q1", "topic_id": "t1",
             "tag_weight": 1.0, "tag_role": "primary", "tagging_source": "manual",
             "confidence_score": 0.30, "reviewer_status": "pending",
             "created_at": "2026-05-01T00:00:00+00:00"},
        ],
    }


# ─── Access control ────────────────────────────────────────────────────────
def test_non_admin_blocked_on_every_endpoint():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb, role="user"))
    for path, method in [
        ("/api/admin/exam-intelligence/overview", "get"),
        ("/api/admin/exam-intelligence/exams", "get"),
        ("/api/admin/exam-intelligence/exams/e1/items", "get"),
    ]:
        r = getattr(client, method)(path)
        assert r.status_code == 403, path
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/m1/review",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 403


def test_admin_with_perm_can_access():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb, role="admin"))
    r = client.get("/api/admin/exam-intelligence/overview")
    assert r.status_code == 200


# ─── Overview ──────────────────────────────────────────────────────────────
def test_overview_aggregates_status_counts():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/overview")
    assert r.status_code == 200
    body = r.json()
    syllabus = body["tables"]["syllabus_topic_mention"]
    assert syllabus["total"] == 3
    assert syllabus["verified"] == 1
    assert syllabus["pending"] == 2
    assert body["exams"]["active"] == 2


# ─── Exam list ────────────────────────────────────────────────────────────
def test_list_exams_includes_per_exam_counts():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams")
    assert r.status_code == 200
    body = r.json()
    by_slug = {e["slug"]: e for e in body["items"]}
    assert by_slug["ssc-cgl"]["syllabus_verified"] == 1
    assert by_slug["ssc-cgl"]["syllabus_pending"] == 1
    assert by_slug["ibps-po"]["syllabus_verified"] == 0
    assert by_slug["ibps-po"]["syllabus_pending"] == 1


def test_list_exams_does_not_query_exam_topic_coverage_is_active():
    # exam_topic_coverage has no `is_active` column (migration 030).
    # Selecting it produced postgres 42703 in prod logs. Make sure the
    # response is built strictly off reviewer_status / is_high_yield.
    sb = SBStub(_seed())
    selects_by_table: dict[str, list[str]] = {}
    original_table = sb.table

    def tracking_table(name):
        q = original_table(name)
        original_select = q.select

        def tracking_select(*args, **kwargs):
            selects_by_table.setdefault(name, []).append(",".join(str(a) for a in args))
            return original_select(*args, **kwargs)

        q.select = tracking_select
        return q

    sb.table = tracking_table  # type: ignore[assignment]
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams")
    assert r.status_code == 200
    coverage_selects = selects_by_table.get("exam_topic_coverage", [])
    assert coverage_selects, "list_exams should query exam_topic_coverage"
    assert not any("is_active" in s for s in coverage_selects), (
        f"exam_topic_coverage queried with is_active: {coverage_selects}"
    )


def test_list_exams_includes_readiness_fields():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams")
    assert r.status_code == 200
    by_slug = {e["slug"]: e for e in r.json()["items"]}
    ssc = by_slug["ssc-cgl"]
    # c1 is locked → counts as a verified topic; c2 is draft → not.
    assert ssc["verified_topic_count"] == 1
    assert ssc["coverage_total"] == 2
    assert ssc["high_yield_topic_count"] == 1
    assert ssc["readiness_level"] == "ready"
    assert ssc["pyq_coverage_status"] == "covered"
    # ibps-po has a pending syllabus mention but no coverage at all.
    ibps = by_slug["ibps-po"]
    assert ibps["verified_topic_count"] == 0
    assert ibps["readiness_level"] == "not_ready"
    assert ibps["pyq_coverage_status"] == "none"


# ─── Overview readiness extensions ────────────────────────────────────────
def test_overview_includes_topic_coverage_and_readiness():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    body = client.get("/api/admin/exam-intelligence/overview").json()
    cov = body["topic_coverage"]
    assert cov["total"] == 2
    assert cov["locked"] == 1
    assert cov["draft"] == 1
    assert cov["high_yield"] == 1
    # tag1 confidence 0.30 < 0.5 → one low-confidence mapping.
    assert body["low_confidence_mappings"] == 1
    assert isinstance(body["stale_review_items"], int)
    readiness = body["user_facing_readiness"]
    assert readiness["level"] in {"ready", "partial", "not_ready"}
    assert readiness["locked_topic_coverage"] == 1


# ─── Topic coverage (read-only) ───────────────────────────────────────────
def test_topic_coverage_returns_mapped_rows():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/topic-coverage?exam_id=e1")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    by_id = {row["id"]: row for row in body["items"]}
    c1 = by_id["c1"]
    assert c1["topic"] == "Percentages"
    assert c1["subject"] == "Quantitative Aptitude"
    assert c1["exam"] == "SSC CGL"
    assert c1["priority_score"] == 84
    assert c1["high_yield"] is True
    assert c1["status"] == "locked"
    assert c1["evidence_count"] == 3


def test_topic_coverage_status_filter():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/topic-coverage?status=locked")
    assert r.status_code == 200
    rows = r.json()["items"]
    assert rows and all(row["status"] == "locked" for row in rows)


def test_topic_coverage_invalid_status_rejected():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/topic-coverage?status=bogus")
    assert r.status_code == 400


def test_topic_coverage_blocked_for_non_admin():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb, role="user"))
    r = client.get("/api/admin/exam-intelligence/topic-coverage")
    assert r.status_code == 403


# ─── Items list ───────────────────────────────────────────────────────────
def test_items_default_pending_filter():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams/e1/items?kind=syllabus_topic_mention")
    assert r.status_code == 200
    rows = r.json()["items"]
    assert rows and all(r["reviewer_status"] == "pending" for r in rows)


def test_items_unknown_kind_rejected():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams/e1/items?kind=ghost")
    assert r.status_code == 400


def test_items_invalid_status_rejected():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get(
        "/api/admin/exam-intelligence/exams/e1/items?kind=syllabus_topic_mention&status=nonsense"
    )
    assert r.status_code == 400


def test_pyq_question_topic_tag_list_filters_by_exam():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get(
        "/api/admin/exam-intelligence/exams/e1/items?kind=pyq_question_topic_tag&status=all"
    )
    assert r.status_code == 200
    rows = r.json()["items"]
    assert any(row["id"] == "tag1" for row in rows)


# ─── Review patch ─────────────────────────────────────────────────────────
def test_review_patch_marks_verified_and_records_reviewer():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/m1/review",
        json={"reviewer_status": "verified", "reviewer_notes": "Cross-checked PDF page 4."},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["reviewer_status"] == "verified"
    assert body["reviewed_by"] == "admin-1"
    assert body["reviewer_notes"] == "Cross-checked PDF page 4."


def test_review_patch_rejects_unknown_kind():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/ghost/m1/review",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 400


def test_review_patch_rejects_unknown_status():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/m1/review",
        json={"reviewer_status": "definitely_yes"},
    )
    assert r.status_code == 422


def test_review_patch_missing_row_returns_404():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/no-such/review",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 404


# ─── Topic coverage lifecycle review ──────────────────────────────────────
def test_coverage_review_moves_status_and_records_reviewer():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/c2/review",
        json={"reviewer_status": "pending_review"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["reviewer_status"] == "pending_review"
    assert body["reviewed_by"] == "admin-1"
    assert body["reviewed_at"]


def test_coverage_review_can_lock_for_planner():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/c2/review",
        json={"reviewer_status": "locked"},
    )
    assert r.status_code == 200
    assert r.json()["reviewer_status"] == "locked"
    # The row is now planner-ready in the stub store.
    row = next(c for c in sb.db["exam_topic_coverage"] if c["id"] == "c2")
    assert row["reviewer_status"] == "locked"


def test_coverage_review_rejects_unknown_status():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/c1/review",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 422


def test_coverage_review_missing_row_returns_404():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/no-such/review",
        json={"reviewer_status": "locked"},
    )
    assert r.status_code == 404


def test_coverage_review_blocked_for_non_admin():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb, role="user"))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/c1/review",
        json={"reviewer_status": "locked"},
    )
    assert r.status_code == 403


def test_pyq_tag_review_excludes_notes_field():
    # pyq_question_topic_tags table doesn't carry reviewer_notes; verify the
    # PATCH ignores notes for that kind without erroring.
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/pyq_question_topic_tag/tag1/review",
        json={"reviewer_status": "verified", "reviewer_notes": "ignored"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["reviewer_status"] == "verified"
    assert "reviewer_notes" not in body  # never written for this kind


# ─── Competition metrics ──────────────────────────────────────────────────
def _competition_seed():
    return {
        "exams": [
            {"id": "e1", "slug": "ssc-cgl", "name": "SSC CGL", "exam_type": "recruitment", "is_active": True},
        ],
        "exam_competition_metrics": [
            {"id": "cm1", "exam_id": "e1", "reviewer_status": "locked",
             "vacancy_total": 17727, "competition_pressure_score": 72,
             "source_basis": "reviewed_analysis", "confidence_score": 0.76,
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "cm2", "exam_id": "e1", "reviewer_status": "draft",
             "vacancy_total": 15000, "competition_pressure_score": 60,
             "created_at": "2026-04-20T00:00:00+00:00"},
        ],
        "exam_policy_updates": [
            {"id": "pu1", "exam_id": "e1", "update_type": "vacancy_change",
             "title": "Vacancies revised", "source_type": "official",
             "reviewer_status": "verified", "affects_plan": True,
             "affects_vacancy": True, "created_at": "2026-05-12T00:00:00+00:00"},
            {"id": "pu2", "exam_id": "e1", "update_type": "date_change",
             "title": "Date rumor", "source_type": "aggregator",
             "reviewer_status": "pending", "created_at": "2026-05-10T00:00:00+00:00"},
        ],
    }


def test_competition_metrics_list_maps_rows_and_exam_name():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/competition-metrics?exam_id=e1")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    by_id = {row["id"]: row for row in body["items"]}
    assert by_id["cm1"]["exam"] == "SSC CGL"
    assert by_id["cm1"]["status"] == "locked"
    assert by_id["cm1"]["vacancy_total"] == 17727


def test_competition_metrics_status_filter_and_invalid():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/competition-metrics?status=locked")
    assert r.status_code == 200
    rows = r.json()["items"]
    assert rows and all(row["status"] == "locked" for row in rows)
    bad = client.get("/api/admin/exam-intelligence/competition-metrics?status=verified")
    assert bad.status_code == 400


def test_competition_metric_review_locks_for_planner():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/competition-metrics/cm2/review",
        json={"reviewer_status": "locked"},
    )
    assert r.status_code == 200
    assert r.json()["reviewer_status"] == "locked"
    row = next(c for c in sb.db["exam_competition_metrics"] if c["id"] == "cm2")
    assert row["reviewed_by"] == "admin-1"


def test_competition_metric_review_missing_returns_404():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/competition-metrics/no-such/review",
        json={"reviewer_status": "locked"},
    )
    assert r.status_code == 404


# ─── Policy updates ───────────────────────────────────────────────────────
def test_policy_updates_list_filters_by_source_type():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb))
    r = client.get(
        "/api/admin/exam-intelligence/policy-updates?source_type=official"
    )
    assert r.status_code == 200
    rows = r.json()["items"]
    assert rows and all(row["source_type"] == "official" for row in rows)
    bad = client.get(
        "/api/admin/exam-intelligence/policy-updates?source_type=bogus"
    )
    assert bad.status_code == 400


def test_policy_update_review_verifies_and_records_notes():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/policy-updates/pu2/review",
        json={"reviewer_status": "rejected", "reviewer_notes": "No official source."},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["reviewer_status"] == "rejected"
    assert body["reviewer_notes"] == "No official source."
    assert body["reviewed_by"] == "admin-1"


def test_policy_update_review_rejects_unknown_status():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/policy-updates/pu1/review",
        json={"reviewer_status": "locked"},
    )
    assert r.status_code == 422


def test_competition_and_policy_blocked_for_non_admin():
    sb = SBStub(_competition_seed())
    client = TestClient(_build_app(sb, role="user"))
    for path in [
        "/api/admin/exam-intelligence/competition-metrics",
        "/api/admin/exam-intelligence/policy-updates",
    ]:
        assert client.get(path).status_code == 403


# ─── Option-level analytics (repetitions / traps / elimination / recompute)
def _options_seed():
    """Two papers across two years, four questions, four options each.

    The "1 only" / "2 only" / "Both 1 and 2" / "Neither 1 nor 2" pattern
    is intentionally repeated across all four questions so the grouping
    code has something to bucket. One question (q1) has the right answer
    on option B; the rest have all wrong options.
    """
    db: dict[str, Any] = {
        "exams": [{"id": "e1", "slug": "upsc-cse", "name": "UPSC CSE", "is_active": True}],
        "pyq_papers": [
            {"id": "p1", "exam_id": "e1", "year": 2023},
            {"id": "p2", "exam_id": "e1", "year": 2024},
        ],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "p1", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "q2", "pyq_paper_id": "p1", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "q3", "pyq_paper_id": "p2", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "q4", "pyq_paper_id": "p2", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
        ],
        "pyq_question_topic_tags": [
            {"id": "tag1", "question_id": "q1", "topic_id": "t1",
             "tag_role": "primary", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "tag2", "question_id": "q2", "topic_id": "t1",
             "tag_role": "primary", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "tag3", "question_id": "q3", "topic_id": "t2",
             "tag_role": "primary", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "tag4", "question_id": "q4", "topic_id": "t1",
             "tag_role": "primary", "reviewer_status": "verified",
             "created_at": "2026-05-01T00:00:00+00:00"},
        ],
        "pyq_options": [],
        "pyq_option_repetitions": [],
        "pyq_option_patterns": [],
    }
    options_template = [
        ("A", "1 only", False),
        ("B", "2 only", False),
        ("C", "Both 1 and 2", False),
        ("D", "Neither 1 nor 2", False),
    ]
    for qid in ("q1", "q2", "q3", "q4"):
        for idx, (label, text, _) in enumerate(options_template):
            is_correct = (qid == "q1" and label == "B")
            db["pyq_options"].append(
                {
                    "id": f"opt-{qid}-{label}",
                    "question_id": qid,
                    "option_label": label,
                    "option_text": text,
                    "is_correct": is_correct,
                    "reviewer_status": "verified",
                }
            )
    return db


def test_options_repetitions_groups_recurring_text():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/options/repetitions?exam_id=e1")
    assert r.status_code == 200
    body = r.json()
    # Each of the four options appears once per question across 4 questions.
    assert body["total_groups"] == 4
    counts = {g["normalized_value"]: g["occurrence_count"] for g in body["groups"]}
    assert counts == {"1 only": 4, "2 only": 4, "Both 1 and 2": 4, "Neither 1 nor 2": 4}
    # Year range rolls up across both papers.
    first_group = body["groups"][0]
    assert first_group["first_seen_year"] == 2023
    assert first_group["last_seen_year"] == 2024


def test_options_repetitions_topic_filter_narrows_universe():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/options/repetitions?exam_id=e1&topic_id=t2")
    assert r.status_code == 200
    body = r.json()
    # Only q3 has topic t2 → 4 options each appearing once → no group
    # passes the default min_occurrences=2.
    assert body["total_groups"] == 0
    # Drop the threshold and t2's options show up.
    r2 = client.get(
        "/api/admin/exam-intelligence/options/repetitions?exam_id=e1&topic_id=t2&min_occurrences=1"
    )
    assert r2.status_code == 200
    assert r2.json()["total_groups"] == 4


def test_options_traps_ranks_wrong_repetitions():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/options/traps?exam_id=e1")
    assert r.status_code == 200
    body = r.json()
    # All four group keys recur, three have all-wrong occurrences (count=4),
    # "2 only" has one correct (q1.B) so wrong_count=3.
    vals = {g["normalized_value"]: g for g in body["groups"]}
    assert set(vals) == {"1 only", "Both 1 and 2", "Neither 1 nor 2", "2 only"}
    # All-wrong groups have a higher trap_score than the mixed one.
    assert vals["1 only"]["trap_score"] > vals["2 only"]["trap_score"]


def test_options_elimination_patterns_bucketing():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/options/elimination-patterns?exam_id=e1")
    assert r.status_code == 200
    patterns = {p["pattern"]: p for p in r.json()["patterns"]}
    # 4 questions × {single_only x2, both, neither} → expected counts.
    assert patterns["single_only"]["occurrence_count"] == 8  # "1 only" + "2 only"
    assert patterns["both_x_and_y"]["occurrence_count"] == 4
    assert patterns["neither_x_nor_y"]["occurrence_count"] == 4
    # "2 only" was the only correct option, so single_only carries 1 correct.
    assert patterns["single_only"]["correct_count"] == 1
    assert patterns["single_only"]["correct_rate"] == round(1 / 8, 3)


def test_options_recompute_materialises_rollup_tables():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))
    r = client.post("/api/admin/exam-intelligence/options/recompute?exam_id=e1")
    assert r.status_code == 200
    body = r.json()
    assert body["groups_considered"] == 4
    # All 4 groups recur (count >= 2), each appears under 1+ topics.
    assert body["repetitions_upserted"] >= 4
    assert body["patterns_upserted"] > 0
    # The rollup actually wrote into the stub DB.
    reps = sb.db.get("pyq_option_repetitions") or []
    assert reps and all(r["exam_id"] == "e1" for r in reps)
    pats = sb.db.get("pyq_option_patterns") or []
    elim = [p for p in pats if p["pattern_type"] == "elimination_pattern"]
    assert elim, "elimination_pattern rows should be written"


def test_options_recompute_is_idempotent():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))
    first = client.post("/api/admin/exam-intelligence/options/recompute?exam_id=e1").json()
    second = client.post("/api/admin/exam-intelligence/options/recompute?exam_id=e1").json()
    assert first["repetitions_upserted"] == second["repetitions_upserted"]
    assert first["patterns_upserted"] == second["patterns_upserted"]


def test_options_endpoints_blocked_for_non_admin():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb, role="user"))
    for path in [
        "/api/admin/exam-intelligence/options/repetitions?exam_id=e1",
        "/api/admin/exam-intelligence/options/traps?exam_id=e1",
        "/api/admin/exam-intelligence/options/elimination-patterns?exam_id=e1",
    ]:
        assert client.get(path).status_code == 403
    assert (
        client.post("/api/admin/exam-intelligence/options/recompute?exam_id=e1").status_code
        == 403
    )
    assert (
        client.post(
            "/api/admin/exam-intelligence/options/backfill-hashes?exam_id=e1"
        ).status_code
        == 403
    )


def test_options_backfill_hashes_fills_nulls_idempotently():
    """Recompute on the same seed once more after backfill should now key
    on hashes, but the bucket totals don't change because the canonical
    fallback already produced the same groupings."""
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))

    before = [o.get("normalized_option_hash") for o in sb.db["pyq_options"]]
    assert all(h in (None, "") for h in before)

    r = client.post("/api/admin/exam-intelligence/options/backfill-hashes?exam_id=e1")
    assert r.status_code == 200
    body = r.json()
    assert body["option_rows_scanned"] == 16
    assert body["option_hashes_written"] == 16
    # Questions are skipped by default.
    assert body["question_hashes_written"] == 0

    # All hashes are now populated, identical option_text → identical hash.
    after = {o["option_text"]: o.get("normalized_option_hash") for o in sb.db["pyq_options"]}
    assert all(after.values())
    # "1 only" appears on 4 questions → all 4 share the same hash.
    one_only_rows = [
        o["normalized_option_hash"] for o in sb.db["pyq_options"] if o["option_text"] == "1 only"
    ]
    assert len(set(one_only_rows)) == 1

    # Repeat call — nothing left to write.
    r2 = client.post("/api/admin/exam-intelligence/options/backfill-hashes?exam_id=e1")
    assert r2.json()["option_hashes_written"] == 0


def test_options_backfill_hashes_dry_run_does_not_write():
    sb = SBStub(_options_seed())
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/exam-intelligence/options/backfill-hashes?exam_id=e1&dry_run=true"
    )
    assert r.status_code == 200
    assert r.json()["option_hashes_written"] == 16
    # Nothing should have been written.
    assert all(
        not o.get("normalized_option_hash") for o in sb.db["pyq_options"]
    )


def test_options_backfill_hashes_includes_questions_when_requested():
    sb = SBStub(_options_seed())
    # Seed question rows need question_text for hashing to do anything.
    for idx, q in enumerate(sb.db["pyq_questions"]):
        q["question_text"] = f"Consider statements {idx + 1}: ..."
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/exam-intelligence/options/backfill-hashes"
        "?exam_id=e1&include_questions=true"
    )
    assert r.status_code == 200
    body = r.json()
    assert body["question_rows_scanned"] == 4
    assert body["question_hashes_written"] == 4
    assert all(q.get("normalized_question_hash") for q in sb.db["pyq_questions"])


def test_options_repetitions_uses_hash_when_present():
    """Options that hash-collide via canonicalisation group together even
    when the raw ``option_text`` differs (e.g. casing / leading label)."""
    sb = SBStub(_options_seed())
    # Swap the texts on q4's row to slightly-different-but-canonical
    # variants: "1 ONLY" + "A. 2 only" + "Both 1 and 2." + " Neither 1 nor 2".
    swaps = {
        "opt-q4-A": "1 ONLY",
        "opt-q4-B": "A. 2 only",
        "opt-q4-C": "Both 1 and 2.",
        "opt-q4-D": " Neither 1 nor 2 ",
    }
    for o in sb.db["pyq_options"]:
        if o["id"] in swaps:
            o["option_text"] = swaps[o["id"]]
    client = TestClient(_build_app(sb))
    # Backfill so the rollup keys on hash, not lowercased text.
    client.post("/api/admin/exam-intelligence/options/backfill-hashes?exam_id=e1")
    r = client.get("/api/admin/exam-intelligence/options/repetitions?exam_id=e1")
    body = r.json()
    # Four canonical groups, each still at count 4 — the variants merged.
    assert body["total_groups"] == 4
    assert all(g["occurrence_count"] == 4 for g in body["groups"])
