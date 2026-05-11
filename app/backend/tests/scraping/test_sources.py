from app.scraping.sources import normalize_legacy_source, normalize_source_registry


def test_normalize_legacy_source_target_url():
    src = normalize_legacy_source({"id":"1","name":"SSC","base_url":"https://a","notification_path":"/b"})
    assert src.target_url == "https://a/b"


def test_normalize_source_registry_prefers_source_url():
    src = normalize_source_registry(
        {
            "id": "s1",
            "source_name": "Free Job Alert",
            "source_url": "https://www.freejobalert.com/government-jobs/",
            "notification_url": "https://ignored.example/jobs",
            "official_url": "https://ignored.example",
        }
    )
    assert src.id == "s1"
    assert src.name == "Free Job Alert"
    assert src.target_url == "https://www.freejobalert.com/government-jobs/"
