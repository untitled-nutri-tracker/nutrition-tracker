import { useMemo, useState } from "react";
import type { ActivityLevel, Sex, UserProfile } from "../types/profile";

const activityOptions: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: "sedentary", label: "Sedentary", hint: "Little or no exercise" },
  { value: "light", label: "Light", hint: "1–3 days/week" },
  { value: "moderate", label: "Moderate", hint: "3–5 days/week" },
  { value: "active", label: "Active", hint: "6–7 days/week" },
  { value: "very_active", label: "Very active", hint: "Hard exercise/physical job" },
];

function nowIso() {
  return new Date().toISOString();
}

function clampNumber(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return n;
  return Math.min(max, Math.max(min, n));
}

export default function ProfileForm(props: {
  initial?: UserProfile | null;
  onSave: (profile: UserProfile) => Promise<void>;
  saving?: boolean;
  title?: string;
  description?: string;
  submitLabel?: string;
  disableSubmit?: boolean;
}) {
  const {
    initial,
    onSave,
    saving,
    title = "Profile",
    description = "Used to calculate BMR & TDEE.",
    submitLabel = "Save profile",
    disableSubmit = false,
  } = props;

  const [name, setName] = useState(initial?.name ?? "");
  const [sex, setSex] = useState<Sex>(initial?.sex ?? "male");
  const [age, setAge] = useState<number | "">(initial?.age ?? 25);
  const [heightCm, setHeightCm] = useState<number | "">(initial?.heightCm ?? 175);
  const [weightKg, setWeightKg] = useState<number | "">(initial?.weightKg ?? 75);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    initial?.activityLevel ?? "moderate"
  );

  const validation = useMemo(() => {
    const errs: string[] = [];
    const a = typeof age === "number" ? age : 0;
    const h = typeof heightCm === "number" ? heightCm : 0;
    const w = typeof weightKg === "number" ? weightKg : 0;
    if (a < 10 || a > 100) errs.push("Age should be between 10 and 100.");
    if (h < 120 || h > 230) errs.push("Height should be 120–230 cm.");
    if (w < 35 || w > 250) errs.push("Weight should be 35–250 kg.");
    return { ok: errs.length === 0, errs };
  }, [age, heightCm, weightKg]);

  async function submit() {
    const createdAt = initial?.createdAt ?? nowIso();
    const next: UserProfile = {
      version: 1,
      createdAt,
      updatedAt: nowIso(),
      name: name.trim() ? name.trim() : undefined,
      sex,
      age: Math.round(clampNumber(Number(age), 10, 100)),
      heightCm: Math.round(clampNumber(Number(heightCm), 120, 230)),
      weightKg: Math.round(clampNumber(Number(weightKg), 35, 250)),
      activityLevel,
    };
    await onSave(next);
  }

  return (
    <div className="card w-full">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}>
            {description}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted2)" }}>Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zechen"
            style={inputStyle}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted2)" }}>Sex</span>
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} style={inputStyle}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted2)" }}>Age</span>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
              style={inputStyle}
              min={10}
              max={100}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted2)" }}>Height (cm)</span>
            <input
              type="number"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value === "" ? "" : Number(e.target.value))}
              style={inputStyle}
              min={120}
              max={230}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted2)" }}>Weight (kg)</span>
            <input
              type="number"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value === "" ? "" : Number(e.target.value))}
              style={inputStyle}
              min={35}
              max={250}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted2)" }}>Activity level</span>
          <select
            value={activityLevel}
            onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
            style={inputStyle}
          >
            {activityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.hint}
              </option>
            ))}
          </select>
        </label>

        {!validation.ok && (
          <div style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>
            <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>Fix these issues:</div>
            <ul style={{ margin: "8px 0 0 18px", color: "var(--muted)", fontSize: 12 }}>
              {validation.errs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={submit}
            disabled={!validation.ok || !!saving || disableSubmit}
            style={{
              ...buttonStyle,
              opacity: !validation.ok || saving || disableSubmit ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(124,92,255,0.35)",
  background: "linear-gradient(135deg, rgba(124,92,255,0.25), rgba(0,209,255,0.10))",
  color: "var(--text)",
  cursor: "pointer",
};
