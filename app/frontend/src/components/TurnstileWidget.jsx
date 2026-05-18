import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// Thin wrapper around Cloudflare's hosted Turnstile script. We avoid
// @marsidev/react-turnstile because it ships its own React copy in the
// wrong place in our monorepo, which produces a "Cannot read properties
// of null (reading 'useCallback')" crash at runtime — two Reacts, one
// of them without a hook dispatcher.

let scriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile cannot load outside a browser"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-turnstile-script]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile));
      existing.addEventListener("error", () =>
        reject(new Error("Unable to load Turnstile")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = "true";
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error("Unable to load Turnstile"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

const VALID_SIZES = new Set(["normal", "compact", "flexible"]);

const TurnstileWidget = forwardRef(function TurnstileWidget(
  { siteKey, onSuccess, onError, onExpire, size },
  ref,
) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    if (!siteKey || !containerRef.current) return undefined;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current) return;

        // Cloudflare removed `size: "invisible"`. To get the prior
        // "invisible until needed, triggered by .execute()" behaviour we
        // combine `execution: "execute"` (challenge only runs on demand)
        // with `appearance: "interaction-only"` (widget chrome hidden
        // unless an interactive challenge is required).
        const renderOptions = {
          sitekey: siteKey,
          execution: "execute",
          appearance: "interaction-only",
          callback: onSuccess,
          //"error-callback": onError,
          "error-callback": (code) => {
  console.error("[Turnstile error]", code);
  if (typeof onError === "function") onError(code);
},
          "expired-callback": onExpire,
        };
        if (size && VALID_SIZES.has(size)) {
          renderOptions.size = size;
        }

        widgetIdRef.current = turnstile.render(containerRef.current, renderOptions);
      })
      .catch((err) => {
        if (cancelled) return;
        if (typeof onError === "function") onError(err);
      });

    return () => {
      cancelled = true;
      try {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        // ignore cleanup failure — widget may already be gone
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, size, onSuccess, onError, onExpire]);

  useImperativeHandle(
    ref,
    () => ({
      execute() {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.execute(widgetIdRef.current);
        }
      },
      reset() {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
      remove() {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      },
    }),
    [],
  );

  return <div ref={containerRef} />;
});

export default TurnstileWidget;
