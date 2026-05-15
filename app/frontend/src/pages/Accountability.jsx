import React, { useEffect, useState } from "react";
import { HandHeart, Users, CalendarClock, Flame } from "lucide-react";
import { api } from "../lib/api";
import { Avatar, Card, Pill, PageHeader, SectionHeader } from "../shared/ui/studyos";

export default function Accountability() {
  const [partners, setPartners] = useState([]);
  const [groups, setGroups] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [note, setNote] = useState(null);

  useEffect(() => {
    api.get("/api/accountability/partners").then((d) => setPartners(d.suggested || [])).catch(() => {});
    api.get("/api/accountability/groups").then((d) => setGroups(d.items || [])).catch(() => {});
    api.get("/api/accountability/mentors/bookings").then((d) => setBookings(d.items || [])).catch(() => {});
  }, []);

  async function invite(id) {
    await api.post("/api/accountability/partners/request", {
      partner_id: id,
      message: "Let's team up for daily check-ins.",
    });
    setNote(`Request sent to ${partners.find((p) => p.id === id)?.name}`);
  }
  async function joinGroup(id) {
    await api.post("/api/accountability/groups/join", { group_id: id });
    setNote(`Joined ${groups.find((g) => g.id === id)?.name}`);
  }

  return (
    <div className="space-y-6" data-testid="accountability-page">
      <PageHeader
        eyebrow="Accountability"
        title="Preparation is lonely. It doesn't have to be."
        sub="Match with a partner, join a study group, or book a mentor. A structured bilateral commitment — daily check-in, weekly truth. Showing up is the hardest part."
      />

      {note && (
        <div className="rounded-xl border border-[#B9CFAF] bg-[#F0F5EF] px-4 py-3 text-sm text-[#33482F]">
          {note}
        </div>
      )}

      <Card>
        <SectionHeader
          eyebrow="Suggested partners"
          title="One person. Daily check-in. Weekly truth."
          sub="Matched by exam, timezone and study rhythm — no leaderboard, just shared accountability."
        />
        <div className="grid md:grid-cols-2 gap-4">
          {partners.map((p) => (
            <div
              key={p.id}
              data-testid={`partner-${p.id}`}
              className="rounded-xl border border-[#E7DECB] bg-white/70 p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar user={{ name: p.name }} size={40} />
                <div className="min-w-0">
                  <div className="font-heading text-[15px]">{p.name}</div>
                  <div className="num-mono text-[10.5px] text-clay-700 mt-0.5">
                    {p.exam} · {p.city}
                  </div>
                </div>
                <span className="ml-auto inline-flex items-center gap-1 num-mono text-[11px] text-clay-700">
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {p.streak}d
                </span>
              </div>
              <div className="rule mt-3 pt-2.5 text-[12.5px] text-clay-700">
                {p.study_hours}h/day · {p.commitment}
              </div>
              <button
                onClick={() => invite(p.id)}
                data-testid={`invite-${p.id}`}
                className="btn btn-ghost mt-3 w-full"
              >
                Send request
              </button>
            </div>
          ))}
          {!partners.length ? (
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-5 text-sm text-clay-700">
              No partner suggestions yet — check back as more aspirants join.
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Study groups"
          title="Pace with people."
          sub="Small groups that meet on a schedule. Join one that matches your exam and your vibe."
        />
        <div className="grid md:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div
              key={g.id}
              data-testid={`group-${g.id}`}
              className="rounded-xl border border-[#E7DECB] bg-white/70 p-4"
            >
              <div className="font-heading text-[16px]">{g.name}</div>
              <div className="num-mono text-[10.5px] text-clay-700 mt-1">
                {g.exam} · {g.vibe}
              </div>
              <div className="mt-3 text-[12.5px] text-clay-800 inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-clay-600" aria-hidden="true" /> {g.members} members
              </div>
              <button
                onClick={() => joinGroup(g.id)}
                data-testid={`join-${g.id}`}
                className="btn btn-ghost mt-3 w-full"
              >
                Join group
              </button>
            </div>
          ))}
          {!groups.length ? (
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-5 text-sm text-clay-700">
              No study groups listed yet.
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Your mentor sessions"
          title="Booked 1:1 time."
          right={
            <span className="inline-flex items-center gap-1.5 num-mono text-[11px] text-clay-700">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {bookings.length} booked
            </span>
          }
        />
        {bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-6 text-sm text-clay-700 text-center">
            <HandHeart className="h-5 w-5 text-clay-500 mx-auto" aria-hidden="true" />
            <div className="mt-2">No sessions yet. Browse mentors to book one.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-[#E7DECB] bg-white/70 p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-heading text-[15px]">{b.mentor_name}</div>
                  <div className="num-mono text-[10.5px] text-clay-700 mt-0.5">
                    {b.slot} · ₹{b.price}
                  </div>
                </div>
                <Pill tone="amber">{b.status}</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
