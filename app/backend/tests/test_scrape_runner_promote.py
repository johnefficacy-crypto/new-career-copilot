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

    def is_(self, key, value):
        # supabase-py: ``is_("recruitment_id", "null")`` → IS NULL
        self.filters[f"_is_{key}"] = None if value == "null" else value
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
        if self.name == "aggregator_listings":
            if self.payload:
                rows = self.db.setdefault("aggregator_listings", [])
                # update path (no insert payload contains source_id/listing_hash but
                # eq filters carry an existing id) — try update first.
                if "id" in self.filters:
                    for row in rows:
                        if row.get("id") == self.filters["id"]:
                            row.update(self.payload)
                            return E([row])
                row = {**self.payload, "id": f"al-{len(rows) + 1}"}
                rows.append(row)
                return E([row])
            rows = list(self.db.get("aggregator_listings", []))
            if "source_id" in self.filters:
                rows = [r for r in rows if r.get("source_id") == self.filters["source_id"]]
            if "listing_hash" in self.filters:
                rows = [r for r in rows if r.get("listing_hash") == self.filters["listing_hash"]]
            return E(rows)
        if self.name == "listing_observations":
            if self.payload:
                rows = self.db.setdefault("listing_observations", [])
                row = {**self.payload, "id": f"lo-{len(rows) + 1}"}
                rows.append(row)
                return E([row])
            return E(list(self.db.get("listing_observations", [])))
        if self.name == "recruitment_candidates":
            if self.payload:
                rows = self.db.setdefault("recruitment_candidates", [])
                if "id" in self.filters:
                    for row in rows:
                        if row.get("id") == self.filters["id"]:
                            row.update(self.payload)
                            return E([row])
                row = {**self.payload, "id": f"rc-{len(rows) + 1}"}
                rows.append(row)
                return E([row])
            rows = list(self.db.get("recruitment_candidates", []))
            if "canonical_key" in self.filters:
                rows = [r for r in rows if r.get("canonical_key") == self.filters["canonical_key"]]
            return E(rows)
        if self.name == "candidate_observations":
            if self.payload:
                rows = self.db.setdefault("candidate_observations", [])
                row = {**self.payload, "id": f"co-{len(rows) + 1}"}
                rows.append(row)
                return E([row])
            return E(list(self.db.get("candidate_observations", [])))
        if self.name == "recruitment_events":
            if self.payload is not None and "id" in self.filters:
                # Update path: stamp recruitment_id on a specific row.
                rows = self.db.setdefault("recruitment_events", [])
                for row in rows:
                    if row.get("id") == self.filters["id"]:
                        row.update(self.payload)
                        return E([row])
                return E([])
            if self.payload is not None:
                rows = self.db.setdefault("recruitment_events", [])
                row = {**self.payload, "id": f"re-{len(rows) + 1}"}
                rows.append(row)
                return E([row])
            rows = list(self.db.get("recruitment_events", []))
            if "_is_recruitment_id" in self.filters and self.filters["_is_recruitment_id"] is None:
                rows = [r for r in rows if r.get("recruitment_id") is None]
            if "source_id" in self.filters:
                rows = [r for r in rows if r.get("source_id") == self.filters["source_id"]]
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


def test_runner_rss_adapter_queues_entries_in_mock_mode():
    """RSS adapter is now implemented (was: adapter_not_implemented).

    Mock mode synthesises three entries; each gets queued like a regular
    aggregator detail row.
    """
    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-rss",
        "source_name": "RSS feed",
        "adapter_type": "rss",
        "rss_url": "https://example.gov.in/feed.xml",
        "is_active": True,
    }]
    out = run_scraping_pass(sb, source_ids=["src-rss"], mock=True)
    assert out["items_found"] == 3
    assert all(r["source_id"] == "src-rss" for r in sb.db.get("scrape_queue", []))


def test_runner_pdf_adapter_queues_single_entry_in_mock_mode():
    """PDF adapter is now implemented (was: adapter_not_implemented).

    Mock mode synthesises a single recruitment from the PDF body; the
    runner queues exactly one row tied to a fresh aggregator_listing.
    """
    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-pdf",
        "source_name": "PDF bulletin",
        "adapter_type": "pdf",
        "pdf_bulletin_url": "https://example.gov.in/bulletin.pdf",
        "is_active": True,
    }]
    out = run_scraping_pass(sb, source_ids=["src-pdf"], mock=True)
    assert out["items_found"] == 1
    assert sb.db["scrape_queue"][0]["source_id"] == "src-pdf"
    listings = sb.db.get("aggregator_listings", [])
    assert listings and listings[-1]["listing_url"] == "https://example.gov.in/bulletin.pdf"


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
    # `requires_domicile` was added to HIGH_RISK_FIELDS by migration 042 so
    # the canonical domicile rule cannot land without explicit admin review.
    assert set(err["unverified_fields"]) == {
        "official_notification_url",
        "official_apply_url",
        "total_vacancies",
        "requires_domicile",
    }


