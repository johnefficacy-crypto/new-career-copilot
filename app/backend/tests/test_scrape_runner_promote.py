import pytest

from app.core.errors import DatabaseError, PromotionError
from app.scraping.runner import promote_run, promote_to_recruitments, run_scraping_pass
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

    def limit(self, *args, **kwargs):
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
            return E(list(self.db.get("recruitments", [])))
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


def test_promote_uses_post_age_cutoff_when_present():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "A", "min_age": 18, "max_age": 32, "age_cutoff_date": "2026-08-01"}],
    )
    promote_to_recruitments(data, sb)
    assert sb.db["age_criteria"][0]["cutoff_date"] == "2026-08-01"


def test_promote_falls_back_to_apply_end_date_when_post_cutoff_missing():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "A", "min_age": 18, "max_age": 32}],
    )
    promote_to_recruitments(data, sb)
    assert sb.db["age_criteria"][0]["cutoff_date"] == "2026-12-31"


def test_promote_writes_raw_requirement_text_into_education_criteria():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{
            "post_name": "A",
            "education_required": "Bachelor's degree",
            "raw_requirement_text": "Bachelor's degree in any discipline from a recognised university; preferred: CS/IT",
        }],
    )
    promote_to_recruitments(data, sb)
    edu = sb.db["education_criteria"][0]
    assert edu["min_qualification_level"] == "graduate"
    assert edu["raw_requirement_text"].startswith("Bachelor's degree in any discipline")


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


# ── PR 1: top-level data_quality_score / evidence / duplicate target ────────


def test_scrape_queue_writes_top_level_data_quality_score():
    sb = RunnerSB()
    run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    rows = sb.db["scrape_queue"]
    assert rows
    for row in rows:
        assert isinstance(row.get("data_quality_score"), (int, float))
        # _meta no longer carries data_quality_score (top-level is authoritative)
        assert "data_quality_score" not in (row["extracted_data"].get("_meta") or {})


def test_direct_source_path_inserts_evidence_document(monkeypatch):
    sb = RunnerSB()
    # Replace the aggregator source with a direct (non-aggregator) source.
    sb.db["source_registry"] = [{
        "id": "src-2",
        "source_name": "UPSC Direct",
        "source_type": "official",
        "source_url": "https://upsc.gov.in/notices",
        "is_active": True,
        "requires_official_confirmation": False,
    }]
    out = run_scraping_pass(sb, source_ids=["src-2"], mock=True)
    assert out["items_found"] == 1
    assert len(sb.db["notification_documents"]) == 1
    assert sb.db["scrape_queue"][0]["notification_document_id"] == "doc-1"
    assert sb.db["scrape_queue"][0]["official_source_resolved"] is True


def test_duplicate_target_writes_recruitment_id_not_queue_id():
    sb = RunnerSB()
    # Seed an existing recruitment that will match the mock extractor output.
    # mock_extract sets title = "Free Job Alert Recruitment <year>"; the runner
    # builds the similarity key from organization, year, and title.
    from datetime import date
    today = date.today()
    sb.db["recruitments"] = [{
        "id": "rec-existing-1",
        "name": f"Free Job Alert Recruitment {today.year}",
        "year": today.year,
        "organizations": {"name": "Free Job Alert"},
        "official_notification_url": None,
        "official_apply_url": None,
    }]
    run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    rows = sb.db["scrape_queue"]
    assert rows
    # All three mock detail urls share the same sim_key → all duplicates.
    for row in rows:
        assert row["status"] == "duplicate"
        assert row["duplicate_recruitment_id"] == "rec-existing-1"
        # duplicate_of is the queue→queue pointer; nothing in queue when run started.
        assert row["duplicate_of"] is None


def test_promote_run_blocks_when_official_source_unresolved(monkeypatch):
    sb = RunnerSB()
    # Seed a pending queue row whose official source is not resolved.
    sb.db["scrape_queue"] = [{
        "id": "queue-A",
        "scrape_run_id": "run-1",
        "source_id": "src-1",
        "status": "pending",
        "official_source_resolved": False,
        "extracted_data": {
            "title": "Test", "organization_name": "Test Org", "org_type": "Other",
            "year": 2026, "official_notification_url": "https://x",
        },
    }]
    # Patch the table call to return our pre-seeded rows and accept queries.
    class _Q:
        def __init__(self, name, db):
            self.name = name; self.db = db; self.filters = {}; self.payload = None
        def select(self, *a, **k): return self
        def eq(self, k, v): self.filters[k] = v; return self
        def in_(self, k, v): return self
        def order(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def update(self, p): self.payload = p; return self
        def execute(self):
            if self.name == "scrape_queue":
                rows = list(self.db.get("scrape_queue", []))
                if "scrape_run_id" in self.filters:
                    rows = [r for r in rows if r["scrape_run_id"] == self.filters["scrape_run_id"]]
                if "status" in self.filters:
                    rows = [r for r in rows if r["status"] == self.filters["status"]]
                return E(rows)
            if self.name == "extracted_field_evidence":
                return E([])
            return E([])
    class _SB:
        def __init__(self, db): self.db = db
        def table(self, name): return _Q(name, self.db)

    out = promote_run("run-1", _SB(sb.db))
    assert out["promoted"] == 0
    assert out["skipped"] == 1
    assert out["errors"][0]["reason"] == "unverified_official_source"


# ── PR 2: source config invalidation + adapter routing + promotion rollback ─


def test_runner_skips_source_with_no_fetch_url():
    sb = RunnerSB()
    # No URL fields at all → primary_fetch_url() is None → source_config_invalid.
    sb.db["source_registry"] = [{
        "id": "src-empty",
        "source_name": "No URL",
        "is_active": True,
    }]
    out = run_scraping_pass(sb, source_ids=["src-empty"], mock=True)
    assert out["items_found"] == 0
    assert out["sources_checked"] == 1
    assert any(e.get("error") == "source_config_invalid" for e in out["errors"])


def test_runner_skips_rss_adapter_as_not_implemented():
    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-rss",
        "source_name": "RSS feed",
        "adapter_type": "rss",
        "rss_url": "https://example.gov.in/feed.xml",
        "is_active": True,
    }]
    out = run_scraping_pass(sb, source_ids=["src-rss"], mock=True)
    assert out["items_found"] == 0
    assert any(e.get("error") == "adapter_not_implemented" and e.get("adapter_type") == "rss" for e in out["errors"])


