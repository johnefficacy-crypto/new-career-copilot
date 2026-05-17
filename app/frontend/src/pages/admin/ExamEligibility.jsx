import React, { useEffect, useState } from "react";
import { GraduationCap, Plus, ShieldCheck, X } from "lucide-react";
import { api } from "../../lib/api";
import { LoadingSkeleton } from "../../shared/ui";

const SCOPES = ["all", "general", "obc", "sc", "st", "ews", "pwd", "ex_serviceman", "women"];
const RULE_TYPES = ["age_min", "age_max", "education_min_level", "nationality", "gender", "attempts_max"];
const NUMERIC_TYPES = new Set(["age_min", "age_max", "attempts_max"]);
const TEXT_TYPES = new Set(["education_min_level", "nationality", "gender"]);
const STATUSES = ["draft", "verified", "archived"];

function StatusPill({ status }) {
  const tone =
    status === "verified" ? "pill-sage"
    : status === "draft" ? "pill-amber"
    : "pill-dusk";
  return <span className={`pill ${tone}`} data-testid={`status-${status}`}>{status}</span>;
}

function emptyRuleForm(examId) {
  return {
    exam_id: examId,
    scope: "all",
    rule_type: "age_max",
    value_num: "",
    value_text: "",
    source_url: "",
    source_notes: "",
    reviewer_status: "draft",
    is_knockout: true,
  };
}

