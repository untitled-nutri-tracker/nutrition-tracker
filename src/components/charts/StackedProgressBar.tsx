import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ProgressData {
  name: string;
  actual: number;
  target: number;
  color: string;
  unit: string;
}

export function StackedProgressBar({ data }: { data: ProgressData[] }) {
  const chartData = data.map((item) => {
    const percentage = item.target > 0 ? (item.actual / item.target) * 100 : 0;
    const clampedPercentage = Math.max(0, Math.min(percentage, 120));

    return {
      ...item,
      percentage: clampedPercentage,
      rawPercentage: percentage,
      filled: clampedPercentage,
      remaining: Math.max(0, 120 - clampedPercentage),
    };
  });

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as typeof chartData[0];
      return (
        <div className="-translate-y-2 rounded-2xl border border-subtle bg-[#1c1c22]/95 px-3 py-2 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: data.color }} />
            {data.name}
          </div>
          <div className="font-mono text-base font-semibold text-primary">
            {Math.round(data.actual)} <span className="font-sans text-xs text-muted">/ {Math.round(data.target)}{data.unit}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full min-h-[180px] w-full flex-col justify-center">
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
            tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 500 }}
            width={70}
          />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={renderCustomTooltip} />

          <Bar dataKey="filled" stackId="progress" radius={[6, 0, 0, 6]} animationDuration={800}>
            {chartData.map((entry, index) => (
              <Cell
                key={`filled-${index}`}
                fill={entry.rawPercentage > 115 ? "var(--metric-fat)" : entry.color}
                style={{
                  filter: entry.rawPercentage > 115
                    ? "drop-shadow(0 0 5px rgb(245 158 11 / 0.35))"
                    : "drop-shadow(0 0 5px rgb(255 255 255 / 0.2))",
                }}
              />
            ))}
          </Bar>

          <Bar dataKey="remaining" stackId="progress" radius={[0, 6, 6, 0]} animationDuration={800}>
            {chartData.map((_, index) => (
              <Cell key={`remaining-${index}`} fill="rgba(255,255,255,0.08)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
