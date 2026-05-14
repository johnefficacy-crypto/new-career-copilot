import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useUnifiedOnboardingSession } from "./useUnifiedOnboardingSession";
import OnboardingQuestionCard from "./OnboardingQuestionCard";
import ReadinessMeter from "./ReadinessMeter";

// The single shell both entry modes render into:
//   * cold/discovery — homepage, intent unknown, opens with the intent picker
//   * cta            — /go funnel, intent known, verified recruitment questions
//
// Same session engine, same answer flow, same progress UI, same anonymous
// persistence. Mode only changes the intro copy and the CTA fallback.

const NEXT_ACTION_ROUTES = {
  view_eligibility: "/app",
  open_study_plan: "/app/study-plan",
  open_tracker: "/app/tracker",
  open_community: "/app/community",
  open_dashboard: "/app",
};

const NEXT_ACTION_LABELS = {
  view_eligibility: "See your eligibility view",
  open_study_plan: "Open your study plan",
  open_tracker: "Open your tracker",
  open_community: "Find a study group",
  open_dashboard: "Go to your dashboard",
};

function Intro({ data }) {
  const isCta = data?.entry_mode === "cta";
  if (isCta) {
    const recruitment = data?.recruitment;
    const post = data?.post;
    return (
      <header>
        <span className="pill pill-clay text-[11px]">Guided eligibility check</span>
        <h1 className="font-heading font-bold text-2xl sm:text-3xl text-clay-900 mt-3">
          {post?.name
            ? `Let's check your fit for ${post.name}`
            : recruitment?.title
              ? `Let's check your fit for ${recruitment.title}`
              : "Let's check your eligibility"}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          A few quick questions — tap to answer, skip anything. The deterministic
          eligibility engine decides the verdict, not a chatbot.
        </p>
      </header>
    );
  }
  return (
    <header>
      <span className="pill pill-sage text-[11px]">Guided onboarding</span>
      <h1 className="font-heading font-bold text-2xl sm:text-3xl text-clay-900 mt-3">
        Let&apos;s find your best starting point.
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        Answer up to 7 quick questions. You can skip anything.
      </p>
    </header>
  );
}

function FallbackNotice({ data }) {
  if (!data?.fallback || !data?.message) return null;
  return (
    <div
      data-testid="onboarding-fallback"
      className="soft-card rounded-2xl p-4 flex items-start gap-2.5 border border-amber-200"
    >
      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-sm text-clay-800">{data.message}</p>
    </div>
  );
}

function LoginCta({ from }) {
  return (
    <div
      data-testid="onboarding-login-cta"
      className="soft-card rounded-2xl p-4 border border-clay-200"
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-clay-500 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-clay-900">
            Save your answers and sign in to continue.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            You won&apos;t need to repeat these details again — we&apos;ll pick
            up exactly where you left off.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              to="/signup"
              state={{ from: { pathname: from } }}
              className="btn btn-primary"
              data-testid="onboarding-login-link"
            >
              Save &amp; create account
            </Link>
            <Link
              to="/login"
              state={{ from: { pathname: from } }}
              className="btn btn-ghost"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompletionScreen({ data, isAuthed, onComplete }) {
  const [result, setResult] = useState(null);
  const [completing, setCompleting] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const out = await onComplete();
      if (active) {
        setResult(out);
        setCompleting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [onComplete]);

  const nextAction = result?.next_action || "open_dashboard";
  const route = NEXT_ACTION_ROUTES[nextAction] || "/app";
  const label = NEXT_ACTION_LABELS[nextAction] || "Continue";

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
        {isAuthed
          ? "Your answers are saved to your profile."
          : "Your progress is saved on this device — sign in to keep it for good."}
      </p>
      <ReadinessMeterWrapper readiness={data?.readiness} />
      <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
        {isAuthed ? (
          <Link to={route} className="btn btn-primary justify-center" data-testid="onboarding-next-action">
            {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
            {!completing && <ArrowRight className="h-4 w-4" />}
          </Link>
        ) : (
          <Link to="/signup" className="btn btn-primary justify-center" data-testid="onboarding-next-action">
            Create your account <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

function ReadinessMeterWrapper({ readiness }) {
  if (!readiness) return null;
  return (
    <div className="mt-4 text-left">
      <ReadinessMeter readiness={readiness} />
    </div>
  );
}

export default function UnifiedOnboardingShell({
  mode,
  intent,
  recruitmentSlug,
  postSlug,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useUnifiedOnboardingSession({
    mode,
    intent,
    recruitmentSlug,
    postSlug,
  });
  const { status, data, error, saving, answer, skip, isAuthed } = session;

  const fromPath = `${location.pathname}${location.search}`;

  function handleSaveForLater() {
    // Progress is already persisted server-side via the anonymous_id, so
    // "save for later" is just a graceful exit.
    navigate(isAuthed ? "/app" : "/");
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="ml-2 text-sm">Setting up your session…</span>
      </div>
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
          onClick={session.resolve}
          className="btn btn-primary mt-3 justify-center mx-auto"
        >
          Try again
        </button>
      </div>
    );
  }

  const answeredCount = data?.progress?.answered || 0;
  const showLoginCta = !isAuthed && !data?.complete && answeredCount >= 2;

  return (
    <div className="space-y-4">
      <Intro data={data} />
      <FallbackNotice data={data} />

      {data?.complete ? (
        <CompletionScreen
          data={data}
          isAuthed={isAuthed}
          onComplete={session.complete}
        />
      ) : data?.question ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${data.question_source}:${data.question.question_key}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <OnboardingQuestionCard
              question={data.question}
              questionSource={data.question_source}
              reason={data.reason}
              progress={data.progress}
              saving={saving}
              onAnswer={answer}
              onSkip={skip}
              onSaveForLater={handleSaveForLater}
            />
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
          Nothing to ask right now — you&apos;re all caught up.
        </div>
      )}

      {showLoginCta && <LoginCta from={fromPath} />}

      {!data?.complete && data?.readiness && (
        <ReadinessMeter readiness={data.readiness} />
      )}

      {error && (
        <p className="text-xs text-amber-700">
          That didn&apos;t save — please try again.
        </p>
      )}
    </div>
  );
}
