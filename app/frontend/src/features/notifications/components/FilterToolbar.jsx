import React from "react";
import { CheckboxField, SelectField } from "../../../shared/ui";

export default function FilterToolbar({ filters, onChange, onReset }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="soft-card rounded-2xl p-4 grid md:grid-cols-3 gap-4 items-end">
      <CheckboxField
        label="Unread only"
        checked={filters.unreadOnly}
        onChange={(e) => set("unreadOnly", e.target.checked)}
      />
      <SelectField label="Priority" value={filters.priority} onChange={(e) => set("priority", e.target.value)}>
        <option value="">Any priority</option>
        <option value="1">1+</option>
        <option value="2">2+</option>
        <option value="3">3+</option>
        <option value="4">4</option>
      </SelectField>
      <SelectField label="Type" value={filters.type} onChange={(e) => set("type", e.target.value)}>
        <option value="">Any type</option>
        <option value="continue_application">Continue application</option>
        <option value="submit_form">Submit form</option>
        <option value="prepare_after_submission">Prepare after submission</option>
        <option value="complete_profile">Complete profile</option>
        <option value="study_backlog_recovery">Backlog recovery</option>
        <option value="weekly_review_ready">Weekly review ready</option>
        <option value="monitor_result">Monitor result</option>
        <option value="apply_deadline_urgent">Deadline urgent</option>
      </SelectField>
      <button type="button" className="btn btn-ghost" onClick={onReset}>Reset filters</button>
    </div>
  );
}
