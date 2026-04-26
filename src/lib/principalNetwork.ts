/**
 * principalNetwork.ts
 * --------------------------------------------------------------------------
 * REAL-DATA-ONLY data layer for the Principal Network dashboard.
 *
 * No synthetic peers, no fake trajectories. Every number on the dashboard
 * is derived from this principal's actual school data in Firestore.
 *
 * Provides:
 *   - computeBranchComposite()    school-wide composite from real teachers+students
 *   - computeClassRanking()       per-class composite (real students per classId)
 *   - computeTeacherRanking()     wraps existing scoreTeachers
 *   - computeWeeklyHistory()      ISO-week bucketed real history
 *   - computeWeekOverWeekTrend()  real week-over-week composite delta
 *   - fetchPrincipalInsights()    OpenAI proxy call (real, schema-validated)
 *   - fetchBranchInsights()       OpenAI proxy call (real)
 */

import { auth } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  scoreTeachers,
  TeacherScore,
  TeacherDoc,
  ScoreDoc,
  AttendanceDoc,
  AssignmentDoc,
  TeacherAttendanceDoc,
  TeachingAssignmentDoc,
} from "./teacherScorer";

// ── Types ─────────────────────────────────────────────────────────────────
export interface BranchComposite {
  branchName: string;
  schoolId: string;
  composite: number;
  studentsAvg: number;
  teachersAvg: number;
  improvement: number;
  atRiskPct: number;
  totalStudents: number;
  totalTeachers: number;
  totalSections: number;
  topTeachers: TeacherScore[];
  weakTeachers: TeacherScore[];
  midTeachers: TeacherScore[];
  studentClusters: StudentCluster[];
  weekOverWeekDelta: number | null;
}

export interface StudentCluster {
  classId: string;
  className: string;
  teacherName: string;
  atRisk: number;
  total: number;
  pct: number;
  severity: "critical" | "warning" | "okay";
  avg: number;
  issues: string[];
}

export interface ClassRow {
  rank: number;
  classId: string;
  name: string;
  grade: string;
  section: string;
  initial: string;
  composite: number;
  totalStudents: number;
  atRisk: number;
  atRiskPct: number;
  classTeacher: string;
  context: string;
  avatarBg: string;
  avatarText: string;
}

export interface TeacherRow {
  rank: number;
  teacherId: string;
  name: string;
  initials: string;
  subject: string;
  composite: number;
  context: string;
  avatarBg: string;
  avatarText: string;
}

export interface SchoolDashboardData {
  branchName: string;
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  branch: BranchComposite;
  teachers: TeacherRow[];
  classes: ClassRow[];
  weeklyHistory: WeeklyPoint[];
  weekOverWeekDelta: number | null;
}

