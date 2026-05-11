import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import { EmptyState, ErrorState, StatusBadge, useToast } from "../../shared/ui";

const ROLE_OPTIONS = ["user", "mentor", "admin", "super_admin"];
const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "role", label: "Role" },
  { value: "joined", label: "Joined" },
  { value: "last_login", label: "Last login" },
];

export default function AdminRBAC() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "admin", scope: "" });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const toast = useToast();
  const auth = useAuth();

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const d = await api.get("/api/admin/users");
      setItems(d.items || []);
    } catch (e) {
      setLoadError(e.message || "Users could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRole(person, role) {
    try {
      await api.put(`/api/admin/users/${person.id}/role`, { role });
      toast.success(`${person.email} is now ${role}.`);
      await load();
    } catch (e) {
      toast.error(`${person.email} role could not be changed: ${e.message}`);
    }
  }

  async function createAdmin(e) {
    e.preventDefault();
    try {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        role: form.role === "admin" || form.role === "mentor" ? form.role : "admin",
        scope: form.scope ? form.scope.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };
      await api.post("/api/admin/users/create", payload);
      setForm({ email: "", password: "", name: "", role: "admin", scope: "" });
      setOpen(false);
      toast.success(`Created ${payload.email}.`);
      await load();
    } catch (err) {
      toast.error(`Admin could not be created: ${err.message}`);
    }
  }

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((person) => {
      const matchesRole = roleFilter === "all" || person.role === roleFilter;
      const haystack = `${person.name || ""} ${person.email || ""} ${person.plan || ""}`.toLowerCase();
      return matchesRole && (!needle || haystack.includes(needle));
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "joined") return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      if (sortBy === "last_login") return String(b.last_login_at || "").localeCompare(String(a.last_login_at || ""));
      if (sortBy === "role") return String(a.role || "").localeCompare(String(b.role || ""));
      return String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""));
    });
  }, [items, query, roleFilter, sortBy]);

  const canManage = auth.user?.role === "super_admin";

  return (
    <div className="space-y-6" data-testid="admin-rbac">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">RBAC / users</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Who can do what.</h1>
        </div>
        {canManage && (
          <button onClick={() => setOpen(true)} className="btn btn-primary" data-testid="create-admin-btn">
            <Plus className="h-4 w-4" /> Invite admin / mentor
          </button>
        )}
      </div>

      <div className="soft-card rounded-2xl p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search users</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm"
              placeholder="Search name, email or plan"
              type="search"
            />
          </label>
          <label className="relative block">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Filter by role</span>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm">
              <option value="all">All roles</option>
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Sort users</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loadError && <ErrorState title="Users could not be loaded" message={loadError} onRetry={load} />}

      {!loadError && !loading && filteredItems.length === 0 && (
        <EmptyState icon={ShieldCheck} title="No users match this view" description="Adjust the search or role filter to widen the list." />
      )}

      {!loadError && (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-white/70 md:block">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#FBF6EF] text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Last login</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Loading users...</td></tr>}
                {!loading && filteredItems.map((person) => (
                  <UserTableRow key={person.id} person={person} canManage={canManage} onRoleChange={updateRole} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {loading && <div className="soft-card rounded-2xl p-4 text-sm text-muted-foreground">Loading users...</div>}
            {!loading && filteredItems.map((person) => (
              <UserCard key={person.id} person={person} canManage={canManage} onRoleChange={updateRole} />
            ))}
          </div>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Roles</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><StatusBadge status="user" label="user" tone="pill-sage" /> Aspirant: study, community, marketplace.</li>
            <li><StatusBadge status="mentor" label="mentor" tone="pill-amber" /> User permissions plus mentor dashboard.</li>
            <li><StatusBadge status="admin" label="admin" tone="pill-clay" /> Governance access except RBAC writes.</li>
            <li><StatusBadge status="super_admin" label="super_admin" tone="pill-dusk" /> Full access and admin creation.</li>
          </ul>
        </div>
        <div className="soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Scoped admin (planned)</div>
          <p className="mt-2 text-sm text-foreground/80">
            Super admins can store a scope list such as content, scraper, community, or notifications. The stored scope can later gate mutation endpoints and tailor admin navigation.
          </p>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <form onSubmit={createAdmin} className="w-full max-w-lg soft-card rounded-2xl p-6 space-y-4" data-testid="create-admin-form">
            <h2 className="font-heading text-xl font-semibold">Create admin or mentor</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><input type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Password"><input type="password" minLength={8} required className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
              <Field label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Role">
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option>admin</option>
                  <option>mentor</option>
                </select>
              </Field>
              <Field label="Scope (comma)" cls="sm:col-span-2"><input className="input" placeholder="content, scraper" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></Field>
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

function UserTableRow({ person, canManage, onRoleChange }) {
  return (
    <tr className="border-t border-border align-top hover:bg-clay-50/50" data-testid={`user-row-${person.email}`}>
      <td className="px-4 py-3">
        <div className="font-semibold">{person.name || "-"}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{person.email}</div>
      </td>
      <td className="px-4 py-3"><RoleControl person={person} canManage={canManage} onRoleChange={onRoleChange} /></td>
      <td className="px-4 py-3 text-xs">{person.plan || "-"}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(person.created_at)}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatLogin(person.last_login_at)}</td>
    </tr>
  );
}

function UserCard({ person, canManage, onRoleChange }) {
  return (
    <article className="soft-card rounded-2xl p-4" data-testid={`user-row-${person.email}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{person.name || "-"}</div>
          <div className="break-all font-mono text-[11px] text-muted-foreground">{person.email}</div>
        </div>
        <RoleControl person={person} canManage={canManage} onRoleChange={onRoleChange} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-muted-foreground">Plan</dt><dd className="font-medium">{person.plan || "-"}</dd></div>
        <div><dt className="text-muted-foreground">Joined</dt><dd>{formatDate(person.created_at)}</dd></div>
        <div className="col-span-2"><dt className="text-muted-foreground">Last login</dt><dd>{formatLogin(person.last_login_at)}</dd></div>
      </dl>
    </article>
  );
}

function RoleControl({ person, canManage, onRoleChange }) {
  if (!canManage) return <StatusBadge status={person.role} label={person.role} />;

  return (
    <select
      value={person.role}
      onChange={(e) => onRoleChange(person, e.target.value)}
      className="rounded-full border border-border bg-white/80 px-2 py-1 text-xs font-semibold"
      data-testid={`role-select-${person.email}`}
      aria-label={`Change role for ${person.email}`}
    >
      {ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}
    </select>
  );
}

function Field({ label, children, cls = "" }) {
  return (
    <label className={`block ${cls}`}>
      <div className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function formatDate(value) {
  return value ? String(value).slice(0, 10) : "-";
}

function formatLogin(value) {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}
