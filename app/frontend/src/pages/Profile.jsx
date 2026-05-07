import React, { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";
import {
  CATEGORY_OPTIONS,
  EXAM_FAMILY_OPTIONS,
  GENDER_OPTIONS,
  INDIAN_STATE_OPTIONS,
  PREPARATION_MODE_OPTIONS,
  PWBD_OPTIONS,
  SECTOR_OPTIONS,
  CERTIFICATION_TYPE_OPTIONS,
  EXPERIENCE_SECTOR_OPTIONS,
} from "../lib/profileFields";

export default function Profile() {
  const auth = useAuth();
  const [form, setForm] = useState({});
  const [completion, setCompletion] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [certs, setCerts] = useState([]);
  const [expRows, setExpRows] = useState([]);
  const [attemptRows, setAttemptRows] = useState([]);
  const [newCert, setNewCert] = useState({ certification_name: "", issuing_body: "", year_completed: "" });
  const [newExp, setNewExp] = useState({ sector: "", role: "", organization: "", start_date: "", end_date: "" });
  const [newAttempt, setNewAttempt] = useState({ exam_id: "", attempts_used: 0 });

  useEffect(() => {
    Promise.all([api.get("/api/profile/me"), api.get("/api/profile/completion"), api.get("/api/profile/certifications"), api.get("/api/profile/experience"), api.get("/api/profile/exam-attempts")])
      .then(([u, c, cs, ex, at]) => {
        setForm({
          name: u.name || "",
          email: u.email || "",
          phone: u.profile?.phone || "",
          gender: u.profile?.gender || "",
          date_of_birth: u.profile?.date_of_birth || "",
          category: u.profile?.category || "",
          pwbd_status: u.profile?.pwbd_status || "none",
          state: u.profile?.domicile_state || "",
          nationality: u.profile?.nationality || "",
          ex_serviceman: !!u.profile?.ex_serviceman,
          service_years: u.profile?.service_years ?? "",
          govt_employee: !!u.profile?.govt_employee,
          qualification: u.profile?.qualification || "",
          education_level: u.profile?.education_level || "",
          stream: u.profile?.stream || "",
          qualification_year: u.profile?.qualification_year || "",
          percentage: u.profile?.percentage || "",
          cgpa: u.profile?.cgpa || "",
          goal_exams: u.profile?.goal_exams || [],
          preferred_states: u.profile?.preferred_states || [],
          preferred_sectors: u.profile?.preferred_sectors || [],
          willing_to_relocate: u.profile?.willing_to_relocate ?? true,
          study_mode: u.profile?.study_mode || "",
          weekly_hours_goal: u.profile?.weekly_hours_goal || "",
          target_exam_year: u.profile?.target_exam_year || "",
        });
        setCompletion(c || {});
        setCerts(cs?.items || []);
        setExpRows(ex?.items || []);
        setAttemptRows(at?.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleArray(k, value) {
    setForm((f) => ({ ...f, [k]: f[k].includes(value) ? f[k].filter((x) => x !== value) : [...f[k], value] }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const body = {
        ...form,
        qualification_year: form.qualification_year ? Number(form.qualification_year) : undefined,
        percentage: form.percentage ? Number(form.percentage) : undefined,
        cgpa: form.cgpa ? Number(form.cgpa) : undefined,
        weekly_hours_goal: form.weekly_hours_goal ? Number(form.weekly_hours_goal) : undefined,
        target_exam_year: form.target_exam_year ? Number(form.target_exam_year) : undefined,
        service_years: form.service_years ? Number(form.service_years) : undefined,
      };
      delete body.email;
      const u = await api.put("/api/profile/me", body);
      const c = await api.get("/api/profile/completion");
      auth.setUser(u);
      setCompletion(c || {});
      setMsg("Profile saved");
    } catch (err) { setMsg(err.message); } finally { setSaving(false); }
  }

  if (loading) return <div data-testid="profile-loading">Loading…</div>;

  return (
    <div className="space-y-6" data-testid="profile-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Progressive profile</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Keep your eligibility sharp.</h1>
        <p className="text-muted-foreground mt-1">We only use the fields you provide. Empty fields are treated as not provided.</p>
      </div>

      <form onSubmit={onSubmit} className="grid lg:grid-cols-3 gap-5" data-testid="profile-form">
        <div className="lg:col-span-2 soft-card rounded-2xl p-6 space-y-7">
          <Section title="Identity" helper="Used for deterministic identity checks.">
            <Grid><Input label="Name" value={form.name} onChange={(v) => set("name", v)} /><Input label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="Not provided" /><Select label="Gender" value={form.gender} onChange={(v) => set("gender", v)} options={GENDER_OPTIONS} /><Input label="Date of birth" value={form.date_of_birth} onChange={(v) => set("date_of_birth", v)} placeholder="YYYY-MM-DD" /></Grid>
          </Section>

          <Section title="Reservation & domicile" helper="Impacts reservation and state-specific eligibility rules.">
            <Grid><Select label="Category" value={form.category} onChange={(v) => set("category", v)} options={CATEGORY_OPTIONS.map((v) => ({ value: v, label: v }))} /><Select label="PwBD status" value={form.pwbd_status} onChange={(v) => set("pwbd_status", v)} options={PWBD_OPTIONS.map((v) => ({ value: v, label: v }))} /><Select label="Domicile state" value={form.state} onChange={(v) => set("state", v)} options={[{ value: "", label: "Not provided" }, ...INDIAN_STATE_OPTIONS.map((v) => ({ value: v, label: v.replaceAll("_", " ") }))]} /><Input label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} placeholder="Not provided" /><Bool label="Ex-serviceman" value={form.ex_serviceman} onChange={(v) => set("ex_serviceman", v)} /><Input label="Service years" value={form.service_years} onChange={(v) => set("service_years", v)} placeholder="Not provided" /><Bool label="Government employee" value={form.govt_employee} onChange={(v) => set("govt_employee", v)} /></Grid>
          </Section>

          <Section title="Education" helper="Qualification and marks drive post-level matching.">
            <Grid><Input label="Education level" value={form.education_level} onChange={(v) => set("education_level", v)} placeholder="Not provided" /><Input label="Qualification" value={form.qualification} onChange={(v) => set("qualification", v)} placeholder="Not provided" /><Input label="Stream" value={form.stream} onChange={(v) => set("stream", v)} placeholder="Not provided" /><Input label="Passing year" value={form.qualification_year} onChange={(v) => set("qualification_year", v)} placeholder="Not provided" /><Input label="Percentage" value={form.percentage} onChange={(v) => set("percentage", v)} placeholder="Not provided" /><Input label="CGPA" value={form.cgpa} onChange={(v) => set("cgpa", v)} placeholder="Not provided" /></Grid>
          </Section>

          <Section title="Preferences" helper="Preferences improve recommendation relevance only.">
            <div className="space-y-2"><div className="text-sm text-muted-foreground">Exam families</div><Chips options={EXAM_FAMILY_OPTIONS} values={form.goal_exams} onToggle={(v) => toggleArray("goal_exams", v)} /></div>
            <div className="space-y-2"><div className="text-sm text-muted-foreground">Preferred sectors</div><Chips options={SECTOR_OPTIONS} values={form.preferred_sectors} onToggle={(v) => toggleArray("preferred_sectors", v)} /></div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Preferred states</div>
              <select className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none" onChange={(e) => e.target.value && !form.preferred_states.includes(e.target.value) && set("preferred_states", [...form.preferred_states, e.target.value])}>
                <option value="">Select state to add</option>
                {INDIAN_STATE_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                {(form.preferred_states || []).length ? form.preferred_states.map((s) => (
                  <button key={s} type="button" onClick={() => set("preferred_states", form.preferred_states.filter((x) => x !== s))} className="px-3 py-1 rounded-full border border-clay-300 bg-clay-50 text-xs">
                    {s.replaceAll("_", " ")} ×
                  </button>
                )) : <span className="text-xs text-muted-foreground">Not provided</span>}
              </div>
            </div>
            <Bool label="Willing to relocate" value={form.willing_to_relocate} onChange={(v) => set("willing_to_relocate", v)} />
          </Section>

          <Section title="Study rhythm" helper="Used for plan pacing and backlog signals.">
            <Grid><Select label="Preparation mode" value={form.study_mode} onChange={(v) => set("study_mode", v)} options={[{ value: "", label: "Not provided" }, ...PREPARATION_MODE_OPTIONS.map((v) => ({ value: v, label: v.replaceAll("_", " ") }))]} /><Input label="Weekly hours goal" value={form.weekly_hours_goal} onChange={(v) => set("weekly_hours_goal", v)} placeholder="Not provided" /><Input label="Target exam year" value={form.target_exam_year} onChange={(v) => set("target_exam_year", v)} placeholder="Not provided" /></Grid>
          </Section>

          <Section title="Application readiness" helper="Helps reduce form-filling friction for applications.">
            <Grid><Input label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="Not provided" /><Input label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} placeholder="Not provided" /><Bool label="Government employee" value={form.govt_employee} onChange={(v) => set("govt_employee", v)} /></Grid>
          </Section>

          <Section title="Professional certifications" helper="Add certifications relevant for eligibility filters.">
            <Grid><Select label="Certification" value={newCert.certification_name} onChange={(v) => setNewCert({ ...newCert, certification_name: v })} options={[{ value: "", label: "Not provided" }, ...CERTIFICATION_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))]} /><Input label="Issuing body" value={newCert.issuing_body} onChange={(v) => setNewCert({ ...newCert, issuing_body: v })} placeholder="Not provided" /><Input label="Year completed" value={newCert.year_completed} onChange={(v) => setNewCert({ ...newCert, year_completed: v })} placeholder="Not provided" /></Grid>
            <button type="button" className="btn btn-secondary" onClick={async () => { const r = await api.post("/api/profile/certifications", { ...newCert, year_completed: newCert.year_completed ? Number(newCert.year_completed) : undefined, is_active: true }); setCerts((x) => [r.item, ...x]); }}>Add certification</button>
            <SimpleList rows={certs} onDelete={async (id) => { await api.delete(`/api/profile/certifications/${id}`); setCerts((x) => x.filter((r) => r.id !== id)); }} render={(r) => `${r.certification_name} · ${r.issuing_body || "Not provided"} · ${r.year_completed || "Not provided"}`} />
          </Section>

          <Section title="Work experience" helper="Add experience to support role-specific eligibility.">
            <Grid><Select label="Sector" value={newExp.sector} onChange={(v) => setNewExp({ ...newExp, sector: v })} options={[{ value: "", label: "Not provided" }, ...EXPERIENCE_SECTOR_OPTIONS.map((v) => ({ value: v, label: v }))]} /><Input label="Role" value={newExp.role} onChange={(v) => setNewExp({ ...newExp, role: v })} placeholder="Not provided" /><Input label="Organization" value={newExp.organization} onChange={(v) => setNewExp({ ...newExp, organization: v })} placeholder="Not provided" /><Input label="Start date" value={newExp.start_date} onChange={(v) => setNewExp({ ...newExp, start_date: v })} placeholder="YYYY-MM-DD" /><Input label="End date" value={newExp.end_date} onChange={(v) => setNewExp({ ...newExp, end_date: v })} placeholder="Not provided" /></Grid>
            <button type="button" className="btn btn-secondary" onClick={async () => { const r = await api.post("/api/profile/experience", newExp); setExpRows((x) => [r.item, ...x]); }}>Add experience</button>
            <SimpleList rows={expRows} onDelete={async (id) => { await api.delete(`/api/profile/experience/${id}`); setExpRows((x) => x.filter((r) => r.id !== id)); }} render={(r) => `${r.organization || "Not provided"} · ${r.role || "Not provided"} · ${r.sector || "Not provided"}`} />
          </Section>

          <Section title="Exam attempts" helper="Track attempts for attempt-limited exams.">
            <Grid><Input label="Exam ID" value={newAttempt.exam_id} onChange={(v) => setNewAttempt({ ...newAttempt, exam_id: v })} placeholder="UUID or exam key" /><Input label="Attempts used" value={newAttempt.attempts_used} onChange={(v) => setNewAttempt({ ...newAttempt, attempts_used: v })} /></Grid>
            <button type="button" className="btn btn-secondary" onClick={async () => { const r = await api.post("/api/profile/exam-attempts", { exam_id: newAttempt.exam_id, attempts_used: Number(newAttempt.attempts_used || 0) }); setAttemptRows((x) => [r.item, ...x]); }}>Add attempt</button>
            <SimpleList rows={attemptRows} onDelete={async (id) => { await api.delete(`/api/profile/exam-attempts/${id}`); setAttemptRows((x) => x.filter((r) => r.id !== id)); }} render={(r) => `${r.exam_id} · attempts: ${r.attempts_used}`} />
          </Section>

          <div className="flex items-center gap-3 pt-2"><button disabled={saving} className="btn btn-primary" data-testid="profile-save">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile</button>{msg && <span className="text-sm text-muted-foreground">{msg}</span>}</div>
        </div>

        <aside className="space-y-4">
          <div className="soft-card rounded-2xl p-5">
            <div className="font-semibold mb-2">Completion status</div>
            {[
              "identity_profile",
              "education_profile",
              "preferences_profile",
              "study_profile",
              "application_profile",
            ].map((k) => <CompletionCard key={k} title={k.replaceAll("_", " ")} data={completion?.[k]} />)}
          </div>
        </aside>
      </form>
    </div>
  );
}

function Section({ title, helper, children }) { return <div className="border-t border-border pt-5 first:border-0 first:pt-0"><h2 className="font-heading text-xl font-semibold">{title}</h2><p className="text-xs text-muted-foreground mb-3">{helper}</p><div className="space-y-3">{children}</div></div>; }
function Grid({ children }) { return <div className="grid md:grid-cols-2 gap-4">{children}</div>; }
function Input({ label, value, onChange, placeholder }) { return <label className="block"><div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div><input value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none" /></label>; }
function Select({ label, value, onChange, options }) { return <label className="block"><div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div><select value={value || ""} onChange={(e) => onChange?.(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function Bool({ label, value, onChange }) { return <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={!!value} onChange={(e) => onChange?.(e.target.checked)} /> {label}</label>; }
function Chips({ options, values = [], onToggle }) { return <div className="grid gap-2">{options.map((o) => <button key={o} type="button" onClick={() => onToggle(o)} className={`text-left px-3 py-2 rounded-lg border ${values.includes(o) ? "border-clay-500 bg-clay-50" : "border-border"}`}>{o.replaceAll("_", " ")}</button>)}</div>; }
function CompletionCard({ title, data }) {
  if (!data) return <div className="p-3 border rounded-xl text-sm text-muted-foreground">{title}: Not provided</div>;
  return (
    <div className="p-3 border rounded-xl text-sm space-y-1">
      <div className="font-medium capitalize">{title}</div>
      <div>{data.completion_pct}% complete</div>
      <div className="text-xs text-muted-foreground">Missing: {(data.missing_fields || []).length ? data.missing_fields.join(", ") : "None"}</div>
      <div className="text-xs text-muted-foreground">Why: {data.why_it_matters || "Not provided"}</div>
      <div className="text-xs">Next: {data.next_action || "Not provided"}</div>
    </div>
  );
}
function SimpleList({ rows, onDelete, render }) { return <div className="space-y-2">{rows?.length ? rows.map((r) => <div key={r.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"><span>{render(r)}</span><button type="button" className="text-xs link-under" onClick={() => onDelete(r.id)}>Remove</button></div>) : <div className="text-xs text-muted-foreground">Not provided</div>}</div>; }