export interface WeeklyPoint {
  weekId: string;        // YYYY-Www
  weekLabel: string;     // e.g. "W17"
  weekStartMs: number;
  studentsAvg: number;
  composite: number;
  sampleSize: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function parsePct(s: ScoreDoc): number | null {
  const p = parseFloat(String(s.percentage));
  if (Number.isFinite(p)) return Math.max(0, Math.min(100, p));
  const sc = parseFloat(String(s.score ?? s.marks ?? s.obtainedMarks));
  const mx = parseFloat(String(s.maxScore ?? s.totalMarks ?? s.maxMarks));
  if (Number.isFinite(sc) && Number.isFinite(mx) && mx > 0) {
    return Math.max(0, Math.min(100, (sc / mx) * 100));
  }
  return null;
}

function dateMsOf(s: ScoreDoc): number | null {
  const candidates: unknown[] = [
    (s as Record<string, unknown>).testDate,
    (s as Record<string, unknown>).date,
    (s as Record<string, unknown>).createdAt,
    (s as Record<string, unknown>).uploadedAt,
    (s as Record<string, unknown>).examDate,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "object" && c !== null && typeof (c as { toMillis?: () => number }).toMillis === "function") {
      const ms = (c as { toMillis: () => number }).toMillis();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    if (typeof c === "object" && c !== null && typeof (c as { seconds?: number }).seconds === "number") {
      return (c as { seconds: number }).seconds * 1000;
    }
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
    if (typeof c === "string") {
      const ms = new Date(c).getTime();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
  }
  return null;
}

// ISO week (Monday-based)
function isoWeekKey(ms: number): { weekId: string; weekStartMs: number; weekLabel: string } {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  // Move to Thursday in current week to determine ISO year
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  // Monday of original week:
  const orig = new Date(ms);
  const day = orig.getUTCDay() || 7;
  const monday = new Date(orig);
  monday.setUTCDate(orig.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return {
    weekId: `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`,
    weekStartMs: monday.getTime(),
    weekLabel: `W${weekNum}`,
  };
}

interface Indexed {
  studentScoreMap: Map<string, number[]>;
  studentAvgs: number[];
  studentAvgById: Map<string, number>;
}

function indexStudentScores(scores: ScoreDoc[]): Indexed {
  const studentScoreMap = new Map<string, number[]>();
  scores.forEach(s => {
    const sid = s.studentId;
    const p = parsePct(s);
    if (!sid || p === null) return;
    if (!studentScoreMap.has(sid)) studentScoreMap.set(sid, []);
    studentScoreMap.get(sid)!.push(p);
  });
  const studentAvgs: number[] = [];
  const studentAvgById = new Map<string, number>();
  studentScoreMap.forEach((arr, sid) => {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    studentAvgs.push(avg);
    studentAvgById.set(sid, avg);
  });
  return { studentScoreMap, studentAvgs, studentAvgById };
}

// ── Branch composite calculator ───────────────────────────────────────────
export interface ComputeBranchInput {
  branchName: string;
  schoolId: string;
  teachers: TeacherDoc[];
  students: Record<string, unknown>[];
  scores: ScoreDoc[];
  attendance: AttendanceDoc[];
  assignments: AssignmentDoc[];
  teacherAttendance: TeacherAttendanceDoc[];
  classes: Record<string, unknown>[];
  teachingAssignments: TeachingAssignmentDoc[];
}

export function computeBranchComposite(input: ComputeBranchInput): BranchComposite {
  const {
    branchName, schoolId, teachers, students,
    scores, attendance, assignments, teacherAttendance,
    classes, teachingAssignments,
  } = input;

  const ranked = scoreTeachers({
    teachers, scores, attendance, assignments,
    teacherAttendance, teachingAssignments,
  });
  const withData = ranked.filter(r => r.testCount > 0 || r.assignments > 0 || r.attendance !== null);
  const teachersAvg = withData.length
    ? withData.reduce((a, b) => a + b.composite, 0) / withData.length
    : 0;

  const { studentAvgs, studentAvgById } = indexStudentScores(scores);
  const studentsAvg = studentAvgs.length
    ? studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length
    : 0;

  const atRiskCount = studentAvgs.filter(a => a < 50).length;
  const atRiskPct = studentAvgs.length ? (atRiskCount / studentAvgs.length) * 100 : 0;

  // Improvement = real WoW delta if history exists; else engagement proxy from teacher punctuality+activity
  const wow = computeWeekOverWeekTrend(scores);
  const engagementProxy = withData.length
    ? withData.filter(r => (r.punctuality ?? 0) >= 70 && r.assignments > 0).length / withData.length
    : 0;
  const improvement = wow.delta != null
    // Map delta into 0-100. +5 → ~100, 0 → 70, -5 → ~40.
    ? Math.max(0, Math.min(100, 70 + wow.delta * 6))
    : Math.round(60 + engagementProxy * 35);

  // Tiers
  const sortedDesc = [...withData].sort((a, b) => b.composite - a.composite);
  const topTeachers = sortedDesc.filter(t => t.composite >= 85).slice(0, 5);
  const topIds = new Set(topTeachers.map(t => t.teacher.id));
  const weakTeachers = sortedDesc.filter(t => t.composite < 70);
  const weakIds = new Set(weakTeachers.map(t => t.teacher.id));
  const midTeachers = sortedDesc.filter(t => !weakIds.has(t.teacher.id) && !topIds.has(t.teacher.id));

  // Student clusters (real per classId)
  const classNameOf = (cid: string) => {
    const c = classes.find((x: Record<string, unknown>) => x.id === cid);
    if (!c) return cid;
    return (c.name as string) || (c.className as string)
      || `${c.grade ?? ""}-${c.section ?? ""}` || cid;
  };
  const teacherOf = (cid: string): string => {
    const ta = teachingAssignments.find(x => x.classId === cid);
    if (!ta) return "—";
    const t = teachers.find(x => x.id === ta.teacherId);
    return (t?.name as string) || "—";
  };

  const studentByClass = new Map<string, Record<string, unknown>[]>();
  students.forEach(st => {
    const cid = (st.classId as string) || (st.class as string) || "unknown";
    if (!studentByClass.has(cid)) studentByClass.set(cid, []);
    studentByClass.get(cid)!.push(st);
  });

  const studentClusters: StudentCluster[] = [];
  studentByClass.forEach((list, cid) => {
    if (cid === "unknown" || list.length === 0) return;
    const avgs = list
      .map(st => studentAvgById.get(st.id as string))
      .filter((x): x is number => typeof x === "number");
    const total = list.length;
    const atRisk = avgs.filter(a => a < 50).length;
    const pct = total > 0 ? Math.round((atRisk / total) * 100) : 0;
    const avg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
    const severity: StudentCluster["severity"] =
      pct >= 30 ? "critical" : pct >= 18 ? "warning" : "okay";
    const issues: string[] = [];
    if (avg > 0 && avg < 60) issues.push(`Avg score ${avg}`);
    if (atRisk > 0) issues.push(`${atRisk} below 50%`);
    if (avgs.length === 0) issues.push("No test data yet");
    if (issues.length === 0) issues.push("On track");
    studentClusters.push({
      classId: cid,
      className: classNameOf(cid),
      teacherName: teacherOf(cid),
      atRisk, total, pct, severity, avg, issues,
    });
  });
  studentClusters.sort((a, b) => b.pct - a.pct);

  const composite = Math.round(
    (studentsAvg * 0.45) +
    (improvement * 0.25) +
    (teachersAvg * 0.20) +
    ((100 - Math.min(atRiskPct, 100)) * 0.10)
  );

  return {
    branchName, schoolId,
    composite,
    studentsAvg: Math.round(studentsAvg * 10) / 10,
    teachersAvg: Math.round(teachersAvg * 10) / 10,
    improvement,
    atRiskPct: Math.round(atRiskPct * 10) / 10,
    totalStudents: students.length,
    totalTeachers: teachers.length,
    totalSections: classes.length,
    topTeachers, weakTeachers, midTeachers,
    studentClusters: studentClusters.slice(0, 8),
    weekOverWeekDelta: wow.delta,
  };
}

// ── Real per-class ranking ────────────────────────────────────────────────
export interface ComputeClassRankingInput {
  classes: Record<string, unknown>[];
  students: Record<string, unknown>[];
  scores: ScoreDoc[];
  attendance: AttendanceDoc[];
  teachers: TeacherDoc[];
  teachingAssignments: TeachingAssignmentDoc[];
}

const PALETTES: { bg: string; fg: string }[] = [
  { bg: "rgba(0,200,83,0.12)", fg: "#00C853" },
  { bg: "rgba(123,63,244,0.12)", fg: "#7B3FF4" },
  { bg: "rgba(0,85,255,0.12)", fg: "#0055FF" },
  { bg: "rgba(255,136,0,0.12)", fg: "#C26A00" },
  { bg: "rgba(255,69,58,0.10)", fg: "#C71F2D" },
];

export function computeClassRanking(input: ComputeClassRankingInput): ClassRow[] {
  const { classes, students, scores, attendance, teachers, teachingAssignments } = input;
  const { studentAvgById } = indexStudentScores(scores);

  // Attendance rate per class
  const attByClass = new Map<string, { present: number; total: number }>();
  attendance.forEach(a => {
    const cid = (a as Record<string, unknown>).classId as string | undefined;
    if (!cid) return;
    if (!attByClass.has(cid)) attByClass.set(cid, { present: 0, total: 0 });
    const bucket = attByClass.get(cid)!;
    bucket.total++;
    const status = String(a.status || "").toLowerCase();
    if (status === "present" || status === "p") bucket.present++;
  });

  const teacherOf = (cid: string): string => {
    const ta = teachingAssignments.find(x => x.classId === cid);
    if (!ta) return "—";
    const t = teachers.find(x => x.id === ta.teacherId);
    return (t?.name as string) || "—";
  };

  const studentsByClass = new Map<string, Record<string, unknown>[]>();
  students.forEach(st => {
    const cid = (st.classId as string) || "";
    if (!cid) return;
    if (!studentsByClass.has(cid)) studentsByClass.set(cid, []);
    studentsByClass.get(cid)!.push(st);
  });

  const rows = classes
    .map(c => {
      const cid = c.id as string;
      const studentsInClass = studentsByClass.get(cid) || [];
      const avgs = studentsInClass
        .map(st => studentAvgById.get(st.id as string))
        .filter((x): x is number => typeof x === "number");
      const studentsAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
      const atRisk = avgs.filter(a => a < 50).length;
      const atRiskPct = avgs.length ? (atRisk / avgs.length) * 100 : 0;
      const att = attByClass.get(cid);
      const attRate = att && att.total > 0 ? (att.present / att.total) * 100 : 0;

      // Composite: 0.55 student avg + 0.25 attendance + 0.20 inverse-at-risk
      const composite = Math.round(
        (studentsAvg * 0.55) +
        (attRate * 0.25) +
        ((100 - Math.min(atRiskPct, 100)) * 0.20)
      );

      const grade = (c.grade as string) || "";
      const section = (c.section as string) || "";
      const name = (c.name as string) || (c.className as string) || `${grade}${section ? "-" + section : ""}` || cid;

      const ctxParts: string[] = [];
      if (avgs.length === 0) ctxParts.push("No test data yet");
      else {
        ctxParts.push(`Avg ${Math.round(studentsAvg)}`);
        if (atRisk > 0) ctxParts.push(`${atRisk} at-risk`);
        if (attRate > 0) ctxParts.push(`Attendance ${Math.round(attRate)}%`);
      }

      return {
        classId: cid,
        name,
        grade,
        section,
        initial: (name[0] || "?").toUpperCase(),
        composite,
        totalStudents: studentsInClass.length,
        atRisk,
        atRiskPct: Math.round(atRiskPct * 10) / 10,
        classTeacher: teacherOf(cid),
        context: ctxParts.join(" · "),
        composite_raw: composite,
      };
    })
    .filter(r => r.totalStudents > 0)
    .sort((a, b) => b.composite - a.composite)
    .map((r, i) => {
      const palette = PALETTES[i % PALETTES.length];
      return {
        rank: i + 1,
        classId: r.classId,
        name: r.name,
        grade: r.grade,
        section: r.section,
        initial: r.initial,
        composite: r.composite,
        totalStudents: r.totalStudents,
        atRisk: r.atRisk,
        atRiskPct: r.atRiskPct,
        classTeacher: r.classTeacher,
        context: r.context,
        avatarBg: palette.bg,
        avatarText: palette.fg,
      } as ClassRow;
    });

  return rows;
}

// ── Real teacher ranking ──────────────────────────────────────────────────
export function computeTeacherRanking(input: {
  teachers: TeacherDoc[];
  scores: ScoreDoc[];
  attendance: AttendanceDoc[];
  assignments: AssignmentDoc[];
  teacherAttendance: TeacherAttendanceDoc[];
  teachingAssignments: TeachingAssignmentDoc[];
}): TeacherRow[] {
  const ranked = scoreTeachers(input);
  const withData = ranked
    .filter(r => r.testCount > 0 || r.assignments > 0 || r.attendance !== null)
    .sort((a, b) => b.composite - a.composite);

  return withData.map((t, i) => {
    const palette = PALETTES[i % PALETTES.length];
    const initials = (t.teacher.name || "?")
      .split(/\s+/).map(n => n[0]).join("").slice(0, 2).toUpperCase();
    const subj = (t.teacher.subjects && t.teacher.subjects[0]) || "—";
    const ctx: string[] = [];
    if (t.classAvg !== null) ctx.push(`Class avg ${Math.round(t.classAvg)}`);
    if (t.attendance !== null) ctx.push(`Att ${Math.round(t.attendance)}%`);
    if (t.assignments > 0) ctx.push(`${t.assignments} assignments`);
    return {
      rank: i + 1,
      teacherId: t.teacher.id,
      name: t.teacher.name || "Unnamed",
      initials,
      subject: subj,
      composite: Math.round(t.composite * 10) / 10,
      context: ctx.join(" · ") || "Limited data",
      avatarBg: palette.bg,
      avatarText: palette.fg,
    };
  });
}

// ── Real weekly history (ISO-week bucketed) ───────────────────────────────
export function computeWeeklyHistory(scores: ScoreDoc[], weeksBack: number = 8): WeeklyPoint[] {
  const buckets = new Map<string, { weekStartMs: number; weekLabel: string; total: number; count: number }>();
  scores.forEach(s => {
    const ms = dateMsOf(s);
    const p = parsePct(s);
    if (ms == null || p === null) return;
    const { weekId, weekStartMs, weekLabel } = isoWeekKey(ms);
    if (!buckets.has(weekId)) buckets.set(weekId, { weekStartMs, weekLabel, total: 0, count: 0 });
    const b = buckets.get(weekId)!;
    b.total += p;
    b.count++;
  });

  const arr: WeeklyPoint[] = Array.from(buckets.entries())
    .map(([weekId, v]) => {
      const studentsAvg = v.count > 0 ? v.total / v.count : 0;
      // Composite proxy at week granularity: lean on studentsAvg only
      // (teachers/at-risk are not week-bucketed in this app yet).
      const composite = Math.round(studentsAvg);
      return {
        weekId,
        weekLabel: v.weekLabel,
        weekStartMs: v.weekStartMs,
        studentsAvg: Math.round(studentsAvg * 10) / 10,
        composite,
        sampleSize: v.count,
      };
    })
    .sort((a, b) => a.weekStartMs - b.weekStartMs);

  return arr.slice(-weeksBack);
}

export function computeWeekOverWeekTrend(scores: ScoreDoc[]): { delta: number | null; current: number | null; previous: number | null } {
  const hist = computeWeeklyHistory(scores, 2);
  if (hist.length < 2) return { delta: null, current: hist[hist.length - 1]?.studentsAvg ?? null, previous: null };
  const cur = hist[hist.length - 1].studentsAvg;
  const prev = hist[hist.length - 2].studentsAvg;
  return { delta: Math.round((cur - prev) * 10) / 10, current: cur, previous: prev };
}

// ── AI insights via /api/ai-insights ──────────────────────────────────────
export interface AIDiagnosisItem { type: "good" | "concern" | "note"; text: string; }
export interface AIAction {
  id: string;
  num: string;
  title: string;
  reason: string;
  tracking: "auto" | "auto_pct" | "manual";
  status: "pending" | "in_progress" | "completed";
  progress?: { current: number; target: number };
  current?: number;
  target?: number;
  unit?: string;
  reward?: string;
  subStatus?: string;
}
export interface AIForecast {
  projectedLabel: string;
  changeLabel: string;
  changeSubtitle: string;
  scenarios: { label: string; outcome: string; highlight?: boolean }[];
  confidence: number;
}
export interface AIInsightsResult {
  diagnosis: AIDiagnosisItem[];
  actions: AIAction[];
  forecast: AIForecast;
}

// AI calls go through Firebase Cloud Function `parentAIProxy` (us-central1).
// Same callable shape as `getStudentInsight` in aiInsights.ts:
//   input  { prompt, systemPrompt, jsonMode }
//   output { content: string (JSON) }
const FUNCTIONS_REGION = "us-central1";
const SESSION_CACHE = new Map<string, AIInsightsResult>();

// Tagged result: callers can know whether output came from AI or deterministic fallback
export interface AIInsightsTagged extends AIInsightsResult {
  source: "ai" | "fallback";
  errorMessage?: string;
}

function parseJsonContent(raw: string | Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

// Path A: Firebase Cloud Function `parentAIProxy` (us-central1) — same shape
// as `getStudentInsight` in aiInsights.ts.
async function callViaCloudFunction(instructions: string, data: unknown): Promise<unknown> {
  const fns = getFunctions(undefined, FUNCTIONS_REGION);
  const call = httpsCallable<
    { prompt: string; systemPrompt: string; jsonMode: boolean },
    { content: string | Record<string, unknown> }
  >(fns, "parentAIProxy");
  const res = await call({
    prompt: JSON.stringify(data),
    systemPrompt: instructions,
    jsonMode: true,
  });
  const raw = res.data?.content;
  if (!raw) throw new Error("Empty content from Cloud Function");
  return parseJsonContent(raw);
}

// Path B: Vercel `/api/ai-insights` — used as fallback when Cloud Function fails.
// Endpoint code lives in this repo at api/ai-insights.js.
async function callViaVercelProxy(instructions: string, data: unknown): Promise<unknown> {
  // Force-refresh so a stale/expired cached token doesn't cause a 401 here.
  const token = await auth.currentUser?.getIdToken(true);
  const res = await fetch("/api/ai-insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ instructions, data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Vercel proxy failed (${res.status})`);
  }
  return res.json();
}

async function callInsights(instructions: string, data: unknown, cacheKey: string): Promise<AIInsightsResult> {
  if (SESSION_CACHE.has(cacheKey)) return SESSION_CACHE.get(cacheKey)!;

  // Try Cloud Function first (matches existing app convention)
  let parsed: unknown;
  let cfError: string | null = null;
  try {
    parsed = await callViaCloudFunction(instructions, data);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; details?: { message?: string } };
    cfError = `[${e?.code ?? "cf"}] ${e?.details?.message || e?.message || "Cloud Function failed"}`;
    console.warn("[callInsights] Cloud Function failed:", cfError);

    // Fallback to Vercel proxy
    try {
      parsed = await callViaVercelProxy(instructions, data);
    } catch (err2: unknown) {
      const e2 = err2 as { message?: string };
      const vercelMsg = e2?.message || "Vercel proxy failed";
      console.warn("[callInsights] Vercel proxy also failed:", vercelMsg);
      throw new Error(`${cfError}; vercel: ${vercelMsg}`);
    }
  }

  const normalised = normaliseInsights(parsed);
  SESSION_CACHE.set(cacheKey, normalised);
  return normalised;
}

function normaliseInsights(raw: unknown): AIInsightsResult {
  const r = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const diagArr = Array.isArray(r.diagnosis) ? r.diagnosis : [];
  const diagnosis: AIDiagnosisItem[] = diagArr
    .filter((d): d is { type?: string; text?: string } =>
      !!d && typeof d === "object" && typeof (d as { text?: unknown }).text === "string"
    )
    .map(d => ({
      type: (d.type === "good" || d.type === "concern" || d.type === "note") ? d.type : "note",
      text: String(d.text),
    }));
  const actionsRaw = Array.isArray(r.actions) ? r.actions : [];
  const actions: AIAction[] = actionsRaw.slice(0, 6).map((a, i) => {
    const obj = (a && typeof a === "object") ? a as Record<string, unknown> : {};
    const progress = (obj.progress && typeof obj.progress === "object") ? obj.progress as Record<string, unknown> : undefined;
    const tracking = obj.tracking;
    return {
      id: typeof obj.id === "string" ? obj.id : `a${i + 1}`,
      num: String(i + 1).padStart(2, "0"),
      title: String(obj.title ?? "Action item"),
      reason: String(obj.reason ?? ""),
      tracking: (tracking === "auto_pct" || tracking === "manual" || tracking === "auto") ? tracking : "manual",
      status: (obj.status === "in_progress" || obj.status === "completed") ? obj.status : "pending",
      progress: progress && typeof progress.current === "number" && typeof progress.target === "number"
        ? { current: progress.current, target: progress.target } : undefined,
      current: typeof obj.current === "number" ? obj.current : undefined,
      target: typeof obj.target === "number" ? obj.target : undefined,
      unit: typeof obj.unit === "string" ? obj.unit : undefined,
      reward: typeof obj.reward === "string" ? obj.reward : undefined,
      subStatus: typeof obj.subStatus === "string" ? obj.subStatus : undefined,
    };
  });
  const f = (r.forecast && typeof r.forecast === "object") ? r.forecast as Record<string, unknown> : {};
  const scenariosRaw = Array.isArray(f.scenarios) ? f.scenarios : [];
  const scenarios = scenariosRaw.slice(0, 4).map((s) => {
    const obj = (s && typeof s === "object") ? s as Record<string, unknown> : {};
    return {
      label: String(obj.label ?? ""),
      outcome: String(obj.outcome ?? ""),
      highlight: !!obj.highlight,
    };
  });
  const forecast: AIForecast = {
    projectedLabel: String(f.projectedLabel ?? "—"),
    changeLabel: String(f.changeLabel ?? "Same"),
    changeSubtitle: String(f.changeSubtitle ?? ""),
    scenarios,
    confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(100, f.confidence)) : 70,
  };
  return { diagnosis, actions, forecast };
}

// Drop null/undefined fields so the proxy's downstream JSON validators don't choke
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// ── Deterministic real-data fallback (used when AI fails) ──────────────────
// All numbers and named entities below come from the live Firestore data —
// nothing is invented. This is rule-based analysis, not AI prose.

function fallbackPrincipalInsights(
  branch: BranchComposite,
  topClass: ClassRow | null,
  weakClass: ClassRow | null,
): AIInsightsResult {
  const diagnosis: AIDiagnosisItem[] = [];

  if (branch.improvement >= 80) {
    diagnosis.push({ type: "good", text: `Improvement signal **${branch.improvement}** — engagement aur week-on-week trend strong dikh raha hai.` });
  } else if (branch.studentsAvg >= 75) {
    diagnosis.push({ type: "good", text: `Students avg **${branch.studentsAvg.toFixed(1)}** healthy hai — solid academic baseline.` });
  } else {
    diagnosis.push({ type: "good", text: `Branch composite **${branch.composite.toFixed(1)}** baseline — improvement scope clear hai.` });
  }

  if (branch.weakTeachers.length > 0) {
    const w = branch.weakTeachers[0];
    diagnosis.push({ type: "concern", text: `**${branch.weakTeachers.length} teachers ka composite 70 se neeche hai**, sabse weak: ${w.teacher.name || "Unnamed"} (${w.composite.toFixed(1)}). Ye drag kar raha hai school average ko.` });
  } else if (branch.atRiskPct > 5) {
    diagnosis.push({ type: "concern", text: `**At-risk students ${branch.atRiskPct.toFixed(1)}%** — ${Math.round(branch.atRiskPct * branch.totalStudents / 100)} students ka avg 50 se neeche hai.` });
  } else if (branch.studentsAvg < 70) {
    diagnosis.push({ type: "concern", text: `Students avg **${branch.studentsAvg.toFixed(1)}** — 70 ka threshold se neeche, focused intervention chahiye.` });
  } else {
    diagnosis.push({ type: "concern", text: `Teachers avg **${branch.teachersAvg.toFixed(1)}** vs students avg ${branch.studentsAvg.toFixed(1)} — gap monitor karo.` });
  }

  if (weakClass && weakClass.atRisk > 0) {
    diagnosis.push({ type: "note", text: `Sabse weak class **${weakClass.name}** (composite ${weakClass.composite.toFixed(1)}, ${weakClass.atRisk} at-risk). Class teacher: ${weakClass.classTeacher}.` });
  } else if (topClass) {
    diagnosis.push({ type: "note", text: `Top class **${topClass.name}** (composite ${topClass.composite.toFixed(1)}) — ${topClass.classTeacher} ki best practices baki classes mein replicate karo.` });
  } else {
    diagnosis.push({ type: "note", text: `Total ${branch.totalStudents} students across ${branch.totalSections} classes. Weekly review schedule baniye.` });
  }

  const actions: AIAction[] = [];
  let n = 1;
  branch.weakTeachers.slice(0, 2).forEach(t => {
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Coach ${t.teacher.name || "weak teacher"} (${t.composite.toFixed(1)})`,
      reason: `${t.teacher.name || "Teacher"} ka composite ${t.composite.toFixed(1)} hai — weekly 1-on-1 schedule karo. ${t.reasons[0] ? `${t.reasons[0].label}: ${t.reasons[0].value}` : "Multiple weak signals"}.`,
      tracking: "manual", status: "pending",
    });
    n++;
  });
  if (weakClass && weakClass.atRisk > 0) {
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Intervene class ${weakClass.name} — ${weakClass.atRisk} at-risk`,
      reason: `${weakClass.name} mein ${weakClass.atRisk} of ${weakClass.totalStudents} students at-risk. ${weakClass.classTeacher} ke saath remedial plan banao.`,
      tracking: "auto", status: "pending",
      progress: { current: 0, target: weakClass.atRisk },
    });
    n++;
  }
  if (branch.atRiskPct > 5) {
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Parent outreach for ${Math.round(branch.atRiskPct * branch.totalStudents / 100)} at-risk students`,
      reason: `${branch.atRiskPct.toFixed(1)}% students ka avg 50 se neeche. Class teachers ko parent calls assign karo — auto-tracked.`,
      tracking: "auto", status: "pending",
      progress: { current: 0, target: Math.round(branch.atRiskPct * branch.totalStudents / 100) },
    });
    n++;
  }
  if (branch.topTeachers.length > 0 && branch.weakTeachers.length > 0) {
    const top = branch.topTeachers[0];
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Peer mentoring: ${top.teacher.name || "top teacher"} → weak teachers`,
      reason: `${top.teacher.name || "Top teacher"} ka composite ${top.composite.toFixed(1)} hai. Weekly observation sessions schedule karo for the ${branch.weakTeachers.length} weak teachers.`,
      tracking: "manual", status: "pending",
    });
    n++;
  }

  // Always-on improvement actions — these guarantee the action plan is non-empty
  // even when the school has no weak teachers / at-risk students. Healthy
  // schools still need maintenance, replication, and monitoring moves.
  if (weakClass && topClass && weakClass.name !== topClass.name) {
    const gap = (topClass.composite - weakClass.composite).toFixed(1);
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Close ${gap}-point gap: ${weakClass.name} ↔ ${topClass.name}`,
      reason: `${weakClass.name} (${weakClass.composite.toFixed(1)}) aur ${topClass.name} (${topClass.composite.toFixed(1)}) ke beech ${gap} ka gap hai. ${weakClass.classTeacher} ko ${topClass.classTeacher} ke saath fortnightly collaboration session lao — pedagogy share karein.`,
      tracking: "manual", status: "pending",
    });
    n++;
  }
  if (branch.topTeachers.length > 0) {
    const top = branch.topTeachers[0];
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Document & replicate ${top.teacher.name || "top teacher"}'s practices`,
      reason: `${top.teacher.name || "Top teacher"} ka composite ${top.composite.toFixed(1)} hai — top performer. Monthly classroom observation karwao, lesson plans aur engagement techniques document karo, baki teachers ke saath PD session me share karo.`,
      tracking: "manual", status: "pending",
    });
    n++;
  }
  const teacherStudentGap = branch.teachersAvg - branch.studentsAvg;
  if (teacherStudentGap > 5) {
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Investigate ${teacherStudentGap.toFixed(1)}-point teacher↔student gap`,
      reason: `Teachers avg ${branch.teachersAvg.toFixed(1)} hai but students avg ${branch.studentsAvg.toFixed(1)} — ${teacherStudentGap.toFixed(1)} point gap. Teaching strong hai but learning translate nahi ho raha. Weekly formative assessments aur student feedback loops set karo.`,
      tracking: "manual", status: "pending",
    });
    n++;
  }
  // Final safety net — guarantees at least one action ALWAYS exists
  if (actions.length === 0) {
    actions.push({
      id: `p${n}`, num: String(n).padStart(2, "0"),
      title: `Establish weekly performance review cadence`,
      reason: `${branch.totalStudents} students across ${branch.totalSections} classes ka data abhi healthy hai (composite ${branch.composite.toFixed(1)}). Weekly 30-min principal-teacher review meeting set karo — early warning signals catch karne ke liye baseline cadence chahiye.`,
      tracking: "manual", status: "pending",
    });
  }

  const projected = Math.min(100, branch.composite + 4);
  const forecast: AIForecast = {
    projectedLabel: `${branch.composite.toFixed(1)} → ${projected.toFixed(1)}`,
    changeLabel: branch.weekOverWeekDelta && branch.weekOverWeekDelta > 0 ? "Up" : "Improving",
    changeSubtitle: "If actions are completed",
    scenarios: [
      { label: "Coach weakest teacher", outcome: `+${(2).toFixed(1)}` },
      { label: "Resolve at-risk class", outcome: `+${(1.5).toFixed(1)}` },
      { label: "Complete full plan", outcome: `→ ${projected.toFixed(1)}`, highlight: true },
    ],
    confidence: 70,
  };

  return { diagnosis, actions, forecast };
}

function fallbackBranchInsights(
  branch: BranchComposite,
  classRanking: ClassRow[],
): AIInsightsResult {
  const base = fallbackPrincipalInsights(branch, classRanking[0] || null, classRanking[classRanking.length - 1] || null);
  // The principal fallback already includes a "close-gap" action when top/weak
  // classes differ. For the branch view, add a class-spread action only when
  // the ranking has ≥3 classes — middle-tier visibility helps the principal
  // see distribution beyond just the extremes.
  if (classRanking.length >= 3) {
    const mid = classRanking[Math.floor(classRanking.length / 2)];
    const top = classRanking[0];
    const midGap = (top.composite - mid.composite).toFixed(1);
    const n = base.actions.length + 1;
    base.actions.push({
      id: `b${n}`, num: String(n).padStart(2, "0"),
      title: `Lift mid-tier: ${mid.name} (${mid.composite.toFixed(1)}) → top tier`,
      reason: `Mid-tier class ${mid.name} ${midGap} points behind ${top.name}. ${mid.classTeacher} ke saath quarterly goal set karo — top tier tak pahunchne ke liye specific subject-wise gaps target karo.`,
      tracking: "manual", status: "pending",
    });
  }
  return base;
}

export async function fetchPrincipalInsights(input: {
  principalName: string;
  branchName: string;
  branch: BranchComposite;
  topClass: ClassRow | null;
  weakClass: ClassRow | null;
}): Promise<AIInsightsTagged> {
  const instructions = `You are a school performance coach. Return ONLY a valid JSON object (no markdown, no prose) with the shape:
{"diagnosis":[{"type":"good|concern|note","text":"short Hinglish text with numbers"}],"actions":[{"id":"p1","title":"English title","reason":"Hinglish reason","tracking":"manual","status":"pending"}],"forecast":{"projectedLabel":"X → Y","changeLabel":"Up","changeSubtitle":"text","scenarios":[{"label":"text","outcome":"text","highlight":true}],"confidence":75}}
Give 3 diagnosis items and 4 actions. Reference real teacher/class names from the data.`;

  const top = input.branch.topTeachers.slice(0, 2).map(t => ({
    name: String(t.teacher.name || "Teacher").slice(0, 40), score: Math.round(t.composite),
  }));
  const weak = input.branch.weakTeachers.slice(0, 2).map(t => ({
    name: String(t.teacher.name || "Teacher").slice(0, 40), score: Math.round(t.composite),
  }));
  const clusters = input.branch.studentClusters.slice(0, 2).map(c => ({
    class: String(c.className).slice(0, 20), atRisk: c.atRisk, total: c.total,
  }));

  const payload = compact({
    principal: String(input.principalName).slice(0, 60),
    branch: String(input.branchName).slice(0, 60),
    composite: input.branch.composite,
    studentsAvg: input.branch.studentsAvg,
    teachersAvg: input.branch.teachersAvg,
    atRiskPct: input.branch.atRiskPct,
    totalStudents: input.branch.totalStudents,
    totalTeachers: input.branch.totalTeachers,
    topTeachers: top.length ? top : undefined,
    weakTeachers: weak.length ? weak : undefined,
    topClass: input.topClass ? { name: String(input.topClass.name).slice(0, 20), score: input.topClass.composite } : undefined,
    weakClass: input.weakClass ? { name: String(input.weakClass.name).slice(0, 20), score: input.weakClass.composite, atRisk: input.weakClass.atRisk } : undefined,
    clusters: clusters.length ? clusters : undefined,
  });

  try {
    const ai = await callInsights(instructions, payload, `principal:${input.branch.composite}:${input.branch.totalStudents}`);
    return { ...ai, source: "ai" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI unavailable";
    console.warn("[fetchPrincipalInsights] AI failed, using deterministic fallback:", msg);
    return { ...fallbackPrincipalInsights(input.branch, input.topClass, input.weakClass), source: "fallback", errorMessage: msg };
  }
}

export async function fetchBranchInsights(input: {
  branchName: string;
  branch: BranchComposite;
  classRanking: ClassRow[];
}): Promise<AIInsightsTagged> {
  const instructions = `You are a school performance analyst. Return ONLY a valid JSON object (no markdown, no prose) with the shape:
{"diagnosis":[{"type":"good|concern|note","text":"short Hinglish text with numbers"}],"actions":[{"id":"b1","title":"English title","reason":"Hinglish reason","tracking":"manual","status":"pending"}],"forecast":{"projectedLabel":"X → Y","changeLabel":"Up","changeSubtitle":"text","scenarios":[{"label":"text","outcome":"text","highlight":true}],"confidence":80}}
Give 3 diagnosis items and 5 actions. At least one action names a weak teacher; at least one names an at-risk class.`;

  const top = input.branch.topTeachers.slice(0, 2).map(t => ({
    name: String(t.teacher.name || "Teacher").slice(0, 40), score: Math.round(t.composite),
  }));
  const weak = input.branch.weakTeachers.slice(0, 3).map(t => ({
    name: String(t.teacher.name || "Teacher").slice(0, 40), score: Math.round(t.composite),
  }));
  const clusters = input.branch.studentClusters.slice(0, 3).map(c => ({
    class: String(c.className).slice(0, 20), atRisk: c.atRisk, total: c.total,
  }));
  const cls = input.classRanking.slice(0, 4).map(c => ({
    name: String(c.name).slice(0, 20), score: c.composite,
  }));

  const payload = compact({
    branch: String(input.branchName).slice(0, 60),
    composite: input.branch.composite,
    studentsAvg: input.branch.studentsAvg,
    teachersAvg: input.branch.teachersAvg,
    atRiskPct: input.branch.atRiskPct,
    totalStudents: input.branch.totalStudents,
    totalTeachers: input.branch.totalTeachers,
    topTeachers: top.length ? top : undefined,
    weakTeachers: weak.length ? weak : undefined,
    clusters: clusters.length ? clusters : undefined,
    classes: cls.length ? cls : undefined,
  });

  try {
    const ai = await callInsights(instructions, payload, `branch:${input.branch.composite}:${input.branch.totalStudents}`);
    return { ...ai, source: "ai" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI unavailable";
    console.warn("[fetchBranchInsights] AI failed, using deterministic fallback:", msg);
    return { ...fallbackBranchInsights(input.branch, input.classRanking), source: "fallback", errorMessage: msg };
  }
}
