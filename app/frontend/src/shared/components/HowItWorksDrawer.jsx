import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { lookupTopic } from "./howItWorksTopics";

// PR6: right-side slide-over.
//   - role="dialog" + aria-modal="true" + aria-labelledby on the title.
//   - Esc closes; backdrop click closes; close button closes.
//   - Focus moves to the close button on open and is returned to the
//     element that opened it on close (caller is expected to track that
//     itself via HowItWorksProvider's onOpen callback).
//   - Body scroll is locked while the drawer is open.
//   - Tab focus is bounded to the drawer while open (basic trap that
//     wraps around the first and last focusable inside).
export default function HowItWorksDrawer({ open, topic, data, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Body scroll lock.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Initial focus on the close button so keyboard users land somewhere
  // useful and can immediately Esc / Tab out.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus?.();
  }, [open, topic]);

  // Esc to close + focus trap inside the dialog.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  const entry = lookupTopic(topic);
  const title = entry?.title || "How it works";
  const description = entry?.description || null;
  const body = entry?.render?.(data) || (
    <p className="text-sm text-muted-foreground">
      This explainer hasn't been written yet. The drawer infrastructure is live
      so future topics can be added without re-touching this file.
    </p>
  );

  return (
    <div
      data-testid="how-it-works-drawer-root"
      className="fixed inset-0 z-50 flex"
    >
      <div
        data-testid="how-it-works-backdrop"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        data-topic={topic || ""}
        className="relative ml-auto h-full w-full max-w-md bg-[#FBF6EF] shadow-2xl flex flex-col animate-slide-in-right"
      >
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              How it works
            </div>
            <h2
              id="how-it-works-title"
              className="font-heading text-xl font-semibold mt-1"
            >
              {title}
            </h2>
            {description ? (
              <p className="text-sm text-muted-foreground mt-1.5">{description}</p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            data-testid="how-it-works-close"
            className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70 hover:bg-white shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-6 py-5 overflow-y-auto flex-1">{body}</div>
      </div>
    </div>
  );
}
