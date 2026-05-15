import React from "react";
import { Eyebrow, StudyCard } from "../../../shared/ui/studyos";

// Engine trace — the prototype's provenance diagram: four intelligence
// sources flowing into the Study OS engine, which compiles your plan.
// The diagram is static and explanatory (it documents the real architecture);
// the live `engine_trace` steps from mission-control are listed below it.
const NODES = [
  { y: 18, fill: "#ECE7F2", stroke: "#8F86A1", text: "USER INTELLIGENCE", sub: "persona · weak topics · hours" },
  { y: 64, fill: "#E4EDE0", stroke: "#94B28A", text: "EXAM INTELLIGENCE", sub: "syllabus · PYQ · prereq graph" },
  { y: 110, fill: "#F1E1CD", stroke: "#D6BC93", text: "UPDATE INTELLIGENCE", sub: "official + aggregator + research" },
  { y: 156, fill: "#DDE3EC", stroke: "#7A8AA5", text: "STUDY HISTORY · MOCKS · FOCUS", sub: "adherence · review · consistency" },
  { y: 198, fill: "#2E2218", stroke: "#2E2218", text: "STUDY OS ENGINE", sub: "plan · prio · spaced · adapt", textFill: "#F3EADB", subFill: "#D6BC93" },
];

const KEY_ROWS = [
  { color: "#ECE7F2", border: "#8F86A1", k: "User", v: "your data" },
  { color: "#E4EDE0", border: "#94B28A", k: "Exam", v: "syllabus + PYQ" },
  { color: "#F1E1CD", border: "#D6BC93", k: "Update", v: "official + trust-graded" },
  { color: "#DDE3EC", border: "#7A8AA5", k: "History", v: "study + mocks + focus" },
  { color: "#2E2218", border: "#2E2218", k: "Engine", v: "rules & cadence" },
];

const SDOT = { available: "sdot-live", missing: "sdot-preview", not_connected: "sdot-not" };
const STATUS_LABEL = {
  available: "Available",
  missing: "Not available",
  not_connected: "Not connected",
};

export default function EngineTrace({ steps, planSummary }) {
  const items = Array.isArray(steps) ? steps : [];
  return (
    <StudyCard padded={false} data-testid="engine-trace">
      <div className="grid lg:grid-cols-[200px_1fr_220px]">
        <div className="p-5 lg:border-r border-[#EFE2C9]">
          <Eyebrow>Engine trace</Eyebrow>
          <div className="font-heading text-[22px] mt-1.5 leading-[1.1]">
            Why today
            <br />
            looks like this.
          </div>
          <p className="num-mono text-[10.5px] text-clay-700 mt-3 leading-relaxed">
            Four intelligence layers · compiled into one plan
          </p>
        </div>

        <div className="relative">
          <svg viewBox="0 0 720 220" className="w-full h-[220px] block" aria-hidden="true">
            <defs>
              <marker
                id="engine-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#8A6846" />
              </marker>
            </defs>
            {NODES.map((n, i) => (
              <g key={i}>
                <rect x="14" y={n.y} width="240" height="32" rx="8" fill={n.fill} stroke={n.stroke} />
                <text
                  x="26"
                  y={n.y + 14}
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize="10"
                  fontWeight="600"
                  fill={n.textFill || "#2E2218"}
                  letterSpacing="1.4"
                >
                  {n.text}
                </text>
                <text
                  x="26"
                  y={n.y + 26}
                  fontFamily="Inter, sans-serif"
                  fontSize="10.5"
                  fill={n.subFill || "#6C5038"}
                >
                  {n.sub}
                </text>
              </g>
            ))}
            <path d="M254,34  C 300,34  330,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
            <path d="M254,80  C 310,80  340,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
            <path d="M254,126 C 320,126 350,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
            <path d="M254,172 C 330,172 360,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
            <path d="M498,214 L580,214" fill="none" stroke="#2E2218" strokeWidth="1.8" markerEnd="url(#engine-arrow)" />
            <rect x="580" y="194" width="130" height="40" rx="10" fill="#FBF6EF" stroke="#2E2218" strokeWidth="1.4" />
            <text x="595" y="213" fontFamily="Fraunces, Georgia, serif" fontSize="14" fontWeight="600" fill="#2E2218">
              Today's plan
            </text>
            <text x="595" y="225" fontFamily="'JetBrains Mono', monospace" fontSize="9.5" fill="#6C5038">
              {planSummary || "compiled daily"}
            </text>
          </svg>
        </div>

        <div className="p-5 lg:border-l border-[#EFE2C9]">
          <Eyebrow>Provenance key</Eyebrow>
          <div className="mt-3 space-y-2 text-[11.5px]">
            {KEY_ROWS.map((r) => (
              <div key={r.k} className="flex items-center gap-2.5">
                <span
                  style={{
                    background: r.color,
                    border: `1px solid ${r.border}`,
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                  }}
                  aria-hidden="true"
                />
                <span>
                  <strong>{r.k}</strong> · <span className="text-clay-700">{r.v}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {items.length ? (
        <>
          <div className="hairline mx-7" />
          <ol className="px-7 py-5 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {items.map((step, i) => (
              <li
                key={`${step.label}-${i}`}
                className="flex items-start gap-3 text-[13px]"
                data-testid={`engine-trace-step-${i}`}
              >
                <span
                  className={`sdot ${SDOT[step.status] || "sdot-preview"} mt-1.5`}
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <div className="font-medium text-clay-900">{step.label}</div>
                  {step.details ? (
                    <div className="text-[12px] text-clay-700">{step.details}</div>
                  ) : null}
                </div>
                <span className="num-mono text-[10px] text-clay-700 mt-1 shrink-0">
                  {STATUS_LABEL[step.status] || step.status}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </StudyCard>
  );
}
