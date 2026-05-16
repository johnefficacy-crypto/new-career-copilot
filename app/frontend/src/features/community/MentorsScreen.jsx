import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";
import { MENTORS, MENTOR_EARNINGS, MENTOR_SESSIONS } from "./data";
import {
  FieldAvatar,
  FieldButton,
  FieldCard,
  FieldDivider,
  FieldDrawer,
  FieldEmpty,
  FieldHeader,
  FieldKpi,
  FieldLabel,
  FieldPage,
  FieldPill,
  FieldProgress,
  FieldSection,
  FieldSegmented,
  FieldStatusDot,
  FieldTable,
  FieldTd,
} from "./ui";

// Backend mentor shape is missing several fields the screen depends on
// (`badge`, `color`, `blurb`, `served`). We adapt rather than reshape the
// backend response, which has other consumers.
const MENTOR_PALETTE = ["#2F6A47", "#42588B", "#7B520C", "#6B2113", "#4A2F66", "#2F5036"];

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
    served: typeof m.served === "number" ? m.served : m.sessions || 0,
    topics: Array.isArray(m.topics) ? m.topics : [],
    price: Array.isArray(m.price) && m.price.length === 2 ? m.price : [0, 0],
    rating: typeof m.rating === "number" ? m.rating : 0,
    sessions: typeof m.sessions === "number" ? m.sessions : 0,
  };
}

const SEED_MENTORS = MENTORS.map((m, i) => adaptMentor(m, i));

function badgeKind(badge = "") {
  if (badge.includes("AIR")) return "topper";
  if (badge.includes("IPS") || badge.includes("IAS")) return "officer";
  return "mentor";
}

function MentorBadgeTag({ badge }) {
  const kind = badgeKind(badge);
  const tone = kind === "topper" ? "accent" : kind === "officer" ? "info" : "neutral";
  return <FieldPill tone={tone}>{badge}</FieldPill>;
}

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
    <FieldPage testId="mentors-page">
      <FieldHeader
        eyebrow="Mentors · 1:n sessions"
        title="Learn from reviewed mentors, with bookings recorded to your account."
        sub="Sessions are scheduled calls. Prices come from listed offerings; payment and refund handling begin only after a slot is confirmed."
        right={
          <FieldSegmented
            value={view}
            onChange={setView}
            options={[
              { value: "browse", label: "Browse" },
              { value: "earnings", label: "You as mentor" },
            ]}
          />
        }
      />

      {view === "browse" ? (
        <>
          <FeaturedSessions sessions={sessions} mentors={mentors} onBooked={reloadSessions} />
          <div className="mt-8">
            <MentorsGrid mentors={mentors} onPick={(m) => setActiveMentor(m)} />
          </div>
          <div className="mt-8">
            <BookingFlow />
          </div>
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
    </FieldPage>
  );
}

