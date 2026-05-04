import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { Link } from "react-router-dom";

const FAQS = [
  {
    q: "Is Career Copilot actually using official sources?",
    a: "Yes, and this is non-negotiable. Users only see exam notifications from the issuing authority — UPSC, SSC, IBPS, RBI, NABARD, State PSCs and similar. Aggregator URLs are used internally for discovery, but are never surfaced in the user experience.",
  },
  {
    q: "How does the eligibility engine decide whether I match?",
    a: "It's deterministic, not AI-predicted. Rules for age, category, education, domicile, PwBD, ex-serviceman, attempts and appearing-candidate status are encoded per post. You get an exact verdict and a plain-English 'why eligible / not eligible' explanation.",
  },
  {
    q: "What does AI actually do here?",
    a: "AI drafts study plans, summarises notifications, and explains eligibility outcomes. AI never publishes official recruitments, never verifies organizations, and never overrides the deterministic eligibility result. Every AI action passes a governance policy layer.",
  },
  {
    q: "How are mentors verified?",
    a: "Every mentor submits their rank/roll number from the official UPSC/SSC result PDF. Admins cross-verify before the mentor can list a session. Only then does the 'Career Copilot Verified' badge apply.",
  },
  {
    q: "Can I cancel my Pro or Elite plan anytime?",
    a: "Yes. Cancellation is instant and self-serve. We also offer a 7-day no-questions-asked refund on the first billing.",
  },
  {
    q: "Is the Free tier useful, or is it bait?",
    a: "Free is genuinely useful — profile, onboarding, apply tracker, forum read access, eligibility demo and plan preview. You can prepare for months on Free and only upgrade when personalized matching and a full study plan become critical.",
  },
];

export default function FAQ() {
  const [open, setOpen] = React.useState(0);
  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="container px-6">
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5">
            <div className="uppercase tracking-[0.22em] text-[11px] font-bold text-[#F56A3F]">FAQ</div>
            <h2 className="mt-4 font-heading text-4xl md:text-5xl font-black tracking-tighter leading-[0.98]">
              The answers you
              <br />
              deserve up front.
            </h2>
            <p className="mt-5 text-foreground/60 max-w-sm">
              Still curious? Email us at <a href="mailto:hello@careercopilot.in" className="link-under font-semibold text-foreground">hello@careercopilot.in</a>.
            </p>
            <Link to="/app" data-testid="faq-cta" className="mt-8 inline-flex bg-foreground text-background rounded-full px-5 py-3 font-semibold text-sm btn-shine">
              Jump into the dashboard →
            </Link>
          </div>

          <div className="lg:col-span-7 space-y-3">
            {FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={i}
                  data-testid={`faq-item-${i}`}
                  className={`rounded-2xl border transition-all ${isOpen ? "border-black/15 bg-white shadow-md" : "border-black/10 bg-white/60 hover:bg-white"}`}
                >
                  <button
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="w-full p-5 flex items-center gap-4 text-left"
                  >
                    <div className={`h-8 w-8 shrink-0 rounded-full grid place-items-center ${isOpen ? "bg-[#F56A3F] text-white" : "bg-foreground/5 text-foreground"}`}>
                      {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </div>
                    <div className="font-heading text-lg font-bold flex-1">{f.q}</div>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-5 pl-[68px] text-foreground/70 leading-relaxed">{f.a}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
