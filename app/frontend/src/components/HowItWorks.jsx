"import React from \"react\";
import { motion } from \"framer-motion\";
import { UserCircle2, Sparkles, ListChecks, Rocket } from \"lucide-react\";

const STEPS = [
  {
    n: \"01\",
    icon: UserCircle2,
    title: \"Tell us who you are\",
    body: \"Answer a 5-step profile: age, category, education, domicile, availability. Takes under 90 seconds.\",
  },
  {
    n: \"02\",
    icon: Sparkles,
    title: \"The engine does the matching\",
    body: \"Our deterministic engine scans every live recruitment, post by post, and explains why you match (or don't).\",
  },
  {
    n: \"03\",
    icon: ListChecks,
    title: \"Get a plan that fits your week\",
    body: \"AI drafts a macro→meso→micro plan around your target, your weak subjects and the hours you actually have.\",
  },
  {
    n: \"04\",
    icon: Rocket,
    title: \"Show up every day\",
    body: \"Focus timer, community check-ins, weekly Truth Panel. Three months later, look up — you're ready.\",
  },
];

export default function HowItWorks() {
  return (
    <section id=\"how\" className=\"py-24 md:py-32 bg-[#0B0F19] text-[#FDFBF7] relative overflow-hidden\">
      <div className=\"absolute inset-0 grain\" />
      <div className=\"absolute -top-40 left-1/4 h-96 w-96 rounded-full blur-3xl bg-[#F56A3F]/25\" />
      <div className=\"absolute -bottom-40 right-1/4 h-96 w-96 rounded-full blur-3xl bg-[#10B981]/25\" />

      <div className=\"container relative px-6\">
        <div className=\"flex flex-col md:flex-row md:items-end md:justify-between gap-6\">
          <div>
            <div className=\"uppercase tracking-[0.22em] text-[11px] font-bold text-[#FFAB00]\">How it works</div>
            <h2 className=\"mt-4 font-heading text-4xl md:text-6xl font-black tracking-tighter leading-[0.98]\">
              Four steps from <br />
              <span className=\"gradient-text\">confused to confident.</span>
            </h2>
          </div>
          <p className=\"text-white/60 max-w-md text-[15px] leading-relaxed\">
            No black-box magic. Every stage is deterministic where it matters and explained where it doesn't.
            Aspirants, not algorithms, stay in charge.
          </p>
        </div>

        <div className=\"mt-14 grid md:grid-cols-4 gap-6 relative\">
          {/* connecting line */}
          <div className=\"hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent\" />

          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.7 }}
              className=\"relative\"
            >
              <div className=\"h-20 w-20 rounded-2xl glass-dark grid place-items-center text-white\">
                <s.icon className=\"h-7 w-7\" strokeWidth={2} />
              </div>
              <div className=\"mt-5 font-mono text-[11px] tracking-[0.22em] text-white/40\">{s.n}</div>
              <h3 className=\"mt-2 font-heading text-xl font-black\">{s.title}</h3>
              <p className=\"mt-2 text-sm text-white/60 leading-relaxed\">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
"