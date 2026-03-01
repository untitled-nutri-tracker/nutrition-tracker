import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ollama = createOpenAICompatible({
    name: 'ollama',
    baseURL: 'http://localhost:11434/v1',
});

/** Round a number to 1 decimal place for token efficiency */
const r = (n: number) => Math.round(n * 10) / 10;

/** Convert a food JSON object into a single .nlog line
 * 
 * .nlog Specification v1:
 * YYMMDD|Name|Cal|Pro|Carb|Fat|SatFat|Sugar|Fiber|Sod|Chol
 * 
 * All values are per serving. Numbers rounded to 1 decimal.
 */
function toNlog(food: any, dateStr: string): string {
    const nf = food.nutrition_facts;
    return [
        dateStr,
        food.food.name,
        r(nf.calories_kcal),
        r(nf.protein_g),
        r(nf.total_carbohydrate_g),
        r(nf.fat_g),
        r(nf.saturated_fat_g),
        r(nf.total_sugars_g),
        r(nf.dietary_fiber_g),
        r(nf.sodium_mg),
        r(nf.cholesterol_mg),
    ].join('|');
}

// ── Load JSON Data ───────────────────────────────────────────
const dataDir = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== '.gitkeep');

if (files.length === 0) {
    console.error("No JSON files found in src-ai/data/!");
    console.error("Run the Rust fetcher first:  cargo run --bin fetch_test");
    process.exit(1);
}

// Support multiple food entries (multi-entry log)
const date = new Date();
const yymmdd = date.toISOString().slice(2, 10).replace(/-/g, '');

const nlogLines: string[] = [];
const rawJsonTokenEstimate = { total: 0 };

for (const file of files) {
    const raw = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const foodData = JSON.parse(raw);
    rawJsonTokenEstimate.total += Math.ceil(raw.length / 4);
    nlogLines.push(toNlog(foodData, yymmdd));
}

const nlogPayload = nlogLines.join('\n');
const nlogTokenEstimate = Math.ceil(nlogPayload.length / 4);

// ── Display Results ──────────────────────────────────────────
console.log(`Loaded ${files.length} food entry(ies) from src-ai/data/`);
console.log('Format: YYMMDD|Name|Cal|Pro|Carb|Fat|SatFat|Sugar|Fiber|Sod|Chol');
console.log('─'.repeat(60));
console.log(nlogPayload);
console.log('─'.repeat(60));

// ── Token Comparison Benchmark ───────────────────────────────
console.log('\n Token Efficiency Benchmark:');
console.log(`   Raw JSON:  ~${rawJsonTokenEstimate.total} tokens`);
console.log(`   .nlog:     ~${nlogTokenEstimate} tokens`);
const savings = Math.round((1 - nlogTokenEstimate / rawJsonTokenEstimate.total) * 100);
console.log(`   Savings:    ${savings}% fewer tokens`);

// ── Feed to LLM with Rich System Prompt ─────────────────────
async function evaluateNlog() {
    console.log('\n Sending .nlog to Local LLM (llama3.2)...\n');
    try {
        const { text, usage } = await generateText({
            model: ollama('llama3.2'),
            system: `You are NutriLog, a privacy-first nutrition assistant that runs entirely on the user's device.
You receive meal logs in a compact pipe-delimited format called .nlog:
YYMMDD|FoodName|Calories|Protein(g)|Carbs(g)|Fat(g)|SatFat(g)|Sugar(g)|Fiber(g)|Sodium(mg)|Cholesterol(mg)

Each line is one food entry. Multiple lines = multiple foods eaten that day.

General daily targets for a healthy adult (2000 kcal diet):
- Calories: 2000 kcal
- Protein: 50g (10-35% of calories)
- Carbs: 275g (45-65% of calories)
- Fat: 65g (<30% of calories), Saturated Fat: <20g
- Fiber: 28g
- Sodium: <2300mg
- Sugar: <50g

Be encouraging but honest. Flag any major concerns (e.g. very high sugar or sodium).
Keep your response to 2-3 sentences max.`,
            prompt: nlogPayload,
        });

        console.log('AI Response:');
        console.log(text);
        console.log('\n Token Usage:');
        console.log(`   Prompt:     ${usage.promptTokens} tokens`);
        console.log(`   Completion: ${usage.completionTokens} tokens`);
        console.log(`   Total:      ${usage.totalTokens} tokens`);
    } catch (error: any) {
        console.error("\n LLM Error:", error.message);
        console.log("\nThe pipeline is wired correctly, but Ollama is not responding.");
        console.log("Make sure Ollama is running and you have pulled the model:");
        console.log("  ollama pull llama3.2");
    }
}

evaluateNlog();
