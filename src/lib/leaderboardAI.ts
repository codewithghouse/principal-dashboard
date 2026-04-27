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
const CACHE_VERSION = "v3";

function cacheKey(type: "branch" | "principal", id: string, schoolId: string, week: number): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSchool = schoolId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeSchool}_${type}_${safeId}_W${week}_${CACHE_VERSION}`;
}

// ── Prompt builders ──────────────────────────────────────────────────────
// CRITICAL: prompts forbid invented numbers. Every figure cited in the output
// MUST come from a field in the JSON payload. This prevents hallucinated
// "attendance is 87%" claims when no attendance signal was passed.
const BRANCH_INSTRUCTIONS = `You are an expert Indian K-12 school performance advisor.

You will receive ONE branch's leaderboard standing within a school, plus context about the highest-ranked branch and network averages. Explain WHY this branch sits at its rank, and (only for ranks 2+) HOW it can climb.

ABSOLUTE NUMERIC GROUNDING RULES (violation = bad output):
1. Every number you mention (averages, percentages, deltas, counts) MUST be either copied verbatim from the JSON payload OR be a simple subtraction of two payload fields (e.g. topBranch.composite − composite, networkBranchAvg − teacherAvg).
2. NEVER invent attendance, pass-rate, test-count, syllabus-coverage, or other figures that are not present in the payload.
3. If a field is 0 or missing, treat it as "no data" and do not claim a value.
4. Do not reference other branches by name unless their name appears in the payload.

Return ONLY valid JSON in this exact shape:

{
  "whyPosition": [
    { "tone": "green | orange | red", "bold": "Short factual label e.g. 'Teachers avg 89.6'", "rest": " — one-sentence explanation tied to the data" }
  ],
  "solutions": [
    { "urgent": true | false, "text": "Concrete action — specific + measurable, 1 sentence" }
  ],
  "solutionLabel": "Short header e.g. 'How to reach #1' or 'Recovery plan' (empty string for rank 1)"
}

Content rules:
- 3-4 whyPosition items, each tied to a SPECIFIC payload field (composite, teacherAvg, studentAvg, atRiskStudents, weekChange, or a delta vs networkBranchAvg / topBranch).
- Tone: "green" for strengths (≥75 or rank 1 or improving trend); "orange" for moderate gaps (60–74 or 5+ pt gap to top); "red" for crises (<60, declining trend, or atRiskStudents ≥ 5).
- For rank 1: solutions = [] and solutionLabel = "" (winners have nothing to fix).
- For rank 2+: 2-4 solutions ordered by impact. Mark urgent=true if the gap is critical (declining trend, at-risk surge, or rank in bottom third).
- "bold" must be a stat-style fragment with a number copied from payload. "rest" must start with " — " and complete the thought.
- Output ONLY JSON. No markdown, no commentary.`;

const PRINCIPAL_INSTRUCTIONS = `You are an expert Indian K-12 school performance advisor.

You will receive ONE principal's leaderboard standing within their school network. The principal's rank reflects their branch composite + their own engagement signal. Explain WHY they rank where they do, and (only for ranks 2+) what THEY personally should do to climb.

ABSOLUTE NUMERIC GROUNDING RULES (violation = bad output):
1. Every number you mention MUST be copied from the JSON payload OR be a simple delta of two payload fields (e.g. topPrincipal.composite − composite, networkPrincipalAvg − composite).
2. NEVER invent figures — no "attendance 92%", no "10 observations" — unless that exact field exists in the payload.
3. If a field is 0 or missing, treat it as "no data" and do not claim a value.
4. Do not reference other principals by name unless that name appears in the payload.

Return ONLY valid JSON in this exact shape:

{
  "whyPosition": [
    { "tone": "green | orange | red", "bold": "Short factual label", "rest": " — one-sentence explanation" }
  ],
  "solutions": [
    { "urgent": true | false, "text": "Action the principal personally takes — specific + 1 sentence" }
  ],
  "solutionLabel": "e.g. 'How to reach #1', 'Recovery plan', or '' for rank 1"
}

