import React, { useEffect, useState } from "react";
import {
  Avatar,
  Eyebrow,
  MiniBar,
  PageHeader,
  Pill,
  SectionHeader,
  SourceTrustStamp,
  StatusDot,
  StudyCard as Card,
  StudyEmptyState as EmptyState,
  Tabs,
  UserBadge,
} from "../../shared/ui/studyos";
import { api } from "../../lib/api";
import { COMMUNITY_USERS, STUDY_GROUPS, STUDY_ROOM_SESSIONS } from "./data";

// Production port of docs/reference/UI_claude-code/screen-groups.jsx.

export default function StudyGroupsScreen() {
  const [tab, setTab] = useState("mine");
  const [activeId, setActiveId] = useState("g1");
  const [groups, setGroups] = useState(STUDY_GROUPS);
  const [rooms, setRooms] = useState(STUDY_ROOM_SESSIONS);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/community/groups")
      .then((d) => {
        if (cancelled || !Array.isArray(d?.items) || d.items.length === 0) return;
        setGroups(d.items);
      })
      .catch(() => {});
    api
      .get("/api/community/study-rooms")
      .then((d) => {
        if (cancelled || !Array.isArray(d?.items) || d.items.length === 0) return;
        setRooms(d.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const active = groups.find((g) => g.id === activeId);

  const filtered = groups.filter((g) => {
    if (tab === "mine") return g.isMine;
    if (tab === "open") return g.visibility === "open";
    if (tab === "invite-only") return g.visibility === "invite-only";
    if (tab === "paused") return g.status === "paused";
    return true;
  });

  return (
    <div className="space-y-6" data-testid="groups-page">
      <PageHeader
        eyebrow="Study Groups"
        title="Pace yourself with people on the same exam."
        sub="2–8 members per group. Shared weekly goals. Daily check-ins. Study rooms with your link — we don't host video; we coordinate around it."
        right={
          <div className="flex gap-2">
            <button type="button" className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
              Find a group →
            </button>
            <button type="button" className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold" data-testid="create-group-btn">
              + Create group
            </button>
          </div>
        }
      />

      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "mine", label: "My groups", badge: groups.filter((g) => g.isMine).length },
              { value: "open", label: "Open" },
              { value: "invite-only", label: "Invite-only" },
              { value: "paused", label: "Paused" },
              { value: "all", label: "All" },
            ]}
          />
          <div className="num-mono text-[10.5px] text-clay-700">
            {filtered.length} groups · {rooms.length} study rooms this week
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
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

        <UpcomingStudyRooms rooms={rooms} groups={groups} />
        <FindPartnersStrip />
      </div>
    </div>
  );
}

