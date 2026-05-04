/**
 * syncClaims.ts
 * Calls the `syncUserClaims` Cloud Function to populate Firebase custom claims
 * ({ schoolId, role, branchId }) on the user's ID token, then force-refreshes
 * the token so Firestore security rules see the new claims.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";

const FUNCTIONS_REGION = "us-central1";

/**
 * Optional caller preferences for users with multiple matching role records.
 * Sent to the Cloud Function which honors them BEFORE falling through to its
 * default priority order (owner → principal → teacher → ...).
 */
export interface ClaimPreferences {
  /** Role to prefer if user has multiple — e.g. "principal" / "teacher". */
  preferredRole?: "principal" | "teacher";
  /** Specific schoolId (paired with preferredRole) — used by the school
   *  picker to pin the user to a single record when multiple match. */
  preferredSchoolId?: string;
}

export async function syncClaimsAndRefreshToken(
  user: User,
  prefs?: ClaimPreferences,
): Promise<{
  role: string;
  schoolId: string | null;
  branchId?: string | null;
} | null> {
  try {
    const fns = getFunctions(undefined, FUNCTIONS_REGION);
    const call = httpsCallable<ClaimPreferences, { role: string; schoolId: string; branchId?: string }>(
      fns,
      "syncUserClaims",
    );
    const res = await call(prefs || {});
    await user.getIdToken(true);
    return res.data ?? null;
  } catch (err: any) {
    console.warn("[syncClaims] failed:", err?.message || err);
    return null;
  }
}