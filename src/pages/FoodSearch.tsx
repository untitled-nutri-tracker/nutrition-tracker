import { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Barcode, Camera, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import { createEntry } from "../lib/foodLogStore";
import {
  SearchProduct, SearchResult, PhotoFoodEstimate, MEAL_TYPES,
  r, defaultMealType, todayStr,
} from "../types";
import BarcodeScanner from "../components/BarcodeScanner";
import FoodPhotoScanner from "../components/FoodPhotoScanner";
import FoodVoiceRecorder from "../components/FoodVoiceRecorder";
import AddEntryModal from "../components/AddEntryModal";
import { useAiConfig } from "../hooks/useAiConfig";
import type { FoodEntryDraft } from "../types/foodLog";
import "../styles/barcode-scanner.css";

interface VoiceFoodTranscript {
  transcript: string;
  normalizedQuery: string;
  quantityHint?: number | null;
  mealTypeHint?: "breakfast" | "lunch" | "dinner" | "snack" | null;
  confidence?: number | null;
}

/* ------------------------------------------------------------------ */
/*  Barcode validation helpers                                         */
/* ------------------------------------------------------------------ */
const BARCODE_FORMATS: { name: string; length: number }[] = [
  { name: "UPC-E", length: 8 },
  { name: "EAN-8", length: 8 },
  { name: "UPC-A", length: 12 },
  { name: "EAN-13", length: 13 },
];

function detectBarcodeFormat(code: string): string | null {
  const digits = code.replace(/\D/g, "");
  const match = BARCODE_FORMATS.find((f) => f.length === digits.length);
  return match ? match.name : null;
}

function isBarcodeValid(code: string): boolean {
  const digits = code.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 13 && /^\d+$/.test(digits);
}

/** Strip non-digits and auto-format for readability. */
function formatBarcodeInput(raw: string): string {
  return raw.replace(/[^\d]/g, "").slice(0, 13);
}

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
  const location = useLocation();
  const aiCfg = useAiConfig();
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [mealType, setMealType] = useState(defaultMealType());
  const [date, setDate] = useState<string>(location.state?.date || todayStr());
  const [quantity, setQuantity] = useState<Record<string, string>>({});

  // ---- Scanner state ----
  const [showScanner, setShowScanner] = useState(false);

  // ---- Confirmation card state (for scanned barcodes) ----
  const [confirmProduct, setConfirmProduct] = useState<SearchProduct | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmQty, setConfirmQty] = useState("1");
  const [confirmLogged, setConfirmLogged] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);

  // ---- Food photo scan state ----
  const [showPhotoScanner, setShowPhotoScanner] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoEstimate, setPhotoEstimate] = useState<PhotoFoodEstimate | null>(null);
  const [photoForm, setPhotoForm] = useState({
    foodName: "",
    estimatedGrams: "100",
    calories: "0",
    proteinG: "0",
    carbsG: "0",
    fatG: "0",
    notes: "",
  });
  const [photoLogged, setPhotoLogged] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceResult, setVoiceResult] = useState<VoiceFoodTranscript | null>(null);
  const [voiceLogged, setVoiceLogged] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualEntrySaving, setManualEntrySaving] = useState(false);
  const [manualEntryPrefill, setManualEntryPrefill] = useState<Partial<Omit<FoodEntryDraft, "date">> | undefined>(undefined);

  function resetConfirmState() {
    setConfirmProduct(null);
    setConfirmLogged(false);
    setConfirmQty("1");
    setScannedBarcode(null);
  }

  function resetVoiceState() {
    setVoiceResult(null);
    setVoiceLogged(false);
    setManualEntryOpen(false);
    setManualEntryPrefill(undefined);
  }

  function openVoiceManualEntry(transcript: VoiceFoodTranscript) {
    setManualEntryPrefill(buildVoiceManualDraft(transcript, mealType));
    setManualEntryOpen(true);
  }

  async function runTextSearch(searchTerm: string) {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setResults([]);
      return [] as SearchProduct[];
    }
    setHasSearched(true);
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SearchResult>("search_food_online", {
        query: trimmed,
        page: 1,
      });
      const ranked = rankResults(result.products, trimmed);
      setResults(ranked);
      return ranked;
    } catch (e: any) {
      setError(e?.toString() ?? "Search failed");
      setResults([]);
      return [] as SearchProduct[];
    } finally {
      setLoading(false);
    }
  }

  async function handleTextSearch() {
    resetConfirmState();
    resetVoiceState();
    await runTextSearch(query);
  }

  async function handleBarcodeSearch() {
    const digits = barcode.replace(/\D/g, "");
    if (!digits) return;
    resetVoiceState();
    if (!isBarcodeValid(digits)) {
      setBarcodeError(`Barcode must be 8–13 digits. You entered ${digits.length}.`);
      return;
    }
    await lookupBarcode(digits);
  }

  // Barcode-specific error state (separate from general error)
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeNotFound, setBarcodeNotFound] = useState<string | null>(null);

  /** Shared barcode lookup — used by both manual entry and scanner. */
  async function lookupBarcode(code: string) {
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setBarcodeError(null);
    setBarcodeNotFound(null);
    resetConfirmState();
    setScannedBarcode(code);
    resetVoiceState();
    try {
      const result = await invoke<SearchResult>("fetch_food_by_barcode", {
        barcode: code,
      });
      if (result.products.length > 0) {
        setConfirmProduct(result.products[0]);
        setResults([]);
      } else {
        setBarcodeNotFound(code);
      }
    } catch (e: any) {
      const msg = e?.toString() ?? "";
      // Handle 404 / not-found gracefully
      if (msg.includes("404") || msg.includes("not found") || msg.includes("No product")) {
        setBarcodeNotFound(code);
      } else {
        setBarcodeError(`Lookup failed: ${msg.replace(/^Error:\s*/i, "")}`);
      }
    } finally {
      setLoading(false);
    }
  }

  // Computed barcode validation state
  const barcodeDigits = useMemo(() => barcode.replace(/\D/g, ""), [barcode]);
  const barcodeFormat = useMemo(() => detectBarcodeFormat(barcode), [barcode]);
  const barcodeIsReady = isBarcodeValid(barcode);

  /** Called by the BarcodeScanner component when a barcode is detected. */
  function handleBarcodeDetected(barcodeValue: string, _format: string) {
    setShowScanner(false);
    setBarcode(barcodeValue);
    lookupBarcode(barcodeValue);
  }

  async function handlePhotoCaptured(photo: { imageBase64: string; mimeType: string }) {
    setShowPhotoScanner(false);
    setPhotoLoading(true);
    setPhotoEstimate(null);
    setPhotoLogged(false);
    resetVoiceState();
    setError(null);
    try {
      const storedProvider = localStorage.getItem("nutrilog_vision_provider") || "ollama";
      const allowCloud = localStorage.getItem("nutrilog_photo_scan_cloud_enabled") === "true";
      const selectedProvider = allowCloud || storedProvider === "ollama" ? storedProvider : "ollama";
      const estimate = await invoke<PhotoFoodEstimate>("analyze_food_photo", {
        imageBase64: photo.imageBase64,
        mimeType: photo.mimeType,
        visionProvider: selectedProvider,
        allowCloud,
      });
      setPhotoEstimate(estimate);
      setPhotoForm({
        foodName: estimate.foodName,
        estimatedGrams: String(r(estimate.estimatedGrams || 100)),
        calories: String(r(estimate.calories || 0)),
        proteinG: String(r(estimate.proteinG || 0)),
        carbsG: String(r(estimate.carbsG || 0)),
        fatG: String(r(estimate.fatG || 0)),
        notes: estimate.notes || "",
      });
    } catch (e: any) {
      setError(e?.toString() ?? "Food photo analysis failed");
    } finally {
      setPhotoLoading(false);
    }
  }

  function voiceSourceNote() {
    if (!voiceResult) return undefined;
    const noteParts = [
      `Voice transcript: "${voiceResult.transcript}".`,
      voiceResult.confidence != null
        ? `Speech confidence: ${Math.round(voiceResult.confidence * 100)}%.`
        : "",
    ].filter(Boolean);
    return noteParts.join(" ");
  }

  async function logProduct(product: SearchProduct, qty: number) {
    await createEntry({
      date,
      mealType: mealType as any,
      foodName: product.product_name,
      brand: product.brands || undefined,
      calories: Math.round((product.calories_kcal || 0) * qty),
      proteinG: Math.round((product.protein_g || 0) * qty * 10) / 10,
      carbsG: Math.round((product.total_carbohydrate_g || 0) * qty * 10) / 10,
      fatG: Math.round((product.fat_g || 0) * qty * 10) / 10,
      servingDesc: `${qty} serving`,
      notes: voiceSourceNote(),
    });
  }

  async function handleVoiceCaptured(audio: { audioBase64: string; mimeType: string }) {
    setShowVoiceRecorder(false);
    setVoiceLoading(true);
    resetVoiceState();
    resetConfirmState();
    setError(null);
    try {
      const selectedProvider = aiCfg.config?.selectedProvider || "ollama";
      const transcript = await invoke<VoiceFoodTranscript>("transcribe_food_audio", {
        audioBase64: audio.audioBase64,
        mimeType: audio.mimeType,
        provider: selectedProvider,
      });

      if (transcript.mealTypeHint) {
        setMealType(transcript.mealTypeHint.toUpperCase());
      }

      const normalizedQuery = transcript.normalizedQuery.trim() || transcript.transcript.trim();
      setQuery(normalizedQuery);

      const ranked = await runTextSearch(normalizedQuery);

      if (transcript.quantityHint && ranked.length > 0) {
        const suggestedQty = String(r(transcript.quantityHint));
        setConfirmQty(suggestedQty);
        setQuantity((prev) => {
          const next = { ...prev };
          for (const product of ranked) {
            const uid = product.barcode || product.product_name;
            next[uid] = suggestedQty;
          }
          return next;
        });
      }

      if (ranked.length > 0) {
        setConfirmProduct(ranked[0]);
      } else {
        openVoiceManualEntry(transcript);
      }

      setVoiceResult(transcript);
    } catch (e: any) {
      setError(e?.toString() ?? "Voice transcription failed. Check your AI provider settings and try again.");
    } finally {
      setVoiceLoading(false);
    }
  }

  async function handleQuickVoiceLog() {
    if (!voiceResult) return;
    try {
      const qty = voiceResult.quantityHint && voiceResult.quantityHint > 0 ? voiceResult.quantityHint : 1;
      const name = voiceResult.normalizedQuery.trim() || voiceResult.transcript.trim();
      await createEntry({
        date,
        mealType: (voiceResult.mealTypeHint || mealType.toLowerCase()) as any,
        foodName: name,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        servingDesc: qty === 1 ? "voice entry" : `${r(qty)} servings (voice)`,
        notes: `Voice-only quick log. Transcript: "${voiceResult.transcript}". Nutrition values need review.`,
      });
      setVoiceResult(null);
      setVoiceLogged(true);
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to create quick voice entry");
    }
  }

  function handleOpenManualEntryFromVoice() {
    if (!voiceResult) return;
    openVoiceManualEntry(voiceResult);
  }

  async function handleManualAddEntry(draft: Omit<FoodEntryDraft, "date">) {
    setManualEntrySaving(true);
    try {
      await createEntry({
        ...draft,
        date,
      });
      resetVoiceState();
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to create manual entry");
    } finally {
      setManualEntrySaving(false);
    }
  }

  async function handlePhotoLog() {
    if (!photoEstimate) return;
    try {
      const grams = parseFloat(photoForm.estimatedGrams) || 100;
      const sourceNotes = [
        photoEstimate.usdaFdcId ? "Source: USDA + local vision estimate." : "Source: local vision estimate; USDA match unavailable.",
        `Confidence: ${Math.round((photoEstimate.confidence || 0) * 100)}%.`,
        photoEstimate.usdaDescription ? `USDA match: ${photoEstimate.usdaDescription}.` : "USDA match unavailable.",
        photoEstimate.usdaFdcId ? `FDC ID: ${photoEstimate.usdaFdcId}.` : "",
        photoForm.notes.trim(),
      ].filter(Boolean).join(" ");

      await createEntry({
        date,
        mealType: mealType as any,
        foodName: photoForm.foodName.trim() || photoEstimate.foodName,
        calories: Math.round(parseFloat(photoForm.calories) || 0),
        proteinG: r(parseFloat(photoForm.proteinG) || 0),
        carbsG: r(parseFloat(photoForm.carbsG) || 0),
        fatG: r(parseFloat(photoForm.fatG) || 0),
        servingDesc: `${r(grams)}g estimated`,
        notes: sourceNotes,
      });
      setPhotoLogged(true);
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to log food photo estimate");
    }
  }

  /** Log a product from the confirmation card. */
  async function handleConfirmLog() {
    if (!confirmProduct) return;
    const product = confirmProduct;
    setConfirmLoading(true);
    try {
      const qty = parseFloat(confirmQty) || 1;
      await logProduct(product, qty);
      resetVoiceState();
      setConfirmLogged(true);
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to log food");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleLog(product: SearchProduct) {
    const uid = product.barcode || product.product_name;
    setLoggingId(uid);
    try {
      const qty = parseFloat(quantity[uid] || "1") || 1;
      await logProduct(product, qty);
      resetVoiceState();
      setLoggedIds((prev) => new Set(prev).add(uid));
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to log food");
    } finally {
      setLoggingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, action: () => void) {
    if (e.key === "Enter") {
      e.preventDefault();
      action();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  return (
    <div className="page-enter mx-auto flex w-full max-w-[1000px] flex-col gap-4 p-4 pb-[calc(var(--shell-mobile-content-padding)+1rem)] md:p-8 md:pb-8">
      {/* Meal type + date selector */}
      <div className="card pop-in max-w-[900px]">
        <div className="text-primary font-semibold">Log Food</div>
        <div className="mt-1 text-xs text-muted">
          Search for food, scan a barcode, speak a meal, or enter one manually.
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt.value}
              onClick={() => setMealType(mt.value)}
              className="max-sm:min-h-[44px]"
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
            className="ml-auto rounded-[10px] border border-subtle bg-primary/5 px-2.5 py-[7px] text-xs text-muted [color-scheme:light_dark] max-sm:ml-0 max-sm:w-full max-sm:min-h-[44px]"
          />
        </div>
      </div>

      {/* Search + Barcode input */}
      <div className="card max-w-[900px]">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
          <input
            id="food-search-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHasSearched(false); }}
            onKeyDown={(e) => handleKeyDown(e, handleTextSearch)}
            placeholder="Search food (e.g. banana, pizza, chicken breast)…"
            className="text-[16px] sm:text-[13px] max-sm:min-h-[44px]"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={inputStyle}
          />
          <button
            id="food-search-btn"
            onClick={handleTextSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 disabled:opacity-60 max-sm:min-h-[44px]"
            style={buttonStyle}
          >
            <MagnifyingGlass size={16} weight="bold" />
            <span>{loading ? "Searching…" : "Search"}</span>
          </button>
        </div>

        {/* Barcode input row */}
        <div className="mt-2.5 grid grid-cols-1 items-start gap-2.5 sm:grid-cols-[1fr_auto_auto_auto_auto]">
          <div>
            <div className="relative">
              <input
                id="barcode-input"
                value={barcode}
                onChange={(e) => {
                  setBarcode(formatBarcodeInput(e.target.value)); setHasSearched(false);
                  setBarcodeError(null);
                  setBarcodeNotFound(null);
                }}
                onKeyDown={(e) => handleKeyDown(e, handleBarcodeSearch)}
                placeholder="Enter barcode (e.g. 0049000006346)"
                inputMode="numeric"
                maxLength={13}
                className="text-[16px] sm:text-[13px] max-sm:min-h-[44px]"
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
                style={{
                  ...inputStyle,
                  fontFamily: '"SF Mono", "Cascadia Mono", "Fira Code", monospace',
                  letterSpacing: "1.5px",
                  paddingRight: barcodeDigits.length > 0 ? 90 : 12,
                }}
              />
              {/* Validation badge inside input */}
              {barcodeDigits.length > 0 && (
                <span style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: barcodeFormat
                    ? "rgba(80,200,120,0.12)"
                    : barcodeDigits.length > 13
                      ? "rgba(255,80,80,0.12)"
                      : "rgba(255,255,255,0.06)",
                  color: barcodeFormat
                    ? "rgba(80,200,120,0.9)"
                    : barcodeDigits.length > 13
                      ? "rgba(255,80,80,0.9)"
                      : "var(--text-muted2)",
                  border: `1px solid ${barcodeFormat ? "rgba(80,200,120,0.3)" : "transparent"}`,
                }}>
                  {barcodeFormat
                    ? `✓ ${barcodeFormat}`
                    : `${barcodeDigits.length}/13`}
                </span>
              )}
            </div>
            {/* Inline validation error */}
            {barcodeError && (
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-300/95">
                <WarningCircle size={12} weight="fill" />
                <span>{barcodeError}</span>
              </div>
            )}
          </div>

          <button
            id="barcode-search-btn"
            onClick={handleBarcodeSearch}
            disabled={loading || !barcodeIsReady}
            className="inline-flex items-center justify-center gap-2 disabled:opacity-50 max-sm:min-h-[44px]"
            style={{
              ...buttonStyle,
              background: barcodeIsReady
                ? "linear-gradient(135deg, rgba(80,200,120,0.25), rgba(0,209,255,0.10))"
                : "rgba(255,255,255,0.04)",
              borderColor: barcodeIsReady
                ? "rgba(80,200,120,0.4)"
                : "var(--border)",
            }}
          >
            <Barcode size={16} weight="bold" />
            <span>{loading ? "Looking up…" : "Lookup"}</span>
          </button>

          <button
            id="barcode-scan-btn"
            onClick={() => setShowScanner(true)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 max-sm:min-h-[44px]"
            style={{
              ...buttonStyle,
              background: "linear-gradient(135deg, rgba(0,180,255,0.2), rgba(124,92,255,0.12))",
              borderColor: "rgba(0,180,255,0.35)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Camera size={16} weight="bold" />
            <span>Scan</span>
          </button>

          <button
            id="food-photo-scan-btn"
            onClick={() => setShowPhotoScanner(true)}
            disabled={loading || photoLoading}
            className="inline-flex items-center justify-center gap-1.5 max-sm:min-h-[44px]"
            style={{
              ...buttonStyle,
              background: "linear-gradient(135deg, rgba(80,200,120,0.22), rgba(0,209,255,0.10))",
              borderColor: "rgba(80,200,120,0.38)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Camera size={16} weight="duotone" />
            <span>{photoLoading ? "Analyzing…" : "Snap Food"}</span>
          </button>

          <button
            id="food-voice-btn"
            onClick={() => setShowVoiceRecorder(true)}
            disabled={loading || photoLoading || voiceLoading}
            style={{
              ...buttonStyle,
              background: "linear-gradient(135deg, rgba(255,170,50,0.2), rgba(255,120,80,0.12))",
              borderColor: "rgba(255,170,50,0.35)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {voiceLoading ? "Transcribing…" : "🎙 Speak Food"}
          </button>
        </div>
      </div>

      {/* Barcode Scanner overlay */}
      {showScanner && (
        <BarcodeScanner
          onBarcodeDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showPhotoScanner && (
        <FoodPhotoScanner
          onPhotoCaptured={handlePhotoCaptured}
          onClose={() => setShowPhotoScanner(false)}
        />
      )}

      {showVoiceRecorder && (
        <FoodVoiceRecorder
          onAudioCaptured={handleVoiceCaptured}
          onClose={() => setShowVoiceRecorder(false)}
        />
      )}

      {voiceLoading && (
        <div className="card" style={{ maxWidth: 900, border: "1px solid rgba(255,170,50,0.28)", background: "rgba(255,170,50,0.05)" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Transcribing voice entry…</div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
            We&apos;re converting your speech to text, extracting the food name, then searching for the best nutrition match.
          </div>
        </div>
      )}

      {voiceResult && (
        <div className="card confirm-card" style={{ maxWidth: 900, border: "1px solid rgba(255,170,50,0.28)", background: "rgba(255,170,50,0.05)" }}>
          <div style={{ fontSize: 11, color: "var(--muted2)", fontWeight: 600, marginBottom: 10 }}>
            Voice transcript
            {voiceResult.confidence != null ? ` · Confidence ${Math.round(voiceResult.confidence * 100)}%` : ""}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted2)", marginBottom: 4 }}>Heard</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>"{voiceResult.transcript}"</div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <MacroBadge label="Search" value={voiceResult.normalizedQuery || "none"} unit="" color="rgba(255,170,50,0.18)" />
              {voiceResult.mealTypeHint && (
                <MacroBadge label="Meal" value={voiceResult.mealTypeHint} unit="" color="rgba(80,200,120,0.16)" />
              )}
              {voiceResult.quantityHint != null && (
                <MacroBadge label="Qty" value={r(voiceResult.quantityHint)} unit="x" color="rgba(100,149,237,0.16)" />
              )}
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {results.length > 0
                ? `We found ${results.length} match${results.length === 1 ? "" : "es"} for the spoken entry below.`
                : "We could not find a nutrition match for that spoken item. Please enter it manually so you can review and save the nutrition details yourself."}
            </div>
          </div>

          <div className="confirm-card-actions">
            {results.length === 0 && (
              <button
                className="confirm-add-btn"
                onClick={handleOpenManualEntryFromVoice}
              >
                Manual Input
              </button>
            )}

            {results.length === 0 && (
              <button
                className="confirm-cancel-btn"
                onClick={handleQuickVoiceLog}
                disabled={voiceLogged}
              >
                {voiceLogged ? "✓ Quick Logged" : "Quick Log Instead"}
              </button>
            )}

            <button
              className="confirm-cancel-btn"
              onClick={() => {
                resetVoiceState();
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <AddEntryModal
        open={manualEntryOpen}
        onClose={() => {
          setManualEntryOpen(false);
          setManualEntryPrefill(undefined);
        }}
        onAdd={handleManualAddEntry}
        saving={manualEntrySaving}
        initialDraft={manualEntryPrefill}
      />

      {photoLoading && (
        <div className="card" style={{ maxWidth: 900, border: "1px solid rgba(80,200,120,0.28)", background: "rgba(80,200,120,0.05)" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Analyzing food photo…</div>
          <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12 }}>
            The photo is sent to the selected vision model, then only the predicted food name is used for USDA nutrition lookup.
          </div>
        </div>
      )}

      {photoEstimate && (
        <div className="card border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)] [animation:confirm-slide-up_0.3s_ease-out]" style={{ maxWidth: 900 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted2)", fontWeight: 600, marginBottom: 10 }}>
            Food photo estimate · Source: USDA + vision estimate · Confidence {Math.round((photoEstimate.confidence || 0) * 100)}%
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-muted2)" }}>
                Food
                <input
                  value={photoForm.foodName}
                  onChange={(e) => setPhotoForm((prev) => ({ ...prev, foodName: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-muted2)" }}>
                Estimated grams
                <input
                  type="number"
                  min="1"
                  value={photoForm.estimatedGrams}
                  onChange={(e) => setPhotoForm((prev) => ({ ...prev, estimatedGrams: e.target.value }))}
                  style={inputStyle}
                />
              </label>
            </div>

            {photoEstimate.usdaDescription && (
              <div style={{ fontSize: 12, color: "var(--text-muted2)" }}>
                USDA match: {photoEstimate.usdaDescription}
                {photoEstimate.usdaFdcId ? ` · FDC ${photoEstimate.usdaFdcId}` : ""}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                ["Calories", "calories", "kcal"],
                ["Protein", "proteinG", "g"],
                ["Carbs", "carbsG", "g"],
                ["Fat", "fatG", "g"],
              ].map(([label, key, unit]) => (
                <label key={key} style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-muted2)" }}>
                  {label} ({unit})
                  <input
                    type="number"
                    min="0"
                    value={photoForm[key as keyof typeof photoForm]}
                    onChange={(e) => setPhotoForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>

            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-muted2)" }}>
              Notes
              <input
                value={photoForm.notes}
                onChange={(e) => setPhotoForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Adjust anything uncertain before logging"
                style={inputStyle}
              />
            </label>
          </div>

          <div className="flex items-center gap-2.5 mt-3.5 flex-wrap">
            <button
              className="px-4 py-2 rounded-[10px] border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 text-primary font-semibold text-sm hover:from-emerald-500/30 hover:to-emerald-500/15 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
              onClick={handlePhotoLog}
              disabled={photoLogged}
            >
              {photoLogged ? "✓ Logged" : "📝 Add to Log"}
            </button>
            <button
              className="px-3.5 py-2 rounded-[10px] border border-subtle bg-primary/5 text-muted text-sm cursor-pointer"
              onClick={() => {
                setPhotoEstimate(null);
                setPhotoLogged(false);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Confirmation card (after barcode scan/lookup) */}
      {confirmProduct && (
        <div className="card border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)] [animation:confirm-slide-up_0.3s_ease-out]" style={{ maxWidth: 900 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted2)", fontWeight: 600, marginBottom: 10 }}>
            {scannedBarcode ? `Barcode: ${scannedBarcode}` : "Product Found"}
          </div>

          <div className="flex items-start gap-3.5">
            {confirmProduct.image_url && (
              <img
                src={confirmProduct.image_url}
                alt={confirmProduct.product_name}
                className="w-16 h-16 object-cover rounded-xl border border-subtle shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px]">{confirmProduct.product_name}</div>
              {confirmProduct.brands && (
                <div className="text-xs text-muted mt-0.5">
                  {confirmProduct.brands}
                  {confirmProduct.categories ? ` · ${confirmProduct.categories}` : ""}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <MacroBadge label="Cal" value={r(confirmProduct.calories_kcal)} unit="kcal" color="rgba(255,170,50,0.18)" />
                <MacroBadge label="Protein" value={r(confirmProduct.protein_g)} unit="g" color="rgba(80,200,120,0.18)" />
                <MacroBadge label="Carbs" value={r(confirmProduct.total_carbohydrate_g)} unit="g" color="rgba(100,149,237,0.18)" />
                <MacroBadge label="Fat" value={r(confirmProduct.fat_g)} unit="g" color="rgba(255,99,132,0.18)" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-3.5 flex-wrap">
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <label style={{ fontSize: 11, color: "var(--text-muted2)" }}>Qty:</label>
              <input
                type="number"
                min="0.1"
                step="0.5"
                value={confirmQty}
                onChange={(e) => setConfirmQty(e.target.value)}
                style={{
                  width: 50, padding: "4px 6px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)",
                  color: "var(--text-primary)", fontSize: 12, textAlign: "center",
                }}
              />
            </div>

            <button
              className="px-4 py-2 rounded-[10px] border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 text-primary font-semibold text-sm hover:from-emerald-500/30 hover:to-emerald-500/15 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
              onClick={handleConfirmLog}
              disabled={confirmLogged || confirmLoading}
            >
              {confirmLogged ? "✓ Logged" : confirmLoading ? "Logging…" : "📝 Add to Log"}
            </button>

            <button
              className="px-3.5 py-2 rounded-[10px] border border-subtle bg-primary/5 text-muted text-sm cursor-pointer"
              onClick={() => setConfirmProduct(null)}
            >
              Cancel
            </button>

          </div>
        </div>
      )}

      {/* Error */}
      {/* Barcode not found — friendly card */}
      {barcodeNotFound && (
        <div className="card" style={{
          maxWidth: 900,
          border: "1px solid rgba(255,170,50,0.3)",
          background: "rgba(255,170,50,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>🔍</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Product not found</div>
              <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 12 }}>
                No product matched barcode
                <code style={{
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.06)",
                  fontFamily: 'monospace',
                  marginLeft: 4,
                  fontSize: 12,
                }}>{barcodeNotFound}</code>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setBarcodeNotFound(null);
                setBarcode(""); setHasSearched(false);
                // Focus the search input
                document.getElementById("food-search-input")?.focus();
              }}
              style={{
                ...logBtnStyle,
                background: "linear-gradient(135deg, rgba(124,92,255,0.15), rgba(0,209,255,0.08))",
              }}
            >
              🔍 Search by name instead
            </button>
            <button
              onClick={() => setBarcodeNotFound(null)}
              style={{ ...logBtnStyle, background: "rgba(255,255,255,0.04)", borderColor: "var(--border)" }}
            >
              Dismiss
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted2)" }}>
            Tip: Check the barcode digits are correct, or try searching by product name.
          </div>
        </div>
      )}

      {/* General error (non-barcode) */}
      {error && (
        <div className="card" style={{ maxWidth: 900, border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>
          <div style={{ fontWeight: 600 }}>Error</div>
          <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>{error}</div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="w-full">
          <div style={{ fontSize: 13, color: "var(--text-muted2)", marginBottom: 10 }}>
            Top {results.length} results for "{query}"
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {results.map((product, i) => {
              const uid = product.barcode || product.product_name;
              const isLogged = loggedIds.has(uid);
              const isLogging = loggingId === uid;

              return (
                <div
                  key={`${product.barcode}-${i}`}
                  className="card hover:border-subtle transition-colors"
                  style={{
                    display: "grid",
                    gridTemplateColumns: product.image_url ? "64px 1fr auto" : "1fr auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "16px",
                    marginBottom: "4px"
                  }}
                >
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.product_name}
                      style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
                    />
                  )}

                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{product.product_name}</div>
                    {product.brands && (
                      <div style={{ fontSize: 12, color: "var(--text-muted2)", marginTop: 2 }}>
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
                      <label style={{ fontSize: 11, color: "var(--text-muted2)" }}>Qty:</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={quantity[uid] ?? "1"}
                        onChange={(e) => setQuantity((prev) => ({ ...prev, [uid]: e.target.value }))}
                        style={{ width: 50, padding: "4px 6px", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--text-primary)", fontSize: 12, textAlign: "center" }}
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
                      {isLogged ? "✓ Logged" : isLogging ? "Logging…" : "Log"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && !confirmProduct && !error && (
        <div className="card" style={{ maxWidth: 900 }}>
          <div style={{ color: "var(--text-muted2)", fontSize: 13 }}>
            No results found. Try a different search term or barcode.
          </div>
        </div>
      )}
    </div>
  );
}

function buildVoiceManualDraft(
  transcript: VoiceFoodTranscript,
  fallbackMealType: string,
): Partial<Omit<FoodEntryDraft, "date">> {
  const foodName = transcript.normalizedQuery.trim() || transcript.transcript.trim();
  const servingDesc = transcript.quantityHint && transcript.quantityHint > 0
    ? `${r(transcript.quantityHint)} serving${transcript.quantityHint === 1 ? "" : "s"}`
    : "1 serving";

  return {
    foodName,
    mealType: (transcript.mealTypeHint || fallbackMealType.toLowerCase()) as FoodEntryDraft["mealType"],
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    servingDesc,
    notes: `Voice transcript: "${transcript.transcript}". Fill in the nutrition details manually.`,
  };
}

function MacroBadge({ label, value, unit, color }: { label: string; value: string | number; unit: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, padding: "6px 12px", borderRadius: 12, background: color, border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, minWidth: "75px", justifyContent: "center" }}>
      <span style={{ color: "var(--text-muted2)" }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}<span style={{ fontWeight: 400, fontSize: 10, marginLeft: 1 }}>{unit}</span></span>
    </span>
  );
}

const pillStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
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
  color: "var(--text-primary)",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid rgba(124,92,255,0.35)",
  background: "linear-gradient(135deg, rgba(124,92,255,0.25), rgba(0,209,255,0.10))",
  color: "var(--text-primary)",
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
  color: "var(--text-primary)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontSize: 12,
  fontWeight: 600,
};
