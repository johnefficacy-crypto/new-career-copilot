import React from "react";
import { Check, Circle, AlertTriangle } from "lucide-react";

const STATUS_TONE = {
  done: "border-sage-300 bg-sage-50 text-sage-900",
  todo: "border-border bg-white/60 text-foreground",
  blocked: "border-amber-300 bg-amber-50 text-amber-900",
};

function statusIcon(status) {
  if (status === "done") return Check;
  if (status === "blocked") return AlertTriangle;
  return Circle;
}

export default function AdminActionChecklist({ items = [], onJump }) {
  if (!items.length) return null;
  return (
    <section className="soft-card rounded-2xl p-4" data-testid="admin-action-checklist">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Next safe actions</div>
      <ol className="mt-3 space-y-2">
        {items.map((item) => {
          const Icon = statusIcon(item.status);
          const tone = STATUS_TONE[item.status] || STATUS_TONE.todo;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onJump?.(item.target, item)}
                className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm ${tone}`}
                data-testid={`checklist-${item.id}`}
                data-status={item.status}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="font-medium">{item.label}</span>
                  {item.reason ? <span className="ml-1 text-xs opacity-80">— {item.reason}</span> : null}
                  {item.hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</div> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