def test_promote_writes_requires_domicile_into_posts_when_extractor_set_it():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="state", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{
            "post_name": "State Inspector",
            "min_age": 18, "max_age": 32,
            "requires_domicile": True,
        }],
    )
    promote_to_recruitments(data, sb)
    assert sb.db["posts"][0]["requires_domicile"] is True


def test_promote_defaults_requires_domicile_false_when_extractor_silent():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="central", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "All-India Officer", "min_age": 18, "max_age": 32}],
    )
    promote_to_recruitments(data, sb)
    # org_state metadata alone must not flip the legal domicile rule; the
    # column defaults to False unless the extractor saw an explicit claim.
    assert sb.db["posts"][0]["requires_domicile"] is False


# ── PR 4: source health failure detail + critical-read hardening ────────────


def test_runner_records_typed_failure_detail_on_empty_fetch(monkeypatch):
    sb = RunnerSB()
    # Force the direct-source fetch to return empty so we hit the
    # empty_response failure path.
    sb.db["source_registry"] = [{
        "id": "src-direct",
        "source_name": "UPSC Direct",
        "source_type": "official",
        "notification_url": "https://upsc.gov.in/notices",
        "is_active": True,
        "requires_official_confirmation": False,
    }]
    monkeypatch.setattr("app.scraping.runner.fetch_page_text", lambda url: None)
    monkeypatch.setattr("app.scraping.runner.fetch_page_html", lambda url: None)
    out = run_scraping_pass(sb, source_ids=["src-direct"], mock=False)
    assert out["status"] == "failed"
    updates = sb.db.get("source_registry_updates", [])
    assert updates, "expected source_registry to be updated"
    last = updates[-1]
    assert last["last_error_class"] == "empty_response"
    assert last["last_error_message"]
    assert last["last_error_url"] == "https://upsc.gov.in/notices"
    assert last["last_scraped_at"]
    assert last["last_error_at"]


def test_runner_marks_run_failed_when_source_read_raises(monkeypatch):
    sb = RunnerSB()

    class _BoomQ:
        def __init__(self, name, db, calls):
            self.name = name
            self.db = db
            self.calls = calls
            self.payload = None
            self.filters: dict = {}
        @property
        def not_(self): return self
        def select(self, *a, **k): return self
        def eq(self, k, v): self.filters[k] = v; return self
        def in_(self, k, v): return self
        def order(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def insert(self, p): self.payload = p; return self
        def update(self, p): self.payload = p; return self
        def execute(self):
            if self.name == "scrape_runs":
                if self.payload and "started_at" in self.payload:
                    row = {**self.payload, "id": "run-1"}
                    self.db.setdefault("scrape_runs", []).append(row)
                    return E([row])
                self.db.setdefault("scrape_runs_updates", []).append(self.payload)
                return E([self.payload])
            if self.name == "source_registry":
                raise RuntimeError("supabase: connection refused")
            return E([])

    class _BoomSB:
        def __init__(self):
            self.db = {}
            self.calls = []
        def table(self, name): return _BoomQ(name, self.db, self.calls)

    sb2 = _BoomSB()
    import pytest
    with pytest.raises(Exception):
        run_scraping_pass(sb2, source_ids=["src-1"], mock=True)
    updates = sb2.db.get("scrape_runs_updates", [])
    assert updates
    finalize = updates[-1]
    assert finalize["status"] == "failed"
    assert finalize["error_log"][0]["error"] == "source_registry_read_failed"
    # execute_or_raise wraps the underlying exception in DatabaseError.
    assert finalize["error_log"][0]["error_class"] == "DatabaseError"


def test_runner_marks_run_failed_when_recruitments_dedupe_read_raises():
    class _DedupQ:
        def __init__(self, name, db):
            self.name = name
            self.db = db
            self.payload = None
            self.filters: dict = {}
        @property
        def not_(self): return self
        def select(self, *a, **k): return self
        def eq(self, k, v): self.filters[k] = v; return self
        def in_(self, k, v): return self
        def order(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def insert(self, p): self.payload = p; return self
        def update(self, p): self.payload = p; return self
        def execute(self):
            if self.name == "scrape_runs":
                if self.payload and "started_at" in self.payload:
                    row = {**self.payload, "id": "run-1"}
                    self.db.setdefault("scrape_runs", []).append(row)
                    return E([row])
                self.db.setdefault("scrape_runs_updates", []).append(self.payload)
                return E([self.payload])
            if self.name == "source_registry":
                rows = list(self.db.get("source_registry", []))
                if "id" in self.filters:
                    rows = [r for r in rows if r.get("id") in self.filters["id"]]
                return E(rows)
            if self.name == "recruitments":
                raise RuntimeError("read timeout")
            return E([])

    class _SB:
        def __init__(self):
            self.db = {"source_registry": [{"id": "src-1", "source_name": "X", "source_type": "aggregator", "is_active": True, "source_url": "https://x"}]}
        def table(self, name): return _DedupQ(name, self.db)

    sb = _SB()
    import pytest
    with pytest.raises(Exception):
        run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    updates = sb.db.get("scrape_runs_updates", [])
    finalize = updates[-1]
    assert finalize["status"] == "failed"
    assert finalize["error_log"][0]["error"] == "recruitments_dedupe_read_failed"


def test_runner_mark_success_clears_typed_error_fields():
    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-prev-failed",
        "source_name": "Free Job Alert",
        "source_type": "aggregator",
        "source_url": "https://www.freejobalert.com/government-jobs/",
        "is_active": True,
        # Pre-existing failure state on the row:
        "consecutive_fails": 3,
        "last_error": "old: HTTP 503",
        "last_error_class": "http_503",
        "last_error_message": "previous failure",
        "last_error_at": "2026-05-01T00:00:00+00:00",
        "last_error_http_status": 503,
        "last_error_url": "https://x",
    }]
    run_scraping_pass(sb, source_ids=["src-prev-failed"], mock=True)
    updates = sb.db.get("source_registry_updates", [])
    success = next(u for u in updates if u.get("consecutive_fails") == 0)
    for field in (
        "last_error", "last_error_class", "last_error_message",
        "last_error_at", "last_error_http_status", "last_error_url",
    ):
        assert success[field] is None, f"expected {field} cleared on success"


