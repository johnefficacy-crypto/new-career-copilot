"""End-to-end backend tests for Razorpay subscription / payment flow.

Hits the public preview URL using REACT_APP_BACKEND_URL so we exercise
the same routing that the browser would. Auth is via Supabase password
sign-in; admin role is granted via the Supabase admin API on top of the
existing super_admin user from /app/memory/test_credentials.md.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from pathlib import Path

import pytest

requests = pytest.importorskip("requests")
pytestmark = pytest.mark.integration


def _load_env(path: str) -> dict:
    env: dict[str, str] = {}
    p = Path(path)
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


_FRONTEND_ENV = _load_env("/app/app/frontend/.env")
_BACKEND_ENV = _load_env("/app/app/backend/.env")

BASE_URL = (_FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
SUPABASE_URL = (_FRONTEND_ENV.get("REACT_APP_SUPABASE_URL") or _BACKEND_ENV.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_ANON = _FRONTEND_ENV.get("REACT_APP_SUPABASE_ANON_KEY") or _BACKEND_ENV.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
SUPABASE_SERVICE = _BACKEND_ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
RAZORPAY_KEY_SECRET = _BACKEND_ENV.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = _BACKEND_ENV.get("RAZORPAY_WEBHOOK_SECRET", "")

ADMIN_EMAIL = "razortest+1778018301@inbox.testreal.dev"
ADMIN_PASSWORD = "RazorPass@2026"


# ─── Helpers ────────────────────────────────────────────────────────────────


def _supabase_signin(email: str, password: str) -> str | None:
    if not SUPABASE_URL or not SUPABASE_ANON:
        return None
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


def _supabase_admin_create_user(email: str, password: str, role: str = "user") -> str | None:
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers={
            "apikey": SUPABASE_SERVICE,
            "Authorization": f"Bearer {SUPABASE_SERVICE}",
            "Content-Type": "application/json",
        },
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "app_metadata": {"role": role},
            "user_metadata": {"name": "Razorpay Tester"},
        },
        timeout=20,
    )
    if r.status_code not in (200, 201):
        return None
    data = r.json()
    return data.get("id") or (data.get("user") or {}).get("id")


# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def admin_token() -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL missing")
    tok = _supabase_signin(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip(f"Cannot sign in admin {ADMIN_EMAIL}")
    return tok


@pytest.fixture(scope="session")
def normal_user():
    """Create a fresh non-admin user and return (token, email, user_id)."""
    if not SUPABASE_SERVICE:
        pytest.skip("SUPABASE_SERVICE_ROLE_KEY missing")
    email = f"rzp_user_{uuid.uuid4().hex[:10]}@inbox.testreal.dev"
    pw = "UserPass@2026"
    uid = _supabase_admin_create_user(email, pw, role="user")
    if not uid:
        pytest.skip("Could not create normal test user")
    tok = _supabase_signin(email, pw)
    if not tok:
        pytest.skip("Could not sign in normal test user")
    return {"token": tok, "email": email, "id": uid}


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def user_headers(normal_user):
    return {"Authorization": f"Bearer {normal_user['token']}", "Content-Type": "application/json"}


# ─── Public plans ────────────────────────────────────────────────────────────


class TestPublicPlans:
    def test_list_plans_public_returns_active_three(self):
        r = requests.get(f"{BASE_URL}/api/plans", timeout=15)
        assert r.status_code == 200, r.text
        plans = r.json().get("plans") or []
        slugs = {p["id"] for p in plans}
        assert {"free", "pro", "elite"}.issubset(slugs), slugs
        for p in plans:
            assert p["is_active"] is True
            assert isinstance(p["price_inr"], int)
        # paid plans have non-zero paise price
        pro = next(p for p in plans if p["id"] == "pro")
        elite = next(p for p in plans if p["id"] == "elite")
        assert pro["price_inr"] > 0
        assert elite["price_inr"] > 0


# ─── Admin plan CRUD + RBAC ─────────────────────────────────────────────────


class TestAdminPlansRBAC:
    def test_admin_plans_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/plans", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_normal_user_blocked_from_admin_plans(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/admin/plans", headers=user_headers, timeout=15)
        assert r.status_code == 403, r.text

    def test_admin_lists_all_plans_including_disabled(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/plans", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        plans = r.json().get("plans") or []
        assert len(plans) >= 3
        # admin sees plans regardless of is_active
        ids = {p["id"] for p in plans}
        assert {"free", "pro", "elite"}.issubset(ids)


class TestAdminPlanLifecycle:
    """Create → update → soft-delete a temp plan to keep core plans intact."""

    plan_id = f"test_plan_{uuid.uuid4().hex[:8]}"

    def test_01_create_plan(self, admin_headers):
        body = {
            "id": self.plan_id,
            "name": "TEST Plan",
            "description": "temp",
            "price_inr": 19900,
            "interval": "monthly",
            "features": ["a", "b"],
            "is_active": True,
            "sort_order": 99,
        }
        r = requests.post(
            f"{BASE_URL}/api/admin/plans", headers=admin_headers, json=body, timeout=15
        )
        assert r.status_code in (200, 201), r.text
        plan = r.json()["plan"]
        assert plan["price_inr"] == 19900
        assert plan["id"] == self.plan_id

    def test_02_update_persists(self, admin_headers):
        r = requests.put(
            f"{BASE_URL}/api/admin/plans/{self.plan_id}",
            headers=admin_headers,
            json={"price_inr": 22200, "description": "updated by test"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # GET-after-update via admin list
        all_plans = requests.get(
            f"{BASE_URL}/api/admin/plans", headers=admin_headers, timeout=15
        ).json()["plans"]
        match = next((p for p in all_plans if p["id"] == self.plan_id), None)
        assert match is not None
        assert match["price_inr"] == 22200
        assert match["description"] == "updated by test"

    def test_03_disable_hides_from_public(self, admin_headers):
        r = requests.delete(
            f"{BASE_URL}/api/admin/plans/{self.plan_id}", headers=admin_headers, timeout=15
        )
        assert r.status_code == 200, r.text
        # public list must NOT show it
        public_plans = requests.get(f"{BASE_URL}/api/plans", timeout=15).json()["plans"]
        assert all(p["id"] != self.plan_id for p in public_plans)
        # admin list still shows it (is_active=false)
        admin_plans = requests.get(
            f"{BASE_URL}/api/admin/plans", headers=admin_headers, timeout=15
        ).json()["plans"]
        match = next((p for p in admin_plans if p["id"] == self.plan_id), None)
        assert match is not None
        assert match["is_active"] is False


class TestAdminUpdateExistingPro:
    """Verify price update on the canonical 'pro' plan persists, then restore."""

    def test_update_pro_price_and_restore(self, admin_headers):
        # read current
        plans = requests.get(
            f"{BASE_URL}/api/admin/plans", headers=admin_headers, timeout=15
        ).json()["plans"]
        pro = next(p for p in plans if p["id"] == "pro")
        original = pro["price_inr"]
        try:
            r = requests.put(
                f"{BASE_URL}/api/admin/plans/pro",
                headers=admin_headers,
                json={"price_inr": original + 100},
                timeout=15,
            )
            assert r.status_code == 200, r.text
            after = requests.get(f"{BASE_URL}/api/plans", timeout=15).json()["plans"]
            new_pro = next(p for p in after if p["id"] == "pro")
            assert new_pro["price_inr"] == original + 100
        finally:
            requests.put(
                f"{BASE_URL}/api/admin/plans/pro",
                headers=admin_headers,
                json={"price_inr": original},
                timeout=15,
            )


# ─── Order + verify ─────────────────────────────────────────────────────────


class TestOrderAndVerify:
    @pytest.fixture(scope="class")
    def order_pro(self, normal_user):
        headers = {
            "Authorization": f"Bearer {normal_user['token']}",
            "Content-Type": "application/json",
        }
        r = requests.post(
            f"{BASE_URL}/api/payments/order",
            headers=headers,
            json={"plan_id": "pro"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_order_returns_razorpay_id_and_amount(self, order_pro):
        order = order_pro["order"]
        assert order["id"].startswith("order_"), order
        assert isinstance(order["amount"], int) and order["amount"] > 0
        assert order["currency"] == "INR"
        assert order_pro["key_id"]
        assert order_pro["plan"]["id"] == "pro"
        # amount must equal current pro price_inr
        public_plans = requests.get(f"{BASE_URL}/api/plans", timeout=15).json()["plans"]
        pro_price = next(p for p in public_plans if p["id"] == "pro")["price_inr"]
        assert order["amount"] == pro_price

    def test_order_for_free_plan_is_400(self, user_headers):
        r = requests.post(
            f"{BASE_URL}/api/payments/order",
            headers=user_headers,
            json={"plan_id": "free"},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_order_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/payments/order",
            json={"plan_id": "pro"},
            timeout=15,
        )
        assert r.status_code in (401, 403), r.text

    def test_verify_bad_signature_400(self, user_headers, order_pro):
        r = requests.post(
            f"{BASE_URL}/api/payments/verify",
            headers=user_headers,
            json={
                "razorpay_order_id": order_pro["order"]["id"],
                "razorpay_payment_id": "pay_BADSIG",
                "razorpay_signature": "deadbeef",
            },
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "Invalid" in (r.json().get("detail") or "")

    def test_verify_valid_signature_activates_sub(self, user_headers, order_pro):
        order_id = order_pro["order"]["id"]
        payment_id = f"pay_TEST{uuid.uuid4().hex[:10]}"
        sig = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        r = requests.post(
            f"{BASE_URL}/api/payments/verify",
            headers=user_headers,
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": sig,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "active"
        assert data["plan_id"] == "pro"

        # GET subscription/me reflects active sub
        time.sleep(0.5)
        me = requests.get(
            f"{BASE_URL}/api/subscriptions/me", headers=user_headers, timeout=15
        )
        assert me.status_code == 200, me.text
        body = me.json()
        assert body["active"] is not None
        assert body["active"]["status"] == "active"
        assert body["active"]["plan_id"] == "pro"
        # current_period_end should be ~30 days out
        from datetime import datetime, timezone
        end = body["active"]["current_period_end"]
        assert end is not None
        dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
        delta_days = (dt - datetime.now(timezone.utc)).days
        assert 28 <= delta_days <= 31, f"period_end {delta_days} days from now"

    def test_switch_plan_deactivates_previous(self, user_headers):
        # Create elite order
        r = requests.post(
            f"{BASE_URL}/api/payments/order",
            headers=user_headers,
            json={"plan_id": "elite"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        new_order_id = r.json()["order"]["id"]
        payment_id = f"pay_TEST{uuid.uuid4().hex[:10]}"
        sig = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            f"{new_order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        v = requests.post(
            f"{BASE_URL}/api/payments/verify",
            headers=user_headers,
            json={
                "razorpay_order_id": new_order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": sig,
            },
            timeout=30,
        )
        assert v.status_code == 200, v.text
        assert v.json()["plan_id"] == "elite"

        # subscription/me — only one active, plan = elite, history shows pro cancelled
        me = requests.get(
            f"{BASE_URL}/api/subscriptions/me", headers=user_headers, timeout=15
        ).json()
        assert me["active"]["plan_id"] == "elite"
        actives = [r for r in me["history"] if r["status"] == "active"]
        assert len(actives) == 1
        # earlier pro sub should be cancelled
        cancelled = [r for r in me["history"] if r["status"] == "cancelled" and r["plan_id"] == "pro"]
        assert cancelled, me["history"]


# ─── Webhook ────────────────────────────────────────────────────────────────


class TestWebhook:
    def test_bad_signature_400(self):
        body = json.dumps({"event": "payment.captured"}).encode()
        r = requests.post(
            f"{BASE_URL}/api/payments/webhook",
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "wrongsig",
            },
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_unknown_order_returns_200(self):
        payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_doesnotexist",
                        "order_id": "order_doesnotexist",
                        "amount": 24900,
                        "currency": "INR",
                        "method": "card",
                    }
                }
            },
        }
        body = json.dumps(payload).encode()
        sig = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        r = requests.post(
            f"{BASE_URL}/api/payments/webhook",
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": sig,
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True


# ─── User-facing /me views ──────────────────────────────────────────────────


class TestUserMeViews:
    def test_subscriptions_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/subscriptions/me", timeout=15)
        assert r.status_code in (401, 403)

    def test_payments_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/payments/me", timeout=15)
        assert r.status_code in (401, 403)

    def test_payments_me_returns_history_for_user(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/payments/me", headers=user_headers, timeout=15)
        assert r.status_code == 200, r.text
        payments = r.json().get("payments", [])
        # We've gone through at least 1 order + verify above
        assert isinstance(payments, list)
        if payments:
            assert "razorpay_order_id" in payments[0]


# ─── Admin views RBAC ───────────────────────────────────────────────────────


class TestAdminViewsRBAC:
    def test_admin_subs_blocked_for_user(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/admin/subscriptions", headers=user_headers, timeout=15)
        assert r.status_code == 403

    def test_admin_payments_blocked_for_user(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/admin/payments", headers=user_headers, timeout=15)
        assert r.status_code == 403

    def test_admin_subs_ok_for_admin(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/subscriptions", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "subscriptions" in r.json()

    def test_admin_payments_ok_for_admin(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/payments", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "payments" in r.json()
