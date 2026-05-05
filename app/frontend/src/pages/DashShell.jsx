import React, { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Compass,
  LayoutDashboard,
  CalendarRange,
  Bookmark,
  ListChecks,
  BookOpenCheck,
  Timer,
  Trophy,
  LineChart,
  Users,
  MessagesSquare,
  ShoppingBag,
  GraduationCap,
  HandHeart,
  Bot,
  Bell,
  Search,
  Settings,
  LogOut,
  UserCircle,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { useAuth } from "../lib/authContext";

const SECTIONS = [
  {
    label: "Today",
    items: [
      { to: "/app", label: "Mission control", icon: LayoutDashboard, end: true },
      { to: "/app/today", label: "Today", icon: CalendarRange },
    ],
  },
  {
    label: "Recruitments",
    items: [
      { to: "/app/exams", label: "Exams", icon: BookOpenCheck },
      { to: "/app/saved", label: "Saved", icon: Bookmark },
      { to: "/app/tracker", label: "Application tracker", icon: ListChecks },
    ],
  },
  {
    label: "Study OS",
    items: [
      { to: "/app/study-plan", label: "Plan", icon: BookOpenCheck },
      { to: "/app/study/focus", label: "Focus timer", icon: Timer },
      { to: "/app/study/mocks", label: "Mock tests", icon: Trophy },
      { to: "/app/study/subjects", label: "Subjects", icon: LineChart },
      { to: "/app/study/review", label: "Weekly review", icon: LineChart },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/app/community", label: "Community", icon: MessagesSquare },
      { to: "/app/marketplace", label: "Marketplace", icon: ShoppingBag },
      { to: "/app/mentors", label: "Mentors", icon: GraduationCap },
      { to: "/app/accountability", label: "Accountability", icon: HandHeart },
    ],
  },
  {
    label: "AI",
    items: [{ to: "/app/ai", label: "Copilot AI", icon: Bot }],
  },
];

function Sidebar({ user, onClose }) {
  return (
    <aside className="w-72 shrink-0 flex flex-col border-r border-border bg-[#FBF6EF]/80 backdrop-blur">
      <Link to="/" className="h-16 px-5 flex items-center gap-2.5 border-b border-border">
        <div className="h-9 w-9 rounded-full bg-clay-500 grid place-items-center">
          <Compass className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="font-heading font-semibold text-[16px]">Career Copilot</div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Aspirant OS</div>
        </div>
      </Link>
      <nav className="flex-1 p-4 overflow-y-auto space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={onClose}
                  data-testid={`sidebar-${l.label.toLowerCase().replace(/\s/g, "-")}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                      isActive
                        ? "bg-clay-500 text-white font-semibold"
                        : "text-foreground/75 hover:bg-clay-100 hover:text-foreground"
                    }`
                  }
                >
                  <l.icon className="h-4 w-4" strokeWidth={1.8} />
                  {l.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {(user?.role === "admin" || user?.role === "super_admin") && (
          <div>
            <div className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Admin
            </div>
            <NavLink
              to="/admin"
              onClick={onClose}
              data-testid="sidebar-admin"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-dusk-100 text-dusk-700 hover:bg-dusk-200"
            >
              <Shield className="h-4 w-4" strokeWidth={1.8} /> Admin console
            </NavLink>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="rounded-xl bg-clay-100/70 border border-clay-200 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-clay-700">On Free plan</div>
          <div className="font-heading font-semibold mt-1 text-clay-800">Unlock full eligibility</div>
          <button className="mt-3 w-full bg-clay-500 text-white rounded-lg py-2 text-xs font-semibold">Upgrade to Pro · ₹399/mo</button>
        </div>
      </div>
    </aside>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative">
      <button
        data-testid="user-menu-btn"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-full bg-clay-500 text-white font-semibold text-xs grid place-items-center"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-20 w-60 soft-card rounded-xl p-2">
            <div className="px-3 py-2 border-b border-border mb-1">
              <div className="font-semibold text-sm">{user?.name || "—"}</div>
              <div className="text-[11px] text-muted-foreground">{user?.email}</div>
              <div className="pill pill-dusk mt-2 inline-flex">{user?.role}</div>
            </div>
            <Link
              to="/app/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-clay-100"
              data-testid="menu-profile"
            >
              <UserCircle className="h-4 w-4" /> Profile
            </Link>
            <Link
              to="/app/onboarding"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-clay-100"
              data-testid="menu-onboarding"
            >
              <ListChecks className="h-4 w-4" /> Onboarding
            </Link>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10"
              data-testid="menu-logout"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashShell() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex paper-bg">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar user={auth.user} />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">
            <Sidebar user={auth.user} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className="h-16 bg-[#FBF6EF]/80 backdrop-blur border-b border-border flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30">
          <button
            className="lg:hidden h-9 w-9 grid place-items-center rounded-lg border border-border"
            onClick={() => setSidebarOpen(true)}
            data-testid="mobile-menu-toggle"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              data-testid="global-search"
              placeholder="Search exams, threads, mentors…"
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/80 border border-border focus:border-clay-400 text-sm outline-none"
            />
          </div>
          <button data-testid="notif-btn" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70 relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-clay-500" />
          </button>
          <Link to="/app/profile" className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70" data-testid="settings-btn">
            <Settings className="h-4 w-4" />
          </Link>
          <UserMenu user={auth.user} onLogout={auth.logout} />
        </header>

        <main key={pathname} className="p-5 lg:p-8 max-w-7xl mx-auto animate-fade-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
