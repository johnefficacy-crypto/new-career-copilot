import React from "react";
import { Link, Outlet } from "react-router-dom";
import { Bell, Bot, Compass, CreditCard, Database, ExternalLink, FileSearch, GaugeCircle, LayoutGrid, LogOut, MessagesSquare, Radar, ScrollText, ShieldCheck, ShoppingBag, Users2 } from "lucide-react";
import { useAuth } from "../../lib/authContext";
import AppSidebar from "../../shared/layouts/AppSidebar";
import TopBar from "../../shared/layouts/TopBar";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, end: true, testId: "admin-nav-overview" },
  { to: "/admin/recruitments", label: "Recruitments", icon: FileSearch, testId: "admin-nav-recruitments" },
  { to: "/admin/eligibility-queue", label: "Eligibility queue", icon: GaugeCircle, testId: "admin-nav-eligibility-queue" },
  { to: "/admin/sources", label: "Source registry", icon: Database, testId: "admin-nav-source-registry" },
  { to: "/admin/scraper", label: "Scraper monitor", icon: Radar, testId: "admin-nav-scraper-monitor" },
  { to: "/admin/organizations", label: "Organizations", icon: Users2, testId: "admin-nav-organizations" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, testId: "admin-nav-notifications" },
  { to: "/admin/marketplace", label: "Marketplace", icon: ShoppingBag, testId: "admin-nav-marketplace" },
  { to: "/admin/plans", label: "Pricing & plans", icon: CreditCard, testId: "admin-nav-pricing-&-plans" },
  { to: "/admin/rbac", label: "RBAC & users", icon: ShieldCheck, testId: "admin-nav-rbac-&-users" },
  { to: "/admin/mentors", label: "Mentor verification", icon: Users2, testId: "admin-nav-mentor-verification" },
  { to: "/admin/community", label: "Community moderation", icon: MessagesSquare, testId: "admin-nav-community-moderation" },
  { to: "/admin/ai-policy", label: "AI policy", icon: Bot, testId: "admin-nav-ai-policy" },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText, testId: "admin-nav-audit-log" },
];

export default function AdminShell() {
  const auth = useAuth();
  return (
    <div className="min-h-screen flex bg-[#F1E9DB]">
      <aside className="hidden lg:flex"><AppSidebar brandIcon={Compass} brandTitle="Governance" brandSubtitle="Admin console" sections={[{ label: "", items: NAV }]} tone="admin" footer={{ bottom: <Link to="/app" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">Switch to aspirant view <ExternalLink className="h-3 w-3" /></Link> }} /></aside>
      <div className="flex-1 min-w-0">
        <TopBar className="bg-[#F5EDE0]/90 backdrop-blur border-clay-200" left={<div className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{auth.user?.email}</span> · role <span className="pill pill-dusk">{auth.user?.role}</span></div>} right={<div className="ml-auto flex items-center gap-3"><span className="text-xs text-muted-foreground font-mono">build · cc-2026.01.commercial</span><button onClick={auth.logout} className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border hover:bg-clay-100" data-testid="admin-logout"><LogOut className="h-3.5 w-3.5" /> Sign out</button></div>} />
        <main className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-up"><Outlet /></main>
      </div>
    </div>
  );
}
