import React from "react";
import { Link } from "react-router-dom";
import { ADMIN_ROUTES_BY_STEP, ADMIN_WORKFLOW_STEPS } from "./adminWorkflowContract";

export default function AdminWorkflowStepper({ currentStep }) {
  const current = Array.isArray(currentStep) ? currentStep : [currentStep];
  return (
    <nav className="soft-card rounded-2xl p-3" aria-label="Admin workflow">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {ADMIN_WORKFLOW_STEPS.map((step, index) => {
          const active = current.includes(step);
          const route = ADMIN_ROUTES_BY_STEP[step];
          const content = (
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${active ? "border-sage-300 bg-sage-100 text-sage-900" : "border-border bg-white/60 text-muted-foreground"}`}>
              <span className="font-mono text-[10px]">{index + 1}</span>
              <span className="font-medium">{step}</span>
            </span>
          );
          return (
            <li key={step}>
              {route ? <Link to={route}>{content}</Link> : content}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
