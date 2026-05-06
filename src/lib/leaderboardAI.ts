/**
 * leaderboardAI.ts — AI-powered "why this rank" + "how to improve" generator
 * for branch and principal leaderboard rows.
 *
 * Backend: Firebase Cloud Function `parentAIProxy` (universal OpenAI proxy,
 * authenticated callers only). This works identically in dev + prod —
 * unlike the Vercel `/api/ai-insights` endpoint which only exists at the
 * deployed origin.
 *
 * Cache:   Firestore `leaderboard_ai_insights/{schoolId}_{type}_{id}_W{week}`
 *          — keyed by ISO week so a fresh analysis is cached per week without
 *          re-billing OpenAI on every row expand.
 *
 * Output is shaped to match the UI's whyPosition/solutions render:
 *   { whyPosition: [{ color, bold, rest }], solutions: [{ urgent, text }] }
 */

import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { BranchRow, PrincipalRow } from "./leaderboardData";

// Cloud Functions region — must match where parentAIProxy is deployed.
const FUNCTIONS_REGION = "us-central1";

// Tone colors must match the UI palette in PrincipalLeaderboards.tsx.
const TONE = {
  GREEN:  "#34C759",
  ORANGE: "#FF8800",
  RED:    "#FF453A",
};

export interface WhyItem {
  color: string;
  bold: string;
  rest: string;
}

export interface SolutionItem {
  urgent: boolean;
  text: string;
}

export interface LeaderboardInsight {
  whyPosition: WhyItem[];
  solutions: SolutionItem[];
  solutionLabel: string;
  /** True when result is the deterministic fallback (AI proxy unavailable). */
  isFallback?: boolean;
  /** When isFallback is true, friendly explanation of why. */
  fallbackReason?: string;
}

interface CachedInsight extends LeaderboardInsight {
  _cachedAt?: Timestamp | null;
  _schoolId?: string;
  _type?: "branch" | "principal";
  _id?: string;
  _week?: number;
}

// ── ISO week helper ──────────────────────────────────────────────────────
function currentIsoWeek(): number {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Bump version when prompt/shape changes so stale caches are invalidated.
// v4 (2026-05-09): branch prompt now requires named-teacher / named-subject
// solutions; old v3 cached responses had generic-only content and no
// enrichment grounding.
// v5 (2026-05-09): top-rank branches + principals now also receive
// solutions — "maintenance" (healthy) or "lift the floor" (struggling).
// v6 (2026-05-09): principal payload now carries enrichment (topTeachers /
// weakTeachers / subjectStrengths / subjectWeaknesses) — same grounding as
// branch tab. Old v5 principal caches had generic-only content.
const CACHE_VERSION = "v6";

function cacheKey(type: "branch" | "principal", id: string, schoolId: string, week: number): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSchool = schoolId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeSchool}_${type}_${safeId}_W${week}_${CACHE_VERSION}`;
}

// ── Defensive 3-tier cache (production-safe even if Firestore rules deny) ──
// Tier 1 — in-flight de-dup map: rapid-click on same row collapses to ONE
//          AI call. Same-second concurrent expands share the same promise.
// Tier 2 — localStorage week-keyed: survives refresh, scoped to browser.
//          Pure synchronous read; no Firestore round-trip on cache hit.
// Tier 3 — Firestore week-keyed: cross-device, cross-browser. May fail
//          with permission-denied today (rules backlog from
//          security_hardening_apr18); the feature stays functional via
//          Tiers 1+2 + the existing "fresh AI on miss" path.
//
// Net effect: bounded billing on OpenAI even before rules deploy. Once
// rules deploy, Tier 3 lights up automatically (no code change).
const LS_PREFIX = "edul_lb_ai_";
const LS_MAX_ENTRIES = 500;       // ~2-3MB at 5KB each — well under 5MB quota
const INFLIGHT_RETAIN_MS = 30_000; // keep settled promise briefly for back-to-back clicks

const inflight = new Map<string, Promise<LeaderboardInsight>>();

function lsKey(type: "branch" | "principal", id: string, schoolId: string, week: number): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSchool = schoolId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${LS_PREFIX}${CACHE_VERSION}_${safeSchool}_${type}_${safeId}_W${week}`;
}

function lsRead(key: string): LeaderboardInsight | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeaderboardInsight;
    return parsed && Array.isArray(parsed.whyPosition) ? parsed : null;
  } catch {
    return null;
  }
}

function lsWrite(key: string, insight: LeaderboardInsight): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(insight));
  } catch (e: any) {
    // Quota likely — purge old + retry once. Otherwise give up silently.
    if (e?.name === "QuotaExceededError" || e?.code === 22) {
      lsCleanupOld();
      try { window.localStorage.setItem(key, JSON.stringify(insight)); } catch { /* give up */ }
    }
  }
}

function lsCleanupOld(): void {
  // Periodic prune: 3 passes —
  //   (1) drop entries from a STALE CACHE_VERSION (prompt/shape changed)
  //   (2) drop entries older than (currentWeek - 1)
  //   (3) cap total entries (drop oldest first if still over)
  // Lexicographic sort works because keys end in `_W{week}` — monotonic
  // within a year. Year-end rollover prunes naturally as old-week numbers
  // fall outside the keep window.
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const ls = window.localStorage;
    const currentWeek = currentIsoWeek();
    const versionedPrefix = `${LS_PREFIX}${CACHE_VERSION}_`;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    // Pass 1: drop stale-version entries (they'll never be read by current code)
    keys.forEach((k) => {
      if (!k.startsWith(versionedPrefix)) ls.removeItem(k);
    });
    // Pass 2: drop stale-week entries (within current version)
    keys.forEach((k) => {
      if (!k.startsWith(versionedPrefix)) return;
      const m = k.match(/_W(\d+)$/);
      const w = m ? parseInt(m[1], 10) : NaN;
      if (Number.isFinite(w) && w < currentWeek - 1) ls.removeItem(k);
    });
    // Pass 3: cap total entries — drop oldest first
    const remaining = keys.filter((k) => ls.getItem(k) !== null).sort();
    while (remaining.length > LS_MAX_ENTRIES) {
      const k = remaining.shift()!;
      ls.removeItem(k);
    }
  } catch {
    // best-effort — never throw
  }
}

