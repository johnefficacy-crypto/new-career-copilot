import React from "react";
import { StatusBadge } from "../../../shared/ui";

export default function SourceHealthBadge({ source }) {
  const failed = (source.consecutive_fails || 0) > 0 || !!source.last_error;
  const needsReview = source.verification_status === "needs_review";
  const healthy = !!source.is_verified && !failed;
  if (failed) return <StatusBadge status="rejected" label="Failed" />;
  if (needsReview) return <StatusBadge status="needs_review" label="Needs review" />;
  if (healthy) return <StatusBadge status="verified" label="Healthy" />;
  return <StatusBadge status="pending" label="Unknown" />;
}
