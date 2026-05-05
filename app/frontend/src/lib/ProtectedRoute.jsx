import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";

export function ProtectedRoute({ children, role }) {
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

  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    const hierarchy = { user: 1, mentor: 2, admin: 5, super_admin: 10 };
    const min = Math.min(...allowed.map((r) => hierarchy[r] ?? 99));
    const currentLevel = hierarchy[auth.user?.role] ?? 0;
    if (currentLevel < min && !allowed.includes(auth.user?.role)) {
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
