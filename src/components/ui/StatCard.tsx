// src/components/ui/StatCard.tsx
// Sprint 2.7 — Reusable stat/metric display card
// Used in: DailyLog totals bar, ProfileSummaryCard, Insights dashboard

import React from "react";

interface StatCardProps {
  label:     string;
  value:     string | number;
  unit?:     string;
  /** Highlight the value in accent colour */
  accent?:   boolean;
  /** Optional small detail line below the value */
  detail?:   string;
  style?:    React.CSSProperties;
}

export default function StatCard({
  label,
  value,
  unit,
  accent = false,
  detail,
  style,
}: StatCardProps) {
  return (
    <div style={{ ...cardStyle, ...style }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 4 }}>
        <span
          style={{
            ...valueStyle,
            color: accent ? "rgba(124,92,255,0.95)" : "var(--text)",
          }}
        >
          {value}
        </span>
        {unit && <span style={unitStyle}>{unit}</span>}
      </div>
      {detail && <div style={detailStyle}>{detail}</div>}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  border:       "1px solid var(--border)",
  borderRadius: 12,
  padding:      "10px 12px",
  background:   "rgba(255,255,255,0.03)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color:    "var(--muted2)",
};

const valueStyle: React.CSSProperties = {
  fontSize:   18,
  fontWeight: 800,
  lineHeight: 1,
};

const unitStyle: React.CSSProperties = {
  fontSize: 11,
  color:    "var(--muted2)",
};

const detailStyle: React.CSSProperties = {
  fontSize:  11,
  color:     "var(--muted2)",
  marginTop: 3,
};