function GroupListCard({ g, active, onPick }) {
  const pctH = g.weeklyHoursDone / g.weeklyHoursGoal;
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`group-card-${g.id}`}
      className={`w-full text-left rounded-xl border p-4 transition ${
        active ? "bg-[#FBF6EF] border-[#2E2218]" : "bg-white/70 border-[#E7DECB] hover:border-[#A68057]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-heading text-[16px] leading-tight">{g.name}</div>
          <div className="num-mono text-[10.5px] text-clay-700 mt-1">
            {g.exam} · {g.schedule}
          </div>
        </div>
        <Pill tone={g.status === "active" ? "sage" : g.status === "paused" ? "amber" : "outline"}>{g.status}</Pill>
      </div>

      <div className="mt-3 flex items-center gap-4 text-[10.5px] text-clay-700">
        <span className="num-mono">
          {g.members}/{g.capacity} members
        </span>
        <span>·</span>
        <span>{g.visibility}</span>
        {g.isMine ? (
          <Pill tone="ink" className="!text-[9px]">
            Mine
          </Pill>
        ) : null}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-clay-700">
          <span className="eyebrow !text-[9px]">Weekly hours</span>
          <span className="num-mono">
            {g.weeklyHoursDone}h / {g.weeklyHoursGoal}h
          </span>
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

function GroupDetail({ group }) {
  const pctH = group.weeklyHoursDone / group.weeklyHoursGoal;
  const pctT = group.weeklyTasksDone / group.weeklyTasksGoal;
  const founder = COMMUNITY_USERS[group.founder];
  return (
    <div className="space-y-6" data-testid={`group-detail-${group.id}`}>
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>
              {group.exam} · {group.visibility} · {group.status}
            </Eyebrow>
            <h2 className="font-heading text-[26px] mt-1 leading-tight">{group.name}</h2>
            <div className="text-[12.5px] text-clay-700 mt-1.5">
              {group.schedule} · founded by {founder?.name || group.founder}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
              Group settings
            </button>
            {group.isMine ? (
              <Pill tone="ink">You're in</Pill>
            ) : (
              <button
                type="button"
                onClick={() => api.post(`/api/community/groups/${group.id}/join`, {}).catch(() => {})}
                data-testid={`join-${group.id}`}
                className={`text-[11.5px] px-3 py-1.5 rounded-full font-semibold ${
                  group.youRequested
                    ? "border border-[#54794E] bg-[#F0F5EF] text-[#33482F]"
                    : "bg-[#2E2218] text-[#F3EADB]"
                }`}
              >
                {group.youRequested ? "Request sent" : "Request to join"}
              </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyCheckinCard groupId={group.id} />
        <MembersCard group={group} />
      </div>

      <SharedResourcesCard />
      <PostSessionLogCard />
    </div>
  );
}

function GroupKPI({ k, v, sub, pct }) {
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
      <Eyebrow>{k}</Eyebrow>
      <div className="font-heading text-[22px] mt-1 leading-none">{v}</div>
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
  const [whenDay, whenTime] = s.at.split("·").map((x) => x.trim());
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="text-right shrink-0">
          <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em]">Next session</div>
          <div className="font-heading text-[24px] text-[#F3EADB] mt-1 leading-none">{whenDay}</div>
          <div className="num-mono text-[12px] text-[#D6BC93] mt-1">{whenTime}</div>
        </div>
        <div className="flex-1 min-w-[240px] border-l border-[#4E3A29] pl-5">
          <h3 className="font-heading text-[19px] text-[#F3EADB] leading-tight">{s.title}</h3>
          <div className="text-[12px] text-[#D6BC93] mt-1.5">Agenda: {s.agenda}</div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <button type="button" className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#F3EADB] text-[#2E2218] font-semibold">
              RSVP yes
            </button>
            <button type="button" className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#6C5038] text-[#D6BC93] font-semibold">
              Add to calendar
            </button>
            <button type="button" className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#6C5038] text-[#D6BC93] font-semibold">
              Open meet link
            </button>
          </div>
          <div className="num-mono text-[10.5px] text-[#A68057] mt-2.5">
            platform set by group founder · platform link visible after RSVP
          </div>
        </div>
      </div>
    </Card>
  );
}

function DailyCheckinCard({ groupId }) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  async function submit() {
    if (!body.trim() || !groupId) return;
    setPosting(true);
    try {
      await api.post(`/api/community/groups/${groupId}/checkins`, { body });
      setBody("");
      setPosted(true);
    } catch {
      setPosted(true);
    } finally {
      setPosting(false);
    }
  }
  return (
    <Card>
      <SectionHeader
        eyebrow="Daily check-in"
        title="What did you study today?"
        sub="Auto-prompted at 21:30 IST · group sees a short summary, not your full plan."
      />
      <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
        <div className="flex items-center gap-2 num-mono text-[10.5px] text-clay-700 uppercase tracking-[0.16em]">
          <span>Today · May 14</span>
          <span>·</span>
          <span className="text-[#33482F]">4 of 6 checked in</span>
        </div>
        <textarea
          rows="2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Federalism revision · Mock 13 errors reviewed · 5.5h focused"
          className="mt-2 w-full bg-transparent outline-none text-[13px] placeholder:text-[#A68057] resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1.5">
            <button type="button" className="text-[10.5px] px-2 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
              Hours: 5.5
            </button>
            <button type="button" className="text-[10.5px] px-2 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
              + Topic
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={posting || !body.trim()}
            data-testid="group-checkin-post"
            className="text-[11px] px-3 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold disabled:opacity-50"
          >
            {posted ? "Posted ✓" : posting ? "Posting…" : "Post check-in"}
          </button>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {[
          { u: "u_kavya", body: "Pub Ad addendum read · 4h focused", t: "21:42" },
          { u: "u_ritu", body: "Mock 14 setup · 2h Polity revision", t: "21:15" },
          { u: "u_aman", body: "Skipped today — sick.", t: "20:50", skipped: true },
          { u: "u_neha", body: "6.5h · Federalism Ch.1–4 done", t: "20:18" },
        ].map((c, i) => {
          const u = COMMUNITY_USERS[c.u];
          return (
            <li key={i} className="grid grid-cols-[28px_1fr_60px] gap-3 items-start">
              <Avatar user={u} size={26} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium">{u.name}</span>
                  {c.skipped ? (
                    <Pill tone="amber" className="!text-[9px]">
                      Skipped
                    </Pill>
                  ) : null}
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
        {[
          { u: "u_aarav", join: "Mar 11", hrs: 38.5, founder: true },
          { u: "u_kavya", join: "Mar 11", hrs: 42.0 },
          { u: "u_ritu", join: "Mar 14", hrs: 36.0 },
          { u: "u_aman", join: "Mar 18", hrs: 18.2 },
          { u: "u_neha", join: "Apr 02", hrs: 40.2 },
          { u: "u_anjali", join: "Apr 28", hrs: 24.8 },
        ]
          .slice(0, group.members)
          .map((m, i) => {
            const u = COMMUNITY_USERS[m.u];
            return (
              <li key={i} className="grid grid-cols-[32px_1fr_60px_50px] gap-3 items-center">
                <Avatar user={u} size={28} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12.5px] font-medium truncate">{u.name}</span>
                    {m.founder ? (
                      <Pill tone="ink" className="!text-[9px]">
                        founder
                      </Pill>
                    ) : null}
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
  return (
    <Card>
      <SectionHeader
        eyebrow="Shared resource library"
        title="Group-visible files & links."
        right={
          <button type="button" className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">
            + Upload
          </button>
        }
      />
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { t: "Federalism · 47-page notes", by: "u_ritu", trust: "community", up: 148 },
          { t: "PYQ archive · Polity 2018–24", by: "u_admin", trust: "official", up: 312 },
          { t: "Mock 13 walkthrough (video)", by: "u_kavya", trust: "community", up: 84 },
        ].map((r, i) => (
          <li key={i} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
            <div className="flex items-center justify-between">
              <SourceTrustStamp trust={r.trust} />
              <span className="num-mono text-[10.5px] text-clay-700">↑ {r.up}</span>
            </div>
            <div className="font-heading text-[14px] mt-2 leading-snug">{r.t}</div>
            <div className="num-mono text-[10.5px] text-clay-700 mt-1">
              shared by {COMMUNITY_USERS[r.by]?.name}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PostSessionLogCard() {
  return (
    <Card>
      <SectionHeader
        eyebrow="Post-session log"
        title="What happened in the last 3 sessions."
        sub="Hours logged here feed Study OS analytics. Group members can attest to each other's hours."
      />
      <div className="overflow-x-auto">
        <table className="tbl mt-1">
          <thead>
            <tr>
              <th>Session</th>
              <th>Hours logged</th>
              <th>Topics covered</th>
              <th>Attended</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Federalism revision</strong>
                <div className="num-mono text-[10.5px] text-clay-700">May 13 · 06:00</div>
              </td>
              <td className="num-mono">2.0h</td>
              <td>Centre–State · Emergency</td>
              <td className="num-mono">5/6</td>
              <td>Strong session</td>
            </tr>
            <tr>
              <td>
                <strong>Mock 13 walkthrough</strong>
                <div className="num-mono text-[10.5px] text-clay-700">May 11 · 19:00</div>
              </td>
              <td className="num-mono">2.5h</td>
              <td>Polity · History · Eco</td>
              <td className="num-mono">6/6</td>
              <td>Identified shared weak areas</td>
            </tr>
            <tr>
              <td>
                <strong>Polity Ch. 4 revision</strong>
                <div className="num-mono text-[10.5px] text-clay-700">May 09 · 06:00</div>
              </td>
              <td className="num-mono">1.8h</td>
              <td>Polity Ch.4</td>
              <td className="num-mono">4/6</td>
              <td>Two members absent</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UpcomingStudyRooms({ rooms = STUDY_ROOM_SESSIONS, groups = STUDY_GROUPS }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between flex-wrap gap-3">
        <div>
          <Eyebrow>Study rooms · this week</Eyebrow>
          <h2 className="font-heading text-[22px] mt-1">
            {rooms.length} scheduled sessions across your groups.
          </h2>
          <p className="text-[12px] text-clay-700 mt-1">
            Reminders 15 min before. Post-session hours feed your study analytics.
          </p>
        </div>
        <button type="button" className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">
          + Schedule a session
        </button>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Title</th>
              <th>When</th>
              <th>Duration</th>
              <th>Group</th>
              <th>Platform</th>
              <th>Confirmed</th>
              <th className="right" />
            </tr>
          </thead>
          <tbody>
            {rooms.map((s) => {
              const g = s.groupName ? { name: s.groupName } : groups.find((x) => x.id === s.groupId);
              return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.title}</strong>
                    <div className="num-mono text-[10.5px] text-clay-700">{s.agenda}</div>
                  </td>
                  <td className="num-mono">{s.at}</td>
                  <td className="num-mono">{s.duration}</td>
                  <td className="text-clay-700">{g?.name}</td>
                  <td>
                    <Pill tone="outline">{s.platform}</Pill>
                  </td>
                  <td className="num-mono">
                    {s.confirmed}/{s.maxParticipants}
                  </td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => api.post(`/api/community/study-rooms/${s.id}/rsvp`, {}).catch(() => {})}
                        data-testid={`rsvp-${s.id}`}
                        className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${
                          s.youRsvpd
                            ? "border-[#54794E] bg-[#F0F5EF] text-[#33482F]"
                            : "border-[#E7DECB] text-clay-700"
                        }`}
                      >
                        {s.youRsvpd ? "RSVP'd" : "RSVP"}
                      </button>
                      {s.platformLink ? (
                        <a
                          href={`https://${s.platformLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold"
                        >
                          Open link
                        </a>
                      ) : null}
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
          <h3 className="font-heading text-[20px] mt-1 text-[#33482F]">
            Try an accountability partner before joining a 6-person group.
          </h3>
          <p className="text-[12.5px] text-[#33482F] mt-1">
            One person, daily ✅, weekly review. Less coordination, more pressure.
          </p>
        </div>
        <a
          href="/app/partners"
          className="text-[12.5px] px-3.5 py-2 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold"
        >
          Open partners →
        </a>
      </div>
      <div className="mt-3 num-mono text-[10.5px] text-[#33482F]/80 flex items-center gap-2">
        <StatusDot state="live" label="" /> partner & group services live · /api/community/groups
      </div>
    </Card>
  );
}
