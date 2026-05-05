import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { api } from "../lib/api";

export default function Marketplace() {
  const [resources, setResources] = useState([]);
  const [providers, setProviders] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.get("/api/marketplace/resources").then((d) => setResources(d.items)).catch(() => {});
    api.get("/api/marketplace/providers").then((d) => setProviders(d.items)).catch(() => {});
    api.get("/api/marketplace/affiliates").then((d) => setAffiliates(d.items)).catch(() => {});
  }, []);

  const filtered = filter === "all" ? resources : resources.filter((r) => r.type === filter);
  const types = ["all", ...new Set(resources.map((r) => r.type))];

  return (
    <div className="space-y-8" data-testid="marketplace-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Marketplace</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Resources from people who've been there.</h1>
        <p className="text-muted-foreground mt-1">Curated, quiet, non-promotional. We don't take paid placements.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            data-testid={`mkt-filter-${t}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
              filter === t ? "bg-clay-500 text-white" : "bg-white/70 border border-border"
            }`}
          >
            {t === "all" ? "All resources" : t}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((r) => (
          <Link key={r.id} to={`/app/marketplace/${r.id}`} className="soft-card rounded-2xl overflow-hidden hover:border-clay-300 transition" data-testid={`mkt-${r.id}`}>
            <div className="h-24" style={{ background: r.cover || "#F1E1CD" }} />
            <div className="p-5">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{r.type}</div>
              <div className="font-heading text-lg font-semibold mt-1">{r.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{r.provider}</div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-heading text-lg font-semibold">₹{r.price.toLocaleString()}</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Star className="h-4 w-4 text-amber-500" fill="currentColor" /> {r.rating} · {r.students.toLocaleString()} learners
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="font-heading text-2xl font-semibold">Providers</h2>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          {providers.map((p) => (
            <div key={p.id} className="soft-card rounded-2xl p-5">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.type} · {p.courses} resources</div>
              <div className="mt-3 inline-flex items-center gap-1 text-muted-foreground text-sm">
                <Star className="h-4 w-4 text-amber-500" fill="currentColor" /> {p.rating}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-2xl font-semibold">Affiliates · partner picks</h2>
        <p className="text-sm text-muted-foreground mt-1">Disclosed. We earn a small cut, you know who pays whom.</p>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          {affiliates.map((a) => (
            <div key={a.id} className="soft-card rounded-2xl p-5">
              <div className="font-semibold">{a.name}</div>
              <div className="text-xs text-muted-foreground">{a.type}</div>
              <div className="mt-2 text-sm">Commission: <span className="font-semibold">{a.commission}</span></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
