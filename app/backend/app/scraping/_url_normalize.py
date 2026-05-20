"""Pure URL normalisation for dedup key comparison.

One function, ``normalize_url``. Deliberately narrow + deterministic so
both sides of a dedup comparison reduce to the same string. Rules are
pinned by the test suite — do not extend without updating the tests.
"""
from __future__ import annotations

from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

__all__ = ["normalize_url"]


def normalize_url(url: str | None) -> str:
    """Canonicalise ``url`` for equality comparison.

    * lowercase scheme + host;
    * http and https are equivalent → output canonicalises to ``https``;
    * strip default ports (:80, :443);
    * strip a leading ``www.`` from the host;
    * drop a trailing slash from the path UNLESS the path is exactly ``/``;
    * drop the fragment (``#...``);
    * sort query params alphabetically by key; drop empty-valued params;
    * decode safe percent-encoding (``%2F`` → ``/``);
    * leave path case AS-IS (servers may be case-sensitive);
    * return ``""`` for None / empty / unparseable input (never raises).
    """
    if not url or not isinstance(url, str):
        return ""
    raw = url.strip()
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
    except (ValueError, TypeError):
        return ""

    scheme = (parts.scheme or "").lower()
    # Only normalise things that look like real web URLs. Anything without
    # a scheme+host (e.g. "not a url") is unparseable for our purposes.
    if scheme not in ("http", "https"):
        return ""
    if not parts.netloc:
        return ""

    # http/https are equivalent → canonicalise to https.
    scheme = "https"

    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return ""
    # Strip default ports; keep any non-default port.
    port = parts.port
    netloc = host
    if port is not None and port not in (80, 443):
        netloc = f"{host}:{port}"

    # Path: decode safe percent-encoding, then trim a trailing slash unless
    # the whole path is just "/".
    path = unquote(parts.path or "")
    if path and path != "/":
        path = path.rstrip("/")
    if not path:
        path = ""

    # Query: drop empties, sort by key (then value for stable order).
    pairs = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=False) if v != ""]
    pairs.sort(key=lambda kv: (kv[0], kv[1]))
    query = urlencode(pairs)

    # Fragment dropped entirely.
    return urlunsplit((scheme, netloc, path, query, ""))
