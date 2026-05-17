from fastapi.testclient import TestClient

from server import app


def test_startup_exposes_admin_ops_and_health_routes() -> None:
    """Regression test for backend startup wiring.

    If `admin_ops_router` is not imported/mounted in server.py, importing
    `server.app` or generating OpenAPI will fail before serving API traffic.
    """
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json().get("status") == "ok"

        openapi = client.get("/openapi.json")
        assert openapi.status_code == 200
        paths = openapi.json().get("paths", {})
        assert "/api/admin/marketplace" in paths
        assert "/api/admin/ai-policy" in paths
        assert "/api/health" in paths
        assert "/api/db-health" in paths
