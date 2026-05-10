from app.eligibility import runner


class E:
    def __init__(self, data): self.data = data


class Q:
    def __init__(self, name, db):
        self.name=name; self.db=db; self.f={}
    def select(self,*a,**k): return self
    def eq(self,k,v): self.f[k]=v; return self
    def in_(self,*a,**k): return self
    def or_(self,*a,**k): return self
    def order(self,*a,**k): return self
    def execute(self):
        rows=[r for r in self.db.get(self.name,[]) if all(r.get(k)==v for k,v in self.f.items())]
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
            "posts":[{"id":"p1","recruitment_id":"r1","age_criteria":[],"education_criteria":[],"attempt_limits":[],"certification_criteria":[],"recruitments":{"organizations":{"state":"MH"}}}],
            "eligibility_results":[],"notification_alerts":[],"recruitments":[]
        }
    def table(self,n):
        self.queried_tables.append(n)
        return Q(n,self.db)


def test_first_recompute_stores_profile_hash(monkeypatch):
    sb=SB()
    monkeypatch.setattr(runner, "check_eligibility_batch", lambda *a,**k: [])
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["processed"] == 0
    assert out["skipped"] == 0


def test_second_recompute_skips_when_hash_unchanged(monkeypatch):
    sb=SB()
    calls={"n":0}
    def _batch(*a, **k): calls["n"] += 1; return []
    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    # seed a matching cached row with hash from current profile
    h = runner._profile_hash(runner.build_user_eligibility_profile(sb, "u1").model_dump())
    sb.db["eligibility_results"].append({"user_id":"u1","post_id":"p1","profile_hash":h,"computed_at":"2026-01-01T00:00:00Z"})
    out = runner.run_eligibility_for_user("u1", sb)
    assert out["skipped"] == 1
    assert calls["n"] == 2


def test_recompute_does_not_read_legacy_user_exam_attempts(monkeypatch):
    sb=SB()
    monkeypatch.setattr(runner, "check_eligibility_batch", lambda *a,**k: [])

    runner.run_eligibility_for_user("u1", sb)

    assert "aspirant_exam_attempts" in sb.queried_tables
    assert "user_exam_attempts" not in sb.queried_tables
