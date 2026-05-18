import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// PR2: progressive tiny-question hook. Loads one question at a time and
// keeps the card resilient — any API failure just hides the card so the
// rest of the app keeps working.
//
// When `initialQuestion` is provided (e.g. mission-control returned a
// `progressive_question` block), the hook skips the initial fetch and
// hydrates from that value — the `/api/persona/questions/next` call is
// redundant on the Today page.
export function usePersonaQuestion({ initialQuestion = undefined } = {}) {
  const hasInitial = initialQuestion !== undefined;
  const [state, setState] = useState({
    loading: !hasInitial,
    question: hasInitial ? initialQuestion || null : null,
    reason: hasInitial ? "" : "",
    error: null,
    saving: false,
  });
  const mounted = useRef(true);
  const skipInitialFetch = useRef(hasInitial);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setIfMounted = useCallback((patch) => {
    if (!mounted.current) return;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const load = useCallback(async () => {
    setIfMounted({ loading: true, error: null });
    try {
      const data = await api.get("/api/persona/questions/next");
      setIfMounted({
        loading: false,
        question: data?.question || null,
        reason: data?.reason || "",
      });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("persona question load failed", e);
      setIfMounted({ loading: false, question: null, reason: "", error: e });
    }
  }, [setIfMounted]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      // Hydrated from initialQuestion — caller-provided. Skip exactly
      // one initial fetch; further `load()` calls (e.g. after a skip)
      // still hit the API so the chain advances.
      skipInitialFetch.current = false;
      return;
    }
    load();
  }, [load]);

  const submitAnswer = useCallback(
    async (answerValue) => {
      const question = state.question;
      if (!question) return;
      setIfMounted({ saving: true });
      try {
        const data = await api.post("/api/persona/questions/answer", {
          question_key: question.question_key,
          answer_value: answerValue,
        });
        setIfMounted({
          saving: false,
          question: data?.next_question || null,
          reason: data?.next_question ? "Improves Study OS personalization" : "",
        });
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.warn("persona question save failed", e);
        setIfMounted({ saving: false, error: e });
      }
    },
    [setIfMounted, state.question],
  );

  const skip = useCallback(async () => {
    const question = state.question;
    if (!question) return;
    setIfMounted({ saving: true });
    try {
      await api.post("/api/persona/questions/skip", {
        question_key: question.question_key,
        dismissed_until_days: 14,
        reason: "not_now",
      });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("persona question skip failed", e);
    }
    setIfMounted({ saving: false, question: null, reason: "" });
    // After a skip, peek for the next question silently.
    load();
  }, [load, setIfMounted, state.question]);

  return { ...state, submitAnswer, skip, reload: load };
}
