import type { AppUserProfile } from "../generated/types";

export type NutritionGoal = "weight_loss" | "maintenance" | "muscle_gain";

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

function normalizeGoal(goal: string): NutritionGoal {
  if (goal === "weight_loss" || goal === "muscle_gain") {
    return goal;
  }
  return "maintenance";
}

function safeNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getActivityMultiplier(level: string): number {
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "active":
      return 1.725;
    case "very_active":
      return 1.9;
    default:
      return 1.55;
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
  const isMale = profile.sex.toLowerCase() === "male";
  const activityMultiplier = getActivityMultiplier(profile.activityLevel);

  const bmr = isMale
    ? 10 * bodyWeightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * bodyWeightKg + 6.25 * heightCm - 5 * age - 161;

  const tdee = bmr * activityMultiplier;

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
