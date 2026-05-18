import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, Loader2 } from "lucide-react";
import { api } from "../../../lib/api";

// Per-feature unlock cards. Each card maps to a real user-facing
// capability, lists the *specific* missing fields the user has to fill,
// and lets them resolve those fields without leaving the dashboard
// via a small inline form that calls /api/profile/onboarding-answer.
//
// This replaces the old single-percent readiness gauge. A user can
// look at this and know exactly what to do next; no vanity number,
// no guessing.

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
      // The endpoint takes one question_key per call — fan out so a
      // single "Add now" click can fill multiple missing fields.
      const entries = Object.entries(values).filter(([, v]) => v !== "" && v != null);
      for (const [question_key, value] of entries) {
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
