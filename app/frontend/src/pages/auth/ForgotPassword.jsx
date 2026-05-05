import React, { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { auth as authApi } from "../../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgot(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password."
      subtitle="Enter your email and we'll send a secure reset link."
      footer={<Link to="/login" className="link-under font-semibold">Back to sign in</Link>}
    >
      {sent ? (
        <div data-testid="forgot-sent" className="rounded-xl bg-sage-100/60 border border-sage-200 p-4 text-sm">
          If an account exists with that email, a reset link has been sent. (Phase-1: check server logs.)
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" data-testid="forgot-form">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Email</label>
            <input
              data-testid="forgot-email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border focus:border-clay-400 outline-none text-sm"
            />
          </div>
          {error && <div className="text-destructive text-sm">{error}</div>}
          <button
            disabled={loading}
            data-testid="forgot-submit"
            className="btn btn-primary w-full"
          >
            Send reset link
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
