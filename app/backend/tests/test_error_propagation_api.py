import pytest
from fastapi import HTTPException

from app.api import eligibility as eligibility_api
from app.core.errors import DatabaseError
from app.db.utils import require_select


class _BrokenSB:
    def table(self, _name):
        raise RuntimeError("boom")


def test_require_select_raises_database_error():
    with pytest.raises(DatabaseError):
        require_select(_BrokenSB(), "profiles", "*")


@pytest.mark.anyio
async def test_recompute_maps_database_error_to_503(monkeypatch):
    monkeypatch.setattr(eligibility_api, "_is_service_role", lambda _token: True)
    monkeypatch.setattr(eligibility_api, "get_supabase_admin", lambda: object())

    async def _raise(*args, **kwargs):
        raise DatabaseError("db down")

    monkeypatch.setattr(eligibility_api, "run_eligibility_for_user_async", _raise)

    with pytest.raises(HTTPException) as exc:
        await eligibility_api.recompute(
            request=None,
            creds=type("Creds", (), {"credentials": "service"}),
            body=eligibility_api.RecomputeBody(user_id="u1"),
        )
    assert exc.value.status_code == 503


@pytest.mark.anyio
async def test_results_me_maps_database_error_to_503(monkeypatch):
    monkeypatch.setattr(eligibility_api, "get_supabase_admin", lambda: object())

    async def _raise(*args, **kwargs):
        raise DatabaseError("db down")

    monkeypatch.setattr(eligibility_api, "get_eligible_recruitments_async", _raise)

    with pytest.raises(HTTPException) as exc:
        await eligibility_api.results_me(user={"id": "u1"})
    assert exc.value.status_code == 503