function FeaturedSessions({ sessions, mentors, onBooked }) {
  const totalBooked = sessions.reduce((a, s) => a + (s.booked || 0), 0);
  const { run } = useApiAction();

  async function book(sessionId, prevBooked) {
    await run({
      action: () => api.post(`/api/community/mentor-sessions/${sessionId}/book`, {}),
      successMessage: "Booked.",
      errorMessage: "Could not book session.",
      onSuccess: () => onBooked && onBooked(),
    });
  }

  return (
    <FieldCard padded={false}>
      <div className="px-6 pt-5 pb-3 flex items-end justify-between flex-wrap gap-3">
        <div>
          <FieldLabel>Upcoming sessions · this week</FieldLabel>
          <h2 className="font-sans text-[20px] font-semibold mt-1 text-field-ink">
            {sessions.length} sessions · {totalBooked} aspirants booked
          </h2>
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="px-6 pb-6">
          <FieldEmpty title="No upcoming sessions." body="New mentor sessions are listed here as they're scheduled." />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 px-6 pb-6">
          {sessions.map((s) => {
            const m = (s.mentor && (s.mentor.user || s.mentor)) || mentors.find((x) => x.id === s.mentorId);
            if (!m) return null;
            return (
              <div
                key={s.id}
                className="rounded-md border border-field-line bg-field-canvas p-4 flex gap-4"
                data-testid={`mentor-session-${s.id}`}
              >
                <FieldAvatar user={{ name: m.name, avatarColor: m.color }} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <MentorBadgeTag badge={m.badge} />
                  </div>
                  <h3 className="font-sans text-[15px] font-semibold mt-1.5 leading-tight text-field-ink">
                    {s.title}
                  </h3>
                  <div className="text-[12px] text-field-ink-muted mt-1">
                    by <span className="text-field-ink font-medium">{m.name}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 font-mono text-[10.5px] text-field-ink-quiet flex-wrap uppercase tracking-[0.06em]">
                    <span>{s.at}</span>
                    <span aria-hidden="true">·</span>
                    <span>{s.duration}</span>
                    <span aria-hidden="true">·</span>
                    <span>{s.platform}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[120px]">
                      <FieldProgress value={s.booked || 0} max={s.capacity || 0} height={3} />
                      <div className="font-mono text-[10px] text-field-ink-quiet mt-1 uppercase tracking-[0.06em]">
                        {s.booked || 0} / {s.capacity || 0} booked
                      </div>
                    </div>
                    <FieldButton
                      variant={s.youBooked ? "accentSoft" : "primary"}
                      size="xs"
                      onClick={() => book(s.id, s.booked)}
                      disabled={s.youBooked}
                      data-testid={`book-${s.id}`}
                    >
                      {s.youBooked ? "Booked" : `Book · ₹${s.price}`}
                    </FieldButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </FieldCard>
  );
}

function MentorsGrid({ mentors, onPick }) {
  return (
    <FieldCard padded={false}>
      <div className="px-6 pt-5 pb-3">
        <FieldLabel>Mentor directory</FieldLabel>
        <h2 className="font-sans text-[20px] font-semibold mt-1 text-field-ink">{mentors.length} listed mentors.</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 px-6 pb-6">
        {mentors.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m)}
            data-testid={`mentor-card-${m.id}`}
            className="text-left rounded-md border border-field-line bg-field-canvas p-4 transition-colors hover:border-field-ink-quiet focus:outline-none focus-visible:ring-2 focus-visible:ring-field-accent"
          >
            <div className="flex items-center gap-3">
              <FieldAvatar user={{ name: m.name, avatarColor: m.color }} size={40} />
              <div className="min-w-0">
                <div className="font-sans text-[14.5px] font-semibold truncate text-field-ink">{m.name}</div>
                <div className="font-mono text-[10.5px] text-field-ink-quiet mt-0.5 uppercase tracking-[0.06em]">
                  {m.badge}
                </div>
              </div>
            </div>
            <p className="text-[12px] text-field-ink-muted mt-3 leading-relaxed line-clamp-2">{m.blurb}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {m.topics.slice(0, 3).map((t) => (
                <FieldPill key={t} tone="outline">{t}</FieldPill>
              ))}
            </div>
            <FieldDivider className="my-3" />
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-field-ink-muted">
                ★ {m.rating} · {m.served} served
              </span>
              <span className="font-mono text-field-accent-ink font-semibold">
                ₹{m.price[0]}–{m.price[1]}
              </span>
            </div>
          </button>
        ))}
      </div>
    </FieldCard>
  );
}

function BookingFlow() {
  const steps = [
    { k: "01", t: "Pick", v: "Choose a session or DM mentor" },
    { k: "02", t: "Confirm", v: "Mentor accepts or proposes a time" },
    { k: "03", t: "Join", v: "Embedded Daily.co / Jitsi room" },
    { k: "04", t: "Log", v: "Hours auto-feed your plan" },
  ];
  return (
    <FieldCard>
      <FieldSection
        label="How booking works"
        title="Session requests are confirmed before payment."
        sub="Bookings are recorded against your account. Paid checkout and refund handling are completed only after the mentor confirms the slot."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((s) => (
          <div key={s.k} className="rounded-md border border-field-line p-4 bg-field-paper">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-field-accent">
              {s.k} · {s.t}
            </div>
            <div className="text-[12.5px] mt-2 text-field-ink leading-snug">{s.v}</div>
          </div>
        ))}
      </div>
    </FieldCard>
  );
}

