import React, { useState } from "react";
import { copyrightService } from "../services/studyToolsService";

const CLAIM_TYPES = [
  { value: "dmca", label: "DMCA (US copyright)" },
  { value: "trademark", label: "Trademark" },
  { value: "patent", label: "Patent" },
  { value: "privacy", label: "Privacy / personal data" },
  { value: "other", label: "Other IP claim" },
];

const TARGETS = [
  { value: "community_resource", label: "Community resource" },
  { value: "marketplace_resource", label: "Marketplace resource" },
  { value: "forum_post", label: "Forum post" },
  { value: "forum_thread", label: "Forum thread" },
  { value: "mentor_profile", label: "Mentor profile" },
  { value: "other", label: "Other / unsure" },
];

export default function CopyrightSubmit() {
  const [form, setForm] = useState({
    claim_type: "dmca",
    claimant_name: "",
    claimant_email: "",
    claimant_org: "",
    claimant_role: "",
    work_title: "",
    work_description: "",
    ownership_evidence_url: "",
    target_entity_type: "other",
    target_entity_id: "",
    infringing_url: "",
    good_faith_statement: false,
    accuracy_statement: false,
    signature: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.ownership_evidence_url) delete payload.ownership_evidence_url;
      if (!payload.target_entity_id) delete payload.target_entity_id;
      if (!payload.claimant_org) delete payload.claimant_org;
      if (!payload.claimant_role) delete payload.claimant_role;
      const r = await copyrightService.submit(payload);
      setResult(r);
    } catch (e) {
      setErr(e.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-4">
        <h1 className="font-heading text-3xl font-semibold">Claim received</h1>
        <p className="text-muted-foreground">{result.message}</p>
        <div className="soft-card rounded-xl p-4 text-sm">
          <div><b>Reference:</b> {result.id}</div>
          <div><b>Received:</b> {new Date(result.received_at).toLocaleString()}</div>
        </div>
        <p className="text-xs text-muted-foreground">Save this reference for any follow-up correspondence.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="font-heading text-3xl font-semibold">Copyright / IP claim</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Use this form to report material on this platform that infringes your intellectual property rights.
        Fields marked * are required for DMCA notices to be actionable.
      </p>

      <form onSubmit={submit} className="space-y-4 mt-6">
        {err && <div className="soft-card rounded-xl p-4 text-sm text-red-600">{err}</div>}

        <Field label="Claim type *">
          <select className="w-full px-3 py-2 rounded-xl border border-border bg-background" value={form.claim_type} onChange={(e) => set("claim_type", e.target.value)}>
            {CLAIM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Your full name *">
            <Input value={form.claimant_name} onChange={(v) => set("claimant_name", v)} required />
          </Field>
          <Field label="Email *">
            <Input type="email" value={form.claimant_email} onChange={(v) => set("claimant_email", v)} required />
          </Field>
          <Field label="Organization">
            <Input value={form.claimant_org} onChange={(v) => set("claimant_org", v)} />
          </Field>
          <Field label="Your role (e.g. legal counsel)">
            <Input value={form.claimant_role} onChange={(v) => set("claimant_role", v)} />
          </Field>
        </div>

        <Field label="Title of work being infringed *">
          <Input value={form.work_title} onChange={(v) => set("work_title", v)} required />
        </Field>

        <Field label="Description of the work *">
          <textarea
            className="w-full px-3 py-2 rounded-xl border border-border bg-background min-h-[100px]"
            value={form.work_description}
            onChange={(e) => set("work_description", e.target.value)}
            required
          />
        </Field>

        <Field label="Evidence of ownership URL">
          <Input value={form.ownership_evidence_url} onChange={(v) => set("ownership_evidence_url", v)} placeholder="https://…" />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Target type *">
            <select className="w-full px-3 py-2 rounded-xl border border-border bg-background" value={form.target_entity_type} onChange={(e) => set("target_entity_type", e.target.value)}>
              {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Target ID (if known)">
            <Input value={form.target_entity_id} onChange={(v) => set("target_entity_id", v)} />
          </Field>
        </div>

        <Field label="Infringing URL on this platform *">
          <Input value={form.infringing_url} onChange={(v) => set("infringing_url", v)} placeholder="https://…" required />
        </Field>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.good_faith_statement} onChange={(e) => set("good_faith_statement", e.target.checked)} />
          <span>I have a good-faith belief that the use of the material is not authorised by the copyright owner, its agent, or the law.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.accuracy_statement} onChange={(e) => set("accuracy_statement", e.target.checked)} />
          <span>The information in this notice is accurate, and under penalty of perjury, I am the copyright owner or authorised to act on behalf of the owner.</span>
        </label>

        <Field label="Electronic signature *">
          <Input value={form.signature} onChange={(v) => set("signature", v)} placeholder="Type your full legal name" required />
        </Field>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit claim"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", required = false, placeholder = "" }) {
  return (
    <input
      type={type}
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-border bg-background"
    />
  );
}
