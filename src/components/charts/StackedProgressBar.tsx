import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export interface ProgressData {
  name: string;
  actual: number;
  target: number;
  color: string;
  unit: string;
}

export function StackedProgressBar({ data }: { data: ProgressData[] }) {
  // We need to calculate the percentage to render the bars correctly relative to their targets
  // Since each bar has a different target, we normalize the chart domain to 0-100% or slightly above.
  const chartData = data.map(item => {
    const percentage = item.target > 0 ? (item.actual / item.target) * 100 : 0;
    const clampedPercentage = Math.min(percentage, 120); // Cap at 120% for visual consistency
    
    return {
      ...item,
      percentage: clampedPercentage,
      rawPercentage: percentage,
      // For stacked effect, we could have 'filled' and 'remaining', but Recharts 
      // horizontal bar chart with a background is cleaner.
    };
  });

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as typeof chartData[0];
      return (
        <div className="bg-[#1C1C22]/95 backdrop-blur-md border border-white/10 px-3 py-2 rounded-xl shadow-xl transform -translate-y-2">
          <div className="text-white/50 text-[10px] uppercase tracking-wider mb-1 font-semibold flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: data.color }} />
            {data.name}
          </div>
          <div className="font-mono text-base font-semibold text-white">
            {Math.round(data.actual)} <span className="text-white/40 text-xs font-sans">/ {Math.round(data.target)}{data.unit}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full w-full min-h-[180px] flex flex-col justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart 
          layout="vertical" 
          data={chartData} 
          margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
          barSize={12}
        >
          <XAxis type="number" hide domain={[0, 120]} />
          <YAxis 
            dataKey="name" 
            type="category" 
            axisLine={false} 
            tickLine={false}
            tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 500 }}
            width={70}
          />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.02)' }} content={renderCustomTooltip} />
          <Bar 
            dataKey="percentage" 
            radius={[6, 6, 6, 6]} 
            background={{ fill: 'rgba(255,255,255,0.05)', radius: 6 }}
            animationDuration={1000}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.rawPercentage > 115 ? '#f59e0b' : entry.color} 
                style={{ 
                  filter: `drop-shadow(0 0 6px ${entry.rawPercentage > 115 ? '#f59e0b' : entry.color}40)` 
                }} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
