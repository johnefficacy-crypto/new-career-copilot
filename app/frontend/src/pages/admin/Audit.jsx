import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminAudit() {
  const [items, setItems] = useState([]); const [err,setErr]=useState(''); const [open,setOpen]=useState({});
  useEffect(() => { api.get("/api/admin/audit").then((d) => setItems(d.items || [])).catch((e) => setErr(e.message||'Failed')); }, []);
  if (err?.includes('403')) return <div className='soft-card p-4 text-sm'>You do not have <code>audit.view</code> permission.</div>;
  return <div className="space-y-6" data-testid="admin-audit"><h1 className="font-heading text-2xl">Audit log</h1>
    {err && <div className='soft-card p-2 text-xs'>{err}</div>}
    <div className="soft-card rounded-2xl overflow-hidden"><table className="w-full text-sm"><thead><tr><th className='px-2 py-2 text-left'>created_at</th><th className='px-2 py-2 text-left'>actor</th><th className='px-2 py-2 text-left'>action</th><th className='px-2 py-2 text-left'>entity</th><th className='px-2 py-2 text-left'>payload</th></tr></thead><tbody>
      {items.map((a) => (<tr key={a.id} className="border-t"><td className='px-2 py-2'>{a.created_at||a.at}</td><td>{a.actor_email||a.actor}</td><td>{a.action}</td><td>{a.entity_type||''}:{a.entity_id||a.target}</td><td><button className='btn btn-ghost' onClick={()=>setOpen(x=>({...x,[a.id]:!x[a.id]}))}>toggle</button>{open[a.id] && <pre className='text-[10px] whitespace-pre-wrap'>{JSON.stringify({old_value:a.old_value,new_value:a.new_value,notes:a.notes},null,2)}</pre>}</td></tr>))}
    </tbody></table></div></div>
}
