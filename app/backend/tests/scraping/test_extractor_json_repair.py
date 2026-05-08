import json

from app.scraping.extractor import _extract_json_object


def test_extract_json_object_from_markdown_fence():
    text = "```json\n{\"title\":\"A\"}\n```"
    out = _extract_json_object(text)
    assert out == '{"title":"A"}'
    assert json.loads(out)["title"] == "A"


def test_extract_json_object_returns_none_when_missing_object():
    assert _extract_json_object("not json") is None


def test_extract_json_object_with_extra_prefix_suffix_text():
    text = 'preface text {"title":"A","year":2026} trailing note'
    out = _extract_json_object(text)
    assert out == '{"title":"A","year":2026}'
