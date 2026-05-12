import React from "react";
import { RowActions } from "../../../shared/ui";

export default function RecruitmentTrustActions({ row, onAction, busyKey }) {
  const blocking = row.blocking_issues || [];
  const canPublish = blocking.length === 0;
  const publishTitle = canPublish ? "Publish recruitment" : `Publish blocked: ${blocking.join(", ")}`;

  return (
    <RowActions
      groupLabel={`Row actions for ${row.name}`}
      actions={[
        { label: "Validate readiness", ariaLabel: `Validate publish readiness for ${row.name}`, onClick: () => onAction(row.id, "validate-publish"), disabled: busyKey === `validate-publish-${row.id}` },
        { label: "Mark verified", ariaLabel: `Mark ${row.name} verified`, onClick: () => onAction(row.id, "verify"), disabled: busyKey === `verify-${row.id}` },
        { label: "Publish", ariaLabel: `Publish ${row.name}`, primary: true, title: publishTitle, onClick: () => onAction(row.id, "publish", { confirm: "Publish this recruitment to users? This should only happen after official source, organization, posts, and eligibility rules are verified." }), disabled: !canPublish || busyKey === `publish-${row.id}` },
        { label: "Archive", ariaLabel: `Archive ${row.name}`, onClick: () => onAction(row.id, "archive", { confirm: `Archive ${row.name}?` }), disabled: busyKey === `archive-${row.id}` },
        { label: "Withdraw", ariaLabel: `Withdraw ${row.name}`, onClick: () => onAction(row.id, "withdraw", { confirm: `Withdraw ${row.name}?` }), disabled: busyKey === `withdraw-${row.id}` },
      ]}
    />
  );
}
