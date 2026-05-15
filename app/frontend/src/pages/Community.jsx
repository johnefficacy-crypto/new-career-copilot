import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, MessageCircle, Pin, Plus, ShieldCheck, Users } from "lucide-react";
import { api } from "../lib/api";
import { Avatar, Card, Eyebrow, PageHeader, Pill } from "../shared/ui/studyos";

const SORTS = ["hot", "new", "unanswered"];

export default function Community() {
  const [categories, setCategories] = useState([]);
  const [threads, setThreads] = useState([]);
  const [category, setCategory] = useState(null);
  const [sort, setSort] = useState("hot");

  useEffect(() => {
    api
      .get("/api/community/categories")
      .then((d) => setCategories(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ sort });
    if (category) qs.set("category", category);
    api
      .get(`/api/community/threads?${qs.toString()}`)
      .then((d) => setThreads(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
  }, [sort, category]);

  return (
    <div className="space-y-6" data-testid="community-page">
      <PageHeader
        eyebrow="Community"
        title="Structured. Moderated. Actually useful."
        sub="Telegram-style channels, Reddit-style threads. Verified Topper answers float to the top, and official channels are admin-write only."
        right={
          <Link to="/app/community/new" className="btn btn-primary" data-testid="new-thread-btn">
            <Plus className="h-4 w-4" /> New thread
          </Link>
        }
      />

      <div className="grid lg:grid-cols-4 gap-6 items-start">
        {/* Channels rail */}
        <Card className="h-fit">
          <Eyebrow>Channels</Eyebrow>
          <ul className="mt-3 space-y-0.5">
            <li>
              <button
                onClick={() => setCategory(null)}
                data-testid="cat-all"
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-mono transition ${
                  !category ? "bg-[#2E2218] text-[#F3EADB] font-semibold" : "text-clay-700 hover:bg-[#F3EADB]"
                }`}
              >
                <span>#all</span>
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setCategory(c.id)}
                  data-testid={`cat-${c.id}`}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                    category === c.id
                      ? "bg-[#2E2218] text-[#F3EADB] font-semibold"
                      : "text-clay-700 hover:bg-[#F3EADB]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-mono">
                    {c.admin_only && <ShieldCheck className="h-3.5 w-3.5 text-sage-600" aria-hidden="true" />}
                    #{c.id}
                  </span>
                  <span
                    className={`num-mono text-[10px] ${
                      category === c.id ? "text-[#D6BC93]" : "text-clay-700"
                    }`}
                  >
                    {c.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="rule mt-4 pt-4">
            <Eyebrow>Your group</Eyebrow>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#2E2218] text-[#F3EADB] grid place-items-center font-heading text-xs">
                MB
              </div>
              <div>
                <div className="text-sm font-semibold">Morning Batch</div>
                <div className="text-[11px] text-clay-700 inline-flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" /> 4 members
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Thread list */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB] w-fit">
            {SORTS.map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                data-testid={`sort-${s}`}
                className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition ${
                  sort === s ? "bg-[#2E2218] text-[#F3EADB]" : "text-clay-700 hover:bg-[#E7D6BA]"
                }`}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {threads.map((t) => {
            const isOfficial = t.badge === "Admin";
            return (
              <Link
                key={t.id}
                to={`/app/community/${t.slug}`}
                data-testid={`thread-${t.slug}`}
                className={`block rounded-xl border bg-white/70 hover:bg-white hover:border-[#A68057] transition overflow-hidden ${
                  isOfficial ? "border-[#2E2218]" : t.pinned ? "border-[#94B28A]" : "border-[#E7DECB]"
                }`}
              >
                <div className="flex">
                  <div className="bg-[#FBF8F2] border-r border-[#EFE2C9] px-3 py-4 flex flex-col items-center gap-1 shrink-0">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M3 9l5-5 5 5"
                        stroke="#6C5038"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="num-mono text-[12px] text-clay-900 font-semibold">{t.votes}</span>
                  </div>
                  <div className="flex-1 min-w-0 px-5 py-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-clay-700">
                          <Pin className="h-3 w-3" aria-hidden="true" /> Pinned
                        </span>
                      )}
                      {isOfficial && <span className="stamp stamp-official">Official</span>}
                      {t.tag && <Pill tone="outline">{t.tag}</Pill>}
                      <span className="text-[11px] text-clay-700 inline-flex items-center gap-1 ml-auto">
                        <Clock className="h-3 w-3" aria-hidden="true" /> new
                      </span>
                    </div>
                    <h3 className="mt-2 font-heading text-[17px] leading-snug">{t.title}</h3>
                    {t.excerpt ? (
                      <p className="text-[13px] text-clay-700 mt-1.5 leading-[1.5] line-clamp-2">{t.excerpt}</p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                      <span className="inline-flex items-center gap-2 text-[12px]">
                        <Avatar user={{ name: t.author || "?" }} size={22} />
                        <span className="text-clay-900 font-medium">{t.author}</span>
                        {t.badge && !isOfficial && <Pill tone="sage">{t.badge}</Pill>}
                      </span>
                      <span className="text-[11px] text-clay-700 inline-flex items-center gap-1 font-semibold">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t.replies_count} replies
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {!threads.length ? (
            <div className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-8 text-center">
              <div className="text-[28px] mb-2">◌</div>
              <div className="font-heading text-[18px] text-clay-900">No threads yet in this channel.</div>
              <div className="text-[12.5px] text-clay-700 mt-1.5">Be the first to start one.</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
