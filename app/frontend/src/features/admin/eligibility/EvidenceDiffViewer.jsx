import React from "react";

const toObj = (v) => (v && typeof v === "object" ? v : {});
const fmt = (v) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function EvidenceDiffViewer({ extracted, normalized, previous }) {
  const a = toObj(extracted);
  const b = toObj(normalized);
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();

  return <div className="soft-card p-3 space-y-3"><div className="text-[11px] uppercase tracking-widest text-muted-foreground">Evidence comparison</div>{!previous ? <div className="text-xs text-muted-foreground">No previous extraction version recorded yet.</div> : null}<table className="w-full text-xs"><thead><tr><th className="text-left">Field</th><th className="text-left">Extracted</th><th className="text-left">Normalized</th><th className="text-left">Label</th></tr></thead><tbody>{keys.map((k) => { const av = a[k]; const bv = b[k]; const same = JSON.stringify(av) === JSON.stringify(bv); const missing = av == null || av === "" || bv == null || bv === ""; return <tr key={k}><td>{k}</td><td>{fmt(av)}</td><td>{fmt(bv)}</td><td>{same ? "unchanged" : missing ? "missing" : "changed"}</td></tr>; })}</tbody></table></div>;
}
