import { useId } from 'react';
import type { NutritionTrendPoint } from '../generated/types';
import { getTrendMetricValue, type TrendMetric } from '../lib/nutritionTargets';

interface NutritionChartCardProps {
  data: NutritionTrendPoint[];
  metric: TrendMetric;
  title: string;
}

export function NutritionChartCard({ data, metric, title }: NutritionChartCardProps) {
  if (!data || data.length === 0) return null;
  const id = useId().replace(/:/g, '');

  const values = data.map((point) => getTrendMetricValue(point, metric));
  const maxVal = Math.max(...values, 10); // avoid div by zero

  const width = 340;
  const height = 170;
  const paddingLeft = 42;
  const paddingRight = 18;
  const paddingTop = 14;
  const paddingBottom = 32;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    value: Math.round(maxVal * ratio),
    y: paddingTop + (1 - ratio) * chartHeight,
  }));

  const points = data.map((d, i) => {
    const x = paddingLeft + (i * (chartWidth / (data.length - 1 || 1)));
    const val = getTrendMetricValue(d, metric);
    // Inverse Y for SVG coordinates
    const y = paddingTop + (1 - val / maxVal) * chartHeight;
    return { x, y };
  });
  const pointString = points.map(({ x, y }) => `${x},${y}`).join(' ');

  const unit = metric === 'calories' ? 'kcal' : 'g';
  const lineGradId = `lineGrad-${id}`;
  const areaGradId = `areaGrad-${id}`;

  return (
    <div className="ai-widget-card ai-widget-chart">
      {/* Background Glow */}
      <div className="ai-widget-chart-glow" />

      <div className="ai-widget-chart-header">
        <div>
          <h4 className="ai-widget-chart-label">Trend Analysis</h4>
          <div className="ai-widget-chart-title">{title}</div>
        </div>
        <div className="ai-widget-chart-latest">
          <div className="ai-widget-chart-latest-value">{Math.round(values[values.length - 1])}{unit}</div>
          <div className="ai-widget-chart-latest-label">Latest</div>
        </div>
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="ai-widget-chart-svg">
        <defs>
          <linearGradient id={lineGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="1" />
            <stop offset="100%" stopColor="#00d1ff" stopOpacity="1" />
          </linearGradient>
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid + Y labels */}
        {yTicks.map((tick) => (
          <g key={tick.ratio}>
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
              {tick.value}
            </text>
          </g>
        ))}

        {/* X-axis */}
        <line
          x1={paddingLeft}
          y1={height - paddingBottom}
          x2={width - paddingRight}
          y2={height - paddingBottom}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />

        {/* Area fill */}
        <path
          d={`M ${paddingLeft},${height - paddingBottom} ${pointString} L ${width - paddingRight},${height - paddingBottom} Z`}
          fill={`url(#${areaGradId})`}
        />

        {/* Main Line */}
        <polyline
          fill="none"
          stroke={`url(#${lineGradId})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pointString}
          className="ai-widget-chart-line"
        />

        {/* Data Points */}
        {points.map(({ x, y }, i) => {
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill="white"
              stroke="#7c5cff"
              strokeWidth="2"
            />
          );
        })}

        {/* X labels */}
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
        <span>{new Date(data[0].periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(data[data.length - 1].periodStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}
