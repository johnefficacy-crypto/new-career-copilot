/* /app/community — Telegram-style spaces+channels + Reddit-style threads */
const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC } = React;

function ScreenCommunity() {
  const [spaceId, setSpaceId]     = useStateC("upsc-cse");
  const [channelId, setChannelId] = useStateC("u-prep");
  const [threadId, setThreadId]   = useStateC(null);
  const [sort, setSort]           = useStateC("hot");
  const [composerOpen, setComposerOpen] = useStateC(false);

  const space   = COMMUNITY_SPACES.find(s => s.id === spaceId);
  const channel = space?.channels.find(c => c.id === channelId);
  const threads = (THREADS[channelId] || []);
  const thread  = threadId ? threads.find(t => t.id === threadId) : null;

  function pickSpace(s) {
    setSpaceId(s.id);
    setChannelId(s.channels[0].id);
    setThreadId(null);
  }
  function pickChannel(c) { setChannelId(c.id); setThreadId(null); }

  return (
    <div data-screen-label="Community · Channels & threads" className="flex h-screen overflow-hidden">
      <SpacesRail   activeId={spaceId}   onPick={pickSpace} />
      <ChannelsRail space={space} activeId={channelId} onPick={pickChannel} />

      <section className="flex-1 min-w-0 flex flex-col bg-[#FBF6EF]">
        <ChannelHeader space={space} channel={channel} onCompose={()=>setComposerOpen(true)} />
        {channel && <ChannelRulesRibbon channel={channel} />}

        {thread ? (
          <ThreadDetail thread={thread} channel={channel} onBack={()=>setThreadId(null)} />
        ) : (
          <>
            <ThreadToolbar sort={sort} onSort={setSort} channel={channel} count={threads.length} />
            <div className="flex-1 overflow-auto">
              <div className="px-6 py-4">
                {threads.length === 0 ? (
                  <EmptyState icon="◌" title="No threads yet in this channel." body="Be the first to start one." />
                ) : (
                  <div className="space-y-3">
                    {threads.map(t => (
                      <ThreadCard key={t.id} thread={t} onOpen={()=>setThreadId(t.id)} />
                    ))}
                  </div>
                )}
              </div>
              <CommunityFooter space={space} />
            </div>
          </>
        )}
      </section>

      {composerOpen && <ComposerDrawer channel={channel} onClose={()=>setComposerOpen(false)} />}
    </div>
  );
}

/* ─── Spaces rail (vertical) ────────────────────────────────────────────── */
function SpacesRail({ activeId, onPick }) {
  return (
    <aside className="w-[78px] bg-[#F3EADB] border-r border-[#E7DECB] flex flex-col items-center py-4 gap-2 overflow-y-auto shrink-0">
      <div className="num-mono text-[9px] text-[#A68057] tracking-[0.18em] mb-1">SPACES</div>
      {COMMUNITY_SPACES.map(s => (
        <button key={s.id} onClick={()=>onPick(s)} className="relative group" title={s.name}>
          <SpaceIcon space={s} size={44} active={activeId === s.id} />
          {s.channels.reduce((a,c) => a + (c.unread||0), 0) > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#2E2218] text-[#F3EADB] text-[9px] font-bold flex items-center justify-center num-mono">
              {s.channels.reduce((a,c) => a + (c.unread||0), 0)}
            </span>
          )}
          <span className="absolute left-[52px] top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-[#2E2218] text-[#F3EADB] text-[10.5px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition z-10">
            {s.name}
          </span>
        </button>
      ))}
      <div className="mt-1 h-px w-8 bg-[#D6C9AC]"></div>
      <button className="w-11 h-11 rounded-xl border border-dashed border-[#A68057] text-[#6C5038] flex items-center justify-center hover:bg-[#FBF6EF]" title="Browse all spaces">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </button>
    </aside>
  );
}

