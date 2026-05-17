import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { CheckCircle2, Loader2, ShieldCheck, X, XCircle } from "lucide-react";

import { api } from "../../lib/api";

// State machine for one drill session:
//   idle → loading → playing(n) → revealed(n) → playing(n+1) → … → done
// Errors are a terminal sibling state.
const INITIAL = {
  phase: "idle", // idle | loading | playing | revealed | done | error
  questions: [],
  index: 0,
  pickedByIndex: {},
  meta: null,
  error: "",
};

function reducer(state, action) {
  switch (action.type) {
    case "load":
      return { ...INITIAL, phase: "loading" };
    case "loaded":
      if (!action.questions?.length) {
        return { ...INITIAL, phase: "done", meta: action.meta };
      }
      return {
        ...INITIAL,
        phase: "playing",
        questions: action.questions,
        meta: action.meta,
        drillSeed: action.drillSeed ?? null,
      };
    case "error":
      return { ...INITIAL, phase: "error", error: action.message };
    case "pick":
      return {
        ...state,
        phase: "revealed",
        pickedByIndex: { ...state.pickedByIndex, [state.index]: action.optionId },
      };
    case "next": {
      const nextIndex = state.index + 1;
      if (nextIndex >= state.questions.length) {
        return { ...state, phase: "done" };
      }
      return { ...state, index: nextIndex, phase: "playing" };
    }
    case "restart":
      return INITIAL;
    default:
      return state;
  }
}

function tally(state) {
  let correct = 0;
  state.questions.forEach((q, i) => {
    if (state.pickedByIndex[i] === q.correct_option_id) correct += 1;
  });
  return { correct, total: state.questions.length };
}

export default function TrapDrillModal({
  open,
  onClose,
  examSlug,
  topicId,
  size = 5,
  initialSeed = null,
  onSeedChange,
}) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  // Track which drill we've already logged so we don't double-write
  // when React re-renders the "done" phase.
  const loggedSeedRef = useRef(null);

  const startDrill = useCallback(
    (seed = initialSeed) => {
      if (!examSlug) return;
      dispatch({ type: "load" });
      loggedSeedRef.current = null;
      const params = new URLSearchParams();
      if (topicId) params.set("topic_id", topicId);
      if (size) params.set("size", String(size));
      if (seed) params.set("seed", String(seed));
      const qs = params.toString() ? `?${params.toString()}` : "";
      api
        .get(`/api/exam-intelligence/exams/${examSlug}/trap-drill${qs}`)
        .then((d) => {
          dispatch({
            type: "loaded",
            questions: d?.questions || [],
            drillSeed: d?.drill_seed ?? null,
            meta: {
              total_pool_size: d?.total_pool_size || 0,
              trap_annotated_pool_size: d?.trap_annotated_pool_size || 0,
              adaptive_summary: d?.adaptive_summary || null,
              personalised_for_user: Boolean(d?.personalised_for_user),
            },
          });
          if (d?.drill_seed && onSeedChange) onSeedChange(d.drill_seed);
        })
        .catch((e) => {
          dispatch({ type: "error", message: e?.message || "Couldn't load drill." });
        });
    },
    [examSlug, topicId, size, initialSeed, onSeedChange]
  );

  // Log the run on first transition to "done", once.
  useEffect(() => {
    if (state.phase !== "done") return;
    if (!examSlug || !state.questions.length) return;
    if (loggedSeedRef.current && loggedSeedRef.current === state.drillSeed) return;
    const attempts = state.questions
      .map((q, i) => {
        const picked = state.pickedByIndex[i];
        if (!picked) return null; // user closed mid-drill — skip the unanswered ones
        return {
          question_id: q.id,
          option_id: picked,
          is_correct: picked === q.correct_option_id,
          topic_id: topicId || null,
        };
      })
      .filter(Boolean);
    if (!attempts.length) return;
    loggedSeedRef.current = state.drillSeed ?? "logged";
    api
      .post(`/api/exam-intelligence/exams/${examSlug}/trap-drill/attempts`, {
        drill_seed: state.drillSeed ?? null,
        attempts,
      })
      .catch(() => {
        // Fire-and-forget; surfacing this error would distract from
        // the user's drill summary which is the important thing.
      });
  }, [state.phase, state.questions, state.pickedByIndex, state.drillSeed, examSlug, topicId]);

  // Auto-start on open, reset on close.
  useEffect(() => {
    if (open) startDrill();
    else dispatch({ type: "restart" });
  }, [open, startDrill]);

  // Focus the close button when the modal opens so escape / tab work.
  useEffect(() => {
    if (open && closeBtnRef.current) closeBtnRef.current.focus();
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-clay-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trap-drill-title"
      data-testid="trap-drill-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-clay-100">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Trap-awareness drill
            </div>
            <h2
              id="trap-drill-title"
              className="font-heading text-xl font-semibold mt-0.5"
            >
              {state.phase === "done"
                ? "Drill complete"
                : "Spot the trap"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="pill pill-sage inline-flex items-center gap-1 text-[11px]"
              title="Drill questions come only from verified past papers"
            >
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Verified-only
            </span>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close drill"
              className="rounded-full p-1 hover:bg-clay-100 focus:outline-none focus:ring-2 focus:ring-sage-300"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="px-5 py-5">
          <Body state={state} dispatch={dispatch} onRestart={startDrill} />
        </div>
      </div>
    </div>
  );
}

function Body({ state, dispatch, onRestart }) {
  if (state.phase === "idle" || state.phase === "loading") {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"
        aria-busy="true"
        data-testid="trap-drill-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Building your drill…
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div role="alert" data-testid="trap-drill-error">
        <div className="font-heading text-base font-semibold">
          Couldn't load the drill
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{state.error}</p>
        <button
          type="button"
          onClick={onRestart}
          className="btn btn-primary mt-3"
        >
          Try again
        </button>
      </div>
    );
  }
  if (state.phase === "done") {
    return <Summary state={state} onRestart={onRestart} />;
  }
  if (
    (state.phase === "playing" || state.phase === "revealed") &&
    state.questions[state.index]
  ) {
    return <Question state={state} dispatch={dispatch} />;
  }
  return null;
}

