import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { api } from "../lib/api";
import { Card, Eyebrow, PageHeader, Pill, SectionHeader } from "../shared/ui/studyos";

const REFUND_RULES = [
  { k: "01", t: "No surprise upsells", b: "The final price is shown before checkout. The price you see is the price you pay." },
  { k: "02", t: "Refunds on every product", b: "5–14 days depending on type. Refunds go through Razorpay automatically." },
  { k: "03", t: "Affiliate cuts disclosed", b: "If we earn an affiliate cut, it is shown on the product card and detail." },
  { k: "04", t: "No fake scarcity", b: "Seat counts on mentor programs are real. Countdown timers we don't do." },
];

export default function Marketplace() {
  const [resources, setResources] = useState([]);
  const [providers, setProviders] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api
      .get("/api/marketplace/resources")
      .then((d) => setResources(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
    api
      .get("/api/marketplace/providers")
      .then((d) => setProviders(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
    api
      .get("/api/marketplace/affiliates")
      .then((d) => setAffiliates(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
  }, []);

  const filtered = filter === "all" ? resources : resources.filter((r) => r.type === filter);
  const types = ["all", ...new Set(resources.map((r) => r.type))];

  return (
    <div className="space-y-6" data-testid="marketplace-page">
      <PageHeader
        eyebrow="Marketplace"
        title="Curated commerce, the same trust rules as the rest of Study OS."
        sub="Mock tests, courses, notes, books and coaching partners — curated, quiet, non-promotional. Refund windows on every product. Affiliate disclosure is mandatory; we don't take paid placements."
      />

      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            data-testid={`mkt-filter-${t}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
              filter === t
                ? "bg-[#FFFDF9] text-[#2E2218] border border-[#D9C7A7]"
                : "bg-white/70 border border-[#E7DECB] text-clay-700 hover:bg-[#F3EADB]"
            }`}
          >
            {t === "all" ? "All resources" : t}
          </button>
        ))}
      </div>

      <Card padded={false}>
        <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>All resources</Eyebrow>
            <h2 className="font-heading text-[22px] mt-1">
              {filtered.length} matching · {filter === "all" ? "all categories" : filter}
            </h2>
          </div>
        </div>
        <div className="hairline mx-7" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 px-7 py-6">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to={`/app/marketplace/${r.id}`}
              data-testid={`mkt-${r.id}`}
              className="rounded-xl border border-[#E7DECB] bg-white/70 hover:bg-white hover:border-[#A68057] transition overflow-hidden flex flex-col"
            >
              <div className="h-24 relative" style={{ background: r.cover || "#F1E1CD" }}>
                <div className="absolute inset-0 grain" />
                <div className="absolute top-3 left-3 num-mono text-[10px] tracking-[0.16em] uppercase text-[#F3EADB] opacity-90">
                  {r.type}
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start gap-2">
                  <h3 className="font-heading text-[16px] leading-snug flex-1">{r.title}</h3>
                  {r.is_affiliate ? <Pill tone="amber">Affiliate</Pill> : null}
                </div>
                <div className="num-mono text-[10.5px] text-clay-700 mt-1">{r.provider}</div>
                {Number(r.refund_window_days || 0) > 0 ? (
                  <div className="num-mono text-[10px] text-clay-600 mt-1">{r.refund_window_days}-day refund window</div>
                ) : null}
                <div className="mt-auto pt-3 flex items-center justify-between border-t border-[#E7DECB] mt-3">
                  <span className="font-heading text-[18px]">
                    {Number(r.price || 0) <= 0 ? "Free" : `₹${Number(r.price || 0).toLocaleString()}`}
                  </span>
                  <span className="num-mono text-[10.5px] text-clay-700 inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-500" fill="currentColor" aria-hidden="true" />
                    {r.rating} · {Number(r.students || 0).toLocaleString()} learners
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {!filtered.length ? (
            <div className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-8 text-center md:col-span-2 lg:col-span-3">
              <div className="text-[28px] mb-2">◌</div>
              <div className="font-heading text-[18px] text-clay-900">No resources match this filter.</div>
              <div className="text-[12.5px] text-clay-700 mt-1.5">Loosen the filter or browse all resources.</div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Providers" title="Who's behind the resources." />
        <div className="grid md:grid-cols-3 gap-3">
          {providers.map((p) => (
            <div key={p.id} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4">
              <div className="font-heading text-[15px]">{p.name}</div>
              <div className="num-mono text-[10.5px] text-clay-700 mt-1">
                {p.type} · {p.courses} resources
              </div>
              <div className="mt-3 num-mono text-[11px] text-clay-700 inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-amber-500" fill="currentColor" aria-hidden="true" />
                {p.rating}
              </div>
            </div>
          ))}
          {!providers.length ? (
            <div className="text-sm text-clay-700">No providers listed yet.</div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Affiliates · partner picks"
          title="Disclosed. You always know who pays whom."
          sub="We earn a small, disclosed cut on these. Surfaced because they fit — never because of the commission."
        />
        <div className="grid md:grid-cols-3 gap-3">
          {affiliates.map((a) => (
            <Link
              to={`/app/marketplace/${a.id}`}
              key={a.id}
              className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4 block hover:border-[#A68057]"
              data-testid={`affiliate-${a.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-heading text-[15px]">{a.name}</div>
                <Pill tone="amber">Affiliate</Pill>
              </div>
              <div className="num-mono text-[10.5px] text-clay-700 mt-1">
                {a.provider || a.type}
              </div>
              {a.disclosure ? (
                <div className="mt-2 text-[12px] text-clay-700">
                  {a.disclosure}
                </div>
              ) : null}
              <div className="mt-2 text-[12.5px] text-clay-800">
                Commission: <span className="font-semibold">{a.commission}</span>
              </div>
            </Link>
          ))}
          {!affiliates.length ? (
            <div className="text-sm text-clay-700">No affiliate partners listed yet.</div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="The rules · stated plainly"
          title="What you'll never see on Career Copilot."
          sub="The marketplace exists to fund the platform. It does not exist to manipulate you."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {REFUND_RULES.map((r) => (
            <div key={r.k} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4">
              <div className="num-mono text-[11px] text-[#A68057]">{r.k}</div>
              <div className="font-heading text-[15px] mt-1.5">{r.t}</div>
              <div className="text-[12px] text-clay-700 mt-1.5 leading-snug">{r.b}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
