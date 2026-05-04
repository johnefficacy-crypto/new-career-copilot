"import React from \"react\";
import { Sparkles, ShieldCheck, CircleOff } from \"lucide-react\";

const POLICIES = [
  { action: \"ai.plan.generate\", state: \"enabled\", note: \"User-initiated · confirmation required\", risk: \"low\" },
  { action: \"ai.eligibility.explain\", state: \"enabled\", note: \"Summarizes deterministic result. Cannot override.\", risk: \"low\" },
  { action: \"ai.notification.summarize\", state: \"enabled\", note: \"PDF → 3-bullet summary · human-review before fanout on 'high' risk templates.\", risk: \"medium\" },
  { action: \"ai.community.moderate_auto_delete\", state: \"disabled\", note: \"Flagging only. Humans approve all removals at launch.\", risk: \"high\" },
  { action: \"ai.eligibility.final_verdict\", state: \"disabled\", note: \"Hard-disabled. Engine remains deterministic.\", risk: \"critical\" },
];

const STYLE = {
  enabled: \"bg-emerald-500/20 text-emerald-300\",
  disabled: \"bg-rose-500/20 text-rose-300\",
};

export default function AdminAIPolicy() {
  return (
    <div className=\"space-y-5\">
      <div>
        <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">AI action policy</div>
        <h1 className=\"mt-1 font-heading text-3xl font-black tracking-tighter\">AI proposes. Humans decide.</h1>
        <p className=\"text-white/60 text-sm mt-1\">Every AI-originated action passes this policy layer before it's allowed to execute.</p>
      </div>

      <div className=\"rounded-2xl glass-dark p-2\">
        <div className=\"grid grid-cols-[2fr_1fr_3fr_1fr] gap-4 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold\">
          <div>Action</div><div>State</div><div>Policy note</div><div>Risk</div>
        </div>
        {POLICIES.map((p) => (
          <div key={p.action} className=\"grid grid-cols-[2fr_1fr_3fr_1fr] gap-4 px-4 py-4 border-t border-white/5 items-center\">
            <div className=\"font-mono text-[12.5px] inline-flex items-center gap-2\">
              {p.state === \"enabled\" ? <Sparkles className=\"h-3.5 w-3.5 text-[#FFAB00]\" /> : <CircleOff className=\"h-3.5 w-3.5 text-rose-400\" />}
              {p.action}
            </div>
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${STYLE[p.state]}`}>{p.state}</span>
            </div>
            <div className=\"text-sm text-white/70\">{p.note}</div>
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                p.risk === \"low\" ? \"bg-emerald-500/10 text-emerald-300\" :
                p.risk === \"medium\" ? \"bg-amber-500/10 text-amber-300\" :
                p.risk === \"high\" ? \"bg-[#F56A3F]/10 text-[#FFAB00]\" :
                \"bg-rose-500/20 text-rose-300\"
              }`}>{p.risk}</span>
            </div>
          </div>
        ))}
      </div>

      <div className=\"rounded-2xl glass-dark p-5 inline-flex items-start gap-4\">
        <ShieldCheck className=\"h-5 w-5 text-emerald-300 mt-0.5\" />
        <div className=\"text-sm text-white/70\">
          Deterministic eligibility verdicts are protected: <span className=\"font-mono text-white\">ai.eligibility.final_verdict</span> cannot be enabled via this UI, only by a signed governance migration.
        </div>
      </div>
    </div>
  );
}
"