"import React from \"react\";
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from \"lucide-react\";

const ITEMS = [
  { id: \"wave-47\", kind: \"full_recompute\", users: 14280, status: \"running\", progress: 64, ms: 2834 },
  { id: \"rec-ssc-cgl-26\", kind: \"recruitment_delta\", users: 8210, status: \"done\", progress: 100, ms: 840 },
  { id: \"rec-rbi-grb-26\", kind: \"recruitment_delta\", users: 2940, status: \"done\", progress: 100, ms: 512 },
  { id: \"user-profile-recompute\", kind: \"profile_delta\", users: 1, status: \"failed\", progress: 0, ms: 0, retries: 3 },
  { id: \"wave-46\", kind: \"full_recompute\", users: 13920, status: \"done\", progress: 100, ms: 3180 },
];

const STATUS = {
  running: { cls: \"bg-amber-500/20 text-amber-300\", icon: Loader2, spin: true },
  done: { cls: \"bg-emerald-500/20 text-emerald-300\", icon: CheckCircle2 },
  failed: { cls: \"bg-rose-500/20 text-rose-300\", icon: AlertTriangle },
};

export default function AdminEligibilityQueue() {
  return (
    <div className=\"space-y-5\">
      <div className=\"flex items-end justify-between\">
        <div>
          <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">Eligibility queue</div>
          <h1 className=\"mt-1 font-heading text-3xl font-black tracking-tighter\">Recompute monitor</h1>
          <p className=\"text-white/60 text-sm mt-1\">Atomic claim · retry metadata · SLA under 5 min / wave.</p>
        </div>
        <button className=\"px-4 py-2 rounded-lg bg-white text-[#0B0F19] text-sm font-semibold inline-flex items-center gap-2\">
          <RefreshCw className=\"h-3.5 w-3.5\" /> Trigger wave
        </button>
      </div>

      <div className=\"grid md:grid-cols-3 gap-4\">
        {[
          { l: \"Avg duration / wave\", v: \"2m 48s\" },
          { l: \"Retries last hour\", v: \"3 / 1,420\" },
          { l: \"p95 queue latency\", v: \"84ms\" },
        ].map((k) => (
          <div key={k.l} className=\"rounded-2xl glass-dark p-5\">
            <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/50 font-semibold\">{k.l}</div>
            <div className=\"mt-2 font-heading text-3xl font-black tracking-tighter text-emerald-400\">{k.v}</div>
          </div>
        ))}
      </div>

      <div className=\"rounded-2xl glass-dark p-2\">
        <table className=\"w-full text-sm\">
          <thead>
            <tr className=\"text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold\">
              <th className=\"text-left py-3 px-3\">Job</th>
              <th className=\"text-left py-3 px-3\">Kind</th>
              <th className=\"text-left py-3 px-3\">Users</th>
              <th className=\"text-left py-3 px-3\">Progress</th>
              <th className=\"text-left py-3 px-3\">Status</th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map((it) => {
              const S = STATUS[it.status];
              const Icon = S.icon;
              return (
                <tr key={it.id} className=\"border-t border-white/5\">
                  <td className=\"py-3 px-3 font-mono text-[12px]\">{it.id}</td>
                  <td className=\"py-3 px-3 text-white/70 font-mono text-[12px]\">{it.kind}</td>
                  <td className=\"py-3 px-3 font-mono\">{it.users.toLocaleString()}</td>
                  <td className=\"py-3 px-3\">
                    <div className=\"w-40 h-1.5 bg-white/10 rounded-full overflow-hidden\">
                      <div className={`h-full rounded-full ${it.status === \"failed\" ? \"bg-rose-500\" : \"bg-gradient-to-r from-[#F56A3F] to-[#FFAB00]\"}`} style={{ width: `${it.progress}%` }} />
                    </div>
                    <div className=\"text-[11px] mt-1 text-white/50 font-mono\">{it.ms}ms</div>
                  </td>
                  <td className=\"py-3 px-3\">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${S.cls}`}>
                      <Icon className={`h-3 w-3 ${S.spin ? \"animate-spin\" : \"\"}`} /> {it.status}
                      {it.retries && ` · retry ${it.retries}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
"