/* /app/study/focus — Focus session */
const { useState: useStateF, useEffect: useEffectF } = React;

function ScreenFocus() {
  const [preset, setPreset] = useStateF(50);
  const [running, setRunning] = useStateF(false);
  const [seconds, setSeconds] = useStateF(50*60);
  const [showReflect, setShowReflect] = useStateF(false);

  useEffectF(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(id);
  }, [running]);

  function setP(p) { setPreset(p); setSeconds(p*60); setRunning(false); }
  function start() { setRunning(true); }
  function pause() { setRunning(false); }
  function end()   { setRunning(false); setShowReflect(true); }

  const total = preset*60;
  const pct = 1 - (seconds / total);
  const mm = String(Math.floor(seconds/60)).padStart(2,"0");
  const ss = String(seconds%60).padStart(2,"0");

  return (
    <div data-screen-label="Focus · Session">
      <PageHeader eyebrow="Focus · session" title="One task. Timed. With a reflection at the end."
        sub="Linked to today's task. The reflection feeds focus consistency back into your study policy."
        right={<StatusDot state="live" />} />
      <div className="px-10 grid grid-cols-[1fr_400px] gap-6">
        <Card>
          <div className="flex items-start justify-between gap-6">
            <div>
              <Eyebrow>Linked task</Eyebrow>
              <div className="font-serif text-[22px] mt-1.5">{DATA.focus.currentTask}</div>
              <div className="text-[12.5px] text-[#6C5038] mt-1">{DATA.focus.currentTopic} · concept block · 90m planned</div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <Chip s={{layer:"user",label:"weak: history"}} />
                <Chip s={{layer:"exam",label:"prereq for 3"}} />
                <Chip s={{layer:"engine",label:"pre-mock"}} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <Eyebrow>Preset</Eyebrow>
              <div className="mt-2 flex gap-1.5">
                {DATA.focus.presets.map(p => (
                  <button key={p} onClick={()=>setP(p)}
                    className={`text-[12px] px-3 py-1.5 rounded-full font-semibold ${preset===p ? 'bg-[#2E2218] text-[#F3EADB]' : 'border border-[#E7DECB] text-[#6C5038]'}`}>{p}m</button>
                ))}
              </div>
            </div>
          </div>

          {/* Timer ring */}
          <div className="mt-7 flex flex-col items-center">
            <svg width="240" height="240" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="86" fill="none" className="ring-bg" strokeWidth="6" />
              <circle cx="100" cy="100" r="86" fill="none" className="ring-fg" strokeWidth="6" strokeLinecap="round"
                strokeDasharray="540" strokeDashoffset={540 * (1-pct)} transform="rotate(-90 100 100)" />
              <text x="100" y="100" textAnchor="middle" dominantBaseline="central" fontFamily="Fraunces" fontSize="42" fontWeight="600" fill="#2E2218">{mm}:{ss}</text>
              <text x="100" y="135" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="2" fill="#6C5038">{running ? 'FOCUSING' : seconds === 0 ? 'COMPLETE' : 'READY'}</text>
            </svg>
            <div className="mt-4 flex gap-2">
              {!running && seconds > 0 && <button onClick={start} className="px-5 py-2.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[13px]">Start</button>}
              {running && <button onClick={pause} className="px-5 py-2.5 rounded-full bg-[#FBF6EF] border border-[#E7DECB] text-[#2E2218] font-semibold text-[13px]">Pause</button>}
              <button onClick={end} className="px-5 py-2.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold text-[13px]">End session</button>
            </div>
            <div className="mt-3 text-[11px] text-[#6C5038]">
              <span className="kbd">space</span> start/pause &nbsp; <span className="kbd">esc</span> end
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <FocusHistoryCard />
          <FocusAfterSignal />
        </div>
      </div>

      {showReflect && <ReflectionDrawer onClose={()=>setShowReflect(false)} />}

      <FooterStrip />
    </div>
  );
}

