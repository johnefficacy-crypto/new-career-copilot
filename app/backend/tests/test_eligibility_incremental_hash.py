from app.eligibility import runner


class E:
    def __init__(self, data): self.data = data


class Q:
    def __init__(self, name, db):
        self.name=name; self.db=db; self.f={}; self.in_filters={}
    def select(self,*a,**k): return self
    def eq(self,k,v): self.f[k]=v; return self
    def in_(self,k,v): self.in_filters[k]=set(v); return self
    def or_(self,*a,**k): return self
    def order(self,*a,**k): return self
    def execute(self):
        rows=[r for r in self.db.get(self.name,[]) if all(r.get(k)==v for k,v in self.f.items())]
        for key, values in self.in_filters.items():
            if self.name == "posts" and key.startswith("recruitments."):
                field = key.split(".", 1)[1]
                rows = [r for r in rows if (r.get("recruitments") or {}).get(field) in values]
            else:
                rows = [r for r in rows if r.get(key) in values]
        return E(rows)
    def upsert(self, payload, on_conflict=None):
        rows = payload if isinstance(payload,list) else [payload]
        if self.name == "eligibility_results":
            for row in rows:
                existing = next((r for r in self.db[self.name] if r.get("user_id")==row.get("user_id") and r.get("post_id")==row.get("post_id")), None)
                if existing: existing.update(row)
                else: self.db[self.name].append(dict(row))
        elif self.name == "notification_alerts":
            self.db[self.name].extend(rows)
        return self


class SB:
    def __init__(self):
        self.queried_tables = []
        self.db={
            "profiles":[{"id":"u1","date_of_birth":"2000-01-01","nationality":"Indian","category":"general","domicile_state":"MH"}],
            "aspirant_location":[{"user_id":"u1","state":"MH"}],
            "aspirant_reservations":[{"user_id":"u1","category":"general"}],
            "aspirant_education":[{"user_id":"u1","level":"graduate","percentage":75,"is_completed":True}],
            "aspirant_certifications":[],"aspirant_experience":[],"aspirant_preferences":[],
            "aspirant_exam_attempts":[],"aspirant_exam_credentials":[],"tracked_recruitments":[],
            "posts":[{"id":"p1","recruitment_id":"r1","age_criteria":[],"education_criteria":[],"attempt_limits":[],"certification_criteria":[],"recruitments":{"status":"open","publish_status":"verified","organizations":{"state":"MH"}}}],
            "eligibility_results":[],"notification_alerts":[],"recruitments":[]
        }
    def table(self,n):
        self.queried_tables.append(n)
        return Q(n,self.db)


class FallbackQ(Q):
    def __init__(self, name, db):
        super().__init__(name, db)
        self._select = ""

    def select(self, *a, **k):
        self._select = a[0] if a else ""
        return self

    def execute(self):
        if self.name == "posts" and "age_criteria" in self._select:
            raise RuntimeError("PGRST200 Could not find a relationship between posts and age_criteria in the schema cache")
        return super().execute()


class FallbackSB(SB):
    def __init__(self, *, publish_status="verified", status="open"):
        super().__init__()
        self.db["posts"] = [
            {
                "id": "p1",
                "recruitment_id": "r1",
                "language_requirements": [],
                "recruitments": {"status": status, "publish_status": publish_status, "organizations": {"state": "MH"}},
            }
        ]
        self.db["age_criteria"] = [{"post_id": "p1", "min_age": 18, "max_age": 35, "cutoff_date": "2026-01-01"}]
        self.db["education_criteria"] = [{"post_id": "p1", "min_qualification_level": "graduate", "min_percentage": 60}]
        self.db["age_relaxation_rules"] = []
        self.db["post_disability_requirements"] = []
        self.db["attempt_limits"] = []
        self.db["certification_criteria"] = []

    def table(self, n):
        self.queried_tables.append(n)
        return FallbackQ(n, self.db)


def test_first_recompute_stores_profile_hash(monkeypatch):
    sb=SB()
    monkeypatch.setattr(runner, "check_eligibility_batch", lambda *a,**k: [])
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["processed"] == 0
    assert out["skipped"] == 0


