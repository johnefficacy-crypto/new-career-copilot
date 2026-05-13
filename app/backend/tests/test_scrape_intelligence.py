from app.scraping.intelligence import classify_item, duplicate_candidates


# ── classify_item ───────────────────────────────────────────────────────────


def test_private_job_blocked_when_no_government_context():
    out = classify_item({
        "source_name": "private jobs portal",
        "source_url": "https://privatejobs.example.com/x",
        "extracted_data": {"title": "MNC private hiring"},
    })
    assert out["relevance_category"] == "private_job"
    assert out["is_recruitment_relevant"] is False


def test_private_keyword_not_blocked_on_government_host():
    """Old behaviour false-matched "Private Secretary" on .gov.in pages.

    Now the classifier looks at host + org_type before tagging as
    private_job.
    """
    out = classify_item({
        "source_name": "Lok Sabha Secretariat",
        "source_url": "https://loksabha.gov.in/recruitment/private-secretary",
        "extracted_data": {
            "title": "Private Secretary recruitment 2026",
            "org_type": "State",
        },
    })
    assert out["is_recruitment_relevant"] is True
    assert out["relevance_category"] != "private_job"


def test_walk_in_not_blocked_when_government_org_type():
    out = classify_item({
        "source_name": "RRB",
        "source_url": "https://rrbcdg.gov.in/notices",
        "extracted_data": {
            "title": "Walk-in interview for medical officers",
            "org_type": "Railway",
        },
    })
    assert out["is_recruitment_relevant"] is True


def test_tender_blocked():
    out = classify_item({
        "source_name": "gov",
        "extracted_data": {"title": "Tender notice"},
    })
    assert out["relevance_category"] == "tender"


def test_admit_card_routes_to_lifecycle_event():
    out = classify_item({
        "source_name": "SSC",
        "extracted_data": {"title": "SSC CGL Tier 1 admit card"},
    })
    assert out["lifecycle_event_type"] == "admit_card"
    assert out["relevance_category"] == "admit_card"


def test_date_extended_recognised():
    out = classify_item({
        "source_name": "UPSC",
        "extracted_data": {"title": "Last date extended for CSE 2026"},
    })
    assert out["lifecycle_event_type"] == "date_extended"


def test_government_recruitment_promotable():
    out = classify_item({
        "source_name": "commission",
        "extracted_data": {"title": "Recruitment notification"},
    })
    assert out["is_recruitment_relevant"] is True
    assert out["lifecycle_event_type"] == "new_recruitment"


# ── duplicate_candidates ────────────────────────────────────────────────────


def test_duplicate_exact_url_high_score():
    d = duplicate_candidates(
        {"official_notification_url": "https://x.gov/n", "title": "ABC Recruitment", "year": 2026},
        [{"id": "r1", "name": "ABC Recruitment", "year": 2026, "official_notification_url": "https://x.gov/n"}],
    )
    assert d
    assert d[0]["score"] >= 85
    assert d[0]["recruitment_id"] == "r1"


def test_duplicate_candidates_skip_non_matches():
    """Title alone (no org/year/URL agreement) should not register."""
    d = duplicate_candidates(
        {
            "official_notification_url": "https://a.gov/new",
            "organization_name": "SSC",
            "title": "Combined Graduate Level",
            "year": 2026,
        },
        [{
            "id": "old-other-org",
            "name": "Combined Graduate Level",
            "year": 2026,
            "organizations": {"name": "IBPS"},
        }],
    )
    assert d == []


def test_duplicate_candidates_dedupe_by_recruitment_id():
    """If two existing rows would both match, output is still one row per id."""
    extracted = {
        "official_notification_url": "https://x.gov/n",
        "organization_name": "SSC",
        "title": "ABC Recruitment",
        "year": 2026,
    }
    d = duplicate_candidates(
        extracted,
        [
            {"id": "r1", "name": "ABC Recruitment", "year": 2026, "official_notification_url": "https://x.gov/n", "organizations": {"name": "SSC"}},
            {"id": "r1", "name": "ABC Recruitment", "year": 2026, "official_notification_url": "https://x.gov/n", "organizations": {"name": "SSC"}},
        ],
    )
    assert len(d) == 1
