import { useId } from 'react';
import type { NutritionTrendPoint } from '../generated/types';
import type { MacroTargets } from '../lib/nutritionTargets';
import { formatPercent, getMacroPercent, getMacroZoneLabel, getMacroZoneTone, getTargetForMetric, getTrendMetricValue, type TrendMetric } from '../lib/nutritionTargets';

type SupportedMetric = TrendMetric;

interface MultiMacroTrendCardProps {
  data: NutritionTrendPoint[];
  metrics: SupportedMetric[];
  period: string;
  targets: MacroTargets;
}

const METRIC_META: Record<SupportedMetric, { label: string; color: string; unit: string }> = {
  calories: { label: 'Calories', color: '#f59e0b', unit: 'kcal' },
  protein: { label: 'Protein', color: '#60a5fa', unit: 'g' },
  carbs: { label: 'Carbs', color: '#34d399', unit: 'g' },
  fat: { label: 'Fat', color: '#f472b6', unit: 'g' },
};

function buildPoints(percentValues: number[], width: number, height: number, paddingLeft: number, paddingRight: number, paddingTop: number, paddingBottom: number) {
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  return percentValues.map((value, index) => {
    const x = paddingLeft + index * (chartWidth / (percentValues.length - 1 || 1));
    const cappedPercent = Math.max(0, Math.min(200, value));
    const y = paddingTop + ((200 - cappedPercent) / 200) * chartHeight;
    return `${x},${y}`;
  }).join(' ');
}

export function MultiMacroTrendCard({ data, metrics, period, targets }: MultiMacroTrendCardProps) {
  if (!data || data.length === 0 || metrics.length === 0) return null;

  const id = useId().replace(/:/g, '');
  const width = 340;
  const height = 170;
  const paddingLeft = 42;
  const paddingRight = 18;
  const paddingTop = 14;
  const paddingBottom = 32;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const yTicks = [200, 150, 100, 50, 0].map((value) => ({
    value,
    y: paddingTop + ((200 - value) / 200) * chartHeight,
  }));

  const series = metrics.map((metric) => {
    const target = getTargetForMetric(targets, metric);
    const metricValues = data.map((point) => getTrendMetricValue(point, metric));
    const percentValues = metricValues.map((value) => getMacroPercent(value, target));

    const points = buildPoints(percentValues, width, height, paddingLeft, paddingRight, paddingTop, paddingBottom);
    const latestActual = metricValues[metricValues.length - 1];
    const latestPercent = percentValues[percentValues.length - 1];
    const averagePercent = percentValues.reduce((sum, value) => sum + value, 0) / percentValues.length;

    return {
      metric,
      points,
      latestActual,
      latestPercent,
      averagePercent,
      gradientId: `multi-grad-${metric}-${id}`,
    };
  });

  return (
    <div className="ai-widget-card ai-widget-chart">
      <div className="ai-widget-chart-glow" />

      <div className="ai-widget-chart-header">
        <div>
          <h4 className="ai-widget-chart-label">Multi-Macro Trend</h4>
          <div className="ai-widget-chart-title">{`Last ${period} adherence to target`}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(235,225,208,0.70)' }}>
            Protein, carbs, and fat are plotted as % of your daily target so the lines are directly comparable.
          </div>
        </div>
      </div>

      <div className="ai-widget-legend">
        {series.map((item) => (
          <div key={item.metric} className="ai-widget-legend-item">
            <span className="ai-widget-legend-dot" style={{ background: METRIC_META[item.metric].color }} />
            <span>{METRIC_META[item.metric].label}</span>
            <span className="ai-widget-legend-value">
              {Math.round(item.latestActual)}{METRIC_META[item.metric].unit} · {formatPercent(item.latestPercent)}
            </span>
            <span
              className={`ai-widget-status-badge ${getMacroZoneTone(item.latestPercent)}`}
              title={`Average adherence over the selected period: ${formatPercent(item.averagePercent)}`}
            >
              {getMacroZoneLabel(item.latestPercent)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: 'rgba(235,225,208,0.62)', marginBottom: 6 }}>
        100% is the target line. The shaded band marks the 80-120% range that is usually considered on target.
      </div>

      <svg width="100%" height={height} className="ai-widget-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`target-band-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.06" />
          </linearGradient>
          {series.map((item) => (
            <linearGradient key={item.gradientId} id={item.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={METRIC_META[item.metric].color} stopOpacity="1" />
              <stop offset="100%" stopColor={METRIC_META[item.metric].color} stopOpacity="0.55" />
            </linearGradient>
          ))}
        </defs>

        <rect
          x={paddingLeft}
          y={paddingTop + ((200 - 120) / 200) * chartHeight}
          width={width - paddingLeft - paddingRight}
          height={((120 - 80) / 200) * chartHeight}
          fill={`url(#target-band-${id})`}
          rx="10"
        />

        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={paddingLeft}
              y1={tick.y}
              x2={width - paddingRight}
              y2={tick.y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="3 4"
              strokeWidth="1"
            />
            <text
              x={paddingLeft - 6}
              y={tick.y + 3}
              textAnchor="end"
              fontSize="10"
              fill="rgba(235,225,208,0.72)"
            >
              {tick.value}%
            </text>
          </g>
        ))}

        <line
          x1={paddingLeft}
          y1={paddingTop + ((200 - 100) / 200) * chartHeight}
          x2={width - paddingRight}
          y2={paddingTop + ((200 - 100) / 200) * chartHeight}
          stroke="rgba(52, 211, 153, 0.9)"
          strokeDasharray="5 4"
          strokeWidth="1.4"
        />
        <text
          x={width - paddingRight}
          y={paddingTop + ((200 - 100) / 200) * chartHeight - 6}
          textAnchor="end"
          fontSize="10"
          fill="rgba(52, 211, 153, 0.95)"
        >
          100% target
        </text>

        <line
          x1={paddingLeft}
          y1={height - paddingBottom}
          x2={width - paddingRight}
          y2={height - paddingBottom}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />

        {series.map((item) => (
          <polyline
            key={item.metric}
            fill="none"
            stroke={`url(#${item.gradientId})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={item.points}
          />
        ))}

        <text
          x={paddingLeft}
          y={height - 10}
          textAnchor="start"
          fontSize="10"
          fill="rgba(235,225,208,0.72)"
        >
          {new Date(data[0].periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
        <text
          x={paddingLeft + chartWidth / 2}
          y={height - 10}
          textAnchor="middle"
          fontSize="10"
          fill="rgba(235,225,208,0.72)"
        >
          {new Date(data[Math.floor((data.length - 1) / 2)].periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
        <text
          x={width - paddingRight}
          y={height - 10}
          textAnchor="end"
          fontSize="10"
          fill="rgba(235,225,208,0.72)"
        >
          {new Date(data[data.length - 1].periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
      </svg>

      <div className="ai-widget-chart-footer">
        <span>{targets.isPersonalized ? targets.sourceLabel : 'Using default targets'}</span>
        <span>{new Date(data[data.length - 1].periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}
