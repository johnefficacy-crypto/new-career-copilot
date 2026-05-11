from app.api import admin_scrape
import pytest

class R:
    def __init__(self,data=None,count=None): self.data=data; self.count=count
class Q:
    def __init__(self,t,s): self.t=t; self.s=s; self.id=None; self.payload=None
    def select(self,*a,**k): return self
    def eq(self,k,v):
        if k=='id': self.id=v
        return self
    def limit(self,*a,**k): return self
    def update(self,p): self.payload=p; return self
    def insert(self,p): self.payload=p; return self
    def execute(self):
        if self.t=='admin_audit_logs': self.s['audits'].append(self.payload); return R([{}])
        if self.t=='scrape_queue':
            row=self.s['queue'][0]
            if self.payload: row.update(self.payload)
            return R([row])
        return R([])
class SB:
    def __init__(self): self.state={'queue':[{'id':'q1','status':'approved','notification_document_id':'doc-1','extracted_data':{'title':'t','organization_name':'Org','org_type':'central','year':2026,'official_notification_url':'https://x.gov/n'}}],'audits':[]}
    def table(self,t): return Q(t,self.state)

def test_list_sources_uses_source_registry_only(monkeypatch):
    class SourceQ:
        def __init__(self, table, calls):
            self.table = table
            self.calls = calls
        def select(self, *a, **k): return self
        def order(self, *a, **k): return self
        def execute(self):
            self.calls.append(self.table)
            return R([])

    class SourceSB:
        def __init__(self):
            self.calls = []
        def table(self, table):
            return SourceQ(table, self.calls)

    sb = SourceSB()
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: sb)

    assert admin_scrape._list_sources() == {"items": []}
    assert sb.calls == ["source_registry"]

