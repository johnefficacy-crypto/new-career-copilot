import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell, Bot, Copyright as CopyrightIcon, CreditCard, Database, ExternalLink,
  FileSearch, Flag, GaugeCircle, GraduationCap, LayoutGrid, LineChart,
  NotebookPen,
  ListChecks, LogOut, Menu, MessagesSquare, Radar, ScrollText, ShieldCheck,
  ShoppingBag, Sparkles, Users2, X,
} from "lucide-react";
import { useAuth } from "../../lib/authContext";

const OPERATIONS_NAV = [
  { to: "/admin/operations", label: "Operations Console", icon: LayoutGrid, end: true, testId: "admin-nav-operations" },
  { to: "/admin/sources", label: "Source Registry", icon: Database, testId: "admin-nav-source-registry" },
  { to: "/admin/scraper", label: "Scrape Runs", icon: Radar, testId: "admin-nav-scraper-monitor" },
  { to: "/admin/recruitments", label: "Recruitments", icon: FileSearch, testId: "admin-nav-recruitments" },
  { to: "/admin/blogs", label: "Blog Funnel CMS", icon: NotebookPen, testId: "admin-nav-blogs" },
  { to: "/admin/eligibility-queue", label: "Promotion Queue", icon: ListChecks, testId: "admin-nav-promotion-queue" },
  { to: "/admin/eligibility-ops", label: "Eligibility Ops", icon: GaugeCircle, testId: "admin-nav-eligibility-ops" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, testId: "admin-nav-notifications" },
];

const GOVERNANCE_NAV = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, end: true, testId: "admin-nav-overview" },
  { to: "/admin/kpis", label: "Leadership KPIs", icon: LineChart, testId: "admin-nav-kpis" },
  { to: "/admin/moderation", label: "Moderation Queue", icon: Flag, testId: "admin-nav-moderation" },
  { to: "/admin/copyright", label: "Copyright & Takedown", icon: CopyrightIcon, testId: "admin-nav-copyright" },
  { to: "/admin/organizations", label: "Organizations", icon: Users2, testId: "admin-nav-organizations" },
  { to: "/admin/audit", label: "Audit Trail", icon: ScrollText, testId: "admin-nav-audit-log" },
  { to: "/admin/rbac", label: "RBAC & Users", icon: ShieldCheck, testId: "admin-nav-rbac-&-users" },
  { to: "/admin/ai-policy", label: "AI Policy", icon: Bot, testId: "admin-nav-ai-policy" },
  { to: "/admin/persona", label: "Persona", icon: Sparkles, testId: "admin-nav-persona" },
  { to: "/admin/exam-intelligence", label: "Exam Intelligence", icon: GraduationCap, testId: "admin-nav-exam-intelligence" },
];

const BUSINESS_NAV = [
  { to: "/admin/marketplace", label: "Marketplace", icon: ShoppingBag, testId: "admin-nav-marketplace" },
  { to: "/admin/plans", label: "Pricing & Plans", icon: CreditCard, testId: "admin-nav-pricing-&-plans" },
  { to: "/admin/mentors", label: "Mentors", icon: Users2, testId: "admin-nav-mentor-verification" },
  { to: "/admin/community", label: "Community", icon: MessagesSquare, testId: "admin-nav-community-moderation" },
];

const SECTIONS = [
  { label: "Operations", items: OPERATIONS_NAV },
  { label: "Governance", items: GOVERNANCE_NAV },
  { label: "Business", items: BUSINESS_NAV },
];

function formatSync(now) {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} · ${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function Sidebar({ onClose }) {
  return (
    <aside className="oc-sidebar flex flex-col" data-testid="admin-sidebar">
      <div className="oc-brand">
        <Link to="/" className="block" title="Career Copilot · admin">
          <div className="lbl">Career Copilot · admin</div>
          <div className="oc-brand-title">Governance</div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto pb-3">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="oc-section">{section.label}</div>
            <div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) => `oc-navlink${isActive ? " active" : ""}`}
                    data-testid={item.testId}
                  >
                    {Icon ? <Icon className="nav-glyph" /> : null}
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="oc-sidebar-foot">
        <Link to="/app" className="inline-flex items-center gap-1">
          Switch to aspirant view <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </aside>
  );
}

export default function AdminShell() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const sync = useMemo(() => formatSync(now), [now]);
  const userEmail = auth.user?.email || "admin";
  const userRole = auth.user?.role || "admin";
  const userHandle = userEmail.includes("@") ? userEmail.split("@")[0] : userEmail;

  return (
    <div className="oc" data-testid="admin-shell">
      <div className="flex min-h-screen">
        <div className="hidden lg:flex">
          <Sidebar />
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <div className="relative z-10">
              <Sidebar onClose={() => setMobileOpen(false)} />
            </div>
            <button
              type="button"
              className="absolute right-3 top-3 z-20 btn small"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <header className="mast">
            <div className="flex items-end gap-3 min-w-0">
              <button
                type="button"
                className="btn small lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open admin navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="lbl">Career Copilot · admin</div>
                <h1 className="oc-title disp" style={{ fontSize: "22px", marginTop: "2px" }}>
                  Admin operations console
                </h1>
              </div>
            </div>
            <div className="mast-meta">
              <div><strong>{userHandle}</strong> · {userRole}</div>
              <div>last sync {sync}</div>
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
                <span className="anno">build · cc-2026.01.commercial</span>
                <button
                  type="button"
                  className="btn small"
                  onClick={auth.logout}
                  data-testid="admin-logout"
                >
                  <LogOut className="h-3 w-3" /> Sign out
                </button>
              </div>
            </div>
          </header>
          <main className="oc-main animate-fade-up" data-testid="admin-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
