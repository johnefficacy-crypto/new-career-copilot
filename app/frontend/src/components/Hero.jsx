import React from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock, Sparkles, ShieldCheck, Zap } from "lucide-react";

// --------- animated prompt typing ----------
const PROMPT_LINES = [
  { k: "name", v: "Priya Sharma" },
  { k: "dob", v: "14 Aug 2001  ·  24 yrs" },
  { k: "category", v: "OBC-NCL" },
  { k: "education", v: "B.A. History (Hons)  ·  Delhi University" },
  { k: "domicile", v: "Rajasthan" },
];

const EXAMS = [
  {
    name: "SSC CGL 2026",
    org: "Staff Selection Commission",
    posts: 17,
    status: "eligible",
    deadline: "12 days",
    reasons: ["Age 24 ∈ [18–32]", "Graduate OK", "OBC-NCL category match"],
    trust: "Official",
    color: "from-emerald-400/70 to-teal-500/70",
  },
  {
    name: "IBPS PO XV",
    org: "Institute of Banking Personnel",
    posts: 3,
    status: "eligible",
    deadline: "3 days",
    reasons: ["Age 24 ∈ [20–30]", "Any graduate accepted"],
    trust: "Official",
    color: "from-amber-400/70 to-orange-500/70",
  },
  {
    name: "RBI Grade B 2026",
    org: "Reserve Bank of India",
    posts: 2,
    status: "conditional",
    deadline: "26 days",
    reasons: ["Age OK", "Needs min 60% in graduation — verify"],
    trust: "Official",
    color: "from-rose-400/70 to-pink-500/70",
  },
];