# ── P0: aggregator candidate layer + official-source resolver ───────────────


def test_aggregator_path_records_listing_and_observation_in_mock_mode():
    sb = RunnerSB()
    run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    listings = sb.db.get("aggregator_listings", [])
    observations = sb.db.get("listing_observations", [])
    assert len(listings) == 3
    assert all(l["status"] == "discovered" for l in listings)
    assert len(observations) == 3


def test_aggregator_path_resolves_official_source_on_real_fetch(monkeypatch):
    sb = RunnerSB()

    listing_html = '<a href="/ssc-cgl-2026-recruitment/">SSC CGL 2026 Recruitment</a>'
    detail_html = (
        '<a href="https://ssc.nic.in/recruitment/2026/cgl.pdf">Official notification</a>'
    )
    official_html = "<html>Official body of the notice</html>"

    def _fake_html(url):
        if url.endswith("/government-jobs/"):
            return listing_html
        if "ssc-cgl-2026-recruitment" in url:
            return detail_html
        if "ssc.nic.in" in url:
            return official_html
        return None

    monkeypatch.setattr("app.scraping.runner.fetch_page_html", _fake_html)
    monkeypatch.setattr("app.scraping.runner.fetch_page_text", lambda url: None)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    out = run_scraping_pass(sb, source_ids=["src-1"], mock=False, limit=5)
    assert out["items_found"] == 1
    row = sb.db["scrape_queue"][0]
    assert row["source_url"] == "https://ssc.nic.in/recruitment/2026/cgl.pdf"
    assert row["official_source_resolved"] is True
    assert row["official_source_host"] == "ssc.nic.in"
    assert row["evidence_required"] is False
    listings = sb.db.get("aggregator_listings", [])
    assert listings and listings[-1]["status"] == "official_source_found"
    assert listings[-1]["official_source_url"] == "https://ssc.nic.in/recruitment/2026/cgl.pdf"


def test_aggregator_path_marks_needs_official_source_when_resolver_fails(monkeypatch):
    sb = RunnerSB()

    listing_html = '<a href="/ssc-cgl-2026-recruitment/">SSC CGL 2026</a>'
    # Detail page links to a coaching ad only — no gov anchor.
    detail_html = '<a href="https://coaching.example/buy">Buy course</a>'

    def _fake_html(url):
        if url.endswith("/government-jobs/"):
            return listing_html
        if "ssc-cgl-2026-recruitment" in url:
            return detail_html
        return None

    monkeypatch.setattr("app.scraping.runner.fetch_page_html", _fake_html)
    monkeypatch.setattr("app.scraping.runner.fetch_page_text", lambda url: None)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    out = run_scraping_pass(sb, source_ids=["src-1"], mock=False, limit=5)
    assert out["items_found"] == 1
    row = sb.db["scrape_queue"][0]
    assert row["official_source_resolved"] is False
    assert row["source_url"].endswith("/ssc-cgl-2026-recruitment/")
    listings = sb.db.get("aggregator_listings", [])
    assert listings and listings[-1]["status"] == "needs_official_source"


# ── P1: vacancy persistence + candidate merge ───────────────────────────────


