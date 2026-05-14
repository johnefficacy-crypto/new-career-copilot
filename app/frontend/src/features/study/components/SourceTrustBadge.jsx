import React from "react";
import { ShieldCheck, CircleHelp, FlaskConical, Sparkles, BadgeCheck, AlertCircle } from "lucide-react";

const VARIANTS = {
  official: {
    label: "Officially verified",
    short: "Official",
    className: "bg-sage-700 text-sage-50 border-sage-700",
    Icon: ShieldCheck,
  },
  verified: {
    label: "Verified",
    short: "Verified",
    className: "bg-sage-100 text-sage-800 border-sage-300",
    Icon: BadgeCheck,
  },
  aggregator: {
    label: "Aggregator · needs verification",
    short: "Aggregator",
    className: "bg-white text-dusk-700 border-dashed border-dusk-300",
    Icon: CircleHelp,
  },
  needs_verification: {
    label: "Needs verification",
    short: "Needs verification",
    className: "bg-white text-dusk-700 border-dashed border-dusk-300",
    Icon: AlertCircle,
  },
  research: {
    label: "Research · not official",
    short: "Research",
    className: "bg-clay-100 text-clay-800 border-clay-200",
    Icon: FlaskConical,
  },
  opportunity: {
    label: "Opportunity · matched",
    short: "Opportunity",
    className: "bg-dusk-800 text-dusk-50 border-dusk-800",
    Icon: Sparkles,
  },
};

export default function SourceTrustBadge({ kind, compact = false, withIcon = true, className = "" }) {
  const variant = VARIANTS[kind];
  if (!variant) return null;
  const { label, short, className: variantClass, Icon } = variant;
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
        "text-[10px] font-semibold uppercase tracking-[0.08em]",
        "border",
        variantClass,
        className,
      ].join(" ")}
      data-testid={`trust-badge-${kind}`}
    >
      {withIcon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
      {compact ? short : label}
    </span>
  );
}
