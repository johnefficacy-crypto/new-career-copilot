import React, { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Eyebrow,
  MiniBar,
  PageHeader,
  Pill,
  SectionHeader,
  StatusDot,
  StudyCard as Card,
} from "../../shared/ui/studyos";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";
import { ACCOUNTABILITY, COMMUNITY_USERS } from "./data";

// Production port of docs/reference/UI_claude-code/screen-partners.jsx.

const PARTNER_PALETTE = ["#A68057", "#54794E", "#7E6FB7", "#C58A6B", "#8FA68A"];

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function adaptUser(u, fallback = {}) {
  if (!u) return fallback;
  const name = u.name || u.display_name || u.full_name || fallback.name || u.id;
  const colorSeed = (u.id || name || "").toString().charCodeAt(0) || 0;
  return {
    id: u.id || fallback.id,
    name,
    handle: u.handle || fallback.handle,
    role: u.role || fallback.role,
    badge: u.badge || fallback.badge,
    exam: u.exam || u.exam_focus || fallback.exam,
    avatarColor: u.avatarColor || PARTNER_PALETTE[Math.abs(colorSeed) % PARTNER_PALETTE.length],
  };
}

// Backend /api/community/partner returns a shape that doesn't match the UI's
// expectations: `partner` is a `profiles` row (full_name, no avatarColor),
// `partnership` is an `accountability_pairs` row (no streakDays, no `since`),
// `thisWeek` may be `{}`. This adapter normalizes everything so the rest of
// the screen renders without crashing or showing "undefined".
function adaptPartnerState(prev, d) {
  if (!d || typeof d !== "object") return prev;
  const partner = d.partner ? adaptUser(d.partner, prev.partner || {}) : prev.partner;
  const you = d.you ? adaptUser(d.you, prev.you || {}) : prev.you;
  const partnership = {
    ...(prev.partnership || {}),
    ...(d.partnership || {}),
  };
  if (partnership.since == null && d.partnership?.created_at) partnership.since = d.partnership.created_at;
  if (partnership.streakDays == null) partnership.streakDays = 0;

  const baseWeek = prev.thisWeek || ACCOUNTABILITY.thisWeek;
  const live = d.thisWeek || {};
  const thisWeek = {
    self: { ...baseWeek.self, ...(live.self || {}) },
    partner: { ...baseWeek.partner, ...(live.partner || {}) },
  };

  const selfCommitment = { ...(prev.selfCommitment || {}), ...(d.selfCommitment || d.self_commitment || {}) };
  const partnerCommitment = { ...(prev.partnerCommitment || {}), ...(d.partnerCommitment || d.partner_commitment || {}) };

  const candidates = Array.isArray(d.candidates)
    ? d.candidates.map((c) => ({
        ...c,
        user: c.user ? adaptUser(c.user) : COMMUNITY_USERS[c.id] || { id: c.id, name: c.id },
        invited: c.invited ?? false,
      }))
    : prev.candidates;

  return {
    ...prev,
    you,
    partner,
    partnership,
    thisWeek,
    selfCommitment,
    partnerCommitment,
    recentCheckIns: Array.isArray(d.recentCheckIns) && d.recentCheckIns.length ? d.recentCheckIns : prev.recentCheckIns,
    weeklyReviewQ: Array.isArray(d.weeklyReviewQ) && d.weeklyReviewQ.length ? d.weeklyReviewQ : prev.weeklyReviewQ,
    candidates,
  };
}

const SEED_STATE = {
  you: COMMUNITY_USERS.u_aarav,
  partner: COMMUNITY_USERS[ACCOUNTABILITY.partner.userId],
  partnership: ACCOUNTABILITY.partner,
  selfCommitment: ACCOUNTABILITY.selfCommitment,
  partnerCommitment: ACCOUNTABILITY.partnerCommitment,
  thisWeek: ACCOUNTABILITY.thisWeek,
  recentCheckIns: ACCOUNTABILITY.recentCheckIns,
  weeklyReviewQ: ACCOUNTABILITY.weeklyReviewQ,
  candidates: ACCOUNTABILITY.candidates.map((c) => ({
    ...c,
    user: COMMUNITY_USERS[c.id],
    invited: false,
  })),
};

