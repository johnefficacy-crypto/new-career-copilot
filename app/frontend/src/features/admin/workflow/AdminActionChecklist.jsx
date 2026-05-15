import React from "react";

const STATUS_BADGE = {
  done: { cls: "badge resolved", text: "done" },
  todo: { cls: "badge pending", text: "todo" },
  blocked: { cls: "badge blocker", text: "blocked" },
  pending: { cls: "badge neutral", text: "pending" },
};

export default function AdminActionChecklist({ items = [], onJump }) {
  if (!items.length) return null;
  const blockedCount = items.filter((i) => i.status === "blocked").length;
  return (
    <section className="card" data-testid="admin-action-checklist">
      <div className="card-head">
        <h4 className="oc-title">Next safe actions</h4>
        <span className="row-sub">{items.length} steps{blockedCount ? ` · ${blockedCount} blocked` : ""}</span>
      </div>
      <div>
        {items.map((item, index) => {
          const meta = STATUS_BADGE[item.status] || STATUS_BADGE.todo;
          return (
            <button
              key={item.id}
              type="button"
              className="check-row"
              onClick={() => onJump?.(item.target, item)}
              data-testid={`checklist-${item.id}`}
              data-status={item.status}
            >
              <span className="num">{String(index + 1).padStart(2, "0")}</span>
              <span>
                <span className="ctxt">{item.label}</span>
                {item.reason ? <div className="csub">{item.reason}</div> : null}
                {item.hint ? <div className="csub" style={{ marginTop: 2 }}>{item.hint}</div> : null}
              </span>
              <span className={meta.cls}>{meta.text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
