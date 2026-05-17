import React, { useCallback, useEffect, useState } from "react";
import { Activity, Target, Timer, Trophy, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";
import {
  Card,
  Chip,
  Eyebrow,
  MiniBar,
  PageHeader,
  Pill,
  SectionHeader,
} from "../../shared/ui/studyos";

// /app/study/compare — Behavior Benchmark Engine surface.
// Sections wired up below match the spec § "UX" list, gated on their
// respective backend PRs. Sections that still depend on later PRs (cohort
// percentile rollups, full leaderboard with cohort rows) gracefully degrade
// to a stub when the data is not available yet.

const COMPONENT_LABELS = {
  plan_adherence: "Plan adherence",
  consistency: "Consistency",
  focus_minutes: "Focused minutes",
  task_completion: "Task completion",
  mock_review: "Mock review",
  backlog_recovery: "Backlog recovery",
  revision_regularity: "Revision regularity",
};

function rankBandTone(band) {
  if (band === "ahead") return "sage";
  if (band === "on_track") return "ink";
  if (band === "behind") return "rose";
  return "outline";
}

function rankBandLabel(band) {
  if (band === "ahead") return "Ahead";
  if (band === "on_track") return "On track";
  if (band === "behind") return "Behind";
  return "—";
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value) * 100)}%`;
}

function MiniSparkline({ series }) {
  if (!series || series.length === 0) {
    return <div className="text-xs text-clay-500">No data yet.</div>;
  }
  // Key on each point's date instead of array index so React keeps bar
  // heights aligned when a new day rolls in and the series shifts.
  const points = series.map((p, i) => ({
    key: p?.date ? String(p.date) : `pt-${i}`,
    value: Number(p?.total_study_minutes || 0),
  }));
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="flex items-end gap-[3px] h-12">
      {points.map((p) => (
        <div
          key={p.key}
          aria-hidden="true"
          className="w-2 rounded-sm bg-clay-400/70"
          style={{ height: `${Math.max(2, (p.value / max) * 48)}px` }}
        />
      ))}
    </div>
  );
}

export default function StudyCompare() {
  const [me, setMe] = useState(null);
  const [cohort, setCohort] = useState(null);
  const [titles, setTitles] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [trust, setTrust] = useState(null);
  const [settings, setSettings] = useState(null);
  const [err, setErr] = useState("");
  const { run: runSettingAction } = useApiAction();

  const loadAll = useCallback(async () => {
    try {
      const [meR, settingsR] = await Promise.all([
        api.get("/api/study/compare/me"),
        api.get("/api/study/compare/settings"),
      ]);
      setMe(meR);
      setSettings(settingsR);
      setErr("");
    } catch (e) {
      setErr("Compare unavailable right now.");
      if (process.env.NODE_ENV !== "production") console.error(e);
      return;
    }
    // Non-fatal extras — surface stubs if these fail.
    Promise.allSettled([
      api.get("/api/study/compare/cohort"),
      api.get("/api/study/compare/titles"),
      api.get("/api/study/leaderboard"),
      api.get("/api/study/social/trust-breakdown"),
    ]).then(([cohortR, titlesR, lbR, trustR]) => {
      setCohort(cohortR.status === "fulfilled" ? cohortR.value : null);
      setTitles(titlesR.status === "fulfilled" ? titlesR.value : null);
      setLeaderboard(lbR.status === "fulfilled" ? lbR.value : null);
      setTrust(trustR.status === "fulfilled" ? trustR.value : null);
    });
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function updateSetting(patch) {
    const prior = settings;
    await runSettingAction({
      optimistic: () => setSettings((s) => ({ ...(s || {}), ...patch })),
      action: () => api.put("/api/study/compare/settings", patch),
      onSuccess: (next) => setSettings(next),
      rollback: () => setSettings(prior),
      errorMessage:
        "Couldn’t save privacy setting — your previous setting is still in effect.",
    });
  }

  const behaviorIndex = me?.behavior_index;
  const components = me?.components || {};
  const today = me?.today || {};

  return (
    <div className="space-y-6" data-testid="compare-page">
      <PageHeader
        eyebrow="Behavior benchmark"
        title="Compare your effort, not your intelligence."
        sub="Plan adherence, consistency, focus, review discipline — measured fairly against aspirants like you."
      />

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      ) : null}

      {/* My Behavior Score — PR 1 */}
      <Card>
        <SectionHeader
          eyebrow="My behavior score"
          title="Behavior Index"
          sub="Weighted composite of plan adherence, consistency, focus, completion, review and backlog recovery."
          right={
            <span className="num-mono text-[12px] text-clay-700" data-testid="compare-as-of">
              as of {me?.as_of || "—"}
            </span>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <Eyebrow>Behavior Index</Eyebrow>
            <div
              className="font-heading text-[40px] mt-1 text-clay-800"
              data-testid="behavior-index"
            >
              {behaviorIndex == null ? "—" : Math.round(behaviorIndex * 100)}
            </div>
            <div className="text-[12px] text-clay-700">out of 100</div>
            <div className="mt-3">
              <MiniSparkline series={me?.history || []} />
            </div>
          </div>

          <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-4 md:col-span-2">
            <Eyebrow>Components</Eyebrow>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {Object.entries(COMPONENT_LABELS).map(([k, label]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-3 text-[13px]"
                  data-testid={`component-${k}`}
                >
                  <span className="text-clay-700">{label}</span>
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <MiniBar pct={Number(components[k] || 0)} />
                    <span className="num-mono w-[44px] text-right text-clay-800">
                      {pct(components[k])}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat icon={Timer} label="Focus minutes today" value={today.focus_minutes ?? 0} />
          <Stat
            icon={Target}
            label="Tasks completed"
            value={`${today.completed_tasks ?? 0} / ${today.planned_tasks ?? 0}`}
          />
          <Stat icon={Activity} label="Backlog" value={today.backlog_count ?? 0} />
          <Stat
            icon={Trophy}
            label="Mocks reviewed"
            value={`${today.mock_review_count ?? 0} / ${today.mock_count ?? 0}`}
          />
        </div>
      </Card>

      {/* Cohort comparison — PR 3 */}
      <Card>
        <SectionHeader
          eyebrow="Compared with similar aspirants"
          title="Where you stand in your cohort"
          sub="Anonymous percentile bands. Soft language, no harsh ranks."
          right={
            cohort?.cohort ? (
              <Chip>{cohort.cohort}</Chip>
            ) : (
              <Chip>Not enough comparable data yet</Chip>
            )
          }
        />
        {cohort?.metrics && Object.keys(cohort.metrics).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(cohort.metrics).map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-[#E7DECB] bg-white/70 p-4"
                data-testid={`cohort-${k}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-heading text-[15px] text-clay-800">
                    {COMPONENT_LABELS[k] || k}
                  </div>
                  <Pill tone={rankBandTone(v?.rank_band)}>{rankBandLabel(v?.rank_band)}</Pill>
                </div>
                <div className="num-mono text-[11px] text-clay-700 mt-1">
                  {v?.percentile != null
                    ? `${v.percentile}th percentile · sample ${v.sample_size}`
                    : "Sample below cohort threshold"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-5 text-sm text-clay-700">
            Not enough comparable data yet. Cohorts open up at 30+ aspirants on your same exam +
            stage + availability.
          </div>
        )}
      </Card>

      {/* Leaderboards — PR 4 / 11 */}
      <Card>
        <SectionHeader
          eyebrow="Leaderboards"
          title="Weekly behavior board"
          sub="Opt-in. Tier 1 (system-verified) only. Never mixed with self-reported mock scores."
          right={
            settings === null ? (
              <span className="num-mono text-[11px] text-clay-700">—</span>
            ) : (
              <Pill tone={settings?.public_leaderboard_enabled ? "sage" : "outline"}>
                {settings?.public_leaderboard_enabled
                  ? "You are listed"
                  : "Private (opt-in)"}
              </Pill>
            )
          }
        />
        {leaderboard?.entries?.length ? (
          <div className="space-y-2">
            {leaderboard.entries.slice(0, 10).map((e, i) => (
              <div
                key={e.id || i}
                className="rounded-xl border border-[#E7DECB] bg-white/70 px-4 py-2 flex items-center justify-between"
                data-testid={`lb-${i}`}
              >
                <div className="flex items-center gap-3">
                  <span className="num-mono text-[12px] text-clay-700 w-6 text-right">
                    {e.rank ?? "—"}
                  </span>
                  <span className="text-[13px] text-clay-800">
                    {e.subject_type === "user" ? "Aspirant" : e.subject_type === "group" ? "Group" : "Pair"}
                  </span>
                </div>
                <span className="num-mono text-[12px] text-clay-700">
                  score {Number(e.score || 0).toFixed(2)}
                </span>
              </div>
            ))}
            {leaderboard?.self ? (
              <div className="mt-2 rounded-xl border border-clay-300 bg-clay-50 px-4 py-2 text-[12.5px] text-clay-800">
                <span className="num-mono">Your position:</span>{" "}
                {leaderboard.self.rank ? `Rank ${leaderboard.self.rank}` : "Hidden (opt-in required)"} ·{" "}
                percentile {leaderboard.self.percentile ?? "—"}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-5 text-sm text-clay-700">
            No leaderboard yet — opt in below to be listed once your cohort has enough aspirants.
          </div>
        )}
      </Card>

      {/* Trust breakdown — PR 7 */}
      <Card>
        <SectionHeader
          eyebrow="Hours trust breakdown"
          title="Raw hours vs trust-adjusted hours"
          sub="Group focus-checked, solo timer, self-logged — each weighted by trust."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <Eyebrow>Raw hours</Eyebrow>
            <div className="font-heading text-[28px] text-clay-800 mt-1">
              {trust?.raw_total_minutes != null ? (trust.raw_total_minutes / 60).toFixed(1) : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <Eyebrow>Trust-adjusted hours</Eyebrow>
            <div className="font-heading text-[28px] text-clay-800 mt-1">
              {trust?.trust_adjusted_minutes != null
                ? (Number(trust.trust_adjusted_minutes) / 60).toFixed(1)
                : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <Eyebrow>Sources</Eyebrow>
            <ul className="text-[13px] text-clay-700 mt-1 space-y-0.5">
              {(trust?.sources || []).map((s) => (
                <li key={s.source} className="flex justify-between" data-testid={`source-${s.source}`}>
                  <span>{s.source.replace(/_/g, " ")}</span>
                  <span className="num-mono">{(Number(s.raw_minutes) / 60).toFixed(1)}h</span>
                </li>
              ))}
              {!trust?.sources?.length ? <li className="text-clay-500">No sessions recorded today.</li> : null}
            </ul>
          </div>
        </div>
      </Card>

      {/* Titles — PR 1 (derived) */}
      <Card>
        <SectionHeader
          eyebrow="Titles"
          title="Earned by behavior, not volume."
          sub="Volume alone does not earn a title — it rewards burnout. Spec § Titles."
        />
        <div className="flex flex-wrap gap-2">
          {(titles?.all_titles || []).map((t) => {
            const earned = (titles?.earned || []).includes(t.key);
            return (
              <span
                key={t.key}
                title={t.rule}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${
                  earned
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : "border-[#E7DECB] bg-white/70 text-clay-700"
                }`}
                data-testid={`title-${t.key}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t.label}
              </span>
            );
          })}
        </div>
      </Card>

      {/* Privacy controls — PR 1 settings */}
      <Card>
        <SectionHeader
          eyebrow="Privacy"
          title="You control what is shared."
          sub="Default: cohort comparison + friends/group. Public board is opt-in. Partner board never public."
        />
        <div className="space-y-3" data-testid="compare-privacy">
          <Toggle
            label="Show me anonymous cohort comparisons"
            checked={!!settings?.comparison_enabled}
            onChange={(v) => updateSetting({ comparison_enabled: v })}
            testid="toggle-comparison"
          />
          <Toggle
            label="List me on the public behavior leaderboard"
            checked={!!settings?.public_leaderboard_enabled}
            onChange={(v) => updateSetting({ public_leaderboard_enabled: v })}
            testid="toggle-public-lb"
          />
          <Toggle
            label="Show friends / group leaderboards"
            checked={!!settings?.friends_leaderboard_enabled}
            onChange={(v) => updateSetting({ friends_leaderboard_enabled: v })}
            testid="toggle-friends-lb"
          />
          <Toggle
            label="Solo mode (hide me from all comparisons)"
            checked={!!settings?.solo_mode}
            onChange={(v) => updateSetting({ solo_mode: v })}
            testid="toggle-solo"
          />
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-clay-700">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </div>
      <div className="font-heading text-[20px] text-clay-800 mt-0.5 num-mono">{value}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange, testid }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-[#E7DECB] bg-white/70 px-3 py-2 cursor-pointer">
      <span className="text-[13px] text-clay-800">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testid}
        className="h-4 w-4 accent-clay-600"
        aria-label={label}
      />
    </label>
  );
}
