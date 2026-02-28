import ProfileSummaryCard from "../components/ProfileSummaryCard";

export default function DailyLog() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <ProfileSummaryCard />

      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16 }}>Today</div>
        <div style={{ marginTop: 6, color: "var(--muted)" }}>
          Meal logging will be implemented in Sprint 2 (SQLite + CRUD).
        </div>
      </div>
    </div>
  );
}