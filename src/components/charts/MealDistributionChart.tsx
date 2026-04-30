import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface MealDistributionData {
  name: string; // "Breakfast", "Lunch", etc.
  calories: number;
  percentage: number;
}

export function MealDistributionChart({
  data,
}: {
  data: MealDistributionData[];
}) {
  const COLORS = [
    "var(--metric-calories)",
    "var(--metric-protein)",
    "var(--metric-carbs)",
    "var(--metric-fat)",
  ];

  if (!data || data.length === 0 || data.every(d => d.calories === 0)) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted">
        No meal data available
      </div>
    );
  }

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as MealDistributionData;
      return (
        <div className="-translate-y-2 rounded-2xl border border-subtle bg-card/95 px-3 py-2 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{data.name}</div>
          <div className="flex items-baseline gap-2 font-mono text-base font-semibold text-primary">
            {Math.round(data.percentage)}%
            <span className="font-sans text-xs font-normal text-muted">{Math.round(data.calories)} kcal</span>
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
          data={data}
          margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
          barSize={16}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--text-primary)", fontSize: 11, fontWeight: 500, opacity: 0.8 }}
            width={75}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            dataKey="name"
            type="category"
            axisLine={false}
            tickLine={false}
            width={50}
            tick={({ x, y, payload }) => {
              const item = data.find((d) => d.name === payload.value);
              if (!item) return null;
              return (
                <text x={Number(x) + 5} y={y} dy={4} fill="var(--text-muted)" fontSize={11} fontWeight={600} textAnchor="start">
                  {Math.round(item.percentage)}%
                </text>
              );
            }}
          />
          <Tooltip cursor={{ fill: "var(--text-primary)", opacity: 0.03 }} content={renderCustomTooltip} />

          <Bar dataKey="calories" radius={[0, 6, 6, 0]} animationDuration={800}>
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                style={{ filter: `drop-shadow(0 0 5px ${COLORS[index % COLORS.length]}33)` }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
