import React from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen linen-bg grain flex">
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-clay-500 grid place-items-center">
            <Compass className="h-4 w-4 text-white" />
          </div>
          <div className="font-heading text-lg font-semibold">Career Copilot</div>
        </Link>
        <div>
          <blockquote className="font-serif italic text-3xl leading-snug text-foreground/80 max-w-lg">
            "Cleared SSC CGL Tier I in my second attempt. The weekly Progress vs Plan was the only thing that told me the
            honest score; everything else flattered me."
          </blockquote>
          <div className="mt-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-clay-200 grid place-items-center font-semibold text-clay-700">AK</div>
            <div>
              <div className="font-medium">Ananya K.</div>
              <div className="text-xs text-muted-foreground">SSC CGL · 2025 · ₹92,400 post</div>
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-widest">Official-first · DPDP-compliant · Phase 1 build</div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="px-6 py-5 flex items-center justify-between lg:hidden">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-clay-500 grid place-items-center">
              <Compass className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-heading font-semibold">Career Copilot</span>
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <h1 className="font-heading text-3xl md:text-4xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-foreground/70">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
