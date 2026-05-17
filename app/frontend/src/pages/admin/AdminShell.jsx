import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Award, Bell, Bot, BookText, ChevronDown, Copyright as CopyrightIcon, CreditCard, Database, ExternalLink,
  FileSearch, Files, Flag, GaugeCircle, GraduationCap, LayoutGrid, LineChart,
  NotebookPen,
  LogOut, Menu, MessagesSquare, Network, Radar, ScrollText, ShieldCheck,
  ShoppingBag, Sparkles, UserSearch, Users2, Wrench, X,
} from "lucide-react";
import { useAuth } from "../../lib/authContext";

const COMMAND_CENTER = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, end: true, testId: "admin-nav-overview" },
  { to: "/admin/operations", label: "Operations", icon: LayoutGrid, end: true, testId: "admin-nav-operations" },
];

const TRUST_PIPELINE = [
  { to: "/admin/sources", label: "Source Registry", icon: Database, testId: "admin-nav-source-registry" },
  { to: "/admin/scraper", label: "Scrape Monitor", icon: Radar, testId: "admin-nav-scraper-monitor" },
  { to: "/admin/recruitments", label: "Recruitments", icon: FileSearch, testId: "admin-nav-recruitments" },
  { to: "/admin/eligibility-ops", label: "Eligibility Health", icon: GaugeCircle, testId: "admin-nav-eligibility-ops" },
  { to: "/admin/audit", label: "Audit Trail", icon: ScrollText, testId: "admin-nav-audit-log" },
];

const KNOWLEDGE_GOVERNANCE = [
  { to: "/admin/exam-intelligence", label: "Exam Intelligence", icon: GraduationCap, testId: "admin-nav-exam-intelligence" },
  { to: "/admin/organizations", label: "Organizations", icon: Users2, testId: "admin-nav-organizations" },
  { to: "/admin/ai-policy", label: "AI Governance", icon: Bot, testId: "admin-nav-ai-policy" },
  { to: "/admin/persona", label: "Persona", icon: Sparkles, testId: "admin-nav-persona" },
];

const COMMUNITY_MARKETPLACE = [
  { to: "/admin/community", label: "Community Hub", icon: MessagesSquare, end: true, testId: "admin-nav-community-hub" },
  { to: "/admin/community/groups", label: "Study Groups", icon: Users2, testId: "admin-nav-community-groups" },
  { to: "/admin/community/partners", label: "Partner Pairs", icon: Users2, testId: "admin-nav-community-partners" },
  { to: "/admin/community/resources", label: "Resource Queue", icon: NotebookPen, testId: "admin-nav-community-resources" },
  { to: "/admin/mentors", label: "Mentor Verification", icon: ShieldCheck, testId: "admin-nav-mentor-verification" },
  { to: "/admin/marketplace", label: "Marketplace", icon: ShoppingBag, testId: "admin-nav-marketplace" },
  { to: "/admin/plans", label: "Pricing & Plans", icon: CreditCard, testId: "admin-nav-pricing-&-plans" },
];

const STUDY_OS = [
  { to: "/admin/study-os", label: "User Study Inspector", icon: UserSearch, end: true, testId: "admin-nav-studyos-inspector" },
  { to: "/admin/study-os/plan-ops", label: "Plan Ops", icon: Wrench, testId: "admin-nav-studyos-planops" },
  { to: "/admin/study-os/artifacts", label: "Artifact Admin", icon: Files, testId: "admin-nav-studyos-artifacts" },
  { to: "/admin/study-os/mocks", label: "Mock Trust", icon: Award, testId: "admin-nav-studyos-mocks" },
  { to: "/admin/study-os/reports", label: "Report Jobs", icon: NotebookPen, testId: "admin-nav-studyos-reports" },
  { to: "/admin/study-os/social", label: "Social Admin", icon: Network, testId: "admin-nav-studyos-social" },
  { to: "/admin/study-os/exam-intel-cms", label: "Exam Intel CMS", icon: BookText, testId: "admin-nav-studyos-exam-intel-cms" },
  { to: "/admin/study-os/content-access", label: "Content Access (4-eyes)", icon: ShieldCheck, testId: "admin-nav-studyos-content-access" },
];

