// src/components/ui/EmptyState.tsx
// Sprint 2.7 — Reusable empty state placeholder
// Used in: DailyLog, Insights, AI Advisor

import React from "react";
import Button from "./Button";

interface EmptyStateProps {
  icon?:        string;
  title:        string;
  description?: string;
  /** Optional CTA button */
  action?:      {
    label:   string;
    onClick: () => void;
  };
  style?: React.CSSProperties;
}

export default function EmptyState({
  icon  = "🍽️",
  title,
  description,
  action,
  style,
}: EmptyStateProps) {
  return (
    <div style={{ ...containerStyle, ...style }}>
      <div style={iconStyle}>{icon}</div>
      <div style={titleStyle}>{title}</div>
      {description && (
        <div style={descStyle}>{description}</div>
      )}
      {action && (
        <div style={{ marginTop: 14 }}>
          <Button onClick={action.onClick} size="sm">
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  border:       "1px solid var(--border)",
  background:   "rgba(255,255,255,0.04)",
  borderRadius: 14,
  padding:      "32px 16px",
  textAlign:    "center",
};

const iconStyle: React.CSSProperties = {
  fontSize:     28,
  marginBottom: 10,
  lineHeight:   1,
};

const titleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize:   14,
  color:      "var(--text)",
};

const descStyle: React.CSSProperties = {
  color:     "var(--muted)",
  fontSize:  12,
  marginTop: 6,
};