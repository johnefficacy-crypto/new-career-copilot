import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { auth as authApi } from "./api";
import { isAdminRole, ROLES } from "./rbac";
import { supabase } from "./supabase";

const AuthCtx = createContext(null);

function coerceRole(rawRole) {
  return Object.values(ROLES).includes(rawRole) ? rawRole : ROLES.USER;
}

function safeGoalExams(value) {
  return Array.isArray(value) ? value : [];
}

function mergeUser(supabaseUser, backendUser) {
  if (!supabaseUser && !backendUser) return null;
  const meta = supabaseUser?.user_metadata || {};
  const appMeta = supabaseUser?.app_metadata || {};
  const role = coerceRole(backendUser?.role || appMeta.role || meta.role);
  // Supabase sets is_anonymous on the user object after signInAnonymously.
  // The backend also forwards it on /auth/me. Either side is authoritative.
  const isAnonymous = Boolean(
    backendUser?.is_anonymous ?? supabaseUser?.is_anonymous ?? appMeta.is_anonymous
  );
  return {
    id: supabaseUser?.id || backendUser?.id || null,
    email: supabaseUser?.email || backendUser?.email || null,
    name: backendUser?.name || meta.name || meta.full_name || null,
    role,
    permissions: Array.isArray(backendUser?.permissions) ? backendUser.permissions : [],
    avatar: backendUser?.avatar || meta.avatar_url || null,
    onboarded: backendUser?.onboarded ?? Boolean(meta.onboarded),
    plan: backendUser?.plan || meta.plan || "free",
    goal_exams: safeGoalExams(backendUser?.goal_exams || meta.goal_exams),
    is_anonymous: isAnonymous,
    created_at: backendUser?.created_at || supabaseUser?.created_at || null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking"); // checking | guest | session_authed | backend_authed
  // Dedupe hydrate() across rapid getSession()/onAuthStateChange fires.
  // Supabase Session has no stable `id`, so we key off access_token —
  // it rotates on TOKEN_REFRESHED, so the ref self-invalidates.
  const lastHydratedTokenRef = useRef(null);

  const hydrate = useCallback(async (session) => {
    if (!session?.user) {
      lastHydratedTokenRef.current = null;
      setUser(null);
      setStatus("guest");
      return;
    }
    if (lastHydratedTokenRef.current === session.access_token) return;
    lastHydratedTokenRef.current = session.access_token;

    try {
      const { user: backendUser } = await authApi.me();
      setUser(mergeUser(session.user, backendUser));
      setStatus("backend_authed");
    } catch {
      setUser(mergeUser(session.user, null));
      setStatus("session_authed");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) hydrate(data.session);
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
          setStatus("guest");
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        lastHydratedTokenRef.current = null;
      }
      hydrate(session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrate]);

  const login = useCallback(
    async (email, password, { captchaToken } = {}) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      });
      if (error) throw new Error(error.message || "Unable to sign in");
      await hydrate(data.session);
      return mergeUser(data.user, null);
    },
    [hydrate]
  );

  const register = useCallback(
    async ({ email, password, name, captchaToken }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          ...(captchaToken ? { captchaToken } : {}),
        },
      });
      if (error) throw new Error(error.message || "Unable to create account");
      const merged = mergeUser(data.user, null);
      if (data.session) {
        await hydrate(data.session);
        return { user: merged, needsEmailConfirmation: false };
      }
      setUser(null);
      setStatus("guest");
      return { user: merged, needsEmailConfirmation: true };
    },
    [hydrate]
  );


  const loginWithGoogle = useCallback(async ({ redirectTo } = {}) => {
    // Only path-relative internal destinations are accepted; full URLs or
    // protocol-relative values fall back to /app so we can never bounce the
    // user to an attacker-controlled origin after OAuth.
    const next =
      typeof redirectTo === "string" &&
      redirectTo.startsWith("/") &&
      !redirectTo.startsWith("//") &&
      !redirectTo.startsWith("/\\")
        ? redirectTo
        : "/app";
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) throw new Error(error.message || "Unable to sign in with Google");
    return { ok: true };
  }, []);

  // Sign in as an anonymous Supabase user. Same user_id will survive
  // a later linkIdentity call, so any rows we wrote against this id
  // (profiles.persona_seed, etc.) follow the user into their permanent
  // account automatically. No-op when a session already exists.
  const signInAnonymously = useCallback(async ({ captchaToken } = {}) => {
    const { data: existing } = await supabase.auth.getSession();
    if (existing?.session?.access_token) {
      return { ok: true, existing: true };
    }
    const options = captchaToken ? { captchaToken } : undefined;
    const { data, error } = await supabase.auth.signInAnonymously(
      options ? { options } : undefined
    );
    if (error) {
      // Surface Supabase's status/code so the UI can distinguish a captcha
      // misconfiguration (400 with captcha_failed) from rate-limit / network
      // errors. The captcha-specific copy is added by the UI layer when it
      // sees this marker text.
      const parts = [
        error.message || "Unable to start anonymous session",
        error.code && `code=${error.code}`,
        error.status && `status=${error.status}`,
      ].filter(Boolean);
      throw new Error(parts.join(" "));
    }
    let session = data?.session;
    if (!session?.access_token) {
      // Supabase-js sometimes resolves before the session is persisted to
      // storage; re-read so callers can rely on an Authorization header
      // being available immediately after this resolves.
      const { data: reread } = await supabase.auth.getSession();
      session = reread?.session;
    }
    if (!session?.access_token) {
      throw new Error("Anonymous session was not created");
    }
    await hydrate(session);
    return { ok: true, existing: false };
  }, [hydrate]);

  // Promote the anonymous session into a Google-linked one. Supabase
  // updates `is_anonymous=false` on success. If the email is already
  // attached to another account we bubble that up so the caller can
  // route the user to a normal login flow instead.
  const linkGoogleIdentity = useCallback(async ({ redirectTo } = {}) => {
    const resolvedRedirect = redirectTo || `${window.location.origin}/app`;
    const { data, error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: resolvedRedirect },
    });
    if (error) {
      const message = error.message || "Unable to link Google";
      const conflict =
        /already|exists|linked/i.test(message) ||
        error.status === 409 ||
        error.code === "identity_already_exists";
      return { ok: false, conflict, error: message };
    }
    return { ok: true, data };
  }, []);
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStatus("guest");
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: backendUser } = await authApi.me();
      const { data } = await supabase.auth.getSession();
      const merged = mergeUser(data.session?.user, backendUser);
      setUser(merged);
      setStatus(data.session?.user ? "backend_authed" : "guest");
      return merged;
    } catch {
      return null;
    }
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message || "Unable to send reset link");
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message || "Unable to update password");
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthed: status === "session_authed" || status === "backend_authed",
      hasBackendSession: status === "backend_authed",
      isChecking: status === "checking",
      isAdmin: isAdminRole(user?.role),
      isSuperAdmin: user?.role === ROLES.SUPER_ADMIN,
      login,
      register,
      logout,
      loginWithGoogle,
      signInAnonymously,
      linkGoogleIdentity,
      refreshUser,
      sendPasswordReset,
      updatePassword,
      setUser,
    }),
    [
      user,
      status,
      login,
      register,
      logout,
      loginWithGoogle,
      signInAnonymously,
      linkGoogleIdentity,
      refreshUser,
      sendPasswordReset,
      updatePassword,
    ]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