function FocusHistoryCard() {
  return (
    <Card>
      <SectionHeader eyebrow="Recent sessions" title="Last 7 days." right={<StatusDot state="live" />} />
      <ul className="space-y-2">
        {DATA.focus.history.map((h,i) => (
          <li key={i} className="grid grid-cols-[60px_1fr_60px_60px] gap-3 items-center text-[12.5px] py-1.5 border-b border-[#EFE7D4] last:border-0">
            <span className="num-mono text-[#6C5038]">{h.date}</span>
            <span>{h.topic}</span>
            <span className="num-mono text-[#6C5038]">{h.min}m</span>
            <span className="text-right">
              <Pill tone={h.confidence >= 0.7 ? "sage" : h.confidence >= 0.55 ? "amber" : "rose"}>{Math.round(h.confidence*100)}%</Pill>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FocusAfterSignal() {
  return (
    <Card className="!bg-[#F7F5FB] !border-[#DDDAE3]">
      <Eyebrow>After-session signal</Eyebrow>
      <h3 className="font-serif text-[18px] mt-1.5 text-[#31293B]">What this session affects</h3>
      <ul className="mt-3 space-y-1.5 text-[12.5px] text-[#31293B]">
        <li className="flex gap-2"><Chip s={{layer:"user",label:"focus-consistency"}} /><span>updates focus consistency score</span></li>
        <li className="flex gap-2"><Chip s={{layer:"engine",label:"persona-recompute"}} /><span>may trigger persona snapshot recompute</span></li>
        <li className="flex gap-2"><Chip s={{layer:"engine",label:"task-size"}} /><span>may shrink/expand future task size</span></li>
      </ul>
      <div className="rule mt-4 pt-3 text-[11px] text-[#524864]">
        We use this signal anonymously inside Study OS. Not used for diagnosis, eligibility, or recruitment decisions.
      </div>
    </Card>
  );
}

function ReflectionDrawer({ onClose }) {
  const [completed, setCompleted] = useStateF(true);
  const [diff, setDiff] = useStateF("ok");
  const [dist, setDist] = useStateF(1);
  const [conf, setConf] = useStateF(70);
  const [reviseLater, setReviseLater] = useStateF(true);

  return (
    <Drawer open={true} onClose={onClose} title="Session reflection · 30 seconds">
      <div className="space-y-4">
        <Field label="Completed the task?">
          <Toggle a="Yes" b="Partial" c="No" value={completed === true ? "Yes" : completed === false ? "No" : "Partial"} onChange={(v)=>setCompleted(v === "Yes")} />
        </Field>

        <Field label="Difficulty felt">
          <Toggle a="Easy" b="OK" c="Hard" value={diff === "easy" ? "Easy" : diff === "ok" ? "OK" : "Hard"} onChange={(v)=>setDiff(v.toLowerCase())} />
        </Field>

        <Field label="Distractions (0–5)">
          <div className="flex gap-1.5">
            {[0,1,2,3,4,5].map(n => (
              <button key={n} onClick={()=>setDist(n)} className={`w-8 h-8 rounded-full text-[12px] font-semibold ${dist===n ? 'bg-[#2E2218] text-[#F3EADB]' : 'bg-[#FBF6EF] border border-[#E7DECB] text-[#6C5038]'}`}>{n}</button>
            ))}
          </div>
        </Field>

        <Field label={`Confidence after session · ${conf}%`}>
          <input type="range" min="0" max="100" value={conf} onChange={(e)=>setConf(Number(e.target.value))} className="w-full accent-[#54794E]" />
        </Field>

        <Field label="Should this topic be revised soon?">
          <Toggle a="Yes" b="Not yet" value={reviseLater ? "Yes" : "Not yet"} onChange={(v)=>setReviseLater(v === "Yes")} />
        </Field>

        <div className="rounded-xl bg-[#F0F5EF] border border-[#B9CFAF] p-3.5">
          <Eyebrow>What this triggers</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[12px] text-[#33482F]">
            <li>· Focus consistency +0.02 (sliding window)</li>
            <li>· Mastery delta queued for Modern History · 1857</li>
            {reviseLater && <li>· Spaced revision scheduled in {Math.round((100-conf)/10)*2 || 4}d</li>}
            {dist >= 3 && <li>· Task-size policy may shrink (engine review)</li>}
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold text-[12.5px]">Cancel</button>
          <button onClick={onClose} className="px-4 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12.5px]">Save reflection</button>
        </div>
      </div>
    </Drawer>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="eyebrow !text-[10px] mb-2">{label}</div>
      {children}
    </div>
  );
}
function Toggle({ a, b, c, value, onChange }) {
  const opts = [a,b,c].filter(Boolean);
  return (
    <div className="flex gap-1.5">
      {opts.map(o => (
        <button key={o} onClick={()=>onChange(o)} className={`px-3 py-1.5 rounded-full text-[12px] font-semibold ${value===o ? 'bg-[#2E2218] text-[#F3EADB]' : 'bg-[#FBF6EF] border border-[#E7DECB] text-[#6C5038]'}`}>{o}</button>
      ))}
    </div>
  );
}

window.ScreenFocus = ScreenFocus;