/* ─── Channels rail ─────────────────────────────────────────────────────── */
function ChannelsRail({ space, activeId, onPick }) {
  if (!space) return null;
  const grouped = {
    pinned: space.channels.filter(c => c.lockedAdminWrite),
    active: space.channels.filter(c => !c.lockedAdminWrite && (c.unread||0) > 0),
    quiet:  space.channels.filter(c => !c.lockedAdminWrite && (c.unread||0) === 0),
  };
  return (
    <aside className="w-[300px] border-r border-[#E7DECB] bg-[#FBF4E8] flex flex-col shrink-0">
      {/* space header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#E7DECB]">
        <div className="flex items-center gap-3">
          <SpaceIcon space={space} size={36} active />
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[16px] leading-tight truncate">{space.name}</div>
            <div className="num-mono text-[10px] text-[#6C5038] mt-0.5">
              {space.members.toLocaleString()} members · <span className="text-[#33482F]">●</span> {space.online.toLocaleString()} online
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center flex-wrap gap-1.5 text-[10.5px]">
          {space.verifiedToppers > 0 && (
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[#54794E]"></span>{space.verifiedToppers} verified toppers</span>
          )}
          {space.mentors > 0 && (
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[#A68057]"></span>{space.mentors} mentors</span>
          )}
        </div>
        {space.pinNote && (
          <div className="mt-3 text-[11px] text-[#6C5038] italic leading-snug border-l-2 border-[#D6BC93] pl-2.5">{space.pinNote}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {grouped.pinned.length > 0 && <RailGroup title="Official" channels={grouped.pinned} activeId={activeId} onPick={onPick} space={space} />}
        {grouped.active.length > 0 && <RailGroup title="Active" channels={grouped.active} activeId={activeId} onPick={onPick} space={space} />}
        {grouped.quiet.length > 0  && <RailGroup title="Quiet"  channels={grouped.quiet}  activeId={activeId} onPick={onPick} space={space} muted />}
      </div>

      <div className="px-3 py-3 border-t border-[#E7DECB] bg-[#F3EADB]/40">
        <div className="num-mono text-[9.5px] text-[#A68057] tracking-[0.18em] mb-1.5">QUICK JUMP</div>
        <div className="flex flex-col gap-1.5">
          <QuickLink href="groups"   icon="◇" label="Find a study group"  badge="12 active" />
          <QuickLink href="partners" icon="↔" label="Accountability partner" badge="34d streak" />
          <QuickLink href="mentors"  icon="◊" label="Mentor sessions" badge="4 this week" />
          <QuickLink href="resources" icon="≣" label="Resource library" />
        </div>
      </div>
    </aside>
  );
}

function RailGroup({ title, channels, activeId, onPick, space, muted }) {
  return (
    <div className="mb-3">
      <div className="num-mono text-[9.5px] text-[#A68057] tracking-[0.18em] px-2 mb-1.5 flex items-center justify-between">
        <span>{title}</span><span className="text-[#C9B68F]">{channels.length}</span>
      </div>
      {channels.map(ch => (
        <button key={ch.id} onClick={()=>onPick(ch)}
          className={`w-full text-left flex items-center gap-2.5 px-2 py-2 rounded-lg mb-0.5 transition ${
            activeId === ch.id ? "bg-[#2E2218]" : "hover:bg-[#F3EADB]"
          }`}>
          <ChannelIcon ch={ch} color={space.color} size={26} />
          <span className="flex-1 min-w-0">
            <span className={`flex items-center gap-1.5 ${activeId === ch.id ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>
              <span className="text-[12.5px] font-medium truncate">{ch.name}</span>
              {ch.lockedAdminWrite && (
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="shrink-0" style={{color: activeId === ch.id ? "#D6BC93" : "#A68057"}}>
                  <rect x="3" y="5" width="6" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M4.5 5V3.6A1.5 1.5 0 0 1 7.5 3.6V5" stroke="currentColor" strokeWidth="1.1"/>
                </svg>
              )}
            </span>
            <span className={`block text-[10px] num-mono ${activeId === ch.id ? 'text-[#D6BC93]' : muted ? 'text-[#C9B68F]' : 'text-[#A68057]'}`}>
              {ch.members ? `${ch.members.toLocaleString()} · ` : ""}{ch.lastActiveAt}
            </span>
          </span>
          {ch.unread > 0 && (
            <span className={`min-w-[20px] h-[18px] px-1.5 rounded-full text-[9.5px] font-bold flex items-center justify-center num-mono ${
              activeId === ch.id ? 'bg-[#D6BC93] text-[#2E2218]' : 'bg-[#2E2218] text-[#F3EADB]'
            }`}>{ch.unread}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function QuickLink({ href, icon, label, badge }) {
  return (
    <a href={`#${href}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F3EADB] text-[11.5px] text-[#3a2e22]">
      <span className="w-5 text-center text-[14px] text-[#A68057]">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && <span className="num-mono text-[9.5px] text-[#6C5038]">{badge}</span>}
    </a>
  );
}

/* ─── Channel header & toolbar ──────────────────────────────────────────── */
function ChannelHeader({ space, channel, onCompose }) {
  if (!channel) return null;
  return (
    <div className="px-6 pt-5 pb-3 border-b border-[#E7DECB] bg-[#FBF6EF] flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-[#6C5038]">
          <span className="num-mono tracking-[0.18em] uppercase">{space.name}</span>
          <span>›</span>
          {channel.lockedAdminWrite && <Pill tone="ink">Locked · admin-write only</Pill>}
        </div>
        <h1 className="font-serif text-[28px] mt-1 flex items-baseline gap-2 leading-tight">
          <span className="font-mono text-[20px] text-[#A68057]">#</span>
          {channel.name}
        </h1>
        <p className="text-[12.5px] text-[#6C5038] mt-1 max-w-[64ch]">{channel.purpose || "Discussion channel."}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] text-[12px] font-semibold flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7a4.5 4.5 0 1 0 4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M9 4.5h-2v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Follow
        </button>
        <button className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] text-[12px] font-semibold">Search</button>
        {!channel.lockedAdminWrite && (
          <button onClick={onCompose} className="px-3.5 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            New thread
          </button>
        )}
      </div>
    </div>
  );
}

function ThreadToolbar({ sort, onSort, channel, count }) {
  const sorts = [
    { v:"hot", label:"Hot", sub:"upvotes + recency" },
    { v:"new", label:"New" },
    { v:"top", label:"Top · week" },
    { v:"verified", label:"Verified · floats Toppers" },
    { v:"unanswered", label:"Unanswered" },
  ];
  return (
    <div className="px-6 py-3 border-b border-[#E7DECB] bg-[#FBF6EF] flex items-center gap-3 flex-wrap">
      <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
        {sorts.map(s => (
          <button key={s.v} onClick={()=>onSort(s.v)}
            className={`px-3 py-1 rounded-full text-[11.5px] font-semibold ${sort === s.v ? 'bg-[#2E2218] text-[#F3EADB]' : 'text-[#6C5038] hover:bg-[#E7D6BA]'}`}>
            {s.label}
          </button>
        ))}
      </div>
      {channel && channel.pinned > 0 && (
        <span className="num-mono text-[10.5px] text-[#6C5038]">{channel.pinned} pinned</span>
      )}
      <span className="num-mono text-[10.5px] text-[#6C5038] ml-auto">{count} threads</span>
    </div>
  );
}

/* ─── Thread card ───────────────────────────────────────────────────────── */
function ThreadCard({ thread, onOpen }) {
  const u = COMMUNITY_USERS[thread.author];
  const isOfficial = u?.role === "admin";
  return (
    <article
      onClick={onOpen}
      className={`rounded-xl border bg-white/70 hover:bg-white hover:border-[#A68057] transition cursor-pointer flex gap-0 overflow-hidden ${
        isOfficial ? 'border-[#2E2218]' : thread.pinned ? 'border-[#94B28A]' : 'border-[#E7DECB]'
      }`}
      style={isOfficial ? { background: "linear-gradient(180deg, #FBF8F2 0%, #FBF6EF 100%)" } : {}}>

      <div className="bg-[#FBF8F2] border-r border-[#EFE2C9] py-3 flex flex-col items-center">
        <VoteColumn count={thread.upvotes - thread.downvotes} />
      </div>

      <div className="flex-1 min-w-0 px-5 py-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          {thread.pinned && <Pill tone="sage" className="!text-[9.5px]">📌 Pinned</Pill>}
          {isOfficial && <span className="stamp stamp-official">Official</span>}
          <Flair id={thread.flair} />
          {thread.planRelevant && (
            <span className="pill" style={{background:'#ECE7F2', color:'#31293B', fontSize:9.5, padding:'2px 7px'}}>
              ◐ Matches: {thread.planRelevant.topic}
            </span>
          )}
          {thread.solved && <Pill tone="sage" className="!text-[9.5px]">✓ Verified answer</Pill>}
        </div>

        <h3 className={`font-serif mt-2 leading-snug ${isOfficial ? 'text-[#2E2218]' : 'text-[#2E2218]'}`}
          style={{ fontSize: thread.pinned || isOfficial ? 19 : 17 }}>
          {thread.title}
        </h3>

        {thread.body && (
          <p className="text-[13px] text-[#3a2e22] mt-1.5 leading-[1.5] line-clamp-2">{thread.body}</p>
        )}

        {thread.verifiedSource && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] text-[#33482F] num-mono">
            <VerifiedSeal size={14} />
            <span>source · {thread.verifiedSource}</span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <UserChip user={u} time={thread.createdAt} compact />
          <div className="flex items-center gap-3 text-[11px] text-[#6C5038]">
            <span className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 4.5c0-1 .8-1.7 1.7-1.7h6.6c.9 0 1.7.7 1.7 1.7v4c0 1-.8 1.7-1.7 1.7H6L3.5 12V10.2h-.2c-.9 0-1.7-.7-1.7-1.7v-4z" stroke="currentColor" strokeWidth="1.2"/></svg>
              <span className="num-mono">{thread.replies}</span>
              {thread.repliesLocked && <span className="text-[#A68057]">· locked</span>}
            </span>
            <button className="hover:text-[#2E2218]" onClick={(e)=>e.stopPropagation()}>Save</button>
            <button className="hover:text-[#2E2218]" onClick={(e)=>e.stopPropagation()}>Share</button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Thread detail ─────────────────────────────────────────────────────── */
function ThreadDetail({ thread, channel, onBack }) {
  const u = COMMUNITY_USERS[thread.author];
  const replies = thread.topReplies || [];
  const [vote, setVote] = useStateC(0);
  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-[1fr_300px] gap-6 px-6 py-5 max-w-[1100px]">
        <div>
          <button onClick={onBack} className="text-[11.5px] text-[#6C5038] hover:text-[#2E2218] flex items-center gap-1.5 mb-3">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3 6l4.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back to #{channel.name}
          </button>

          <article className="rounded-xl border border-[#E7DECB] bg-white/80 p-6">
            <div className="flex items-center gap-2 flex-wrap">
              {thread.pinned && <Pill tone="sage">📌 Pinned</Pill>}
              {u?.role === "admin" && <span className="stamp stamp-official">Official</span>}
              <Flair id={thread.flair} />
              {thread.planRelevant && (
                <span className="pill" style={{background:'#ECE7F2', color:'#31293B', fontSize:9.5}}>
                  ◐ {thread.planRelevant.reason}
                </span>
              )}
            </div>

            <h1 className="font-serif text-[28px] mt-2.5 leading-tight">{thread.title}</h1>

            <div className="mt-3 flex items-center justify-between">
              <UserChip user={u} time={thread.createdAt} />
              <div className="flex items-center gap-2 text-[11px] text-[#6C5038]">
                <VoteColumn count={thread.upvotes - thread.downvotes + vote} vertical={false} voted={vote === 1 ? 1 : vote === -1 ? -1 : null} onVote={(d)=>setVote(v => v === d ? 0 : d)} />
                <span className="text-[#A68057]">·</span>
                <span className="num-mono">{thread.replies} replies</span>
              </div>
            </div>

            <div className="rule mt-4 pt-4 text-[14.5px] text-[#2E2218] leading-[1.65]">
              {thread.body}
            </div>

            {thread.verifiedSource && (
              <div className="rule mt-4 pt-3 rounded-lg bg-[#F0F5EF] border border-[#B9CFAF] p-3 flex items-center gap-3">
                <VerifiedSeal size={20} />
                <div className="flex-1">
                  <div className="text-[11.5px] font-semibold text-[#33482F]">Official source</div>
                  <div className="num-mono text-[10.5px] text-[#33482F]">{thread.verifiedSource}</div>
                </div>
                <a href="#" className="text-[11px] text-[#33482F] font-semibold underline">Open →</a>
              </div>
            )}

            <div className="rule mt-5 pt-4 flex items-center gap-2 flex-wrap">
              <button className="px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[12px] font-semibold">Reply</button>
              <button className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] text-[12px] font-semibold">Save</button>
              <button className="px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] text-[12px] font-semibold">Share</button>
              {thread.planRelevant && (
                <button className="px-3 py-1.5 rounded-full border border-[#94B28A] text-[#33482F] text-[12px] font-semibold flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  Add to study tasks
                </button>
              )}
              <button className="ml-auto text-[11px] text-[#6C5038] hover:text-[#2E2218]">Report</button>
            </div>
          </article>

          {/* Replies */}
          {thread.repliesLocked ? (
            <div className="mt-5 rounded-xl border border-[#2E2218] bg-[#2E2218] text-[#D6BC93] p-4 flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="#D6BC93" strokeWidth="1.4"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="#D6BC93" strokeWidth="1.4"/></svg>
              <div className="text-[12.5px]">Replies are locked on official posts. Discuss in <a href="#" className="underline font-semibold">#preparation</a> or <a href="#" className="underline font-semibold">#form-help</a>.</div>
            </div>
          ) : (
            <ReplySection replies={replies} thread={thread} />
          )}
        </div>

        {/* Right sidebar */}
        <ThreadSidebar thread={thread} channel={channel} />
      </div>
    </div>
  );
}

function ReplySection({ replies, thread }) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-serif text-[18px]">{thread.replies} replies</div>
        <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
          {["Top","New","Verified"].map((s,i) => (
            <button key={s} className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${i===0 ? 'bg-[#2E2218] text-[#F3EADB]' : 'text-[#6C5038]'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Reply composer */}
      <ReplyComposer />

      <ul className="mt-5 space-y-3">
        {replies.map((r,i) => {
          const u = COMMUNITY_USERS[r.author];
          const isVerified = u?.badge && (u.badge.kind === 'topper' || u.badge.kind === 'officer');
          return (
            <li key={r.id} className={`rounded-xl border p-4 flex gap-4 ${isVerified ? 'border-[#94B28A] bg-[#F0F5EF]/40' : 'border-[#E7DECB] bg-white/60'}`}>
              <VoteColumn count={r.upvotes} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <UserChip user={u} time="2h" compact />
                  {isVerified && i === 0 && <span className="pill pill-sage" style={{fontSize:9.5}}>Top verified answer</span>}
                </div>
                <p className="text-[13.5px] text-[#2E2218] mt-2 leading-[1.6]">{r.body}</p>
                <div className="mt-2.5 flex items-center gap-3 text-[10.5px] text-[#6C5038]">
                  <button className="hover:text-[#2E2218]">Reply</button>
                  <button className="hover:text-[#2E2218]">Save</button>
                  <button className="hover:text-[#2E2218]">Share</button>
                  <button className="ml-auto hover:text-[#2E2218]">Report</button>
                </div>
              </div>
            </li>
          );
        })}
        {/* Filler replies for visual weight */}
        {Array.from({length: Math.max(0, 3 - replies.length)}).map((_,i) => {
          const fillers = [
            { u:"u_aman",  body:"Saved. The point about source-list trimming hit hard — I've been carrying 11 sources for 8 months." },
            { u:"u_pooja", body:"Question — is morning consistency actually a result of discipline, or a side-effect of having a stable plan? Mine is the latter." },
            { u:"u_anjali",body:"Counter-point: rigid plans break the moment you have a bad mock. The discipline is in coming back, not in not falling." },
          ];
          const f = fillers[i % fillers.length];
          const u = COMMUNITY_USERS[f.u];
          return (
            <li key={"f"+i} className="rounded-xl border border-[#E7DECB] bg-white/60 p-4 flex gap-4">
              <VoteColumn count={28 - i*9} />
              <div className="flex-1">
                <UserChip user={u} time={`${(i+1)*4}h`} compact />
                <p className="text-[13.5px] text-[#2E2218] mt-2 leading-[1.6]">{f.body}</p>
                <div className="mt-2.5 flex items-center gap-3 text-[10.5px] text-[#6C5038]">
                  <button className="hover:text-[#2E2218]">Reply</button>
                  <button className="hover:text-[#2E2218]">Save</button>
                  <button className="hover:text-[#2E2218]">Share</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReplyComposer() {
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-white/80">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E7DECB] text-[10.5px] text-[#6C5038]">
        <span className="num-mono uppercase tracking-[0.18em]">Markdown supported</span>
        <span className="ml-auto flex gap-1">
          <CmdBtn>B</CmdBtn><CmdBtn>I</CmdBtn><CmdBtn>“ ”</CmdBtn><CmdBtn>{`</>`}</CmdBtn><CmdBtn>·</CmdBtn>
        </span>
      </div>
      <textarea rows="3" placeholder="Share your thought, ask a follow-up, or post a counter-point…"
        className="block w-full px-3 py-2.5 text-[13px] bg-transparent outline-none resize-none placeholder:text-[#A68057]" />
      <div className="flex items-center justify-between px-3 py-2 border-t border-[#E7DECB]">
        <span className="text-[10.5px] text-[#6C5038]">Be calm. No pile-ons. Verified Topper answers may be promoted to the top.</span>
        <div className="flex gap-2">
          <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Preview</button>
          <button className="text-[11px] px-3 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Post reply</button>
        </div>
      </div>
    </div>
  );
}
function CmdBtn({ children }) { return <button className="w-6 h-6 rounded hover:bg-[#F3EADB] text-[#6C5038] font-semibold text-[11px]">{children}</button>; }

function ThreadSidebar({ thread, channel }) {
  return (
    <aside className="space-y-4">
      <Card>
        <Eyebrow>Channel rules</Eyebrow>
        <h3 className="font-serif text-[15px] mt-1">#{channel.name}</h3>
        <ul className="mt-2 space-y-1.5 text-[11.5px] text-[#3a2e22] list-disc pl-4">
          {((window.CHANNEL_RULES || {})[channel.lockedAdminWrite ? "official" : "prep"] || []).map((r,i) => <li key={i}>{r}</li>)}
        </ul>
      </Card>

      {thread.planRelevant && (
        <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
          <Eyebrow>From Study OS</Eyebrow>
          <h3 className="font-serif text-[15px] mt-1 text-[#33482F]">{thread.planRelevant.reason}.</h3>
          <p className="text-[11.5px] text-[#33482F] mt-1.5">This thread covers <strong>{thread.planRelevant.topic}</strong>. Add a 30-minute drill to today's plan?</p>
          <button className="mt-2.5 text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Add to today →</button>
        </Card>
      )}

      <Card>
        <Eyebrow>Verified contributors</Eyebrow>
        <ul className="mt-2 space-y-2.5">
          {["u_kavya","u_isha","u_arjun"].map(uid => {
            const u = COMMUNITY_USERS[uid];
            return (
              <li key={uid} className="flex items-center gap-2">
                <Avatar user={u} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium leading-tight truncate">{u.name}</div>
                  <UserBadge user={u} compact />
                </div>
                <button className="text-[10px] text-[#6C5038] hover:text-[#2E2218]">Follow</button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <Eyebrow>Related threads</Eyebrow>
        <ul className="mt-2 space-y-2 text-[12px]">
          <li><a href="#" className="hover:underline">Mock 14 — 122/200 error breakdown</a><div className="num-mono text-[10px] text-[#6C5038]">96 ↑ · 38 replies</div></li>
          <li><a href="#" className="hover:underline">How I balance CA with deep Polity</a><div className="num-mono text-[10px] text-[#6C5038]">340 ↑ · 51 replies</div></li>
          <li><a href="#" className="hover:underline">2022 Q41 — Article 263 answer clash</a><div className="num-mono text-[10px] text-[#6C5038]">642 ↑ · 48 replies</div></li>
        </ul>
      </Card>
    </aside>
  );
}

/* ─── Composer drawer ───────────────────────────────────────────────────── */
function ComposerDrawer({ channel, onClose }) {
  const [flair, setFlair] = useStateC("discussion");
  return (
    <Drawer open={true} onClose={onClose} title={`New thread in #${channel.name}`} width={560}>
      <div className="space-y-4">
        <div>
          <Eyebrow>Flair</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(window.FLAIRS).slice(0,7).map(k => (
              <button key={k} onClick={()=>setFlair(k)} className={`text-[11px] px-2.5 py-1 rounded-full border ${flair===k ? 'bg-[#2E2218] text-[#F3EADB] border-[#2E2218]' : 'border-[#E7DECB] text-[#6C5038]'}`}>
                {window.FLAIRS[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow>Title</Eyebrow>
          <input className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[14px] outline-none" placeholder="A clear, specific question or claim" />
        </div>
        <div>
          <Eyebrow>Body</Eyebrow>
          <textarea rows="8" className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[13px] outline-none resize-none placeholder:text-[#A68057]" placeholder="Markdown supported. Cite sources. Be specific." />
        </div>
        <div className="rounded-lg bg-[#F0F5EF] border border-[#B9CFAF] p-3 text-[11.5px] text-[#33482F]">
          <strong>Before posting:</strong> if this is a PYQ or factual claim, attach the year/question or a source link. The community moderation rule on misinformation is firm.
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold text-[12px]">Cancel</button>
          <button className="px-4 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12px]">Post thread</button>
        </div>
      </div>
    </Drawer>
  );
}

function CommunityFooter({ space }) {
  return (
    <div className="px-6 py-5 num-mono text-[10.5px] text-[#6C5038] flex items-center justify-between">
      <span>community · {space.name} · {space.members.toLocaleString()} members</span>
      <span className="flex items-center gap-2"><StatusDot state="live" label="" /> live · /api/community/threads</span>
    </div>
  );
}

window.ScreenCommunity = ScreenCommunity;
