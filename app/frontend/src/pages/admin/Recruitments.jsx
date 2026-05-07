import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminRecruitments(){
  const [items,setItems]=useState([]);
  const load=()=>api.get('/api/admin/recruitments').then(d=>setItems(d.items||[]));
  useEffect(()=>{load().catch(()=>{});},[]);
  const act=async(id,a)=>{await api.post(`/api/admin/recruitments/${id}/${a}`,{}); await load();};
  return <div className='space-y-4'><h1 className='font-heading text-2xl'>Recruitment trust workflow</h1>
  <div className='soft-card rounded-2xl overflow-auto'><table className='w-full text-xs'><thead><tr>{['name','organization','publish_status','lifecycle','notif','apply','dates','provenance','blocking','warnings','actions'].map(h=><th key={h} className='text-left px-2 py-2'>{h}</th>)}</tr></thead><tbody>
  {items.map(r=>{const canPub=(r.blocking_issues||[]).length===0; return <tr key={r.id} className='border-t'><td>{r.name}</td><td>{r.organization}</td><td>{r.publish_status}</td><td>{r.lifecycle_status}</td><td>{r.official_notification_url||'—'}</td><td>{r.official_apply_url||'—'}</td><td>{r.apply_start_date}→{r.apply_end_date}</td><td>{r.source_provenance_count}</td><td>{(r.blocking_issues||[]).join(', ')||'—'}</td><td>{(r.warnings||[]).join(', ')||'—'}</td><td className='space-x-1'><button className='btn btn-ghost' onClick={()=>act(r.id,'validate-publish')}>Validate</button><button className='btn btn-ghost' onClick={()=>act(r.id,'verify')}>Verify</button><button disabled={!canPub} className='btn btn-primary' onClick={()=>act(r.id,'publish')}>Publish</button><button className='btn btn-ghost' onClick={()=>act(r.id,'archive')}>Archive</button><button className='btn btn-ghost' onClick={()=>act(r.id,'withdraw')}>Withdraw</button></td></tr>})}
  </tbody></table></div></div>
}
