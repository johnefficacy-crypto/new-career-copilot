import pytest

from app.core.errors import DatabaseError, PromotionError
from app.scraping.runner import promote_to_recruitments
from app.scraping.schemas import ExtractedRecruitment

class E:
    def __init__(self,data): self.data=data
class Q:
    def __init__(self,name,db): self.name=name; self.db=db
    def upsert(self,p,**k): self.p=p; return self
    def insert(self,p): self.p=p; self.db.setdefault(self.name,[]).append({**p,"id":f"{self.name}-1"}); return self
    def execute(self):
        if self.name=="organizations": return E([{"id":"org-1"}])
        return E(self.db.get(self.name,[]))
class SB:
    def __init__(self): self.db={}
    def table(self,name): return Q(name,self.db)

def test_promote_generates_slug_without_nameerror():
    sb=SB()
    data=ExtractedRecruitment(title="SSC CGL", organization_name="SSC", org_type="central", year=2026, notification_date="2026-01-01", apply_start_date="2026-01-02", apply_end_date="2026-01-03", official_notification_url="https://x", source_pdf_url=None, posts=[])
    rec_id=promote_to_recruitments(data, sb)
    assert rec_id=="recruitments-1"
    assert sb.db["recruitments"][0]["slug"]=="ssc-cgl-2026"


def test_promote_creates_recruitment_unit_for_unitwise_post():
    sb=SB()
    data=ExtractedRecruitment(
        title="Multi Unit",
        organization_name="Parent",
        org_type="central",
        year=2026,
        notification_date="2026-01-01",
        apply_start_date="2026-01-02",
        apply_end_date="2026-01-03",
        official_notification_url="https://x",
        source_pdf_url=None,
        posts=[{"post_name":"A","unit_code":"U1","unit_name":"Unit One","unit_location_state":"Delhi","language_requirements":["hindi"]}],
    )
    promote_to_recruitments(data, sb)
    assert sb.db["recruitment_units"][0]["unit_code"] == "U1"
    assert sb.db["posts"][0]["recruitment_unit_id"] == "recruitment_units-1"
    assert sb.db["posts"][0]["language_requirements"] == ["hindi"]


def test_promote_raises_when_post_insert_returns_no_rows():
    class SBPostFail(SB):
        def table(self, name):
            q = Q(name, self.db)
            if name == "posts":
                class QPost(Q):
                    def insert(self, p): self.p = p; return self
                    def execute(self): return E([])
                return QPost(name, self.db)
            return q
    sb = SBPostFail()
    data = ExtractedRecruitment(title="SSC CGL", organization_name="SSC", org_type="central", year=2026, notification_date="2026-01-01", apply_start_date="2026-01-02", apply_end_date="2026-01-03", official_notification_url="https://x", source_pdf_url=None, posts=[{"post_name":"A"}])
    with pytest.raises(PromotionError):
        promote_to_recruitments(data, sb)


def test_promote_raises_when_age_criteria_insert_fails():
    class SBAgeFail(SB):
        def table(self, name):
            if name == "age_criteria":
                class QAge(Q):
                    def insert(self, p): raise RuntimeError("age fail")
                return QAge(name, self.db)
            return Q(name, self.db)
    sb = SBAgeFail()
    data = ExtractedRecruitment(title="SSC CGL", organization_name="SSC", org_type="central", year=2026, notification_date="2026-01-01", apply_start_date="2026-01-02", apply_end_date="2026-01-03", official_notification_url="https://x", source_pdf_url=None, posts=[{"post_name":"A","min_age":18}])
    with pytest.raises(DatabaseError):
        promote_to_recruitments(data, sb)
