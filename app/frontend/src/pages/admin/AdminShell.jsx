"import React from \"react\";
import { Link, NavLink, Outlet } from \"react-router-dom\";
import {
  Sparkles, LayoutGrid, FileSearch, GaugeCircle, ShieldCheck, Users2,
  MessagesSquare, Bot, ScrollText, ExternalLink,
} from \"lucide-react\";

const NAV = [
  { to: \"/admin\", label: \"Overview\", icon: LayoutGrid, end: true },
  { to: \"/admin/recruitments\", label: \"Recruitments\", icon: FileSearch },
  { to: \"/admin/eligibility-queue\", label: \"Eligibility Queue\", icon: GaugeCircle },
  { to: \"/admin/rbac\", label: \"RBAC\", icon: ShieldCheck },
  { to: \"/admin/mentors\", label: \"Mentor Verification\", icon: Users2 },
  { to: \"/admin/community\", label: \"Community Mod\", icon: MessagesSquare },
  { to: \"/admin/ai-policy\", label: \"AI Policy\", icon: Bot },
  { to: \"/admin/audit\", label: \"Audit Log\", icon: ScrollText },
];

export default function AdminShell() {
  return (
    <div className=\"min-h-screen flex bg-[#0B0F19] text-[#FDFBF7]\">
      <aside className=\"hidden lg:flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#0B0F19]\">
        <Link to=\"/\" className=\"h-16 px-5 flex items-center gap-2.5 border-b border-white/10\">
          <div className=\"h-9 w-9 rounded-xl bg-gradient-to-br from-[#F56A3F] via-[#FFAB00] to-[#10B981] grid place-items-center\">
            <Sparkles className=\"h-4 w-4 text-white\" strokeWidth={2.5} />
          </div>
          <div>
            <div className=\"font-heading font-black text-[15px]\">Governance</div>
            <div className=\"text-[10px] uppercase tracking-[0.22em] text-white/50\">Admin console</div>
          </div>
        </Link>

        <nav className=\"flex-1 p-3 space-y-0.5 overflow-auto\">
          <div className=\"px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold\">Control plane</div>
          {NAV.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              data-testid={`admin-nav-${l.label.toLowerCase().replace(/\s/g, \"-\")}`}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                  isActive ? \"bg-white text-[#0B0F19]\" : \"text-white/70 hover:bg-white/5 hover:text-white\"
                }`
              }
            >
              <l.icon className=\"h-4 w-4\" />
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className=\"p-4 border-t border-white/10 text-[11px] text-white/50\">
          <Link to=\"/app\" className=\"inline-flex items-center gap-1 hover:text-white\">
            Switch to aspirant view <ExternalLink className=\"h-3 w-3\" />
          </Link>
        </div>
      </aside>

      <div className=\"flex-1 min-w-0\">
        <header className=\"h-16 border-b border-white/10 flex items-center gap-4 px-6\">
          <div className=\"text-sm text-white/60\">
            <span className=\"font-semibold text-white\">super_admin@careercopilot.in</span> · emergency kill-switch:
            <span className=\"ml-2 inline-flex items-center gap-1.5 text-emerald-400 font-semibold\">
              <span className=\"h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse\" /> armed
            </span>
          </div>
          <div className=\"ml-auto text-xs text-white/60 font-mono\">build · cc-2026.04.29</div>
        </header>
        <main className=\"p-6 lg:p-8 animate-fade-up\">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
"