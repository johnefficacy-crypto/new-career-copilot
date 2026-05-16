import React, { useEffect, useMemo, useState } from "react";
import { Pin, PinOff, Plus, Search, Tag, Trash2 } from "lucide-react";
import { notesService } from "../services/studyToolsService";

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [meta, setMeta] = useState({ count: 0, free_limit: 25, is_pro: false });
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (query) params.q = query;
      if (tagFilter) params.tag = tagFilter;
      const data = await notesService.list(params);
      setNotes(data.notes || []);
      setMeta({ count: data.count, free_limit: data.free_limit, is_pro: data.is_pro });
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    load();
  };

  const togglePin = async (note) => {
    await notesService.update(note.id, { is_pinned: !note.is_pinned });
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this note?")) return;
    await notesService.remove(id);
    load();
  };

  const allTags = useMemo(() => {
    const s = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [notes]);

  const cap = !meta.is_pro && meta.count >= meta.free_limit;

  return (
    <div className="space-y-6" data-testid="notes-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Personal notes</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Your study notes</h1>
          <p className="text-muted-foreground mt-1">
            {meta.is_pro ? "Unlimited notes — Pro plan." : `${meta.count} of ${meta.free_limit} notes used on the free plan.`}
          </p>
        </div>
        <button
          className="btn btn-primary inline-flex items-center gap-2"
          onClick={() => setCreating(true)}
          disabled={cap}
          data-testid="notes-new"
        >
          <Plus className="h-4 w-4" /> New note
        </button>
      </div>

      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background"
            placeholder="Search title or body…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background"
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">Apply</button>
      </form>

      {error && <div className="soft-card rounded-xl p-4 text-sm text-red-600">{error}</div>}
      {cap && (
        <div className="soft-card rounded-xl p-4 text-sm">
          You've reached the free-plan limit. Upgrade to Pro for unlimited notes.
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <div className="font-heading text-lg font-semibold">No notes yet</div>
          <div className="text-sm text-muted-foreground mt-1">Capture key formulas, mnemonics, and exam policy snippets.</div>
          <button className="btn btn-primary mt-5" onClick={() => setCreating(true)} disabled={cap}>Create your first note</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {notes.map((n) => (
            <div
              key={n.id}
              className="soft-card rounded-2xl p-4 flex flex-col gap-2 cursor-pointer hover:shadow-md transition"
              onClick={() => setEditing(n)}
              data-testid="notes-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold line-clamp-2">{n.title}</div>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); togglePin(n); }} title={n.is_pinned ? "Unpin" : "Pin"}>
                    {n.is_pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); remove(n.id); }} title="Delete">
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>
              </div>
              {n.body && <div className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{n.body}</div>}
              {(n.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {n.tags.map((t) => (
                    <span key={t} className="pill inline-flex items-center gap-1 text-[10px]">
                      <Tag className="h-3 w-3" /> {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-auto">{new Date(n.updated_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <NoteEditor
          note={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function NoteEditor({ note, onClose, onSaved }) {
  const [title, setTitle] = useState(note?.title || "");
  const [body, setBody] = useState(note?.body || "");
  const [tags, setTags] = useState((note?.tags || []).join(", "));
  const [sourceUrl, setSourceUrl] = useState(note?.source_url || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!title.trim()) {
      setErr("Title is required");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        body,
        source_url: sourceUrl.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (note?.id) {
        await notesService.update(note.id, payload);
      } else {
        await notesService.create(payload);
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div
        className="soft-card rounded-2xl bg-background w-full max-w-2xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="font-heading text-xl font-semibold">{note?.id ? "Edit note" : "New note"}</div>
          <button onClick={onClose} className="text-muted-foreground">Close</button>
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <input
          className="w-full px-3 py-2 rounded-xl border border-border bg-background"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full px-3 py-2 rounded-xl border border-border bg-background min-h-[200px]"
          placeholder="Write your note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border border-border bg-background"
          placeholder="Source URL (optional)"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 rounded-xl border border-border bg-background"
          placeholder="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
