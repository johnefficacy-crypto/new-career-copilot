import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";

export default function WeeklyReview() {
  const [d, setD] = useState({ week_of: "This week", hours_studied: 0, hours_planned: 0, adherence: 0, mocks_taken: 0, mock_trend: [], highlights: [], corrections: [] });
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get("/api/study/weekly-review").then((res) => setD({ week_of: res?.week_of || "This week", hours_studied: res?.hours_studied || 0, hours_planned: res?.hours_planned || 0, adherence: res?.adherence || 0, mocks_taken: res?.mocks_taken || 0, mock_trend: Array.isArray(res?.mock_trend) ? res.mock_trend : [], highlights: Array.isArray(res?.highlights) ? res.highlights : [], corrections: Array.isArray(res?.corrections) ? res.corrections : [] })).catch((e) => { setErr("Weekly review unavailable right now."); if (process.env.NODE_ENV !== "production") console.error(e); });
  }, []);
  

  return (
    <div className="space-y-6" data-testid="weekly-review-page">
      {err && <div className="text-xs text-clay-700">{err}</div>}
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Weekly review · {d.week_of}</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">The honest panel.</h1>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Hours studied" value={`${d.hours_studied}h`} foot={`/ ${d.hours_planned}h planned`} />
        <Stat label="Adherence" value={`${Math.round(d.adherence * 100)}%`} foot="Goal 85%" />
        <Stat label="Mocks taken" value={d.mocks_taken} foot={`trend ${d.mock_trend.slice(-2).join(" → ")}`} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="soft-card rounded-2xl p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">What went well</div>
          <ul className="mt-3 space-y-2">
            {d.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-sage-500 mt-0.5" /> {h}</li>
            ))}
          </ul>
        </div>
        <div className="soft-card rounded-2xl p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Corrections for next week</div>
          <ul className="mt-3 space-y-2">
            {d.corrections.map((c) => (
              <li key={c} className="flex items-start gap-2"><AlertCircle className="h-4 w-4 text-clay-500 mt-0.5" /> {c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, foot }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 font-heading text-3xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{foot}</div>
    </div>
  );
}
