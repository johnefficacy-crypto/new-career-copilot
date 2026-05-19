import React, { useEffect, useMemo, useState } from "react";
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
import PersonaSummaryCard from "../features/profile/components/PersonaSummaryCard";
import { profileSchema, toProfilePayload } from "../features/profile/profileSchema";
import { ErrorState, LoadingSkeleton } from "../shared/ui";

const FIELD_TO_SECTION = {
  name: "identity",
  phone: "identity",
  gender: "identity",
  date_of_birth: "identity",
  email: "identity",
  category: "reservation",
  pwbd_status: "reservation",
  state: "reservation",
  domicile_state: "reservation",
  nationality: "reservation",
  ex_serviceman: "reservation",
  govt_employee: "reservation",
  service_years: "reservation",
  qualification: "education",
  education_level: "education",
  stream: "education",
  qualification_year: "education",
  percentage: "education",
  cgpa: "education",
  goal_exams: "preference",
  preferred_states: "preference",
  preferred_sectors: "preference",
  willing_to_relocate: "preference",
  study_mode: "study-rhythm",
  weekly_hours_goal: "study-rhythm",
  target_exam_year: "study-rhythm",
};

const ELIGIBILITY_PROFILES = ["identity_profile", "education_profile"];
const PROFILE_BUCKETS = [
  "identity_profile",
  "education_profile",
  "preferences_profile",
  "study_profile",
  "application_profile",
];

function deriveCompletion(completion) {
  if (!completion) return { overallPct: 0, eligibilityMissing: [] };
  const pcts = PROFILE_BUCKETS.map((k) => completion[k]?.completion_pct).filter(
    (v) => typeof v === "number",
  );
  const overallPct = pcts.length
    ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length)
    : 0;
  const eligibilityMissing = ELIGIBILITY_PROFILES.flatMap(
    (k) => completion[k]?.missing_fields || [],
  );
  return { overallPct, eligibilityMissing };
}

