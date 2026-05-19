"""Permission constants for the admin pipeline.

Plan §7: "PR6 creates permission constants if missing." This module is
the single home — no hardcoded role checks in components.

Role mapping (informational, enforced in routers):

    Setup & Run mode      → sources.manage OR scraping.manage
    Review & Publish mode → scraping.review OR recruitments.manage
    Override conflict     → recruitments.manage AND role in (admin, super_admin)
    Bulk apply            → same permission as underlying action
    Acknowledge batch     → scraping.manage
"""
from __future__ import annotations

# ── Coarse buckets ───────────────────────────────────────────────────

SOURCES_MANAGE      = "sources.manage"
SCRAPING_MANAGE     = "scraping.manage"
SCRAPING_REVIEW     = "scraping.review"
RECRUITMENTS_MANAGE = "recruitments.manage"


# ── Fine-grained admin actions ───────────────────────────────────────
#
# These map onto the bulk/single action endpoints in
# ``admin_verification_reports``. The bulk endpoint enforces the
# underlying single-action permission per row.

ACTION_PROMOTE        = "verification.promote"
ACTION_REJECT         = "verification.reject"
ACTION_OVERRIDE       = "verification.override_conflict"
ACTION_CONFIRM_PROOF  = "verification.confirm_suggested_proof"
ACTION_RUN_RESOLVER   = "verification.run_resolver"
ACTION_ACK_BATCH      = "verification.acknowledge_batch"


# Default action → permission map. Admin (role admin / super_admin)
# inherits everything; granular permissions widen access to non-admin
# users (e.g. a "reviewer" role with only scraping.review).
ACTION_PERMISSIONS: dict[str, set[str]] = {
    ACTION_PROMOTE:       {RECRUITMENTS_MANAGE, SCRAPING_REVIEW},
    ACTION_REJECT:        {RECRUITMENTS_MANAGE, SCRAPING_REVIEW},
    ACTION_OVERRIDE:      {RECRUITMENTS_MANAGE},
    ACTION_CONFIRM_PROOF: {RECRUITMENTS_MANAGE, SCRAPING_REVIEW},
    ACTION_RUN_RESOLVER:  {SCRAPING_MANAGE, SCRAPING_REVIEW},
    ACTION_ACK_BATCH:     {SCRAPING_MANAGE},
}


def user_has_action(user: dict, action: str) -> bool:
    """Return True if ``user`` can perform ``action``.

    ``super_admin`` always passes. ``admin`` passes the bulk-action,
    promote, reject, confirm-proof and run-resolver buckets. Granular
    users need an explicit permission listed in
    :data:`ACTION_PERMISSIONS`.
    """
    if user.get("role") == "super_admin":
        return True
    perms = set(user.get("permissions") or [])
    required = ACTION_PERMISSIONS.get(action, set())
    if perms & required:
        return True
    # Admin shortcut: admin role covers most actions but NOT override_conflict
    # (the plan singles out admin+super_admin AND recruitments.manage there).
    if user.get("role") == "admin" and action != ACTION_OVERRIDE:
        return True
    return False


__all__ = [
    "SOURCES_MANAGE",
    "SCRAPING_MANAGE",
    "SCRAPING_REVIEW",
    "RECRUITMENTS_MANAGE",
    "ACTION_PROMOTE",
    "ACTION_REJECT",
    "ACTION_OVERRIDE",
    "ACTION_CONFIRM_PROOF",
    "ACTION_RUN_RESOLVER",
    "ACTION_ACK_BATCH",
    "ACTION_PERMISSIONS",
    "user_has_action",
]
