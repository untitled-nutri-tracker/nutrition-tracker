// src/components/ui/Button.tsx
// Sprint 2.7 — Reusable button component

import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize    = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  iconLeft?: React.ReactNode;
}

const BASE: React.CSSProperties = {
  display:        "inline-flex",
  alignItems:     "center",
  justifyContent: "center",
  gap:            6,
  fontFamily:     "inherit",
  fontWeight:     600,
  border:         "1px solid transparent",
  borderRadius:   11,
  cursor:         "pointer",
  transition:     "opacity .12s ease",
  whiteSpace:     "nowrap",
  outline:        "none",
};

const SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { fontSize: 12, padding: "5px 10px",  borderRadius: 9  },
  md: { fontSize: 13, padding: "9px 14px",  borderRadius: 11 },
  lg: { fontSize: 14, padding: "11px 18px", borderRadius: 13 },
};

const VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background:  "linear-gradient(135deg, rgba(124,92,255,0.80), rgba(0,209,255,0.50))",
    borderColor: "rgba(124,92,255,0.42)",
    color:       "rgba(255,255,255,0.95)",
  },
  secondary: {
    background:  "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.13)",
    color:       "rgba(255,255,255,0.85)",
  },
  ghost: {
    background:  "transparent",
    borderColor: "transparent",
    color:       "rgba(255,255,255,0.55)",
  },
  danger: {
    background:  "rgba(255,75,75,0.13)",
    borderColor: "rgba(255,75,75,0.35)",
    color:       "rgba(255,120,120,0.95)",
  },
};

export default function Button({
  variant  = "primary",
  size     = "md",
  loading  = false,
  disabled,
  iconLeft,
  children,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      style={{
        ...BASE,
        ...SIZES[size],
        ...VARIANTS[variant],
        opacity: isDisabled ? 0.5 : 1,
        cursor:  isDisabled ? "not-allowed" : "pointer",
        ...style,
      }}
      {...rest}
    >
      {loading
        ? <span style={{ opacity: 0.7, fontSize: 12 }}>⏳</span>
        : iconLeft && <span style={{ lineHeight: 1 }}>{iconLeft}</span>
      }
      {children}
    </button>
  );
}