function SectionCard({ id, title, summary, defaultOpen, children }) {
  return (
    <details
      id={`profile-section-${id}`}
      data-testid={`profile-section-${id}`}
      open={defaultOpen || undefined}
      className="border border-border rounded-xl bg-white/40"
    >
      <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{summary}</span>
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

export default function Profile() {
  const auth = useAuth();
  const [msg, setMsg] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const state = useProfileData();
  const methods = useForm({ resolver: zodResolver(profileSchema), defaultValues: {} });

  useEffect(() => {
    methods.reset(state.form || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- methods.reset is stable; including methods would re-fire on every render
  }, [state.form]);

  const { overallPct, eligibilityMissing } = useMemo(
    () => deriveCompletion(state.completion),
    [state.completion],
  );
  const firstMissingField = eligibilityMissing[0];
  const firstMissingSection = firstMissingField
    ? FIELD_TO_SECTION[firstMissingField] || "identity"
    : null;
  const isIncomplete = overallPct < 100 || eligibilityMissing.length > 0;
  const showProgressiveDefault = isIncomplete && !showAll;

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

  // Decide expansion per section. Progressive default: only the section
  // containing the first missing eligibility-blocking field is open. Full
  // mode (showAll, or completion === 100% via the existing "Show all
  // fields" toggle) expands every section.
  const sectionOpen = (id) => {
    if (showAll) return true;
    if (!isIncomplete) return false;
    return id === firstMissingSection;
  };

  function fieldCount(profileKey) {
    const d = state.completion?.[profileKey];
    return Array.isArray(d?.missing_fields) ? d.missing_fields.length : 0;
  }

  function scrollToFirstMissing() {
    if (!firstMissingSection) return;
    const el = document.getElementById(`profile-section-${firstMissingSection}`);
    if (el) {
      el.setAttribute("open", "");
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <FormProvider {...methods}>
      <div className="space-y-6" data-testid="profile-page">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Progressive profile</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Keep your eligibility sharp.</h1>
          <p className="text-muted-foreground mt-1">We only use the fields you provide. Empty fields are treated as not provided.</p>
          {dirty && <p className="text-xs text-amber-700 mt-1">You have unsaved changes.</p>}
        </div>

        {showProgressiveDefault && (
          <div
            className="soft-card rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap"
            data-testid="profile-progressive-header"
          >
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Profile setup
              </div>
              <div className="font-heading text-2xl font-semibold mt-1">
                {overallPct}% complete
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {eligibilityMissing.length === 0
                  ? "Eligibility fields all set. A few optional fields remain."
                  : `${eligibilityMissing.length} eligibility-blocking field${eligibilityMissing.length === 1 ? "" : "s"} still missing.`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {firstMissingField && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={scrollToFirstMissing}
                  data-testid="profile-continue-setup"
                >
                  Continue setup
                </button>
              )}
            </div>
          </div>
        )}

        <PersonaSummaryCard />

        <div className="flex items-center justify-end">
          <label className="text-xs text-muted-foreground flex items-center gap-2">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              data-testid="profile-show-all-toggle"
            />
            Show all fields
          </label>
        </div>

        <form onSubmit={methods.handleSubmit(onSubmit)} className="grid lg:grid-cols-3 gap-5" data-testid="profile-form">
          <div className="lg:col-span-2 soft-card rounded-2xl p-6 space-y-4">
            <SectionCard
              id="identity"
              title="Identity"
              summary={fieldCount("identity_profile") ? `${fieldCount("identity_profile")} field${fieldCount("identity_profile") === 1 ? "" : "s"} missing · Edit` : "Edit"}
              defaultOpen={sectionOpen("identity")}
            >
              <IdentitySection />
            </SectionCard>
            <SectionCard
              id="reservation"
              title="Reservation & domicile"
              summary="Edit"
              defaultOpen={sectionOpen("reservation")}
            >
              <ReservationSection />
            </SectionCard>
            <SectionCard
              id="education"
              title="Education"
              summary={fieldCount("education_profile") ? `${fieldCount("education_profile")} field${fieldCount("education_profile") === 1 ? "" : "s"} missing · Edit` : "Edit"}
              defaultOpen={sectionOpen("education")}
            >
              <EducationSection />
            </SectionCard>
            <SectionCard
              id="preference"
              title="Preferences"
              summary={fieldCount("preferences_profile") ? `${fieldCount("preferences_profile")} field${fieldCount("preferences_profile") === 1 ? "" : "s"} missing · Edit` : "Edit"}
              defaultOpen={sectionOpen("preference")}
            >
              <PreferenceSection />
            </SectionCard>
            <SectionCard
              id="study-rhythm"
              title="Study rhythm"
              summary={fieldCount("study_profile") ? `${fieldCount("study_profile")} field${fieldCount("study_profile") === 1 ? "" : "s"} missing · Edit` : "Edit"}
              defaultOpen={sectionOpen("study-rhythm")}
            >
              <StudyRhythmSection />
            </SectionCard>
            <SectionCard
              id="application-readiness"
              title="Application readiness"
              summary={fieldCount("application_profile") ? `${fieldCount("application_profile")} field${fieldCount("application_profile") === 1 ? "" : "s"} missing · Edit` : "Edit"}
              defaultOpen={sectionOpen("application-readiness")}
            >
              <ApplicationReadinessSection />
            </SectionCard>
            <SectionCard
              id="certifications"
              title="Certifications"
              summary="Edit"
              defaultOpen={sectionOpen("certifications")}
            >
              {state.optionalErrors?.certification_metadata && (
                <p className="mb-2 text-xs text-amber-700">Certification catalog is temporarily unavailable.</p>
              )}
              {state.optionalErrors?.certifications && (
                <p className="mb-2 text-xs text-amber-700">Unable to load saved certifications right now.</p>
              )}
              <CertificationsSection certRegistry={state.certRegistry} newCert={state.newCert} setNewCert={state.setNewCert} certs={state.certs} setCerts={state.setCerts} />
            </SectionCard>
            <SectionCard
              id="experience"
              title="Experience"
              summary="Edit"
              defaultOpen={sectionOpen("experience")}
            >
              {state.optionalErrors?.experience && (
                <p className="mb-2 text-xs text-amber-700">Unable to load experience history right now.</p>
              )}
              <ExperienceSection newExp={state.newExp} setNewExp={state.setNewExp} expRows={state.expRows} setExpRows={state.setExpRows} />
            </SectionCard>
            <SectionCard
              id="exam-attempts"
              title="Exam attempts"
              summary="Edit"
              defaultOpen={sectionOpen("exam-attempts")}
            >
              {state.optionalErrors?.exam_attempts && (
                <p className="mb-2 text-xs text-amber-700">Unable to load exam attempts right now.</p>
              )}
              <ExamAttemptsSection newAttempt={state.newAttempt} setNewAttempt={state.setNewAttempt} attemptRows={state.attemptRows} setAttemptRows={state.setAttemptRows} />
            </SectionCard>

            <div className="flex items-center gap-3 pt-2"><button disabled={!dirty || methods.formState.isSubmitting} className="btn btn-primary" data-testid="profile-save">{methods.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile</button>{msg && <span className="text-sm text-muted-foreground">{msg}</span>}</div>
          </div>

          <CompletionSidebar completion={state.completion} />
        </form>
      </div>
    </FormProvider>
  );
}
