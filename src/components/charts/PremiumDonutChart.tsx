import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface DonutData {
  name: string;
  value: number;
  color: string;
}

export function PremiumDonutChart({ data, title }: { data: DonutData[]; title?: string }) {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm">
        No data available
      </div>
    );
  }

  const renderCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const { name, value, color } = payload[0].payload;
      return (
        <div className="bg-[#1C1C22]/95 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-xl">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-white/70 text-xs font-medium">{name}</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-white">
            {Math.round(value)}g <span className="text-white/40 text-xs">({Math.round((value / total) * 100)}%)</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full w-full">
      {title && <h3 className="text-white font-semibold tracking-tight text-sm mb-4">{title}</h3>}
      
      <div className="flex-1 flex items-center justify-center relative min-h-[160px]">
        {/* Glow behind the chart */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-24 h-24 rounded-full bg-indigo-500/10 blur-xl mix-blend-screen" />
        </div>
        
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="85%"
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              cornerRadius={8}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color} 
                  style={{ filter: `drop-shadow(0px 4px 8px ${entry.color}40)` }} 
                />
              ))}
            </Pie>
            <Tooltip content={renderCustomTooltip} cursor={{ fill: 'transparent' }} />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Total</span>
          <span className="text-white font-mono font-bold text-xl">{Math.round(total)}g</span>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex justify-center gap-4 mt-4 flex-wrap">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-white/60 text-xs font-medium">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
