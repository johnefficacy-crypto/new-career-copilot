import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";
import { COMMUNITY_USERS, STUDY_GROUPS, STUDY_ROOM_SESSIONS } from "./data";
import {
  FieldButton,
  FieldCard,
  FieldEmpty,
  FieldHeader,
  FieldKpi,
  FieldLabel,
  FieldPage,
  FieldPill,
  FieldProgress,
  FieldSection,
  FieldStatusDot,
  FieldTable,
  FieldTabs,
  FieldTd,
  FieldTextarea,
} from "./ui";

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
        if (d.items.length > 0)
          setActiveId((cur) => (d.items.some((g) => g.id === cur) ? cur : d.items[0].id));
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
    <FieldPage testId="groups-page">
      <FieldHeader
        eyebrow="Study Groups"
        title="Pace yourself with people on the same exam."
        sub="2–8 members per group. Shared weekly goals. Daily check-ins. Study rooms with your link — we don't host video; we coordinate around it."
      />

      <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
        <FieldTabs
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
        <FieldLabel>
          {filtered.length} groups · {rooms.length} rooms this week
        </FieldLabel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        <div className="space-y-2.5">
          {filtered.map((g) => (
            <GroupListItem key={g.id} g={g} active={activeId === g.id} onPick={() => setActiveId(g.id)} />
          ))}
          {filtered.length === 0 ? (
            <FieldEmpty
              icon="◇"
              title="No groups in this view."
              body="Try a different tab to find groups to join."
            />
          ) : null}
        </div>
        {active ? <GroupDetail group={active} hasLiveGroups={hasLiveGroups} /> : null}
      </div>

      <div className="mt-8">
        <UpcomingStudyRooms rooms={rooms} groups={groups} hasLiveRooms={hasLiveRooms} />
      </div>

      <div className="mt-8">
        <FindPartnersStrip />
      </div>
    </FieldPage>
  );
}

