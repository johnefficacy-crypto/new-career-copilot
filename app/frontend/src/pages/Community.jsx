import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Clock, MessageCircle, Pin, Plus, ShieldCheck, Users } from "lucide-react";
import { api } from "../lib/api";

export default function Community() {
  const [categories, setCategories] = useState([]);
  const [threads, setThreads] = useState([]);
  const [category, setCategory] = useState(null);
  const [sort, setSort] = useState("hot");

  useEffect(() => {
    api.get("/api/community/categories").then((d) => setCategories(Array.isArray(d?.items) ? d.items : [])).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ sort });
    if (category) qs.set("category", category);
    api.get(`/api/community/threads?${qs.toString()}`).then((d) => setThreads(Array.isArray(d?.items) ? d.items : [])).catch(() => {});
  }, [sort, category]);

  return (
    <div className="space-y-6" data-testid="community-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Community</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Structured. Moderated. Actually useful.</h1>
        </div>
        <Link to="/app/community/new" className="btn btn-primary" data-testid="new-thread-btn">
          <Plus className="h-4 w-4" /> New thread
        </Link>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <aside className="soft-card rounded-2xl p-4 h-fit">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold px-2">Channels</div>
          <ul className="mt-2 space-y-0.5">
            <li>
              <button
                onClick={() => setCategory(null)}
                data-testid="cat-all"
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                  !category ? "bg-clay-500 text-white font-semibold" : "hover:bg-clay-100"
                }`}
              >
                <span className="font-mono">#all</span>
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setCategory(c.id)}
                  data-testid={`cat-${c.id}`}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    category === c.id ? "bg-clay-500 text-white font-semibold" : "hover:bg-clay-100"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-mono">
                    {c.admin_only && <ShieldCheck className="h-3.5 w-3.5 text-sage-600" />}
                    #{c.id}
                  </span>
                  <span className={`text-[10px] ${category === c.id ? "text-white/70" : "text-muted-foreground"}`}>{c.count}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t border-border px-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Your group</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-clay-500 text-white grid place-items-center font-semibold text-xs">MB</div>
              <div>
                <div className="text-sm font-semibold">Morning Batch</div>
                <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> 4 members</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {["hot", "new", "unanswered"].map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                data-testid={`sort-${s}`}
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border ${
                  sort === s ? "bg-clay-500 border-clay-500 text-white" : "border-border bg-white/70 hover:border-clay-300"
                }`}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {threads.map((t) => (
            <Link
              key={t.id}
              to={`/app/community/${t.slug}`}
              className={`block soft-card rounded-2xl p-5 hover:border-clay-300 transition ${t.pinned ? "ring-1 ring-clay-300" : ""}`}
              data-testid={`thread-${t.slug}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
                  <ArrowUp className="h-4 w-4" />
                  <div className="text-[11px] font-semibold font-mono text-foreground">{t.votes}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.pinned && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-clay-700"><Pin className="h-3 w-3" /> Pinned</span>}
                    <span className="text-xs font-semibold">{t.author}</span>
                    {t.badge && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${t.badge === "Admin" ? "bg-foreground text-background" : "bg-sage-100 text-sage-700"}`}>
                        {t.badge}
                      </span>
                    )}
                    {t.tag && <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded border border-border">{t.tag}</span>}
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 ml-auto"><Clock className="h-3 w-3" /> new</span>
                  </div>
                  <h3 className="mt-1.5 font-heading text-lg font-semibold">{t.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t.excerpt}</p>
                  <div className="mt-3 text-[11px] text-muted-foreground inline-flex items-center gap-1 font-semibold">
                    <MessageCircle className="h-3.5 w-3.5" /> {t.replies_count} replies
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
