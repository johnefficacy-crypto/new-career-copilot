"""Verify the CMS write path auto-fills normalized_*_hash columns.

The full CMS surface doesn't have its own test scaffold yet — this test
mounts the router with the same SBStub pattern used by test_admin_api,
neutralises the feature-flag dependency, and exercises the create
endpoints to confirm the hash gets computed when the operator omits it.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_intel_cms as cms_api
from app.core.auth import get_current_user
from app.exam_intelligence.option_normalize import option_hash, question_hash
from tests.persona_questions._stub import SBStub


def _build_app(sb: SBStub):
    app = FastAPI()
    app.include_router(cms_api.router, prefix="/api")
    cms_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    # Neutralise the feature-flag gate without flipping global config.
    app.dependency_overrides[cms_api._flag_enabled] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "role": "super_admin",
        "permissions": [cms_api.PERM_CMS],
    }
    return app


def _seed():
    return {
        "pyq_papers": [{"id": "p1", "exam_id": "e1"}],
        "pyq_questions": [],
        "pyq_options": [],
        "admin_audit_logs": [],
    }


def test_create_pyq_question_autofills_question_and_option_hashes():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    payload = {
        "reason": "seed test",
        "payload": {
            "pyq_paper_id": "p1",
            "question_text": "  Consider the following statements.  ",
            "question_type": "mcq",
            "options": [
                {"option_label": "A", "option_text": "A. 1 only"},
                {"option_label": "B", "option_text": "2 ONLY"},
                {"option_label": "C", "option_text": "Both 1 and 2."},
                {"option_label": "D", "option_text": "Neither 1 nor 2"},
            ],
        },
    }
    r = client.post("/api/admin/exam-intelligence-cms/pyq-questions", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"]
    q = body["question"]
    assert q["normalized_question_hash"] == question_hash(
        "  Consider the following statements.  "
    )
    by_text = {o["option_text"]: o for o in body["options"]}
    assert by_text["A. 1 only"]["normalized_option_hash"] == option_hash("1 only")
    assert by_text["2 ONLY"]["normalized_option_hash"] == option_hash("2 ONLY")
    # Different raw text, identical canonical form → identical hash.
    assert by_text["A. 1 only"]["normalized_option_hash"] != by_text["2 ONLY"]["normalized_option_hash"]


def test_create_pyq_option_autofills_hash_when_omitted():
    seed = _seed()
    seed["pyq_questions"].append({"id": "q-existing", "pyq_paper_id": "p1"})
    sb = SBStub(seed)
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/exam-intelligence-cms/pyq-options",
        json={
            "reason": "add missing option",
            "payload": {
                "question_id": "q-existing",
                "option_label": "E",
                "option_text": "  All of the above.  ",
            },
        },
    )
    assert r.status_code == 200, r.text
    row = r.json()["row"]
    assert row["normalized_option_hash"] == option_hash("All of the above")


def test_create_pyq_option_respects_caller_supplied_hash():
    seed = _seed()
    seed["pyq_questions"].append({"id": "q-existing", "pyq_paper_id": "p1"})
    sb = SBStub(seed)
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/exam-intelligence-cms/pyq-options",
        json={
            "reason": "preserve hash",
            "payload": {
                "question_id": "q-existing",
                "option_label": "A",
                "option_text": "1 only",
                "normalized_option_hash": "deadbeef",
            },
        },
    )
    assert r.status_code == 200, r.text
    # Operator-supplied hash wins.
    assert r.json()["row"]["normalized_option_hash"] == "deadbeef"
