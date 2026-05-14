/* /admin/funnel — Funnel analytics for the onboarding flow */

function ScreenAdminFunnel() {
  const A = FUNNEL_ANALYTICS;
  return (
    <div data-screen-label="Admin · Funnel analytics">
      <PageHeader eyebrow="Admin · Funnel"
        title="Where users start, where they drop, where they convert."
        sub="Anon → S7 funnel · drop-off per question · intent split · day-3 email follow-up performance."
        right={
          <div className="flex gap-2 items-center flex-wrap justify-end shrink-0">
            <span className="num-mono text-[10.5px] text-[#6C5038] whitespace-nowrap">admin@ccp</span>
            <Pill tone="ink" className="whitespace-nowrap">RBAC · growth-analytics</Pill>
          </div>
        } />

      <div className="px-10 space-y-6">
        <FunnelKPIs A={A} />
        <ConversionFunnelCard A={A} />
        <div className="grid grid-cols-2 gap-6">
          <DropOffByQuestion A={A} />
          <IntentSplit A={A} />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <TimeHistogram A={A} />
          <SourceBreakdown A={A} />
        </div>
        <StitchAuditTable A={A} />
      </div>
      <FooterStrip />
    </div>
  );
}

function FunnelKPIs({ A }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      <KPI k="Sessions today"          v={A.today.sessions_started.toLocaleString()} tone="ink"  sub="anon-init" />
      <KPI k="Completed S7"             v={A.today.sessions_completed_s7.toLocaleString()} tone="sage" sub={`${(A.today.completion_rate*100).toFixed(1)}% completion`} />
      <KPI k="Avg time to S7"           v={A.today.avg_time_to_s7} tone="ink"  sub="goal: under 3m" />
      <KPI k="Anon → signed-in"         v={`${(A.today.anon_to_signed_rate*100).toFixed(0)}%`} tone="sage" sub="S6 conversion" />
      <KPI k="S5 peek · login lift"     v={`+${(A.today.s5_peek_lift*100).toFixed(0)}pp`} tone="amber" sub="vs no-peek control" />
      <KPI k="Day-3 email CTR"          v={`${(A.today.day3_email_clickthrough*100).toFixed(0)}%`} tone="amber" sub="paused → resumed" />
    </div>
  );
}

