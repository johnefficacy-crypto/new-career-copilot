import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Drawer,
  Eyebrow,
  MentorBadge,
  PageHeader,
  Pill,
  SectionHeader,
  StatusDot,
  StudyCard as Card,
  VerifiedOfficerBadge,
  VerifiedTopperBadge,
} from "../../shared/ui/studyos";
import { api } from "../../lib/api";
import { MENTORS, MENTOR_EARNINGS, MENTOR_SESSIONS } from "./data";

// Production port of docs/reference/UI_claude-code/screen-mentors.jsx.

// Backend mentor shape (community_runtime._shape_mentor_profile) is missing
// several fields the screen depends on: `badge`, `color`, `blurb`, `served`.
// We adapt here rather than reshape the backend response, which has other
// consumers. MentorTopBadge in particular crashes on undefined.badge.
const MENTOR_PALETTE = ["#A68057", "#54794E", "#7E6FB7", "#C58A6B", "#8FA68A", "#B79A6F"];

function adaptMentor(m, idx = 0) {
  if (!m || typeof m !== "object") return m;
  const id = m.id || "";
  const colorSeed = idx + (id ? id.charCodeAt(0) % MENTOR_PALETTE.length : 0);
  const headline = m.headline || m.bio || "";
  const exams = Array.isArray(m.exams) ? m.exams.filter(Boolean) : [];
  return {
    ...m,
    badge: m.badge || (exams.length ? `Mentor · ${exams[0]}` : "Mentor"),
    color: m.color || MENTOR_PALETTE[Math.abs(colorSeed) % MENTOR_PALETTE.length],
    blurb: m.blurb || headline || "Mentor on Career Copilot.",
    served: typeof m.served === "number" ? m.served : (m.sessions || 0),
    topics: Array.isArray(m.topics) ? m.topics : [],
    price: Array.isArray(m.price) && m.price.length === 2 ? m.price : [0, 0],
    rating: typeof m.rating === "number" ? m.rating : 0,
    sessions: typeof m.sessions === "number" ? m.sessions : 0,
  };
}

// Apply the adapter to seed so derived fields like `badge`/`color`/`served`
// stay consistent whether the mentor came from the API or fixtures.
const SEED_MENTORS = MENTORS.map((m, i) => adaptMentor(m, i));

