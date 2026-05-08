from __future__ import annotations

import re


def slugify(value: str | None, *, max_length: int = 80, fallback: str = "recruitment") -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    if max_length > 0:
        base = base[:max_length]
    return base or fallback
