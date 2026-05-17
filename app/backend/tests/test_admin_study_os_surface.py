from __future__ import annotations

from fastapi.testclient import TestClient

from server import app


def _paths() -> dict:
    with TestClient(app) as client:
        res = client.get('/openapi.json')
        assert res.status_code == 200
        return res.json().get('paths', {})


def test_admin_study_os_routes_are_registered_in_openapi() -> None:
    paths = _paths()

    expected = {
        '/api/admin/study-os/users/search': {'get'},
        '/api/admin/study-os/users/{user_id}/snapshot': {'get'},
        '/api/admin/study-os/users/{user_id}/mission-control': {'get'},
        '/api/admin/study-os/users/{user_id}/adaptation-events': {'get'},
        '/api/admin/study-os/users/{user_id}/plan-ops/preview-draft': {'post'},
        '/api/admin/study-os/users/{user_id}/plan-ops/apply': {'post'},
        '/api/admin/study-os/users/{user_id}/plan-ops/skip-task': {'post'},
        '/api/admin/study-os/users/{user_id}/plan-ops/reset-carry-forward': {'post'},
        '/api/admin/study-os/users/{user_id}/focus/force-close': {'post'},
        '/api/admin/study-os/users/{user_id}/artifacts/notes': {'get'},
        '/api/admin/study-os/users/{user_id}/artifacts/flashcard-decks': {'get'},
        '/api/admin/study-os/users/{user_id}/artifacts/flashcards': {'get'},
        '/api/admin/study-os/users/{user_id}/artifacts/flashcards/{card_id}/srs': {'get'},
        '/api/admin/study-os/users/{user_id}/artifacts/mistakes': {'get'},
        '/api/admin/study-os/users/{user_id}/artifacts/revision': {'get'},
        '/api/admin/study-os/users/{user_id}/artifacts/revision/{item_id}/reschedule': {'post'},
        '/api/admin/study-os/users/{user_id}/artifacts/revision/{item_id}/cancel': {'post'},
        '/api/admin/study-os/users/{user_id}/artifacts/notes/{note_id}/open': {'post'},
        '/api/admin/study-os/users/{user_id}/artifacts/flashcards/{card_id}/open': {'post'},
        '/api/admin/study-os/users/{user_id}/artifacts/mistakes/{mistake_id}/open': {'post'},
        '/api/admin/study-os/mocks/queue': {'get'},
        '/api/admin/study-os/mocks/{mock_id}': {'get'},
        '/api/admin/study-os/mocks/{mock_id}/set-verification-tier': {'post'},
        '/api/admin/study-os/reports/queue': {'get'},
        '/api/admin/study-os/reports/{report_id}': {'get'},
        '/api/admin/study-os/reports/{report_id}/retry': {'post'},
        '/api/admin/study-os/reports/{report_id}/cancel': {'post'},
        '/api/admin/study-os/social/groups': {'get'},
        '/api/admin/study-os/social/groups/{group_id}/members': {'get'},
        '/api/admin/study-os/social/groups/{group_id}/archive': {'post'},
        '/api/admin/study-os/social/groups/{group_id}/transfer-ownership': {'post'},
        '/api/admin/study-os/social/partner-pairs': {'get'},
        '/api/admin/study-os/social/partner-pairs/{pair_id}/dissolve': {'post'},
        '/api/admin/study-os/social/sessions': {'get'},
        '/api/admin/study-os/social/sessions/{session_id}/force-end': {'post'},
        '/api/admin/study-os/social/trust/{user_id}/breakdown': {'get'},
        '/api/admin/study-os/social/trust/{user_id}/recompute': {'post'},
        '/api/admin/study-os/social/leaderboard': {'get'},
        '/api/admin/study-os/social/leaderboard/{entry_id}/hide': {'post'},
        '/api/admin/study-os/social/leaderboard/{entry_id}/restore': {'post'},
        '/api/admin/study-os/social/mentor-feedback': {'get'},
        '/api/admin/study-os/social/mentor-feedback/{feedback_id}/hide': {'post'},
        '/api/admin/study-os/social/mentor-feedback/{feedback_id}/restore': {'post'},
        '/api/admin/study-os/content-access/requests': {'get', 'post'},
        '/api/admin/study-os/content-access/requests/{request_id}/approve': {'post'},
        '/api/admin/study-os/content-access/requests/{request_id}/deny': {'post'},
        '/api/admin/study-os/content-access/requests/{request_id}/open': {'post'},
    }

    missing = []
    wrong_methods = []
    for path, methods in expected.items():
        if path not in paths:
            missing.append(path)
            continue
        actual = {m.lower() for m in paths[path].keys()}
        if not methods.issubset(actual):
            wrong_methods.append((path, sorted(methods), sorted(actual)))

    assert not missing, f'Missing admin study-os routes: {missing}'
    assert not wrong_methods, f'Unexpected method set: {wrong_methods}'


def test_admin_exam_intelligence_cms_routes_are_registered() -> None:
    paths = _paths()

    expected_prefixes = [
        '/api/admin/exam-intelligence-cms/exam-families',
        '/api/admin/exam-intelligence-cms/exams',
        '/api/admin/exam-intelligence-cms/exam-cycles',
        '/api/admin/exam-intelligence-cms/exam-phases',
        '/api/admin/exam-intelligence-cms/syllabus-documents',
        '/api/admin/exam-intelligence-cms/pyq-papers',
        '/api/admin/exam-intelligence-cms/pyq-questions',
        '/api/admin/exam-intelligence-cms/pyq-options',
        '/api/admin/exam-intelligence-cms/exam-topic-coverage',
        '/api/admin/exam-intelligence-cms/policy-updates',
        '/api/admin/exam-intelligence-cms/bulk-import',
    ]

    for prefix in expected_prefixes:
        assert any(p == prefix or p.startswith(prefix + '/') for p in paths), (
            f'No OpenAPI routes found for CMS prefix: {prefix}'
        )
