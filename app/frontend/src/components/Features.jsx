"import React from \"react\";
import { motion } from \"framer-motion\";
import { Compass, ScanSearch, LineChart, BookMarked, Users, CalendarCheck, ArrowUpRight } from \"lucide-react\";

// Six product pillars from vision.md
const PILLARS = [
  {
    key: \"discover\",
    icon: Compass,
    title: \"Discover\",
    tagline: \"Only official sources. Ever.\",
    body: \"Admin-verified recruitments from central, state, PSU and regulatory bodies. No aggregator links, no rumour-mill Telegram forwards.\",
    color: \"from-[#F56A3F] to-[#FFAB00]\",
    span: \"md:col-span-7\",
    accent: \"text-[#F56A3F]\",
    chips: [\"UPSC\", \"SSC\", \"IBPS\", \"RBI\", \"State PSC\"],
  },
  {
    key: \"match\",
    icon: ScanSearch,
    title: \"Match\",
    tagline: \"Deterministic eligibility\",
    body: \"Age, category, education, domicile, PwBD, attempts — every post, every rule, with a plain-English ‘why’ explanation.\",
    color: \"from-[#10B981] to-[#34D399]\",
    span: \"md:col-span-5\",
    accent: \"text-emerald-600\",
  },
  {
    key: \"understand\",
    icon: LineChart,
    title: \"Understand\",
    tagline: \"Stats that drive decisions\",
    body: \"PYQ subject weights, cutoff trends, vacancy curves and competition ratios. Decide what to study; stop guessing.\",
    color: \"from-[#6366F1] to-[#0EA5E9]\",
    span: \"md:col-span-5\",
    accent: \"text-indigo-600\",
  },
  {
    key: \"prepare\",
    icon: BookMarked,
    title: \"Prepare\",
    tagline: \"A study OS, not a streak app\",
    body: \"AI plans that adapt when life happens, focus timer, mock tracking and a weekly Truth Panel that prefers outcomes over activity.\",
    color: \"from-[#F43F5E] to-[#F97316]\",
    span: \"md:col-span-7\",
    accent: \"text-rose-600\",
  },
  {
    key: \"connect\",
    icon: Users,
    title: \"Connect\",
    tagline: \"Community with guardrails\",
    body: \"Exam-specific forums, accountability partners and ₹99 mentor sessions with verified toppers — moderated, never mixed with noise.\",
    color: \"from-[#A855F7] to-[#EC4899]\",
    span: \"md:col-span-6\",
    accent: \"text-fuchsia-600\",
  },
  {
    key: \"act\",
    icon: CalendarCheck,
    title: \"Act\",
    tagline: \"Apply confidently\",
    body: \"Deadline reminders, canonical apply links, document checklists and a durable tracker from not-started to submitted.\",
    color: \"from-[#0EA5E9] to-[#10B981]\",
    span: \"md:col-span-6\",
    accent: \"text-sky-600\",
  },
];

function Pillar({ p, i }) {
  const Icon = p.icon;
  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: \"-80px\" }}
      transition={{ duration: 0.8, delay: i * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
      className={`tilt relative overflow-hidden rounded-3xl border border-black/5 bg-white p-7 md:p-8 ${p.span}`}
      data-testid={`pillar-${p.key}`}
    >
      <div className={`absolute -top-24 -right-20 h-64 w-64 rounded-full blur-3xl opacity-30 bg-gradient-to-br ${p.color}`} />
      <div className=\"relative\">
        <div className=\"flex items-center justify-between\">
          <div className={`h-11 w-11 rounded-2xl grid place-items-center bg-gradient-to-br ${p.color} text-white shadow-lg shadow-black/5`}>
            <Icon className=\"h-5 w-5\" strokeWidth={2.5} />
          </div>
          <div className=\"text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground\">0{i + 1}</div>
        </div>

        <h3 className=\"mt-6 font-heading text-[28px] md:text-[32px] leading-[1.02] font-black tracking-tight\">
          {p.title}.
        </h3>
        <div className={`mt-1 text-sm font-semibold ${p.accent}`}>{p.tagline}</div>
        <p className=\"mt-3 text-[15px] text-foreground/70 leading-relaxed max-w-lg\">{p.body}</p>

        {p.chips && (
          <div className=\"mt-6 flex flex-wrap gap-1.5\">
            {p.chips.map((c) => (
              <span key={c} className=\"text-[11px] font-semibold px-2.5 py-1 rounded-full bg-foreground/5 border border-black/5\">
                {c}
              </span>
            ))}
          </div>
        )}

        <a href=\"#playground\" className=\"mt-6 inline-flex items-center gap-1 text-sm font-semibold link-under\">
          See it in action <ArrowUpRight className=\"h-3.5 w-3.5\" />
        </a>
      </div>
    </motion.article>
  );
}

export default function Features() {
  return (
    <section id=\"features\" className=\"py-24 md:py-32 relative\">
      <div className=\"container px-6\">
        <div className=\"max-w-3xl\">
          <div className=\"uppercase tracking-[0.22em] text-[11px] font-bold text-[#F56A3F]\">The six pillars</div>
          <h2 className=\"mt-4 font-heading text-4xl md:text-6xl font-black leading-[0.98] tracking-tighter\">
            One platform. <br />
            The whole aspirant journey.
          </h2>
          <p className=\"mt-6 text-lg text-foreground/70 max-w-2xl\">
            Career Copilot replaces the ten tabs, three Telegram channels and one spreadsheet you use today — with a single,
            opinionated, trust-first product designed around how aspirants actually prepare.
          </p>
        </div>

        <div className=\"mt-14 grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6\">
          {PILLARS.map((p, i) => (
            <Pillar key={p.key} p={p} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
"