def _seed_existing_row(sb, *, profile_hash, criteria_hash, rules_version):
    sb.db["eligibility_results"].append(
        {
            "user_id": "u1",
            "post_id": "p1",
            "profile_hash": profile_hash,
            "criteria_hash": criteria_hash,
            "rules_version": rules_version,
            "computed_at": "2026-01-01T00:00:00Z",
        }
    )


def _current_hashes(sb):
    from app.eligibility.schemas import PostCriteria

    h = runner._profile_hash(runner.build_user_eligibility_profile(sb, "u1").model_dump())
    # Mirrors how the runner constructs PostCriteria for the SB mock's p1 row
    # (all criteria arrays empty, org_state from the embedded organizations).
    pc = PostCriteria(post_id="p1", recruitment_id="r1", org_state="MH")
    return h, runner._criteria_hash(pc)


def test_second_recompute_skips_when_hash_unchanged(monkeypatch):
    sb = SB()
    calls = {"n": 0}

    def _batch(*a, **k):
        calls["n"] += 1
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    profile_h, criteria_h = _current_hashes(sb)
    _seed_existing_row(
        sb,
        profile_hash=profile_h,
        criteria_hash=criteria_h,
        rules_version=runner.RULES_VERSION,
    )
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["skipped"] == 1
    assert calls["n"] == 2


def test_recompute_invalidates_when_criteria_hash_changes(monkeypatch):
    # Same profile, but admin edited canonical criteria. Cached row's
    # criteria_hash no longer matches the freshly-computed hash → recompute.
    sb = SB()
    calls = {"n": 0}

    def _batch(*a, **k):
        calls["n"] += 1
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    profile_h, _ = _current_hashes(sb)
    _seed_existing_row(
        sb,
        profile_hash=profile_h,
        criteria_hash="stale-criteria-hash-from-an-older-version-of-post-criteria",
        rules_version=runner.RULES_VERSION,
    )
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["skipped"] == 0
    assert calls["n"] == 2


def test_recompute_invalidates_when_rules_version_changes(monkeypatch):
    # Same profile and criteria, but the engine bumped RULES_VERSION since
    # the row was written. Must recompute even though the inputs are
    # identical: the rule semantics may have changed.
    sb = SB()
    calls = {"n": 0}

    def _batch(*a, **k):
        calls["n"] += 1
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    profile_h, criteria_h = _current_hashes(sb)
    _seed_existing_row(
        sb,
        profile_hash=profile_h,
        criteria_hash=criteria_h,
        rules_version="0000.01",  # older than runner.RULES_VERSION
    )
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["skipped"] == 0
    assert calls["n"] == 2


def test_recompute_invalidates_legacy_rows_without_cache_keys(monkeypatch):
    # Pre-migration row carries profile_hash but NULL criteria_hash and
    # NULL rules_version. Must NOT be treated as a cache hit on the first
    # post-deploy pass.
    sb = SB()
    calls = {"n": 0}

    def _batch(*a, **k):
        calls["n"] += 1
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    profile_h, _ = _current_hashes(sb)
    _seed_existing_row(
        sb,
        profile_hash=profile_h,
        criteria_hash=None,
        rules_version=None,
    )
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["skipped"] == 0
    assert calls["n"] == 2


def test_recompute_writes_criteria_hash_and_rules_version(monkeypatch):
    # The upsert must persist the new cache keys so the next pass can skip.
    sb = SB()
    from app.eligibility.schemas import BatchEligibilityResult, EligibilityCheckResult

    def _batch(_profile, _ed, _at, _cr, post_criteria, **_k):
        return [
            BatchEligibilityResult(
                post_id=pc.post_id,
                recruitment_id=pc.recruitment_id,
                result=EligibilityCheckResult(
                    is_eligible=True, is_conditional=False, checks=[], fail_reasons=[]
                ),
            )
            for pc in post_criteria
        ]

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    rows = sb.db["eligibility_results"]
    assert len(rows) == 1
    written = rows[0]
    assert written["rules_version"] == runner.RULES_VERSION
    assert written["criteria_hash"] is not None
    assert isinstance(written["criteria_hash"], str)
    assert len(written["criteria_hash"]) == 64  # SHA-256 hex


