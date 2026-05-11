import pytest

from app.core.errors import DatabaseError, PromotionError
from app.scraping.runner import promote_to_recruitments, run_scraping_pass
from app.scraping.schemas import ExtractedRecruitment

class E:
    def __init__(self,data): self.data=data
class Q:
    def __init__(self,name,db): self.name=name; self.db=db; self.filters={}
    def select(self,*a,**k): return self
    def eq(self,k,v): self.filters[k]=v; return self
    def limit(self,*a,**k): return self
    def upsert(self,p,**k): raise AssertionError("promotion should not require organizations.upsert")
    def insert(self,p):
        self.p=p
        rows=self.db.setdefault(self.name,[])
        rows.append({**p,"id":f"{self.name}-{len(rows) + 1}"})
        return self
    def execute(self):
        if self.name=="organizations":
            rows=list(self.db.get(self.name,[]))
            if "name" in self.filters:
                rows=[r for r in rows if r.get("name")==self.filters["name"]]
            return E(rows)
        return E(self.db.get(self.name,[]))
class SB:
    def __init__(self): self.db={}
    def table(self,name): return Q(name,self.db)


class RunnerQuery:
    def __init__(self, name, db, calls):
        self.name = name
        self.db = db
        self.calls = calls
        self.payload = None
        self.filters = {}

    @property
    def not_(self):
        return self

    def select(self, *args, **kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def in_(self, key, values):
        self.filters[key] = set(values)
        return self

    def order(self, *args, **kwargs):
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def execute(self):
        self.calls.append(self.name)
        if self.name == "scrape_runs":
            if self.payload and "started_at" in self.payload:
                row = {**self.payload, "id": "run-1"}
                self.db.setdefault("scrape_runs", []).append(row)
                return E([row])
            self.db.setdefault("scrape_runs_updates", []).append(self.payload)
            return E([self.payload])
        if self.name == "source_registry":
            if self.payload:
                self.db.setdefault("source_registry_updates", []).append(self.payload)
                return E([self.payload])
            rows = list(self.db.get("source_registry", []))
            if "is_active" in self.filters:
                rows = [r for r in rows if r.get("is_active") == self.filters["is_active"]]
            if "id" in self.filters:
                rows = [r for r in rows if r.get("id") in self.filters["id"]]
            return E(rows)
        if self.name == "recruitments":
            return E([])
        if self.name == "scrape_queue":
            if self.payload:
                row = {**self.payload, "id": "queue-1"}
                self.db.setdefault("scrape_queue", []).append(row)
                return E([row])
            return E([])
        if self.name == "notification_documents":
            if self.payload:
                row = {**self.payload, "id": f"doc-{len(self.db.get('notification_documents', [])) + 1}"}
                self.db.setdefault("notification_documents", []).append(row)
                return E([row])
            rows = list(self.db.get("notification_documents", []))
            if "content_hash" in self.filters:
                rows = [r for r in rows if r.get("content_hash") == self.filters["content_hash"]]
            return E(rows)
        return E([])


class RunnerSB:
    def __init__(self):
        self.calls = []
        self.db = {
            "source_registry": [
                {
                    "id": "src-1",
                    "source_name": "Free Job Alert",
                    "source_type": "aggregator",
                    "source_url": "https://www.freejobalert.com/government-jobs/",
                    "is_active": True,
                    "requires_official_confirmation": True,
                }
            ]
        }

    def table(self, name):
        return RunnerQuery(name, self.db, self.calls)


def test_run_scraping_pass_reads_source_registry():
    sb = RunnerSB()
    out = run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    assert out["sources_checked"] == 1
    assert out["items_found"] == 3
    assert "scrape_sources" not in sb.calls
    assert sb.db["scrape_queue"][0]["source_id"] == "src-1"
    assert sb.db["scrape_queue"][0]["source_url"].endswith("/mock-recruitment-1/")
    assert sb.db["scrape_queue"][0]["evidence_required"] is True
    assert sb.db["scrape_queue"][0]["notification_document_id"] == "doc-1"
    assert len(sb.db["notification_documents"]) == 3
    assert sb.db["notification_documents"][0]["file_url"] == sb.db["notification_documents"][0]["source_url"]

def test_live_scraping_pass_creates_review_queue_without_promotion(monkeypatch):
    sb = RunnerSB()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setattr("app.scraping.runner.fetch_page_html", lambda _url: '<a href="/recruitment-one/">Recruitment one</a><a href="/recruitment-two/">Recruitment two</a>')
    monkeypatch.setattr("app.scraping.runner.fetch_page_text", lambda url: f"Recruitment notice for {url}")

    out = run_scraping_pass(sb, source_ids=["src-1"], limit=2, mock=False)

    assert out["items_found"] == 2
    assert "recruitments" not in sb.db
    assert all(row["status"] in {"pending", "duplicate"} for row in sb.db["scrape_queue"])
    assert sb.db["scrape_queue"][0]["evidence_required"] is True
    assert sb.db["scrape_queue"][0]["official_source_resolved"] is False
    assert sb.db["scrape_queue"][0]["extraction_provider"] == "deterministic_no_ai"

def test_promote_generates_slug_without_nameerror():
    sb=SB()
    data=ExtractedRecruitment(title="SSC CGL", organization_name="SSC", org_type="central", year=2026, notification_date="2026-01-01", apply_start_date="2026-01-02", apply_end_date="2026-01-03", official_notification_url="https://x", official_apply_url="https://x/apply", source_pdf_url=None, posts=[])
    rec_id=promote_to_recruitments(data, sb, source_id="src-1")
    assert rec_id=="recruitments-1"
    assert sb.db["recruitments"][0]["slug"]=="ssc-cgl-2026"
    assert sb.db["recruitments"][0]["official_apply_url"]=="https://x/apply"
    assert sb.db["recruitments"][0]["source_id"]=="src-1"
    assert sb.db["organizations"][0]["name"]=="SSC"


def test_promote_reuses_existing_organization_without_name_unique_constraint():
    sb=SB()
    sb.db["organizations"]=[{"id":"org-existing","name":"SSC","type":"central"}]
    data=ExtractedRecruitment(title="SSC CHSL", organization_name="SSC", org_type="central", year=2026, notification_date="2026-01-01", apply_start_date="2026-01-02", apply_end_date="2026-01-03", official_notification_url="https://x", posts=[])
    promote_to_recruitments(data, sb)
    assert len(sb.db["organizations"]) == 1
    assert sb.db["recruitments"][0]["organization_id"] == "org-existing"


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


def test_promote_creates_organization_recruitment_posts_and_criteria():
    sb = SB()
    data = ExtractedRecruitment(
        title="Golden Recruitment",
        organization_name="Golden Org",
        org_type="central",
        year=2026,
        notification_date="2026-01-01",
        apply_start_date="2026-01-02",
        apply_end_date="2026-01-31",
        official_notification_url="https://example.gov/notice",
        official_apply_url="https://example.gov/apply",
        source_pdf_url=None,
        posts=[
            {
                "post_name": "Inspector",
                "group_type": "B",
                "pay_level": "7",
                "min_age": 18,
                "max_age": 32,
                "education_required": "Bachelor's degree from a recognised university",
            },
            {
                "post_name": "Junior Assistant",
                "group_type": "C",
                "pay_level": "2",
                "min_age": 18,
                "max_age": 27,
                "education_required": "12th pass / Senior Secondary",
            },
        ],
    )

    rec_id = promote_to_recruitments(data, sb)

    assert rec_id == "recruitments-1"
    assert sb.db["organizations"][0]["name"] == "Golden Org"
    assert sb.db["recruitments"][0]["publish_status"] == "needs_review"
    assert len(sb.db["posts"]) == 2
    assert [r["max_age"] for r in sb.db["age_criteria"]] == [32, 27]
    assert [r["min_qualification_level"] for r in sb.db["education_criteria"]] == ["graduate", "12th"]


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
