import React, { useEffect, useState } from "react";
import "./VerificationGatewayConsole.css";

// Recruitment Verification Gateway — Admin Console.
//
// 1:1 React port of
//   docs/engineering/scraping-eligibility/recruitment_verification_admin_console.html
// All markup, copy, and structure mirror that file. CSS lives in
// VerificationGatewayConsole.css scoped under .vgc-root.
//
// The page renders six screens (setup / review / report / bulk / batch
// / drawer) and an override modal. Screen state is local React state;
// no data fetching yet — every value matches the demo HTML so the
// visual replication is exact. Wiring to verificationReportsService
// happens incrementally; the visual contract is what this page locks.

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";

function useGoogleFonts() {
  useEffect(() => {
    // Only inject once. The fonts are used solely on this page; this
    // keeps the rest of the admin app's font stack untouched.
    if (document.querySelector(`link[data-vgc-fonts]`)) return undefined;
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    preconnect1.setAttribute("data-vgc-fonts", "preconnect1");
    document.head.appendChild(preconnect1);
    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "";
    preconnect2.setAttribute("data-vgc-fonts", "preconnect2");
    document.head.appendChild(preconnect2);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_HREF;
    link.setAttribute("data-vgc-fonts", "stylesheet");
    document.head.appendChild(link);
    return () => {
      // Leave the fonts in place on unmount — the same page may
      // remount and re-fetching is wasteful. Other pages cope with
      // an extra <link> in <head>.
    };
  }, []);
}

export default function VerificationGatewayConsole() {
  useGoogleFonts();
  const [screen, setScreen] = useState("review");
  const [overrideOpen, setOverrideOpen] = useState(false);

  const openOverride = () => setOverrideOpen(true);
  const closeOverride = () => setOverrideOpen(false);

  return (
    <div className="vgc-root">
      <Masthead />
      <ModeBar screen={screen} setScreen={setScreen} openOverride={openOverride} />
      <SetupScreen active={screen === "setup"} />
      <ReviewScreen active={screen === "review"} />
      <ReportScreen active={screen === "report"} openOverride={openOverride} />
      <BulkScreen active={screen === "bulk"} />
      <BatchScreen active={screen === "batch"} />
      <DrawerScreen active={screen === "drawer"} />
      <OverrideModal open={overrideOpen} onClose={closeOverride} />
    </div>
  );
}

// ── MASTHEAD ──────────────────────────────────────────────────────────

function Masthead() {
  return (
    <header className="masthead">
      <div>
        <div className="deck">Recruitment Verification Gateway</div>
        <h1>Operations Console</h1>
      </div>
      <div />
      <div className="admin-meta">
        <div><strong>kavya.iyer</strong> · super_admin</div>
        <div>last sync 14:22:08 · sat 16 may 2026</div>
      </div>
    </header>
  );
}

// ── MODE BAR ──────────────────────────────────────────────────────────

function ModeBar({ screen, setScreen, openOverride }) {
  return (
    <nav className="modebar">
      <button
        className={`mode-pill ${screen === "setup" ? "active" : ""}`}
        onClick={() => setScreen("setup")}
      >
        Setup &amp; Run
      </button>
      <button
        className={`mode-pill ${screen === "review" ? "active" : ""}`}
        onClick={() => setScreen("review")}
      >
        Review &amp; Publish <span className="count">38</span>
      </button>
      <div className="demo-screens">
        <span className="label">Demo screens</span>
        <button
          className={screen === "report" ? "active" : ""}
          onClick={() => setScreen("report")}
        >
          Report detail
        </button>
        <button
          className={screen === "bulk" ? "active" : ""}
          onClick={() => setScreen("bulk")}
        >
          Bulk preview
        </button>
        <button
          className={screen === "batch" ? "active" : ""}
          onClick={() => setScreen("batch")}
        >
          Batch alert
        </button>
        <button
          className={screen === "drawer" ? "active" : ""}
          onClick={() => setScreen("drawer")}
        >
          Workflow drawer
        </button>
        <button onClick={openOverride}>Override modal</button>
      </div>
    </nav>
  );
}

// ── SETUP & RUN ───────────────────────────────────────────────────────