def test_criteria_hash_stable_under_list_reordering():
    # Hash must be insensitive to the order of list-valued criteria (the DB
    # has no inherent ordering for attempt_limits, age_relaxation_rules etc.)
    from app.eligibility.schemas import AttemptLimit, PostCriteria

    pc_a = PostCriteria(
        post_id="p1",
        recruitment_id="r1",
        attempt_limits=[
            AttemptLimit(category="general", max_attempts=6),
            AttemptLimit(category="obc", max_attempts=9),
        ],
    )
    pc_b = PostCriteria(
        post_id="p1",
        recruitment_id="r1",
        attempt_limits=[
            AttemptLimit(category="obc", max_attempts=9),
            AttemptLimit(category="general", max_attempts=6),
        ],
    )
    assert runner._criteria_hash(pc_a) == runner._criteria_hash(pc_b)


def test_criteria_hash_changes_when_age_criterion_changes():
    from app.eligibility.schemas import AgeCriteria, PostCriteria

    pc_a = PostCriteria(
        post_id="p1",
        recruitment_id="r1",
        age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="2026-01-01"),
    )
    pc_b = PostCriteria(
        post_id="p1",
        recruitment_id="r1",
        age_criteria=AgeCriteria(min_age=18, max_age=35, cutoff_date="2026-01-01"),
    )
    assert runner._criteria_hash(pc_a) != runner._criteria_hash(pc_b)


def test_criteria_hash_ignores_post_identity():
    # The cache row keys on (user_id, post_id) already, so post_id/recruitment_id
    # are not part of the rule-definition fingerprint.
    from app.eligibility.schemas import PostCriteria

    pc_a = PostCriteria(post_id="p1", recruitment_id="r1", org_state="MH")
    pc_b = PostCriteria(post_id="p2", recruitment_id="r2", org_state="MH")
    assert runner._criteria_hash(pc_a) == runner._criteria_hash(pc_b)


def test_recompute_does_not_read_legacy_user_exam_attempts(monkeypatch):
    sb=SB()
    monkeypatch.setattr(runner, "check_eligibility_batch", lambda *a,**k: [])

    runner.run_eligibility_for_user("u1", sb)

    assert "aspirant_exam_attempts" in sb.queried_tables
    assert "user_exam_attempts" not in sb.queried_tables


def test_recompute_falls_back_when_post_criteria_embed_missing(monkeypatch):
    sb = FallbackSB()
    captured = {}

    def _batch(_profile, _education, _attempts, _credentials, post_criteria, **_kwargs):
        captured["post_criteria"] = post_criteria
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)

    out = runner.run_eligibility_for_user("u1", sb)

    assert out["processed"] == 0
    assert "age_criteria" in sb.queried_tables
    assert "education_criteria" in sb.queried_tables
    pc = captured["post_criteria"][0]
    assert pc.age_criteria.max_age == 35
    assert pc.education_criteria.min_qualification_level == "graduate"


def test_load_active_posts_uses_embedded_select_success_path():
    sb = SB()

    posts = runner._load_active_posts_with_criteria(sb)

    assert len(posts) == 1
    assert sb.queried_tables == ["posts"]


def test_fallback_attaches_age_and_education_rows_to_posts():
    sb = FallbackSB()

    posts = runner._load_active_posts_with_criteria(sb)

    assert posts[0]["age_criteria"][0]["max_age"] == 35
    assert posts[0]["education_criteria"][0]["min_qualification_level"] == "graduate"


def test_needs_review_recruitments_excluded_from_recompute(monkeypatch):
    sb = FallbackSB(publish_status="needs_review")
    captured = {"count": None}

    def _batch(_profile, _education, _attempts, _credentials, post_criteria, **_kwargs):
        captured["count"] = len(post_criteria)
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)

    out = runner.run_eligibility_for_user("u1", sb)

    assert out["processed"] == 0
    assert captured["count"] == 0


def test_verified_and_published_open_or_upcoming_recruitments_included(monkeypatch):
    for publish_status, status in (("verified", "open"), ("published", "upcoming")):
        sb = FallbackSB(publish_status=publish_status, status=status)
        captured = {"ids": []}

        def _batch(_profile, _education, _attempts, _credentials, post_criteria, **_kwargs):
            captured["ids"] = [pc.post_id for pc in post_criteria]
            return []

        monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
        runner.run_eligibility_for_user("u1", sb)

        assert captured["ids"] == ["p1"]