def test_promote_writes_category_vacancies():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{
            "post_name": "Inspector",
            "vacancies": 100,
            "category_vacancies": {"UR": 50, "OBC": 27, "SC": 15, "ST": 8},
        }],
    )
    promote_to_recruitments(data, sb)
    rows = sb.db.get("vacancy_reservations", [])
    assert len(rows) == 4
    by_cat = {r["vertical_category"]: r["vacancy_count"] for r in rows}
    assert by_cat == {"UR": 50, "OBC": 27, "SC": 15, "ST": 8}


def test_promote_falls_back_to_post_vacancies_when_no_category_breakdown():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "X", "vacancies": 42}],
    )
    promote_to_recruitments(data, sb)
    rows = sb.db.get("vacancy_reservations", [])
    assert len(rows) == 1
    assert rows[0]["vertical_category"] is None
    assert rows[0]["vacancy_count"] == 42


def test_promote_writes_no_vacancy_rows_when_post_has_no_count():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "X"}],
    )
    promote_to_recruitments(data, sb)
    assert sb.db.get("vacancy_reservations", []) == []


def test_runner_writes_recruitment_candidates_and_observations():
    sb = RunnerSB()
    run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    candidates = sb.db.get("recruitment_candidates", [])
    observations = sb.db.get("candidate_observations", [])
    # Mock aggregator returns 3 detail URLs sharing the same sim_key →
    # one candidate row, three observations.
    assert len(candidates) == 1
    assert candidates[0]["status"] == "aggregator_confirmed"
    assert candidates[0]["organization_hint"] == "Free Job Alert"
    assert len(observations) == 3
    # Each observation links to a queue row and the candidate.
    for obs in observations:
        assert obs["candidate_id"] == candidates[0]["id"]
        assert obs["source_id"] == "src-1"


def test_runner_candidate_status_marks_official_when_resolver_succeeds(monkeypatch):
    sb = RunnerSB()
    listing_html = '<a href="/ssc-cgl-2026-recruitment/">SSC CGL 2026</a>'
    detail_html = '<a href="https://ssc.nic.in/recruitment/2026/cgl.pdf">Official</a>'
    official_html = "<html>Official body</html>"

    def _fake_html(url):
        if url.endswith("/government-jobs/"):
            return listing_html
        if "ssc-cgl-2026-recruitment" in url:
            return detail_html
        if "ssc.nic.in" in url:
            return official_html
        return None

    monkeypatch.setattr("app.scraping.runner.fetch_page_html", _fake_html)
    monkeypatch.setattr("app.scraping.runner.fetch_page_text", lambda url: None)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    run_scraping_pass(sb, source_ids=["src-1"], mock=False, limit=5)
    candidates = sb.db.get("recruitment_candidates", [])
    assert candidates
    assert candidates[-1]["status"] == "official_notification_found"


# ── P2: promotion RPC + change-detection ────────────────────────────────────


class RPCResponse:
    def __init__(self, data): self.data = data


class _SBWithRpc:
    """Mocks supabase.rpc('promote_recruitment', ...) and the subset of
    .table() calls promote_to_recruitments touches for status updates.
    """
    def __init__(self, *, rpc_behaviour):
        self.rpc_behaviour = rpc_behaviour
        self.rpc_calls: list[tuple[str, dict]] = []
        self.compensation_path_used = False
        self.db: dict[str, list[dict]] = {}

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        outer = self

        class _RpcExecutor:
            def execute(self_inner):
                return outer.rpc_behaviour(name, params)

        return _RpcExecutor()

    def table(self, name):
        outer = self

        class _Q:
            def __init__(self):
                self.name = name
                self.filters: dict = {}
                self.payload = None
            def select(self, *a, **k): return self
            def eq(self, k, v): self.filters[k] = v; return self
            def limit(self, *a, **k): return self
            def insert(self, p): self.payload = p; outer.compensation_path_used = True; return self
            def update(self, p): self.payload = p; return self
            def execute(self):
                if self.payload is None:
                    if self.name == "organizations":
                        return E([])
                    if self.name == "recruitments":
                        return E([])
                    return E([])
                rows = outer.db.setdefault(self.name, [])
                row = {**self.payload, "id": f"{self.name}-{len(rows)+1}"}
                rows.append(row)
                return E([row])
        return _Q()


def test_promote_uses_rpc_when_available():
    def _rpc(name, params):
        assert name == "promote_recruitment"
        assert params["payload"]["slug"] == "ssc-cgl-2026"
        return RPCResponse("rec-rpc-1")

    sb = _SBWithRpc(rpc_behaviour=_rpc)
    data = ExtractedRecruitment(
        title="SSC CGL", organization_name="SSC", org_type="SSC", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://ssc.nic.in/cgl",
        posts=[{"post_name": "A"}],
    )
    rec_id = promote_to_recruitments(data, sb, source_id="src-1")
    assert rec_id == "rec-rpc-1"
    assert sb.compensation_path_used is False
    assert sb.rpc_calls and sb.rpc_calls[0][0] == "promote_recruitment"


