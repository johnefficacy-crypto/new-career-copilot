import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../../lib/authContext";
import { resolvePostAuthRedirect } from "../../lib/resolvePostAuthRedirect";
import { useTurnstileChallenge } from "../../lib/useTurnstileChallenge";

const SIGNUP_DEFAULT = "/app/onboarding/chat?mode=discovery";

function humanizeAuthError(err) {
  const raw = (err && (err.message || err.error_description)) || "Unable to create account";
  if (/captcha|turnstile/i.test(raw)) {
    return "Verification failed. Please try again.";
  }
  return raw;
}

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const auth = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = resolvePostAuthRedirect(location, searchParams, SIGNUP_DEFAULT);
  const {
    Turnstile,
    captchaRequired,
    widgetFailed,
    waitForCaptchaToken,
    reset: resetCaptcha,
  } = useTurnstileChallenge();

  const urlError = useMemo(() => searchParams.get("error"), [searchParams]);
  const [bannerError, setBannerError] = useState(urlError);

  async function handleGoogleSignup() {
    setLoading(true);
    setError(null);
    setBannerError(null);
    try {
      await auth.loginWithGoogle({ redirectTo });
    } catch (err) {
      setError(err.message || "Unable to continue with Google");
      setLoading(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setBannerError(null);
    let captchaToken;
    if (captchaRequired) {
      try {
        captchaToken = await waitForCaptchaToken({ timeoutMs: 15000 });
      } catch (capErr) {
        if (widgetFailed || capErr?.message === "captcha_widget_failed") {
          setError(
            "CAPTCHA failed to load. Disable ad-blockers or try another browser."
          );
          setLoading(false);
          return;
        }
      }
    }
    try {
      const result = await auth.register({
        email: email.trim(),
        password,
        name: name.trim(),
        captchaToken,
      });
      // When email confirmation is on, signUp returns no session and register
      // returns needsEmailConfirmation=true — show a "check your email" panel
      // instead of navigating into a route the user can't yet access.
      if (result?.needsEmailConfirmation) {
        setCheckEmail(true);
      } else {
        nav(redirectTo, { replace: true });
      }
    } catch (err) {
      resetCaptcha();
      setError(humanizeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <AuthLayout
        title="Check your email."
        subtitle="We sent a confirmation link to finish creating your account."
        footer={
          <span>
            Already confirmed?{" "}
            <Link to="/login" className="link-under font-semibold">Sign in</Link>
          </span>
        }
      >
        <p className="text-sm text-muted-foreground" data-testid="signup-check-email">
          Click the link in the email we just sent to {email || "your inbox"} to
          finish setting up your account.
        </p>
      </AuthLayout>
    );
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
        {bannerError && (
          <div
            className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-3 py-2"
            data-testid="signup-banner-error"
          >
            {bannerError}
          </div>
        )}
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
        <Turnstile />
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
