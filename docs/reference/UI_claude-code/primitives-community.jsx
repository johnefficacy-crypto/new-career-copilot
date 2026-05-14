/* Community design primitives — badges, flairs, vote, channel item, thread card, avatar */

/* ─── Avatar ────────────────────────────────────────────────────────────── */
function Avatar({ user, size = 28 }) {
  const initials = user.name.split(" ").map(s => s[0]).slice(0,2).join("");
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-serif"
      style={{ width:size, height:size, background:user.avatarColor || "#A68057", color:"#FBF6EF",
               fontSize: size*0.42, flex:"0 0 auto", lineHeight:1, letterSpacing:-0.5 }}>
      {initials}
    </span>
  );
}

/* ─── Verification badges ───────────────────────────────────────────────── */
function VerifiedTopperBadge({ rank, exam, compact }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
      style={{ background:"#E4EDE0", color:"#33482F", fontSize:10, fontWeight:600, fontFamily:"'JetBrains Mono', monospace", letterSpacing:0.4 }}>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4.4" stroke="#33482F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span>TOPPER · {rank}{!compact && exam ? ` · ${exam}` : ""}</span>
    </span>
  );
}
function VerifiedOfficerBadge({ post }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
      style={{ background:"#E3DFEA", color:"#31293B", fontSize:10, fontWeight:600, fontFamily:"'JetBrains Mono', monospace", letterSpacing:0.4 }}>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M5 1.5l1 1.6 1.8.3-1.3 1.3.3 1.8L5 5.7 3.2 6.5l.3-1.8L2.2 3.4 4 3.1z" stroke="#31293B" strokeWidth="0.9" fill="#B7B0C4"/></svg>
      <span>OFFICER · {post}</span>
    </span>
  );
}
function MentorBadge({ since }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
      style={{ background:"#F1E1CD", color:"#6C5038", fontSize:10, fontWeight:600, fontFamily:"'JetBrains Mono', monospace", letterSpacing:0.4 }}>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="3.6" r="1.6" stroke="#6C5038" strokeWidth="0.9"/><path d="M2 8.5c0-1.4 1.3-2.4 3-2.4s3 1 3 2.4" stroke="#6C5038" strokeWidth="0.9"/></svg>
      <span>MENTOR{since ? ` · ${since}` : ""}</span>
    </span>
  );
}
function AdminBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
      style={{ background:"#2E2218", color:"#F3EADB", fontSize:10, fontWeight:600, fontFamily:"'JetBrains Mono', monospace", letterSpacing:0.4 }}>
      <span style={{width:6, height:6, background:"#D6BC93", display:"inline-block"}}></span>
      <span>ADMIN</span>
    </span>
  );
}

function UserBadge({ user, compact }) {
  if (!user.badge) return null;
  if (user.badge.kind === "topper") return <VerifiedTopperBadge rank={user.badge.rank} exam={user.badge.exam} compact={compact} />;
  if (user.badge.kind === "officer") return <VerifiedOfficerBadge post={user.badge.post} />;
  if (user.badge.kind === "mentor") return <MentorBadge since={user.badge.since} />;
  if (user.badge.kind === "admin") return <AdminBadge />;
  return null;
}

function UserChip({ user, time, compact }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <Avatar user={user} size={compact ? 20 : 24} />
      <span className="text-[#2E2218] font-medium">{user.name}</span>
      <UserBadge user={user} compact={compact} />
      {time && <span className="num-mono text-[10.5px] text-[#6C5038]">· {time}</span>}
    </span>
  );
}

/* ─── Flair ─────────────────────────────────────────────────────────────── */
function Flair({ id }) {
  const f = (window.FLAIRS || {})[id];
  if (!f) return null;
  const tone = { sage:"pill-sage", clay:"pill-clay", dusk:"pill-dusk", amber:"pill-amber", ink:"pill-ink", rose:"pill-rose", outline:"pill-outline" }[f.tone];
  return <span className={`pill ${tone}`} style={{fontSize:9.5, padding:'2px 7px'}}>{f.label}</span>;
}

