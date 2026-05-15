import React from "react";

// Community design-system primitives — ported from the UI prototype
// (docs/reference/UI_claude-code/primitives-community.jsx) into production
// React components. The prototype reads FLAIRS / CHANNEL_RULES off `window`;
// here `Flair` and `ChannelRulesRibbon` take their data as props so the
// primitives stay self-contained.

export function formatVotes(n) {
  if (n == null) return 0;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n;
}

export function Avatar({ user = {}, size = 28 }) {
  const name = user.name || "";
  const initials =
    name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("") || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-heading"
      style={{
        width: size,
        height: size,
        background: user.avatarColor || "#A68057",
        color: "#FBF6EF",
        fontSize: size * 0.42,
        flex: "0 0 auto",
        lineHeight: 1,
        letterSpacing: -0.5,
      }}
    >
      {initials}
    </span>
  );
}

export function VerifiedTopperBadge({ rank, exam, compact }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded num-mono"
      style={{ background: "#E4EDE0", color: "#33482F", fontSize: 10, fontWeight: 600, letterSpacing: 0.4 }}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 5l2 2 4-4.4" stroke="#33482F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        TOPPER · {rank}
        {!compact && exam ? ` · ${exam}` : ""}
      </span>
    </span>
  );
}

export function VerifiedOfficerBadge({ post }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded num-mono"
      style={{ background: "#E3DFEA", color: "#31293B", fontSize: 10, fontWeight: 600, letterSpacing: 0.4 }}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path
          d="M5 1.5l1 1.6 1.8.3-1.3 1.3.3 1.8L5 5.7 3.2 6.5l.3-1.8L2.2 3.4 4 3.1z"
          stroke="#31293B"
          strokeWidth="0.9"
          fill="#B7B0C4"
        />
      </svg>
      <span>OFFICER · {post}</span>
    </span>
  );
}

export function MentorBadge({ since }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded num-mono"
      style={{ background: "#F1E1CD", color: "#6C5038", fontSize: 10, fontWeight: 600, letterSpacing: 0.4 }}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <circle cx="5" cy="3.6" r="1.6" stroke="#6C5038" strokeWidth="0.9" />
        <path d="M2 8.5c0-1.4 1.3-2.4 3-2.4s3 1 3 2.4" stroke="#6C5038" strokeWidth="0.9" />
      </svg>
      <span>MENTOR{since ? ` · ${since}` : ""}</span>
    </span>
  );
}

export function AdminBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded num-mono"
      style={{ background: "#4E3A29", color: "#F3EADB", fontSize: 10, fontWeight: 600, letterSpacing: 0.4 }}
    >
      <span style={{ width: 6, height: 6, background: "#D6BC93", display: "inline-block" }} />
      <span>ADMIN</span>
    </span>
  );
}

export function UserBadge({ user = {}, compact }) {
  const badge = user.badge;
  if (!badge) return null;
  if (badge.kind === "topper")
    return <VerifiedTopperBadge rank={badge.rank} exam={badge.exam} compact={compact} />;
  if (badge.kind === "officer") return <VerifiedOfficerBadge post={badge.post} />;
  if (badge.kind === "mentor") return <MentorBadge since={badge.since} />;
  if (badge.kind === "admin") return <AdminBadge />;
  return null;
}

export function UserChip({ user = {}, time, compact }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <Avatar user={user} size={compact ? 20 : 24} />
      <span className="text-clay-900 font-medium">{user.name}</span>
      <UserBadge user={user} compact={compact} />
      {time ? <span className="num-mono text-[10.5px] text-clay-700">· {time}</span> : null}
    </span>
  );
}

const FLAIR_TONE = {
  sage: "pill-sage",
  clay: "pill-clay",
  dusk: "pill-dusk",
  amber: "pill-amber",
  ink: "pill-ink",
  rose: "pill-rose",
  outline: "pill-outline",
};

// `flair` is `{ label, tone }` — callers resolve their flair map themselves.
export function Flair({ flair }) {
  if (!flair) return null;
  return (
    <span className={`pill ${FLAIR_TONE[flair.tone] || FLAIR_TONE.outline}`} style={{ fontSize: 9.5, padding: "2px 7px" }}>
      {flair.label}
    </span>
  );
}

