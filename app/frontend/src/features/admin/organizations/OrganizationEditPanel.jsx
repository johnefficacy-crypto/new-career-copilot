import React, { useState } from "react";
import { InputField } from "../../../shared/ui";

export default function OrganizationEditPanel({ org, onSave }) {
  const [open, setOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(org.website_url || org.official_website || "");

  return (
    <div className="space-y-2">
      <button type="button" className="text-xs link-under" onClick={() => setOpen((v) => !v)}>{open ? "Hide edit" : "Edit website"}</button>
      {open && <div className="rounded-xl border border-border p-3 bg-white/60 space-y-2"><InputField label="Website URL" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} /><button type="button" className="btn btn-ghost" onClick={() => onSave({ website_url: websiteUrl })}>Save website</button></div>}
    </div>
  );
}
