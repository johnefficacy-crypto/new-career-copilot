from __future__ import annotations


def deadline_priority(days_left: int | None) -> int:
    if days_left is None:
        return 0
    if days_left < 0:
        return -100
    if days_left <= 1:
        return 100
    if days_left <= 3:
        return 80
    if days_left <= 7:
        return 50
    return 10
