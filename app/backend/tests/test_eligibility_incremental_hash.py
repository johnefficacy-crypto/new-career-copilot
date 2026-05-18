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
            "aspirant_exam_attempts":[],"aspirant_recruitment_attempts":[],
            "aspirant_exam_credentials":[],"tracked_recruitments":[],
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
    from app.db.utils import safe_select
    from app.eligibility.schemas import PostCriteria

    # Faithful mirror of the runner: profile_hash folds in BOTH the mapper
    # output and the recruitment/post-scoped attempt rows.
    mapped = runner.build_user_eligibility_profile(sb, "u1").model_dump()
    rec_attempts = safe_select(
        sb,
        "aspirant_recruitment_attempts",
        "recruitment_id, post_id, attempts_used",
        user_id="u1",
    )
    h = runner._profile_hash(mapped, rec_attempts)
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


def test_profile_hash_includes_recruitment_attempts():
    # Gap 1 regression: aspirant_recruitment_attempts is a second attempt
    # source that the mapper does not cover. _profile_hash must fold it in,
    # otherwise a change to a cycle/post attempt count leaves the cache key
    # unchanged and the runner serves a stale verdict.
    mapped = runner.build_user_eligibility_profile(SB(), "u1").model_dump()
    base = runner._profile_hash(mapped, [])
    with_attempt = runner._profile_hash(
        mapped,
        [{"recruitment_id": "r1", "post_id": None, "attempts_used": 2}],
    )
    assert base != with_attempt
    # Same input → same hash (stable).
    assert with_attempt == runner._profile_hash(
        mapped,
        [{"recruitment_id": "r1", "post_id": None, "attempts_used": 2}],
    )
    # A different attempt count → different hash.
    bumped = runner._profile_hash(
        mapped,
        [{"recruitment_id": "r1", "post_id": None, "attempts_used": 3}],
    )
    assert with_attempt != bumped


def test_profile_hash_recruitment_attempts_order_insensitive():
    # The DB has no inherent row order; the hash must not depend on it.
    mapped = runner.build_user_eligibility_profile(SB(), "u1").model_dump()
    rows_a = [
        {"recruitment_id": "r1", "post_id": None, "attempts_used": 2},
        {"recruitment_id": "r2", "post_id": "p9", "attempts_used": 1},
    ]
    rows_b = list(reversed(rows_a))
    assert runner._profile_hash(mapped, rows_a) == runner._profile_hash(mapped, rows_b)


def test_recompute_invalidates_when_recruitment_attempts_change(monkeypatch):
    # Gap 1 end-to-end: a cached row whose profile_hash was computed with
    # one recruitment-attempt count must be recomputed once that count
    # changes — even though profiles / education / exam_attempts are all
    # untouched and criteria + rules_version still match.
    sb = SB()
    sb.db["aspirant_recruitment_attempts"] = [
        {"user_id": "u1", "recruitment_id": "r1", "post_id": None, "attempts_used": 1},
    ]
    calls = {"n": 0}

    def _batch(*a, **k):
        calls["n"] += 1
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)

    # Seed a cached row matching the CURRENT state (1 attempt).
    profile_h, criteria_h = _current_hashes(sb)
    _seed_existing_row(
        sb,
        profile_hash=profile_h,
        criteria_hash=criteria_h,
        rules_version=runner.RULES_VERSION,
    )
    # Sanity: with the state unchanged, the second pass skips.
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["skipped"] == 1

    # Now the user logs another attempt for this recruitment cycle.
    sb.db["aspirant_recruitment_attempts"][0]["attempts_used"] = 2
    out = runner.run_eligibility_for_user("u1", sb)
    # The cache key changed → recompute, no skip.
    assert out["skipped"] == 0


