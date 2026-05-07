import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

export default function AdminRecruitments(){
  const [items,setItems]=useState([]); const [msg,setMsg]=useState('');
  const load=()=>api.get('/api/admin/recruitments').then(d=>setItems(d.items||[]));
  useEffect(()=>{load().catch(()=>{});},[]);
  const act=async(id,a)=>{try{const r=await api.post(`/api/admin/recruitments/${id}/${a}`,{}); setMsg(`${a} ok: ${JSON.stringify(r)}`);}catch(e){setMsg(`${a} failed: ${e.message}`);} await load();};
  const summary = useMemo(()=>({unpublished: items.filter(i=>i.publish_status!=='published').length, blocked: items.filter(i=>(i.blocking_issues||[]).length>0).length}),[items]);
  return <div className='space-y-4'><h1 className='font-heading text-2xl'>Recruitment trust workflow</h1>
  <div className='grid grid-cols-2 gap-3 text-xs'><div className='soft-card p-3'>Unpublished recruitments: <b>{summary.unpublished}</b></div><div className='soft-card p-3'>Publish blocked: <b>{summary.blocked}</b></div></div>
  {msg && <div className='soft-card p-2 text-xs'>{msg}</div>}
  <div className='soft-card rounded-2xl overflow-auto'><table className='w-full text-xs'><thead><tr>{['name','publish_status','lifecycle','org verified','notification','apply','provenance','blocked','warnings','published','review_notes','actions'].map(h=><th key={h} className='text-left px-2 py-2'>{h}</th>)}</tr></thead><tbody>
  {items.map(r=>{const canPub=(r.blocking_issues||[]).length===0; return <tr key={r.id} className='border-t'><td>{r.name}<div className='text-muted-foreground'>{r.organization}</div></td><td><span className='pill pill-amber'>{r.publish_status}</span></td><td>{r.lifecycle_status}</td><td>{String(!!r.organization_verified)}</td><td>{r.official_notification_url||'—'}</td><td>{r.official_apply_url||'—'}</td><td>{r.source_provenance}</td><td>{(r.blocking_issues||[]).join(', ')||'—'}</td><td>{(r.warnings||[]).join(', ')||'—'}</td><td>{r.published_by||'—'}<div>{r.published_at||''}</div></td><td>{r.review_notes||'—'}</td><td className='space-x-1'><button className='btn btn-ghost' onClick={()=>act(r.id,'validate-publish')}>Validate</button><button className='btn btn-ghost' onClick={()=>act(r.id,'verify')}>Verify</button><button disabled={!canPub} className='btn btn-primary' onClick={()=>act(r.id,'publish')}>Publish</button><button className='btn btn-ghost' onClick={()=>act(r.id,'archive')}>Archive</button><button className='btn btn-ghost' onClick={()=>act(r.id,'withdraw')}>Withdraw</button></td></tr>})}
  </tbody></table></div></div>
}
