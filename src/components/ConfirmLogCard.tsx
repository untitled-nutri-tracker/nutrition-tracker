import { useState } from 'react';
import { CheckCircle, PlusCircle, WarningCircle } from '@phosphor-icons/react';
import { createEntry } from '../lib/foodLogStore';
import type { MealType } from '../types/foodLog';

interface ConfirmLogCardProps {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: string;
  dateStr: string;
  onSuccess?: () => void;
}

function isMealType(value: string): value is MealType {
  return value === "breakfast" || value === "lunch" || value === "dinner" || value === "snack";
}

function normalizeMealType(value: string): MealType {
  const normalized = value.trim().toLowerCase();
  return isMealType(normalized) ? normalized : "snack";
}

export function ConfirmLogCard({ 
  foodName, 
  calories, 
  protein, 
  carbs, 
  fat, 
  mealType, 
  dateStr,
  onSuccess 
}: ConfirmLogCardProps) {
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedMealType = normalizeMealType(mealType);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await createEntry({
        date: dateStr,
        mealType: normalizedMealType,
        foodName,
        calories,
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
      });
      setLogged(true);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      setError(message || "Failed to log food");
    } finally {
      setLoading(false);
    }
  };

  const rounded = (n: number) => Math.round(n);

  return (
    <section className="mt-2 mb-2 rounded-3xl border border-subtle bg-[#1c1c22]/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/15 text-emerald-200">
          <PlusCircle size={16} weight="duotone" />
        </span>
        <h4 className="text-sm font-semibold text-muted">Simulated Meal: {foodName}</h4>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-subtle bg-white/5 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Kcal</div>
          <div className="mt-1 font-mono text-base font-semibold text-primary">{rounded(calories)}</div>
        </div>
        <div className="rounded-2xl border border-subtle bg-white/5 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Protein</div>
          <div className="mt-1 font-mono text-base font-semibold text-primary">{rounded(protein)}g</div>
        </div>
        <div className="rounded-2xl border border-subtle bg-white/5 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Carbs</div>
          <div className="mt-1 font-mono text-base font-semibold text-primary">{rounded(carbs)}g</div>
        </div>
        <div className="rounded-2xl border border-subtle bg-white/5 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Fat</div>
          <div className="mt-1 font-mono text-base font-semibold text-primary">{rounded(fat)}g</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted">
          To be logged for <strong>{normalizedMealType}</strong> on {dateStr}
        </div>
        
        {error ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/35 bg-rose-400/12 px-2.5 py-1 text-xs text-rose-200">
            <WarningCircle size={14} weight="duotone" />
            {error}
          </div>
        ) : logged ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-400/12 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            <CheckCircle size={14} weight="fill" />
            Approved & Logged
          </div>
        ) : (
          <button 
            onClick={handleApprove} 
            disabled={loading}
            className="inline-flex items-center rounded-xl border border-emerald-300/35 bg-emerald-300/12 px-3 py-2 text-xs font-semibold text-primary transition-all hover:-translate-y-px hover:border-emerald-200/55 hover:bg-emerald-300/18 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Logging...' : 'Approve & Add to Log'}
          </button>
        )}
      </div>
    </section>
  );
}
