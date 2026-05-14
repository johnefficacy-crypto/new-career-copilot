import React from "react";
import { NavLink } from "react-router-dom";

export default function NavSection({ label, items = [], onItemClick, tone = "app", collapsed = false }) {
  const adminTone = tone === "admin";
  return (
    <div>
      {label && !collapsed && <div className="nav-section">{label}</div>}
      <div className="space-y-0.5">
        {items.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={onItemClick}
            data-testid={l.testId}
            title={collapsed ? l.label : l.description}
            className={({ isActive }) =>
              `nav-link ${adminTone ? "nav-link-admin" : ""} ${isActive ? "active" : ""} ${collapsed ? "justify-center" : ""}`
            }
          >
            <l.icon className="nav-glyph h-4 w-4 shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="truncate flex-1">{l.label}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
