from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.api import eligibility as eligibility_api


class _Exec:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, name, db):
        self.name = name
        self.db = db
        self.filters = {}

    def select(self, *args, **kwargs):
        return self

    def eq(self, key, val):
        self.filters[key] = val
        return self

    def in_(self, key, vals):
        self.filters[(key, "in")] = set(vals)
        return self

    def or_(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def upsert(self, payload, **kwargs):
        self.db.setdefault(self.name, []).extend(payload if isinstance(payload, list) else [payload])
        return self

    def insert(self, payload):
        self.db.setdefault(self.name, []).append(payload)
        return self

    def execute(self):
        rows = []
        for r in self.db.get(self.name, []):
            ok = True
            for k, v in self.filters.items():
                if isinstance(k, tuple) and k[1] == "in":
                    col = k[0].split(".")[-1]
                    if r.get(col) not in v:
                        ok = False
                        break
                elif r.get(k) != v:
                    ok = False
                    break
            if ok:
                rows.append(r)
        return _Exec(rows)


class _SB:
    def __init__(self):
        self.db = {
            "profiles": [{"id": "u1", "date_of_birth": "2000-01-01", "nationality": "Indian", "category": "general", "domicile_state": "Maharashtra"}],
            "aspirant_location": [{"user_id": "u1", "state": "Maharashtra"}],
            "aspirant_reservations": [{"user_id": "u1", "category": "general"}],
            "aspirant_education": [{"user_id": "u1", "level": "graduate", "percentage": 75, "is_completed": True}],
            "aspirant_certifications": [],
            "aspirant_experience": [],
            "aspirant_preferences": [{"user_id": "u1", "target_exams": ["gate"], "preferred_sectors": []}],
            "aspirant_exam_attempts": [{"user_id": "u1", "exam_id": "r1", "attempts_used": 1}],
            "aspirant_exam_credentials": [{"user_id": "u1", "exam_key": "gate"}],
            "tracked_recruitments": [],
            "posts": [{"id": "p1", "recruitment_id": "r1", "status": "open", "publish_status": "verified", "age_criteria": [{"min_age": 18, "max_age": 40, "cutoff_date": "2026-01-01"}], "education_criteria": [{"min_qualification_level": "graduate", "min_percentage": 60.0, "allowed_disciplines": None}], "attempt_limits": [{"category": None, "max_attempts": 3}], "certification_criteria": [], "recruitments": [{"status": "open", "publish_status": "verified", "organizations": [{"state": "Maharashtra"}]}]}],
            "recruitment_required_exam_credentials": [{"recruitment_id": "r1", "exam_key": "gate"}],
            "recruitments": [{"id": "r1", "name": "GATE Recruitment", "organizations": [{"type": "gov"}]}],
            "eligibility_results": [],
            "notification_alerts": [],
        }

    def table(self, name):
        return _Query(name, self.db)


@pytest.mark.anyio
async def test_results_me_returns_count(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(eligibility_api, "get_supabase_admin", lambda: sb)
    monkeypatch.setattr(eligibility_api, "get_current_user", lambda *a, **k: {"id": "u1"})

    out = await eligibility_api.results_me(user={"id": "u1"})
    assert "items" in out and "count" in out


@pytest.mark.anyio
async def test_recompute_service_role_requires_user_id(monkeypatch):
    monkeypatch.setattr(eligibility_api, "_is_service_role", lambda _token: True)
    with pytest.raises(HTTPException) as exc:
        await eligibility_api.recompute(request=None, creds=None, body=eligibility_api.RecomputeBody())
    assert exc.value.status_code == 400


@pytest.mark.anyio
async def test_recompute_service_role_runs(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(eligibility_api, "_is_service_role", lambda _token: True)
    monkeypatch.setattr(eligibility_api, "get_supabase_admin", lambda: sb)

    creds = type("Creds", (), {"credentials": "service"})
    out = await eligibility_api.recompute(
        request=None,
        creds=creds,
        body=eligibility_api.RecomputeBody(user_id="u1"),
    )
    assert out["ok"] is True
    assert out["user_id"] == "u1"
    assert any(
        row.get("action") == "eligibility.recompute"
        and row.get("entity_id") == "u1"
        and (row.get("new_value") or {}).get("mode") == "service_role"
        for row in sb.db.get("admin_audit_logs", [])
    )


@pytest.mark.anyio
async def test_recompute_unauthorized_raises_401(monkeypatch):
    monkeypatch.setattr(eligibility_api, "_is_service_role", lambda _token: False)
    monkeypatch.setattr(
        eligibility_api,
        "get_current_user",
        lambda _creds: (_ for _ in ()).throw(HTTPException(status_code=401, detail="x")),
    )

    with pytest.raises(HTTPException) as exc:
        await eligibility_api.recompute(
            request=None,
            creds=type("Creds", (), {"credentials": "bad-token"}),
            body=eligibility_api.RecomputeBody(),
        )
    assert exc.value.status_code == 401


@pytest.mark.anyio
async def test_recompute_user_mode_audits(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(eligibility_api, "_is_service_role", lambda _token: False)
    monkeypatch.setattr(eligibility_api, "get_supabase_admin", lambda: sb)
    monkeypatch.setattr(eligibility_api, "get_current_user", lambda _creds: {"id": "u1", "email": "u1@example.com"})

    out = await eligibility_api.recompute(
        request=None,
        creds=type("Creds", (), {"credentials": "user-token"}),
        body=eligibility_api.RecomputeBody(),
    )
    assert out["ok"] is True
    assert any(
        row.get("action") == "eligibility.recompute"
        and (row.get("new_value") or {}).get("mode") == "user_token"
        for row in sb.db.get("admin_audit_logs", [])
    )


@pytest.mark.anyio
async def test_recompute_user_mode_ignores_body_user_id(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(eligibility_api, "_is_service_role", lambda _token: False)
    monkeypatch.setattr(eligibility_api, "get_supabase_admin", lambda: sb)
    monkeypatch.setattr(eligibility_api, "get_current_user", lambda _creds: {"id": "u1", "email": "u1@example.com"})
    out = await eligibility_api.recompute(
        request=None,
        creds=type("Creds", (), {"credentials": "user-token"}),
        body=eligibility_api.RecomputeBody(user_id="u2"),
    )
    assert out["user_id"] == "u1"
