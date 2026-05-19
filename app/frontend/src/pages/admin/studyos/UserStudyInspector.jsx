import React, { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, AlertTriangle, User } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function flagDisabled(err) {
  const msg = getApiErrorMessage(err) || "";
  return /admin\.study_os\.enabled/i.test(msg);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function KV({ k, v }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1 border-b border-border/40">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-xs text-right break-all">{v ?? "—"}</span>
    </div>
  );
}

function Panel({ title, children, right }) {
  return (
    <section className="rounded border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {right}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function AdminUserStudyInspector() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotErr, setSnapshotErr] = useState(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [missionControl, setMissionControl] = useState(null);
  const [mcBusy, setMcBusy] = useState(false);
  const [mcErr, setMcErr] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsErr, setEventsErr] = useState(null);
  const [sourceFilter, setSourceFilter] = useState("");
  const [disabled, setDisabled] = useState(false);

  async function doSearch(e) {
    if (e) e.preventDefault();
    if (!q || q.trim().length < 2) return;
    setSearchBusy(true);
    setSearchErr(null);
    try {
      const r = await api.get(`/api/admin/study-os/users/search?q=${encodeURIComponent(q.trim())}&limit=10`);
      setResults(r.items || []);
      setDisabled(false);
    } catch (err) {
      if (flagDisabled(err)) setDisabled(true);
      setSearchErr(getApiErrorMessage(err));
      setResults([]);
    } finally {
      setSearchBusy(false);
    }
  }

  async function loadUser(userId) {
    setSelectedId(userId);
    setSnapshot(null);
    setMissionControl(null);
    setEvents([]);
    setSnapshotErr(null);
    setMcErr(null);
    setEventsErr(null);
    setSnapshotBusy(true);
    try {
      const s = await api.get(`/api/admin/study-os/users/${encodeURIComponent(userId)}/snapshot`);
      setSnapshot(s);
    } catch (err) {
      if (flagDisabled(err)) setDisabled(true);
      setSnapshotErr(getApiErrorMessage(err));
    } finally {
      setSnapshotBusy(false);
    }
    // Mission Control + events load in parallel; failures are independent.
    setMcBusy(true);
    try {
      const mc = await api.get(`/api/admin/study-os/users/${encodeURIComponent(userId)}/mission-control`);
      setMissionControl(mc);
    } catch (err) {
      setMcErr(getApiErrorMessage(err));
    } finally {
      setMcBusy(false);
    }
    loadEvents(userId, sourceFilter);
  }

  async function loadEvents(userId, source) {
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (source) params.set("source", source);
      const r = await api.get(`/api/admin/study-os/users/${encodeURIComponent(userId)}/adaptation-events?${params}`);
      setEvents(r.items || []);
      setEventsErr(null);
    } catch (err) {
      setEventsErr(getApiErrorMessage(err));
      setEvents([]);
    }
  }

  useEffect(() => {
    if (selectedId) loadEvents(selectedId, sourceFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter]);

  const profile = snapshot?.profile;
  const plan = snapshot?.plan;
  const focus = snapshot?.focus;
  const artifacts = snapshot?.artifacts;

  const taskCountChips = useMemo(() => {
    if (!plan?.today_task_counts) return null;
    return Object.entries(plan.today_task_counts).map(([k, v]) => (
      <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs">
        {k}: <span className="font-mono">{v}</span>
      </span>
    ));
  }, [plan]);

  return (
    <div className="space-y-5" data-testid="admin-studyos-inspector">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · per-user inspector
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">User Study Inspector</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Search a user by email or UUID. Read-only view of their plan, Today payload, focus posture, learning
          artifact counts, and the recent <code>study_adaptation_events</code> trail. Use Plan Ops for write
          actions.
        </p>
      </div>

      {disabled ? (
        <div className="flex items-start gap-2 rounded border border-amber-300/50 bg-amber-50/50 p-3 text-sm" data-testid="studyos-disabled-banner">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
          <div>
            <strong>Admin Study OS is disabled.</strong> Set <code>ADMIN_STUDY_OS_ENABLED=1</code> on the backend
            to enable. See <code>docs/engineering/admin-study-os-operations.md</code>.
          </div>
        </div>
      ) : null}

      <form onSubmit={doSearch} className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="email, UUID, or full name…"
            className="w-full pl-8 pr-3 py-2 rounded border border-border/60 bg-background text-sm"
            data-testid="studyos-search-input"
            aria-label="Search aspirant"
          />
        </div>
        <button
          type="submit"
          disabled={searchBusy || q.trim().length < 2}
          className="btn small"
          data-testid="studyos-search-submit"
        >
          {searchBusy ? "Searching…" : "Search"}
        </button>
      </form>

      {searchErr ? (
        <div className="text-sm text-red-700" role="alert">{searchErr}</div>
      ) : null}

      {results.length > 0 ? (
        <Panel title={`Matches (${results.length})`}>
          <ul className="space-y-1" data-testid="studyos-search-results">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => loadUser(r.id)}
                  className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm ${selectedId === r.id ? "bg-muted" : ""}`}
                  data-testid={`studyos-result-${r.id}`}
                >
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{r.full_name || "(no name)"}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{r.email}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">{r.id}</div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {selectedId ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Identity"
            right={
              <button type="button" className="btn small" onClick={() => loadUser(selectedId)} disabled={snapshotBusy}>
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            }
          >
            {snapshotErr ? (
              <div className="text-sm text-red-700">{snapshotErr}</div>
            ) : snapshotBusy && !snapshot ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : profile ? (
              <div>
                <KV k="id" v={profile.id} />
                <KV k="email" v={profile.email} />
                <KV k="full_name" v={profile.full_name} />
                <KV k="timezone" v={profile.timezone} />
                <KV k="persona" v={profile.persona} />
                <KV k="plan" v={profile.plan} />
                <KV k="onboarded" v={String(!!profile.onboarding_completed)} />
                <KV k="created_at" v={fmtDate(profile.created_at)} />
                <KV k="last_seen_at" v={fmtDate(profile.last_seen_at)} />
              </div>
            ) : null}
          </Panel>

          <Panel title="Active plan">
            {snapshotErr ? null : plan?.active ? (
              <div>
                <KV k="plan_id" v={plan.active.id} />
                <KV k="status" v={plan.active.status} />
                <KV k="theme" v={plan.active.theme} />
                <KV k="target" v={plan.active.target} />
                <KV k="start_date" v={plan.active.start_date} />
                <KV k="end_date" v={plan.active.end_date} />
                <KV k="updated_at" v={fmtDate(plan.active.updated_at)} />
                <KV k="latest version #" v={plan.latest_version?.version_number} />
                <KV k="latest version at" v={fmtDate(plan.latest_version?.created_at)} />
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-1">Today: {plan.today_total ?? 0} tasks</div>
                  <div className="flex flex-wrap gap-1">{taskCountChips}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No active plan for this user.</div>
            )}
          </Panel>

          <Panel title="Focus posture">
            {focus?.active_session ? (
              <div>
                <KV k="session_id" v={focus.active_session.id} />
                <KV k="started_at" v={fmtDate(focus.active_session.started_at)} />
                <KV k="duration_mins" v={focus.active_session.duration_mins} />
                {focus.active_session_stuck ? (
                  <div className="mt-2 text-xs text-red-700 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Stuck — started &gt;6h ago, never closed
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">In progress.</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No active focus session.</div>
            )}
            <div className="mt-3 text-xs text-muted-foreground">
              Recent sessions: {focus?.recent_sessions?.length ?? 0}
            </div>
          </Panel>

          <Panel title="Artifact counts">
            {artifacts ? (
              <div>
                {Object.entries(artifacts).map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <KV k="weekly_review" v={snapshot?.weekly_review ? fmtDate(snapshot.weekly_review.computed_at) : "—"} />
              <KV k="report_card" v={snapshot?.report_card ? fmtDate(snapshot.report_card.generated_at) : "—"} />
            </div>
          </Panel>

          <Panel
            title="Mission Control (live)"
            right={
              <button type="button" className="btn small" onClick={() => loadUser(selectedId)} disabled={mcBusy}>
                <RefreshCw className="h-3 w-3" /> Refetch
              </button>
            }
          >
            {mcErr ? (
              <div className="text-sm text-red-700">{mcErr}</div>
            ) : mcBusy && !missionControl ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : missionControl ? (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Fetched at {fmtDate(missionControl.fetched_at)} — click to expand JSON
                </summary>
                <pre className="mt-2 text-[11px] bg-muted p-2 rounded max-h-80 overflow-auto">
                  {JSON.stringify(missionControl.mission_control, null, 2)}
                </pre>
              </details>
            ) : null}
          </Panel>

          <Panel
            title="Adaptation events"
            right={
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs px-2 py-1 border border-border/60 rounded bg-background"
                aria-label="Filter adaptation events by source"
              >
                <option value="">All sources</option>
                <option value="engine">Engine</option>
                <option value="admin">Admin</option>
                <option value="policy">Policy</option>
              </select>
            }
          >
            {eventsErr ? (
              <div className="text-sm text-red-700">{eventsErr}</div>
            ) : events.length === 0 ? (
              <div className="text-sm text-muted-foreground">No events.</div>
            ) : (
              <ul className="space-y-1 text-xs" data-testid="studyos-events-list">
                {events.map((ev) => (
                  <li key={ev.id} className="border-b border-border/40 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{ev.event_type}</span>
                      <span className="text-muted-foreground">{fmtDate(ev.created_at)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      source: <span className="font-mono">{ev.trigger_source}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
