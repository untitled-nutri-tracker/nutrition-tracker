// src/lib/ToastContext.tsx
// Sprint 5.6 — Global toast notification system

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        pointerEvents: "none",
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              animation: "fadeSlideUp 0.25s ease",
              pointerEvents: "auto",
              border: "1px solid",
              ...(t.type === "success" ? {
                background: "rgba(40,180,100,0.85)",
                borderColor: "rgba(40,180,100,0.5)",
              } : t.type === "error" ? {
                background: "rgba(220,60,60,0.85)",
                borderColor: "rgba(220,60,60,0.5)",
              } : {
                background: "rgba(30,30,40,0.90)",
                borderColor: "rgba(255,255,255,0.12)",
              }),
            }}
          >
            {t.type === "success" ? "✅ " : t.type === "error" ? "⚠️ " : "ℹ️ "}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}