from server import app


def test_admin_ops_router_is_registered() -> None:
    paths = {route.path for route in app.routes}
    assert "/api/admin/marketplace" in paths
    assert "/api/admin/ai-policy" in paths
    assert "/api/admin/users/create" in paths
