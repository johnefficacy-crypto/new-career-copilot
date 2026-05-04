"import React from \"react\";
import { Link } from \"react-router-dom\";
import { ArrowRight, ShieldCheck } from \"lucide-react\";

export default function CTA() {
  return (
    <section className=\"pt-16 pb-24 md:pb-32\">
      <div className=\"container px-6\">
        <div className=\"relative rounded-[32px] overflow-hidden bg-gradient-to-br from-[#F56A3F] via-[#FF8A3D] to-[#FFAB00] p-10 md:p-16\">
          <div className=\"absolute -top-20 -left-10 h-80 w-80 rounded-full bg-white/20 blur-3xl\" />
          <div className=\"absolute -bottom-20 -right-10 h-80 w-80 rounded-full bg-[#10B981]/40 blur-3xl\" />
          <div className=\"absolute inset-0 grain opacity-50\" />

          <div className=\"relative grid lg:grid-cols-2 gap-10 items-center\">
            <div>
              <div className=\"uppercase tracking-[0.22em] text-[11px] font-bold text-white/80\">Ready when you are</div>
              <h2 className=\"mt-4 font-heading text-4xl md:text-6xl font-black tracking-tighter leading-[0.95] text-white\">
                The next notification is
                <br />
                yours. Don't miss it.
              </h2>
              <p className=\"mt-5 text-white/85 max-w-lg text-lg\">
                90 seconds to set up your profile. A lifetime of exam cycles — covered with a single, trustworthy system.
              </p>
            </div>

            <div className=\"lg:justify-self-end w-full lg:max-w-sm\">
              <div className=\"rounded-2xl bg-white p-6 shadow-2xl\">
                <div className=\"text-[10px] uppercase tracking-[0.22em] text-muted-foreground\">Start in 90 seconds</div>
                <div className=\"mt-1 font-heading text-2xl font-black\">Claim your mission control.</div>
                <Link
                  to=\"/app\"
                  data-testid=\"final-cta-start\"
                  className=\"btn-shine mt-5 w-full inline-flex items-center justify-center gap-2 bg-foreground text-white rounded-full py-3.5 font-semibold text-sm\"
                >
                  Launch Career Copilot <ArrowRight className=\"h-4 w-4\" />
                </Link>
                <div className=\"mt-4 text-[11px] text-muted-foreground flex items-center gap-2\">
                  <ShieldCheck className=\"h-3.5 w-3.5 text-emerald-500\" />
                  No credit card · DPDP-compliant · Cancel anytime
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
"