def test_rules_version_is_current_marker():
    # Gap 3 guard: RULES_VERSION must be past the "2026.05" cut that
    # pre-dates scope-aware attempts / cert-issuer / CGPA-basis /
    # discipline-alias / education-taxonomy semantics. A PR that changes
    # verdict logic without bumping this will trip here.
    assert runner.RULES_VERSION != "2026.05"
    assert runner.RULES_VERSION >= "2026.06"


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


def test_recompute_persists_full_check_list(monkeypatch):
    # `eligibility_results.checks` must carry the structured rule-by-rule
    # verdict, not just the fail_reasons strings. Admins need to see *every*
    # rule's pass/fail status for audit, even passed ones.
    sb = SB()
    from app.eligibility.schemas import (
        BatchEligibilityResult,
        EligibilityCheck,
        EligibilityCheckResult,
    )

    sample_checks = [
        EligibilityCheck(rule="age", passed=True, detail="Age 24 in range"),
        EligibilityCheck(rule="education", passed=False, detail="Below 60%"),
        EligibilityCheck(rule="nationality", passed=True, detail="Indian"),
    ]

    def _batch(_profile, _ed, _at, _cr, post_criteria, **_k):
        return [
            BatchEligibilityResult(
                post_id=pc.post_id,
                recruitment_id=pc.recruitment_id,
                result=EligibilityCheckResult(
                    is_eligible=False,
                    is_conditional=False,
                    checks=sample_checks,
                    fail_reasons=["Below 60%"],
                ),
            )
            for pc in post_criteria
        ]

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    written = sb.db["eligibility_results"][0]
    assert "checks" in written
    persisted = written["checks"]
    assert isinstance(persisted, list)
    assert len(persisted) == 3
    # Every persisted element is the JSON form of EligibilityCheck.
    rules = {c["rule"] for c in persisted}
    assert rules == {"age", "education", "nationality"}
    education_check = next(c for c in persisted if c["rule"] == "education")
    assert education_check["passed"] is False
    assert "Below 60%" in education_check["detail"]
    # Passed checks must also be persisted — fail_reasons drops them, but the
    # structured column should not.
    age_check = next(c for c in persisted if c["rule"] == "age")
    assert age_check["passed"] is True


def test_recompute_persists_empty_checks_when_no_criteria(monkeypatch):
    # When the engine has no rules to evaluate (rare), persist an empty
    # array, not NULL — keeps downstream readers from having to branch.
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
    written = sb.db["eligibility_results"][0]
    assert written["checks"] == []


def test_recompute_overwrites_stale_checks(monkeypatch):
    # When criteria_hash / rules_version invalidates a cached row, the new
    # `checks` array must replace the old one — not be appended.
    sb = SB()
    from app.eligibility.schemas import (
        BatchEligibilityResult,
        EligibilityCheck,
        EligibilityCheckResult,
    )

    # Seed a stale row with old checks.
    sb.db["eligibility_results"].append(
        {
            "user_id": "u1",
            "post_id": "p1",
            "recruitment_id": "r1",
            "profile_hash": "old",
            "criteria_hash": "old",
            "rules_version": "old",
            "is_eligible": False,
            "is_conditional": False,
            "fail_reasons": ["old reason"],
            "checks": [{"rule": "old_rule", "passed": False, "detail": "old detail"}],
            "computed_at": "2020-01-01T00:00:00Z",
        }
    )

    def _batch(_profile, _ed, _at, _cr, post_criteria, **_k):
        return [
            BatchEligibilityResult(
                post_id=pc.post_id,
                recruitment_id=pc.recruitment_id,
                result=EligibilityCheckResult(
                    is_eligible=True,
                    is_conditional=False,
                    checks=[
                        EligibilityCheck(rule="nationality", passed=True, detail="Indian")
                    ],
                    fail_reasons=[],
                ),
            )
            for pc in post_criteria
        ]

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    rows = sb.db["eligibility_results"]
    assert len(rows) == 1  # upsert, not insert
    new_checks = rows[0]["checks"]
    assert len(new_checks) == 1
    assert new_checks[0]["rule"] == "nationality"


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
    # certification_criteria is loaded flat (no PostgREST embed); the
    # primary success path still does the wide posts embed and then one
    # follow-up flat read for certification_criteria.
    assert sb.queried_tables[0] == "posts"
    assert "certification_criteria" in sb.queried_tables


