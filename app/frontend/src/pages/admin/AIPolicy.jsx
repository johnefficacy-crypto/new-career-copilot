import React, { useEffect, useState } from "react";
import { Bot, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import { LoadingSkeleton, StatusBadge } from "../../shared/ui";

export default function AdminAIPolicy() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/api/admin/ai-policy").then(setD).catch(() => {});
  }, []);
  if (!d) return <div className="space-y-4" data-testid="admin-ai-policy"><LoadingSkeleton variant="cards" /></div>;
  const rules = Array.isArray(d.rules) ? d.rules : [];
  return (
    <div className="space-y-6" data-testid="admin-ai-policy">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">AI policy</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">What the model is allowed to say.</h1>
        <p className="text-muted-foreground mt-1">Current model: <StatusBadge status="active" label={d.model} /> <span className="mx-1">/</span> Target: <StatusBadge status="pending" label={d.swap_target} /></p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {rules.map((r, idx) => (
          <div key={r.id || `${r.rule || "rule"}-${idx}`} className="soft-card rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sage-600" />
              <div className="font-semibold">{r.id || "policy_rule"}</div>
              <span className={`pill ${r.enabled ? "pill-sage" : "pill-amber"} ml-auto`}>{r.enabled ? "enabled" : "off"}</span>
            </div>
            <p className="mt-2 text-sm text-foreground/85">{r.rule}</p>
          </div>
        ))}
      </div>
      <div className="soft-card rounded-2xl p-5 flex items-start gap-3">
        <Bot className="h-5 w-5 text-clay-600 mt-0.5" />
        <div className="text-sm">
          <div className="font-semibold">AI guardrails promise</div>
          <p className="text-muted-foreground mt-1">
            Career Copilot AI explains, summarises and extracts. It never overrides a deterministic verdict. Phase-2 wires
            a real provider, logs prompts, and exposes this rule set to the community.
          </p>
        </div>
      </div>
    </div>
  );
}
