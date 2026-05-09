import React from "react";
import { Section } from "./shared";

export default function ApplicationReadinessSection({ form }) {
  return <Section title="Application readiness" helper="Read-only summary from primary profile fields to avoid duplicate edits."><div className="text-sm text-muted-foreground space-y-1"><div>Phone: <span className="text-foreground">{form.phone || "Not provided"}</span></div><div>Nationality: <span className="text-foreground">{form.nationality || "Not provided"}</span></div><div>Government employee: <span className="text-foreground">{form.govt_employee ? "Yes" : "No"}</span></div></div></Section>;
}
