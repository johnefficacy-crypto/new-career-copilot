import React from "react";
import { Link } from "react-router-dom";
import { FileSearch, GaugeCircle, Users2, MessagesSquare, ArrowUpRight, AlertTriangle } from "lucide-react";

const KPIS = [
  { label: "Pending review", v: "38", sub: "scrape queue", color: "text-[#F56A3F]" },
  { label: "Eligibility recompute", v: "1.4k", sub: "last 1h", color: "text-emerald-400" },
  { label: "Mentor applications", v: "12", sub: "awaiting verify", color: "text-amber-300" },
  { label: "Flags in mod queue", v: "9", sub: "avg 22 min SLA", color: "text-rose-400" },
];

const EVENTS = [
  { ts: "12:42", kind: "recruitment.published", who: "admin.kavya", target: "SSC CGL 2026 · Tier I" },
  { ts: "12:39", kind: "scrape.verified", who: "scraper.upsc", target: "UPSC CSE 2026 · notification PDF" },
  { ts: "12:31", kind: "eligibility.queue.claimed", who: "worker.edge-02", target: "wave 47 · 14,280 users" },
  { ts: "12:18", kind: "mentor.verified", who: "admin.rahul", target: "Verified Topper · UPSC CSE AIR 38" },
  { ts: "12:02", kind: "community.report.resolved", who: "mod.sneha", target: "thread/ssc-cgl/form-help/81" },
];

export default function AdminOverview() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold">Governance · overview</div>
        <h1 className="mt-1 font-heading text-4xl font-black tracking-tighter">Trust desk.</h1>
        <p className="text-white/60 mt-1">What's flowing through the platform right now.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-2xl glass-dark p-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/50 font-semibold">{k.label}</div>
            <div className={`mt-3 font-heading text-4xl font-black tracking-tighter ${k.color}`}>{k.v}</div>
            <div className="mt-1 text-xs text-white/50">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl glass-dark p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/50 font-semibold">Recent audit events</div>
          <ul className="mt-4 space-y-2 font-mono text-[12.5px]">
            {EVENTS.map((e, i) => (
              <li key={i} className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0">
                <span className="text-white/40 w-12 shrink-0">{e.ts}</span>
                <span className="text-[#FFAB00]">{e.kind}</span>
                <span className="text-white/40">·</span>
                <span className="text-white/70">{e.who}</span>
                <span className="ml-auto text-white/70 truncate">{e.target}</span>
              </li>
            ))}
          </ul>
          <Link to="/admin/audit" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white">
            Open audit log <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="space-y-4">
          {[
            { to: "/admin/recruitments", icon: FileSearch, label: "Recruitment review", sub: "38 items draft → needs_review" },
            { to: "/admin/eligibility-queue", icon: GaugeCircle, label: "Eligibility queue", sub: "avg 84ms, 0 retries" },
            { to: "/admin/mentors", icon: Users2, label: "Mentor applications", sub: "12 awaiting" },
            { to: "/admin/community", icon: MessagesSquare, label: "Community reports", sub: "9 flagged threads" },
          ].map((q) => (
            <Link key={q.to} to={q.to} className="rounded-2xl glass-dark p-4 flex items-center gap-3 hover:bg-white/5 transition">
              <q.icon className="h-5 w-5 text-[#FFAB00]" />
              <div className="flex-1">
                <div className="font-bold text-sm">{q.label}</div>
                <div className="text-[11px] text-white/50">{q.sub}</div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-white/50" />
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl glass-dark p-5 flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-amber-500/15 grid place-items-center">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-sm">Notification kill-switch is armed</div>
          <div className="text-[11px] text-white/50">Any admin with <span className="font-mono">super_admin</span> role can disable all outbound notifications within 2 seconds.</div>
        </div>
        <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10">Configure</button>
      </div>
    </div>
  );
}
