from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urljoin


@dataclass
class ScrapeSource:
    id: str
    name: str
    base_url: str
    notification_path: str

    @property
    def target_url(self) -> str:
        if self.notification_path:
            return urljoin(self.base_url or "", self.notification_path)
        return self.base_url or ""


def normalize_legacy_source(row: dict) -> ScrapeSource:
    return ScrapeSource(
        id=str(row.get("id") or ""),
        name=str(row.get("name") or ""),
        base_url=str(row.get("base_url") or ""),
        notification_path=str(row.get("notification_path") or ""),
    )


def normalize_source_registry(row: dict) -> ScrapeSource:
    source_url = row.get("source_url") or row.get("notification_url") or row.get("official_url") or ""
    return ScrapeSource(
        id=str(row.get("id") or ""),
        name=str(row.get("source_name") or row.get("name") or source_url),
        base_url=str(source_url or ""),
        notification_path="",
    )