def test_fallback_attaches_age_and_education_rows_to_posts():
    sb = FallbackSB()

    posts = runner._load_active_posts_with_criteria(sb)

    assert posts[0]["age_criteria"][0]["max_age"] == 35
    assert posts[0]["education_criteria"][0]["min_qualification_level"] == "graduate"


# ── Gap 8: criteria-table loads fail closed on transient errors ────────────


class _CriteriaErrorQ(FallbackQ):
    """FallbackQ that raises a chosen error when a chosen criteria table
    is queried in the per-table fallback loop."""

    def __init__(self, name, db, error_table, error_exc):
        super().__init__(name, db)
        self._error_table = error_table
        self._error_exc = error_exc

    def execute(self):
        if self.name == self._error_table:
            raise self._error_exc
        return super().execute()


def _criteria_error_sb(error_table: str, error_exc: Exception):
    class _SB(FallbackSB):
        def table(self, n):
            self.queried_tables.append(n)
            return _CriteriaErrorQ(n, self.db, error_table, error_exc)

    return _SB()


def test_criteria_fallback_reraises_transient_table_failure():
    # A transient/unexpected failure on an expected criteria table
    # (attempt_limits) must NOT be swallowed into "no rows" — that would
    # silently produce an overly-permissive verdict. The loader re-raises.
    sb = _criteria_error_sb(
        "attempt_limits",
        RuntimeError("503 upstream connect error / connection timeout"),
    )
    try:
        runner._load_active_posts_with_criteria(sb)
        assert False, "expected the transient failure to propagate"
    except RuntimeError as exc:
        assert "timeout" in str(exc)


def test_criteria_fallback_degrades_on_genuinely_missing_table():
    # A genuine "relation does not exist" / PGRST205 means the table is
    # absent in this (older) deployment — safe to treat as no rows.
    sb = _criteria_error_sb(
        "attempt_limits",
        RuntimeError('relation "public.attempt_limits" does not exist'),
    )
    posts = runner._load_active_posts_with_criteria(sb)
    assert posts[0]["attempt_limits"] == []
    # Other criteria still loaded normally.
    assert posts[0]["age_criteria"][0]["max_age"] == 35


def test_criteria_fallback_reraises_transient_certification_failure():
    # Same fail-closed contract for the certification_criteria fetch.
    sb = _criteria_error_sb(
        "certification_criteria",
        RuntimeError("500 internal error from PostgREST"),
    )
    try:
        runner._load_active_posts_with_criteria(sb)
        assert False, "expected the transient failure to propagate"
    except RuntimeError as exc:
        assert "500" in str(exc)


def test_criteria_fallback_transient_failure_surfaces_as_database_error(monkeypatch):
    # End-to-end: a transient criteria-table failure inside the runner is
    # caught and re-raised as DatabaseError, so the recompute fails loud
    # instead of writing a falsely-permissive verdict.
    from app.core.errors import DatabaseError

    sb = _criteria_error_sb(
        "attempt_limits",
        RuntimeError("connection reset by peer"),
    )
    monkeypatch.setattr(runner, "check_eligibility_batch", lambda *a, **k: [])
    try:
        runner.run_eligibility_for_user("u1", sb)
        assert False, "expected DatabaseError"
    except DatabaseError:
        pass


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


def test_runner_populates_requires_domicile_from_post_row(monkeypatch):
    # Canonical `posts.requires_domicile` (migration 042) must reach
    # PostCriteria so the engine's domicile gate fires for posts the admin
    # marked as domicile-only.
    sb = FallbackSB()
    sb.db["posts"][0]["requires_domicile"] = True
    captured = {"requires_domicile": None}

    def _batch(_profile, _ed, _at, _cr, post_criteria, **_kwargs):
        captured["requires_domicile"] = post_criteria[0].requires_domicile
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    assert captured["requires_domicile"] is True


