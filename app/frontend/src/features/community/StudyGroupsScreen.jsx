import React, { useEffect, useState } from "react";
import {
  Eyebrow,
  PageHeader,
  Pill,
  SectionHeader,
  StatusDot,
  StudyCard as Card,
  StudyEmptyState as EmptyState,
  Tabs,
} from "../../shared/ui/studyos";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";
import { COMMUNITY_USERS, STUDY_GROUPS, STUDY_ROOM_SESSIONS } from "./data";

// Production port of docs/reference/UI_claude-code/screen-groups.jsx.

function safePct(value, goal) {
  if (!goal || goal <= 0) return 0;
  return value / goal;
}

function normalizeUrl(link) {
  if (!link) return null;
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

export default function StudyGroupsScreen() {
  const [groups, setGroups] = useState(STUDY_GROUPS);
  const [rooms, setRooms] = useState(STUDY_ROOM_SESSIONS);
  const [hasLiveGroups, setHasLiveGroups] = useState(false);
  const [hasLiveRooms, setHasLiveRooms] = useState(false);
  const [activeId, setActiveId] = useState(groups[0]?.id || null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/community/groups")
      .then((d) => {
        if (cancelled) return;
        if (!Array.isArray(d?.items)) return;
        setGroups(d.items);
        setHasLiveGroups(true);
        if (d.items.length > 0) setActiveId((cur) => (d.items.some((g) => g.id === cur) ? cur : d.items[0].id));
      })
      .catch(() => {});
    api
      .get("/api/community/study-rooms")
      .then((d) => {
        if (cancelled) return;
        if (!Array.isArray(d?.items)) return;
        setRooms(d.items);
        setHasLiveRooms(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Default to a tab that has something in it. "My groups" first; if empty
  // once live data arrives, fall back to "open" so a new user doesn't land
  // on an empty page.
  const mineCount = groups.filter((g) => g.isMine).length;
  const [tab, setTab] = useState(mineCount > 0 ? "mine" : "open");
  useEffect(() => {
    if (hasLiveGroups && tab === "mine" && mineCount === 0) setTab("open");
  }, [hasLiveGroups, mineCount, tab]);

  const active = groups.find((g) => g.id === activeId);

  const filtered = groups.filter((g) => {
    if (tab === "mine") return g.isMine;
    if (tab === "open") return g.visibility === "open";
    if (tab === "invite-only") return g.visibility === "invite-only";
    if (tab === "paused") return g.status === "paused";
    return true;
  });

  return (
    <div className="community-workspace space-y-6" data-testid="groups-page">
      <PageHeader
        eyebrow="Study Groups"
        title="Pace yourself with people on the same exam."
        sub="2–8 members per group. Shared weekly goals. Daily check-ins. Study rooms with your link — we don't host video; we coordinate around it."
      />

      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "mine", label: "My groups", badge: mineCount },
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
              <EmptyState icon="◇" title="No groups in this view." body="Try a different tab to find groups to join." />
            ) : null}
          </div>
          {active ? <GroupDetail group={active} hasLiveGroups={hasLiveGroups} /> : null}
        </div>

        <UpcomingStudyRooms rooms={rooms} groups={groups} hasLiveRooms={hasLiveRooms} />
        <FindPartnersStrip />
      </div>
    </div>
  );
}

function GroupListCard({ g, active, onPick }) {
  const pctH = safePct(g.weeklyHoursDone, g.weeklyHoursGoal);
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`group-card-${g.id}`}
      className={`community-action-card w-full text-left p-4 ${
        active ? "bg-[#FBF6EF] border-[#4E3A29] shadow-[inset_3px_0_0_#4E3A29]" : ""
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
            {g.weeklyHoursDone || 0}h / {g.weeklyHoursGoal || 0}h
          </span>
        </div>
        <div className="mt-1 h-[5px] bg-[#EFE2C9] rounded-sm overflow-hidden">
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

function GroupDetail({ group, hasLiveGroups }) {
  const pctH = safePct(group.weeklyHoursDone, group.weeklyHoursGoal);
  const pctT = safePct(group.weeklyTasksDone, group.weeklyTasksGoal);
  const founder = COMMUNITY_USERS[group.founder];
  const { run, busy } = useApiAction();
  const [requested, setRequested] = useState(!!group.youRequested);

  // Reset local "requested" state when switching groups.
  useEffect(() => {
    setRequested(!!group.youRequested);
  }, [group.id, group.youRequested]);

  async function join() {
    const prev = requested;
    await run({
      action: () => api.post(`/api/community/groups/${group.id}/join`, {}),
      optimistic: () => setRequested(true),
      rollback: () => setRequested(prev),
      successMessage: "Join request sent.",
      errorMessage: "Could not send join request.",
    });
  }

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
            {group.isMine ? (
              <Pill tone="ink">You're in</Pill>
            ) : (
              <button
                type="button"
                onClick={join}
                data-testid={`join-${group.id}`}
                disabled={busy || requested}
                className={`text-[11.5px] px-3 py-1.5 rounded-full font-semibold ${
                  requested
                    ? "border border-[#54794E] bg-[#F0F5EF] text-[#33482F]"
                    : "bg-[#4E3A29] text-[#F3EADB] disabled:opacity-50"
                }`}
              >
                {requested ? "Request sent" : busy ? "Requesting…" : "Request to join"}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <GroupKPI k="Members" v={`${group.members || 0}/${group.capacity || 0}`} sub="capacity" />
          <GroupKPI k="Hours · this week" v={`${group.weeklyHoursDone || 0}h`} sub={`of ${group.weeklyHoursGoal || 0}h goal`} pct={pctH} />
          <GroupKPI k="Tasks · this week" v={`${group.weeklyTasksDone || 0}`} sub={`of ${group.weeklyTasksGoal || 0}`} pct={pctT} />
          <GroupKPI k="Streak" v={`${group.streakDays || 0}d`} sub="all members checked in" />
        </div>
      </Card>

      {group.nextSession ? <NextSessionCard s={group.nextSession} /> : null}

      <DailyCheckinCard groupId={group.id} hasLiveGroups={hasLiveGroups} />
    </div>
  );
}

function GroupKPI({ k, v, sub, pct }) {
  return (
    <div className="rounded-lg border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
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
  // Backend may return null `at`; seed has "Tomorrow · 06:00".
  const parts = typeof s.at === "string" ? s.at.split("·").map((x) => x.trim()) : [];
  const whenDay = parts[0] || s.at || "Soon";
  const whenTime = parts[1] || "";
  return (
    <Card className="!bg-[#4E3A29] !border-[#4E3A29]">
      <div className="flex items-start gap-5 flex-wrap">
        <div className="text-right shrink-0">
          <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em]">Next session</div>
          <div className="font-heading text-[24px] text-[#F3EADB] mt-1 leading-none">{whenDay}</div>
          {whenTime ? <div className="num-mono text-[12px] text-[#D6BC93] mt-1">{whenTime}</div> : null}
        </div>
        <div className="flex-1 min-w-[240px] border-l border-[#4E3A29] pl-5">
          <h3 className="font-heading text-[19px] text-[#F3EADB] leading-tight">{s.title}</h3>
          {s.agenda ? <div className="text-[12px] text-[#D6BC93] mt-1.5">Agenda: {s.agenda}</div> : null}
          <div className="num-mono text-[10.5px] text-[#A68057] mt-2.5">
            platform set by group founder · platform link visible after RSVP
          </div>
        </div>
      </div>
    </Card>
  );
}

function DailyCheckinCard({ groupId, hasLiveGroups }) {
  const [body, setBody] = useState("");
  const { run, busy } = useApiAction();
  const [posted, setPosted] = useState(false);

  async function submit() {
    if (!body.trim() || !groupId) return;
    await run({
      action: () => api.post(`/api/community/groups/${groupId}/checkins`, { body }),
      successMessage: "Check-in posted.",
      errorMessage: "Could not post check-in.",
      onSuccess: () => {
        setBody("");
        setPosted(true);
      },
    });
  }

  return (
    <Card>
      <SectionHeader
        eyebrow="Daily check-in"
        title="What did you study today?"
        sub="Auto-prompted at 21:30 IST · group sees a short summary, not your full plan."
      />
      <div className="rounded-lg border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
        <textarea
          rows="2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Federalism revision · Mock 13 errors reviewed · 5.5h focused"
          aria-label="Today's study check-in"
          className="w-full bg-transparent outline-none text-[13px] placeholder:text-[#A68057] resize-none"
        />
        <div className="flex items-center justify-end mt-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !body.trim()}
            data-testid="group-checkin-post"
            className="text-[11px] px-3 py-1 rounded-full bg-[#4E3A29] text-[#F3EADB] font-semibold disabled:opacity-50"
          >
            {posted ? "Posted ✓" : busy ? "Posting…" : "Post check-in"}
          </button>
        </div>
      </div>
      {hasLiveGroups ? null : (
        <p className="mt-3 text-[11.5px] italic text-clay-700">
          Today's check-ins from group members appear here as they post.
        </p>
      )}
    </Card>
  );
}

function UpcomingStudyRooms({ rooms, groups, hasLiveRooms }) {
  const { run } = useApiAction();
  const [rsvpdIds, setRsvpdIds] = useState(() => new Set(rooms.filter((r) => r.youRsvpd).map((r) => r.id)));
  useEffect(() => {
    setRsvpdIds(new Set(rooms.filter((r) => r.youRsvpd).map((r) => r.id)));
  }, [rooms]);

  async function rsvp(roomId) {
    if (rsvpdIds.has(roomId)) return;
    const prev = new Set(rsvpdIds);
    await run({
      action: () => api.post(`/api/community/study-rooms/${roomId}/rsvp`, {}),
      optimistic: () => setRsvpdIds((s) => new Set(s).add(roomId)),
      rollback: () => setRsvpdIds(prev),
      successMessage: "RSVP recorded.",
      errorMessage: "Could not RSVP.",
    });
  }

  if (!hasLiveRooms && rooms.length === 0) return null;

  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Study rooms · this week</Eyebrow>
        <h2 className="font-heading text-[22px] mt-1">
          {rooms.length} scheduled sessions across your groups.
        </h2>
        <p className="text-[12px] text-clay-700 mt-1">
          Reminders 15 min before. Post-session hours feed your study analytics.
        </p>
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
              // Backend may emit groupId (camelCase) or group_id (snake_case).
              const gid = s.groupId || s.group_id;
              const g = s.groupName ? { name: s.groupName } : groups.find((x) => x.id === gid);
              const link = normalizeUrl(s.platformLink || s.platform_link);
              const isRsvpd = rsvpdIds.has(s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.title}</strong>
                    {s.agenda ? <div className="num-mono text-[10.5px] text-clay-700">{s.agenda}</div> : null}
                  </td>
                  <td className="num-mono">{s.at}</td>
                  <td className="num-mono">{s.duration}</td>
                  <td className="text-clay-700">{g?.name || "—"}</td>
                  <td>
                    <Pill tone="outline">{s.platform}</Pill>
                  </td>
                  <td className="num-mono">
                    {s.confirmed || 0}/{s.maxParticipants || 0}
                  </td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => rsvp(s.id)}
                        data-testid={`rsvp-${s.id}`}
                        disabled={isRsvpd}
                        className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${
                          isRsvpd
                            ? "border-[#54794E] bg-[#F0F5EF] text-[#33482F]"
                            : "border-[#E7DECB] text-clay-700"
                        }`}
                      >
                        {isRsvpd ? "RSVP'd" : "RSVP"}
                      </button>
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] px-2.5 py-1 rounded-full bg-[#4E3A29] text-[#F3EADB] font-semibold"
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
        <StatusDot state="live" label="" /> partner & group services synced · /api/community/groups
      </div>
    </Card>
  );
}
