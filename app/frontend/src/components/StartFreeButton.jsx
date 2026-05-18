import React, { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Turnstile } from "@marsidev/react-turnstile";
import { useAuth } from "../lib/authContext";

// Anonymous sign-in entry point. Renders an (optionally invisible) Cloudflare
// Turnstile widget when REACT_APP_TURNSTILE_SITE_KEY is set; without it the
// captcha gate is skipped so local dev still works against a Supabase project
// that has CAPTCHA disabled. On success we land on the unified onboarding
// chat; useProfileOnboarding picks up the freshly-minted JWT from there.
const ONBOARDING_PATH = "/app/onboarding/chat?mode=discovery";
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

export default function StartFreeButton({
  label = "Start free",
  className = "",
  trailing = null,
  redirectTo = ONBOARDING_PATH,
  testId,
}) {
  const { signInAnonymously } = useAuth();
  const navigate = useNavigate();
  const turnstileRef = useRef(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const captchaRequired = Boolean(TURNSTILE_SITE_KEY);

  const resetCaptcha = useCallback(() => {
    turnstileRef.current?.reset?.();
    setToken(null);
  }, []);

  const handleClick = useCallback(async () => {
    if (loading) return;
    if (captchaRequired && !token) {
      setError("Verifying — try again in a moment");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInAnonymously({ captchaToken: token || undefined });
      navigate(redirectTo);
    } catch (e) {
      setError(e?.message || "Sign-in failed");
      if (captchaRequired) resetCaptcha();
      setLoading(false);
    }
  }, [
    loading,
    captchaRequired,
    token,
    signInAnonymously,
    navigate,
    redirectTo,
    resetCaptcha,
  ]);

  const disabled = loading || (captchaRequired && !token);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        data-testid={testId}
        aria-busy={loading || undefined}
        className={className}
      >
        {loading ? "Starting…" : label}
        {!loading && trailing}
      </button>
      {captchaRequired ? (
        <Turnstile
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={setToken}
          onError={() => {
            setToken(null);
            setError("Verification failed");
          }}
          onExpire={() => setToken(null)}
          options={{ size: "invisible" }}
        />
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </>
  );
}
