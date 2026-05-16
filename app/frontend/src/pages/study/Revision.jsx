import React, { useEffect, useState } from "react";
import { CalendarDays, Check, Plus, SkipForward } from "lucide-react";
import { revisionService } from "../../services/studyToolsService";

const SOURCE_KINDS = [
  { value: "note", label: "Note" },
  { value: "flashcard_deck", label: "Deck" },
  { value: "mistake", label: "Mistake" },
  { value: "topic", label: "Topic" },
  { value: "custom", label: "Custom" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Revision() {
  const [calendar, setCalendar] = useState([]);
  const [today, setToday] = useState([]);
  const [creating, setCreating] = useState(false);
  const [days, setDays] = useState(14);

  const load = async () => {
    const [c, t] = await Promise.all([
      revisionService.list({ days }),
      revisionService.today(),
    ]);
    setCalendar(c.calendar || []);
    setToday(t.items || []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [days]);

  const complete = async (id, rating) => {
    await revisionService.complete(id, { rating });
    load();
  };
  const skip = async (id) => { await revisionService.skip(id); load(); };

  return (
    <div className="space-y-6" data-testid="revision-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Revision calendar</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">What to revisit</h1>
          <p className="text-muted-foreground mt-1">SM-2-lite intervals · keeps notes, decks, mistakes and topics on a forgetting-resistant cadence.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="px-3 py-2 rounded-xl border border-border bg-background" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button className="btn btn-primary inline-flex items-center gap-2" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Schedule
          </button>
        </div>
      </div>

      <div className="soft-card rounded-2xl p-5">
        <div className="text-sm font-semibold mb-3">Due today</div>
        {today.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nothing due today. Nice.</div>
        ) : (
          <div className="space-y-2">
            {today.map((i) => (
              <RevisionRow key={i.id} item={i} onComplete={complete} onSkip={skip} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {calendar.map((day) => (
          <div key={day.date} className="soft-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="h-4 w-4 text-clay-500" />
              <div className="text-sm font-semibold">{day.date}</div>
              <div className="text-xs text-muted-foreground ml-auto">{day.items.length} item{day.items.length === 1 ? "" : "s"}</div>
            </div>
            {day.items.length === 0 ? (
              <div className="text-xs text-muted-foreground">Free day</div>
            ) : (
              <div className="space-y-2">
                {day.items.map((i) => (
                  <div key={i.id} className="text-sm">
                    <span className="pill text-[10px] mr-2">{SOURCE_KINDS.find((s) => s.value === i.source_kind)?.label || i.source_kind}</span>
                    {i.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {creating && <RevisionEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function RevisionRow({ item, onComplete, onSkip }) {
  return (
    <div className="flex items-center gap-3 border border-border rounded-xl px-3 py-2">
      <span className="pill text-[10px]">{SOURCE_KINDS.find((s) => s.value === item.source_kind)?.label || item.source_kind}</span>
      <div className="flex-1 text-sm">{item.title}</div>
      <button className="btn btn-secondary inline-flex items-center gap-1" onClick={() => onSkip(item.id)}><SkipForward className="h-3 w-3" /> Skip</button>
      <button className="btn btn-secondary" onClick={() => onComplete(item.id, 3)}>Hard</button>
      <button className="btn btn-secondary" onClick={() => onComplete(item.id, 4)}>Good</button>
      <button className="btn btn-primary inline-flex items-center gap-1" onClick={() => onComplete(item.id, 5)}><Check className="h-3 w-3" /> Easy</button>
    </div>
  );
}

function RevisionEditor({ onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("custom");
  const [date, setDate] = useState(todayStr());
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!title.trim()) {
      setErr("Title is required");
      return;
    }
    try {
      await revisionService.create({ title, source_kind: kind, scheduled_for: date });
      onSaved();
    } catch (e) {
      setErr(e.message || "Failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="soft-card rounded-2xl bg-background w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-heading text-xl font-semibold">Schedule a revision</div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <input className="w-full px-3 py-2 rounded-xl border border-border bg-background" placeholder="What to revise" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="w-full px-3 py-2 rounded-xl border border-border bg-background" value={kind} onChange={(e) => setKind(e.target.value)}>
          {SOURCE_KINDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input type="date" className="w-full px-3 py-2 rounded-xl border border-border bg-background" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
