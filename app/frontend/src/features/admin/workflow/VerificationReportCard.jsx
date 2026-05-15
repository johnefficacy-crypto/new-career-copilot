import React from "react";

// VerificationReportCard — renders backend states verbatim.
// Per plan §7 "Frontend truth boundary": this component only displays
// labels the backend supplies. It never derives verified / eligible /
// publish_ready from local UI state.
export default function VerificationReportCard({ report }) {
  if (!report) return null;

  const stateRows = [
    ["Lifecycle", report.lifecycle_status],
    ["Tier", report.criticality_tier],
    ["Exam family", report.exam_family_key || "—"],
    ["Review strategy", report.review_strategy],
    ["Publish policy", report.publish_policy],
    ["Recommended action", report.recommended_action],
    ["Trigger reason", report.trigger_reason],
    ["Official proof", proofState(report)],
    ["Staleness", report.staleness_status || "fresh"],
    ["Report version", `v${report.report_version}`],
  ];

  return (
    <article className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Verification Report
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">ID {report.id}</p>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-xs">
        {stateRows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-gray-500">{label}</dt>
            <dd className="font-mono text-gray-900">{value || "—"}</dd>
          </div>
        ))}
      </dl>

      <RiskFlagsSection flags={report.risk_flags} />
      <ConflictsSection conflicts={report.conflicts} />
      <SuggestedUrlsSection urls={report.suggested_official_urls} />
    </article>
  );
}

// Plan §7: official proof states are
// auto-resolved | suggested | unresolved | admin attached | rejected.
// We map the backend column 1:1 to a display string.
function proofState(report) {
  const s = report.official_resolution_status;
  if (!s) return "Not attempted";
  const labels = {
    not_attempted: "Not attempted",
    auto_resolved: "Auto-resolved",
    suggested: "Suggested proof",
    unresolved: "Unresolved",
    admin_attached: "Admin attached",
    rejected: "Rejected",
  };
  return labels[s] || s;
}

function RiskFlagsSection({ flags }) {
  if (!flags || flags.length === 0) return null;
  return (
    <section className="border-t border-gray-100 px-5 py-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Complexity flags
      </h4>
      <ul className="mt-2 space-y-1">
        {flags.map((f) => (
          <li key={f.flag} className="flex items-center justify-between text-xs">
            <span className="font-mono text-gray-900">{f.flag}</span>
            <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-amber-800">
              {f.blocking_level}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConflictsSection({ conflicts }) {
  if (!conflicts || conflicts.length === 0) return null;
  return (
    <section className="border-t border-gray-100 px-5 py-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Consensus conflicts
      </h4>
      <ul className="mt-2 space-y-2">
        {conflicts.map((c) => (
          <li key={c.conflict_id} className="rounded border border-gray-100 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-gray-900">{c.field_path}</span>
              <span className="font-mono text-gray-500">{c.status}</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-gray-700">
              {(c.values || []).map((v, i) => (
                <li key={i}>
                  <span className="text-gray-500">{v.source}:</span>{" "}
                  <span className="font-mono">{String(v.value)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SuggestedUrlsSection({ urls }) {
  if (!urls || urls.length === 0) return null;
  return (
    <section className="border-t border-gray-100 px-5 py-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Suggested official URLs
      </h4>
      <ul className="mt-2 space-y-1 text-xs">
        {urls.map((u) => (
          <li key={u.url} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-gray-900">{u.url}</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
              {u.method}
            </span>
            <span className="text-gray-500">conf {u.confidence?.toFixed?.(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