// One-time prune at module load (best-effort, browser-only)
if (typeof window !== "undefined") {
  try { lsCleanupOld(); } catch { /* */ }
}

/** Tier 2 + Tier 3 read in priority order. Returns null on miss. */
async function readCachedInsight(
  type: "branch" | "principal",
  id: string,
  schoolId: string,
  week: number,
  ref: ReturnType<typeof doc>,
): Promise<LeaderboardInsight | null> {
  // Tier 2 — localStorage (sync, instant)
  const local = lsRead(lsKey(type, id, schoolId, week));
  if (local && local.whyPosition?.length > 0) return local;

  // Tier 3 — Firestore (may fail with permission-denied; that's OK)
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const cached = snap.data() as CachedInsight;
      if (cached._schoolId === schoolId && cached._week === week) {
        const shaped = shapeAIResponse(cached);
        if (shaped.whyPosition.length > 0) {
          // Backfill Tier 2 so subsequent reads are instant
          lsWrite(lsKey(type, id, schoolId, week), shaped);
          return shaped;
        }
      }
    }
  } catch (e: any) {
    // Suppress permission-denied (expected until rules deploy). Anything
    // else (network, parse, unknown) still surfaces for diagnosis.
    if (e?.code !== "permission-denied" && e?.code !== "permission_denied") {
      console.warn("[leaderboardAI] cache read failed:", e);
    }
  }
  return null;
}

/** Write to Tier 2 + Tier 3. Both best-effort. */
async function writeCachedInsight(
  type: "branch" | "principal",
  id: string,
  schoolId: string,
  week: number,
  ref: ReturnType<typeof doc>,
  raw: any,
  shaped: LeaderboardInsight,
): Promise<void> {
  // Tier 2 (synchronous)
  lsWrite(lsKey(type, id, schoolId, week), shaped);
  // Tier 3 (best-effort)
  try {
    await setDoc(ref, {
      whyPosition: (raw?.whyPosition || []).slice(0, 10),
      solutions:   (raw?.solutions   || []).slice(0, 10),
      solutionLabel: raw?.solutionLabel || "",
      _cachedAt: serverTimestamp(),
      _schoolId: schoolId,
      _type: type,
      _id: id,
      _week: week,
      schoolId,
    });
  } catch (e: any) {
    if (e?.code !== "permission-denied" && e?.code !== "permission_denied") {
      console.warn("[leaderboardAI] cache write failed:", e);
    }
  }
}

/** Tier 1 — share in-flight promises so concurrent same-row expands
 *  collapse to a single AI call. Settled promises stick around briefly
 *  so back-to-back clicks reuse the result instead of re-fetching. */
function withInflight<T extends LeaderboardInsight>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn();
  inflight.set(key, p);
  // Drop after a short retain window post-settlement
  p.finally(() => {
    setTimeout(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    }, INFLIGHT_RETAIN_MS);
  });
  return p;
}

// ── Prompt builders ──────────────────────────────────────────────────────
// CRITICAL: prompts forbid invented numbers. Every figure cited in the output
// MUST come from a field in the JSON payload. This prevents hallucinated
// "attendance is 87%" claims when no attendance signal was passed.
const BRANCH_INSTRUCTIONS = `You are an expert Indian K-12 school performance advisor.

You will receive ONE branch's leaderboard standing within a school, plus context about the highest-ranked branch, network averages, AND the branch's specific top/weak teachers + strongest/weakest subjects. Explain WHY this branch sits at its rank, and (only for ranks 2+) HOW it can climb — citing SPECIFIC named teachers and subjects from the payload.

ABSOLUTE NUMERIC + ENTITY GROUNDING RULES (violation = bad output):
1. Every number you mention (averages, percentages, deltas, counts) MUST be either copied verbatim from the JSON payload OR be a simple subtraction of two payload fields (e.g. topBranch.composite − composite, networkBranchAvg − teacherAvg).
2. Every named teacher MUST appear in topTeachers[] or weakTeachers[]. Every named subject MUST appear in subjectStrengths[] or subjectWeaknesses[]. NEVER invent names.
3. NEVER invent attendance, pass-rate, test-count, syllabus-coverage, or other figures that are not present in the payload.
4. If a field is 0 / missing / empty array, treat it as "no data" and do not claim a value.
5. Do not reference other branches by name unless their name appears in the payload.

Return ONLY valid JSON in this exact shape:

{
  "whyPosition": [
    { "tone": "green | orange | red", "bold": "Short factual label e.g. 'Math avg 58.0' or 'Mr. Khan leading at 89.6'", "rest": " — one-sentence explanation tied to the data" }
  ],
  "solutions": [
    { "urgent": true | false, "text": "Concrete action naming a specific teacher or subject from the payload, 1 sentence" }
  ],
  "solutionLabel": "Short header e.g. 'How to reach #1' or 'Recovery plan' (empty string for rank 1)"
}

Content rules:
- 3-4 whyPosition items. Prefer items that cite a SPECIFIC topTeacher / weakTeacher / subjectStrength / subjectWeakness when those arrays are non-empty. Otherwise fall back to top-level metrics (composite, teacherAvg, studentAvg, atRiskStudents, weekChange, or a delta vs networkBranchAvg / topBranch).
- Tone: "green" for strengths (≥75 or rank 1 or improving trend); "orange" for moderate gaps (60–74 or 5+ pt gap to top); "red" for crises (<60, declining trend, or atRiskStudents ≥ 5).
- ALWAYS produce 2-4 solutions, regardless of rank. The TYPE of solutions depends on the branch's absolute state, not just its rank:
    • Healthy branch (composite ≥ 75 AND no weakTeachers AND atRiskStudents = 0): emit "maintenance" solutions — what to keep doing, what to watch out for, how to extend strengths to the rest of the network. Set solutionLabel to "What to keep doing" or "Maintain the lead".
    • Branch with weak signals (any weakTeachers, subjectWeaknesses, atRiskStudents > 0, OR teacherAvg < 75): emit "improvement" solutions naming the specific weak entities — even if the branch is rank 1. Being top of a struggling network still leaves real lift available. Set solutionLabel to "Lift the floor" (rank 1) or "How to climb to #N-1" (rank 2+).
- EACH solution should name a specific teacher (from weakTeachers / topTeachers) OR a specific subject (from subjectWeaknesses / subjectStrengths) when those arrays have data — e.g. "Schedule peer-coaching with [topTeacher.name] for [weakTeacher.name] in [subject]" or "Run a focused remediation block for [subjectWeaknesses[0].subject] (currently averaging X)". Generic advice ONLY when both arrays are empty.
- Mark urgent=true if the gap is critical (declining trend, at-risk surge, weakTeacher composite < 50, subject avg < 45, or rank in bottom third).
- "bold" must be a stat-style fragment with a number / specific name copied from payload. "rest" must start with " — " and complete the thought.
- Output ONLY JSON. No markdown, no commentary.`;

