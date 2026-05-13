import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// PR2: progressive tiny-question hook. Loads one question at a time and
// keeps the card resilient — any API failure just hides the card so the
// rest of the app keeps working.
export function usePersonaQuestion() {
  const [state, setState] = useState({
    loading: true,
    question: null,
    reason: "",
    error: null,
    saving: false,
  });
  const mounted = useRef(true);

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
