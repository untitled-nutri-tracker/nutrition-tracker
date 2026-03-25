// src/hooks/useDailyLog.ts
// Sprint 2.1 — React hook for daily food log state management

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FoodEntry, FoodEntryDraft, DailyTotals } from "../types/foodLog";
import { sumEntries } from "../types/foodLog";
import {
  createEntry,
  deleteEntry,
  loadEntriesByDate,
  localDateString,
  updateEntry,
} from "../lib/foodLogStore";

export interface UseDailyLogReturn {
  /** All entries for the selected date, sorted chronologically */
  entries: FoodEntry[];
  /** Currently displayed date (YYYY-MM-DD) */
  date: string;
  /** Navigate to a different day */
  setDate: (date: string) => void;
  /** Computed calorie + macro totals for the day */
  totals: DailyTotals;
  /** True while loading from the store */
  loading: boolean;
  /** True while a write operation is in-flight */
  saving: boolean;
  /** Non-null when an error occurred */
  error: string | null;
  /** Add a new entry for the current date */
  addEntry: (draft: Omit<FoodEntryDraft, "date">) => Promise<void>;
  /** Remove an entry by id */
  removeEntry: (id: string) => Promise<void>;
  /** Replace an existing entry in-place */
  editEntry: (entry: FoodEntry) => Promise<void>;
  /** Force a reload from the store */
  refresh: () => Promise<void>;
}

export function useDailyLog(initialDate?: string): UseDailyLogReturn {
  const [date, setDate]       = useState<string>(initialDate ?? localDateString());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadEntriesByDate(d);
      loaded.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setEntries(loaded);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  // ── Computed ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => sumEntries(entries), [entries]);

  // ── Write ops ────────────────────────────────────────────────────────────────

  const addEntry = useCallback(
    async (draft: Omit<FoodEntryDraft, "date">) => {
      setSaving(true);
      setError(null);
      try {
        const created = await createEntry({ ...draft, date });
        setEntries((prev) =>
          [...prev, created].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save entry");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [date]
  );

  const removeEntry = useCallback(
    async (id: string) => {
      setSaving(true);
      setError(null);
      try {
        await deleteEntry(id, date);
        setEntries((prev) => prev.filter((e) => e.id !== id));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete entry");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [date]
  );

  const editEntry = useCallback(async (entry: FoodEntry) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateEntry(entry);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update entry");
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const refresh = useCallback(() => load(date), [date, load]);

  // ── Return ───────────────────────────────────────────────────────────────────

  return {
    entries,
    date,
    setDate,
    totals,
    loading,
    saving,
    error,
    addEntry,
    removeEntry,
    editEntry,
    refresh,
  };
}