const PRINCIPAL_INSTRUCTIONS = `You are an expert Indian K-12 school performance advisor.

You will receive ONE principal's leaderboard standing within their school network, plus the SPECIFIC teachers + subjects in their branch (top, weak, strong, weak). The principal's rank reflects their branch composite + their own engagement signal. Explain WHY they rank where they do, and what THEY personally should do — citing the specific named teachers / subjects under their leadership.

ABSOLUTE NUMERIC + ENTITY GROUNDING RULES (violation = bad output):
1. Every number you mention MUST be copied from the JSON payload OR be a simple delta of two payload fields (e.g. topPrincipal.composite − composite, networkPrincipalAvg − composite).
2. Every named teacher MUST appear in topTeachers[] or weakTeachers[]. Every named subject MUST appear in subjectStrengths[] or subjectWeaknesses[]. NEVER invent names.
3. NEVER invent figures — no "attendance 92%", no "10 observations" — unless that exact field exists in the payload.
4. If a field is 0 / missing / empty array, treat it as "no data" and do not claim a value.
5. Do not reference other principals by name unless that name appears in the payload.

Return ONLY valid JSON in this exact shape:

{
  "whyPosition": [
    { "tone": "green | orange | red", "bold": "Short factual label e.g. 'Mr. Khan at 42.3' or 'Math avg 58.0'", "rest": " — one-sentence explanation" }
  ],
  "solutions": [
    { "urgent": true | false, "text": "Action the principal personally takes — naming a specific teacher or subject from the payload, 1 sentence" }
  ],
  "solutionLabel": "e.g. 'How to reach #1', 'Lift the floor', or 'What to keep doing'"
}

Content rules:
- 2-4 whyPosition items. Prefer items that cite a SPECIFIC topTeacher / weakTeacher / subjectStrength / subjectWeakness when those arrays are non-empty. Otherwise fall back to top-level metrics (composite, branchTeacherAvg, branchStudentAvg, atRiskStudents, weekChange, or a delta vs networkPrincipalAvg / topPrincipal).
- ALWAYS produce 2-4 solutions, regardless of rank. The TYPE depends on the branch's absolute state:
    • Healthy branch (composite ≥ 75 AND no weakTeachers AND atRiskStudents = 0 AND branchTeacherAvg ≥ 75): emit "maintenance" solutions — protect strengths, document playbooks, mentor next-tier teachers. Set solutionLabel to "What to keep doing".
    • Branch with weak signals (any weakTeachers, subjectWeaknesses, atRiskStudents > 0, OR branchTeacherAvg < 75): emit "improvement" solutions naming the specific weak teacher/subject — even at rank 1. Set solutionLabel to "Lift the floor" (rank 1) or "How to reach #N-1" (rank 2+).
- EACH solution should name a specific teacher (from weakTeachers / topTeachers) OR a specific subject (from subjectWeaknesses / subjectStrengths) when those arrays have data — e.g. "Personally observe 2 [subjectWeaknesses[0].subject] classes per week starting with [weakTeachers[0].name]" or "Pair [topTeachers[0].name] with [weakTeachers[0].name] for monthly peer-coaching". Generic advice ONLY when both arrays are empty.
- Solutions are LEADERSHIP actions only (coaching, classroom observation, policy enforcement, parent-engagement drives) — NOT teacher- or student-level tasks.
- "bold" must include a number copied from payload. "rest" must start with " — ".
- Output ONLY JSON. No markdown, no commentary.`;

function safeFixed(n: number | null | undefined, digits = 1): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Number(v.toFixed(digits));
}

export interface BranchAIContext {
  totalBranches: number;
  networkBranchAvg: number;
}

export interface PrincipalAIContext {
  totalPrincipals: number;
  networkPrincipalAvg: number;
}

