import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";
import { ACCOUNTABILITY, COMMUNITY_USERS } from "./data";
import {
  FieldAvatar,
  FieldButton,
  FieldCard,
  FieldDivider,
  FieldEmpty,
  FieldHeader,
  FieldLabel,
  FieldPage,
  FieldPill,
  FieldProgress,
  FieldSection,
  FieldStatusDot,
  FieldTable,
  FieldTd,
  FieldTextarea,
} from "./ui";

const PARTNER_PALETTE = ["#5A554B", "#2F6A47", "#42588B", "#7B520C", "#6B2113"];

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
// expectations: `partner` is a `profiles` row, `partnership` is an
// `accountability_pairs` row, `thisWeek` may be `{}`. Adapter normalizes.
function adaptPartnerState(prev, d) {
  if (!d || typeof d !== "object") return prev;
  const partner = d.partner ? adaptUser(d.partner, prev.partner || {}) : prev.partner;
  const you = d.you ? adaptUser(d.you, prev.you || {}) : prev.you;
  const partnership = { ...(prev.partnership || {}), ...(d.partnership || {}) };
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
      // Offline / unauthenticated — keep seed.
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
    <FieldPage testId="partners-page">
      <FieldHeader
        eyebrow="Accountability partner"
        title="One person. Daily check-in. Weekly truth."
        sub="A structured bilateral commitment. We surface what both of you said you'd do, and what actually happened — calmly."
        right={
          <FieldButton variant="ghost" size="sm" onClick={endPartnership}>
            End partnership
          </FieldButton>
        }
      />

      <PartnerHero partner={state.partner} you={state.you} partnership={state.partnership} thisWeek={state.thisWeek} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mt-6">
        <ThisWeekComparison state={state} />
        <DailyCheckinPartner onPosted={refresh} hasLiveData={hasLiveData} partner={state.partner} />
      </div>

      <div className="mt-6">
        <CommitmentDiff state={state} />
      </div>

      <div className="mt-6">
        <CheckinHistory recentCheckIns={state.recentCheckIns} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <WeeklyReviewQuestions questions={state.weeklyReviewQ} />
        <PartnerCandidates candidates={state.candidates} onChanged={refresh} hasLiveData={hasLiveData} />
      </div>
    </FieldPage>
  );
}

