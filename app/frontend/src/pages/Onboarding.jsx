import React, { /* useEffect, */ useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

const STEPS = [
  { id: "basics", title: "Who are you?", subtitle: "So we can match recruitments accurately." },
  { id: "education", title: "Your education", subtitle: "Drives qualification-based eligibility." },
  { id: "goals", title: "What are you preparing for?", subtitle: "Pick up to three. Change any time." },
  { id: "rhythm", title: "Your rhythm", subtitle: "We'll build the plan around your weeks." },
];

const EXAMS = [
  "ssc-cgl-2026", "ibps-po-xv", "rbi-grade-b-2026", "upsc-cse-2026",
  "sbi-clerk-2026", "railway-ntpc-2026",
];

export default function Onboarding() {
  const auth = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: auth.user?.name || "",
    date_of_birth: "",
    category: "general",
    state: "",
    qualification: "",
    qualification_year: "",
    percentage: "",
    goal_exams: auth.user?.goal_exams || [],
    weekly_hours_goal: 28,
    target_exam_year: 2026,
  });

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggle(exam) {
    setForm((f) => ({
      ...f,
      goal_exams: f.goal_exams.includes(exam)
        ? f.goal_exams.filter((x) => x !== exam)
        : f.goal_exams.length >= 3
        ? f.goal_exams
        : [...f.goal_exams, exam],
    }));
  }

  async function finish() {
    const body = { ...form, onboarded: true };
    if (body.qualification_year) body.qualification_year = Number(body.qualification_year);
    if (body.percentage) body.percentage = Number(body.percentage);
    if (body.weekly_hours_goal) body.weekly_hours_goal = Number(body.weekly_hours_goal);
    if (body.target_exam_year) body.target_exam_year = Number(body.target_exam_year);
    const u = await api.put("/api/profile/me", body);
    auth.setUser(u);
    nav("/app");
  }

  const current = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="onboarding-page">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Step {step + 1} of {STEPS.length}
        </div>
        <button onClick={finish} className="text-xs text-muted-foreground link-under" data-testid="onboarding-skip">
          Skip for now
        </button>
      </div>
      <div className="h-1 rounded-full bg-clay-100 overflow-hidden">
        <div className="h-full bg-clay-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <h1 className="font-heading text-4xl font-semibold tracking-tight">{current.title}</h1>
      <p className="text-muted-foreground -mt-2">{current.subtitle}</p>

      <div className="soft-card rounded-2xl p-6">
        {step === 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Full name"><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="on-name" /></Field>
            <Field label="Date of birth"><input className="input" placeholder="YYYY-MM-DD" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
            <Field label="Category">
              <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
                {["general", "obc", "sc", "st", "ews"].map((c) => <option key={c}>{c.toUpperCase()}</option>)}
              </select>
            </Field>
            <Field label="State"><input className="input" value={form.state} onChange={(e) => set("state", e.target.value)} /></Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Highest qualification"><input className="input" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} /></Field>
            <Field label="Graduation year"><input className="input" value={form.qualification_year} onChange={(e) => set("qualification_year", e.target.value)} /></Field>
            <Field label="Aggregate %"><input className="input" value={form.percentage} onChange={(e) => set("percentage", e.target.value)} /></Field>
          </div>
        )}
        {step === 2 && (
          <div className="grid md:grid-cols-2 gap-3">
            {EXAMS.map((e) => {
              const active = form.goal_exams.includes(e);
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggle(e)}
                  data-testid={`goal-${e}`}
                  className={`text-left p-4 rounded-xl border-2 transition ${
                    active ? "border-clay-500 bg-clay-50" : "border-border hover:border-clay-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{e.replaceAll("-", " ").toUpperCase()}</div>
                    {active && <CheckCircle2 className="h-4 w-4 text-sage-600" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {step === 3 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Weekly hours goal"><input className="input" type="number" value={form.weekly_hours_goal} onChange={(e) => set("weekly_hours_goal", e.target.value)} /></Field>
            <Field label="Target exam year"><input className="input" type="number" value={form.target_exam_year} onChange={(e) => set("target_exam_year", e.target.value)} /></Field>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="btn btn-ghost disabled:opacity-50"
          data-testid="onboarding-back"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} className="btn btn-primary" data-testid="onboarding-next">
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={finish} className="btn btn-primary" data-testid="onboarding-finish">
            Finish — build my plan
          </button>
        )}
      </div>

      <style>{`.input { width: 100%; padding: 0.625rem 1rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; outline: none; }`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}
