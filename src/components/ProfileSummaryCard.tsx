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
      <section className="rounded-3xl border border-white/8 bg-zinc-900/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-5">
        <div className="text-base font-semibold tracking-tight text-white">Setup needed</div>
        <div className="mt-1.5 text-sm text-white/55">
          Go to <b>Settings</b> to create your profile and calculate BMR/TDEE.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/8 bg-zinc-900/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold tracking-tight text-white">
            {profile.name ? `${profile.name}'s Summary` : "Profile Summary"}
          </div>
          <div className="mt-1 text-xs text-white/45">
            Height {profile.heightCm}cm · Weight {profile.weightKg}kg · {profile.activityLevel}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="min-w-[104px] rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">BMR</div>
            <div className="mt-1 font-mono text-lg font-semibold text-white">{computed ? `${computed.bmr}` : "—"}</div>
          </div>
          <div className="min-w-[104px] rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">TDEE</div>
            <div className="mt-1 font-mono text-lg font-semibold text-white">{computed ? `${computed.tdee}` : "—"}</div>
          </div>
        </div>
      </div>
    </section>
  );
}