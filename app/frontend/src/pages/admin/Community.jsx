"import React from \"react\";
import { EyeOff, CheckCircle2, AlertTriangle, Trash2 } from \"lucide-react\";

const REPORTS = [
  { id: 1, thread: \"Which coaching is the best for SSC CGL?\", channel: \"ssc-cgl/preparation\", reason: \"Off-topic coaching promotion\", flags: 4, age: \"18 min\" },
  { id: 2, thread: \"URGENT leak — SSC CGL Tier II answer key\", channel: \"ssc-cgl/pyq-discussion\", reason: \"Rumor / misinformation\", flags: 12, age: \"42 min\" },
  { id: 3, thread: \"DM me for paid notes\", channel: \"ibps-po/preparation\", reason: \"Spam / predatory\", flags: 3, age: \"1h\" },
  { id: 4, thread: \"RBI Grade B Phase I result discussion\", channel: \"rbi/cutoffs-results\", reason: \"Flagged (review queue)\", flags: 1, age: \"2h\" },
];

export default function AdminCommunity() {
  return (
    <div className=\"space-y-5\">
      <div>
        <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">Community moderation</div>
        <h1 className=\"mt-1 font-heading text-3xl font-black tracking-tighter\">Humans decide. Always.</h1>
        <p className=\"text-white/60 text-sm mt-1\">AI flags; moderators approve. No auto-deletes at launch.</p>
      </div>

      <div className=\"grid md:grid-cols-3 gap-4\">
        {[
          { l: \"Open reports\", v: 9, t: \"text-rose-400\" },
          { l: \"Avg resolve time\", v: \"22m\", t: \"text-emerald-400\" },
          { l: \"Mods online\", v: 3, t: \"text-[#FFAB00]\" },
        ].map((k) => (
          <div key={k.l} className=\"rounded-2xl glass-dark p-5\">
            <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/50 font-semibold\">{k.l}</div>
            <div className={`mt-2 font-heading text-3xl font-black ${k.t}`}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className=\"rounded-2xl glass-dark overflow-hidden\">
        {REPORTS.map((r) => (
          <div key={r.id} className=\"px-5 py-4 border-b border-white/5 last:border-0 flex items-center gap-4 flex-wrap hover:bg-white/5\">
            <div className=\"flex-1 min-w-[280px]\">
              <div className=\"font-bold\">{r.thread}</div>
              <div className=\"text-[11px] text-white/50 font-mono\">/{r.channel} · flagged by {r.flags}</div>
              <div className=\"text-[11px] text-amber-300 mt-1 inline-flex items-center gap-1\"><AlertTriangle className=\"h-3 w-3\" /> {r.reason}</div>
            </div>
            <span className=\"text-[11px] text-white/50 font-mono\">{r.age}</span>
            <div className=\"flex gap-2\">
              <button className=\"px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs inline-flex items-center gap-1\"><CheckCircle2 className=\"h-3.5 w-3.5 text-emerald-300\" /> Keep</button>
              <button className=\"px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs inline-flex items-center gap-1\"><EyeOff className=\"h-3.5 w-3.5 text-amber-300\" /> Hide</button>
              <button className=\"px-3 py-2 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs inline-flex items-center gap-1\"><Trash2 className=\"h-3.5 w-3.5\" /> Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
"