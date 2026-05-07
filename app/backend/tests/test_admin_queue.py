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
    def __init__(self): self.state={'queue':[{'id':'q1','status':'approved','extracted_data':{'title':'t','organization_name':'Org','org_type':'central','year':2026,'official_notification_url':'https://x.gov/n'}}],'audits':[]}
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
    out=admin_scrape.promote_queue_item('q1', {'id':'a','email':'e'})
    assert out['publish_status'] in {'needs_review','draft'}
