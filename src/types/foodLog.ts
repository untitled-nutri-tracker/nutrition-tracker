// src/types/foodLog.ts
// Sprint 2.1 — Food log type definitions
// Aligns with the SQLite schema (meals + meal_items + foods tables)
// so switching USE_TAURI only requires changing the store layer.

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch:     "Lunch",
  dinner:    "Dinner",
  snack:     "Snack",
};

export const MEAL_TYPE_ICONS: Record<MealType, string> = {
  breakfast: "🌅",
  lunch:     "☀️",
  dinner:    "🌙",
  snack:     "🍎",
};

/** Ordered for display in the daily log */
export const MEAL_TYPE_ORDER: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

/**
 * A single food entry in the daily log.
 * Flat/denormalized — mirrors what the UI needs from a
 *   JOIN meals + meal_items + foods + nutrition_facts query.
 */
export interface FoodEntry {
  /** UUID generated client-side via crypto.randomUUID() */
  id: string;
  /** Local date string YYYY-MM-DD */
  date: string;
  mealType: MealType;
  foodName: string;
  brand?: string;
  calories: number; // kcal
  proteinG: number; // grams
  carbsG: number;   // grams
  fatG: number;     // grams
  /** Human-readable serving, e.g. "1 cup (240 ml)" */
  servingDesc?: string;
  notes?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Computed aggregate for a given day */
export interface DailyTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entryCount: number;
}

/** The form data before we stamp id/timestamps */
export type FoodEntryDraft = Omit<FoodEntry, "id" | "createdAt" | "updatedAt">;

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function zeroDailyTotals(): DailyTotals {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 };
}

export function sumEntries(entries: FoodEntry[]): DailyTotals {
  const sum = entries.reduce<DailyTotals>(
    (acc, e) => ({
      calories:   acc.calories   + e.calories,
      proteinG:   acc.proteinG   + e.proteinG,
      carbsG:     acc.carbsG     + e.carbsG,
      fatG:       acc.fatG       + e.fatG,
      entryCount: acc.entryCount + 1,
    }),
    zeroDailyTotals()
  );
  
  return {
    calories: Math.round(sum.calories),
    proteinG: Math.round(sum.proteinG),
    carbsG: Math.round(sum.carbsG),
    fatG: Math.round(sum.fatG),
    entryCount: sum.entryCount,
  };
}