import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, UserMinus2, FileText, ShieldAlert, ExternalLink, Flag } from "lucide-react";
import { api, getApiErrorMessage } from "../../lib/api";

// Reframed per docs/engineering/community-governance-spec-v1.md §4.5:
// the central trust desk owns flag triage (/admin/moderation). This page
// is now the community-management hub — links into the four sub-consoles
// (groups, partners, resources, mentors) plus a compact summary card per
// area so an operator can see queue depth at a glance.

function Card({ icon: Icon, title, count, href, description, busy, error }) {
  return (
    <Link to={href} className="rounded-2xl border border-border bg-white/60 p-5 hover:bg-muted/50 transition" data-testid={`community-hub-card-${href}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sage-100">
          <Icon className="h-5 w-5 text-sage-800" />
        </div>
        <div className="min-w-0">
          <h3 className="font-heading text-xl">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <div className="mt-2 text-xs">
            {busy ? "Loading…" : error ? <span className="text-red-700">{error}</span> : (
              <span><strong className="text-2xl font-heading">{count ?? "—"}</strong> <span className="text-muted-foreground">open</span></span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function AdminCommunityConsole() {
  const [counts, setCounts] = useState({ groups: null, pairs: null, resources: null, mentors: null });
  const [busy, setBusy] = useState({ groups: true, pairs: true, resources: true, mentors: true });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadOne(key, path, pick) {
      try {
        const r = await api.get(path);
        setCounts((c) => ({ ...c, [key]: pick(r) }));
      } catch (e) {
        setErrors((er) => ({ ...er, [key]: getApiErrorMessage(e) }));
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    }
    loadOne("groups", "/api/admin/community/groups?status=active&limit=1", (r) => r.total);
    loadOne("pairs", "/api/admin/community/partners?status=active&limit=1", (r) => r.total);
    loadOne("resources", "/api/admin/community/resources?status=pending_review&limit=1", (r) => r.total);
    loadOne("mentors", "/api/admin/mentors?status=pending&limit=1", (r) => r.total);
  }, []);

  return (
    <div className="space-y-6" data-testid="admin-community-console">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Governance · community</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Community Governance</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Hub for the community-side governance consoles. Flag triage lives on the central{" "}
            <Link to="/admin/moderation" className="underline">trust desk</Link>; this page is for
            community-management actions (groups, partners, resources, mentors) and routes deep links
            to each console.
          </p>
        </div>
        <Link to="/admin/moderation" className="btn btn-primary text-xs inline-flex items-center gap-1">
          Open central trust desk <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="rounded-2xl border border-amber-300/40 bg-amber-50/40 p-4 text-xs flex gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          Per spec §4.5, the previous community flag-triage page was reframed into this hub. The flag-resolve
          actions (dismiss / hide) still exist at <code>/api/admin/community/flags/&#123;id&#125;</code> for direct
          backend access, but the canonical UI for cross-surface trust work is now the central{" "}
          <Link to="/admin/moderation" className="underline">moderation queue</Link>.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card icon={Users} title="Study Groups" href="/admin/community/groups"
          count={counts.groups} busy={busy.groups} error={errors.groups}
          description="Archive, freeze, remove members, force-end stuck sessions, invalidate forged attendance." />
        <Card icon={UserMinus2} title="Partner Pairs" href="/admin/community/partners"
          count={counts.pairs} busy={busy.pairs} error={errors.pairs}
          description="End pairs, block rematches between specific users, triage pending invites." />
        <Card icon={FileText} title="Resource Review Queue" href="/admin/community/resources"
          count={counts.resources} busy={busy.resources} error={errors.resources}
          description="Approve, reject, edit, hide, DMCA-remove, and dedupe community resources." />
        <Card icon={Flag} title="Mentor Verification" href="/admin/mentors"
          count={counts.mentors} busy={busy.mentors} error={errors.mentors}
          description="Approve mentors, KYC-verify, suspend/reinstate, set payout holds." />
      </div>
    </div>
  );
}
