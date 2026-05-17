import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import { getAnonymousId, peekAnonymousId } from "./anonymousId";

// Single session-engine hook shared by BOTH entry modes:
//   * cold/discovery  — useUnifiedOnboardingSession({ mode: "discovery" })
//   * CTA / funnel    — useUnifiedOnboardingSession({ mode: "cta", intent,
//                          recruitmentSlug, postSlug })
//
// It owns: resolve (create/resume), answer, skip, complete, and the
// guest -> authed stitch. Anonymous progress survives refresh because the
// same localStorage anonymous_id is replayed to /resolve every time.

const BASE = "/api/onboarding-unified";

function buildResolveQuery({ mode, intent, recruitmentSlug, postSlug, anonymousId }) {
  const params = new URLSearchParams();
  if (mode) params.set("mode", mode);
  if (intent) params.set("intent", intent);
  if (recruitmentSlug) params.set("recruitment_slug", recruitmentSlug);
  if (postSlug) params.set("post_slug", postSlug);
  if (anonymousId) params.set("anonymous_id", anonymousId);
  return params.toString();
}

export function useUnifiedOnboardingSession(options = {}) {
  const { mode, intent, recruitmentSlug, postSlug } = options;
  const { isAuthed, status: authStatus } = useAuth();

  const [state, setState] = useState({
    status: "loading", // loading | ready | error
    data: null,
    error: null,
    saving: false,
  });

  const mounted = useRef(true);
  const anonRef = useRef(null);
  const prevAuthed = useRef(isAuthed);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback((p) => {
    if (mounted.current) setState((s) => ({ ...s, ...p }));
  }, []);

  const resolve = useCallback(async () => {
    patch({ status: "loading", error: null });
    const anonymousId = getAnonymousId();
    anonRef.current = anonymousId;
    try {
      if (isAuthed && anonymousId) {
        try {
          await api.post(`${BASE}/stitch-anonymous`, { anonymous_id: anonymousId });
        } catch (e) {
          if (process.env.NODE_ENV !== "production") console.warn("pre-resolve stitch failed", e);
        }
      }
      const query = buildResolveQuery({
        mode,
        intent,
        recruitmentSlug,
        postSlug,
        anonymousId,
      });
      const data = await api.get(`${BASE}/resolve?${query}`);
      patch({ status: "ready", data, error: null });
      return data;
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("onboarding resolve failed", e);
      patch({ status: "error", error: e });
      return null;
    }
  }, [mode, intent, recruitmentSlug, postSlug, patch, isAuthed]);

  // Initial load + reload on option change — wait until auth state is known
  // so the first /resolve carries a token when the user is already logged in.
  useEffect(() => {
    if (authStatus === "checking") return;
    resolve();
  }, [resolve, authStatus]);

  // Guest -> authed transition: stitch the anonymous session to the user,
  // then re-resolve so the chat resumes exactly where it left off.
  useEffect(() => {
    if (authStatus === "checking") return;
    if (!prevAuthed.current && isAuthed) {
      const anonymousId = peekAnonymousId();
      (async () => {
        if (anonymousId) {
          try {
            await api.post(`${BASE}/stitch-anonymous`, { anonymous_id: anonymousId });
          } catch (e) {
            if (process.env.NODE_ENV !== "production") console.warn("stitch failed", e);
          }
        }
        resolve();
      })();
    }
    prevAuthed.current = isAuthed;
  }, [isAuthed, authStatus, resolve]);

  const answer = useCallback(
    async (answerValue) => {
      const data = state.data;
      if (!data?.question || !data?.session_id) return null;
      patch({ saving: true });
      try {
        const next = await api.post(`${BASE}/answer`, {
          session_id: data.session_id,
          question_source: data.question_source,
          question_key: data.question.question_key,
          answer_value: answerValue,
          anonymous_id: anonRef.current || peekAnonymousId(),
        });
        patch({ saving: false, data: next, error: null });
        return next;
      } catch (e) {
        patch({ saving: false, error: e });
        throw e;
      }
    },
    [state.data, patch],
  );

  const skip = useCallback(async () => {
    const data = state.data;
    if (!data?.question || !data?.session_id) return null;
    patch({ saving: true });
    try {
      const next = await api.post(`${BASE}/skip`, {
        session_id: data.session_id,
        question_source: data.question_source,
        question_key: data.question.question_key,
        anonymous_id: anonRef.current || peekAnonymousId(),
      });
      patch({ saving: false, data: next, error: null });
      return next;
    } catch (e) {
      patch({ saving: false, error: e });
      throw e;
    }
  }, [state.data, patch]);

  const complete = useCallback(async () => {
    const data = state.data;
    if (!data?.session_id) return null;
    try {
      return await api.post(`${BASE}/complete`, {
        session_id: data.session_id,
        anonymous_id: anonRef.current || peekAnonymousId(),
      });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("complete failed", e);
      return null;
    }
  }, [state.data]);

  return { ...state, resolve, answer, skip, complete, isAuthed };
}
