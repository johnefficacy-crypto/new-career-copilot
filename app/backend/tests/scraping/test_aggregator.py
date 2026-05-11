from app.scraping.aggregator import (
    discover_aggregator_detail_urls,
    is_aggregator_source,
    mock_aggregator_detail_urls,
)
from app.scraping.sources import normalize_source_registry


def test_discover_aggregator_detail_urls_filters_listing_noise():
    html = """
      <a href="/government-jobs/">Government Jobs</a>
      <a href="/exam-results/">Results</a>
      <a href="/ssc-cgl-2026-recruitment/">SSC CGL 2026 Recruitment</a>
      <a href="https://www.freejobalert.com/bank-vacancy-2026/">Bank Vacancy 2026</a>
      <a href="https://external.example/recruitment/">External Recruitment</a>
      <a href="/ssc-cgl-2026-recruitment/#comments">Duplicate fragment</a>
    """
    urls = discover_aggregator_detail_urls("".join(html), "https://www.freejobalert.com/government-jobs/", max_items=10)
    assert urls == [
        "https://www.freejobalert.com/ssc-cgl-2026-recruitment/",
        "https://www.freejobalert.com/bank-vacancy-2026/",
    ]


def test_aggregator_detection_and_mock_urls():
    row = {
        "id": "s1",
        "source_name": "Free Job Alert",
        "source_type": "aggregator",
        "source_url": "https://www.freejobalert.com/government-jobs/",
    }
    assert is_aggregator_source(row)
    source = normalize_source_registry(row)
    assert mock_aggregator_detail_urls(source, count=2) == [
        "https://www.freejobalert.com/government-jobs/mock-recruitment-1/",
        "https://www.freejobalert.com/government-jobs/mock-recruitment-2/",
    ]
