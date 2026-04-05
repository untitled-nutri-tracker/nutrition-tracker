import type { UserProfile } from "../types/profile";

/**
 * Local persistence key for the user profile (v1 schema).
 * We include the version in the key so future migrations are easier.
 */
const LS_KEY = "nutrilog.userProfile.v1";

/**
 * Toggle to switch persistence backend.
 * - false: use localStorage (meets Sprint 1.4 requirements immediately)
 * - true : use Tauri IPC commands (requires Rust commands to exist)
 *
 * Note: Keep this false until backend team has implemented:
 *   - load_profile
 *   - save_profile
 *   - clear_profile
 */
const USE_TAURI = true;

/**
 * Safe wrapper around Tauri invoke.
 * Dynamic import prevents bundlers from failing in non-Tauri contexts.
 */
async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
}

/**
 * Basic runtime validation to avoid crashing on corrupted storage.
 * This is intentionally lightweight (not a full schema validator).
 */
function isUserProfileV1(x: unknown): x is UserProfile {
  if (!x || typeof x !== "object") return false;
  const p = x as any;
  return (
    p.version === 1 &&
    (p.sex === "male" || p.sex === "female") &&
    typeof p.age === "number" &&
    typeof p.heightCm === "number" &&
    typeof p.weightKg === "number" &&
    typeof p.activityLevel === "string" &&
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string"
  );
}

/**
 * Load the user profile from the selected persistence backend.
 * Returns null if nothing is saved or if the stored data is invalid.
 */
export async function loadProfile(): Promise<UserProfile | null> {
  if (USE_TAURI) {
    const profile = await tauriInvoke<UserProfile | null>("load_profile");
    return profile && isUserProfileV1(profile) ? profile : null;
  }

  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isUserProfileV1(parsed) ? parsed : null;
  } catch {
    // Corrupted JSON should not crash the app.
    return null;
  }
}

/**
 * Save the user profile to the selected persistence backend.
 * Caller is responsible for ensuring profile object is well-formed.
 */
export async function saveProfile(profile: UserProfile): Promise<void> {
  if (USE_TAURI) {
    // Requires Rust command: save_profile(profile: UserProfile)
    await tauriInvoke<void>("save_profile", { profile });
    return;
  }

  localStorage.setItem(LS_KEY, JSON.stringify(profile));
}

/**
 * Clear the user profile from the selected persistence backend.
 */
export async function clearProfile(): Promise<void> {
  if (USE_TAURI) {
    // Requires Rust command: clear_profile()
    await tauriInvoke<void>("clear_profile");
    return;
  }

  localStorage.removeItem(LS_KEY);
}
