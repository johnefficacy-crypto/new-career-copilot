import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star /* MessageCircle */ } from "lucide-react";
import { api } from "../lib/api";

export default function Mentors() {
  const [items, setItems] = useState([]);
  const [exam, setExam] = useState("all");

  useEffect(() => {
    const qs = exam !== "all" ? `?exam=${exam}` : "";
    api.get(`/api/marketplace/mentors${qs}`).then((d) => setItems(d.items)).catch(() => {});
  }, [exam]);

  return (
    <div className="space-y-6" data-testid="mentors-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Mentors</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">People who've done it can help you do it.</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {["all", "ssc-cgl-2026", "ibps-po-xv", "rbi-grade-b-2026", "upsc-cse-2026", "sbi-clerk-2026"].map((e) => (
          <button
            key={e}
            onClick={() => setExam(e)}
            data-testid={`mentor-filter-${e}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
              exam === e ? "bg-clay-500 text-white" : "bg-white/70 border border-border"
            }`}
          >
            {e === "all" ? "All mentors" : e.replaceAll("-", " ").toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((m) => (
          <Link key={m.id} to={`/app/mentors/${m.id}`} className="soft-card rounded-2xl p-6 hover:border-clay-300 transition" data-testid={`mentor-${m.id}`}>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-clay-500 text-white grid place-items-center font-semibold">{m.name.split(" ").map((w) => w[0]).join("")}</div>
              <div>
                <div className="font-heading font-semibold text-lg">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.headline}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-foreground/80">{m.bio}</p>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Star className="h-4 w-4 text-amber-500" fill="currentColor" /> {m.rating} · {m.sessions} sessions
              </div>
              <div className="font-heading font-semibold">₹{m.price_per_hour}/hr</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
