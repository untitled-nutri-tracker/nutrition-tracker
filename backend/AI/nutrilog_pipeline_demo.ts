/**
 * NutriLog AI Pipeline — End-to-End Demo
 *
 * Demonstrates the full RAG pipeline:
 *   Dummy food data → .nlog transpiler → prompt assembly → Ollama LLM → personalized response
 *
 * Run: npx tsx nutrilog_pipeline_demo.ts
 */

import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Ollama exposes an OpenAI-compatible API at localhost:11434
const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: "http://localhost:11434/v1",
});

// ─── 1. DUMMY DATA (simulates what the System Architect's DB query returns) ──

interface FoodLogRow {
    timestamp: number;
    food_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

interface UserProfile {
    name: string;
    dailyCalorieTarget: number;
    goal: string;
    weight: number; // lbs
    height: number; // inches
    activityLevel: string;
}

const dummyUser: UserProfile = {
    name: "Vineet",
    dailyCalorieTarget: 2200,
    goal: "Lose weight",
    weight: 180,
    height: 70,
    activityLevel: "Moderate",
};

// A week of fake food logs
const dummyLogs: FoodLogRow[] = [
    // Monday - decent day
    { timestamp: 1739145600, food_name: "Oatmeal with Berries", calories: 350, protein: 12.0, carbs: 58.0, fat: 8.0 },
    { timestamp: 1739145600, food_name: "Grilled Chicken Salad", calories: 420, protein: 45.0, carbs: 12.0, fat: 18.0 },
    { timestamp: 1739145600, food_name: "Salmon with Rice", calories: 550, protein: 38.0, carbs: 55.0, fat: 16.0 },
    // Tuesday - high calorie day
    { timestamp: 1739232000, food_name: "Pancakes with Syrup", calories: 600, protein: 10.0, carbs: 95.0, fat: 20.0 },
    { timestamp: 1739232000, food_name: "Double Cheeseburger", calories: 850, protein: 45.0, carbs: 50.0, fat: 52.0 },
    { timestamp: 1739232000, food_name: "Large Pizza Slice x3", calories: 900, protein: 36.0, carbs: 96.0, fat: 36.0 },
    // Wednesday - skipped meals
    { timestamp: 1739318400, food_name: "Coffee only", calories: 5, protein: 0.0, carbs: 0.0, fat: 0.0 },
    { timestamp: 1739318400, food_name: "Large Burrito", calories: 980, protein: 42.0, carbs: 90.0, fat: 38.0 },
    // Thursday - balanced
    { timestamp: 1739404800, food_name: "Greek Yogurt Parfait", calories: 280, protein: 18.0, carbs: 35.0, fat: 8.0 },
    { timestamp: 1739404800, food_name: "Turkey Sandwich", calories: 380, protein: 28.0, carbs: 40.0, fat: 12.0 },
    { timestamp: 1739404800, food_name: "Stir Fry Vegetables", calories: 320, protein: 15.0, carbs: 30.0, fat: 14.0 },
    // Friday - snack heavy
    { timestamp: 1739491200, food_name: "Granola Bar", calories: 190, protein: 4.0, carbs: 30.0, fat: 7.0 },
    { timestamp: 1739491200, food_name: "Chips and Salsa", calories: 420, protein: 5.0, carbs: 55.0, fat: 22.0 },
    { timestamp: 1739491200, food_name: "Pad Thai", calories: 650, protein: 25.0, carbs: 80.0, fat: 22.0 },
    { timestamp: 1739491200, food_name: "Ice Cream", calories: 350, protein: 5.0, carbs: 40.0, fat: 18.0 },
];

// ─── 2. THE TRANSPILER (.nlog converter) ─────────────────────────────────────

function formatDateYYMMDD(unixTimestamp: number): string {
    const d = new Date(unixTimestamp * 1000);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
}

function sanitizeFoodName(name: string): string {
    return name.replace(/\|/g, "-").slice(0, 30);
}

function transpileToNlog(rows: FoodLogRow[]): string {
    const header = "NLOG/1.0\nH|date|food|cal|pro|carb|fat\n---";

    const dataLines = rows
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((row) => {
            const date = formatDateYYMMDD(row.timestamp);
            const food = sanitizeFoodName(row.food_name);
            return `${date}|${food}|${row.calories}|${row.protein.toFixed(1)}|${row.carbs.toFixed(1)}|${row.fat.toFixed(1)}`;
        })
        .join("\n");

    return `${header}\n${dataLines}`;
}

// ─── 3. PROMPT ASSEMBLY ──────────────────────────────────────────────────────

function buildSystemPrompt(user: UserProfile, nlogData: string): string {
    return `You are a food diary analysis assistant. You help users understand their eating patterns by analyzing their food log data. This is NOT medical advice — it is simply pattern analysis of the numbers below.

USER INFO:
- Name: ${user.name}
- Daily Calorie Target: ${user.dailyCalorieTarget} kcal
- Fitness Goal: ${user.goal}

FOOD LOG DATA (format: date|food|calories|protein_g|carbs_g|fat_g):
${nlogData}

YOUR TASK:
1. Calculate the daily calorie totals for each day in the log.
2. Compare each day's total against the ${user.dailyCalorieTarget} kcal target.
3. Identify which specific foods contributed the most calories.
4. Suggest one small, practical swap the user could make.
Keep your response to 2-3 short paragraphs. Reference specific foods and dates.`;
}

// ─── 4. THE PIPELINE ─────────────────────────────────────────────────────────

async function runPipeline(userQuestion: string) {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  NutriLog AI Pipeline — End-to-End Demo");
    console.log("═══════════════════════════════════════════════════════");

    // Step 1: Transpile food logs to .nlog
    console.log("\n📊 Step 1: Transpiling food logs to .nlog format...");
    const nlogData = transpileToNlog(dummyLogs);
    console.log("─────────────────────────────────────────────────────");
    console.log(nlogData);
    console.log("─────────────────────────────────────────────────────");
    console.log(`✅ ${dummyLogs.length} entries → ${nlogData.length} characters (~${Math.ceil(nlogData.length / 4)} tokens)`);

    // Step 2: Assemble the prompt
    console.log("\n🧩 Step 2: Assembling prompt with user profile + .nlog context...");
    const systemPrompt = buildSystemPrompt(dummyUser, nlogData);
    console.log(`✅ System prompt: ${systemPrompt.length} chars (~${Math.ceil(systemPrompt.length / 4)} tokens)`);

    // Step 3: Send to LLM
    console.log(`\n💬 Step 3: Sending to Ollama (llama3.2:1b)...`);
    console.log(`   User question: "${userQuestion}"`);
    console.log("   ⏳ Generating response...\n");

    try {
        const { text, usage } = await generateText({
            model: ollama("llama3.2:1b"),
            system: systemPrompt,
            prompt: userQuestion,
        });

        console.log("━━━ 🤖 NutriLog AI Response ━━━━━━━━━━━━━━━━━━━━━━━");
        console.log();
        console.log(text);
        console.log();
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        if (usage) {
            console.log(`\n📈 Token usage: ${usage.inputTokens} prompt + ${usage.outputTokens} completion = ${(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)} total`);
        }
    } catch (err) {
        console.error("❌ Error calling Ollama:", (err as Error).message);
        console.error("\nMake sure Ollama is running: brew services start ollama");
        console.error("And the model is pulled: ollama pull llama3.2:1b");
    }

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  ✅ Pipeline complete!");
    console.log("═══════════════════════════════════════════════════════");
}

// ─── RUN ──────────────────────────────────────────────────────────────────────

const question = process.argv[2] || "Why am I not losing weight? Give me specific feedback based on my food log.";
runPipeline(question).catch(console.error);
