from app.scraping.sources import normalize_legacy_source


def test_normalize_legacy_source_target_url():
    src = normalize_legacy_source({"id":"1","name":"SSC","base_url":"https://a","notification_path":"/b"})
    assert src.target_url == "https://a/b"