def test_promotion_rolls_back_recruitment_when_post_fails():
    """If a post insert returns no row, the recruitment row should be deleted."""
    db: dict[str, list[dict]] = {}
    deleted: list[tuple[str, str]] = []

    class FailingQ:
        def __init__(self, name, db):
            self.name = name
            self.db = db
            self.payload = None
            self.filters: dict = {}
        def select(self, *a, **k): return self
        def eq(self, k, v): self.filters[k] = v; return self
        def limit(self, *a, **k): return self
        def insert(self, p): self.payload = p; return self
        def delete(self): self._delete = True; return self
        def execute(self):
            if getattr(self, "_delete", False):
                deleted.append((self.name, self.filters.get("id", "")))
                return E([])
            if self.payload is not None:
                if self.name == "posts":
                    return E([])  # simulate row not created
                rows = self.db.setdefault(self.name, [])
                row = {**self.payload, "id": f"{self.name}-{len(rows)+1}"}
                rows.append(row)
                return E([row])
            if self.name == "organizations":
                rows = list(self.db.get("organizations", []))
                if "name" in self.filters:
                    rows = [r for r in rows if r.get("name") == self.filters["name"]]
                return E(rows)
            if self.name == "recruitments":
                return E([])  # duplicate-slug lookup empty so we proceed to insert
            return E(self.db.get(self.name, []))

    class SBFail:
        def __init__(self): self.db = db
        def table(self, name): return FailingQ(name, self.db)

    sb = SBFail()
    data = ExtractedRecruitment(
        title="Test", organization_name="Test Org", org_type="Other",
        year=2026, official_notification_url="https://x", posts=[{"post_name": "A"}],
    )
    with pytest.raises(PromotionError):
        promote_to_recruitments(data, sb)
    assert ("recruitments", "recruitments-1") in deleted


def test_promote_run_blocks_when_high_risk_fields_unverified():
    db = {
        "scrape_queue": [{
            "id": "queue-B",
            "scrape_run_id": "run-1",
            "source_id": "src-1",
            "status": "pending",
            "official_source_resolved": True,
            "extracted_data": {
                "title": "Test", "organization_name": "Test Org", "org_type": "Other",
                "year": 2026, "official_notification_url": "https://x",
            },
        }],
        # Only 2 of the 5 high-risk fields verified.
        "extracted_field_evidence": [
            {"field_name": "apply_end_date", "reviewer_status": "verified"},
            {"field_name": "organization_name", "reviewer_status": "verified"},
        ],
    }
    class _Q:
        def __init__(self, name, db):
            self.name = name; self.db = db; self.filters = {}; self.payload = None
        def select(self, *a, **k): return self
        def eq(self, k, v): self.filters[k] = v; return self
        def in_(self, k, v): return self
        def order(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def update(self, p): self.payload = p; return self
        def execute(self):
            if self.name == "scrape_queue":
                rows = list(self.db.get("scrape_queue", []))
                if "scrape_run_id" in self.filters:
                    rows = [r for r in rows if r["scrape_run_id"] == self.filters["scrape_run_id"]]
                if "status" in self.filters:
                    rows = [r for r in rows if r["status"] == self.filters["status"]]
                return E(rows)
            if self.name == "extracted_field_evidence":
                return E(self.db.get("extracted_field_evidence", []))
            return E([])
    class _SB:
        def __init__(self, db): self.db = db
        def table(self, name): return _Q(name, self.db)

    out = promote_run("run-1", _SB(db))
    assert out["promoted"] == 0
    assert out["skipped"] == 1
    err = out["errors"][0]
    assert err["reason"] == "high_risk_fields_unverified"
    assert set(err["unverified_fields"]) == {"official_notification_url", "official_apply_url", "total_vacancies"}
