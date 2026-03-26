// src/pages/DailyLog.tsx
// Sprint 2.7 — Refactored to use ui component library

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDailyLog } from "../hooks/useDailyLog";
import { localDateString } from "../lib/foodLogStore";
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from "../types/foodLog";
import type { MealType } from "../types/foodLog";
import AddEntryModal from "../components/AddEntryModal";
import FoodEntryRow from "../components/FoodEntryRow";
import ProfileSummaryCard from "../components/ProfileSummaryCard";
import Button from "../components/ui/Button";
import StatCard from "../components/ui/StatCard";
import EmptyState from "../components/ui/EmptyState";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TODAY = localDateString();

function formatDisplayDate(dateStr: string): string {
  if (dateStr === TODAY) return "Today";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month:   "short",
    day:     "numeric",
  });
}

function prevDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return localDateString(d);
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return localDateString(d);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DailyLog() {
  const navigate = useNavigate();
  const {
    entries, date, setDate, totals,
    loading, saving, error,
    addEntry, removeEntry,
  } = useDailyLog();

  const [modalOpen, setModalOpen] = useState(false);

  const grouped = MEAL_TYPE_ORDER.reduce<Record<MealType, typeof entries>>(
    (acc, mt) => { acc[mt] = entries.filter((e) => e.mealType === mt); return acc; },
    { breakfast: [], lunch: [], dinner: [], snack: [] }
  );

  const isToday  = date === TODAY;
  const isFuture = date > TODAY;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {/* Profile summary */}
      <ProfileSummaryCard />

      {/* Error banner */}
      {error && (
        <div style={errorBannerStyle}>
          <span style={{ fontWeight: 600 }}>Error</span> — {error}
        </div>
      )}

      {/* Date nav + Add button */}
      <div style={dateNavRowStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDate(prevDay(date))}
            style={{ fontSize: 16, padding: "3px 10px" }}
          >
            ‹
          </Button>

          <span style={dateTextStyle}>{formatDisplayDate(date)}</span>

          <Button
            variant="secondary"
            size="sm"
            disabled={isToday}
            onClick={() => setDate(nextDay(date))}
            style={{ fontSize: 16, padding: "3px 10px" }}
          >
            ›
          </Button>

          {!isToday && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDate(TODAY)}
              style={{
                color:       "rgba(124,92,255,0.9)",
                borderColor: "rgba(124,92,255,0.3)",
                background:  "rgba(124,92,255,0.10)",
                border:      "1px solid rgba(124,92,255,0.3)",
              }}
            >
              Jump to today
            </Button>
          )}
        </div>

        <Button
          variant="primary"
          onClick={() => navigate("/log")}
          disabled={isFuture || saving}
          iconLeft="🔍"
        >
          Search Food
        </Button>
      </div>

      {/* Daily totals bar — only shown when there are entries */}
      {entries.length > 0 && (
        <div style={totalsGridStyle}>
          <StatCard label="Calories" value={totals.calories} unit="kcal" accent />
          <StatCard label="Protein"  value={totals.proteinG} unit="g" />
          <StatCard label="Carbs"    value={totals.carbsG}   unit="g" />
          <StatCard label="Fat"      value={totals.fatG}     unit="g" />
          <StatCard label="Entries"  value={totals.entryCount} />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={cardStyle}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <EmptyState
          icon={isFuture ? "📅" : "🍽️"}
          title={isFuture ? "No entries for a future date" : "No entries yet"}
          description={
            isFuture
              ? "Navigate back to today to start logging."
              : "Tap \"Add food\" to log your first meal."
          }
          action={
            !isFuture
              ? { label: "+ Add food", onClick: () => setModalOpen(true) }
              : undefined
          }
        />
      )}

      {/* Meal type groups */}
      {!loading && MEAL_TYPE_ORDER.map((mt) => {
        const group = grouped[mt];
        if (group.length === 0) return null;
        const groupCals = group.reduce((sum, e) => sum + e.calories, 0);

        return (
          <div key={mt} style={cardStyle}>
            {/* Group header */}
            <div style={groupHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={mealIconStyle}>{MEAL_TYPE_ICONS[mt]}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {MEAL_TYPE_LABELS[mt]}
                </span>
              </div>
              <span style={groupCalStyle}>{groupCals} kcal</span>
            </div>

            {/* Entry rows */}
            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              {group.map((entry) => (
                <FoodEntryRow
                  key={entry.id}
                  entry={entry}
                  onDelete={removeEntry}
                  deleting={saving}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Add entry modal */}
      <AddEntryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addEntry}
        saving={saving}
      />

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  border:       "1px solid var(--border)",
  background:   "rgba(255,255,255,0.04)",
  borderRadius: 14,
  padding:      "14px 16px",
};

const errorBannerStyle: React.CSSProperties = {
  ...cardStyle,
  border:     "1px solid rgba(255,80,80,0.35)",
  background: "rgba(255,80,80,0.08)",
  fontSize:   13,
};

const dateNavRowStyle: React.CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  gap:            12,
};

const dateTextStyle: React.CSSProperties = {
  fontSize:  14,
  fontWeight: 700,
  minWidth:  90,
  textAlign: "center",
};

const totalsGridStyle: React.CSSProperties = {
  display:             "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap:                 10,
};

const groupHeaderStyle: React.CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
};

const mealIconStyle: React.CSSProperties = {
  fontSize:     16,
  lineHeight:   1,
  background:   "rgba(255,255,255,0.06)",
  border:       "1px solid var(--border)",
  borderRadius: 8,
  padding:      "4px 6px",
};

const groupCalStyle: React.CSSProperties = {
  fontSize:   12,
  fontWeight: 600,
  color:      "var(--muted)",
};