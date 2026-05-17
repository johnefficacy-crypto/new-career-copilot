import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, ExternalLink, FileText, ShieldCheck, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import OptionInsightsCard from "./OptionInsightsCard";
import TrapDrillLauncher from "./TrapDrillLauncher";

const CATEGORY_LABELS = {
  general: "General",
  obc: "OBC",
  sc: "SC",
  st: "ST",
  ews: "EWS",
  pwbd: "PwBD",
  ex_serviceman: "Ex-Servicemen",
};

const CATEGORY_COLORS = {
  general: "#54794E",
  obc: "#A68057",
  sc: "#524864",
  st: "#8A6846",
  ews: "#6C5038",
  pwbd: "#8F86A1",
  ex_serviceman: "#94B28A",
};

const DIFFICULTY_LABEL = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  unknown: "Unknown",
};

function CategoryLabel({ k }) {
  return CATEGORY_LABELS[k] || k.toUpperCase();
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-clay-200 bg-clay-50/50 p-6 text-center" data-testid="exam-intel-empty">
      <Icon className="h-5 w-5 mx-auto text-clay-500" />
      <div className="mt-2 font-heading text-base font-semibold">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">{body}</p>
    </div>
  );
}

function PaperRow({ p }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2 border-b border-clay-100/80 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {p.phase_name || "Paper"} · {p.year}
          {p.paper_code ? ` · ${p.paper_code}` : ""}
          {p.shift ? ` · Shift ${p.shift}` : ""}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {p.paper_date || "Date n/a"} · source: {p.source_type}
        </div>
      </div>
      {p.source_url ? (
        <a
          href={p.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-clay-700 hover:underline inline-flex items-center gap-1 shrink-0"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </li>
  );
}

function pyqByYear(papers) {
  const map = new Map();
  for (const p of papers) {
    const y = p.year;
    if (y == null) continue;
    map.set(y, (map.get(y) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }));
}

function cutoffChartData(cutoffSeries) {
  const years = new Set();
  Object.values(cutoffSeries || {}).forEach((points) =>
    (points || []).forEach((p) => years.add(p.year))
  );
  const rows = Array.from(years)
    .sort((a, b) => a - b)
    .map((year) => ({ year }));
  Object.entries(cutoffSeries || {}).forEach(([category, points]) => {
    (points || []).forEach((p) => {
      const row = rows.find((r) => r.year === p.year);
      if (row) row[category] = p.marks;
    });
  });
  return rows;
}

function heatmapIntensity(count, max) {
  if (!max || count === 0) return 0;
  return Math.min(1, count / max);
}

function heatmapColor(intensity) {
  // Map 0..1 to a clay-tinted gradient
  const a = Math.round(intensity * 0.85 * 100) / 100;
  return intensity === 0 ? "#F5EEE3" : `rgba(84, 121, 78, ${0.15 + a})`;
}

export default function ExamIntelligenceTab({ examSlug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!examSlug) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    api
      .get(`/api/exam-intelligence/exams/${examSlug}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "Failed to load exam intelligence.");
        setData(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [examSlug]);

  const pyqYearly = useMemo(() => pyqByYear(data?.pyq_papers || []), [data]);
  const cutoffData = useMemo(() => cutoffChartData(data?.cutoff_series || {}), [data]);
  const cutoffCategories = useMemo(
    () => Object.keys(data?.cutoff_series || {}),
    [data]
  );
  const vacancyData = useMemo(
    () => (data?.vacancy_series?.total || []).map((p) => ({ year: p.year, vacancies: p.count })),
    [data]
  );
  const heatmapMax = useMemo(() => {
    const rows = data?.difficulty_heatmap?.rows || [];
    let m = 0;
    rows.forEach((r) => Object.values(r.counts || {}).forEach((c) => { if (c > m) m = c; }));
    return m;
  }, [data]);

  if (!examSlug) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No exam linked"
        body="This recruitment isn't connected to the exam taxonomy yet. Once an admin links it, historical PYQ, cutoff and vacancy intelligence will appear here."
      />
    );
  }

  if (loading) {
    return (
      <div className="soft-card rounded-2xl p-6" data-testid="exam-intel-loading">
        <div className="text-sm text-muted-foreground">Loading exam intelligence…</div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Couldn't load exam intelligence"
        body={error}
      />
    );
  }

  if (!data?.available) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Verified intelligence not available yet"
        body="Career Copilot only surfaces PYQ, cutoff and vacancy data once admins have reviewed and locked the underlying rows. Check back as more sources are verified."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="exam-intelligence-tab">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="pill pill-sage inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Verified-only
        </span>
        <span>
          {data.competition_series?.length || 0} reviewed cycles ·{" "}
          {data.pyq_papers?.length || 0} verified PYQ papers ·{" "}
          {data.difficulty_heatmap?.verified_question_count || 0} tagged questions
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="soft-card rounded-2xl p-5" data-testid="pyq-trend-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Past papers · verified count by year
              </div>
              <div className="font-heading text-lg font-semibold mt-0.5">PYQ availability trend</div>
            </div>
            <TrendingUp className="h-4 w-4 text-clay-500" />
          </div>
          {pyqYearly.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No verified papers ingested yet.</div>
          ) : (
            <div className="h-56 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pyqYearly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD3" vertical={false} />
                  <XAxis dataKey="year" stroke="#7A6A55" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#7A6A55" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#54794E" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="soft-card rounded-2xl p-5" data-testid="cutoff-trend-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Cutoff trend · marks by category
              </div>
              <div className="font-heading text-lg font-semibold mt-0.5">Cutoff history</div>
            </div>
          </div>
          {cutoffData.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No verified cutoff rows yet.</div>
          ) : (
            <div className="h-56 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cutoffData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD3" vertical={false} />
                  <XAxis dataKey="year" stroke="#7A6A55" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#7A6A55" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {cutoffCategories.map((cat) => (
                    <Line
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      name={CATEGORY_LABELS[cat] || cat.toUpperCase()}
                      stroke={CATEGORY_COLORS[cat] || "#7A6A55"}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="soft-card rounded-2xl p-5" data-testid="vacancy-history-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Vacancies by year
              </div>
              <div className="font-heading text-lg font-semibold mt-0.5">Vacancy history</div>
            </div>
          </div>
          {vacancyData.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No vacancy history yet.</div>
          ) : (
            <div className="h-56 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vacancyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD3" vertical={false} />
                  <XAxis dataKey="year" stroke="#7A6A55" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#7A6A55" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="vacancies" fill="#A68057" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {data.vacancy_series?.by_category && Object.keys(data.vacancy_series.by_category).length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(data.vacancy_series.by_category).map(([cat, points]) => {
                const latest = points[points.length - 1];
                if (!latest) return null;
                return (
                  <div key={cat} className="rounded-lg bg-clay-50 border border-clay-100 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-clay-700">
                      <CategoryLabel k={cat} /> · {latest.year}
                    </div>
                    <div className="font-heading text-lg">{latest.count.toLocaleString("en-IN")}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="soft-card rounded-2xl p-5" data-testid="difficulty-heatmap-card">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Difficulty heatmap · subject × difficulty (verified PYQs)
            </div>
            <div className="font-heading text-lg font-semibold mt-0.5">Difficulty distribution</div>
          </div>
          {(data.difficulty_heatmap?.rows || []).length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No tagged questions yet.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-semibold py-1.5 pr-3">Subject</th>
                    {data.difficulty_heatmap.buckets.map((b) => (
                      <th key={b} className="text-center font-semibold py-1.5 px-2">
                        {DIFFICULTY_LABEL[b] || b}
                      </th>
                    ))}
                    <th className="text-right font-semibold py-1.5 pl-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.difficulty_heatmap.rows.map((row) => (
                    <tr key={row.subject_id}>
                      <td className="py-1.5 pr-3 font-medium">{row.subject_name || row.subject_slug}</td>
                      {data.difficulty_heatmap.buckets.map((b) => {
                        const count = row.counts?.[b] || 0;
                        return (
                          <td
                            key={b}
                            className="text-center py-1.5 px-2 rounded"
                            style={{ backgroundColor: heatmapColor(heatmapIntensity(count, heatmapMax)) }}
                          >
                            {count}
                          </td>
                        );
                      })}
                      <td className="text-right py-1.5 pl-3 font-semibold">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="soft-card rounded-2xl p-5" data-testid="pyq-papers-card">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-clay-500" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Verified PYQ papers
            </div>
            <div className="font-heading text-lg font-semibold mt-0.5">Past papers ({data.pyq_papers?.length || 0})</div>
          </div>
        </div>
        {(data.pyq_papers || []).length === 0 ? (
          <div className="mt-3 text-sm text-muted-foreground">No verified PYQ papers yet.</div>
        ) : (
          <ul className="mt-3">
            {data.pyq_papers.slice(0, 12).map((p) => (
              <PaperRow key={p.id} p={p} />
            ))}
          </ul>
        )}
      </div>

      <OptionInsightsCard examSlug={examSlug} topics={data.topics} />

      <TrapDrillLauncher examSlug={examSlug} />

      <div className="text-[11px] text-muted-foreground">
        Source: deterministic Exam Intelligence engine. Only rows reviewed and locked by admins are surfaced here. AI never publishes intelligence claims.
      </div>
    </div>
  );
}
