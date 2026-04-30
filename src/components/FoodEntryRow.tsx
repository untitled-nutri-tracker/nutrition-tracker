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
    <div className="flex items-center gap-3 rounded-xl border border-subtle bg-primary/5 px-3 py-2.5 transition-colors">

      {/* Left: name + meta */}
      <div className="min-w-0 flex-1">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-primary">
          {entry.foodName}
        </div>
        <div className="mt-[3px] flex flex-wrap gap-1 text-[11px] text-muted2">
          {entry.brand && <span>{entry.brand} · </span>}
          {entry.servingDesc && <span>{entry.servingDesc} · </span>}
          <span className="rounded-md border border-subtle bg-primary/5 px-[5px] py-[1px]">
            {Math.round(entry.proteinG)}g protein
          </span>
          <span className="rounded-md border border-subtle bg-primary/5 px-[5px] py-[1px]">
            {Math.round(entry.carbsG)}g carbs
          </span>
          <span className="rounded-md border border-subtle bg-primary/5 px-[5px] py-[1px]">
            {Math.round(entry.fatG)}g fat
          </span>
        </div>
      </div>

      {/* Right: calories + delete */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex flex-col items-end leading-[1.1]">
          <span className="text-[15px] font-extrabold text-primary">{Math.round(entry.calories)}</span>
          <span className="mt-[1px] text-[10px] text-muted2">kcal</span>
        </div>
        <button
          onClick={() => onDelete(entry.id)}
          disabled={deleting}
          className="cursor-pointer rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[11px] leading-none text-primary/25 transition-colors hover:border-red-500/50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Delete entry"
          title="Delete"
        >
          ✕
        </button>
      </div>

    </div>
  );
}