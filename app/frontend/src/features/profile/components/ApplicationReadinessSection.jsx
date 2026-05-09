import React from "react";
import { useFormContext } from "react-hook-form";
import { Section } from "./shared";

export default function ApplicationReadinessSection() {
  const { watch } = useFormContext();
  const phone = watch("phone");
  const nationality = watch("nationality");
  const govtEmployee = watch("govt_employee");
  return <Section title="Application readiness" helper="Read-only summary from primary profile fields to avoid duplicate edits."><div className="text-sm text-muted-foreground space-y-1"><div>Phone: <span className="text-foreground">{phone || "Not provided"}</span></div><div>Nationality: <span className="text-foreground">{nationality || "Not provided"}</span></div><div>Government employee: <span className="text-foreground">{govtEmployee ? "Yes" : "No"}</span></div></div></Section>;
}