def test_promote_falls_back_to_compensation_when_rpc_missing():
    def _rpc(name, params):
        raise RuntimeError("function public.promote_recruitment does not exist")

    sb = _SBWithRpc(rpc_behaviour=_rpc)
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "A"}],
    )
    rec_id = promote_to_recruitments(data, sb, source_id="src-1")
    # Compensation path ran (it inserts organizations + recruitments + posts).
    assert sb.compensation_path_used is True
    assert isinstance(rec_id, str) and rec_id


def test_promote_rpc_duplicate_slug_raises_typed_error():
    from app.scraping.runner import DuplicatePromotionError

    def _rpc(name, params):
        raise RuntimeError(
            "23P01: promote_recruitment: duplicate slug ssc-cgl-2026 (existing=00000000-0000-0000-0000-000000000001)"
        )

    sb = _SBWithRpc(rpc_behaviour=_rpc)
    data = ExtractedRecruitment(
        title="SSC CGL", organization_name="SSC", org_type="SSC", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "A"}],
    )
    with pytest.raises(DuplicatePromotionError) as exc_info:
        promote_to_recruitments(data, sb, source_id="src-1")
    err = exc_info.value
    assert err.slug == "ssc-cgl-2026"
    assert err.existing_recruitment_id == "00000000-0000-0000-0000-000000000001"


def test_runner_skips_unchanged_detail_via_304(monkeypatch):
    """If notification_documents has an etag for the detail URL and the
    server returns 304, the runner skips extraction for that URL."""
    from app.scraping import runner as runner_mod
    from app.scraping.aggregator import DiscoveredLink, DiscoveryResult
    from app.scraping.fetcher import FetchResult

    sb = RunnerSB()
    cached_url = "https://www.freejobalert.com/recruitment-cached/"
    fresh_url = "https://www.freejobalert.com/recruitment-fresh/"

    def _discover(_html_text, _base_url, **_kwargs):
        return DiscoveryResult(
            urls=[cached_url, fresh_url],
            links=[
                DiscoveredLink(url=cached_url, label="Cached", event_type="new_recruitment"),
                DiscoveredLink(url=fresh_url, label="Fresh", event_type="new_recruitment"),
            ],
            stats={"discovered": 2, "domain": 0, "include": 0, "exclude": 0, "lifecycle_skipped": 0},
        )
    monkeypatch.setattr(runner_mod, "discover_aggregator_detail_urls", _discover)
    monkeypatch.setattr(
        runner_mod,
        "_lookup_prior_document_headers",
        lambda _sb, url: ({"etag": 'W/"prev"', "last_modified": None} if url == cached_url else {"etag": None, "last_modified": None}),
    )

    def _fake_fetch(url, *, adapter_type=None, if_none_match=None, if_modified_since=None, timeout=15.0):
        if url == cached_url and if_none_match == 'W/"prev"':
            return FetchResult(ok=False, url=url, status_code=304, error="not_modified")
        return FetchResult(ok=True, url=url, status_code=200, text=f"body for {url}", raw_bytes=b"<html></html>")

    monkeypatch.setattr(runner_mod, "fetch", _fake_fetch)
    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: "<html><a href='/r'>r</a></html>")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    run_scraping_pass(sb, source_ids=["src-1"], mock=False, limit=3)
    queue_rows = sb.db.get("scrape_queue", [])
    assert all(r["source_url"] != cached_url for r in queue_rows)
    assert any(r["source_url"] == fresh_url for r in queue_rows)
    listings = sb.db.get("aggregator_listings", [])
    assert any(l["listing_url"] == cached_url for l in listings)


def test_runner_api_adapter_queues_entries_in_mock_mode():
    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-api",
        "source_name": "WP API",
        "adapter_type": "api",
        "api_url": "https://example.gov.in/wp-json/wp/v2/posts",
        "is_active": True,
    }]
    out = run_scraping_pass(sb, source_ids=["src-api"], mock=True)
    assert out["items_found"] == 3
    assert all(r["source_id"] == "src-api" for r in sb.db.get("scrape_queue", []))


# ── Lifecycle event persistence (migration 042 + runner write) ──────────────


