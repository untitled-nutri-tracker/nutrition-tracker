import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface AreaChartPoint {
  date: string;
  value: number;
}

export function PremiumAreaChart({ 
  data, 
  color = "#10b981",
  gradientColor = "#22d3ee",
  valueFormatter = (val: number) => val.toString(),
  height = 220 
}: { 
  data: AreaChartPoint[];
  color?: string;
  gradientColor?: string;
  valueFormatter?: (val: number) => string;
  height?: number;
}) {
  const gradientId = useId().replace(/:/g, "");

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-white/45" style={{ minHeight: height }}>
        No trend data available
      </div>
    );
  }

  const renderCustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="-translate-y-2 rounded-2xl border border-white/12 bg-[#1c1c22]/95 px-3 py-2 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">{label}</div>
          <div className="flex items-center gap-2 font-mono text-base font-semibold text-white">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            {valueFormatter(payload[0].value)}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ height, width: "100%" }} className="relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`colorValue-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`lineGradient-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor={gradientColor} />
            </linearGradient>
          </defs>
          
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
          
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 500 }}
            tickMargin={12}
            minTickGap={20}
          />
          
          <YAxis 
            hide 
            domain={["dataMin - (dataMax - dataMin) * 0.1", "auto"]} 
          />
          
          <Tooltip 
            content={renderCustomTooltip} 
            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} 
          />
          
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#lineGradient-${gradientId})`}
            strokeWidth={3}
            fillOpacity={1}
            fill={`url(#colorValue-${gradientId})`}
            activeDot={{ r: 5, fill: "#fff", stroke: gradientColor, strokeWidth: 2, className: "drop-shadow-md" }}
            dot={{ r: 2.5, fill: color, strokeWidth: 0, opacity: 0.5 }}
            animationDuration={900}
            animationEasing="ease-in-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
