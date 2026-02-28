import type { Sex, ActivityLevel } from "../types/profile";

export function calcBmrMifflinStJeor(params: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
}): number {
  const { sex, age, heightCm, weightKg } = params;

  // BMR = 10W + 6.25H - 5A + s
  // s = +5 (male), -161 (female)
  const s = sex === "male" ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s;
}

export function activityMultiplier(level: ActivityLevel): number {
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
      return 1.2;
  }
}

export function calcTdee(params: {
  bmr: number;
  activityLevel: ActivityLevel;
}): number {
  return params.bmr * activityMultiplier(params.activityLevel);
}

export function roundKcal(x: number): number {
  return Math.round(x);
}