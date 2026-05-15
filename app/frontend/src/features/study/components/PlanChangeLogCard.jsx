import React, { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Eyebrow, Pill, StatusDot } from "../../../shared/ui/studyos";

// Plan change log fed by /api/study/plan/changelog (study_adaptation_events).
// Each row is server-derived — the UI never re-derives event copy.
export default function PlanChangeLogCard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/study/plan/changelog")
      .then((d) => {
        if (cancelled) return;
        setItems(Array.isArray(d?.items) ? d.items : []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e?.message || "Could not load change log");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card padded={false} data-testid="plan-changelog">
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Plan change log</Eyebrow>
          <h2 className="font-heading text-[18px] mt-1 flex items-center gap-2">
            <History className="h-4 w-4 text-clay-700" aria-hidden="true" />
            What the planner has done recently
          </h2>
        </div>
        <StatusDot state="live" label="" />
      </div>
      <div className="hairline mx-7" />
      <div className="px-7 py-4">
        {err ? (
          <p className="text-xs text-clay-700">{err}</p>
        ) : loading ? (
          <p className="text-xs text-clay-700">Loading…</p>
        ) : !items.length ? (
          <p className="text-xs text-clay-700">
            No plan mutations recorded yet. Apply a regeneration to see entries here.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((row) => {
              const summary = row.change_summary || {};
              const when = row.created_at ? new Date(row.created_at).toLocaleString() : "";
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-[#E7DECB] bg-white/60 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Pill tone="ink">{row.event_type}</Pill>
                      {row.trigger_source ? (
                        <span className="num-mono text-[10.5px] text-clay-700">
                          {row.trigger_source}
                        </span>
                      ) : null}
                    </div>
                    <span className="num-mono text-[10.5px] text-clay-700">{when}</span>
                  </div>
                  {(summary.task_count != null || summary.version_number != null) ? (
                    <div className="mt-1.5 text-[12px] text-clay-800">
                      {summary.version_number != null ? `v${summary.version_number}` : null}
                      {summary.version_number != null && summary.task_count != null ? " · " : ""}
                      {summary.task_count != null ? `${summary.task_count} tasks` : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
