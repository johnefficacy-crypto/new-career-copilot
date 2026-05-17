import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../../lib/authContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const auth = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || "/app";

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await auth.loginWithGoogle({ redirectTo: `${window.location.origin}${redirectTo}` });
    } catch (err) {
      setError(err.message || "Unable to sign in with Google");
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await auth.login(email.trim(), password);
      if (user.role === "admin" || user.role === "super_admin") {
        nav("/admin", { replace: true });
      } else {
        nav(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(err.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Sign in to continue your 90-day plan."
      footer={
        <span>
          New here?{" "}
          <Link to="/signup" className="link-under font-semibold">
            Create your account
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          data-testid="login-google"
          className="btn btn-ghost w-full disabled:opacity-60"
        >
          Continue with Google
        </button>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground text-center">or sign in with email</div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Email</label>
          <input
            data-testid="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border focus:border-clay-400 outline-none text-sm"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px] uppercase tracking-widest text-muted-foreground">Password</label>
            <Link to="/forgot-password" className="text-[11px] link-under">Forgot?</Link>
          </div>
          <input
            data-testid="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border focus:border-clay-400 outline-none text-sm"
          />
        </div>
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2" data-testid="login-error">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          data-testid="login-submit"
          className="btn btn-primary w-full disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>
        <div className="text-[11px] text-muted-foreground text-center">
          Auth powered by Supabase. New here?{" "}
          <Link to="/signup" className="link-under">Create an account</Link>.
        </div>
      </form>
    </AuthLayout>
  );
}
