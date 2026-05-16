"""Auto-create draft ``source_registry`` rows for hosts that show up in
scraped recruitments but aren't yet registered.

Two entry points:

* :func:`extract_candidate_hosts` — pure: scan a queue item's extracted
  payload and pull every hostname from the official-URL fields. No DB
  access, easy to unit-test.
* :func:`upsert_draft_sources` — idempotent: take a list of hosts and a
  supabase client, look up each host in ``source_registry`` (by
  ``official_url`` host match), and insert a draft row for any host that
  isn't there. Returns the list of newly created + already-existing rows
  so callers can compose a refreshed UI listing.

Drafts are written with a deliberately weak trust shape so they CANNOT
become canonical proof until an admin explicitly verifies them via the
existing ``/admin/sources/{id}/verify`` flow:

* ``is_verified = False``
* ``verification_status = 'needs_review'``
* ``discovery_only = False`` (these are *candidate* official hosts; the
  aggregator path keeps its ``discovery_only=True`` shape via the
  existing ``_source_payload`` helper)
* ``source_type = 'official_html'`` (best guess; admin can correct)
* ``trust_tier = 'unknown'``
* ``notes`` records the queue_id + extracted URL that surfaced this host

The goal: surface NEW hosts the moment they appear in scraped data,
without making them trustworthy. The admin's verify step is what
promotes a draft into a usable official source.
"""
from __future__ import annotations

from typing import Any, Iterable
from urllib.parse import urlparse

# Top-level fields on extracted_data that may carry an official URL.
_OFFICIAL_URL_FIELDS = (
    "official_notification_url",
    "official_apply_url",
    "source_pdf_url",
    "notification_url",
)

# Hosts that should never become draft sources — global aggregator
# / generic CDN hosts that periodically appear in scraped payloads.
# Conservative list; expand as false positives show up.
_AGGREGATOR_HOSTS: frozenset[str] = frozenset({
    "sarkariresult.com", "www.sarkariresult.com",
    "freejobalert.com", "www.freejobalert.com",
    "sarkariexam.com", "www.sarkariexam.com",
    "jagranjosh.com", "www.jagranjosh.com",
    "shiksha.com", "www.shiksha.com",
})


def _host_of(url: str | None) -> str | None:
    if not url or not isinstance(url, str):
        return None
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return None
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return None
    return host


def _is_likely_aggregator(host: str) -> bool:
    if host in _AGGREGATOR_HOSTS:
        return True
    # ``sarkari``/``freejob``/``jobalert`` substring heuristic for
    # common aggregator brand patterns.
    needles = ("sarkari", "freejob", "jobalert")
    return any(n in host for n in needles)


def extract_candidate_hosts(extracted_data: dict[str, Any] | None) -> list[tuple[str, str]]:
    """Return ``[(host, source_url), …]`` of unique candidate hosts.

    Skips empty values, aggregator-looking hosts (those should stay on
    the aggregator path), and duplicates. The accompanying source_url
    is the original URL the host was extracted from — useful for the
    draft row's ``notes`` so an admin can trace provenance.
    """
    if not isinstance(extracted_data, dict):
        return []
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for field in _OFFICIAL_URL_FIELDS:
        url = extracted_data.get(field)
        host = _host_of(url)
        if not host or host in seen:
            continue
        if _is_likely_aggregator(host):
            continue
        seen.add(host)
        out.append((host, str(url)))
    return out


def _draft_payload(host: str, source_url: str, *, queue_id: str | None) -> dict[str, Any]:
    """Build the insert payload for a single host."""
    parsed = urlparse(source_url)
    scheme = parsed.scheme or "https"
    canonical_official = f"{scheme}://{host}/"
    return {
        # Display name defaults to the host; admin renames during verify.
        "source_name": host,
        "official_url": canonical_official,
        "source_type": "official_html",
        "is_active": True,
        "is_verified": False,
        "verification_status": "needs_review",
        "discovery_only": False,
        "is_official_source": False,
        "can_publish_directly": False,
        "requires_official_confirmation": False,
        "trust_tier": "unknown",
        "tier": 3,
        "notes": _notes(host, source_url, queue_id=queue_id),
    }


def _notes(host: str, source_url: str, *, queue_id: str | None) -> str:
    parts = [f"auto-draft from scraped url: {source_url}"]
    if queue_id:
        parts.append(f"queue_id={queue_id}")
    parts.append("verify or correct source_type before treating as canonical.")
    return " · ".join(parts)


def _existing_by_official_url(supabase, urls: Iterable[str]) -> dict[str, dict[str, Any]]:
    """Look up source_registry rows whose ``official_url`` matches any of
    the given canonical URLs. Returns a dict keyed by official_url."""
    out: dict[str, dict[str, Any]] = {}
    urls_list = sorted({u for u in urls if u})
    if not urls_list:
        return out
    try:
        rows = (
            supabase.table("source_registry")
            .select("id, source_name, official_url, source_type, is_verified, verification_status, discovery_only, is_active")
            .in_("official_url", urls_list)
            .execute()
            .data
            or []
        )
    except Exception:
        return out
    for r in rows:
        u = r.get("official_url")
        if u:
            out[u] = r
    return out


def _existing_by_host(supabase, hosts: Iterable[str]) -> dict[str, dict[str, Any]]:
    """Secondary lookup: source_registry has rows whose ``official_url``
    is a deep page on the host (e.g. ``https://upsc.gov.in/notifications``).
    Pull every row and host-match in Python — the registry is small
    enough (sub-1k rows) that this is fine."""
    hostset = {h for h in hosts if h}
    if not hostset:
        return {}
    try:
        rows = (
            supabase.table("source_registry")
            .select("id, source_name, official_url, source_type, is_verified, verification_status")
            .execute()
            .data
            or []
        )
    except Exception:
        return {}
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        host = _host_of(r.get("official_url"))
        if host and host in hostset and host not in out:
            out[host] = r
    return out


def upsert_draft_sources(
    supabase,
    candidates: list[tuple[str, str]],
    *,
    queue_id: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Insert a draft row for every host in ``candidates`` that doesn't
    already exist in ``source_registry``.

    Returns ``{"created": [...], "existing": [...]}``. Both lists contain
    the supabase row shape so callers can update their in-memory source
    listing without a follow-up fetch.
    """
    if not candidates:
        return {"created": [], "existing": []}

    hosts = [host for host, _ in candidates]
    existing_by_host = _existing_by_host(supabase, hosts)

    created: list[dict[str, Any]] = []
    existing: list[dict[str, Any]] = []
    for host, source_url in candidates:
        match = existing_by_host.get(host)
        if match is not None:
            existing.append(match)
            continue
        payload = _draft_payload(host, source_url, queue_id=queue_id)
        try:
            res = (
                supabase.table("source_registry")
                .insert(payload)
                .execute()
                .data
                or []
            )
        except Exception:
            # Hard fail on a single host shouldn't kill the whole batch.
            # Caller's audit logger will note the absence.
            continue
        if res:
            row = res[0]
            created.append(row)
            existing_by_host[host] = row  # so a follow-up in the same call sees it
    return {"created": created, "existing": existing}
