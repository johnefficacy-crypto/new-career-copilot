from __future__ import annotations


class InvalidTransition(ValueError):
    pass


def transition(current: str, event: str, transitions: dict[str, dict[str, str]]) -> str:
    try:
        return transitions[current][event]
    except KeyError as exc:
        raise InvalidTransition(f"Invalid transition: {current} + {event}") from exc
