/**
 * aiInsights.ts
 *
 * Per-student insight engine for the Principal Dashboard.
 *
 * 2026-05-02 — converted from AI (parentAIProxy → OpenAI) to deterministic
 * system computation. The OpenAI call had become the highest-volume per-action
 * cost in the principal dashboard (one click per student = one $$ call); at
 * scale (10k+ students per school × hundreds of schools) it ran into
 * $30k–50k/month. The underlying "reasoning" was rule-based signal
 * classification — work the deterministic engine in
 * `ai/system/student-insight.ts` does just as well, and instantly.
 *
 * Same return shape (`AIInsight`) so StudentAIInsightsModal renders without
 * a single UI code change. Cache layer kept (Firestore `student_ai_insights`)
 * because down-stream features may rely on the persisted shape, and it lets
 * us audit when a principal viewed a student's insight.
 */

import { db } from "./firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import type { ClassifiedStudent } from "./classifyStudent";
import { computeStudentInsight, type StudentInsight } from "../ai/system/student-insight";

// Re-export the canonical type. Older import sites used `AIInsight` from this
// file; we keep the alias so they keep compiling.
export type AIInsight = StudentInsight;

export interface CachedInsight extends AIInsight {
  _cachedAt: Timestamp | null;
  _studentId: string;
  _schoolId: string;
  _category: string;
  _fromCache?: boolean;
}

// Cache TTL — 24h. Score/attendance changes overnight will trigger refresh
// on next view (force flag bypasses for principals who want the latest).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isCacheFresh(cachedAt: Timestamp | null | undefined): boolean {
  if (!cachedAt) return false;
  const ms = cachedAt.toMillis?.() ?? 0;
  return Date.now() - ms < CACHE_TTL_MS;
}

/**
 * Fetch (or compute) the per-student insight.
 *
 * Flow:
 *   1. Try the Firestore cache (24h TTL, school-scoped).
 *   2. Cache miss / stale / force → run the system computation locally.
 *   3. Best-effort persist to cache so downstream features can read it.
 *
 * Cost: $0. Latency: <10 ms cold + ~one Firestore read for cache check.
 */
export async function getStudentInsight(
  student: ClassifiedStudent,
  schoolId: string,
  opts: { force?: boolean } = {},
): Promise<CachedInsight> {
  if (!schoolId) throw new Error("schoolId is required");
  if (!student?.studentId) throw new Error("student.studentId is required");

  // Composite cache key — `${schoolId}_${studentId}`. Today studentId is a
  // Firestore students-collection auto-id (globally unique by construction)
  // so a bare studentId would work, BUT:
  //   1. If a future migration ever sets studentId from email/roll, two
  //      schools with overlapping student emails would collide on the same
  //      cache doc.
  //   2. With a bare key, school B's first read finds school A's doc owned
  //      by school A → setDoc fails the rule's `inSameSchool()` check →
  //      every view re-computes for school B. Composite key gives each
  //      tenant its own cache doc, eliminating both the silent collision
  //      risk AND the cache-thrash perf regression.
  const cacheKey = `${schoolId}_${student.studentId}`;
  const cacheRef = doc(db, "student_ai_insights", cacheKey);

  // 1) Try cache (best-effort — never block on permission errors)
  if (!opts.force) {
    try {
      const snap = await getDoc(cacheRef);
      if (snap.exists()) {
        const cached = snap.data() as CachedInsight;
        if (cached._schoolId === schoolId && isCacheFresh(cached._cachedAt)) {
          return { ...cached, _fromCache: true };
        }
      }
    } catch (err) {
      // Non-fatal — proceed to compute
      console.warn("[aiInsights] cache read failed (proceeding with compute):", err);
    }
  }

  // 2) Compute insight deterministically — pure function, no network, no AI
  const computed = computeStudentInsight(student);

  // 3) Persist (best-effort — the computed insight is returned regardless)
  const cacheDoc: CachedInsight = {
    ...computed,
    _cachedAt: null,
    _studentId: student.studentId,
    _schoolId: schoolId,
    _category: student.category,
  };
  try {
    await setDoc(cacheRef, {
      ...computed,
      _cachedAt: serverTimestamp(),
      _studentId: student.studentId,
      _schoolId: schoolId,
      _category: student.category,
      schoolId, // top-level for Firestore rules
    });
  } catch (err) {
    // Fine if write fails — user still sees the computed insight in this session.
    console.warn("[aiInsights] cache write failed (insight still returned):", err);
  }

  return { ...cacheDoc, _fromCache: false };
}
