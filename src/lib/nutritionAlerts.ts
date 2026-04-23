import type { NutritionTrendPoint } from "../generated/types";
import { getTargetForMetric, type MacroTargets, type TrendMetric } from "./nutritionTargets";

export type NutritionAlertSeverity = "warning" | "danger";

export interface NutritionThresholdAlert {
  id: string;
  severity: NutritionAlertSeverity;
  emoji: string;
  title: string;
  message: string;
  thresholdLabel: string;
  triggeredCount: number;
  triggeredDates: string[];
}

interface TrendDaySummary {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged: boolean;
}

interface MetricRule {
  id: string;
  metric: TrendMetric;
  direction: "high" | "low";
  thresholdMultiplier: number;
  minTriggeredDays: number;
  severity: NutritionAlertSeverity;
  emoji: string;
  title: string;
}

interface DetectionOptions {
  windowDays?: number;
  excludeToday?: boolean;
}

const METRIC_META: Record<TrendMetric, { label: string; unit: string }> = {
  calories: { label: "Calories", unit: "kcal" },
  protein: { label: "Protein", unit: "g" },
  carbs: { label: "Carbs", unit: "g" },
  fat: { label: "Fat", unit: "g" },
};

const METRIC_RULES: readonly MetricRule[] = [
  {
    id: "calories-high",
    metric: "calories",
    direction: "high",
    thresholdMultiplier: 1.15,
    minTriggeredDays: 2,
    severity: "danger",
    emoji: "⚠️",
    title: "Calorie Threshold Exceeded",
  },
  {
    id: "calories-low",
    metric: "calories",
    direction: "low",
    thresholdMultiplier: 0.4,
    minTriggeredDays: 2,
    severity: "danger",
    emoji: "🔻",
    title: "Low Calorie Intake Detected",
  },
  {
    id: "protein-low",
    metric: "protein",
    direction: "low",
    thresholdMultiplier: 0.5,
    minTriggeredDays: 2,
    severity: "warning",
    emoji: "🥩",
    title: "Protein Below Threshold",
  },
  {
    id: "carbs-high",
    metric: "carbs",
    direction: "high",
    thresholdMultiplier: 1.25,
    minTriggeredDays: 2,
    severity: "warning",
    emoji: "🍞",
    title: "Carb Intake Running High",
  },
  {
    id: "fat-high",
    metric: "fat",
    direction: "high",
    thresholdMultiplier: 1.25,
    minTriggeredDays: 2,
    severity: "warning",
    emoji: "🥑",
    title: "Fat Intake Running High",
  },
];

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function summarizePoint(point: NutritionTrendPoint): TrendDaySummary {
  return {
    date: localDateKey(new Date(point.periodStart * 1000)),
    calories: point.totals.caloriesKcal,
    protein: point.totals.proteinG,
    carbs: point.totals.totalCarbohydrateG,
    fat: point.totals.fatG,
    logged:
      point.totals.itemCount > 0 ||
      point.totals.mealCount > 0 ||
      point.totals.caloriesKcal > 0 ||
      point.totals.proteinG > 0 ||
      point.totals.totalCarbohydrateG > 0 ||
      point.totals.fatG > 0,
  };
}

function getMetricValue(day: TrendDaySummary, metric: TrendMetric): number {
  switch (metric) {
    case "calories":
      return day.calories;
    case "protein":
      return day.protein;
    case "carbs":
      return day.carbs;
    case "fat":
      return day.fat;
  }
}

function buildThresholdLabel(rule: MetricRule, target: number): string {
  const { label, unit } = METRIC_META[rule.metric];
  const operator = rule.direction === "high" ? ">" : "<";
  const threshold = Math.round(target * rule.thresholdMultiplier);
  return `${label} ${operator} ${threshold}${unit}`;
}

function buildMetricMessage(rule: MetricRule, dates: string[], windowLength: number): string {
  const { label } = METRIC_META[rule.metric];
  const thresholdPercent = Math.round(rule.thresholdMultiplier * 100);
  const directionText = rule.direction === "high" ? "above" : "below";
  const dayLabel = dates.length === 1 ? "day" : "days";
  const dateText = dates.join(", ");
  return `${label} stayed ${directionText} ${thresholdPercent}% of target on ${dates.length} of the last ${windowLength} completed ${dayLabel} (${dateText}).`;
}

export function detectNutritionThresholdAlerts(
  points: NutritionTrendPoint[],
  targets: MacroTargets,
  options: DetectionOptions = {},
): NutritionThresholdAlert[] {
  const windowDays = options.windowDays ?? 3;
  const excludeToday = options.excludeToday ?? true;
  const todayKey = localDateKey(new Date());

  const days = points
    .slice()
    .sort((a, b) => a.periodStart - b.periodStart)
    .map(summarizePoint)
    .filter((day) => (excludeToday ? day.date !== todayKey : true))
    .slice(-windowDays);

  if (days.length === 0) return [];

  const alerts: NutritionThresholdAlert[] = [];

  for (const rule of METRIC_RULES) {
    const target = getTargetForMetric(targets, rule.metric);
    if (target <= 0) continue;

    const triggeredDays = days.filter((day) => {
      if (!day.logged) return false;
      const value = getMetricValue(day, rule.metric);
      return rule.direction === "high"
        ? value > target * rule.thresholdMultiplier
        : value < target * rule.thresholdMultiplier;
    });

    if (triggeredDays.length < rule.minTriggeredDays) continue;

    alerts.push({
      id: rule.id,
      severity: rule.severity,
      emoji: rule.emoji,
      title: rule.title,
      message: buildMetricMessage(
        rule,
        triggeredDays.map((day) => formatDateLabel(day.date)),
        days.length,
      ),
      thresholdLabel: buildThresholdLabel(rule, target),
      triggeredCount: triggeredDays.length,
      triggeredDates: triggeredDays.map((day) => day.date),
    });
  }

  const unloggedDays = days.filter((day) => !day.logged);
  if (unloggedDays.length >= 2) {
    alerts.push({
      id: "logging-gap",
      severity: "warning",
      emoji: "📝",
      title: "Logging Gap Detected",
      message: `No meals were logged on ${unloggedDays.length} of the last ${days.length} completed days (${unloggedDays.map((day) => formatDateLabel(day.date)).join(", ")}).`,
      thresholdLabel: "At least 1 logged meal/day",
      triggeredCount: unloggedDays.length,
      triggeredDates: unloggedDays.map((day) => day.date),
    });
  }

  const severityRank: Record<NutritionAlertSeverity, number> = {
    danger: 0,
    warning: 1,
  };

  return alerts.sort((a, b) => {
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.triggeredCount - a.triggeredCount;
  });
}