export default function PartnersScreen() {
  const [state, setState] = useState(SEED_STATE);
  const [hasLiveData, setHasLiveData] = useState(false);
  const { run } = useApiAction();

  const refresh = useCallback(async () => {
    try {
      const d = await api.get("/api/community/partner");
      if (!d || !d.partner) return;
      setState((prev) => adaptPartnerState(prev, d));
      setHasLiveData(true);
    } catch {
      // Keep seed visible; user is offline or unauthenticated.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get("/api/community/partner");
        if (cancelled || !d || !d.partner) return;
        setState((prev) => adaptPartnerState(prev, d));
        setHasLiveData(true);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const endPartnership = () =>
    run({
      action: () => api.post("/api/community/partner/end", {}),
      confirm: "End your accountability partnership? You can pair with someone new afterwards.",
      successMessage: "Partnership ended.",
      errorMessage: "Could not end partnership. Try again.",
      onSuccess: refresh,
    });

  return (
    <div className="space-y-6" data-testid="partners-page">
      <PageHeader
        eyebrow="Accountability partner"
        title="One person. Daily ✅. Weekly truth."
        sub="A structured bilateral commitment. We surface what both of you said you'd do, and what actually happened — calmly."
        right={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={endPartnership}
              className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
            >
              End partnership
            </button>
          </div>
        }
      />

      <PartnerHeroCard partner={state.partner} you={state.you} partnership={state.partnership} thisWeek={state.thisWeek} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <ThisWeekComparison state={state} />
        <DailyCheckinPartner onPosted={refresh} hasLiveData={hasLiveData} partner={state.partner} />
      </div>

      <CommitmentDiffCard state={state} />
      <CheckinHistory recentCheckIns={state.recentCheckIns} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyReviewQuestionsCard questions={state.weeklyReviewQ} />
        <PartnerCandidatesCard candidates={state.candidates} onChanged={refresh} hasLiveData={hasLiveData} />
      </div>
    </div>
  );
}

function safePct(value, goal) {
  if (!goal || goal <= 0) return 0;
  return value / goal;
}

function PartnerHeroCard({ partner, you, partnership, thisWeek }) {
  const selfHours = thisWeek?.self?.hours || 0;
  const partnerHours = thisWeek?.partner?.hours || 0;
  const selfMocks = thisWeek?.self?.mocks || 0;
  const partnerMocks = thisWeek?.partner?.mocks || 0;
  const streak = partnership?.streakDays || 0;
  return (
    <Card className="!bg-[#4E3A29] !border-[#4E3A29]">
      <div className="flex items-center gap-6 flex-wrap" data-testid="partner-hero">
        <div className="flex items-center gap-3">
          <Avatar user={you} size={56} />
          <div>
            <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em]">You</div>
            <div className="font-heading text-[18px] text-[#F3EADB] mt-0.5">{you?.name}</div>
            {you?.exam ? (
              <div className="num-mono text-[10.5px] text-[#A68057] mt-0.5">{you.exam}</div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-w-[220px] flex flex-col items-center">
          <svg
            width="220"
            height="44"
            viewBox="0 0 220 44"
            fill="none"
            role="img"
            aria-label={`${streak} consecutive days both checked in`}
          >
            <line x1="0" y1="22" x2="100" y2="22" stroke="#54794E" strokeWidth="1.6" strokeDasharray="3 4" />
            <line x1="120" y1="22" x2="220" y2="22" stroke="#54794E" strokeWidth="1.6" strokeDasharray="3 4" />
            <circle cx="110" cy="22" r="14" fill="#54794E" stroke="#F3EADB" strokeWidth="1.6" />
            <text
              x="110"
              y="22"
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="JetBrains Mono"
              fontSize="11"
              fill="#F3EADB"
              fontWeight="700"
              aria-hidden="true"
            >
              {streak}d
            </text>
          </svg>
          <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em] mt-1">
            consecutive days both checked in
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <div className="text-right">
            <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em]">Partner</div>
            <div className="font-heading text-[18px] text-[#F3EADB] mt-0.5">{partner?.name || "—"}</div>
            {partnership?.since ? (
              <div className="num-mono text-[10.5px] text-[#A68057] mt-0.5">
                {partner?.exam ? `${partner.exam} · ` : ""}since {partnership.since}
              </div>
            ) : null}
          </div>
          <Avatar user={partner} size={56} />
        </div>
      </div>

      <div className="rule mt-5 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12px] text-[#D6BC93] border-[#4E3A29]">
        <Stat k="Streak" v={`${streak} days`} />
        <Stat k="Combined hours · week" v={`${(selfHours + partnerHours).toFixed(1)}h`} />
        <Stat k="Mocks taken · week" v={`${selfMocks + partnerMocks}`} />
      </div>
    </Card>
  );
}

function Stat({ k, v }) {
  return (
    <div>
      <div className="num-mono text-[9.5px] tracking-[0.18em] uppercase">{k}</div>
      <div className="font-heading text-[#F3EADB] text-[20px] mt-1">{v}</div>
    </div>
  );
}

function ThisWeekComparison({ state }) {
  const self = state.thisWeek?.self || {};
  const partner = state.thisWeek?.partner || {};
  const selfC = state.selfCommitment || {};
  const partnerC = state.partnerCommitment || {};
  return (
    <Card>
      <SectionHeader
        eyebrow="This week · side-by-side"
        title="Same plan, two columns."
        sub="No leaderboard. Just shared truth. Numbers are off your study OS — partner sees what you publish, nothing more."
        right={<StatusDot state="live" />}
      />
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Your commitment</th>
              <th>You · this week</th>
              <th>Partner commitment</th>
              <th>Partner · this week</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Hours</strong>
              </td>
              <td className="num-mono">{selfC.hoursPerWeek ?? "—"}h</td>
              <td>
                <span className="num-mono">{self.hours ?? 0}h</span> ·{" "}
                <MiniBar pct={safePct(self.hours, selfC.hoursPerWeek)} width={64} />
              </td>
              <td className="num-mono">{partnerC.hoursPerWeek ?? "—"}h</td>
              <td>
                <span className="num-mono">{partner.hours ?? 0}h</span> ·{" "}
                <MiniBar pct={safePct(partner.hours, partnerC.hoursPerWeek)} width={64} color="#524864" />
              </td>
            </tr>
            <tr>
              <td>
                <strong>Tasks</strong>
              </td>
              <td className="num-mono">{selfC.tasksPerWeek ?? "—"}</td>
              <td>
                <span className="num-mono">{self.tasks ?? 0}</span> ·{" "}
                <MiniBar pct={safePct(self.tasks, selfC.tasksPerWeek)} width={64} />
              </td>
              <td className="num-mono">{partnerC.tasksPerWeek ?? "—"}</td>
              <td>
                <span className="num-mono">{partner.tasks ?? 0}</span> ·{" "}
                <MiniBar pct={safePct(partner.tasks, partnerC.tasksPerWeek)} width={64} color="#524864" />
              </td>
            </tr>
            <tr>
              <td>
                <strong>Mocks</strong>
              </td>
              <td className="num-mono">{selfC.mocksPerWeek ?? "—"}</td>
              <td className="num-mono">{self.mocks ?? 0}</td>
              <td className="num-mono">{partnerC.mocksPerWeek ?? "—"}</td>
              <td className="num-mono">{partner.mocks ?? 0}</td>
            </tr>
            <tr>
              <td>
                <strong>Check-ins</strong>
              </td>
              <td className="num-mono">7/7</td>
              <td>
                <CheckinDots days={self.checkedInDays} fill="#54794E" />
              </td>
              <td className="num-mono">7/7</td>
              <td>
                <CheckinDots days={partner.checkedInDays} fill="#524864" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CheckinDots({ days, fill }) {
  const arr = Array.isArray(days) ? days : Array.from({ length: 7 }, () => false);
  return (
    <span className="inline-flex gap-1" aria-label={`${arr.filter(Boolean).length} of ${arr.length} days checked in`}>
      {arr.map((d, i) => (
        <span
          key={i}
          className="w-3.5 h-3.5 rounded-sm"
          style={{ background: d ? fill : "#E7DECB" }}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function DailyCheckinPartner({ onPosted, hasLiveData, partner }) {
  const [done, setDone] = useState(null);
  const [body, setBody] = useState("");
  const { run, busy } = useApiAction();
  const [posted, setPosted] = useState(false);

  async function submit() {
    if (done == null) return;
    await run({
      action: () => api.post("/api/community/partner/checkins", { did_study: done, note: body }),
      successMessage: "Check-in recorded.",
      errorMessage: "Could not post check-in.",
      onSuccess: () => {
        setBody("");
        setPosted(true);
        onPosted && onPosted();
      },
    });
  }

  return (
    <Card>
      <SectionHeader
        eyebrow="Today's check-in"
        title="Did you study today?"
        sub="One tap. One sentence. That's the contract."
      />
      <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDone(true)}
            data-testid="checkin-yes"
            aria-pressed={done === true}
            className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold ${
              done === true
                ? "bg-[#33482F] text-[#F0F5EF]"
                : "bg-white/70 border border-[#E7DECB] text-clay-900"
            }`}
          >
            ✅ Yes, today
          </button>
          <button
            type="button"
            onClick={() => setDone(false)}
            data-testid="checkin-no"
            aria-pressed={done === false}
            className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold ${
              done === false
                ? "bg-[#7A3925] text-[#F2DDD6]"
                : "bg-white/70 border border-[#E7DECB] text-clay-900"
            }`}
          >
            ○ Not yet
          </button>
        </div>
        <textarea
          rows="2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="One line about today (visible to partner)…"
          aria-label="Today's note for your partner"
          className="mt-3 w-full bg-transparent outline-none text-[12.5px] placeholder:text-[#A68057] resize-none"
        />
        <div className="flex justify-between items-center mt-2 gap-2 flex-wrap">
          <span className="num-mono text-[10.5px] text-clay-700">
            Partner checks in by 22:00 IST · auto-prompt sent
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={busy || done == null}
            data-testid="partner-checkin-post"
            className="text-[11px] px-3 py-1 rounded-full bg-[#4E3A29] text-[#F3EADB] font-semibold disabled:opacity-50"
          >
            {posted ? "Posted ✓" : busy ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      {hasLiveData ? null : (
        <div className="rule mt-4 pt-3">
          <Eyebrow>Partner's last check-in</Eyebrow>
          <div className="mt-2 flex items-start gap-3">
            <Avatar user={partner} size={28} />
            <div>
              <div className="text-[13px] italic text-clay-700">
                Recent check-ins appear here once your partner posts theirs.
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function CommitmentDiffCard({ state }) {
  const selfC = state.selfCommitment || {};
  const partnerC = state.partnerCommitment || {};
  return (
    <Card>
      <SectionHeader
        eyebrow="What we promised"
        title="Read the contract."
        sub="Both partners can update. Changes apply next Monday."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4">
          <Eyebrow>Your commitment</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            <li>· Study <strong>{selfC.hoursPerWeek ?? "—"}h</strong> per week</li>
            <li>· Complete <strong>{selfC.tasksPerWeek ?? "—"} tasks</strong> per week</li>
            <li>· Take <strong>{selfC.mocksPerWeek ?? "—"} mocks</strong> per week</li>
            <li>· Daily check-in by <strong>22:00 IST</strong></li>
          </ul>
        </div>
        <div className="rounded-xl border border-[#DDDAE3] bg-[#F7F5FB] p-4">
          <Eyebrow>Partner's commitment</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[13px] text-[#31293B]">
            <li>· Study <strong>{partnerC.hoursPerWeek ?? "—"}h</strong> per week</li>
            <li>· Complete <strong>{partnerC.tasksPerWeek ?? "—"} tasks</strong> per week</li>
            <li>· Take <strong>{partnerC.mocksPerWeek ?? "—"} mocks</strong> per week</li>
            <li>· Daily check-in by <strong>22:00 IST</strong></li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function CheckinHistory({ recentCheckIns }) {
  return (
    <Card>
      <SectionHeader
        eyebrow="Check-in log · last 5 days"
        title="What both of you said."
      />
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Day</th>
              <th>You</th>
              <th>Partner</th>
              <th>Both?</th>
            </tr>
          </thead>
          <tbody>
            {recentCheckIns.map((c, i) => {
              const selfText = typeof c.self === "string" ? c.self : c.self?.note || "—";
              const partnerText = typeof c.partner === "string" ? c.partner : c.partner?.note || "—";
              const partnerSkipped = c.partner?.did_study === false || (typeof partnerText === "string" && /skip/i.test(partnerText));
              const selfDone = c.self?.did_study !== false && !/skip/i.test(selfText);
              const partnerDone = !partnerSkipped;
              return (
                <tr key={c.date || i}>
                  <td className="num-mono">{c.date}</td>
                  <td>{selfText}</td>
                  <td className={partnerSkipped ? "text-[#7A3925]" : ""}>{partnerText}</td>
                  <td>
                    {selfDone && partnerDone ? (
                      <Pill tone="sage">streak +1</Pill>
                    ) : (
                      <Pill tone="amber">break</Pill>
                    )}
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

function WeeklyReviewQuestionsCard({ questions }) {
  if (!questions || questions.length === 0) {
    return (
      <Card>
        <SectionHeader
          eyebrow="Weekly review · Sunday 21:00"
          title="Three questions, weekly."
        />
        <p className="text-[12.5px] text-clay-700">
          The auto-prompted review will appear here on Sunday evening.
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <SectionHeader
        eyebrow="Weekly review · Sunday 21:00"
        title="Three questions. Both answer. Compared side-by-side."
        sub="No scoring. The conversation is the value."
      />
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q} className="flex items-start gap-3">
            <span className="num-mono text-[12px] text-[#A68057] pt-0.5">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[13.5px] flex-1">{q}</span>
          </li>
        ))}
      </ol>
      <div className="rule mt-4 pt-3 num-mono text-[10.5px] text-clay-700">
        Auto-opens Sunday 21:00 IST · both partners notified
      </div>
    </Card>
  );
}

function PartnerCandidatesCard({ candidates, onChanged, hasLiveData }) {
  const { run, busy } = useApiAction();
  // Seed candidate ids are "u_pooja"-style strings; backend rejects non-UUIDs
  // with 400 ("Invalid candidate"). Disable the button until we have live data.
  const actionable = (id) => hasLiveData && isUuid(id);
  async function invite(c) {
    if (!actionable(c.id)) return;
    await run({
      action: () => api.post("/api/community/partner/invite", { candidate_id: c.id }),
      successMessage: `Invite sent to ${c.user?.name || c.id}.`,
      errorMessage: "Could not send invite.",
      onSuccess: onChanged,
    });
  }
  if (!candidates || candidates.length === 0) {
    return (
      <Card>
        <SectionHeader
          eyebrow="If this partnership ends"
          title="No suggestions yet."
          sub="Candidates appear once your study profile is matched."
        />
      </Card>
    );
  }
  return (
    <Card>
      <SectionHeader
        eyebrow="If this partnership ends"
        title="Candidates we'd suggest."
        sub="Match score from exam + phase + cadence + availability overlap."
      />
      <ul className="space-y-3">
        {candidates.map((c) => {
          const u = c.user || COMMUNITY_USERS[c.id] || { id: c.id, name: c.id };
          const disabled = c.invited || busy || !actionable(c.id);
          return (
            <li key={c.id} className="grid grid-cols-[36px_1fr_110px] gap-3 items-center">
              <Avatar user={u} size={32} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium">{u.name}</span>
                  {typeof c.match === "number" && c.match > 0 ? (
                    <span className="num-mono text-[10.5px] text-[#33482F]">
                      match {Math.round(c.match * 100)}%
                    </span>
                  ) : null}
                </div>
                <div className="text-[11.5px] text-clay-700 mt-0.5">{c.why}</div>
              </div>
              <button
                type="button"
                onClick={() => invite(c)}
                data-testid={`invite-${c.id}`}
                disabled={disabled}
                title={!actionable(c.id) ? "Sample candidate — real matches will appear here." : undefined}
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${
                  c.invited
                    ? "border border-[#54794E] bg-[#F0F5EF] text-[#33482F]"
                    : "bg-[#4E3A29] text-[#F3EADB] disabled:opacity-50"
                }`}
              >
                {c.invited ? "Invited" : "Invite"}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
