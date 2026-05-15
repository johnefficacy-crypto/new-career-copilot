import React, { useState } from "react";
import { COMMUNITY_USERS, STUDY_GROUPS, STUDY_ROOM_SESSIONS } from "../data/community";
import {
  Avatar, Card, EmptyState, Eyebrow, FooterStrip, MiniBar, PageHeader, Pill,
  PrototypePage, SectionHeader, SourceTrustStamp, StatusDot, Tabs, UserBadge,
} from "../ui";

function GroupListCard({ g, active, onPick }) {
  const pctH = g.weeklyHoursDone / g.weeklyHoursGoal;
  return (
    <button
      onClick={onPick}
      className={`w-full text-left rounded-xl border p-4 transition ${
        active ? "bg-[#FBF6EF] border-[#2E2218]" : "bg-white/70 border-[#E7DECB] hover:border-[#A68057]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-serif text-[16px] leading-tight">{g.name}</div>
          <div className="num-mono text-[10.5px] text-clay-700 mt-1">{g.exam} · {g.schedule}</div>
        </div>
        <Pill tone={g.status === "active" ? "sage" : g.status === "paused" ? "amber" : "outline"}>{g.status}</Pill>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-clay-700 flex-wrap">
        <span className="num-mono">{g.members}/{g.capacity} members</span>
        <span>·</span>
        <span>{g.visibility}</span>
        {g.isMine ? <Pill tone="ink" className="!text-[9px]">Mine</Pill> : null}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-clay-700">
          <span className="eyebrow !text-[9px]">Weekly hours</span>
          <span className="num-mono">{g.weeklyHoursDone}h / {g.weeklyHoursGoal}h</span>
        </div>
        <div className="mt-1 h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
          <div className="h-full bg-[#54794E]" style={{ width: `${Math.min(100, Math.round(pctH * 100))}%` }} />
        </div>
      </div>
      {g.streakDays > 0 ? (
        <div className="mt-3 inline-flex items-center gap-1.5 num-mono text-[10.5px] text-[#33482F]">
          <span>🔥</span> {g.streakDays}-day streak
        </div>
      ) : null}
    </button>
  );
}

function GroupKPI({ k, v, sub, pct }) {
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
      <Eyebrow>{k}</Eyebrow>
      <div className="font-serif text-[22px] mt-1 leading-none">{v}</div>
      <div className="text-[11px] text-clay-700 mt-1.5">{sub}</div>
      {pct != null ? (
        <div className="mt-2 h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
          <div className="h-full bg-[#54794E]" style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function NextSessionCard({ s }) {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="text-right shrink-0">
          <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em]">Next session</div>
          <div className="font-serif text-[24px] text-[#F3EADB] mt-1 leading-none">{s.at.split("·")[0].trim()}</div>
          <div className="num-mono text-[12px] text-[#D6BC93] mt-1">{s.at.split("·")[1]?.trim() || ""}</div>
        </div>
        <div className="flex-1 border-l border-[#4E3A29] pl-5 min-w-[200px]">
          <h3 className="font-serif text-[19px] text-[#F3EADB] leading-tight">{s.title}</h3>
          <div className="text-[12px] text-[#D6BC93] mt-1.5">Agenda: {s.agenda}</div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <button className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#F3EADB] text-[#2E2218] font-semibold">RSVP yes</button>
            <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#6C5038] text-[#D6BC93] font-semibold">Add to calendar</button>
            <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#6C5038] text-[#D6BC93] font-semibold">Open meet link</button>
          </div>
        </div>
      </div>
    </Card>
  );
}

const CHECKINS = [
  { u: "u_kavya", body: "Pub Ad addendum read · 4h focused", t: "21:42" },
  { u: "u_ritu", body: "Mock 14 setup · 2h Polity revision", t: "21:15" },
  { u: "u_aman", body: "Skipped today — sick.", t: "20:50", skipped: true },
  { u: "u_neha", body: "6.5h · Federalism Ch.1–4 done", t: "20:18" },
];
const MEMBERS = [
  { u: "u_aarav", join: "Mar 11", hrs: 38.5, founder: true },
  { u: "u_kavya", join: "Mar 11", hrs: 42.0 },
  { u: "u_ritu", join: "Mar 14", hrs: 36.0 },
  { u: "u_aman", join: "Mar 18", hrs: 18.2 },
  { u: "u_neha", join: "Apr 02", hrs: 40.2 },
  { u: "u_anjali", join: "Apr 28", hrs: 24.8 },
];

function DailyCheckinCard() {
  return (
    <Card>
      <SectionHeader eyebrow="Daily check-in" title="What did you study today?" sub="Auto-prompted at 21:30 IST · group sees a short summary, not your full plan." />
      <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
        <div className="flex items-center gap-2 num-mono text-[10.5px] text-clay-700 uppercase tracking-[0.16em] flex-wrap">
          <span>Today · May 14</span><span>·</span><span className="text-[#33482F]">4 of 6 checked in</span>
        </div>
        <textarea
          rows="2"
          placeholder="Federalism revision · Mock 13 errors reviewed · 5.5h focused"
          className="mt-2 w-full bg-transparent outline-none text-[13px] placeholder:text-[#A68057] resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1.5">
            <button className="text-[10.5px] px-2 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Hours: 5.5</button>
            <button className="text-[10.5px] px-2 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">+ Topic</button>
          </div>
          <button className="text-[11px] px-3 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Post check-in</button>
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {CHECKINS.map((c, i) => {
          const u = COMMUNITY_USERS[c.u];
          return (
            <li key={i} className="grid grid-cols-[28px_1fr_60px] gap-3 items-start">
              <Avatar user={u} size={26} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium">{u.name}</span>
                  {c.skipped ? <Pill tone="amber" className="!text-[9px]">Skipped</Pill> : null}
                </div>
                <div className="text-[12px] text-[#3a2e22] mt-0.5">{c.body}</div>
              </div>
              <span className="num-mono text-[10.5px] text-clay-700 text-right">{c.t}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MembersCard({ group }) {
  return (
    <Card>
      <SectionHeader eyebrow="Members" title={`${group.members} of ${group.capacity}`} sub="Joined dates · weekly progress" />
      <ul className="space-y-2.5">
        {MEMBERS.slice(0, group.members).map((m, i) => {
          const u = COMMUNITY_USERS[m.u];
          return (
            <li key={i} className="grid grid-cols-[32px_1fr_60px_50px] gap-3 items-center">
              <Avatar user={u} size={28} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-medium truncate">{u.name}</span>
                  {m.founder ? <Pill tone="ink" className="!text-[9px]">founder</Pill> : null}
                  <UserBadge user={u} compact />
                </div>
                <div className="num-mono text-[10.5px] text-clay-700">joined {m.join}</div>
              </div>
              <MiniBar pct={m.hrs / 45} width={50} />
              <span className="num-mono text-[11px] text-clay-700 text-right">{m.hrs}h</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SharedResourcesCard() {
  const rows = [
    { t: "Federalism · 47-page notes", by: "u_ritu", trust: "community", up: 148 },
    { t: "PYQ archive · Polity 2018–24", by: "u_admin", trust: "official", up: 312 },
    { t: "Mock 13 walkthrough (video)", by: "u_kavya", trust: "community", up: 84 },
  ];
  return (
    <Card>
      <SectionHeader
        eyebrow="Shared resource library"
        title="Group-visible files & links."
        right={<button className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ Upload</button>}
      />
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r, i) => (
          <li key={i} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
            <div className="flex items-center justify-between">
              <SourceTrustStamp trust={r.trust} />
              <span className="num-mono text-[10.5px] text-clay-700">↑ {r.up}</span>
            </div>
            <div className="font-serif text-[14px] mt-2 leading-snug">{r.t}</div>
            <div className="num-mono text-[10.5px] text-clay-700 mt-1">shared by {COMMUNITY_USERS[r.by]?.name}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GroupDetail({ group }) {
  const pctH = group.weeklyHoursDone / group.weeklyHoursGoal;
  const pctT = group.weeklyTasksDone / group.weeklyTasksGoal;
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>{group.exam} · {group.visibility} · {group.status}</Eyebrow>
            <h2 className="font-serif text-[26px] mt-1 leading-tight">{group.name}</h2>
            <div className="text-[12.5px] text-clay-700 mt-1.5">
              {group.schedule} · founded by {COMMUNITY_USERS[group.founder]?.name}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Group settings</button>
            {group.isMine ? (
              <Pill tone="ink">You're in</Pill>
            ) : (
              <button className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Request to join</button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <GroupKPI k="Members" v={`${group.members}/${group.capacity}`} sub="capacity" />
          <GroupKPI k="Hours · this week" v={`${group.weeklyHoursDone}h`} sub={`of ${group.weeklyHoursGoal}h goal`} pct={pctH} />
          <GroupKPI k="Tasks · this week" v={`${group.weeklyTasksDone}`} sub={`of ${group.weeklyTasksGoal}`} pct={pctT} />
          <GroupKPI k="Streak" v={`${group.streakDays}d`} sub="all members checked in" />
        </div>
      </Card>
      {group.nextSession ? <NextSessionCard s={group.nextSession} /> : null}
      <div className="grid lg:grid-cols-2 gap-6">
        <DailyCheckinCard />
        <MembersCard group={group} />
      </div>
      <SharedResourcesCard />
    </div>
  );
}

function UpcomingStudyRooms() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>Study rooms · this week</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">3 scheduled sessions across your groups.</h2>
          <p className="text-[12px] text-clay-700 mt-1">Reminders 15 min before. Post-session hours feed your study analytics.</p>
        </div>
        <button className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ Schedule a session</button>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Title</th><th>When</th><th>Duration</th><th>Group</th><th>Platform</th><th>Confirmed</th><th className="right" /></tr>
          </thead>
          <tbody>
            {STUDY_ROOM_SESSIONS.map((s) => {
              const g = STUDY_GROUPS.find((x) => x.id === s.groupId);
              return (
                <tr key={s.id}>
                  <td><strong>{s.title}</strong><div className="num-mono text-[10.5px] text-clay-700">{s.agenda}</div></td>
                  <td className="num-mono">{s.at}</td>
                  <td className="num-mono">{s.duration}</td>
                  <td className="text-clay-700">{g?.name}</td>
                  <td><Pill tone="outline">{s.platform}</Pill></td>
                  <td className="num-mono">{s.confirmed}/{s.maxParticipants}</td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">RSVP</button>
                      <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Open link</button>
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

function FindPartnersStrip() {
  return (
    <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <Eyebrow>Solo first?</Eyebrow>
          <h3 className="font-serif text-[20px] mt-1 text-[#33482F]">Try an accountability partner before joining a 6-person group.</h3>
          <p className="text-[12.5px] text-[#33482F] mt-1">One person, daily check-in, weekly review. Less coordination, more pressure.</p>
        </div>
        <a href="/app/accountability" className="text-[12.5px] px-3.5 py-2 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Open partners →</a>
      </div>
    </Card>
  );
}

export default function PrototypeGroups() {
  const [tab, setTab] = useState("mine");
  const [activeId, setActiveId] = useState("g1");
  const active = STUDY_GROUPS.find((g) => g.id === activeId);

  const filtered = STUDY_GROUPS.filter((g) => {
    if (tab === "mine") return g.isMine;
    if (tab === "open") return g.visibility === "open";
    if (tab === "invite-only") return g.visibility === "invite-only";
    if (tab === "paused") return g.status === "paused";
    return true;
  });

  return (
    <PrototypePage label="Study Groups">
      <div className="px-10 pt-9">
        <PageHeader
          eyebrow="Study Groups"
          title="Pace yourself with people on the same exam."
          sub="2–8 members per group. Shared weekly goals. Daily check-ins. Study rooms with your link — we don't host video; we coordinate around it."
          right={
            <div className="flex gap-2">
              <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Find a group →</button>
              <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ Create group</button>
            </div>
          }
        />
      </div>
      <div className="px-10 space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "mine", label: "My groups", badge: STUDY_GROUPS.filter((g) => g.isMine).length },
              { value: "open", label: "Open" },
              { value: "invite-only", label: "Invite-only" },
              { value: "paused", label: "Paused" },
              { value: "all", label: "All" },
            ]}
          />
          <div className="num-mono text-[10.5px] text-clay-700">
            {filtered.length} groups · {STUDY_ROOM_SESSIONS.length} study rooms this week
          </div>
        </div>
        <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
          <div className="space-y-3">
            {filtered.map((g) => (
              <GroupListCard key={g.id} g={g} active={activeId === g.id} onPick={() => setActiveId(g.id)} />
            ))}
            {filtered.length === 0 ? (
              <EmptyState icon="◇" title="No groups in this view." body="Try a different tab or create your own." />
            ) : null}
          </div>
          {active ? <GroupDetail group={active} /> : null}
        </div>
        <UpcomingStudyRooms />
        <FindPartnersStrip />
      </div>
      <FooterStrip />
    </PrototypePage>
  );
}
