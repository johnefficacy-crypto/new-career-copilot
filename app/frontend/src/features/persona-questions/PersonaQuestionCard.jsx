import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { usePersonaQuestion } from "./usePersonaQuestion";
import PersonaQuestionOptionList from "./PersonaQuestionOptionList";

// PR2: one tiny question at a time. Renders nothing if the API has no
// question or fails — must never block the rest of the page.
export default function PersonaQuestionCard({ initialQuestion } = {}) {
  const { loading, question, saving, submitAnswer, skip } = usePersonaQuestion(
    initialQuestion !== undefined ? { initialQuestion } : undefined,
  );
  const [pendingValue, setPendingValue] = useState(null);
  const [textValue, setTextValue] = useState("");

  if (loading) return null;
  if (!question) return null;

  const dataType = question.data_type;

  function handleSelect(v) {
    setPendingValue(v);
  }

  async function handleSave() {
    let answerValue = pendingValue;
    if (dataType === "text" || dataType === "number") {
      answerValue = textValue;
    } else if (dataType === "boolean") {
      answerValue = pendingValue === true || pendingValue === "true";
    }
    if (answerValue === null || answerValue === "" || answerValue === undefined) return;
    await submitAnswer(answerValue);
    setPendingValue(null);
    setTextValue("");
  }

  async function handleSkip() {
    await skip();
    setPendingValue(null);
    setTextValue("");
  }

  const canSave = saving
    ? false
    : dataType === "single_select"
      ? pendingValue !== null && pendingValue !== undefined
      : dataType === "boolean"
        ? pendingValue !== null
        : (textValue || "").toString().trim().length > 0;

  return (
    <section
      className="soft-card rounded-2xl p-5"
      data-testid="persona-question-card"
      aria-labelledby="persona-question-heading"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-clay-500 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <h2
            id="persona-question-heading"
            className="font-heading font-semibold text-base"
          >
            Personalize your Study OS
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Answer one small question to improve your next plan.
          </p>

          <div className="mt-4">
            <div className="text-[15px] font-medium" data-testid="persona-question-text">
              {question.question_text}
            </div>
            {question.help_text ? (
              <p className="text-xs text-muted-foreground mt-1">{question.help_text}</p>
            ) : null}

            {dataType === "single_select" ? (
              <PersonaQuestionOptionList
                options={question.options || []}
                value={pendingValue}
                onChange={handleSelect}
                disabled={saving}
              />
            ) : null}

            {dataType === "text" || dataType === "number" ? (
              <input
                className="mt-3 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm"
                type={dataType === "number" ? "number" : "text"}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                disabled={saving}
                data-testid="persona-question-input"
                aria-label={question.question_text}
              />
            ) : null}

            {dataType === "boolean" ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingValue(true)}
                  disabled={saving}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    pendingValue === true ? "border-clay-500 bg-clay-50" : "border-clay-200"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setPendingValue(false)}
                  disabled={saving}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    pendingValue === false ? "border-clay-500 bg-clay-50" : "border-clay-200"
                  }`}
                >
                  No
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              data-testid="persona-question-save"
              className="rounded-xl bg-clay-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              data-testid="persona-question-skip"
              className="rounded-xl border border-clay-200 px-4 py-2 text-sm text-muted-foreground hover:bg-clay-50"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
