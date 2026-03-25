// src/components/ui/Input.tsx
// Sprint 2.7 — Reusable input / select component

import React from "react";

// ── Shared field wrapper ──────────────────────────────────────────────────────

interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?:  string;
  children: React.ReactNode;
}

export function FieldWrapper({ label, error, hint, children }: FieldWrapperProps) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      {label && (
        <span style={labelStyle}>{label}</span>
      )}
      {children}
      {error && <span style={errorStyle}>{error}</span>}
      {hint && !error && <span style={hintStyle}>{hint}</span>}
    </label>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?:  string;
}

export default function Input({ label, error, hint, style, ...rest }: InputProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <input
        style={{
          ...fieldStyle,
          ...(error ? { borderColor: "rgba(255,80,80,0.55)" } : {}),
          ...style,
        }}
        {...rest}
      />
    </FieldWrapper>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
  children: React.ReactNode;
}

export function Select({ label, error, hint, children, style, ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <select
        style={{
          ...fieldStyle,
          ...(error ? { borderColor: "rgba(255,80,80,0.55)" } : {}),
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

export const fieldStyle: React.CSSProperties = {
  width:        "100%",
  padding:      "9px 12px",
  borderRadius: 11,
  border:       "1px solid var(--border)",
  background:   "rgba(255,255,255,0.05)",
  color:        "var(--text)",
  font:         "inherit",
  fontSize:     13,
  outline:      "none",
};

const labelStyle: React.CSSProperties = {
  fontSize:   12,
  color:      "var(--muted2)",
  fontWeight: 500,
};

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color:    "rgba(255,110,110,0.9)",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color:    "var(--muted2)",
};