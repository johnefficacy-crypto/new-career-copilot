import React, { useRef } from "react";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";

export default function ConfirmActionDialog({ open, title, description, confirmLabel = "Confirm", danger = false, onCancel, onConfirm }) {
  const ref = useRef(null);
  const cancelRef = useRef(null);
  useFocusTrap({ active: open, containerRef: ref, onEscape: onCancel, initialFocusRef: cancelRef });
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/30" onClick={onCancel} /><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" className="relative w-full max-w-md rounded-xl border border-border bg-[#FBF6EF] p-4 space-y-3"><h2 id="confirm-action-title" className="font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p><div className="flex justify-end gap-2"><button ref={cancelRef} className="btn btn-ghost" onClick={onCancel}>Cancel</button><button className={`btn ${danger ? "btn-primary" : "btn-secondary"}`} onClick={onConfirm}>{confirmLabel}</button></div></div></div>;
}
