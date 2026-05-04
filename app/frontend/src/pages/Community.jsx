import React from "react";
import { MessageCircle, ArrowUp, Pin, ShieldCheck, Users, Clock } from "lucide-react";

const CHANNELS = [
  { id: "official", label: "#official-updates", count: 14, admin: true },
  { id: "form", label: "#form-help", count: 42 },
  { id: "prep", label: "#preparation", count: 189, active: true },
  { id: "pyq", label: "#pyq-discussion", count: 76 },
  { id: "cutoffs", label: "#cutoffs-results", count: 31 },
];

const THREADS = [
  {
    pinned: true,
    author: "Career Copilot",
    badge: "Admin",
    title: "SSC CGL 2026 notification released · apply window 18 Apr – 17 May",
    body: "Official notification is live on ssc.nic.in. We've parsed post-wise eligibility and it's now visible under your matched recruitments.",
    votes: 482, replies: 67, tag: "Official",
  },
  {
    author: "Rahul V.",
    badge: "Verified Topper",
    title: "How I jumped from 110 to 168 in Quant in 6 weeks",
    body: "Three compounding habits that unlocked the jump: (1) topic closure instead of chapter coverage, (2) daily 20-mock-question sprint, (3) error log every Sunday…",
    votes: 214, replies: 48, tag: "Strategy",
  },
  {
    author: "Aanya S.",
    title: "Is my form rejected if I uploaded signature twice by mistake?",
    body: "I applied for SSC CGL and accidentally uploaded the signature file in the photo slot too. Will the form be rejected, or can I edit?",
    votes: 38, replies: 22, tag: "Question",
  },
  {
    author: "Nikhil T.",
    title: "Cutoff trend — IBPS PO Prelims 2021→2025 category-wise",
    body: "Compiled from official result PDFs. Clear downward trend in general, roughly flat for OBC. Full breakdown inside.",
    votes: 167, replies: 34, tag: "Resource",
  },
];

export default function CommunityPage() {
  return (
    <div data-testid="community-page" className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Community · SSC CGL</div>
        <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">
          Structured. Moderated. Actually useful.
        </h1>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Channels */}
        <aside className="rounded-2xl bg-white border border-border p-4 h-fit">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold px-2">Channels</div>
          <ul className="mt-2 space-y-0.5">
            {CHANNELS.map((c) => (
              <li key={c.id}>
                <button className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${c.active ? "bg-foreground text-background font-semibold" : "hover:bg-foreground/5"}`}>
                  <span className="flex items-center gap-1.5 font-mono">
                    {c.admin && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />}
                    {c.label}
                  </span>
                  <span className={`text-[10px] ${c.active ? "text-background/70" : "text-muted-foreground"}`}>{c.count}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 pt-4 border-t border-border px-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Your group</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#F56A3F] to-[#FFAB00] grid place-items-center text-white font-bold text-xs">MB</div>
              <div>
                <div className="text-sm font-bold">Morning Batch</div>
                <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> 4 members</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Threads */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button className="bg-foreground text-background text-xs font-semibold px-3.5 py-1.5 rounded-full">New thread +</button>
            {["Hot", "Newest", "Unanswered"].map((f) => (
              <button key={f} className="text-xs font-semibold px-3.5 py-1.5 rounded-full border border-border bg-white hover:border-foreground/30">{f}</button>
            ))}
          </div>

          {THREADS.map((t, i) => (
            <article key={i} className={`rounded-2xl border p-5 bg-white ${t.pinned ? "border-[#F56A3F]/30 bg-[#FFF5EF]/40" : "border-border hover:border-foreground/20"}`}>
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
                  <button className="hover:text-[#F56A3F]"><ArrowUp className="h-4 w-4" /></button>
                  <div className="text-[11px] font-bold font-mono text-foreground">{t.votes}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.pinned && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#F56A3F]"><Pin className="h-3 w-3" /> Pinned</span>}
                    <span className="text-xs font-semibold">{t.author}</span>
                    {t.badge && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${t.badge === "Admin" ? "bg-foreground text-background" : "bg-emerald-100 text-emerald-700"}`}>
                        {t.badge}
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded border border-border">{t.tag}</span>
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 ml-auto"><Clock className="h-3 w-3" /> 2h ago</span>
                  </div>
                  <h3 className="mt-1.5 font-heading text-lg font-bold">{t.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t.body}</p>
                  <div className="mt-3 text-[11px] text-muted-foreground inline-flex items-center gap-1 font-semibold">
                    <MessageCircle className="h-3.5 w-3.5" /> {t.replies} replies · Accepted answer
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
