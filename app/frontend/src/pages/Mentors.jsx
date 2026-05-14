import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Avatar, Card, Eyebrow, PageHeader, SectionHeader } from "../shared/ui/studyos";

const EXAM_FILTERS = ["all", "ssc-cgl-2026", "ibps-po-xv", "rbi-grade-b-2026", "upsc-cse-2026", "sbi-clerk-2026"];

const BOOKING_STEPS = [
  { k: "01 · Pick", v: "Choose a mentor or session", icon: "◐" },
  { k: "02 · Pay", v: "₹99–₹299 · UPI / card", icon: "⟐" },
  { k: "03 · Join", v: "Embedded Daily.co / Jitsi room", icon: "◊" },
  { k: "04 · Log", v: "Hours auto-feed your plan", icon: "↻" },
];

export default function Mentors() {
  const [items, setItems] = useState([]);
  const [exam, setExam] = useState("all");

  useEffect(() => {
    const qs = exam !== "all" ? `?exam=${exam}` : "";
    api
      .get(`/api/marketplace/mentors${qs}`)
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
  }, [exam]);

  return (
    <div className="space-y-6" data-testid="mentors-page">
      <PageHeader
        eyebrow="Mentors · 1:n sessions"
        title="People who've done it can help you do it."
        sub="Learn from verified Toppers, Officers and mentors — calmly priced. Mentors are admin-verified before listing, and you get a refund if a session is cancelled."
      />

      <div className="flex flex-wrap gap-2">
        {EXAM_FILTERS.map((e) => (
          <button
            key={e}
            onClick={() => setExam(e)}
            data-testid={`mentor-filter-${e}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
              exam === e
                ? "bg-[#2E2218] text-[#F3EADB]"
                : "bg-white/70 border border-[#E7DECB] text-clay-700 hover:bg-[#F3EADB]"
            }`}
          >
            {e === "all" ? "All mentors" : e.replaceAll("-", " ").toUpperCase()}
          </button>
        ))}
      </div>

      <Card padded={false}>
        <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>Mentor directory</Eyebrow>
            <h2 className="font-heading text-[22px] mt-1">
              {items.length} verified mentor{items.length === 1 ? "" : "s"}.
            </h2>
          </div>
        </div>
        <div className="hairline mx-7" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 px-7 py-6">
          {items.map((m) => (
            <Link
              key={m.id}
              to={`/app/mentors/${m.id}`}
              data-testid={`mentor-${m.id}`}
              className="text-left rounded-xl border border-[#E7DECB] bg-white/70 hover:bg-white hover:border-[#A68057] p-4 transition"
            >
              <div className="flex items-center gap-3">
                <Avatar user={{ name: m.name }} size={42} />
                <div className="min-w-0">
                  <div className="font-heading text-[15px] truncate">{m.name}</div>
                  <div className="num-mono text-[10.5px] text-clay-700 mt-0.5 truncate">{m.headline}</div>
                </div>
              </div>
              <p className="text-[12px] text-[#3a2e22] mt-2.5 leading-snug line-clamp-2">{m.bio}</p>
              <div className="rule mt-3 pt-2.5 flex items-center justify-between text-[11px]">
                <span className="num-mono text-clay-700">
                  ★ {m.rating} · {m.sessions} sessions
                </span>
                <span className="num-mono text-[#33482F] font-semibold">₹{m.price_per_hour}/hr</span>
              </div>
            </Link>
          ))}
          {!items.length ? (
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-5 text-sm text-clay-700">
              No mentors match this filter yet.
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="How booking works"
          title="No surprises. Refunds if a session is cancelled."
          sub="Payment via Razorpay. The mentor gets 80%, the platform 20%. Sessions you join contribute to your study analytics."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {BOOKING_STEPS.map((s, i) => (
            <div key={i} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
              <div className="text-[20px] text-[#A68057]">{s.icon}</div>
              <div className="num-mono text-[9.5px] text-clay-700 uppercase tracking-[0.16em] mt-1.5">
                {s.k}
              </div>
              <div className="text-[12.5px] mt-1.5 text-clay-900">{s.v}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
