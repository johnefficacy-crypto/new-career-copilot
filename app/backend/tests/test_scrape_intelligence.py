from app.scraping.intelligence import classify_item, duplicate_candidates


def test_private_job_blocked():
    out=classify_item({"source_name":"private jobs portal", "extracted_data":{"title":"MNC private hiring"}})
    assert out["relevance_category"]=="private_job" and out["is_recruitment_relevant"] is False


def test_tender_blocked():
    out=classify_item({"source_name":"gov", "extracted_data":{"title":"Tender notice"}})
    assert out["relevance_category"]=="tender"


def test_government_recruitment_promotable():
    out=classify_item({"source_name":"commission", "extracted_data":{"title":"Recruitment notification"}})
    assert out["is_recruitment_relevant"] is True


def test_duplicate_exact_url_high_score():
    d=duplicate_candidates({"official_notification_url":"https://x.gov/n","title":"ABC Recruitment","year":2026}, [{"id":"r1","name":"ABC Recruitment","year":2026,"official_notification_url":"https://x.gov/n"}])
    assert d and d[0]["score"]>=85
