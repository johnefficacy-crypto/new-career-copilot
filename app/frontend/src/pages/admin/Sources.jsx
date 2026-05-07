import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

export default function AdminSources() {
  const [items, setItems] = useState([]); const [result, setResult] = useState({}); const [form,setForm]=useState({source_name:"",official_url:""}); const [msg,setMsg]=useState("");
  const load = () => api.get("/api/admin/sources").then((d) => setItems(d.items || []));
  useEffect(() => { load().catch(() => {}); }, []);
  const verify = async (id) => { const r = await api.post(`/api/admin/sources/${id}/verify`, {}); setResult((x) => ({ ...x, [id]: r })); await load(); };
  const create=async()=>{try{await api.post("/api/admin/sources",form);setMsg("source created");setForm({source_name:"",official_url:""});await load();}catch(e){setMsg(e.message)}};
  const toggle=async(id,on)=>{await api.post(`/api/admin/sources/${id}/${on?"deactivate":"activate"}`,{}); await load();};
  const summary=useMemo(()=>({needsReview:items.filter(i=>i.verification_status==='needs_review').length, failed:items.filter(i=>(i.consecutive_fails||0)>0).length}),[items]);
  return <div className="space-y-4" data-testid="admin-sources"><h1 className="font-heading text-2xl">Sources trust</h1>
    <div className='grid grid-cols-2 gap-3 text-xs'><div className='soft-card p-3'>Sources needing review: <b>{summary.needsReview}</b></div><div className='soft-card p-3'>Recently failed sources: <b>{summary.failed}</b></div></div>
    {msg && <div className="soft-card p-2 text-xs">{msg}</div>}<div className="soft-card p-2 text-xs flex gap-2"><input className="border px-2" placeholder="source name" value={form.source_name} onChange={e=>setForm({...form,source_name:e.target.value})}/><input className="border px-2" placeholder="official url" value={form.official_url} onChange={e=>setForm({...form,official_url:e.target.value})}/><button className="btn btn-primary" onClick={create}>Create Source</button></div><div className="soft-card rounded-2xl overflow-auto"><table className="w-full text-xs"><thead><tr>{["source","official_url","notification_url","type","trust","verified","verification","anti_bot","playwright","captcha","pdf","last_success","last_error","fails","notes","action"].map(h=><th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead><tbody>
      {items.map(s=><tr key={s.id} className="border-t"><td>{s.org}</td><td>{s.official_url||s.url}</td><td>{s.notification_url||"—"}</td><td>{s.kind}</td><td>{s.trust_score??'—'}</td><td>{String(!!s.is_verified)}</td><td>{s.verification_status||'—'}</td><td>{s.anti_bot_risk||'—'}</td><td>{String(!!s.requires_playwright)}</td><td>{String(!!s.has_captcha)}</td><td>{String(!!s.pdf_only)}</td><td>{s.last_success_at||'—'}</td><td>{s.last_error||'—'}</td><td>{s.consecutive_fails||0}</td><td>{s.notes||'—'}</td><td><button className="btn btn-ghost" onClick={()=>verify(s.id)}>Verify</button><button className="btn btn-ghost" onClick={()=>toggle(s.id,!!s.is_active)}>{s.is_active?"Deactivate":"Activate"}</button></td></tr>)}
    </tbody></table></div>
    {Object.entries(result).map(([id, r]) => <div key={id} className="text-xs soft-card p-2">{id}: checks={JSON.stringify(r.checks)} warnings={JSON.stringify(r.warnings)} errors={JSON.stringify(r.errors)}</div>)}
  </div>
}
