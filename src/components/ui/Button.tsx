// src/components/ui/Button.tsx
// Sprint 2.7 — Reusable button component (Converted to Tailwind, Theme Aware)

import React from "react";
import { CircleNotch } from "@phosphor-icons/react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize    = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  iconLeft?: React.ReactNode;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1.5 rounded-lg",
  md: "text-[13px] px-3.5 py-2.5 rounded-xl",
  lg: "text-sm px-4 py-3 rounded-2xl",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 text-emerald-600 dark:text-emerald-50 hover:from-emerald-500/30 hover:to-cyan-500/15 shadow-[0_4px_14px_-6px_rgba(16,185,129,0.3)]",
  secondary: "border-subtle bg-primary/5 text-primary hover:bg-primary/10",
  ghost: "border-transparent bg-transparent text-muted hover:bg-primary/5 hover:text-primary",
  danger: "border-red-500/35 bg-red-500/10 text-red-500 hover:bg-red-500/20",
};

export default function Button({
  className = "",
  variant =   "primary",
  size =      "md",
  loading =   false,
  disabled,
  iconLeft,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold border transition-all duration-200 outline-none whitespace-nowrap select-none active:scale-[0.98] ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${isDisabled ? "opacity-50 cursor-not-allowed active:scale-100" : "cursor-pointer"} ${className}`}
      {...rest}
    >
      {loading ? (
        <CircleNotch weight="bold" className="animate-spin opacity-70" />
      ) : (
        iconLeft && <span className="leading-none">{iconLeft}</span>
      )}
      {children}
    </button>
  );
}