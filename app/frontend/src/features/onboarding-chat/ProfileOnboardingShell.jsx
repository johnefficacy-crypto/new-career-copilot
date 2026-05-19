import React, { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useProfileOnboarding } from "./useProfileOnboarding";
import OnboardingQuestionCard from "./OnboardingQuestionCard";
import GoogleLinkBanner from "./GoogleLinkBanner";
import StartFreeButton from "../../components/StartFreeButton";
import { trackOnboardingEvent } from "./analytics";

// New onboarding shell, driven by the per-profile state stored on the
// user's row. Anonymous Supabase auth gets the user a JWT from click
// #1, so this shell never has to ferry an anonymous_id around.
//
// Replaces UnifiedOnboardingShell for the cold/discovery path. The
// legacy CTA / funnel path still uses the old shell until item 8.

function Header() {
  return (
    <header>
      <span className="pill pill-sage text-[11px]">Guided onboarding</span>
      <h1 className="font-heading font-bold text-2xl sm:text-3xl text-clay-900 mt-3">
        Let&apos;s find your best starting point.
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        Answer a few quick questions. You can skip anything.
      </p>
    </header>
  );
}

function CompletedCard({ isAnonymous }) {
  return (
    <section
      data-testid="onboarding-complete"
      className="soft-card rounded-3xl p-6 text-center"
    >
      <CheckCircle2 className="h-10 w-10 text-sage-500 mx-auto" aria-hidden="true" />
      <h2 className="font-heading font-bold text-xl text-clay-900 mt-3">
        You&apos;re all set for now.
      </h2>
      <p className="text-sm text-muted-foreground mt-1.5">
        {isAnonymous
          ? "Your answers are saved. Sign in with Google to keep your account safe."
          : "Your answers are saved to your profile."}
      </p>
      <div className="mt-5">
        <Link
          to="/app"
          className="btn btn-primary justify-center inline-flex"
          data-testid="onboarding-next-action"
        >
          Go to your dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export default function ProfileOnboardingShell() {
  const session = useProfileOnboarding();
  const navigate = useNavigate();
  const {
    status,
    question,
    progress,
    completed,
    saving,
    error,
    submit,
    skipAll,
    isAnonymous,
    reload,
  } = session;

  const handleAnswer = useCallback(
    async (value) => {
      if (!question) return;
      trackOnboardingEvent("answer_submitted", {
        question_key: question.question_key,
        value_type: Array.isArray(value) ? "array" : typeof value,
      });
      await submit({
        question_key: question.question_key,
        value,
        skipped: false,
      });
    },
    [question, submit],
  );

  const handleSkip = useCallback(async () => {
    if (!question) return;
    await submit({
      question_key: question.question_key,
      value: null,
      skipped: true,
    });
  }, [question, submit]);

  const handleSaveForLater = useCallback(async () => {
    try {
      await skipAll();
    } finally {
      navigate("/app");
    }
  }, [skipAll, navigate]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="ml-2 text-sm">Setting up your session…</span>
      </div>
    );
  }

  if (status === "needs_auth_start") {
    return (
      <section
        data-testid="onboarding-needs-auth-start"
        className="soft-card rounded-3xl p-6 text-center"
      >
        <p className="text-sm text-clay-800">
          Secure check required before starting your free session.
        </p>
        <div className="mt-4 flex justify-center">
          <StartFreeButton
            testId="onboarding-start-free"
            label="Start onboarding"
            redirectTo="/app/onboarding/chat?mode=discovery"
            className="btn btn-primary justify-center inline-flex disabled:opacity-60"
          />
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <div className="soft-card rounded-2xl p-5 text-center">
        <AlertCircle className="h-6 w-6 text-amber-600 mx-auto" aria-hidden="true" />
        <p className="text-sm text-clay-800 mt-2">
          We couldn&apos;t start your onboarding session.
        </p>
        <button
          type="button"
          onClick={reload}
          className="btn btn-primary mt-3 justify-center mx-auto"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header />
      {isAnonymous && <GoogleLinkBanner />}
      {completed ? (
        <CompletedCard isAnonymous={isAnonymous} />
      ) : question ? (
        <OnboardingQuestionCard
          question={question}
          questionSource="persona_question_bank"
          reason={question.help_text || null}
          progress={progress}
          saving={saving}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
          onSaveForLater={handleSaveForLater}
        />
      ) : (
        <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
          Nothing to ask right now — you&apos;re all caught up.
        </div>
      )}
      {error && (
        <p className="text-xs text-amber-700">
          That didn&apos;t save — please try again.
        </p>
      )}
    </div>
  );
}
