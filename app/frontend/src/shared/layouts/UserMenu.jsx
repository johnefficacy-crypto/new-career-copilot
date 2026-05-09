import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ListChecks, LogOut, UserCircle } from "lucide-react";

export default function UserMenu({ user, onLogout }) {
  const { pathname } = useLocation();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => { if (open && rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);
  const initials = (user?.name || user?.email || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <div className="relative" ref={rootRef}><button data-testid="user-menu-btn" aria-label="Open user menu" onClick={() => setOpen((v) => !v)} className="h-9 w-9 rounded-full bg-clay-500 text-white font-semibold text-xs grid place-items-center">{initials}</button>{open && <><div className="fixed inset-0 z-10" onClick={() => setOpen(false)} /><div className="absolute right-0 top-11 z-20 w-60 soft-card rounded-xl p-2"><div className="px-3 py-2 border-b border-border mb-1"><div className="font-semibold text-sm">{user?.name || "—"}</div><div className="text-[11px] text-muted-foreground">{user?.email}</div><div className="pill pill-dusk mt-2 inline-flex">{user?.role}</div></div><Link to="/app/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-clay-100" data-testid="menu-profile"><UserCircle className="h-4 w-4" /> Profile</Link><Link to="/app/onboarding" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-clay-100" data-testid="menu-onboarding"><ListChecks className="h-4 w-4" /> Onboarding</Link><button onClick={onLogout} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10" data-testid="menu-logout"><LogOut className="h-4 w-4" /> Sign out</button></div></>}</div>;
}
