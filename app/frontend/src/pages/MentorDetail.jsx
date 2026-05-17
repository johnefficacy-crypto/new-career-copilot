import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Star, CalendarClock } from "lucide-react";
import { api } from "../lib/api";

export default function MentorDetail() {
  const { id } = useParams();
  const [m, setM] = useState(null);
  const [agenda, setAgenda] = useState("");
  const [slot, setSlot] = useState("");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get(`/api/marketplace/mentors/${id}`).then(setM).catch(() => {});
  }, [id]);

  async function book() {
    if (!slot) return;
    try {
      const b = await api.post("/api/accountability/mentors/book", {
        mentor_id: id,
        slot,
        notes: agenda || null,
      });
      const bookingId = (b.id || "").slice(0, 8);
      setStatus(`Requested · ${bookingId}. Status: ${b.status}. Confirmation will follow once the mentor accepts.`);
    } catch (e) {
      setStatus(e.message);
    }
  }

  if (!m) return <div>Loading…</div>;

  return (
    <div className="space-y-6" data-testid={`mentor-detail-${id}`}>
      <Link to="/app/mentors" className="text-sm text-muted-foreground link-under inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> All mentors
      </Link>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 soft-card rounded-3xl p-8">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-clay-500 text-white grid place-items-center font-heading font-semibold text-lg">
              {m.name.split(" ").map((w) => w[0]).join("")}
            </div>
            <div>
              <h1 className="font-heading text-3xl font-semibold">{m.name}</h1>
              <div className="text-muted-foreground">{m.headline}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 text-amber-500" fill="currentColor" /> {m.rating}</span>
            <span>{m.sessions} sessions</span>
            <span>Languages: {m.languages.join(", ")}</span>
          </div>
          <p className="mt-5 text-foreground/85">{m.bio}</p>

          <div className="mt-8">
            <h2 className="font-heading text-xl font-semibold">Testimonials</h2>
            <div className="mt-3 space-y-3">
              {(m.testimonials || []).map((t, i) => (
                <div key={i} className="soft-card rounded-xl p-4">
                  <div className="text-sm font-semibold">{t.name}</div>
                  <p className="text-sm text-muted-foreground mt-1">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="soft-card rounded-2xl p-6 h-fit sticky top-20 space-y-4">
          <div className="font-heading text-3xl font-semibold">₹{m.price_per_hour}/hr</div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Choose a slot</div>
          <div className="space-y-2">
            {(m.availability || []).map((d) => (
              <div key={d.day}>
                <div className="text-xs font-semibold mb-1">{d.day}</div>
                <div className="flex flex-wrap gap-2">
                  {d.slots.map((s) => {
                    const v = `${d.day} · ${s}`;
                    return (
                      <button
                        key={s}
                        onClick={() => setSlot(v)}
                        data-testid={`slot-${d.day}-${s}`}
                        className={`px-3 py-1.5 rounded-full text-xs border ${
                          slot === v ? "bg-clay-500 border-clay-500 text-white" : "border-border hover:border-clay-300"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Agenda (optional)</div>
            <textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-white/80 text-sm" data-testid="mentor-agenda" />
          </label>
          <button disabled={!slot} onClick={book} className="btn btn-primary w-full disabled:opacity-50" data-testid="mentor-book">
            <CalendarClock className="h-4 w-4" /> Request session
          </button>
          {status && <div className="text-xs text-muted-foreground">{status}</div>}
        </aside>
      </div>
    </div>
  );
}