function branchPayload(branch: BranchRow, top: BranchRow | null, ctx?: BranchAIContext) {
  const gapToTop = top && top.id !== branch.id ? safeFixed(top.composite - branch.composite) : 0;
  const gapToNetwork = ctx ? safeFixed(branch.composite - ctx.networkBranchAvg) : 0;
  // Enrichment slices — give the AI specific named teachers + subjects so
  // its solutions reference real people/areas instead of generic advice.
  // Empty arrays when the branch has no scored teachers or no subjects yet.
  const topTeachers       = (branch.topTeachers       ?? []).slice(0, 3);
  const weakTeachers      = (branch.weakTeachers      ?? []).slice(0, 3);
  const subjectStrengths  = (branch.subjectStrengths  ?? []).slice(0, 2);
  const subjectWeaknesses = (branch.subjectWeaknesses ?? []).slice(0, 2);
  return {
    rank: branch.rank,
    branchName: branch.name,
    composite: safeFixed(branch.composite),
    weekChange: safeFixed(branch.weekChange),
    trend: branch.trend,
    teacherAvg: safeFixed(branch.teacherAvg),
    studentAvg: safeFixed(branch.studentAvg),
    teachers: branch.teachers,
    students: branch.students,
    atRiskStudents: branch.atRisk,
    atRiskPct: branch.students > 0 ? safeFixed((branch.atRisk / branch.students) * 100) : 0,
    // Specific entities the AI can name in solutions (grounded references)
    topTeachers,
    weakTeachers,
    subjectStrengths,
    subjectWeaknesses,
    network: ctx ? {
      totalBranches: ctx.totalBranches,
      networkBranchAvg: safeFixed(ctx.networkBranchAvg),
      gapToNetworkAvg: gapToNetwork,
    } : null,
    topBranch: top && top.id !== branch.id ? {
      name: top.name,
      composite: safeFixed(top.composite),
      teacherAvg: safeFixed(top.teacherAvg),
      studentAvg: safeFixed(top.studentAvg),
      gapToTop,
    } : null,
  };
}

function principalPayload(principal: PrincipalRow, top: PrincipalRow | null, ctx?: PrincipalAIContext) {
  const gapToTop = top && top.id !== principal.id ? safeFixed(top.composite - principal.composite) : 0;
  const gapToNetwork = ctx ? safeFixed(principal.composite - ctx.networkPrincipalAvg) : 0;
  // Mirror this principal's branch enrichment so the AI can cite their
  // OWN top/weak teachers + strong/weak subjects in solutions.
  const topTeachers       = (principal.topTeachers       ?? []).slice(0, 3);
  const weakTeachers      = (principal.weakTeachers      ?? []).slice(0, 3);
  const subjectStrengths  = (principal.subjectStrengths  ?? []).slice(0, 2);
  const subjectWeaknesses = (principal.subjectWeaknesses ?? []).slice(0, 2);
  return {
    rank: principal.rank,
    principalName: principal.name,
    branchName: principal.branch,
    composite: safeFixed(principal.composite),
    weekChange: safeFixed(principal.weekChange),
    trend: principal.trend,
    branchTeacherAvg: safeFixed(principal.teacherAvg),
    branchStudentAvg: safeFixed(principal.studentAvg),
    atRiskStudents: principal.atRisk,
    // Specific entities under this principal's leadership (grounded refs)
    topTeachers,
    weakTeachers,
    subjectStrengths,
    subjectWeaknesses,
    network: ctx ? {
      totalPrincipals: ctx.totalPrincipals,
      networkPrincipalAvg: safeFixed(ctx.networkPrincipalAvg),
      gapToNetworkAvg: gapToNetwork,
    } : null,
    topPrincipal: top && top.id !== principal.id ? {
      name: top.name,
      branchName: top.branch,
      composite: safeFixed(top.composite),
      gapToTop,
    } : null,
  };
}

// ── Tone → color mapping (AI returns tone strings, UI wants hex) ─────────
function toneToColor(tone: string | undefined): string {
  if (tone === "green") return TONE.GREEN;
  if (tone === "red")   return TONE.RED;
  return TONE.ORANGE; // default
}

function shapeAIResponse(raw: any): LeaderboardInsight {
  const why = Array.isArray(raw?.whyPosition) ? raw.whyPosition : [];
  const sols = Array.isArray(raw?.solutions) ? raw.solutions : [];
  return {
    whyPosition: why.map((w: any) => {
      // Normalise — accept either { tone, bold, rest } (raw AI) or
      // { color, bold, rest } (already shaped, e.g. an older cache).
      const color = w?.color || toneToColor(w?.tone);
      const bold  = String(w?.bold || w?.title || "").trim().slice(0, 120);
      let rest    = String(w?.rest || w?.text || w?.description || "").trim().slice(0, 280);
      // Auto-prefix the em-dash separator if the AI dropped it.
      if (rest && !rest.startsWith("—") && !rest.startsWith(" —")) {
        rest = " — " + rest.replace(/^[—\-:\s]+/, "");
      }
      return { color, bold, rest };
    }).filter((w: WhyItem) => w.bold || w.rest),
    solutions: sols.map((s: any) => ({
      urgent: Boolean(s?.urgent),
      text:   String(s?.text || s?.action || "").trim().slice(0, 280),
    })).filter((s: SolutionItem) => s.text),
    solutionLabel: String(raw?.solutionLabel || "").trim().slice(0, 60),
  };
}

/** Build a deterministic stat-based insight when AI returns nothing usable.
 *  Mirrors the AI prompt's grounding contract: cite specific named teachers
 *  + subjects from the branch enrichment when available, fall back to
 *  top-level metrics otherwise. */
