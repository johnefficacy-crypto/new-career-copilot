"""Tests for ``app.scraping.verification_hash``.

Hash equality must be stable across noise (whitespace, case, array
order, trailing slashes, date formats). And the canonical hash must
*require* posts — silently allowing the empty case in PR1 would make
corrigendum detection unreliable in PR5.
"""
from __future__ import annotations

import pytest

from app.scraping.verification_hash import (
    build_canonical_snapshot_hash,
    build_source_snapshot_hash,
    normalize_verification_snapshot,
)


# ── normalisation behaviour ────────────────────────────────────────────


def test_whitespace_and_case_do_not_affect_hash():
    a = {"title": "  UPSC Civil Services Exam  ", "organization_name": "Union Public Service Commission"}
    b = {"title": "upsc civil services exam", "organization_name": "UNION PUBLIC SERVICE COMMISSION"}
    assert build_source_snapshot_hash(a) == build_source_snapshot_hash(b)


def test_array_order_does_not_affect_hash():
    a = {"posts": [{"post_name": "Officer"}, {"post_name": "Clerk"}]}
    b = {"posts": [{"post_name": "Clerk"}, {"post_name": "Officer"}]}
    assert build_source_snapshot_hash(a) == build_source_snapshot_hash(b)


def test_date_format_normalises_to_iso():
    iso = {"apply_end_date": "2026-06-30"}
    dmy = {"apply_end_date": "30/06/2026"}
    dotted = {"apply_end_date": "30.06.2026"}
    assert build_source_snapshot_hash(iso) == build_source_snapshot_hash(dmy)
    assert build_source_snapshot_hash(iso) == build_source_snapshot_hash(dotted)


def test_url_trailing_slash_does_not_affect_hash():
    a = {"official_notification_url": "https://upsc.gov.in/notif"}
    b = {"official_notification_url": "https://upsc.gov.in/notif/"}
    assert build_source_snapshot_hash(a) == build_source_snapshot_hash(b)


def test_null_empty_and_absent_fields_hash_identically():
    a = {"title": "UPSC Notif", "notification_number": None}
    b = {"title": "UPSC Notif", "notification_number": ""}
    c = {"title": "UPSC Notif"}
    h = build_source_snapshot_hash(a)
    assert h == build_source_snapshot_hash(b)
    assert h == build_source_snapshot_hash(c)


def test_raw_html_noise_fields_are_ignored():
    # Fields outside the snapshot whitelist (raw_html, css, ads,
    # cdn_wrapper) must not change the hash.
    base = {"title": "UPSC Notif"}
    noisy = dict(base, raw_html="<html>...</html>", ads=[{"impression": 12}], css_hash="abc")
    assert build_source_snapshot_hash(base) == build_source_snapshot_hash(noisy)


def test_substantive_change_produces_different_hash():
    a = {"title": "UPSC Notif", "apply_end_date": "2026-06-30"}
    b = {"title": "UPSC Notif", "apply_end_date": "2026-07-15"}
    assert build_source_snapshot_hash(a) != build_source_snapshot_hash(b)


def test_total_vacancies_normalises_thousands_separator():
    a = {"total_vacancies": 1500}
    b = {"total_vacancies": "1,500"}
    assert build_source_snapshot_hash(a) == build_source_snapshot_hash(b)


# ── snapshot shape ─────────────────────────────────────────────────────


def test_normalize_drops_none_and_empty():
    snap = normalize_verification_snapshot({
        "title": "Title",
        "organization_name": None,
        "official_apply_url": "",
        "posts": [],
    })
    assert "title" in snap
    assert "organization_name" not in snap
    assert "official_apply_url" not in snap
    assert "post_names" not in snap


def test_normalize_rejects_non_dict():
    with pytest.raises(TypeError):
        normalize_verification_snapshot([])  # type: ignore[arg-type]


# ── canonical hash requires posts ─────────────────────────────────────


def test_canonical_hash_requires_posts_argument():
    rec = {"name": "SSC CGL 2026"}
    # The spec is explicit: posts is required, no default. Missing it
    # would be a programming error caught at type-check time too, but
    # we double-check the runtime guard.
    with pytest.raises(TypeError):
        build_canonical_snapshot_hash(rec)  # type: ignore[call-arg]
    with pytest.raises(TypeError):
        build_canonical_snapshot_hash(rec, posts=None)  # type: ignore[arg-type]


def test_canonical_hash_uses_post_names():
    rec = {"name": "SSC CGL 2026"}
    a = build_canonical_snapshot_hash(rec, [{"post_name": "Inspector"}])
    b = build_canonical_snapshot_hash(rec, [{"post_name": "Tax Assistant"}])
    assert a != b


def test_canonical_hash_post_order_irrelevant():
    rec = {"name": "SSC CGL 2026"}
    a = build_canonical_snapshot_hash(rec, [{"post_name": "Inspector"}, {"post_name": "Assistant"}])
    b = build_canonical_snapshot_hash(rec, [{"post_name": "Assistant"}, {"post_name": "Inspector"}])
    assert a == b


def test_source_and_canonical_share_normalisation():
    # Same logical recruitment expressed two ways (extracted-data form
    # and canonical-row form) must produce the same flattened
    # snapshot fingerprint when the post lists match.
    extracted = {
        "title": "SSC CGL 2026",
        "organization_name": "Staff Selection Commission",
        "apply_end_date": "30/06/2026",
        "posts": [{"post_name": "Inspector"}],
    }
    recruitment = {
        "name": "SSC CGL 2026",
        "organization_name": "Staff Selection Commission",
        "apply_end_date": "2026-06-30",
    }
    posts = [{"post_name": "Inspector"}]
    assert build_source_snapshot_hash(extracted) == build_canonical_snapshot_hash(recruitment, posts)