def test_runner_persists_aggregator_lifecycle_events(monkeypatch):
    """Discovery now retains admit_card / result / corrigendum links;
    runner writes one recruitment_events row per such link."""
    from app.scraping import runner as runner_mod
    from app.scraping.aggregator import DiscoveredLink, DiscoveryResult

    sb = RunnerSB()
    detail_url = "https://www.freejobalert.com/ssc-cgl-2026-recruitment/"

    def _discover(_html, _base_url, **_kw):
        return DiscoveryResult(
            urls=[detail_url],
            links=[DiscoveredLink(url=detail_url, label="SSC CGL Recruitment", event_type="new_recruitment")],
            lifecycle_links=[
                DiscoveredLink(url="https://x/admit-card", label="Admit", event_type="admit_card"),
                DiscoveredLink(url="https://x/result", label="Result", event_type="result"),
            ],
            stats={"discovered": 1, "domain": 0, "include": 0, "exclude": 0, "lifecycle_skipped": 2},
        )
    monkeypatch.setattr(runner_mod, "discover_aggregator_detail_urls", _discover)
    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: "<html><a href='/r'>r</a></html>")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    run_scraping_pass(sb, source_ids=["src-1"], mock=False, limit=5)
    events = sb.db.get("recruitment_events", [])
    types = sorted(e["event_type"] for e in events)
    assert types == ["admit_card", "result"]
    # Every event is unattached (no canonical recruitment yet) and carries provenance.
    for e in events:
        assert e["recruitment_id"] is None
        assert e["source_id"] == "src-1"
        assert e["payload"]["discovered_url"]


def test_runner_rss_lifecycle_event_persisted_in_live_mode(monkeypatch):
    """RSS-pass skipping an admit-card entry persists a recruitment_events row."""
    from app.scraping import runner as runner_mod
    from app.scraping.fetcher import RssEntry, FetchResult

    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-rss",
        "source_name": "Test RSS",
        "adapter_type": "rss",
        "rss_url": "https://example.gov.in/feed.xml",
        "is_active": True,
    }]

    def _fake_fetch_rss(url, **_kw):
        result = FetchResult(ok=True, url=url, status_code=200, text="<rss/>", raw_bytes=b"<rss/>")
        entries = [
            RssEntry(title="UPSC CSE 2026 admit card", link="https://upsc.gov.in/cse-2026-admit", summary=""),
        ]
        return result, entries

    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: None)
    monkeypatch.setattr("app.scraping.fetcher.fetch_rss", _fake_fetch_rss)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    run_scraping_pass(sb, source_ids=["src-rss"], mock=False, limit=5)
    events = sb.db.get("recruitment_events", [])
    assert any(e["event_type"] == "admit_card" for e in events)


# ── Rich-field canonical persistence (P1 follow-up) ─────────────────────────


def test_promote_writes_exam_patterns():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{
            "post_name": "Inspector",
            "exam_pattern": [
                {"section": "General Awareness", "questions": 25, "marks": 50, "duration_minutes": 30, "negative_marking": "0.5"},
                {"section": "Reasoning", "questions": 25, "marks": 50, "duration_minutes": 30, "negative_marking": "0.5"},
            ],
        }],
    )
    promote_to_recruitments(data, sb)
    rows = sb.db.get("exam_patterns", [])
    assert len(rows) == 2
    assert rows[0]["section_name"] == "General Awareness"
    assert rows[0]["question_count"] == 25
    assert rows[0]["marks"] == 50
    assert rows[0]["duration_minutes"] == 30
    assert rows[0]["sort_order"] == 0
    assert rows[1]["sort_order"] == 1


def test_promote_writes_skill_tests():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{
            "post_name": "Junior Assistant",
            "skill_tests": [
                {"type": "typing", "wpm": 35, "duration_minutes": 10},
                {"type": "stenography", "wpm": 80, "duration_minutes": 5},
            ],
        }],
    )
    promote_to_recruitments(data, sb)
    rows = sb.db.get("skill_tests", [])
    assert len(rows) == 2
    types = sorted(r["test_type"] for r in rows)
    assert types == ["stenography", "typing"]
    by_type = {r["test_type"]: r for r in rows}
    assert by_type["typing"]["speed_requirement"] == "35"
    assert by_type["typing"]["duration_minutes"] == 10


def test_promote_writes_age_relaxation_rules():
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{
            "post_name": "Officer",
            "age_relaxation": {"SC": 5, "ST": 5, "OBC": 3, "PwBD": 10},
        }],
    )
    promote_to_recruitments(data, sb)
    rows = sb.db.get("age_relaxation_rules", [])
    by_cat = {r["reservation_category"]: r["additional_years"] for r in rows}
    assert by_cat == {"SC": 5, "ST": 5, "OBC": 3, "PwBD": 10}


def test_promote_handles_missing_rich_fields_cleanly():
    """A post with no exam_pattern / skill_tests / age_relaxation
    produces zero rows in the new canonical tables."""
    sb = SB()
    data = ExtractedRecruitment(
        title="T", organization_name="O", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://x",
        posts=[{"post_name": "X"}],
    )
    promote_to_recruitments(data, sb)
    assert sb.db.get("exam_patterns", []) == []
    assert sb.db.get("skill_tests", []) == []
    assert sb.db.get("age_relaxation_rules", []) == []


# ── Lifecycle reconciliation on promotion ───────────────────────────────────


def _RunnerSBWithRpc(rpc_response):
    """RunnerSB-like, but supabase.rpc('promote_recruitment', ...) returns
    the given response object so the RPC happy-path is exercised."""
    class _SB(RunnerSB):
        def rpc(self, name, params):
            outer = self
            class _Exec:
                def execute(self_inner):
                    return rpc_response
            return _Exec()
    return _SB()


