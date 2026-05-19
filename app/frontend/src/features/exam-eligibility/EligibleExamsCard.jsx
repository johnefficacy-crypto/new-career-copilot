import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronDown, GraduationCap } from "lucide-react";
import { api } from "../../lib/api";
import { Eyebrow, Pill, StudyCard } from "../../shared/ui/studyos";

/* Honesty rules baked in (per the product brief):
 * - Never invent counts. A "0 / 0" response renders the explicit empty state
 *   asking for the minimum profile fields. We do not show a celebratory
 *   number unless backend reports real ``eligible.length > 0``.
 * - Conditional rows never claim "eligible" — they are explicitly labelled
 *   "Likely eligible · complete profile to confirm" and rendered in a
 *   distinct amber tone so the user can't misread them.
 * - Errors surface honestly. We never coerce a fetch failure into a zero.
 * - Celebratory motion (the sparkle on the eligible count) only fires when
 *   ``eligible.length > 0``.
 */

const FIELD_LABELS = {
  date_of_birth: "date of birth",
  education_level: "highest qualification",
  nationality: "nationality",
  gender: "gender",
  category: "reservation category",
};

function humanField(key) {
  return FIELD_LABELS[key] || key.replace(/_/g, " ");
}

function humanFieldList(fields) {
  if (!fields || fields.length === 0) return "";
  const labels = fields.map(humanField);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function ExamRow({ item, tone, expanded, onToggle }) {
  const isConditional = tone === "conditional";
  const pillTone = isConditional ? "amber" : "sage";
  return (
    <li
      data-testid={`exam-row-${item.slug}`}
      data-tone={tone}
      className="rounded-xl border border-[#E7DECB] bg-white/65 overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/85 transition-colors"
      >
        <GraduationCap
          className={`h-4 w-4 ${isConditional ? "text-amber-700" : "text-sage-700"}`}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="font-heading text-[15px] text-clay-900 truncate">{item.name}</div>
          {isConditional && item.missing_fields?.length ? (
            <div className="text-[11.5px] text-amber-800 mt-0.5">
              Add your {humanFieldList(item.missing_fields)} to confirm.
            </div>
          ) : (
            !isConditional && (
              <div className="text-[11.5px] text-clay-700 mt-0.5">
                Baseline rules pass on your current profile.
              </div>
            )
          )}
        </div>
        <Pill tone={pillTone}>{isConditional ? "Likely" : "Eligible"}</Pill>
        <ChevronDown
          className={`h-3.5 w-3.5 text-clay-700 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="border-t border-[#E7DECB] bg-[#FBF6EF]"
          >
            <div className="px-4 py-3 text-[12.5px] text-clay-800 space-y-2">
              {isConditional ? (
                <>
                  <div>
                    <span className="num-mono uppercase text-[9.5px] tracking-[0.18em] text-amber-800">
                      Needs
                    </span>{" "}
                    <span>{humanFieldList(item.missing_fields)}</span>
                  </div>
                  <Link
                    to="/app/profile"
                    className="link-under text-[12px] text-clay-900 font-semibold"
                  >
                    Complete profile →
                  </Link>
                </>
              ) : (
                <>
                  <div>
                    All baseline rules (age, education, nationality) pass against your saved
                    profile. Recruitment-level checks may still apply per cycle.
                  </div>
                  <Link
                    to={`/app/eligibility/exams/${item.slug}`}
                    className="link-under text-[12px] text-clay-900 font-semibold"
                  >
                    Open exam details →
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function CountTile({ label, value, tone, animated, testId }) {
  const toneCls =
    tone === "sage"
      ? "border-[#B9CFAF] bg-[#F0F5EF] text-[#33482F]"
      : "border-[#E2C68F] bg-[#FBF4E4] text-[#7A5C1C]";
  return (
    <div
      data-testid={testId}
      className={`rounded-xl border ${toneCls} px-4 py-3 flex-1 min-w-[120px]`}
    >
      <Eyebrow>{label}</Eyebrow>
      <motion.div
        key={value}
        initial={animated ? { scale: 0.85, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="font-heading text-[34px] leading-none mt-1.5 num-mono"
      >
        {value}
      </motion.div>
    </div>
  );
}

function CardShell({ variant, children, footer }) {
  if (variant === "panel") {
    return (
      <section
        data-testid="eligible-exams-panel"
        className="soft-card grain rounded-3xl p-6 relative overflow-hidden"
      >
        {children}
        {footer}
      </section>
    );
  }
  return (
    <StudyCard padded={false} data-testid="eligible-exams-card">
      <div className="px-7 py-6">{children}</div>
      {footer}
    </StudyCard>
  );
}

function LoadingState({ variant }) {
  return (
    <CardShell variant={variant}>
      <Eyebrow>Exam eligibility</Eyebrow>
      <div className="flex items-end gap-3 mt-2" aria-hidden="true">
        <div className="h-7 w-32 rounded-md bg-clay-100 animate-pulse" />
        <div className="h-4 w-20 rounded-md bg-clay-100/70 animate-pulse" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-9 rounded-xl bg-clay-100/70 animate-pulse" />
        <div className="h-9 rounded-xl bg-clay-100/70 animate-pulse" />
      </div>
    </CardShell>
  );
}

function ErrorStateView({ variant, onRetry }) {
  return (
    <CardShell variant={variant}>
      <Eyebrow>Exam eligibility</Eyebrow>
      <p className="text-sm text-clay-800 mt-2">
        We couldn't load your exam eligibility. Nothing has changed — try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="eligible-exams-retry"
        className="btn btn-ghost mt-3 text-sm"
      >
        Retry
      </button>
    </CardShell>
  );
}

function EmptyStateView({ variant, eligibleEmpty, conditionalEmpty, hasRules }) {
  // If there are no rules in the system at all, that's an admin-side gap,
  // not a user gap — say so plainly rather than asking them to fix their
  // profile.
  if (!hasRules) {
    return (
      <CardShell variant={variant}>
        <Eyebrow>Exam eligibility</Eyebrow>
        <p className="text-sm text-clay-800 mt-2">
          We haven't published baseline eligibility rules yet. Check back soon — this is on us.
        </p>
      </CardShell>
    );
  }
  return (
    <CardShell variant={variant}>
      <Eyebrow>Exam eligibility</Eyebrow>
      <h2 className="font-heading text-[20px] mt-1.5 text-clay-900">
        A few details and we'll show your eligible exams.
      </h2>
      <p className="text-[13px] text-clay-700 mt-1.5">
        We don't guess. Add your date of birth and highest qualification — we'll
        compute the baseline against the official rules, never invent it.
      </p>
      <Link
        to="/app/profile"
        data-testid="eligible-exams-empty-cta"
        className="btn btn-primary mt-4 inline-flex items-center gap-2"
      >
        Complete profile <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </CardShell>
  );
}

export default function EligibleExamsCard({ variant = "card", initialData } = {}) {
  const hasInitial = initialData !== undefined && initialData !== null;
  const [data, setData] = useState(hasInitial ? initialData : null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    // When the parent (Today.jsx) hydrates from mission-control, skip
    // the redundant /api/exams/eligibility-summary fetch entirely. The
    // user-explicit Retry button still triggers a fetch by clearing
    // initialData and bumping reloadKey.
    if (hasInitial && reloadKey === 0) return undefined;
    let cancelled = false;
    setError(false);
    setData(null);
    api
      .get("/api/exams/eligibility-summary")
      .then((d) => {
        if (cancelled) return;
        // Treat an explicit ``error`` flag from the backend the same as a
        // network failure — never coerce it into a zero count.
        if (d?.error) {
          setError(true);
          return;
        }
        setData(d || null);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (error) {
    return <ErrorStateView variant={variant} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (!data) return <LoadingState variant={variant} />;

  const eligible = Array.isArray(data.eligible) ? data.eligible : [];
  const conditional = Array.isArray(data.conditional) ? data.conditional : [];
  const hasRules = Number(data.rule_count || 0) > 0;

  if (eligible.length === 0 && conditional.length === 0) {
    return (
      <EmptyStateView
        variant={variant}
        eligibleEmpty
        conditionalEmpty
        hasRules={hasRules}
      />
    );
  }

  const tiles = [];
  if (eligible.length > 0) {
    tiles.push({
      key: "eligible",
      label: "Confirmed eligible",
      value: eligible.length,
      tone: "sage",
      animated: true,
    });
  }
  if (conditional.length > 0) {
    tiles.push({
      key: "conditional",
      label: "Likely eligible",
      value: conditional.length,
      tone: "amber",
      animated: false,
    });
  }

  const rows = [
    ...eligible.map((item) => ({ item, tone: "eligible" })),
    ...conditional.map((item) => ({ item, tone: "conditional" })),
  ];

  function toggleRow(key) {
    setExpandedId((cur) => (cur === key ? null : key));
  }

  return (
    <CardShell
      variant={variant}
      footer={
        <div className="px-7 pb-5 -mt-1 flex items-center justify-between text-[11.5px] text-clay-700">
          <span>
            Baseline rules only — recruitment-level checks may still apply per cycle.
          </span>
          <Link
            to="/app/eligibility/exams"
            className="link-under text-[12px] text-clay-900 font-semibold"
            data-testid="eligible-exams-view-all"
          >
            Open exams →
          </Link>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Eyebrow>Exam eligibility</Eyebrow>
          <h2 className="font-heading text-[22px] mt-1 text-clay-900 leading-tight">
            {eligible.length > 0
              ? "Exams open to you today."
              : "We're close — these need a couple more details."}
          </h2>
          <p className="text-[12.5px] text-clay-700 mt-1.5 max-w-[60ch]">
            Computed from each exam's published baseline against your saved profile.
            Recruitment-level eligibility (per vacancy) is computed separately.
          </p>
        </div>
        {eligible.length > 0 && (
          <CheckCircle2
            className="h-5 w-5 text-sage-600 shrink-0 mt-1"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="mt-4 flex gap-3 flex-wrap">
        {tiles.map((t) => (
          <CountTile
            key={t.key}
            label={t.label}
            value={t.value}
            tone={t.tone}
            animated={t.animated}
            testId={`tile-${t.key}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2" data-testid="eligible-exams-rows">
        {rows.map(({ item, tone }, idx) => (
          <motion.div
            key={`${tone}:${item.exam_id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: idx * 0.04, ease: "easeOut" }}
          >
            <ExamRow
              item={item}
              tone={tone}
              expanded={expandedId === item.exam_id}
              onToggle={() => toggleRow(item.exam_id)}
            />
          </motion.div>
        ))}
      </ul>
    </CardShell>
  );
}
