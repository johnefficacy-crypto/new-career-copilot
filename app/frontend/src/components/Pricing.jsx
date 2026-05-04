import React from "react";
import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

const TIERS = [
  {
    name: "Free",
    price: "₹0",
    cadence: "forever",
    blurb: "See the promise. Get your footing.",
    cta: "Create account",
    features: [
      "Full profile + onboarding",
      "Eligibility preview (count only)",
      "Apply tracker",
      "Forum read + 5 posts/day",
      "Study plan preview",
    ],
    accent: "border-black/10",
    btn: "bg-white text-foreground border border-black/15 hover:bg-foreground hover:text-white",
  },
  {
    name: "Pro",
    price: "₹399",
    cadence: "per month",
    strike: "₹3,999/yr · save 30%",
    blurb: "For active aspirants in one cycle.",
    cta: "Start Pro",
    features: [
      "Full personalized eligibility",
      "'Why eligible' explanations",
      "Personalized match alerts",
      "AI study plan + focus timer",
      "PYQ, cutoff, vacancy analytics",
      "Study group up to 3 · 1 partner",
    ],
    accent: "border-[#F56A3F] ring-4 ring-[#F56A3F]/10 scale-[1.02]",
    btn: "bg-foreground text-white hover:opacity-90",
    popular: true,
  },
  {
    name: "Elite",
    price: "₹899",
    cadence: "per month",
    strike: "₹6,999/yr · save 35%",
    blurb: "For aspirants who refuse to miss.",
    cta: "Go Elite",
    features: [
      "Everything in Pro, plus:",
      "Unlimited AI Career Chat",
      "Advanced PYQ topic heatmap",
      "Downloadable plan + reports",
      "Study group up to 8 · 3 partners",
      "1 mentor session / month included",
      "Priority support",
    ],
    accent: "border-black/10",
    btn: "bg-[#10B981] text-white hover:bg-[#0fa372]",
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 grid-dots opacity-30 [mask-image:radial-gradient(60%_50%_at_50%_40%,black,transparent)]" />
      <div className="container relative px-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="uppercase tracking-[0.22em] text-[11px] font-bold text-[#10B981]">Pricing</div>
          <h2 className="mt-4 font-heading text-4xl md:text-6xl font-black tracking-tighter leading-[0.98]">
            Your first pay cheque
            <br />
            <span className="gradient-text">will cover a year of Pro.</span>
          </h2>
          <p className="mt-5 text-foreground/60">One coffee a week. A career on the other side.</p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.7 }}
              className={`relative rounded-3xl bg-white p-8 border ${t.accent}`}
              data-testid={`pricing-${t.name.toLowerCase()}`}
            >
              {t.popular && (
                <div className="absolute -top-3 left-8 bg-[#F56A3F] text-white text-[10px] uppercase tracking-[0.22em] font-bold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              <div className="font-heading text-2xl font-black">{t.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.blurb}</div>
              <div className="mt-6 flex items-baseline gap-2">
                <div className="font-heading text-5xl font-black tracking-tighter">{t.price}</div>
                <div className="text-sm text-muted-foreground">{t.cadence}</div>
              </div>
              {t.strike && (
                <div className="mt-1 text-[11px] font-semibold text-emerald-600">{t.strike}</div>
              )}

              <ul className="mt-6 space-y-2.5 text-[14px]">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2 items-start">
                    <Check className="h-4 w-4 text-[#F56A3F] mt-0.5 shrink-0" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                data-testid={`pricing-cta-${t.name.toLowerCase()}`}
                className={`btn-shine mt-8 w-full py-3 rounded-full font-semibold text-sm transition ${t.btn}`}
              >
                {t.cta}
              </button>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <Sparkles className="inline h-3 w-3 mr-1" /> Mentor sessions (₹99–₹299) are per-session and not subscription-gated.
        </div>
      </div>
    </section>
  );
}
