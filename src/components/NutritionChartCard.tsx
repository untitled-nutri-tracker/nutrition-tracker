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
  const color = metric === 'calories' ? '#7c5cff' : metric === 'protein' ? '#10b981' : metric === 'carbs' ? '#06b6d4' : '#f59e0b';
  const gradientColor = metric === 'calories' ? '#00d1ff' : color;

  const chartData: AreaChartPoint[] = data.map(d => ({
    date: new Date(d.periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: getTrendMetricValue(d, metric)
  }));

  return (
    <div className="liquid-glass p-6 w-full flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-white/50 text-[11px] uppercase tracking-[0.15em] font-semibold mb-1">Trend Analysis</h4>
          <div className="text-white text-lg font-bold tracking-tight">{title}</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-cyan-400 text-3xl font-bold tracking-tighter leading-none" style={{ backgroundImage: `linear-gradient(to bottom right, ${color}, ${gradientColor})`}}>
            {Math.round(latestValue)}<span className="text-sm font-medium opacity-70 ml-1">{unit}</span>
          </div>
          <div className="text-white/40 text-xs font-medium mt-1">Latest</div>
        </div>
      </div>

      <div className="mt-2 relative">
        {/* Render the Recharts AreaChart */}
        <PremiumAreaChart 
          data={chartData} 
          color={color} 
          gradientColor={gradientColor} 
          valueFormatter={(val) => `${Math.round(val)}${unit}`}
          height={180}
        />
      </div>
    </div>
  );
}