function GroupListItem({ g, active, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`group-card-${g.id}`}
      className={`w-full text-left rounded-md border bg-field-canvas p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-field-accent ${
        active
          ? "border-field-accent ring-1 ring-field-accent/30"
          : "border-field-line hover:border-field-ink-quiet"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-sans text-[14.5px] font-semibold leading-tight text-field-ink truncate">{g.name}</div>
          <div className="font-mono text-[10.5px] text-field-ink-quiet mt-1 uppercase tracking-[0.06em]">
            {g.exam} · {g.schedule}
          </div>
        </div>
        <FieldPill tone={g.status === "active" ? "accent" : g.status === "paused" ? "warn" : "outline"}>
          {g.status}
        </FieldPill>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-field-ink-muted">
        <span className="font-mono">
          {g.members}/{g.capacity}
        </span>
        <span aria-hidden="true">·</span>
        <span>{g.visibility}</span>
        {g.isMine ? <FieldPill tone="ink">Mine</FieldPill> : null}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10.5px] text-field-ink-quiet font-mono uppercase tracking-[0.06em]">
          <span>Weekly hours</span>
          <span>
            {g.weeklyHoursDone || 0} / {g.weeklyHoursGoal || 0}
          </span>
        </div>
        <FieldProgress value={g.weeklyHoursDone || 0} max={g.weeklyHoursGoal || 0} height={3} className="mt-1" />
      </div>

      {g.streakDays > 0 ? (
        <div className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-field-accent-ink">
          <span aria-hidden="true">●</span>
          {g.streakDays}-day streak
        </div>
      ) : null}
    </button>
  );
}

function GroupDetail({ group, hasLiveGroups }) {
  const founder = COMMUNITY_USERS[group.founder];
  const { run, busy } = useApiAction();
  const [requested, setRequested] = useState(!!group.youRequested);

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
      <FieldCard>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <FieldLabel>
              {group.exam} · {group.visibility} · {group.status}
            </FieldLabel>
            <h2 className="font-sans text-[22px] font-semibold mt-1 leading-tight text-field-ink">{group.name}</h2>
            <div className="text-[12.5px] text-field-ink-muted mt-1.5">
              {group.schedule} · founded by {founder?.name || group.founder}
            </div>
          </div>
          <div className="shrink-0">
            {group.isMine ? (
              <FieldPill tone="ink">You're in</FieldPill>
            ) : (
              <FieldButton
                variant={requested ? "accentSoft" : "primary"}
                size="sm"
                onClick={join}
                disabled={busy || requested}
                data-testid={`join-${group.id}`}
              >
                {requested ? "Request sent" : busy ? "Requesting…" : "Request to join"}
              </FieldButton>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <FieldKpi label="Members" value={`${group.members || 0} / ${group.capacity || 0}`} sub="capacity" />
          <FieldKpi
            label="Hours · week"
            value={`${group.weeklyHoursDone || 0} h`}
            sub={`of ${group.weeklyHoursGoal || 0} h`}
          />
          <FieldKpi label="Tasks · week" value={`${group.weeklyTasksDone || 0}`} sub={`of ${group.weeklyTasksGoal || 0}`} />
          <FieldKpi label="Streak" value={`${group.streakDays || 0} d`} sub="all members in" tone="accent" />
        </div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FieldProgress value={group.members || 0} max={group.capacity || 0} height={3} />
          <FieldProgress value={group.weeklyHoursDone || 0} max={group.weeklyHoursGoal || 0} height={3} />
          <FieldProgress value={group.weeklyTasksDone || 0} max={group.weeklyTasksGoal || 0} height={3} />
          <FieldProgress value={Math.min(group.streakDays || 0, 30)} max={30} height={3} />
        </div>
      </FieldCard>

      {group.nextSession ? <NextSessionCard s={group.nextSession} /> : null}

      <DailyCheckinCard groupId={group.id} hasLiveGroups={hasLiveGroups} />
    </div>
  );
}

function NextSessionCard({ s }) {
  const parts = typeof s.at === "string" ? s.at.split("·").map((x) => x.trim()) : [];
  const whenDay = parts[0] || s.at || "Soon";
  const whenTime = parts[1] || "";
  return (
    <FieldCard tone="ink">
      <div className="flex items-start gap-6 flex-wrap">
        <div className="shrink-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">Next session</div>
          <div className="font-sans text-[28px] font-semibold mt-1 leading-none">{whenDay}</div>
          {whenTime ? <div className="font-mono text-[12px] text-white/55 mt-1">{whenTime}</div> : null}
        </div>
        <div className="flex-1 min-w-[240px] border-l border-white/10 pl-6">
          <h3 className="font-sans text-[17px] font-semibold leading-tight">{s.title}</h3>
          {s.agenda ? <div className="text-[12.5px] text-white/70 mt-1.5">Agenda: {s.agenda}</div> : null}
          <div className="font-mono text-[10.5px] text-white/55 mt-3 uppercase tracking-[0.08em]">
            platform set by group founder · link visible after RSVP
          </div>
        </div>
      </div>
    </FieldCard>
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
    <FieldCard>
      <FieldSection
        label="Daily check-in"
        title="What did you study today?"
        sub="Auto-prompted at 21:30 IST · group sees a short summary, not your full plan."
      />
      <FieldTextarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Federalism revision · Mock 13 errors reviewed · 5.5h focused"
        aria-label="Today's study check-in"
      />
      <div className="mt-3 flex items-center justify-end">
        <FieldButton
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={busy || !body.trim()}
          data-testid="group-checkin-post"
        >
          {posted ? "Posted" : busy ? "Posting…" : "Post check-in"}
        </FieldButton>
      </div>
      {hasLiveGroups ? null : (
        <p className="mt-3 text-[11.5px] italic text-field-ink-muted">
          Today's check-ins from group members appear here as they post.
        </p>
      )}
    </FieldCard>
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
    <FieldCard padded={false}>
      <div className="px-6 pt-5 pb-3">
        <FieldLabel>Study rooms · this week</FieldLabel>
        <h2 className="font-sans text-[20px] font-semibold mt-1 leading-tight text-field-ink">
          {rooms.length} scheduled sessions across your groups.
        </h2>
        <p className="text-[12px] text-field-ink-muted mt-1">
          Reminders 15 min before. Post-session hours feed your study analytics.
        </p>
      </div>
      <div className="px-3 pb-3">
        <FieldTable headers={["Title", "When", "Duration", "Group", "Platform", "Confirmed", ""]}>
          {rooms.map((s) => {
            const gid = s.groupId || s.group_id;
            const g = s.groupName ? { name: s.groupName } : groups.find((x) => x.id === gid);
            const link = normalizeUrl(s.platformLink || s.platform_link);
            const isRsvpd = rsvpdIds.has(s.id);
            return (
              <tr key={s.id}>
                <FieldTd>
                  <div className="font-medium text-field-ink">{s.title}</div>
                  {s.agenda ? (
                    <div className="font-mono text-[10.5px] text-field-ink-quiet mt-0.5">{s.agenda}</div>
                  ) : null}
                </FieldTd>
                <FieldTd mono>{s.at}</FieldTd>
                <FieldTd mono>{s.duration}</FieldTd>
                <FieldTd className="text-field-ink-muted">{g?.name || "—"}</FieldTd>
                <FieldTd>
                  <FieldPill tone="outline">{s.platform}</FieldPill>
                </FieldTd>
                <FieldTd mono>
                  {s.confirmed || 0} / {s.maxParticipants || 0}
                </FieldTd>
                <FieldTd>
                  <div className="flex gap-1.5 justify-end">
                    <FieldButton
                      variant={isRsvpd ? "accentSoft" : "secondary"}
                      size="xs"
                      onClick={() => rsvp(s.id)}
                      data-testid={`rsvp-${s.id}`}
                      disabled={isRsvpd}
                    >
                      {isRsvpd ? "RSVP'd" : "RSVP"}
                    </FieldButton>
                    {link ? (
                      <FieldButton
                        variant="primary"
                        size="xs"
                        as="a"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open link
                      </FieldButton>
                    ) : null}
                  </div>
                </FieldTd>
              </tr>
            );
          })}
        </FieldTable>
      </div>
    </FieldCard>
  );
}

function FindPartnersStrip() {
  return (
    <FieldCard tone="accent" className="!border-field-accent/40">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <FieldLabel>Solo first?</FieldLabel>
          <h3 className="font-sans text-[18px] font-semibold mt-1 text-field-accent-ink">
            Try an accountability partner before joining a 6-person group.
          </h3>
          <p className="text-[12.5px] text-field-accent-ink/85 mt-1">
            One person, daily check-in, weekly review. Less coordination, more pressure.
          </p>
        </div>
        <FieldButton variant="primary" size="sm" as="a" href="/app/partners">
          Open partners →
        </FieldButton>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <FieldStatusDot state="live" label="partner & group services synced" />
      </div>
    </FieldCard>
  );
}
