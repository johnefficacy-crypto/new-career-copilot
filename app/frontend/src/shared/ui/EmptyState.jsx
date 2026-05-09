import React from "react";
import { Link } from "react-router-dom";

export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction, actionHref }) {
  const Action = actionHref
    ? <Link to={actionHref} className="btn btn-primary">{actionLabel}</Link>
    : onAction
      ? <button type="button" onClick={onAction} className="btn btn-primary">{actionLabel}</button>
      : null;

  return (
    <div className="soft-card rounded-2xl p-8 text-center">
      {Icon && <Icon className="h-6 w-6 text-clay-600 mx-auto" aria-hidden="true" />}
      <h2 className="mt-3 font-heading text-xl font-semibold">{title}</h2>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      {Action && <div className="mt-4">{Action}</div>}
    </div>
  );
}
