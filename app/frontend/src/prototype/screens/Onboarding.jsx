import React, { useEffect, useRef, useState } from "react";
import { QUEUE_BY_INTENT, QUEUE_CTA_EXAMPLE, QUESTION_BANK, SAMPLE_SESSION } from "../data/funnel";
import { Card, Eyebrow, FooterStrip, PageHeader, PrototypePage, SectionHeader } from "../ui";

const STATE_DEFS = {
  S0: { label: "S0 ENTRY", desc: "Read URL params · branch decision" },
  S1: { label: "S1 ANON_INIT", desc: "Insert funnel_sessions row · localStorage anonymous_id" },
  S2: { label: "S2 INTENT", desc: "4-button picker (cold) or auto-set (CTA)" },
  S3: { label: "S3 LOAD_PLAN", desc: "Build question queue · apply applies_when · cap 7" },
  S4: { label: "S4 ASK", desc: "One question per screen · optimistic write" },
  S5: { label: "S5 VALUE_PEEK", desc: "First non-zero match count → 'you may match X'" },
  S6: { label: "S6 LOGIN_GATE", desc: "Earned Google login · server-side stitch" },
  S7: { label: "S7 DONE", desc: "Profile adapter writes canonical tables" },
  S8: { label: "S8 PAUSED", desc: "Sidecar · save current_field_key · email day 3" },
};

function nowStr() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildIntro(branch) {
  if (branch === "cta") {
    return [
      { kind: "bot", text: "Hi — Career Copilot here. Let's check your eligibility for SSC CGL 2026.", t: "--:--" },
      { kind: "bot", text: "This takes under 2 minutes. Five short questions. No long forms.", t: "--:--" },
    ];
  }
  return [
    { kind: "bot", text: "Hi — Career Copilot here. I'm a guided assistant, not a long form.", t: "--:--" },
    { kind: "bot", text: "Two minutes, five-ish questions. I'll tell you why I'm asking each one, and you can leave any time — I save where you stop.", t: "--:--" },
  ];
}

