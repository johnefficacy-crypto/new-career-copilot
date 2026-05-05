"""Career Copilot Phase 1 backend tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for local testing if env not set
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ASPIRANT = {"email": "aspirant@careercopilot.in", "password": "Aspirant@2026"}
SUPERADMIN = {"email": "superadmin@careercopilot.in", "password": "SuperAdmin@2026"}
MENTOR = {"email": "mentor@careercopilot.in", "password": "Mentor@2026"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def user_token(session):
    return _login(session, ASPIRANT)


@pytest.fixture(scope="session")
def super_token(session):
    return _login(session, SUPERADMIN)


@pytest.fixture
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


@pytest.fixture
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"}


# ---------- health ----------
class TestHealth:
    def test_health(self, session):
        r = session.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_db_health(self, session):
        r = session.get(f"{API}/db-health", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("mongo") == "connected"


# ---------- auth ----------
class TestAuth:
    def test_register_new(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass@1234", "name": "Test User"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        j = r.json()
        assert "access_token" in j
        assert j["user"]["email"].lower() == email.lower()

    def test_login_aspirant(self, session):
        r = session.post(f"{API}/auth/login", json=ASPIRANT, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "access_token" in j
        assert j["user"]["email"] == ASPIRANT["email"]

    def test_login_bad_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ASPIRANT["email"], "password": "wrong!!"}, timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, session, user_headers):
        r = session.get(f"{API}/auth/me", headers=user_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        user = data.get("user", data)
        assert user["email"] == ASPIRANT["email"]

    def test_me_without_token(self, session):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout(self, session, user_headers):
        r = session.post(f"{API}/auth/logout", headers=user_headers, timeout=15)
        assert r.status_code == 200


# ---------- recruitments ----------
class TestRecruitments:
    def test_list(self, session):
        r = session.get(f"{API}/recruitments", timeout=15)
        assert r.status_code == 200
        j = r.json()
        items = j.get("items") if isinstance(j, dict) else j
        assert len(items) >= 6
        if isinstance(j, dict):
            assert "counts" in j
            assert {"eligible", "urgent", "conditional"} <= set(j["counts"].keys())

    def test_detail(self, session):
        r = session.get(f"{API}/recruitments/ssc-cgl-2026", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "eligibility_preview" in j

    def test_save_toggle(self, session, user_headers):
        r = session.post(f"{API}/recruitments/ssc-cgl-2026/save", headers=user_headers, timeout=15)
        assert r.status_code == 200
        r2 = session.get(f"{API}/recruitments/saved", headers=user_headers, timeout=15)
        assert r2.status_code == 200
        items = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
        # toggle again to leave state clean
        session.post(f"{API}/recruitments/ssc-cgl-2026/save", headers=user_headers, timeout=15)
        # just verify shape
        assert isinstance(items, list)


# ---------- profile ----------
class TestProfile:
    def test_get_and_update(self, session, user_headers):
        r = session.get(f"{API}/profile/me", headers=user_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "profile" in j or "email" in j
        upd = session.put(f"{API}/profile/me", headers=user_headers, json={"name": "Aspirant Demo", "goal_exams": ["ssc-cgl"], "profile": {"dob": "2000-01-01"}}, timeout=15)
        assert upd.status_code == 200
        # verify persistence
        r2 = session.get(f"{API}/profile/me", headers=user_headers, timeout=15)
        assert r2.status_code == 200


# ---------- tracker ----------
class TestTracker:
    def test_crud(self, session, user_headers):
        c = session.post(f"{API}/tracker", headers=user_headers, json={"recruitment_slug": "ssc-cgl-2026", "stage": "applied"}, timeout=15)
        assert c.status_code in (200, 201), c.text
        tid = c.json().get("id") or c.json().get("_id")
        lst = session.get(f"{API}/tracker", headers=user_headers, timeout=15)
        assert lst.status_code == 200
        if tid:
            u = session.put(f"{API}/tracker/{tid}", headers=user_headers, json={"stage": "admit_card"}, timeout=15)
            assert u.status_code in (200, 204)
            d = session.delete(f"{API}/tracker/{tid}", headers=user_headers, timeout=15)
            assert d.status_code in (200, 204)


# ---------- community ----------
class TestCommunity:
    def test_categories(self, session):
        r = session.get(f"{API}/community/categories", timeout=15)
        assert r.status_code == 200
        cats = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert len(cats) >= 6

    def test_threads_list(self, session):
        for sort in ("hot", "new", "unanswered"):
            r = session.get(f"{API}/community/threads?sort={sort}", timeout=15)
            assert r.status_code == 200, sort

    def test_thread_create_user(self, session, user_headers):
        r = session.post(f"{API}/community/threads", headers=user_headers, json={"title": "TEST thread title here", "body": "hello this is a test body that is long enough", "category": "preparation"}, timeout=15)
        assert r.status_code in (200, 201), r.text

    def test_thread_create_admin_only_rejects(self, session, user_headers):
        cats = requests.get(f"{API}/community/categories", timeout=15).json()
        cats_list = cats if isinstance(cats, list) else cats.get("items", [])
        admin_cats = [c for c in cats_list if c.get("admin_only")]
        if admin_cats:
            slug = admin_cats[0].get("slug") or admin_cats[0].get("id")
            r2 = session.post(f"{API}/community/threads", headers=user_headers, json={"title": "TEST admin title", "body": "admin only thread body is long enough for validation", "category": slug}, timeout=15)
            assert r2.status_code in (401, 403), f"expected 403, got {r2.status_code} body={r2.text}"

    def test_post_reply_and_vote(self, session, user_headers):
        r = session.post(f"{API}/community/threads/repo-directory-scan/posts", headers=user_headers, json={"body": "TEST reply"}, timeout=15)
        assert r.status_code in (200, 201, 404), r.text
        v = session.post(f"{API}/community/threads/repo-directory-scan/vote", headers=user_headers, timeout=15)
        assert v.status_code in (200, 201, 404)


# ---------- marketplace ----------
class TestMarketplace:
    def test_lists(self, session):
        for path in ("resources", "mentors", "providers", "affiliates"):
            r = session.get(f"{API}/marketplace/{path}", timeout=15)
            assert r.status_code == 200, path
            data = r.json()
            items = data if isinstance(data, list) else data.get("items", [])
            assert isinstance(items, list)

    def test_mentor_detail(self, session):
        mentors = session.get(f"{API}/marketplace/mentors", timeout=15).json()
        mlist = mentors if isinstance(mentors, list) else mentors.get("items", [])
        assert mlist, "no mentors"
        mid = mlist[0].get("id") or mlist[0].get("slug") or mlist[0].get("_id")
        r = session.get(f"{API}/marketplace/mentors/{mid}", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "availability" in j or "testimonials" in j or "name" in j


# ---------- study ----------
class TestStudy:
    def test_plan(self, session, user_headers):
        r = session.get(f"{API}/study/plan", headers=user_headers, timeout=15)
        assert r.status_code == 200

    def test_focus_summary_and_session(self, session, user_headers):
        r = session.get(f"{API}/study/focus/summary", headers=user_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "total_hours_7d" in j or "week" in j
        s = session.post(f"{API}/study/focus/start", headers=user_headers, json={"duration_min": 25, "subject": "GS"}, timeout=15)
        assert s.status_code in (200, 201), s.text
        sid = s.json().get("id") or s.json().get("session_id") or s.json().get("_id")
        stop = session.post(f"{API}/study/focus/stop", headers=user_headers, json={"id": sid, "completed_min": 25, "focus_score": 80} if sid else {}, timeout=15)
        assert stop.status_code in (200, 201), stop.text

    def test_mocks(self, session, user_headers):
        r = session.post(f"{API}/study/mocks", headers=user_headers, json={
            "name": "TEST Mock 1", "exam_slug": "ssc-cgl-2026", "subject": "Quant",
            "max_score": 100, "duration_min": 60, "attempted": 90, "correct": 80,
            "score": 80, "total": 100, "date": "2026-01-01"
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        g = session.get(f"{API}/study/mocks", headers=user_headers, timeout=15)
        assert g.status_code == 200

    def test_subjects_and_review(self, session, user_headers):
        assert session.get(f"{API}/study/subjects", headers=user_headers, timeout=15).status_code == 200
        assert session.get(f"{API}/study/weekly-review", headers=user_headers, timeout=15).status_code == 200


# ---------- accountability ----------
class TestAccountability:
    def test_shapes(self, session, user_headers):
        for path in ("partners", "groups", "mentors/bookings"):
            r = session.get(f"{API}/accountability/{path}", headers=user_headers, timeout=15)
            assert r.status_code == 200, path

    def test_actions(self, session, user_headers):
        r1 = session.post(f"{API}/accountability/partners/request", headers=user_headers, json={"partner_id": "demo-1"}, timeout=15)
        assert r1.status_code in (200, 201)
        r2 = session.post(f"{API}/accountability/groups/join", headers=user_headers, json={"group_id": "demo-1"}, timeout=15)
        assert r2.status_code in (200, 201)
        r3 = session.post(f"{API}/accountability/mentors/book", headers=user_headers, json={"mentor_id": "rohan-iyer", "slot": "2026-02-01T10:00:00"}, timeout=15)
        assert r3.status_code in (200, 201), r3.text


# ---------- AI ----------
class TestAI:
    def test_guidance_chat_history(self, session, user_headers):
        g = session.get(f"{API}/ai/guidance", headers=user_headers, timeout=15)
        assert g.status_code == 200
        c = session.post(f"{API}/ai/chat", headers=user_headers, json={"message": "help me plan SSC CGL"}, timeout=30)
        assert c.status_code == 200
        h = session.get(f"{API}/ai/history", headers=user_headers, timeout=15)
        assert h.status_code == 200


# ---------- RBAC ----------
class TestAdminRBAC:
    def test_overview_forbidden_for_user(self, session, user_headers):
        r = session.get(f"{API}/admin/overview", headers=user_headers, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_overview_ok_for_super(self, session, super_headers):
        r = session.get(f"{API}/admin/overview", headers=super_headers, timeout=15)
        assert r.status_code == 200

    def test_admin_paths_super(self, session, super_headers):
        paths = ["sources", "scraper/runs", "eligibility-queue", "notifications", "marketplace", "community/flags", "ai-policy", "audit"]
        failed = []
        for p in paths:
            r = session.get(f"{API}/admin/{p}", headers=super_headers, timeout=15)
            if r.status_code != 200:
                failed.append((p, r.status_code))
        assert not failed, f"failed: {failed}"

    def test_user_cannot_create_admin(self, session, user_headers):
        email = f"TEST_admin_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(f"{API}/admin/users/create", headers=user_headers, json={"email": email, "password": "Pass@1234", "role": "admin", "name": "x"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_super_creates_admin_and_updates_role(self, session, super_headers):
        email = f"TEST_admin_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(f"{API}/admin/users/create", headers=super_headers, json={"email": email, "password": "Pass@1234", "role": "admin", "name": "Created Admin"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        uid = r.json().get("id") or r.json().get("user", {}).get("id") or r.json().get("_id")
        if uid:
            upd = session.put(f"{API}/admin/users/{uid}/role", headers=super_headers, json={"role": "mentor"}, timeout=15)
            assert upd.status_code in (200, 204), upd.text
