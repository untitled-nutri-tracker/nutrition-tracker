import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NutritionTrendPoint } from "../generated/types";
import type { MacroTargets } from "../lib/nutritionTargets";
import {
  formatPercent,
  getMacroPercent,
  getMacroZoneLabel,
  getMacroZoneTone,
  getTargetForMetric,
  getTrendMetricValue,
  type TrendMetric,
} from "../lib/nutritionTargets";

type SupportedMetric = TrendMetric;

interface MultiMacroTrendCardProps {
  data: NutritionTrendPoint[];
  metrics: SupportedMetric[];
  period: string;
  targets: MacroTargets;
}

const METRIC_META: Record<SupportedMetric, { label: string; color: string; unit: string }> = {
  calories: { label: "Calories", color: "var(--metric-calories)", unit: "kcal" },
  protein: { label: "Protein", color: "var(--metric-protein)", unit: "g" },
  carbs: { label: "Carbs", color: "var(--metric-carbs)", unit: "g" },
  fat: { label: "Fat", color: "var(--metric-fat)", unit: "g" },
};

function hasLoggedNutrition(point: NutritionTrendPoint): boolean {
  const totals = point.totals;
  return (
    totals.itemCount > 0 ||
    totals.mealCount > 0 ||
    totals.caloriesKcal > 0 ||
    totals.proteinG > 0 ||
    totals.totalCarbohydrateG > 0 ||
    totals.fatG > 0
  );
}

function trimTrailingEmptyBuckets(points: NutritionTrendPoint[]): NutritionTrendPoint[] {
  let lastLoggedIndex = points.length - 1;
  while (lastLoggedIndex >= 0 && !hasLoggedNutrition(points[lastLoggedIndex])) {
    lastLoggedIndex -= 1;
  }

  if (lastLoggedIndex < 0) return [];
  return points.slice(0, lastLoggedIndex + 1);
}

export function MultiMacroTrendCard({ data, metrics, period, targets }: MultiMacroTrendCardProps) {
  if (!data || data.length === 0 || metrics.length === 0) return null;

  const displayData = trimTrailingEmptyBuckets(data);
  if (displayData.length === 0) return null;

  const series = metrics.map((metric) => {
    const target = getTargetForMetric(targets, metric);
    const metricValues = displayData.map((point) => getTrendMetricValue(point, metric));
    const percentValues = metricValues.map((value) => getMacroPercent(value, target));
    const latestActual = metricValues[metricValues.length - 1];
    const latestPercent = percentValues[percentValues.length - 1];
    const averagePercent = percentValues.reduce((sum, value) => sum + value, 0) / percentValues.length;

    return {
      metric,
      latestActual,
      latestPercent,
      averagePercent,
    };
  });

  const chartData = displayData.map((point) => {
    const row: Record<string, number | string> = {
      label: new Date(point.periodStart * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };

    metrics.forEach((metric) => {
      const target = getTargetForMetric(targets, metric);
      row[metric] = getMacroPercent(getTrendMetricValue(point, metric), target);
    });

    return row;
  });

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="rounded-2xl border border-subtle bg-[#1c1c22]/95 px-3 py-2 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
        <div className="space-y-1">
          {payload.map((item: any) => {
            const meta = METRIC_META[item.dataKey as SupportedMetric];
            return (
              <div key={item.dataKey} className="flex items-center justify-between gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  {meta.label}
                </span>
                <span className="font-mono">{Math.round(item.value)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-3xl border border-subtle bg-[#1c1c22]/92 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-6">
      <div className="mb-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Multi-Macro Trend</h4>
        <div className="mt-1 text-lg font-semibold tracking-tight text-primary">Last {period} adherence to target</div>
        <div className="mt-1 text-xs text-muted">
          100% is the goal line. The shaded band marks the 80-120% target comfort range.
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {series.map((item) => (
          <div key={item.metric} className="inline-flex items-center gap-2 rounded-full border border-subtle bg-white/5 px-2.5 py-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: METRIC_META[item.metric].color }} />
            <span>{METRIC_META[item.metric].label}</span>
            <span className="font-mono text-muted">
              {Math.round(item.latestActual)}{METRIC_META[item.metric].unit} · {formatPercent(item.latestPercent)}
            </span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${getMacroZoneTone(item.latestPercent)}`}>
              {getMacroZoneLabel(item.latestPercent)}
            </span>
          </div>
        ))}
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 4, left: -8, bottom: 8 }}>
            <ReferenceArea y1={80} y2={120} fill="rgb(52 211 153 / 0.10)" />
            <ReferenceLine y={100} stroke="var(--metric-protein)" strokeDasharray="4 4" strokeWidth={1.1} />
            <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 500 }}
              tickMargin={12}
              minTickGap={20}
            />
            <YAxis
              domain={[0, 200]}
              ticks={[0, 50, 100, 150, 200]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
              width={34}
            />
            <Tooltip content={renderTooltip} />

            {metrics.map((metric) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={METRIC_META[metric].color}
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 4, fill: "rgb(255 255 255)", stroke: METRIC_META[metric].color, strokeWidth: 2 }}
                animationDuration={850}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>{targets.isPersonalized ? targets.sourceLabel : "Using default targets"}</span>
        <span>{new Date(displayData[displayData.length - 1].periodStart * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
    </section>
  );
}
