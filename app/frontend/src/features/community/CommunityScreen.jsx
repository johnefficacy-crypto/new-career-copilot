import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  ChannelIcon,
  ChannelRulesRibbon,
  Drawer,
  Eyebrow,
  Flair,
  Pill,
  SpaceIcon,
  StatusDot,
  StudyCard as Card,
  StudyEmptyState as EmptyState,
  UserBadge,
  UserChip,
  VerifiedSeal,
  VoteColumn,
} from "../../shared/ui/studyos";
import { api } from "../../lib/api";
import {
  COMMUNITY_SPACES as SEED_SPACES,
  COMMUNITY_USERS as SEED_USERS,
  THREADS as SEED_THREADS,
  CHANNEL_RULES,
  FLAIRS,
  rulesKeyFor,
} from "./data";

// Production port of docs/reference/UI_claude-code/screen-community.jsx.
// Spaces rail (vertical) → Channels rail → Channel header + rules ribbon →
// Thread list with sort toolbar → Thread detail with replies & sidebar.

export default function CommunityScreen() {
  const params = useParams();
  const navigate = useNavigate();

  const [spaces, setSpaces] = useState(SEED_SPACES);
  const [users, setUsers] = useState(SEED_USERS);
  const [threadsByChannel, setThreadsByChannel] = useState(SEED_THREADS);

  const [spaceId, setSpaceId] = useState(params.spaceId || SEED_SPACES[0].id);
  const [channelId, setChannelId] = useState(
    params.channelId || SEED_SPACES[0].channels[0].id,
  );
  const threadId = params.threadId || null;
  const [sort, setSort] = useState("hot");
  const [composerOpen, setComposerOpen] = useState(false);

  // Live data: fetch the spaces document; gracefully fall back to seed.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/community/spaces")
      .then((d) => {
        if (cancelled || !d) return;
        if (Array.isArray(d.spaces) && d.spaces.length) setSpaces(d.spaces);
        if (d.users && typeof d.users === "object") setUsers((prev) => ({ ...prev, ...d.users }));
        if (d.threads && typeof d.threads === "object")
          setThreadsByChannel((prev) => ({ ...prev, ...d.threads }));
      })
      .catch(() => {
        // Backend not configured for spaces yet — keep seed data.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const space = useMemo(() => spaces.find((s) => s.id === spaceId) || spaces[0], [spaces, spaceId]);
  const channel = useMemo(
    () => space?.channels.find((c) => c.id === channelId) || space?.channels[0],
    [space, channelId],
  );
  const threads = useMemo(() => threadsByChannel[channel?.id] || [], [threadsByChannel, channel]);
  const thread = useMemo(() => (threadId ? threads.find((t) => t.id === threadId) : null), [threadId, threads]);

  // Keep URL in sync with active space/channel/thread for shareability.
  useEffect(() => {
    if (!space || !channel) return;
    const wanted = thread
      ? `/app/community/${space.id}/${channel.id}/${thread.id}`
      : `/app/community/${space.id}/${channel.id}`;
    if (window.location.pathname !== wanted) {
      navigate(wanted, { replace: true });
    }
  }, [space, channel, thread, navigate]);

  function pickSpace(s) {
    setSpaceId(s.id);
    setChannelId(s.channels[0].id);
    if (threadId) navigate(`/app/community/${s.id}/${s.channels[0].id}`);
  }
  function pickChannel(c) {
    setChannelId(c.id);
    if (threadId) navigate(`/app/community/${space.id}/${c.id}`);
  }
  function openThread(t) {
    navigate(`/app/community/${space.id}/${channel.id}/${t.id}`);
  }
  function closeThread() {
    navigate(`/app/community/${space.id}/${channel.id}`);
  }

  const sortedThreads = useMemo(() => sortThreads(threads, sort, users), [threads, sort, users]);

  return (
    // Break out of the DashShell's padded centered <main> so the community
    // surface renders edge-to-edge like the reference prototype.
    <div
      data-testid="community-page"
      className="flex overflow-hidden -mx-5 lg:-mx-8 -my-5 lg:-my-8"
      style={{ height: "calc(100vh - 64px)" }}
    >
      <SpacesRail spaces={spaces} activeId={space?.id} onPick={pickSpace} />
      <ChannelsRail space={space} activeId={channel?.id} onPick={pickChannel} />

      <section className="flex-1 min-w-0 flex flex-col bg-[#FBF6EF]">
        <ChannelHeader space={space} channel={channel} onCompose={() => setComposerOpen(true)} />
        {channel ? (
          <ChannelRulesRibbon channel={channel} rules={CHANNEL_RULES[rulesKeyFor(channel)] || []} />
        ) : null}

        {thread ? (
          <ThreadDetail
            thread={thread}
            channel={channel}
            users={users}
            onBack={closeThread}
          />
        ) : (
          <>
            <ThreadToolbar sort={sort} onSort={setSort} channel={channel} count={threads.length} />
            <div className="flex-1 overflow-auto">
              <div className="px-6 py-4">
                {sortedThreads.length === 0 ? (
                  <EmptyState
                    icon="◌"
                    title="No threads yet in this channel."
                    body="Be the first to start one."
                  />
                ) : (
                  <div className="space-y-3">
                    {sortedThreads.map((t) => (
                      <ThreadCard
                        key={t.id}
                        thread={t}
                        users={users}
                        onOpen={() => openThread(t)}
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
        <ComposerDrawer channel={channel} onClose={() => setComposerOpen(false)} />
      ) : null}
    </div>
  );
}

function sortThreads(list, sort, users) {
  const arr = [...list];
  switch (sort) {
    case "new":
      return arr.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
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

function isVerifiedAuthor(users, t) {
  const u = users[t.author];
  if (!u || !u.badge) return false;
  return ["topper", "officer", "admin"].includes(u.badge.kind);
}

/* ─── Spaces rail ──────────────────────────────────────────────────────── */
function SpacesRail({ spaces, activeId, onPick }) {
  return (
    <aside className="w-[78px] bg-[#F3EADB] border-r border-[#E7DECB] flex flex-col items-center py-4 gap-2 overflow-y-auto shrink-0">
      <div className="num-mono text-[9px] text-[#A68057] tracking-[0.18em] mb-1">SPACES</div>
      {spaces.map((s) => {
        const totalUnread = s.channels.reduce((a, c) => a + (c.unread || 0), 0);
        return (
          <button
            key={s.id}
            onClick={() => onPick(s)}
            className="relative group"
            title={s.name}
            data-testid={`space-${s.id}`}
            type="button"
          >
            <SpaceIcon space={s} size={44} active={activeId === s.id} />
            {totalUnread > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#2E2218] text-[#F3EADB] text-[9px] font-bold flex items-center justify-center num-mono">
                {totalUnread}
              </span>
            ) : null}
            <span className="absolute left-[52px] top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-[#2E2218] text-[#F3EADB] text-[10.5px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition z-10">
              {s.name}
            </span>
          </button>
        );
      })}
      <div className="mt-1 h-px w-8 bg-[#D6C9AC]" />
      <button
        type="button"
        className="w-11 h-11 rounded-xl border border-dashed border-[#A68057] text-[#6C5038] flex items-center justify-center hover:bg-[#FBF6EF]"
        title="Browse all spaces"
        aria-label="Browse all spaces"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}

/* ─── Channels rail ────────────────────────────────────────────────────── */
function ChannelsRail({ space, activeId, onPick }) {
  if (!space) return null;
  const grouped = {
    pinned: space.channels.filter((c) => c.lockedAdminWrite),
    active: space.channels.filter((c) => !c.lockedAdminWrite && (c.unread || 0) > 0),
    quiet: space.channels.filter((c) => !c.lockedAdminWrite && (c.unread || 0) === 0),
  };
  return (
    <aside className="w-[300px] border-r border-[#E7DECB] bg-[#FBF4E8] flex flex-col shrink-0">
      <div className="px-4 pt-4 pb-3 border-b border-[#E7DECB]">
        <div className="flex items-center gap-3">
          <SpaceIcon space={space} size={36} active />
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[16px] leading-tight truncate">{space.name}</div>
            <div className="num-mono text-[10px] text-clay-700 mt-0.5">
              {space.members.toLocaleString()} members · <span className="text-[#33482F]">●</span> {space.online.toLocaleString()} online
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center flex-wrap gap-1.5 text-[10.5px]">
          {space.verifiedToppers > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-[#54794E]" />
              {space.verifiedToppers} verified toppers
            </span>
          ) : null}
          {space.mentors > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-[#A68057]" />
              {space.mentors} mentors
            </span>
          ) : null}
        </div>
        {space.pinNote ? (
          <div className="mt-3 text-[11px] text-clay-700 italic leading-snug border-l-2 border-[#D6BC93] pl-2.5">
            {space.pinNote}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {grouped.pinned.length > 0 ? (
          <RailGroup title="Official" channels={grouped.pinned} activeId={activeId} onPick={onPick} space={space} />
        ) : null}
        {grouped.active.length > 0 ? (
          <RailGroup title="Active" channels={grouped.active} activeId={activeId} onPick={onPick} space={space} />
        ) : null}
        {grouped.quiet.length > 0 ? (
          <RailGroup title="Quiet" channels={grouped.quiet} activeId={activeId} onPick={onPick} space={space} muted />
        ) : null}
      </div>

      <div className="px-3 py-3 border-t border-[#E7DECB] bg-[#F3EADB]/40">
        <div className="num-mono text-[9.5px] text-[#A68057] tracking-[0.18em] mb-1.5">QUICK JUMP</div>
        <div className="flex flex-col gap-1.5">
          <QuickLink to="/app/community/general/g-groups" icon="◇" label="Find a study group" badge="12 active" />
          <QuickLink to="/app/accountability" icon="↔" label="Accountability partner" badge="34d streak" />
          <QuickLink to="/app/mentors" icon="◊" label="Mentor sessions" badge="4 this week" />
          <QuickLink to="/app/marketplace" icon="≣" label="Resource library" />
        </div>
      </div>
    </aside>
  );
}

function RailGroup({ title, channels, activeId, onPick, space, muted }) {
  return (
    <div className="mb-3">
      <div className="num-mono text-[9.5px] text-[#A68057] tracking-[0.18em] px-2 mb-1.5 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[#C9B68F]">{channels.length}</span>
      </div>
      {channels.map((ch) => (
        <button
          key={ch.id}
          type="button"
          onClick={() => onPick(ch)}
          data-testid={`channel-${ch.id}`}
          className={`w-full text-left flex items-center gap-2.5 px-2 py-2 rounded-lg mb-0.5 transition ${
            activeId === ch.id ? "bg-[#2E2218]" : "hover:bg-[#F3EADB]"
          }`}
        >
          <ChannelIcon ch={ch} color={space.color} size={26} />
          <span className="flex-1 min-w-0">
            <span className={`flex items-center gap-1.5 ${activeId === ch.id ? "text-[#F3EADB]" : "text-[#2E2218]"}`}>
              <span className="text-[12.5px] font-medium truncate">{ch.name}</span>
              {ch.lockedAdminWrite ? (
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="shrink-0"
                  style={{ color: activeId === ch.id ? "#D6BC93" : "#A68057" }}
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="6" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.1" />
                  <path d="M4.5 5V3.6A1.5 1.5 0 0 1 7.5 3.6V5" stroke="currentColor" strokeWidth="1.1" />
                </svg>
              ) : null}
            </span>
            <span
              className={`block text-[10px] num-mono ${
                activeId === ch.id ? "text-[#D6BC93]" : muted ? "text-[#C9B68F]" : "text-[#A68057]"
              }`}
            >
              {ch.members ? `${ch.members.toLocaleString()} · ` : ""}
              {ch.lastActiveAt}
            </span>
          </span>
          {ch.unread > 0 ? (
            <span
              className={`min-w-[20px] h-[18px] px-1.5 rounded-full text-[9.5px] font-bold flex items-center justify-center num-mono ${
                activeId === ch.id ? "bg-[#D6BC93] text-[#2E2218]" : "bg-[#2E2218] text-[#F3EADB]"
              }`}
            >
              {ch.unread}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function QuickLink({ to, icon, label, badge }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F3EADB] text-[11.5px] text-[#3a2e22]"
    >
      <span className="w-5 text-center text-[14px] text-[#A68057]">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge ? <span className="num-mono text-[9.5px] text-clay-700">{badge}</span> : null}
    </Link>
  );
}

/* ─── Channel header + toolbar ─────────────────────────────────────────── */
function ChannelHeader({ space, channel, onCompose }) {
  if (!channel || !space) return null;
  return (
    <div className="px-6 pt-5 pb-3 border-b border-[#E7DECB] bg-[#FBF6EF] flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-clay-700">
          <span className="num-mono tracking-[0.18em] uppercase">{space.name}</span>
          <span>›</span>
          {channel.lockedAdminWrite ? <Pill tone="ink">Locked · admin-write only</Pill> : null}
        </div>
        <h1 className="font-heading text-[28px] mt-1 flex items-baseline gap-2 leading-tight">
          <span className="font-mono text-[20px] text-[#A68057]">#</span>
          {channel.name}
        </h1>
        <p className="text-[12.5px] text-clay-700 mt-1 max-w-[64ch]">
          {channel.purpose || "Discussion channel."}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 text-[12px] font-semibold flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 7a4.5 4.5 0 1 0 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M9 4.5h-2v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Follow
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 text-[12px] font-semibold"
        >
          Search
        </button>
        {!channel.lockedAdminWrite ? (
          <button
            type="button"
            onClick={onCompose}
            data-testid="new-thread-btn"
            className="px-3.5 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold flex items-center gap-1.5"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            New thread
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ThreadToolbar({ sort, onSort, channel, count }) {
  const sorts = [
    { v: "hot", label: "Hot" },
    { v: "new", label: "New" },
    { v: "top", label: "Top · week" },
    { v: "verified", label: "Verified · floats Toppers" },
    { v: "unanswered", label: "Unanswered" },
  ];
  return (
    <div className="px-6 py-3 border-b border-[#E7DECB] bg-[#FBF6EF] flex items-center gap-3 flex-wrap">
      <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
        {sorts.map((s) => (
          <button
            key={s.v}
            type="button"
            onClick={() => onSort(s.v)}
            data-testid={`sort-${s.v}`}
            className={`px-3 py-1 rounded-full text-[11.5px] font-semibold ${
              sort === s.v ? "bg-[#2E2218] text-[#F3EADB]" : "text-clay-700 hover:bg-[#E7D6BA]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {channel && channel.pinned > 0 ? (
        <span className="num-mono text-[10.5px] text-clay-700">{channel.pinned} pinned</span>
      ) : null}
      <span className="num-mono text-[10.5px] text-clay-700 ml-auto">{count} threads</span>
    </div>
  );
}

/* ─── Thread card ──────────────────────────────────────────────────────── */
function ThreadCard({ thread, users, onOpen }) {
  const u = users[thread.author];
  const isOfficial = u?.role === "admin";
  const flair = FLAIRS[thread.flair];
  return (
    <article
      onClick={onOpen}
      data-testid={`thread-card-${thread.id}`}
      className={`rounded-xl border bg-white/70 hover:bg-white hover:border-[#A68057] transition cursor-pointer flex gap-0 overflow-hidden ${
        isOfficial ? "border-[#2E2218]" : thread.pinned ? "border-[#94B28A]" : "border-[#E7DECB]"
      }`}
      style={isOfficial ? { background: "linear-gradient(180deg, #FBF8F2 0%, #FBF6EF 100%)" } : {}}
    >
      <div className="bg-[#FBF8F2] border-r border-[#EFE2C9] py-3 flex flex-col items-center">
        <VoteColumn count={(thread.upvotes || 0) - (thread.downvotes || 0)} />
      </div>

      <div className="flex-1 min-w-0 px-5 py-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          {thread.pinned ? (
            <span className="pill pill-sage" style={{ fontSize: 9.5, padding: "2px 7px" }}>
              📌 Pinned
            </span>
          ) : null}
          {isOfficial ? <span className="stamp stamp-official">Official</span> : null}
          <Flair flair={flair} />
          {thread.planRelevant ? (
            <span
              className="pill"
              style={{ background: "#ECE7F2", color: "#31293B", fontSize: 9.5, padding: "2px 7px" }}
            >
              ◐ Matches: {thread.planRelevant.topic}
            </span>
          ) : null}
          {thread.solved ? (
            <span className="pill pill-sage" style={{ fontSize: 9.5, padding: "2px 7px" }}>
              ✓ Verified answer
            </span>
          ) : null}
        </div>

        <h3
          className="font-heading mt-2 leading-snug text-[#2E2218]"
          style={{ fontSize: thread.pinned || isOfficial ? 19 : 17 }}
        >
          {thread.title}
        </h3>

        {thread.body ? (
          <p className="text-[13px] text-[#3a2e22] mt-1.5 leading-[1.5] line-clamp-2">{thread.body}</p>
        ) : null}

        {thread.verifiedSource ? (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] text-[#33482F] num-mono">
            <VerifiedSeal size={14} />
            <span>source · {thread.verifiedSource}</span>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <UserChip user={u || { name: thread.author }} time={thread.createdAt} compact />
          <div className="flex items-center gap-3 text-[11px] text-clay-700">
            <span className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M2 4.5c0-1 .8-1.7 1.7-1.7h6.6c.9 0 1.7.7 1.7 1.7v4c0 1-.8 1.7-1.7 1.7H6L3.5 12V10.2h-.2c-.9 0-1.7-.7-1.7-1.7v-4z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              <span className="num-mono">{thread.replies || 0}</span>
              {thread.repliesLocked ? <span className="text-[#A68057]">· locked</span> : null}
            </span>
            <button type="button" className="hover:text-[#2E2218]" onClick={(e) => e.stopPropagation()}>
              Save
            </button>
            <button type="button" className="hover:text-[#2E2218]" onClick={(e) => e.stopPropagation()}>
              Share
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Thread detail ────────────────────────────────────────────────────── */
function ThreadDetail({ thread, channel, users, onBack }) {
  const u = users[thread.author] || { name: thread.author };
  const [vote, setVote] = useState(0);
  const flair = FLAIRS[thread.flair];
  const replies = thread.topReplies || [];

  return (
    <div className="flex-1 overflow-auto" data-testid={`thread-detail-${thread.id}`}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 px-6 py-5 max-w-[1100px]">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-[11.5px] text-clay-700 hover:text-clay-900 flex items-center gap-1.5 mb-3"
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

          <article className="rounded-xl border border-[#E7DECB] bg-white/80 p-6">
            <div className="flex items-center gap-2 flex-wrap">
              {thread.pinned ? <Pill tone="sage">📌 Pinned</Pill> : null}
              {u?.role === "admin" ? <span className="stamp stamp-official">Official</span> : null}
              <Flair flair={flair} />
              {thread.planRelevant ? (
                <span className="pill" style={{ background: "#ECE7F2", color: "#31293B", fontSize: 9.5 }}>
                  ◐ {thread.planRelevant.reason}
                </span>
              ) : null}
            </div>

            <h1 className="font-heading text-[28px] mt-2.5 leading-tight">{thread.title}</h1>

            <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
              <UserChip user={u} time={thread.createdAt} />
              <div className="flex items-center gap-2 text-[11px] text-clay-700">
                <VoteColumn
                  vertical={false}
                  count={(thread.upvotes || 0) - (thread.downvotes || 0) + vote}
                  voted={vote === 1 ? 1 : vote === -1 ? -1 : null}
                  onVote={(d) => setVote((v) => (v === d ? 0 : d))}
                />
                <span className="text-[#A68057]">·</span>
                <span className="num-mono">{thread.replies || 0} replies</span>
              </div>
            </div>

            <div className="rule mt-4 pt-4 text-[14.5px] text-[#2E2218] leading-[1.65] whitespace-pre-wrap">
              {thread.body}
            </div>

            {thread.verifiedSource ? (
              <div className="rule mt-4 pt-3 rounded-lg bg-[#F0F5EF] border border-[#B9CFAF] p-3 flex items-center gap-3">
                <VerifiedSeal size={20} />
                <div className="flex-1">
                  <div className="text-[11.5px] font-semibold text-[#33482F]">Official source</div>
                  <div className="num-mono text-[10.5px] text-[#33482F]">{thread.verifiedSource}</div>
                </div>
                <button
                  type="button"
                  className="text-[11px] text-[#33482F] font-semibold underline bg-transparent"
                >
                  Open →
                </button>
              </div>
            ) : null}

            <div className="rule mt-5 pt-4 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold"
              >
                Reply
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 text-[12px] font-semibold"
              >
                Save
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 text-[12px] font-semibold"
              >
                Share
              </button>
              {thread.planRelevant ? (
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full border border-[#94B28A] text-[#33482F] text-[12px] font-semibold flex items-center gap-1.5"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  Add to study tasks
                </button>
              ) : null}
              <button type="button" className="ml-auto text-[11px] text-clay-700 hover:text-clay-900">
                Report
              </button>
            </div>
          </article>

          {thread.repliesLocked ? (
            <div className="mt-5 rounded-xl border border-[#2E2218] bg-[#2E2218] text-[#D6BC93] p-4 flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="#D6BC93" strokeWidth="1.4" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="#D6BC93" strokeWidth="1.4" />
              </svg>
              <div className="text-[12.5px]">
                Replies are locked on official posts. Discuss in{" "}
                <button type="button" className="underline font-semibold bg-transparent">
                  #preparation
                </button>{" "}
                or{" "}
                <button type="button" className="underline font-semibold bg-transparent">
                  #form-help
                </button>
                .
              </div>
            </div>
          ) : (
            <ReplySection replies={replies} thread={thread} users={users} />
          )}
        </div>

        <ThreadSidebar thread={thread} channel={channel} users={users} />
      </div>
    </div>
  );
}

function ReplySection({ replies, thread, users }) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-heading text-[18px]">{thread.replies || 0} replies</div>
        <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
          {["Top", "New", "Verified"].map((s, i) => (
            <button
              key={s}
              type="button"
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                i === 0 ? "bg-[#2E2218] text-[#F3EADB]" : "text-clay-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <ReplyComposer />

      <ul className="mt-5 space-y-3">
        {replies.map((r, i) => {
          const u = users[r.author] || { name: r.author };
          const isVerified = u?.badge && (u.badge.kind === "topper" || u.badge.kind === "officer");
          return (
            <li
              key={r.id}
              className={`rounded-xl border p-4 flex gap-4 ${
                isVerified ? "border-[#94B28A] bg-[#F0F5EF]/40" : "border-[#E7DECB] bg-white/60"
              }`}
            >
              <VoteColumn count={r.upvotes} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <UserChip user={u} time="2h" compact />
                  {isVerified && i === 0 ? (
                    <span className="pill pill-sage" style={{ fontSize: 9.5 }}>
                      Top verified answer
                    </span>
                  ) : null}
                </div>
                <p className="text-[13.5px] text-[#2E2218] mt-2 leading-[1.6] whitespace-pre-wrap">{r.body}</p>
                <div className="mt-2.5 flex items-center gap-3 text-[10.5px] text-clay-700">
                  <button type="button" className="hover:text-clay-900">Reply</button>
                  <button type="button" className="hover:text-clay-900">Save</button>
                  <button type="button" className="hover:text-clay-900">Share</button>
                  <button type="button" className="ml-auto hover:text-clay-900">Report</button>
                </div>
              </div>
            </li>
          );
        })}
        {replies.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-5 text-center text-[12.5px] text-clay-700">
            No replies yet. Be the first to add a calm, sourced answer.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ReplyComposer() {
  const [body, setBody] = useState("");
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-white/80" data-testid="reply-composer">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E7DECB] text-[10.5px] text-clay-700">
        <span className="num-mono uppercase tracking-[0.18em]">Markdown supported</span>
        <span className="ml-auto flex gap-1">
          {["B", "I", "“ ”", "</>", "·"].map((g) => (
            <button
              key={g}
              type="button"
              className="w-6 h-6 rounded hover:bg-[#F3EADB] text-clay-700 font-semibold text-[11px]"
            >
              {g}
            </button>
          ))}
        </span>
      </div>
      <textarea
        rows="3"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share your thought, ask a follow-up, or post a counter-point…"
        className="block w-full px-3 py-2.5 text-[13px] bg-transparent outline-none resize-none placeholder:text-[#A68057]"
        data-testid="reply-body"
      />
      <div className="flex items-center justify-between px-3 py-2 border-t border-[#E7DECB]">
        <span className="text-[10.5px] text-clay-700">
          Be calm. No pile-ons. Verified Topper answers may be promoted to the top.
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
          >
            Preview
          </button>
          <button
            type="button"
            className="text-[11px] px-3 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold"
            data-testid="reply-submit"
          >
            Post reply
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadSidebar({ thread, channel, users }) {
  const verifiedHandles = useMemo(() => {
    const all = Object.values(users).filter((u) => u.badge && ["topper", "officer"].includes(u.badge.kind));
    return all.slice(0, 3);
  }, [users]);
  return (
    <aside className="space-y-4">
      <Card padded={false}>
        <div className="px-5 py-5">
          <Eyebrow>Channel rules</Eyebrow>
          <h3 className="font-heading text-[15px] mt-1">#{channel?.name}</h3>
          <ul className="mt-2 space-y-1.5 text-[11.5px] text-[#3a2e22] list-disc pl-4">
            {(CHANNEL_RULES[rulesKeyFor(channel)] || []).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </Card>

      {thread.planRelevant ? (
        <Card padded={false} className="!bg-[#F0F5EF] !border-[#B9CFAF]">
          <div className="px-5 py-5">
            <Eyebrow>From Study OS</Eyebrow>
            <h3 className="font-heading text-[15px] mt-1 text-[#33482F]">{thread.planRelevant.reason}.</h3>
            <p className="text-[11.5px] text-[#33482F] mt-1.5">
              This thread covers <strong>{thread.planRelevant.topic}</strong>. Add a 30-minute drill to today's plan?
            </p>
            <button
              type="button"
              className="mt-2.5 text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold"
            >
              Add to today →
            </button>
          </div>
        </Card>
      ) : null}

      <Card padded={false}>
        <div className="px-5 py-5">
          <Eyebrow>Verified contributors</Eyebrow>
          <ul className="mt-2 space-y-2.5">
            {verifiedHandles.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <Avatar user={u} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium leading-tight truncate">{u.name}</div>
                  <UserBadge user={u} compact />
                </div>
                <button type="button" className="text-[10px] text-clay-700 hover:text-clay-900">
                  Follow
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card padded={false}>
        <div className="px-5 py-5">
          <Eyebrow>Related threads</Eyebrow>
          <ul className="mt-2 space-y-2 text-[12px]">
            <li>
              <button type="button" className="hover:underline bg-transparent text-left">
                Mock 14 — 122/200 error breakdown
              </button>
              <div className="num-mono text-[10px] text-clay-700">96 ↑ · 38 replies</div>
            </li>
            <li>
              <button type="button" className="hover:underline bg-transparent text-left">
                How I balance CA with deep Polity
              </button>
              <div className="num-mono text-[10px] text-clay-700">340 ↑ · 51 replies</div>
            </li>
            <li>
              <button type="button" className="hover:underline bg-transparent text-left">
                2022 Q41 — Article 263 answer clash
              </button>
              <div className="num-mono text-[10px] text-clay-700">642 ↑ · 48 replies</div>
            </li>
          </ul>
        </div>
      </Card>
    </aside>
  );
}

/* ─── Composer drawer ──────────────────────────────────────────────────── */
function ComposerDrawer({ channel, onClose }) {
  const [flair, setFlair] = useState("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const flairOptions = Object.keys(FLAIRS).slice(0, 7);

  async function submit() {
    if (!title.trim() || !body.trim() || !channel) return;
    try {
      await api.post("/api/community/threads", {
        title: title.trim(),
        category: channel.id,
        body: body.trim(),
        tag: FLAIRS[flair]?.label || "Discussion",
      });
    } catch {
      // best-effort: backend may not have this channel id; close anyway.
    }
    onClose();
  }

  return (
    <Drawer open onClose={onClose} title={`New thread in #${channel?.name || ""}`} width={560}>
      <div className="space-y-4" data-testid="composer-drawer">
        <div>
          <Eyebrow>Flair</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {flairOptions.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFlair(k)}
                className={`text-[11px] px-2.5 py-1 rounded-full border ${
                  flair === k
                    ? "bg-[#2E2218] text-[#F3EADB] border-[#2E2218]"
                    : "border-[#E7DECB] text-clay-700"
                }`}
              >
                {FLAIRS[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow>Title</Eyebrow>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[14px] outline-none"
            placeholder="A clear, specific question or claim"
            data-testid="thread-title"
          />
        </div>
        <div>
          <Eyebrow>Body</Eyebrow>
          <textarea
            rows="8"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[13px] outline-none resize-none placeholder:text-[#A68057]"
            placeholder="Markdown supported. Cite sources. Be specific."
            data-testid="thread-body"
          />
        </div>
        <div className="rounded-lg bg-[#F0F5EF] border border-[#B9CFAF] p-3 text-[11.5px] text-[#33482F]">
          <strong>Before posting:</strong> if this is a PYQ or factual claim, attach the year/question or a source link. The community moderation rule on misinformation is firm.
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12px]"
            data-testid="thread-submit"
          >
            Post thread
          </button>
        </div>
      </div>
    </Drawer>
  );
}

function CommunityFooter({ space }) {
  return (
    <div className="px-6 py-5 num-mono text-[10.5px] text-clay-700 flex items-center justify-between">
      <span>
        community · {space?.name} · {space?.members.toLocaleString()} members
      </span>
      <span className="flex items-center gap-2">
        <StatusDot state="live" label="" /> live · /api/community/spaces
      </span>
    </div>
  );
}
