import React, { useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { api } from "../../../lib/api";
import { JsonPreview } from "../../../shared/ui";
import PersonaStudyPolicyPreview from "./PersonaStudyPolicyPreview";
import PersonaEvidenceDrawer from "./PersonaEvidenceDrawer";
import { Eyebrow, Pill, StudyCard, MiniBar } from "../../../shared/ui/studyos";

// Helpers ────────────────────────────────────────────────────────────────
function dimToRows(dimensions) {
  if (!dimensions || typeof dimensions !== "object") return [];
  return Object.entries(dimensions)
    .map(([k, v]) => ({
      k,
      label: k.replaceAll("_", " "),
      value: v,
      // Bars only render when the value is a 0..1 score.
      pct:
        typeof v === "number" && v >= 0 && v <= 1
          ? v
          : typeof v === "number" && v <= 100
            ? v / 100
            : null,
    }))
    .sort((a, b) => {
      if (a.pct === null && b.pct === null) return a.label.localeCompare(b.label);
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return (b.pct || 0) - (a.pct || 0);
    });
}

function QUEUE_TONE(state) {
  if (state === "completed") return "sage";
  if (state === "failed") return "rose";
  if (state === "running") return "amber";
  return "outline";
}

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
  const dimRows = dimToRows(latest?.dimensions);

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start" data-testid="persona-user-inspector">
      {/* Sidebar — search + brief snapshot summary */}
      <aside className="space-y-4">
        <StudyCard>
          <Eyebrow>User</Eyebrow>
          <label className="block mt-2">
            <span className="text-[11px] text-clay-700">user_id</span>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-[#E7DECB] bg-white/80 px-3 py-2 text-[13px] font-mono"
              value={userId}
              placeholder="auth user_id"
              onChange={(e) => setUserId(e.target.value)}
              data-testid="persona-inspector-user-id"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => load()}
              disabled={loading || !userId.trim()}
              className="px-3.5 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12px] inline-flex items-center gap-1 disabled:opacity-50"
              data-testid="persona-inspector-load"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              {loading ? "Loading…" : "Inspect"}
            </button>
            {data ? (
              <button
                type="button"
                onClick={recompute}
                disabled={recomputing}
                className="px-3.5 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[12px] inline-flex items-center gap-1 disabled:opacity-50"
                data-testid="persona-inspector-recompute"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                {recomputing ? "Queuing…" : "Recompute"}
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-xl bg-[#F2DDD6] text-[#7A3925] text-[12px] px-3 py-2">
              {error}
            </div>
          ) : null}
          {recomputeMsg ? (
            <div className="mt-3 rounded-xl bg-clay-50 text-clay-800 text-[12px] px-3 py-2">
              {recomputeMsg}
            </div>
          ) : null}
        </StudyCard>

        {data && latest ? (
          <StudyCard>
            <Eyebrow>Snapshot</Eyebrow>
            <div className="mt-2 text-[13px]">
              <div className="num-mono text-[11px] text-clay-700 break-words">{data.user_id}</div>
              <div className="mt-1.5 font-heading text-[15px] leading-tight">
                {latest.primary_persona || "No primary persona"}
              </div>
              <div className="num-mono text-[10.5px] text-clay-700 mt-1">
                computed · {latest.computed_at || "—"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone="dusk">{answers.length} answers</Pill>
                <Pill tone="sage">{events.length} signals</Pill>
                <Pill tone="amber">{queue.length} queue</Pill>
              </div>
            </div>
          </StudyCard>
        ) : null}
      </aside>

      {/* Main — dimensions, policy, signals, queue */}
      <div className="space-y-4">
        {data && latest ? (
          <>
            <StudyCard>
              <Eyebrow>Dimensions</Eyebrow>
              <h3 className="font-heading text-[18px] mt-1">Persona signals · internal only.</h3>
              {dimRows.length ? (
                <ul className="mt-3 space-y-2">
                  {dimRows.map((row) => (
                    <li
                      key={row.k}
                      className="grid grid-cols-[160px_1fr_60px] gap-3 items-center text-[12.5px]"
                    >
                      <span className="capitalize text-clay-800">{row.label}</span>
                      {row.pct !== null ? (
                        <MiniBar pct={row.pct} width={undefined} height={6} />
                      ) : (
                        <span className="num-mono text-[11px] text-clay-700">
                          {typeof row.value === "string" ? row.value : JSON.stringify(row.value)}
                        </span>
                      )}
                      <span className="num-mono text-[11px] text-clay-700 text-right">
                        {row.pct !== null ? `${Math.round(row.pct * 100)}%` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12.5px] text-clay-700">
                  No dimensions on this snapshot yet.
                </p>
              )}
              <PersonaEvidenceDrawer snapshot={latest} defaultOpen={false} />
            </StudyCard>

            <StudyCard>
              <Eyebrow>Derived study policy</Eyebrow>
              <div className="mt-2">
                <PersonaStudyPolicyPreview policy={latest.study_policy} />
              </div>
              <details className="mt-3">
                <summary className="text-[11px] text-clay-700 cursor-pointer">
                  Raw study_policy JSON
                </summary>
                <div className="mt-2">
                  <JsonPreview label="" value={latest.study_policy} />
                </div>
              </details>
              <details className="mt-2">
                <summary className="text-[11px] text-clay-700 cursor-pointer">Raw scores</summary>
                <div className="mt-2">
                  <JsonPreview label="" value={latest.scores} />
                </div>
              </details>
            </StudyCard>

            <div className="grid md:grid-cols-2 gap-4">
              <StudyCard>
                <Eyebrow>Recent question answers ({answers.length})</Eyebrow>
                {answers.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-clay-700">
                    No tiny-question answers yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {answers.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-xl bg-[#FBF8F2] border border-[#E7DECB] px-3 py-2 text-[12.5px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="num-mono text-[11px]">{a.question_key}</span>
                          <span className="num-mono text-[10px] text-clay-700">
                            {a.skipped ? "skipped" : a.source || "answer"}
                          </span>
                        </div>
                        <div className="text-clay-800 mt-0.5">
                          {a.skipped ? "—" : JSON.stringify(a.normalized_value ?? a.answer_value)}
                        </div>
                        <div className="num-mono text-[10px] text-clay-700 mt-1">
                          {a.created_at}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </StudyCard>

              <StudyCard>
                <Eyebrow>Recent signal events ({events.length})</Eyebrow>
                {events.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-clay-700">No signal events yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-xl bg-[#FBF8F2] border border-[#E7DECB] px-3 py-2 text-[12.5px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="num-mono text-[11px]">{e.event_type}</span>
                          <span className="num-mono text-[10px] text-clay-700">{e.created_at}</span>
                        </div>
                        <details className="mt-1">
                          <summary className="text-[11px] text-clay-700 cursor-pointer">
                            payload
                          </summary>
                          <div className="mt-1">
                            <JsonPreview label="" value={e.payload} />
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </StudyCard>
            </div>

            <StudyCard>
              <Eyebrow>Recompute queue ({queue.length})</Eyebrow>
              {queue.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-clay-700">No queue rows for this user.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {queue.map((q) => (
                    <li
                      key={q.id}
                      className="rounded-xl bg-[#FBF8F2] border border-[#E7DECB] px-3 py-2 flex items-start gap-3 text-[12.5px]"
                    >
                      <Pill tone={QUEUE_TONE(q.status)}>{q.status}</Pill>
                      <div className="flex-1 min-w-0">
                        <div className="text-clay-900">{q.reason}</div>
                        <div className="num-mono text-[10px] text-clay-700 mt-0.5">
                          attempts: {q.attempts ?? 0} · created {q.created_at}
                        </div>
                        {q.error_message ? (
                          <div className="text-[#7A3925] mt-1">{q.error_message}</div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </StudyCard>
          </>
        ) : !error ? (
          <StudyCard>
            <Eyebrow>Persona inspector</Eyebrow>
            <p className="mt-2 text-[13px] text-clay-700 max-w-[60ch]">
              Enter a user_id in the sidebar to load the latest persona snapshot, derived study
              policy, recent tiny-question answers, signal events and recompute history. Persona
              is internal personalization metadata — never identity, diagnosis, eligibility or
              recruitment truth.
            </p>
          </StudyCard>
        ) : null}
      </div>
    </div>
  );
}
