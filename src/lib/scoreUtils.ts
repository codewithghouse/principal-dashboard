/**
 * scoreUtils.ts — canonical helpers for normalizing score & attendance
 * data across collections.
 *
 * Promoted out of Dashboard.tsx / StudentProfilePage.tsx / StudentIntelligence.tsx
 * because four pages were independently re-implementing the same parsing
 * logic, drifting on edge cases (zero-poisoning, missing-field handling,
 * percentage clamping). One source of truth keeps tier classification
 * consistent across pages.
 */

/**
 * Normalize a score doc (results / test_scores / gradebook_scores) to a
 * 0-100 percentage. Returns `null` for missing/unparseable data.
 *
 * IMPORTANT: callers MUST treat null as "no data" — defaulting null to 0
 * is the exact `bug_pattern_score_zero_no_data` failure mode that has
 * silently mis-classified students as Weak across multiple pages.
 *
 * Handles five shapes seen in production writers:
 *   1. percentage: 85                          — direct percentage
 *   2. score: 17 / maxScore: 20                — test_scores schema (EnterScores.tsx)
 *   3. mark: 17 / maxMarks: 20                 — gradebook_scores schema (Gradebook.tsx)
 *   4. marks: 17 / maxMarks: 20                — alt naming
 *   5. obtainedMarks / marksObtained / outOf   — legacy variants
 *
 * IMPORTANT: `mark` (singular) was added 2026-05-09 — the gradebook writer
 * uses `mark: Number(...)` while the helper previously only checked `marks`
 * (plural). Result was 100% of gradebook_scores docs returning null and
 * being silently dropped — visible to principal as "school avg present but
 * no teacher attributed any scores" because gradebook is the bulk-upload
 * path. Memory: bug_pattern_filterbytime_field_drift / silent dropping.
 */
export function pctOfDoc(d: any): number | null {
  const numOf = (v: any): number => {
    if (v === null || v === undefined || v === "") return NaN;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : NaN;
  };
  const clamp = (n: number): number => Math.max(0, Math.min(100, n));

  // 1) Direct percentage field — most common
  const direct = numOf(d?.percentage);
  if (Number.isFinite(direct)) return clamp(direct);

  // 2/3/4/5) Score-over-max patterns. `mark` (singular) is gradebook_scores.
  const raw = [d?.score, d?.mark, d?.marks, d?.obtainedMarks, d?.marksObtained]
    .map(numOf).find(Number.isFinite);
  const max = [d?.maxScore, d?.totalMarks, d?.maxMarks, d?.outOf]
    .map(numOf).find(Number.isFinite);
  if (Number.isFinite(raw) && Number.isFinite(max) && (max as number) > 0) {
    return clamp(((raw as number) / (max as number)) * 100);
  }

  // 6) Score field already 0-100 (legacy test_scores with no max)
  if (Number.isFinite(raw) && (raw as number) >= 0 && (raw as number) <= 100) {
    return clamp(raw as number);
  }

  return null;
}

/**
 * Match an attendance/score doc to a canonical student via dual identity.
 * Per memory `dual_query_pattern_studentid_email`, parent-side and
 * legacy bulk-imported docs may carry only studentEmail. Strict
 * `studentId === sid` lookups silently miss them.
 */
export function matchesStudent(doc: any, studentId: string, studentEmail?: string): boolean {
  if (doc?.studentId && studentId && doc.studentId === studentId) return true;
  if (doc?.studentEmail && studentEmail) {
    return String(doc.studentEmail).toLowerCase() === String(studentEmail).toLowerCase();
  }
  return false;
}

/**
 * Treat "late" as present — students who attended the class (even late)
 * have heard the lesson. Strict `=== "present"` filtering produces a
 * 5-15% under-reporting bias and inconsistent tier output across pages.
 * Also case-insensitive: legacy writers using "Present" / "PRESENT"
 * are silently dropped without this normalization.
 */
export function isPresent(record: { status?: string }): boolean {
  const s = String(record?.status || "").toLowerCase();
  return s === "present" || s === "late";
}

/** Inverse of isPresent — explicit absence (not just "no record"). */
export function isAbsent(record: { status?: string }): boolean {
  const s = String(record?.status || "").toLowerCase();
  return s === "absent";
}

/**
 * Compute a student's attendance % over a windowed slice of records.
 * Returns null when no records — caller MUST handle null (don't default
 * to 0 — that displays "0%" as a real low, not as "no data").
 */
export function attendancePct(records: Array<{ status?: string }>): number | null {
  if (!records || records.length === 0) return null;
  const present = records.filter(isPresent).length;
  return Math.round((present / records.length) * 100);
}

/** YYYY-MM-DD in LOCAL time — avoids the UTC drift bug from
 *  `toISOString().slice(0,10)` where IST midnight maps to the previous
 *  UTC day. Use for any date-key comparison. */
export function ymdLocal(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const dd   = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Date `n` days ago as YYYY-MM-DD local — for `where("date", ">=", X)` filters. */
export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymdLocal(d);
}

/** Default attendance window across pages. 60 days = enough signal to
 *  classify, recent enough that a student's CURRENT engagement is
 *  reflected. Same constant used in Students.tsx + StudentIntelligence.tsx. */
export const ATTENDANCE_WINDOW_DAYS = 60;