export default function AdminExamEligibility() {
  const [exams, setExams] = useState(null);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [rules, setRules] = useState([]);
  const [exam, setExam] = useState(null);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    refreshExams();
  }, []);

  useEffect(() => {
    if (selectedExamId) refreshRules(selectedExamId);
  }, [selectedExamId]);

  async function refreshExams() {
    setError("");
    try {
      const d = await api.get("/api/admin/exam-eligibility/exams");
      setExams(Array.isArray(d?.items) ? d.items : []);
    } catch (e) {
      setError(e?.message || "Failed to load exams");
      setExams([]);
    }
  }

  async function refreshRules(examId) {
    setError("");
    try {
      const d = await api.get(`/api/admin/exam-eligibility/exams/${examId}/rules`);
      setExam(d?.exam || null);
      setRules(Array.isArray(d?.rules) ? d.rules : []);
    } catch (e) {
      setError(e?.message || "Failed to load rules");
      setRules([]);
      setExam(null);
    }
  }

  function openNewRule() {
    setEditingId(null);
    setForm(emptyRuleForm(selectedExamId));
  }

  function openEditRule(rule) {
    setEditingId(rule.id);
    setForm({
      ...rule,
      value_num: rule.value_num == null ? "" : String(rule.value_num),
      value_text: rule.value_text || "",
      source_url: rule.source_url || "",
      source_notes: rule.source_notes || "",
    });
  }

  function closeForm() {
    setEditingId(null);
    setForm(null);
  }

  async function submitForm(e) {
    e.preventDefault();
    setError("");
    const payload = {
      scope: form.scope,
      rule_type: form.rule_type,
      is_knockout: !!form.is_knockout,
      reviewer_status: form.reviewer_status,
      source_url: form.source_url || null,
      source_notes: form.source_notes || null,
    };
    if (NUMERIC_TYPES.has(form.rule_type)) {
      const raw = String(form.value_num ?? "").trim();
      const n = Number(raw);
      if (!raw || !Number.isFinite(n)) {
        setError(`${form.rule_type} requires a numeric value`);
        return;
      }
      payload.value_num = n;
    } else if (TEXT_TYPES.has(form.rule_type)) {
      if (!form.value_text) {
        setError(`${form.rule_type} requires a text value`);
        return;
      }
      payload.value_text = form.value_text;
    }
    try {
      if (editingId) {
        await api.put(`/api/admin/exam-eligibility/rules/${editingId}`, payload);
      } else {
        await api.post(
          `/api/admin/exam-eligibility/exams/${selectedExamId}/rules`,
          payload,
        );
      }
      closeForm();
      await refreshRules(selectedExamId);
      await refreshExams();
    } catch (e) {
      const detail = e?.body?.detail;
      if (detail && typeof detail === "object" && detail.code === "RULE_ALREADY_EXISTS") {
        setError("A rule with this scope and type already exists. Edit the existing row.");
      } else {
        setError(typeof detail === "string" ? detail : e?.message || "Save failed");
      }
    }
  }

  async function archiveRule(ruleId) {
    if (!window.confirm("Archive this rule? It will stop counting toward user eligibility.")) return;
    try {
      await api.del(`/api/admin/exam-eligibility/rules/${ruleId}`);
      await refreshRules(selectedExamId);
      await refreshExams();
    } catch (e) {
      setError(e?.message || "Archive failed");
    }
  }

  async function verifyRule(ruleId) {
    try {
      await api.put(`/api/admin/exam-eligibility/rules/${ruleId}`, {
        reviewer_status: "verified",
      });
      await refreshRules(selectedExamId);
      await refreshExams();
    } catch (e) {
      setError(e?.message || "Verify failed");
    }
  }

  if (exams === null) {
    return (
      <div className="space-y-4" data-testid="admin-exam-eligibility">
        <LoadingSkeleton variant="cards" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-exam-eligibility">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Knowledge governance
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          Exam eligibility rules
        </h1>
        <p className="text-muted-foreground mt-1">
          The baseline rules that decide which exams a user is shown as eligible for.
          Only <strong>verified</strong> rows feed the user-facing summary.
        </p>
      </div>

      {error && (
        <div
          role="status"
          className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2"
          data-testid="admin-exam-eligibility-error"
        >
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        {/* Left: exam list */}
        <div className="soft-card rounded-2xl p-3" data-testid="exam-list">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground px-2 pt-1 pb-3">
            Exams ({exams.length})
          </div>
          <div className="space-y-1">
            {exams.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedExamId(e.id)}
                data-testid={`exam-row-${e.slug}`}
                className={`w-full text-left rounded-xl px-3 py-2 text-sm ${
                  selectedExamId === e.id ? "bg-clay-100 text-clay-900" : "hover:bg-white/60"
                }`}
              >
                <div className="font-semibold flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5 text-clay-700" />
                  {e.name}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {e.rule_counts.verified} verified · {e.rule_counts.draft} draft
                  {e.rule_counts.archived ? ` · ${e.rule_counts.archived} archived` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: rules table */}
        <div className="soft-card rounded-2xl p-4" data-testid="rules-panel">
          {!selectedExamId ? (
            <div className="text-sm text-muted-foreground p-6 text-center">
              Select an exam on the left to view and edit its eligibility rules.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="font-heading text-xl font-semibold">{exam?.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {exam?.slug}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openNewRule}
                  className="btn btn-primary"
                  data-testid="new-rule-btn"
                >
                  <Plus className="h-3.5 w-3.5" /> New rule
                </button>
              </div>

              {form && (
                <form
                  onSubmit={submitForm}
                  className="rounded-xl border border-clay-300 bg-white/70 p-4 mb-4 space-y-3"
                  data-testid="rule-form"
                >
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                        Scope
                      </div>
                      <select
                        data-testid="rule-form-scope"
                        value={form.scope}
                        onChange={(e) => setForm({ ...form, scope: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-sm"
                      >
                        {SCOPES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                        Rule type
                      </div>
                      <select
                        data-testid="rule-form-type"
                        value={form.rule_type}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            rule_type: e.target.value,
                            value_num: "",
                            value_text: "",
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-sm"
                      >
                        {RULE_TYPES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    {NUMERIC_TYPES.has(form.rule_type) ? (
                      <label className="text-sm sm:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                          Numeric value
                        </div>
                        <input
                          type="number"
                          data-testid="rule-form-value-num"
                          value={form.value_num}
                          onChange={(e) => setForm({ ...form, value_num: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-sm"
                        />
                      </label>
                    ) : (
                      <label className="text-sm sm:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                          Text value
                        </div>
                        <input
                          type="text"
                          data-testid="rule-form-value-text"
                          value={form.value_text}
                          onChange={(e) => setForm({ ...form, value_text: e.target.value })}
                          placeholder="e.g. graduation"
                          className="w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-sm"
                        />
                      </label>
                    )}
                    <label className="text-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                        Reviewer status
                      </div>
                      <select
                        data-testid="rule-form-status"
                        value={form.reviewer_status}
                        onChange={(e) =>
                          setForm({ ...form, reviewer_status: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-sm"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                        Source URL
                      </div>
                      <input
                        type="url"
                        data-testid="rule-form-source-url"
                        value={form.source_url}
                        onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                        placeholder="https://upsc.gov.in/..."
                        className="w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-sm"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                        Source notes
                      </div>
                      <textarea
                        data-testid="rule-form-source-notes"
                        value={form.source_notes}
                        onChange={(e) =>
                          setForm({ ...form, source_notes: e.target.value })
                        }
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeForm}
                      className="btn btn-ghost"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      data-testid="rule-form-submit"
                      className="btn btn-primary"
                    >
                      {editingId ? "Save changes" : "Create rule"}
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="rules-table">
                  <thead className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    <tr className="border-b border-clay-200">
                      <th className="text-left py-2 pr-3">Scope</th>
                      <th className="text-left py-2 pr-3">Rule type</th>
                      <th className="text-left py-2 pr-3">Value</th>
                      <th className="text-left py-2 pr-3">Status</th>
                      <th className="text-left py-2 pr-3">Source</th>
                      <th className="text-left py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          No rules yet. Click <strong>New rule</strong> to add one.
                        </td>
                      </tr>
                    )}
                    {rules.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-clay-100/60 hover:bg-white/40"
                        data-testid={`rule-row-${r.id}`}
                      >
                        <td className="py-2 pr-3 font-mono text-xs">{r.scope}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{r.rule_type}</td>
                        <td className="py-2 pr-3">
                          {r.value_num != null ? r.value_num : r.value_text}
                        </td>
                        <td className="py-2 pr-3">
                          <StatusPill status={r.reviewer_status} />
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {r.source_url ? (
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="link-under"
                            >
                              source
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditRule(r)}
                              className="text-xs link-under"
                            >
                              edit
                            </button>
                            {r.reviewer_status !== "verified" && (
                              <button
                                type="button"
                                onClick={() => verifyRule(r.id)}
                                className="text-xs link-under text-sage-700"
                                data-testid={`verify-${r.id}`}
                              >
                                <ShieldCheck className="inline h-3 w-3" /> verify
                              </button>
                            )}
                            {r.reviewer_status !== "archived" && (
                              <button
                                type="button"
                                onClick={() => archiveRule(r.id)}
                                aria-label={`Archive rule ${r.scope} ${r.rule_type}`}
                                className="text-xs link-under text-destructive"
                              >
                                <X className="inline h-3 w-3" /> archive
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
