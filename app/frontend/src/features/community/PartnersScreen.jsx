import React, { useState } from "react";
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
import { ACCOUNTABILITY, COMMUNITY_USERS } from "./data";

// Production port of docs/reference/UI_claude-code/screen-partners.jsx.

export default function PartnersScreen() {
  const partner = COMMUNITY_USERS[ACCOUNTABILITY.partner.userId];
  return (
    <div className="space-y-6" data-testid="partners-page">
      <PageHeader
        eyebrow="Accountability partner"
        title="One person. Daily ✅. Weekly truth."
        sub="A structured bilateral commitment. We surface what both of you said you'd do, and what actually happened — calmly."
        right={
          <div className="flex gap-2">
            <button type="button" className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
              End partnership
            </button>
            <button type="button" className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">
              Pause this week
            </button>
          </div>
        }
      />

      <PartnerHeroCard partner={partner} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <ThisWeekComparison />
        <DailyCheckinPartner />
      </div>

      <CommitmentDiffCard />
      <CheckinHistory />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyReviewQuestionsCard />
        <PartnerCandidatesCard />
      </div>
    </div>
  );
}

function PartnerHeroCard({ partner }) {
  const A = ACCOUNTABILITY;
  const you = COMMUNITY_USERS.u_aarav;
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-center gap-6 flex-wrap" data-testid="partner-hero">
        <div className="flex items-center gap-3">
          <Avatar user={you} size={56} />
          <div>
            <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em]">You</div>
            <div className="font-heading text-[18px] text-[#F3EADB] mt-0.5">{you.name}</div>
            <div className="num-mono text-[10.5px] text-[#A68057] mt-0.5">UPSC CSE 2026</div>
          </div>
        </div>

        <div className="flex-1 min-w-[220px] flex flex-col items-center">
          <svg width="220" height="44" viewBox="0 0 220 44" fill="none" aria-hidden="true">
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
            >
              {A.partner.streakDays}d
            </text>
          </svg>
          <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em] mt-1">
            consecutive days both checked in
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <div className="text-right">
            <div className="num-mono text-[10px] text-[#D6BC93] uppercase tracking-[0.18em]">Partner</div>
            <div className="font-heading text-[18px] text-[#F3EADB] mt-0.5">{partner.name}</div>
            <div className="num-mono text-[10.5px] text-[#A68057] mt-0.5">
              UPSC CSE 2026 · since {A.partner.since}
            </div>
          </div>
          <Avatar user={partner} size={56} />
        </div>
      </div>

      <div className="rule mt-5 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12px] text-[#D6BC93] border-[#4E3A29]">
        <Stat k="Partnership age" v="64 days" />
        <Stat k="Combined hours · week" v={`${A.thisWeek.self.hours + A.thisWeek.partner.hours}h`} />
        <Stat k="Mocks taken · week" v={`${A.thisWeek.self.mocks + A.thisWeek.partner.mocks}`} />
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