def test_runner_defaults_requires_domicile_false_when_column_absent(monkeypatch):
    # Older posts that pre-date migration 042 may return NULL. The bool()
    # coercion in the runner guards against passing None into PostCriteria,
    # which would crash the pydantic bool type.
    sb = FallbackSB()
    sb.db["posts"][0].pop("requires_domicile", None)  # column absent
    captured = {"requires_domicile": None}

    def _batch(_profile, _ed, _at, _cr, post_criteria, **_kwargs):
        captured["requires_domicile"] = post_criteria[0].requires_domicile
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    assert captured["requires_domicile"] is False


class _CertEmbedSB(FallbackSB):
    """FallbackSB with seeded certification_criteria + certifications tables
    and a fail-on-embed Q so any PGRST embed of certifications inside a
    certification_criteria select raises PGRST200 — the exact production
    failure being fixed."""

    def __init__(self):
        super().__init__()
        # certification_criteria columns (002_core_runtime_schema.sql:41):
        # post_id uuid, certification_name text, required boolean default true.
        self.db["certification_criteria"] = [
            {"post_id": "p1", "certification_name": "PMP", "required": True},
            {"post_id": "p1", "certification_name": "AWS Cloud Practitioner", "required": False},
        ]
        # certifications columns (002_core_runtime_schema.sql:16): id, name,
        # issuing_body, is_active. No issuer/aliases columns.
        self.db["certifications"] = [
            {"id": "ck1", "name": "PMP", "issuing_body": "PMI", "is_active": True},
            {"id": "ck2", "name": "AWS Cloud Practitioner", "issuing_body": "AWS", "is_active": True},
        ]

    def table(self, n):
        self.queried_tables.append(n)
        return _CertQ(n, self.db)


class _CertQ(FallbackQ):
    def execute(self):
        if self.name == "certification_criteria" and "certifications" in self._select:
            # PostgREST embed missing: certifications is not declared as an
            # FK target on certification_criteria in this schema.
            raise RuntimeError(
                "PGRST200 Could not find a relationship between "
                "certification_criteria and certifications in the schema cache"
            )
        return super().execute()


def test_load_active_posts_returns_certification_criteria_rows_flat():
    # Item 4 contract: loader must surface certification_criteria rows
    # without embedding `certifications(...)` (no FK exists; PGRST200 in
    # prod). Two seeded criteria rows for p1 → both must come through.
    sb = _CertEmbedSB()
    posts = runner._load_active_posts_with_criteria(sb)
    cc = posts[0]["certification_criteria"]
    names = sorted((row.get("certifications") or {}).get("name") or row.get("certification_name") for row in cc)
    assert names == ["AWS Cloud Practitioner", "PMP"]


def test_load_active_posts_certification_required_flag_is_preserved():
    sb = _CertEmbedSB()
    posts = runner._load_active_posts_with_criteria(sb)
    by_name = {}
    for row in posts[0]["certification_criteria"]:
        nm = (row.get("certifications") or {}).get("name") or row.get("certification_name")
        by_name[nm] = row
    # Migration column is `required`; loader must surface it.
    assert by_name["PMP"].get("required") is True
    assert by_name["AWS Cloud Practitioner"].get("required") is False


def test_load_active_posts_joins_issuer_from_certifications_table():
    sb = _CertEmbedSB()
    posts = runner._load_active_posts_with_criteria(sb)
    by_name = {
        (row.get("certifications") or {}).get("name"): (row.get("certifications") or {})
        for row in posts[0]["certification_criteria"]
    }
    assert by_name["PMP"]["issuer"] == "PMI"
    assert by_name["AWS Cloud Practitioner"]["issuer"] == "AWS"


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
