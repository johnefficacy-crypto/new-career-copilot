import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BellRing,
  BookOpen,
  Layers,
  LineChart,
  NotebookPen,
  RotateCw,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { api } from "../../lib/api";
import DisabledCard from "../../shared/components/DisabledCard";

// PR10: Learning hub renders a card grid over direct routes that
// already exist. Direct routes (`/app/notes`, `/app/study/mocks`, etc.)
// are NOT removed — this page is an additional discovery surface.

const LIVE_CARDS = [
  {
    key: "notes",
    title: "Notes",
    description: "Write and review your notebook entries.",
    to: "/app/notes",
    icon: NotebookPen,
  },
  {
    key: "flashcards",
    title: "Flashcards",
    description: "Review your spaced-repetition decks.",
    to: "/app/flashcards",
    icon: Layers,
  },
  {
    key: "revision",
    title: "Revision",
    description: "Loop back over weak topics on the schedule.",
    to: "/app/study/revision",
    icon: RotateCw,
  },
  {
    key: "mocks",
    title: "Mocks",
    description: "Log mocks and review error patterns.",
    to: "/app/study/mocks",
    icon: Trophy,
  },
  {
    key: "mistakes",
    title: "Mistakes",
    description: "Patterns the engine has spotted from mock reviews.",
    to: "/app/study/mistakes",
    icon: XCircle,
  },
  {
    key: "subjects",
    title: "Subjects",
    description: "Subject tree with mastery + topic priority.",
    to: "/app/study/subjects",
    icon: LineChart,
  },
];

function HubCard({ to, title, description, icon: Icon, testId }) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="rounded-2xl border border-border bg-white/70 p-5 hover:border-clay-300 hover:bg-white transition flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className="h-9 w-9 grid place-items-center rounded-lg bg-clay-100 text-clay-700 shrink-0"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="font-heading text-base font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-1">{description}</div>
      </div>
    </Link>
  );
}

// Exam Intelligence card resolves its destination from the user's
// tracked-exams list. With a primary slug present, link to that exam's
// detail page with the #intelligence anchor; without one, send the
// user to the catalogue so they can choose. Card is always clickable —
// never a dead label.
function useExamIntelligenceTarget() {
  const [state, setState] = useState({ slug: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/study/tracked-exams")
      .then((d) => {
        if (cancelled) return;
        const items = Array.isArray(d?.items) ? d.items : [];
        // Prefer the primary; fall back to the first tracked item.
        const primary =
          items.find((row) => row.is_primary) || items[0] || null;
        setState({ slug: primary?.slug || null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ slug: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function ExamIntelligenceCard() {
  const { slug, loading } = useExamIntelligenceTarget();
  const to = slug ? `/app/eligibility/exams/${slug}#intelligence` : "/app/eligibility/exams";
  const description = slug
    ? "What we know about the exam itself — pattern, weights, history."
    : "Choose an exam to view intelligence";
  return (
    <Link
      to={to}
      data-testid="learning-card-exam-intelligence"
      aria-busy={loading || undefined}
      className="rounded-2xl border border-border bg-white/70 p-5 hover:border-clay-300 hover:bg-white transition flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className="h-9 w-9 grid place-items-center rounded-lg bg-clay-100 text-clay-700 shrink-0"
      >
        <BookOpen className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="font-heading text-base font-semibold flex items-center gap-2">
          Exam intelligence
          {!slug && !loading ? (
            <Sparkles className="h-3.5 w-3.5 text-clay-500" aria-hidden="true" />
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{description}</div>
      </div>
    </Link>
  );
}

export default function StudyLearningHub() {
  return (
    <section data-testid="study-learning-page" aria-labelledby="study-learning-heading">
      <header className="mb-4">
        <h2 id="study-learning-heading" className="font-heading text-2xl font-semibold">
          Learning hub
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Notes, flashcards, mocks, and the rest of your study surfaces in one
          place.
        </p>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {LIVE_CARDS.map((c) => (
          <HubCard
            key={c.key}
            to={c.to}
            title={c.title}
            description={c.description}
            icon={c.icon}
            testId={`learning-card-${c.key}`}
          />
        ))}
        <ExamIntelligenceCard />
        <DisabledCard
          title="Reminders"
          subtitle="Coming soon"
          icon={BellRing}
        />
      </div>
    </section>
  );
}
