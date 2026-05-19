import React, { useEffect, useState } from "react";
import { RotateCcw, Users, UserMinus, Square, Activity, Crown, MessageSquare } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function useStatus() {
  const [status, setStatus] = useState(null);
  return {
    status,
    ok: (m, audit_id) => setStatus({ ok: true, message: m, audit_id }),
    fail: (m) => setStatus({ ok: false, message: m }),
    clear: () => setStatus(null),
  };
}

function StatusLine({ status }) {
  if (!status) return null;
  return (
    <div className={`text-xs ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">
      {status.message}
      {status.audit_id ? <span className="ml-2 text-muted-foreground">audit_id: <code>{status.audit_id}</code></span> : null}
    </div>
  );
}

function promptReason(label = "Reason (≥8 chars)") {
  const r = window.prompt(label);
  if (!r || r.trim().length < 8) return null;
  return r.trim();
}

function Panel({ icon: Icon, title, count, action, children }) {
  return (
    <section className="rounded border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
          <h3 className="text-sm font-semibold">{title}</h3>
          {typeof count === "number" ? <span className="text-xs text-muted-foreground">({count})</span> : null}
        </div>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function AdminStudyOsSocial() {
  // Groups
  const [groups, setGroups] = useState(null);
  const [groupStatusFilter, setGroupStatusFilter] = useState("active");
  const groupStatus = useStatus();

  // Partner pairs
  const [pairs, setPairs] = useState(null);
  const [pairStatusFilter, setPairStatusFilter] = useState("active");
  const pairStatus = useStatus();

  // Sessions
  const [sessions, setSessions] = useState(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const sessionStatus = useStatus();

  // Trust
  const [trustUserId, setTrustUserId] = useState("");
  const [trust, setTrust] = useState(null);
  const trustStatus = useStatus();

  // Leaderboard
  const [board, setBoard] = useState(null);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const boardStatus = useStatus();

  // Mentor feedback
  const [feedback, setFeedback] = useState(null);
  const feedbackStatus = useStatus();

  async function loadGroups() {
    try {
      const r = await api.get(`/api/admin/study-os/social/groups?status=${encodeURIComponent(groupStatusFilter)}&limit=50`);
      setGroups(r);
    } catch (e) { groupStatus.fail(getApiErrorMessage(e)); }
  }
  async function loadPairs() {
    try {
      const r = await api.get(`/api/admin/study-os/social/partner-pairs?status=${encodeURIComponent(pairStatusFilter)}&limit=50`);
      setPairs(r);
    } catch (e) { pairStatus.fail(getApiErrorMessage(e)); }
  }
  async function loadSessions() {
    try {
      const r = await api.get(`/api/admin/study-os/social/sessions?active_only=${activeOnly}&limit=50`);
      setSessions(r);
    } catch (e) { sessionStatus.fail(getApiErrorMessage(e)); }
  }
  async function loadBoard() {
    try {
      const r = await api.get(`/api/admin/study-os/social/leaderboard?limit=50&hidden_only=${hiddenOnly}`);
      setBoard(r);
    } catch (e) { boardStatus.fail(getApiErrorMessage(e)); }
  }
  async function loadFeedback() {
    try {
      const r = await api.get(`/api/admin/study-os/social/mentor-feedback?limit=50`);
      setFeedback(r);
    } catch (e) { feedbackStatus.fail(getApiErrorMessage(e)); }
  }

  async function loadTrust() {
    if (!trustUserId.trim()) return;
    try {
      const r = await api.get(`/api/admin/study-os/social/trust/${encodeURIComponent(trustUserId.trim())}/breakdown?days=14`);
      setTrust(r);
    } catch (e) { trustStatus.fail(getApiErrorMessage(e)); }
  }

  // Action wrappers
  async function archiveGroup(id) {
    const reason = promptReason();
    if (!reason) return groupStatus.fail("Reason ≥8 chars required.");
    try {
      const r = await api.post(`/api/admin/study-os/social/groups/${encodeURIComponent(id)}/archive`, { reason });
      groupStatus.ok(`Archived ${id}.`, r.audit_id);
      loadGroups();
    } catch (e) { groupStatus.fail(getApiErrorMessage(e)); }
  }
  async function transferOwner(id) {
    const newOwner = window.prompt("New owner UUID (must be active member)?");
    if (!newOwner) return;
    const reason = promptReason();
    if (!reason) return groupStatus.fail("Reason ≥8 chars required.");
    try {
      const r = await api.post(`/api/admin/study-os/social/groups/${encodeURIComponent(id)}/transfer-ownership`, {
        reason, payload: { new_owner_id: newOwner.trim() },
      });
      groupStatus.ok(`Owner transferred.`, r.audit_id);
      loadGroups();
    } catch (e) { groupStatus.fail(getApiErrorMessage(e)); }
  }
  async function dissolvePair(id) {
    const reason = promptReason();
    if (!reason) return pairStatus.fail("Reason ≥8 chars required.");
    try {
      const r = await api.post(`/api/admin/study-os/social/partner-pairs/${encodeURIComponent(id)}/dissolve`, { reason });
      pairStatus.ok(`Pair ended.`, r.audit_id);
      loadPairs();
    } catch (e) { pairStatus.fail(getApiErrorMessage(e)); }
  }
  async function forceEndSession(id) {
    const reason = promptReason();
    if (!reason) return sessionStatus.fail("Reason ≥8 chars required.");
    try {
      const r = await api.post(`/api/admin/study-os/social/sessions/${encodeURIComponent(id)}/force-end`, { reason });
      sessionStatus.ok(`Session ${id} ended.`, r.audit_id);
      loadSessions();
    } catch (e) { sessionStatus.fail(getApiErrorMessage(e)); }
  }
  async function recomputeTrust() {
    const reason = promptReason();
    if (!reason) return trustStatus.fail("Reason ≥8 chars required.");
    try {
      const r = await api.post(`/api/admin/study-os/social/trust/${encodeURIComponent(trustUserId.trim())}/recompute`, { reason });
      trustStatus.ok(`Recomputed for ${r.snapshot_date}.`, r.audit_id);
      loadTrust();
    } catch (e) { trustStatus.fail(getApiErrorMessage(e)); }
  }
  async function flipBoard(id, action) {
    const reason = promptReason();
    if (!reason) return boardStatus.fail("Reason ≥8 chars required.");
    try {
      const r = await api.post(`/api/admin/study-os/social/leaderboard/${encodeURIComponent(id)}/${action}`, { reason });
      boardStatus.ok(`${action} ok.`, r.audit_id);
      loadBoard();
    } catch (e) { boardStatus.fail(getApiErrorMessage(e)); }
  }
  async function flipFeedback(id, action) {
    const reason = promptReason();
    if (!reason) return feedbackStatus.fail("Reason ≥8 chars required.");
    try {
      const r = await api.post(`/api/admin/study-os/social/mentor-feedback/${encodeURIComponent(id)}/${action}`, { reason });
      feedbackStatus.ok(`${action} ok.`, r.audit_id);
      loadFeedback();
    } catch (e) { feedbackStatus.fail(getApiErrorMessage(e)); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadGroups(); }, [groupStatusFilter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadPairs(); }, [pairStatusFilter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSessions(); }, [activeOnly]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBoard(); }, [hiddenOnly]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFeedback(); }, []);

  return (
    <div className="space-y-5" data-testid="admin-studyos-social">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · social
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Social Admin</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Groups, partner pairs, social sessions, per-user trust breakdown, leaderboard moderation, and
          mentor-feedback governance. Every write requires a reason ≥8 chars and writes to{" "}
          <code>admin_audit_logs</code>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={Users}
          title="Groups"
          count={groups?.total}
          action={
            <select
              value={groupStatusFilter}
              onChange={(e) => setGroupStatusFilter(e.target.value)}
              className="text-xs px-1.5 py-1 border border-border/60 rounded bg-background"
              aria-label="Filter groups by status"
            >
              <option value="active">active</option>
              <option value="archived">archived</option>
              <option value="">all</option>
            </select>
          }
        >
          <StatusLine status={groupStatus.status} />
          {!groups?.items?.length ? (
            <div className="text-sm text-muted-foreground">No groups.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {groups.items.map((g) => (
                <li key={g.id} className="border-b border-border/40 py-1.5 flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.name}</div>
                    <div className="text-muted-foreground">
                      {g.status} · owner <code>{g.created_by?.slice(0, 8)}…</code>
                    </div>
                  </div>
                  {g.status === "active" ? (
                    <div className="flex gap-2 shrink-0">
                      <button type="button" onClick={() => transferOwner(g.id)} className="text-[11px] underline hover:no-underline" data-testid={`group-transfer-${g.id}`}>
                        <Crown className="inline h-3 w-3" /> Transfer
                      </button>
                      <button type="button" onClick={() => archiveGroup(g.id)} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`group-archive-${g.id}`}>
                        Archive
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={UserMinus}
          title="Partner pairs"
          count={pairs?.total}
          action={
            <select
              value={pairStatusFilter}
              onChange={(e) => setPairStatusFilter(e.target.value)}
              className="text-xs px-1.5 py-1 border border-border/60 rounded bg-background"
              aria-label="Filter partner pairs by status"
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="ended">ended</option>
              <option value="">all</option>
            </select>
          }
        >
          <StatusLine status={pairStatus.status} />
          {!pairs?.items?.length ? (
            <div className="text-sm text-muted-foreground">No pairs.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {pairs.items.map((p) => (
                <li key={p.id} className="border-b border-border/40 py-1.5 flex justify-between items-center gap-2">
                  <div>
                    <div className="font-mono">{p.user_a?.slice(0, 8)}… ⇄ {p.user_b?.slice(0, 8)}…</div>
                    <div className="text-muted-foreground">{p.pairing_goal} · {p.status}</div>
                  </div>
                  {p.status === "active" ? (
                    <button type="button" onClick={() => dissolvePair(p.id)} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`pair-dissolve-${p.id}`}>
                      Dissolve
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={Activity}
          title="Social sessions"
          count={sessions?.total}
          action={
            <label className="inline-flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Active only
            </label>
          }
        >
          <StatusLine status={sessionStatus.status} />
          {!sessions?.items?.length ? (
            <div className="text-sm text-muted-foreground">No sessions.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {sessions.items.map((s) => (
                <li key={s.id} className="border-b border-border/40 py-1.5 flex justify-between items-center gap-2">
                  <div>
                    <div className="font-medium">{s.session_type} · {s.trust_source}</div>
                    <div className="text-muted-foreground">{fmt(s.started_at)} {s.ended_at ? "→ ended" : "(active)"}</div>
                  </div>
                  {!s.ended_at ? (
                    <button type="button" onClick={() => forceEndSession(s.id)} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`session-end-${s.id}`}>
                      <Square className="inline h-3 w-3" /> Force end
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={RotateCcw} title="Trust breakdown">
          <StatusLine status={trustStatus.status} />
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="block text-xs text-muted-foreground mb-1">User UUID</span>
              <input
                type="text"
                value={trustUserId}
                onChange={(e) => setTrustUserId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-border/60 rounded bg-background font-mono"
                data-testid="trust-user-input"
              />
            </label>
            <button type="button" className="btn small" onClick={loadTrust} disabled={!trustUserId.trim()}>
              Load
            </button>
            <button type="button" className="btn small" onClick={recomputeTrust} disabled={!trustUserId.trim()}>
              Recompute
            </button>
          </div>
          {trust ? (
            <div className="text-xs pt-2">
              <div className="text-muted-foreground mb-1">Window: last {trust.days_window} days · since {trust.since}</div>
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr><th className="text-left p-1">source</th><th className="text-right p-1">raw min</th><th className="text-right p-1">adj min</th></tr>
                </thead>
                <tbody>
                  {Object.entries(trust.by_source || {}).map(([k, v]) => (
                    <tr key={k} className="border-t border-border/40">
                      <td className="p-1">{k}</td>
                      <td className="p-1 text-right font-mono">{v.raw_minutes.toFixed(1)}</td>
                      <td className="p-1 text-right font-mono">{v.trust_adjusted_minutes.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>

        <Panel
          icon={Activity}
          title="Leaderboard"
          count={board?.total}
          action={
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={hiddenOnly} onChange={(e) => setHiddenOnly(e.target.checked)} />
              Hidden only
            </label>
          }
        >
          <StatusLine status={boardStatus.status} />
          {!board?.items?.length ? (
            <div className="text-sm text-muted-foreground">No entries.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {board.items.slice(0, 30).map((e) => (
                <li key={e.id} className="border-b border-border/40 py-1.5 flex justify-between items-center gap-2">
                  <div>
                    <div className="font-medium">{e.board_type} · rank {e.rank}</div>
                    <div className="text-muted-foreground">
                      score {e.score} · trust {e.trust_tier || "—"}{e.is_hidden ? " · HIDDEN" : ""}
                    </div>
                  </div>
                  {e.is_hidden ? (
                    <button type="button" onClick={() => flipBoard(e.id, "restore")} className="text-[11px] underline hover:no-underline" data-testid={`lb-restore-${e.id}`}>
                      Restore
                    </button>
                  ) : (
                    <button type="button" onClick={() => flipBoard(e.id, "hide")} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`lb-hide-${e.id}`}>
                      Hide
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={MessageSquare} title="Mentor feedback" count={feedback?.total}>
          <StatusLine status={feedbackStatus.status} />
          {!feedback?.items?.length ? (
            <div className="text-sm text-muted-foreground">No feedback rows.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {feedback.items.slice(0, 30).map((f) => (
                <li key={f.id} className="border-b border-border/40 py-1.5 flex justify-between items-center gap-2">
                  <div>
                    <div className="font-medium">
                      D:{f.discipline_rating ?? "—"} P:{f.preparation_rating ?? "—"} F:{f.follow_through_rating ?? "—"}
                      {f.is_hidden ? " · HIDDEN" : ""}
                    </div>
                    <div className="text-muted-foreground font-mono">
                      mentor {f.mentor_id?.slice(0, 8)}… mentee {f.mentee_id?.slice(0, 8)}…
                    </div>
                  </div>
                  {f.is_hidden ? (
                    <button type="button" onClick={() => flipFeedback(f.id, "restore")} className="text-[11px] underline hover:no-underline">
                      Restore
                    </button>
                  ) : (
                    <button type="button" onClick={() => flipFeedback(f.id, "hide")} className="text-[11px] underline hover:no-underline text-red-700">
                      Hide
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