function ConversionFunnelCard({ A }) {
  const max = A.conversion[0].count;
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Conversion funnel · today</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">{A.conversion[0].count.toLocaleString()} sessions → {A.conversion[A.conversion.length-1].count.toLocaleString()} S7 completes.</h2>
          <p className="text-[12px] text-[#6C5038] mt-1">Each step shows count, % of previous, and % of total. Watch the drop between S5 PEEK and S6 success — that's where the login moment lives or dies.</p>
        </div>
        <StatusDot state="live" label="live · /api/funnel/analytics" />
      </div>
      <div className="px-7 pb-6 mt-2 space-y-2">
        {A.conversion.map((s,i) => {
          const prev = i > 0 ? A.conversion[i-1].count : s.count;
          const dropPct = i > 0 ? Math.round((1 - s.count / prev) * 100) : 0;
          const widthPct = (s.count / max) * 100;
          const total = A.conversion[0].count;
          const totalPct = Math.round(s.count / total * 100);
          return (
            <div key={i} className="grid grid-cols-[160px_1fr_120px] gap-4 items-center">
              <div>
                <div className="num-mono text-[10.5px] text-[#6C5038] uppercase tracking-[0.14em]">{s.stage}</div>
                <div className="text-[11.5px] text-[#2E2218]">{s.label}</div>
              </div>
              <div className="relative">
                <div className="h-[26px] bg-[#EFE2C9] rounded-md overflow-hidden">
                  <div className="h-full transition-all" style={{ width: widthPct + "%", background: i === A.conversion.length-1 ? "#33482F" : "#54794E" }}></div>
                </div>
                <span className="absolute inset-0 flex items-center px-2.5 num-mono text-[11px] font-semibold text-[#F3EADB]">{s.count.toLocaleString()}</span>
              </div>
              <div className="num-mono text-[11px] text-right">
                <div className="text-[#2E2218]">{totalPct}% total</div>
                {i > 0 && <div className={dropPct > 20 ? "text-[#7A3925]" : "text-[#6C5038]"}>−{dropPct}% step</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DropOffByQuestion({ A }) {
  return (
    <Card>
      <SectionHeader eyebrow="Drop-off by question"
        title="Where users leave."
        sub="Parser-rejection rates and copy issues show up here first." />
      <ul className="space-y-2.5">
        {A.drop_off_by_question.map((d,i) => (
          <li key={i} className="grid grid-cols-[120px_1fr_50px] gap-3 items-center text-[12.5px]">
            <span className="num-mono text-[#6C5038]">{d.q}</span>
            <div className="relative">
              <div className="h-[8px] bg-[#EFE2C9] rounded-full overflow-hidden">
                <div className="h-full" style={{ width:`${d.drop*100*4}%`, background: d.drop > 0.12 ? "#7A3925" : d.drop > 0.07 ? "#A68057" : "#94B28A" }}></div>
              </div>
              {d.note && <div className="text-[10.5px] text-[#7A3925] mt-1">⚠ {d.note}</div>}
            </div>
            <span className="num-mono text-right">{(d.drop*100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function IntentSplit({ A }) {
  return (
    <Card>
      <SectionHeader eyebrow="Intent split · today"
        title="What users said they came for."
        sub="CTA-funneled traffic skips S2 — their intent is set by the URL." />
      <div className="flex items-center gap-5">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {(() => {
            let offset = 0;
            const c = 2 * Math.PI * 60;
            return A.intents.map((it, i) => {
              const dash = (it.pct / 100) * c;
              const el = <circle key={i} cx="80" cy="80" r="60" fill="none" stroke={it.color} strokeWidth="22"
                strokeDasharray={`${dash} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />;
              offset += dash;
              return el;
            });
          })()}
          <text x="80" y="80" textAnchor="middle" dominantBaseline="central" fontFamily="Fraunces" fontSize="22" fontWeight="600" fill="#2E2218">{A.today.sessions_started > 1000 ? `${(A.today.sessions_started/1000).toFixed(1)}k` : A.today.sessions_started}</text>
        </svg>
        <ul className="flex-1 space-y-2 text-[12.5px]">
          {A.intents.map((i,idx) => (
            <li key={idx} className="grid grid-cols-[18px_1fr_50px] gap-2 items-center">
              <span className="w-3 h-3 rounded-sm" style={{background:i.color}}></span>
              <span className="num-mono text-[#3a2e22]">{i.id}</span>
              <span className="num-mono text-right text-[#6C5038]">{i.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TimeHistogram({ A }) {
  return (
    <Card>
      <SectionHeader eyebrow="Time-to-S7 distribution"
        title={`Median ${A.today.median_questions_answered} questions · ${A.today.avg_time_to_s7} average.`} />
      <svg viewBox="0 0 480 160" className="w-full h-[160px]">
        {[0,10,20,30].map((y,i) => (
          <g key={i}>
            <line x1="40" y1={140 - (y/30)*120} x2="470" y2={140 - (y/30)*120} stroke="#EFE7D4" />
            <text x="32" y={140 - (y/30)*120} textAnchor="end" dominantBaseline="central" fontFamily="JetBrains Mono" fontSize="9.5" fill="#6C5038">{y}%</text>
          </g>
        ))}
        {A.time_histogram.map((h,i) => {
          const x = 50 + i*60;
          const barH = (h.pct/30)*120;
          return (
            <g key={i}>
              <rect x={x} y={140 - barH} width="48" height={barH} fill={h.range === "2-3m" || h.range === "3-4m" ? "#54794E" : "#A68057"} rx="3" />
              <text x={x+24} y={140-barH-6} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#2E2218">{h.pct}%</text>
              <text x={x+24} y={155} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">{h.range}</text>
            </g>
          );
        })}
      </svg>
      <div className="num-mono text-[10.5px] text-[#33482F] mt-1">Green = inside the &lt;4-minute happy zone</div>
    </Card>
  );
}

function SourceBreakdown({ A }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Source · today</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Where the sessions come from.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">CTA-funneled traffic from blogs is the highest-converting channel.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Source</th><th>Visits</th><th>Conversion</th><th>Inferred intent</th></tr></thead>
          <tbody>
            {A.source.map((s,i) => (
              <tr key={i}>
                <td>{s.id}</td>
                <td className="num-mono">{s.visits.toLocaleString()}</td>
                <td><span className={`num-mono ${s.conv >= 0.3 ? 'text-[#33482F] font-semibold' : 'text-[#6C5038]'}`}>{(s.conv*100).toFixed(0)}%</span></td>
                <td className="num-mono text-[#6C5038]">{s.intent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StitchAuditTable({ A }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Stitch audit · last 5 sessions</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Anonymous → signed-in handoff log.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">Every stitch is logged with anon id, user id, and three timestamps. If a session ever stitches to two users, this table is where it's caught.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Session</th><th>Anonymous id</th><th>Stitched user</th><th>t · anon</th><th>t · login</th><th>t · done</th><th>State</th><th>Source</th></tr></thead>
          <tbody>
            {A.stitch_audit.map((s,i) => (
              <tr key={i}>
                <td className="num-mono">{s.id}</td>
                <td className="num-mono text-[#6C5038]">{s.anon}</td>
                <td className="num-mono">{s.stitched_user || <span className="text-[#7A3925]">— not stitched</span>}</td>
                <td className="num-mono text-[#6C5038]">{s.t_anon}</td>
                <td className="num-mono text-[#6C5038]">{s.t_login || "—"}</td>
                <td className="num-mono text-[#6C5038]">{s.t_done || "—"}</td>
                <td>
                  {s.state === "S7" && <TrustStamp kind="verified" label="S7 done" />}
                  {s.paused && <TrustStamp kind="preview" label="S8 paused" />}
                  {!s.paused && s.state !== "S7" && <TrustStamp kind="needs" label={s.state} />}
                </td>
                <td className="num-mono text-[#6C5038]">{s.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

window.ScreenAdminFunnel = ScreenAdminFunnel;
