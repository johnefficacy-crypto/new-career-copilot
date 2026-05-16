from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import community_runtime
from tests.persona_questions._stub import SBStub


USER = {"id": "11111111-1111-1111-1111-111111111111", "email": "u@example.com", "role": "user"}
ADMIN = {"id": "22222222-2222-2222-2222-222222222222", "email": "admin@example.com", "role": "admin"}


def _client(sb: SBStub, user: dict | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(community_runtime.router, prefix="/api")
    app.dependency_overrides[community_runtime.get_current_user] = lambda: user or USER
    app.dependency_overrides[community_runtime.get_optional_user] = lambda: user or USER
    community_runtime.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    return TestClient(app)


def test_channel_thread_reply_vote_report_are_db_backed():
    sb = SBStub(
        {
            "community_spaces": [{"id": "space-1", "name": "UPSC", "slug": "upsc", "is_active": True}],
            "community_channels": [
                {"id": "chan-1", "space_id": "space-1", "name": "prep", "slug": "prep", "channel_type": "discussion", "is_active": True}
            ],
            "community_threads": [],
            "community_replies": [],
            "community_votes": [],
            "community_reports": [],
            "user_events": [],
            "notification_alerts": [],
        }
    )
    client = _client(sb)

    created = client.post(
        "/api/community/channels/chan-1/threads",
        json={"title": "How to revise polity?", "body": "Need a durable thread body.", "flair": "question"},
    )
    assert created.status_code == 200
    thread_id = created.json()["id"]
    assert sb.db["community_threads"][0]["title"] == "How to revise polity?"

    reply = client.post(
        f"/api/community/channels/chan-1/threads/{thread_id}/replies",
        json={"body": "Use PYQs and revise weak topics twice."},
    )
    assert reply.status_code == 200
    assert sb.db["community_replies"][0]["thread_id"] == thread_id
    assert sb.db["community_threads"][0]["reply_count"] == 1

    vote = client.post(f"/api/community/channels/chan-1/threads/{thread_id}/vote", json={"direction": 1})
    assert vote.status_code == 200
    assert vote.json()["netVotes"] == 1
    assert sb.db["community_votes"][0]["thread_id"] == thread_id

    report = client.post(f"/api/community/channels/chan-1/threads/{thread_id}/report", json={"reason": "spam link"})
    assert report.status_code == 200
    assert sb.db["community_reports"][0]["reason"] == "spam link"
    assert sb.db["user_events"]


def test_resource_contribute_vote_report_and_admin_resolve_are_db_backed():
    sb = SBStub(
        {
            "community_resources": [
                {
                    "id": "res-1",
                    "title": "Official syllabus",
                    "resource_type": "strategy_guide",
                    "exam": "UPSC CSE",
                    "subject": "Meta",
                    "source_url": "https://example.gov/syllabus.pdf",
                    "source_trust": "official",
                    "status": "approved",
                    "upvote_count": 0,
                    "report_count": 0,
                }
            ],
            "community_resource_votes": [],
            "community_resource_reports": [],
            "forum_reports": [],
            "community_reports": [],
            "admin_audit_logs": [],
            "user_events": [],
        }
    )
    client = _client(sb)

    contribution = client.post(
        "/api/community/resources",
        json={
            "title": "Polity notes source",
            "type": "notes",
            "exam": "UPSC CSE",
            "subject": "Polity",
            "sourceTrust": "community",
            "sourceUrl": "https://example.com/polity-notes",
        },
    )
    assert contribution.status_code == 200
    assert contribution.json()["status"] == "pending_review"
    assert len(sb.db["community_resources"]) == 2

    vote = client.post("/api/community/resources/res-1/vote", json={})
    assert vote.status_code == 200
    assert vote.json()["upvotes"] == 1
    assert sb.db["community_resource_votes"][0]["resource_id"] == "res-1"

    report = client.post("/api/community/resources/res-1/report", json={"reason": "copyright concern"})
    assert report.status_code == 200
    flag_id = sb.db["community_resource_reports"][0]["id"]

    admin_client = _client(sb, ADMIN)
    flags = admin_client.get("/api/admin/community/flags")
    assert flags.status_code == 200
    assert flags.json()["items"][0]["kind"] == "resource"

    resolved = admin_client.post(f"/api/admin/community/flags/{flag_id}", json={"action": "dismiss"})
    assert resolved.status_code == 200
    assert sb.db["community_resource_reports"][0]["status"] == "dismissed"
    assert sb.db["admin_audit_logs"][0]["action"] == "community.flag.dismiss"
