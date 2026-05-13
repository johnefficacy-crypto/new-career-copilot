import React from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid } from "lucide-react";

export default function OperationsConsole() {
  const [searchParams] = useSearchParams();
  const sourceId = searchParams.get("source_id");
  const queueId = searchParams.get("queue_id");
  const recruitmentId = searchParams.get("recruitment_id");

  return (
    <div className="space-y-4" data-testid="admin-operations-console">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Operations</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <LayoutGrid className="h-6 w-6" /> Scraper Operations Console
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Single command center for the scraper-to-publish pipeline. Promotion remains
          backend-gated; publish remains backend-gated. This console only guides admins
          through the steps without bypassing the trust-gate model.
        </p>
      </div>
      <div className="soft-card rounded-2xl p-6 text-sm text-muted-foreground" data-testid="admin-operations-context">
        Selected context: source <code>{sourceId || "-"}</code> · queue <code>{queueId || "-"}</code> · recruitment <code>{recruitmentId || "-"}</code>.
      </div>
    </div>
  );
}
