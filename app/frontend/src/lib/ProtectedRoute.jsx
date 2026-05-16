import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";
import { ROLE_HIERARCHY, ROLES } from "./rbac";

export function ProtectedRoute({ children, role, permission, requireBackend = false }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center linen-bg">
        <div className="text-sm text-muted-foreground animate-breathe" data-testid="auth-checking">
          Loading your session…
        </div>
      </div>
    );
  }

  if (!auth.isAuthed) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireBackend && !auth.hasBackendSession) {
    return (
      <div className="min-h-screen flex items-center justify-center linen-bg">
        <div className="text-sm text-muted-foreground" data-testid="backend-sync-pending">
          Syncing your profile. Please try again in a moment.
        </div>
      </div>
    );
  }

  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    const min = Math.min(...allowed.map((r) => ROLE_HIERARCHY[r] ?? 99));
    const currentLevel = ROLE_HIERARCHY[auth.user?.role] ?? 0;
    if (currentLevel < min && !allowed.includes(auth.user?.role)) {
      return <Navigate to="/app" replace />;
    }
  }

  if (permission) {
    const perms = auth.user?.permissions || [];
    if (!perms.includes(permission) && auth.user?.role !== ROLES.SUPER_ADMIN) {
      return <Navigate to="/app" replace />;
    }
  }

  return children;
}

export function GuestOnly({ children }) {
  const auth = useAuth();
  if (auth.isAuthed) return <Navigate to="/app" replace />;
  return children;
}