function PartnerHero({ partner, you, partnership, thisWeek }) {
  const selfHours = thisWeek?.self?.hours || 0;
  const partnerHours = thisWeek?.partner?.hours || 0;
  const selfMocks = thisWeek?.self?.mocks || 0;
  const partnerMocks = thisWeek?.partner?.mocks || 0;
  const streak = partnership?.streakDays || 0;

  return (
    <FieldCard tone="ink" padded={false} className="overflow-hidden">
      <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-center" data-testid="partner-hero">
        <div className="flex items-center gap-4 min-w-0">
          <FieldAvatar user={you} size={52} />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">You</div>
            <div className="font-sans text-[18px] font-semibold mt-0.5 truncate">{you?.name || "—"}</div>
            {you?.exam ? <div className="font-mono text-[11px] text-white/55 mt-0.5">{you.exam}</div> : null}
          </div>
        </div>

        <StreakRing streak={streak} />

        <div className="flex items-center gap-4 justify-end min-w-0 md:flex-row-reverse">
          <FieldAvatar user={partner} size={52} />
          <div className="min-w-0 text-right md:text-left">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">Partner</div>
            <div className="font-sans text-[18px] font-semibold mt-0.5 truncate">{partner?.name || "—"}</div>
            {partnership?.since ? (
              <div className="font-mono text-[11px] text-white/55 mt-0.5">
                {partner?.exam ? `${partner.exam} · ` : ""}since {partnership.since}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-6 md:px-8 py-4 grid grid-cols-3 gap-6">
        <HeroStat label="Streak" value={`${streak} d`} />
        <HeroStat label="Combined hours" value={`${(selfHours + partnerHours).toFixed(1)} h`} sub="this week" />
        <HeroStat label="Mocks" value={`${selfMocks + partnerMocks}`} sub="this week" />
      </div>
    </FieldCard>
  );
}

function StreakRing({ streak }) {
  return (
    <div className="flex flex-col items-center" aria-label={`${streak} consecutive days both checked in`}>
      <svg width="180" height="40" viewBox="0 0 180 40" role="img" aria-hidden="true">
        <line x1="0" y1="20" x2="78" y2="20" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeDasharray="2 4" />
        <line x1="102" y1="20" x2="180" y2="20" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeDasharray="2 4" />
        <circle cx="90" cy="20" r="14" fill="#2F6A47" />
        <text
          x="90"
          y="20"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="JetBrains Mono, monospace"
          fontSize="10"
          fontWeight="700"
          fill="#FFFFFF"
        >
          {streak}d
        </text>
      </svg>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/55 mt-1">
        consecutive both-in days
      </div>
    </div>
  );
}

function HeroStat({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className="font-sans text-[20px] font-semibold mt-1 leading-none truncate">{value}</div>
      {sub ? <div className="font-mono text-[10.5px] text-white/55 mt-1">{sub}</div> : null}
    </div>
  );
}

function ThisWeekComparison({ state }) {
  const self = state.thisWeek?.self || {};
  const partner = state.thisWeek?.partner || {};
  const selfC = state.selfCommitment || {};
  const partnerC = state.partnerCommitment || {};
  const rows = [
    {
      metric: "Hours",
      selfGoal: selfC.hoursPerWeek,
      selfDone: self.hours ?? 0,
      partnerGoal: partnerC.hoursPerWeek,
      partnerDone: partner.hours ?? 0,
      suffix: "h",
      bars: true,
    },
    {
      metric: "Tasks",
      selfGoal: selfC.tasksPerWeek,
      selfDone: self.tasks ?? 0,
      partnerGoal: partnerC.tasksPerWeek,
      partnerDone: partner.tasks ?? 0,
      bars: true,
    },
    {
      metric: "Mocks",
      selfGoal: selfC.mocksPerWeek,
      selfDone: self.mocks ?? 0,
      partnerGoal: partnerC.mocksPerWeek,
      partnerDone: partner.mocks ?? 0,
    },
  ];

  return (
    <FieldCard>
      <FieldSection
        label="This week · side-by-side"
        title="Same plan, two columns."
        sub="Numbers are what each of you publishes — partner sees what you publish, nothing more."
        right={<FieldStatusDot state="live" />}
      />
      <FieldTable
        headers={["Metric", "Your commit", "You", "Partner commit", "Partner"]}
        testId="partner-week-table"
      >
        {rows.map((r) => (
          <tr key={r.metric}>
            <FieldTd>
              <strong className="font-medium">{r.metric}</strong>
            </FieldTd>
            <FieldTd mono>
              {r.selfGoal ?? "—"}
              {r.suffix || ""}
            </FieldTd>
            <FieldTd>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums">
                  {r.selfDone}
                  {r.suffix || ""}
                </span>
                {r.bars ? <FieldProgress value={r.selfDone} max={r.selfGoal || 0} height={3} className="w-16" /> : null}
              </div>
            </FieldTd>
            <FieldTd mono>
              {r.partnerGoal ?? "—"}
              {r.suffix || ""}
            </FieldTd>
            <FieldTd>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums">
                  {r.partnerDone}
                  {r.suffix || ""}
                </span>
                {r.bars ? (
                  <FieldProgress value={r.partnerDone} max={r.partnerGoal || 0} height={3} className="w-16" />
                ) : null}
              </div>
            </FieldTd>
          </tr>
        ))}
        <tr>
          <FieldTd>
            <strong className="font-medium">Check-ins</strong>
          </FieldTd>
          <FieldTd mono>7 / 7</FieldTd>
          <FieldTd>
            <CheckinDots days={self.checkedInDays} />
          </FieldTd>
          <FieldTd mono>7 / 7</FieldTd>
          <FieldTd>
            <CheckinDots days={partner.checkedInDays} />
          </FieldTd>
        </tr>
      </FieldTable>
    </FieldCard>
  );
}

function CheckinDots({ days }) {
  const arr = Array.isArray(days) ? days : Array.from({ length: 7 }, () => false);
  const checked = arr.filter(Boolean).length;
  return (
    <span className="inline-flex gap-1" aria-label={`${checked} of ${arr.length} days checked in`}>
      {arr.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-[2px] ${d ? "bg-field-accent" : "bg-field-line-soft border border-field-line"}`}
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
    <FieldCard>
      <FieldSection
        label="Today's check-in"
        title="Did you study today?"
        sub="One tap. One sentence. That's the contract."
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDone(true)}
          data-testid="checkin-yes"
          aria-pressed={done === true}
          className={`flex-1 h-10 rounded-md border text-[13px] font-medium transition-colors ${
            done === true
              ? "bg-field-accent text-white border-field-accent"
              : "bg-field-canvas text-field-ink border-field-line hover:bg-field-line-soft"
          }`}
        >
          Yes, today
        </button>
        <button
          type="button"
          onClick={() => setDone(false)}
          data-testid="checkin-no"
          aria-pressed={done === false}
          className={`flex-1 h-10 rounded-md border text-[13px] font-medium transition-colors ${
            done === false
              ? "bg-field-danger text-white border-field-danger"
              : "bg-field-canvas text-field-ink border-field-line hover:bg-field-line-soft"
          }`}
        >
          Not yet
        </button>
      </div>
      <FieldTextarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="One line about today (visible to partner)…"
        aria-label="Today's note for your partner"
        className="mt-3"
      />
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <FieldLabel>partner due 22:00 IST · auto-prompted</FieldLabel>
        <FieldButton
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={busy || done == null}
          data-testid="partner-checkin-post"
        >
          {posted ? "Posted" : busy ? "Posting…" : "Post"}
        </FieldButton>
      </div>

      {!hasLiveData ? (
        <>
          <FieldDivider className="my-5" />
          <FieldLabel>Partner's last check-in</FieldLabel>
          <div className="mt-2 flex items-start gap-3">
            <FieldAvatar user={partner} size={28} />
            <div className="text-[12.5px] italic text-field-ink-muted">
              Appears here once your partner posts theirs.
            </div>
          </div>
        </>
      ) : null}
    </FieldCard>
  );
}

function CommitmentDiff({ state }) {
  const selfC = state.selfCommitment || {};
  const partnerC = state.partnerCommitment || {};
  return (
    <FieldCard>
      <FieldSection
        label="What we promised"
        title="Read the contract."
        sub="Both partners can update. Changes apply next Monday."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CommitmentColumn title="Your commitment" c={selfC} />
        <CommitmentColumn title="Partner's commitment" c={partnerC} />
      </div>
    </FieldCard>
  );
}

function CommitmentColumn({ title, c }) {
  return (
    <div className="rounded-md border border-field-line p-4 bg-field-paper">
      <FieldLabel>{title}</FieldLabel>
      <ul className="mt-3 space-y-2 text-[13px] text-field-ink">
        <li>
          Study <strong className="font-medium">{c.hoursPerWeek ?? "—"} h</strong> per week
        </li>
        <li>
          Complete <strong className="font-medium">{c.tasksPerWeek ?? "—"} tasks</strong> per week
        </li>
        <li>
          Take <strong className="font-medium">{c.mocksPerWeek ?? "—"} mocks</strong> per week
        </li>
        <li>
          Daily check-in by <strong className="font-medium">22:00 IST</strong>
        </li>
      </ul>
    </div>
  );
}

function CheckinHistory({ recentCheckIns }) {
  return (
    <FieldCard>
      <FieldSection label="Check-in log · last 5 days" title="What both of you said." />
      <FieldTable headers={["Day", "You", "Partner", "Both?"]}>
        {recentCheckIns.map((c, i) => {
          const selfText = typeof c.self === "string" ? c.self : c.self?.note || "—";
          const partnerText = typeof c.partner === "string" ? c.partner : c.partner?.note || "—";
          const partnerSkipped =
            c.partner?.did_study === false || (typeof partnerText === "string" && /skip/i.test(partnerText));
          const selfDone = c.self?.did_study !== false && !/skip/i.test(selfText);
          const partnerDone = !partnerSkipped;
          return (
            <tr key={c.date || i}>
              <FieldTd mono>{c.date}</FieldTd>
              <FieldTd>{selfText}</FieldTd>
              <FieldTd className={partnerSkipped ? "text-field-danger" : ""}>{partnerText}</FieldTd>
              <FieldTd>
                {selfDone && partnerDone ? (
                  <FieldPill tone="accent">streak +1</FieldPill>
                ) : (
                  <FieldPill tone="warn">break</FieldPill>
                )}
              </FieldTd>
            </tr>
          );
        })}
      </FieldTable>
    </FieldCard>
  );
}

function WeeklyReviewQuestions({ questions }) {
  if (!questions || questions.length === 0) {
    return (
      <FieldCard>
        <FieldSection label="Report Card · Sunday 21:00" title="Three questions, weekly." />
        <p className="text-[12.5px] text-field-ink-muted">
          The auto-prompted review will appear here on Sunday evening.
        </p>
      </FieldCard>
    );
  }
  return (
    <FieldCard>
      <FieldSection
        label="Report Card · Sunday 21:00"
        title="Three questions. Both answer. Compared side-by-side."
        sub="No scoring. The conversation is the value."
      />
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q} className="flex items-start gap-3">
            <span className="font-mono text-[11px] text-field-ink-quiet pt-0.5 w-6 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[13.5px] leading-relaxed">{q}</span>
          </li>
        ))}
      </ol>
      <FieldDivider className="my-4" />
      <FieldLabel>Auto-opens Sunday 21:00 IST · both partners notified</FieldLabel>
    </FieldCard>
  );
}

function PartnerCandidates({ candidates, onChanged, hasLiveData }) {
  const { run, busy } = useApiAction();
  // Seed candidate ids are "u_pooja"-style; backend rejects non-UUIDs with 400.
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
      <FieldCard>
        <FieldSection label="If this partnership ends" title="No suggestions yet." />
        <FieldEmpty title="Candidates appear once your study profile is matched." />
      </FieldCard>
    );
  }

  return (
    <FieldCard>
      <FieldSection
        label="If this partnership ends"
        title="Candidates we'd suggest."
        sub="Match from exam, phase, cadence, and availability overlap."
      />
      <ul className="space-y-3">
        {candidates.map((c) => {
          const u = c.user || COMMUNITY_USERS[c.id] || { id: c.id, name: c.id };
          const disabled = c.invited || busy || !actionable(c.id);
          const matchPct = typeof c.match === "number" ? Math.round(c.match * 100) : null;
          return (
            <li key={c.id} className="flex items-center gap-3">
              <FieldAvatar user={u} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-field-ink">{u.name}</span>
                  {matchPct != null && matchPct > 0 ? (
                    <span className="font-mono text-[10.5px] text-field-accent-ink">{matchPct}% match</span>
                  ) : null}
                </div>
                <div className="text-[11.5px] text-field-ink-muted mt-0.5 truncate">{c.why}</div>
              </div>
              <FieldButton
                variant={c.invited ? "accentSoft" : "primary"}
                size="xs"
                onClick={() => invite(c)}
                disabled={disabled}
                data-testid={`invite-${c.id}`}
                title={!actionable(c.id) ? "Sample candidate — real matches will appear here." : undefined}
              >
                {c.invited ? "Invited" : "Invite"}
              </FieldButton>
            </li>
          );
        })}
      </ul>
    </FieldCard>
  );
}
