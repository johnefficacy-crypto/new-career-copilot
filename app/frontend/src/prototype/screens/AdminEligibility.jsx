import React, { useState } from "react";
import {
  Card, ConfidencePill, Drawer, Eyebrow, FooterStrip, PageHeader, Pill,
  PrototypePage, SectionHeader, Tabs, TrustStamp,
} from "../ui";

const AE_TABS = [
  { value: "overview", label: "Overview" },
  { value: "recruits", label: "Recruitments", badge: 14 },
  { value: "queue", label: "Criteria queue", badge: 9 },
  { value: "sources", label: "Sources" },
  { value: "impact", label: "Match impact" },
];

const AE_DATA = {
  overview: { openRecruitments: 14, criteriaVerified: 86, unverified: 9, affectedAspirants: 12480, lowConfidence: 4, recompute: "Today · 04:48" },
  recruits: [
    { name: "UPSC CSE 2026", family: "Civil Services", deadline: "Jun 11", verified: 6, total: 6, status: "verified", source: "upsc.gov.in", lastReviewed: "May 12" },
    { name: "SSC CGL 2026", family: "SSC", deadline: "May 28", verified: 4, total: 4, status: "verified", source: "ssc.nic.in", lastReviewed: "May 09" },
    { name: "RBI Grade B 2026", family: "Banking", deadline: "Jun 04", verified: 5, total: 5, status: "verified", source: "rbi.org.in", lastReviewed: "May 11" },
    { name: "IBPS PO 2026", family: "Banking", deadline: "Jun 09", verified: 4, total: 4, status: "verified", source: "ibps.in", lastReviewed: "May 07" },
    { name: "SBI PO 2026", family: "Banking", deadline: "Jun 02", verified: 3, total: 3, status: "verified", source: "sbi.co.in", lastReviewed: "May 05" },
    { name: "BARC OCES 2026", family: "Defense", deadline: "Jun 25", verified: 2, total: 4, status: "partial", source: "barc.gov.in", lastReviewed: "never", note: "GATE-pathway criterion freshly scraped" },
    { name: "ISRO Scientist 2026", family: "Defense", deadline: "Jul 02", verified: 5, total: 5, status: "verified", source: "isro.gov.in", lastReviewed: "May 08" },
    { name: "UPPSC 2026", family: "State PSC", deadline: "Jun 18", verified: 4, total: 5, status: "partial", source: "uppsc.up.nic.in", lastReviewed: "May 10", note: "discipline mapping pending" },
    { name: "BPSC 67th 2026", family: "State PSC", deadline: "Jun 14", verified: 5, total: 5, status: "verified", source: "bpsc.bih.nic.in", lastReviewed: "May 06" },
    { name: "Indian Forest 2026", family: "Civil Services", deadline: "Jun 11", verified: 3, total: 4, status: "partial", source: "upsc.gov.in", lastReviewed: "May 09", note: "engineering-discipline mapping" },
    { name: "AFCAT 02/2026", family: "Defense", deadline: "Jun 30", verified: 5, total: 5, status: "verified", source: "afcat.cdac.in", lastReviewed: "May 04" },
    { name: "NDA 2026·1", family: "Defense", deadline: "closed", verified: 4, total: 4, status: "closed", source: "upsc.gov.in", lastReviewed: "Mar 22" },
    { name: "MPSC 2026", family: "State PSC", deadline: "Jul 14", verified: 0, total: 5, status: "pending", source: "mpsc.gov.in", lastReviewed: "never" },
    { name: "RRB NTPC 2026", family: "Banking", deadline: "Jul 02", verified: 0, total: 4, status: "pending", source: "rrbcdg.gov.in", lastReviewed: "never" },
  ],
  queue: [
    { id: "c1", recruit: "BARC OCES 2026", facet: "GATE pathway", scraped: "GATE CS/EE 2023/24 acceptable as primary shortlist (Engg cadres)", conf: 0.74, source: "barc.gov.in/notif-2026.pdf §4.2", affected: 1820, status: "pending" },
    { id: "c2", recruit: "UPPSC 2026", facet: "Education discipline", scraped: "Any Bachelor's degree from a recognized university acceptable for PCS", conf: 0.92, source: "uppsc.up.nic.in/notification §III(b)", affected: 9410, status: "pending" },
    { id: "c3", recruit: "Indian Forest 2026", facet: "Engineering discipline mapping", scraped: 'CSE not explicitly listed; B.E./B.Tech with Computer Science under "Engineering"', conf: 0.58, source: "upsc.gov.in/ifos-2026.pdf §VI", affected: 540, status: "pending" },
    { id: "c4", recruit: "MPSC 2026", facet: "Age relaxation matrix", scraped: "Backwards classes +3y; Maharashtra govt servants +5y (max 43)", conf: 0.88, source: "mpsc.gov.in/notification §2.1", affected: 2210, status: "pending" },
    { id: "c5", recruit: "MPSC 2026", facet: "Domicile", scraped: "Maharashtra domicile mandatory for posts marked (R); non-domicile for general", conf: 0.91, source: "mpsc.gov.in/notification §3", affected: 2210, status: "pending" },
    { id: "c6", recruit: "RRB NTPC 2026", facet: "Attempt limits", scraped: "No defined upper attempt limit; age-only constraint", conf: 0.69, source: "rrbcdg.gov.in/notif §5.3", affected: 3650, status: "pending" },
    { id: "c7", recruit: "RRB NTPC 2026", facet: "Education requirement", scraped: "Graduate / 12th-pass split by post group; ambiguity on group 'C'", conf: 0.55, source: "rrbcdg.gov.in/notif §2", affected: 3650, status: "pending" },
    { id: "c8", recruit: "UPPSC 2026", facet: "Domicile benefit", scraped: "UP-domicile candidates receive +5 marks in interview; reservation in state quota", conf: 0.82, source: "uppsc.up.nic.in §IV", affected: 9410, status: "pending" },
    { id: "c9", recruit: "BARC OCES 2026", facet: "Attempts", scraped: "No restriction; age cap controls eligibility", conf: 0.85, source: "barc.gov.in/notif-2026.pdf §4.5", affected: 1820, status: "pending" },
  ],
  sources: [
    { name: "upsc.gov.in", last: "4m ago", health: "green", freq: "every 15m", items: 42, kind: "official" },
    { name: "ssc.nic.in", last: "7m ago", health: "green", freq: "every 15m", items: 18, kind: "official" },
    { name: "rbi.org.in", last: "3m ago", health: "green", freq: "every 15m", items: 14, kind: "official" },
    { name: "ibps.in", last: "6m ago", health: "green", freq: "every 15m", items: 9, kind: "official" },
    { name: "barc.gov.in", last: "18m ago", health: "amber", freq: "every 30m", items: 4, kind: "official", warn: "PDF parse: 1 page failed" },
    { name: "uppsc.up.nic.in", last: "22m ago", health: "green", freq: "every 30m", items: 8, kind: "official" },
    { name: "mpsc.gov.in", last: "68m ago", health: "amber", freq: "every 60m", items: 11, kind: "official", warn: "slow response" },
    { name: "isro.gov.in", last: "12m ago", health: "green", freq: "every 30m", items: 6, kind: "official" },
    { name: "examstudy.in", last: "5m ago", health: "green", freq: "every 15m", items: 36, kind: "aggregator", note: "never auto-applies" },
    { name: "careerwala", last: "9m ago", health: "green", freq: "every 15m", items: 24, kind: "aggregator", note: "discovery only" },
  ],
};

