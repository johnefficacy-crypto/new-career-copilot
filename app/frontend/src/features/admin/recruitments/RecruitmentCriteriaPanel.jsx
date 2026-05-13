import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { ErrorState, LoadingSkeleton } from "../../../shared/ui";

const QUALIFICATION_LEVELS = ["10th", "12th", "diploma", "graduate", "postgraduate", "phd"];

// Inline editor for posts + age_criteria + education_criteria so admins
// can resolve posts_missing / eligibility_rules_missing without leaving
// the Operations Console. Publish remains backend-gated.
export default function RecruitmentCriteriaPanel({ recruitmentId, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creatingPost, setCreatingPost] = useState({ post_name: "" });

  const load = useCallback(async () => {
    if (!recruitmentId) return;
    setError(null);
    try {
      const r = await api.get(`/api/admin/recruitments/${recruitmentId}/criteria`);
      setData(r);
    } catch (e) {
      setError(e);
    }
  }, [recruitmentId]);

  useEffect(() => { load(); }, [load]);

  const submitCreatePost = async () => {
    if (!creatingPost.post_name.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/recruitments/${recruitmentId}/posts`, { post_name: creatingPost.post_name.trim() });
      setCreatingPost({ post_name: "" });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!recruitmentId) {
    return <p className="text-sm text-muted-foreground" data-testid="criteria-empty">Select a recruitment to edit posts and eligibility criteria.</p>;
  }
  if (!data && !error) return <LoadingSkeleton variant="table" />;
  if (error) return <ErrorState title="Failed to load criteria" message={error.message} onRetry={load} />;

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="recruitment-criteria-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Posts & eligibility criteria</div>
          <h3 className="font-heading text-lg">Canonical criteria editor</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Edit posts, age_criteria, and education_criteria. Saving demotes a published recruitment back to needs_review.
          </p>
        </div>
        <button type="button" className="btn btn-ghost h-8 text-xs" onClick={load} disabled={busy}>Refresh</button>
      </div>

      {data.posts.length === 0 ? (
        <p className="mt-3 text-xs text-amber-700" data-testid="criteria-no-posts">No posts yet. Add at least one to resolve <code>posts_missing</code>.</p>
      ) : null}

      <ul className="mt-3 space-y-3">
        {data.posts.map((p) => (
          <PostEditor key={p.id} post={p} recruitmentId={recruitmentId} onChanged={() => { load(); onChanged?.(); }} setError={setError} />
        ))}
      </ul>

      <div className="mt-4 rounded-xl border border-border bg-white/60 p-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Add new post</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="min-w-[200px] flex-1 rounded-lg border border-border bg-white px-2 py-1 text-xs"
            placeholder="Post name (e.g. Inspector)"
            value={creatingPost.post_name}
            onChange={(e) => setCreatingPost({ post_name: e.target.value })}
            data-testid="criteria-new-post-name"
          />
          <button type="button" className="btn btn-primary h-8 text-xs" disabled={busy || !creatingPost.post_name.trim()} onClick={submitCreatePost} data-testid="criteria-create-post">
            {busy ? "Saving..." : "Add post"}
          </button>
        </div>
      </div>
    </section>
  );
}

function PostEditor({ post, recruitmentId, onChanged, setError }) {
  const [editing, setEditing] = useState({ post_name: post.post_name || "" });
  const [busy, setBusy] = useState(false);
  const age = (post.age_criteria || [])[0] || null;
  const edu = (post.education_criteria || [])[0] || null;

  const savePostName = async () => {
    if (editing.post_name === post.post_name) return;
    setBusy(true);
    try {
      await api.put(`/api/admin/recruitments/${recruitmentId}/posts/${post.id}`, { post_name: editing.post_name });
      onChanged?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-border bg-white/60 p-3 text-xs" data-testid={`criteria-post-${post.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Post</span>
          <input
            className="flex-1 min-w-[160px] rounded-lg border border-border bg-white px-2 py-1"
            value={editing.post_name}
            onChange={(e) => setEditing({ post_name: e.target.value })}
            onBlur={savePostName}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <AgeCriteriaEditor
          recruitmentId={recruitmentId}
          postId={post.id}
          criteria={age}
          setError={setError}
          onChanged={onChanged}
          busy={busy}
          setBusy={setBusy}
        />
        <EducationCriteriaEditor
          recruitmentId={recruitmentId}
          postId={post.id}
          criteria={edu}
          setError={setError}
          onChanged={onChanged}
          busy={busy}
          setBusy={setBusy}
        />
      </div>
    </li>
  );
}

function AgeCriteriaEditor({ recruitmentId, postId, criteria, setError, onChanged, busy, setBusy }) {
  const [form, setForm] = useState({
    min_age: criteria?.min_age ?? "",
    max_age: criteria?.max_age ?? "",
    cutoff_date: criteria?.cutoff_date ?? "",
  });

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        min_age: form.min_age === "" ? null : Number(form.min_age),
        max_age: form.max_age === "" ? null : Number(form.max_age),
        cutoff_date: form.cutoff_date || null,
      };
      if (criteria?.id) {
        await api.put(`/api/admin/recruitments/${recruitmentId}/posts/${postId}/age-criteria/${criteria.id}`, body);
      } else {
        await api.post(`/api/admin/recruitments/${recruitmentId}/posts/${postId}/age-criteria`, body);
      }
      onChanged?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white/70 p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Age criteria</div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <input className="rounded-lg border border-border bg-white px-2 py-1" type="number" placeholder="min" value={form.min_age} onChange={(e) => setForm({ ...form, min_age: e.target.value })} data-testid={`age-min-${postId}`} />
        <input className="rounded-lg border border-border bg-white px-2 py-1" type="number" placeholder="max" value={form.max_age} onChange={(e) => setForm({ ...form, max_age: e.target.value })} data-testid={`age-max-${postId}`} />
        <input className="rounded-lg border border-border bg-white px-2 py-1" type="date" value={form.cutoff_date || ""} onChange={(e) => setForm({ ...form, cutoff_date: e.target.value })} data-testid={`age-cutoff-${postId}`} />
      </div>
      <button type="button" className="btn btn-ghost h-7 mt-2 text-[11px]" onClick={save} disabled={busy}>
        {criteria?.id ? "Update" : "Add age criteria"}
      </button>
    </div>
  );
}

