import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../../lib/authContext";
import { supabase } from "../../lib/supabase";

// Supabase routes the password-reset link to a URL containing a recovery
// token in the URL hash. Calling supabase.auth on mount picks that up and
// produces a session; thereafter we just call updateUser({ password }).

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const auth = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(Boolean(session));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await auth.updatePassword(password);
      setDone(true);
      setTimeout(() => nav("/login", { replace: true }), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Set a new password."
      subtitle="Open this page from the link in your reset email."
    >
      {done ? (
        <div className="space-y-4" data-testid="reset-done">
          <div className="rounded-xl bg-sage-100/60 border border-sage-200 p-4 text-sm">
            Password updated. Redirecting you to sign in…
          </div>
          <Link className="btn btn-primary w-full" to="/login">Go to sign in</Link>
        </div>
      ) : !hasSession ? (
        <div className="space-y-4">
          <div
            data-testid="reset-no-session"
            className="rounded-xl bg-warning/10 border border-warning/30 p-4 text-sm"
          >
            We couldn't find a recovery session. Please open the reset link from
            the email Supabase sent you.
          </div>
          <Link to="/forgot-password" className="link-under text-sm">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" data-testid="reset-form">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">New password</label>
            <input
              data-testid="reset-password"
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border text-sm"
            />
          </div>
          {error && <div className="text-destructive text-sm" data-testid="reset-error">{error}</div>}
          <button disabled={loading} data-testid="reset-submit" className="btn btn-primary w-full">
            Update password
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
