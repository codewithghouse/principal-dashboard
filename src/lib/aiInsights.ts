/**
 * aiInsights.ts
 * Generates AI-powered root-cause + improvement plan for a classified student.
 * Results are cached in Firestore `student_ai_insights/{studentId}` for 24 hours
 * to keep AI costs low and deliver instant repeat-views.
 *
 * Backend: calls the deployed Firebase Cloud Function `parentAIProxy` (universal
 * AI proxy — authenticated users only). OpenAI key never leaves the server.
 */

import { db } from "./firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { ClassifiedStudent } from "./classifyStudent";

// Cloud Functions region must match where parentAIProxy is deployed
const FUNCTIONS_REGION = "us-central1";

export interface AIInsight {
  rootCauses: string[];
  forTeacher: string[];
  forParent: string[];
  nextSteps: {
    immediate: string;
    shortTerm: string;
    longTerm: string;
  };
  urgency: "critical" | "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  summary: string;
}

export interface CachedInsight extends AIInsight {
  _cachedAt: Timestamp | null;
  _studentId: string;
  _schoolId: string;
  _category: string;
  _fromCache?: boolean;
}

// Cache TTL — 24h. Score/attendance changes overnight will trigger refresh.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isCacheFresh(cachedAt: Timestamp | null | undefined): boolean {
  if (!cachedAt) return false;
  const ms = cachedAt.toMillis?.() ?? 0;
  return Date.now() - ms < CACHE_TTL_MS;
}

/**
 * Build the analytical prompt for OpenAI. Tailored to Indian K-12 context,
 * returns STRICT JSON only (no prose).
 */
function buildInstructions(): string {
  return `You are an expert Indian K-12 school performance advisor helping a principal understand WHY a specific student is in their current performance tier and HOW to improve them.

The student's data will be provided. Analyze deeply and return ONLY a JSON object with this exact shape:

{
  "rootCauses": [
    "3-5 specific, evidence-based reasons — each one sentence",
    "Tie each cause to data (scores/attendance/trend/gaps)",
    "Avoid generic phrases like 'needs more effort'",
    "Examples of GOOD causes: 'Attendance has dropped 12% in last 30 days — suggests home issue', 'Average below 50% but consistent — indicates foundational concept gaps, not effort'"
  ],
  "forTeacher": [
    "3-5 concrete classroom actions the class teacher should take",
    "Each action must be specific + time-bound (e.g. 'Run 15-min daily drill on fractions for 2 weeks')",
    "Prioritize highest-impact actions first"
  ],
  "forParent": [
    "3-4 specific things parents can do at home",
    "Actionable + realistic for Indian middle-class parents (avoid tech-heavy tips)",
    "Examples: 'Check homework 20 min/day', 'Schedule eye checkup if reading-related', 'Reduce screen time on school nights'"
  ],
  "nextSteps": {
    "immediate": "What to do THIS WEEK (1 concrete action)",
    "shortTerm": "What to do THIS MONTH (1 concrete action)",
    "longTerm": "What to do THIS SEMESTER (1 concrete goal with measurable outcome)"
  },
  "urgency": "critical | high | medium | low",
  "confidence": "high | medium | low",
  "summary": "One-paragraph plain English summary (50-80 words) principal can share verbatim with parents or teacher"
}

Rules:
- Output ONLY valid JSON — no markdown, no commentary
- Be direct and specific — this will be shown to the principal for immediate action
- If data is insufficient, set confidence: "low" and explain in rootCauses
- Tone: professional, non-judgemental, action-oriented
- Do not invent data — only reason from what's provided`;
}

function buildDataPayload(student: ClassifiedStudent) {
  return {
    studentName: student.studentName,
    class: student.className || "unknown",
    rollNumber: student.rollNo || "not assigned",
    category: student.category,
    averageScore: student.scores.length > 0 ? student.avgScore : null,
    totalTestsRecorded: student.scores.length,
    recentScores: student.scores.slice(-8), // last 8 only — keeps payload small
    attendancePct: student.totalAttendance > 0 ? student.attendancePct : null,
    totalAttendanceDays: student.totalAttendance,
    presentDays: student.presentAttendance,
    detectedSignals: student.reasons,
  };
}

/**
 * Fetch + cache AI insight for a student. Returns cached result immediately if
 * fresh (within 24h). Otherwise calls the Vercel AI endpoint + writes cache.
 *
 * @param student   The classified student
 * @param schoolId  Tenant scope (written to cache doc for rules)
 * @param opts.force  Bypass cache (principal pressed "Regenerate")
 */
export async function getStudentInsight(
  student: ClassifiedStudent,
  schoolId: string,
  opts: { force?: boolean } = {},
): Promise<CachedInsight> {
  if (!schoolId) throw new Error("schoolId is required");
  if (!student?.studentId) throw new Error("student.studentId is required");

  const cacheRef = doc(db, "student_ai_insights", student.studentId);

  // 1) Try cache
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
      // Non-fatal — fall through to AI call
      console.warn("[aiInsights] cache read failed:", err);
    }
  }

  // 2) Call AI via deployed Firebase Cloud Function (parentAIProxy).
  //    This works regardless of hosting (Firebase/Vercel) because it hits
  //    Cloud Functions directly — OpenAI key stays server-side.
  const fns = getFunctions(undefined, FUNCTIONS_REGION);
  const call = httpsCallable<
    { prompt: string; systemPrompt: string; jsonMode: boolean },
    { content: string }
  >(fns, "parentAIProxy");

  let parsed: AIInsight;
  try {
    const res = await call({
      prompt: JSON.stringify(buildDataPayload(student)),
      systemPrompt: buildInstructions(),
      jsonMode: true,
    });
    const raw = res.data?.content;
    if (!raw) throw new Error("AI returned empty content.");
    parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as AIInsight);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI call failed";
    // Firebase functions errors have a `code` field — surface it for debugging
    const code = (err as { code?: string })?.code;
    throw new Error(code ? `[${code}] ${msg}` : msg);
  }

  // 3) Validate shape before caching
  if (
    !parsed ||
    !Array.isArray(parsed.rootCauses) ||
    !Array.isArray(parsed.forTeacher) ||
    !Array.isArray(parsed.forParent) ||
    !parsed.nextSteps ||
    !parsed.summary
  ) {
    throw new Error("AI returned an incomplete response — please retry.");
  }

  // 4) Write cache (best-effort — don't fail the call if Firestore write fails)
  const cacheDoc: CachedInsight = {
    ...parsed,
    _cachedAt: null, // placeholder — Firestore stamps actual
    _studentId: student.studentId,
    _schoolId: schoolId,
    _category: student.category,
  };
  try {
    await setDoc(cacheRef, {
      ...parsed,
      _cachedAt: serverTimestamp(),
      _studentId: student.studentId,
      _schoolId: schoolId,
      _category: student.category,
      schoolId, // top-level for Firestore rules
    });
  } catch (err) {
    console.warn("[aiInsights] cache write failed (result still returned):", err);
  }

  return { ...cacheDoc, _fromCache: false };
}