from app.api import admin_scrape

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
                    def upsert(self,p, on_conflict=None): self.p=p; return self
                    def execute(self):
                        if self.p is None: return R([])
                        self.s.state['field'].append(self.p); return R([self.p])
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
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
                return FQ()
            return super().table(t)
    sb=SB3(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    sb.state['queue'][0]['status']='pending'
    import pytest
    with pytest.raises(Exception):
        admin_scrape.promote_queue_item('q1', {'id':'a','email':'e'})


def test_field_evidence_requires_document_id(monkeypatch):
    class SB4(SB):
        def __init__(self): super().__init__(); self.state["queue"][0]["notification_document_id"]=None
        def table(self,t):
            if t=="extracted_field_evidence":
                class FQ:
                    def select(self,*a,**k): return self
                    def eq(self,*a,**k): return self
                    def limit(self,*a,**k): return self
                    def execute(self): return R([])
                    def upsert(self,*a,**k): return self
                return FQ()
            return super().table(t)
    import pytest
    sb=SB4(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    with pytest.raises(Exception):
        admin_scrape.verify_field('q1','title',{'notes':'n'},{'id':'a','email':'e'})


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
                return FQ()
            return super().table(t)
    sb=SB5(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    import app.scraping.runner as runner
    monkeypatch.setattr(runner, 'promote_to_recruitments', lambda extracted, supabase: 'r1')
    sb.state['queue'][0]['status']='approved'
    out=admin_scrape.promote_queue_item('q1', {'id':'a','email':'e'})
    assert out['publish_status']=='needs_review'
    assert sb.state['queue'][0]['status']=='promoted'


def test_promote_run_no_alert_fanout(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_scrape,'get_supabase_admin',lambda:sb)
    monkeypatch.setattr(admin_scrape, 'promote_run', lambda run_id, supabase, reviewer_id=None: {"run_id": run_id, "recruitment_ids": ["r1","r2"]})
    called={"n":0}
    monkeypatch.setattr(admin_scrape, 'alert_users_for_new_recruitment', lambda *a, **k: called.__setitem__('n', called['n']+1) or 1)
    out=admin_scrape.promote_run_endpoint('run1', {'id':'a','email':'e'})
    assert out.get('alerts_sent') == 0
    assert called['n'] == 0
