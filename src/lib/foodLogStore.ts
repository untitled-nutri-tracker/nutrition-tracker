// src/lib/foodLogStore.ts
// Sprint 2.1 — Persistence layer for food log entries
//
// Follows the exact same pattern as profileStore.ts:
//   USE_TAURI = true   →  Tauri IPC
//

import type { FoodEntry, FoodEntryDraft } from "../types/foodLog";
import {
  createFood,
  createMeal,
  createMealItem,
  createNutritionFacts,
  createServing,
  deleteMealItem,
  getNutritionFacts,
  listMealItemsByMeal,
  listMealsByDateRange,
} from "../generated";

// ── Config ────────────────────────────────────────────────────────────────────

const USE_TAURI = true;
const LS_PREFIX = "nutrilog.foodLog.v1";

// ── Internal helpers ──────────────────────────────────────────────────────────

function dayKey(date: string): string {
  return `${LS_PREFIX}.${date}`;
}

function isValidEntry(x: unknown): x is FoodEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id         === "string" &&
    typeof e.date       === "string" &&
    typeof e.foodName   === "string" &&
    typeof e.calories   === "number" &&
    typeof e.proteinG   === "number" &&
    typeof e.carbsG     === "number" &&
    typeof e.fatG       === "number"
  );
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Today's local date as YYYY-MM-DD */
export function localDateString(d: Date = new Date()): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Load all entries for a YYYY-MM-DD date. Returns [] when nothing found. */
export async function loadEntriesByDate(date: string): Promise<FoodEntry[]> {
  if (USE_TAURI) {
    const d = new Date(`${date}T00:00:00`);
    const start = Math.floor(d.getTime() / 1000);
    const end = start + 86400;

    const meals = await listMealsByDateRange({ start, end });
    const entries: FoodEntry[] = [];

    for (const meal of meals) {
      const items = await listMealItemsByMeal({ mealId: meal.id });
      for (const item of items) {
        const facts = await getNutritionFacts({ servingId: item.serving.id });
        
        entries.push({
          id: String(item.id),
          date: date,
          mealType: String(meal.mealType).toLowerCase() as any,
          foodName: item.food.name,
          brand: item.food.brand,
          calories: (facts?.CALORIES_KCAL || 0) * item.quantity,
          proteinG: (facts?.PROTEIN_G || 0) * item.quantity,
          carbsG: (facts?.TOTAL_CARBOHYDRATE_G || 0) * item.quantity,
          fatG: (facts?.FAT_G || 0) * item.quantity,
          servingDesc: item.serving ? `${item.quantity} ${item.serving.unit}` : undefined,
          notes: item.note,
          createdAt: new Date(item.createdAt * 1000).toISOString(),
          updatedAt: new Date(item.updatedAt * 1000).toISOString(),
        });
      }
    }
    return entries;
  }

  const raw = localStorage.getItem(dayKey(date));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/** Create a new manual entry using the backend database. */
export async function createEntry(draft: FoodEntryDraft & { date: string }): Promise<FoodEntry> {
  const nowStr = new Date().toISOString();
  
  if (USE_TAURI) {
    const d = new Date(`${draft.date}T12:00:00`);
    const ts = Math.floor(d.getTime() / 1000);
    
    // Create food
    const food = await createFood({
      food: {
        id: 0, name: draft.foodName, brand: draft.brand || "",
        category: "Manual", source: "user", refUrl: "", barcode: "",
        createdAt: ts, updatedAt: ts
      }
    });

    // Create serving
    const serving = await createServing({
      serving: {
        id: 0, food, amount: 1, unit: "SERVING", gramsEquiv: 100,
        isDefault: true, createdAt: ts, updatedAt: ts
      }
    });

    // Create nutrition facts
    await createNutritionFacts({
      nutritionFacts: {
        SERVING: serving,
        CALORIES_KCAL: draft.calories,
        FAT_G: draft.fatG, SATURATED_FAT_G: 0, TRANS_FAT_G: 0,
        CHOLESTEROL_MG: 0, SODIUM_MG: 0,
        TOTAL_CARBOHYDRATE_G: draft.carbsG, DIETARY_FIBER_G: 0, TOTAL_SUGARS_G: 0, ADDED_SUGARS_G: 0,
        PROTEIN_G: draft.proteinG,
        VITAMIN_D_MCG: 0, CALCIUM_MG: 0, IRON_MG: 0
      }
    });

    // Create Meal
    const meal = await createMeal({
      meal: {
        id: 0, occurredAt: ts, mealType: String(draft.mealType).toUpperCase() as any, 
        title: draft.mealType.charAt(0).toUpperCase() + draft.mealType.slice(1),
        note: "", createdAt: ts, updatedAt: ts
      }
    });

    // Create Meal Item
    const item = await createMealItem({
       mealItem: {
         id: 0, meal, food, serving, quantity: 1.0, note: draft.notes || "",
         createdAt: ts, updatedAt: ts
       }
    });

    return {
      id: String(item.id),
      date: draft.date,
      mealType: String(meal.mealType).toLowerCase() as any,
      foodName: food.name,
      brand: food.brand,
      calories: draft.calories,
      proteinG: draft.proteinG,
      carbsG: draft.carbsG,
      fatG: draft.fatG,
      servingDesc: "1 serving",
      notes: item.note,
      createdAt: new Date(item.createdAt * 1000).toISOString(),
      updatedAt: new Date(item.updatedAt * 1000).toISOString(),
    };
  }

  const existing = await loadEntriesByDate(draft.date);
  const entry: FoodEntry = { ...draft, id: newId(), createdAt: nowStr, updatedAt: nowStr };
  localStorage.setItem(dayKey(draft.date), JSON.stringify([...existing, entry]));
  return entry;
}

/** Delete an entry by id. (MealItem ID) */
export async function deleteEntry(id: string, date: string): Promise<void> {
  if (USE_TAURI) {
    const numericId = parseInt(id, 10);
    await deleteMealItem({ id: numericId });
    return;
  }

  const existing = await loadEntriesByDate(date);
  const updated  = existing.filter((e) => e.id !== id);
  if (updated.length === 0) {
    localStorage.removeItem(dayKey(date));
  } else {
    localStorage.setItem(dayKey(date), JSON.stringify(updated));
  }
}

/** Update an existing entry in-place. */
export async function updateEntry(entry: FoodEntry): Promise<FoodEntry> {
  if (USE_TAURI) {
    // Re-calculating full updates on the denormalized tree is extremely complex and currently unused by the UI.
    // For now, we will just return the entry. The PRD specifies only 'delete' is strictly needed for MVP.
    // In the future, this should invoke 'update_meal_item' etc.
    return entry;
  }

  const updated: FoodEntry = { ...entry, updatedAt: new Date().toISOString() };
  const existing = await loadEntriesByDate(entry.date);
  const list     = existing.map((e) => (e.id === entry.id ? updated : e));
  localStorage.setItem(dayKey(entry.date), JSON.stringify(list));
  return updated;
}

/**
 * Load entries for a date range (inclusive).
 */
export async function loadEntriesRange(
  startDate: string,
  endDate: string
): Promise<Record<string, FoodEntry[]>> {
  const result: Record<string, FoodEntry[]> = {};
  // Use T00:00:00 to parse as LOCAL midnight, not UTC
  const cur = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T23:59:59");
  while (cur <= end) {
    const d = localDateString(cur);
    result[d] = await loadEntriesByDate(d);
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}
