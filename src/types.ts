/** Shared types used across multiple pages. */

export interface Food {
  id: number;
  name: string;
  brand: string;
  barcode?: string;
  category?: string;
  source?: string;
  refUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Serving {
  id: number;
  food: Food;
  amount: number;
  unit: string;
  gramsEquiv: number;
  isDefault?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface Meal {
  id: number;
  occurredAt: number;
  mealType: string;
  title: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface MealItem {
  id: number;
  meal: Meal;
  food: Food;
  serving: Serving;
  quantity: number;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface NutritionFacts {
  SERVING: Serving;
  CALORIES_KCAL: number;
  PROTEIN_G: number;
  TOTAL_CARBOHYDRATE_G: number;
  FAT_G: number;
  DIETARY_FIBER_G: number;
  TOTAL_SUGARS_G: number;
  SATURATED_FAT_G?: number;
  TRANS_FAT_G?: number;
  CHOLESTEROL_MG?: number;
  SODIUM_MG?: number;
  ADDED_SUGARS_G?: number;
  VITAMIN_D_MCG?: number;
  CALCIUM_MG?: number;
  IRON_MG?: number;
}

export interface SearchProduct {
  product_name: string;
  barcode: string;
  brands: string;
  categories: string;
  image_url: string;
  calories_kcal: number;
  fat_g: number;
  saturated_fat_g: number;
  trans_fat_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  total_carbohydrate_g: number;
  dietary_fiber_g: number;
  total_sugars_g: number;
  added_sugars_g: number;
  protein_g: number;
  vitamin_d_mcg: number;
  calcium_mg: number;
  iron_mg: number;
}

export interface SearchResult {
  count: number;
  page: number;
  page_size: number;
  products: SearchProduct[];
}

/** Meal type display config. */
export const MEAL_TYPES = [
  { value: "BREAKFAST", label: "🌅 Breakfast", icon: "🌅", hours: [0, 10] },
  { value: "LUNCH", label: "☀️ Lunch", icon: "☀️", hours: [10, 14] },
  { value: "DINNER", label: "🌙 Dinner", icon: "🌙", hours: [14, 21] },
  { value: "SNACK", label: "🍿 Snack", icon: "🍿", hours: [21, 24] },
] as const;

export const MEAL_ICONS: Record<string, string> = {
  BREAKFAST: "🌅", BRUNCH: "🥂", LUNCH: "☀️", DINNER: "🌙",
  SNACK: "🍿", NIGHTSNACK: "🌃", CUSTOM: "🍽️",
};

export const MEAL_ORDER: Record<string, number> = {
  BREAKFAST: 1, BRUNCH: 2, LUNCH: 3, DINNER: 4, SNACK: 5, NIGHTSNACK: 6, CUSTOM: 7,
};

/** Round to 1 decimal place. */
export const r = (n: number) => Math.round(n * 10) / 10;

/** Get default meal type based on current hour. */
export function defaultMealType(): string {
  const h = new Date().getHours();
  return MEAL_TYPES.find((m) => h >= m.hours[0] && h < m.hours[1])?.value || "SNACK";
}

/** Today as YYYY-MM-DD string. */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convert YYYY-MM-DD to UNIX epoch (start of day). */
export function dateToEpoch(d: string): number {
  return Math.floor(new Date(d + "T00:00:00").getTime() / 1000);
}
