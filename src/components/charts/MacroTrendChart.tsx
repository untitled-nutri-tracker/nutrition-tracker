import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface MacroTrendPoint {
  date: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function MacroTrendChart({
  data,
  height = 220,
}: {
  data: MacroTrendPoint[];
  height?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted" style={{ minHeight: height }}>
        No trend data available
      </div>
    );
  }

  const renderCustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="-translate-y-2 rounded-2xl border border-subtle bg-card/95 px-3 py-2 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
          <div className="flex flex-col gap-1.5">
            {[...payload].reverse().map((entry: any) => (
              <div key={entry.dataKey} className="flex items-center justify-between gap-4 font-mono text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-muted">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="capitalize">{entry.dataKey.replace('G', '')}</span>
                </div>
                <div className="text-primary">{Math.round(entry.value)}g</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ height, width: "100%" }} className="relative">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="var(--border-subtle)" vertical={false} />
          
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'var(--text-muted2)', fontSize: 10, fontWeight: 500 }}
            tickMargin={12}
            minTickGap={20}
          />
          
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontWeight: 500 }}
            tickFormatter={(val) => Math.round(val).toString()}
            width={35}
          />
          
          <Tooltip 
            content={renderCustomTooltip} 
            cursor={{ fill: 'var(--text-primary)', opacity: 0.04 }} 
          />
          
          <Bar dataKey="proteinG" stackId="a" fill="var(--metric-protein)" radius={[0, 0, 4, 4]} animationDuration={800} />
          <Bar dataKey="carbsG" stackId="a" fill="var(--metric-carbs)" animationDuration={800} />
          <Bar dataKey="fatG" stackId="a" fill="var(--metric-fat)" radius={[4, 4, 0, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