function TypedPrompt() {
  const [idx, setIdx] = React.useState(0);
  const [typed, setTyped] = React.useState("");
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (idx >= PROMPT_LINES.length) {
      setDone(true);
      return;
    }
    const target = PROMPT_LINES[idx].v;
    let i = 0;
    setTyped("");
    const t = setInterval(() => {
      i += 1;
      setTyped(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(t);
        setTimeout(() => setIdx((v) => v + 1), 340);
      }
    }, 24);
    return () => clearInterval(t);
  }, [idx]);

  // loop after complete
  React.useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setDone(false);
      setIdx(0);
    }, 5500);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <div className="font-mono text-[12.5px] leading-relaxed space-y-1.5 text-left">
      {PROMPT_LINES.map((line, i) => {
        const active = i === idx;
        const past = i < idx || done;
        return (
          <div key={line.k} className="flex gap-3 items-baseline">
            <span className="text-muted-foreground w-20 shrink-0">{line.k}</span>
            <span className="text-foreground/90 flex-1 truncate">
              {past ? line.v : active ? typed : ""}
              {active && !done && <span className="animate-pulse text-[#F56A3F]">▍</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ExamCard({ exam, i, visible }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: -12 }}
      animate={visible ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{ delay: 0.2 + i * 0.18, type: "spring", stiffness: 90, damping: 14 }}
      className="relative rounded-2xl bg-white border border-black/5 p-4 shadow-[0_12px_28px_-16px_rgba(8,15,35,0.18)] overflow-hidden group"
    >
      <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl opacity-60 bg-gradient-to-br ${exam.color}`} />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{exam.org}</div>
          <div className="font-heading font-bold text-[15px] mt-0.5">{exam.name}</div>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
            exam.status === "eligible"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {exam.status === "eligible" ? "Eligible" : "Conditional"}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {exam.deadline}</span>
        <span>·</span>
        <span>{exam.posts} posts</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1 text-emerald-600"><ShieldCheck className="h-3 w-3" /> {exam.trust}</span>
      </div>

      <ul className="mt-3 space-y-1 text-[12px] text-foreground/80">
        {exam.reasons.map((r) => (
          <li key={r} className="flex gap-1.5 items-start">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export default function Hero() {
  const [showResults, setShowResults] = React.useState(false);
  const ref = React.useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -140]);

  React.useEffect(() => {
    const t1 = setTimeout(() => setShowResults(true), 2200);
    const loop = setInterval(() => {
      setShowResults(false);
      setTimeout(() => setShowResults(true), 2200);
    }, 7700);
    return () => {
      clearTimeout(t1);
      clearInterval(loop);
    };
  }, []);

  return (
    <section ref={ref} className="relative pt-36 md:pt-44 pb-24 overflow-hidden mesh-bg grain isolate">
      <div className="absolute inset-0 grid-dots opacity-50 [mask-image:radial-gradient(80%_50%_at_50%_30%,black,transparent)]" />

      {/* Floating badges */}
      <motion.div style={{ y: y1 }} className="absolute top-32 left-[8%] hidden lg:block">
        <div className="glass rounded-full px-3 py-1.5 text-[11px] font-semibold text-foreground/80 inline-flex items-center gap-2 animate-float">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 12,840 aspirants preparing right now
        </div>
      </motion.div>
      <motion.div style={{ y: y2 }} className="absolute top-56 right-[6%] hidden lg:block">
        <div className="glass rounded-full px-3 py-1.5 text-[11px] font-semibold text-foreground/80 inline-flex items-center gap-2 animate-float" style={{ animationDelay: "1.5s" }}>
          <Zap className="h-3 w-3 text-[#F56A3F]" /> Scraper verified · 14 sources
        </div>
      </motion.div>

      <div className="container relative px-6">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left */}
          <div className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
              data-testid="hero-pill"
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 backdrop-blur px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#F56A3F] animate-pulse" />
              New · Phase 8 community spaces are live
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1 }}
              className="mt-6 font-heading text-5xl md:text-6xl lg:text-[78px] leading-[0.94] tracking-tighter font-black"
            >
              Stop <span className="relative inline-block">stitching
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 8" fill="none">
                  <path d="M2 5.5C50 1.5 150 1.5 198 5.5" stroke="#F56A3F" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </span> your <br className="hidden md:block" /> exam prep. <span className="gradient-text">Start shipping it.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.25 }}
              className="mt-6 text-lg text-foreground/70 max-w-xl leading-relaxed"
            >
              Career Copilot is the exam preparation operating system for Indian government-job aspirants.
              Official-first alerts, deterministic eligibility matching, AI study plans and a community that actually shows up.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mt-9 flex flex-col sm:flex-row gap-3"
            >
              <Link
                to="/app"
                data-testid="hero-start-button"
                className="btn-shine group inline-flex items-center justify-center gap-2 bg-foreground text-background rounded-full px-6 py-3.5 text-[15px] font-semibold hover:opacity-90 transition shadow-xl shadow-foreground/10"
              >
                Check my eligibility — free
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition" />
              </Link>
              <a
                href="#playground"
                data-testid="hero-try-demo"
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold border border-black/15 bg-white/70 backdrop-blur hover:bg-white"
              >
                <Sparkles className="h-4 w-4 text-[#F56A3F]" />
                Try the live demo
              </a>
            </motion.div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] text-muted-foreground">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Official sources only</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Deterministic eligibility</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> No spam, no rumors</div>
            </div>
          </div>

          {/* Right: Animated eligibility demo */}
          <div className="lg:col-span-6 relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, rotate: -1 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 1, delay: 0.3 }}
              className="relative"
            >
              {/* ambient halo */}
              <div className="absolute -inset-6 bg-gradient-to-br from-[#F56A3F]/20 via-[#FFAB00]/20 to-[#10B981]/20 blur-3xl rounded-[36px] -z-10" />

              <div className="glass rounded-[28px] p-4 md:p-5 border border-white/70 shadow-[0_30px_80px_-30px_rgba(8,15,35,0.35)]">
                {/* fake window chrome */}
                <div className="flex items-center justify-between px-2 pb-3 border-b border-black/5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                  </div>
                  <div className="text-[10.5px] font-mono text-muted-foreground">career-copilot · eligibility.engine</div>
                  <div className="text-[10.5px] font-semibold text-emerald-600 inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 pt-4">
                  {/* Profile / typing */}
                  <div className="rounded-2xl bg-gradient-to-br from-white to-orange-50/40 border border-black/5 p-4">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Aspirant profile</div>
                    <div className="mt-2.5">
                      <TypedPrompt />
                    </div>
                    <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between">
                      <div className="text-[11px] text-muted-foreground">Running deterministic engine…</div>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-[#F56A3F] animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Results */}
                  <div className="relative rounded-2xl bg-foreground/[0.02] border border-black/5 p-4 min-h-[268px]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Matched recruitments</div>
                      <motion.span
                        key={String(showResults)}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F56A3F] text-white"
                      >
                        {showResults ? "3 found" : "..."}
                      </motion.span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      {EXAMS.map((ex, i) => (
                        <ExamCard key={ex.name} exam={ex} i={i} visible={showResults} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating stat card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                className="absolute -left-6 -bottom-6 hidden md:block"
              >
                <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/15 grid place-items-center">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Trust model</div>
                    <div className="font-heading font-bold">Official-first, always</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
