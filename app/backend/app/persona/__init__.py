"""Internal Aspirant Persona v1 layer.

PR1 foundation: deterministic, rule-based persona snapshot derived from
profile + onboarding + study signals. Persona is internal and is never
surfaced to the user as an identity label.

Public surface:
    classify_persona(signals)              -> persona dict
    derive_study_policy(dimensions)        -> study policy dict
    collect_user_signals(supabase, user_id) -> normalized signal dict
    compute_persona_snapshot(supabase, user_id, reason)
    get_latest_persona_snapshot(supabase, user_id)
    save_persona_snapshot(supabase, snapshot)
    enqueue_persona_recompute(supabase, user_id, reason)
    process_pending_persona_recompute(supabase, limit=25)

No AI is used in PR1.
"""

PERSONA_VERSION = "v1"

from app.persona.classifier import classify_persona  # noqa: E402,F401
from app.persona.queue import (  # noqa: E402,F401
    enqueue_persona_recompute,
    process_pending_persona_recompute,
)
from app.persona.signals import collect_user_signals  # noqa: E402,F401
from app.persona.snapshots import (  # noqa: E402,F401
    compute_persona_snapshot,
    get_latest_persona_snapshot,
    save_persona_snapshot,
)
from app.persona.study_policy import derive_study_policy  # noqa: E402,F401

__all__ = [
    "PERSONA_VERSION",
    "classify_persona",
    "collect_user_signals",
    "compute_persona_snapshot",
    "derive_study_policy",
    "enqueue_persona_recompute",
    "get_latest_persona_snapshot",
    "process_pending_persona_recompute",
    "save_persona_snapshot",
]