function MentorProfileDrawer({ mentor, sessions, onClose }) {
  const mine = useMemo(
    () => (Array.isArray(sessions) ? sessions.filter((s) => s.mentorId === mentor.id) : []),
    [sessions, mentor.id],
  );
  return (
    <FieldDrawer open onClose={onClose} title="Mentor profile" width={520}>
      <div className="flex items-center gap-3" data-testid={`mentor-drawer-${mentor.id}`}>
        <FieldAvatar user={{ name: mentor.name, avatarColor: mentor.color }} size={56} />
        <div className="min-w-0">
          <div className="font-sans text-[18px] font-semibold text-field-ink truncate">{mentor.name}</div>
          <div className="font-mono text-[10.5px] text-field-ink-quiet mt-0.5 uppercase tracking-[0.08em]">
            {mentor.badge}
          </div>
          <div className="mt-2">
            <MentorBadgeTag badge={mentor.badge} />
          </div>
        </div>
      </div>

      <p className="text-[13px] mt-5 text-field-ink leading-relaxed">{mentor.blurb}</p>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <Mini k="Rating" v={`★ ${mentor.rating}`} />
        <Mini k="Sessions" v={mentor.sessions} />
        <Mini k="Aspirants served" v={mentor.served} />
      </div>

      <div className="mt-5">
        <FieldLabel>Topics</FieldLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mentor.topics.map((t) => (
            <FieldPill key={t} tone="outline">
              {t}
            </FieldPill>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-md border border-field-line p-4 bg-field-paper">
        <FieldLabel>1:1 DM session</FieldLabel>
        <div className="font-sans text-[18px] font-semibold mt-1 text-field-ink">
          ₹{mentor.price[0]} – ₹{mentor.price[1]}
        </div>
        <div className="text-[12px] text-field-ink-muted mt-1">
          60–90 min · Daily.co or Jitsi · scheduled by mentor
        </div>
        <p className="text-[11px] italic text-field-ink-quiet mt-2">
          1:1 requests open after a public session is booked.
        </p>
      </div>

      <div className="mt-5">
        <FieldLabel>Public sessions</FieldLabel>
        <ul className="mt-2 space-y-2">
          {mine.map((s) => (
            <li key={s.id} className="rounded-md border border-field-line bg-field-canvas p-3">
              <div className="font-sans text-[13.5px] font-medium text-field-ink">{s.title}</div>
              <div className="font-mono text-[10.5px] text-field-ink-quiet mt-0.5 uppercase tracking-[0.06em]">
                {s.at ? `${s.at} · ` : ""}
                {s.duration} · ₹{s.price}
              </div>
            </li>
          ))}
          {mine.length === 0 ? (
            <li>
              <FieldEmpty title="No public sessions scheduled." />
            </li>
          ) : null}
        </ul>
      </div>
    </FieldDrawer>
  );
}

function Mini({ k, v }) {
  return (
    <div className="rounded-md border border-field-line bg-field-canvas p-3">
      <FieldLabel>{k}</FieldLabel>
      <div className="font-sans text-[16px] font-semibold mt-1 text-field-ink">{v}</div>
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
    return Math.max(14000, Math.ceil(maxV / 2000) * 2000);
  }, [E.monthly]);
  const yTicks = useMemo(() => {
    const step = yAxisMax / 4;
    return [0, step, step * 2, step * 3].map((v) => Math.round(v));
  }, [yAxisMax]);
  return (
    <div className="space-y-6" data-testid="mentor-earnings">
      <FieldCard>
        <FieldSection
          label="Mentor mode · your earnings"
          title="The honest view of your impact and income."
          sub="Visible only to you. Payouts are shown only after settlement data is recorded."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <FieldKpi label="Sessions" value={completed} sub="all time" />
          <FieldKpi label="Aspirants" value={E.served || 0} sub="unique" />
          <FieldKpi label="Rating" value={`★ ${E.avgRating ?? "—"}`} sub="out of 5" />
          <FieldKpi label="Earned" value={`₹${total.toLocaleString()}`} sub="all time" />
          <FieldKpi
            label="Pending"
            value={`₹${(E.pending || 0).toLocaleString()}`}
            sub="awaiting settlement"
            tone="warn"
          />
          <FieldKpi
            label="Avg / session"
            value={`₹${avgPerSession.toLocaleString()}`}
            sub={completed > 0 ? "after 20% platform" : "no sessions yet"}
          />
        </div>
      </FieldCard>

      <FieldCard>
        <FieldSection
          label="Monthly earnings · last 6"
          title="Trend."
          right={<FieldStatusDot state="stale" label="partial settlement" />}
        />
        <svg viewBox="0 0 720 200" className="w-full h-[200px]" aria-label="Monthly mentor earnings">
          {yTicks.map((y) => (
            <g key={y}>
              <line
                x1="50"
                y1={160 - (y / yAxisMax) * 130}
                x2="700"
                y2={160 - (y / yAxisMax) * 130}
                stroke="#F0EDE5"
              />
              <text
                x="42"
                y={160 - (y / yAxisMax) * 130}
                textAnchor="end"
                dominantBaseline="central"
                fontFamily="JetBrains Mono"
                fontSize="9.5"
                fill="#8C857A"
              >
                {y === 0 ? "0" : `${(y / 1000).toFixed(0)}k`}
              </text>
            </g>
          ))}
          {(E.monthly || []).map((m, i) => (
            <g key={m.m || i}>
              <rect
                x={70 + i * 108}
                y={160 - ((m.v || 0) / yAxisMax) * 130}
                width="60"
                height={((m.v || 0) / yAxisMax) * 130}
                fill={m.pending ? "#9F6A12" : "#2F6A47"}
                rx="3"
              />
              <text
                x={100 + i * 108}
                y={160 - ((m.v || 0) / yAxisMax) * 130 - 6}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="10"
                fill="#1B1A16"
              >
                ₹{((m.v || 0) / 1000).toFixed(1)}k
              </text>
              <text
                x={100 + i * 108}
                y={180}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="10"
                fill="#8C857A"
              >
                {m.m}
                {m.pending ? "*" : ""}
              </text>
            </g>
          ))}
        </svg>
        <div className="text-[10.5px] text-field-ink-quiet mt-2 font-mono uppercase tracking-[0.06em]">
          * pending · awaiting settlement
        </div>
      </FieldCard>

      <FieldCard padded={false}>
        <div className="px-6 pt-5 pb-3">
          <FieldLabel>Payout history</FieldLabel>
          <h2 className="font-sans text-[18px] font-semibold mt-1 text-field-ink">Settlement history.</h2>
        </div>
        <div className="px-3 pb-3">
          <FieldTable headers={["Date", "Amount", "Reference", "Status", "Receipt"]}>
            {(E.payouts || []).map((p, i) => (
              <tr key={i}>
                <FieldTd mono>{p.at}</FieldTd>
                <FieldTd mono>₹{p.amount.toLocaleString()}</FieldTd>
                <FieldTd mono className="text-field-ink-muted">
                  {p.ref}
                </FieldTd>
                <FieldTd>
                  <FieldPill tone="accent">{p.status}</FieldPill>
                </FieldTd>
                <FieldTd className="text-right">
                  <FieldButton variant="ghost" size="xs">
                    Download
                  </FieldButton>
                </FieldTd>
              </tr>
            ))}
          </FieldTable>
        </div>
      </FieldCard>
    </div>
  );
}
