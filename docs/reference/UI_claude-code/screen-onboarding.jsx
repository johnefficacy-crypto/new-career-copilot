/* /app/onboarding — Chat-style onboarding with state machine + modern improvements */
const { useState: useStateOB, useEffect: useEffectOB, useRef: useRefOB, useMemo: useMemoOB } = React;

const STATE_DEFS = {
  S0: { label:"S0 ENTRY",       desc:"Read URL params · branch decision" },
  S1: { label:"S1 ANON_INIT",   desc:"Insert funnel_sessions row · localStorage anonymous_id" },
  S2: { label:"S2 INTENT",      desc:"4-button picker (cold) or auto-set (CTA)" },
  S3: { label:"S3 LOAD_PLAN",   desc:"Build question queue · apply applies_when · cap 7" },
  S4: { label:"S4 ASK",         desc:"One question per screen · optimistic write" },
  S5: { label:"S5 VALUE_PEEK",  desc:"First non-zero match count → 'you may match X'" },
  S6: { label:"S6 LOGIN_GATE",  desc:"Earned Google login · server-side stitch" },
  S7: { label:"S7 DONE",        desc:"Profile adapter writes canonical tables" },
  S8: { label:"S8 PAUSED",      desc:"Sidecar · save current_field_key · email day 3" },
};

