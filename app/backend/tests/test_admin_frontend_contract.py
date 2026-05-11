from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_scrape_monitor_uses_compact_rows_and_detail_drawer():
    src = (ROOT / "frontend" / "src" / "pages" / "admin" / "Scraper.jsx").read_text(encoding="utf-8")

    assert "table-fixed" in src
    assert "QueueDetailDrawer" in src
    assert "max-h-80 overflow-auto" in src
    assert "View raw HTML" in src
    assert "<details" not in src.split("<tbody>", 1)[-1].split("</tbody>", 1)[0]


def test_source_registry_form_submits_source_type_and_configs():
    src = (ROOT / "frontend" / "src" / "pages" / "admin" / "Sources.jsx").read_text(encoding="utf-8")

    assert "source_type: form.source_type" in src
    assert "scrape_config" in src
    assert "trust_config" in src
    assert "adapter_config" in src
    assert "Aggregator sources are discovery-only" in src
