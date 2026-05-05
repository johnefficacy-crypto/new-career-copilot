import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { auth as authApi } from "../../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.reset(token.trim(), password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Set a new password." subtitle="Paste the token from your reset email below.">
      {done ? (
        <div className="space-y-4" data-testid="reset-done">
          <div className="rounded-xl bg-sage-100/60 border border-sage-200 p-4 text-sm">
            Password updated. You can sign in now.
          </div>
          <Link className="btn btn-primary w-full" to="/login">Go to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" data-testid="reset-form">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Reset token</label>
            <input
              data-testid="reset-token"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border font-mono text-sm"
            />
          </div>
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
          {error && <div className="text-destructive text-sm">{error}</div>}
          <button disabled={loading} data-testid="reset-submit" className="btn btn-primary w-full">Update password</button>
        </form>
      )}
    </AuthLayout>
  );
}