Content rules:
- 2-4 whyPosition items, each grounded in a SPECIFIC payload field (composite, branchTeacherAvg, branchStudentAvg, atRiskStudents, weekChange, or a delta vs networkPrincipalAvg / topPrincipal).
- Rank 1: solutions = [] and solutionLabel = "".
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

/** Build a deterministic stat-based insight when AI returns nothing usable. */
function fallbackBranchInsight(branch: BranchRow, top: BranchRow | null): LeaderboardInsight {
  const isTop = branch.rank === 1;
  const why: WhyItem[] = [];
  const tone = (v: number, good = 75, ok = 60) => v >= good ? TONE.GREEN : v >= ok ? TONE.ORANGE : TONE.RED;
  const teacherTone = tone(branch.teacherAvg);
  const studentTone = tone(branch.studentAvg);

  // Lead with the strongest or weakest signal depending on rank
  if (isTop) {
    why.push({
      color: TONE.GREEN,
      bold: `#1 with composite ${branch.composite.toFixed(1)}`,
      rest: ` — leading the network across ${branch.teachers} teachers and ${branch.students.toLocaleString()} students.`,
    });
    if (branch.teacherAvg > 0) {
      why.push({
        color: teacherTone,
        bold: `Teachers averaging ${branch.teacherAvg.toFixed(1)}`,
        rest: ` — strong faculty signal supporting the rank.`,
      });
    }
    if (branch.studentAvg > 0) {
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
    if (branch.teacherAvg > 0 && branch.teacherAvg < 75) {
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
    if (branch.studentAvg > 0 && branch.studentAvg < 75) {
      why.push({
        color: studentTone,
        bold: `Students avg ${branch.studentAvg.toFixed(1)}`,
        rest: ` — academic + attendance signal pulling the composite down.`,
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
  if (!isTop && top) {
    const gap = top.composite - branch.composite;
    const teacherGap = top.teacherAvg - branch.teacherAvg;
    const studentGap = top.studentAvg - branch.studentAvg;
    const biggestGap = teacherGap >= studentGap ? "teachers" : "students";

    solutions.push({
      urgent: gap > 10,
      text: `Close the ${gap.toFixed(1)}-point gap to #1 ${top.name} — biggest delta is in ${biggestGap} (${(biggestGap === "teachers" ? teacherGap : studentGap).toFixed(1)} pts).`,
    });
    if (branch.atRisk > 0) {
      solutions.push({
        urgent: branch.atRisk >= 5,
        text: `Triage the ${branch.atRisk} at-risk students this week — parent meetings + remedial plan per student.`,
      });
    }
    if (branch.teacherAvg > 0 && branch.teacherAvg < 70) {
      solutions.push({
        urgent: false,
        text: `Run a peer-coaching session for the bottom-quartile teachers — target ${(branch.teacherAvg + 5).toFixed(0)}+ avg next week.`,
      });
    }
    if (branch.trend === "down") {
      solutions.push({
        urgent: true,
        text: `Composite dropped ${Math.abs(branch.weekChange).toFixed(1)} pts this week — call a leadership review on Monday to identify the cause.`,
      });
    }
  }

  return {
    whyPosition: why,
    solutions,
    solutionLabel: isTop ? "" : (solutions.length ? `How to climb to #${branch.rank - 1}` : ""),
  };
}

function fallbackPrincipalInsight(principal: PrincipalRow, top: PrincipalRow | null): LeaderboardInsight {
  const isTop = principal.rank === 1;
  const why: WhyItem[] = [];
  const tone = (v: number, good = 75, ok = 60) => v >= good ? TONE.GREEN : v >= ok ? TONE.ORANGE : TONE.RED;

  if (isTop) {
    why.push({
      color: TONE.GREEN,
      bold: `#1 leadership rank`,
      rest: ` — composite ${principal.composite.toFixed(1)} at branch ${principal.branch}.`,
    });
    if (principal.teacherAvg > 0) {
      why.push({
        color: tone(principal.teacherAvg),
        bold: `Teachers avg ${principal.teacherAvg.toFixed(1)}`,
        rest: ` — strong faculty outcomes under your leadership.`,
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
    if (principal.teacherAvg > 0 && principal.teacherAvg < 75) {
      why.push({
        color: tone(principal.teacherAvg),
        bold: `Branch teachers avg ${principal.teacherAvg.toFixed(1)}`,
        rest: ` — staff outcomes under your leadership need attention.`,
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
  if (!isTop && top) {
    const gap = top.composite - principal.composite;
    solutions.push({
      urgent: gap > 10,
      text: `${gap.toFixed(1)}-point gap to #1 (${top.name}, ${top.branch}) — schedule a 1-on-1 with them this week to learn what's working.`,
    });
    if (principal.teacherAvg > 0 && principal.teacherAvg < 75) {
      solutions.push({
        urgent: false,
        text: `Personally observe 2 weak-teacher classes per week — structured feedback raises faculty avg fastest.`,
      });
    }
    if (principal.atRisk > 0) {
      solutions.push({
        urgent: principal.atRisk >= 5,
        text: `Lead a Friday case-review meeting for all ${principal.atRisk} at-risk students — assign a tracker per student.`,
      });
    }
    if (principal.trend === "down") {
      solutions.push({
        urgent: true,
        text: `Composite dropped ${Math.abs(principal.weekChange).toFixed(1)} pts — diagnose root cause in your weekly leadership review.`,
      });
    }
  }

  return {
    whyPosition: why,
    solutions,
    solutionLabel: isTop ? "" : (solutions.length ? `How to climb to #${principal.rank - 1}` : ""),
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

  if (!opts.force) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const cached = snap.data() as CachedInsight;
        if (cached._schoolId === schoolId && cached._week === week) {
          const shaped = shapeAIResponse(cached);
          if (shaped.whyPosition.length > 0) return mergeWithFallback(shaped, fallback);
          // Cached doc was malformed/empty — fall through to fresh call
        }
      }
    } catch (e) {
      console.warn("[leaderboardAI] cache read failed:", e);
    }
  }

  let shaped: LeaderboardInsight;
  try {
    const raw = await callAIInsights(BRANCH_INSTRUCTIONS, branchPayload(branch, top, opts.ctx));
    shaped = shapeAIResponse(raw);

    // Cache (best-effort)
    try {
      await setDoc(ref, {
        whyPosition: (raw?.whyPosition || []).slice(0, 10),
        solutions:   (raw?.solutions   || []).slice(0, 10),
        solutionLabel: raw?.solutionLabel || "",
        _cachedAt: serverTimestamp(),
        _schoolId: schoolId,
        _type: "branch",
        _id: branch.id,
        _week: week,
        schoolId,
      });
    } catch (e) {
      console.warn("[leaderboardAI] cache write failed:", e);
    }
  } catch (e: any) {
    console.warn("[leaderboardAI] AI failed — returning fallback insight:", e);
    return { ...fallback, isFallback: true, fallbackReason: friendlyAIError(e) };
  }

  return mergeWithFallback(shaped, fallback);
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

  if (!opts.force) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const cached = snap.data() as CachedInsight;
        if (cached._schoolId === schoolId && cached._week === week) {
          const shaped = shapeAIResponse(cached);
          if (shaped.whyPosition.length > 0) return mergeWithFallback(shaped, fallback);
        }
      }
    } catch (e) {
      console.warn("[leaderboardAI] cache read failed:", e);
    }
  }

  let shaped: LeaderboardInsight;
  try {
    const raw = await callAIInsights(PRINCIPAL_INSTRUCTIONS, principalPayload(principal, top, opts.ctx));
    shaped = shapeAIResponse(raw);

    try {
      await setDoc(ref, {
        whyPosition: (raw?.whyPosition || []).slice(0, 10),
        solutions:   (raw?.solutions   || []).slice(0, 10),
        solutionLabel: raw?.solutionLabel || "",
        _cachedAt: serverTimestamp(),
        _schoolId: schoolId,
        _type: "principal",
        _id: principal.id,
        _week: week,
        schoolId,
      });
    } catch (e) {
      console.warn("[leaderboardAI] cache write failed:", e);
    }
  } catch (e: any) {
    console.warn("[leaderboardAI] AI failed — returning fallback insight:", e);
    return { ...fallback, isFallback: true, fallbackReason: friendlyAIError(e) };
  }

  return mergeWithFallback(shaped, fallback);
}
