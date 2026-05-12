import React from "react";
import { NavLink } from "react-router-dom";

export default function NavSection({ label, items = [], onItemClick, tone = "app", collapsed = false }) {
  return (
    <div>
      {label && !collapsed && <div className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div>}
      <div className="space-y-0.5">
        {items.map((l) => <NavLink key={l.to} to={l.to} end={l.end} onClick={onItemClick} data-testid={l.testId} title={collapsed ? l.label : l.description} className={({ isActive }) => `flex items-center ${collapsed ? "justify-center px-2" : "gap-2.5 px-3"} py-2 rounded-lg text-sm transition ${isActive ? tone === "admin" ? "bg-dusk-700 text-white font-semibold" : "bg-clay-500 text-white font-semibold" : "text-foreground/75 hover:bg-clay-100 hover:text-foreground"}`}><l.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />{!collapsed && <span className="truncate">{l.label}</span>}</NavLink>)}
      </div>
    </div>
  );
}
