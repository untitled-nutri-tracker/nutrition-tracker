// src/lib/foodLogStore.ts
// Sprint 2.1 — Persistence layer for food log entries
//
// Follows the exact same pattern as profileStore.ts:
//   USE_TAURI = false  →  localStorage  (works right now, no Rust needed)
//   USE_TAURI = true   →  Tauri IPC     (flip when Shi implements commands)
//
// Tauri commands expected later (src-tauri/src/meal.rs):
//   list_entries_by_date(date: String) -> Vec<FoodEntry>
//   create_entry(entry: FoodEntry)     -> FoodEntry
//   delete_entry(id: String)           -> bool
//   update_entry(entry: FoodEntry)     -> FoodEntry

import type { FoodEntry, FoodEntryDraft } from "../types/foodLog";

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Flip to true once Shi's Rust commands are implemented.
 * Everything else in this file stays the same.
 */
const USE_TAURI = false;

/** localStorage key — version-scoped for easy future migrations */
const LS_PREFIX = "nutrilog.foodLog.v1";

// ── Internal helpers ──────────────────────────────────────────────────────────

function dayKey(date: string): string {
  return `${LS_PREFIX}.${date}`;
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
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
    return tauriInvoke<FoodEntry[]>("list_entries_by_date", { date });
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

/** Create a new entry — stamps id, createdAt, updatedAt automatically. */
export async function createEntry(draft: FoodEntryDraft): Promise<FoodEntry> {
  const now = new Date().toISOString();
  const entry: FoodEntry = { ...draft, id: newId(), createdAt: now, updatedAt: now };

  if (USE_TAURI) {
    return tauriInvoke<FoodEntry>("create_entry", { entry });
  }

  const existing = await loadEntriesByDate(entry.date);
  localStorage.setItem(dayKey(entry.date), JSON.stringify([...existing, entry]));
  return entry;
}

/** Delete an entry by id. */
export async function deleteEntry(id: string, date: string): Promise<void> {
  if (USE_TAURI) {
    await tauriInvoke<boolean>("delete_entry", { id });
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

/** Update an existing entry in-place. Bumps updatedAt. */
export async function updateEntry(entry: FoodEntry): Promise<FoodEntry> {
  const updated: FoodEntry = { ...entry, updatedAt: new Date().toISOString() };

  if (USE_TAURI) {
    return tauriInvoke<FoodEntry>("update_entry", { entry: updated });
  }

  const existing = await loadEntriesByDate(entry.date);
  const list     = existing.map((e) => (e.id === entry.id ? updated : e));
  localStorage.setItem(dayKey(entry.date), JSON.stringify(list));
  return updated;
}

/**
 * Load entries for a date range (inclusive).
 * Returns a map keyed by YYYY-MM-DD — used by Insights in Sprint 3.
 */
export async function loadEntriesRange(
  startDate: string,
  endDate: string
): Promise<Record<string, FoodEntry[]>> {
  const result: Record<string, FoodEntry[]> = {};
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const d = localDateString(cur);
    result[d] = await loadEntriesByDate(d);
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}