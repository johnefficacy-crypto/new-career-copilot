import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Layers, Clock } from "lucide-react";
import { flashcardsService } from "../../services/studyToolsService";

export default function Flashcards() {
  const [decks, setDecks] = useState([]);
  const [summary, setSummary] = useState({ total_cards: 0, due_now: 0 });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([flashcardsService.listDecks(), flashcardsService.dueSummary()]);
      setDecks(d.decks || []);
      setSummary(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6" data-testid="flashcards-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Flashcards</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Review decks</h1>
          <p className="text-muted-foreground mt-1">{summary.total_cards} cards · {summary.due_now} due now</p>
        </div>
        <button className="btn btn-primary inline-flex items-center gap-2" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New deck
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : decks.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <Layers className="h-6 w-6 text-clay-500 mx-auto" />
          <div className="mt-3 font-heading text-lg font-semibold">No decks yet</div>
          <div className="text-sm text-muted-foreground">Create a deck to start building your spaced-repetition library.</div>
          <button className="btn btn-primary mt-5" onClick={() => setCreating(true)}>Create your first deck</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {decks.map((d) => (
            <Link key={d.id} to={`/app/flashcards/${d.id}`} className="soft-card rounded-2xl p-4 hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{d.name}</div>
                {d.due_count > 0 && <span className="pill pill-clay text-[10px] inline-flex items-center gap-1"><Clock className="h-3 w-3" />{d.due_count} due</span>}
              </div>
              {d.description && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{d.description}</div>}
              <div className="text-xs text-muted-foreground mt-3">{d.card_count} cards</div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <DeckEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

function DeckEditor({ deck, onClose, onSaved }) {
  const [name, setName] = useState(deck?.name || "");
  const [desc, setDesc] = useState(deck?.description || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!name.trim()) {
      setErr("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: desc };
      if (deck?.id) await flashcardsService.updateDeck(deck.id, payload);
      else await flashcardsService.createDeck(payload);
      onSaved();
    } catch (e) {
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="soft-card rounded-2xl bg-background w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-heading text-xl font-semibold">{deck?.id ? "Edit deck" : "New deck"}</div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <input
          className="w-full px-3 py-2 rounded-xl border border-border bg-background"
          placeholder="Deck name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="w-full px-3 py-2 rounded-xl border border-border bg-background"
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
