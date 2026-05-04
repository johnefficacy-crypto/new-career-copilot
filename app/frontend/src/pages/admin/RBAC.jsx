"import React from \"react\";
import { ShieldCheck } from \"lucide-react\";

const PEOPLE = [
  { n: \"Kavya Menon\", e: \"kavya@careercopilot.in\", r: \"super_admin\", since: \"2024-11-02\" },
  { n: \"Rahul Dey\", e: \"rahul@careercopilot.in\", r: \"admin\", since: \"2025-02-14\" },
  { n: \"Sneha Kapoor\", e: \"sneha@careercopilot.in\", r: \"moderator\", since: \"2025-06-08\" },
  { n: \"Aarav Joshi\", e: \"aarav@careercopilot.in\", r: \"content_editor\", since: \"2025-09-21\" },
  { n: \"Mira Khan\", e: \"mira@careercopilot.in\", r: \"analyst\", since: \"2025-12-01\" },
];

const ROLES = [
  { key: \"super_admin\", perms: [\"*\"], color: \"bg-[#F56A3F]/20 text-[#FFAB00]\" },
  { key: \"admin\", perms: [\"recruitment.*\", \"notifications.*\", \"mentor.verify\"], color: \"bg-emerald-500/20 text-emerald-300\" },
  { key: \"moderator\", perms: [\"community.moderate\", \"community.hide\"], color: \"bg-indigo-500/20 text-indigo-300\" },
  { key: \"content_editor\", perms: [\"resource.edit\", \"template.edit\"], color: \"bg-amber-500/20 text-amber-300\" },
  { key: \"analyst\", perms: [\"read-only\"], color: \"bg-white/10 text-white/70\" },
];

export default function AdminRBAC() {
  return (
    <div className=\"space-y-5\">
      <div>
        <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">RBAC</div>
        <h1 className=\"mt-1 font-heading text-3xl font-black tracking-tighter\">Who can do what.</h1>
      </div>

      <div className=\"grid lg:grid-cols-3 gap-5\">
        <div className=\"lg:col-span-2 rounded-2xl glass-dark p-2\">
          <table className=\"w-full text-sm\">
            <thead>
              <tr className=\"text-[10px] uppercase tracking-[0.22em] text-white/40 font-semibold\">
                <th className=\"text-left px-4 py-3\">Name</th>
                <th className=\"text-left px-4 py-3\">Role</th>
                <th className=\"text-left px-4 py-3\">Since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {PEOPLE.map((p) => (
                <tr key={p.e} className=\"border-t border-white/5 hover:bg-white/5\">
                  <td className=\"px-4 py-3\">
                    <div className=\"font-bold\">{p.n}</div>
                    <div className=\"text-[11px] text-white/50 font-mono\">{p.e}</div>
                  </td>
                  <td className=\"px-4 py-3\"><span className=\"text-[11px] font-mono\">{p.r}</span></td>
                  <td className=\"px-4 py-3 text-white/50 text-[12px] font-mono\">{p.since}</td>
                  <td className=\"px-4 py-3 text-right\"><button className=\"text-[11px] font-bold text-[#FFAB00] hover:underline\">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className=\"rounded-2xl glass-dark p-5 space-y-3\">
          <div className=\"text-[11px] uppercase tracking-[0.22em] text-white/40 font-semibold\">Roles</div>
          {ROLES.map((r) => (
            <div key={r.key} className=\"rounded-xl border border-white/10 p-3\">
              <div className=\"flex items-center justify-between\">
                <div className=\"inline-flex items-center gap-2 font-semibold\"><ShieldCheck className=\"h-3.5 w-3.5\" /> {r.key}</div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${r.color}`}>{r.perms.length} perms</span>
              </div>
              <div className=\"mt-1.5 flex flex-wrap gap-1\">
                {r.perms.map((p) => (
                  <span key={p} className=\"text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/60\">{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
"