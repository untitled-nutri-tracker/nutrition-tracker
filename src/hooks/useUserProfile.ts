import { useEffect, useMemo, useState } from "react";
import type { UserProfile } from "../types/profile";
import { loadProfile, saveProfile, clearProfile } from "../lib/profileStore";
import { calcBmrMifflinStJeor, calcTdee, roundKcal } from "../lib/bmr";

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await loadProfile();
        setProfile(p);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const computed = useMemo(() => {
    if (!profile) return null;
    const bmr = calcBmrMifflinStJeor(profile);
    const tdee = calcTdee({ bmr, activityLevel: profile.activityLevel });
    return { bmr: roundKcal(bmr), tdee: roundKcal(tdee) };
  }, [profile]);

  async function persist(next: UserProfile) {
    setSaving(true);
    setError(null);
    try {
      await saveProfile(next);
      setProfile(next);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError(null);
    try {
      await clearProfile();
      setProfile(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to clear profile");
    } finally {
      setSaving(false);
    }
  }

  return {
    profile,
    setProfile,
    loading,
    saving,
    error,
    computed,
    persist,
    reset,
  };
}