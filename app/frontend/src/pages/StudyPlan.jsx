"import React from \"react\";
import { Sparkles, CheckCircle2, Circle, Zap } from \"lucide-react\";

const WEEK = [
  { d: \"Mon\", hrs: 4.5, color: \"bg-emerald-500\" },
  { d: \"Tue\", hrs: 5.2, color: \"bg-emerald-500\" },
  { d: \"Wed\", hrs: 3.2, color: \"bg-amber-500\" },
  { d: \"Thu\", hrs: 6.1, color: \"bg-emerald-500\" },
  { d: \"Fri\", hrs: 4.8, color: \"bg-emerald-500\" },
  { d: \"Sat\", hrs: 7.0, color: \"bg-emerald-500\" },
  { d: \"Sun\", hrs: 0.5, color: \"bg-rose-500\" },
];

const TASKS = [
  { s: \"Morning · 06:30–08:30\", title: \"Quant · Arithmetic: Percentage & Ratio\", done: true },
  { s: \"Morning · 08:45–09:30\", title: \"Reading · The Hindu Editorial + notes\", done: true },
  { s: \"Afternoon · 14:00–15:00\", title: \"Mock · SSC CGL Tier I · Set 42\", done: false },
  { s: \"Afternoon · 15:15–16:00\", title: \"Mock analysis · log weaknesses\", done: false },
  { s: \"Evening · 19:00–20:00\", title: \"Revision · Indian Polity Ch. 4 (Parliament)\", done: false },
  { s: \"Evening · 20:15–21:00\", title: \"English · RC 2 passages + vocab 20 words\", done: false },
];

export default function StudyPlanPage() {
  return (
    <div data-testid=\"study-plan-page\" className=\"space-y-6\">
      <div className=\"flex items-end justify-between flex-wrap gap-3\">
        <div>
          <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">Study OS · 90-day plan</div>
          <h1 className=\"font-heading text-4xl font-black tracking-tighter mt-1\">Day 41 · \"Arithmetic Sprint\"</h1>
          <p className=\"text-muted-foreground mt-1\">Your plan adapted yesterday after the Tue 4h gap. <a href=\"#\" className=\"link-under text-foreground font-semibold\">Why changed →</a></p>
        </div>
        <button className=\"inline-flex items-center gap-2 bg-foreground text-background rounded-full px-4 py-2.5 text-sm font-semibold btn-shine\">
          <Sparkles className=\"h-3.5 w-3.5\" /> Regenerate with AI
        </button>
      </div>

      {/* Week stamp chart */}
      <div className=\"rounded-2xl bg-white border border-border p-5\">
        <div className=\"flex items-baseline justify-between\">
          <div>
            <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">This week · adherence</div>
            <div className=\"font-heading text-2xl font-black mt-0.5\">31.3h <span className=\"text-muted-foreground text-base\">/ 35h planned</span></div>
          </div>
          <div className=\"text-xs font-semibold text-emerald-600\">89% adherence</div>
        </div>
        <div className=\"mt-5 flex items-end gap-3 h-40\">
          {WEEK.map((w) => (
            <div key={w.d} className=\"flex-1 flex flex-col items-center justify-end gap-2\">
              <div className={`w-full rounded-t-lg ${w.color}/20`} style={{ height: `${w.hrs * 12}px` }}>
                <div className={`w-full rounded-t-lg ${w.color}`} style={{ height: \"100%\" }} />
              </div>
              <div className=\"text-[10px] font-mono text-muted-foreground\">{w.hrs}h</div>
              <div className=\"text-[11px] font-bold uppercase tracking-wider\">{w.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks */}
      <div className=\"grid lg:grid-cols-3 gap-4\">
        <div className=\"lg:col-span-2 rounded-2xl bg-white border border-border p-5\">
          <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">Today's schedule</div>
          <div className=\"font-heading text-xl font-black mt-0.5\">6 blocks · 5h 45m</div>
          <ul className=\"mt-4 space-y-2.5\">
            {TASKS.map((t, i) => (
              <li key={i} className=\"flex items-start gap-3 rounded-xl p-3 hover:bg-foreground/[0.03] transition\">
                <div className=\"mt-0.5\">{t.done ? <CheckCircle2 className=\"h-5 w-5 text-emerald-500\" /> : <Circle className=\"h-5 w-5 text-muted-foreground\" />}</div>
                <div className=\"flex-1\">
                  <div className=\"text-[10px] uppercase tracking-wider text-muted-foreground font-mono\">{t.s}</div>
                  <div className={`text-[15px] ${t.done ? \"line-through text-muted-foreground\" : \"font-semibold\"}`}>{t.title}</div>
                </div>
                {!t.done && <button className=\"text-[11px] font-bold text-[#F56A3F] hover:underline\">Start →</button>}
              </li>
            ))}
          </ul>
        </div>

        <div className=\"rounded-2xl bg-gradient-to-br from-[#0B0F19] to-[#131A2A] text-white p-6 relative overflow-hidden\">
          <div className=\"absolute -bottom-20 -right-10 h-60 w-60 rounded-full blur-3xl bg-[#10B981]/40\" />
          <div className=\"relative\">
            <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/60 font-semibold\">Truth Panel · week</div>
            <h3 className=\"mt-2 font-heading text-2xl font-black\">You're on track for the 10 June Tier I.</h3>
            <ul className=\"mt-5 space-y-3 text-sm\">
              {[
                { t: \"Quant — weak topics closed\", v: \"7 / 9\", good: true },
                { t: \"Mock score trend (last 5)\", v: \"+12 pts\", good: true },
                { t: \"Revision backlog\", v: \"4 topics\", good: false },
                { t: \"Sleep / focus ratio\", v: \"stable\", good: true },
              ].map((x, i) => (
                <li key={i} className=\"flex items-center justify-between pb-3 border-b border-white/10 last:border-0\">
                  <span className=\"text-white/80\">{x.t}</span>
                  <span className={`font-mono font-bold ${x.good ? \"text-emerald-400\" : \"text-amber-400\"}`}>{x.v}</span>
                </li>
              ))}
            </ul>
            <div className=\"mt-5 pt-4 border-t border-white/10 text-[13px] inline-flex gap-2 items-start\">
              <Zap className=\"h-4 w-4 text-[#FFAB00] mt-0.5 shrink-0\" />
              <span className=\"text-white/80\">Next correction: spend Thu 2h closing Polity Ch.4 backlog.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
"