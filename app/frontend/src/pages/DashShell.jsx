"import React from \"react\";
import { Link, NavLink, Outlet, useLocation } from \"react-router-dom\";
import { LayoutDashboard, BookOpen, Users, CalendarRange, Sparkles, Bell, Search, Settings } from \"lucide-react\";

const LINKS = [
  { to: \"/app\", label: \"Dashboard\", icon: LayoutDashboard, end: true },
  { to: \"/app/exams\", label: \"Exams\", icon: CalendarRange },
  { to: \"/app/study-plan\", label: \"Study Plan\", icon: BookOpen },
  { to: \"/app/community\", label: \"Community\", icon: Users },
];

export default function DashShell() {
  const { pathname } = useLocation();
  return (
    <div className=\"min-h-screen flex bg-[#FDFBF7]\">
      <aside className=\"hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-white\">
        <Link to=\"/\" className=\"h-16 px-5 flex items-center gap-2.5 border-b border-border\">
          <div className=\"h-9 w-9 rounded-xl bg-gradient-to-br from-[#F56A3F] via-[#FFAB00] to-[#10B981] grid place-items-center\">
            <Sparkles className=\"h-4 w-4 text-white\" strokeWidth={2.5} />
          </div>
          <div>
            <div className=\"font-heading font-black text-[15px]\">Career Copilot</div>
            <div className=\"text-[10px] uppercase tracking-[0.22em] text-muted-foreground\">aspirant OS</div>
          </div>
        </Link>

        <nav className=\"flex-1 p-3 space-y-1\">
          <div className=\"px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold\">Mission control</div>
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              data-testid={`sidebar-${l.label.toLowerCase().replace(/\s/g, \"-\")}`}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                  isActive
                    ? \"bg-foreground text-background\"
                    : \"text-foreground/70 hover:bg-black/5 hover:text-foreground\"
                }`
              }
            >
              <l.icon className=\"h-4 w-4\" />
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className=\"p-4 border-t border-border\">
          <div className=\"rounded-xl bg-gradient-to-br from-[#F56A3F] to-[#FFAB00] p-4 text-white\">
            <div className=\"text-[10px] uppercase tracking-[0.22em] opacity-80\">On Free</div>
            <div className=\"font-heading font-black mt-1\">Unlock full eligibility</div>
            <button className=\"mt-3 w-full bg-black/20 hover:bg-black/30 rounded-lg py-2 text-xs font-bold transition\">Upgrade to Pro · ₹399/mo</button>
          </div>
        </div>
      </aside>

      <div className=\"flex-1 min-w-0\">
        <header className=\"h-16 bg-white border-b border-border flex items-center gap-4 px-5 sticky top-0 z-30\">
          <div className=\"relative flex-1 max-w-xl\">
            <Search className=\"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground\" />
            <input
              data-testid=\"global-search\"
              placeholder=\"Search exams, posts, resources…\"
              className=\"w-full pl-9 pr-4 py-2 rounded-lg bg-foreground/5 border border-transparent focus:border-border focus:bg-white text-sm outline-none\"
            />
          </div>
          <button data-testid=\"notif-btn\" className=\"h-9 w-9 grid place-items-center rounded-lg border border-border bg-white relative\">
            <Bell className=\"h-4 w-4\" />
            <span className=\"absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#F56A3F]\" />
          </button>
          <button data-testid=\"settings-btn\" className=\"h-9 w-9 grid place-items-center rounded-lg border border-border bg-white\">
            <Settings className=\"h-4 w-4\" />
          </button>
          <div className=\"h-9 w-9 rounded-full bg-gradient-to-br from-[#F56A3F] to-[#10B981] grid place-items-center text-white font-bold text-sm\">
            PS
          </div>
        </header>

        <main key={pathname} className=\"p-6 lg:p-8 animate-fade-up\">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
"