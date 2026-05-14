import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

function asOptionList(options) {
  if (!Array.isArray(options)) return [];
  return options.map((o) =>
    typeof o === "string"
      ? { value: o, label: o }
      : { value: o.value ?? "", label: o.label ?? o.value ?? "" },
  );
}

function optionsToText(options) {
  return asOptionList(options)
    .map((o) => (o.label && o.label !== o.value ? `${o.value}|${o.label}` : o.value))
    .join("\n");
}

function textToOptions(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label] = line.split("|").map((p) => p.trim());
      return { value, label: label || value };
    });
}

export default function PersonaQuestionEditor({ question, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(() => ({
    question_text: question?.question_text || "",
    help_text: question?.help_text || "",
    priority: question?.priority ?? 100,
    is_active: !!question?.is_active,
    options_text: optionsToText(question?.options),
  }));

  useEffect(() => {
    setForm({
      question_text: question?.question_text || "",
      help_text: question?.help_text || "",
      priority: question?.priority ?? 100,
      is_active: !!question?.is_active,
      options_text: optionsToText(question?.options),
    });
  }, [question]);

  if (!question) return null;
  const dataType = question.data_type;
  const isSelect = dataType === "single_select" || dataType === "multi_select";

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      question_text: form.question_text.trim(),
      help_text: form.help_text || null,
      priority: Number(form.priority),
      is_active: form.is_active,
    };
    if (isSelect) {
      payload.options = textToOptions(form.options_text);
    }
    onSave(payload);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-2 md:p-6"
      role="dialog"
      aria-labelledby="persona-question-editor-heading"
      data-testid="persona-question-editor"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full md:max-w-2xl bg-white rounded-2xl p-5 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Edit question · {dataType}
            </div>
            <h2 id="persona-question-editor-heading" className="font-heading text-xl font-semibold mt-1">
              {question.question_key}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Target dimension: {question.target_dimension || "—"} ·{" "}
              question_key is immutable.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost h-9 w-9 p-0"
            aria-label="Close editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">{error}</div>
        ) : null}

        <label className="block text-sm">
          <span className="text-muted-foreground text-xs">Question text</span>
          <textarea
            required
            className="mt-1 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm"
            rows={2}
            value={form.question_text}
            onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
            data-testid="persona-question-text"
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground text-xs">Help text (optional)</span>
          <textarea
            className="mt-1 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm"
            rows={2}
            value={form.help_text}
            onChange={(e) => setForm((f) => ({ ...f, help_text: e.target.value }))}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-muted-foreground text-xs">Priority (lower = higher)</span>
            <input
              type="number"
              min={0}
              max={10000}
              className="mt-1 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 mt-6 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              data-testid="persona-question-active"
            />
            <span>Active</span>
          </label>
        </div>

        {isSelect ? (
          <label className="block text-sm">
            <span className="text-muted-foreground text-xs">
              Options · one per line. Use <code>value|Label</code> when label differs.
            </span>
            <textarea
              className="mt-1 w-full rounded-xl border border-clay-200 px-3 py-2 text-xs font-mono"
              rows={6}
              value={form.options_text}
              onChange={(e) => setForm((f) => ({ ...f, options_text: e.target.value }))}
              data-testid="persona-question-options"
            />
          </label>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-clay-100">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            data-testid="persona-question-save"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
