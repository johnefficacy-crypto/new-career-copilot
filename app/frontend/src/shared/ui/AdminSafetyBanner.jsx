import React from "react";
import { ShieldAlert } from "lucide-react";

// Shared admin safety banner. Both /admin/persona and /admin/exam-intelligence
// previously inlined near-identical markup; this keeps the safety copy
// consistent and in one place.
export default function AdminSafetyBanner({ title, children, icon: Icon = ShieldAlert, testId }) {
  return (
    <div
      className="soft-card rounded-2xl p-4 flex items-start gap-3"
      data-testid={testId}
    >
      <Icon className="h-5 w-5 text-dusk-600 mt-0.5" aria-hidden="true" />
      <div className="text-sm">
        <div className="font-semibold">{title}</div>
        <div className="text-muted-foreground mt-1">{children}</div>
      </div>
    </div>
  );
}
