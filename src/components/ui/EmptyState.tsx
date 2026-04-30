// src/components/ui/EmptyState.tsx
// Sprint 2.7 — Reusable empty state placeholder
// Used in: DailyLog, Insights, AI Advisor

import React from "react";
import Button from "./Button";

interface EmptyStateProps {
  icon?:        React.ReactNode;
  title:        string;
  description?: string;
  /** Optional CTA button */
  action?:      {
    label:   string;
    onClick: () => void;
  };
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  style,
  children,
}: EmptyStateProps) {
  return (
    <div className="pop-in rounded-2xl border border-subtle bg-primary/5 px-4 py-8 text-center" style={style}>
      {icon && <div className="mb-2.5 text-2xl text-primary">{icon}</div>}
      <div className="text-sm font-semibold text-primary">{title}</div>
      {description && (
        <div className="mt-1.5 text-xs text-muted">{description}</div>
      )}
      {action && (
        <div className="mt-3.5">
          <Button onClick={action.onClick} size="sm">
            {action.label}
          </Button>
        </div>
      )}
      {children && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}