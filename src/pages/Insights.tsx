import ProfileSummaryCard from "../components/ProfileSummaryCard";

export default function Insights() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <ProfileSummaryCard />

      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16 }}>Insights</div>
        <div style={{ marginTop: 6, color: "var(--muted)" }}>
          Charts and analytics will be implemented in Sprint 2.
        </div>
      </div>
    </div>
  );
}