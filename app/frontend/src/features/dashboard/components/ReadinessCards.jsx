import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, Loader2 } from "lucide-react";
import { api } from "../../../lib/api";

// Per-feature unlock cards. Each card maps to a real user-facing
// capability, lists the *specific* missing fields the user has to fill,
// and lets them resolve those fields without leaving the dashboard
// via a small inline form.
//
// Most of the readiness fields (full_name, date_of_birth, category,
// domicile_state, study_mode, weekly_hours_goal, target_exam, phone)
// are canonical profile data and must be written through PUT
// /api/profile/me — they are NOT keys in persona_question_bank, so
// POSTing them to /api/profile/onboarding-answer returns 404 "Unknown
// question_key". /onboarding-answer is reserved for keys the bank
// actually declares.

// Fields that resolve via PUT /api/profile/me. The value here is the
// payload key on ProfileUpdate. `target_exam` lives in
// aspirant_preferences.target_exams (array), so it ships as
// `goal_exams: [value]` — matches the existing Profile page path.
const PROFILE_FIELD_PAYLOAD_KEYS = {
  full_name: "full_name",
  phone: "phone",
  date_of_birth: "date_of_birth",
  category: "category",
  domicile_state: "domicile_state",
  study_mode: "study_mode",
  weekly_hours_goal: "weekly_hours_goal",
  target_exam: "goal_exams",
};

// Document fields are handled via uploads on /app/profile, not text.
const DOCUMENT_FIELDS = new Set(["photo_doc", "signature_doc", "category_certificate"]);

const FIELD_LABELS = {
  full_name: "Full name",
  phone: "Phone",
  date_of_birth: "Date of birth",
  category: "Reservation category",
  domicile_state: "Domicile state",
  target_exam: "Target exam",
  study_mode: "Study mode",
  weekly_hours_goal: "Weekly study hours",
  photo_doc: "Photo",
  signature_doc: "Signature",
  category_certificate: "Category certificate",
};

function labelFor(field) {
  return FIELD_LABELS[field] || field;
}

function FieldRow({ field, value, onChange }) {
  // Documents need uploads — we point the user at /app/profile rather
  // than collecting binary here. Everything else fits in a text input.
  if (field.endsWith("_doc") || field === "category_certificate") {
    return (
      <a
        href="/app/profile#documents"
        className="text-xs link-under text-clay-700"
      >
        Upload {labelFor(field)} →
      </a>
    );
  }
  return (
    <label className="block text-xs text-clay-700">
      <span className="block mb-1">{labelFor(field)}</span>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-clay-200 px-2 py-1 text-sm"
        data-testid={`readiness-field-${field}`}
      />
    </label>
  );
}

function FeatureCard({ feature, onSave }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const missing = feature.missing_fields || [];

  if (feature.unlocked) {
    return (
      <div
        data-testid={`readiness-card-${feature.key}`}
        className="soft-card rounded-2xl p-4 flex items-center gap-2 border border-sage-200"
      >
        <CheckCircle2 className="h-4 w-4 text-sage-600" aria-hidden="true" />
        <div>
          <div className="text-sm font-medium text-clay-900">{feature.label}</div>
          <div className="text-xs text-sage-700">Unlocked</div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch (err) {
      setError(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={`readiness-card-${feature.key}`}
      className="soft-card rounded-2xl p-4 border border-clay-200 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-amber-600" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-sm font-medium text-clay-900">{feature.label}</div>
          <div className="text-xs text-muted-foreground">
            Missing: {missing.map(labelFor).join(", ")}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {missing.map((field) => (
          <FieldRow
            key={field}
            field={field}
            value={values[field]}
            onChange={(v) => setValues((s) => ({ ...s, [field]: v }))}
          />
        ))}
      </div>
      {error && <p className="text-xs text-amber-700">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="btn btn-primary text-xs"
        data-testid={`readiness-save-${feature.key}`}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add now"}
      </button>
    </form>
  );
}

export default function ReadinessCards() {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/profile/readiness");
      setFeatures(data?.features || []);
    } catch {
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveField = useCallback(
    async (values) => {
      const entries = Object.entries(values).filter(([, v]) => v !== "" && v != null);
      const profilePatch = {};
      const questionAnswers = [];
      for (const [field, value] of entries) {
        if (DOCUMENT_FIELDS.has(field)) continue; // uploads, not text saves
        const payloadKey = PROFILE_FIELD_PAYLOAD_KEYS[field];
        if (payloadKey === "goal_exams") {
          profilePatch[payloadKey] = Array.isArray(value) ? value : [value];
        } else if (payloadKey) {
          profilePatch[payloadKey] = value;
        } else {
          // Not a profile field — assume it's a persona_question_bank key.
          questionAnswers.push([field, value]);
        }
      }
      if (Object.keys(profilePatch).length > 0) {
        await api.put("/api/profile/me", profilePatch);
      }
      for (const [question_key, value] of questionAnswers) {
        await api.post("/api/profile/onboarding-answer", {
          question_key,
          value,
          skipped: false,
        });
      }
      await load();
    },
    [load],
  );

  const cards = useMemo(() => features, [features]);
  if (loading) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="readiness-loading">
        Loading readiness…
      </div>
    );
  }
  if (!cards.length) return null;

  return (
    <section
      data-testid="readiness-cards"
      aria-label="Profile readiness"
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      {cards.map((feature) => (
        <FeatureCard key={feature.key} feature={feature} onSave={saveField} />
      ))}
    </section>
  );
}
