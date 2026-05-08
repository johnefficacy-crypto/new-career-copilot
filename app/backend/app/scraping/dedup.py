from __future__ import annotations

from difflib import SequenceMatcher


def fuzzy_duplicate(title_a: str, title_b: str, *, threshold: float = 0.8) -> bool:
    a = (title_a or "").strip().lower()
    b = (title_b or "").strip().lower()
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    return SequenceMatcher(None, a, b).ratio() >= threshold
