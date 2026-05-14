import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, StopCircle, Link2 } from "lucide-react";
import { api } from "../../lib/api";
import FocusReflectionPanel from "../../features/study/components/FocusReflectionPanel";
import { Eyebrow, StatusDot } from "../../shared/ui/studyos";

const PRESETS = [25, 50, 90];

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
    if (!running) return;
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

  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");
  const pct = ((duration * 60 - remaining) / (duration * 60)) * 100;

  return (
    <div className="space-y-6" data-testid="focus-page">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <Eyebrow>Focus · session</Eyebrow>
          <h1 className="font-heading text-[36px] leading-[1.05] mt-2">
            One task. Timed. With a reflection at the end.
          </h1>
          <p className="text-[14px] text-clay-700 mt-2 max-w-[64ch]">
            The reflection feeds focus consistency back into your study policy — never used for
            diagnosis, eligibility or recruitment decisions.
          </p>
        </div>
        <StatusDot state="live" label="Live · /api/study/focus" />
      </header>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card grain relative overflow-hidden rounded-[18px] !bg-[#2E2218] !border-[#2E2218] text-white p-10">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full blur-3xl bg-clay-500/30" />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-widest text-white/60">{subject} · {topic}</div>
            <div className="mt-10 font-heading text-[140px] leading-none font-semibold tracking-tight text-center" data-testid="focus-clock">
              {mins}:{secs}
            </div>
            <div className="mt-6 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-clay-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              {!running ? (
                <button onClick={start} className="btn btn-primary" data-testid="focus-start"><Play className="h-4 w-4" /> Start</button>
              ) : (
                <button onClick={pause} className="btn btn-primary" data-testid="focus-pause"><Pause className="h-4 w-4" /> Pause</button>
              )}
              <button onClick={reset} className="btn btn-ghost border-white/30 text-white" data-testid="focus-reset"><RotateCcw className="h-4 w-4" /> Reset</button>
              <button onClick={() => finish(false)} className="btn btn-ghost border-white/30 text-white" data-testid="focus-end"><StopCircle className="h-4 w-4" /> End session</button>
            </div>
            <div className="mt-8 flex items-center justify-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDuration(p)}
                  data-testid={`focus-preset-${p}`}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                    duration === p ? "bg-white text-dusk-900" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >
                  {p} min
                </button>
              ))}
            </div>
            <div className="mt-5 text-center text-[11px] text-white/50">
              <span className="kbd">space</span> start / pause &nbsp; <span className="kbd">esc</span> end
            </div>
          </div>
        </div>

        <div className="soft-card grain relative overflow-hidden rounded-[18px] p-6 space-y-4">
          <div>
            <Eyebrow>Session</Eyebrow>
            <div className="mt-2 space-y-3">
              {todayTasks.length > 0 ? (
                <label className="block">
                  <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Link2 className="h-3 w-3" aria-hidden="true" /> Linked task (optional)
                  </div>
                  <select
                    value={linkedTaskId}
                    onChange={(e) => pickLinkedTask(e.target.value)}
                    data-testid="focus-linked-task"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-white/80 text-sm"
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
                <div className="text-[11px] text-muted-foreground">Subject</div>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-white/80 text-sm" />
              </label>
              <label className="block">
                <div className="text-[11px] text-muted-foreground">Topic (optional)</div>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-white/80 text-sm" />
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Eyebrow>Last 7 days</Eyebrow>
            <div className="mt-3 font-heading text-3xl font-semibold">{summary.total_hours_7d} <span className="text-base text-muted-foreground">h</span></div>
            <div className="mt-3 flex items-end h-16 gap-2">
              {(summary.week || []).map((w, idx) => (
                <div key={w.date || w.d || `week-${idx}`} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-md bg-clay-100 flex items-end h-full">
                    <div className="w-full bg-clay-500 rounded-md" style={{ height: `${Math.min(w.h * 14, 100)}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{w.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {reflectionSession ? (
        <FocusReflectionPanel
          session={reflectionSession}
          onDismiss={() => setReflectionSession(null)}
        />
      ) : null}
    </div>
  );
}
