import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ListChecks, LogOut, UserCircle } from "lucide-react";
import useProfileCompletion from "../../features/profile/hooks/useProfileCompletion";

// PR5 of the reorg: the user-menu trigger carries a status dot that
// reflects profile completion at a glance — green ≥ 80%, amber 50-79%,
// red < 50%. While the request is in flight (or the call fails) we
// suppress the dot rather than show a misleading colour.
const STATUS_DOT_CLASS = {
  green: "bg-sage-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

const STATUS_LABEL = {
  green: "Profile complete",
  amber: "Profile in progress",
  red: "Profile incomplete",
};

function StatusDot({ status, pct }) {
  if (!status) return null;
  const cls = STATUS_DOT_CLASS[status];
  if (!cls) return null;
  return (
    <span
      data-testid="user-menu-status-dot"
      data-status={status}
      aria-label={`${STATUS_LABEL[status]} (${pct}%)`}
      title={`${STATUS_LABEL[status]} (${pct}%)`}
      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#FBF6EF] ${cls}`}
    />
  );
}

export default function UserMenu({ user, onLogout }) {
  const { pathname } = useLocation();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const completion = useProfileCompletion();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => {
      if (open && rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Suppress the dot until we have a real reading; a coloured dot rendered
  // against unknown state is worse than no dot at all.
  const dotStatus = completion.loading || completion.error ? null : completion.status;

  return (
    <div className="relative" ref={rootRef}>
      <button
        data-testid="user-menu-btn"
        aria-label={
          dotStatus
            ? `Open user menu — ${STATUS_LABEL[dotStatus]} (${completion.pct}%)`
            : "Open user menu"
        }
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 rounded-full bg-clay-500 text-white font-semibold text-xs grid place-items-center"
      >
        {initials}
        <StatusDot status={dotStatus} pct={completion.pct} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-20 w-60 soft-card rounded-xl p-2">
            <div className="px-3 py-2 border-b border-border mb-1">
              <div className="font-semibold text-sm">{user?.name || "—"}</div>
              <div className="text-[11px] text-muted-foreground">{user?.email}</div>
              <div className="pill pill-dusk mt-2 inline-flex">{user?.role}</div>
              {dotStatus ? (
                <div
                  data-testid="user-menu-status-line"
                  className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5"
                >
                  <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[dotStatus]}`} />
                  {STATUS_LABEL[dotStatus]} · {completion.pct}%
                </div>
              ) : null}
            </div>
            <Link
              to="/app/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-clay-100"
              data-testid="menu-profile"
            >
              <UserCircle className="h-4 w-4" /> Profile
            </Link>
            <Link
              to="/app/onboarding"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-clay-100"
              data-testid="menu-onboarding"
            >
              <ListChecks className="h-4 w-4" /> Onboarding
            </Link>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10"
              data-testid="menu-logout"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
