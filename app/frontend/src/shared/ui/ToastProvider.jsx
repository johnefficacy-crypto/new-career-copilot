import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

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

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(() => ({
    showToast,
    success: (message) => showToast({ type: "success", message }),
    error: (message) => showToast({ type: "error", message }),
    info: (message) => showToast({ type: "info", message }),
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] w-[min(24rem,calc(100vw-2rem))] space-y-2" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }) {
  const isSuccess = toast.type === "success";
  const isError = toast.type === "error";
  const Icon = isSuccess ? CheckCircle2 : isError ? AlertTriangle : Info;
  const tone = isSuccess
    ? "border-sage-200 bg-sage-600 text-white"
    : isError
      ? "border-destructive/30 bg-destructive text-white"
      : "border-foreground/10 bg-foreground text-background";

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-sm shadow-lg ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-5">{toast.message}</div>
      <button
        type="button"
        className="rounded-md p-0.5 opacity-80 transition hover:opacity-100"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
