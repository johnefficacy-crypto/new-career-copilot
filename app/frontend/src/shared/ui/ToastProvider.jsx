import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(({ type = "info", message }) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const value = useMemo(() => ({
    showToast,
    success: (message) => showToast({ type: "success", message }),
    error: (message) => showToast({ type: "error", message }),
    info: (message) => showToast({ type: "info", message }),
  }), [showToast]);

  return <ToastContext.Provider value={value}>{children}<div className="fixed top-4 right-4 z-[100] space-y-2">{toasts.map((t) => <div key={t.id} className={`px-3 py-2 rounded-lg text-sm shadow ${t.type === "success" ? "bg-sage-600 text-white" : t.type === "error" ? "bg-destructive text-white" : "bg-foreground text-background"}`}>{t.message}</div>)}</div></ToastContext.Provider>;
}
