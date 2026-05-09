import React from "react";
import { Link } from "react-router-dom";
import NavSection from "./NavSection";

export default function AppSidebar({ brandIcon: BrandIcon, brandTitle, brandSubtitle, sections, footer, user, onClose, tone = "app" }) {
  return <aside className="w-72 shrink-0 flex flex-col border-r border-border bg-[#FBF6EF]/80 backdrop-blur"><Link to="/" className="h-16 px-5 flex items-center gap-2.5 border-b border-border"><div className={`h-9 w-9 rounded-full ${tone === "admin" ? "bg-dusk-700" : "bg-clay-500"} grid place-items-center`}>{BrandIcon && <BrandIcon className="h-4 w-4 text-white" />}</div><div><div className="font-heading font-semibold text-[15px]">{brandTitle}</div><div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{brandSubtitle}</div></div></Link><nav className="flex-1 p-4 overflow-y-auto space-y-5">{sections.map((s) => <NavSection key={s.label} label={s.label} items={s.items} onItemClick={onClose} tone={tone} />)}{footer?.adminLink && (user?.role === "admin" || user?.role === "super_admin") && footer.adminLink}</nav>{footer?.bottom && <div className="p-4 border-t border-border">{footer.bottom}</div>}</aside>;
}
