import React, { useCallback, useEffect, useState,} from "react";
import { Loader2, Save } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";
import useProfileData from "../features/profile/hooks/useProfileData";
import IdentitySection from "../features/profile/components/IdentitySection";
import ReservationSection from "../features/profile/components/ReservationSection";
import EducationSection from "../features/profile/components/EducationSection";
import PreferenceSection from "../features/profile/components/PreferenceSection";
import StudyRhythmSection from "../features/profile/components/StudyRhythmSection";
import ApplicationReadinessSection from "../features/profile/components/ApplicationReadinessSection";
import CertificationsSection from "../features/profile/components/CertificationsSection";
import ExperienceSection from "../features/profile/components/ExperienceSection";
import ExamAttemptsSection from "../features/profile/components/ExamAttemptsSection";
import CompletionSidebar from "../features/profile/components/CompletionSidebar";
import { profileSchema, toProfilePayload } from "../features/profile/profileSchema";
import { ErrorState, LoadingSkeleton } from "../shared/ui";

export default function Profile() {
  const auth = useAuth();
  const [msg, setMsg] = useState(null);
  const state = useProfileData();
  const methods = useForm({ resolver: zodResolver(profileSchema), defaultValues: {} });

  useEffect(() => {    
    methods.reset(state.form || {});
  }, [state.form]);

  async function onSubmit(values) {
    setMsg(null);
    try {
      const body = toProfilePayload(values);
      delete body.email;
      const u = await api.put("/api/profile/me", body);
      const c = await api.get("/api/profile/completion");
      auth.setUser(u);
      state.setCompletion(c || {});
      methods.reset(values);
      setMsg("Profile saved");
    } catch (err) { setMsg(err.message); }
  }

  if (state.loading) return <LoadingSkeleton variant="form" className="max-w-4xl" data-testid="profile-loading" />;
  if (state.error) return <ErrorState title="Unable to load profile" message={state.error.message || "Please try again."} onRetry={state.reload} />;

  const dirty = methods.formState.isDirty;

  return (
    <FormProvider {...methods}>
      <div className="space-y-6" data-testid="profile-page">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Progressive profile</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Keep your eligibility sharp.</h1>
          <p className="text-muted-foreground mt-1">We only use the fields you provide. Empty fields are treated as not provided.</p>
          {dirty && <p className="text-xs text-amber-700 mt-1">You have unsaved changes.</p>}
        </div>

        <form onSubmit={methods.handleSubmit(onSubmit)} className="grid lg:grid-cols-3 gap-5" data-testid="profile-form">
          <div className="lg:col-span-2 soft-card rounded-2xl p-6 space-y-7">
            <IdentitySection />
            <ReservationSection />
            <EducationSection />
            <PreferenceSection />
            <StudyRhythmSection />
            <ApplicationReadinessSection />
            <CertificationsSection certRegistry={state.certRegistry} newCert={state.newCert} setNewCert={state.setNewCert} certs={state.certs} setCerts={state.setCerts} />
            <ExperienceSection newExp={state.newExp} setNewExp={state.setNewExp} expRows={state.expRows} setExpRows={state.setExpRows} />
            <ExamAttemptsSection newAttempt={state.newAttempt} setNewAttempt={state.setNewAttempt} attemptRows={state.attemptRows} setAttemptRows={state.setAttemptRows} />

            <div className="flex items-center gap-3 pt-2"><button disabled={!dirty || methods.formState.isSubmitting} className="btn btn-primary" data-testid="profile-save">{methods.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile</button>{msg && <span className="text-sm text-muted-foreground">{msg}</span>}</div>
          </div>

          <CompletionSidebar completion={state.completion} />
        </form>
      </div>
    </FormProvider>
  );
}
