import type { AppUserProfile, NutritionTrendPoint } from "../generated/types";
import { calcBmrMifflinStJeor, calcTdee } from "./bmr";
import type { ActivityLevel, Sex } from "../types/profile";

export type NutritionGoal = "weight_loss" | "maintenance" | "muscle_gain";
export type TrendMetric = "calories" | "protein" | "carbs" | "fat";

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isPersonalized: boolean;
  sourceLabel: string;
}

const DEFAULT_TARGETS: Omit<MacroTargets, "isPersonalized" | "sourceLabel"> = {
  calories: 2000,
  protein: 90,
  carbs: 250,
  fat: 65,
};

const TREND_METRICS: readonly TrendMetric[] = ["calories", "protein", "carbs", "fat"];

function normalizeGoal(goal: string): NutritionGoal {
  if (goal === "weight_loss" || goal === "muscle_gain") {
    return goal;
  }
  return "maintenance";
}

function safeNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSex(value: string): Sex {
  return value.toLowerCase() === "male" ? "male" : "female";
}

function normalizeActivityLevel(value: string): ActivityLevel {
  switch (value) {
    case "sedentary":
    case "light":
    case "moderate":
    case "active":
    case "very_active":
      return value;
    default:
      return "moderate";
  }
}

export function getNutritionTargets(profile: AppUserProfile | null, goal: string): MacroTargets {
  if (!profile) {
    return {
      ...DEFAULT_TARGETS,
      isPersonalized: false,
      sourceLabel: "Default targets",
    };
  }

  const bodyWeightKg = safeNumber(profile.weightKg, 70);
  const heightCm = safeNumber(profile.heightCm, 170);
  const age = safeNumber(profile.age, 30);
  const goalMode = normalizeGoal(goal);
  const bmr = calcBmrMifflinStJeor({
    sex: normalizeSex(profile.sex),
    age,
    heightCm,
    weightKg: bodyWeightKg,
  });
  const tdee = calcTdee({
    bmr,
    activityLevel: normalizeActivityLevel(profile.activityLevel),
  });

  let calories = tdee;
  let protein = bodyWeightKg * 1.2;

  if (goalMode === "weight_loss") {
    calories = tdee - 400;
    protein = bodyWeightKg * 1.4;
  } else if (goalMode === "muscle_gain") {
    calories = tdee + 300;
    protein = bodyWeightKg * 1.8;
  }

  const carbs = (calories * 0.45) / 4;
  const fat = (calories * 0.25) / 9;

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    isPersonalized: true,
    sourceLabel: `Personalized to ${goalMode.replace("_", " ")}`,
  };
}

export function getMacroPercent(actual: number, target: number): number {
  if (target <= 0) return 0;
  return (actual / target) * 100;
}

export function getMacroZoneLabel(percent: number): string {
  if (percent < 80) return "Below target";
  if (percent <= 120) return "On target";
  return "Above target";
}

export function getMacroZoneTone(percent: number): string {
  if (percent < 80) return "low";
  if (percent <= 120) return "balanced";
  return "high";
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function isTrendMetric(value: string): value is TrendMetric {
  return TREND_METRICS.includes(value as TrendMetric);
}

export function getTrendMetricValue(point: NutritionTrendPoint, metric: TrendMetric): number {
  switch (metric) {
    case "calories":
      return point.totals.caloriesKcal;
    case "protein":
      return point.totals.proteinG;
    case "carbs":
      return point.totals.totalCarbohydrateG;
    case "fat":
      return point.totals.fatG;
  }
}

export function getTargetForMetric(targets: MacroTargets, metric: TrendMetric): number {
  switch (metric) {
    case "calories":
      return targets.calories;
    case "protein":
      return targets.protein;
    case "carbs":
      return targets.carbs;
    case "fat":
      return targets.fat;
  }
}
