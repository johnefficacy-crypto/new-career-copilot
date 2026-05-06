import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/authContext";

const ROLE_OPTIONS = ["user", "mentor", "admin", "super_admin"];

export default function AdminRBAC() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "admin", scope: "" });
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(null);
  const auth = useAuth();

  async function load() {
    const d = await api.get("/api/admin/users");
    setItems(d.items);
  }
  useEffect(() => {
    load();
  }, []);

  async function updateRole(id, role) {
    await api.put(`/api/admin/users/${id}/role`, { role });
    load();
  }

  async function createAdmin(e) {
    e.preventDefault();
    try {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        role: form.role === "admin" || form.role === "mentor" ? form.role : "admin",
        scope: form.scope ? form.scope.split(",").map((s) => s.trim()) : [],
      };
      await api.post("/api/admin/users/create", payload);
      setForm({ email: "", password: "", name: "", role: "admin", scope: "" });
      setOpen(false);
      setNote(`Created ${payload.email}`);
      load();
    } catch (err) {
      setNote(err.message);
    }
  }

  const canManage = auth.user?.role === "super_admin";

  return (
    <div className="space-y-6" data-testid="admin-rbac">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">RBAC · users</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Who can do what.</h1>
        </div>
        {canManage && (
          <button onClick={() => setOpen(true)} className="btn btn-primary" data-testid="create-admin-btn">
            <Plus className="h-4 w-4" /> Invite admin / mentor
          </button>
        )}
      </div>
      {note && <div className="soft-card rounded-xl p-3 text-sm bg-sage-50 border-sage-200">{note}</div>}

      <div className="soft-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Plan</th>
              <th className="text-left px-4 py-3">Joined</th>
              <th className="text-left px-4 py-3">Last login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-clay-50/50" data-testid={`user-row-${p.email}`}>
                <td className="px-4 py-3">
                  <div className="font-semibold">{p.name || "—"}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{p.email}</div>
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <select
                      value={p.role}
                      onChange={(e) => updateRole(p.id, e.target.value)}
                      className="px-2 py-1 rounded-full border border-border bg-white/80 text-xs font-semibold"
                      data-testid={`role-select-${p.email}`}
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="pill pill-dusk">{p.role}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">{p.plan}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{(p.created_at || "").slice(0, 10)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{(p.last_login_at || "—").slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Roles</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><span className="pill pill-sage">user</span> Aspirant — study, community, marketplace.</li>
            <li><span className="pill pill-amber">mentor</span> User perms + mentor dashboard, session acceptance.</li>
            <li><span className="pill pill-clay">admin</span> Full governance except RBAC writes.</li>
            <li><span className="pill pill-dusk">super_admin</span> Everything. Create other admins.</li>
          </ul>
        </div>
        <div className="soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Scoped admin (planned)</div>
          <p className="text-sm mt-2 text-foreground/80">
            Super admin can create admins with a <code className="font-mono">scope</code> list — e.g. <code className="font-mono">["content"]</code>,
            <code className="font-mono">["scraper"]</code>, or <code className="font-mono">["community","notifications"]</code>. In Phase-2 the
            scope gates mutation endpoints; Phase-1 stores the scope on the user document so the UI can show differentiated menus.
          </p>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4">
          <form onSubmit={createAdmin} className="w-full max-w-lg soft-card rounded-2xl p-6 space-y-4" data-testid="create-admin-form">
            <h2 className="font-heading text-xl font-semibold">Create admin or mentor</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Password"><input type="password" minLength={8} required className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
              <Field label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Role">
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option>admin</option>
                  <option>mentor</option>
                </select>
              </Field>
              <Field label="Scope (comma)" cls="col-span-2"><input className="input" placeholder="content, scraper" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
              <button className="btn btn-primary">Create</button>
            </div>
            <style>{`.input { width:100%; padding: 0.55rem 0.9rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; }`}</style>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, cls = "" }) {
  return (
    <label className={`block ${cls}`}>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
