import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminMentors() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/marketplace/mentors").then((d) => setItems(d.items)).catch(() => {});
  }, []);
  return (
    <div className="space-y-6" data-testid="admin-mentors">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Mentor verification</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Who we vouch for.</h1>
      </div>
      <div className="soft-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              <th className="text-left px-4 py-3">Mentor</th>
              <th className="text-left px-4 py-3">Headline</th>
              <th className="text-left px-4 py-3">Price</th>
              <th className="text-left px-4 py-3">Rating</th>
              <th className="text-left px-4 py-3">Sessions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">{m.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{m.headline}</td>
                <td className="px-4 py-3 text-xs">₹{m.price_per_hour}/hr</td>
                <td className="px-4 py-3 text-xs inline-flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" fill="currentColor" /> {m.rating}</td>
                <td className="px-4 py-3 text-xs">{m.sessions}</td>
                <td className="px-4 py-3 text-right text-xs"><button className="btn btn-ghost">Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
