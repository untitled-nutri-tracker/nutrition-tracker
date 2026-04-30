// src/pages/DailyLog.tsx
// Sprint 2.7 — Refactored to use ui component library

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CaretLeft, CaretRight, Fire, Leaf, MagnifyingGlass, ShootingStar } from "@phosphor-icons/react";
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
    <div className="grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/8 px-4 py-3">
      <div className="text-center">
        <div className={`text-[28px] font-extrabold leading-none ${streak >= 3 ? "text-emerald-400" : streak >= 1 ? "text-amber-300" : "text-muted2"}`}>
          {streak}
        </div>
        <div className="mt-0.5 text-[10px] text-muted2">day streak</div>
        <div className="mt-1 inline-flex items-center justify-center rounded-lg border border-primary/10 bg-primary/5 p-1 text-muted">
          {streak >= 7 ? <Fire size={16} weight="fill" className="text-rose-300" /> : streak >= 3 ? <ShootingStar size={16} weight="fill" className="text-amber-300" /> : <Leaf size={16} weight="fill" className="text-emerald-300" />}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-300/95">Logging Streak</span>
          <span className="text-[10px] text-muted2">Best: {bestStreak} days</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekMap.map((logged, i) => {
            const d = new Date(startDay);
            d.setDate(d.getDate() + i);
            const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
            return (
              <div key={i} className="text-center">
                <div className="mb-0.5 text-[9px] text-muted2">{label}</div>
                <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border text-[10px] ${logged ? "border-emerald-400/45 bg-emerald-400/70 text-primary" : "border-primary/10 bg-primary/5 text-muted2"}`}>
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
  if (score >= 90) return { letter: '', toneClass: 'border-emerald-400/20 bg-emerald-500/8', textClass: 'text-emerald-300' };
  if (score >= 75) return { letter: '', toneClass: 'border-emerald-300/20 bg-emerald-400/8', textClass: 'text-emerald-200' };
  if (score >= 60) return { letter: '', toneClass: 'border-amber-300/25 bg-amber-400/10', textClass: 'text-amber-300' };
  if (score >= 40) return { letter: '', toneClass: 'border-orange-300/25 bg-orange-500/10', textClass: 'text-orange-300' };
  return { letter: '', toneClass: 'border-red-400/30 bg-red-500/10', textClass: 'text-red-300' };
}

function MacroBar({ label, actual, target, unit }: { label: string; actual: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 150) : 0;
  const barColorClass = pct > 110 ? 'bg-orange-400' : pct >= 80 ? 'bg-emerald-400' : 'bg-amber-300';
  return (
    <div className="text-xs">
      <div className="mb-0.5 flex justify-between">
        <span>{label}</span>
        <span className="text-muted2">{Math.round(actual)}/{target}{unit}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-primary/10">
        <div style={{ width: `${Math.min(pct, 100)}%` }} className={`h-full rounded transition-[width] duration-400 ${barColorClass}`} />
      </div>
    </div>
  );
}

function NutriScoreCard({ totals }: { totals: { calories: number; proteinG: number; carbsG: number; fatG: number } }) {
  const targets = getTargets();
  const score = computeScore(totals, targets);
  const grade = scoreToGrade(score);
  return (
    <div className={`grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl border px-4 py-3.5 ${grade.toneClass}`}>
      <div className="text-center">
        <div className={`text-4xl font-extrabold leading-none ${grade.textClass}`}>{grade.letter}</div>
        <div className="mt-0.5 text-[11px] text-muted2">{score}/100</div>
        <div className="mt-1 inline-flex items-center justify-center rounded-md border border-primary/10 bg-primary/5 p-1">
          {score >= 90 ? <Fire size={14} weight="fill" className="text-emerald-300" /> : score >= 60 ? <ShootingStar size={14} weight="fill" className="text-amber-300" /> : <Leaf size={14} weight="fill" className="text-rose-300" />}
        </div>
      </div>
      <div className="grid gap-2">
        <div className={`text-[13px] font-bold ${grade.textClass}`}>Daily Nutrition Score</div>
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
    <div className="page-enter mx-auto flex w-full max-w-[1000px] flex-col gap-4 p-4 pb-[calc(var(--shell-mobile-content-padding)+1rem)] md:p-8 md:pb-8">
      {showConfetti && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <Confetti recycle={false} numberOfPieces={300} width={window.innerWidth} height={window.innerHeight} />
        </div>
      )}

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
        <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-primary">Error</span> — {error}
        </div>
      )}

      {/* Date nav + Add button */}
      <div className="pop-in-delay-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDate(prevDay(date))}
            className="max-sm:min-h-[40px]"
            iconLeft={<CaretLeft size={14} weight="bold" />}
          >
            Prev
          </Button>

          <span className="min-w-[90px] text-center text-sm font-bold">{formatDisplayDate(date)}</span>

          <Button
            variant="secondary"
            size="sm"
            disabled={isToday}
            onClick={() => setDate(nextDay(date))}
            className="max-sm:min-h-[40px]"
            iconLeft={<CaretRight size={14} weight="bold" />}
          >
            Next
          </Button>

          {!isToday && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDate(TODAY)}
              className="border border-emerald-400/35 bg-emerald-500/10 text-emerald-300"
            >
              Jump to today
            </Button>
          )}
        </div>

        <Button
          variant="primary"
          onClick={() => navigate("/log", { state: { date } })}
          disabled={isFuture || saving}
          iconLeft={<MagnifyingGlass size={14} weight="bold" />}
        >
          Search Food
        </Button>
      </div>

      {/* Daily totals bar — only shown when there are entries */}
      {entries.length > 0 && (
        <div className="grid grid-cols-5 gap-2.5">
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
        <div className="pop-in grid gap-3.5">
          <div className="skeleton h-[110px]" />
          <div className="skeleton h-[80px]" />
          <div className="skeleton h-[160px]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <EmptyState
          icon={isFuture ? <CaretRight size={24} weight="duotone" /> : <MagnifyingGlass size={24} weight="duotone" />}
          title={isFuture ? "No entries for a future date" : "Let's Get Started!"}
          description={
            isFuture
              ? "Navigate back to today to start logging."
              : "What are you having today?"
          }
        >
          {!isFuture && (
            <Button onClick={() => navigate("/log", { state: { date } })} iconLeft={<MagnifyingGlass size={14} weight="bold" />} size="sm">
              Search & Log Food
            </Button>
          )}
        </EmptyState>
      )}

      {/* Meal type groups */}
      {!loading && MEAL_TYPE_ORDER.map((mt) => {
        const group = grouped[mt];
        if (group.length === 0) return null;
        const groupCals = Math.round(group.reduce((sum, e) => sum + e.calories, 0));

        return (
          <div key={mt} className="card pop-in">
            {/* Group header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-primary/10 bg-primary/5 px-1.5 py-1 text-base leading-none">{MEAL_TYPE_ICONS[mt]}</span>
                <span className="text-sm font-bold">
                  {MEAL_TYPE_LABELS[mt]}
                </span>
              </div>
              <span className="text-xs font-semibold text-muted2">{groupCals} kcal</span>
            </div>

            {/* Entry rows */}
            <div className="mt-2.5 grid gap-1.5">
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