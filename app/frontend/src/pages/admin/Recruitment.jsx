import React, { useMemo, useState } from "react";
import { ExternalLink, Filter, Search } from "lucide-react";
import { EmptyState, StatusBadge } from "../../shared/ui";

const ROWS = [
  { id: "SSC-CGL-26", title: "SSC CGL 2026", org: "Staff Selection Commission", status: "verified", posts: 21, source: "ssc.nic.in", updated: "12:42" },
  { id: "IBPS-PO-XV", title: "IBPS PO XV", org: "Institute of Banking Personnel", status: "published", posts: 3, source: "ibps.in", updated: "11:20" },
  { id: "RBI-GRB-26", title: "RBI Grade B 2026", org: "Reserve Bank of India", status: "needs_review", posts: 4, source: "opportunities.rbi.org.in", updated: "10:58" },
  { id: "UPSC-CSE-26", title: "UPSC CSE 2026", org: "Union Public Service Commission", status: "published", posts: 1, source: "upsc.gov.in", updated: "yesterday" },
  { id: "NABARD-AM-26", title: "NABARD Assistant Manager 2026", org: "NABARD", status: "draft", posts: 6, source: "nabard.org", updated: "yesterday" },
  { id: "SBI-PO-26", title: "SBI PO 2026", org: "State Bank of India", status: "needs_review", posts: 2, source: "sbi.co.in/careers", updated: "2d ago" },
];

const FILTERS = ["all", "draft", "needs_review", "verified", "published"];

export default function AdminRecruitmentPreview() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ROWS.filter((row) => (status === "all" || row.status === status) && (!needle || `${row.title} ${row.org} ${row.source}`.toLowerCase().includes(needle)));
  }, [query, status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitments</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Publish workflow preview.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Draft to review to verified to published, shown with the same quiet admin styling as the live workflow.</p>
        </div>
        <button className="btn btn-primary">New recruitment</button>
      </div>

      <div className="soft-card rounded-2xl p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search recruitments</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, organization, source" className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm" />
          </label>
          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Filter status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm">
              {FILTERS.map((filter) => <option key={filter} value={filter}>{filter === "all" ? "All statuses" : filter.replace("_", " ")}</option>)}
            </select>
          </label>
        </div>
      </div>

      {rows.length === 0 ? <EmptyState title="No preview rows match this view" description="Adjust the search or filter." /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((row) => (
            <article key={row.id} className="soft-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <StatusBadge status={row.status} label={row.status.replace("_", " ")} />
                  <h2 className="mt-3 truncate font-heading text-xl">{row.title}</h2>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{row.org} / <span className="font-mono">{row.id}</span></p>
                </div>
                <button className="btn btn-ghost text-xs">Review</button>
              </div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                <Mini label="Posts" value={row.posts} />
                <Mini label="Source" value={<span className="inline-flex min-w-0 items-center gap-1 truncate">{row.source}<ExternalLink className="h-3 w-3 shrink-0" /></span>} />
                <Mini label="Updated" value={row.updated} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }) {
  return <div className="rounded-xl border border-border bg-white/60 p-2"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-1 truncate font-semibold">{value}</div></div>;
}
