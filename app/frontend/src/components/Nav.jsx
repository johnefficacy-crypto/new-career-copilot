import React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles, ArrowUpRight } from "lucide-react";
import StartFreeButton from "./StartFreeButton";

export default function Nav() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const { pathname } = useLocation();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how" },
    { label: "Playground", href: "#playground" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header
      data-testid="site-header"
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled ? "py-3" : "py-5"
      }`}
    >
      <div className="container px-4">
        <div
          className={`flex items-center justify-between gap-6 rounded-2xl transition-all duration-500 ${
            scrolled
              ? "glass px-4 py-2.5"
              : "bg-transparent px-2 py-2"
          }`}
        >
          <Link to="/" data-testid="logo-home" className="flex items-center gap-2.5 group">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-[#F56A3F] via-[#FFAB00] to-[#10B981] grid place-items-center shadow-lg shadow-orange-500/20">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
              <div className="absolute inset-0 rounded-xl ring-1 ring-white/40" />
            </div>
            <div className="leading-tight">
              <div className="font-heading text-[17px] font-black tracking-tight">Career Copilot</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground -mt-0.5">exam OS · beta</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1 text-sm">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                data-testid={`nav-${l.label.toLowerCase().replace(/\s/g, "-")}`}
                className="px-3 py-2 rounded-lg text-foreground/70 hover:text-foreground hover:bg-black/5 transition font-medium"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            <Link
              to="/app"
              data-testid="nav-launch-dashboard"
              className="text-sm font-semibold px-3 py-2 rounded-lg text-foreground/80 hover:text-foreground flex items-center gap-1"
            >
              Dashboard <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <StartFreeButton
              testId="nav-cta-start"
              className="btn-shine inline-flex items-center gap-1.5 bg-foreground text-background rounded-full px-4 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-60"
              trailing={<span className="opacity-70">→</span>}
            />
          </div>

          <button
            data-testid="nav-menu-toggle"
            className="lg:hidden h-10 w-10 grid place-items-center rounded-xl border border-border bg-white"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="lg:hidden glass mt-2 rounded-2xl p-4 flex flex-col gap-1"
            >
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="px-3 py-2.5 rounded-lg font-medium hover:bg-black/5"
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-2" onClick={() => setOpen(false)}>
                <StartFreeButton
                  testId="nav-cta-start-mobile"
                  className="w-full bg-foreground text-background text-center py-2.5 rounded-full font-semibold disabled:opacity-60"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
