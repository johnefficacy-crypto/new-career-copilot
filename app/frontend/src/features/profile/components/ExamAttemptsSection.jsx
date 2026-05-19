import React, { useEffect, useState } from "react";
import { InputField } from "../../../shared/ui";
import { Grid, Section, SimpleList } from "./shared";

export default function ExamAttemptsSection({ newAttempt, setNewAttempt, attemptRows, setAttemptRows }) {
  const [exams, setExams] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import("../../../lib/api");
        const r = await api.get("/api/exam-intelligence/exams");
        if (!cancelled) setExams(r?.items || []);
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const examLabel = (key) => {
    if (!key) return "(unknown exam)";
    const m = exams.find((e) => e.id === key || e.slug === key);
    return m?.name || key;
  };
  return (
    <Section title="Exam attempts" helper="Track attempts for attempt-limited exams.">
      <Grid>
        <InputField
          label="Exam"
          list="exam-attempts-options"
          placeholder="Type to search exams…"
          value={newAttempt.exam_id}
          onChange={(e) => setNewAttempt({ ...newAttempt, exam_id: e.target.value })}
        />
        <datalist id="exam-attempts-options">
          {exams.map((e) => (
            <option key={e.id} value={e.slug}>{e.name}</option>
          ))}
        </datalist>
        <InputField
          label="Attempts used"
          type="number"
          min="0"
          value={newAttempt.attempts_used}
          onChange={(e) => setNewAttempt({ ...newAttempt, attempts_used: e.target.value })}
        />
      </Grid>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          const { api } = await import("../../../lib/api");
          const r = await api.post("/api/profile/exam-attempts", {
            exam_id: newAttempt.exam_id,
            attempts_used: Number(newAttempt.attempts_used || 0),
          });
          setAttemptRows((x) => [r.item, ...x]);
          setNewAttempt({ exam_id: "", attempts_used: 0 });
        }}
      >
        Add attempt
      </button>
      <SimpleList
        rows={attemptRows}
        onDelete={async (id) => {
          const { api } = await import("../../../lib/api");
          await api.delete(`/api/profile/exam-attempts/${id}`);
          setAttemptRows((x) => x.filter((r) => r.id !== id));
        }}
        render={(r) => `${examLabel(r.exam_ref_id || r.exam_id)} · attempts: ${r.attempts_used}`}
      />
    </Section>
  );
}
