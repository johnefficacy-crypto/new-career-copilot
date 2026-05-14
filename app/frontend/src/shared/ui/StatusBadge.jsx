import React from "react";
import { CheckCircle2, Circle, Clock3, XCircle, ArrowUpCircle, Lock, PenLine, AlertCircle } from "lucide-react";

const STATUS_MAP = {
  read: { tone: "pill-dusk", label: "Read", icon: CheckCircle2 },
  unread: { tone: "pill-clay", label: "Unread", icon: Circle },
  published: { tone: "pill-sage", label: "Published", icon: CheckCircle2 },
  needs_review: { tone: "pill-amber", label: "Needs review", icon: Clock3 },
  verified: { tone: "pill-sage", label: "Verified", icon: CheckCircle2 },
  active: { tone: "pill-sage", label: "Active", icon: CheckCircle2 },
  disabled: { tone: "pill-dusk", label: "Disabled", icon: XCircle },
  inactive: { tone: "pill-dusk", label: "Inactive", icon: Circle },
  pending: { tone: "pill-amber", label: "Pending", icon: Clock3 },
  pending_review: { tone: "pill-amber", label: "Pending review", icon: Clock3 },
  rejected: { tone: "pill-clay", label: "Rejected", icon: XCircle },
  promoted: { tone: "pill-sage", label: "Promoted", icon: ArrowUpCircle },
  needs_correction: { tone: "pill-clay", label: "Needs correction", icon: AlertCircle },
  locked: { tone: "pill-sage", label: "Locked", icon: Lock },
  draft: { tone: "pill-dusk", label: "Draft", icon: PenLine },
  reviewed: { tone: "pill-amber", label: "Reviewed", icon: CheckCircle2 },
  partial: { tone: "pill-amber", label: "Partial", icon: Clock3 },
  ready: { tone: "pill-sage", label: "Ready", icon: CheckCircle2 },
  not_connected: { tone: "pill-dusk", label: "Not connected", icon: Circle },
  missing: { tone: "pill-clay", label: "Missing", icon: AlertCircle },
};

export default function StatusBadge({ status, tone, icon: IconProp, label }) {
  const preset = STATUS_MAP[String(status || "").toLowerCase()] || {};
  const Icon = IconProp || preset.icon || Circle;
  const text = label || preset.label || String(status || "Unknown");
  const pillTone = tone || preset.tone || "pill-dusk";

  return <span className={`pill ${pillTone}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> <span>{text}</span></span>;
}
