import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth as authApi, setToken, getToken } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking"); // checking | authed | guest

  const bootstrap = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setStatus("guest");
      return;
    }
    try {
      const { user } = await authApi.me();
      setUser(user);
      setStatus("authed");
    } catch (err) {
      setToken(null);
      setUser(null);
      setStatus("guest");
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    setToken(data.access_token);
    setUser(data.user);
    setStatus("authed");
    return data.user;
  }, []);

  const register = useCallback(async ({ email, password, name }) => {
    const data = await authApi.register({ email, password, name });
    setToken(data.access_token);
    setUser(data.user);
    setStatus("authed");
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // ignore
    }
    setToken(null);
    setUser(null);
    setStatus("guest");
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setUser(user);
      return user;
    } catch (err) {
      setToken(null);
      setUser(null);
      setStatus("guest");
      return null;
    }
  }, []);

  const value = {
    user,
    status,
    isAuthed: status === "authed",
    isChecking: status === "checking",
    isAdmin: user && (user.role === "admin" || user.role === "super_admin"),
    isSuperAdmin: user && user.role === "super_admin",
    login,
    register,
    logout,
    refreshUser,
    setUser,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
