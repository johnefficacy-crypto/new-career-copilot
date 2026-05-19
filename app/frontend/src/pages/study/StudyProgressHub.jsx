import React from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarDays, FileBarChart, FileText } from "lucide-react";

// PR10: Progress hub. 4 live cards over existing routes.

const CARDS = [
  {
    key: "report-card",
    title: "Report card",
    description: "Adherence, completion, focus — auditable evidence.",
    to: "/app/study/review",
    icon: FileText,
  },
  {
    key: "compare-effort",
    title: "Compare effort",
    description: "Your effort vs your peers, on the same exam.",
    to: "/app/study/compare",
    icon: Activity,
  },
  {
    key: "reports",
    title: "Reports / export",
    description: "Download or share raw study data.",
    to: "/app/reports",
    icon: FileBarChart,
  },
  {
    key: "monthly-review",
    title: "Monthly review",
    description: "Same scorecard, monthly window.",
    to: "/app/study/review?period=monthly",
    icon: CalendarDays,
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

export default function StudyProgressHub() {
  return (
    <section data-testid="study-progress-page" aria-labelledby="study-progress-heading">
      <header className="mb-4">
        <h2 id="study-progress-heading" className="font-heading text-2xl font-semibold">
          Progress hub
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Report card, effort comparison, monthly review, and full data export.
        </p>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {CARDS.map((c) => (
          <HubCard
            key={c.key}
            to={c.to}
            title={c.title}
            description={c.description}
            icon={c.icon}
            testId={`progress-card-${c.key}`}
          />
        ))}
      </div>
    </section>
  );
}
