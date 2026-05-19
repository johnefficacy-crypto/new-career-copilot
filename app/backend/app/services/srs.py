"""Spaced-repetition (SM-2-lite) scheduler.

Shared between flashcards, mistake-book reviews, and the revision calendar
so that all three surfaces apply the same interval math. The algorithm is a
trimmed SM-2 — good enough for an MVP, easy to reason about, and avoids
us having to ship a heavyweight SRS dependency.

Rating contract (0-5, Anki-style):
  0 — total blackout              -> reset, due tomorrow
  1 — wrong, recognized answer    -> reset, due tomorrow
  2 — wrong, but easy in hindsight-> reset, due tomorrow
  3 — correct, painful            -> keep interval, ease down
  4 — correct, hesitation         -> next interval, ease steady
  5 — correct, instant            -> next interval, ease up
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


MIN_EASE = 1.30
DEFAULT_EASE = 2.50
FIRST_INTERVAL = 1
SECOND_INTERVAL = 6


@dataclass
class SrsState:
    ease: float
    interval_days: int
    repetitions: int
    lapses: int
    due_at: datetime

    def to_dict(self) -> dict:
        return {
            "ease": round(self.ease, 2),
            "interval_days": int(self.interval_days),
            "repetitions": int(self.repetitions),
            "lapses": int(self.lapses),
            "due_at": self.due_at.isoformat(),
        }


def schedule(
    *,
    rating: int,
    ease: float = DEFAULT_EASE,
    interval_days: int = 0,
    repetitions: int = 0,
    lapses: int = 0,
    now: datetime | None = None,
) -> SrsState:
    """Compute the next SRS state given a rating."""
    if rating < 0 or rating > 5:
        raise ValueError(f"rating must be 0..5, got {rating}")
    now = now or datetime.now(timezone.utc)
    ease = max(MIN_EASE, float(ease or DEFAULT_EASE))

    if rating < 3:
        # Lapse: reset repetitions, tomorrow.
        return SrsState(
            ease=max(MIN_EASE, ease - 0.20),
            interval_days=FIRST_INTERVAL,
            repetitions=0,
            lapses=lapses + 1,
            due_at=now + timedelta(days=FIRST_INTERVAL),
        )

    new_reps = repetitions + 1
    if new_reps == 1:
        new_interval = FIRST_INTERVAL
    elif new_reps == 2:
        new_interval = SECOND_INTERVAL
    else:
        new_interval = max(1, int(round(interval_days * ease)))

    new_ease = ease + (0.10 if rating == 5 else 0.0) - (0.15 if rating == 3 else 0.0)
    new_ease = max(MIN_EASE, new_ease)

    return SrsState(
        ease=new_ease,
        interval_days=new_interval,
        repetitions=new_reps,
        lapses=lapses,
        due_at=now + timedelta(days=new_interval),
    )
