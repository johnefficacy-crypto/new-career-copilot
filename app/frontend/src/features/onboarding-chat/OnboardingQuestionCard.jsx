import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import IntentPickerQuestion from "./IntentPickerQuestion";
import WhyWeAsk from "./WhyWeAsk";
import OnboardingProgressBar from "./OnboardingProgressBar";

// One question per card. Tap-first: single_select / boolean / intent are
// answered with a single tap (fastest path). Multi-select and the rare
// typed data types use an explicit "Continue" button. There is no
// typewriter effect and no artificial chat delay anywhere here.
export default function OnboardingQuestionCard({
  question,
  questionSource,
  reason,
  progress,
  saving,
  onAnswer,
  onSkip,
  onSaveForLater,
}) {
  const [pending, setPending] = useState(null);
  const [multi, setMulti] = useState([]);
  const [text, setText] = useState("");

  if (!question) return null;
  const dataType = question.data_type;
  const isIntent = questionSource === "intent_picker";
  const options = Array.isArray(question.options) ? question.options : [];

  function submit(value) {
    if (saving) return;
    onAnswer(value);
  }

  function toggleMulti(value) {
    setMulti((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );
  }

  const needsExplicitContinue =
    dataType === "multi_select" ||
    dataType === "number" ||
    dataType === "percentage" ||
    dataType === "date" ||
    dataType === "text";

  function handleContinue() {
    if (saving) return;
    if (dataType === "multi_select") {
      if (multi.length === 0) return;
      submit(multi);
    } else {
      if (!text.toString().trim()) return;
      submit(text.trim());
    }
  }

  return (
    <section
      data-testid="onboarding-question-card"
      className="soft-card rounded-3xl p-5 sm:p-6"
      aria-labelledby="onboarding-question-text"
    >
      <OnboardingProgressBar progress={progress} />

      <div className="mt-4">
        {isIntent ? (
          <IntentPickerQuestion
            question={question}
            value={pending}
            onChange={(v) => {
              setPending(v);
              submit(v);
            }}
            disabled={saving}
          />
        ) : (
          <>
            <h2
              id="onboarding-question-text"
              data-testid="onboarding-question-text"
              className="font-heading font-semibold text-lg sm:text-xl text-clay-900"
            >
              {question.question_text}
            </h2>

            {(dataType === "single_select" || dataType === "multi_select") && (
              <div
                className="mt-4 flex flex-col gap-2.5"
                role={dataType === "single_select" ? "radiogroup" : "group"}
              >
                {options.map((opt) => {
                  const selected =
                    dataType === "multi_select"
                      ? multi.includes(opt.value)
                      : pending === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role={dataType === "single_select" ? "radio" : "checkbox"}
                      aria-checked={selected}
                      disabled={saving}
                      data-testid={`onboarding-option-${opt.value}`}
                      onClick={() => {
                        if (dataType === "multi_select") {
                          toggleMulti(opt.value);
                        } else {
                          setPending(opt.value);
                          submit(opt.value);
                        }
                      }}
                      className={`text-left rounded-2xl border px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                        selected
                          ? "border-clay-500 bg-clay-50 text-clay-900"
                          : "border-clay-200 hover:bg-clay-50 text-clay-800"
                      } ${saving ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {dataType === "boolean" && (
              <div className="mt-4 flex gap-2.5">
                {[
                  { value: true, label: "Yes" },
                  { value: false, label: "No" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={saving}
                    data-testid={`onboarding-bool-${opt.label.toLowerCase()}`}
                    onClick={() => submit(opt.value)}
                    className="flex-1 rounded-2xl border border-clay-200 px-4 py-3 text-sm font-medium text-clay-800 hover:bg-clay-50 transition-colors duration-150 disabled:opacity-60"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {(dataType === "number" ||
              dataType === "percentage" ||
              dataType === "date" ||
              dataType === "text") && (
              <input
                className="mt-4 w-full rounded-2xl border border-clay-200 px-4 py-3 text-sm outline-none focus:border-clay-400"
                type={
                  dataType === "date"
                    ? "date"
                    : dataType === "text"
                      ? "text"
                      : "number"
                }
                value={text}
                disabled={saving}
                onChange={(e) => setText(e.target.value)}
                data-testid="onboarding-text-input"
                aria-label={question.question_text}
              />
            )}
          </>
        )}

        <WhyWeAsk reason={reason} />
      </div>

      {/* Sticky action bar — large, thumb-friendly on mobile. */}
      <div className="mt-5 sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 pt-3 pb-1 bg-gradient-to-t from-clay-50 to-transparent">
        <div className="flex items-center gap-2">
          {needsExplicitContinue && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={saving}
              data-testid="onboarding-continue"
              className="btn btn-primary flex-1 justify-center"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            data-testid="onboarding-skip"
            className="btn btn-ghost"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onSaveForLater}
            disabled={saving}
            data-testid="onboarding-save-for-later"
            className="btn btn-ghost"
          >
            Save for later
          </button>
        </div>
        {saving && !needsExplicitContinue && (
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
      </div>
    </section>
  );
}