function fallbackBranchInsight(branch: BranchRow, top: BranchRow | null): LeaderboardInsight {
  const isTop = branch.rank === 1;
  const why: WhyItem[] = [];
  const tone = (v: number, good = 75, ok = 60) => v >= good ? TONE.GREEN : v >= ok ? TONE.ORANGE : TONE.RED;
  const teacherTone = tone(branch.teacherAvg);
  const studentTone = tone(branch.studentAvg);

  // Pull enrichment slices (always defined as arrays — empty when no data).
  const topT  = (branch.topTeachers       ?? []).filter(t => t.composite > 0);
  const weakT = (branch.weakTeachers      ?? []);
  const subjS = (branch.subjectStrengths  ?? []);
  const subjW = (branch.subjectWeaknesses ?? []);

  // Lead with the strongest or weakest signal depending on rank
  if (isTop) {
    why.push({
      color: TONE.GREEN,
      bold: `#1 with composite ${branch.composite.toFixed(1)}`,
      rest: ` — leading the network across ${branch.teachers} teachers and ${branch.students.toLocaleString()} students.`,
    });
    if (topT.length > 0) {
      const t = topT[0];
      why.push({
        color: TONE.GREEN,
        bold: `${t.name} leading at ${t.composite.toFixed(1)}`,
        rest: t.subject ? ` — strongest performer in ${t.subject} keeping the branch on top.` : ` — strongest performer keeping the branch on top.`,
      });
    } else if (branch.teacherAvg > 0) {
      why.push({
        color: teacherTone,
        bold: `Teachers averaging ${branch.teacherAvg.toFixed(1)}`,
        rest: ` — strong faculty signal supporting the rank.`,
      });
    }
    if (subjS.length > 0) {
      const s = subjS[0];
      why.push({
        color: TONE.GREEN,
        bold: `${s.subject} avg ${s.avg.toFixed(1)}`,
        rest: ` — strongest subject across the branch.`,
      });
    } else if (branch.studentAvg > 0) {
      why.push({
        color: studentTone,
        bold: `Students averaging ${branch.studentAvg.toFixed(1)}`,
        rest: ` — combined academic + attendance health is the best in the network.`,
      });
    }
    if (branch.atRisk === 0) {
      why.push({
        color: TONE.GREEN,
        bold: `Zero at-risk students`,
        rest: ` — safety score at maximum.`,
      });
    }
  } else {
    why.push({
      color: tone(branch.composite),
      bold: `Composite ${branch.composite.toFixed(1)} (rank #${branch.rank})`,
      rest: ` — ${branch.teachers} teachers, ${branch.students.toLocaleString()} students.`,
    });
    if (subjW.length > 0) {
      const s = subjW[0];
      why.push({
        color: tone(s.avg),
        bold: `${s.subject} avg ${s.avg.toFixed(1)}`,
        rest: ` — weakest subject pulling the branch composite down.`,
      });
    } else if (branch.studentAvg > 0 && branch.studentAvg < 75) {
      why.push({
        color: studentTone,
        bold: `Students avg ${branch.studentAvg.toFixed(1)}`,
        rest: ` — academic + attendance signal pulling the composite down.`,
      });
    }
    if (weakT.length > 0) {
      const t = weakT[0];
      why.push({
        color: tone(t.composite),
        bold: `${t.name} at ${t.composite.toFixed(1)}`,
        rest: t.subject ? ` — bottom-quartile performer in ${t.subject} dragging teacher avg.` : ` — bottom-quartile performer dragging teacher avg.`,
      });
    } else if (branch.teacherAvg > 0 && branch.teacherAvg < 75) {
      why.push({
        color: teacherTone,
        bold: `Teachers avg ${branch.teacherAvg.toFixed(1)}`,
        rest: ` — below the network's strong-performer threshold of 75.`,
      });
    } else if (branch.teacherAvg > 0) {
      why.push({
        color: teacherTone,
        bold: `Teachers avg ${branch.teacherAvg.toFixed(1)}`,
        rest: ` — staff signal is healthy.`,
      });
    }
    if (branch.atRisk > 0) {
      const pct = branch.students > 0 ? Math.round((branch.atRisk / branch.students) * 100) : 0;
      why.push({
        color: TONE.RED,
        bold: `${branch.atRisk} at-risk students (${pct}%)`,
        rest: ` — directly costing the safety component of composite.`,
      });
    }
  }

  const solutions: SolutionItem[] = [];

  // Always emit solutions — even for #1. Type depends on absolute state,
  // not rank. A struggling top branch still has lift available; a healthy
  // top branch needs maintenance routines.
  const isHealthy =
    branch.composite >= 75 &&
    weakT.length === 0 &&
    subjW.length === 0 &&
    branch.atRisk === 0 &&
    branch.teacherAvg >= 75;

  // Solution 1: weak-subject focus, gap-to-top (non-top), or maintain
  // strengths (healthy top).
  if (subjW.length > 0) {
    const s = subjW[0];
    solutions.push({
      urgent: s.avg < 50,
      text: `Run a focused remediation block for ${s.subject} (currently averaging ${s.avg.toFixed(1)}) — weakest subject across the branch.`,
    });
  } else if (!isTop && top) {
    const gap = top.composite - branch.composite;
    const teacherGap = top.teacherAvg - branch.teacherAvg;
    const studentGap = top.studentAvg - branch.studentAvg;
    const biggestGap = teacherGap >= studentGap ? "teachers" : "students";
    solutions.push({
      urgent: gap > 10,
      text: `Close the ${gap.toFixed(1)}-point gap to #1 ${top.name} — biggest delta is in ${biggestGap} (${(biggestGap === "teachers" ? teacherGap : studentGap).toFixed(1)} pts).`,
    });
  } else if (isHealthy && subjS.length > 0) {
    const s = subjS[0];
    solutions.push({
      urgent: false,
      text: `Document the ${s.subject} playbook (avg ${s.avg.toFixed(1)}) — share with other branches as a network-wide replicable practice.`,
    });
  }

  // Solution 2: peer-coaching with names when both top + weak teachers exist
  if (topT.length > 0 && weakT.length > 0) {
    const champ = topT[0];
    const weak  = weakT[0];
    const subjectClause = champ.subject && weak.subject && champ.subject === weak.subject
      ? ` in ${champ.subject}`
      : weak.subject ? ` in ${weak.subject}` : "";
    solutions.push({
      urgent: weak.composite < 45,
      text: `Pair ${champ.name} (${champ.composite.toFixed(1)}) with ${weak.name} (${weak.composite.toFixed(1)})${subjectClause} for weekly peer-coaching — target a 5+ point lift in 4 weeks.`,
    });
  } else if (weakT.length > 0) {
    const weak = weakT[0];
    solutions.push({
      urgent: weak.composite < 45,
      text: `Run a focused PD plan for ${weak.name} (composite ${weak.composite.toFixed(1)}${weak.subject ? `, ${weak.subject}` : ""}) — bottom-quartile teacher pulling the branch down.`,
    });
  } else if (isHealthy && topT.length > 0) {
    const champ = topT[0];
    solutions.push({
      urgent: false,
      text: `Have ${champ.name} (composite ${champ.composite.toFixed(1)}${champ.subject ? `, ${champ.subject}` : ""}) lead a monthly peer-observation slot — protect the strength and grow the next-tier of teachers.`,
    });
  } else if (branch.teacherAvg > 0 && branch.teacherAvg < 70) {
    solutions.push({
      urgent: false,
      text: `Run a peer-coaching session for the bottom-quartile teachers — target ${(branch.teacherAvg + 5).toFixed(0)}+ avg next week.`,
    });
  }

  // Solution 3: at-risk triage (always urgent if any at-risk)
  if (branch.atRisk > 0) {
    solutions.push({
      urgent: branch.atRisk >= 5,
      text: `Triage the ${branch.atRisk} at-risk students this week — parent meetings + remedial plan per student.`,
    });
  } else if (isHealthy) {
    solutions.push({
      urgent: false,
      text: `Maintain the zero-at-risk streak — keep the weekly pastoral review running and watch for first-time absence patterns.`,
    });
  }

  // Solution 4: trend-based — declining for any rank
  if (branch.trend === "down") {
    solutions.push({
      urgent: true,
      text: `Composite dropped ${Math.abs(branch.weekChange).toFixed(1)} pts this week — call a leadership review on Monday to identify the cause.`,
    });
  }

  // Solution label varies by state — top healthy = maintenance; top weak =
  // "lift the floor"; non-top = "how to climb".
  const solutionLabel = solutions.length === 0
    ? ""
    : isTop
      ? (isHealthy ? "What to keep doing" : "Lift the floor")
      : `How to climb to #${branch.rank - 1}`;

  return {
    whyPosition: why,
    solutions,
    solutionLabel,
  };
}

