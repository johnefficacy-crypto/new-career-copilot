import React from "react";
import { Link } from "react-router-dom";
import NavSection from "./NavSection";

export default function AppSidebar({ brandTitle, brandSubtitle, sections, footer, user, onClose, tone = "app", collapsed = false }) {
  return (
    <aside
      className={`${collapsed ? "w-20" : "w-72"} shrink-0 flex flex-col border-r border-border bg-[#FBF4E8] transition-[width] duration-200`}
    >
      <Link
        to="/"
        className={`h-16 ${collapsed ? "justify-center px-3" : "px-4"} flex items-center gap-2.5 border-b border-border`}
        title={collapsed ? `${brandTitle} ${brandSubtitle}` : undefined}
      >
        <div
          className={`h-8 w-8 rounded-lg ${tone === "admin" ? "bg-dusk-700" : "bg-ink"} grid shrink-0 place-items-center`}
        >
          <span className="font-heading text-[15px] leading-none text-[#F3EADB]">cc</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-heading font-semibold text-[15px] leading-tight">{brandTitle}</div>
            <div className="truncate num-mono text-[9.5px] uppercase tracking-[0.1em] text-clay-700">{brandSubtitle}</div>
          </div>
        )}
      </Link>
      <nav className={`${collapsed ? "p-3" : "p-3"} flex-1 overflow-y-auto`}>
        {sections.map((s) => (
          <NavSection
            key={s.label || s.id}
            label={s.label}
            items={s.items}
            onItemClick={onClose}
            tone={tone}
            collapsed={collapsed}
            collapsible={!!s.collapsible}
            defaultOpen={s.defaultOpen !== false}
            testId={s.testId}
          />
        ))}
        {!collapsed && footer?.adminLink && (user?.role === "admin" || user?.role === "super_admin") && (
          <div className="mt-4">{footer.adminLink}</div>
        )}
      </nav>
      {!collapsed && footer?.bottom && <div className="p-4 border-t border-border">{footer.bottom}</div>}
    </aside>
  );
}
