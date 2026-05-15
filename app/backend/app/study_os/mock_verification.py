"""Study OS — mock score verification flow (PR 5 + PR 9 + PR 10).

The verification row is created when a user attests a score, and elevated as
evidence comes in. Tiers per spec:

  tier_1   — platform-hosted or provider-API verified
  tier_1_5 — partner attested + screenshot + anomaly check
  tier_2   — screenshot submitted, unverified
  tier_3   — self-reported only

Partner attestation alone is treated as collusion risk → it lands at tier_2
unless `evidence_url` is provided + the partner is not the user themselves.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.mock_verification")


VALID_TIERS = ("tier_1", "tier_1_5", "tier_2", "tier_3")
VALID_ROLES = ("provider", "admin", "mentor", "partner", "self")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("mock_verification supabase call failed: %s", exc)
        return default


def _decide_tier(
    attester_role: str,
    evidence_url: str | None,
    provider_attempt_id: str | None,
) -> str:
    if attester_role == "provider" and provider_attempt_id:
        return "tier_1"
    if attester_role in ("admin", "mentor"):
        return "tier_1"
    if attester_role == "partner" and evidence_url:
        return "tier_1_5"
    if evidence_url:
        return "tier_2"
    return "tier_3"


def attest_mock(
    supabase: Any,
    user_id: str,
    mock_test_id: str,
    attester_role: str,
    attested_by: str | None = None,
    evidence_url: str | None = None,
    provider_name: str | None = None,
    provider_attempt_id: str | None = None,
    verified_score: float | None = None,
    verified_max_score: float | None = None,
) -> dict[str, Any]:
    if attester_role not in VALID_ROLES:
        raise ValueError(f"invalid attester_role: {attester_role!r}")
    if attester_role == "partner" and attested_by == user_id:
        # Spec § "Partner attestation = Tier 1.5 only with screenshot + anomaly check.
        # Partner word alone is collusion risk." — refuse self-as-partner outright.
        raise ValueError("partner attestation cannot come from the score owner")

    tier = _decide_tier(attester_role, evidence_url, provider_attempt_id)
    status = "verified" if tier in ("tier_1", "tier_1_5") else "pending" if evidence_url else "unverified"
    row = {
        "mock_test_id": mock_test_id,
        "user_id": user_id,
        "verification_tier": tier,
        "attester_role": attester_role,
        "attested_by": attested_by,
        "evidence_url": evidence_url,
        "provider_name": provider_name,
        "provider_attempt_id": provider_attempt_id,
        "verification_status": status,
        "verified_score": verified_score,
        "verified_max_score": verified_max_score,
    }
    res = _safe(
        lambda: (
            supabase.table("mock_score_verification")
            .upsert(row, on_conflict="mock_test_id,user_id")
            .execute()
        ),
        default=None,
    )
    data = getattr(res, "data", None) or []
    return data[0] if data else row


def read_verification(
    supabase: Any, user_id: str, mock_test_id: str
) -> dict[str, Any] | None:
    rows = _safe(
        lambda: (
            supabase.table("mock_score_verification")
            .select("*")
            .eq("mock_test_id", mock_test_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    return items[0] if items else None