function fallbackPrincipalInsight(principal: PrincipalRow, top: PrincipalRow | null): LeaderboardInsight {
  const isTop = principal.rank === 1;
  const why: WhyItem[] = [];
  const tone = (v: number, good = 75, ok = 60) => v >= good ? TONE.GREEN : v >= ok ? TONE.ORANGE : TONE.RED;

  // Pull enrichment slices (this principal's branch teachers + subjects).
  const topT  = (principal.topTeachers       ?? []).filter(t => t.composite > 0);
  const weakT = (principal.weakTeachers      ?? []);
  const subjS = (principal.subjectStrengths  ?? []);
  const subjW = (principal.subjectWeaknesses ?? []);

  if (isTop) {
    why.push({
      color: TONE.GREEN,
      bold: `#1 leadership rank`,
      rest: ` — composite ${principal.composite.toFixed(1)} at branch ${principal.branch}.`,
    });
    if (topT.length > 0) {
      const t = topT[0];
      why.push({
        color: TONE.GREEN,
        bold: `${t.name} leading at ${t.composite.toFixed(1)}`,
        rest: t.subject ? ` — strongest performer in ${t.subject} under your leadership.` : ` — strongest performer under your leadership.`,
      });
    } else if (principal.teacherAvg > 0) {
      why.push({
        color: tone(principal.teacherAvg),
        bold: `Teachers avg ${principal.teacherAvg.toFixed(1)}`,
        rest: ` — strong faculty outcomes under your leadership.`,
      });
    }
    if (subjS.length > 0) {
      const s = subjS[0];
      why.push({
        color: TONE.GREEN,
        bold: `${s.subject} avg ${s.avg.toFixed(1)}`,
        rest: ` — strongest subject across your branch.`,
      });
    }
    if (principal.atRisk === 0) {
      why.push({
        color: TONE.GREEN,
        bold: `Zero at-risk students`,
        rest: ` — proactive intervention is paying off.`,
      });
    }
  } else {
    why.push({
      color: tone(principal.composite),
      bold: `Composite ${principal.composite.toFixed(1)} (rank #${principal.rank})`,
      rest: ` — branch ${principal.branch}.`,
    });
    if (subjW.length > 0) {
      const s = subjW[0];
      why.push({
        color: tone(s.avg),
        bold: `${s.subject} avg ${s.avg.toFixed(1)}`,
        rest: ` — weakest subject in your branch dragging the composite.`,
      });
    } else if (principal.teacherAvg > 0 && principal.teacherAvg < 75) {
      why.push({
        color: tone(principal.teacherAvg),
        bold: `Branch teachers avg ${principal.teacherAvg.toFixed(1)}`,
        rest: ` — staff outcomes under your leadership need attention.`,
      });
    }
    if (weakT.length > 0) {
      const t = weakT[0];
      why.push({
        color: tone(t.composite),
        bold: `${t.name} at ${t.composite.toFixed(1)}`,
        rest: t.subject ? ` — bottom-quartile teacher in ${t.subject} requiring your direct PD attention.` : ` — bottom-quartile teacher requiring your direct PD attention.`,
      });
    }
    if (principal.atRisk > 0) {
      why.push({
        color: TONE.RED,
        bold: `${principal.atRisk} students at risk in your branch`,
        rest: ` — requires your personal weekly review.`,
      });
    }
  }

  const solutions: SolutionItem[] = [];
  // "Healthy" gate uses both top-level metrics AND enrichment — a top
  // principal whose branch has any weak teacher/subject is NOT healthy.
  const isHealthy =
    principal.composite >= 75 &&
    weakT.length === 0 &&
    subjW.length === 0 &&
    principal.atRisk === 0 &&
    principal.teacherAvg >= 75 &&
    principal.studentAvg >= 75;

  // Solution 1: weak-subject focus (improvement) OR gap-to-top (non-top) OR
  //             playbook documentation (healthy top).
  if (subjW.length > 0) {
    const s = subjW[0];
    solutions.push({
      urgent: s.avg < 50,
      text: `Personally observe 2 ${s.subject} classes per week (currently averaging ${s.avg.toFixed(1)}) — your branch's weakest subject needs leadership attention.`,
    });
  } else if (!isTop && top) {
    const gap = top.composite - principal.composite;
    solutions.push({
      urgent: gap > 10,
      text: `${gap.toFixed(1)}-point gap to #1 (${top.name}, ${top.branch}) — schedule a 1-on-1 with them this week to learn what's working.`,
    });
  } else if (isHealthy && subjS.length > 0) {
    const s = subjS[0];
    solutions.push({
      urgent: false,
      text: `Document the ${s.subject} playbook (avg ${s.avg.toFixed(1)}) — share with other branch principals as a network-replicable practice.`,
    });
  }

  // Solution 2: PD plan for specific weak teacher OR top-led peer mentoring
  //             (healthy top) OR generic.
  if (weakT.length > 0) {
    const weak = weakT[0];
    if (topT.length > 0) {
      const champ = topT[0];
      const subjectClause = champ.subject && weak.subject && champ.subject === weak.subject
        ? ` in ${champ.subject}`
        : weak.subject ? ` in ${weak.subject}` : "";
      solutions.push({
        urgent: weak.composite < 45,
        text: `Pair ${champ.name} (${champ.composite.toFixed(1)}) with ${weak.name} (${weak.composite.toFixed(1)})${subjectClause} for weekly peer-coaching — your role is to protect the time on their calendars.`,
      });
    } else {
      solutions.push({
        urgent: weak.composite < 45,
        text: `Run a focused PD plan for ${weak.name} (composite ${weak.composite.toFixed(1)}${weak.subject ? `, ${weak.subject}` : ""}) — bottom-quartile teacher needs your weekly observation + feedback.`,
      });
    }
  } else if (isHealthy && topT.length > 0) {
    const champ = topT[0];
    solutions.push({
      urgent: false,
      text: `Have ${champ.name} (composite ${champ.composite.toFixed(1)}${champ.subject ? `, ${champ.subject}` : ""}) lead a monthly peer-observation slot — protect the strength and grow the next-tier of teachers.`,
    });
  } else if (principal.teacherAvg > 0 && principal.teacherAvg < 75) {
    solutions.push({
      urgent: false,
      text: `Personally observe 2 weak-teacher classes per week — structured feedback raises faculty avg fastest.`,
    });
  }

  // Solution 3: at-risk triage OR maintenance.
  if (principal.atRisk > 0) {
    solutions.push({
      urgent: principal.atRisk >= 5,
      text: `Lead a Friday case-review meeting for all ${principal.atRisk} at-risk students — assign a tracker per student.`,
    });
  } else if (isHealthy) {
    solutions.push({
      urgent: false,
      text: `Maintain the zero-at-risk streak — keep the weekly pastoral review running and watch for first-time absence patterns.`,
    });
  }

  // Solution 4: trend-based — declining for any rank.
  if (principal.trend === "down") {
    solutions.push({
      urgent: true,
      text: `Composite dropped ${Math.abs(principal.weekChange).toFixed(1)} pts — diagnose root cause in your weekly leadership review.`,
    });
  }

  const solutionLabel = solutions.length === 0
    ? ""
    : isTop
      ? (isHealthy ? "What to keep doing" : "Lift the floor")
      : `How to climb to #${principal.rank - 1}`;

  return {
    whyPosition: why,
    solutions,
    solutionLabel,
  };
}