function KPIE({ k, v, tone, sub }) {
  const tones = { ink: "#2E2218", amber: "#6F5A22", sage: "#33482F", rose: "#7A3925" };
  return (
    <div className="soft-card grain relative px-4 py-3.5">
      <Eyebrow>{k}</Eyebrow>
      <div className="font-serif text-[26px] mt-1.5 leading-none" style={{ color: tones[tone] || "#2E2218" }}>{v}</div>
      <div className="text-[11px] text-clay-700 mt-2">{sub}</div>
    </div>
  );
}

function EvidenceDrawer({ open, onClose, title, items }) {
  return (
    <Drawer open={open} onClose={onClose} title={title || "Evidence"}>
      <div className="space-y-3">
        {(items || []).map((e, i) => (
          <div key={i} className="rounded-xl border border-[#E7DECB] bg-white/60 p-4">
            <div className="flex items-center justify-between">
              <div className="num-mono text-[10.5px] text-clay-700">{e.kind} · {e.id}</div>
              <TrustStamp kind={e.trust || "verified"} />
            </div>
            <div className="text-[13px] mt-1.5">{e.text}</div>
            {e.source ? <div className="num-mono text-[10.5px] text-clay-700 mt-2">source: {e.source}</div> : null}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function AEOverview() {
  const o = AE_DATA.overview;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPIE k="Open recruitments" v={o.openRecruitments} tone="ink" sub="indexed" />
        <KPIE k="Criteria verified" v={`${o.criteriaVerified}%`} tone="sage" sub="all open recruitments" />
        <KPIE k="Unverified criteria" v={o.unverified} tone="amber" sub="in review queue" />
        <KPIE k="Affected aspirants" v={o.affectedAspirants.toLocaleString()} tone="ink" sub="across queue" />
        <KPIE k="Low-confidence" v={o.lowConfidence} tone="rose" sub="conf < 65%" />
        <KPIE k="Last re-match" v={o.recompute.split("· ")[1]} tone="sage" sub="engine ran" />
      </div>
      <div className="grid lg:grid-cols-[1fr_420px] gap-6">
        <Card>
          <SectionHeader eyebrow="Today" title="What needs your attention." />
          <ul className="space-y-2.5">
            {[
              { sev: "high", t: "4 criteria below 65% confidence — affects 4,190 aspirants", cta: "Open queue" },
              { sev: "med", t: "MPSC 2026 has 0 of 5 criteria verified — newly scraped", cta: "Open MPSC" },
              { sev: "med", t: "BARC GATE-pathway criterion blocking 1,820 BARC matches", cta: "Open BARC" },
              { sev: "low", t: "barc.gov.in scrape failed page 4/12 of notification PDF", cta: "Open scraper" },
            ].map((r, i) => (
              <li key={i} className="grid grid-cols-[10px_1fr_120px] gap-3 items-center text-[12.5px] py-2 border-b border-[#EFE7D4] last:border-0">
                <span className={`sdot ${r.sev === "high" ? "sdot-not" : r.sev === "med" ? "sdot-partial" : "sdot-preview"}`} />
                <span>{r.t}</span>
                <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">{r.cta} →</button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionHeader eyebrow="Last 7 days" title="Verification velocity." />
          <ul className="space-y-2.5 text-[12.5px]">
            {[
              { k: "Criteria verified", v: "+38", n: "avg conf 0.86" },
              { k: "Re-scrapes triggered", v: "12", n: "4 sources" },
              { k: "Verdict flips", v: "+24 elig · −6 not", n: "net positive" },
              { k: "Aspirants newly matched", v: "212", n: "across exams" },
            ].map((r, i) => (
              <li key={i} className="flex items-center justify-between border-b border-[#EFE7D4] py-2 last:border-0">
                <span>{r.k}</span>
                <span className="text-right">
                  <div className="num-mono">{r.v}</div>
                  <div className="num-mono text-[10.5px] text-clay-700">{r.n}</div>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function AERecruitments({ onOpenSource }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>Recruitments · 14 indexed</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">Per-recruitment criteria state.</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Pill tone="sage">{AE_DATA.recruits.filter((r) => r.status === "verified").length} verified</Pill>
          <Pill tone="amber">{AE_DATA.recruits.filter((r) => r.status === "partial").length} partial</Pill>
          <Pill tone="outline">{AE_DATA.recruits.filter((r) => r.status === "pending").length} pending</Pill>
          <Pill tone="outline">{AE_DATA.recruits.filter((r) => r.status === "closed").length} closed</Pill>
        </div>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Recruitment</th><th>Family</th><th>Deadline</th><th>Criteria verified</th><th>Source</th><th>Last reviewed</th><th>Status</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {AE_DATA.recruits.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="font-medium text-clay-900">{r.name}</div>
                  {r.note ? <div className="text-[11px] text-[#7A3925] mt-1">⚠ {r.note}</div> : null}
                </td>
                <td className="text-clay-700">{r.family}</td>
                <td className="num-mono">{r.deadline}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden" style={{ width: 80 }}>
                      <div className="h-full" style={{ width: `${(r.verified / r.total) * 100}%`, background: r.verified === r.total ? "#54794E" : "#A68057" }} />
                    </div>
                    <span className="num-mono text-[11px]">{r.verified}/{r.total}</span>
                  </div>
                </td>
                <td><span className="num-mono text-[11px]">{r.source}</span></td>
                <td className="num-mono text-clay-700">{r.lastReviewed}</td>
                <td>
                  {r.status === "verified" ? <TrustStamp kind="verified" /> : null}
                  {r.status === "partial" ? <TrustStamp kind="preview" label="Partial" /> : null}
                  {r.status === "pending" ? <TrustStamp kind="needs" label="Pending" /> : null}
                  {r.status === "closed" ? <TrustStamp kind="notcon" label="Closed" /> : null}
                </td>
                <td className="right">
                  <button onClick={() => onOpenSource(r)} className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold whitespace-nowrap">Open →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AECriteriaQueue({ onOpenEvidence }) {
  const [rows, setRows] = useState(AE_DATA.queue);
  function act(id, status) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  }
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>Criteria queue</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">{rows.filter((r) => r.status === "pending").length} pending decisions.</h2>
          <p className="text-[12px] text-clay-700 mt-1">Each criterion controls verdicts for thousands of aspirants. Verifying a criterion re-runs the eligibility engine for affected users.</p>
        </div>
        <div className="flex gap-2">
          <Pill tone="outline">All recruitments</Pill>
          <Pill tone="outline">Conf &lt; 75%</Pill>
        </div>
      </div>
      <div className="px-2 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Recruitment</th><th>Facet</th><th>Scraped text</th><th>Confidence</th><th>Affects</th><th>Status</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.recruit}</td>
                <td><Pill tone="dusk">{r.facet}</Pill></td>
                <td>
                  <div className="text-[#3a2e22] text-[12.5px] max-w-[420px]">{r.scraped}</div>
                  <div className="num-mono text-[10.5px] text-clay-700 mt-1">{r.source}</div>
                </td>
                <td><ConfidencePill value={r.conf} /></td>
                <td className="num-mono">{r.affected.toLocaleString()}</td>
                <td>
                  {r.status === "pending" ? <TrustStamp kind="needs" /> : null}
                  {r.status === "verified" ? <TrustStamp kind="verified" /> : null}
                  {r.status === "rejected" ? <TrustStamp kind="notcon" label="Rejected" /> : null}
                  {r.status === "correction" ? <TrustStamp kind="preview" label="Needs correction" /> : null}
                </td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end flex-wrap">
                    <button onClick={() => onOpenEvidence(r)} className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold whitespace-nowrap">Evidence</button>
                    <button onClick={() => act(r.id, "verified")} className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold whitespace-nowrap">Verify</button>
                    <button onClick={() => act(r.id, "correction")} className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-clay-700 font-semibold whitespace-nowrap">Re-scrape</button>
                    <button onClick={() => act(r.id, "rejected")} className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold whitespace-nowrap">Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SourceRow({ s }) {
  return (
    <li className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] px-3.5 py-3 flex items-center gap-3">
      <span className={`sdot ${s.health === "green" ? "sdot-live" : s.health === "amber" ? "sdot-partial" : "sdot-not"}`} />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[13px]">{s.name}</div>
        <div className="num-mono text-[10.5px] text-clay-700">{s.freq} · last {s.last} · {s.items} items</div>
        {s.warn ? <div className="text-[10.5px] text-[#7A3925] mt-0.5">⚠ {s.warn}</div> : null}
        {s.note ? <div className="text-[10.5px] text-[#524864] mt-0.5">· {s.note}</div> : null}
      </div>
      <button className="text-[10.5px] px-2 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold whitespace-nowrap">Force scrape</button>
    </li>
  );
}

function AESources() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Sources</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Where eligibility criteria come from.</h2>
        <p className="text-[12px] text-clay-700 mt-1">Official sources can flow to verdicts after review. Aggregator sources are discovery only — never auto-promote.</p>
      </div>
      <div className="px-7 pb-6 grid lg:grid-cols-2 gap-5">
        <div>
          <div className="mb-3"><TrustStamp kind="official" /></div>
          <ul className="space-y-2.5">
            {AE_DATA.sources.filter((s) => s.kind === "official").map((s, i) => <SourceRow key={i} s={s} />)}
          </ul>
        </div>
        <div>
          <div className="mb-3"><TrustStamp kind="aggregator" /></div>
          <ul className="space-y-2.5">
            {AE_DATA.sources.filter((s) => s.kind === "aggregator").map((s, i) => <SourceRow key={i} s={s} />)}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function AEMatchImpact() {
  return (
    <Card>
      <SectionHeader
        eyebrow="Match impact · simulate before commit"
        title="Pick a criterion to preview verdict shifts."
        sub="Verifying a criterion re-runs eligibility for every aspirant whose profile interacts with it. Preview before you commit."
        right={
          <div className="flex gap-2">
            <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Commit verification</button>
            <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Discard</button>
          </div>
        }
      />
      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <div>
          <Eyebrow>Selected criterion</Eyebrow>
          <div className="rounded-xl border border-[#2E2218] bg-[#FBF6EF] p-3 mt-2">
            <div className="num-mono text-[10.5px] text-clay-700">BARC OCES 2026</div>
            <div className="font-serif text-[15px] mt-0.5">GATE pathway accepted</div>
            <div className="text-[11.5px] text-[#3a2e22] mt-2">GATE CS/EE 2023/24 scores accepted as primary shortlist (Engg cadres).</div>
            <div className="mt-2"><ConfidencePill value={0.74} /></div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4">
            <Eyebrow>Before · current verdicts</Eyebrow>
            <ul className="mt-2.5 space-y-1.5 text-[12.5px]">
              <li className="flex justify-between"><span>Eligible</span><span className="num-mono">412</span></li>
              <li className="flex justify-between"><span>Conditional</span><span className="num-mono">1,820</span></li>
              <li className="flex justify-between"><span>Not eligible</span><span className="num-mono">68</span></li>
              <li className="flex justify-between text-clay-700 text-[11px]"><span>(others · no GATE)</span><span className="num-mono">—</span></li>
            </ul>
          </div>
          <div className="rounded-xl border border-[#B9CFAF] bg-[#F0F5EF] p-4">
            <Eyebrow>After · if you verify</Eyebrow>
            <ul className="mt-2.5 space-y-1.5 text-[12.5px] text-[#33482F]">
              <li className="flex justify-between"><span>Eligible</span><span className="num-mono">2,134 <span className="text-[10.5px] opacity-70">(+1,722)</span></span></li>
              <li className="flex justify-between"><span>Conditional</span><span className="num-mono">98 <span className="text-[10.5px] opacity-70">(−1,722)</span></span></li>
              <li className="flex justify-between"><span>Not eligible</span><span className="num-mono">68 <span className="text-[10.5px] opacity-70">(=)</span></span></li>
              <li className="flex justify-between text-[10.5px] opacity-80"><span>notif. emails dispatched</span><span className="num-mono">~1,722</span></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="rule mt-6 pt-4">
        <Eyebrow>Risk preview</Eyebrow>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-[#3a2e22]">
          <li>· 1,722 aspirants will see verdict flip <strong>conditional → eligible</strong>.</li>
          <li>· No verdicts flip in the wrong direction.</li>
          <li>· Email notifications follow the user's preferences. Notifications are batched (max 1/day per aspirant).</li>
          <li>· If you reject instead, current conditional verdicts stay conditional — no plan damage.</li>
        </ul>
      </div>
    </Card>
  );
}

export default function PrototypeAdminEligibility() {
  const [tab, setTab] = useState("overview");
  const [drawer, setDrawer] = useState(null);
  return (
    <PrototypePage label="Admin · Eligibility verification">
      <div className="px-10 pt-9">
        <PageHeader
          eyebrow="Admin · Eligibility verification"
          title="Verify what every aspirant's verdict depends on."
          sub="Scraped criteria sit here until you review them. Until verified, downstream verdicts are marked conditional — never silently 'eligible'."
          right={
            <div className="flex gap-2 items-center flex-wrap justify-end shrink-0">
              <span className="num-mono text-[10.5px] text-clay-700 whitespace-nowrap">admin@ccp</span>
              <Pill tone="ink" className="whitespace-nowrap">RBAC · eligibility-curator</Pill>
            </div>
          }
        />
      </div>
      <div className="px-10">
        <Tabs value={tab} onChange={setTab} options={AE_TABS} />
        <div className="mt-6 space-y-6">
          {tab === "overview" ? <AEOverview /> : null}
          {tab === "recruits" ? <AERecruitments onOpenSource={(r) => setDrawer({ kind: "source", row: r })} /> : null}
          {tab === "queue" ? <AECriteriaQueue onOpenEvidence={(r) => setDrawer({ kind: "evidence", row: r })} /> : null}
          {tab === "sources" ? <AESources /> : null}
          {tab === "impact" ? <AEMatchImpact /> : null}
        </div>
      </div>
      {drawer && drawer.kind === "evidence" ? (
        <EvidenceDrawer
          open
          onClose={() => setDrawer(null)}
          title={`Evidence · ${drawer.row.facet}`}
          items={[
            { kind: "Source · official", id: drawer.row.recruit, text: drawer.row.scraped, source: drawer.row.source, trust: "verified" },
            { kind: "Coverage model", id: "model.0.6", text: `Pattern matched 4 sibling recruitments · ${Math.round(drawer.row.conf * 100)}% confidence`, source: "internal", trust: "research" },
            { kind: "Aggregator corroboration", id: "agg.118", text: "Mentioned by 3 of 5 coaching websites; consistent with scrape", source: "various", trust: "aggregator" },
          ]}
        />
      ) : null}
      {drawer && drawer.kind === "source" ? (
        <Drawer open onClose={() => setDrawer(null)} title={drawer.row.name}>
          <div className="space-y-3">
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-4">
              <Eyebrow>Source</Eyebrow>
              <div className="num-mono text-[12px] mt-1">{drawer.row.source}</div>
              <div className="num-mono text-[10.5px] text-clay-700 mt-1">{drawer.row.deadline} · {drawer.row.family}</div>
            </div>
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-4">
              <Eyebrow>Verified facets</Eyebrow>
              <div className="text-[15px] font-serif mt-1">{drawer.row.verified} / {drawer.row.total}</div>
              {drawer.row.note ? <div className="text-[11.5px] text-[#7A3925] mt-2">⚠ {drawer.row.note}</div> : null}
            </div>
            <div className="flex gap-2">
              <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Open all criteria</button>
              <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Trigger re-scrape</button>
            </div>
          </div>
        </Drawer>
      ) : null}
      <FooterStrip />
    </PrototypePage>
  );
}