function ThisWeekComparison() {
  const A = ACCOUNTABILITY;
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
              <td className="num-mono">{A.selfCommitment.hoursPerWeek}h</td>
              <td>
                <span className="num-mono">{A.thisWeek.self.hours}h</span> ·{" "}
                <MiniBar pct={A.thisWeek.self.hours / A.selfCommitment.hoursPerWeek} width={64} />
              </td>
              <td className="num-mono">{A.partnerCommitment.hoursPerWeek}h</td>
              <td>
                <span className="num-mono">{A.thisWeek.partner.hours}h</span> ·{" "}
                <MiniBar
                  pct={A.thisWeek.partner.hours / A.partnerCommitment.hoursPerWeek}
                  width={64}
                  color="#524864"
                />
              </td>
            </tr>
            <tr>
              <td>
                <strong>Tasks</strong>
              </td>
              <td className="num-mono">{A.selfCommitment.tasksPerWeek}</td>
              <td>
                <span className="num-mono">{A.thisWeek.self.tasks}</span> ·{" "}
                <MiniBar pct={A.thisWeek.self.tasks / A.selfCommitment.tasksPerWeek} width={64} />
              </td>
              <td className="num-mono">{A.partnerCommitment.tasksPerWeek}</td>
              <td>
                <span className="num-mono">{A.thisWeek.partner.tasks}</span> ·{" "}
                <MiniBar
                  pct={A.thisWeek.partner.tasks / A.partnerCommitment.tasksPerWeek}
                  width={64}
                  color="#524864"
                />
              </td>
            </tr>
            <tr>
              <td>
                <strong>Mocks</strong>
              </td>
              <td className="num-mono">{A.selfCommitment.mocksPerWeek}</td>
              <td className="num-mono">{A.thisWeek.self.mocks}</td>
              <td className="num-mono">{A.partnerCommitment.mocksPerWeek}</td>
              <td className="num-mono">{A.thisWeek.partner.mocks}</td>
            </tr>
            <tr>
              <td>
                <strong>Check-ins</strong>
              </td>
              <td className="num-mono">7/7</td>
              <td>
                <span className="inline-flex gap-1">
                  {A.thisWeek.self.checkedInDays.map((d, i) => (
                    <span
                      key={i}
                      className={`w-3.5 h-3.5 rounded-sm ${d ? "bg-[#54794E]" : "bg-[#E7DECB]"}`}
                    />
                  ))}
                </span>
              </td>
              <td className="num-mono">7/7</td>
              <td>
                <span className="inline-flex gap-1">
                  {A.thisWeek.partner.checkedInDays.map((d, i) => (
                    <span
                      key={i}
                      className={`w-3.5 h-3.5 rounded-sm ${d ? "bg-[#524864]" : "bg-[#E7DECB]"}`}
                    />
                  ))}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DailyCheckinPartner() {
  const [done, setDone] = useState(null);
  const [body, setBody] = useState("");
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
          className="mt-3 w-full bg-transparent outline-none text-[12.5px] placeholder:text-[#A68057] resize-none"
        />
        <div className="flex justify-between items-center mt-2 gap-2 flex-wrap">
          <span className="num-mono text-[10.5px] text-clay-700">
            Partner checks in by 22:00 IST · auto-prompt sent
          </span>
          <button type="button" className="text-[11px] px-3 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">
            Post
          </button>
        </div>
      </div>

      <div className="rule mt-4 pt-3">
        <Eyebrow>Partner's last check-in</Eyebrow>
        <div className="mt-2 flex items-start gap-3">
          <Avatar user={COMMUNITY_USERS.u_aman} size={28} />
          <div>
            <div className="text-[13px]">"Did it · 5.5h · Mock 14 prep — felt scattered on Eco"</div>
            <div className="num-mono text-[10.5px] text-clay-700 mt-1">May 14 · 21:42 IST</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CommitmentDiffCard() {
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
            <li>· Study <strong>42h</strong> per week</li>
            <li>· Complete <strong>50 tasks</strong> per week</li>
            <li>· Take <strong>2 mocks</strong> per week</li>
            <li>· Daily check-in by <strong>22:00 IST</strong></li>
          </ul>
          <button type="button" className="mt-3 text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
            Edit your commitment
          </button>
        </div>
        <div className="rounded-xl border border-[#DDDAE3] bg-[#F7F5FB] p-4">
          <Eyebrow>Partner's commitment</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[13px] text-[#31293B]">
            <li>· Study <strong>38h</strong> per week</li>
            <li>· Complete <strong>46 tasks</strong> per week</li>
            <li>· Take <strong>2 mocks</strong> per week</li>
            <li>· Daily check-in by <strong>22:00 IST</strong></li>
          </ul>
          <div className="num-mono text-[10.5px] text-[#524864] mt-3">last updated May 6 by partner</div>
        </div>
      </div>
    </Card>
  );
}

function CheckinHistory() {
  return (
    <Card>
      <SectionHeader
        eyebrow="Check-in log · last 5 days"
        title="What both of you said."
        right={
          <a href="#" className="text-[11.5px] text-clay-700 underline">
            Full log →
          </a>
        }
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
            {ACCOUNTABILITY.recentCheckIns.map((c, i) => (
              <tr key={i}>
                <td className="num-mono">{c.date}</td>
                <td>{c.self}</td>
                <td className={c.partner.includes("Skipped") ? "text-[#7A3925]" : ""}>{c.partner}</td>
                <td>
                  {c.self.includes("Did it") && c.partner.includes("Did it") ? (
                    <Pill tone="sage">streak +1</Pill>
                  ) : (
                    <Pill tone="amber">break</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WeeklyReviewQuestionsCard() {
  return (
    <Card>
      <SectionHeader
        eyebrow="Weekly review · Sunday 21:00"
        title="Three questions. Both answer. Compared side-by-side."
        sub="No scoring. The conversation is the value."
      />
      <ol className="space-y-3">
        {ACCOUNTABILITY.weeklyReviewQ.map((q, i) => (
          <li key={i} className="flex items-start gap-3">
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

function PartnerCandidatesCard() {
  return (
    <Card>
      <SectionHeader
        eyebrow="If this partnership ends"
        title="Candidates we'd suggest."
        sub="Match score from exam + phase + cadence + availability overlap."
      />
      <ul className="space-y-3">
        {ACCOUNTABILITY.candidates.map((c) => {
          const u = COMMUNITY_USERS[c.id];
          return (
            <li key={c.id} className="grid grid-cols-[36px_1fr_100px] gap-3 items-center">
              <Avatar user={u} size={32} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium">{u.name}</span>
                  <span className="num-mono text-[10.5px] text-[#33482F]">
                    match {Math.round(c.match * 100)}%
                  </span>
                </div>
                <div className="text-[11.5px] text-clay-700 mt-0.5">{c.why}</div>
              </div>
              <button type="button" className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">
                Invite
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