def test_approve_updates_status(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    r=admin_scrape.approve_queue_item('q1', {'notes':'ok'}, {'id':'a','email':'e'})
    assert r['status']=='approved' and sb.state['queue'][0]['reviewer_id']=='a'

def test_reject_writes_audit(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    admin_scrape.reject_queue_item('q1', {'notes':'bad'}, {'id':'a','email':'e'})
    assert any(a.get('action')=='scrape.queue.reject' for a in sb.state['audits'])

def test_promote_never_publishes(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    import app.scraping.runner as runner
    import app.scraping.schemas as schemas
    monkeypatch.setattr(runner, 'promote_to_recruitments', lambda extracted, supabase: 'r1')
    monkeypatch.setattr(admin_scrape, 'alert_users_for_new_recruitment', lambda *a, **k: 0)
    # ensure pending accepted
    sb.state['queue'][0]['status']='pending'
    import pytest
    with pytest.raises(Exception):
        admin_scrape.promote_queue_item('q1', {'id':'a','email':'e'})

def test_field_verify_reject_correct_audit(monkeypatch):
    class SB2(SB):
        def __init__(self): super().__init__(); self.state['field']=[]
        def table(self,t):
            if t=='extracted_field_evidence':
                class FQ:
                    def __init__(self,s): self.s=s; self.p=None
                    def insert(self,p): self.p=p; return self
                    def update(self,p): self.p=p; return self
                    def execute(self):
                        if self.p is None: return R([])
                        self.s.state['field'].append(self.p); return R([self.p])
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def order(self,*a,**k): return self
                    def limit(self,*a,**k): return self
                return FQ(self)
            return super().table(t)
    sb=SB2(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    admin_scrape.verify_field('q1','apply_end_date',{'notes':'ok'},{'id':'a','email':'e'})
    admin_scrape.reject_field('q1','apply_end_date',{'notes':'bad'},{'id':'a','email':'e'})
    admin_scrape.correct_field('q1','apply_end_date',{'corrected_value':'2026-06-01'},{'id':'a','email':'e'})
    assert any(x.get('reviewer_status')=='corrected' for x in sb.state['field'])


def test_promote_blocks_unverified_high_risk(monkeypatch):
    class SB3(SB):
        def table(self,t):
            if t=='extracted_field_evidence':
                class FQ:
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def execute(self): return R([{'field_name':'apply_end_date','reviewer_status':'unverified'}])
                return FQ(self)
            return super().table(t)
    sb=SB3(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    sb.state['queue'][0]['status']='pending'
    import pytest
    with pytest.raises(Exception):
        admin_scrape.promote_queue_item('q1', {'id':'a','email':'e'})


def test_field_evidence_fallback_document_created(monkeypatch):
    class SB4(SB):
        def __init__(self): super().__init__(); self.state["queue"][0]["notification_document_id"]=None; self.state["docs"]=[]; self.state["field"]=[]
        def table(self,t):
            if t=="extracted_field_evidence":
                class FQ:
                    def __init__(self,s): self.s=s; self.p=None
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def order(self,*a,**k): return self
                    def limit(self,*a,**k): return self
                    def execute(self): return R([])
                    def insert(self,p,*a,**k): self.s.state["field"].append(p); return self
                    def update(self,p,*a,**k): self.s.state["field"].append(p); return self
                return FQ(self)
            if t=="notification_documents":
                class DQ:
                    def __init__(self,s): self.s=s; self.payload=None
                    def insert(self,p): self.payload=p; return self
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def limit(self,*a,**k): return self
                    def execute(self):
                        if self.payload:
                            row={"id":"doc-fallback", **self.payload}; self.s.state["docs"]=[row]; return R([row])
                        return R(self.s.state["docs"])
                return DQ(self)
            return super().table(t)
    sb=SB4(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    out = admin_scrape.verify_field('q1','title',{'notes':'n'},{'id':'a','email':'e'})
    assert out["ok"] is True
    assert sb.state["queue"][0]["notification_document_id"] == "doc-fallback"
    assert sb.state["field"][0]["document_id"] == "doc-fallback"


def test_promote_sets_status_promoted_when_high_risk_verified(monkeypatch):
    class SB5(SB):
        def table(self,t):
            if t=='extracted_field_evidence':
                class FQ:
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def execute(self):
                        return R([
                            {'field_name':'apply_end_date','reviewer_status':'verified'},
                            {'field_name':'official_notification_url','reviewer_status':'verified'},
                            {'field_name':'official_apply_url','reviewer_status':'verified'},
                            {'field_name':'organization_name','reviewer_status':'verified'},
                            {'field_name':'total_vacancies','reviewer_status':'verified'},
                            {'field_name':'eligibility','reviewer_status':'verified'},
                        ])
                return FQ(self)
            return super().table(t)
    sb=SB5(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    import app.scraping.runner as runner
    monkeypatch.setattr(runner, 'promote_to_recruitments', lambda extracted, supabase: 'r1')
    sb.state['queue'][0]['status']='approved'
    out=admin_scrape.promote_queue_item('q1', {'id':'a','email':'e'})
    assert out['publish_status']=='needs_review'
    assert sb.state['queue'][0]['status']=='approved'


def test_promote_failure_keeps_queue_item_pending(monkeypatch):
    class SB7(SB):
        def table(self,t):
            if t=='extracted_field_evidence':
                class FQ:
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def execute(self):
                        return R([
                            {'field_name':'apply_end_date','reviewer_status':'verified'},
                            {'field_name':'official_notification_url','reviewer_status':'verified'},
                            {'field_name':'official_apply_url','reviewer_status':'verified'},
                            {'field_name':'organization_name','reviewer_status':'verified'},
                            {'field_name':'total_vacancies','reviewer_status':'verified'},
                            {'field_name':'eligibility','reviewer_status':'verified'},
                        ])
                return FQ(self)
            return super().table(t)
    sb=SB7(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    import app.scraping.runner as runner
    def _boom(*_args, **_kwargs):
        raise RuntimeError("promotion write failed")
    monkeypatch.setattr(runner, 'promote_to_recruitments', _boom)
    sb.state['queue'][0]['status']='pending'
    import pytest
    with pytest.raises(Exception):
        admin_scrape.promote_queue_item('q1', {'id':'a','email':'e'})
    assert sb.state['queue'][0]['status']=='pending'


def test_verify_updates_existing_row_without_upsert(monkeypatch):
    class SB6(SB):
        def __init__(self): super().__init__(); self.state["updated"]=[]
        def table(self,t):
            if t=="extracted_field_evidence":
                class FQ:
                    def __init__(self,s): self.s=s; self.payload=None; self.sel=True
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def order(self,*a,**k): return self
                    def limit(self,*a,**k): return self
                    def update(self,p): self.payload=p; self.sel=False; return self
                    def execute(self):
                        if self.sel: return R([{"id":"efe-1","document_id":"doc-1"}])
                        self.s.state["updated"].append(self.payload); return R([self.payload])
                return FQ(self)
            return super().table(t)
    sb=SB6(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    out=admin_scrape.verify_field('q1','title',{'notes':'ok'},{'id':'a','email':'e'})
    assert out["ok"] is True
    assert sb.state["updated"]


def test_validate_queue_id_rejects_invalid():
    with pytest.raises(Exception):
        admin_scrape._validate_queue_id("")


def test_review_body_limits_notes():
    with pytest.raises(Exception):
        admin_scrape.ReviewBody(notes="x" * 2001)
