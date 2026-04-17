import { useState } from 'react';
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
    <div className="ai-widget-card ai-widget-confirm">
      <div className="ai-widget-header">
        <div className="ai-widget-dot" />
        <h4 className="ai-widget-title">
          Simulated Meal: {foodName}
        </h4>
      </div>

      <div className="ai-widget-metrics">
        <div className="ai-widget-metric-pill">
          <div className="ai-widget-metric-label">Kcal</div>
          <div className="ai-widget-metric-value">{rounded(calories)}</div>
        </div>
        <div className="ai-widget-metric-pill">
          <div className="ai-widget-metric-label">Protein</div>
          <div className="ai-widget-metric-value">{rounded(protein)}g</div>
        </div>
        <div className="ai-widget-metric-pill">
          <div className="ai-widget-metric-label">Carbs</div>
          <div className="ai-widget-metric-value">{rounded(carbs)}g</div>
        </div>
        <div className="ai-widget-metric-pill">
          <div className="ai-widget-metric-label">Fat</div>
          <div className="ai-widget-metric-value">{rounded(fat)}g</div>
        </div>
      </div>

      <div className="ai-widget-footer">
        <div className="ai-widget-context">
          To be logged for <strong>{normalizedMealType}</strong> on {dateStr}
        </div>
        
        {error ? (
          <div className="ai-widget-error">{error}</div>
        ) : logged ? (
          <div className="ai-widget-success">
            <span>✅</span> Approved & Logged
          </div>
        ) : (
          <button 
            onClick={handleApprove} 
            disabled={loading}
            className="ai-widget-btn"
          >
            {loading ? 'Logging...' : 'Approve & Add to Log'}
          </button>
        )}
      </div>
    </div>
  );
}
