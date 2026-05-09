import React from "react";

const base = "animate-pulse bg-clay-100 rounded-md";

export default function LoadingSkeleton({ variant = "card", className = "" }) {
  if (variant === "text") {
    return (
      <div role="status" aria-live="polite" className={`space-y-2 ${className}`}>
        <div className={`${base} h-4 w-2/3`} />
        <div className={`${base} h-4 w-1/2`} />
        <span className="sr-only">Loading content</span>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div role="status" aria-live="polite" className={`soft-card rounded-2xl p-4 space-y-3 ${className}`}>
        <div className={`${base} h-5 w-1/3`} />
        {[...Array(4)].map((_, i) => <div key={i} className={`${base} h-9 w-full`} />)}
        <span className="sr-only">Loading table data</span>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div role="status" aria-live="polite" className={`soft-card rounded-2xl p-4 space-y-4 ${className}`}>
        <div className={`${base} h-5 w-1/4`} />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className={`${base} h-3 w-1/5`} />
            <div className={`${base} h-10 w-full`} />
          </div>
        ))}
        <span className="sr-only">Loading form</span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={`soft-card rounded-2xl p-4 space-y-3 ${className}`}>
      <div className={`${base} h-5 w-1/3`} />
      <div className={`${base} h-4 w-full`} />
      <div className={`${base} h-4 w-5/6`} />
      <div className={`${base} h-9 w-32`} />
      <span className="sr-only">Loading card</span>
    </div>
  );
}
