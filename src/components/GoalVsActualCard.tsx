import { formatPercent, getMacroPercent, getMacroZoneLabel, getMacroZoneTone, type MacroTargets } from '../lib/nutritionTargets';

interface GoalVsActualCardProps {
  period: string;
  targets: MacroTargets;
  actual: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

function AdherenceBar({
  label,
  unit,
  actual,
  target,
}: {
  label: string;
  unit: string;
  actual: number;
  target: number;
}) {
  const ratio = getMacroPercent(actual, target);
  const pct = Math.min(Math.round(ratio), 200);
  const clamped = Math.min(pct, 100);
  const color = ratio >= 85 && ratio <= 115 ? '#34d399' : ratio > 115 ? '#f59e0b' : '#60a5fa';

  return (
    <div className="ai-goal-row">
      <div className="ai-goal-row-head">
        <span>{label}</span>
        <span className="ai-goal-row-meta">{Math.round(actual)} / {Math.round(target)}{unit} ({formatPercent(pct)})</span>
      </div>
      <div className="ai-goal-track">
        <div className="ai-goal-fill" style={{ width: `${clamped}%`, background: color }} />
      </div>
      <div className={`ai-widget-status-line ${getMacroZoneTone(ratio)}`}>
        {getMacroZoneLabel(ratio)}
      </div>
    </div>
  );
}

export function GoalVsActualCard({ period, targets, actual }: GoalVsActualCardProps) {
  const adherenceValues = [
    targets.calories > 0 ? actual.calories / targets.calories : 0,
    targets.protein > 0 ? actual.protein / targets.protein : 0,
    targets.carbs > 0 ? actual.carbs / targets.carbs : 0,
    targets.fat > 0 ? actual.fat / targets.fat : 0,
  ];

  const score = Math.round(
    (adherenceValues.reduce((sum, value) => sum + Math.min(Math.max(value, 0), 1.2), 0) / adherenceValues.length) * 100,
  );

  return (
    <div className="ai-widget-card ai-goal-card">
      <div className="ai-widget-chart-header">
        <div>
          <h4 className="ai-widget-chart-label">Goal vs Actual</h4>
          <div className="ai-widget-chart-title">{`Last ${period} adherence`}</div>
        </div>
        <div className="ai-widget-chart-latest">
          <div className="ai-widget-chart-latest-value">{score}%</div>
          <div className="ai-widget-chart-latest-label">Avg adherence</div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'rgba(235,225,208,0.62)', marginTop: -2 }}>
        Calorie, protein, carb, and fat targets are personalized when profile data is available.
      </div>

      <div className="ai-goal-grid">
        <AdherenceBar label="Calories" unit="kcal" actual={actual.calories} target={targets.calories} />
        <AdherenceBar label="Protein" unit="g" actual={actual.protein} target={targets.protein} />
        <AdherenceBar label="Carbs" unit="g" actual={actual.carbs} target={targets.carbs} />
        <AdherenceBar label="Fat" unit="g" actual={actual.fat} target={targets.fat} />
      </div>
    </div>
  );
}
