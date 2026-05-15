import React from "react";
import { ShieldAlert } from "lucide-react";

// Shared admin safety banner — styled after the prototype's persona warning
// (red-dashed rose card). Both /admin/persona and /admin/exam-intelligence
// previously inlined near-identical markup; this keeps the safety copy
// consistent and in one place.
export default function AdminSafetyBanner({ title, children, icon: Icon = ShieldAlert, testId, tone = "rose" }) {
  const toneClass =
    tone === "rose"
      ? "border-dashed border-[#D9B4A6] bg-[#F2DDD6]"
      : "border border-[#E7DECB] bg-[#FBF8F2]";
  const iconColor = tone === "rose" ? "text-[#7A3925]" : "text-clay-700";
  const titleColor = tone === "rose" ? "text-[#7A3925]" : "text-clay-900";
  const bodyColor = tone === "rose" ? "text-[#7A3925]/85" : "text-clay-700";
  return (
    <div
      role="note"
      className={`relative overflow-hidden rounded-[18px] border ${toneClass} p-4 flex items-start gap-3`}
      data-testid={testId}
    >
      <Icon className={`h-5 w-5 mt-0.5 ${iconColor}`} aria-hidden="true" />
      <div className="text-sm">
        <div className={`eyebrow ${titleColor === "text-[#7A3925]" ? "!text-[#7A3925]" : ""}`}>{title}</div>
        <div className={`mt-1.5 ${bodyColor}`}>{children}</div>
      </div>
    </div>
  );
}
