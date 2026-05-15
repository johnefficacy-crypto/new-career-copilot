import React, { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Bell, Bot, Compass, CreditCard, Database, ExternalLink, FileSearch, GaugeCircle, GraduationCap, LayoutGrid, ListChecks, LogOut, Menu, MessagesSquare, PanelLeftClose, PanelLeftOpen, Radar, ScrollText, ShieldCheck, ShoppingBag, Sparkles, Users2 } from "lucide-react";
import { useAuth } from "../../lib/authContext";
import AppSidebar from "../../shared/layouts/AppSidebar";
import TopBar from "../../shared/layouts/TopBar";

const OPERATIONS_NAV = [
  { to: "/admin/operations", label: "Operations Console", icon: LayoutGrid, testId: "admin-nav-operations", description: "Run the full scraper-to-publish pipeline without losing context.", end: true },
  { to: "/admin/verification-gateway", label: "Verification Gateway", icon: ShieldCheck, testId: "admin-nav-verification-gateway", description: "Recruitment Verification Gateway — classify, resolve, consensus, publish gate." },
  { to: "/admin/sources", label: "Source Registry", icon: Database, testId: "admin-nav-source-registry", description: "Manage trusted official and discovery-only sources." },
  { to: "/admin/scraper", label: "Scrape Runs / Queue Review", icon: Radar, testId: "admin-nav-scraper-monitor", description: "Run discovery and review extracted candidates." },
  { to: "/admin/recruitments", label: "Recruitment Drafts / Publish Gate", icon: FileSearch, testId: "admin-nav-recruitments", description: "Validate, verify, and publish canonical recruitments." },
  { to: "/admin/eligibility-queue", label: "Promotion Queue", icon: ListChecks, testId: "admin-nav-promotion-queue", description: "Scraped candidates awaiting promotion review." },
  { to: "/admin/eligibility-ops", label: "Eligibility Ops", icon: GaugeCircle, testId: "admin-nav-eligibility-ops", description: "Eligibility recompute, stale results, and alerts." },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, testId: "admin-nav-notifications" },
];

const GOVERNANCE_NAV = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, end: true, testId: "admin-nav-overview" },
  { to: "/admin/organizations", label: "Organizations", icon: Users2, testId: "admin-nav-organizations", description: "Verify organization provenance for linked recruitments." },
  { to: "/admin/audit", label: "Audit Trail", icon: ScrollText, testId: "admin-nav-audit-log" },
  { to: "/admin/rbac", label: "RBAC & Users", icon: ShieldCheck, testId: "admin-nav-rbac-&-users" },
  { to: "/admin/ai-policy", label: "AI Policy", icon: Bot, testId: "admin-nav-ai-policy" },
  { to: "/admin/persona", label: "Persona", icon: Sparkles, testId: "admin-nav-persona", description: "Question bank, snapshots, and Study OS policy preview." },
  { to: "/admin/exam-intelligence", label: "Exam Intelligence", icon: GraduationCap, testId: "admin-nav-exam-intelligence", description: "Verify syllabus mentions and PYQ topic tags before they reach users." },
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

function AdminSidebar({ collapsed = false, onClose }) {
  return (
    <AppSidebar
      collapsed={collapsed}
      brandIcon={Compass}
      brandTitle="Governance"
      brandSubtitle="Admin console"
      sections={SECTIONS}
      tone="admin"
      onClose={onClose}
      footer={{
        bottom: (
          <Link to="/app" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            Switch to aspirant view <ExternalLink className="h-3 w-3" />
          </Link>
        ),
      }}
    />
  );
}

export default function AdminShell() {
  const auth = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("adminSidebarCollapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("adminSidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="flex min-h-screen linen-bg">
      <aside className="hidden lg:flex">
        <AdminSidebar collapsed={sidebarCollapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10">
            <AdminSidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <TopBar
          className="bg-[#F5EDE0]/90 backdrop-blur border-clay-200"
          left={(
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" className="btn btn-ghost h-9 w-9 p-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open admin navigation">
                <Menu className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost hidden h-9 w-9 p-0 lg:inline-flex"
                onClick={() => setSidebarCollapsed((value) => !value)}
                aria-label={sidebarCollapsed ? "Expand admin navigation" : "Collapse admin navigation"}
                title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
              <div className="min-w-0 truncate text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{auth.user?.email}</span> · role <span className="pill pill-dusk">{auth.user?.role}</span>
              </div>
            </div>
          )}
          right={(
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground font-mono sm:inline">build · cc-2026.01.commercial</span>
              <button onClick={auth.logout} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-clay-100" data-testid="admin-logout">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          )}
        />
        <main className="w-full max-w-none p-4 sm:p-6 lg:p-8 animate-fade-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
