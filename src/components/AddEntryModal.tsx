// src/components/AddEntryModal.tsx
// Sprint 2.7 — Refactored to use ui component library

import { useState, useCallback, useEffect } from "react";
import type { FoodEntryDraft, MealType } from "../types/foodLog";
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from "../types/foodLog";
import Modal from "./ui/Modal";
import Input, { fieldStyle } from "./ui/Input";
import Button from "./ui/Button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  onClose: () => void;
  onAdd:   (draft: Omit<FoodEntryDraft, "date">) => Promise<void>;
  saving?: boolean;
  initialDraft?: Partial<Omit<FoodEntryDraft, "date">>;
}

type FormState = {
  foodName:    string;
  brand:       string;
  mealType:    MealType;
  calories:    string;
  proteinG:    string;
  carbsG:      string;
  fatG:        string;
  servingDesc: string;
  notes:       string;
};

function buildFormState(initialDraft?: Partial<Omit<FoodEntryDraft, "date">>): FormState {
  return {
    foodName: initialDraft?.foodName ?? "",
    brand: initialDraft?.brand ?? "",
    mealType: initialDraft?.mealType ?? "breakfast",
    calories: initialDraft?.calories != null ? String(initialDraft.calories) : "",
    proteinG: initialDraft?.proteinG != null ? String(initialDraft.proteinG) : "",
    carbsG: initialDraft?.carbsG != null ? String(initialDraft.carbsG) : "",
    fatG: initialDraft?.fatG != null ? String(initialDraft.fatG) : "",
    servingDesc: initialDraft?.servingDesc ?? "",
    notes: initialDraft?.notes ?? "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddEntryModal({ open, onClose, onAdd, saving, initialDraft }: Props) {
  const [form,   setForm]   = useState<FormState>(() => buildFormState(initialDraft));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    setForm(buildFormState(initialDraft));
    setErrors({});
  }, [open, initialDraft]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev)   => ({ ...prev,   [key]: value     }));
    setErrors((prev) => ({ ...prev,   [key]: undefined }));
  }, []);

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.foodName.trim())                        errs.foodName = "Required";
    if (isNaN(Number(form.calories)) || Number(form.calories) < 0)
                                                      errs.calories = "Must be >= 0";
    if (form.proteinG && Number(form.proteinG) < 0)   errs.proteinG = "Must be >= 0";
    if (form.carbsG   && Number(form.carbsG)   < 0)   errs.carbsG   = "Must be >= 0";
    if (form.fatG     && Number(form.fatG)     < 0)   errs.fatG     = "Must be >= 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await onAdd({
      mealType:    form.mealType,
      foodName:    form.foodName.trim(),
      brand:       form.brand.trim()       || undefined,
      calories:    Number(form.calories)   || 0,
      proteinG:    Number(form.proteinG)   || 0,
      carbsG:      Number(form.carbsG)     || 0,
      fatG:        Number(form.fatG)       || 0,
      servingDesc: form.servingDesc.trim() || undefined,
      notes:       form.notes.trim()       || undefined,
    });
    setForm(buildFormState());
    setErrors({});
    onClose();
  }

  function handleClose() {
    setForm(buildFormState());
    setErrors({});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add food entry"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!!saving}>
            Add entry
          </Button>
        </>
      }
    >
      {/* Meal type tabs */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionLabelStyle}>Meal</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {MEAL_TYPE_ORDER.map((mt) => (
            <button
              key={mt}
              onClick={() => set("mealType", mt)}
              style={{
                ...tabStyle,
                ...(form.mealType === mt ? tabActiveStyle : {}),
              }}
            >
              {MEAL_TYPE_LABELS[mt]}
            </button>
          ))}
        </div>
      </div>

      {/* Food name + brand */}
      <div style={rowStyle}>
        <Input
          label="Food name *"
          placeholder="e.g. Oatmeal"
          value={form.foodName}
          onChange={(e) => set("foodName", e.target.value)}
          error={errors.foodName}
          autoFocus
        />
        <Input
          label="Brand (optional)"
          placeholder="e.g. Quaker"
          value={form.brand}
          onChange={(e) => set("brand", e.target.value)}
        />
      </div>

      {/* Macros */}
      <div style={{ ...rowStyle, gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <Input
          label="Calories *"
          type="number"
          min={0}
          placeholder="0"
          value={form.calories}
          onChange={(e) => set("calories", e.target.value)}
          error={errors.calories}
        />
        <Input
          label="Protein (g)"
          type="number"
          min={0}
          placeholder="0"
          value={form.proteinG}
          onChange={(e) => set("proteinG", e.target.value)}
          error={errors.proteinG}
        />
        <Input
          label="Carbs (g)"
          type="number"
          min={0}
          placeholder="0"
          value={form.carbsG}
          onChange={(e) => set("carbsG", e.target.value)}
          error={errors.carbsG}
        />
        <Input
          label="Fat (g)"
          type="number"
          min={0}
          placeholder="0"
          value={form.fatG}
          onChange={(e) => set("fatG", e.target.value)}
          error={errors.fatG}
        />
      </div>

      {/* Serving + notes */}
      <div style={{ ...rowStyle, marginBottom: 0 }}>
        <Input
          label="Serving size (optional)"
          placeholder="e.g. 1 cup (240 ml)"
          value={form.servingDesc}
          onChange={(e) => set("servingDesc", e.target.value)}
        />
        <Input
          label="Notes (optional)"
          placeholder="e.g. with oat milk"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </Modal>
  );
}

// ── Local styles ──────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize:   12,
  color:      "var(--muted2)",
  fontWeight: 500,
};

const rowStyle: React.CSSProperties = {
  display:             "grid",
  gridTemplateColumns: "1fr 1fr",
  gap:                 12,
  marginBottom:        14,
};

const tabStyle: React.CSSProperties = {
  padding:      "6px 12px",
  borderRadius: 10,
  border:       "1px solid var(--border)",
  background:   "rgba(255,255,255,0.04)",
  color:        "var(--muted)",
  cursor:       "pointer",
  fontSize:     12,
  fontWeight:   500,
  fontFamily:   "inherit",
};

const tabActiveStyle: React.CSSProperties = {
  background:  "linear-gradient(135deg, rgba(124,92,255,0.28), rgba(0,209,255,0.14))",
  borderColor: "rgba(124,92,255,0.45)",
  color:       "var(--text)",
};

export { fieldStyle };
