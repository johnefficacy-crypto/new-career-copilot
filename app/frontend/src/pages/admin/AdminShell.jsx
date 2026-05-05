import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Compass, LayoutGrid, FileSearch, GaugeCircle, ShieldCheck, Users2,
  MessagesSquare, Bot, ScrollText, ExternalLink, Database, Radar, Bell, ShoppingBag, CreditCard, LogOut,
} from "lucide-react";
import { useAuth } from "../../lib/authContext";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/admin/recruitments", label: "Recruitments", icon: FileSearch },
  { to: "/admin/eligibility-queue", label: "Eligibility queue", icon: GaugeCircle },
  { to: "/admin/sources", label: "Source registry", icon: Database },
  { to: "/admin/scraper", label: "Scraper monitor", icon: Radar },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/admin/plans", label: "Pricing & plans", icon: CreditCard },
  { to: "/admin/rbac", label: "RBAC & users", icon: ShieldCheck },
  { to: "/admin/mentors", label: "Mentor verification", icon: Users2 },
  { to: "/admin/community", label: "Community moderation", icon: MessagesSquare },
  { to: "/admin/ai-policy", label: "AI policy", icon: Bot },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default function AdminShell() {
  const auth = useAuth();
  return (
    <div className="min-h-screen flex bg-[#F1E9DB]">
      <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-clay-200 bg-[#F5EDE0]/95 backdrop-blur">
        <Link to="/" className="h-16 px-5 flex items-center gap-2.5 border-b border-clay-200">
          <div className="h-9 w-9 rounded-full bg-dusk-700 grid place-items-center">
            <Compass className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-heading font-semibold text-[15px]">Governance</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-dusk-500">Admin console</div>
          </div>
        </Link>
        <nav className="flex-1 p-3 space-y-0.5 overflow-auto">
          {NAV.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              data-testid={`admin-nav-${l.label.toLowerCase().replace(/\s/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? "bg-dusk-700 text-white font-semibold"
                    : "text-foreground/75 hover:bg-clay-100 hover:text-foreground"
                }`
              }
            >
              <l.icon className="h-4 w-4" strokeWidth={1.8} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-clay-200 text-[11px]">
          <Link to="/app" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            Switch to aspirant view <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="h-16 border-b border-clay-200 flex items-center gap-4 px-6 bg-[#F5EDE0]/90 backdrop-blur">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{auth.user?.email}</span> · role <span className="pill pill-dusk">{auth.user?.role}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono">build · cc-2026.01.commercial</span>
            <button
              onClick={auth.logout}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border hover:bg-clay-100"
              data-testid="admin-logout"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </header>
        <main className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
