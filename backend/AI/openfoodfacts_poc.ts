/**
 * OpenFoodFacts API — Proof of Concept
 * 
 * Task 1.7: AI SDK Evaluation & OpenFoodFacts Research
 * Owner: Vineet Marri
 * 
 * Demonstrates:
 *  1. Barcode product lookup
 *  2. Text search
 *  3. Response parsing into NutriLog-compatible interface
 *  4. Error handling
 * 
 * Run: npx tsx openfoodfacts_poc.ts
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Cleaned product representation matching NutriLog's needs */
interface NutriLogProduct {
  barcode: string;
  name: string;
  brand: string;
  calories: number;      // per 100g
  protein: number;       // per 100g
  carbs: number;         // per 100g
  fat: number;           // per 100g
  fiber: number;         // per 100g
  sugars: number;        // per 100g
  servingSize: string;   // e.g. "15 g"
  imageUrl: string;
  nutriScore: string;    // a-e
  novaGroup: number;     // 1-4
}

interface SearchResult {
  totalCount: number;
  page: number;
  pageSize: number;
  products: NutriLogProduct[];
}

// ─── API Config ──────────────────────────────────────────────────────────────

const BASE_URL = "https://world.openfoodfacts.org";

const HEADERS = {
  "User-Agent": "NutriLog/0.1.0 (capstone-project; vineet@vt.edu)",
};

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseProduct(raw: any): NutriLogProduct {
  const n = raw.nutriments || {};
  return {
    barcode: raw.code || "",
    name: raw.product_name || "Unknown Product",
    brand: raw.brands || "Unknown Brand",
    calories: Number(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0),
    protein: Number(n["proteins_100g"] ?? 0),
    carbs: Number(n["carbohydrates_100g"] ?? 0),
    fat: Number(n["fat_100g"] ?? 0),
    fiber: Number(n["fiber_100g"] ?? 0),
    sugars: Number(n["sugars_100g"] ?? 0),
    servingSize: raw.serving_size || "100 g",
    imageUrl: raw.image_url || "",
    nutriScore: raw.nutriscore_grade || "unknown",
    novaGroup: raw.nova_group || 0,
  };
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Look up a product by its barcode (UPC/EAN).
 * @param barcode - The barcode string, e.g. "3017620422003"
 * @returns The parsed product, or null if not found
 */
async function lookupByBarcode(barcode: string): Promise<NutriLogProduct | null> {
  const url = `${BASE_URL}/api/v2/product/${barcode}.json`;
  console.log(`\n🔍 Looking up barcode: ${barcode}`);
  console.log(`   URL: ${url}`);

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`   ❌ HTTP ${res.status}: ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    if (data.status === 0) {
      console.log(`   ⚠️  Product not found for barcode: ${barcode}`);
      return null;
    }

    const product = parseProduct(data.product);
    console.log(`   ✅ Found: ${product.name}`);
    return product;
  } catch (err) {
    console.error(`   ❌ Network error:`, (err as Error).message);
    return null;
  }
}

/**
 * Search for products by name/keyword.
 * @param query - Search string, e.g. "banana"
 * @param pageSize - Number of results (default: 5)
 * @returns Search results with parsed products
 */
async function searchProducts(query: string, pageSize = 5): Promise<SearchResult> {
  const fields = "product_name,nutriments,code,brands,image_url,serving_size,nutriscore_grade,nova_group";
  const url = `${BASE_URL}/api/v2/search?search_terms=${encodeURIComponent(query)}&page_size=${pageSize}&fields=${fields}`;
  console.log(`\n🔎 Searching for: "${query}" (page_size=${pageSize})`);
  console.log(`   URL: ${url}`);

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`   ❌ HTTP ${res.status}: ${res.statusText}`);
      return { totalCount: 0, page: 0, pageSize: 0, products: [] };
    }

    const data = await res.json();
    const products = (data.products || []).map(parseProduct);

    console.log(`   ✅ Found ${data.count} total results, showing ${products.length}`);
    return {
      totalCount: data.count,
      page: data.page,
      pageSize: data.page_size,
      products,
    };
  } catch (err) {
    console.error(`   ❌ Network error:`, (err as Error).message);
    return { totalCount: 0, page: 0, pageSize: 0, products: [] };
  }
}

// ─── Display Helpers ─────────────────────────────────────────────────────────

function printProduct(p: NutriLogProduct, indent = "   ") {
  console.log(`${indent}┌─────────────────────────────────────────`);
  console.log(`${indent}│ 📦 ${p.name} (${p.brand})`);
  console.log(`${indent}│ 🔢 Barcode: ${p.barcode}`);
  console.log(`${indent}│ 🔥 Calories: ${p.calories} kcal / 100g`);
  console.log(`${indent}│ 🥩 Protein:  ${p.protein} g / 100g`);
  console.log(`${indent}│ 🍞 Carbs:    ${p.carbs} g / 100g`);
  console.log(`${indent}│ 🧈 Fat:      ${p.fat} g / 100g`);
  console.log(`${indent}│ 🥦 Fiber:    ${p.fiber} g / 100g`);
  console.log(`${indent}│ 🍬 Sugars:   ${p.sugars} g / 100g`);
  console.log(`${indent}│ 🍽️  Serving:  ${p.servingSize}`);
  console.log(`${indent}│ ⭐ Nutri:    ${p.nutriScore.toUpperCase()} | NOVA: ${p.novaGroup}`);
  console.log(`${indent}└─────────────────────────────────────────`);
}

function printNlogRow(p: NutriLogProduct) {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const date = `${yy}${mm}${dd}`;
  const name = p.name.replace(/\|/g, "-").slice(0, 30);
  return `${date}|${name}|${Math.round(p.calories)}|${p.protein.toFixed(1)}|${p.carbs.toFixed(1)}|${p.fat.toFixed(1)}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  NutriLog — OpenFoodFacts API Proof of Concept");
  console.log("═══════════════════════════════════════════════════");

  // ── Test 1: Barcode Lookup (Nutella) ──
  console.log("\n━━━ TEST 1: Barcode Lookup ━━━");
  const nutella = await lookupByBarcode("3017620422003");
  if (nutella) {
    printProduct(nutella);
  }

  // ── Test 2: Barcode Lookup (Invalid) ──
  console.log("\n━━━ TEST 2: Invalid Barcode ━━━");
  const notFound = await lookupByBarcode("0000000000000");
  console.log(`   Result: ${notFound === null ? "null (as expected ✅)" : "unexpected product"}`);

  // ── Test 3: Text Search ──
  console.log("\n━━━ TEST 3: Text Search ━━━");
  const results = await searchProducts("chicken breast", 3);
  for (const product of results.products) {
    printProduct(product);
  }

  // ── Test 4: .nlog Format Preview ──
  console.log("\n━━━ TEST 4: .nlog Format Preview ━━━");
  console.log("   NLOG/1.0");
  console.log("   H|date|food|cal|pro|carb|fat");
  console.log("   ---");
  if (nutella) {
    console.log(`   ${printNlogRow(nutella)}`);
  }
  for (const product of results.products) {
    console.log(`   ${printNlogRow(product)}`);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ✅ All PoC tests completed");
  console.log("═══════════════════════════════════════════════════");
}

main().catch(console.error);
