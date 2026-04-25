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

const SESSION_CACHE = new Map<string, AIInsightsResult>();

async function callInsights(instructions: string, data: unknown, cacheKey: string): Promise<AIInsightsResult> {
  if (SESSION_CACHE.has(cacheKey)) return SESSION_CACHE.get(cacheKey)!;
  const token = await auth.currentUser?.getIdToken();
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
    throw new Error((err as { error?: string }).error || `AI proxy failed (${res.status})`);
  }
  const raw = await res.json();
  const normalised = normaliseInsights(raw);
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

export async function fetchPrincipalInsights(input: {
  principalName: string;
  branchName: string;
  branch: BranchComposite;
  topClass: ClassRow | null;
  weakClass: ClassRow | null;
}): Promise<AIInsightsResult> {
  const instructions = `You are a senior K-12 school performance coach. Analyze the principal's school data and explain in Hinglish (natural Hindi-English mix) WHY the school is at its current composite, then provide SPECIFIC actions the principal can take.

Respond ONLY in valid JSON with the schema below. Mix Hindi and English naturally in diagnosis and action reason fields. Keep action titles in English. Reference SPECIFIC numbers and named entities (real teacher names, real class names) in every diagnosis bullet. Never give generic advice.

{
  "diagnosis": [
    { "type": "good" | "concern" | "note", "text": "Hinglish diagnosis with specific numbers" }
  ],
  "actions": [
    {
      "id": "p1",
      "title": "English action title",
      "reason": "Hinglish reason citing specific data and a named teacher or class",
      "tracking": "auto" | "auto_pct" | "manual",
      "status": "pending" | "in_progress",
      "progress": { "current": 0, "target": 6 }
    }
  ],
  "forecast": {
    "projectedLabel": "82.4 → 87.5",
    "changeLabel": "Up",
    "changeSubtitle": "If the action plan is implemented",
    "scenarios": [{ "label": "Coach 3 weak teachers", "outcome": "+2.4", "highlight": false }],
    "confidence": 75
  }
}

Generate 3 diagnosis bullets (one good, one concern, one note) and 4-5 actions.`;

  const payload = {
    principal: { name: input.principalName, branch: input.branchName },
    branchMetrics: {
      composite: input.branch.composite,
      studentsAvg: input.branch.studentsAvg,
      teachersAvg: input.branch.teachersAvg,
      improvement: input.branch.improvement,
      atRiskPct: input.branch.atRiskPct,
      totalStudents: input.branch.totalStudents,
      totalTeachers: input.branch.totalTeachers,
      weekOverWeekDelta: input.branch.weekOverWeekDelta,
    },
    topTeachers: input.branch.topTeachers.map(t => ({
      name: t.teacher.name, subjects: t.teacher.subjects, composite: t.composite,
    })),
    weakTeachers: input.branch.weakTeachers.map(t => ({
      name: t.teacher.name, subjects: t.teacher.subjects, composite: t.composite,
      issues: t.reasons.map(r => `${r.label} ${r.value}`).join(" · "),
    })),
    topClass: input.topClass ? { name: input.topClass.name, composite: input.topClass.composite, classTeacher: input.topClass.classTeacher } : null,
    weakClass: input.weakClass ? { name: input.weakClass.name, composite: input.weakClass.composite, classTeacher: input.weakClass.classTeacher, atRisk: input.weakClass.atRisk } : null,
    studentClusters: input.branch.studentClusters,
  };

  return callInsights(instructions, payload, `principal:${input.principalName}:${input.branch.composite}:${input.branch.totalStudents}`);
}

export async function fetchBranchInsights(input: {
  branchName: string;
  branch: BranchComposite;
  classRanking: ClassRow[];
}): Promise<AIInsightsResult> {
  const instructions = `You are a school branch performance analyst. Generate a brutally honest diagnosis of WHY this school is at its current composite, and provide SPECIFIC interventions naming the actual teachers and classes from the data.

Respond ONLY in valid JSON. Use Hinglish in diagnosis text and action reason fields. Keep action titles in English. Every diagnosis bullet and action reason MUST cite specific numbers and named entities from the data. At least one action must name a specific weak teacher; at least one must address a specific at-risk class.

{
  "diagnosis": [
    { "type": "good" | "concern" | "note", "text": "Hinglish diagnosis citing teacher names + numbers" }
  ],
  "actions": [
    {
      "id": "b1",
      "title": "English action naming a specific teacher or class",
      "reason": "Hinglish reason citing exact data",
      "tracking": "auto" | "auto_pct" | "manual",
      "status": "pending" | "in_progress",
      "progress": { "current": 0, "target": 6 }
    }
  ],
  "forecast": {
    "projectedLabel": "+5.4",
    "changeLabel": "Composite uplift",
    "changeSubtitle": "Branch score: 79.8 → 85.2",
    "scenarios": [{ "label": "Coach weak teachers", "outcome": "+3.2", "highlight": false }],
    "confidence": 80
  }
}

Generate 3 diagnosis bullets and 5-6 actions.`;

  const payload = {
    branch: {
      name: input.branchName,
      composite: input.branch.composite,
      studentsAvg: input.branch.studentsAvg,
      teachersAvg: input.branch.teachersAvg,
      improvement: input.branch.improvement,
      atRiskPct: input.branch.atRiskPct,
      totalStudents: input.branch.totalStudents,
      totalTeachers: input.branch.totalTeachers,
      totalSections: input.branch.totalSections,
      weekOverWeekDelta: input.branch.weekOverWeekDelta,
    },
    topTeachers: input.branch.topTeachers.map(t => ({
      name: t.teacher.name, subjects: t.teacher.subjects, composite: t.composite,
    })),
    weakTeachers: input.branch.weakTeachers.map(t => ({
      name: t.teacher.name, subjects: t.teacher.subjects, composite: t.composite,
      classAvg: t.classAvg, passRate: t.passRate, attendance: t.attendance,
      assignments: t.assignments, punctuality: t.punctuality,
      issues: t.reasons.map(r => `${r.label} ${r.value}`).join(" · "),
    })),
    studentClusters: input.branch.studentClusters,
    classRanking: input.classRanking.slice(0, 12).map(c => ({
      name: c.name, composite: c.composite, totalStudents: c.totalStudents,
      atRisk: c.atRisk, classTeacher: c.classTeacher,
    })),
  };

  return callInsights(instructions, payload, `branch:${input.branchName}:${input.branch.composite}:${input.branch.totalStudents}`);
}
