import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../../lib/authContext";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const auth = useAuth();
  const nav = useNavigate();

  async function handleGoogleSignup() {
    setLoading(true);
    setError(null);
    try {
      await auth.loginWithGoogle({
        redirectTo: `${window.location.origin}/app/onboarding/chat?mode=discovery`,
      });
    } catch (err) {
      setError(err.message || "Unable to continue with Google");
      setLoading(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await auth.register({ email: email.trim(), password, name: name.trim() });
      nav("/app/onboarding/chat?mode=discovery", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account."
      subtitle="Your 90-day plan begins with a 3-minute profile."
      footer={
        <span>
          Already joined?{" "}
          <Link to="/login" className="link-under font-semibold">Sign in</Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" data-testid="signup-form">
        <button
          type="button"
          onClick={handleGoogleSignup}
          disabled={loading}
          data-testid="signup-google"
          className="btn btn-ghost w-full disabled:opacity-60"
        >
          Continue with Google
        </button>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground text-center">or create with email</div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Full name</label>
          <input
            data-testid="signup-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border focus:border-clay-400 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Email</label>
          <input
            data-testid="signup-email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border focus:border-clay-400 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Password</label>
          <input
            data-testid="signup-password"
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border focus:border-clay-400 outline-none text-sm"
          />
          <div className="text-[11px] text-muted-foreground mt-1.5">Minimum 8 characters.</div>
        </div>
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2" data-testid="signup-error">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          data-testid="signup-submit"
          className="btn btn-primary w-full disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create my account
        </button>
        <p className="text-[11px] text-muted-foreground text-center">
          By continuing you agree to our quiet principles: no spam, no rumors, no sale of your data.
        </p>
      </form>
    </AuthLayout>
  );
}
