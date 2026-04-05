// src/pages/DailyLog.tsx
// Sprint 2.7 — Refactored to use ui component library

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDailyLog } from "../hooks/useDailyLog";
import { localDateString, loadEntriesByDate } from "../lib/foodLogStore";
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from "../types/foodLog";
import type { MealType } from "../types/foodLog";
import AddEntryModal from "../components/AddEntryModal";
import FoodEntryRow from "../components/FoodEntryRow";
import ProfileSummaryCard from "../components/ProfileSummaryCard";
import Button from "../components/ui/Button";
import StatCard from "../components/ui/StatCard";
import EmptyState from "../components/ui/EmptyState";
import Confetti from "react-confetti";

// ── Streak Card ───────────────────────────────────────────────────────────────

function StreakCard() {
  const [streak, setStreak] = useState(0);
  const [weekMap, setWeekMap] = useState<boolean[]>([]);
  const [bestStreak, setBestStreak] = useState(() => {
    return parseInt(localStorage.getItem('nutrilog_best_streak') || '0', 10);
  });

  useEffect(() => {
    async function compute() {
      const today = new Date();
      const days: boolean[] = [];
      let currentStreak = 0;
      let counting = true;

      // Check last 7 days for the heatmap + streak
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = localDateString(d);
        const entries = await loadEntriesByDate(dateStr);
        const hasEntries = entries.length > 0;
        days.push(hasEntries);
        if (counting && hasEntries) {
          currentStreak++;
        } else {
          counting = false;
        }
      }

      setWeekMap(days.reverse()); // oldest first
      setStreak(currentStreak);

      if (currentStreak > bestStreak) {
        setBestStreak(currentStreak);
        localStorage.setItem('nutrilog_best_streak', String(currentStreak));
      }
    }
    compute();
  }, []);

  const today = new Date();
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - 6);

  return (
    <div style={{
      border: '1px solid rgba(124,92,255,0.2)',
      background: 'rgba(124,92,255,0.04)',
      borderRadius: 14,
      padding: '12px 16px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: 16,
      alignItems: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: streak >= 3 ? '#10b981' : streak >= 1 ? '#fbbf24' : 'var(--muted2)', lineHeight: 1 }}>
          {streak}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>day streak</div>
        <div style={{ fontSize: 18, marginTop: 2 }}>{streak >= 7 ? '🔥' : streak >= 3 ? '⭐' : '🌱'}</div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(124,92,255,0.9)' }}>Logging Streak</span>
          <span style={{ fontSize: 10, color: 'var(--muted2)' }}>Best: {bestStreak} days</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {weekMap.map((logged, i) => {
            const d = new Date(startDay);
            d.setDate(d.getDate() + i);
            const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
            return (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--muted2)', marginBottom: 2 }}>{label}</div>
                <div style={{
                  width: 24, height: 24, borderRadius: 6, margin: '0 auto',
                  background: logged ? 'rgba(16, 185, 129, 0.7)' : 'rgba(255,255,255,0.06)',
                  border: logged ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: logged ? '#fff' : 'var(--muted2)',
                }}>
                  {logged ? '✓' : '·'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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

// ── Scoring ───────────────────────────────────────────────────────────────────

interface MacroTargets { calories: number; proteinG: number; carbsG: number; fatG: number; }

function getTargets(): MacroTargets {
  const goal = localStorage.getItem('nutrilog_goal') || 'maintenance';
  let cal = 2000, pro = 75, carb = 250, fat = 65;
  try {
    const raw = localStorage.getItem('nutrilog.userProfile.v1');
    if (raw) {
      const p = JSON.parse(raw);
      const w = p.weightKg || 70;
      const actMult: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
      const mult = actMult[p.activityLevel] || 1.55;
      const bmr = p.sex === 'male'
        ? 10 * w + 6.25 * (p.heightCm || 170) - 5 * (p.age || 30) + 5
        : 10 * w + 6.25 * (p.heightCm || 160) - 5 * (p.age || 30) - 161;
      const tdee = bmr * mult;
      if (goal === 'weight_loss') { cal = tdee - 400; pro = w * 1.4; }
      else if (goal === 'muscle_gain') { cal = tdee + 300; pro = w * 1.8; }
      else { cal = tdee; pro = w * 1.2; }
      carb = (cal * 0.45) / 4; fat = (cal * 0.25) / 9;
    }
  } catch { /* defaults */ }
  return { calories: Math.round(cal), proteinG: Math.round(pro), carbsG: Math.round(carb), fatG: Math.round(fat) };
}

function computeScore(totals: { calories: number; proteinG: number; carbsG: number; fatG: number }, targets: MacroTargets): number {
  if (totals.calories === 0) return 0;
  const sc = (a: number, t: number) => {
    if (t === 0) return 25;
    const d = Math.abs(1 - a / t);
    return d <= 0.1 ? 25 : d <= 0.2 ? 20 : d <= 0.35 ? 15 : d <= 0.5 ? 10 : 5;
  };
  return sc(totals.calories, targets.calories) + sc(totals.proteinG, targets.proteinG) + sc(totals.carbsG, targets.carbsG) + sc(totals.fatG, targets.fatG);
}

function scoreToGrade(score: number) {
  if (score >= 90) return { letter: 'A', color: '#10b981', emoji: '🏆' };
  if (score >= 75) return { letter: 'B', color: '#34d399', emoji: '💪' };
  if (score >= 60) return { letter: 'C', color: '#fbbf24', emoji: '👍' };
  if (score >= 40) return { letter: 'D', color: '#f97316', emoji: '⚠️' };
  return { letter: 'F', color: '#ef4444', emoji: '🔻' };
}

function MacroBar({ label, actual, target, unit }: { label: string; actual: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 150) : 0;
  const barColor = pct > 110 ? '#f97316' : pct >= 80 ? '#10b981' : '#fbbf24';
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--muted2)' }}>{Math.round(actual)}/{target}{unit}</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function NutriScoreCard({ totals }: { totals: { calories: number; proteinG: number; carbsG: number; fatG: number } }) {
  const targets = getTargets();
  const score = computeScore(totals, targets);
  const grade = scoreToGrade(score);
  return (
    <div style={{ border: `1px solid ${grade.color}33`, background: `${grade.color}08`, borderRadius: 14, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: grade.color, lineHeight: 1 }}>{grade.letter}</div>
        <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>{score}/100</div>
        <div style={{ fontSize: 16, marginTop: 2 }}>{grade.emoji}</div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: grade.color }}>Daily Nutrition Score</div>
        <MacroBar label="Calories" actual={totals.calories} target={targets.calories} unit="kcal" />
        <MacroBar label="Protein" actual={totals.proteinG} target={targets.proteinG} unit="g" />
        <MacroBar label="Carbs" actual={totals.carbsG} target={targets.carbsG} unit="g" />
        <MacroBar label="Fat" actual={totals.fatG} target={targets.fatG} unit="g" />
      </div>
    </div>
  );
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

  const targets = getTargets();
  const showConfetti = !loading && entries.length > 0 && 
    (Math.abs(totals.calories - targets.calories) < targets.calories * 0.05);

  const isToday  = date === TODAY;
  const isFuture = date > TODAY;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter" style={{ display: "grid", gap: 14 }}>
      {showConfetti && <Confetti recycle={false} numberOfPieces={300} style={{ position: 'fixed', left: 0, top: 0, zIndex: 9999, pointerEvents: 'none' }} />}

      {/* Profile summary */}
      <div className="pop-in">
        <ProfileSummaryCard />
      </div>

      {/* Streak tracker */}
      <div className="pop-in-delay-1">
        <StreakCard />
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorBannerStyle}>
          <span style={{ fontWeight: 600 }}>Error</span> — {error}
        </div>
      )}

      {/* Date nav + Add button */}
      <div className="pop-in-delay-2" style={dateNavRowStyle}>
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
          onClick={() => navigate("/log", { state: { date } })}
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

      {/* Daily Nutrition Score */}
      {entries.length > 0 && (
        <div className="pop-in-delay-3">
          <NutriScoreCard totals={totals} />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="pop-in" style={{ display: "grid", gap: 14 }}>
          <div className="skeleton" style={{ height: 110 }} />
          <div className="skeleton" style={{ height: 80 }} />
          <div className="skeleton" style={{ height: 160 }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <EmptyState
          icon={isFuture ? "📅" : "🍽️"}
          title={isFuture ? "No entries for a future date" : "Let's Get Started!"}
          description={
            isFuture
              ? "Navigate back to today to start logging."
              : "What are you having today?"
          }
        >
          {!isFuture && (
            <Button onClick={() => navigate("/log", { state: { date } })} iconLeft="🔍" size="sm">
              Search & Log Food
            </Button>
          )}
        </EmptyState>
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