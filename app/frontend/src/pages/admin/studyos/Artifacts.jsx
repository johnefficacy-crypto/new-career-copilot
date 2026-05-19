import React, { useEffect, useState } from "react";
import { RotateCcw, X as XIcon, FileText, Layers, AlertOctagon, CalendarClock, Eye } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function flagDisabled(err) {
  const msg = getApiErrorMessage(err) || "";
  return /admin\.study_os\.enabled/i.test(msg);
}

function Panel({ icon: Icon, title, count, children, action }) {
  return (
    <section className="rounded border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {typeof count === "number" ? (
            <span className="text-xs text-muted-foreground">({count})</span>
          ) : null}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Empty() {
  return <div className="text-sm text-muted-foreground">No items.</div>;
}

export default function AdminStudyOsArtifacts() {
  const [userId, setUserId] = useState("");
  const [active, setActive] = useState("");
  const [notes, setNotes] = useState(null);
  const [decks, setDecks] = useState(null);
  const [cards, setCards] = useState(null);
  const [mistakes, setMistakes] = useState(null);
  const [revision, setRevision] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [status, setStatus] = useState(null);

  async function loadAll(uid) {
    setBusy(true);
    setErr(null);
    setStatus(null);
    try {
      const base = `/api/admin/study-os/users/${encodeURIComponent(uid)}/artifacts`;
      const [n, d, c, m, rv] = await Promise.all([
        api.get(`${base}/notes?limit=20`),
        api.get(`${base}/flashcard-decks?limit=20`),
        api.get(`${base}/flashcards?limit=20`),
        api.get(`${base}/mistakes?limit=20`),
        api.get(`${base}/revision?limit=50`),
      ]);
      setNotes(n);
      setDecks(d);
      setCards(c);
      setMistakes(m);
      setRevision(rv);
      setDisabled(false);
    } catch (e) {
      if (flagDisabled(e)) setDisabled(true);
      setErr(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleItem(itemId) {
    const newDate = window.prompt("New scheduled_for date (YYYY-MM-DD)?");
    if (!newDate) return;
    const reason = window.prompt("Reason (≥8 chars)?");
    if (!reason || reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be ≥8 chars." });
      return;
    }
    try {
      const r = await api.post(
        `/api/admin/study-os/users/${encodeURIComponent(active)}/artifacts/revision/${encodeURIComponent(itemId)}/reschedule`,
        { reason: reason.trim(), payload: { scheduled_for: newDate } }
      );
      setStatus({ ok: true, message: `Rescheduled to ${r.scheduled_for}. audit_id=${r.audit_id}` });
      loadAll(active);
    } catch (e) {
      setStatus({ ok: false, message: getApiErrorMessage(e) });
    }
  }

  async function openArtifact(kind, artifactId) {
    const reason = window.prompt(`Reason for opening this ${kind} content (≥8 chars, logged to support_content_access)?`);
    if (!reason || reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be ≥8 chars." });
      return;
    }
    const path = `/api/admin/study-os/users/${encodeURIComponent(active)}/artifacts/${kind === "note" ? "notes" : kind === "flashcard" ? "flashcards" : "mistakes"}/${encodeURIComponent(artifactId)}/open`;
    try {
      const r = await api.post(path, { reason: reason.trim() });
      const content = r.note || r.card || r.mistake;
      // Stringified preview is enough — the audit log captures the actual access.
      const preview = JSON.stringify(content, null, 2).slice(0, 4000);
      window.alert(`Logged. access_log_id=${r.access_log_id}\nFields: ${(r.fields_returned || []).join(", ")}\n\n${preview}`);
      setStatus({ ok: true, message: `Opened ${kind} ${artifactId}. access_log_id=${r.access_log_id}` });
    } catch (e) {
      setStatus({ ok: false, message: getApiErrorMessage(e) });
    }
  }

  async function cancelItem(itemId) {
    const reason = window.prompt("Reason for cancellation (≥8 chars)?");
    if (!reason || reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be ≥8 chars." });
      return;
    }
    if (!window.confirm("Cancel this revision item? Status becomes 'skipped'.")) return;
    try {
      const r = await api.post(
        `/api/admin/study-os/users/${encodeURIComponent(active)}/artifacts/revision/${encodeURIComponent(itemId)}/cancel`,
        { reason: reason.trim() }
      );
      setStatus({ ok: true, message: `Cancelled. audit_id=${r.audit_id}` });
      loadAll(active);
    } catch (e) {
      setStatus({ ok: false, message: getApiErrorMessage(e) });
    }
  }

  useEffect(() => {
    if (active) loadAll(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="space-y-5" data-testid="admin-studyos-artifacts">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · learning artifacts
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Artifact Admin</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Metadata-only view of a user's notes, flashcards, mistakes, and revision queue. Content reads
          (note body, card front/back, mistake text) are intentionally deferred — they require an audited
          "open content" flow that's coming in a follow-up.
        </p>
      </div>

      {disabled ? (
        <div className="rounded border border-amber-300/50 bg-amber-50/50 p-3 text-sm" role="status">
          <strong>Admin Study OS is disabled.</strong> Set <code>ADMIN_STUDY_OS_ENABLED=1</code>.
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <label className="flex-1 max-w-md">
          <span className="block text-xs font-medium text-muted-foreground mb-1">Target user (UUID)</span>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="paste a user UUID from the Inspector"
            className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono"
            data-testid="artifacts-target-input"
          />
        </label>
        <button
          type="button"
          className="btn small"
          onClick={() => setActive(userId.trim())}
          disabled={!userId || userId.trim().length < 6}
          data-testid="artifacts-target-lock"
        >
          Load
        </button>
      </div>

      {status ? (
        <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">
          {status.message}
        </div>
      ) : null}

      {err && !disabled ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      {active && !err ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel icon={FileText} title="Notes" count={notes?.total}>
            {busy && !notes ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !notes?.items?.length ? (
              <Empty />
            ) : (
              <ul className="space-y-1 text-xs">
                {notes.items.map((n) => (
                  <li key={n.id} className="border-b border-border/40 py-1">
                    <div className="flex justify-between gap-2 items-center">
                      <span className="font-medium truncate">{n.title || "(no title)"}</span>
                      <span className="flex gap-2 items-center shrink-0">
                        <span className="text-muted-foreground">{fmt(n.updated_at)}</span>
                        <button
                          type="button"
                          onClick={() => openArtifact("note", n.id)}
                          className="text-[11px] underline hover:no-underline"
                          data-testid={`open-note-${n.id}`}
                        >
                          <Eye className="inline h-3 w-3" /> Open
                        </button>
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {n.is_pinned ? "📌 " : ""}{n.is_archived ? "archived · " : ""}
                      tags: {(n.tags || []).join(", ") || "—"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={Layers} title="Flashcard decks" count={decks?.total}>
            {!decks?.items?.length ? <Empty /> : (
              <ul className="space-y-1 text-xs">
                {decks.items.map((d) => (
                  <li key={d.id} className="border-b border-border/40 py-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">{d.name}</span>
                      <span className="text-muted-foreground shrink-0">cards: {d.card_count ?? 0} · due: {d.due_count ?? 0}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={Layers} title="Flashcards (SRS state)" count={cards?.total}>
            {!cards?.items?.length ? <Empty /> : (
              <ul className="space-y-1 text-xs">
                {cards.items.slice(0, 12).map((c) => (
                  <li key={c.id} className="border-b border-border/40 py-1 font-mono">
                    <div className="flex justify-between gap-2 items-center">
                      <span className="truncate">{c.id.slice(0, 8)}…</span>
                      <span className="flex gap-2 items-center shrink-0">
                        <span className="text-muted-foreground">
                          ease={c.ease?.toFixed?.(2) ?? c.ease} · int={c.interval_days}d · rep={c.repetitions} · laps={c.lapses}
                        </span>
                        <button
                          type="button"
                          onClick={() => openArtifact("flashcard", c.id)}
                          className="text-[11px] underline hover:no-underline"
                          data-testid={`open-card-${c.id}`}
                        >
                          <Eye className="inline h-3 w-3" /> Open
                        </button>
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      due {fmt(c.due_at)}{c.is_suspended ? " · suspended" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={AlertOctagon} title="Mistakes" count={mistakes?.total}>
            {!mistakes?.items?.length ? <Empty /> : (
              <ul className="space-y-1 text-xs">
                {mistakes.items.slice(0, 12).map((m) => (
                  <li key={m.id} className="border-b border-border/40 py-1">
                    <div className="flex justify-between gap-2 items-center">
                      <span className="font-medium">{m.root_cause} · diff {m.difficulty}</span>
                      <span className="flex gap-2 items-center shrink-0">
                        <span className="text-muted-foreground">{m.status}</span>
                        <button
                          type="button"
                          onClick={() => openArtifact("mistake", m.id)}
                          className="text-[11px] underline hover:no-underline"
                          data-testid={`open-mistake-${m.id}`}
                        >
                          <Eye className="inline h-3 w-3" /> Open
                        </button>
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      reviews: {m.review_count} · next: {fmt(m.next_review_at)}
                      {m.promoted_card_id ? " · → flashcard" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            icon={CalendarClock}
            title="Revision queue"
            count={revision?.total}
            action={
              <button type="button" className="btn small" onClick={() => loadAll(active)}>
                <RotateCcw className="h-3 w-3" /> Refresh
              </button>
            }
          >
            {!revision?.items?.length ? <Empty /> : (
              <ul className="space-y-1 text-xs">
                {revision.items.map((it) => (
                  <li key={it.id} className="border-b border-border/40 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">{it.title || it.source_kind}</span>
                      <span className="text-muted-foreground shrink-0">{it.scheduled_for}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">{it.source_kind} · {it.status}</span>
                      {it.status === "scheduled" ? (
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => rescheduleItem(it.id)}
                            className="text-[11px] underline hover:no-underline"
                            data-testid={`reschedule-${it.id}`}
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelItem(it.id)}
                            className="text-[11px] underline hover:no-underline text-red-700"
                            data-testid={`cancel-${it.id}`}
                          >
                            <XIcon className="inline h-3 w-3" /> Cancel
                          </button>
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
