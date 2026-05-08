from app.scraping.dedup import fuzzy_duplicate


def test_fuzzy_duplicate_true_for_similar_titles():
    assert fuzzy_duplicate("SSC CGL Recruitment 2026", "SSC CGL Recruitment 2026 Notification")


def test_fuzzy_duplicate_false_for_different_titles():
    assert not fuzzy_duplicate("SSC CGL", "IBPS PO")
