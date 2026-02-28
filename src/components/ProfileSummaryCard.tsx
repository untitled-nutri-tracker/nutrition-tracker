import { useEffect, useMemo, useState } from "react";
import { loadProfile } from "../lib/profileStore";
import { calcBmrMifflinStJeor, calcTdee, roundKcal } from "../lib/bmr";
import type { UserProfile } from "../types/profile";

export default function ProfileSummaryCard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    (async () => {
      const p = await loadProfile();
      setProfile(p);
    })();
  }, []);

  const computed = useMemo(() => {
    if (!profile) return null;
    const bmr = calcBmrMifflinStJeor(profile);
    const tdee = calcTdee({ bmr, activityLevel: profile.activityLevel });
    return { bmr: roundKcal(bmr), tdee: roundKcal(tdee) };
  }, [profile]);

  if (!profile) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16 }}>Setup needed</div>
        <div style={{ marginTop: 6, color: "var(--muted)" }}>
          Go to <b>Settings</b> to create your profile and calculate BMR/TDEE.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {profile.name ? `${profile.name}'s Summary` : "Profile Summary"}
          </div>
          <div style={{ marginTop: 4, color: "var(--muted2)", fontSize: 12 }}>
            Height {profile.heightCm}cm · Weight {profile.weightKg}kg · {profile.activityLevel}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={metricMini}>
            <div style={metricMiniLabel}>BMR</div>
            <div style={metricMiniValue}>{computed ? `${computed.bmr}` : "—"}</div>
          </div>
          <div style={metricMini}>
            <div style={metricMiniLabel}>TDEE</div>
            <div style={metricMiniValue}>{computed ? `${computed.tdee}` : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const metricMini: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  minWidth: 110,
};

const metricMiniLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted2)",
};

const metricMiniValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 800,
};