export function VoteColumn({ count, vertical = true, voted, onVote }) {
  if (!vertical) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onVote && onVote(1)}
          className={`px-1.5 py-0.5 rounded ${voted === 1 ? "bg-[#54794E] text-[#F0F5EF]" : "text-clay-700 hover:bg-[#F3EADB]"}`}
          aria-label="Upvote"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 7l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="num-mono text-[11.5px] text-clay-900">{formatVotes(count)}</span>
        <button
          type="button"
          onClick={() => onVote && onVote(-1)}
          className={`px-1.5 py-0.5 rounded ${voted === -1 ? "bg-[#7A3925] text-[#F2DDD6]" : "text-clay-700 hover:bg-[#F3EADB]"}`}
          aria-label="Downvote"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 w-9 shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onVote && onVote(1);
        }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${voted === 1 ? "bg-[#54794E] text-[#F0F5EF]" : "text-clay-700 hover:bg-[#F3EADB]"}`}
        aria-label="Upvote"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 9l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="num-mono text-[12px] text-clay-900 font-semibold">{formatVotes(count)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onVote && onVote(-1);
        }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${voted === -1 ? "bg-[#7A3925] text-[#F2DDD6]" : "text-clay-700 hover:bg-[#F3EADB]"}`}
        aria-label="Downvote"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 7l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export function ChannelIcon({ ch = {}, color = "#6C5038", size = 30 }) {
  const locked = ch.lockedAdminWrite;
  return (
    <span
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: size,
        height: size,
        background: locked ? "#4E3A29" : "#FBF6EF",
        border: `1px solid ${locked ? "#4E3A29" : "#E7DECB"}`,
        color: locked ? "#D6BC93" : color,
      }}
    >
      {locked ? (
        <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ) : (
        <span className="font-mono font-bold" style={{ fontSize: size * 0.5, lineHeight: 1, letterSpacing: -1 }}>
          #
        </span>
      )}
    </span>
  );
}

export function SpaceIcon({ space = {}, size = 44, active }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl font-heading shrink-0"
      style={{
        width: size,
        height: size,
        background: active ? space.color : "#FBF8F2",
        color: active ? "#FBF6EF" : space.color,
        border: `1px solid ${active ? space.color : "#E7DECB"}`,
        fontSize: size * 0.42,
        letterSpacing: -1,
        fontWeight: 600,
      }}
    >
      {space.short}
    </span>
  );
}

// `rules` is a string[] resolved by the caller.
export function ChannelRulesRibbon({ channel = {}, rules = [] }) {
  const locked = channel.lockedAdminWrite;
  return (
    <div
      className={`px-5 py-3 ${locked ? "bg-[#4E3A29] text-[#D6BC93]" : "bg-[#F3EADB]/70 text-clay-700"} text-[11.5px] border-b border-[#E7DECB]`}
    >
      <div className="flex items-start gap-3">
        <div
          className="num-mono uppercase tracking-[0.18em] text-[9.5px] mt-0.5 shrink-0"
          style={locked ? { color: "#D6BC93" } : undefined}
        >
          {locked ? "Admin-write only" : "Channel rules"}
        </div>
        <ul className="flex-1 space-y-0.5 list-disc pl-4">
          {rules.map((r, i) => (
            <li key={i} className="leading-snug">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SOURCE_TRUST_MAP = {
  official: { bg: "#33482F", fg: "#F0F5EF", label: "Official" },
  community: { bg: "#E3DFEA", fg: "#31293B", label: "Community" },
  coaching: { bg: "#F1E1CD", fg: "#6C5038", label: "Coaching" },
  unknown: { bg: "#FBF8F2", fg: "#6C5038", label: "Unknown · review", border: "1px dashed #BE9C6B" },
};

export function SourceTrustStamp({ trust }) {
  const m = SOURCE_TRUST_MAP[trust] || SOURCE_TRUST_MAP.unknown;
  return (
    <span className="stamp" style={{ background: m.bg, color: m.fg, border: m.border || "0" }}>
      {m.label}
    </span>
  );
}
