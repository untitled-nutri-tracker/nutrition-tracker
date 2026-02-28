export type Sex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export interface UserProfile {
  version: 1;
  createdAt: string; // ISO
  updatedAt: string; // ISO

  name?: string;

  sex: Sex;
  age: number; // years
  heightCm: number;
  weightKg: number;

  activityLevel: ActivityLevel;
}