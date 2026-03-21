import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SearchProduct, SearchResult, MEAL_TYPES,
  r, defaultMealType, todayStr,
} from "../types";

function relevanceScore(product: SearchProduct, query: string): number {
  const name = product.product_name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (name === q) return 100;
  if (name.startsWith(q + " ") || name.startsWith(q)) return 80;
  const words = name.split(/\s+/);
  if (words.some((w) => w === q)) return 60;
  if (name.includes(q)) return 40;
  return 10;
}

function rankResults(products: SearchProduct[], query: string): SearchProduct[] {
  return products
    .filter((p) => p.calories_kcal > 0 || p.protein_g > 0 || p.total_carbohydrate_g > 0)
    .sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
}

export default function LogFood() {
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [mealType, setMealType] = useState(defaultMealType());
  const [date, setDate] = useState(todayStr());
  const [quantity, setQuantity] = useState<Record<string, string>>({});

  async function handleTextSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SearchResult>("search_food_online", {
        query: query.trim(),
        page: 1,
      });
      setResults(rankResults(result.products, query));
      setTotalCount(result.count);
    } catch (e: any) {
      setError(e?.toString() ?? "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleBarcodeSearch() {
    if (!barcode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SearchResult>("fetch_food_by_barcode", {
        barcode: barcode.trim(),
      });
      setResults(result.products);
      setTotalCount(result.count);
    } catch (e: any) {
      setError(e?.toString() ?? "Barcode lookup failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleLog(product: SearchProduct) {
    const uid = product.barcode || product.product_name;
    setLoggingId(uid);
    try {
      const now = Math.floor(Date.now() / 1000);
      const occurredAt = Math.floor(new Date(date + "T12:00:00").getTime() / 1000);
      const qty = parseFloat(quantity[uid] || "1") || 1;

      // 1. Save food to library
      const food = await invoke<any>("create_food", {
        food: {
          id: 0,
          name: product.product_name,
          brand: product.brands,
          category: product.categories,
          source: "openfoodfacts",
          refUrl: "",
          barcode: product.barcode,
          createdAt: now,
          updatedAt: now,
        },
      });

      // 2. Create default 100g serving
      const serving = await invoke<any>("create_serving", {
        serving: {
          id: 0,
          food,
          amount: 100,
          unit: "GRAM",
          gramsEquiv: 100,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
      });

      // 3. Save nutrition facts
      await invoke("create_nutrition_facts", {
        nutritionFacts: {
          SERVING: serving,
          CALORIES_KCAL: product.calories_kcal,
          FAT_G: product.fat_g,
          SATURATED_FAT_G: product.saturated_fat_g,
          TRANS_FAT_G: product.trans_fat_g,
          CHOLESTEROL_MG: product.cholesterol_mg,
          SODIUM_MG: product.sodium_mg,
          TOTAL_CARBOHYDRATE_G: product.total_carbohydrate_g,
          DIETARY_FIBER_G: product.dietary_fiber_g,
          TOTAL_SUGARS_G: product.total_sugars_g,
          ADDED_SUGARS_G: product.added_sugars_g,
          PROTEIN_G: product.protein_g,
          VITAMIN_D_MCG: product.vitamin_d_mcg,
          CALCIUM_MG: product.calcium_mg,
          IRON_MG: product.iron_mg,
        },
      });

      // 4. Create or find meal for this date + type
      const meal = await invoke<any>("create_meal", {
        meal: {
          id: 0,
          occurredAt,
          mealType: mealType,
          title: "",
          note: "",
          createdAt: now,
          updatedAt: now,
        },
      });

      // 5. Add food as meal item
      await invoke("create_meal_item", {
        mealItem: {
          id: 0,
          meal,
          food,
          serving,
          quantity: qty,
          note: "",
          createdAt: now,
          updatedAt: now,
        },
      });

      setLoggedIds((prev) => new Set(prev).add(uid));
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to log food");
    } finally {
      setLoggingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, action: () => void) {
    if (e.key === "Enter") action();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Meal type + date selector */}
      <div className="card" style={{ maxWidth: 900 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Log Food</div>
        <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}>
          Search for food, then save it directly to your meal log.
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt.value}
              onClick={() => setMealType(mt.value)}
              style={{
                ...pillStyle,
                background: mealType === mt.value
                  ? "linear-gradient(135deg, rgba(124,92,255,0.35), rgba(0,209,255,0.15))"
                  : "rgba(255,255,255,0.04)",
                borderColor: mealType === mt.value
                  ? "rgba(124,92,255,0.5)"
                  : "var(--border)",
              }}
            >
              {mt.label}
            </button>
          ))}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--text)",
              fontSize: 12,
              marginLeft: "auto",
            }}
          />
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ maxWidth: 900 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <input
            id="food-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleTextSearch)}
            placeholder="Search food (e.g. banana, pizza, chicken breast)…"
            style={inputStyle}
          />
          <button
            id="food-search-btn"
            onClick={handleTextSearch}
            disabled={loading || !query.trim()}
            style={{ ...buttonStyle, opacity: loading || !query.trim() ? 0.6 : 1 }}
          >
            {loading ? "Searching…" : "🔍 Search"}
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <input
            id="barcode-input"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleBarcodeSearch)}
            placeholder="Or enter a barcode…"
            style={inputStyle}
          />
          <button
            id="barcode-search-btn"
            onClick={handleBarcodeSearch}
            disabled={loading || !barcode.trim()}
            style={{ ...buttonStyle, opacity: loading || !barcode.trim() ? 0.6 : 1 }}
          >
            {loading ? "Looking up…" : "📷 Barcode"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ maxWidth: 900, border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>
          <div style={{ fontWeight: 600 }}>Error</div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>{error}</div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ maxWidth: 900 }}>
          <div style={{ fontSize: 13, color: "var(--muted2)", marginBottom: 10 }}>
            {totalCount.toLocaleString()} result{totalCount !== 1 ? "s" : ""} found — showing {results.length}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {results.map((product, i) => {
              const uid = product.barcode || product.product_name;
              const isLogged = loggedIds.has(uid);
              const isLogging = loggingId === uid;

              return (
                <div
                  key={`${product.barcode}-${i}`}
                  className="card"
                  style={{
                    display: "grid",
                    gridTemplateColumns: product.image_url ? "56px 1fr auto" : "1fr auto",
                    gap: 14,
                    alignItems: "start",
                  }}
                >
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.product_name}
                      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
                    />
                  )}

                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{product.product_name}</div>
                    {product.brands && (
                      <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 2 }}>
                        {product.brands}{product.categories ? ` · ${product.categories}` : ""}
                      </div>
                    )}

                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <MacroBadge label="Cal" value={r(product.calories_kcal)} unit="kcal" color="rgba(255,170,50,0.18)" />
                      <MacroBadge label="Protein" value={r(product.protein_g)} unit="g" color="rgba(80,200,120,0.18)" />
                      <MacroBadge label="Carbs" value={r(product.total_carbohydrate_g)} unit="g" color="rgba(100,149,237,0.18)" />
                      <MacroBadge label="Fat" value={r(product.fat_g)} unit="g" color="rgba(255,99,132,0.18)" />
                    </div>
                  </div>

                  {/* Quantity + Log button */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <label style={{ fontSize: 11, color: "var(--muted2)" }}>Qty:</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={quantity[uid] ?? "1"}
                        onChange={(e) => setQuantity((prev) => ({ ...prev, [uid]: e.target.value }))}
                        style={{ width: 50, padding: "4px 6px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--text)", fontSize: 12, textAlign: "center" }}
                      />
                    </div>
                    <button
                      onClick={() => handleLog(product)}
                      disabled={isLogged || isLogging}
                      style={{
                        ...logBtnStyle,
                        opacity: isLogged || isLogging ? 0.6 : 1,
                        background: isLogged ? "rgba(80,200,120,0.12)" : logBtnStyle.background,
                        borderColor: isLogged ? "rgba(80,200,120,0.35)" : "rgba(124,92,255,0.35)",
                      }}
                    >
                      {isLogged ? "✓ Logged" : isLogging ? "Logging…" : "📝 Log"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && (query || barcode) && !error && (
        <div className="card" style={{ maxWidth: 900 }}>
          <div style={{ color: "var(--muted2)", fontSize: 13 }}>
            No results found. Try a different search term or barcode.
          </div>
        </div>
      )}
    </div>
  );
}

function MacroBadge({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, padding: "4px 10px", borderRadius: 10, background: color, border: "1px solid rgba(255,255,255,0.08)", fontSize: 12 }}>
      <span style={{ color: "var(--muted2)" }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}<span style={{ fontWeight: 400, fontSize: 10, marginLeft: 1 }}>{unit}</span></span>
    </span>
  );
}

const pillStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  background: "rgba(255,255,255,0.04)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text)",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid rgba(124,92,255,0.35)",
  background: "linear-gradient(135deg, rgba(124,92,255,0.25), rgba(0,209,255,0.10))",
  color: "var(--text)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 600,
  fontSize: 13,
};

const logBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 10,
  border: "1px solid rgba(124,92,255,0.35)",
  background: "linear-gradient(135deg, rgba(124,92,255,0.15), rgba(0,209,255,0.08))",
  color: "var(--text)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontSize: 12,
  fontWeight: 600,
};
