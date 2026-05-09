import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";
import OnboardingProgress from "../features/onboarding/components/OnboardingProgress";
import IdentityStep from "../features/onboarding/components/IdentityStep";
import EducationStep from "../features/onboarding/components/EducationStep";
import PreferencesStep from "../features/onboarding/components/PreferencesStep";
import StudyStep from "../features/onboarding/components/StudyStep";
import { validateStep } from "../features/onboarding/onboardingValidation";

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
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    name: auth.user?.name || "", date_of_birth: "", gender: "", category: "", pwbd_status: "", state: "", education_level: "", qualification: "", stream: "", qualification_year: "", marks_type: "percentage", percentage: "", cgpa: "", goal_exams: [], preferred_sectors: [], preferred_states: [], willing_to_relocate: true, study_mode: "", weekly_hours_goal: "", target_exam_year: "",
  });

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleArray(k, value, cap = 4) { setForm((f) => ({ ...f, [k]: f[k].includes(value) ? f[k].filter((x) => x !== value) : (f[k].length >= cap ? f[k] : [...f[k], value]) })); }

  async function saveProfile({ onboarded }) {
    const body = { name: form.name || undefined, date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined, category: form.category || undefined, pwbd_status: form.pwbd_status || undefined, state: form.state || undefined, qualification: form.qualification || undefined, education_level: form.education_level || undefined, stream: form.stream || undefined, qualification_year: form.qualification_year ? Number(form.qualification_year) : undefined, percentage: form.marks_type === "percentage" && form.percentage ? Number(form.percentage) : undefined, cgpa: form.marks_type === "cgpa" && form.cgpa ? Number(form.cgpa) : undefined, goal_exams: form.goal_exams, preferred_states: form.preferred_states, preferred_sectors: form.preferred_sectors, willing_to_relocate: form.willing_to_relocate, study_mode: form.study_mode || undefined, weekly_hours_goal: form.weekly_hours_goal ? Number(form.weekly_hours_goal) : undefined, target_exam_year: form.target_exam_year ? Number(form.target_exam_year) : undefined, ...(onboarded ? { onboarded: true } : {}) };
    const u = await api.put("/api/profile/me", body);
    auth.setUser(u);
    nav("/app");
  }

  async function onSkip() { await saveProfile({ onboarded: false }); }

  function onNext() {
    const result = validateStep(STEPS[step].id, form);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors({});
    setStep((s) => s + 1);
  }

  async function onFinish() {
    const result = validateStep(STEPS[step].id, form);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors({});
    await saveProfile({ onboarded: true });
  }

  const current = STEPS[step];

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="onboarding-page">
      <div className="flex items-center justify-between">
        <OnboardingProgress step={step} total={STEPS.length} />
        <button onClick={onSkip} className="text-xs text-muted-foreground link-under" data-testid="onboarding-skip">Skip for now</button>
      </div>

      <h1 className="font-heading text-4xl font-semibold tracking-tight">{current.title}</h1>
      <p className="text-muted-foreground -mt-2">{current.subtitle}</p>

      <div className="soft-card rounded-2xl p-6">
        {step === 0 && <IdentityStep form={form} set={set} errors={errors} />}
        {step === 1 && <EducationStep form={form} set={set} errors={errors} />}
        {step === 2 && <PreferencesStep form={form} set={set} toggleArray={toggleArray} errors={errors} />}
        {step === 3 && <StudyStep form={form} set={set} errors={errors} />}
      </div>

      <div className="flex items-center justify-between">
        <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="btn btn-ghost disabled:opacity-50" data-testid="onboarding-back">Back</button>
        {step < STEPS.length - 1 ? <button onClick={onNext} className="btn btn-primary" data-testid="onboarding-next">Continue <ChevronRight className="h-4 w-4" /></button> : <button onClick={onFinish} className="btn btn-primary" data-testid="onboarding-finish">Finish — save profile</button>}
      </div>
    </div>
  );
}
