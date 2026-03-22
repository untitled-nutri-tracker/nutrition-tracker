// src/components/ui/Modal.tsx
// Sprint 2.7 — Reusable modal dialog

import React, { useEffect } from "react";

interface ModalProps {
  open:       boolean;
  onClose:    () => void;
  title?:     string;
  children:   React.ReactNode;
  footer?:    React.ReactNode;
  maxWidth?:  number | string;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 520,
}: ModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...dialogStyle, maxWidth }}>

        {/* Header */}
        {title && (
          <div style={headerStyle}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
            <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
          </div>
        )}

        {/* Body */}
        <div style={bodyStyle}>{children}</div>

        {/* Footer */}
        {footer && <div style={footerStyle}>{footer}</div>}

      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position:       "fixed",
  inset:          0,
  zIndex:         1000,
  background:     "rgba(0,0,0,0.65)",
  backdropFilter: "blur(6px)",
  display:        "grid",
  placeItems:     "center",
  padding:        16,
};

const dialogStyle: React.CSSProperties = {
  width:        "100%",
  background:   "linear-gradient(160deg, #16181f, #0f111a)",
  border:       "1px solid rgba(255,255,255,0.12)",
  borderRadius: 18,
  boxShadow:    "0 32px 80px rgba(0,0,0,0.55)",
  overflow:     "hidden",
};

const headerStyle: React.CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  padding:        "14px 16px",
  borderBottom:   "1px solid rgba(255,255,255,0.08)",
};

export const bodyStyle: React.CSSProperties = {
  padding:   "16px",
  maxHeight: "62vh",
  overflowY: "auto",
};

export const footerStyle: React.CSSProperties = {
  display:        "flex",
  justifyContent: "flex-end",
  gap:            8,
  padding:        "12px 16px",
  borderTop:      "1px solid rgba(255,255,255,0.08)",
};

const closeBtnStyle: React.CSSProperties = {
  background:   "transparent",
  border:       "none",
  color:        "rgba(255,255,255,0.4)",
  cursor:       "pointer",
  fontSize:     13,
  padding:      "4px 6px",
  borderRadius: 6,
  lineHeight:   1,
};