function Question({ state, dispatch }) {
  const q = state.questions[state.index];
  const picked = state.pickedByIndex[state.index] || null;
  const revealed = state.phase === "revealed";
  const insightsByOption = {};
  for (const i of q.trap_insights || []) {
    if (!i.option_id) continue;
    if (!insightsByOption[i.option_id]) insightsByOption[i.option_id] = [];
    insightsByOption[i.option_id].push(i);
  }
  return (
    <div data-testid="trap-drill-question">
      <div
        className="text-[11px] text-muted-foreground"
        aria-live="polite"
      >
        Question {state.index + 1} of {state.questions.length}
        {q.year ? ` · ${q.year}` : ""}
      </div>
      <h3 className="font-heading text-base font-semibold mt-1">
        {q.question_text || "—"}
      </h3>
      <ul className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
        {q.options.map((o) => {
          const isCorrect = o.id === q.correct_option_id;
          const isPicked = o.id === picked;
          let stateClass = "border-clay-200 bg-white hover:bg-clay-50";
          let icon = null;
          if (revealed && isCorrect) {
            stateClass = "border-sage-400 bg-sage-50";
            icon = (
              <CheckCircle2
                className="h-4 w-4 text-sage-600 shrink-0"
                aria-label="Correct answer"
              />
            );
          } else if (revealed && isPicked && !isCorrect) {
            stateClass = "border-rose-300 bg-rose-50";
            icon = (
              <XCircle
                className="h-4 w-4 text-rose-600 shrink-0"
                aria-label="Your incorrect pick"
              />
            );
          }
          const insights = insightsByOption[o.id] || [];
          return (
            <li key={o.id}>
              <button
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={revealed}
                onClick={() => dispatch({ type: "pick", optionId: o.id })}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-sage-300 ${stateClass}`}
                data-testid={`drill-option-${o.label || o.id}`}
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono text-sm font-semibold text-clay-700 shrink-0">
                    {o.label || "•"}.
                  </span>
                  <span className="text-sm flex-1">{o.text}</span>
                  {icon}
                </div>
                {revealed && insights.length > 0 && (
                  <ul className="mt-2 ml-6 space-y-1">
                    {insights.map((ins, idx) => (
                      <li
                        key={`${o.id}-${idx}`}
                        className="text-xs text-muted-foreground"
                      >
                        {ins.note}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {revealed && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => dispatch({ type: "next" })}
            className="btn btn-primary"
            data-testid="trap-drill-next"
          >
            {state.index + 1 === state.questions.length
              ? "Finish"
              : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}

function Summary({ state, onRestart }) {
  const { correct, total } = tally(state);
  if (total === 0) {
    return (
      <div data-testid="trap-drill-empty">
        <div className="font-heading text-base font-semibold">
          No drill questions available
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          This exam doesn't have verified PYQs ready for a drill yet. Once
          admins verify more past-paper questions, drills will appear here.
        </p>
      </div>
    );
  }
  return (
    <div data-testid="trap-drill-summary">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        Drill summary
      </div>
      <div className="font-heading text-2xl font-semibold mt-1">
        {correct} of {total} correct
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {state.meta?.trap_annotated_pool_size || 0} trap-annotated questions in
        the pool · drill is verified-only.
      </p>
      <ol className="mt-5 space-y-3">
        {state.questions.map((q, i) => {
          const picked = state.pickedByIndex[i];
          const ok = picked === q.correct_option_id;
          const pickedOpt = q.options.find((o) => o.id === picked);
          const correctOpt = q.options.find(
            (o) => o.id === q.correct_option_id
          );
          return (
            <li
              key={q.id}
              className="rounded-lg border border-clay-100 bg-clay-50/40 px-3 py-2"
            >
              <div className="text-xs text-muted-foreground">
                Q{i + 1}
                {q.year ? ` · ${q.year}` : ""} ·{" "}
                <span className={ok ? "text-sage-700" : "text-rose-700"}>
                  {ok ? "Correct" : "Missed"}
                </span>
              </div>
              <div className="text-sm font-medium mt-0.5 truncate">
                {q.question_text}
              </div>
              {!ok && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Your pick: {pickedOpt?.text || "—"} · Correct:{" "}
                  {correctOpt?.text || "—"}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onRestart}
          className="btn btn-primary"
          data-testid="trap-drill-restart"
        >
          Run another drill
        </button>
      </div>
    </div>
  );
}