def test_promote_stamps_unattached_lifecycle_events_on_host_match():
    """A recruitment whose official_notification_url shares the host
    with a previously-observed lifecycle event gets that event stamped
    with the new recruitment_id on promotion."""
    sb = _RunnerSBWithRpc(type("R", (), {"data": "rec-new-1"})())
    sb.db["recruitment_events"] = [
        {
            "id": "re-1", "source_id": "src-1",
            "recruitment_id": None, "event_type": "admit_card",
            "payload": {"discovered_url": "https://ssc.nic.in/admit-card/2026"},
        },
        # Different host → must NOT be stamped.
        {
            "id": "re-2", "source_id": "src-1",
            "recruitment_id": None, "event_type": "result",
            "payload": {"discovered_url": "https://upsc.gov.in/result/2026"},
        },
        # Different source → must NOT be stamped even if host matches.
        {
            "id": "re-3", "source_id": "src-OTHER",
            "recruitment_id": None, "event_type": "admit_card",
            "payload": {"discovered_url": "https://ssc.nic.in/other"},
        },
    ]
    data = ExtractedRecruitment(
        title="SSC CGL 2026", organization_name="SSC", org_type="SSC", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="https://ssc.nic.in/cgl-2026",
        posts=[{"post_name": "Inspector"}],
    )
    rec_id = promote_to_recruitments(data, sb, source_id="src-1")
    assert rec_id == "rec-new-1"

    by_id = {r["id"]: r for r in sb.db["recruitment_events"]}
    assert by_id["re-1"]["recruitment_id"] == "rec-new-1"
    assert by_id["re-2"]["recruitment_id"] is None
    assert by_id["re-3"]["recruitment_id"] is None


def test_promote_skips_reconcile_when_no_source_id_or_url():
    sb = _RunnerSBWithRpc(type("R", (), {"data": "rec-new-2"})())
    sb.db["recruitment_events"] = [{
        "id": "re-a", "source_id": "src-1",
        "recruitment_id": None, "event_type": "admit_card",
        "payload": {"discovered_url": "https://ssc.nic.in/admit"},
    }]
    data = ExtractedRecruitment(
        title="X", organization_name="X", org_type="Other", year=2026,
        apply_end_date="2026-12-31",
        official_notification_url="",
        posts=[{"post_name": "A"}],
    )
    # No source_id → reconciliation early-exits, event stays unattached.
    promote_to_recruitments(data, sb, source_id=None)
    assert sb.db["recruitment_events"][0]["recruitment_id"] is None


# ── Listing-level conditional fetch ─────────────────────────────────────────


def test_runner_skips_aggregator_listing_on_304(monkeypatch):
    """If the source row carries prior listing ETag / Last-Modified and
    the server returns 304, the runner short-circuits discovery and
    marks the source as successfully scraped (no error)."""
    from app.scraping import runner as runner_mod
    from app.scraping.fetcher import FetchResult

    sb = RunnerSB()
    # Seed the source with prior caching headers so the conditional
    # branch is taken.
    sb.db["source_registry"][0]["last_listing_etag"] = 'W/"prev"'
    sb.db["source_registry"][0]["last_listing_modified"] = "Wed, 01 Jan 2026 00:00:00 GMT"

    def _fake_fetch(url, *, adapter_type=None, if_none_match=None, if_modified_since=None, timeout=15.0):
        assert if_none_match == 'W/"prev"'
        return FetchResult(ok=False, url=url, status_code=304, error="not_modified")

    monkeypatch.setattr(runner_mod, "fetch", _fake_fetch)
    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: "")  # must NOT be called

    out = run_scraping_pass(sb, source_ids=["src-1"], mock=False, limit=5)
    assert out["items_found"] == 0
    assert sb.db.get("scrape_queue", []) == []
    assert out["status"] in {"completed", "partial", "failed"}  # no items_found, no errors path
    # The unchanged-listing path marks the source successful — no error log.
    assert all(e.get("error") != "empty_listing_response" for e in out.get("errors", []))


