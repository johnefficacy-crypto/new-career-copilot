import React, { useEffect, useState } from "react";
import { Plus, BookOpen, Sparkles, Trash2 } from "lucide-react";
import { mistakesService } from "../../services/studyToolsService";

const ROOT_CAUSES = [
  { value: "concept", label: "Concept gap" },
  { value: "silly", label: "Silly mistake" },
  { value: "application", label: "Application slip" },
  { value: "time_pressure", label: "Time pressure" },
  { value: "misread", label: "Misread question" },
  { value: "unknown", label: "Unknown" },
];

export default function Mistakes() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ open_count: 0, mastered_count: 0, due_count: 0, by_root_cause: [] });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dueOnly, setDueOnly] = useState(false);

  const load = async () => {
    const params = {};
    if (filter) params.root_cause = filter;
    if (statusFilter) params.status = statusFilter;
    if (dueOnly) params.due_only = "true";
    const [list, s] = await Promise.all([mistakesService.list(params), mistakesService.summary()]);
    setItems(list.mistakes || []);
    setSummary(s);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filter, statusFilter, dueOnly]);

  return (
    <div className="space-y-6" data-testid="mistakes-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Mistake book</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">What you got wrong</h1>
          <p className="text-muted-foreground mt-1">{summary.open_count} open · {summary.due_count} due now · {summary.mastered_count} mastered</p>
        </div>
        <button className="btn btn-primary inline-flex items-center gap-2" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New mistake
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select className="px-3 py-2 rounded-xl border border-border bg-background" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All root causes</option>
          {ROOT_CAUSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="px-3 py-2 rounded-xl border border-border bg-background" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All status</option>
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="mastered">Mastered</option>
          <option value="archived">Archived</option>
        </select>
        <label className="text-sm inline-flex items-center gap-2">
          <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Due only
        </label>
      </div>

      {summary.by_root_cause.length > 0 && (
        <div className="soft-card rounded-2xl p-4">
          <div className="text-sm font-semibold mb-2">Root-cause breakdown (unmastered)</div>
          <div className="flex flex-wrap gap-2">
            {summary.by_root_cause.map((c) => (
              <span key={c.cause} className="pill text-xs">
                {ROOT_CAUSES.find((r) => r.value === c.cause)?.label || c.cause} · {c.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <BookOpen className="h-6 w-6 text-clay-500 mx-auto" />
          <div className="mt-3 font-heading text-lg font-semibold">No mistakes logged</div>
          <div className="text-sm text-muted-foreground">Log wrong answers from mocks/practice to drill them later.</div>
          <button className="btn btn-primary mt-5" onClick={() => setCreating(true)}>Log a mistake</button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <MistakeRow key={m.id} item={m} onChange={load} />
          ))}
        </div>
      )}

      {creating && <MistakeEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function MistakeRow({ item, onChange }) {
  const [revealed, setRevealed] = useState(false);

  const review = async (rating) => {
    await mistakesService.review(item.id, { rating });
    onChange();
  };

  const promote = async () => {
    const name = window.prompt("Add to which deck? Enter a deck name (a new deck will be created):", "Mistake Drills");
    if (!name) return;
    await mistakesService.promote(item.id, { new_deck_name: name });
    alert("Promoted to flashcards.");
    onChange();
  };

  const remove = async () => {
    if (!window.confirm("Delete this mistake?")) return;
    await mistakesService.remove(item.id);
    onChange();
  };

  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-2">
            <span className="pill text-[10px]">{ROOT_CAUSES.find((r) => r.value === item.root_cause)?.label || item.root_cause}</span>
            <span className="pill text-[10px]">{item.status}</span>
            <span className="pill text-[10px]">Next: {new Date(item.next_review_at).toLocaleDateString()}</span>
          </div>
          <div className="text-sm font-medium whitespace-pre-wrap">{item.question_text}</div>
          {revealed && (
            <div className="text-sm text-muted-foreground mt-2 space-y-1">
              {item.my_answer && <div><b>My answer:</b> {item.my_answer}</div>}
              {item.correct_answer && <div><b>Correct:</b> {item.correct_answer}</div>}
              {item.reason && <div><b>Why I missed it:</b> {item.reason}</div>}
            </div>
          )}
        </div>
        <button onClick={remove} title="Delete"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" /></button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn btn-secondary" onClick={() => setRevealed(!revealed)}>{revealed ? "Hide" : "Reveal"}</button>
        {revealed && (
          <>
            <button className="btn btn-secondary" onClick={() => review(2)}>Still wrong</button>
            <button className="btn btn-secondary" onClick={() => review(4)}>Got it</button>
            <button className="btn btn-secondary" onClick={() => review(5)}>Mastered</button>
            {!item.promoted_card_id && (
              <button className="btn btn-primary inline-flex items-center gap-1" onClick={promote}>
                <Sparkles className="h-3 w-3" /> Promote to flashcard
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MistakeEditor({ onClose, onSaved }) {
  const [question, setQuestion] = useState("");
  const [correct, setCorrect] = useState("");
  const [mine, setMine] = useState("");
  const [reason, setReason] = useState("");
  const [cause, setCause] = useState("concept");
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!question.trim()) {
      setErr("Question is required");
      return;
    }
    try {
      await mistakesService.create({
        question_text: question,
        correct_answer: correct || null,
        my_answer: mine || null,
        reason: reason || null,
        root_cause: cause,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "Failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="soft-card rounded-2xl bg-background w-full max-w-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-heading text-xl font-semibold">Log a mistake</div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <textarea className="w-full px-3 py-2 rounded-xl border border-border bg-background min-h-[100px]" placeholder="Question / what was asked…" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="px-3 py-2 rounded-xl border border-border bg-background" placeholder="My answer (optional)" value={mine} onChange={(e) => setMine(e.target.value)} />
          <input className="px-3 py-2 rounded-xl border border-border bg-background" placeholder="Correct answer (optional)" value={correct} onChange={(e) => setCorrect(e.target.value)} />
        </div>
        <textarea className="w-full px-3 py-2 rounded-xl border border-border bg-background" placeholder="Why I missed it (root cause notes)…" value={reason} onChange={(e) => setReason(e.target.value)} />
        <select className="w-full px-3 py-2 rounded-xl border border-border bg-background" value={cause} onChange={(e) => setCause(e.target.value)}>
          {ROOT_CAUSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
