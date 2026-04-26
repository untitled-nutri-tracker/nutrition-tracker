import type { NutritionTrendPoint } from '../generated/types';
import { getTrendMetricValue, type TrendMetric } from '../lib/nutritionTargets';
import { PremiumAreaChart, type AreaChartPoint } from './charts/PremiumAreaChart';

interface NutritionChartCardProps {
  data: NutritionTrendPoint[];
  metric: TrendMetric;
  title: string;
}

export function NutritionChartCard({ data, metric, title }: NutritionChartCardProps) {
  if (!data || data.length === 0) return null;

  const values = data.map((point) => getTrendMetricValue(point, metric));
  const latestValue = values[values.length - 1] || 0;
  
  const unit = metric === 'calories' ? 'kcal' : 'g';
  const color = metric === 'calories' ? '#f97316' : metric === 'protein' ? '#34d399' : metric === 'carbs' ? '#22d3ee' : '#f59e0b';
  const gradientColor = metric === 'calories' ? '#f59e0b' : color;

  const chartData: AreaChartPoint[] = data.map(d => ({
    date: new Date(d.periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: getTrendMetricValue(d, metric)
  }));

  return (
    <section className="flex w-full flex-col gap-4 rounded-3xl border border-white/8 bg-[#1c1c22]/92 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-6">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Trend Analysis</h4>
          <div className="text-lg font-semibold tracking-tight text-white">{title}</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="bg-clip-text text-3xl font-bold leading-none tracking-tighter text-transparent" style={{ backgroundImage: `linear-gradient(to bottom right, ${color}, ${gradientColor})`}}>
            {Math.round(latestValue)}<span className="text-sm font-medium opacity-70 ml-1">{unit}</span>
          </div>
          <div className="mt-1 text-xs font-medium text-white/40">Latest</div>
        </div>
      </div>

      <div className="relative mt-2">
        <PremiumAreaChart 
          data={chartData} 
          color={color} 
          gradientColor={gradientColor} 
          valueFormatter={(val) => `${Math.round(val)}${unit}`}
          height={180}
        />
      </div>
    </section>
  );
}
