import React from "react";
import { Link } from "react-router-dom";

export default function NextActionCallout({ message, href, actionLabel, tone = "info", title }) {
  if (!message) return null;
  const toneCls = tone === "warn" ? "next-action warn" : "next-action";
  return (
    <div className={toneCls} data-testid="next-action-callout">
      <div>
        <div className="lbl" style={{ marginBottom: 5 }}>Next safe action</div>
        {title ? <h4 className="oc-title" style={{ color: "var(--paper)" }}>{title}</h4> : null}
        <div style={{ fontSize: 12, color: "rgba(250,247,242,0.85)", marginTop: 4 }}>{message}</div>
      </div>
      {href && actionLabel ? (
        <Link className="btn primary" to={href}>{actionLabel}</Link>
      ) : null}
    </div>
  );
}
