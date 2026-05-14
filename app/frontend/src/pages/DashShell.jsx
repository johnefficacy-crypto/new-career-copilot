import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Bell, Bookmark, Bot, CalendarRange, Compass, GraduationCap, HandHeart, LayoutDashboard, LineChart, ListChecks, Menu, MessagesSquare, Search, Settings, Shield, ShoppingBag, Timer, Trophy, BookOpenCheck } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { api } from "../lib/api";
import AppSidebar from "../shared/layouts/AppSidebar";
import TopBar from "../shared/layouts/TopBar";
import UserMenu from "../shared/layouts/UserMenu";

const SECTIONS = [
  { label: "Today", items: [{ to: "/app", label: "Mission control", icon: LayoutDashboard, end: true, testId: "sidebar-mission-control" }, { to: "/app/today", label: "Today", icon: CalendarRange, testId: "sidebar-today" }] },
  { label: "Recruitments", items: [{ to: "/app/exams", label: "Exams", icon: BookOpenCheck, testId: "sidebar-exams" }, { to: "/app/saved", label: "Saved", icon: Bookmark, testId: "sidebar-saved" }, { to: "/app/tracker", label: "Application tracker", icon: ListChecks, testId: "sidebar-application-tracker" }, { to: "/app/notifications", label: "Notifications", icon: Bell, testId: "sidebar-notifications" }] },
  { label: "Study OS", items: [{ to: "/app/study-plan", label: "Plan", icon: BookOpenCheck, testId: "sidebar-plan" }, { to: "/app/study/focus", label: "Focus timer", icon: Timer, testId: "sidebar-focus-timer" }, { to: "/app/study/mocks", label: "Mock tests", icon: Trophy, testId: "sidebar-mock-tests" }, { to: "/app/study/subjects", label: "Subjects", icon: LineChart, testId: "sidebar-subjects" }, { to: "/app/study/review", label: "Weekly review", icon: LineChart, testId: "sidebar-weekly-review" }] },
  { label: "People", items: [{ to: "/app/community", label: "Community", icon: MessagesSquare, testId: "sidebar-community" }, { to: "/app/marketplace", label: "Marketplace", icon: ShoppingBag, testId: "sidebar-marketplace" }, { to: "/app/mentors", label: "Mentors", icon: GraduationCap, testId: "sidebar-mentors" }, { to: "/app/accountability", label: "Accountability", icon: HandHeart, testId: "sidebar-accountability" }] },
  { label: "AI", items: [{ to: "/app/ai", label: "Copilot AI", icon: Bot, testId: "sidebar-copilot-ai" }] },
];

export default function DashShell() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => { api.get("/api/notifications/me/unread-count").then((d) => setUnreadCount(Number(d?.count || 0))).catch(() => setUnreadCount(0)); }, [pathname]);

  return (
    <div className="min-h-screen flex linen-bg">
      <div className="hidden lg:block"><AppSidebar brandIcon={Compass} brandTitle="Career Copilot" brandSubtitle="Aspirant OS" sections={SECTIONS} user={auth.user} footer={{ adminLink: <Link to="/admin" data-testid="sidebar-admin" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-dusk-100 text-dusk-700 hover:bg-dusk-200"><Shield className="h-4 w-4" strokeWidth={1.8} /> Admin console</Link>, bottom: <div className="rounded-xl bg-clay-100/70 border border-clay-200 p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-clay-700">Upgrade</div><div className="font-heading font-semibold mt-1 text-clay-800">Unlock the full study OS</div><Link to="/app/pricing" data-testid="sidebar-upgrade" className="mt-3 w-full bg-clay-500 text-white rounded-lg py-2 text-xs font-semibold inline-block text-center">See plans</Link></div> }} /></div>
      {sidebarOpen && <div className="lg:hidden fixed inset-0 z-40 flex"><div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} /><div className="relative z-10"><AppSidebar brandIcon={Compass} brandTitle="Career Copilot" brandSubtitle="Aspirant OS" sections={SECTIONS} user={auth.user} onClose={() => setSidebarOpen(false)} footer={{ adminLink: <Link to="/admin" onClick={() => setSidebarOpen(false)} data-testid="sidebar-admin" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-dusk-100 text-dusk-700 hover:bg-dusk-200"><Shield className="h-4 w-4" strokeWidth={1.8} /> Admin console</Link> }} /></div></div>}

      <div className="flex-1 min-w-0">
        <TopBar className="bg-[#FBF6EF]/80 backdrop-blur" left={<button className="lg:hidden h-9 w-9 grid place-items-center rounded-lg border border-border" onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-toggle" aria-label="Open navigation menu"><Menu className="h-4 w-4" /></button>} center={<div className="relative flex-1 max-w-xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><input data-testid="global-search" placeholder="Search exams, threads, mentors…" className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/80 border border-border focus:border-clay-400 text-sm outline-none" /></div>} right={<><Link to="/app/notifications" data-testid="notif-btn" aria-label="Open notifications" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70 relative"><Bell className="h-4 w-4" />{unreadCount > 0 && <span className="absolute -top-1 -right-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-clay-500 text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}</Link><Link to="/app/profile" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70" data-testid="settings-btn" aria-label="Open profile settings"><Settings className="h-4 w-4" /></Link><UserMenu user={auth.user} onLogout={auth.logout} /></>} />
        <main key={pathname} className="p-5 lg:p-8 max-w-7xl mx-auto animate-fade-up"><Outlet /></main>
      </div>
    </div>
  );
}
