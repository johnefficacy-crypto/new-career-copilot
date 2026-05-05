import React, { useEffect, useState } from "react";
import { HandHeart, Users, CalendarClock, Flame } from "lucide-react";
import { api } from "../lib/api";

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
    await api.post("/api/accountability/partners/request", { partner_id: id, message: "Let's team up for daily check-ins." });
    setNote(`Request sent to ${partners.find((p) => p.id === id)?.name}`);
  }
  async function joinGroup(id) {
    await api.post("/api/accountability/groups/join", { group_id: id });
    setNote(`Joined ${groups.find((g) => g.id === id)?.name}`);
  }

  return (
    <div className="space-y-8" data-testid="accountability-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Accountability</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Preparation is lonely. It doesn't have to be.</h1>
        <p className="text-muted-foreground mt-1">Match with a partner, join a study group, or book a mentor. Showing up is the hardest part.</p>
      </div>

      {note && <div className="soft-card rounded-xl p-4 text-sm bg-sage-50 border-sage-200">{note}</div>}

      <section>
        <h2 className="font-heading text-2xl font-semibold flex items-center gap-2"><HandHeart className="h-5 w-5 text-clay-600" /> Suggested partners</h2>
        <p className="text-sm text-muted-foreground mt-1">Matched by exam, timezone and rhythm.</p>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {partners.map((p) => (
            <div key={p.id} className="soft-card rounded-2xl p-5" data-testid={`partner-${p.id}`}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-clay-500 text-white grid place-items-center font-semibold text-xs">{p.name.split(" ").map((w) => w[0]).join("")}</div>
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.exam} · {p.city}</div>
                </div>
                <div className="ml-auto inline-flex items-center gap-1 text-xs text-clay-600">
                  <Flame className="h-3.5 w-3.5" /> {p.streak}d streak
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                {p.study_hours}h/day · {p.commitment}
              </div>
              <button onClick={() => invite(p.id)} className="btn btn-ghost mt-3 w-full" data-testid={`invite-${p.id}`}>Send request</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-2xl font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-clay-600" /> Study groups</h2>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div key={g.id} className="soft-card rounded-2xl p-5" data-testid={`group-${g.id}`}>
              <div className="font-heading font-semibold text-lg">{g.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{g.exam} · {g.vibe}</div>
              <div className="mt-3 text-sm">{g.members} members</div>
              <button onClick={() => joinGroup(g.id)} className="btn btn-ghost mt-3 w-full" data-testid={`join-${g.id}`}>Join group</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-2xl font-semibold flex items-center gap-2"><CalendarClock className="h-5 w-5 text-clay-600" /> Your mentor sessions</h2>
        <div className="mt-4">
          {bookings.length === 0 ? (
            <div className="soft-card rounded-2xl p-6 text-sm text-muted-foreground">No sessions yet. Browse mentors to book one.</div>
          ) : (
            <div className="space-y-2">
              {bookings.map((b) => (
                <div key={b.id} className="soft-card rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{b.mentor_name}</div>
                    <div className="text-xs text-muted-foreground">{b.slot} · ₹{b.price}</div>
                  </div>
                  <span className="pill pill-amber">{b.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
