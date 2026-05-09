import React, { useRef, useState } from "react";
import { InputField } from "../../../shared/ui";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";

export default function OrganizationEditPanel({ org, onSave, busy }) {
  const [open, setOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(org.website_url || org.official_website || "");
  const panelRef = useRef(null);
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: () => setOpen(false) });

  return (
    <div className="space-y-2">
      <button type="button" className="text-xs link-under" onClick={() => setOpen((v) => !v)}>{open ? "Hide edit" : "Edit website"}</button>
      {open && <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="organization-edit-title" className="rounded-xl border border-border p-3 bg-white/60 space-y-2"><h3 id="organization-edit-title" className="text-sm font-semibold">Edit organization website</h3><InputField label="Website URL" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} /><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onSave({ website_url: websiteUrl })}>{busy ? "Saving…" : "Save website"}</button></div>}
    </div>
  );
}
