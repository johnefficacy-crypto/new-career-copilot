import React from "react";
import { BadgeCheck, ShieldQuestion, ShieldAlert, HelpCircle } from "lucide-react";

// Maps an exam-intelligence source trust status to a consistent pill.
// Only `official` / `verified` sources are safe to lock into Study OS.
const TRUST_MAP = {
  official: { tone: "pill-sage", label: "Official source", icon: BadgeCheck },
  verified: { tone: "pill-sage", label: "Verified source", icon: BadgeCheck },
  verified_aggregator: { tone: "pill-amber", label: "Verified aggregator", icon: ShieldQuestion },
  aggregator: { tone: "pill-amber", label: "Aggregator", icon: ShieldQuestion },
  unverified: { tone: "pill-clay", label: "Unverified", icon: ShieldAlert },
  unverified_aggregator: { tone: "pill-clay", label: "Unverified aggregator", icon: ShieldAlert },
  unknown: { tone: "pill-dusk", label: "Unknown source", icon: HelpCircle },
};

export default function SourceTrustBadge({ status, label }) {
  const key = String(status || "unknown").toLowerCase();
  const preset = TRUST_MAP[key] || TRUST_MAP.unknown;
  const Icon = preset.icon;
  return (
    <span className={`pill ${preset.tone}`} title={`source trust: ${key}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label || preset.label}</span>
    </span>
  );
}
