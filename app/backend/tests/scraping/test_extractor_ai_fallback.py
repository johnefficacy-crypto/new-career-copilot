import builtins

from app.scraping import extractor


def test_missing_anthropic_key_uses_deterministic_extraction(monkeypatch, caplog):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    out = extractor.extract_recruitment_data("Recruitment notice", "https://example.gov/notice", "Example", mock=False)

    assert out is not None
    assert out["provider"] == "deterministic_no_ai"
    assert "AI extraction disabled" in caplog.text


def test_missing_anthropic_package_uses_deterministic_extraction(monkeypatch, caplog):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "real-looking-key")
    real_import = builtins.__import__

    def guarded_import(name, *args, **kwargs):
        if name == "anthropic":
            raise ImportError("not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", guarded_import)

    out = extractor.extract_recruitment_data("Recruitment notice", "https://example.gov/notice", "Example", mock=False)

    assert out is not None
    assert out["provider"] == "deterministic_no_anthropic_sdk"
    assert "anthropic SDK not installed" in caplog.text
