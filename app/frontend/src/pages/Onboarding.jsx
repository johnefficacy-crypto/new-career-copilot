import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";
import {
  CATEGORY_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  EXAM_FAMILY_OPTIONS,
  GENDER_OPTIONS,
  INDIAN_STATE_OPTIONS,
  MARKS_TYPE_OPTIONS,
  PREPARATION_MODE_OPTIONS,
  PWBD_OPTIONS,
  SECTOR_OPTIONS,
} from "../lib/profileFields";

const STEPS = [
  { id: "identity", title: "Identity minimum", subtitle: "These fields power your base eligibility profile." },
  { id: "education", title: "Education minimum", subtitle: "Qualification decides post-level eligibility." },
  { id: "preferences", title: "Preferences", subtitle: "Tell us where and what you want to target." },
  { id: "study", title: "Study rhythm", subtitle: "We'll adapt recommendations to your weekly capacity." },
];

export default function Onboarding() {
  const auth = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: auth.user?.name || "",
    date_of_birth: "",
    gender: "",
    category: "",
    pwbd_status: "",
    state: "",
    education_level: "",
    qualification: "",
    stream: "",
    qualification_year: "",
    marks_type: "percentage",
    percentage: "",
    cgpa: "",
    goal_exams: [],
    preferred_sectors: [],
    preferred_states: [],
    willing_to_relocate: true,
    study_mode: "",
    weekly_hours_goal: "",
    target_exam_year: "",
  });

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleArray(k, value, cap = 4) {
    setForm((f) => ({
      ...f,
      [k]: f[k].includes(value) ? f[k].filter((x) => x !== value) : (f[k].length >= cap ? f[k] : [...f[k], value]),
    }));
  }

  async function finish() {
    const body = {
      name: form.name || undefined,
      date_of_birth: form.date_of_birth || undefined,
      gender: form.gender || undefined,
      category: form.category || undefined,
      pwbd_status: form.pwbd_status || undefined,
      state: form.state || undefined,
      qualification: form.qualification || undefined,
      education_level: form.education_level || undefined,
      stream: form.stream || undefined,
      qualification_year: form.qualification_year ? Number(form.qualification_year) : undefined,
      percentage: form.marks_type === "percentage" && form.percentage ? Number(form.percentage) : undefined,
      cgpa: form.marks_type === "cgpa" && form.cgpa ? Number(form.cgpa) : undefined,
      goal_exams: form.goal_exams,
      preferred_states: form.preferred_states,
      preferred_sectors: form.preferred_sectors,
      willing_to_relocate: form.willing_to_relocate,
      study_mode: form.study_mode || undefined,
      weekly_hours_goal: form.weekly_hours_goal ? Number(form.weekly_hours_goal) : undefined,
      target_exam_year: form.target_exam_year ? Number(form.target_exam_year) : undefined,
      onboarded: true,
    };
    const u = await api.put("/api/profile/me", body);
    auth.setUser(u);
    nav("/app");
  }

  const current = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="onboarding-page">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Step {step + 1} of {STEPS.length}</div>
        <button onClick={finish} className="text-xs text-muted-foreground link-under" data-testid="onboarding-skip">Skip for now</button>
      </div>
      <div className="h-1 rounded-full bg-clay-100 overflow-hidden"><div className="h-full bg-clay-500 transition-all" style={{ width: `${progress}%` }} /></div>

      <h1 className="font-heading text-4xl font-semibold tracking-tight">{current.title}</h1>
      <p className="text-muted-foreground -mt-2">{current.subtitle}</p>

      <div className="soft-card rounded-2xl p-6">
        {step === 0 && <div className="grid md:grid-cols-2 gap-4">
          <Field label="Full name"><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Date of birth"><input className="input" placeholder="YYYY-MM-DD" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
          <Field label="Gender"><select className="input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>{GENDER_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select></Field>
          <Field label="Category"><select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}><option value="">Not provided</option>{CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="PwBD status"><select className="input" value={form.pwbd_status} onChange={(e) => set("pwbd_status", e.target.value)}><option value="">Not provided</option>{PWBD_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
          <Field label="Domicile state"><select className="input" value={form.state} onChange={(e) => set("state", e.target.value)}><option value="">Not provided</option>{INDIAN_STATE_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></Field>
        </div>}

        {step === 1 && <div className="grid md:grid-cols-2 gap-4">
          <Field label="Education level"><select className="input" value={form.education_level} onChange={(e) => set("education_level", e.target.value)}><option value="">Not provided</option>{EDUCATION_LEVEL_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}</select></Field>
          <Field label="Qualification / degree"><input className="input" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} /></Field>
          <Field label="Stream (optional)"><input className="input" value={form.stream} onChange={(e) => set("stream", e.target.value)} /></Field>
          <Field label="Passing year"><input className="input" type="number" value={form.qualification_year} onChange={(e) => set("qualification_year", e.target.value)} /></Field>
          <Field label="Marks type"><select className="input" value={form.marks_type} onChange={(e) => set("marks_type", e.target.value)}>{MARKS_TYPE_OPTIONS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select></Field>
          {form.marks_type === "percentage" ? (
            <Field label="Percentage"><input className="input" type="number" value={form.percentage} onChange={(e) => set("percentage", e.target.value)} /></Field>
          ) : (
            <Field label="CGPA"><input className="input" type="number" step="0.01" value={form.cgpa} onChange={(e) => set("cgpa", e.target.value)} /></Field>
          )}
        </div>}

        {step === 2 && <div className="space-y-5">
          <div>
            <div className="text-xs mb-2 text-muted-foreground">Target exam families</div>
            <div className="grid md:grid-cols-2 gap-3">{EXAM_FAMILY_OPTIONS.map((e) => <Chip key={e} active={form.goal_exams.includes(e)} onClick={() => toggleArray("goal_exams", e)}>{e.replaceAll("_", " ")}</Chip>)}</div>
          </div>
          <div>
            <div className="text-xs mb-2 text-muted-foreground">Preferred sectors</div>
            <div className="grid md:grid-cols-2 gap-3">{SECTOR_OPTIONS.map((s) => <Chip key={s} active={form.preferred_sectors.includes(s)} onClick={() => toggleArray("preferred_sectors", s)}>{s.replaceAll("_", " ")}</Chip>)}</div>
          </div>
          <Field label="Preferred states"><select className="input" onChange={(e) => e.target.value && toggleArray("preferred_states", e.target.value, 6)}><option value="">Select state to add</option>{INDIAN_STATE_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></Field>
          <div className="text-xs text-muted-foreground">Selected: {form.preferred_states.length ? form.preferred_states.map((s) => s.replaceAll("_", " ")).join(", ") : "Not provided"}</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.willing_to_relocate} onChange={(e) => set("willing_to_relocate", e.target.checked)} /> Willing to relocate</label>
        </div>}

        {step === 3 && <div className="grid md:grid-cols-2 gap-4">
          <Field label="Preparation mode"><select className="input" value={form.study_mode} onChange={(e) => set("study_mode", e.target.value)}><option value="">Not provided</option>{PREPARATION_MODE_OPTIONS.map((p) => <option key={p} value={p}>{p.replaceAll("_", " ")}</option>)}</select></Field>
          <Field label="Weekly hours goal"><input className="input" type="number" value={form.weekly_hours_goal} onChange={(e) => set("weekly_hours_goal", e.target.value)} placeholder="Not provided" /></Field>
          <Field label="Target exam year"><input className="input" type="number" value={form.target_exam_year} onChange={(e) => set("target_exam_year", e.target.value)} placeholder="Not provided" /></Field>
        </div>}
      </div>

      <div className="flex items-center justify-between">
        <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="btn btn-ghost disabled:opacity-50" data-testid="onboarding-back">Back</button>
        {step < STEPS.length - 1 ? <button onClick={() => setStep((s) => s + 1)} className="btn btn-primary" data-testid="onboarding-next">Continue <ChevronRight className="h-4 w-4" /></button> : <button onClick={finish} className="btn btn-primary" data-testid="onboarding-finish">Finish — save profile</button>}
      </div>

      <style>{`.input { width: 100%; padding: 0.625rem 1rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; outline: none; }`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>{children}</label>;
}

function Chip({ active, onClick, children }) {
  return <button type="button" onClick={onClick} className={`text-left p-3 rounded-xl border-2 transition ${active ? "border-clay-500 bg-clay-50" : "border-border hover:border-clay-300"}`}><div className="flex items-center justify-between"><div className="font-semibold">{children}</div>{active && <CheckCircle2 className="h-4 w-4 text-sage-600" />}</div></button>;
}
