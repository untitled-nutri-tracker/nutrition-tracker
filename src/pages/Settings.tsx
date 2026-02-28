import ProfileForm from "../components/ProfileForm";
import { useUserProfile } from "../hooks/useUserProfile";

export default function Settings() {
  const { profile, loading, saving, error, computed, persist, reset } = useUserProfile();

  if (loading) {
    return (
      <div className="card">
        <div style={{ color: "var(--muted)" }}>Loading profile...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {error && (
        <div
          className="card"
          style={{
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.08)",
          }}
        >
          <div style={{ fontWeight: 600 }}>Error</div>
          <div style={{ marginTop: 6, color: "var(--muted)" }}>{error}</div>
        </div>
      )}

      <ProfileForm initial={profile} onSave={persist} saving={saving} />

      <div className="card" style={{ maxWidth: 720 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Energy estimates</div>
        <div style={{ fontSize: 12, color: "var(--muted2)", marginTop: 4 }}>
          Based on Mifflin–St Jeor + activity multiplier.
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={metricBox}>
            <div style={metricLabel}>BMR</div>
            <div style={metricValue}>{computed ? `${computed.bmr} kcal/day` : "—"}</div>
          </div>
          <div style={metricBox}>
            <div style={metricLabel}>TDEE</div>
            <div style={metricValue}>{computed ? `${computed.tdee} kcal/day` : "—"}</div>
          </div>
        </div>

        {profile && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={reset}
              disabled={saving}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--muted)",
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Reset profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const metricBox: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,0.03)",
};

const metricLabel: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted2)",
};

const metricValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 700,
};