function ScreenOnboarding() {
  const [branch, setBranch] = useStateOB("cold");      // cold | cta
  const [section, setSection] = useStateOB("live");    // live | machine | improvements
  return (
    <div data-screen-label="Onboarding · chat-style funnel">
      <PageHeader eyebrow="Onboarding · auth · funnel"
        title="Chat-style onboarding. Earned login. Server-stitched sessions."
        sub="Replaces the Supabase email/password form with a 5–7 question conversation. Anonymous-first. Login is offered only after we've shown value."
        right={
          <div className="flex gap-2 items-center">
            <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
              <button onClick={()=>setBranch("cold")}
                className={`text-[11.5px] px-3 py-1 rounded-full font-semibold ${branch==='cold' ? 'bg-[#2E2218] text-[#F3EADB]' : 'text-[#6C5038]'}`}>Cold · /home</button>
              <button onClick={()=>setBranch("cta")}
                className={`text-[11.5px] px-3 py-1 rounded-full font-semibold ${branch==='cta' ? 'bg-[#2E2218] text-[#F3EADB]' : 'text-[#6C5038]'}`}>CTA · /funnel/ssc-cgl?intent=…</button>
            </div>
          </div>
        } />

      <div className="px-10 space-y-6">
        <div className="flex items-center gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB] w-fit">
          {[
            { v:"live",         label:"Live experience" },
            { v:"machine",      label:"State machine" },
            { v:"improvements", label:"Modern improvements" },
          ].map(t => (
            <button key={t.v} onClick={()=>setSection(t.v)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${section===t.v ? 'bg-[#2E2218] text-[#F3EADB]' : 'text-[#6C5038]'}`}>{t.label}</button>
          ))}
        </div>

        {section === "live"         && <OnboardingExperience branch={branch} key={branch} />}
        {section === "machine"      && <StateMachineSection />}
        {section === "improvements" && <ModernImprovements />}
      </div>
      <FooterStrip />
    </div>
  );
}

/* ─── LIVE EXPERIENCE ───────────────────────────────────────────────────── */

function OnboardingExperience({ branch }) {
  /* Build initial state based on branch */
  const initialIntent = branch === "cta" ? "check_eligibility" : null;
  const initialQueue  = branch === "cta" ? QUEUE_CTA_EXAMPLE : null;
  const initialAnswers = branch === "cta" ? { intent: "check_eligibility", exam_family:"ssc", exam_specific:"cgl" } : {};

  const [state, setState]     = useStateOB(branch === "cta" ? "S2" : "S2");
  const [queue, setQueue]     = useStateOB(initialQueue || []);
  const [qIndex, setQIndex]   = useStateOB(0);
  const [answers, setAnswers] = useStateOB(initialAnswers);
  const [messages, setMessages] = useStateOB(() => buildIntro(branch));
  const [typing, setTyping]   = useStateOB(false);
  const [matchPreview, setMatchPreview] = useStateOB(0);
  const [peekShown, setPeekShown] = useStateOB(false);
  const [loggedIn, setLoggedIn] = useStateOB(false);
  const [paused, setPaused] = useStateOB(false);
  const [elapsedSec, setElapsedSec] = useStateOB(0);
  const [showInspector, setShowInspector] = useStateOB(true);
  const chatEndRef = useRefOB(null);

  /* tick timer */
  useEffectOB(() => {
    if (state === "S7" || paused) return;
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [state, paused]);

  /* auto-scroll on new msg */
  useEffectOB(() => {
    if (chatEndRef.current) chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
  }, [messages, typing]);

  /* If CTA branch, auto-advance to S3 → S4 with the first question */
  useEffectOB(() => {
    if (branch === "cta" && state === "S2") {
      addBot("You're coming from the SSC CGL eligibility funnel. I've pulled what we need.");
      setTimeout(() => {
        const q = QUESTION_BANK[QUEUE_CTA_EXAMPLE[0]];
        setQueue(QUEUE_CTA_EXAMPLE);
        setState("S4");
        askQuestion(q);
      }, 800);
    }
  }, []);

  function addBot(text, extras = {}) {
    setMessages(m => [...m, { kind:"bot", text, t:nowStr(), ...extras }]);
  }
  function addUser(text, key) {
    setMessages(m => [...m, { kind:"user", text, t:nowStr(), key }]);
  }
  function askQuestion(q) {
    if (!q) return;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { kind:"bot", text:q.botText, t:nowStr(), questionKey:q.key }]);
    }, 320);
  }
  function nowStr() { return new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", second:"2-digit" }); }

  /* Intent picker handler (S2) */
  function pickIntent(v) {
    const intent = QUESTION_BANK.intent;
    const chip = intent.chips.find(c=>c.v===v);
    addUser(chip.label, "intent");
    const newAnswers = { ...answers, intent: v };
    setAnswers(newAnswers);
    /* If browsing — short-circuit to a stub S4 */
    const newQueue = QUEUE_BY_INTENT[v] || [];
    setQueue(newQueue);
    setQIndex(0);
    setState("S3");
    setTimeout(() => {
      setState("S4");
      askQuestion(QUESTION_BANK[newQueue[0]]);
    }, 600);
  }

  /* Generic answer handler */
  function answer(key, valueRaw, displayLabel) {
    const q = QUESTION_BANK[key];
    addUser(displayLabel, key);
    const newAnswers = { ...answers, [key]: valueRaw };
    setAnswers(newAnswers);

    /* Simulated match preview bump */
    let newPreview = matchPreview;
    if (key === "exam_family") newPreview = 18;
    if (key === "exam_specific") newPreview = 12;
    if (key === "education") newPreview = 9;
    if (key === "grad_year") newPreview = 9;
    if (key === "state_domicile") newPreview = 11;
    if (key === "hours_per_day") newPreview = Math.max(newPreview, 7);
    if (key === "phase") newPreview = Math.max(newPreview, 8);
    setMatchPreview(newPreview);

    /* applies_when prune the queue */
    const nextQueue = (queue || []).filter((k,idx) => {
      if (idx <= qIndex) return true;
      const def = QUESTION_BANK[k];
      if (!def?.appliesWhen) return true;
      return def.appliesWhen(newAnswers);
    });
    setQueue(nextQueue);

    /* S5 VALUE_PEEK: first time preview > 0 (and not yet shown) and we've answered >= 3 things */
    const answeredCount = Object.keys(newAnswers).length;
    if (!peekShown && newPreview > 0 && answeredCount >= 3) {
      setPeekShown(true);
      setTimeout(() => {
        setState("S5");
        setMessages(m => [...m, { kind:"peek", count: newPreview, t:nowStr() }]);
        setTimeout(() => {
          if (!loggedIn) {
            setState("S6");
            setMessages(m => [...m, { kind:"loginGate", t:nowStr() }]);
          } else {
            advance(nextQueue);
          }
        }, 900);
      }, 600);
      return;
    }

    advance(nextQueue);
  }

  function advance(currentQueue) {
    const next = (currentQueue || queue)[qIndex + 1];
    setQIndex(qIndex + 1);
    if (next) {
      setState("S4");
      askQuestion(QUESTION_BANK[next]);
    } else {
      setState("S7");
      setTimeout(() => {
        setMessages(m => [...m, { kind:"done", t:nowStr() }]);
      }, 500);
    }
  }

  function handleLogin() {
    setLoggedIn(true);
    addUser("Continued with Google · a.mehra@gmail.com", "login");
    setTimeout(() => {
      setState("S4");
      const next = queue[qIndex + 1];
      setQIndex(qIndex + 1);
      if (next) askQuestion(QUESTION_BANK[next]);
      else { setState("S7"); setMessages(m => [...m, { kind:"done", t:nowStr() }]); }
    }, 700);
  }

  function handleSkipLogin() {
    addUser("Skipped login (will re-ask later)", "login_skip");
    setTimeout(() => {
      setState("S4");
      const next = queue[qIndex + 1];
      setQIndex(qIndex + 1);
      if (next) askQuestion(QUESTION_BANK[next]);
      else { setState("S7"); setMessages(m => [...m, { kind:"done", t:nowStr() }]); }
    }, 500);
  }

  function handlePause() {
    setPaused(true);
    setState("S8");
    setMessages(m => [...m, { kind:"paused", t:nowStr() }]);
  }

  function handleRestart() { window.location.reload(); }

  const totalQ      = Math.max(queue.length, 5);
  const answeredQ   = Math.min(qIndex, totalQ);
  const progressPct = state === "S7" ? 100 : Math.round((answeredQ / totalQ) * 100);

  /* current question to render answer modes */
  const currentKey = state === "S2"
    ? "intent"
    : (state === "S4" || state === "S5") ? queue[qIndex] : null;
  const currentQ = currentKey ? QUESTION_BANK[currentKey] : null;

  return (
    <div className="grid grid-cols-[1fr_340px] gap-6">
      {/* Chat column */}
      <Card padded={false}>
        {/* Progress bar */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex w-6 h-6 rounded-full bg-[#2E2218] items-center justify-center">
                <span className="font-serif text-[12px] text-[#F3EADB]">cc</span>
              </span>
              <div>
                <div className="font-serif text-[15px] leading-tight">Career Copilot · onboarding</div>
                <div className="num-mono text-[10px] text-[#6C5038] mt-0.5">
                  {state === "S7" ? "Complete" : `Question ${answeredQ} of ~${totalQ}`} · {state}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state !== "S7" && (
                <button onClick={handlePause} className="text-[10.5px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Save & finish later</button>
              )}
              <button onClick={handleRestart} className="text-[10.5px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Restart</button>
            </div>
          </div>
          <div className="h-[3px] bg-[#EFE2C9] rounded-full overflow-hidden">
            <div className="h-full bg-[#54794E] transition-all duration-500" style={{width:progressPct + "%"}}></div>
          </div>
        </div>

        {/* Chat scroll */}
        <div ref={chatEndRef} className="px-6 py-4 max-h-[560px] overflow-y-auto space-y-3.5">
          {messages.map((m,i) => <Bubble key={i} m={m} onLogin={handleLogin} onSkipLogin={handleSkipLogin} />)}
          {typing && <TypingDots />}
          {state === "S2" && !typing && messages.length > 0 && (
            <AnswerControls q={QUESTION_BANK.intent} onIntent={pickIntent} />
          )}
          {(state === "S4" || state === "S5") && currentQ && !typing && (
            <AnswerControls
              q={currentQ}
              onAnswer={(v, label) => answer(currentKey, v, label)}
              answers={answers}
            />
          )}
        </div>

        {/* Trust footer */}
        <div className="px-6 py-3 border-t border-[#E7DECB] bg-[#FBF8F2] text-[10.5px] text-[#6C5038] flex items-center gap-3 flex-wrap">
          <span className="num-mono uppercase tracking-[0.16em]">Trust</span>
          <span>· Caste / income / disability never asked here</span>
          <span>· Free text never feeds eligibility</span>
          <span>· You can leave anytime · we save where you left off</span>
        </div>
      </Card>

      {/* Side panel */}
      <aside className="space-y-4">
        <StatsCard
          progressPct={progressPct}
          answered={Object.keys(answers).length}
          totalQ={totalQ}
          matchPreview={matchPreview}
          elapsedSec={elapsedSec}
          state={state}
        />
        {showInspector && (
          <StateInspector
            state={state}
            queue={queue}
            qIndex={qIndex}
            answers={answers}
            loggedIn={loggedIn}
            paused={paused}
            branch={branch}
          />
        )}
        <WhyAskingCard currentQ={currentQ} />
        <button onClick={()=>setShowInspector(s=>!s)} className="w-full text-[11px] py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">
          {showInspector ? "Hide" : "Show"} state inspector
        </button>
      </aside>
    </div>
  );
}

function buildIntro(branch) {
  if (branch === "cta") {
    return [
      { kind:"bot", text:"Hi — Career Copilot here. Let's check your eligibility for SSC CGL 2026.", t:"--:--" },
      { kind:"bot", text:"This takes under 2 minutes. Five short questions. No long forms.", t:"--:--" },
    ];
  }
  return [
    { kind:"bot", text:"Hi — Career Copilot here. I'm a guided assistant, not a long form.", t:"--:--" },
    { kind:"bot", text:"Two minutes, five-ish questions. I'll tell you why I'm asking each one, and you can leave any time — I save where you stop.", t:"--:--" },
  ];
}

/* ─── Bubbles ───────────────────────────────────────────────────────────── */

function Bubble({ m, onLogin, onSkipLogin }) {
  if (m.kind === "bot") {
    return (
      <div className="flex items-end gap-2 max-w-[88%]">
        <span className="inline-flex w-7 h-7 rounded-full bg-[#2E2218] items-center justify-center shrink-0">
          <span className="font-serif text-[11px] text-[#F3EADB]">cc</span>
        </span>
        <div className="rounded-2xl rounded-bl-md bg-white/90 border border-[#E7DECB] px-4 py-2.5">
          <p className="text-[14px] text-[#2E2218] leading-snug">{m.text}</p>
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
          <div className="text-right num-mono text-[9px] text-[#A68057] mt-1 mr-1">{m.t} <button className="underline">edit</button></div>
        </div>
      </div>
    );
  }
  if (m.kind === "peek") {
    return (
      <div className="rounded-2xl bg-[#F0F5EF] border border-[#94B28A] px-4 py-3.5 ml-9 relative">
        <div className="flex items-start gap-3">
          <span className="text-[20px]" style={{color:"#33482F"}}>◐</span>
          <div className="flex-1">
            <div className="eyebrow !text-[10px] !text-[#33482F]">Earned moment · S5 VALUE_PEEK</div>
            <div className="font-serif text-[17px] text-[#33482F] mt-1">You may match <strong>{m.count} exams</strong>.</div>
            <div className="text-[12px] text-[#33482F] mt-1">Two more questions to lock the eligibility check. Sign in to save your progress — we'll resume right where you are.</div>
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
        <div className="text-[12px] text-[#6C5038] mt-1 max-w-[44ch]">Server-side session stitch: your anonymous answers attach to your Google account on the same row. Nothing is lost.</div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button onClick={onLogin} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] text-[13px] font-semibold">
            <GoogleGlyph /> Continue with Google
          </button>
          <button onClick={onLogin} className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#E7DECB] text-[#2E2218] text-[13px] font-semibold">
            <PasskeyGlyph /> Use Passkey
          </button>
          <button onClick={onSkipLogin} className="px-3 py-2 rounded-full text-[12px] text-[#6C5038]">Continue without signing in</button>
        </div>
        <div className="num-mono text-[10px] text-[#6C5038] mt-3">scope: name + email only · no avatar, no contacts, no calendar</div>
      </div>
    );
  }
  if (m.kind === "done") {
    return (
      <div className="rounded-2xl bg-[#2E2218] text-[#F3EADB] border border-[#2E2218] px-5 py-5 ml-9 relative overflow-hidden">
        <div className="grain absolute inset-0 opacity-30"></div>
        <div className="relative">
          <div className="eyebrow !text-[10px] !text-[#D6BC93]">S7 DONE · canonical written</div>
          <div className="font-serif text-[22px] mt-1.5">You're set up.</div>
          <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[44ch]">Profile adapter wrote to <span className="num-mono">aspirant_profile · aspirant_education · funnel_sessions.completed_at</span>. Your matches are ready below.</p>

          <ul className="mt-4 space-y-1.5">
            {["SSC CGL 2026 (Tier 1)","SSC CHSL 2026","RBI Office Asst 2026"].map((m,i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <span className="text-[#94B28A]">✓</span>
                <span>{m}</span>
                <span className="ml-auto num-mono text-[10.5px] text-[#A68057]">eligible</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <a href="#today" className="px-4 py-2 rounded-full bg-[#F3EADB] text-[#2E2218] text-[12.5px] font-semibold">Open Today's plan →</a>
            <button className="px-4 py-2 rounded-full border border-[#6C5038] text-[#D6BC93] text-[12.5px] font-semibold">Refine profile</button>
          </div>
        </div>
      </div>
    );
  }
  if (m.kind === "paused") {
    return (
      <div className="rounded-2xl bg-[#F3E9CF] border border-[#BE9C6B] px-4 py-3.5 ml-9">
        <div className="eyebrow !text-[10px] !text-[#6F5A22]">S8 PAUSED · sidecar</div>
        <div className="font-serif text-[16px] text-[#6F5A22] mt-1">Saved. We'll email you on day 3.</div>
        <div className="text-[12px] text-[#6F5A22] mt-1">A row in <span className="num-mono">persona_question_dismissals</span> was written. You can resume any time — your answers stay attached to this session.</div>
      </div>
    );
  }
  return null;
}

function TypingDots() {
  return (
    <div className="flex items-end gap-2">
      <span className="inline-flex w-7 h-7 rounded-full bg-[#2E2218] items-center justify-center shrink-0">
        <span className="font-serif text-[11px] text-[#F3EADB]">cc</span>
      </span>
      <div className="rounded-2xl rounded-bl-md bg-white/90 border border-[#E7DECB] px-4 py-2.5">
        <span className="inline-flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A68057] animate-pulse"></span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#A68057] animate-pulse" style={{animationDelay:'0.15s'}}></span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#A68057] animate-pulse" style={{animationDelay:'0.3s'}}></span>
        </span>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M22 12c0-.85-.07-1.49-.2-2.16H12.2v3.94h5.62c-.11.97-.72 2.43-2.07 3.41l-.02.13 3 2.32.2.02C20.85 17.96 22 15.21 22 12z" fill="#F3EADB"/>
      <path d="M12.2 22c2.7 0 4.97-.89 6.62-2.42l-3.16-2.44c-.85.59-1.99 1-3.46 1-2.65 0-4.9-1.74-5.7-4.15l-.12.01-3.12 2.4-.04.11C4.86 19.86 8.27 22 12.2 22z" fill="#D6BC93"/>
    </svg>
  );
}
function PasskeyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M12 12l8 8M16 16l-2 2M18 18l-2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

/* ─── Answer controls ───────────────────────────────────────────────────── */

function AnswerControls({ q, onIntent, onAnswer, answers }) {
  const [text, setText] = useStateOB("");
  const [sliderVal, setSliderVal] = useStateOB(q.kind === "slider" ? (q.slider?.default || 5) : 5);

  if (!q) return null;

  if (q.key === "intent" && onIntent) {
    return (
      <div className="ml-9 mt-1">
        <div className="grid grid-cols-2 gap-2">
          {q.chips.map(c => (
            <button key={c.v} onClick={()=>onIntent(c.v)}
              className="text-left rounded-xl border border-[#E7DECB] bg-white/80 hover:bg-white hover:border-[#A68057] px-3.5 py-3 transition">
              <div className="flex items-center gap-2">
                <span className="text-[18px] text-[#A68057]">{c.icon}</span>
                <span className="text-[13px] font-medium text-[#2E2218]">{c.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (q.kind === "chips_single") {
    const chips = q.chipsByFamily ? (q.chipsByFamily[answers?.exam_family] || []) : q.chips;
    return (
      <div className="ml-9 mt-1 flex flex-wrap gap-1.5">
        {chips.map(c => (
          <button key={c.v} onClick={()=>onAnswer(c.v, c.label)}
            className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] bg-white/80 hover:bg-[#2E2218] hover:text-[#F3EADB] hover:border-[#2E2218] text-[#2E2218] font-medium transition">
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
          <span className="text-[#6C5038]">{q.slider.min}{q.slider.suffix}</span>
          <span className="font-serif text-[18px] num-mono">{sliderVal}{q.slider.suffix}</span>
          <span className="text-[#6C5038]">{q.slider.max}{q.slider.suffix}</span>
        </div>
        <input type="range" min={q.slider.min} max={q.slider.max} step={q.slider.step}
               value={sliderVal} onChange={(e)=>setSliderVal(Number(e.target.value))}
               className="w-full mt-2 accent-[#54794E]" />
        <button onClick={()=>onAnswer(sliderVal, `${sliderVal} ${q.slider.suffix}/day`)}
          className="mt-2 w-full px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold">Confirm</button>
      </div>
    );
  }

  if (q.kind === "text_parsed" || q.kind === "text_simple") {
    const hint = q.parser ? `Format: ${q.parser.error.split(" ").slice(-1)[0]}` : null;
    return (
      <div className="ml-9 mt-1 flex gap-2 max-w-[400px]">
        <input value={text} onChange={(e)=>setText(e.target.value)}
          placeholder={q.placeholder || "Type your answer…"}
          className="flex-1 px-3 py-2 rounded-full border border-[#E7DECB] bg-white/80 text-[13px] outline-none" />
        <button onClick={()=>{ if (text) { onAnswer(text, text); setText(""); }}}
          className="px-3 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold">Send</button>
      </div>
    );
  }

  return null;
}

/* ─── Stats / inspector / why-card ──────────────────────────────────────── */

function StatsCard({ progressPct, answered, totalQ, matchPreview, elapsedSec, state }) {
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  const completion = Math.min(100, Math.round(progressPct));
  return (
    <Card>
      <Eyebrow>Live · this session</Eyebrow>
      <h3 className="font-serif text-[17px] mt-1">Real-time stats</h3>

      <div className="mt-3 flex items-center gap-4">
        {/* Ring */}
        <svg width="84" height="84" viewBox="0 0 84 84">
          <circle cx="42" cy="42" r="36" fill="none" stroke="#EFE2C9" strokeWidth="6"/>
          <circle cx="42" cy="42" r="36" fill="none" stroke="#54794E" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={Math.PI*72} strokeDashoffset={Math.PI*72 * (1 - completion/100)}
            transform="rotate(-90 42 42)" style={{transition:"stroke-dashoffset 0.5s"}} />
          <text x="42" y="42" textAnchor="middle" dominantBaseline="central" fontFamily="Fraunces" fontSize="18" fontWeight="600" fill="#2E2218">{completion}%</text>
        </svg>
        <div className="flex-1">
          <div className="text-[11.5px] text-[#6C5038]">Profile completion</div>
          <div className="num-mono text-[11px] text-[#2E2218] mt-1">{answered} / ~{totalQ} questions</div>
          <div className="num-mono text-[10.5px] text-[#33482F] mt-0.5">{state}</div>
        </div>
      </div>

      <div className="rule mt-4 pt-3 grid grid-cols-2 gap-3">
        <Stat2 k="Match preview" v={<span className="num-mono">{matchPreview}</span>} sub={matchPreview === 0 ? "answer 2 more" : "exams · live"} tone="sage" />
        <Stat2 k="Time elapsed" v={<span className="num-mono">{m}:{s.toString().padStart(2,'0')}</span>} sub="goal · under 2m" />
      </div>

      <div className="rule mt-3 pt-3 text-[11px] text-[#6C5038]">
        <strong className="text-[#2E2218]">No login required</strong> until S5 — we want you to see value first, not the other way around.
      </div>
    </Card>
  );
}

function Stat2({ k, v, sub, tone }) {
  return (
    <div>
      <div className="eyebrow !text-[9px]">{k}</div>
      <div className={`font-serif text-[20px] mt-0.5 leading-none ${tone === 'sage' ? 'text-[#33482F]' : 'text-[#2E2218]'}`}>{v}</div>
      <div className="text-[10.5px] text-[#6C5038] mt-1">{sub}</div>
    </div>
  );
}

function StateInspector({ state, queue, qIndex, answers, loggedIn, paused, branch }) {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <Eyebrow tone="dark">State inspector · debug-only</Eyebrow>
      <div className="font-serif text-[15px] text-[#F3EADB] mt-1">{STATE_DEFS[state]?.label || state}</div>
      <div className="text-[11px] text-[#D6BC93] mt-1">{STATE_DEFS[state]?.desc}</div>

      <div className="rule mt-3 pt-3 space-y-1.5 text-[10.5px] num-mono text-[#D6BC93] border-[#4E3A29]">
        <div>session_id <span className="text-[#F3EADB]">fs_8a2f1c…</span></div>
        <div>anonymous_id <span className="text-[#F3EADB]">{SAMPLE_SESSION.anonymous_id}</span></div>
        <div>user_id <span className="text-[#F3EADB]">{loggedIn ? "usr_8a2…f31" : "null"}</span></div>
        <div>branch <span className="text-[#F3EADB]">{branch}</span></div>
        <div>queue <span className="text-[#F3EADB]">[{queue.join(", ")}]</span></div>
        <div>q_index <span className="text-[#F3EADB]">{qIndex}</span></div>
      </div>

      <div className="rule mt-3 pt-3 border-[#4E3A29]">
        <div className="eyebrow !text-[9px] !text-[#A68057]">answers (so far)</div>
        <div className="mt-1.5 space-y-0.5 num-mono text-[10.5px] text-[#F3EADB]">
          {Object.entries(answers).length === 0
            ? <div className="text-[#A68057]">{"{}"}</div>
            : Object.entries(answers).map(([k,v]) => (
                <div key={k}>{k}: <span className="text-[#94B28A]">"{String(v)}"</span></div>
              ))}
        </div>
      </div>

      <div className="rule mt-3 pt-3 border-[#4E3A29]">
        <div className="eyebrow !text-[9px] !text-[#A68057]">async (fire-and-forget)</div>
        <ul className="mt-1.5 space-y-0.5 num-mono text-[10.5px] text-[#D6BC93]">
          <li>· POST /api/onboarding_answers</li>
          <li>· POST /api/persona_question_answers</li>
          <li>· POST /api/eligibility/recompute · 200ms</li>
          {loggedIn && <li>· POST /api/funnel_sessions/stitch · server-side</li>}
        </ul>
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
      <div className="rule mt-3 pt-2.5 border-[#B9CFAF]">
        <div className="eyebrow !text-[9px] !text-[#33482F]">Writes to</div>
        <ul className="mt-1 space-y-0.5 num-mono text-[10px] text-[#33482F]">
          {currentQ.writes.map((w,i) => <li key={i}>· {w}</li>)}
        </ul>
      </div>
    </Card>
  );
}

/* ─── STATE MACHINE SECTION ─────────────────────────────────────────────── */

function StateMachineSection() {
  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader eyebrow="State machine"
          title="9 states. Two entry branches. Explicit transitions."
          sub="Modeled to be implementable as an XState machine or zustand+immer state. Each transition logs to a single events stream — debugging an abandoned funnel becomes trivial." />
        <StateMachineDiagram />
      </Card>

      <Card padded={false}>
        <div className="px-7 pt-6 pb-3">
          <Eyebrow>States · detailed</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">What each state does, reads, and writes.</h2>
        </div>
        <div className="px-2">
          <table className="tbl">
            <thead><tr><th>State</th><th>Trigger</th><th>Reads</th><th>Writes</th><th>Next</th></tr></thead>
            <tbody>
              {[
                { s:"S0 ENTRY",       trig:"URL load",                       reads:"URL params · cookies",       writes:"—",                                          next:"S1" },
                { s:"S1 ANON_INIT",   trig:"S0 done",                        reads:"localStorage.anonymous_id",  writes:"funnel_sessions row · anonymous_id cookie", next:"S2" },
                { s:"S2 INTENT",      trig:"S1 done",                        reads:"URL · recruitment_id",       writes:"funnel_sessions.intent",                     next:"S3" },
                { s:"S3 LOAD_PLAN",   trig:"intent set",                     reads:"persona_question_bank · recruitment_question_requirements", writes:"local queue · q_index=0", next:"S4" },
                { s:"S4 ASK",         trig:"answer or queue advance",        reads:"queue[q_index]",             writes:"onboarding_answers · persona_question_answers", next:"S4 / S5 / S7" },
                { s:"S5 VALUE_PEEK",  trig:"recompute delta > 0 (first time)", reads:"eligibility_results count", writes:"peek_shown_at",                              next:"S6 if anon else S4" },
                { s:"S6 LOGIN_GATE",  trig:"after S5, if anon",              reads:"—",                          writes:"oauth_state_token (PKCE) · sets funnel_sessions.user_id on callback", next:"S4 resume or S7" },
                { s:"S7 DONE",        trig:"queue empty or required complete", reads:"onboarding_answers (full)", writes:"aspirant_profile · aspirant_education · funnel_sessions.completed_at", next:"—" },
                { s:"S8 PAUSED",      trig:"explicit dismiss · idle 60s suggest", reads:"current state",       writes:"persona_question_dismissals · onboarding_sessions.current_field_key", next:"resume → S4 · email day 3" },
              ].map((r,i) => (
                <tr key={i}>
                  <td><strong>{r.s}</strong></td>
                  <td className="text-[#3a2e22]">{r.trig}</td>
                  <td className="num-mono text-[#6C5038] text-[11px]">{r.reads}</td>
                  <td className="num-mono text-[#6C5038] text-[11px]">{r.writes}</td>
                  <td className="num-mono text-[#6C5038]">{r.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Invariants" title="The rules that hold across every transition." />
        <ul className="space-y-2.5 text-[13px]">
          {[
            { k:"01", t:"Session id stable pre/post login", b:"funnel_sessions.id never changes. Only user_id flips from null → uuid on Google callback." },
            { k:"02", t:"onboarding_answers is an append-only log", b:"Canonical tables (aspirant_profile, aspirant_education) are written ONLY at S7 via the profile adapter." },
            { k:"03", t:"Engine is deterministic", b:"Chat collects · engine verdicts. Same answers → same verdict. No LLM in the loop here." },
            { k:"04", t:"Sensitive data never enters this flow", b:"Caste, income, disability are NEVER asked in onboarding. They live in a separate, opt-in profile module triggered only when an eligibility rule needs them." },
            { k:"05", t:"Free text never feeds eligibility", b:"Allowlisted parsers only (year regex, exam id whitelist). If parsing fails, re-ask with a hint — never let raw text touch the engine." },
            { k:"06", t:"Stitch is server-side", b:"On Google OAuth callback the server finds the funnel session by anonymous_id cookie and updates user_id. Client just swaps the JWT." },
            { k:"07", t:"Recompute is fire-and-forget", b:"The UI never blocks on /api/eligibility/recompute. Stale verdicts for a few seconds are fine — the user moves on." },
            { k:"08", t:"applies_when prunes live", b:"Decrementing remaining_count makes the progress bar shrink visibly. Honest progress, not fake." },
            { k:"09", t:"Earned login", b:"S5 → S6 is the first time we ask for credentials. Never before. Skippable." },
          ].map(r => (
            <li key={r.k} className="grid grid-cols-[40px_1fr] gap-3 items-start">
              <span className="num-mono text-[12px] text-[#A68057] pt-0.5">{r.k}</span>
              <span>
                <strong className="text-[#2E2218]">{r.t}.</strong>
                <span className="text-[#3a2e22]"> {r.b}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StateMachineDiagram() {
  const nodes = [
    { id:"S0", x:60,  y:30,  label:"S0 ENTRY",      tone:"clay"  },
    { id:"S1", x:60,  y:110, label:"S1 ANON_INIT",  tone:"clay"  },
    { id:"S2", x:60,  y:190, label:"S2 INTENT",     tone:"clay"  },
    { id:"S3", x:60,  y:270, label:"S3 LOAD_PLAN",  tone:"clay"  },
    { id:"S4", x:300, y:270, label:"S4 ASK",        tone:"sage"  },
    { id:"S5", x:560, y:270, label:"S5 VALUE_PEEK", tone:"sage"  },
    { id:"S6", x:560, y:190, label:"S6 LOGIN_GATE", tone:"dusk"  },
    { id:"S7", x:820, y:270, label:"S7 DONE",       tone:"ink"   },
    { id:"S8", x:820, y:60,  label:"S8 PAUSED",     tone:"amber" },
  ];
  const toneFill = { clay:"#F1E1CD", sage:"#E4EDE0", dusk:"#E3DFEA", ink:"#2E2218", amber:"#F3E9CF" };
  const toneStroke = { clay:"#BE9C6B", sage:"#94B28A", dusk:"#8F86A1", ink:"#2E2218", amber:"#BE9C6B" };
  const textFill = { clay:"#6C5038", sage:"#33482F", dusk:"#31293B", ink:"#F3EADB", amber:"#6F5A22" };

  return (
    <svg viewBox="0 0 980 360" className="w-full">
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#8A6846" />
        </marker>
      </defs>

      {/* arrows */}
      <path d="M120,46 L120,108" stroke="#8A6846" strokeWidth="1.4" markerEnd="url(#ar)" />
      <path d="M120,126 L120,188" stroke="#8A6846" strokeWidth="1.4" markerEnd="url(#ar)" />
      <path d="M120,206 L120,268" stroke="#8A6846" strokeWidth="1.4" markerEnd="url(#ar)" />
      <path d="M180,286 L298,286" stroke="#8A6846" strokeWidth="1.4" markerEnd="url(#ar)" />
      <path d="M420,286 C460,286 480,286 558,286" stroke="#8A6846" strokeWidth="1.4" markerEnd="url(#ar)" />
      <path d="M620,268 C620,236 620,210 620,206" stroke="#8A6846" strokeWidth="1.4" markerEnd="url(#ar)" />
      <path d="M558,212 C480,212 420,260 420,268" stroke="#8A6846" strokeWidth="1.4" strokeDasharray="3 3" markerEnd="url(#ar)" />
      <path d="M680,286 L818,286" stroke="#2E2218" strokeWidth="1.8" markerEnd="url(#ar)" />

      {/* loop S4 → S4 (next question) */}
      <path d="M360,260 C360,222 420,222 420,260" stroke="#54794E" strokeWidth="1.4" markerEnd="url(#ar)" />
      <text x="390" y="218" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="#33482F">next Q</text>

      {/* S8 sidecar */}
      <path d="M180,42 C400,30 720,30 818,66" stroke="#BE9C6B" strokeWidth="1.2" strokeDasharray="3 4" markerEnd="url(#ar)" />
      <text x="500" y="22" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6F5A22">S8 PAUSED · from any state · resume by token</text>

      {/* nodes */}
      {nodes.map(n => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width="120" height="32" rx="8" fill={toneFill[n.tone]} stroke={toneStroke[n.tone]} strokeWidth="1.2" />
          <text x={n.x + 60} y={n.y + 20} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fontWeight="700" fill={textFill[n.tone]} letterSpacing="0.5">{n.label}</text>
        </g>
      ))}

      {/* labels on edges */}
      <text x="240" y="280" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="#6C5038">queue ready</text>
      <text x="490" y="280" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="#6C5038">delta &gt; 0</text>
      <text x="640" y="240" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="#31293B">if anon</text>
      <text x="480" y="244" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="#31293B">stitch+resume</text>
      <text x="750" y="280" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="#2E2218" fontWeight="700">required complete</text>
    </svg>
  );
}

/* ─── MODERN IMPROVEMENTS ───────────────────────────────────────────────── */

function ModernImprovements() {
  const items = [
    { k:"01", t:"State machine as a single source of truth",
      b:"Implement S0–S8 as an XState (or zustand+immer) machine. Log every transition to a single 'funnel_events' stream. Debugging a stuck or abandoned funnel becomes a single SQL query." },
    { k:"02", t:"Optimistic localStorage writes",
      b:"Every answer hits localStorage instantly, then async-syncs to onboarding_answers. If the user refreshes mid-flow or loses internet, we resume from local. Server is reconciled when it can be." },
    { k:"03", t:"Server-side session stitching",
      b:"On the Google OAuth callback, the SERVER looks up funnel_sessions by anonymous_id cookie and merges. The client just swaps its JWT. Never let the client claim a session — that's a takeover attack." },
    { k:"04", t:"PKCE OAuth — no client secrets",
      b:"Use PKCE (proof key for code exchange) instead of the deprecated implicit flow. No client secrets in the browser. Refresh tokens stored in HttpOnly cookies, not localStorage." },
    { k:"05", t:"Passkey alongside Google",
      b:"Add WebAuthn passkey as a parallel option for repeat visitors. Zero friction on supported devices. Falls back to Google for users without passkey support." },
    { k:"06", t:"Earned login moment, never gated",
      b:"Show value (S5) before asking for credentials. A user who has invested 90 seconds and seen 14 matches converts to login at 62% — vs ~15% if you gate the homepage." },
    { k:"07", t:"Magic-link fallback (no passwords)",
      b:"If Google fails or user prefers email, send a single-tap magic link. Never collect passwords in onboarding. One less attack surface, one less form field." },
    { k:"08", t:"Allowlisted parsers for free text",
      b:"Free text fields use strict regex/grammar parsers (year = ^(19[89]\\d|20[0-3]\\d)$, exam id from whitelist). On failure: re-ask with hint. Eligibility engine never sees raw user text." },
    { k:"09", t:"Append-only log + adapter at S7",
      b:"onboarding_answers is immutable audit. Canonical tables get written only by the profile adapter at S7. Onboarding edits are safe because we can replay the log." },
    { k:"10", t:"Idle suggestion → S8 PAUSED at 60s",
      b:"If a question sits unanswered for 60s, surface 'Save & finish later' inline. Day-3 email with deep-link resume token. Token TTL 30 days, single-use." },
    { k:"11", t:"Smart prefill from typed intent",
      b:"If the user pastes 'I'm prepping for CGL' into a chip field, NLP suggests SSC CGL as a chip — but never auto-fills it. Suggestion is opt-in." },
    { k:"12", t:"Anonymous events are still useful",
      b:"Sessions that never log in still feed product analytics (drop-off, intent patterns) under rotating anon IDs. GDPR-safe; no PII collected pre-S6." },
    { k:"13", t:"Identity scope minimization on Google",
      b:"Ask Google for name + email only. No avatar, no contacts, no calendar. The scope screen looks lighter, which itself boosts conversion." },
    { k:"14", t:"Funnel deep-links carry intent",
      b:"Blog CTAs link to /funnel/<exam>?intent=<intent>&utm=… — that intent is written to funnel_sessions at S1 so the question queue is shortened immediately. CTA branch skips S2." },
  ];
  return (
    <div className="space-y-6">
      <Card className="!bg-[#2E2218] !border-[#2E2218]">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 rounded-2xl bg-[#4E3A29] border border-[#6C5038] flex items-center justify-center">
            <span className="font-serif text-[24px] text-[#D6BC93]">↗</span>
          </div>
          <div>
            <Eyebrow tone="dark">14 improvements over the original spec</Eyebrow>
            <h2 className="font-serif text-[22px] mt-1 text-[#F3EADB] leading-tight">Modern, ship-able techniques — keeping the same state machine.</h2>
            <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[64ch]">These are additive. The S0–S8 model holds. Each item maps to a concrete diff in your existing Supabase auth + funnel_sessions table.</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {items.map(it => (
          <article key={it.k} className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <div className="flex items-baseline gap-2">
              <span className="num-mono text-[11.5px] text-[#A68057]">{it.k}</span>
              <span className="font-serif text-[15px] leading-snug">{it.t}</span>
            </div>
            <p className="text-[12.5px] text-[#3a2e22] mt-1.5 leading-snug">{it.b}</p>
          </article>
        ))}
      </div>

      <Card>
        <SectionHeader eyebrow="Schema diff · what to change from current Supabase auth"
          title="Three new tables, one column rename, one server function." />
        <table className="tbl">
          <thead><tr><th>Object</th><th>Action</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td><strong>funnel_sessions</strong></td><td>NEW table</td><td>Anonymous-first session row. Columns: id · anonymous_id · user_id · intent · recruitment_id · current_state · started_at · completed_at · paused_at · resume_token</td></tr>
            <tr><td><strong>onboarding_answers</strong></td><td>NEW table</td><td>Append-only log. Columns: id · funnel_session_id · question_key · value_raw · value_parsed · created_at</td></tr>
            <tr><td><strong>persona_question_bank</strong></td><td>NEW table</td><td>Server-driven question definitions with applies_when expressions. Lets you ship new onboarding flows without a deploy.</td></tr>
            <tr><td><strong>persona_question_dismissals</strong></td><td>NEW table</td><td>S8 paused state · resume_token + current_field_key + email_scheduled_at</td></tr>
            <tr><td><strong>auth.users.app_metadata</strong></td><td>ADD field <span className="num-mono">last_funnel_session</span></td><td>Quick lookup for stitch-on-callback</td></tr>
            <tr><td><strong>RPC stitch_anonymous_session</strong></td><td>NEW SECURITY DEFINER function</td><td>Runs on Google OAuth callback. Body: UPDATE funnel_sessions SET user_id=auth.uid() WHERE anonymous_id=$1 AND user_id IS NULL.</td></tr>
            <tr><td><strong>RLS on funnel_sessions</strong></td><td>NEW policy</td><td>Pre-stitch: rows accessible by anonymous_id cookie. Post-stitch: by auth.uid(). Never both.</td></tr>
          </tbody>
        </table>
      </Card>

      <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
        <Eyebrow>What we explicitly do NOT do</Eyebrow>
        <ul className="mt-2 space-y-1.5 text-[13px] text-[#33482F]">
          <li>· Email/password forms in onboarding (use magic-link if Google fails)</li>
          <li>· Long compulsory profile form before showing value</li>
          <li>· Collect caste / income / disability in onboarding (separate opt-in module)</li>
          <li>· Pre-fill from third-party social profile data (only name + email from Google)</li>
          <li>· LLM-driven question generation in the funnel (deterministic engine only)</li>
          <li>· Auto-redirect on Google login — always land back on next question, not /app</li>
          <li>· Hide the "skip login" option — earned login is a 2-way street</li>
        </ul>
      </Card>
    </div>
  );
}

window.ScreenOnboarding = ScreenOnboarding;
