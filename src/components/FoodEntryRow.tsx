// src/components/FoodEntryRow.tsx
// Sprint 2.1 — Single row in the daily log entry list

import type { FoodEntry } from "../types/foodLog";

interface Props {
  entry: FoodEntry;
  onDelete: (id: string) => void;
  deleting?: boolean;
}

export default function FoodEntryRow({ entry, onDelete, deleting }: Props) {
  return (
    <div style={rowStyle}>

      {/* Left: name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={nameStyle}>{entry.foodName}</div>
        <div style={metaStyle}>
          {entry.brand && <span>{entry.brand} · </span>}
          {entry.servingDesc && <span>{entry.servingDesc} · </span>}
          <span style={macroChip}>{entry.proteinG}g protein</span>
          <span style={macroChip}>{entry.carbsG}g carbs</span>
          <span style={macroChip}>{entry.fatG}g fat</span>
        </div>
      </div>

      {/* Right: calories + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={calStyle}>
          <span style={calNum}>{entry.calories}</span>
          <span style={calLabel}>kcal</span>
        </div>
        <button
          onClick={() => onDelete(entry.id)}
          disabled={deleting}
          style={deleteBtnStyle}
          aria-label="Delete entry"
          title="Delete"
        >
          ✕
        </button>
      </div>

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display:      "flex",
  alignItems:   "center",
  gap:          12,
  padding:      "10px 12px",
  borderRadius: 11,
  border:       "1px solid rgba(255,255,255,0.06)",
  background:   "rgba(255,255,255,0.03)",
  transition:   "background .1s ease",
};

const nameStyle: React.CSSProperties = {
  fontSize:     13,
  fontWeight:   600,
  color:        "var(--text)",
  overflow:     "hidden",
  textOverflow: "ellipsis",
  whiteSpace:   "nowrap",
};

const metaStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize:  11,
  color:     "var(--muted2)",
  display:   "flex",
  flexWrap:  "wrap",
  gap:       4,
};

const macroChip: React.CSSProperties = {
  background:   "rgba(255,255,255,0.06)",
  border:       "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding:      "1px 5px",
};

const calStyle: React.CSSProperties = {
  display:       "flex",
  flexDirection: "column",
  alignItems:    "flex-end",
  lineHeight:    1.1,
};

const calNum: React.CSSProperties = {
  fontSize:   15,
  fontWeight: 800,
  color:      "var(--text)",
};

const calLabel: React.CSSProperties = {
  fontSize: 10,
  color:    "var(--muted2)",
  marginTop: 1,
};

const deleteBtnStyle: React.CSSProperties = {
  background:   "transparent",
  border:       "1px solid transparent",
  borderRadius: 8,
  color:        "rgba(255,255,255,0.25)",
  cursor:       "pointer",
  fontSize:     11,
  padding:      "4px 6px",
  transition:   "color .1s, border-color .1s",
  lineHeight:   1,
};