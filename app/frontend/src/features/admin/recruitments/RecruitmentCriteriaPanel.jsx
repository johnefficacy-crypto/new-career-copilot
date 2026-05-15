import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";

const QUALIFICATION_LEVELS = ["10th", "12th", "diploma", "graduate", "postgraduate", "phd"];

export default function RecruitmentCriteriaPanel({ recruitmentId, onChanged, recruitmentName }) {
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
    } catch (e) { setError(e); }
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
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  if (!recruitmentId) {
    return <div className="anno" data-testid="criteria-empty">Select a recruitment to edit posts and eligibility criteria.</div>;
  }
  if (!data && !error) return <div className="skel" style={{ height: 80 }} />;
  if (error) return <div className="err-row">Failed to load criteria · {error.message}</div>;

  const postCount = data?.posts?.length || 0;

  return (
    <section className="card" data-testid="recruitment-criteria-panel">
      <div className="card-head-col">
        <div className="lbl">Canonical criteria editor</div>
        <h3 className="oc-title">{recruitmentName || "Posts &amp; eligibility"} · {postCount} post{postCount === 1 ? "" : "s"}</h3>
        <div className="anno" style={{ marginTop: 2 }}>
          Edit posts, age_criteria, education_criteria. Saving demotes a published recruitment back to needs_review.
        </div>
      </div>
      <div className="card-body stack">
        {postCount === 0 ? (
          <div className="warn-row" data-testid="criteria-no-posts">
            No posts yet. Add at least one to resolve <code>posts_missing</code>.
          </div>
        ) : null}

        {data.posts.map((p, idx) => (
          <PostEditor
            key={p.id}
            idx={idx}
            post={p}
            recruitmentId={recruitmentId}
            onChanged={() => { load(); onChanged?.(); }}
            setError={setError}
          />
        ))}

        <div style={{ padding: "10px 12px", background: "var(--paper-sunk)", border: "1px dashed var(--rule)", borderRadius: 3 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Add new post</div>
          <div className="row">
            <input
              className="input"
              style={{ flex: 1, minWidth: 160, fontSize: 12, padding: "6px 9px" }}
              placeholder="Post name (e.g. Data Entry Operator)"
              value={creatingPost.post_name}
              onChange={(e) => setCreatingPost({ post_name: e.target.value })}
              data-testid="criteria-new-post-name"
            />
            <button type="button" className="btn primary small" disabled={busy || !creatingPost.post_name.trim()} onClick={submitCreatePost} data-testid="criteria-create-post">
              {busy ? "Saving…" : "Add post"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PostEditor({ post, idx, recruitmentId, onChanged, setError }) {
  const [editing, setEditing] = useState({ post_name: post.post_name || "" });
  const [busy, setBusy] = useState(false);
  const age = (post.age_criteria || [])[0] || null;
  const edu = (post.education_criteria || [])[0] || null;
  const eduComplete = Boolean(edu?.id);

  const savePostName = async () => {
    if (editing.post_name === post.post_name) return;
    setBusy(true);
    try {
      await api.put(`/api/admin/recruitments/${recruitmentId}/posts/${post.id}`, { post_name: editing.post_name });
      onChanged?.();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="post-card" data-testid={`criteria-post-${post.id}`}>
      <div className="post-head">
        <div className="row" style={{ flex: 1 }}>
          <span className="lbl">post {idx}</span>
          <input
            className="input"
            style={{ flex: 1, minWidth: 160, fontSize: 13, fontWeight: 500, padding: "5px 8px" }}
            value={editing.post_name}
            onChange={(e) => setEditing({ post_name: e.target.value })}
            onBlur={savePostName}
          />
        </div>
        <span className={eduComplete ? "badge resolved" : "badge pending"}>{eduComplete ? "complete" : "missing edu"}</span>
      </div>
      <div className="grid2">
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
    </div>
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
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="field">
      <div className="field-lbl">age criteria</div>
      <div className="row" style={{ marginTop: 6 }}>
        <input
          className="input"
          style={{ width: 70, fontSize: 12, padding: "5px 8px" }}
          type="number"
          placeholder="min"
          value={form.min_age}
          onChange={(e) => setForm({ ...form, min_age: e.target.value })}
          data-testid={`age-min-${postId}`}
        />
        <span className="anno">to</span>
        <input
          className="input"
          style={{ width: 70, fontSize: 12, padding: "5px 8px" }}
          type="number"
          placeholder="max"
          value={form.max_age}
          onChange={(e) => setForm({ ...form, max_age: e.target.value })}
          data-testid={`age-max-${postId}`}
        />
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <span className="anno">cutoff</span>
        <input
          className="input"
          style={{ fontSize: 12, padding: "5px 8px", flex: 1 }}
          type="date"
          value={form.cutoff_date || ""}
          onChange={(e) => setForm({ ...form, cutoff_date: e.target.value })}
          data-testid={`age-cutoff-${postId}`}
        />
      </div>
      <button type="button" className="btn small" style={{ marginTop: 6 }} onClick={save} disabled={busy}>
        {criteria?.id ? "Update" : "Add age criteria"}
      </button>
    </div>
  );
}

function EducationCriteriaEditor({ recruitmentId, postId, criteria, setError, onChanged, busy, setBusy }) {
  const allowedRaw = criteria?.allowed_disciplines?.primary || criteria?.allowed_disciplines || [];
  const [form, setForm] = useState({
    min_qualification_level: criteria?.min_qualification_level || "graduate",
    allowed_disciplines: Array.isArray(allowedRaw) ? allowedRaw.join(", ") : "",
    raw_requirement_text: criteria?.raw_requirement_text || "",
  });

  const save = async () => {
    setBusy(true);
    try {
      const disciplines = form.allowed_disciplines.split(",").map((x) => x.trim()).filter(Boolean);
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
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const missing = !criteria?.id;

  return (
    <div className={missing ? "field bad" : "field"}>
      <div className="field-lbl" style={missing ? { color: "var(--blocker)" } : {}}>
        education{missing ? " · required" : " criteria"}
      </div>
      {missing ? (
        <div className="anno" style={{ color: "var(--blocker)", marginTop: 4 }}>no education_criteria row</div>
      ) : null}
      <select
        className="input"
        style={{ fontSize: 12, padding: "5px 8px", marginTop: 6 }}
        value={form.min_qualification_level}
        onChange={(e) => setForm({ ...form, min_qualification_level: e.target.value })}
        data-testid={`edu-level-${postId}`}
      >
        {QUALIFICATION_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <input
        className="input"
        style={{ fontSize: 11.5, padding: "5px 8px", marginTop: 4 }}
        placeholder="disciplines (comma)"
        value={form.allowed_disciplines}
        onChange={(e) => setForm({ ...form, allowed_disciplines: e.target.value })}
        data-testid={`edu-disc-${postId}`}
      />
      <input
        className="input"
        style={{ fontSize: 11.5, padding: "5px 8px", marginTop: 4 }}
        placeholder="raw requirement text"
        value={form.raw_requirement_text}
        onChange={(e) => setForm({ ...form, raw_requirement_text: e.target.value })}
        data-testid={`edu-raw-${postId}`}
      />
      <button type="button" className="btn small" style={{ marginTop: 6 }} onClick={save} disabled={busy}>
        {criteria?.id ? "Update" : "Add education criteria"}
      </button>
    </div>
  );
}
