from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ScrapeSource:
    id: str
    name: str
    base_url: str
    notification_path: str

    @property
    def target_url(self) -> str:
        return f"{self.base_url or ''}{self.notification_path or ''}"


def normalize_legacy_source(row: dict) -> ScrapeSource:
    return ScrapeSource(
        id=str(row.get("id") or ""),
        name=str(row.get("name") or ""),
        base_url=str(row.get("base_url") or ""),
        notification_path=str(row.get("notification_path") or ""),
    )
