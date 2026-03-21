import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import ProfileSummaryCard from "../components/ProfileSummaryCard";

interface Meal {
  id: number;
  occurredAt: number;
  mealType: string;
  title: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

interface Food { id: number; name: string; brand: string; }
interface Serving { id: number; food: Food; amount: number; unit: string; gramsEquiv: number; }

interface MealItem {
  id: number;
  meal: Meal;
  food: Food;
  serving: Serving;
  quantity: number;
  note: string;
  createdAt: number;
  updatedAt: number;
}

interface NutritionFacts {
  SERVING: Serving;
  CALORIES_KCAL: number;
  PROTEIN_G: number;
  TOTAL_CARBOHYDRATE_G: number;
  FAT_G: number;
  DIETARY_FIBER_G: number;
  TOTAL_SUGARS_G: number;
}

const r = (n: number) => Math.round(n * 10) / 10;

const MEAL_ORDER: Record<string, number> = {
  BREAKFAST: 1, BRUNCH: 2, LUNCH: 3, DINNER: 4, SNACK: 5, NIGHTSNACK: 6, CUSTOM: 7,
};

const MEAL_ICONS: Record<string, string> = {
  BREAKFAST: "🌅", BRUNCH: "🥂", LUNCH: "☀️", DINNER: "🌙",
  SNACK: "🍿", NIGHTSNACK: "🌃", CUSTOM: "🍽️",
};

function dateToEpoch(d: string): number {
  return Math.floor(new Date(d + "T00:00:00").getTime() / 1000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyLog() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayStr());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealItems, setMealItems] = useState<Record<number, MealItem[]>>({});
  const [nutrition, setNutrition] = useState<Record<number, NutritionFacts>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");

  const loadDay = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const start = dateToEpoch(date);
      const end = start + 86400;
      const dayMeals = await invoke<Meal[]>("list_meals_by_date_range", { start, end });
      setMeals(dayMeals.sort((a, b) => (MEAL_ORDER[a.mealType] || 99) - (MEAL_ORDER[b.mealType] || 99)));

      const itemMap: Record<number, MealItem[]> = {};
      const nutMap: Record<number, NutritionFacts> = {};

