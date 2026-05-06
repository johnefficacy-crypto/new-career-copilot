import React, { useEffect, useState } from "react";
import { Loader2, Save /* User */ } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

const CATEGORIES = ["general", "obc", "sc", "st", "ews"];

export default function Profile() {
  const auth = useAuth();
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api
      .get("/api/profile/me")
      .then((u) => {
        setForm({
          name: u.name || "",
          email: u.email || "",
          phone: u.profile?.phone || "",
          category: u.profile?.category || "general",
          gender: u.profile?.gender || "",
          state: u.profile?.state || "",
          date_of_birth: u.profile?.date_of_birth || "",
          qualification: u.profile?.qualification || "",
          qualification_year: u.profile?.qualification_year || "",
          percentage: u.profile?.percentage || "",
          weekly_hours_goal: u.profile?.weekly_hours_goal || 35,
          target_exam_year: u.profile?.target_exam_year || 2026,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const body = { ...form };
      delete body.email;
      if (body.qualification_year) body.qualification_year = Number(body.qualification_year);
      if (body.percentage) body.percentage = Number(body.percentage);
      if (body.weekly_hours_goal) body.weekly_hours_goal = Number(body.weekly_hours_goal);
      if (body.target_exam_year) body.target_exam_year = Number(body.target_exam_year);
      const u = await api.put("/api/profile/me", body);
      auth.setUser(u);
      setMsg("Profile saved");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div data-testid="profile-loading">Loading…</div>;

  // const field = "w-full px-4 py-2.5 rounded-xl bg-white/80 border border-border text-sm";

  return (
    <div className="space-y-6" data-testid="profile-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Your profile</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Keep your eligibility sharp.</h1>
        <p className="text-muted-foreground mt-1">Every field below changes which recruitments match you.</p>
      </div>

      <form onSubmit={onSubmit} className="grid lg:grid-cols-3 gap-5" data-testid="profile-form">
        <div className="lg:col-span-2 soft-card rounded-2xl p-6 space-y-5">
          <h2 className="font-heading text-xl font-semibold">Basic details</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Full name" value={form.name} onChange={(v) => set("name", v)} required />
            <Input label="Email" value={form.email} disabled />
            <Input label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
            <Input label="Date of birth" value={form.date_of_birth} onChange={(v) => set("date_of_birth", v)} placeholder="YYYY-MM-DD" />
            <Select label="Category" value={form.category} onChange={(v) => set("category", v)} options={CATEGORIES.map((c) => ({ value: c, label: c.toUpperCase() }))} />
            <Select label="Gender" value={form.gender} onChange={(v) => set("gender", v)} options={[
              { value: "", label: "Prefer not to say" },
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
              { value: "other", label: "Other" },
            ]} />
            <Input label="State / domicile" value={form.state} onChange={(v) => set("state", v)} />
          </div>

          <div className="border-t border-border pt-5 space-y-4">
            <h2 className="font-heading text-xl font-semibold">Education</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Highest qualification" value={form.qualification} onChange={(v) => set("qualification", v)} placeholder="B.A. History" />
              <Input label="Graduation year" value={form.qualification_year} onChange={(v) => set("qualification_year", v)} placeholder="2023" />
              <Input label="Aggregate %" value={form.percentage} onChange={(v) => set("percentage", v)} placeholder="61.4" />
            </div>
          </div>

          <div className="border-t border-border pt-5 space-y-4">
            <h2 className="font-heading text-xl font-semibold">Plan targets</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Target exam year" value={form.target_exam_year} onChange={(v) => set("target_exam_year", v)} />
              <Input label="Weekly hours goal" value={form.weekly_hours_goal} onChange={(v) => set("weekly_hours_goal", v)} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button disabled={saving} className="btn btn-primary" data-testid="profile-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
            </button>
            {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </div>

        <aside className="soft-card rounded-2xl p-6 h-fit">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-clay-500 text-white grid place-items-center font-heading font-semibold">
              {auth.user?.name?.[0] || "U"}
            </div>
            <div>
              <div className="font-semibold">{auth.user?.name}</div>
              <div className="text-xs text-muted-foreground">{auth.user?.email}</div>
            </div>
          </div>
          <div className="mt-5 space-y-2 text-sm">
            <Row label="Role" value={auth.user?.role} />
            <Row label="Plan" value={auth.user?.plan} />
            <Row label="Onboarded" value={auth.user?.onboarded ? "Yes" : "No"} />
          </div>
          <div className="mt-6 p-4 rounded-xl bg-clay-50 border border-clay-100 text-xs text-clay-800">
            Your profile drives deterministic eligibility. We never guess.
          </div>
        </aside>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, required, disabled, placeholder }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-border focus:border-clay-400 text-sm outline-none disabled:opacity-60"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>
      <select
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
