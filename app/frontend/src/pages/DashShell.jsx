import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Activity, Bell, Bookmark, Bot, CalendarRange, Compass, FileText, GraduationCap, HandHeart, Layers, Library, LineChart, Menu, MessagesSquare, NotebookPen, RotateCw, Settings, Shield, ShoppingBag, Tag, Trophy, Users, XCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { api } from "../lib/api";
import AppSidebar from "../shared/layouts/AppSidebar";
import TopBar from "../shared/layouts/TopBar";
import UserMenu from "../shared/layouts/UserMenu";

const SECTIONS = [
  {
    // PR4 of the Today / Eligibility / Study reorg: primary section
    // collapsed to three areas. Exams / Study Plan / Tracker live
    // under Eligibility + Study now. Profile leaves the sidebar
    // primary entirely; it's reached via UserMenu in the top bar
    // (route /app/profile stays mounted).
    id: "primary",
    items: [
      { to: "/app/today", label: "Today", icon: CalendarRange, testId: "sidebar-today" },
      { to: "/app/eligibility", label: "Eligibility", icon: ShieldCheck, testId: "sidebar-eligibility" },
      { to: "/app/study", label: "Study", icon: GraduationCap, testId: "sidebar-study" },
    ],
  },
  {
    label: "Learning",
    testId: "sidebar-section-learning",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/app/study/subjects", label: "Subjects", icon: LineChart, testId: "sidebar-subjects" },
      { to: "/app/notes", label: "Notes", icon: NotebookPen, testId: "sidebar-notes" },
      { to: "/app/flashcards", label: "Flashcards", icon: Layers, testId: "sidebar-flashcards" },
      { to: "/app/study/mistakes", label: "Mistakes", icon: XCircle, testId: "sidebar-mistakes" },
      { to: "/app/study/revision", label: "Revision", icon: RotateCw, testId: "sidebar-revision" },
      { to: "/app/study/mocks", label: "Mocks", icon: Trophy, testId: "sidebar-mock-tests" },
    ],
  },
  {
    label: "Progress",
    testId: "sidebar-section-progress",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/app/study/review", label: "Report Card", icon: FileText, testId: "sidebar-report-card" },
      { to: "/app/study/compare", label: "Compare Effort", icon: Activity, testId: "sidebar-compare-effort" },
      { to: "/app/reports", label: "Reports", icon: FileText, testId: "sidebar-reports" },
    ],
  },
  {
    label: "Community",
    testId: "sidebar-section-community",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/app/community", label: "Community", icon: MessagesSquare, testId: "sidebar-community" },
      { to: "/app/groups", label: "Groups", icon: Users, testId: "sidebar-groups" },
      { to: "/app/partners", label: "Partners", icon: HandHeart, testId: "sidebar-partners" },
      { to: "/app/mentors", label: "Mentors", icon: GraduationCap, testId: "sidebar-mentors" },
      { to: "/app/resources", label: "Resources", icon: Library, testId: "sidebar-resources" },
    ],
  },
  {
    label: "More",
    testId: "sidebar-section-more",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/app/marketplace", label: "Marketplace", icon: ShoppingBag, testId: "sidebar-marketplace" },
      { to: "/app/ai", label: "AI", icon: Bot, testId: "sidebar-copilot-ai" },
      { to: "/app/notifications", label: "Notifications", icon: Bell, testId: "sidebar-notifications" },
      { to: "/app/pricing", label: "Pricing", icon: Tag, testId: "sidebar-pricing" },
      { to: "/app/saved", label: "Saved", icon: Bookmark, testId: "sidebar-saved" },
    ],
  },
];

export default function DashShell() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Immersive surfaces have their own primary nav (e.g. Community's spaces
  // rail). Hide the global sidebar and lift the centered max-width on these
  // routes so the screen breathes.
  const immersive = pathname.startsWith("/app/community");

  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => { api.get("/api/notifications/me/unread-count").then((d) => setUnreadCount(Number(d?.count || 0))).catch(() => setUnreadCount(0)); }, [pathname]);

  return (
    <div className="min-h-screen flex linen-bg">
      {immersive ? null : (
        <div className="hidden lg:block"><AppSidebar brandIcon={Compass} brandTitle="Career Copilot" brandSubtitle="Aspirant OS" sections={SECTIONS} user={auth.user} footer={{ adminLink: <Link to="/admin" data-testid="sidebar-admin" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-dusk-100 text-dusk-700 hover:bg-dusk-200"><Shield className="h-4 w-4" strokeWidth={1.8} /> Admin console</Link>, bottom: <div className="rounded-xl bg-clay-100/70 border border-clay-200 p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-clay-700">Upgrade</div><div className="font-heading font-semibold mt-1 text-clay-800">Unlock the full study OS</div><Link to="/app/pricing" data-testid="sidebar-upgrade" className="mt-3 w-full bg-clay-500 text-white rounded-lg py-2 text-xs font-semibold inline-block text-center">See plans</Link></div> }} /></div>
      )}
      {sidebarOpen && <div className="lg:hidden fixed inset-0 z-40 flex"><div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} /><div className="relative z-10"><AppSidebar brandIcon={Compass} brandTitle="Career Copilot" brandSubtitle="Aspirant OS" sections={SECTIONS} user={auth.user} onClose={() => setSidebarOpen(false)} footer={{ adminLink: <Link to="/admin" onClick={() => setSidebarOpen(false)} data-testid="sidebar-admin" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-dusk-100 text-dusk-700 hover:bg-dusk-200"><Shield className="h-4 w-4" strokeWidth={1.8} /> Admin console</Link> }} /></div></div>}

      <div className="flex-1 min-w-0">
        <TopBar className="bg-[#FBF6EF]/80 backdrop-blur" left={<button className="lg:hidden h-9 w-9 grid place-items-center rounded-lg border border-border" onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-toggle" aria-label="Open navigation menu"><Menu className="h-4 w-4" /></button>} center={<div className="flex-1" />} right={<><Link to="/app/notifications" data-testid="notif-btn" aria-label="Open notifications" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70 relative"><Bell className="h-4 w-4" />{unreadCount > 0 && <span className="absolute -top-1 -right-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-clay-500 text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}</Link><Link to="/app/profile" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70" data-testid="settings-btn" aria-label="Open profile settings"><Settings className="h-4 w-4" /></Link><UserMenu user={auth.user} onLogout={auth.logout} /></>} />
        <main key={pathname} className={immersive ? "animate-fade-up" : "p-5 lg:p-8 max-w-7xl mx-auto animate-fade-up"}><Outlet /></main>
      </div>
    </div>
  );
}
