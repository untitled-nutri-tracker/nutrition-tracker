import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface DonutData {
  name: string;
  value: number;
  color: string;
}

export function PremiumDonutChart({ data, title }: { data: DonutData[]; title?: string }) {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No data available
      </div>
    );
  }

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const { name, value, color } = payload[0].payload;
      return (
        <div className="rounded-2xl border border-subtle bg-card/95 p-3 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs font-medium text-muted">{name}</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-primary">
            {Math.round(value)}g <span className="text-muted text-xs">({Math.round((value / total) * 100)}%)</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full w-full flex-col">
      {title && <h3 className="mb-4 text-sm font-semibold tracking-tight text-primary">{title}</h3>}

      <div className="relative flex min-h-[180px] flex-1 items-center justify-center">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-24 w-24 rounded-full bg-emerald-400/12 blur-xl" />
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="84%"
              dataKey="value"
              paddingAngle={3}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
              cornerRadius={9}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: `drop-shadow(0px 2px 8px ${entry.color}33)` }} />
              ))}
            </Pie>
            <Tooltip content={renderCustomTooltip} cursor={{ fill: "transparent" }} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Total</span>
          <span className="font-mono text-2xl font-bold text-primary">{Math.round(total)}g</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs font-medium text-muted">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