// ── AI call via parentAIProxy Cloud Function ─────────────────────────────
// Same backend used by aiInsights.ts (student insights) — works in dev + prod.
async function callAIInsights(instructions: string, data: any): Promise<any> {
  const fns = getFunctions(undefined, FUNCTIONS_REGION);
  const call = httpsCallable<
    { prompt: string; systemPrompt: string; jsonMode: boolean },
    { content: string }
  >(fns, "parentAIProxy");

  let raw: string | undefined;
  try {
    const res = await call({
      prompt: JSON.stringify(data),
      systemPrompt: instructions,
      jsonMode: true,
    });
    raw = res.data?.content;
  } catch (err: any) {
    const code = err?.code ? `[${err.code}] ` : "";
    console.error("[leaderboardAI] parentAIProxy call failed:", err);
    throw new Error(`${code}${err?.message || "AI call failed"}`);
  }

  if (!raw) {
    console.warn("[leaderboardAI] AI returned empty content");
    throw new Error("AI returned an empty response.");
  }

  // Strip code fences if present, then JSON.parse. parentAIProxy w/ jsonMode
  // asks for json_object output but stray fences slip through occasionally.
  const cleaned = String(raw)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[leaderboardAI] JSON parse failed. Raw response was:", raw);
    throw new Error("AI returned invalid JSON.");
  }
}

