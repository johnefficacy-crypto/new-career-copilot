import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function Subjects() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/study/subjects").then((d) => setItems(d.items)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6" data-testid="subjects-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Study OS · subjects</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Where you stand, subject by subject.</h1>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((s) => (
          <div key={s.subject} className="soft-card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="font-heading font-semibold text-lg">{s.subject}</div>
              <div className="text-sm text-muted-foreground">{s.hours}h logged</div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-clay-100 overflow-hidden">
              <div className="h-full bg-clay-500" style={{ width: `${s.progress * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{Math.round(s.progress * 100)}% closed</div>
            {s.weak?.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Still weak</div>
                <div className="flex flex-wrap gap-2">
                  {s.weak.map((w) => <span key={w} className="pill pill-clay">{w}</span>)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