function EducationCriteriaEditor({ recruitmentId, postId, criteria, setError, onChanged, busy, setBusy }) {
  const allowedRaw = criteria?.allowed_disciplines?.primary
    || criteria?.allowed_disciplines
    || [];
  const [form, setForm] = useState({
    min_qualification_level: criteria?.min_qualification_level || "graduate",
    allowed_disciplines: Array.isArray(allowedRaw) ? allowedRaw.join(", ") : "",
    raw_requirement_text: criteria?.raw_requirement_text || "",
  });

  const save = async () => {
    setBusy(true);
    try {
      const disciplines = form.allowed_disciplines
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const body = {
        min_qualification_level: form.min_qualification_level,
        allowed_disciplines: disciplines,
        raw_requirement_text: form.raw_requirement_text || null,
      };
      if (criteria?.id) {
        await api.put(`/api/admin/recruitments/${recruitmentId}/posts/${postId}/education-criteria/${criteria.id}`, body);
      } else {
        await api.post(`/api/admin/recruitments/${recruitmentId}/posts/${postId}/education-criteria`, body);
      }
      onChanged?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white/70 p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Education criteria</div>
      <div className="mt-2 space-y-1">
        <select className="w-full rounded-lg border border-border bg-white px-2 py-1" value={form.min_qualification_level} onChange={(e) => setForm({ ...form, min_qualification_level: e.target.value })} data-testid={`edu-level-${postId}`}>
          {QUALIFICATION_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input className="w-full rounded-lg border border-border bg-white px-2 py-1" placeholder="Disciplines (comma list)" value={form.allowed_disciplines} onChange={(e) => setForm({ ...form, allowed_disciplines: e.target.value })} data-testid={`edu-disc-${postId}`} />
        <input className="w-full rounded-lg border border-border bg-white px-2 py-1" placeholder="Raw requirement text" value={form.raw_requirement_text} onChange={(e) => setForm({ ...form, raw_requirement_text: e.target.value })} data-testid={`edu-raw-${postId}`} />
      </div>
      <button type="button" className="btn btn-ghost h-7 mt-2 text-[11px]" onClick={save} disabled={busy}>
        {criteria?.id ? "Update" : "Add education criteria"}
      </button>
    </div>
  );
}
