import React, { useCallback, useState } from "react";
import { Loader2, Save } from "lucide-react";
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
import { ErrorState, LoadingSkeleton } from "../shared/ui";

export default function Profile() {
  const auth = useAuth();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const state = useProfileData();

  const set = useCallback((k, v) => state.setForm((f) => ({ ...f, [k]: v })), [state]);
  const toggleArray = useCallback((k, value) => {
    state.setForm((f) => ({ ...f, [k]: (f[k] || []).includes(value) ? f[k].filter((x) => x !== value) : [...(f[k] || []), value] }));
  }, [state]);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const f = state.form;
      const body = { ...f, qualification_year: f.qualification_year ? Number(f.qualification_year) : undefined, percentage: f.percentage ? Number(f.percentage) : undefined, cgpa: f.cgpa ? Number(f.cgpa) : undefined, weekly_hours_goal: f.weekly_hours_goal ? Number(f.weekly_hours_goal) : undefined, target_exam_year: f.target_exam_year ? Number(f.target_exam_year) : undefined, service_years: f.service_years ? Number(f.service_years) : undefined };
      delete body.email;
      const u = await api.put("/api/profile/me", body);
      const c = await api.get("/api/profile/completion");
      auth.setUser(u);
      state.setCompletion(c || {});
      setMsg("Profile saved");
    } catch (err) { setMsg(err.message); } finally { setSaving(false); }
  }

  if (state.loading) return <LoadingSkeleton variant="form" className="max-w-4xl" data-testid="profile-loading" />;
  if (state.error) return <ErrorState title="Unable to load profile" message={state.error.message || "Please try again."} onRetry={state.reload} />;

  return (
    <div className="space-y-6" data-testid="profile-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Progressive profile</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Keep your eligibility sharp.</h1>
        <p className="text-muted-foreground mt-1">We only use the fields you provide. Empty fields are treated as not provided.</p>
      </div>

      <form onSubmit={onSubmit} className="grid lg:grid-cols-3 gap-5" data-testid="profile-form">
        <div className="lg:col-span-2 soft-card rounded-2xl p-6 space-y-7">
          <IdentitySection form={state.form} set={set} />
          <ReservationSection form={state.form} set={set} />
          <EducationSection form={state.form} set={set} />
          <PreferenceSection form={state.form} set={set} toggleArray={toggleArray} />
          <StudyRhythmSection form={state.form} set={set} />
          <ApplicationReadinessSection form={state.form} />
          <CertificationsSection certRegistry={state.certRegistry} newCert={state.newCert} setNewCert={state.setNewCert} certs={state.certs} setCerts={state.setCerts} />
          <ExperienceSection newExp={state.newExp} setNewExp={state.setNewExp} expRows={state.expRows} setExpRows={state.setExpRows} />
          <ExamAttemptsSection newAttempt={state.newAttempt} setNewAttempt={state.setNewAttempt} attemptRows={state.attemptRows} setAttemptRows={state.setAttemptRows} />

          <div className="flex items-center gap-3 pt-2"><button disabled={saving} className="btn btn-primary" data-testid="profile-save">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile</button>{msg && <span className="text-sm text-muted-foreground">{msg}</span>}</div>
        </div>

        <CompletionSidebar completion={state.completion} />
      </form>
    </div>
  );
}
