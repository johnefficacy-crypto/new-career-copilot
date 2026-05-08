from app.scraping.normalizer import normalize_recruitment
from app.scraping.schemas import ExtractedRecruitment


def test_normalizer_scores_missing_fields():
    rec = ExtractedRecruitment(title="T", organization_name="Org", org_type="SSC", year=2026, official_notification_url="https://x", posts=[])
    out = normalize_recruitment(rec)
    assert out.data_quality_score < 1.0
    assert "missing_posts" in out.warnings
