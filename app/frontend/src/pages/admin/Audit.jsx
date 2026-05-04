"import React from \"react\";

const EVENTS = [
  { ts: \"2026-04-29 12:42:18\", actor: \"admin.kavya\", action: \"recruitment.publish\", payload: { id: \"SSC-CGL-26\", posts: 21 } },
  { ts: \"2026-04-29 12:39:04\", actor: \"scraper.upsc\", action: \"scrape.verified\", payload: { source: \"upsc.gov.in\", hash: \"9f2a…\" } },
  { ts: \"2026-04-29 12:31:51\", actor: \"worker.edge-02\", action: \"eligibility.queue.claim\", payload: { wave: 47, count: 14280 } },
  { ts: \"2026-04-29 12:18:33\", actor: \"admin.rahul\", action: \"mentor.verify\", payload: { mentor: \"USR-88441\", exam: \"UPSC CSE\", rank: 38 } },
  { ts: \"2026-04-29 12:02:10\", actor: \"mod.sneha\", action: \"community.report.resolve\", payload: { thread: \"ssc-cgl/form-help/81\", verdict: \"hide\" } },
  { ts: \"2026-04-29 11:51:22\", actor: \"admin.kavya\", action: \"notification.template.update\", payload: { key: \"new_match\", locale: \"en\" } },
];

export default function AdminAudit() {
  return (
    <div className=\"space-y-5\">
      <div>
        <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">Audit log</div>
        <h1 className=\"mt-1 font-heading text-3xl font-black tracking-tighter\">Immutable. Filterable. Yours.</h1>
        <p className=\"text-white/60 text-sm mt-1\">Every admin and system action, forever.</p>
      </div>

      <div className=\"flex gap-2 flex-wrap\">
        {[\"Last 1h\", \"24h\", \"7d\", \"30d\", \"Custom\"].map((t, i) => (
          <button key={t} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${i === 1 ? \"bg-white text-[#0B0F19]\" : \"border border-white/10 hover:bg-white/5\"}`}>{t}</button>
        ))}
      </div>

      <div className=\"rounded-2xl glass-dark overflow-hidden\">
        {EVENTS.map((e, i) => (
          <div key={i} className=\"px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/5\">
            <div className=\"flex items-center gap-4 flex-wrap\">
              <span className=\"font-mono text-[12px] text-white/40 w-44\">{e.ts}</span>
              <span className=\"text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/5\">{e.action}</span>
              <span className=\"text-sm font-semibold\">{e.actor}</span>
              <span className=\"ml-auto font-mono text-[11.5px] text-white/60 truncate max-w-lg\">{JSON.stringify(e.payload)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
"