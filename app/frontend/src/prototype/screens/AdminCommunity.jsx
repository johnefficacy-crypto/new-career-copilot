import React, { useState } from "react";
import { ADMIN_COMM, COMMUNITY_USERS, MENTOR_SESSIONS, MENTORS, RESOURCES } from "../data/community";
import {
  Avatar, Card, Eyebrow, FooterStrip, KPI, MentorBadge, PageHeader, Pill,
  PrototypePage, SectionHeader, SourceTrustStamp, StatusDot, Tabs, TrustStamp,
  VerifiedOfficerBadge, VerifiedTopperBadge,
} from "../ui";

const ADMIN_COMM_TABS = [
  { value: "reports", label: "Pending reports", badge: 4 },
  { value: "mods", label: "Moderation actions" },
  { value: "channels", label: "Channel management" },
  { value: "mentors", label: "Mentor applications", badge: 1 },
  { value: "sessions", label: "Mentor sessions" },
  { value: "resources", label: "Resource moderation" },
  { value: "badges", label: "Badge management" },
];

function ACMetrics() {
  const M = ADMIN_COMM.metrics;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KPI k="Pending reports" v={M.pendingReports} tone="amber" sub="open queue" />
      <KPI k="Threads today" v={M.dailyThreads} tone="ink" sub="last 24h" />
      <KPI k="Hidden this week" v={M.hiddenThisWeek} tone="rose" sub="mod action" />
      <KPI k="Bans this week" v={M.bansThisWeek} tone="rose" sub="last 7d" />
      <KPI k="Verified Toppers" v="64" tone="sage" sub="active" />
      <KPI k="Mentor payouts pending" v={`₹${M.mentorPendingPayouts.toLocaleString()}`} tone="amber" sub="next cycle May 30" />
    </div>
  );
}

