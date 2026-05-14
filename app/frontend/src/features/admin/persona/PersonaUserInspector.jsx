import React, { useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { api } from "../../../lib/api";
import JsonPreview from "./JsonPreview";
import PersonaStudyPolicyPreview from "./PersonaStudyPolicyPreview";

export default function PersonaUserInspector({ initialUserId = "" }) {
  const [userId, setUserId] = useState(initialUserId || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState("");

  async function load(targetId) {
    const id = (targetId ?? userId).trim();
    if (!id) {
      setError("Enter a user_id to inspect.");
      return;
    }
    setError("");
    setRecomputeMsg("");
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/persona/users/${encodeURIComponent(id)}`);
      setData(res);
    } catch (e) {
      setError(e?.message || "Failed to load user persona");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function recompute() {
    const id = (userId || data?.user_id || "").trim();
    if (!id) return;
    setRecomputing(true);
    setRecomputeMsg("");
    try {
      const res = await api.post("/api/admin/persona/recompute-user", {
        user_id: id,
        reason: "admin_requested",
      });
      setRecomputeMsg(`Queued for ${res.user_id} (${res.reason}). Refreshing…`);
      await load(id);
    } catch (e) {
      setRecomputeMsg(e?.message || "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  }

  const latest = data?.latest_snapshot;
  const answers = Array.isArray(data?.recent_question_answers) ? data.recent_question_answers : [];
  const events = Array.isArray(data?.recent_signal_events) ? data.recent_signal_events : [];
  const queue = Array.isArray(data?.queue_items) ? data.queue_items : [];

  return (
    <div className="space-y-4" data-testid="persona-user-inspector">
      <div className="soft-card rounded-2xl p-4 flex flex-wrap items-end gap-2">
        <label className="block text-sm flex-1 min-w-[240px]">
          <span className="text-muted-foreground text-xs">User id</span>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm font-mono"
            value={userId}
            placeholder="auth user_id"
            onChange={(e) => setUserId(e.target.value)}
            data-testid="persona-inspector-user-id"
          />
        </label>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading || !userId.trim()}
          className="btn btn-primary inline-flex items-center gap-1"
          data-testid="persona-inspector-load"
        >
          <Search className="h-3.5 w-3.5" /> {loading ? "Loading…" : "Inspect"}
        </button>
        {data ? (
          <button
            type="button"
            onClick={recompute}
            disabled={recomputing}
            className="btn btn-ghost inline-flex items-center gap-1"
            data-testid="persona-inspector-recompute"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {recomputing ? "Queuing…" : "Recompute persona"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">{error}</div>
      ) : null}
      {recomputeMsg ? (
        <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{recomputeMsg}</div>
      ) : null}

      {data ? (
        <>
          <section className="soft-card rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Latest snapshot
            </div>
            {latest ? (
              <div className="mt-2 text-sm">
                <div>
                  <span className="text-muted-foreground">primary_persona · </span>
                  <span className="font-mono">{latest.primary_persona || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">computed_at · </span>
                  {latest.computed_at}
                </div>
                <JsonPreview label="Dimensions" value={latest.dimensions} />
                <JsonPreview label="Scores" value={latest.scores} />
                <PersonaStudyPolicyPreview policy={latest.study_policy} />
                <JsonPreview label="Raw study_policy JSON" value={latest.study_policy} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No snapshot yet for this user.
              </p>
            )}
          </section>

          <section className="soft-card rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Recent question answers ({answers.length})
            </div>
            {answers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No tiny-question answers yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {answers.map((a) => (
                  <li key={a.id} className="rounded-xl bg-clay-50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{a.question_key}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {a.skipped ? "skipped" : a.source || "answer"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.skipped ? "—" : JSON.stringify(a.normalized_value ?? a.answer_value)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{a.created_at}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="soft-card rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Recent signal events ({events.length})
            </div>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No signal events yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="rounded-xl bg-clay-50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{e.event_type}</span>
                      <span className="text-[10px] text-muted-foreground">{e.created_at}</span>
                    </div>
                    <JsonPreview label="payload" value={e.payload} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="soft-card rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Recompute queue items ({queue.length})
            </div>
            {queue.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No queue rows for this user.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {queue.map((q) => (
                  <li key={q.id} className="rounded-xl bg-clay-50 px-3 py-2 flex items-start gap-2">
                    <span
                      className={`pill text-[10px] uppercase tracking-wider ${
                        q.status === "completed"
                          ? "text-sage-700"
                          : q.status === "failed"
                            ? "text-dusk-700"
                            : "text-muted-foreground"
                      }`}
                    >
                      {q.status}
                    </span>
                    <div className="text-xs flex-1">
                      <div>{q.reason}</div>
                      <div className="text-muted-foreground">
                        attempts: {q.attempts ?? 0} · created {q.created_at}
                      </div>
                      {q.error_message ? (
                        <div className="text-dusk-700 mt-1">{q.error_message}</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
