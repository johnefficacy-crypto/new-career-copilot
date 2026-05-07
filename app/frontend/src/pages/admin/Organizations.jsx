import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminOrganizations(){
  const [items,setItems]=useState([]);
  const load=()=>api.get('/api/admin/organizations').then(d=>setItems(d.items||[]));
  useEffect(()=>{load().catch(()=>{});},[]);
  const verify=async(id)=>{await api.post(`/api/admin/organizations/${id}/verify`,{}); await load();};
  return <div className='space-y-4'><h1 className='font-heading text-2xl'>Organizations trust</h1><div className='soft-card rounded-2xl overflow-auto'><table className='w-full text-xs'><thead><tr>{['name','type','state','website','official_domain','is_verified','trust_tier','verification_notes','verified_at','sources','recruitments','action'].map(h=><th key={h} className='text-left px-2 py-2'>{h}</th>)}</tr></thead><tbody>{items.map(o=><tr key={o.id} className='border-t'><td>{o.name}</td><td>{o.type}</td><td>{o.state||'—'}</td><td>{o.website_url||o.official_website||'—'}</td><td>{o.official_domain||'—'}</td><td>{String(!!o.is_verified)}</td><td>{o.trust_tier||'—'}</td><td>{o.verification_notes||'—'}</td><td>{o.verified_at||'—'}</td><td>{o.linked_sources_count}</td><td>{o.linked_recruitments_count}</td><td><button className='btn btn-ghost' onClick={()=>verify(o.id)}>Verify</button></td></tr>)}</tbody></table></div></div>
}
