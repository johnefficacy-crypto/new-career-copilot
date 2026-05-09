import React from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div className="soft-card rounded-2xl p-6 border border-destructive/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          {message && <p className="text-sm text-muted-foreground mt-1">{message}</p>}
          {onRetry && <button type="button" className="btn btn-ghost mt-3" onClick={onRetry}>Retry</button>}
        </div>
      </div>
    </div>
  );
}
