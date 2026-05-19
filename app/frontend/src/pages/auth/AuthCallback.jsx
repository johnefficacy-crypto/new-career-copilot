import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";
import {
  peekAnonymousId,
  clearAnonymousId,
} from "../../features/onboarding-chat/anonymousId";
import { resolvePostAuthRedirect } from "../../lib/resolvePostAuthRedirect";

const STITCH_TIMEOUT_MS = 3000;

export default function AuthCallback() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    let mounted = true;

    async function finish() {
      // 1. OAuth provider errors arrive as query params.
      const providerError =
        params.get("error_description") || params.get("error");
      if (providerError) {
        if (mounted) {
          nav(`/login?error=${encodeURIComponent(providerError)}`, {
            replace: true,
          });
        }
        return;
      }

      // 2. Read the session. The client was created with default
      //    detectSessionInUrl=true, which already exchanged the `?code=`
      //    on init. Calling exchangeCodeForSession again here would
      //    throw "both auth code and code verifier should be non-empty".
      let session;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          if (mounted) {
            nav(`/login?error=${encodeURIComponent(error.message)}`, {
              replace: true,
            });
          }
          return;
        }
        session = data?.session;
      } catch (e) {
        if (mounted) {
          nav(
            `/login?error=${encodeURIComponent(e?.message || "auth_callback_failed")}`,
            { replace: true }
          );
        }
        return;
      }

      if (!session) {
        if (mounted) {
          nav(`/login?error=auth_session_missing`, { replace: true });
        }
        return;
      }

      // 3. Stitch anonymous onboarding rows onto the new user, fire-and-forget.
      //    Backend is idempotent via stitch_anonymous_sessions, so a missed
      //    stitch can be retried on any later authed call — never block nav.
      const anonId = peekAnonymousId();
      if (anonId) {
        const stitchPromise = api.post(
          "/api/onboarding-unified/stitch-anonymous",
          { anonymous_id: anonId },
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );
        Promise.race([
          stitchPromise,
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error("stitch_timeout")), STITCH_TIMEOUT_MS)
          ),
        ])
          .then(() => clearAnonymousId())
          .catch(() => {
            /* non-blocking; a later authed request can re-stitch */
          });
      }

      // 4. Resolve a safe redirect and navigate immediately.
      const target = resolvePostAuthRedirect({ next: params.get("next") });
      if (mounted) nav(target, { replace: true });
    }

    finish();
    return () => {
      mounted = false;
    };
  }, [nav, params]);

  return (
    <div className="min-h-screen flex items-center justify-center linen-bg">
      <div className="text-sm text-muted-foreground" data-testid="auth-callback-progress">
        Completing sign in…
      </div>
    </div>
  );
}
