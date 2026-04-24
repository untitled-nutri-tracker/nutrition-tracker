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

export function GoalVsActualCard({ period, targets, actual }: GoalVsActualCardProps) {
  // Data for the Donut Chart (Macronutrient distribution)
  const donutData = [
    { name: 'Protein', value: actual.protein, color: '#8b5cf6' }, // Indigo/Purple
    { name: 'Carbs', value: actual.carbs, color: '#06b6d4' },   // Cyan
    { name: 'Fat', value: actual.fat, color: '#f59e0b' },      // Amber
  ];

  // Data for the Stacked Progress Bar (Adherence to targets)
  const progressData = [
    { name: 'Cals', actual: actual.calories, target: targets.calories, color: '#ec4899', unit: 'kcal' }, // Pink
    { name: 'Protein', actual: actual.protein, target: targets.protein, color: '#8b5cf6', unit: 'g' },
    { name: 'Carbs', actual: actual.carbs, target: targets.carbs, color: '#06b6d4', unit: 'g' },
    { name: 'Fat', actual: actual.fat, target: targets.fat, color: '#f59e0b', unit: 'g' },
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
    <div className="liquid-glass p-6 w-full flex flex-col gap-6">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-white/50 text-[11px] uppercase tracking-[0.15em] font-semibold mb-1">Goal vs Actual</h4>
          <div className="text-white text-lg font-bold tracking-tight">Last {period} adherence</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-cyan-400 text-3xl font-bold tracking-tighter leading-none">
            {score}%
          </div>
          <div className="text-white/40 text-xs font-medium mt-1">Avg adherence</div>
        </div>
      </div>

      <div className="text-[10px] text-white/30 leading-relaxed -mt-3">
        Calorie, protein, carb, and fat targets are personalized based on your profile.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mt-2">
        {/* Left Side: Donut Chart for Macros */}
        <div className="h-[200px]">
          <PremiumDonutChart data={donutData} />
        </div>

        {/* Right Side: Stacked Bar Chart for Target Adherence */}
        <div className="h-[200px]">
          <StackedProgressBar data={progressData} />
        </div>
      </div>
    </div>
  );
}
