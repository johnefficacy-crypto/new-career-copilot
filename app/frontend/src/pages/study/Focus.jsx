import React, { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { api } from "../../lib/api";
import FocusReflectionPanel from "../../features/study/components/FocusReflectionPanel";
import { Card, Chip, Eyebrow, PageHeader, StatusDot } from "../../shared/ui/studyos";

const PRESETS = [25, 50, 90];
const RING_CIRCUMFERENCE = 540;

export default function Focus() {
  const [subject, setSubject] = useState("Quant");
  const [topic, setTopic] = useState("Percentage & Ratio");
  const [duration, setDuration] = useState(50);
  const [remaining, setRemaining] = useState(50 * 60);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [summary, setSummary] = useState({ total_hours_7d: 0, week: [] });
  // Today's tasks — best-effort, used only to offer a "linked task" selector.
  const [todayTasks, setTodayTasks] = useState([]);
  const [linkedTaskId, setLinkedTaskId] = useState("");
  // Holds the just-finished session so the reflection panel can render.
  const [reflectionSession, setReflectionSession] = useState(null);
  const tickRef = useRef(null);

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
    const s = await api.post("/api/study/focus/start", {
      subject,
      topic,
      duration_min: duration,
    });
    setSessionId(s.id);
    setRunning(true);
    setReflectionSession(null);
  }
  function pause() {
    setRunning(false);
  }
  function reset() {
    setRunning(false);
    setSessionId(null);
    setRemaining(duration * 60);
  }
  async function finish(auto = false) {
    const completedMin = Math.round((duration * 60 - remaining) / 60);
    if (sessionId) {
      await api.post("/api/study/focus/stop", {
        id: sessionId,
        completed_min: auto ? duration : completedMin,
      });
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

  const total = duration * 60;
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");
  const ringPct = total ? (total - remaining) / total : 0;
  const phase = running ? "FOCUSING" : remaining === 0 ? "COMPLETE" : "READY";

  return (
    <div className="space-y-6" data-testid="focus-page">
      <PageHeader
        eyebrow="Focus · session"
        title="One task. Timed. With a reflection at the end."
        sub="The reflection feeds focus consistency back into your study policy — never used for diagnosis, eligibility or recruitment decisions."
        right={<StatusDot state="live" label="Live · /api/study/focus" />}
      />

      <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
        {/* Timer card */}
        <Card>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <Eyebrow>Linked task</Eyebrow>
              <div className="font-heading text-[22px] mt-1.5">{topic || "Untitled focus block"}</div>
              <div className="text-[12.5px] text-clay-700 mt-1">{subject} · timed session</div>
            </div>
            <div className="text-right shrink-0">
              <Eyebrow>Preset</Eyebrow>
              <div className="mt-2 flex gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setDuration(p)}
                    data-testid={`focus-preset-${p}`}
                    className={`text-[12px] px-3 py-1.5 rounded-full font-semibold ${
                      duration === p
                        ? "bg-[#2E2218] text-[#F3EADB]"
                        : "border border-[#E7DECB] text-clay-700"
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
            <svg width="240" height="240" viewBox="0 0 200 200" aria-hidden="true">
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
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringPct)}
                transform="rotate(-90 100 100)"
              />
              <text
                x="100"
                y="100"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="Fraunces"
                fontSize="42"
                fontWeight="600"
                fill="#2E2218"
                data-testid="focus-clock"
              >
                {mins}:{secs}
              </text>
              <text
                x="100"
                y="138"
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="10"
                letterSpacing="2"
                fill="#6C5038"
              >
                {phase}
              </text>
            </svg>
            <div className="mt-4 flex gap-2 flex-wrap justify-center">
              {!running && remaining > 0 && (
                <button
                  onClick={start}
                  data-testid="focus-start"
                  className="px-5 py-2.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[13px]"
                >
                  Start
                </button>
              )}
              {running && (
                <button
                  onClick={pause}
                  data-testid="focus-pause"
                  className="px-5 py-2.5 rounded-full bg-[#FBF6EF] border border-[#E7DECB] text-[#2E2218] font-semibold text-[13px]"
                >
                  Pause
                </button>
              )}
              <button
                onClick={reset}
                data-testid="focus-reset"
                className="px-5 py-2.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[13px]"
              >
                Reset
              </button>
              <button
                onClick={() => finish(false)}
                data-testid="focus-end"
                className="px-5 py-2.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[13px]"
              >
                End session
              </button>
            </div>
            <div className="mt-3 text-[11px] text-clay-700">
              <span className="kbd">space</span> start / pause &nbsp; <span className="kbd">esc</span> end
            </div>
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <Eyebrow>Session setup</Eyebrow>
            <div className="mt-3 space-y-3">
              {todayTasks.length > 0 ? (
                <label className="block">
                  <div className="text-[11px] text-clay-700 inline-flex items-center gap-1">
                    <Link2 className="h-3 w-3" aria-hidden="true" /> Linked task (optional)
                  </div>
                  <select
                    value={linkedTaskId}
                    onChange={(e) => pickLinkedTask(e.target.value)}
                    data-testid="focus-linked-task"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/80 text-sm"
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
              <label className="block">
                <div className="text-[11px] text-clay-700">Subject</div>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/80 text-sm"
                />
              </label>
              <label className="block">
                <div className="text-[11px] text-clay-700">Topic (optional)</div>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/80 text-sm"
                />
              </label>
            </div>

            <div className="rule mt-5 pt-4">
              <Eyebrow>Last 7 days</Eyebrow>
              <div className="mt-2 font-heading text-3xl font-semibold">
                {summary.total_hours_7d} <span className="text-base text-clay-700">h</span>
              </div>
              <div className="mt-3 flex items-end h-16 gap-2">
                {(summary.week || []).map((w, idx) => (
                  <div key={w.date || w.d || `week-${idx}`} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-md bg-[#EFE2C9] flex items-end h-full overflow-hidden">
                      <div
                        className="w-full bg-sage-500 rounded-md"
                        style={{ height: `${Math.min((w.h || 0) * 14, 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-clay-700">{w.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="!bg-[#F7F5FB] !border-[#DDDAE3]">
            <Eyebrow>After-session signal</Eyebrow>
            <h3 className="font-heading text-[18px] mt-1.5 text-[#31293B]">What this session affects</h3>
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-[#31293B]">
              <li className="flex gap-2">
                <Chip s={{ layer: "user", label: "focus-consistency" }} />
                <span>updates focus consistency score</span>
              </li>
              <li className="flex gap-2">
                <Chip s={{ layer: "engine", label: "persona-recompute" }} />
                <span>may trigger persona snapshot recompute</span>
              </li>
              <li className="flex gap-2">
                <Chip s={{ layer: "engine", label: "task-size" }} />
                <span>may shrink/expand future task size</span>
              </li>
            </ul>
            <div className="rule mt-4 pt-3 text-[11px] text-[#524864]">
              We use this signal anonymously inside Study OS. Not used for diagnosis, eligibility, or
              recruitment decisions.
            </div>
          </Card>
        </div>
      </div>

      {reflectionSession ? (
        <FocusReflectionPanel session={reflectionSession} onDismiss={() => setReflectionSession(null)} />
      ) : null}
    </div>
  );
}