def test_runner_remembers_listing_headers_after_first_fetch(monkeypatch):
    """When there are no prior caching headers, the listing is fetched
    with fetch() and the response's etag/last_modified are written back
    to source_registry so the next pass can use them."""
    from app.scraping import runner as runner_mod
    from app.scraping.fetcher import FetchResult
    from app.scraping.aggregator import DiscoveredLink, DiscoveryResult

    sb = RunnerSB()
    # Seed prior etag so the conditional branch runs and the test can
    # assert the write-back behaviour after a 200 response.
    sb.db["source_registry"][0]["last_listing_etag"] = 'W/"old"'

    def _fake_fetch(url, *, adapter_type=None, if_none_match=None, if_modified_since=None, timeout=15.0):
        return FetchResult(
            ok=True, url=url, status_code=200,
            text="<html><a href='/r1'>r1</a></html>",
            raw_bytes=b"<html><a href='/r1'>r1</a></html>",
            etag='W/"new"',
            last_modified="Mon, 02 Feb 2026 00:00:00 GMT",
        )

    monkeypatch.setattr(runner_mod, "fetch", _fake_fetch)
    monkeypatch.setattr(runner_mod, "discover_aggregator_detail_urls", lambda *a, **k: DiscoveryResult(
        urls=["https://x/r1"],
        links=[DiscoveredLink(url="https://x/r1", label="r1", event_type="new_recruitment")],
    ))
    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: "<html></html>")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    run_scraping_pass(sb, source_ids=["src-1"], mock=False, limit=5)
    updates = sb.db.get("source_registry_updates", [])
    # At least one update must record the new caching headers.
    assert any(
        u.get("last_listing_etag") == 'W/"new"' and
        u.get("last_listing_modified") == "Mon, 02 Feb 2026 00:00:00 GMT"
        for u in updates
    )


# ── Conditional fetch for RSS / JSON-API runner passes ──────────────────────


def test_runner_rss_skips_on_304_and_marks_success(monkeypatch):
    from app.scraping import runner as runner_mod
    from app.scraping.fetcher import FetchResult, RssEntry

    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-rss",
        "source_name": "RSS",
        "adapter_type": "rss",
        "rss_url": "https://example.gov.in/feed.xml",
        "is_active": True,
        "last_listing_etag": 'W/"prev"',
    }]

    def _fake_fetch_rss(url, *, if_none_match=None, if_modified_since=None, timeout=15.0):
        assert if_none_match == 'W/"prev"'
        return FetchResult(ok=False, url=url, status_code=304, error="not_modified"), []

    monkeypatch.setattr("app.scraping.fetcher.fetch_rss", _fake_fetch_rss)
    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: None)

    out = run_scraping_pass(sb, source_ids=["src-rss"], mock=False)
    # 304 → no queue rows, source marked success (no error_log entry).
    assert out["items_found"] == 0
    assert all(e.get("error") != "empty_feed" for e in out.get("errors", []))
    updates = sb.db.get("source_registry_updates", [])
    assert any(u.get("consecutive_fails") == 0 for u in updates)


def test_runner_api_writes_back_caching_headers_on_200(monkeypatch):
    from app.scraping import runner as runner_mod
    from app.scraping.fetcher import ApiEntry, FetchResult

    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-api",
        "source_name": "API",
        "adapter_type": "api",
        "api_url": "https://example.gov.in/wp-json",
        "is_active": True,
        "last_listing_etag": 'W/"old"',
    }]

    def _fake_fetch_api(url, *, adapter_config=None, if_none_match=None, if_modified_since=None, timeout=15.0):
        return FetchResult(
            ok=True, url=url, status_code=200,
            text='[]', raw_bytes=b'[]',
            etag='W/"new"', last_modified="Wed, 02 Feb 2026 00:00:00 GMT",
        ), [ApiEntry(title="Notice", link="https://upsc.gov.in/n", summary="")]

    monkeypatch.setattr("app.scraping.fetcher.fetch_api", _fake_fetch_api)
    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: "<html></html>")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    run_scraping_pass(sb, source_ids=["src-api"], mock=False, limit=5)
    updates = sb.db.get("source_registry_updates", [])
    assert any(
        u.get("last_listing_etag") == 'W/"new"' and
        u.get("last_listing_modified") == "Wed, 02 Feb 2026 00:00:00 GMT"
        for u in updates
    )


def test_runner_pdf_skips_on_304_and_marks_success(monkeypatch):
    from app.scraping import runner as runner_mod
    from app.scraping.fetcher import FetchResult

    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-pdf",
        "source_name": "PDF Bulletin",
        "adapter_type": "pdf",
        "pdf_bulletin_url": "https://example.gov.in/bulletin.pdf",
        "is_active": True,
        "last_listing_etag": 'W/"pdf-prev"',
    }]

    def _fake_fetch_pdf(url, *, if_none_match=None, if_modified_since=None, timeout=30.0):
        assert if_none_match == 'W/"pdf-prev"'
        return FetchResult(ok=False, url=url, status_code=304, error="not_modified")

    monkeypatch.setattr("app.scraping.fetcher.fetch_pdf", _fake_fetch_pdf)
    monkeypatch.setattr(runner_mod, "fetch_page_html", lambda url: None)

    out = run_scraping_pass(sb, source_ids=["src-pdf"], mock=False)
    assert out["items_found"] == 0
    assert all(e.get("error") != "empty_pdf" for e in out.get("errors", []))
    updates = sb.db.get("source_registry_updates", [])
    assert any(u.get("consecutive_fails") == 0 for u in updates)
