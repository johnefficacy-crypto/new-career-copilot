import React, { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { adminKpiService } from "../../services/studyToolsService";

const FAMILY_TITLES = {
  outcome: "Outcome KPIs",
  trust: "Trust KPIs",
  commercial: "Commercial KPIs",
  quality: "Quality KPIs",
};

export default function KPIs() {
  const [data, setData] = useState({ families: {}, as_of: null });
  const [days, setDays] = useState(14);
  const [recomputing, setRecomputing] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const d = await adminKpiService.dashboard(days);
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e.message || "Failed to load KPIs");
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [days]);

  const recompute = async () => {
    setRecomputing(true);
    try {
      await adminKpiService.recompute();
      await load();
    } catch (e) {
      setErr(e.message || "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Leadership</div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">KPI dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cross-system metrics across outcome, trust, commercial and quality families.
            {data.as_of && <> · Snapshot for {data.as_of}.</>}
          </p>
        </div>
        <div className="flex gap-2">
          <select className="px-3 py-2 rounded-xl border border-border bg-background" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button className="btn btn-primary inline-flex items-center gap-2" onClick={recompute} disabled={recomputing}>
            <RefreshCcw className={`h-4 w-4 ${recomputing ? "animate-spin" : ""}`} />
            {recomputing ? "Recomputing…" : "Recompute now"}
          </button>
        </div>
      </div>

      {err && <div className="soft-card rounded-xl p-4 text-sm text-red-600">{err}</div>}

      {Object.entries(FAMILY_TITLES).map(([family, title]) => {
        const metrics = data.families?.[family] || [];
        return (
          <div key={family} className="space-y-3">
            <div className="font-heading text-lg font-semibold">{title}</div>
            {metrics.length === 0 ? (
              <div className="soft-card rounded-xl p-4 text-sm text-muted-foreground">
                No snapshots yet — run a recompute to seed this family.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {metrics.map((m) => (
                  <div key={m.key} className="soft-card rounded-2xl p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</div>
                    <div className="text-2xl font-heading font-semibold mt-1">{formatValue(m.value)} <span className="text-sm text-muted-foreground font-normal">{m.unit}</span></div>
                    <Sparkline series={m.series} />
                    {m.target != null && <div className="text-[10px] text-muted-foreground mt-1">Target: {m.target}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(v) {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1000) return n.toLocaleString();
  return Number.isInteger(n) ? n : n.toFixed(2);
}

function Sparkline({ series }) {
  if (!series || series.length < 2) return null;
  const values = series.map((s) => Number(s.value || 0));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 120;
  const h = 30;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} className="mt-2 opacity-70">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points.join(" ")} />
    </svg>
  );
}
