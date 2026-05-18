import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/authContext";

// New onboarding driver. Anonymous users authenticate FIRST (Supabase
// anonymous sign-in returns a real auth.users row with is_anonymous=true);
// every onboarding call carries that JWT through the standard
// /api/profile/onboarding-answer endpoint. There is no separate
// anonymous_id, no stitching step, no resolve-loop. Refreshes survive
// because the JWT survives, and the profile row carries the next-step
// pointer (`onboarding_step`).

export function useProfileOnboarding() {
  const { user, status: authStatus, signInAnonymously } = useAuth();
  const [state, setState] = useState({
    status: "loading",
    profile: null,
    question: null,
    completed: false,
    saving: false,
    error: null,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback((next) => {
    if (mounted.current) setState((s) => ({ ...s, ...next }));
  }, []);

  const fetchNext = useCallback(async () => {
    const resp = await api.get("/api/profile/onboarding-next");
    patch({
      status: "ready",
      profile: resp?.profile || null,
      question: resp?.next_question || null,
      completed: Boolean(resp?.onboarding_completed),
      error: null,
    });
    return resp;
  }, [patch]);

  const bootstrap = useCallback(async () => {
    if (authStatus === "checking") return;
    patch({ status: "loading", error: null });
    try {
      if (authStatus === "guest") {
        // No session yet — sign in anonymously so subsequent API calls
        // carry a real Supabase JWT.
        await signInAnonymously();
      }
      await fetchNext();
    } catch (e) {
      patch({ status: "error", error: e });
    }
  }, [authStatus, signInAnonymously, fetchNext, patch]);

  useEffect(() => {
    bootstrap();
    // Re-bootstrap whenever auth transitions from checking→guest→authed.
  }, [bootstrap]);

  const submit = useCallback(
    async ({ question_key, value, skipped }) => {
      patch({ saving: true, error: null });
      try {
        const resp = await api.post("/api/profile/onboarding-answer", {
          question_key,
          value,
          skipped: Boolean(skipped),
        });
        patch({
          saving: false,
          question: resp?.next_question || null,
          completed: Boolean(resp?.onboarding_completed),
          profile: resp?.profile || null,
        });
        return resp;
      } catch (e) {
        patch({ saving: false, error: e });
        throw e;
      }
    },
    [patch],
  );

  const skipAll = useCallback(async () => {
    patch({ saving: true, error: null });
    try {
      const resp = await api.post("/api/profile/onboarding-skip-all", {});
      patch({
        saving: false,
        completed: true,
        question: null,
        profile: resp?.profile || null,
      });
      return resp;
    } catch (e) {
      patch({ saving: false, error: e });
      throw e;
    }
  }, [patch]);

  return {
    ...state,
    user,
    submit,
    skipAll,
    reload: bootstrap,
    isAnonymous: Boolean(user?.is_anonymous || state.profile?.is_anonymous),
  };
}
