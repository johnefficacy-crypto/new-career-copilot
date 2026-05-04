"import React from \"react\";
import { Link } from \"react-router-dom\";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from \"recharts\";
import { Clock, Flame, Target, BookOpenCheck, CheckCircle2, AlertTriangle, ChevronRight, Play } from \"lucide-react\";

const studyData = [
  { d: \"Mon\", h: 3.2 }, { d: \"Tue\", h: 4.1 }, { d: \"Wed\", h: 2.4 },
  { d: \"Thu\", h: 5.0 }, { d: \"Fri\", h: 4.6 }, { d: \"Sat\", h: 5.8 }, { d: \"Sun\", h: 3.1 },
];

const matches = [
  { name: \"SSC CGL 2026\", org: \"SSC\", status: \"eligible\", deadline: \"12 days\", posts: 17 },
  { name: \"IBPS PO XV\", org: \"IBPS\", status: \"urgent\", deadline: \"3 days\", posts: 3 },
  { name: \"RBI Grade B\", org: \"RBI\", status: \"conditional\", deadline: \"26 days\", posts: 2 },
];

export default function Dashboard() {
  return (
    <div data-testid=\"dashboard-page\" className=\"space-y-6\">
      <div className=\"flex items-end justify-between\">
        <div>
          <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">Wed · 29 April</div>
          <h1 className=\"mt-1 font-heading text-4xl font-black tracking-tighter\">
            Good afternoon, <span className=\"gradient-text\">Priya.</span>
          </h1>
          <p className=\"text-muted-foreground mt-1\">You're on day 41 of a 90-day plan. Let's keep the streak.</p>
        </div>
        <button className=\"hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold btn-shine\">
          <Play className=\"h-3.5 w-3.5\" /> Start 50-min focus
        </button>
      </div>

      {/* KPI row */}
      <div className=\"grid grid-cols-2 lg:grid-cols-4 gap-4\">
        {[
          { label: \"Eligible posts\", val: \"22\", tone: \"text-emerald-600\", icon: Target, delta: \"+3 this week\" },
          { label: \"Urgent deadlines\", val: \"2\", tone: \"text-[#F56A3F]\", icon: AlertTriangle, delta: \"Next: 3 days\" },
          { label: \"Focus hrs · week\", val: \"28.2\", tone: \"text-indigo-600\", icon: Clock, delta: \"Goal 35h\" },
          { label: \"Current streak\", val: \"13\", tone: \"text-amber-600\", icon: Flame, delta: \"Best 18\" },
        ].map((k) => (
          <div key={k.label} className=\"rounded-2xl bg-white border border-border p-5\">
            <div className=\"flex items-center justify-between\">
              <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">{k.label}</div>
              <k.icon className={`h-4 w-4 ${k.tone}`} />
            </div>
            <div className={`mt-3 font-heading text-4xl font-black tracking-tight ${k.tone}`}>{k.val}</div>
            <div className=\"mt-1 text-xs text-muted-foreground\">{k.delta}</div>
          </div>
        ))}
      </div>

      <div className=\"grid lg:grid-cols-3 gap-4\">
        {/* Matches */}
        <div className=\"lg:col-span-2 rounded-2xl bg-white border border-border p-5\">
          <div className=\"flex items-center justify-between\">
            <div>
              <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">Recruitments for you</div>
              <div className=\"font-heading text-xl font-black mt-0.5\">3 active matches</div>
            </div>
            <Link to=\"/app/exams\" className=\"text-xs font-semibold link-under\">See all →</Link>
          </div>
          <div className=\"mt-4 divide-y divide-border\">
            {matches.map((m) => (
              <div key={m.name} className=\"py-3.5 flex items-center gap-4\">
                <div className=\"h-10 w-10 rounded-xl bg-foreground/5 grid place-items-center font-mono font-black text-xs\">{m.org}</div>
                <div className=\"flex-1 min-w-0\">
                  <div className=\"font-bold text-[15px]\">{m.name}</div>
                  <div className=\"text-xs text-muted-foreground\">{m.posts} posts · Deadline in {m.deadline}</div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                  m.status === \"eligible\" ? \"bg-emerald-100 text-emerald-700\"
                  : m.status === \"urgent\" ? \"bg-[#F56A3F]/15 text-[#F56A3F]\"
                  : \"bg-amber-100 text-amber-700\"
                }`}>
                  {m.status}
                </span>
                <ChevronRight className=\"h-4 w-4 text-muted-foreground\" />
              </div>
            ))}
          </div>
        </div>

        {/* Focus */}
        <div className=\"rounded-2xl bg-gradient-to-br from-[#0B0F19] to-[#131A2A] text-white p-6 relative overflow-hidden\">
          <div className=\"absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl bg-[#F56A3F]/40\" />
          <div className=\"relative\">
            <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/60 font-semibold\">Focus timer</div>
            <div className=\"mt-6 font-heading text-6xl font-black tracking-tighter\">50:00</div>
            <div className=\"mt-2 text-white/70 text-sm\">Quant · Percentage & Ratio</div>
            <div className=\"mt-6 flex gap-2\">
              <button className=\"flex-1 py-2.5 rounded-lg bg-[#F56A3F] font-semibold text-sm\">Start</button>
              <button className=\"py-2.5 px-4 rounded-lg border border-white/20 text-sm\">25m</button>
              <button className=\"py-2.5 px-4 rounded-lg border border-white/20 text-sm\">90m</button>
            </div>
            <div className=\"mt-5 pt-5 border-t border-white/10 text-xs text-white/60 flex justify-between\">
              <span>Today · 3h 12m</span>
              <span className=\"text-emerald-400 font-semibold\">+18% vs avg</span>
            </div>
          </div>
        </div>
      </div>

      <div className=\"grid lg:grid-cols-3 gap-4\">
        {/* Truth Panel chart */}
        <div className=\"lg:col-span-2 rounded-2xl bg-white border border-border p-5\">
          <div className=\"flex items-end justify-between\">
            <div>
              <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">Weekly Truth Panel</div>
              <div className=\"font-heading text-xl font-black mt-0.5\">Hours studied vs planned</div>
            </div>
            <div className=\"text-xs\"><span className=\"font-bold text-foreground\">28.2h</span> / 35h planned</div>
          </div>
          <div className=\"h-48 mt-5\">
            <ResponsiveContainer width=\"100%\" height=\"100%\">
              <AreaChart data={studyData}>
                <defs>
                  <linearGradient id=\"g1\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">
                    <stop offset=\"0%\" stopColor=\"#F56A3F\" stopOpacity={0.45} />
                    <stop offset=\"100%\" stopColor=\"#F56A3F\" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey=\"d\" stroke=\"rgba(0,0,0,0.5)\" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type=\"monotone\" dataKey=\"h\" stroke=\"#F56A3F\" strokeWidth={2.5} fill=\"url(#g1)\" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Today's plan */}
        <div className=\"rounded-2xl bg-white border border-border p-5\">
          <div className=\"text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">Today's plan</div>
          <div className=\"font-heading text-xl font-black mt-0.5\">5 tasks</div>
          <ul className=\"mt-4 space-y-2.5\">
            {[
              { done: true, t: \"Read: Monetary policy transmission\", m: \"25m\" },
              { done: true, t: \"Quant: 40 Qs practice\", m: \"50m\" },
              { done: false, t: \"Revision: Polity Ch. 4\", m: \"30m\" },
              { done: false, t: \"Mock: SSC CGL Tier I · M-42\", m: \"60m\" },
              { done: false, t: \"Analysis: write weakness log\", m: \"15m\" },
            ].map((x, i) => (
              <li key={i} className=\"flex items-start gap-2.5\">
                <div className={`h-5 w-5 mt-0.5 rounded-md grid place-items-center ${x.done ? \"bg-emerald-500 text-white\" : \"border border-border bg-white\"}`}>
                  {x.done && <CheckCircle2 className=\"h-3 w-3\" />}
                </div>
                <div className=\"flex-1\">
                  <div className={`text-sm ${x.done ? \"line-through text-muted-foreground\" : \"font-medium\"}`}>{x.t}</div>
                  <div className=\"text-[11px] text-muted-foreground\">{x.m}</div>
                </div>
              </li>
            ))}
          </ul>
          <button className=\"mt-4 w-full text-xs font-bold text-[#F56A3F] hover:underline inline-flex items-center gap-1\"><BookOpenCheck className=\"h-3.5 w-3.5\" /> Regenerate plan</button>
        </div>
      </div>
    </div>
  );
}
"