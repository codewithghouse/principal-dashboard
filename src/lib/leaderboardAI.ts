/**
 * leaderboardAI.ts — AI-powered "why this rank" + "how to improve" generator
 * for branch and principal leaderboard rows.
 *
 * Backend: Vercel `/api/ai-insights` (OpenAI proxy with auth + rate limit).
 * Cache:   Firestore `leaderboard_ai_insights/{schoolId}_{type}_{id}_W{week}`
 *          — keyed by ISO week so a fresh analysis is cached per week without
 *          re-billing OpenAI on every row expand.
 *
 * Output is shaped to match the UI's whyPosition/solutions render:
 *   { whyPosition: [{ color, bold, rest }], solutions: [{ urgent, text }] }
 */

import { db, auth } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import type { BranchRow, PrincipalRow } from "./leaderboardData";

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

function cacheKey(type: "branch" | "principal", id: string, schoolId: string, week: number): string {
  // Doc IDs cannot contain "/", and we keep underscores predictable.
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSchool = schoolId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeSchool}_${type}_${safeId}_W${week}`;
}

// ── Prompt builders ──────────────────────────────────────────────────────
const BRANCH_INSTRUCTIONS = `You are an expert Indian K-12 school performance advisor.

You will receive ONE branch's leaderboard standing within a school, plus context about the highest-ranked branch (if it exists). Explain WHY this branch sits at its rank, and (only for ranks 2+) HOW it can climb.

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

Rules:
- 3-4 whyPosition items, each tied to the actual numbers provided. Use tone "green" for strengths (rank 1), "orange" for moderate gaps, "red" for crises (rank 4-5 / declines).
- For rank 1: solutions = [] and solutionLabel = "" (winners have nothing to fix).
- For rank 2+: 2-4 solutions ordered by impact. Mark urgent=true if the gap is critical (declining trend, at-risk surge, or rank 4-5).
- "bold" must be a stat-style fragment (numbers preferred). "rest" must start with " — " and complete the thought.
- Output ONLY JSON. No markdown, no commentary.`;

const PRINCIPAL_INSTRUCTIONS = `You are an expert Indian K-12 school performance advisor.

You will receive ONE principal's leaderboard standing within their school network. The principal's rank reflects their branch composite + their own engagement signal. Explain WHY they rank where they do, and (only for ranks 2+) what THEY personally should do to climb.

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

Rules:
- 2-4 whyPosition items, grounded in their branch's teacher avg, student avg, at-risk count.
- Rank 1: solutions = [] and solutionLabel = "".
- Solutions are leadership actions (coaching, observation, policy enforcement) — NOT teacher- or student-level tasks.
- Output ONLY JSON. No markdown, no commentary.`;

function branchPayload(branch: BranchRow, top: BranchRow | null) {
  return {
    rank: branch.rank,
    branchName: branch.name,
    composite: Number(branch.composite.toFixed(1)),
    weekChange: Number(branch.weekChange.toFixed(1)),
    trend: branch.trend,
    teacherAvg: Number(branch.teacherAvg.toFixed(1)),
    studentAvg: Number(branch.studentAvg.toFixed(1)),
    teachers: branch.teachers,
    students: branch.students,
    atRiskStudents: branch.atRisk,
    topBranch: top && top.id !== branch.id ? {
      name: top.name,
      composite: Number(top.composite.toFixed(1)),
      teacherAvg: Number(top.teacherAvg.toFixed(1)),
      studentAvg: Number(top.studentAvg.toFixed(1)),
    } : null,
  };
}

function principalPayload(principal: PrincipalRow, top: PrincipalRow | null) {
  return {
    rank: principal.rank,
    principalName: principal.name,
    branchName: principal.branch,
    composite: Number(principal.composite.toFixed(1)),
    weekChange: Number(principal.weekChange.toFixed(1)),
    trend: principal.trend,
    branchTeacherAvg: Number(principal.teacherAvg.toFixed(1)),
    branchStudentAvg: Number(principal.studentAvg.toFixed(1)),
    atRiskStudents: principal.atRisk,
    topPrincipal: top && top.id !== principal.id ? {
      name: top.name,
      branchName: top.branch,
      composite: Number(top.composite.toFixed(1)),
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
    whyPosition: why.map((w: any) => ({
      color: toneToColor(w?.tone),
      bold:  String(w?.bold || "").slice(0, 120),
      rest:  String(w?.rest || "").slice(0, 280),
    })).filter((w: WhyItem) => w.bold && w.rest),
    solutions: sols.map((s: any) => ({
      urgent: Boolean(s?.urgent),
      text:   String(s?.text || "").slice(0, 280),
    })).filter((s: SolutionItem) => s.text),
    solutionLabel: String(raw?.solutionLabel || "").slice(0, 60),
  };
}

// ── Vercel AI call ───────────────────────────────────────────────────────
async function callAIInsights(instructions: string, data: any): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const token = await user.getIdToken();

  const res = await fetch("/api/ai-insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ instructions, data }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `AI request failed (${res.status}).`);
  }
  return res.json();
}

// ── Public API ───────────────────────────────────────────────────────────
export async function getBranchInsight(
  branch: BranchRow,
  top: BranchRow | null,
  schoolId: string,
  opts: { force?: boolean } = {},
): Promise<LeaderboardInsight> {
  if (!schoolId) throw new Error("schoolId is required");
  const week = currentIsoWeek();
  const ref = doc(db, "leaderboard_ai_insights", cacheKey("branch", branch.id, schoolId, week));

  if (!opts.force) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const cached = snap.data() as CachedInsight;
        if (cached._schoolId === schoolId && cached._week === week) {
          return shapeAIResponse(cached);
        }
      }
    } catch {
      // Non-fatal — fall through to fresh AI call
    }
  }

  const raw = await callAIInsights(BRANCH_INSTRUCTIONS, branchPayload(branch, top));
  const shaped = shapeAIResponse(raw);

  // Cache (best-effort — we still return result if Firestore write fails)
  try {
    await setDoc(ref, {
      // Persist the *raw* AI response shape so re-reads can be re-shaped if
      // the UI tone palette changes. We also tag it with tenancy metadata
      // so security rules can scope reads.
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
  } catch {
    // ignore — return shaped result anyway
  }

  return shaped;
}

export async function getPrincipalInsight(
  principal: PrincipalRow,
  top: PrincipalRow | null,
  schoolId: string,
  opts: { force?: boolean } = {},
): Promise<LeaderboardInsight> {
  if (!schoolId) throw new Error("schoolId is required");
  const week = currentIsoWeek();
  const ref = doc(db, "leaderboard_ai_insights", cacheKey("principal", principal.id, schoolId, week));

  if (!opts.force) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const cached = snap.data() as CachedInsight;
        if (cached._schoolId === schoolId && cached._week === week) {
          return shapeAIResponse(cached);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  const raw = await callAIInsights(PRINCIPAL_INSTRUCTIONS, principalPayload(principal, top));
  const shaped = shapeAIResponse(raw);

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
  } catch {
    // ignore
  }

  return shaped;
}
