import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";
import OnboardingProgress from "../features/onboarding/components/OnboardingProgress";
import IdentityStep from "../features/onboarding/components/IdentityStep";
import EducationStep from "../features/onboarding/components/EducationStep";
import PreferencesStep from "../features/onboarding/components/PreferencesStep";
import StudyStep from "../features/onboarding/components/StudyStep";
import { onboardingSchema, toOnboardingPayload } from "../features/onboarding/onboardingSchema";

const STEPS = [
  { id: "identity", title: "Identity minimum", subtitle: "These fields power your base eligibility profile.", fields: ["name", "date_of_birth", "gender", "category", "state"] },
  { id: "education", title: "Education minimum", subtitle: "Qualification decides post-level eligibility.", fields: ["education_level", "qualification", "qualification_year", "marks_type", "percentage", "cgpa"] },
  { id: "preferences", title: "Preferences", subtitle: "Tell us where and what you want to target.", fields: ["goal_exams", "preferred_sectors", "preferred_states", "willing_to_relocate"] },
  { id: "study", title: "Study rhythm", subtitle: "We'll adapt recommendations to your weekly capacity.", fields: ["study_mode", "weekly_hours_goal", "target_exam_year"] },
];

export default function Onboarding() {
  const auth = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [attemptedSteps, setAttemptedSteps] = useState({});

  const methods = useForm({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: auth.user?.name || "", date_of_birth: "", gender: "", category: "", pwbd_status: "", state: "", education_level: "", qualification: "", stream: "", qualification_year: "", marks_type: "percentage", percentage: "", cgpa: "", goal_exams: [], preferred_sectors: [], preferred_states: [], willing_to_relocate: true, study_mode: "", weekly_hours_goal: "", target_exam_year: "",
    },
    mode: "onTouched",
  });

  const { trigger, getValues, setValue, formState, handleSubmit } = methods;
  const current = STEPS[step];
  const showErrors = attemptedSteps[current.id] || formState.touchedFields;

  const toggleArray = (k, value, cap = 4) => {
    const existing = getValues(k) || [];
    const next = existing.includes(value) ? existing.filter((x) => x !== value) : (existing.length >= cap ? existing : [...existing, value]);
    setValue(k, next, { shouldDirty: true, shouldTouch: true, shouldValidate: attemptedSteps[current.id] });
  };

  async function saveProfile({ onboarded }) {
    const payload = toOnboardingPayload(getValues());
    const body = { ...payload, ...(onboarded ? { onboarded: true } : {}) };
    const u = await api.put("/api/profile/me", body);
    auth.setUser(u);
    nav("/app");
  }

  async function onSkip() { await saveProfile({ onboarded: false }); }

  async function onNext() {
    setAttemptedSteps((s) => ({ ...s, [current.id]: true }));
    const ok = await trigger(current.fields);
    if (!ok) return;
    setStep((s) => s + 1);
  }

  const onFinish = handleSubmit(async () => {
    setSaveError("");
    await saveProfile({ onboarded: true });
  }, () => {
    setAttemptedSteps((s) => ({ ...s, [current.id]: true }));
  });

  return (
    <FormProvider {...methods}>
      <div className="max-w-3xl mx-auto space-y-6" data-testid="onboarding-page">
        <div className="flex items-center justify-between">
          <OnboardingProgress step={step} total={STEPS.length} />
          <button onClick={onSkip} className="text-xs text-muted-foreground link-under" data-testid="onboarding-skip">Skip for now</button>
        </div>

        <h1 className="font-heading text-4xl font-semibold tracking-tight">{current.title}</h1>
        <p className="text-muted-foreground -mt-2">{current.subtitle}</p>

        <div className="soft-card rounded-2xl p-6">
          {step === 0 && <IdentityStep showErrors={showErrors} />}
          {step === 1 && <EducationStep showErrors={showErrors} />}
          {step === 2 && <PreferencesStep toggleArray={toggleArray} showErrors={showErrors} />}
          {step === 3 && <StudyStep showErrors={showErrors} />}
          {saveError && <p className="text-xs text-destructive mt-2">{saveError}</p>}
        </div>

        <div className="flex items-center justify-between">
          <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="btn btn-ghost disabled:opacity-50" data-testid="onboarding-back">Back</button>
          {step < STEPS.length - 1 ? <button onClick={onNext} className="btn btn-primary" data-testid="onboarding-next">Continue <ChevronRight className="h-4 w-4" /></button> : <button onClick={onFinish} disabled={formState.isSubmitting} className="btn btn-primary" data-testid="onboarding-finish">Finish — save profile</button>}
        </div>
      </div>
    </FormProvider>
  );
}
