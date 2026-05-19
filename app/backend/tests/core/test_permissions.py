"""Tests for ``app.core.permissions`` (PR6 plan §7).

Role mapping coverage:

* ``super_admin`` always passes
* granular ``recruitments.manage`` covers override + promote + reject
* ``admin`` role covers most actions but NOT override_conflict
* unknown action returns False
"""
from __future__ import annotations

from app.core.permissions import (
    ACTION_ACK_BATCH,
    ACTION_OVERRIDE,
    ACTION_PROMOTE,
    ACTION_REJECT,
    ACTION_RUN_RESOLVER,
    RECRUITMENTS_MANAGE,
    SCRAPING_MANAGE,
    SCRAPING_REVIEW,
    user_has_action,
)


def _user(role=None, permissions=None):
    return {"id": "u1", "role": role, "permissions": permissions or []}


# ── super_admin ───────────────────────────────────────────────────────


def test_super_admin_can_perform_every_action():
    user = _user(role="super_admin")
    for action in (
        ACTION_PROMOTE, ACTION_REJECT, ACTION_OVERRIDE,
        ACTION_ACK_BATCH, ACTION_RUN_RESOLVER,
    ):
        assert user_has_action(user, action) is True


# ── admin ────────────────────────────────────────────────────────────


def test_admin_role_covers_most_actions():
    user = _user(role="admin")
    assert user_has_action(user, ACTION_PROMOTE) is True
    assert user_has_action(user, ACTION_REJECT) is True
    assert user_has_action(user, ACTION_RUN_RESOLVER) is True
    assert user_has_action(user, ACTION_ACK_BATCH) is True


def test_admin_role_does_not_cover_override_conflict_without_explicit_permission():
    # Plan §7: override requires recruitments.manage AND admin/super_admin.
    user = _user(role="admin")
    assert user_has_action(user, ACTION_OVERRIDE) is False


def test_admin_with_recruitments_manage_can_override():
    user = _user(role="admin", permissions=[RECRUITMENTS_MANAGE])
    assert user_has_action(user, ACTION_OVERRIDE) is True


# ── granular non-admin users ────────────────────────────────────────


def test_scraping_review_user_can_promote():
    user = _user(role="reviewer", permissions=[SCRAPING_REVIEW])
    assert user_has_action(user, ACTION_PROMOTE) is True


def test_scraping_review_user_cannot_override():
    user = _user(role="reviewer", permissions=[SCRAPING_REVIEW])
    assert user_has_action(user, ACTION_OVERRIDE) is False


def test_scraping_manage_user_can_acknowledge_batch():
    user = _user(role="scraper", permissions=[SCRAPING_MANAGE])
    assert user_has_action(user, ACTION_ACK_BATCH) is True


def test_user_with_no_permissions_cannot_do_anything():
    user = _user(role="user")
    for action in (
        ACTION_PROMOTE, ACTION_REJECT, ACTION_OVERRIDE, ACTION_ACK_BATCH,
    ):
        assert user_has_action(user, action) is False


def test_unknown_action_is_false_for_non_admin():
    user = _user(role="reviewer", permissions=[SCRAPING_REVIEW])
    assert user_has_action(user, "verification.invented_action") is False