const SAFETY = [
  { to: "/admin/moderation", label: "Moderation Queue", icon: Flag, testId: "admin-nav-moderation" },
  { to: "/admin/copyright", label: "Copyright & Takedown", icon: CopyrightIcon, testId: "admin-nav-copyright" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, testId: "admin-nav-notifications" },
  { to: "/admin/rbac", label: "Access Control", icon: ShieldCheck, testId: "admin-nav-rbac-&-users" },
  { to: "/admin/kpis", label: "Leadership KPIs", icon: LineChart, testId: "admin-nav-kpis" },
  { to: "/admin/blogs", label: "Blog Funnel CMS", icon: NotebookPen, testId: "admin-nav-blogs" },
];

const SECTIONS = [
  { id: "command-center", label: "Command Center", items: COMMAND_CENTER, defaultOpen: true },
  { id: "trust-pipeline", label: "Trust Pipeline", items: TRUST_PIPELINE, defaultOpen: true },
  { id: "knowledge-governance", label: "Knowledge Governance", items: KNOWLEDGE_GOVERNANCE, defaultOpen: false },
  { id: "community-marketplace", label: "Community & Marketplace", items: COMMUNITY_MARKETPLACE, defaultOpen: false },
  { id: "study-os", label: "Study OS", items: STUDY_OS, defaultOpen: false },
  { id: "safety", label: "Safety", items: SAFETY, defaultOpen: false },
];

function formatSync(now) {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} · ${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function Sidebar({ onClose, openMap, onToggleSection }) {
  return (
    <aside className="oc-sidebar flex flex-col" data-testid="admin-sidebar">
      <div className="oc-brand">
        <Link to="/" className="block" title="Career Copilot · admin">
          <div className="lbl">Career Copilot · admin</div>
          <div className="oc-brand-title">Governance</div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto pb-3">
        {SECTIONS.map((section) => {
          const open = openMap[section.id];
          return (
            <div
              key={section.id}
              data-testid={`admin-nav-group-${section.id}`}
              data-expanded={open ? "true" : "false"}
            >
              <button
                type="button"
                className="oc-section oc-section-toggle"
                onClick={() => onToggleSection(section.id)}
                aria-expanded={open}
                aria-controls={`admin-nav-section-${section.id}`}
                data-testid={`admin-nav-section-toggle-${section.id}`}
              >
                <span>{section.label}</span>
                <ChevronDown
                  className="nav-chevron"
                  style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                  aria-hidden="true"
                />
              </button>
              {open ? (
                <div id={`admin-nav-section-${section.id}`}>
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
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="oc-sidebar-foot">
        <Link to="/app" className="inline-flex items-center gap-1">
          Switch to aspirant view <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </aside>
  );
}

function initialOpenMap(pathname) {
  const map = {};
  for (const section of SECTIONS) {
    map[section.id] = !!section.defaultOpen;
  }
  // Auto-open the section that contains the current route so the active
  // link is visible even when its group is collapsed by default.
  for (const section of SECTIONS) {
    if (section.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))) {
      map[section.id] = true;
    }
  }
  return map;
}

export default function AdminShell() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [openMap, setOpenMap] = useState(() => initialOpenMap(location.pathname));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    // When navigating to a route inside a collapsed group, expand that
    // group. Preserves any manual open/close the admin has already made.
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const section of SECTIONS) {
        if (section.items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))) {
          next[section.id] = true;
        }
      }
      return next;
    });
  }, [location.pathname]);

  const toggleSection = (id) => setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));

  const sync = useMemo(() => formatSync(now), [now]);
  const userEmail = auth.user?.email || "admin";
  const userRole = auth.user?.role || "admin";
  const userHandle = userEmail.includes("@") ? userEmail.split("@")[0] : userEmail;

  return (
    <div className="oc" data-testid="admin-shell">
      <div className="flex min-h-screen">
        <div className="hidden lg:flex">
          <Sidebar openMap={openMap} onToggleSection={toggleSection} />
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <div className="relative z-10">
              <Sidebar onClose={() => setMobileOpen(false)} openMap={openMap} onToggleSection={toggleSection} />
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

export { SECTIONS as ADMIN_NAV_SECTIONS };
