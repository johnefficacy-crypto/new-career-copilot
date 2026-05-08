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
