import React, { useEffect, useState } from "react";
import { GaugeCircle } from "lucide-react";
import { api } from "../../lib/api";
import { ErrorState, LoadingSkeleton } from "../../shared/ui";

export default function AdminEligibilityOps() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      const r = await api.get("/api/admin/eligibility-ops");
      setData(r);
    } catch (e) {
      // Backend endpoint may not yet exist on some deployments.
      setError(e);
    }
  }

  useEffect(() => { load(); }, []);

  if (!data && !error) return <LoadingSkeleton variant="table" />;
  if (error) {
    return (
      <div className="space-y-4" data-testid="admin-eligibility-ops">
        <h1 className="font-heading text-3xl">Eligibility Ops</h1>
        <ErrorState title="Eligibility ops not available" message={error.message} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-eligibility-ops">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Operations</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <GaugeCircle className="h-6 w-6" /> Eligibility Ops
        </h1>
        <p className="text-muted-foreground mt-1">Downstream eligibility recompute monitoring. Distinct from the promotion queue.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Pending recomputes" value={data.pending_recomputes ?? 0} />
        <Stat label="Failed recomputes" value={data.failed_recomputes ?? 0} />
        <Stat label="Stale eligibility results" value={data.stale_results ?? 0} />
        <Stat label="Published awaiting recompute" value={data.published_awaiting ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="soft-card rounded-2xl p-5"><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div><div className="mt-2 font-heading text-3xl font-semibold">{value}</div></div>;
}
