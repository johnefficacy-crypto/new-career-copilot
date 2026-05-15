import React from "react";
import { getBlockerLabel, getBlockerNextAction } from "./adminWorkflowContract";

export default function BlockerList({ blockers = [], empty = "No publish blockers reported." }) {
  if (!blockers?.length) {
    return <div className="anno" data-testid="no-blockers">{empty}</div>;
  }
  return (
    <div>
      <div className="lbl" style={{ marginBottom: 6 }}>Publish blockers · {blockers.length}</div>
      <div className="card fld-list">
        {blockers.map((code) => (
          <div key={code} className="fld">
            <div className="fld-head">
              <span className="fld-key">{code}</span>
              <span className="badge blocker">blocker</span>
            </div>
            <div className="fld-val">{getBlockerLabel(code)}</div>
            <div className="anno" style={{ marginTop: 4 }}>{getBlockerNextAction(code)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
