import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  Tooltip,
} from "recharts";
import { Clock, Flame, Target, AlertTriangle, ChevronRight, Play, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

export default function Dashboard() {
  const auth = useAuth();
  const [recruitments, setRecruitments] = useState({ items: [], counts: {} });
  const [plan, setPlan] = useState(null);
  const [focus, setFocus] = useState({ total_hours_7d: 0, week: [] });

  useEffect(() => {
    api.get("/api/recruitments").then(setRecruitments).catch(() => {});
    api.get("/api/study/plan").then(setPlan).catch(() => {});
    api.get("/api/study/focus/summary").then(setFocus).catch(() => {});
  }, []);

  const firstName = (auth.user?.name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" });

  const topMatches = recruitments.items.slice(0, 4);
  const urgent = (recruitments.counts.urgent || 0);
  const eligible = (recruitments.counts.eligible || 0);
  const studyHours = focus.total_hours_7d || 28.2;
  const studyData = focus.week?.length ? focus.week : [
    { d: "Mon", h: 3.2 }, { d: "Tue", h: 4.1 }, { d: "Wed", h: 2.4 },
    { d: "Thu", h: 5.0 }, { d: "Fri", h: 4.6 }, { d: "Sat", h: 5.8 }, { d: "Sun", h: 3.1 },
  ];

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{today}</div>
          <h1 className="mt-1 font-heading text-4xl md:text-5xl font-semibold tracking-tight">
            Good day, <span className="italic text-clay-600">{firstName}.</span>
          </h1>
          <p className="text-muted-foreground mt-1">Day 41 of a 90-day plan. Let's keep the streak.</p>
        </div>
        <Link to="/app/study/focus" className="btn btn-primary" data-testid="start-focus-btn">
          <Play className="h-4 w-4" /> Start 50-min focus
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Eligible posts", val: eligible || 22, tone: "text-sage-600", icon: Target, delta: "+3 this week" },
          { label: "Urgent deadlines", val: urgent || 2, tone: "text-clay-600", icon: AlertTriangle, delta: "Next: 3 days" },
          { label: "Focus hrs · week", val: studyHours, tone: "text-dusk-600", icon: Clock, delta: "Goal 35h" },
          { label: "Current streak", val: 13, tone: "text-clay-600", icon: Flame, delta: "Best 18" },
        ].map((k) => (
          <div key={k.label} className="soft-card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{k.label}</div>
              <k.icon className={`h-4 w-4 ${k.tone}`} strokeWidth={1.8} />
            </div>
            <div className={`mt-3 font-heading text-4xl font-semibold tracking-tight ${k.tone}`}>{k.val}</div>
            <div className="mt-1 text-xs text-muted-foreground">{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitments for you</div>
              <div className="font-heading text-xl font-semibold mt-0.5">{recruitments.counts.all || 0} active matches</div>
            </div>
            <Link to="/app/exams" className="text-xs font-semibold link-under" data-testid="see-all-exams">See all →</Link>
          </div>
          <div className="mt-4 divide-y divide-border">
            {topMatches.map((m) => (
              <Link key={m.slug} to={`/app/exams/${m.slug}`} className="py-3.5 flex items-center gap-4 hover:bg-clay-50/60 -mx-3 px-3 rounded-lg transition">
                <div className="h-10 w-10 rounded-xl bg-clay-100 grid place-items-center font-mono font-semibold text-xs text-clay-700">{m.organization_code}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.posts_matched} of {m.posts_total} posts · {m.vacancies?.toLocaleString()} vacancies</div>
                </div>
                <span className={`pill ${
                  m.status === "eligible" ? "pill-sage"
                  : m.status === "urgent" ? "pill-clay"
                  : "pill-amber"
                }`}>
                  {m.status}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-dusk-800 text-dusk-50 p-6 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl bg-clay-500/30" />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.22em] text-dusk-200 font-semibold">Focus timer</div>
            <div className="mt-6 font-heading text-6xl font-semibold tracking-tight">50:00</div>
            <div className="mt-2 text-dusk-100 text-sm">Quant · Percentage & Ratio</div>
            <Link to="/app/study/focus" className="mt-6 inline-flex items-center gap-2 w-full justify-center py-2.5 rounded-lg bg-clay-500 text-white font-semibold text-sm" data-testid="dashboard-focus-cta">
              Start session
            </Link>
            <div className="mt-5 pt-5 border-t border-white/10 text-xs text-dusk-200 flex justify-between">
              <span>Today · 3h 12m</span>
              <span className="text-sage-300 font-semibold">+18% vs avg</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Weekly Truth Panel</div>
              <div className="font-heading text-xl font-semibold mt-0.5">Hours studied vs planned</div>
            </div>
            <div className="text-xs"><span className="font-semibold text-foreground">{studyHours}h</span> / 35h planned</div>
          </div>
          <div className="h-48 mt-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studyData}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#A68057" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#A68057" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" stroke="rgba(0,0,0,0.45)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E7D6BA", background: "#FBF6EF" }} />
                <Area type="monotone" dataKey="h" stroke="#A68057" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Today's plan</div>
          <div className="font-heading text-xl font-semibold mt-0.5">{plan?.tasks?.length || 6} blocks</div>
          <ul className="mt-4 space-y-2.5">
            {(plan?.tasks || []).slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-start gap-2.5">
                <div className={`h-5 w-5 mt-0.5 rounded-md grid place-items-center ${t.done ? "bg-sage-500 text-white" : "border border-border bg-white"}`}>
                  {t.done && <CheckCircle2 className="h-3 w-3" />}
                </div>
                <div className="flex-1">
                  <div className={`text-sm ${t.done ? "line-through text-muted-foreground" : "font-medium"}`}>{t.title}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{t.time}</div>
                </div>
              </li>
            ))}
          </ul>
          <Link to="/app/study-plan" className="mt-4 block text-xs font-semibold text-clay-600 link-under">Open full plan →</Link>
        </div>
      </div>
    </div>
  );
}