/* ─── Vote column ───────────────────────────────────────────────────────── */
function VoteColumn({ count, vertical = true, voted, onVote }) {
  if (!vertical) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button onClick={()=>onVote && onVote(1)} className={`px-1.5 py-0.5 rounded ${voted===1 ? 'bg-[#54794E] text-[#F0F5EF]' : 'text-[#6C5038] hover:bg-[#F3EADB]'}`}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 7l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span className="num-mono text-[11.5px] text-[#2E2218]">{count}</span>
        <button onClick={()=>onVote && onVote(-1)} className={`px-1.5 py-0.5 rounded ${voted===-1 ? 'bg-[#7A3925] text-[#F2DDD6]' : 'text-[#6C5038] hover:bg-[#F3EADB]'}`}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 w-9 shrink-0">
      <button onClick={(e)=>{e.stopPropagation(); onVote && onVote(1);}} className={`w-8 h-8 rounded-lg flex items-center justify-center ${voted===1 ? 'bg-[#54794E] text-[#F0F5EF]' : 'text-[#6C5038] hover:bg-[#F3EADB]'}`}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 9l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <span className="num-mono text-[12px] text-[#2E2218] font-semibold">{formatVotes(count)}</span>
      <button onClick={(e)=>{e.stopPropagation(); onVote && onVote(-1);}} className={`w-8 h-8 rounded-lg flex items-center justify-center ${voted===-1 ? 'bg-[#7A3925] text-[#F2DDD6]' : 'text-[#6C5038] hover:bg-[#F3EADB]'}`}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 7l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </div>
  );
}

function formatVotes(n) {
  if (n == null) return 0;
  if (n >= 1000) return (n/1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return n;
}

/* ─── Channel icon (telegram-style with # prefix) ───────────────────────── */
function ChannelIcon({ ch, color, size = 30 }) {
  const locked = ch.lockedAdminWrite;
  return (
    <span className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{ width:size, height:size, background: locked ? "#2E2218" : "#FBF6EF", border:`1px solid ${locked ? "#2E2218" : "#E7DECB"}`, color: locked ? "#D6BC93" : color }}>
      {locked ? (
        <svg width={size*0.42} height={size*0.42} viewBox="0 0 16 16" fill="none">
          <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
      ) : (
        <span className="font-mono font-bold" style={{fontSize: size*0.5, lineHeight:1, letterSpacing:-1}}>#</span>
      )}
    </span>
  );
}

/* ─── Space icon (square with letters) ──────────────────────────────────── */
function SpaceIcon({ space, size = 44, active }) {
  return (
    <span className="inline-flex items-center justify-center rounded-xl font-serif shrink-0"
      style={{ width:size, height:size,
        background: active ? space.color : "#FBF8F2",
        color: active ? "#FBF6EF" : space.color,
        border: `1px solid ${active ? space.color : "#E7DECB"}`,
        fontSize: size*0.42, letterSpacing:-1, fontWeight:600 }}>
      {space.short}
    </span>
  );
}

/* ─── Channel rules ribbon ──────────────────────────────────────────────── */
function ChannelRulesRibbon({ channel }) {
  const rulesKey = channel.lockedAdminWrite ? "official" :
    channel.name.includes("form")     ? "form" :
    channel.name.includes("pyq")      ? "pyq" :
    channel.name.includes("cutoff")   ? "cutoff" :
    channel.name.includes("motivation") ? "motivation" :
    channel.name.includes("group")    ? "groups" :
    channel.name.includes("resource") ? "resources" :
    "prep";
  const rules = (window.CHANNEL_RULES || {})[rulesKey] || [];
  return (
    <div className={`px-5 py-3 ${channel.lockedAdminWrite ? "bg-[#2E2218] text-[#D6BC93]" : "bg-[#F3EADB]/70 text-[#6C5038]"} text-[11.5px] border-b border-[#E7DECB]`}>
      <div className="flex items-start gap-3">
        <div className="num-mono uppercase tracking-[0.18em] text-[9.5px] mt-0.5 shrink-0" style={channel.lockedAdminWrite ? {color:"#D6BC93"} : {}}>
          {channel.lockedAdminWrite ? "Admin-write only" : "Channel rules"}
        </div>
        <ul className="flex-1 space-y-0.5 list-disc pl-4">
          {rules.map((r,i) => <li key={i} className="leading-snug">{r}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* ─── Source-trust stamp (for resources) ────────────────────────────────── */
function SourceTrustStamp({ trust }) {
  const map = {
    official:  { bg:"#33482F", fg:"#F0F5EF", label:"Official" },
    community: { bg:"#E3DFEA", fg:"#31293B", label:"Community" },
    coaching:  { bg:"#F1E1CD", fg:"#6C5038", label:"Coaching" },
    unknown:   { bg:"#FBF8F2", fg:"#6C5038", label:"Unknown · review", border:"1px dashed #BE9C6B" },
  };
  const m = map[trust] || map.unknown;
  return <span className="stamp" style={{ background:m.bg, color:m.fg, border:m.border || "0" }}>{m.label}</span>;
}

Object.assign(window, {
  Avatar, VerifiedTopperBadge, VerifiedOfficerBadge, MentorBadge, AdminBadge,
  UserBadge, UserChip, Flair, VoteColumn, ChannelIcon, SpaceIcon,
  ChannelRulesRibbon, SourceTrustStamp, formatVotes
});