function SetupScreen({ active }) {
  return (
    <section className={`screen ${active ? "active" : ""}`} id="screen-setup">
      <div className="section-header">
        <h2>Setup &amp; Run</h2>
        <div className="meta">52 sources · 4 active runs · last hour</div>
      </div>

      <div className="grid-2 mb-3">
        <div className="card">
          <div className="card-header">
            <h3>Source</h3>
            <span className="badge resolved">trusted</span>
          </div>
          <div className="card-body stack">
            <div className="form-row">
              <label>Source</label>
              <select defaultValue="UPSC official · upsc.gov.in">
                <option>UPSC official · upsc.gov.in</option>
                <option>SSC official · ssc.nic.in</option>
                <option>IBPS official · ibps.in</option>
                <option>Sarkari Result · aggregator</option>
              </select>
            </div>
            <div className="row">
              <span className="tinylabel">trust</span>
              <span className="badge resolved">verified</span>
              <span className="tinylabel" style={{ marginLeft: 16 }}>aggregator policy</span>
              <span className="badge plain">discovery only</span>
            </div>
            <div className="tn">
              Aggregator data may be used to discover candidates but cannot become canonical truth. Tier A
              requires official source resolution.
            </div>
          </div>
          <div className="card-footer">
            <button className="btn ghost small">View source registry →</button>
            <button className="btn primary small">Run live scrape</button>
            <button className="btn small">Dry scrape</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Last run</h3>
            <span className="tn">run_8f3a · 14:08:42 IST</span>
          </div>
          <div className="card-body">
            <div className="report-grid" style={{ gap: 10, marginBottom: 12 }}>
              <div className="report-field">
                <div className="rf-label">extracted</div>
                <div className="rf-value"><span className="strong">142</span> recruitments</div>
              </div>
              <div className="report-field">
                <div className="rf-label">classified</div>
                <div className="rf-value"><span className="strong">142</span></div>
                <div className="rf-sub">A: 38 · B: 71 · C: 33</div>
              </div>
              <div className="report-field">
                <div className="rf-label">reports created</div>
                <div className="rf-value"><span className="strong">109</span></div>
                <div className="rf-sub">33 noop (hash match)</div>
              </div>
              <div className="report-field">
                <div className="rf-label">duration</div>
                <div className="rf-value"><span className="strong">3m 14s</span></div>
                <div className="rf-sub">avg 1.36s / item</div>
              </div>
            </div>
            <div className="tn">
              Resolver, consensus, and complexity stages run inline in sync mode (
              <code style={{ fontFamily: "var(--font-mono)" }}>GATEWAY_EXECUTION_MODE = "sync"</code>).
            </div>
          </div>
          <div className="card-footer">
            <button className="btn ghost small">Open run detail</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Recent runs</h3>
          <div className="row">
            <button className="btn ghost small">Last 24h</button>
            <button className="btn ghost small">All sources</button>
          </div>
        </div>
        <table className="run-table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Run / source</th>
              <th>Tier split</th>
              <th>Extracted</th>
              <th>Reports</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <RunRow
              title="UPSC official"
              sub="run_8f3a · 14:08"
              tier={<span className="badge tier-a">A · 38</span>}
              extracted="142"
              reports="109 created · 33 noop"
              status={<span className="badge resolved">complete</span>}
            />
            <RunRow
              title="SSC official"
              sub="run_8f39 · 13:55"
              tier={<span className="badge tier-a">A · 24</span>}
              extracted="87"
              reports="62 created · 25 noop"
              status={<span className="badge resolved">complete</span>}
            />
            <RunRow
              title="IIT Madras careers"
              sub="run_8f38 · 13:42"
              tier={
                <>
                  <span className="badge tier-b">B · 12</span>{" "}
                  <span className="badge tier-c">C · 4</span>
                </>
              }
              extracted="16"
              reports="16 created"
              status={<span className="badge pending">resolver retry</span>}
            />
            <RunRow
              title="Sarkari Result"
              sub="run_8f37 · 13:18 · aggregator"
              tier={
                <>
                  <span className="badge tier-a">A · 19</span>{" "}
                  <span className="badge tier-b">B · 8</span>{" "}
                  <span className="badge tier-c">C · 22</span>
                </>
              }
              extracted="49"
              reports="discovery only"
              status={<span className="badge info">discovery</span>}
            />
            <RunRow
              title="Defence Recruitment"
              sub="run_8f36 · 12:55"
              tier={<span className="badge tier-a">A · 7</span>}
              extracted="7"
              reports="7 created"
              status={<span className="badge blocker">3 unresolved</span>}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunRow({ title, sub, tier, extracted, reports, status }) {
  return (
    <tr>
      <td>
        <div className="row-title">{title}</div>
        <div className="row-sub">{sub}</div>
      </td>
      <td>{tier}</td>
      <td>{extracted}</td>
      <td>{reports}</td>
      <td>{status}</td>
      <td><button className="btn ghost small">→</button></td>
    </tr>
  );
}

// ── REVIEW & PUBLISH (DEFAULT) ────────────────────────────────────────

function ReviewScreen({ active }) {
  return (
    <section className={`screen ${active ? "active" : ""}`} id="screen-review">
      <div className="section-header">
        <h2>Review &amp; Publish</h2>
        <div className="meta">38 active reports · 12 blockers · 3 conflicts</div>
      </div>

      <div className="review-layout">
        <aside className="queue-list">
          <div className="queue-filter">
            <button className="active">all</button>
            <button>tier a</button>
            <button>tier b</button>
            <button>tier c</button>
            <button>blockers</button>
            <button>conflicts</button>
            <button>stale</button>
          </div>

          <QueueItem
            tier="A" tierClass="tier-a"
            badge={<span className="badge resolved">official resolved</span>}
            title="UPSC Civil Services Examination 2026 — Notification"
            org="upsc · notif 05/2026"
            action="→ promote eligible"
          />
          <QueueItem
            selected
            tier="A" tierClass="tier-a"
            badge={<span className="badge pending">suggested proof</span>}
            title="SSC Combined Higher Secondary Level 2026 (10+2)"
            org="ssc · notif chsl-2026"
            action="→ confirm suggested proof"
          />
          <QueueItem
            tier="A" tierClass="tier-a"
            badge={<span className="badge blocker">conflict</span>}
            title="IBPS PO/MT Recruitment 2026 — CRP PO/MT-XV"
            org="ibps · crp-po-mt-xv"
            action="→ resolve conflict"
          />
          <QueueItem
            tier="A" tierClass="tier-a"
            badge={<span className="badge blocker">unresolved</span>}
            title="RBI Grade B Officer — DR (General) 2026"
            org="rbi · grade-b-2026"
            action="→ await official proof"
          />
          <QueueItem
            tier="B" tierClass="tier-b"
            badge={<span className="badge blocker">publish blocker</span>}
            title="IIT Madras — Assistant Professor (GATE-based, Domicile relaxation)"
            org="iitm · ap-2026-15"
            action="→ block publish: missing GATE rule"
          />
          <QueueItem
            tier="B" tierClass="tier-b"
            badge={<span className="badge resolved">official resolved</span>}
            title="NTPC Engineer Trainee 2026 (Mechanical, Electrical, Civil)"
            org="ntpc · et-2026"
            action="→ promote eligible"
          />
          <QueueItem
            tier="A" tierClass="tier-a"
            badge={<span className="badge pending">stale source</span>}
            title="Railways NTPC CEN-01/2026 — Corrigendum 2"
            org="rrb · cen-01-2026"
            action="→ await corrigendum"
          />
          <QueueItem
            tier="C" tierClass="tier-c"
            badge={<span className="badge resolved">classified</span>}
            title="Pune Municipal Corp · Junior Engineer (Civil) · 12 posts"
            org="pmc · je-civ-2026"
            action="→ promote eligible"
          />
          <QueueItem
            tier="B" tierClass="tier-b"
            badge={<span className="badge neutral">consensus pending</span>}
            title="ISRO Scientist/Engineer SC — Electronics, Mechanical, CS"
            org="isro · ese-sc-2026"
            action="→ request admin review"
          />
          <QueueItem
            tier="A" tierClass="tier-a"
            badge={<span className="badge plain">backfilled</span>}
            title="Maharashtra PSC State Service 2025 (backfill)"
            org="mpsc · sse-2025"
            action="→ request admin review"
          />
        </aside>

        <ReportPaneSuggested />
      </div>
    </section>
  );
}

function QueueItem({ tier, tierClass, badge, title, org, action, selected }) {
  return (
    <div className={`queue-item${selected ? " selected" : ""}`}>
      <div className="qi-top">
        <span className={`badge ${tierClass}`}>{tier}</span>
        {badge}
      </div>
      <div className="qi-title">{title}</div>
      <div className="qi-org">{org}</div>
      <div className="qi-action">{action}</div>
    </div>
  );
}

function ReportPaneSuggested() {
  return (
    <div className="report-pane">
      <div className="report-head">
        <div>
          <h2>SSC Combined Higher Secondary Level 2026 (10+2)</h2>
          <div className="head-meta">
            <span>report_id <strong>rpt_4e29a1</strong></span>
            <span>chain_root <strong>rpt_4e29a1</strong></span>
            <span>v<strong>2</strong></span>
            <span>created 13:55</span>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge tier-a">A high stakes</span>
            <span className="badge plain">exam_family ssc</span>
            <span className="badge pending">classified</span>
            <span className="badge resolved">fresh</span>
          </div>
        </div>
        <div className="head-actions">
          <button className="btn ghost small">Reject</button>
          <button className="btn small">Re-run resolver</button>
        </div>
      </div>

      <div className="current-action">
        <div>
          <div className="ca-label">Current blocker · 1 of 1</div>
          <h3>Confirm suggested official proof</h3>
          <p>
            Resolver found a likely official notification page via source-registry crawl. Confidence
            0.78 — falls between auto-resolve (0.85) and manual (0.60).
          </p>
        </div>
        <div>
          <button className="btn primary">Confirm proof</button>
        </div>
      </div>

      <div className="proof-card suggested mb-3">
        <div className="pc-title">
          <h4>Official Proof</h4>
          <span className="badge pending">suggested</span>
        </div>
        <div className="pc-meta">
          <div>method · source_registry · career_crawl</div>
          <div>confidence · 0.78</div>
          <div>host · ssc.nic.in</div>
        </div>
        <div className="pc-evidence">
          https://ssc.nic.in/SSCFileServer/PortalManagement/UploadedFiles/Notice_CHSL_2026_01.pdf
        </div>
        <div className="row">
          <button className="btn primary small">Confirm proof</button>
          <button className="btn small">View evidence</button>
          <button className="btn ghost small">Attach different URL</button>
        </div>
      </div>

      <div className="report-grid">
        <ReportField
          label="notification number"
          badge={<span className="badge resolved">verified</span>}
          value="CHSL-2026/01"
          sub="2 sources agree · ssc.nic.in, careers.sarkariresult.com"
        />
        <ReportField
          label="apply window"
          badge={<span className="badge resolved">verified</span>}
          value="28 May 2026 → 26 Jun 2026"
          sub="valid_until 26 Jun 2026"
        />
        <ReportField
          label="total vacancies"
          badge={<span className="badge resolved">verified</span>}
          value="3,712 posts"
          sub="LDC · JSA · DEO"
        />
        <ReportField
          label="age limits"
          badge={<span className="badge resolved">verified</span>}
          value="18 – 27 years"
          sub="cat. relaxation: SC/ST +5 · OBC +3 · PwBD +10"
        />
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h3>Risk flags</h3>
          <span className="tn">3 flags · 0 promotion blockers</span>
        </div>
        <ul className="rlist" style={{ padding: "0 16px" }}>
          <li>
            <span className="badge pending">warning</span>
            <div>
              <div className="li-label">Category relaxation rules detected</div>
              <div className="li-sub">field_key=category_relaxation · evidence_summary.posts.0.age_relaxation</div>
            </div>
            <span className="tn">canonical rule exists</span>
          </li>
          <li>
            <span className="badge info">conditional</span>
            <div>
              <div className="li-label">PwBD horizontal reservation</div>
              <div className="li-sub">field_key=pwbd_reservation · publish allowed if profile state handled</div>
            </div>
            <span className="tn">handled</span>
          </li>
          <li>
            <span className="badge pending">warning</span>
            <div>
              <div className="li-label">Ex-serviceman rules referenced in notification</div>
              <div className="li-sub">field_key=ex_serviceman · evidence_summary.posts.0.es_relaxation</div>
            </div>
            <span className="tn">advisory only</span>
          </li>
        </ul>
      </div>

      <button className="drawer-trigger">
        <span>Workflow details · full checklist · audit trail · 14 steps</span>
        <span className="arrow">→</span>
      </button>
    </div>
  );
}

function ReportField({ label, badge, value, sub }) {
  return (
    <div className="report-field">
      <div className="rf-label">
        <span>{label}</span>
        {badge}
      </div>
      <div className="rf-value">{value}</div>
      {sub ? <div className="rf-sub">{sub}</div> : null}
    </div>
  );
}

// ── REPORT DETAIL — CONFLICT VARIANT ──────────────────────────────────

function ReportScreen({ active, openOverride }) {
  return (
    <section className={`screen ${active ? "active" : ""}`} id="screen-report">
      <div className="section-header">
        <h2>Verification Report — Conflict state</h2>
        <div className="meta">demo: Tier A conflict requiring override</div>
      </div>

      <div className="review-layout">
        <aside className="queue-list">
          <div className="queue-filter">
            <button>all</button>
            <button className="active">conflicts</button>
          </div>
          <QueueItem
            selected
            tier="A" tierClass="tier-a"
            badge={<span className="badge blocker">conflict</span>}
            title="IBPS PO/MT Recruitment 2026 — CRP PO/MT-XV"
            org="ibps · crp-po-mt-xv"
            action="→ resolve conflict"
          />
        </aside>

        <div className="report-pane">
          <div className="report-head">
            <div>
              <h2>IBPS PO/MT Recruitment 2026 — CRP PO/MT-XV</h2>
              <div className="head-meta">
                <span>report_id <strong>rpt_5b8c2f</strong></span>
                <span>v<strong>3</strong></span>
                <span>chain head · 2 prior versions</span>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <span className="badge tier-a">A high stakes</span>
                <span className="badge plain">exam_family banking</span>
                <span className="badge blocker">conflict</span>
                <span className="badge resolved">fresh</span>
              </div>
            </div>
            <div className="head-actions">
              <button className="btn ghost small">Reject report</button>
              <button className="btn small">Re-run consensus</button>
            </div>
          </div>

          <div className="current-action">
            <div>
              <div className="ca-label">Current blocker · 1 of 2</div>
              <h3>Resolve consensus conflict</h3>
              <p>
                Two official sources disagree on apply_end_date. Likely corrigendum issued after initial
                notification. Override required to promote.
              </p>
            </div>
            <div>
              <button className="btn primary" onClick={openOverride}>Resolve conflict</button>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-header">
              <h3>Open conflicts</h3>
              <span className="tn">2 conflicts · 0 resolved</span>
            </div>
            <div className="card-body" style={{ padding: "0 16px" }}>
              <div className="conflict-row">
                <div className="cf-head">
                  <div>
                    <div className="cf-key">apply_end_date</div>
                    <div className="cf-id">conflict_id · cf_8e3a91</div>
                  </div>
                  <span className="badge blocker">open</span>
                </div>
                <div className="cf-values">
                  <div className="cf-val official">
                    <div className="cf-src">official · ibps.in/notif-pdf</div>
                    <div><strong>30 Jun 2026</strong></div>
                    <div className="tn" style={{ marginTop: 4 }}>extracted 14:08</div>
                  </div>
                  <div className="cf-val official">
                    <div className="cf-src">official · ibps.in/corrigendum-1</div>
                    <div><strong>15 Jul 2026</strong></div>
                    <div className="tn" style={{ marginTop: 4 }}>extracted 14:08 · dated 12 May 2026</div>
                  </div>
                </div>
              </div>

              <div className="conflict-row">
                <div className="cf-head">
                  <div>
                    <div className="cf-key">total_vacancies</div>
                    <div className="cf-id">conflict_id · cf_8e3a92</div>
                  </div>
                  <span className="badge blocker">open</span>
                </div>
                <div className="cf-values">
                  <div className="cf-val official">
                    <div className="cf-src">official · ibps.in/notif-pdf</div>
                    <div><strong>4,135 posts</strong></div>
                  </div>
                  <div className="cf-val aggregator">
                    <div className="cf-src">aggregator · sarkariresult</div>
                    <div><strong>4,500 posts</strong></div>
                    <div className="tn" style={{ marginTop: 4 }}>aggregator value cannot become canonical</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button className="btn ghost small">View conflict history</button>
              <button className="btn small" onClick={openOverride}>Override conflict</button>
            </div>
          </div>

          <div className="proof-card resolved mb-3">
            <div className="pc-title">
              <h4>Official Proof</h4>
              <span className="badge resolved">auto resolved · 0.94</span>
            </div>
            <div className="pc-meta">
              <div>method · direct_link</div>
              <div>host · ibps.in</div>
              <div>resolved at 14:08:14</div>
            </div>
            <div className="pc-evidence">
              https://www.ibps.in/wp-content/uploads/CRP_PO_MT_XV_Notification_2026.pdf
            </div>
            <div className="row">
              <button className="btn small">View evidence chain</button>
              <button className="btn ghost small">Reject &amp; reattach</button>
            </div>
          </div>

          <button className="drawer-trigger">
            <span>Workflow details · 14 steps · 2 overrides in history</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

// ── BULK PREVIEW ──────────────────────────────────────────────────────

function BulkScreen({ active }) {
  return (
    <section className={`screen ${active ? "active" : ""}`} id="screen-bulk">
      <div className="section-header">
        <h2>Bulk action · Dry run</h2>
        <div className="meta">50 selected · action: bulk_promote</div>
      </div>

      <div className="bulk-summary">
        <BulkStat label="selected" value="50" />
        <BulkStat className="eligible" label="eligible" value="42" />
        <BulkStat className="blocked" label="blocked" value="8" />
        <BulkStat label="tier split" value="A·18 · B·24 · C·8" valueStyle={{ fontSize: 20, lineHeight: 1.4 }} />
      </div>

      <div className="bulk-list mb-3">
        <div className="bulk-list-head">
          <h3>Blocked items · 8</h3>
          <div className="row">
            <span className="tn">grouped by reason_code</span>
            <button className="btn ghost small">Export CSV</button>
          </div>
        </div>

        <BlockerRow
          title="RBI Grade B Officer — DR (General) 2026"
          meta="verification_report · rpt_3d92b1 · Tier A"
          reason="official_proof_missing · promotion_blocker"
        />
        <BlockerRow
          title="IIT Madras — Assistant Professor (GATE)"
          meta="verification_report · rpt_2a44c9 · Tier B"
          reason="eligibility_rule_missing · publish_blocker · field_key=gate_score"
        />
        <BlockerRow
          title="IBPS PO/MT Recruitment 2026 — CRP PO/MT-XV"
          meta="verification_report · rpt_5b8c2f · Tier A"
          reason="consensus_conflict_unresolved · promotion_blocker"
        />
        <BlockerRow
          title="Defence — Indian Coast Guard Yantrik 02/2026"
          meta="verification_report · rpt_9e21f3 · Tier A"
          reason="official_proof_missing · promotion_blocker"
        />
        <BlockerRow
          title="BHEL Engineer Trainee 2026 (GATE-based)"
          meta="verification_report · rpt_7c11d4 · Tier B"
          reason="eligibility_rule_missing · publish_blocker · field_key=gate_score, discipline_required"
        />
        <BlockerRow
          title="Karnataka State Police Constable 2026"
          meta="verification_report · rpt_4b88e2 · Tier A"
          reason="consensus_conflict_unresolved · promotion_blocker · field=total_vacancies"
        />
        <BlockerRow
          title="IIT Bombay — Junior Research Fellow (PhD track)"
          meta="verification_report · rpt_6f33a8 · Tier B"
          reason="eligibility_rule_missing · publish_blocker · field_key=discipline_required, experience"
        />
        <BlockerRow
          title="SAIL Management Trainee (Technical) 2026"
          meta="verification_report · rpt_8a99b6 · Tier B"
          reason="eligibility_rule_missing · publish_blocker · field_key=gate_score"
        />
      </div>

      <div className="card">
        <div className="card-body">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="tinylabel" style={{ marginBottom: 4 }}>Apply mutation</div>
              <div className="tn">
                Bulk apply will promote 42 eligible items. 8 blocked items remain unchanged.
              </div>
            </div>
            <div className="row">
              <button className="btn">Cancel</button>
              <button className="btn primary">Apply to 42 eligible</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BulkStat({ className, label, value, valueStyle }) {
  return (
    <div className={`bulk-stat${className ? ` ${className}` : ""}`}>
      <div className="bs-label">{label}</div>
      <div className="bs-value" style={valueStyle}>{value}</div>
    </div>
  );
}

function BlockerRow({ title, meta, reason }) {
  return (
    <div className="blocker-row">
      <div>
        <div className="br-title">{title}</div>
        <div className="br-meta">{meta}</div>
        <div className="br-reason">{reason}</div>
      </div>
      <button className="btn small">Open</button>
    </div>
  );
}

// ── BATCH ALERT ───────────────────────────────────────────────────────

function BatchScreen({ active }) {
  return (
    <section className={`screen ${active ? "active" : ""}`} id="screen-batch">
      <div className="section-header">
        <h2>Reverification Batches</h2>
        <div className="meta">2 unacknowledged · mass-corrigendum protection</div>
      </div>

      <div className="batch-alert">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="badge pending">mass change detected</span>
          <span className="badge tier-a">tier a</span>
        </div>
        <h2>SSC — 47 reports affected by source change</h2>
        <div className="ba-source">
          source · ssc.nic.in · trigger_reason · source_hash_changed · 14:18 IST
        </div>

        <div className="ba-stats">
          <div className="ba-stat">
            <div className="bn">total affected</div>
            <div className="bv">47</div>
          </div>
          <div className="ba-stat">
            <div className="bn">flipped to needs_reverification</div>
            <div className="bv">25</div>
          </div>
          <div className="ba-stat">
            <div className="bn">pending_reverification_batch</div>
            <div className="bv">22</div>
          </div>
        </div>

        <div className="tn" style={{ marginBottom: 12 }}>
          First 25 reports already in admin attention queue. Remaining 22 held in batch state to prevent
          flooding. Acknowledge to release in throttled chunks.
        </div>

        <div className="ba-actions">
          <button className="btn primary">Acknowledge &amp; release 22</button>
          <button className="btn">Open affected list</button>
          <button className="btn ghost">Snooze 1h</button>
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h3>Recent batches · last 7 days</h3>
        </div>
        <table className="run-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Trigger</th>
              <th>Affected</th>
              <th>Flipped</th>
              <th>Pending</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <BatchRow
              source="ssc.nic.in" when="14:18 today"
              trigger="source_hash_changed" affected="47" flipped="25" pending="22"
              status={<span className="badge pending">unacknowledged</span>}
            />
            <BatchRow
              source="rrb.nic.in" when="08:42 today"
              trigger="corrigendum_detected" affected="12" flipped="12" pending="0"
              status={<span className="badge pending">unacknowledged</span>}
            />
            <BatchRow
              source="upsc.gov.in" when="yesterday 17:30"
              trigger="canonical_field_edited" affected="6" flipped="6" pending="0"
              status={<span className="badge resolved">ack · vinay.r</span>}
            />
            <BatchRow
              source="ibps.in" when="14 May 11:08"
              trigger="source_trust_changed" affected="3" flipped="3" pending="0"
              status={<span className="badge resolved">ack · kavya.i</span>}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BatchRow({ source, when, trigger, affected, flipped, pending, status }) {
  return (
    <tr>
      <td>
        <div className="row-title">{source}</div>
        <div className="row-sub">{when}</div>
      </td>
      <td><span className="tn">{trigger}</span></td>
      <td>{affected}</td>
      <td>{flipped}</td>
      <td>{pending}</td>
      <td>{status}</td>
      <td><button className="btn ghost small">→</button></td>
    </tr>
  );
}

// ── WORKFLOW DRAWER ───────────────────────────────────────────────────

function DrawerScreen({ active }) {
  return (
    <section className={`screen ${active ? "active" : ""}`} id="screen-drawer">
      <div className="section-header">
        <h2>Workflow Details Drawer</h2>
        <div className="meta">full audit trail · hidden from default review pane</div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>IBPS PO/MT Recruitment 2026 — full workflow checklist</h3>
          <div className="row">
            <span className="badge tier-a">A</span>
            <span className="badge blocker">conflict</span>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <ul className="rlist" style={{ padding: "0 20px" }}>
            <ChecklistRow
              badge={<span className="badge resolved">done</span>}
              label="scrape_queue insert"
              sub="14:08:11 · queue_id qi_8f3a_0042"
              right="automated"
            />
            <ChecklistRow
              badge={<span className="badge resolved">done</span>}
              label="classified · A_HIGH_STAKES · banking"
              sub="14:08:11 · recruitment_classifier.py"
              right="rule-based"
            />
            <ChecklistRow
              badge={<span className="badge resolved">done</span>}
              label="verification report created · v1"
              sub="14:08:12 · trigger_reason=initial_scrape · chain_root=rpt_5b8c2f"
              right="RPC"
            />
            <ChecklistRow
              badge={<span className="badge resolved">done</span>}
              label="official resolver · L1 direct_link · confidence 0.94"
              sub="14:08:14 · official_resolution_status=auto_resolved · ibps.in"
              right="automated"
            />
            <ChecklistRow
              badge={<span className="badge resolved">done</span>}
              label="consensus engine · 15 high-risk fields compared"
              sub="14:08:18 · 13 verified · 2 conflicts"
              right="automated"
            />
            <ChecklistRow
              badge={<span className="badge blocker">open</span>}
              label="conflict · apply_end_date · cf_8e3a91"
              sub="official ibps.in vs official ibps.in corrigendum-1"
              right="needs admin"
            />
            <ChecklistRow
              badge={<span className="badge blocker">open</span>}
              label="conflict · total_vacancies · cf_8e3a92"
              sub="official vs aggregator (aggregator rejected by policy)"
              right="auto-resolvable"
            />
            <ChecklistRow
              badge={<span className="badge pending">queued</span>}
              label="eligibility complexity scan"
              sub="deferred until consensus resolved"
              right="stage 4"
            />
            <ChecklistRow
              badge={<span className="badge plain">pending</span>}
              label="promotion gate check"
              sub="blocked: consensus_conflict_unresolved"
              right="stage 5"
            />
            <ChecklistRow
              badge={<span className="badge plain">pending</span>}
              label="draft promotion"
              sub="downstream"
              right="manual"
            />
            <ChecklistRow
              badge={<span className="badge plain">pending</span>}
              label="validate & verify (admin_trust.py)"
              sub="downstream"
              right="manual"
            />
            <ChecklistRow
              badge={<span className="badge plain">pending</span>}
              label="publish gate"
              sub="downstream"
              right="manual"
            />
            <ChecklistRow
              badge={<span className="badge plain">pending</span>}
              label="eligibility recompute & alerts"
              sub="downstream"
              right="automated"
            />
          </ul>
        </div>
        <div className="card-footer">
          <span className="tn">14 steps · last update 14:08:18 · updated_by gateway</span>
          <button className="btn ghost small">Export trace</button>
          <button className="btn small">Re-run from stage</button>
        </div>
      </div>

      <div className="grid-2 mt-2">
        <div className="card">
          <div className="card-header">
            <h3>Chain history</h3>
            <span className="tn">chain_root rpt_5b8c2f · 3 versions</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <ul className="rlist" style={{ padding: "0 16px" }}>
              <ChecklistRow
                badge={<span className="badge resolved">v3</span>}
                label="current · classified → conflict"
                sub="14:08:18 · trigger=corrigendum_detected"
                right="active"
              />
              <ChecklistRow
                badge={<span className="badge plain">v2</span>}
                label="superseded"
                sub="13:42:08 · trigger=resubmission · hash drift"
                right="closed"
              />
              <ChecklistRow
                badge={<span className="badge plain">v1</span>}
                label="initial"
                sub="11:18:44 · trigger=initial_scrape"
                right="closed"
              />
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Override history</h3>
            <span className="tn">recruitment_verification_overrides · 2 entries</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <ul className="rlist" style={{ padding: "0 16px" }}>
              <ChecklistRow
                badge={<span className="badge resolved">applied</span>}
                label="apply_start_date · scope=field"
                sub={"13:48 · vinay.r · \"Corrigendum-1 supersedes initial date\""}
                right="v2"
              />
              <ChecklistRow
                badge={<span className="badge resolved">applied</span>}
                label="total_vacancies · scope=field"
                sub={"11:25 · kavya.i · \"Aggregator value rejected\""}
                right="v1"
              />
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChecklistRow({ badge, label, sub, right }) {
  return (
    <li>
      {badge}
      <div>
        <div className="li-label">{label}</div>
        <div className="li-sub">{sub}</div>
      </div>
      <span className="tn">{right}</span>
    </li>
  );
}

// ── OVERRIDE MODAL ────────────────────────────────────────────────────

function OverrideModal({ open, onClose }) {
  // Close on backdrop click — clicking the modal body itself doesn't
  // bubble because we stop propagation on the inner <div>.
  const onBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <div
      className={`modal-backdrop${open ? " open" : ""}`}
      id="override-modal"
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Override conflict"
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="tinylabel" style={{ marginBottom: 4 }}>admin_override_conflict</div>
            <h2>Resolve conflict · apply_end_date</h2>
          </div>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="tn" style={{ marginBottom: 16 }}>
            conflict_id <strong>cf_8e3a91</strong> · field_path{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>apply_end_date</code> · report_id rpt_5b8c2f
          </div>

          <div className="form-row">
            <label>Chosen value · pick one official source</label>
            <div className="radio-group">
              <label>
                <input type="radio" name="chosen" value="initial" />
                <div>
                  <div><strong>30 Jun 2026</strong></div>
                  <div className="rg-sub">official · ibps.in/notif-pdf · extracted 14:08</div>
                </div>
              </label>
              <label>
                <input type="radio" name="chosen" value="corrigendum" defaultChecked />
                <div>
                  <div><strong>15 Jul 2026</strong></div>
                  <div className="rg-sub">official · ibps.in/corrigendum-1 · dated 12 May 2026</div>
                </div>
              </label>
            </div>
          </div>

          <div className="form-row">
            <label>Override scope</label>
            <div className="radio-group">
              <label>
                <input type="radio" name="scope" value="field" defaultChecked />
                <div>
                  <div><strong>field</strong></div>
                  <div className="rg-sub">override only this conflicting field</div>
                </div>
              </label>
              <label>
                <input type="radio" name="scope" value="recruitment" />
                <div>
                  <div><strong>recruitment</strong></div>
                  <div className="rg-sub">accept selected version for whole recruitment</div>
                </div>
              </label>
            </div>
          </div>

          <div className="form-row">
            <label>Reason</label>
            <textarea
              placeholder="Required. e.g., Official corrigendum-1 supersedes earlier PDF — apply window extended."
              defaultValue="Official corrigendum-1 dated 12 May 2026 supersedes earlier PDF. Apply window extended to 15 Jul 2026."
            />
          </div>

          <div className="form-row">
            <label>Evidence URL</label>
            <input
              type="url"
              defaultValue="https://www.ibps.in/wp-content/uploads/Corrigendum_1_CRP_PO_MT_XV.pdf"
            />
          </div>

          <div className="tn" style={{ borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
            Override creates audit row in{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>recruitment_verification_overrides</code>.
            Conflict status flips to{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>resolved_by_admin</code>. Promotion gate accepts.
          </div>
        </div>
        <div className="modal-foot">
          <div className="tn">reviewer · kavya.iyer · super_admin</div>
          <div className="row">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={onClose}>Apply override</button>
          </div>
        </div>
      </div>
    </div>
  );
}