      for (const meal of dayMeals) {
        const items = await invoke<MealItem[]>("list_meal_items_by_meal", { mealId: meal.id });
        itemMap[meal.id] = items;

        for (const item of items) {
          if (!nutMap[item.serving.id]) {
            try {
              const nf = await invoke<NutritionFacts | null>("get_nutrition_facts", { servingId: item.serving.id });
              if (nf) nutMap[item.serving.id] = nf;
            } catch (_) {}
          }
        }
      }
      setMealItems(itemMap);
      setNutrition(nutMap);
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadDay(); }, [loadDay]);

  async function handleDeleteItem(id: number) {
    try {
      await invoke("delete_meal_item", { id });
      await loadDay();
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to delete");
    }
  }

  async function handleSaveQty(item: MealItem) {
    const newQty = parseFloat(editQtyValue) || 1;
    if (newQty === item.quantity) { setEditingQty(null); return; }
    try {
      const ts = Math.floor(Date.now() / 1000);
      await invoke("update_meal_item", {
        mealItem: { ...item, quantity: newQty, updatedAt: ts },
      });
      setEditingQty(null);
      await loadDay();
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to update");
    }
  }

  // Daily totals
  let totalCal = 0, totalPro = 0, totalCarbs = 0, totalFat = 0;
  for (const items of Object.values(mealItems)) {
    for (const item of items) {
      const nf = nutrition[item.serving.id];
      if (nf) {
        totalCal += nf.CALORIES_KCAL * item.quantity;
        totalPro += nf.PROTEIN_G * item.quantity;
        totalCarbs += nf.TOTAL_CARBOHYDRATE_G * item.quantity;
        totalFat += nf.FAT_G * item.quantity;
      }
    }
  }

  const totalItems = Object.values(mealItems).reduce((s, items) => s + items.length, 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <ProfileSummaryCard />

      {/* Header + date + summary */}
      <div className="card" style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Daily Log</div>
            <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 2 }}>
              {totalItems} item{totalItems !== 1 ? "s" : ""} logged
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0,10)); }} style={navBtnStyle}>◀</button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--text)", fontSize: 13 }}
            />
            <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0,10)); }} style={navBtnStyle}>▶</button>
          </div>
        </div>

        {totalCal > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <MacroPill label="Calories" value={r(totalCal)} unit="kcal" color="rgba(255,170,50,0.18)" />
            <MacroPill label="Protein" value={r(totalPro)} unit="g" color="rgba(80,200,120,0.18)" />
            <MacroPill label="Carbs" value={r(totalCarbs)} unit="g" color="rgba(100,149,237,0.18)" />
            <MacroPill label="Fat" value={r(totalFat)} unit="g" color="rgba(255,99,132,0.18)" />
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{ maxWidth: 900, border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>
          <div style={{ fontSize: 13 }}>{error}</div>
        </div>
      )}

      {loading && (
        <div className="card" style={{ maxWidth: 900 }}>
          <div style={{ color: "var(--muted2)", fontSize: 13 }}>Loading…</div>
        </div>
      )}

      {/* Meals grouped by type */}
      {!loading && meals.length === 0 && (
        <div className="card" style={{ maxWidth: 900 }}>
          <div style={{ color: "var(--muted2)", fontSize: 14 }}>
            No meals logged for this day.
          </div>
          <button
            onClick={() => navigate("/log")}
            style={{ ...logMoreBtn, marginTop: 10 }}
          >
            🍽️ Log Food
          </button>
        </div>
      )}

      {meals.map((meal) => {
        const items = mealItems[meal.id] || [];
        if (items.length === 0) return null;

        // Meal-level totals
        let mealCal = 0;
        items.forEach((it) => { const nf = nutrition[it.serving.id]; if (nf) mealCal += nf.CALORIES_KCAL * it.quantity; });

        return (
          <div key={meal.id} className="card" style={{ maxWidth: 900 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {MEAL_ICONS[meal.mealType] || "🍽️"} {meal.mealType.charAt(0) + meal.mealType.slice(1).toLowerCase()}
              </div>
              <span style={{ fontSize: 12, color: "var(--muted2)" }}>
                {r(mealCal)} kcal
              </span>
            </div>

            {items.map((item) => {
              const nf = nutrition[item.serving.id];
              const isEditing = editingQty === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    marginBottom: 6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {item.food.name}
                      {item.food.brand && (
                        <span style={{ fontWeight: 400, color: "var(--muted2)", fontSize: 11, marginLeft: 6 }}>
                          {item.food.brand}
                        </span>
                      )}
                    </div>
                    {nf && (
                      <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 3 }}>
                        {r(nf.CALORIES_KCAL * item.quantity)} kcal · {r(nf.PROTEIN_G * item.quantity)}g P · {r(nf.TOTAL_CARBOHYDRATE_G * item.quantity)}g C · {r(nf.FAT_G * item.quantity)}g F
                      </div>
                    )}
                  </div>

                  {/* Editable quantity */}
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={editQtyValue}
                        onChange={(e) => setEditQtyValue(e.target.value)}
                        onBlur={() => handleSaveQty(item)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveQty(item); if (e.key === "Escape") setEditingQty(null); }}
                        style={{ width: 50, padding: "3px 6px", borderRadius: 6, border: "1px solid rgba(124,92,255,0.4)", background: "rgba(255,255,255,0.06)", color: "var(--text)", fontSize: 12, textAlign: "center" }}
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingQty(item.id); setEditQtyValue(String(item.quantity)); }}
                        style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", color: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        title="Click to edit quantity"
                      >
                        ×{item.quantity}
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      style={{ background: "none", border: "none", color: "rgba(255,80,80,0.7)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Log more food link */}
      {!loading && meals.length > 0 && (
        <div style={{ maxWidth: 900, textAlign: "center" }}>
          <button onClick={() => navigate("/log")} style={logMoreBtn}>
            + Log more food
          </button>
        </div>
      )}
    </div>
  );
}

function MacroPill({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, padding: "5px 12px", borderRadius: 12, background: color, border: "1px solid rgba(255,255,255,0.08)", fontSize: 13 }}>
      <span style={{ color: "var(--muted2)", fontSize: 11 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}<span style={{ fontWeight: 400, fontSize: 10, marginLeft: 1 }}>{unit}</span></span>
    </span>
  );
}

const navBtnStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 14,
};

const logMoreBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 10,
  border: "1px solid rgba(124,92,255,0.3)",
  background: "linear-gradient(135deg, rgba(124,92,255,0.15), rgba(0,209,255,0.08))",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};