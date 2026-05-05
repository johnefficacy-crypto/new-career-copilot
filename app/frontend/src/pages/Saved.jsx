import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";

export default function Saved() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/recruitments/saved").then((d) => setItems(d.items || [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-6" data-testid="saved-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Saved</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Your tracked recruitments</h1>
        <p className="text-muted-foreground mt-1">Add any exam from the listing to keep deadlines nearby.</p>
      </div>

      {items.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <Bookmark className="h-6 w-6 text-clay-500 mx-auto" />
          <div className="mt-3 font-heading text-lg font-semibold">Nothing saved yet</div>
          <div className="text-sm text-muted-foreground">Save exams from the listing to have them here.</div>
          <Link to="/app/exams" className="inline-flex mt-5 btn btn-primary" data-testid="saved-empty-cta">Browse exams</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((e) => (
            <Link key={e.slug} to={`/app/exams/${e.slug}`} className="soft-card rounded-2xl p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-clay-100 grid place-items-center font-mono font-semibold text-xs text-clay-700">
                {e.organization_code}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{e.name}</div>
                <div className="text-xs text-muted-foreground">{e.organization}</div>
              </div>
              <span className="pill pill-sage inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Official</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
