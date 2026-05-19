import React, { useCallback, useEffect, useRef, useState } from "react";
import TurnstileWidget from "../components/TurnstileWidget";

// Reusable Turnstile gate. Mirrors the pattern in StartFreeButton but
// works for any form that needs a single-use captcha token (Login,
// Signup, etc.). Caller is responsible for invoking `reset()` after
// every submit attempt, since the token returned by Cloudflare is
// single-use and ~5 minutes from issue.
export function useTurnstileChallenge() {
  const widgetRef = useRef(null);
  const tokenRef = useRef(null);
  const pendingRef = useRef(null);
  const [hasToken, setHasToken] = useState(false);
  const [widgetFailed, setWidgetFailed] = useState(false);

  const siteKey = process.env.REACT_APP_TURNSTILE_SITE_KEY;
  const captchaRequired = Boolean(siteKey);

  const handleSuccess = useCallback((newToken) => {
    tokenRef.current = newToken || null;
    setHasToken(Boolean(newToken));
    if (pendingRef.current && newToken) {
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
    setWidgetFailed(true);
    if (pendingRef.current) {
      pendingRef.current.reject(new Error("captcha_widget_failed"));
      pendingRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    tokenRef.current = null;
    setHasToken(false);
    try {
      widgetRef.current?.reset?.();
    } catch {
      /* widget already unmounted */
    }
  }, []);

  useEffect(
    () => () => {
      if (pendingRef.current) {
        pendingRef.current.reject(new Error("captcha_cancelled"));
        pendingRef.current = null;
      }
    },
    []
  );

  const waitForCaptchaToken = useCallback(
    ({ timeoutMs = 15000 } = {}) => {
      if (!captchaRequired) return Promise.resolve(undefined);
      if (tokenRef.current) return Promise.resolve(tokenRef.current);
      return new Promise((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        try {
          widgetRef.current?.execute?.();
        } catch {
          /* widget not mounted yet — onSuccess may still resolve us */
        }
        setTimeout(() => {
          if (pendingRef.current) {
            pendingRef.current.reject(new Error("captcha_timeout"));
            pendingRef.current = null;
          }
        }, timeoutMs);
      });
    },
    [captchaRequired]
  );

  const Turnstile = useCallback(
    function TurnstileMount() {
      if (!captchaRequired) return null;
      return (
        <TurnstileWidget
          ref={widgetRef}
          siteKey={siteKey}
          onSuccess={handleSuccess}
          onError={handleError}
          onExpire={handleExpire}
        />
      );
    },
    [captchaRequired, siteKey, handleSuccess, handleError, handleExpire]
  );

  return {
    Turnstile,
    captchaRequired,
    hasToken,
    widgetFailed,
    waitForCaptchaToken,
    reset,
  };
}

export default useTurnstileChallenge;
