import React, { useMemo } from "react";
import { Eyebrow } from "../../../shared/ui/studyos";

// PlannedVsActualChart — pure-SVG two-line chart (no chart library).
// The X-axis is the weekly resolution returned by the backend; both
// series are cumulative 0..100 percentages of total planned units.
export default function PlannedVsActualChart({ series, status, unit = "minutes" }) {
  const points = useMemo(() => (Array.isArray(series) ? series : []), [series]);
  const chart = useMemo(() => {
    if (points.length < 1) return null;
    const W = 600;
    const H = 160;
    const padX = 32;
    const padY = 16;
    const innerW = W - padX * 2;
    const innerH = H - padY * 2;
    // Single-point rendering uses a stepX of 0 — circles still draw at
    // padX so the user sees one week's data instead of a misleading
    // "chart will appear once tasks are scheduled" fallback on day 1–7.
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
    const toY = (v) => padY + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
    const planned =
      points.length > 1
        ? points
            .map((p, i) => `${padX + i * stepX},${toY(p.planned_pct || 0)}`)
            .join(" ")
        : "";
    const actual =
      points.length > 1
        ? points
            .map((p, i) => `${padX + i * stepX},${toY(p.actual_pct || 0)}`)
            .join(" ")
        : "";
    return { W, H, padX, padY, innerW, innerH, stepX, toY, planned, actual };
  }, [points]);

  if (!chart) {
    return (
      <p className="text-[12.5px] text-clay-700" data-testid="planned-actual-empty">
        Planned vs actual will appear once tasks are scheduled across the cycle.
      </p>
    );
  }
  const singlePoint = points.length === 1;

  const latest = points[points.length - 1] || {};
  const gap = (latest.planned_pct || 0) - (latest.actual_pct || 0);

  return (
    <div className="space-y-3" data-testid="planned-actual-chart">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow>Planned vs actual ({unit})</Eyebrow>
        <span className="num-mono text-[11px] text-clay-700">
          planned {latest.planned_pct || 0}% · actual {latest.actual_pct || 0}% ·{" "}
          <span
            className={
              gap >= 10
                ? "text-[#7A3925]"
                : gap <= -5
                  ? "text-sage-700"
                  : "text-clay-700"
            }
          >
            gap {gap >= 0 ? "+" : ""}
            {gap}%
          </span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${chart.W} ${chart.H}`}
        className="w-full h-[160px]"
        role="img"
        aria-label={`Planned vs actual progress — planned ${latest.planned_pct || 0}%, actual ${latest.actual_pct || 0}%, status ${status || "unknown"}`}
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={chart.padX}
              y1={chart.toY(v)}
              x2={chart.W - chart.padX}
              y2={chart.toY(v)}
              stroke="#EFE7D4"
              strokeDasharray="2 4"
            />
            <text
              x={chart.padX - 6}
              y={chart.toY(v)}
              textAnchor="end"
              dominantBaseline="central"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10"
              fill="#6C5038"
            >
              {v}%
            </text>
          </g>
        ))}
        {chart.planned ? (
          <polyline points={chart.planned} fill="none" stroke="#A68057" strokeWidth="2" />
        ) : null}
        {chart.actual ? (
          <polyline points={chart.actual} fill="none" stroke="#54794E" strokeWidth="2" />
        ) : null}
        {points.map((p, i) => (
          <g key={p.date || i}>
            <circle
              cx={chart.padX + i * chart.stepX}
              cy={chart.toY(p.actual_pct || 0)}
              r="3"
              fill="#54794E"
            />
            <circle
              cx={chart.padX + i * chart.stepX}
              cy={chart.toY(p.planned_pct || 0)}
              r="2.5"
              fill="#A68057"
            />
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px] text-clay-700">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-1 rounded-sm" style={{ background: "#A68057" }} /> Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-1 rounded-sm" style={{ background: "#54794E" }} /> Actual
        </span>
        {singlePoint ? (
          <span className="num-mono text-clay-700">
            · Week 1 of the cycle — the trend line appears from week 2.
          </span>
        ) : null}
      </div>
    </div>
  );
}
