import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { flashcardsService } from "../../services/studyToolsService";

const RATING_LABELS = ["Blackout", "Wrong", "Hard wrong", "Hard", "Good", "Easy"];

export default function FlashcardsDeck() {
  const { deckId } = useParams();
  const [cards, setCards] = useState([]);
  const [mode, setMode] = useState("list"); // 'list' | 'review'
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  const load = async () => {
    const r = await flashcardsService.listCards(deckId);
    setCards(r.cards || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [deckId]);

  const addCard = async () => {
    if (!front.trim() || !back.trim()) return;
    await flashcardsService.createCard(deckId, { front, back });
    setFront("");
    setBack("");
    setAdding(false);
    load();
  };

  const removeCard = async (id) => {
    if (!window.confirm("Delete this card?")) return;
    await flashcardsService.deleteCard(id);
    load();
  };

  const dueCards = cards.filter((c) => !c.is_suspended && new Date(c.due_at) <= new Date());

  if (mode === "review") {
    return <ReviewMode cards={dueCards} onDone={() => { setMode("list"); load(); }} />;
  }

  return (
    <div className="space-y-5">
      <Link to="/app/flashcards" className="inline-flex items-center text-sm text-muted-foreground gap-1"><ArrowLeft className="h-3 w-3" /> All decks</Link>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Deck</h1>
          <p className="text-muted-foreground text-sm">{cards.length} cards · {dueCards.length} due</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary inline-flex items-center gap-2" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add card</button>
          <button className="btn btn-primary" disabled={dueCards.length === 0} onClick={() => setMode("review")}>
            Start review ({dueCards.length})
          </button>
        </div>
      </div>

      {adding && (
        <div className="soft-card rounded-2xl p-4 space-y-2">
          <textarea className="w-full px-3 py-2 rounded-xl border border-border bg-background" placeholder="Front" value={front} onChange={(e) => setFront(e.target.value)} />
          <textarea className="w-full px-3 py-2 rounded-xl border border-border bg-background" placeholder="Back" value={back} onChange={(e) => setBack(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={addCard}>Add</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.id} className="soft-card rounded-2xl p-4">
            <div className="text-sm whitespace-pre-wrap"><b>Q:</b> {c.front}</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-2"><b>A:</b> {c.back}</div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-muted-foreground">Due {new Date(c.due_at).toLocaleDateString()} · interval {c.interval_days}d</span>
              <button onClick={() => removeCard(c.id)} title="Delete"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewMode({ cards, onDone }) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const card = cards[idx];

  if (!card) {
    return (
      <div className="soft-card rounded-2xl p-10 text-center">
        <div className="font-heading text-xl font-semibold">Review complete</div>
        <button className="btn btn-primary mt-4" onClick={onDone}>Back to deck</button>
      </div>
    );
  }

  const rate = async (rating) => {
    await flashcardsService.review(card.id, { rating });
    setRevealed(false);
    if (idx + 1 >= cards.length) onDone();
    else setIdx(idx + 1);
  };

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted-foreground">Card {idx + 1} of {cards.length}</div>
      <div className="soft-card rounded-2xl p-6 min-h-[200px] whitespace-pre-wrap">{card.front}</div>
      {revealed ? (
        <>
          <div className="soft-card rounded-2xl p-6 whitespace-pre-wrap bg-clay-50">{card.back}</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {RATING_LABELS.map((label, i) => (
              <button key={i} className="btn btn-secondary" onClick={() => rate(i)}>{i} · {label}</button>
            ))}
          </div>
        </>
      ) : (
        <button className="btn btn-primary w-full" onClick={() => setRevealed(true)}>Show answer</button>
      )}
    </div>
  );
}