export default function MentorsScreen() {
  const [view, setView] = useState("browse");
  const [activeMentor, setActiveMentor] = useState(null);
  const [mentors, setMentors] = useState(SEED_MENTORS);
  const [sessions, setSessions] = useState(MENTOR_SESSIONS);
  const [earnings, setEarnings] = useState(MENTOR_EARNINGS);

  const reloadSessions = useCallback(async () => {
    try {
      const d = await api.get("/api/community/mentor-sessions");
      if (Array.isArray(d?.items) && d.items.length) {
        setSessions(
          d.items.map((s, i) => ({
            ...s,
            mentor: adaptMentor(s.mentor, i),
          })),
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/community/mentors")
      .then((d) => {
        if (cancelled || !Array.isArray(d?.items) || d.items.length === 0) return;
        setMentors(d.items.map((m, i) => adaptMentor(m, i)));
      })
      .catch(() => {});
    reloadSessions();
    return () => {
      cancelled = true;
    };
  }, [reloadSessions]);

  useEffect(() => {
    if (view !== "earnings") return;
    api
      .get("/api/community/mentor-earnings")
      .then((d) => {
        if (d && typeof d === "object") setEarnings({ ...MENTOR_EARNINGS, ...d });
      })
      .catch(() => {});
  }, [view]);

  return (
    <div className="space-y-6" data-testid="mentors-page">
      <PageHeader
        eyebrow="Mentors · 1:n sessions"
        title="Learn from reviewed mentors — with bookings recorded to your account."
        sub="Sessions are scheduled calls. Prices come from listed mentor offerings; payment and refund handling begin only after a slot is confirmed."
        right={
          <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
            <button
              type="button"
              onClick={() => setView("browse")}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold ${
                view === "browse" ? "bg-[#4E3A29] text-[#F3EADB]" : "text-clay-700"
              }`}
            >
              Browse
            </button>
            <button
              type="button"
              onClick={() => setView("earnings")}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold ${
                view === "earnings" ? "bg-[#4E3A29] text-[#F3EADB]" : "text-clay-700"
              }`}
            >
              You as mentor
            </button>
          </div>
        }
      />

      {view === "browse" ? (
        <>
          <FeaturedSessionsCard sessions={sessions} mentors={mentors} onBooked={reloadSessions} />
          <MentorsGrid mentors={mentors} onPick={(m) => setActiveMentor(m)} />
          <BookingFlow />
        </>
      ) : (
        <MentorEarningsView earnings={earnings} />
      )}

      {activeMentor ? (
        <MentorProfileDrawer
          mentor={activeMentor}
          sessions={sessions}
          onClose={() => setActiveMentor(null)}
        />
      ) : null}
    </div>
  );
}

function MentorTopBadge({ mentor }) {
  if (mentor.badge.includes("AIR"))
    return <VerifiedTopperBadge rank={mentor.badge.split(" · ")[0]} exam={mentor.badge.split(" · ")[1]} compact />;
  if (mentor.badge.includes("IPS")) return <VerifiedOfficerBadge post={mentor.badge} />;
  if (mentor.badge.includes("Mentor")) return <MentorBadge />;
  return null;
}

function FeaturedSessionsCard({ sessions, mentors, onBooked }) {
  const totalBooked = sessions.reduce((a, s) => a + s.booked, 0);
  async function book(sessionId) {
    try {
      await api.post(`/api/community/mentor-sessions/${sessionId}/book`, {});
      onBooked && onBooked();
    } catch {}
  }
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between flex-wrap gap-3">
        <div>
          <Eyebrow>Upcoming sessions · this week</Eyebrow>
          <h2 className="font-heading text-[22px] mt-1">
            {sessions.length} sessions · {totalBooked} aspirants booked.
          </h2>
        </div>
        <div className="flex gap-2">
          <Pill tone="outline">All exams</Pill>
          <Pill tone="sage">UPSC CSE</Pill>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-7 pb-6">
        {sessions.map((s) => {
          const m = (s.mentor && (s.mentor.user || s.mentor)) || mentors.find((x) => x.id === s.mentorId);
          if (!m) return null;
          const pct = s.booked / s.capacity;
          return (
            <div
              key={s.id}
              className="rounded-xl border border-[#E7DECB] bg-white/70 p-4 flex gap-4"
              data-testid={`mentor-session-${s.id}`}
            >
              <Avatar user={{ name: m.name, avatarColor: m.color }} size={48} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <MentorTopBadge mentor={m} />
                </div>
                <h3 className="font-heading text-[16px] mt-1.5 leading-tight">{s.title}</h3>
                <div className="text-[11.5px] text-clay-700 mt-1">
                  by <strong className="text-clay-900">{m.name}</strong>
                </div>
                <div className="mt-2 flex items-center gap-3 num-mono text-[10.5px] text-clay-700 flex-wrap">
                  <span>{s.at}</span>
                  <span>·</span>
                  <span>{s.duration}</span>
                  <span>·</span>
                  <span>{s.platform}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <div className="h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#54794E]"
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                    <div className="num-mono text-[10px] text-clay-700 mt-1">
                      {s.booked}/{s.capacity} booked
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => book(s.id)}
                    disabled={s.youBooked}
                    data-testid={`book-${s.id}`}
                    className={`text-[11.5px] px-3 py-1.5 rounded-full font-semibold whitespace-nowrap ${
                      s.youBooked
                        ? "border border-[#54794E] bg-[#F0F5EF] text-[#33482F]"
                        : "bg-[#4E3A29] text-[#F3EADB]"
                    }`}
                  >
                    {s.youBooked ? "Booked ✓" : `Book · ₹${s.price}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MentorsGrid({ mentors, onPick }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between flex-wrap gap-3">
        <div>
          <Eyebrow>Mentor directory</Eyebrow>
          <h2 className="font-heading text-[22px] mt-1">{mentors.length} listed mentors.</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Pill tone="outline">All</Pill>
          <Pill tone="sage">Verified Topper</Pill>
          <Pill tone="dusk">Verified Officer</Pill>
          <Pill tone="clay">Mentor</Pill>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-7 pb-6">
        {mentors.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m)}
            data-testid={`mentor-card-${m.id}`}
            className="text-left rounded-xl border border-[#E7DECB] bg-white/70 hover:bg-white hover:border-[#A68057] p-4 transition"
          >
            <div className="flex items-center gap-3">
              <Avatar user={{ name: m.name, avatarColor: m.color }} size={42} />
              <div className="min-w-0">
                <div className="font-heading text-[15px] truncate">{m.name}</div>
                <div className="num-mono text-[10.5px] text-clay-700 mt-0.5">{m.badge}</div>
              </div>
            </div>
            <p className="text-[12px] text-[#3a2e22] mt-2.5 leading-snug line-clamp-2">{m.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {m.topics.slice(0, 3).map((t, i) => (
                <span key={i} className="pill pill-outline" style={{ fontSize: 9.5 }}>
                  {t}
                </span>
              ))}
            </div>
            <div className="rule mt-3 pt-2.5 flex items-center justify-between text-[11px]">
              <span className="num-mono text-clay-700">
                ★ {m.rating} · {m.served} served
              </span>
              <span className="num-mono text-[#33482F] font-semibold">
                ₹{m.price[0]}–{m.price[1]}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function BookingFlow() {
  return (
    <Card>
      <SectionHeader
        eyebrow="How booking works"
        title="Session requests are confirmed before payment."
        sub="Bookings are recorded against your account. Paid checkout and refund handling are completed only after the mentor confirms the slot."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
        {[
          { k: "01 · Pick", v: "Choose a session or DM mentor", icon: "◐" },
          { k: "02 · Confirm", v: "Mentor accepts or proposes a time", icon: "⟐" },
          { k: "03 · Join", v: "Embedded Daily.co/Jitsi room", icon: "◊" },
          { k: "04 · Log", v: "Hours auto-feed your plan", icon: "↻" },
        ].map((s, i) => (
          <div key={i} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
            <div className="text-[20px] text-[#A68057]">{s.icon}</div>
            <div className="num-mono text-[9.5px] text-clay-700 uppercase tracking-[0.16em] mt-1.5">
              {s.k}
            </div>
            <div className="text-[12.5px] mt-1.5 text-clay-900">{s.v}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MentorProfileDrawer({ mentor, sessions, onClose }) {
  const mine = useMemo(
    () => (Array.isArray(sessions) ? sessions.filter((s) => s.mentorId === mentor.id) : []),
    [sessions, mentor.id],
  );
  return (
    <Drawer open onClose={onClose} title="Mentor profile" width={520}>
      <div className="flex items-center gap-3" data-testid={`mentor-drawer-${mentor.id}`}>
        <Avatar user={{ name: mentor.name, avatarColor: mentor.color }} size={56} />
        <div>
          <div className="font-heading text-[20px]">{mentor.name}</div>
          <div className="num-mono text-[11px] text-clay-700 mt-0.5">{mentor.badge}</div>
          <div className="mt-1.5">
            <MentorTopBadge mentor={mentor} />
          </div>
        </div>
      </div>

      <p className="text-[13px] mt-4 text-[#3a2e22] leading-relaxed">{mentor.blurb}</p>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <Mini k="Rating" v={`★ ${mentor.rating}`} />
        <Mini k="Sessions" v={mentor.sessions} />
        <Mini k="Aspirants served" v={mentor.served} />
      </div>

      <div className="mt-4">
        <Eyebrow>Topics</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mentor.topics.map((t) => (
            <Pill key={t} tone="outline">
              {t}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4">
        <Eyebrow>1:1 DM session</Eyebrow>
        <div className="font-heading text-[18px] mt-1">
          ₹{mentor.price[0]} – ₹{mentor.price[1]}
        </div>
        <div className="text-[12px] text-clay-700 mt-1">
          60–90 min · Daily.co or Jitsi · scheduled by mentor
        </div>
        <p className="text-[11px] italic text-clay-700 mt-2">
          1:1 requests open after a public session is booked.
        </p>
      </div>

      <div className="mt-4">
        <Eyebrow>Public sessions</Eyebrow>
        <ul className="mt-2 space-y-2">
          {mine.map((s) => (
            <li key={s.id} className="rounded-lg border border-[#E7DECB] bg-white/70 p-3">
              <div className="font-heading text-[13.5px]">{s.title}</div>
              <div className="num-mono text-[10.5px] text-clay-700 mt-0.5">
                {s.at ? `${s.at} · ` : ""}
                {s.duration} · ₹{s.price}
              </div>
            </li>
          ))}
          {mine.length === 0 ? (
            <li className="rounded-lg border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-3 text-center text-[12px] text-clay-700">
              No public sessions scheduled.
            </li>
          ) : null}
        </ul>
      </div>
    </Drawer>
  );
}

function Mini({ k, v }) {
  return (
    <div className="rounded-lg border border-[#E7DECB] bg-[#FBF8F2] p-2.5">
      <div className="num-mono text-[9.5px] text-clay-700 uppercase tracking-[0.16em]">{k}</div>
      <div className="font-heading text-[16px] mt-1">{v}</div>
    </div>
  );
}

function MentorEarningsView({ earnings = MENTOR_EARNINGS }) {
  const E = earnings;
  const completed = E.completed || 0;
  const total = E.total || 0;
  const avgPerSession = completed > 0 ? Math.round(total / completed) : 0;
  const yAxisMax = useMemo(() => {
    const maxV = E.monthly?.reduce?.((m, x) => Math.max(m, x.v || 0), 0) || 0;
    // Round up to the nearest 2k above the max, minimum 14k for empty mentor mode.
    return Math.max(14000, Math.ceil(maxV / 2000) * 2000);
  }, [E.monthly]);
  const yTicks = useMemo(() => {
    const step = yAxisMax / 4;
    return [0, step, step * 2, step * 3].map((v) => Math.round(v));
  }, [yAxisMax]);
  return (
    <div className="space-y-6" data-testid="mentor-earnings">
      <Card>
        <SectionHeader
          eyebrow="Mentor mode · your earnings"
          title="The honest view of your impact and income."
          sub="Visible only to you. Payment-provider payouts are shown only after settlement data is recorded."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI k="Sessions completed" v={completed} sub="all time" />
          <KPI k="Aspirants served" v={E.served || 0} sub="unique users" />
          <KPI k="Average rating" v={`★ ${E.avgRating ?? "—"}`} sub="out of 5" />
          <KPI k="Total earned" v={`₹${total.toLocaleString()}`} sub="all time" />
          <KPI k="Pending payout" v={`₹${(E.pending || 0).toLocaleString()}`} sub="awaiting settlement" tone="amber" />
          <KPI
            k="Avg per session"
            v={`₹${avgPerSession.toLocaleString()}`}
            sub={completed > 0 ? "after 20% platform" : "no sessions yet"}
          />
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Monthly earnings · last 6" title="Trend." right={<StatusDot state="partial" />} />
        <svg viewBox="0 0 720 180" className="w-full h-[180px]" aria-label="Monthly mentor earnings">
          {yTicks.map((y) => (
            <g key={y}>
              <line x1="50" y1={150 - (y / yAxisMax) * 120} x2="700" y2={150 - (y / yAxisMax) * 120} stroke="#EFE7D4" />
              <text
                x="42"
                y={150 - (y / yAxisMax) * 120}
                textAnchor="end"
                dominantBaseline="central"
                fontFamily="JetBrains Mono"
                fontSize="9.5"
                fill="#6C5038"
              >
                {y === 0 ? "0" : `${(y / 1000).toFixed(0)}k`}
              </text>
            </g>
          ))}
          {(E.monthly || []).map((m, i) => (
            <g key={m.m || i}>
              <rect
                x={70 + i * 108}
                y={150 - ((m.v || 0) / yAxisMax) * 120}
                width="60"
                height={((m.v || 0) / yAxisMax) * 120}
                fill={m.pending ? "#BE9C6B" : "#54794E"}
                rx="4"
              />
              <text
                x={100 + i * 108}
                y={150 - ((m.v || 0) / yAxisMax) * 120 - 6}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="10"
                fill="#2E2218"
              >
                ₹{((m.v || 0) / 1000).toFixed(1)}k
              </text>
              <text
                x={100 + i * 108}
                y={170}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="10"
                fill="#6C5038"
              >
                {m.m}
                {m.pending ? "*" : ""}
              </text>
            </g>
          ))}
        </svg>
        <div className="text-[10.5px] text-clay-700 mt-1">* pending payout · awaiting settlement</div>
      </Card>

      <Card padded={false}>
        <div className="px-7 pt-6 pb-3">
          <Eyebrow>Payout history</Eyebrow>
          <h2 className="font-heading text-[20px] mt-1">Settlement history.</h2>
        </div>
        <div className="px-2 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Reference</th>
                <th>Status</th>
                <th className="right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {E.payouts.map((p, i) => (
                <tr key={i}>
                  <td className="num-mono">{p.at}</td>
                  <td className="num-mono">₹{p.amount.toLocaleString()}</td>
                  <td className="num-mono text-clay-700">{p.ref}</td>
                  <td>
                    <Pill tone="sage">{p.status}</Pill>
                  </td>
                  <td className="right">
                    <button type="button" className="text-[11px] text-clay-700 hover:text-clay-900 underline">
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function KPI({ k, v, sub, tone = "ink" }) {
  const accent = tone === "amber" ? "border-[#E5C58A]" : "border-[#E7DECB]";
  return (
    <div className={`rounded-xl border bg-[#FBF8F2] p-3.5 ${accent}`}>
      <Eyebrow>{k}</Eyebrow>
      <div className="font-heading text-[20px] mt-1 leading-none">{v}</div>
      <div className="text-[10.5px] text-clay-700 mt-1.5">{sub}</div>
    </div>
  );
}
