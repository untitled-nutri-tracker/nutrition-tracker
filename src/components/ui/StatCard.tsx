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
    <div className="rounded-xl border border-subtle bg-primary/5 px-3 py-2.5 transition-colors" style={style}>
      <div className="text-[11px] text-muted2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-lg font-extrabold leading-none ${accent ? "text-indigo-400" : "text-primary"}`}>
          {value}
        </span>
        {unit && <span className="text-[11px] text-muted2">{unit}</span>}
      </div>
      {detail && <div className="mt-1 text-[11px] text-muted2">{detail}</div>}
    </div>
  );
}