function TypingDots() {
  return (
    <div className="flex items-end gap-2">
      <span className="inline-flex w-7 h-7 rounded-full bg-[#2E2218] items-center justify-center shrink-0">
        <span className="font-serif text-[11px] text-[#F3EADB]">cc</span>
      </span>
      <div className="rounded-2xl rounded-bl-md bg-white/90 border border-[#E7DECB] px-4 py-2.5">
        <span className="inline-flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A68057] animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#A68057] animate-pulse" style={{ animationDelay: "0.15s" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[#A68057] animate-pulse" style={{ animationDelay: "0.3s" }} />
        </span>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22 12c0-.85-.07-1.49-.2-2.16H12.2v3.94h5.62c-.11.97-.72 2.43-2.07 3.41l-.02.13 3 2.32.2.02C20.85 17.96 22 15.21 22 12z" fill="#F3EADB" />
      <path d="M12.2 22c2.7 0 4.97-.89 6.62-2.42l-3.16-2.44c-.85.59-1.99 1-3.46 1-2.65 0-4.9-1.74-5.7-4.15l-.12.01-3.12 2.4-.04.11C4.86 19.86 8.27 22 12.2 22z" fill="#D6BC93" />
    </svg>
  );
}

function Bubble({ m, onLogin, onSkipLogin }) {
  if (m.kind === "bot") {
    return (
      <div className="flex items-end gap-2 max-w-[88%]">
        <span className="inline-flex w-7 h-7 rounded-full bg-[#2E2218] items-center justify-center shrink-0">
          <span className="font-serif text-[11px] text-[#F3EADB]">cc</span>
        </span>
        <div className="rounded-2xl rounded-bl-md bg-white/90 border border-[#E7DECB] px-4 py-2.5">
          <p className="text-[14px] text-clay-900 leading-snug">{m.text}</p>
          <div className="num-mono text-[9px] text-[#A68057] mt-1.5">{m.t}</div>
        </div>
      </div>
    );
  }
  if (m.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          <div className="rounded-2xl rounded-br-md bg-[#2E2218] text-[#F3EADB] px-4 py-2.5">
            <p className="text-[13.5px]">{m.text}</p>
          </div>
          <div className="text-right num-mono text-[9px] text-[#A68057] mt-1 mr-1">{m.t}</div>
        </div>
      </div>
    );
  }
  if (m.kind === "peek") {
    return (
      <div className="rounded-2xl bg-[#F0F5EF] border border-[#94B28A] px-4 py-3.5 ml-9 relative">
        <div className="flex items-start gap-3">
          <span className="text-[20px]" style={{ color: "#33482F" }}>◐</span>
          <div className="flex-1">
            <div className="eyebrow !text-[10px] !text-[#33482F]">Earned moment · S5 VALUE_PEEK</div>
            <div className="font-serif text-[17px] text-[#33482F] mt-1">You may match <strong>{m.count} exams</strong>.</div>
            <div className="text-[12px] text-[#33482F] mt-1">Two more questions to lock the eligibility check. Sign in to save your progress.</div>
          </div>
        </div>
      </div>
    );
  }
  if (m.kind === "loginGate") {
    return (
      <div className="rounded-2xl bg-white/95 border border-[#2E2218] px-4 py-4 ml-9">
        <div className="eyebrow !text-[10px]">S6 LOGIN_GATE · earned, skippable</div>
        <div className="font-serif text-[17px] mt-1">Save your progress in 1 tap.</div>
        <div className="text-[12px] text-clay-700 mt-1 max-w-[44ch]">Server-side session stitch: your anonymous answers attach to your Google account on the same row. Nothing is lost.</div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button onClick={onLogin} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] text-[13px] font-semibold">
            <GoogleGlyph /> Continue with Google
          </button>
          <button onClick={onSkipLogin} className="px-3 py-2 rounded-full text-[12px] text-clay-700">Continue without signing in</button>
        </div>
        <div className="num-mono text-[10px] text-clay-700 mt-3">scope: name + email only · no avatar, no contacts, no calendar</div>
      </div>
    );
  }
  if (m.kind === "done") {
    return (
      <div className="rounded-2xl bg-[#2E2218] text-[#F3EADB] border border-[#2E2218] px-5 py-5 ml-9 relative overflow-hidden">
        <div className="grain absolute inset-0 opacity-30" />
        <div className="relative">
          <div className="eyebrow !text-[10px] !text-[#D6BC93]">S7 DONE · canonical written</div>
          <div className="font-serif text-[22px] mt-1.5">You're set up.</div>
          <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[44ch]">
            Profile adapter wrote to aspirant_profile, aspirant_education and funnel_sessions.completed_at.
          </p>
          <ul className="mt-4 space-y-1.5">
            {["SSC CGL 2026 (Tier 1)", "SSC CHSL 2026", "RBI Office Asst 2026"].map((x, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <span className="text-[#94B28A]">✓</span>
                <span>{x}</span>
                <span className="ml-auto num-mono text-[10.5px] text-[#A68057]">eligible</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  if (m.kind === "paused") {
    return (
      <div className="rounded-2xl bg-[#F3E9CF] border border-[#BE9C6B] px-4 py-3.5 ml-9">
        <div className="eyebrow !text-[10px] !text-[#6F5A22]">S8 PAUSED · sidecar</div>
        <div className="font-serif text-[16px] text-[#6F5A22] mt-1">Saved. We'll email you on day 3.</div>
      </div>
    );
  }
  return null;
}

function AnswerControls({ q, onIntent, onAnswer, answers }) {
  const [text, setText] = useState("");
  const [sliderVal, setSliderVal] = useState(q?.kind === "slider" ? q.slider?.default || 5 : 5);
  if (!q) return null;

  if (q.key === "intent" && onIntent) {
    return (
      <div className="ml-9 mt-1">
        <div className="grid sm:grid-cols-2 gap-2">
          {q.chips.map((c) => (
            <button
              key={c.v}
              onClick={() => onIntent(c.v)}
              className="text-left rounded-xl border border-[#E7DECB] bg-white/80 hover:bg-white hover:border-[#A68057] px-3.5 py-3 transition"
            >
              <div className="flex items-center gap-2">
                <span className="text-[18px] text-[#A68057]">{c.icon}</span>
                <span className="text-[13px] font-medium text-clay-900">{c.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (q.kind === "chips_single") {
    const chips = q.chipsByFamily ? q.chipsByFamily[answers?.exam_family] || [] : q.chips;
    return (
      <div className="ml-9 mt-1 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.v}
            onClick={() => onAnswer(c.v, c.label)}
            className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] bg-white/80 hover:bg-[#2E2218] hover:text-[#F3EADB] hover:border-[#2E2218] text-clay-900 font-medium transition"
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  }
  if (q.kind === "slider") {
    return (
      <div className="ml-9 mt-1 rounded-xl border border-[#E7DECB] bg-white/80 p-3.5 max-w-[400px]">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-clay-700">{q.slider.min}{q.slider.suffix}</span>
          <span className="font-serif text-[18px] num-mono">{sliderVal}{q.slider.suffix}</span>
          <span className="text-clay-700">{q.slider.max}{q.slider.suffix}</span>
        </div>
        <input
          type="range"
          min={q.slider.min}
          max={q.slider.max}
          step={q.slider.step}
          value={sliderVal}
          onChange={(e) => setSliderVal(Number(e.target.value))}
          className="w-full mt-2 accent-[#54794E]"
        />
        <button onClick={() => onAnswer(sliderVal, `${sliderVal} ${q.slider.suffix}/day`)} className="mt-2 w-full px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold">
          Confirm
        </button>
      </div>
    );
  }
  if (q.kind === "text_parsed" || q.kind === "text_simple") {
    return (
      <div className="ml-9 mt-1 flex gap-2 max-w-[400px]">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={q.placeholder || "Type your answer…"}
          className="flex-1 px-3 py-2 rounded-full border border-[#E7DECB] bg-white/80 text-[13px] outline-none"
        />
        <button
          onClick={() => {
            if (text) {
              onAnswer(text, text);
              setText("");
            }
          }}
          className="px-3 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold"
        >
          Send
        </button>
      </div>
    );
  }
  return null;
}

function Stat2({ k, v, sub, tone }) {
  return (
    <div>
      <div className="eyebrow !text-[9px]">{k}</div>
      <div className={`font-serif text-[20px] mt-0.5 leading-none ${tone === "sage" ? "text-[#33482F]" : "text-clay-900"}`}>{v}</div>
      <div className="text-[10.5px] text-clay-700 mt-1">{sub}</div>
    </div>
  );
}

function StatsCard({ progressPct, answered, totalQ, matchPreview, elapsedSec, state }) {
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  const completion = Math.min(100, Math.round(progressPct));
  return (
    <Card>
      <Eyebrow>Live · this session</Eyebrow>
      <h3 className="font-serif text-[17px] mt-1">Real-time stats</h3>
      <div className="mt-3 flex items-center gap-4">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r="36" fill="none" stroke="#EFE2C9" strokeWidth="6" />
          <circle
            cx="42"
            cy="42"
            r="36"
            fill="none"
            stroke="#54794E"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={Math.PI * 72}
            strokeDashoffset={Math.PI * 72 * (1 - completion / 100)}
            transform="rotate(-90 42 42)"
            style={{ transition: "stroke-dashoffset 0.5s" }}
          />
          <text x="42" y="42" textAnchor="middle" dominantBaseline="central" fontFamily="Fraunces" fontSize="18" fontWeight="600" fill="#2E2218">{completion}%</text>
        </svg>
        <div className="flex-1">
          <div className="text-[11.5px] text-clay-700">Profile completion</div>
          <div className="num-mono text-[11px] text-clay-900 mt-1">{answered} / ~{totalQ} questions</div>
          <div className="num-mono text-[10.5px] text-[#33482F] mt-0.5">{state}</div>
        </div>
      </div>
      <div className="rule mt-4 pt-3 grid grid-cols-2 gap-3">
        <Stat2 k="Match preview" v={<span className="num-mono">{matchPreview}</span>} sub={matchPreview === 0 ? "answer 2 more" : "exams · live"} tone="sage" />
        <Stat2 k="Time elapsed" v={<span className="num-mono">{m}:{s.toString().padStart(2, "0")}</span>} sub="goal · under 2m" />
      </div>
    </Card>
  );
}

function StateInspector({ state, queue, qIndex, answers, loggedIn, branch }) {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <Eyebrow dark>State inspector · debug-only</Eyebrow>
      <div className="font-serif text-[15px] text-[#F3EADB] mt-1">{STATE_DEFS[state]?.label || state}</div>
      <div className="text-[11px] text-[#D6BC93] mt-1">{STATE_DEFS[state]?.desc}</div>
      <div className="rule mt-3 pt-3 space-y-1.5 text-[10.5px] num-mono text-[#D6BC93]" style={{ borderColor: "#4E3A29" }}>
        <div>anonymous_id <span className="text-[#F3EADB]">{SAMPLE_SESSION.anonymous_id}</span></div>
        <div>user_id <span className="text-[#F3EADB]">{loggedIn ? "usr_8a2…f31" : "null"}</span></div>
        <div>branch <span className="text-[#F3EADB]">{branch}</span></div>
        <div>queue <span className="text-[#F3EADB]">[{queue.join(", ")}]</span></div>
        <div>q_index <span className="text-[#F3EADB]">{qIndex}</span></div>
      </div>
      <div className="rule mt-3 pt-3" style={{ borderColor: "#4E3A29" }}>
        <div className="eyebrow !text-[9px] !text-[#A68057]">answers (so far)</div>
        <div className="mt-1.5 space-y-0.5 num-mono text-[10.5px] text-[#F3EADB]">
          {Object.entries(answers).length === 0 ? (
            <div className="text-[#A68057]">{"{}"}</div>
          ) : (
            Object.entries(answers).map(([k, v]) => (
              <div key={k}>{k}: <span className="text-[#94B28A]">"{String(v)}"</span></div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function WhyAskingCard({ currentQ }) {
  if (!currentQ) return null;
  return (
    <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
      <Eyebrow>Why we're asking</Eyebrow>
      <div className="font-serif text-[15px] text-[#33482F] mt-1">{currentQ.botText}</div>
      <p className="text-[11.5px] text-[#33482F] mt-2 leading-snug">{currentQ.why}</p>
      <div className="rule mt-3 pt-2.5" style={{ borderColor: "#B9CFAF" }}>
        <div className="eyebrow !text-[9px] !text-[#33482F]">Writes to</div>
        <ul className="mt-1 space-y-0.5 num-mono text-[10px] text-[#33482F]">
          {(currentQ.writes || []).map((w, i) => <li key={i}>· {w}</li>)}
        </ul>
      </div>
    </Card>
  );
}

function OnboardingExperience({ branch }) {
  const initialQueue = branch === "cta" ? QUEUE_CTA_EXAMPLE : [];
  const initialAnswers = branch === "cta" ? { intent: "check_eligibility", exam_family: "ssc", exam_specific: "cgl" } : {};

  const [state, setState] = useState("S2");
  const [queue, setQueue] = useState(initialQueue);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const [messages, setMessages] = useState(() => buildIntro(branch));
  const [typing, setTyping] = useState(false);
  const [matchPreview, setMatchPreview] = useState(0);
  const [peekShown, setPeekShown] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (state === "S7" || paused) return undefined;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state, paused]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
  }, [messages, typing]);

  useEffect(() => {
    if (branch === "cta" && state === "S2") {
      setMessages((m) => [...m, { kind: "bot", text: "You're coming from the SSC CGL eligibility funnel. I've pulled what we need.", t: nowStr() }]);
      const t = setTimeout(() => {
        const firstKey = QUEUE_CTA_EXAMPLE[0];
        const q = QUESTION_BANK[firstKey];
        setQueue(QUEUE_CTA_EXAMPLE);
        setState("S4");
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setMessages((m) => [...m, { kind: "bot", text: q.botText, t: nowStr(), questionKey: q.key }]);
        }, 320);
      }, 800);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line
  }, []);

  function askQuestion(q) {
    if (!q) return;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { kind: "bot", text: q.botText, t: nowStr(), questionKey: q.key }]);
    }, 320);
  }

  function pickIntent(v) {
    const intent = QUESTION_BANK.intent;
    const chip = intent.chips.find((c) => c.v === v);
    setMessages((m) => [...m, { kind: "user", text: chip.label, t: nowStr() }]);
    const newAnswers = { ...answers, intent: v };
    setAnswers(newAnswers);
    const newQueue = QUEUE_BY_INTENT[v] || [];
    setQueue(newQueue);
    setQIndex(0);
    setState("S3");
    setTimeout(() => {
      setState("S4");
      askQuestion(QUESTION_BANK[newQueue[0]]);
    }, 600);
  }

  function advance(currentQueue) {
    const next = (currentQueue || queue)[qIndex + 1];
    setQIndex(qIndex + 1);
    if (next) {
      setState("S4");
      askQuestion(QUESTION_BANK[next]);
    } else {
      setState("S7");
      setTimeout(() => setMessages((m) => [...m, { kind: "done", t: nowStr() }]), 500);
    }
  }

  function answer(key, valueRaw, displayLabel) {
    setMessages((m) => [...m, { kind: "user", text: displayLabel, t: nowStr() }]);
    const newAnswers = { ...answers, [key]: valueRaw };
    setAnswers(newAnswers);
    let newPreview = matchPreview;
    if (key === "exam_family") newPreview = 18;
    if (key === "exam_specific") newPreview = 12;
    if (key === "education") newPreview = 9;
    if (key === "grad_year") newPreview = 9;
    if (key === "state_domicile") newPreview = 11;
    if (key === "hours_per_day") newPreview = Math.max(newPreview, 7);
    if (key === "phase") newPreview = Math.max(newPreview, 8);
    setMatchPreview(newPreview);
    const nextQueue = (queue || []).filter((k, idx) => {
      if (idx <= qIndex) return true;
      const def = QUESTION_BANK[k];
      if (!def?.appliesWhen) return true;
      return def.appliesWhen(newAnswers);
    });
    setQueue(nextQueue);
    const answeredCount = Object.keys(newAnswers).length;
    if (!peekShown && newPreview > 0 && answeredCount >= 3) {
      setPeekShown(true);
      setTimeout(() => {
        setState("S5");
        setMessages((m) => [...m, { kind: "peek", count: newPreview, t: nowStr() }]);
        setTimeout(() => {
          if (!loggedIn) {
            setState("S6");
            setMessages((m) => [...m, { kind: "loginGate", t: nowStr() }]);
          } else {
            advance(nextQueue);
          }
        }, 900);
      }, 600);
      return;
    }
    advance(nextQueue);
  }

  function handleLogin() {
    setLoggedIn(true);
    setMessages((m) => [...m, { kind: "user", text: "Continued with Google · a.mehra@gmail.com", t: nowStr() }]);
    setTimeout(() => {
      setState("S4");
      const next = queue[qIndex + 1];
      setQIndex(qIndex + 1);
      if (next) askQuestion(QUESTION_BANK[next]);
      else {
        setState("S7");
        setMessages((m) => [...m, { kind: "done", t: nowStr() }]);
      }
    }, 700);
  }

  function handleSkipLogin() {
    setMessages((m) => [...m, { kind: "user", text: "Skipped login (will re-ask later)", t: nowStr() }]);
    setTimeout(() => {
      setState("S4");
      const next = queue[qIndex + 1];
      setQIndex(qIndex + 1);
      if (next) askQuestion(QUESTION_BANK[next]);
      else {
        setState("S7");
        setMessages((m) => [...m, { kind: "done", t: nowStr() }]);
      }
    }, 500);
  }

  function handlePause() {
    setPaused(true);
    setState("S8");
    setMessages((m) => [...m, { kind: "paused", t: nowStr() }]);
  }

  function handleRestart() {
    if (typeof window !== "undefined") window.location.reload();
  }

  const totalQ = Math.max(queue.length, 5);
  const answeredQ = Math.min(qIndex, totalQ);
  const progressPct = state === "S7" ? 100 : Math.round((answeredQ / totalQ) * 100);

  const currentKey = state === "S2" ? "intent" : state === "S4" || state === "S5" ? queue[qIndex] : null;
  const currentQ = currentKey ? QUESTION_BANK[currentKey] : null;

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <Card padded={false}>
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex w-6 h-6 rounded-full bg-[#2E2218] items-center justify-center">
                <span className="font-serif text-[12px] text-[#F3EADB]">cc</span>
              </span>
              <div>
                <div className="font-serif text-[15px] leading-tight">Career Copilot · onboarding</div>
                <div className="num-mono text-[10px] text-clay-700 mt-0.5">
                  {state === "S7" ? "Complete" : `Question ${answeredQ} of ~${totalQ}`} · {state}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state !== "S7" ? (
                <button onClick={handlePause} className="text-[10.5px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
                  Save & finish later
                </button>
              ) : null}
              <button onClick={handleRestart} className="text-[10.5px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
                Restart
              </button>
            </div>
          </div>
          <div className="h-[3px] bg-[#EFE2C9] rounded-full overflow-hidden">
            <div className="h-full bg-[#54794E] transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div ref={chatEndRef} className="px-6 py-4 max-h-[560px] overflow-y-auto space-y-3.5">
          {messages.map((m, i) => (
            <Bubble key={i} m={m} onLogin={handleLogin} onSkipLogin={handleSkipLogin} />
          ))}
          {typing ? <TypingDots /> : null}
          {state === "S2" && !typing && messages.length > 0 ? (
            <AnswerControls q={QUESTION_BANK.intent} onIntent={pickIntent} />
          ) : null}
          {(state === "S4" || state === "S5") && currentQ && !typing ? (
            <AnswerControls
              q={currentQ}
              onAnswer={(v, label) => answer(currentKey, v, label)}
              answers={answers}
            />
          ) : null}
        </div>
        <div className="px-6 py-3 border-t border-[#E7DECB] bg-[#FBF8F2] text-[10.5px] text-clay-700 flex items-center gap-3 flex-wrap">
          <span className="num-mono uppercase tracking-[0.16em]">Trust</span>
          <span>· Caste / income / disability never asked here</span>
          <span>· Free text never feeds eligibility</span>
          <span>· You can leave anytime · we save where you left off</span>
        </div>
      </Card>
      <aside className="space-y-4">
        <StatsCard
          progressPct={progressPct}
          answered={Object.keys(answers).length}
          totalQ={totalQ}
          matchPreview={matchPreview}
          elapsedSec={elapsedSec}
          state={state}
        />
        <StateInspector
          state={state}
          queue={queue}
          qIndex={qIndex}
          answers={answers}
          loggedIn={loggedIn}
          paused={paused}
          branch={branch}
        />
        <WhyAskingCard currentQ={currentQ} />
      </aside>
    </div>
  );
}

function StateMachineSection() {
  return (
    <Card>
      <SectionHeader
        eyebrow="State machine"
        title="9 states. Two entry branches. Explicit transitions."
        sub="Modeled to be implementable as an XState machine or zustand+immer state. Each transition logs to a single events stream."
      />
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>State</th><th>Trigger</th><th>Reads</th><th>Writes</th><th>Next</th></tr>
          </thead>
          <tbody>
            {[
              { s: "S0 ENTRY", trig: "URL load", reads: "URL params · cookies", writes: "—", next: "S1" },
              { s: "S1 ANON_INIT", trig: "S0 done", reads: "localStorage.anonymous_id", writes: "funnel_sessions row · cookie", next: "S2" },
              { s: "S2 INTENT", trig: "S1 done", reads: "URL · recruitment_id", writes: "funnel_sessions.intent", next: "S3" },
              { s: "S3 LOAD_PLAN", trig: "intent set", reads: "persona_question_bank · recruitment_question_requirements", writes: "local queue", next: "S4" },
              { s: "S4 ASK", trig: "answer or queue advance", reads: "queue[q_index]", writes: "onboarding_answers · persona_question_answers", next: "S4 / S5 / S7" },
              { s: "S5 VALUE_PEEK", trig: "recompute delta > 0 (first time)", reads: "eligibility_results count", writes: "peek_shown_at", next: "S6 if anon else S4" },
              { s: "S6 LOGIN_GATE", trig: "after S5, if anon", reads: "—", writes: "oauth_state_token · funnel_sessions.user_id on callback", next: "S4 resume or S7" },
              { s: "S7 DONE", trig: "queue empty", reads: "onboarding_answers (full)", writes: "aspirant_profile · aspirant_education · funnel_sessions.completed_at", next: "—" },
              { s: "S8 PAUSED", trig: "explicit dismiss · idle 60s", reads: "current state", writes: "persona_question_dismissals · onboarding_sessions.current_field_key", next: "resume → S4" },
            ].map((r, i) => (
              <tr key={i}>
                <td><strong>{r.s}</strong></td>
                <td className="text-[#3a2e22]">{r.trig}</td>
                <td className="num-mono text-clay-700 text-[11px]">{r.reads}</td>
                <td className="num-mono text-clay-700 text-[11px]">{r.writes}</td>
                <td className="num-mono text-clay-700">{r.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ModernImprovements() {
  const items = [
    { k: "01", t: "State machine as a single source of truth", b: "Implement S0–S8 as an XState (or zustand+immer) machine. Log every transition to a single 'funnel_events' stream." },
    { k: "02", t: "Optimistic localStorage writes", b: "Every answer hits localStorage instantly, then async-syncs to onboarding_answers. Resume from local if the user refreshes." },
    { k: "03", t: "Server-side session stitching", b: "On the Google OAuth callback, the SERVER looks up funnel_sessions by anonymous_id cookie and merges. The client just swaps its JWT." },
    { k: "04", t: "PKCE OAuth — no client secrets", b: "Use PKCE instead of the deprecated implicit flow. Refresh tokens stored in HttpOnly cookies, not localStorage." },
    { k: "05", t: "Passkey alongside Google", b: "Add WebAuthn passkey as a parallel option for repeat visitors. Falls back to Google for users without passkey support." },
    { k: "06", t: "Earned login moment, never gated", b: "Show value (S5) before asking for credentials. A user who has seen 14 matches converts to login at 62% — vs ~15% if you gate the homepage." },
    { k: "07", t: "Magic-link fallback", b: "If Google fails or user prefers email, send a single-tap magic link. Never collect passwords in onboarding." },
    { k: "08", t: "Allowlisted parsers for free text", b: "Free text fields use strict regex/grammar parsers. On failure: re-ask with hint. Eligibility engine never sees raw user text." },
    { k: "09", t: "Append-only log + adapter at S7", b: "onboarding_answers is immutable audit. Canonical tables get written only by the profile adapter at S7." },
    { k: "10", t: "Idle suggestion → S8 PAUSED at 60s", b: "If a question sits unanswered for 60s, surface 'Save & finish later' inline. Day-3 email with deep-link resume token." },
    { k: "11", t: "Smart prefill from typed intent", b: "NLP suggests chips when the user pastes free-form text — but never auto-fills it." },
    { k: "12", t: "Anonymous events are still useful", b: "Sessions that never log in still feed product analytics under rotating anon IDs. GDPR-safe; no PII pre-S6." },
    { k: "13", t: "Identity scope minimization on Google", b: "Ask Google for name + email only. No avatar, no contacts, no calendar." },
    { k: "14", t: "Funnel deep-links carry intent", b: "Blog CTAs link to /funnel/<exam>?intent=<intent>&utm=… — that intent is written to funnel_sessions at S1." },
  ];
  return (
    <div className="space-y-6">
      <Card className="!bg-[#2E2218] !border-[#2E2218]">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 rounded-2xl bg-[#4E3A29] border border-[#6C5038] flex items-center justify-center">
            <span className="font-serif text-[24px] text-[#D6BC93]">↗</span>
          </div>
          <div>
            <Eyebrow dark>14 improvements over the original spec</Eyebrow>
            <h2 className="font-serif text-[22px] mt-1 text-[#F3EADB] leading-tight">Modern, ship-able techniques — keeping the same state machine.</h2>
            <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[64ch]">These are additive. The S0–S8 model holds.</p>
          </div>
        </div>
      </Card>
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((it) => (
          <article key={it.k} className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <div className="flex items-baseline gap-2">
              <span className="num-mono text-[11.5px] text-[#A68057]">{it.k}</span>
              <span className="font-serif text-[15px] leading-snug">{it.t}</span>
            </div>
            <p className="text-[12.5px] text-[#3a2e22] mt-1.5 leading-snug">{it.b}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function PrototypeOnboarding() {
  const [branch, setBranch] = useState("cold");
  const [section, setSection] = useState("live");
  return (
    <PrototypePage label="Onboarding · chat-style funnel">
      <div className="px-10 pt-9">
        <PageHeader
          eyebrow="Onboarding · auth · funnel"
          title="Chat-style onboarding. Earned login. Server-stitched sessions."
          sub="Replaces the email/password form with a 5–7 question conversation. Anonymous-first. Login is offered only after we've shown value."
          right={
            <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
              <button
                onClick={() => setBranch("cold")}
                className={`text-[11.5px] px-3 py-1 rounded-full font-semibold ${branch === "cold" ? "bg-[#2E2218] text-[#F3EADB]" : "text-clay-700"}`}
              >
                Cold · /home
              </button>
              <button
                onClick={() => setBranch("cta")}
                className={`text-[11.5px] px-3 py-1 rounded-full font-semibold ${branch === "cta" ? "bg-[#2E2218] text-[#F3EADB]" : "text-clay-700"}`}
              >
                CTA · /funnel/ssc-cgl
              </button>
            </div>
          }
        />
      </div>
      <div className="px-10 space-y-6">
        <div className="flex items-center gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB] w-fit">
          {[
            { v: "live", label: "Live experience" },
            { v: "machine", label: "State machine" },
            { v: "improvements", label: "Modern improvements" },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setSection(t.v)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${section === t.v ? "bg-[#2E2218] text-[#F3EADB]" : "text-clay-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {section === "live" ? <OnboardingExperience branch={branch} key={branch} /> : null}
        {section === "machine" ? <StateMachineSection /> : null}
        {section === "improvements" ? <ModernImprovements /> : null}
      </div>
      <FooterStrip />
    </PrototypePage>
  );
}
