import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Turnstile } from "@marsidev/react-turnstile";
import { useAuth } from "../lib/authContext";

// Anonymous sign-in entry point. Renders an (optionally invisible) Cloudflare
// Turnstile widget when REACT_APP_TURNSTILE_SITE_KEY is set; without it the
// captcha gate is skipped so local dev still works against a Supabase project
// that has CAPTCHA disabled. On success we land on the unified onboarding
// chat; useProfileOnboarding picks up the freshly-minted JWT from there.
const ONBOARDING_PATH = "/app/onboarding/chat?mode=discovery";
const TOKEN_WAIT_MS = 15000;

export default function StartFreeButton({
  label = "Start free",
  className = "",
  trailing = null,
  redirectTo = ONBOARDING_PATH,
  testId,
}) {
  const { signInAnonymously, isAuthed } = useAuth();
  const navigate = useNavigate();
  const turnstileRef = useRef(null);
  const tokenRef = useRef(null);
  const pendingRef = useRef(null);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const siteKey = process.env.REACT_APP_TURNSTILE_SITE_KEY;
  const captchaRequired = Boolean(siteKey) && !isAuthed;

  const handleSuccess = useCallback((newToken) => {
    tokenRef.current = newToken;
    setHasToken(Boolean(newToken));
    if (pendingRef.current) {
      pendingRef.current.resolve(newToken);
      pendingRef.current = null;
    }
  }, []);

  const handleExpire = useCallback(() => {
    tokenRef.current = null;
    setHasToken(false);
  }, []);

  const handleError = useCallback(() => {
    tokenRef.current = null;
    setHasToken(false);
    setError("Verification failed");
    if (pendingRef.current) {
      pendingRef.current.reject(new Error("Verification failed"));
      pendingRef.current = null;
    }
  }, []);

  const resetCaptcha = useCallback(() => {
    tokenRef.current = null;
    setHasToken(false);
    try {
      turnstileRef.current?.reset?.();
    } catch {
      // ref may be unmounted by the time we reset; ignore.
    }
  }, []);

  // Cancel any pending captcha promise on unmount so we don't leak a timer.
  useEffect(() => () => {
    if (pendingRef.current) {
      pendingRef.current.reject(new Error("Cancelled"));
      pendingRef.current = null;
    }
  }, []);

  const waitForCaptchaToken = useCallback(() => {
    if (tokenRef.current) return Promise.resolve(tokenRef.current);
    return new Promise((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      try {
        turnstileRef.current?.execute?.();
      } catch {
        // Some Turnstile builds throw if execute() is called before mount —
        // the widget may still resolve via onSuccess from the initial render.
      }
      setTimeout(() => {
        if (pendingRef.current) {
          pendingRef.current.reject(new Error("Verification timed out"));
          pendingRef.current = null;
        }
      }, TOKEN_WAIT_MS);
    });
  }, []);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      let captchaToken;
      if (captchaRequired) {
        captchaToken = await waitForCaptchaToken();
      }
      await signInAnonymously({ captchaToken });
      navigate(redirectTo);
    } catch (e) {
      setError(e?.message || "Sign-in failed");
      if (captchaRequired) resetCaptcha();
      setLoading(false);
    }
  }, [
    loading,
    captchaRequired,
    waitForCaptchaToken,
    signInAnonymously,
    navigate,
    redirectTo,
    resetCaptcha,
  ]);

  const disabled = loading;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        data-testid={testId}
        data-captcha-ready={captchaRequired ? String(hasToken) : undefined}
        aria-busy={loading || undefined}
        className={className}
      >
        {loading ? "Starting…" : label}
        {!loading && trailing}
      </button>
      {captchaRequired ? (
        <Turnstile
          ref={turnstileRef}
          siteKey={siteKey}
          onSuccess={handleSuccess}
          onError={handleError}
          onExpire={handleExpire}
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
