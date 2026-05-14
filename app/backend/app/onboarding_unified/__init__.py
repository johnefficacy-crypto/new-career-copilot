"""Unified guided onboarding engine (Sprint 1).

One session engine, two entry modes:

* **CTA / funnel** — user arrives from ``/go/:intent/:recruitmentSlug/:postSlug``.
  Intent is known; recruitment/post may be known. Verified
  ``recruitment_question_requirements`` drive the question list.
* **Cold / discovery** — user arrives from the homepage with no intent.
  The first question is a fixed intent picker; once intent is known the
  engine continues with the existing ``persona_question_bank``.

Both modes share the same ``onboarding_sessions`` row, the same
``onboarding_session_answers`` log, the same deterministic question
selector, the same answer validator, and the same anonymous-id
persistence + stitching path.

Hard rules (see the sprint brief):
  * The backend chooses the next valid question; the deterministic
    eligibility engine — not this module, not AI — decides eligibility.
  * Answers are validated with deterministic, allowlisted parsers only.
  * ``onboarding_session_answers`` is a log/signal store, never canonical
    profile truth — canonical writes go through the profile adapter.
"""
from __future__ import annotations

MAX_QUESTIONS_PER_SESSION = 7

QUESTION_SOURCES = (
    "intent_picker",
    "persona_question_bank",
    "recruitment_question_requirements",
)
