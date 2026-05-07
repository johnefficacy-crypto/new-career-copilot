import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminSources() {
  const [items, setItems] = useState([]);
  const [result, setResult] = useState({});
  const load = () => api.get("/api/admin/sources").then((d) => setItems(d.items || []));
  useEffect(() => { load().catch(() => {}); }, []);
  const verify = async (id) => {
    const r = await api.post(`/api/admin/sources/${id}/verify`, {});
    setResult((x) => ({ ...x, [id]: r }));
    await load();
  };
  return <div className="space-y-4" data-testid="admin-sources"><h1 className="font-heading text-2xl">Sources trust</h1>
    <div className="soft-card rounded-2xl overflow-auto"><table className="w-full text-xs"><thead><tr>{["name","official_url","notification_url","verification_status","verified","trust","active","last_success","last_error","fails","anti_bot_risk","captcha","pdf","notes","action"].map(h=><th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead><tbody>
      {items.map(s=><tr key={s.id} className="border-t"><td className="px-2 py-2">{s.org}</td><td>{s.official_url||s.url}</td><td>{s.notification_url||"—"}</td><td>{s.verification_status||"—"}</td><td>{String(!!s.is_verified)}</td><td>{s.trust_score ?? "—"}</td><td>{String(!!s.is_active)}</td><td>{s.last_success_at||"—"}</td><td>{s.last_error||"—"}</td><td>{s.consecutive_fails||0}</td><td>{s.anti_bot_risk||"—"}</td><td>{String(!!s.has_captcha)}</td><td>{String(!!s.pdf_only)}</td><td>{s.notes||"—"}</td><td><button className="btn btn-ghost" onClick={()=>verify(s.id)}>Verify</button></td></tr>)}
    </tbody></table></div>
    {Object.entries(result).map(([id, r]) => <div key={id} className="text-xs soft-card p-2">{id}: checks={JSON.stringify(r.checks)} warnings={JSON.stringify(r.warnings)} errors={JSON.stringify(r.errors)}</div>)}
  </div>
}