/** Merge AI result with stat-based fallback so the UI never shows a blank box. */
function mergeWithFallback(shaped: LeaderboardInsight, fallback: LeaderboardInsight): LeaderboardInsight {
  return {
    whyPosition: shaped.whyPosition.length > 0 ? shaped.whyPosition : fallback.whyPosition,
    solutions:   shaped.solutions.length   > 0 ? shaped.solutions   : fallback.solutions,
    solutionLabel: shaped.solutionLabel || fallback.solutionLabel,
  };
}

/** Translate raw FirebaseError / OpenAI error into a short, user-readable hint. */
function friendlyAIError(e: any): string {
  const msg = String(e?.message || e || "").toLowerCase();
  const code = String(e?.code || "");
  if (code === "functions/internal" || msg.includes("ai call failed") || msg.includes("500")) {
    return "AI service temporarily unavailable. Showing data-driven analysis instead.";
  }
  if (code === "functions/permission-denied" || msg.includes("permission")) {
    return "AI access unavailable for your role.";
  }
  if (code === "functions/unauthenticated") {
    return "Sign in expired — refresh the page.";
  }
  if (code === "functions/deadline-exceeded" || msg.includes("timeout")) {
    return "AI request timed out. Try again in a moment.";
  }
  if (msg.includes("quota") || msg.includes("rate")) {
    return "AI quota reached for this period. Try later.";
  }
  return "AI service unavailable — showing data-driven analysis.";
}

// ── Public API ───────────────────────────────────────────────────────────
// Both entry points share the 3-tier cache flow:
//   Tier 1 (in-flight) → Tier 2 (localStorage) → Tier 3 (Firestore) → AI
// On AI success, write back to Tier 2 + Tier 3 in parallel.
// Force=true skips Tiers 1-3 entirely (manual regenerate button).

export async function getBranchInsight(
  branch: BranchRow,
  top: BranchRow | null,
  schoolId: string,
  opts: { force?: boolean; ctx?: BranchAIContext } = {},
): Promise<LeaderboardInsight> {
  if (!schoolId) throw new Error("schoolId is required");
  const week = currentIsoWeek();
  const ref = doc(db, "leaderboard_ai_insights", cacheKey("branch", branch.id, schoolId, week));
  const fallback = fallbackBranchInsight(branch, top);
  const flightKey = `branch_${schoolId}_${branch.id}_W${week}${opts.force ? "_force" : ""}`;

  return withInflight(flightKey, async () => {
    // Tier 2 + Tier 3 read (skipped on force)
    if (!opts.force) {
      const cached = await readCachedInsight("branch", branch.id, schoolId, week, ref);
      if (cached) return mergeWithFallback(cached, fallback);
    }

    // Fresh AI call
    let shaped: LeaderboardInsight;
    try {
      const raw = await callAIInsights(BRANCH_INSTRUCTIONS, branchPayload(branch, top, opts.ctx));
      shaped = shapeAIResponse(raw);
      // Write-back to Tier 2 + Tier 3 (both best-effort, non-blocking)
      void writeCachedInsight("branch", branch.id, schoolId, week, ref, raw, shaped);
    } catch (e: any) {
      console.warn("[leaderboardAI] AI failed — returning fallback insight:", e);
      return { ...fallback, isFallback: true, fallbackReason: friendlyAIError(e) };
    }
    return mergeWithFallback(shaped, fallback);
  });
}

export async function getPrincipalInsight(
  principal: PrincipalRow,
  top: PrincipalRow | null,
  schoolId: string,
  opts: { force?: boolean; ctx?: PrincipalAIContext } = {},
): Promise<LeaderboardInsight> {
  if (!schoolId) throw new Error("schoolId is required");
  const week = currentIsoWeek();
  const ref = doc(db, "leaderboard_ai_insights", cacheKey("principal", principal.id, schoolId, week));
  const fallback = fallbackPrincipalInsight(principal, top);
  const flightKey = `principal_${schoolId}_${principal.id}_W${week}${opts.force ? "_force" : ""}`;

  return withInflight(flightKey, async () => {
    if (!opts.force) {
      const cached = await readCachedInsight("principal", principal.id, schoolId, week, ref);
      if (cached) return mergeWithFallback(cached, fallback);
    }

    let shaped: LeaderboardInsight;
    try {
      const raw = await callAIInsights(PRINCIPAL_INSTRUCTIONS, principalPayload(principal, top, opts.ctx));
      shaped = shapeAIResponse(raw);
      void writeCachedInsight("principal", principal.id, schoolId, week, ref, raw, shaped);
    } catch (e: any) {
      console.warn("[leaderboardAI] AI failed — returning fallback insight:", e);
      return { ...fallback, isFallback: true, fallbackReason: friendlyAIError(e) };
    }
    return mergeWithFallback(shaped, fallback);
  });
}
