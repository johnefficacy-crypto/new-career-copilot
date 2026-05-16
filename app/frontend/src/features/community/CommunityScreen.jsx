import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import useApiAction from "../../lib/hooks/useApiAction";
import {
  COMMUNITY_SPACES as SEED_SPACES,
  COMMUNITY_USERS as SEED_USERS,
  THREADS as SEED_THREADS,
  CHANNEL_RULES,
  FLAIRS,
  rulesKeyFor,
} from "./data";
import {
  FieldAvatar,
  FieldButton,
  FieldCard,
  FieldDivider,
  FieldDrawer,
  FieldEmpty,
  FieldFieldGroup,
  FieldInput,
  FieldLabel,
  FieldPill,
  FieldSegmented,
  FieldStatusDot,
  FieldTextarea,
  FieldVoteColumn,
} from "./ui";

// Channel creation hits the deprecated seed-only /spaces/{id}/channels handler.
// Keep gated until it migrates to community_runtime.
const CHANNEL_CREATION_ENABLED = false;

function parseTime(s) {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function isVerifiedAuthor(users, t) {
  const u = users[t.author];
  if (!u || !u.badge) return false;
  return ["topper", "officer", "admin"].includes(u.badge.kind);
}

function sortThreads(list, sort, users) {
  const arr = [...list];
  switch (sort) {
    case "new":
      return arr.sort(
        (a, b) =>
          Number(!!b.pinned) - Number(!!a.pinned) ||
          parseTime(b.createdAt) - parseTime(a.createdAt),
      );
    case "top":
      return arr.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    case "verified":
      return arr.sort((a, b) => {
        const av = isVerifiedAuthor(users, a) ? 1 : 0;
        const bv = isVerifiedAuthor(users, b) ? 1 : 0;
        if (av !== bv) return bv - av;
        return (b.upvotes || 0) - (a.upvotes || 0);
      });
    case "unanswered":
      return arr.filter((t) => (t.replies || 0) === 0);
    case "hot":
    default:
      return arr.sort(
        (a, b) =>
          Number(!!b.pinned) - Number(!!a.pinned) ||
          (b.upvotes || 0) - (b.downvotes || 0) - ((a.upvotes || 0) - (a.downvotes || 0)),
      );
  }
}

function flairTone(kind) {
  switch (kind) {
    case "pyq":
      return "warn";
    case "doubt":
      return "info";
    case "topper":
    case "verified":
      return "accent";
    case "admin":
      return "ink";
    case "vent":
      return "neutral";
    default:
      return "outline";
  }
}

export default function CommunityScreen() {
  const params = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [spaces, setSpaces] = useState(SEED_SPACES);
  const [users, setUsers] = useState(SEED_USERS);
  const [threadsByChannel, setThreadsByChannel] = useState(SEED_THREADS);
  const [newChannelOpen, setNewChannelOpen] = useState(false);

  const [spaceId, setSpaceId] = useState(params.spaceId || SEED_SPACES[0].id);
  const [channelId, setChannelId] = useState(params.channelId || SEED_SPACES[0].channels[0].id);
  const threadId = params.threadId || null;
  const [sort, setSort] = useState("hot");
  const [composerOpen, setComposerOpen] = useState(false);

  const refreshSpaces = useCallback(async () => {
    try {
      const d = await api.get("/api/community/spaces");
      if (!d) return;
      if (Array.isArray(d.spaces) && d.spaces.length) setSpaces(d.spaces);
      if (d.users && typeof d.users === "object") setUsers((prev) => ({ ...prev, ...d.users }));
      if (d.threads && typeof d.threads === "object") setThreadsByChannel((prev) => ({ ...prev, ...d.threads }));
    } catch {}
  }, []);

  useEffect(() => {
    refreshSpaces();
  }, [refreshSpaces]);

  const refreshChannelThreads = useCallback(async (cid, sortKey = "hot") => {
    if (!cid) return;
    try {
      const d = await api.get(`/api/community/channels/${cid}/threads?sort=${encodeURIComponent(sortKey)}`);
      if (Array.isArray(d?.items)) {
        setThreadsByChannel((prev) => ({ ...prev, [cid]: d.items }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (channelId) refreshChannelThreads(channelId, sort);
  }, [channelId, sort, refreshChannelThreads]);

  const space = useMemo(() => spaces.find((s) => s.id === spaceId) || spaces[0], [spaces, spaceId]);
  const channel = useMemo(
    () => space?.channels.find((c) => c.id === channelId) || space?.channels[0],
    [space, channelId],
  );
  const threads = useMemo(() => threadsByChannel[channel?.id] || [], [threadsByChannel, channel]);
  const thread = useMemo(() => (threadId ? threads.find((t) => t.id === threadId) : null), [threadId, threads]);

  function pickSpace(s) {
    setSpaceId(s.id);
    setChannelId(s.channels[0].id);
    navigate(`/app/community/${s.id}/${s.channels[0].id}`);
  }
  function pickChannel(c) {
    setChannelId(c.id);
    if (space) navigate(`/app/community/${space.id}/${c.id}`);
  }
  function openThread(t) {
    if (space && channel) navigate(`/app/community/${space.id}/${channel.id}/${t.id}`);
  }
  function closeThread() {
    if (space && channel) navigate(`/app/community/${space.id}/${channel.id}`);
  }

  const sortedThreads = useMemo(() => sortThreads(threads, sort, users), [threads, sort, users]);

  return (
    <div
      data-testid="community-page"
      className="flex overflow-hidden bg-field-paper text-field-ink"
      style={{ height: "calc(100vh - 60px)" }}
    >
      <section className="w-[286px] border-r border-[#E7DECB] bg-[#FBF4E8] flex flex-col shrink-0">
        <CommunityTopNav spaces={spaces} activeId={space?.id} onPick={pickSpace} />
        <ChannelsRail
        space={space}
        activeId={channel?.id}
        onPick={pickChannel}
        isAdmin={isAdmin}
        onCreateChannel={() => setNewChannelOpen(true)}
      />
      </section>

      <section className="flex-1 min-w-0 flex flex-col bg-field-paper">
        <ChannelHeader space={space} channel={channel} onCompose={() => setComposerOpen(true)} />
        {channel ? <ChannelRules channel={channel} /> : null}

        {thread ? (
          <ThreadDetail
            thread={thread}
            channel={channel}
            users={users}
            onBack={closeThread}
            onChanged={() => refreshChannelThreads(channel.id, sort)}
          />
        ) : (
          <>
            <ThreadToolbar sort={sort} onSort={setSort} channel={channel} count={threads.length} />
            <div className="flex-1 overflow-auto">
              <div className="px-6 py-5 max-w-[1100px]">
                {sortedThreads.length === 0 ? (
                  <FieldEmpty
                    icon="◌"
                    title="No threads yet in this channel."
                    body="Be the first to start one."
                  />
                ) : (
                  <div className="space-y-2.5">
                    {sortedThreads.map((t) => (
                      <ThreadCard
                        key={t.id}
                        thread={t}
                        users={users}
                        channelId={channel.id}
                        onOpen={() => openThread(t)}
                        onVoted={() => refreshChannelThreads(channel.id, sort)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <CommunityFooter space={space} />
            </div>
          </>
        )}
      </section>

      {composerOpen ? (
        <ComposerDrawer
          channel={channel}
          onClose={() => setComposerOpen(false)}
          onCreated={(newThread) => {
            refreshChannelThreads(channel.id, sort);
            if (newThread?.id) navigate(`/app/community/${space.id}/${channel.id}/${newThread.id}`);
          }}
        />
      ) : null}

      {newChannelOpen ? (
        <NewChannelDrawer
          space={space}
          onClose={() => setNewChannelOpen(false)}
          onCreated={() => {
            refreshSpaces();
          }}
        />
      ) : null}
    </div>
  );
}

/* ─── Spaces rail ──────────────────────────────────────────────────────── */

function SpacesRail({ spaces, activeId, onPick }) {
  return (
    <aside className="w-[64px] bg-field-canvas border-r border-field-line flex flex-col items-center py-4 gap-2 overflow-y-auto shrink-0">
      <FieldLabel className="mb-1">Spaces</FieldLabel>
      {spaces.map((s) => {
        const totalUnread = s.channels.reduce((a, c) => a + (c.unread || 0), 0);
        const active = activeId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className="relative group focus:outline-none"
            title={s.name}
            data-testid={`space-${s.id}`}
          >
            <span
              aria-hidden={!active}
              className={`absolute -left-2 top-1/2 -translate-y-1/2 h-6 w-[2px] rounded-r ${
                active ? "bg-field-accent" : "bg-transparent"
              }`}
            />
            <FieldAvatar
              user={{ id: s.id, name: s.name, avatarColor: s.color }}
              size={42}
              className={`rounded-md ${
                active ? "ring-2 ring-field-accent" : "ring-1 ring-field-line"
              }`}
            />
            {totalUnread > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-field-accent text-white text-[9px] font-bold flex items-center justify-center font-mono">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            ) : null}
            <span className="absolute left-[52px] top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-field-ink text-white text-[10.5px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition z-10">
              {s.name}
            </span>
          </button>
        );
      })}
      <div className="mt-1 h-px w-8 bg-field-line" />
      <button
        type="button"
        className="w-10 h-10 rounded-md border border-dashed border-field-line text-field-ink-quiet hover:bg-field-line-soft flex items-center justify-center"
        title="Browse all spaces"
        aria-label="Browse all spaces"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}

/* ─── Channels rail ────────────────────────────────────────────────────── */

function ChannelsRail({ space, activeId, onPick, isAdmin, onCreateChannel }) {
  if (!space) return null;
  const grouped = {
    pinned: space.channels.filter((c) => c.lockedAdminWrite),
    active: space.channels.filter((c) => !c.lockedAdminWrite && (c.unread || 0) > 0),
    quiet: space.channels.filter((c) => !c.lockedAdminWrite && (c.unread || 0) === 0),
  };
  return (
    <aside className="w-[252px] border-r border-field-line bg-field-canvas flex flex-col shrink-0">
      <div className="px-4 pt-5 pb-4 border-b border-field-line">
        <div className="flex items-center gap-3">
          <FieldAvatar user={{ id: space.id, name: space.name, avatarColor: space.color }} size={36} className="rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="font-sans text-[15px] font-semibold leading-tight truncate text-field-ink">{space.name}</div>
            <div className="font-mono text-[10px] text-field-ink-quiet mt-0.5 uppercase tracking-[0.06em]">
              {space.members.toLocaleString()} · {space.online.toLocaleString()} online
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {space.verifiedToppers > 0 ? (
            <FieldPill tone="accent">{space.verifiedToppers} toppers</FieldPill>
          ) : null}
          {space.mentors > 0 ? <FieldPill tone="info">{space.mentors} mentors</FieldPill> : null}
        </div>
        {space.pinNote ? (
          <div className="mt-3 text-[11.5px] text-field-ink-muted italic leading-snug border-l-2 border-field-line pl-2.5">
            {space.pinNote}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {grouped.pinned.length > 0 ? (
          <RailGroup title="Official" channels={grouped.pinned} activeId={activeId} onPick={onPick} />
        ) : null}
        {grouped.active.length > 0 ? (
          <RailGroup title="Active" channels={grouped.active} activeId={activeId} onPick={onPick} />
        ) : null}
        {grouped.quiet.length > 0 ? (
          <RailGroup title="Quiet" channels={grouped.quiet} activeId={activeId} onPick={onPick} muted />
        ) : null}
        {isAdmin && CHANNEL_CREATION_ENABLED ? (
          <button
            type="button"
            onClick={onCreateChannel}
            data-testid="new-channel-btn"
            className="mt-2 w-full text-left flex items-center gap-2 px-2 py-2 rounded-md border border-dashed border-field-line text-field-ink-muted hover:bg-field-line-soft"
          >
            <span className="w-6 h-6 rounded-md border border-dashed border-field-line flex items-center justify-center font-mono text-[15px] leading-none">
              +
            </span>
            <span className="text-[12.5px] font-medium">New channel</span>
            <FieldLabel className="ml-auto">admin</FieldLabel>
          </button>
        ) : null}
      </div>

      <div className="px-3 py-3 border-t border-field-line bg-field-paper">
        <FieldLabel className="block mb-2">Quick jump</FieldLabel>
        <div className="flex flex-col gap-0.5">
          <QuickLink to="/app/groups" icon="◇" label="Find a study group" />
          <QuickLink to="/app/partners" icon="↔" label="Accountability partner" />
          <QuickLink to="/app/mentors" icon="◊" label="Mentor sessions" />
          <QuickLink to="/app/resources" icon="≣" label="Resource library" />
        </div>
      </div>
    </aside>
  );
}

function RailGroup({ title, channels, activeId, onPick, muted }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-2 mb-1">
        <FieldLabel>{title}</FieldLabel>
        <span className="font-mono text-[9.5px] text-field-ink-quiet">{channels.length}</span>
      </div>
      {channels.map((ch) => {
        const active = activeId === ch.id;
        return (
          <button
            key={ch.id}
            type="button"
            onClick={() => onPick(ch)}
            data-testid={`channel-${ch.id}`}
            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5 transition-colors ${
              active
                ? "bg-field-accent-soft text-field-accent-ink"
                : muted
                  ? "text-field-ink-quiet hover:bg-field-line-soft hover:text-field-ink-muted"
                  : "text-field-ink-muted hover:bg-field-line-soft hover:text-field-ink"
            }`}
          >
            <span className="font-mono text-[14px] w-5 text-center text-field-ink-quiet">#</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium truncate">{ch.name}</span>
                {ch.lockedAdminWrite ? (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="shrink-0 text-field-ink-quiet" aria-hidden="true">
                    <rect x="3" y="5" width="6" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.1" />
                    <path d="M4.5 5V3.6A1.5 1.5 0 0 1 7.5 3.6V5" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                ) : null}
              </span>
              <span className="block font-mono text-[10px] text-field-ink-quiet uppercase tracking-[0.06em] truncate">
                {ch.members ? `${ch.members.toLocaleString()} · ` : ""}
                {ch.lastActiveAt}
              </span>
            </span>
            {ch.unread > 0 ? (
              <span
                className={`min-w-[18px] h-[18px] px-1.5 rounded-full text-[9.5px] font-bold flex items-center justify-center font-mono ${
                  active ? "bg-field-accent text-white" : "bg-field-line text-field-ink"
                }`}
              >
                {ch.unread > 99 ? "99+" : ch.unread}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function QuickLink({ to, icon, label }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-field-line-soft text-[12px] text-field-ink-muted hover:text-field-ink transition-colors"
    >
      <span aria-hidden="true" className="w-5 text-center text-[13px] text-field-ink-quiet">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </Link>
  );
}

/* ─── Channel header + rules ───────────────────────────────────────────── */

function ChannelHeader({ space, channel, onCompose }) {
  if (!channel || !space) return null;
  return (
    <div className="px-6 pt-5 pb-4 border-b border-field-line bg-field-canvas flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.12em]">
          <span>{space.name}</span>
          <span aria-hidden="true">›</span>
          {channel.lockedAdminWrite ? <FieldPill tone="ink">Admin-write only</FieldPill> : null}
        </div>
        <h1 className="font-sans text-[24px] font-semibold mt-1.5 flex items-baseline gap-1.5 leading-tight text-field-ink">
          <span className="font-mono text-[20px] text-field-ink-quiet">#</span>
          {channel.name}
        </h1>
        {channel.purpose ? (
          <p className="text-[12.5px] text-field-ink-muted mt-1 max-w-[64ch]">{channel.purpose}</p>
        ) : null}
      </div>
      {!channel.lockedAdminWrite ? (
        <FieldButton variant="primary" size="sm" onClick={onCompose} data-testid="new-thread-btn">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          New thread
        </FieldButton>
      ) : null}
    </div>
  );
}

function ChannelRules({ channel }) {
  const rules = CHANNEL_RULES[rulesKeyFor(channel)] || [];
  if (rules.length === 0) return null;
  return (
    <div className="px-6 py-2 border-b border-field-line bg-field-paper">
      <div className="flex items-center gap-3 font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.12em]">
        <span>Rules</span>
        <span aria-hidden="true">·</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 normal-case tracking-normal text-[11px] text-field-ink-muted">
          {rules.slice(0, 3).map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-field-accent" />
              {r}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function ThreadToolbar({ sort, onSort, channel, count }) {
  const sorts = [
    { value: "hot", label: "Hot" },
    { value: "new", label: "New" },
    { value: "top", label: "Top" },
    { value: "verified", label: "Verified" },
    { value: "unanswered", label: "Unanswered" },
  ];
  return (
    <div className="px-6 py-3 border-b border-field-line bg-field-canvas flex items-center gap-3 flex-wrap">
      <FieldSegmented value={sort} onChange={onSort} options={sorts} />
      {channel && channel.pinned > 0 ? (
        <span className="font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.06em]">
          {channel.pinned} pinned
        </span>
      ) : null}
      <span className="font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.06em] ml-auto">
        {count} threads
      </span>
    </div>
  );
}

/* ─── Thread card ──────────────────────────────────────────────────────── */

function ThreadCard({ thread, users, channelId, onOpen, onVoted }) {
  const u = users[thread.author] || { name: thread.author };
  const isOfficial = u?.role === "admin";
  const flair = FLAIRS[thread.flair];
  const [localVote, setLocalVote] = useState(thread.youVoted || 0);
  const [localNet, setLocalNet] = useState(
    thread.netVotes != null ? thread.netVotes : (thread.upvotes || 0) - (thread.downvotes || 0),
  );
  const { run } = useApiAction();

  async function vote(direction) {
    const wanted = localVote === direction ? 0 : direction;
    const delta = wanted - localVote;
    const prevVote = localVote;
    const prevNet = localNet;
    const r = await run({
      action: () => api.post(`/api/community/channels/${channelId}/threads/${thread.id}/vote`, { direction }),
      optimistic: () => {
        setLocalVote(wanted);
        setLocalNet((v) => v + delta);
      },
      rollback: () => {
        setLocalVote(prevVote);
        setLocalNet(prevNet);
      },
      errorMessage: "Could not record vote.",
    });
    if (r.ok && r.data) {
      if (typeof r.data.netVotes === "number") setLocalNet(r.data.netVotes);
      if (typeof r.data.yourVote === "number") setLocalVote(r.data.yourVote);
      onVoted && onVoted();
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      onClick={onOpen}
      onKeyDown={handleKey}
      role="link"
      tabIndex={0}
      aria-label={`Open thread: ${thread.title}`}
      data-testid={`thread-card-${thread.id}`}
      className={`rounded-md border bg-field-canvas hover:border-field-ink-quiet transition-colors cursor-pointer flex gap-0 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-field-accent ${
        isOfficial
          ? "border-field-accent"
          : thread.pinned
            ? "border-field-warn/40"
            : "border-field-line"
      }`}
    >
      <div className="bg-field-paper border-r border-field-line-soft px-3 py-3 flex flex-col items-center">
        <FieldVoteColumn
          value={localNet}
          vote={localVote === 1 ? 1 : localVote === -1 ? -1 : 0}
          onVote={(d) => vote(d)}
        />
      </div>

      <div className="flex-1 min-w-0 px-5 py-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {thread.pinned ? <FieldPill tone="warn">Pinned</FieldPill> : null}
          {isOfficial ? <FieldPill tone="ink">Official</FieldPill> : null}
          {flair ? <FieldPill tone={flairTone(flair.kind)}>{flair.label}</FieldPill> : null}
          {thread.planRelevant ? (
            <FieldPill tone="info">Matches: {thread.planRelevant.topic}</FieldPill>
          ) : null}
          {thread.solved ? <FieldPill tone="accent">✓ Verified answer</FieldPill> : null}
        </div>

        <h3
          className="font-sans mt-2 leading-snug text-field-ink font-semibold"
          style={{ fontSize: thread.pinned || isOfficial ? 17 : 15.5 }}
        >
          {thread.title}
        </h3>

        {thread.body ? (
          <p className="text-[13px] text-field-ink-muted mt-1.5 leading-[1.55] line-clamp-2">{thread.body}</p>
        ) : null}

        {thread.verifiedSource ? (
          <div className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-field-accent-ink uppercase tracking-[0.06em]">
            <span aria-hidden="true">●</span>
            source · {thread.verifiedSource}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <FieldAvatar user={u} size={22} />
            <div className="font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.06em] truncate">
              <span className="text-field-ink-muted normal-case tracking-normal text-[11.5px]">{u.name || thread.author}</span>
              {" · "}
              {thread.createdAt}
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-field-ink-quiet">
            <span className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M2 4.5c0-1 .8-1.7 1.7-1.7h6.6c.9 0 1.7.7 1.7 1.7v4c0 1-.8 1.7-1.7 1.7H6L3.5 12V10.2h-.2c-.9 0-1.7-.7-1.7-1.7v-4z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              <span className="tabular-nums">{thread.replies || 0}</span>
              {thread.repliesLocked ? <span>· locked</span> : null}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Thread detail ────────────────────────────────────────────────────── */

function ThreadDetail({ thread, channel, users, onBack, onChanged }) {
  const u = users[thread.author] || { name: thread.author };
  const flair = FLAIRS[thread.flair];
  const [liveThread, setLiveThread] = useState(thread);
  const replies = liveThread.topReplies || thread.topReplies || [];
  const [vote, setVote] = useState(liveThread.youVoted || 0);
  const [netVotes, setNetVotes] = useState(
    liveThread.netVotes != null ? liveThread.netVotes : (liveThread.upvotes || 0) - (liveThread.downvotes || 0),
  );
  const { run } = useApiAction();

  const refreshThread = useCallback(async () => {
    if (!channel?.id || !thread.id) return;
    try {
      const d = await api.get(`/api/community/channels/${channel.id}/threads/${thread.id}`);
      if (d?.thread) {
        const fresh = { ...d.thread, topReplies: d.replies || [] };
        setLiveThread(fresh);
        if (typeof fresh.netVotes === "number") setNetVotes(fresh.netVotes);
        if (typeof fresh.youVoted === "number") setVote(fresh.youVoted);
      }
    } catch {}
  }, [channel?.id, thread.id]);

  useEffect(() => {
    refreshThread();
  }, [refreshThread]);

  async function castVote(direction) {
    const wanted = vote === direction ? 0 : direction;
    const delta = wanted - vote;
    const prevVote = vote;
    const prevNet = netVotes;
    const r = await run({
      action: () => api.post(`/api/community/channels/${channel.id}/threads/${thread.id}/vote`, { direction }),
      optimistic: () => {
        setVote(wanted);
        setNetVotes((v) => v + delta);
      },
      rollback: () => {
        setVote(prevVote);
        setNetVotes(prevNet);
      },
      errorMessage: "Could not record vote.",
    });
    if (r.ok && r.data) {
      if (typeof r.data.netVotes === "number") setNetVotes(r.data.netVotes);
      if (typeof r.data.yourVote === "number") setVote(r.data.yourVote);
      onChanged && onChanged();
    }
  }

  const isOfficial = u?.role === "admin";

  return (
    <div className="flex-1 overflow-auto" data-testid={`thread-detail-${thread.id}`}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-6 py-5 max-w-[1100px]">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-[11.5px] text-field-ink-muted hover:text-field-ink flex items-center gap-1.5 mb-3"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M7.5 2L3 6l4.5 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to #{channel?.name}
          </button>

          <FieldCard className="!p-6">
            <div className="flex items-center gap-1.5 flex-wrap">
              {thread.pinned ? <FieldPill tone="warn">Pinned</FieldPill> : null}
              {isOfficial ? <FieldPill tone="ink">Official</FieldPill> : null}
              {flair ? <FieldPill tone={flairTone(flair.kind)}>{flair.label}</FieldPill> : null}
              {thread.planRelevant ? <FieldPill tone="info">{thread.planRelevant.reason}</FieldPill> : null}
            </div>

            <h1 className="font-sans text-[26px] font-semibold mt-3 leading-tight text-field-ink">{thread.title}</h1>

            <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <FieldAvatar user={u} size={28} />
                <div>
                  <div className="text-[12.5px] font-medium text-field-ink">{u.name || thread.author}</div>
                  <div className="font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.06em]">
                    {thread.createdAt}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-field-ink-quiet">
                <FieldVoteColumn
                  value={netVotes}
                  vote={vote === 1 ? 1 : vote === -1 ? -1 : 0}
                  onVote={(d) => castVote(d)}
                />
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{liveThread.replies || 0} replies</span>
              </div>
            </div>

            <FieldDivider className="my-5" />

            <div className="text-[14px] text-field-ink leading-[1.7] whitespace-pre-wrap">{thread.body}</div>

            {thread.verifiedSource ? (
              <div className="mt-5 rounded-md bg-field-accent-soft border border-field-accent/30 p-3 flex items-center gap-3">
                <div aria-hidden="true" className="h-2 w-2 rounded-full bg-field-accent" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-semibold text-field-accent-ink">Official source</div>
                  <div className="font-mono text-[10.5px] text-field-accent-ink truncate">{thread.verifiedSource}</div>
                </div>
              </div>
            ) : null}
          </FieldCard>

          {thread.repliesLocked ? (
            <FieldCard tone="ink" className="mt-5 flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <div className="text-[12.5px]">Replies are locked on official posts. Discuss in a related channel.</div>
            </FieldCard>
          ) : (
            <ReplySection
              replies={replies}
              thread={liveThread}
              channel={channel}
              users={users}
              onChanged={() => {
                refreshThread();
                onChanged && onChanged();
              }}
            />
          )}
        </div>

        <ThreadSidebar thread={liveThread} channel={channel} users={users} />
      </div>
    </div>
  );
}

function ReplySection({ replies, thread, channel, users, onChanged }) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-sans text-[16px] font-semibold text-field-ink">{thread.replies || 0} replies</div>
        <FieldSegmented
          value="top"
          onChange={() => {}}
          options={[
            { value: "top", label: "Top" },
            { value: "new", label: "New" },
            { value: "verified", label: "Verified" },
          ]}
        />
      </div>

      <ReplyComposer channelId={channel?.id} threadId={thread.id} onPosted={onChanged} />

      <ul className="mt-4 space-y-2">
        {replies.map((r, i) => (
          <ReplyItem
            key={r.id}
            reply={r}
            users={users}
            channelId={channel?.id}
            threadId={thread.id}
            isFirst={i === 0}
            onChanged={onChanged}
          />
        ))}
        {replies.length === 0 ? (
          <li>
            <FieldEmpty title="No replies yet." body="Be the first to add a calm, sourced answer." />
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ReplyItem({ reply, users, channelId, threadId, isFirst, onChanged }) {
  const u = users[reply.author] || { name: reply.author };
  const isVerified = u?.badge && (u.badge.kind === "topper" || u.badge.kind === "officer");
  const [vote, setVote] = useState(reply.youVoted || 0);
  const [net, setNet] = useState(reply.netVotes != null ? reply.netVotes : reply.upvotes || 0);
  const { run } = useApiAction();

  async function castVote(direction) {
    const wanted = vote === direction ? 0 : direction;
    const delta = wanted - vote;
    const prevVote = vote;
    const prevNet = net;
    const r = await run({
      action: () =>
        api.post(`/api/community/channels/${channelId}/threads/${threadId}/replies/${reply.id}/vote`, { direction }),
      optimistic: () => {
        setVote(wanted);
        setNet((v) => v + delta);
      },
      rollback: () => {
        setVote(prevVote);
        setNet(prevNet);
      },
      errorMessage: "Could not record vote.",
    });
    if (r.ok && r.data) {
      if (typeof r.data.netVotes === "number") setNet(r.data.netVotes);
      if (typeof r.data.yourVote === "number") setVote(r.data.yourVote);
      onChanged && onChanged();
    }
  }

  return (
    <li
      data-testid={`reply-${reply.id}`}
      className={`rounded-md border p-4 flex gap-4 ${
        isVerified ? "border-field-accent/40 bg-field-accent-soft/30" : "border-field-line bg-field-canvas"
      }`}
    >
      <FieldVoteColumn value={net} vote={vote === 1 ? 1 : vote === -1 ? -1 : 0} onVote={(d) => castVote(d)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FieldAvatar user={u} size={22} />
            <span className="text-[12px] font-medium text-field-ink">{u.name || reply.author}</span>
            <span className="font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.06em]">
              {reply.createdAt || "2h"}
            </span>
          </div>
          {isVerified && isFirst ? <FieldPill tone="accent">Top verified answer</FieldPill> : null}
        </div>
        <p className="text-[13.5px] text-field-ink mt-2.5 leading-[1.65] whitespace-pre-wrap">{reply.body}</p>
      </div>
    </li>
  );
}

function ReplyComposer({ channelId, threadId, onPosted }) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    const text = body.trim();
    if (!text || !channelId || !threadId) return;
    setPosting(true);
    setError(null);
    try {
      await api.post(`/api/community/channels/${channelId}/threads/${threadId}/replies`, { body: text });
      setBody("");
      onPosted && onPosted();
    } catch (e) {
      setError(e?.message || "Could not post reply.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-md border border-field-line bg-field-canvas overflow-hidden" data-testid="reply-composer">
      <div className="px-3 py-1.5 border-b border-field-line bg-field-paper">
        <FieldLabel>Markdown supported</FieldLabel>
      </div>
      <textarea
        rows="2"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share your thought, ask a follow-up, or post a counter-point…"
        className="block w-full px-3 py-2.5 text-[13px] bg-transparent outline-none resize-none placeholder:text-field-ink-quiet text-field-ink"
        data-testid="reply-body"
      />
      <div className="flex items-center justify-between px-3 py-2 border-t border-field-line gap-3 flex-wrap">
        <span className="text-[11px] text-field-ink-quiet flex-1">
          {error ? (
            <span className="text-field-danger">{error}</span>
          ) : (
            "Be calm. No pile-ons. Verified Topper answers may be promoted to the top."
          )}
        </span>
        <FieldButton
          variant="primary"
          size="xs"
          onClick={submit}
          disabled={posting || !body.trim()}
          data-testid="reply-submit"
        >
          {posting ? "Posting…" : "Post reply"}
        </FieldButton>
      </div>
    </div>
  );
}

function ThreadSidebar({ thread, channel, users }) {
  const verifiedHandles = useMemo(() => {
    const all = Object.values(users).filter((u) => u.badge && ["topper", "officer"].includes(u.badge.kind));
    return all.slice(0, 3);
  }, [users]);
  const rules = CHANNEL_RULES[rulesKeyFor(channel)] || [];
  return (
    <aside className="space-y-4">
      <FieldCard className="!p-5">
        <FieldLabel>Channel rules</FieldLabel>
        <h3 className="font-sans text-[14px] font-semibold mt-1 text-field-ink">#{channel?.name}</h3>
        {rules.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-[12px] text-field-ink-muted list-disc pl-4">
            {rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12px] text-field-ink-muted">Standard community rules apply.</p>
        )}
      </FieldCard>

      {thread.planRelevant ? (
        <FieldCard tone="accent" className="!p-5">
          <FieldLabel>From Study OS</FieldLabel>
          <h3 className="font-sans text-[14px] font-semibold mt-1 text-field-accent-ink">
            {thread.planRelevant.reason}.
          </h3>
          <p className="text-[12px] text-field-accent-ink/85 mt-1.5">
            This thread covers <strong className="font-semibold">{thread.planRelevant.topic}</strong>.
          </p>
        </FieldCard>
      ) : null}

      <FieldCard className="!p-5">
        <FieldLabel>Verified contributors</FieldLabel>
        <ul className="mt-3 space-y-2.5">
          {verifiedHandles.map((u) => (
            <li key={u.id} className="flex items-center gap-2">
              <FieldAvatar user={u} size={26} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium leading-tight truncate text-field-ink">{u.name}</div>
                <div className="font-mono text-[10px] text-field-ink-quiet uppercase tracking-[0.06em]">
                  {u.badge?.kind === "topper" ? "Topper" : u.badge?.kind === "officer" ? "Officer" : "Verified"}
                </div>
              </div>
            </li>
          ))}
          {verifiedHandles.length === 0 ? (
            <li className="text-[11.5px] text-field-ink-quiet italic">No verified contributors yet.</li>
          ) : null}
        </ul>
      </FieldCard>
    </aside>
  );
}

/* ─── Drawers ──────────────────────────────────────────────────────────── */

function ComposerDrawer({ channel, onClose, onCreated }) {
  const [flair, setFlair] = useState("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);
  const flairOptions = Object.keys(FLAIRS).slice(0, 7);

  async function submit() {
    if (!title.trim() || !body.trim() || !channel) return;
    if (title.trim().length < 6 || body.trim().length < 10) {
      setError("Title must be ≥ 6 chars and body ≥ 10 chars.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const newThread = await api.post(`/api/community/channels/${channel.id}/threads`, {
        title: title.trim(),
        body: body.trim(),
        flair,
      });
      onCreated && onCreated(newThread);
      onClose();
    } catch (e) {
      setError(e?.message || "Could not post thread.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <FieldDrawer
      open
      onClose={onClose}
      title={`New thread in #${channel?.name || ""}`}
      width={560}
      footer={
        <div className="flex justify-end gap-2">
          <FieldButton variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </FieldButton>
          <FieldButton
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={posting || title.trim().length < 6 || body.trim().length < 10}
            data-testid="thread-submit"
          >
            {posting ? "Posting…" : "Post thread"}
          </FieldButton>
        </div>
      }
    >
      <div className="space-y-4" data-testid="composer-drawer">
        <FieldFieldGroup label="Flair">
          <div className="flex flex-wrap gap-1.5">
            {flairOptions.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFlair(k)}
                className={`text-[11.5px] px-2.5 h-7 rounded-md border transition-colors ${
                  flair === k
                    ? "bg-field-accent text-white border-field-accent"
                    : "border-field-line text-field-ink-muted hover:bg-field-line-soft"
                }`}
              >
                {FLAIRS[k].label}
              </button>
            ))}
          </div>
        </FieldFieldGroup>
        <FieldFieldGroup label="Title">
          <FieldInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A clear, specific question or claim"
            data-testid="thread-title"
          />
        </FieldFieldGroup>
        <FieldFieldGroup label="Body" hint="Markdown supported. Cite sources. Be specific.">
          <FieldTextarea
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Markdown supported. Cite sources. Be specific."
            data-testid="thread-body"
          />
        </FieldFieldGroup>
        <div className="rounded-md border border-field-accent/30 bg-field-accent-soft p-3 text-[12px] text-field-accent-ink leading-relaxed">
          <strong className="font-medium">Before posting:</strong> if this is a PYQ or factual claim, attach the
          year/question or a source link. The community moderation rule on misinformation is firm.
        </div>
        {error ? (
          <div className="rounded-md border border-field-danger/30 bg-field-danger-soft p-3 text-[12px] text-field-danger">
            {error}
          </div>
        ) : null}
      </div>
    </FieldDrawer>
  );
}

function NewChannelDrawer({ space, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    const slug = name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(slug)) {
      setError("Channel name must be lowercase letters, numbers, or dashes (2–32 chars).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const d = await api.post(`/api/community/spaces/${space.id}/channels`, {
        name: slug,
        purpose: purpose || null,
        lockedAdminWrite: locked,
      });
      onCreated && onCreated(d?.channel);
      onClose();
    } catch (e) {
      setError(e?.message || "Could not create channel.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FieldDrawer
      open
      onClose={onClose}
      title={`New channel in ${space?.name || ""}`}
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <FieldButton variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </FieldButton>
          <FieldButton
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={submitting || !name.trim()}
            data-testid="new-channel-submit"
          >
            {submitting ? "Creating…" : "Create channel"}
          </FieldButton>
        </div>
      }
    >
      <div className="space-y-4" data-testid="new-channel-drawer">
        <FieldFieldGroup
          label="Channel name"
          hint="lowercase · letters, numbers, dashes only · 2–32 chars"
        >
          <FieldInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. mock-tests"
            data-testid="new-channel-name"
            className="font-mono"
          />
        </FieldFieldGroup>
        <FieldFieldGroup label="Purpose">
          <FieldInput
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="What this channel is for (visible at the top)"
          />
        </FieldFieldGroup>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => setLocked(e.target.checked)}
            className="mt-0.5 accent-field-accent"
          />
          <span className="text-[12.5px] text-field-ink">
            <strong className="font-medium">Admin-write only.</strong>
            <span className="block text-[11px] text-field-ink-muted mt-0.5">
              Replies are locked. Only admin posts appear. Use for official update channels.
            </span>
          </span>
        </label>
        {error ? (
          <div className="rounded-md border border-field-danger/30 bg-field-danger-soft p-3 text-[12px] text-field-danger">
            {error}
          </div>
        ) : null}
      </div>
    </FieldDrawer>
  );
}

function CommunityFooter({ space }) {
  return (
    <div className="px-6 py-5 border-t border-field-line bg-field-canvas font-mono text-[10.5px] text-field-ink-quiet uppercase tracking-[0.06em] flex items-center justify-between">
      <span>
        community · {space?.name} · {space?.members.toLocaleString()} members
      </span>
      <FieldStatusDot state="live" label="live · /api/community/spaces" />
    </div>
  );
}
