import React, { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { api } from "../../lib/api";
import FocusReflectionPanel from "../../features/study/components/FocusReflectionPanel";
import {
  Eyebrow,
  StatusDot,
  StudyCard,
  SectionHeader,
  PageHeader,
  Drawer,
} from "../../shared/ui/studyos";
import useApiAction from "../../lib/hooks/useApiAction";

const PRESETS = [25, 50, 90];
const RING_CIRCUMFERENCE = 540; // 2·π·r, r = 86

export default function Focus() {
  // Subject + topic start empty. Pre-filling fictional values like "Quant" /
  // "Percentage & Ratio" pollutes per-subject focus telemetry — users who
  // forget to overwrite log every block against the placeholder. The "Link a
  // task" selector below populates these from today's plan when picked.
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(50);
  const [remaining, setRemaining] = useState(50 * 60);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [summary, setSummary] = useState({ total_hours_7d: 0, week: [] });
  // Today's tasks — best-effort, used only to offer a "linked task" selector.
  const [todayTasks, setTodayTasks] = useState([]);
  const [linkedTaskId, setLinkedTaskId] = useState("");
  // Holds the just-finished session so the reflection drawer can render.
  const [reflectionSession, setReflectionSession] = useState(null);
  const tickRef = useRef(null);
  const { run: runFocusAction } = useApiAction();

  useEffect(() => {
    api.get("/api/study/focus/summary").then(setSummary).catch(() => {});
    // Linked-task selector is optional: if the plan endpoint is unavailable
    // we simply do not show it.
    api
      .get("/api/study/plan")
      .then((res) => {
        setTodayTasks(Array.isArray(res?.tasks) ? res.tasks : []);
      })
      .catch(() => setTodayTasks([]));
  }, []);

  useEffect(() => {
    setRemaining(duration * 60);
  }, [duration]);

  useEffect(() => {
    if (!running) return undefined;
    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tickRef.current);
          finish(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line
  }, [running]);

  function pickLinkedTask(id) {
    setLinkedTaskId(id);
    const t = todayTasks.find((x) => String(x.id) === String(id));
    if (t) {
      if (t.subject) setSubject(t.subject);
      if (t.topic) setTopic(t.topic);
      else if (t.title) setTopic(t.title);
    }
  }

  async function start() {
    const result = await runFocusAction({
      action: () =>
        api.post("/api/study/focus/start", {
          subject,
          topic,
          duration_min: duration,
        }),
      errorMessage: "Couldn't start focus session — try again.",
    });
    if (!result.ok) return;
    setSessionId(result.data?.id);
    setRunning(true);
    setReflectionSession(null);
  }
  function pause() {
    setRunning(false);
  }
  async function finish(auto = false) {
    const completedMin = Math.round((duration * 60 - remaining) / 60);
    if (sessionId) {
      const result = await runFocusAction({
        action: () =>
          api.post("/api/study/focus/stop", {
            id: sessionId,
            completed_min: auto ? duration : completedMin,
          }),
        errorMessage: "Couldn't save focus session — your timer state is preserved; tap End again to retry.",
      });
      // On failure: leave sessionId/running intact so the user can retry.
      // No reflection is offered because nothing was logged.
      if (!result.ok) return;
      // Offer a post-session reflection (kept local — see FocusReflectionPanel).
      setReflectionSession({
        subject,
        topic,
        completedMin: auto ? duration : completedMin,
      });
    }
    setRunning(false);
    setSessionId(null);
    setRemaining(duration * 60);
    api.get("/api/study/focus/summary").then(setSummary).catch(() => {});
  }

  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");
  const progress = duration > 0 ? (duration * 60 - remaining) / (duration * 60) : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const phase = running ? "FOCUSING" : remaining === 0 ? "COMPLETE" : "READY";
  const linkedTask = todayTasks.find((x) => String(x.id) === String(linkedTaskId));

  const weekDays = Array.isArray(summary.week) ? summary.week : [];
  const recent = weekDays.filter((w) => (w.h ?? w.hours ?? 0) > 0).slice(-7);

  return (
    <div className="space-y-6" data-testid="focus-page">
      <PageHeader
        eyebrow="Focus · session"
        title="One task. Timed. With a reflection at the end."
        sub="The reflection feeds focus consistency back into your study policy — never used for diagnosis, eligibility or recruitment decisions."
        right={<StatusDot state="live" label="Live · /api/study/focus" />}
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* Timer card */}
        <StudyCard>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <Eyebrow>Linked task</Eyebrow>
              <div className="font-heading text-[22px] mt-1.5">
                {linkedTask?.title || topic || "Focus block"}
              </div>
              <div className="text-[12.5px] text-clay-700 mt-1">
                {[subject, linkedTask ? null : topic].filter(Boolean).join(" · ") || "Set a subject below"}
              </div>
              {todayTasks.length > 0 ? (
                <label className="mt-3 inline-flex items-center gap-2">
                  <span className="eyebrow inline-flex items-center gap-1">
                    <Link2 className="h-3 w-3" aria-hidden="true" /> Link a task
                  </span>
                  <select
                    value={linkedTaskId}
                    onChange={(e) => pickLinkedTask(e.target.value)}
                    data-testid="focus-linked-task"
                    className="px-3 py-1.5 rounded-full border border-[#E7DECB] bg-white/70 text-[12px]"
                  >
                    <option value="">No linked task</option>
                    {todayTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title || t.topic || `Task ${t.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="text-right shrink-0">
              <Eyebrow>Preset</Eyebrow>
              <div className="mt-2 flex gap-1.5 justify-end">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDuration(p)}
                    data-testid={`focus-preset-${p}`}
                    className={`text-[12px] px-3 py-1.5 rounded-full font-semibold transition ${
                      duration === p
                        ? "bg-[#FFFDF9] text-[#2E2218] border border-[#D9C7A7]"
                        : "border border-[#E7DECB] text-clay-700 hover:bg-clay-50"
                    }`}
                  >
                    {p}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Timer ring */}
          <div className="mt-7 flex flex-col items-center">
            <svg
              width="240"
              height="240"
              viewBox="0 0 200 200"
              role="img"
              aria-label={`${mins} minutes ${secs} seconds remaining — ${phase.toLowerCase()}`}
              data-testid="focus-clock"
            >
              <circle cx="100" cy="100" r="86" fill="none" className="ring-bg" strokeWidth="6" />
              <circle
                cx="100"
                cy="100"
                r="86"
                fill="none"
                className="ring-fg"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 100 100)"
              />
              <text
                x="100"
                y="100"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="Fraunces, Georgia, serif"
                fontSize="42"
                fontWeight="600"
                fill="#2E2218"
              >
                {mins}:{secs}
              </text>
              <text
                x="100"
                y="135"
                textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="10"
                letterSpacing="2"
                fill="#6C5038"
              >
                {phase}
              </text>
            </svg>
            <div className="mt-4 flex gap-2 flex-wrap justify-center">
              {!running && remaining > 0 ? (
                <button
                  onClick={start}
                  disabled={!subject.trim()}
                  data-testid="focus-start"
                  title={!subject.trim() ? "Set a subject below before starting" : undefined}
                  className="px-5 py-2.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start
                </button>
              ) : null}
              {running ? (
                <button
                  onClick={pause}
                  data-testid="focus-pause"
                  className="px-5 py-2.5 rounded-full bg-[#FBF6EF] border border-[#E7DECB] text-[#2E2218] font-semibold text-[13px]"
                >
                  Pause
                </button>
              ) : null}
              <button
                onClick={() => finish(false)}
                data-testid="focus-end"
                className="px-5 py-2.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[13px]"
              >
                End session
              </button>
            </div>
            <div className="mt-3 text-[11px] text-clay-700">
              Subject and topic feed the session log:
            </div>
            <div className="mt-2 flex gap-2 flex-wrap justify-center">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Subject"
                placeholder="Subject"
                className="px-3 py-1.5 rounded-full border border-[#E7DECB] bg-white/70 text-[12px] w-40"
              />
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                aria-label="Topic"
                placeholder="Topic (optional)"
                className="px-3 py-1.5 rounded-full border border-[#E7DECB] bg-white/70 text-[12px] w-48"
              />
            </div>
          </div>
        </StudyCard>

        {/* Right rail */}
        <div className="space-y-6">
          <StudyCard>
            <SectionHeader
              eyebrow="Recent sessions"
              title="Last 7 days."
              right={<StatusDot state="live" label="" />}
            />
            <div className="font-heading text-[28px] leading-none">
              {summary.total_hours_7d || 0}
              <span className="text-[15px] text-clay-700"> h</span>
            </div>
            {recent.length ? (
              <ul className="mt-3 space-y-1">
                {recent.map((w, i) => {
                  const hrs = w.h ?? w.hours ?? 0;
                  return (
                    <li
                      key={w.date || w.d || `w-${i}`}
                      className="grid grid-cols-[1fr_60px] gap-3 items-center text-[12.5px] py-1.5 border-b border-[#EFE7D4] last:border-0"
                    >
                      <span className="num-mono text-clay-700">{w.d || w.date}</span>
                      <span className="num-mono text-clay-700 text-right">{hrs}h</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-[12.5px] text-clay-700">
                No focus sessions logged in the last 7 days. Start a block to build your curve.
              </p>
            )}
          </StudyCard>

          <StudyCard className="!bg-[#F7F5FB] !border-[#DDDAE3]">
            <Eyebrow>After-session signal</Eyebrow>
            <h3 className="font-heading text-[18px] mt-1.5 text-[#31293B]">
              What this session affects
            </h3>
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-[#31293B]">
              <li className="flex gap-2 items-center">
                <span className="chip chip-user">u· focus-consistency</span>
                <span>updates focus consistency score</span>
              </li>
              <li className="flex gap-2 items-center">
                <span className="chip chip-engine">⚙ persona-recompute</span>
                <span>may trigger a persona snapshot recompute</span>
              </li>
              <li className="flex gap-2 items-center">
                <span className="chip chip-engine">⚙ task-size</span>
                <span>may shrink or expand future task size</span>
              </li>
            </ul>
            <div className="rule mt-4 pt-3 text-[11px] text-[#524864]">
              Used anonymously inside Study OS only — never for diagnosis, eligibility, or
              recruitment decisions.
            </div>
          </StudyCard>
        </div>
      </div>

      <Drawer
        open={!!reflectionSession}
        onClose={() => setReflectionSession(null)}
        title="Session reflection · 30 seconds"
      >
        {reflectionSession ? (
          <FocusReflectionPanel
            bare
            session={reflectionSession}
            onDismiss={() => setReflectionSession(null)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