function ACReports() {
  const [rows, setRows] = useState(ADMIN_COMM.reports);
  function act(id, state) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, state } : r)));
  }
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Pending reports</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">
          {rows.filter((r) => r.state === "open").length} open · {rows.filter((r) => r.state === "action-pending").length} awaiting action
        </h2>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Severity</th><th>Target</th><th>Title</th><th>Reason</th><th>Reporters</th><th>At</th><th>State</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.severity === "high" ? <Pill tone="rose">high</Pill> : null}
                  {r.severity === "medium" ? <Pill tone="amber">medium</Pill> : null}
                  {r.severity === "low" ? <Pill tone="outline">low</Pill> : null}
                </td>
                <td><Pill tone="outline">{r.target}</Pill></td>
                <td><strong>{r.targetTitle}</strong></td>
                <td className="text-clay-700">{r.reason}</td>
                <td className="num-mono">{r.reportedBy}</td>
                <td className="num-mono text-clay-700">{r.at}</td>
                <td>
                  {r.state === "open" ? <TrustStamp kind="needs" label="Open" /> : null}
                  {r.state === "action-pending" ? <TrustStamp kind="preview" label="Action pending" /> : null}
                  {r.state === "resolved" ? <TrustStamp kind="verified" label="Resolved" /> : null}
                </td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end flex-wrap">
                    <button onClick={() => act(r.id, "resolved")} className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold whitespace-nowrap">Resolve</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-clay-700 font-semibold whitespace-nowrap">Warn user</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold whitespace-nowrap">Hide</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#7A3925] text-[#F2DDD6] font-semibold whitespace-nowrap">Delete + ban</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ACModActions() {
  return (
    <Card>
      <SectionHeader eyebrow="Moderation log" title="Last 24 hours." right={<StatusDot state="live" label="" />} />
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>When</th><th>Action</th><th>By</th><th>Target</th><th>Reason</th><th className="right">Reversible?</th></tr>
          </thead>
          <tbody>
            <tr><td className="num-mono">14:08</td><td><Pill tone="amber">Warn</Pill></td><td>@admin.s</td><td>Thread · "Optional subject leak"</td><td>Misinformation</td><td className="right">Yes · 24h</td></tr>
            <tr><td className="num-mono">12:42</td><td><Pill tone="rose">Hide</Pill></td><td>@admin.r</td><td>Reply on "Mock 14 — 122/200"</td><td>Personal attack</td><td className="right">Yes</td></tr>
            <tr><td className="num-mono">09:18</td><td><Pill tone="ink">Ban · 7d</Pill></td><td>@admin.s</td><td>User @repeat-user</td><td>3rd misinformation flag</td><td className="right">Yes · admin</td></tr>
            <tr><td className="num-mono">08:01</td><td><Pill tone="sage">Restore</Pill></td><td>@admin.r</td><td>Thread on cutoff trend</td><td>Mis-flagged · clean</td><td className="right">—</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ACChannels() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>Channels</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">Configure write access, sync rules, channel admins.</h2>
        </div>
        <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ Create channel</button>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Channel</th><th>Locked admin-write</th><th>Channel admins</th><th>Auto-sync · admin/exam-intelligence</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {ADMIN_COMM.channelsConfig.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.lockedAdminWrite ? <Pill tone="ink">Locked</Pill> : <Pill tone="outline">Open</Pill>}</td>
                <td className="num-mono">{c.admins}</td>
                <td>{c.autoSync ? <Pill tone="sage">On</Pill> : <Pill tone="outline">Off</Pill>}</td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Edit rules</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Manage admins</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ACMentorApps() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Mentor applications</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Human approval. Evidence required.</h2>
        <p className="text-[12px] text-clay-700 mt-1">A scorecard or DOPT page is required. Mentors are not auto-approved.</p>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Applicant</th><th>Submitted</th><th>Claim</th><th>Proof</th><th>Topics</th><th>Status</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {ADMIN_COMM.mentorApplications.map((a) => {
              const u = COMMUNITY_USERS[a.user];
              return (
                <tr key={a.id}>
                  <td><div className="flex items-center gap-2"><Avatar user={u} size={26} /><span className="font-medium">{u.name}</span></div></td>
                  <td className="num-mono text-clay-700">{a.at}</td>
                  <td className="num-mono">{a.rank}</td>
                  <td className="text-clay-700">{a.proof}</td>
                  <td className="text-[#3a2e22]">{a.topics}</td>
                  <td>
                    {a.status === "pending" ? <TrustStamp kind="needs" label="Pending review" /> : null}
                    {a.status === "verified" ? <TrustStamp kind="verified" /> : null}
                    {a.status === "rejected" ? <TrustStamp kind="notcon" label="Rejected" /> : null}
                  </td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Open evidence</button>
                      <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Approve</button>
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Reject</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ACMentorSessions() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Mentor sessions · monitor</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">{MENTOR_SESSIONS.length} live listings · cancel if needed.</h2>
        <p className="text-[12px] text-clay-700 mt-1">Cancellation triggers automatic refund to all booked aspirants.</p>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Session</th><th>Mentor</th><th>When</th><th>Booked</th><th>Price</th><th>Platform</th><th>Status</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {MENTOR_SESSIONS.map((s) => {
              const m = MENTORS.find((x) => x.id === s.mentorId);
              return (
                <tr key={s.id}>
                  <td><strong>{s.title}</strong></td>
                  <td>{m.name}</td>
                  <td className="num-mono">{s.at}</td>
                  <td className="num-mono">{s.booked}/{s.capacity}</td>
                  <td className="num-mono">₹{s.price}</td>
                  <td><Pill tone="outline">{s.platform}</Pill></td>
                  <td><TrustStamp kind="live" label="Booking open" /></td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Open</button>
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Cancel · refund all</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ACResourceQueue() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Resource moderation</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Approve · flag · remove.</h2>
        <p className="text-[12px] text-clay-700 mt-1">Pirated paid material is removed regardless of upvotes. Verify-by-Topper is set here.</p>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Resource</th><th>Type</th><th>Trust</th><th>Contributor</th><th>Upvotes</th><th>Flagged</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {RESOURCES.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.title}</strong><div className="num-mono text-[10.5px] text-clay-700">{r.exam} · {r.subject}</div></td>
                <td><Pill tone="outline">{r.type.replace("_", " ")}</Pill></td>
                <td><SourceTrustStamp trust={r.sourceTrust} /></td>
                <td>{COMMUNITY_USERS[r.contributedBy]?.name}</td>
                <td className="num-mono">{r.upvotes}</td>
                <td>{r.flagged ? <Pill tone="rose">flagged</Pill> : <Pill tone="outline">—</Pill>}</td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end flex-wrap">
                    <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold whitespace-nowrap">Approve</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold whitespace-nowrap">Verify-by-Topper</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold whitespace-nowrap">Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ACBadges() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Badge management</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Verified Topper · Verified Officer · Mentor.</h2>
        <p className="text-[12px] text-clay-700 mt-1">Every grant is evidence-backed and reversible. The badge changes how a user is heard — handle carefully.</p>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>User</th><th>Requested badge</th><th>Evidence</th><th>Submitted</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {ADMIN_COMM.badges.pending.map((b, i) => {
              const u = COMMUNITY_USERS[b.user];
              return (
                <tr key={i}>
                  <td><div className="flex items-center gap-2"><Avatar user={u} size={26} /><span className="font-medium">{u.name}</span></div></td>
                  <td>
                    {b.kind === "topper" ? <VerifiedTopperBadge rank="AIR ?" compact /> : null}
                    {b.kind === "officer" ? <VerifiedOfficerBadge post="?" /> : null}
                  </td>
                  <td className="text-[#3a2e22]">{b.evidence}</td>
                  <td className="num-mono text-clay-700">{b.at}</td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Open evidence</button>
                      <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Grant</button>
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Reject</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-7 py-4 border-t border-[#E7DECB]">
        <Eyebrow>Currently granted</Eyebrow>
        <div className="mt-3 flex gap-2 flex-wrap">
          <VerifiedTopperBadge rank="AIR 42" exam="CSE 2024" />
          <VerifiedTopperBadge rank="AIR 117" exam="CSE 2023" />
          <VerifiedTopperBadge rank="AIR 8" exam="CSE 2022" />
          <VerifiedOfficerBadge post="IPS · 2023 batch" />
          <MentorBadge since="2024" />
        </div>
      </div>
    </Card>
  );
}

export default function PrototypeAdminCommunity() {
  const [tab, setTab] = useState("reports");
  return (
    <PrototypePage label="Admin · Community">
      <div className="px-10 pt-9">
        <PageHeader
          eyebrow="Admin · Community"
          title="Calm community. Verified people. No pile-ons."
          sub="Moderation is reactive but firm. Mentor approval is human. Badges are evidence-gated."
          right={
            <div className="flex gap-2 items-center flex-wrap justify-end shrink-0">
              <span className="num-mono text-[10.5px] text-clay-700 whitespace-nowrap">admin@ccp</span>
              <Pill tone="ink" className="whitespace-nowrap">RBAC · community-mod</Pill>
            </div>
          }
        />
      </div>
      <div className="px-10">
        <Tabs value={tab} onChange={setTab} options={ADMIN_COMM_TABS} />
        <div className="mt-6 space-y-6">
          <ACMetrics />
          {tab === "reports" ? <ACReports /> : null}
          {tab === "mods" ? <ACModActions /> : null}
          {tab === "channels" ? <ACChannels /> : null}
          {tab === "mentors" ? <ACMentorApps /> : null}
          {tab === "sessions" ? <ACMentorSessions /> : null}
          {tab === "resources" ? <ACResourceQueue /> : null}
          {tab === "badges" ? <ACBadges /> : null}
        </div>
      </div>
      <FooterStrip />
    </PrototypePage>
  );
}
