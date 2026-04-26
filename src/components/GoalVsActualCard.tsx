import { StackedProgressBar } from './charts/StackedProgressBar';
import { PremiumDonutChart } from './charts/PremiumDonutChart';
import type { MacroTargets } from '../lib/nutritionTargets';

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

const METRIC_COLORS = {
  calories: "var(--metric-calories)",
  protein: "var(--metric-protein)",
  carbs: "var(--metric-carbs)",
  fat: "var(--metric-fat)",
} as const;

export function GoalVsActualCard({ period, targets, actual }: GoalVsActualCardProps) {
  const donutData = [
    { name: 'Protein', value: actual.protein, color: METRIC_COLORS.protein },
    { name: 'Carbs', value: actual.carbs, color: METRIC_COLORS.carbs },
    { name: 'Fat', value: actual.fat, color: METRIC_COLORS.fat },
  ];

  const progressData = [
    { name: 'Cals', actual: actual.calories, target: targets.calories, color: METRIC_COLORS.calories, unit: 'kcal' },
    { name: 'Protein', actual: actual.protein, target: targets.protein, color: METRIC_COLORS.protein, unit: 'g' },
    { name: 'Carbs', actual: actual.carbs, target: targets.carbs, color: METRIC_COLORS.carbs, unit: 'g' },
    { name: 'Fat', actual: actual.fat, target: targets.fat, color: METRIC_COLORS.fat, unit: 'g' },
  ];

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
    <section className="w-full rounded-3xl border border-white/8 bg-[#1c1c22]/92 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-6">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Goal vs Actual</h4>
          <div className="text-lg font-semibold tracking-tight text-white">Last {period} adherence</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="bg-gradient-to-br from-emerald-300 to-cyan-300 bg-clip-text text-3xl font-bold leading-none tracking-tighter text-transparent">
            {score}%
          </div>
          <div className="mt-1 text-xs font-medium text-white/40">Avg adherence</div>
        </div>
      </div>

      <div className="-mt-1 text-[11px] leading-relaxed text-white/45">
        Calorie, protein, carb, and fat targets are personalized based on your profile.
      </div>

      <div className="mt-2 grid grid-cols-1 items-center gap-6 md:grid-cols-2 md:gap-8">
        <div className="h-[200px]">
          <PremiumDonutChart data={donutData} />
        </div>

        <div className="h-[200px]">
          <StackedProgressBar data={progressData} />
        </div>
      </div>
    </section>
  );
}
