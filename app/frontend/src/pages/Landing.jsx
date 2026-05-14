import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Compass,
  ShieldCheck,
  Users,
  BookOpenCheck,
  LineChart,
} from "lucide-react";
import { useAuth } from "../lib/authContext";
import {
  LandingHowItWorksFlow,
  LandingMissionControlPreview,
  LandingStudyFlowPreview,
  LandingExamTrustPreview,
  LandingTruthPanelPreview,
} from "../features/landing/components";

function TopBar() {
  const auth = useAuth();
  return (
    <header className="fixed top-0 inset-x-0 z-40 py-4">
      <div className="container px-6">
        <div className="flex items-center justify-between gap-6 rounded-full soft-card px-5 py-2.5">
          <Link to="/" className="flex items-center gap-2.5" data-testid="logo-home">
            <div className="h-9 w-9 rounded-full bg-clay-500/90 grid place-items-center">
              <Compass className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <div className="leading-tight">
              <div className="font-heading text-[17px] font-semibold tracking-tight">Career Copilot</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground -mt-0.5">Aspirant OS · v0.1</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {[
              ["How it works", "#how"],
              ["Study OS", "#study"],
              ["Community", "#community"],
              ["Pricing", "#pricing"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="px-3 py-2 rounded-full text-foreground/70 hover:text-foreground hover:bg-clay-100/60 transition"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {auth.isAuthed ? (
              <Link
                to="/app"
                data-testid="nav-app-link"
                className="btn btn-primary text-sm"
              >
                Open app <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  data-testid="nav-login"
                  className="text-sm px-3 py-2 rounded-full text-foreground/80 hover:text-foreground hidden sm:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  data-testid="nav-signup"
                  className="btn btn-primary text-sm"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative pt-36 md:pt-44 pb-20 linen-bg grain overflow-hidden">
      <div className="container px-6 grid lg:grid-cols-12 gap-12 items-end">
        <div className="lg:col-span-7 animate-fade-up">
          <div className="pill pill-sage inline-flex items-center gap-2" data-testid="hero-tag">
            <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" />
            Official-first · Deterministic eligibility · Quiet by design
          </div>
          <h1 className="mt-7 font-heading text-[56px] md:text-[76px] leading-[0.98] font-semibold tracking-tight">
            A calmer, sharper way <br /> to prepare for
            <span className="italic text-clay-600"> government jobs.</span>
          </h1>
          <p className="mt-6 text-lg text-foreground/70 max-w-2xl leading-relaxed">
            Career Copilot is the operating system Indian aspirants wish existed — official notifications, post-wise
            eligibility, a study OS that adapts to your week, and a community that shows up. Nothing loud. Nothing noisy.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="btn btn-primary"
              data-testid="hero-cta-signup"
            >
              Start free — check eligibility <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="btn btn-ghost" data-testid="hero-cta-login">
              I already have an account
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-muted-foreground">
            {[
              "12,840 aspirants active this week",
              "14 official sources watched",
              "0 rumors · 0 paid promotions",
            ].map((t) => (
              <span key={t} className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-sage-500" /> {t}
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 relative animate-fade-up">
          <div className="soft-card rounded-3xl p-5">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
              <span>Eligibility engine</span>
              <span className="inline-flex items-center gap-1 text-sage-600">
                <span className="h-1.5 w-1.5 rounded-full bg-sage-500 animate-pulse" /> Live
              </span>
            </div>
            <div className="mt-4 font-mono text-[12.5px] space-y-1.5 leading-relaxed">
              <div className="flex gap-3"><span className="text-muted-foreground w-24">name</span>Priya Sharma</div>
              <div className="flex gap-3"><span className="text-muted-foreground w-24">dob</span>14 Aug 2001 · 24y</div>
              <div className="flex gap-3"><span className="text-muted-foreground w-24">category</span>OBC-NCL</div>
              <div className="flex gap-3"><span className="text-muted-foreground w-24">education</span>B.A. History</div>
              <div className="flex gap-3"><span className="text-muted-foreground w-24">domicile</span>Rajasthan</div>
            </div>
            <div className="my-5 border-t border-border" />
            <div className="space-y-3">
              {[
                { name: "SSC CGL 2026", reasons: ["Age window ok", "Graduate ok", "OBC-NCL match"], tag: "Eligible", tone: "pill-sage" },
                { name: "IBPS PO XV", reasons: ["3 days to apply"], tag: "Urgent", tone: "pill-clay" },
                { name: "RBI Grade B", reasons: ["Needs ≥60% in grad"], tag: "Conditional", tone: "pill-amber" },
              ].map((e) => (
                <div key={e.name} className="rounded-2xl bg-clay-50/60 border border-clay-100 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{e.name}</div>
                    <span className={`pill ${e.tone}`}>{e.tag}</span>
                  </div>
                  <ul className="mt-2 text-[12px] text-foreground/75 space-y-0.5">
                    {e.reasons.map((r) => (
                      <li key={r} className="inline-flex gap-1.5 items-start"><CheckCircle2 className="h-3 w-3 mt-0.5 text-sage-500" /> {r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon: Icon, title, body }) {
  return (
    <div className="soft-card rounded-3xl p-6">
      <div className="h-10 w-10 rounded-full bg-clay-100 grid place-items-center text-clay-700 mb-5">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <h3 className="font-heading text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-foreground/70 leading-relaxed text-[15px]">{body}</p>
    </div>
  );
}

function Pillars() {
  return (
    <section id="how" className="py-24">
      <div className="container px-6">
        <div className="max-w-2xl">
          <span className="pill pill-dusk">How it works</span>
          <h2 className="mt-4 font-heading text-4xl md:text-5xl font-semibold tracking-tight">
            Four layers. One quiet workflow.
          </h2>
          <p className="mt-4 text-foreground/70">
            We built Career Copilot around the four truths every serious aspirant learns the hard way.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <Feature
            icon={ShieldCheck}
            title="Official-first sources"
            body="14 recruitment boards watched. Nothing reaches your feed until it clears a source registry, queue, and review gate."
          />
          <Feature
            icon={BookOpenCheck}
            title="Deterministic eligibility"
            body="Age, qualification, category, domicile — every verdict is rule-based and auditable. AI explains; it never overrides."
          />
          <Feature
            icon={LineChart}
            title="Study OS, not noise"
            body="A 90-day plan that adapts to your week, Pomodoro-rooted focus, weekly truth panel, mock trend lines."
          />
          <Feature
            icon={Users}
            title="Community that shows up"
            body="Moderated forums, accountability partners, study groups and mentors who've actually cracked the exam."
          />
        </div>

        <div className="mt-16">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            The quiet workflow
          </div>
          <p className="mt-1 text-foreground/70 max-w-2xl">
            Study OS turns verified exam signals and your weekly progress into the
            next correct action — official-first, review-gated, explainable.
          </p>
          <LandingHowItWorksFlow />
        </div>
      </div>
    </section>
  );
}

function StudyStrip() {
  return (
    <section id="study" className="py-24 paper-bg">
      <div className="container px-6 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6">
          <span className="pill pill-sage">Study OS</span>
          <h2 className="mt-4 font-heading text-4xl md:text-5xl font-semibold tracking-tight">
            Your week has a plan. <br /> Your plan has a brain.
          </h2>
          <p className="mt-5 text-foreground/70 leading-relaxed max-w-xl">
            Blocks schedule themselves around your adherence. Focus sessions log themselves. Weekly review writes itself.
            What remains for you is the work, and just the work.
          </p>
          <ul className="mt-6 space-y-2 text-foreground/80 text-[15px]">
            {[
              "Focus timer with post-session reflection prompt",
              "Mock score trend + weakness log",
              "Subject-wise progress gauge",
              "Friday truth panel — what to correct, what to keep",
            ].map((t) => (
              <li key={t} className="inline-flex items-start gap-2">
                <span className="timeline-dot mt-2 shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-6">
          <LandingMissionControlPreview />
        </div>
      </div>

      <div className="container px-6 mt-10 space-y-6">
        <LandingStudyFlowPreview />
        <div className="grid lg:grid-cols-2 gap-6">
          <LandingExamTrustPreview />
          <LandingTruthPanelPreview />
        </div>
      </div>
    </section>
  );
}

function CommunityStrip() {
  return (
    <section id="community" className="py-24">
      <div className="container px-6 grid lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-5">
          <span className="pill pill-clay">Community</span>
          <h2 className="mt-4 font-heading text-4xl md:text-5xl font-semibold tracking-tight">
            Structured spaces. <br /> Toppers you can actually reach.
          </h2>
          <p className="mt-5 text-foreground/70 max-w-md">
            Moderated threads, verified topper answers, study groups that meet on schedule, and 1:1 mentor sessions with people who've been in your chair.
          </p>
        </div>
        <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
          {[
            { kind: "Thread", title: "SSC CGL 2026 notification — what changed", author: "Career Copilot · Admin", votes: 482, replies: 67 },
            { kind: "Topper AMA", title: "How I lifted Quant from 110 → 168 in 6 weeks", author: "Rahul V. · AIR 2,137", votes: 214, replies: 48 },
            { kind: "Mentor", title: "RBI Interview Command Prep · 1:1", author: "Ex-RBI Panikar · ₹2,499/hr", votes: 0, replies: 0 },
            { kind: "Group", title: "Morning Batch · 5 AM club", author: "4 members · Daily", votes: 0, replies: 0 },
          ].map((c) => (
            <div key={c.title} className="soft-card rounded-3xl p-5">
              <div className="pill pill-dusk inline-flex">{c.kind}</div>
              <h3 className="mt-3 font-heading text-lg font-semibold">{c.title}</h3>
              <div className="text-[13px] text-muted-foreground mt-1">{c.author}</div>
              {(c.votes || c.replies) ? (
                <div className="mt-4 text-[12px] text-muted-foreground">{c.votes} votes · {c.replies} replies</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24 paper-bg">
      <div className="container px-6">
        <div className="max-w-2xl">
          <span className="pill pill-dusk">Pricing</span>
          <h2 className="mt-4 font-heading text-4xl md:text-5xl font-semibold tracking-tight">Free forever. Paid when it pays you back.</h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {[
            { name: "Free", price: "₹0", sub: "Always", features: ["Official alerts", "Eligibility verdicts", "Community (read)"], cta: "Start free", highlight: false },
            { name: "Pro", price: "₹399", sub: "per month", features: ["Everything in Free", "Study OS + AI plans", "Mock analytics", "Priority support"], cta: "Upgrade to Pro", highlight: true },
            { name: "Elite", price: "₹1,499", sub: "per month", features: ["Everything in Pro", "2 mentor hours / mo", "Accountability partner match", "1:1 weekly review"], cta: "Go Elite", highlight: false },
          ].map((p) => (
            <div
              key={p.name}
              className={`soft-card rounded-3xl p-7 ${p.highlight ? "ring-2 ring-clay-400" : ""}`}
            >
              {p.highlight && <span className="pill pill-clay">Most chosen</span>}
              <div className="mt-4 font-heading text-xl font-semibold">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-heading text-5xl font-semibold">{p.price}</span>
                <span className="text-muted-foreground text-sm">/ {p.sub}</span>
              </div>
              <ul className="mt-5 space-y-2 text-foreground/80 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="inline-flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-sage-600 mt-0.5" /> {f}</li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={`mt-7 inline-flex w-full justify-center btn ${p.highlight ? "btn-primary" : "btn-ghost"}`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-16 border-t border-border">
      <div className="container px-6 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-clay-500 grid place-items-center">
              <Compass className="h-4 w-4 text-white" />
            </div>
            <div className="font-heading text-lg font-semibold">Career Copilot</div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm">
            Built quietly in India, for India. Official-first, eligibility-aware, community-kind.
          </p>
        </div>
        <div className="flex flex-wrap gap-8 text-sm text-muted-foreground">
          <div>
            <div className="text-[11px] uppercase tracking-widest mb-2 text-foreground/60">Product</div>
            <ul className="space-y-1.5">
              <li><Link className="link-under" to="/app">Dashboard</Link></li>
              <li><Link className="link-under" to="/app/exams">Exams</Link></li>
              <li><Link className="link-under" to="/app/community">Community</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest mb-2 text-foreground/60">Company</div>
            <ul className="space-y-1.5">
              {/* <li><a className="link-under" href="#">About</a></li> */}
              {/* <li><a className="link-under" href="#">Careers</a></li> */}
              <li><Link className="link-under" to="/">About</Link></li>
              <li><Link className="link-under" to="/">Careers</Link></li>
              <li><Link className="link-under" to="/admin">Admin console →</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="container px-6 mt-10 text-xs text-muted-foreground">© 2026 Career Copilot Labs · v0.1 commercial build</div>
    </footer>
  );
}

export default function Landing() {
  return (
    <main data-testid="landing-page">
      <TopBar />
      <Hero />
      <Pillars />
      <StudyStrip />
      <CommunityStrip />
      <Pricing />
      <Footer />
    </main>
  );
}
