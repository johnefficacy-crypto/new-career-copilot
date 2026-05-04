import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, Github, Twitter, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer data-testid="site-footer" className="relative mt-32 border-t border-border bg-[#0B0F19] text-[#FDFBF7] overflow-hidden">
      <div className="absolute inset-0 grain pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-80 w-[80%] rounded-full bg-gradient-to-r from-[#F56A3F]/25 via-[#FFAB00]/20 to-[#10B981]/25 blur-3xl" />

      <div className="container relative px-6 py-20">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#F56A3F] via-[#FFAB00] to-[#10B981] grid place-items-center">
                <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <div className="font-heading font-black text-xl">Career Copilot</div>
            </div>
            <p className="mt-5 text-white/60 max-w-sm leading-relaxed">
              The first exam preparation operating system for Indian government-job aspirants. Official-first. Eligibility-aware. Quietly brilliant.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {[Twitter, Linkedin, Github].map((Icon, i) => (
                <a key={i} href="#" className="h-10 w-10 grid place-items-center rounded-xl border border-white/10 hover:bg-white/10 transition">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
            {[
              { title: "Product", items: ["Landing", "Dashboard", "Study Plan", "Community"] },
              { title: "Exams", items: ["UPSC CSE", "SSC CGL", "IBPS PO", "RBI Grade A"] },
              { title: "Company", items: ["About", "Careers", "Press", "Legal"] },
              { title: "Resources", items: ["PYQ Library", "Cutoffs", "Blog", "Changelog"] },
            ].map((c) => (
              <div key={c.title}>
                <div className="uppercase text-[11px] tracking-[0.22em] text-white/40 font-semibold">{c.title}</div>
                <ul className="mt-4 space-y-2.5 text-white/70">
                  {c.items.map((i) => (
                    <li key={i}><a href="#" className="link-under hover:text-white">{i}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 pt-6 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs text-white/50">
          <div>© 2026 Career Copilot Labs · Built in India, for India.</div>
          <div className="flex items-center gap-4">
            <Link to="/admin" data-testid="footer-admin-link" className="hover:text-white">Admin console →</Link>
            <span>DPDP-compliant</span>
            <span>SOC-2 (in progress)</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
