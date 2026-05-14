import React from "react";
import { ShieldAlert } from "lucide-react";
import { EvidenceDrawer } from "../../../shared/ui";

// Known internal persona dimension values. If any of these strings appear
// in copy that is flagged user-facing, that is a safety problem — the
// inspector surfaces it so an admin notices before it ships.
const INTERNAL_LABELS = [
  "confused_explorer", "targeted_exam_aspirant", "multi_exam_optimizer",
  "recruitment_specific_applicant", "basic_eligibility", "conditional_edge_case",
  "document_sensitive", "category_relaxation_sensitive",
  "experience_or_certification_sensitive", "beginner", "restarting_aspirant",
  "intermediate", "repeater", "final_window_aspirant", "full_time_aspirant",
  "working_professional", "college_student", "family_responsibility_high",
  "low_availability", "planner_poor_executor", "hardworking_inefficient",
  "mock_avoider", "high_mock_low_review", "revision_backlog_heavy",
  "consistent_executor", "deadline_anxious", "low_confidence", "high_intent",
  "dropoff_risk", "social_accountability_seeker", "budget_sensitive",
  "free_first", "paid_guidance_open", "mentor_needed", "resource_overloaded",
];

// Derive any safety warnings from a snapshot. Read-only — purely a display aid.
export function derivePersonaSafetyWarnings(snapshot) {
  const warnings = [];
  if (!snapshot) return warnings;
  const evidence = Array.isArray(snapshot.evidence) ? snapshot.evidence : [];
  if (!evidence.length) {
    warnings.push("Snapshot has no recorded evidence — dimensions cannot be replayed.");
  }
  // A snapshot should never carry a field that is meant for direct display.
  const userFacing = snapshot.user_facing_copy || snapshot.display_label;
  if (typeof userFacing === "string") {
    const leaked = INTERNAL_LABELS.find((l) => userFacing.toLowerCase().includes(l));
    if (leaked) {
      warnings.push(`User-facing copy appears to contain the internal label "${leaked}".`);
    }
  }
  if (snapshot.primary_persona && snapshot.is_user_visible) {
    warnings.push("Snapshot is flagged user-visible but carries an internal primary_persona label.");
  }
  return warnings;
}

export default function PersonaEvidenceDrawer({ snapshot, defaultOpen = false }) {
  const evidence = Array.isArray(snapshot?.evidence) ? snapshot.evidence : [];
  const warnings = derivePersonaSafetyWarnings(snapshot);
  return (
    <EvidenceDrawer
      label="Evidence & safety"
      items={evidence}
      count={evidence.length}
      defaultOpen={defaultOpen}
      emptyText="No evidence recorded for this snapshot."
      testId="persona-evidence-drawer"
    >
      {warnings.length ? (
        <div className="rounded-xl bg-dusk-50 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-dusk-700">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Safety warnings
          </div>
          <ul className="mt-1 space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-dusk-800">• {w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl bg-sage-50 px-3 py-2 text-xs text-sage-800">
          No safety issues detected. Persona labels stay internal.
        </div>
      )}
    </EvidenceDrawer>
  );
}
