import React, { useState } from "react";
import { InputField } from "../../../shared/ui";

export default function RecruitmentEditPanel({ row, onSave }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(row.name || "");
  const [officialApplyUrl, setOfficialApplyUrl] = useState(row.official_apply_url || "");

  return (
    <div className="space-y-2">
      <button type="button" className="text-xs link-under" onClick={() => setOpen((v) => !v)}>{open ? "Hide edit" : "Edit fields"}</button>
      {open && <div className="rounded-xl border border-border p-3 space-y-3 bg-white/60"><InputField label="Recruitment name" value={name} onChange={(e) => setName(e.target.value)} /><InputField label="Official apply URL" value={officialApplyUrl} onChange={(e) => setOfficialApplyUrl(e.target.value)} /><button type="button" className="btn btn-ghost" onClick={() => onSave({ name, official_apply_url: officialApplyUrl })}>Save edits</button></div>}
    </div>
  );
}
