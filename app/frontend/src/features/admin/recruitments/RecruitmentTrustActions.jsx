import React from "react";
import { RowActions } from "../../../shared/ui";

export default function RecruitmentTrustActions({ row, onAction }) {
  const blocking = row.blocking_issues || [];
  const canPublish = blocking.length === 0;
  const publishTitle = canPublish ? "Publish recruitment" : `Publish blocked: ${blocking.join(", ")}`;

  return (
    <RowActions
      groupLabel={`Row actions for ${row.name}`}
      actions={[
        { label: "Validate", ariaLabel: `Validate ${row.name}`, onClick: () => onAction(row.id, "validate-publish") },
        { label: "Verify", ariaLabel: `Verify ${row.name}`, onClick: () => onAction(row.id, "verify") },
        { label: "Publish", ariaLabel: `Publish ${row.name}`, primary: true, disabled: !canPublish, title: publishTitle, onClick: () => { if (window.confirm(`Publish ${row.name}?`)) onAction(row.id, "publish"); } },
        { label: "Archive", ariaLabel: `Archive ${row.name}`, onClick: () => onAction(row.id, "archive") },
        { label: "Withdraw", ariaLabel: `Withdraw ${row.name}`, onClick: () => onAction(row.id, "withdraw") },
      ]}
    />
  );
}
