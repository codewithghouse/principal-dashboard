/**
 * leaderboardData.ts — pure aggregation layer for the Principal Leaderboards page.
 *
 * Computes composite scores + week-over-week trends for FOUR leaderboards
 * (branches, principals, teachers, students) from raw Firestore docs.
 *
 * No React, no Firestore reads here — caller wires up live snapshots and feeds
 * raw arrays in. Output is render-ready.
 *
 * Scoring model:
 *   • Teacher composite — reuses teacherScorer.ts (35/20/20/15/10 weighting).
 *   • Student composite — 60% avg score + 30% attendance + 10% pass-rate, with
 *     missing-signal renormalization (same pattern as teacherScorer).
 *   • Branch composite  — 50% mean(teacher composites) + 40% mean(student
 *     composites) + 10% (1 − atRiskRate). Renormalized if any signal is empty.
 *   • Principal composite — 90% own branch composite + 10% activity (recent
 *     lastActive bumps it). Single-branch principals collapse to branch score.
 *   • Week change — composites are computed twice: once from the last 7 days
 *     and once from days 8–14. Δ = current − previous (clamped to [−10, 10]).
 */

import {
  TeacherDoc, ScoreDoc, AttendanceDoc, AssignmentDoc, TeacherAttendanceDoc,
  scoreTeachers, TeacherScore,
} from "./teacherScorer";

// ── Types ──────────────────────────────────────────────────────────────────
/** Branch master record from `schools/{schoolId}/branches/{branchId}` subcollection. */
export interface BranchDoc {
  id: string;
  branchId?: string;
  name?: string;
  schoolName?: string;
  city?: string;
  location?: string;
  address?: string;
  color?: string;
}

export interface PrincipalDoc {
  id: string;
  name?: string;
  email?: string;
  schoolId?: string;
  branchId?: string;
  branchName?: string;
  branchCity?: string;
  status?: string;
  lastActive?: any;
  [key: string]: any;
}

export interface StudentDoc {
  id: string;
  name?: string;
  studentName?: string;
  schoolId?: string;
  branchId?: string;
  classId?: string;
  className?: string;
  rollNo?: string;
  [key: string]: any;
}

// Per-branch enrichment used by the AI prompt + fallback insights so the
// AI can cite SPECIFIC teachers / subjects instead of generic advice.
// All optional — populated only when the branch has at least 1 scored
// teacher in the active window.
export interface BranchTeacherSlim { name: string; composite: number; subject?: string; }
export interface BranchSubjectSlim { subject: string; avg: number; }

export interface BranchRow {
  rank: number;
  id: string;
  name: string;
  city: string;
  initial: string;
  students: number;
  teachers: number;
  composite: number;
  weekChange: number;
  trend: "up" | "down" | "same";
  avatarBg: string;
  avatarColor: string;
  isMyBranch: boolean;
  atRisk: number;
  teacherAvg: number;
  studentAvg: number;
  // Enrichment for AI grounding (always present, may be empty arrays)
  topTeachers: BranchTeacherSlim[];
  weakTeachers: BranchTeacherSlim[];
  subjectStrengths: BranchSubjectSlim[];
  subjectWeaknesses: BranchSubjectSlim[];
}

export interface PrincipalRow {
  rank: number;
  id: string;
  name: string;
  initials: string;
  branch: string;
  branchId: string;
  composite: number;
  weekChange: number;
  trend: "up" | "down" | "same";
  avatarBg: string;
  avatarColor: string;
  subLine: string;
  isMe: boolean;
  teacherAvg: number;
  studentAvg: number;
  atRisk: number;
  // Mirror of branch enrichment (this principal's own branch). Empty when
  // the principal is unassigned ("Unassigned" branch).
  topTeachers: BranchTeacherSlim[];
  weakTeachers: BranchTeacherSlim[];
  subjectStrengths: BranchSubjectSlim[];
  subjectWeaknesses: BranchSubjectSlim[];
}

export interface TeacherRow {
  rank: number;
  id: string;
  name: string;
  initials: string;
  subject: string;
  branch: string;
  branchId: string;
  classes: string;
  composite: number;
  weekChange: number;
  trend: "up" | "down" | "same";
  avatarBg: string;
  avatarColor: string;
}

export interface StudentRow {
  rank: number;
  id: string;
  name: string;
  initials: string;
  class: string;
  branch: string;
  branchId: string;
  roll: string;
  composite: number;
  weekChange: number;
  trend: "up" | "down" | "same";
  avatarBg: string;
  avatarColor: string;
  atRisk: boolean;
}

export interface LeaderboardInput {
  schoolId: string;
  myBranchId?: string;
  myPrincipalId?: string;
  teachers: TeacherDoc[];
  students: StudentDoc[];
  principals: PrincipalDoc[];
  scores: ScoreDoc[];
  attendance: AttendanceDoc[];
  assignments: AssignmentDoc[];
  teacherAttendance: TeacherAttendanceDoc[];
  teachingAssignments: any[];
  classes?: any[];
  /** Master list of branches from `schools/{schoolId}/branches` subcollection.
   *  Source of truth — every branch here appears in the leaderboard,
   *  even if no teachers/students have been assigned yet (composite=0). */
  branches?: BranchDoc[];
}

export interface LeaderboardOutput {
  branches: BranchRow[];
  principals: PrincipalRow[];
  teachers: TeacherRow[];
  students: StudentRow[];
  meta: {
    weekNumber: number;
    networkBranchAvg: number;
    networkPrincipalAvg: number;
    networkTeacherAvg: number;
    networkStudentAvg: number;
    myBranchAvg: number;
    totalAtRisk: number;
    myRank: { branch: number | null; principal: number | null };
    multiBranch: boolean;
    totalTeachers: number;
    totalStudents: number;
    totalBranches: number;
    totalPrincipals: number;
  };
}

// ── Numeric helpers ───────────────────────────────────────────────────────
const numOf = (v: any): number => {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};

// Score normalizer — handles every field-name convention in this codebase:
//   percentage | score | mark | marks | obtainedMarks | marksObtained
//   maxScore   | totalMarks | maxMarks | outOf
// `mark` (singular) is the gradebook_scores schema (Gradebook.tsx writes
// `mark: Number(...)`). Without it, 100% of gradebook docs return null →
// silent drop in student composite + branch student-avg + at-risk count
// (memory: bug_pattern_score_field_singular_mark).
const pctOf = (s: ScoreDoc): number | null => {
  const direct = numOf((s as any).percentage);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(100, direct));
  const firstFinite = (...vals: any[]): number => {
    for (const v of vals) {
      const n = numOf(v);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  };
  const raw = firstFinite((s as any).score, (s as any).mark, (s as any).marks, (s as any).obtainedMarks, (s as any).marksObtained);
  const max = firstFinite((s as any).maxScore, (s as any).totalMarks, (s as any).maxMarks, (s as any).outOf);
  if (Number.isFinite(raw) && Number.isFinite(max) && max > 0) return Math.max(0, Math.min(100, (raw / max) * 100));
  if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return raw;
  return null;
};

// Broad writer-timestamp probe — every collection's writer stamps a
// different field. Old probe was missing `uploadedAt` and `updatedAt`,
// causing gradebook_scores docs (which write ONLY `updatedAt: Date.now()`)
// to return 0 → `inWindow` excluded them entirely from BOTH the current
// and previous week aggregations. That silently dropped the entire
// gradebook bulk-upload path from week-trend + week-composite (memory:
// bug_pattern_filterbytime_field_drift). Probe order goes
// most-trustworthy → most-permissive.
const docTimeMs = (d: any): number => {
  const v =
    d?.timestamp ??
    d?.createdAt ??
    d?.uploadedAt ??
    d?.updatedAt ??
    d?.date ??
    d?.markedAt;
  if (!v) return 0;
  if (v?.toMillis) return v.toMillis();
  if (typeof v === "number") return v;
  if (v?.seconds) return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

export const initialsOf = (name?: string): string => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
};

export function isoWeekNumber(d: Date = new Date()): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function colorForScore(score: number): { bg: string; color: string } {
  if (score >= 85) return { bg: "rgba(52,199,89,0.15)",  color: "#00833A" };
  if (score >= 75) return { bg: "rgba(123,63,244,0.12)", color: "#6d28d9" };
  if (score >= 65) return { bg: "rgba(0,85,255,0.12)",   color: "#0055FF" };
  if (score >= 55) return { bg: "rgba(255,136,0,0.12)",  color: "#C26A00" };
  return              { bg: "rgba(255,69,58,0.10)",      color: "#C71F2D" };
}

function trendOf(change: number): "up" | "down" | "same" {
  if (Math.abs(change) < 0.1) return "same";
  return change > 0 ? "up" : "down";
}

const clampDelta = (v: number): number => Math.max(-10, Math.min(10, v));

const DAY_MS = 86_400_000;
const NOW = () => Date.now();

function inWindow<T>(items: T[], startAgoDays: number, endAgoDays: number): T[] {
  const now = NOW();
  const start = now - startAgoDays * DAY_MS;
  const end   = now - endAgoDays * DAY_MS;
  return items.filter((d) => {
    const ms = docTimeMs(d);
    if (ms === 0) return false;
    return ms >= start && ms <= end;
  });
}

// ── Student composite ─────────────────────────────────────────────────────
const STUDENT_W = { score: 60, attendance: 30, passRate: 10 };

// At-risk thresholds. A student flags at-risk if EITHER:
//   (a) overall composite < ATRISK_COMPOSITE_THRESHOLD (requires having SOME
//       score signal — `totalW > 0`), OR
//   (b) attendance rate alone < ATRISK_ATTENDANCE_THRESHOLD, regardless of
//       scores (chronic absence is its own risk axis).
// The OR semantic is intentional — a student with strong scores but
// chronic absenteeism is still at risk of falling off (engagement signal),
// and a student with poor scores despite attending is at risk academically.
const ATRISK_COMPOSITE_THRESHOLD = 50;
const ATRISK_ATTENDANCE_THRESHOLD = 60;

interface StudentScoreOut {
  composite: number;
  avgScore: number | null;
  attRate: number | null;
  passRate: number | null;
  atRisk: boolean;
  hasData: boolean;
}

// Dual-key student lookup: docs are indexed under BOTH `studentId` AND
// lowercased `studentEmail` (whichever they carry — sometimes both).
// Lookup tries both keys for a given student, deduped on object identity
// so a doc carrying both keys isn't double-counted (memory:
// dual_query_pattern_studentid_email).
function scoreOneStudent(
  student: StudentDoc,
  scoresByKey: Map<string, ScoreDoc[]>,
  attByKey: Map<string, AttendanceDoc[]>,
): StudentScoreOut {
  const id    = String(student.id || "");
  const email = String((student as any).email || (student as any).studentEmail || "").toLowerCase().trim();

  const lookup = <T>(m: Map<string, T[]>): T[] => {
    const merged: T[] = [];
    if (id    && m.has(id))    merged.push(...m.get(id)!);
    if (email && m.has(email)) merged.push(...m.get(email)!);
    return merged.length > 0 ? Array.from(new Set(merged)) : merged; // dedup on doc identity
  };

  const sScores = lookup(scoresByKey);
  const sAtt    = lookup(attByKey);

  const pcts = sScores.map(pctOf).filter((n): n is number => n !== null);
  const avgScore = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const passRate = pcts.length > 0 ? (pcts.filter((n) => n >= 50).length / pcts.length) * 100 : null;

  const presentCount = sAtt.filter((a: any) => {
    const st = (a.status || "").toLowerCase();
    return st === "present" || st === "late";
  }).length;
  const attRate = sAtt.length > 0 ? (presentCount / sAtt.length) * 100 : null;

  let totalW = 0;
  let sum = 0;
  if (avgScore !== null) { sum += avgScore * STUDENT_W.score;      totalW += STUDENT_W.score; }
  if (attRate  !== null) { sum += attRate  * STUDENT_W.attendance; totalW += STUDENT_W.attendance; }
  if (passRate !== null) { sum += passRate * STUDENT_W.passRate;   totalW += STUDENT_W.passRate; }
  const composite = totalW > 0 ? sum / totalW : 0;

  const atRiskByComposite  = totalW > 0 && composite < ATRISK_COMPOSITE_THRESHOLD;
  const atRiskByAttendance = attRate !== null && attRate < ATRISK_ATTENDANCE_THRESHOLD;
  const atRisk = atRiskByComposite || atRiskByAttendance;

  return { composite, avgScore, attRate, passRate, atRisk, hasData: pcts.length > 0 || sAtt.length > 0 };
}

// Index docs under BOTH studentId AND lowercased studentEmail so the
// lookup pass can find docs keyed by either field. Was strict
// `studentId`-only — silently dropped legacy/imported email-only docs
// (memory: dual_query_pattern_studentid_email).
function indexScoresByStudent(scores: ScoreDoc[]): Map<string, ScoreDoc[]> {
  const m = new Map<string, ScoreDoc[]>();
  scores.forEach((s) => {
    const sid = String((s as any).studentId || "");
    const sem = String((s as any).studentEmail || "").toLowerCase().trim();
    if (!sid && !sem) return;
    if (sid) {
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid)!.push(s);
    }
    if (sem && sem !== sid) {
      if (!m.has(sem)) m.set(sem, []);
      m.get(sem)!.push(s);
    }
  });
  return m;
}
function indexAttByStudent(att: AttendanceDoc[]): Map<string, AttendanceDoc[]> {
  const m = new Map<string, AttendanceDoc[]>();
  att.forEach((a) => {
    const sid = String((a as any).studentId || "");
    const sem = String((a as any).studentEmail || "").toLowerCase().trim();
    if (!sid && !sem) return;
    if (sid) {
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid)!.push(a);
    }
    if (sem && sem !== sid) {
      if (!m.has(sem)) m.set(sem, []);
      m.get(sem)!.push(a);
    }
  });
  return m;
}

// ── Per-window aggregation ────────────────────────────────────────────────
interface WindowAgg {
  studentScores: Map<string, number>;
  teacherScores: Map<string, number>;
  branchTeacherAvg: Map<string, number>;
  branchStudentAvg: Map<string, number>;
  branchAtRiskCount: Map<string, number>;
  branchComposite: Map<string, number>;
}

const BRANCH_W = { teacherAvg: 50, studentAvg: 40, safety: 10 };

// Principal composite = 90% own-branch composite + 10% recency-of-activity.
// Activity is bucketed by `lastActive` age (days):
//   < 1d   = 100  (active today)
//   < 7d   =  90  (active this week)
//   < 14d  =  70  (recent)
//   < 30d  =  50  (lapsed)
//   else   =  30  (stale or never)
// Bands are intentionally coarse — `lastActive` is a weak signal; we don't
// want sub-day differences shifting ranks. Adjust here if engagement
// definition changes.
const PRINCIPAL_W = { branch: 0.9, activity: 0.1 };
const PRINCIPAL_ACTIVITY_BANDS = {
  TODAY:     100, // < 1 day
  THIS_WEEK:  90, // < 7 days
  RECENT:     70, // < 14 days
  LAPSED:     50, // < 30 days
  STALE:      30, // >= 30 days or never logged in
};
function principalActivityScore(ageDays: number): number {
  if (ageDays < 1)  return PRINCIPAL_ACTIVITY_BANDS.TODAY;
  if (ageDays < 7)  return PRINCIPAL_ACTIVITY_BANDS.THIS_WEEK;
  if (ageDays < 14) return PRINCIPAL_ACTIVITY_BANDS.RECENT;
  if (ageDays < 30) return PRINCIPAL_ACTIVITY_BANDS.LAPSED;
  return PRINCIPAL_ACTIVITY_BANDS.STALE;
}

function aggregateWindow(
  input: LeaderboardInput,
  scoresWin: ScoreDoc[],
  attWin: AttendanceDoc[],
  assignWin: AssignmentDoc[],
  tAttWin: TeacherAttendanceDoc[],
): WindowAgg {
  const teacherScored = scoreTeachers({
    teachers: input.teachers,
    scores: scoresWin,
    attendance: attWin,
    assignments: assignWin,
    teacherAttendance: tAttWin,
    teachingAssignments: input.teachingAssignments,
  });
  const teacherScores = new Map<string, number>();
  teacherScored.forEach((t) => teacherScores.set(t.teacher.id, t.composite));

  const scoresByStudent = indexScoresByStudent(scoresWin);
  const attByStudent    = indexAttByStudent(attWin);
  const studentScores   = new Map<string, number>();

  const tAccByBranch = new Map<string, { sum: number; n: number }>();
  const sAccByBranch = new Map<string, { sum: number; n: number; atRisk: number }>();

  input.students.forEach((stu) => {
    const out = scoreOneStudent(stu, scoresByStudent, attByStudent);
    if (out.hasData) studentScores.set(stu.id, out.composite);
    const bid = stu.branchId || "_default";
    if (!sAccByBranch.has(bid)) sAccByBranch.set(bid, { sum: 0, n: 0, atRisk: 0 });
    const acc = sAccByBranch.get(bid)!;
    if (out.hasData) {
      acc.sum += out.composite;
      acc.n += 1;
    }
    if (out.atRisk) acc.atRisk += 1;
  });

  input.teachers.forEach((t) => {
    const c = teacherScores.get(t.id);
    if (c === undefined) return;
    const bid = t.branchId || "_default";
    if (!tAccByBranch.has(bid)) tAccByBranch.set(bid, { sum: 0, n: 0 });
    const acc = tAccByBranch.get(bid)!;
    acc.sum += c;
    acc.n += 1;
  });

  const branchTeacherAvg  = new Map<string, number>();
  const branchStudentAvg  = new Map<string, number>();
  const branchAtRiskCount = new Map<string, number>();
  const branchComposite   = new Map<string, number>();

  // "_default" is the orphan-doc sentinel used internally by the bucket
  // accumulators above. Exclude it from the OUTPUT branch list — orphan
  // teachers/students/principals shouldn't materialise as a phantom
  // "_default" branch row in the leaderboard. They still contribute to
  // their respective entity-level rows (teacher/student leaderboards).
  const allBranchIds = new Set<string>([
    ...(input.branches || []).map((b) => b.branchId || b.id).filter(Boolean) as string[],
    ...Array.from(tAccByBranch.keys()).filter((b) => b !== "_default"),
    ...Array.from(sAccByBranch.keys()).filter((b) => b !== "_default"),
    ...input.principals.map((p) => p.branchId).filter((b): b is string => !!b),
  ]);

  allBranchIds.forEach((bid) => {
    const t = tAccByBranch.get(bid);
    const s = sAccByBranch.get(bid);
    const tAvg = t && t.n > 0 ? t.sum / t.n : null;
    const sAvg = s && s.n > 0 ? s.sum / s.n : null;
    const sN   = s ? s.n : 0;
    const atR  = s ? s.atRisk : 0;
    // Safety: 100 = zero at-risk; halves at 50% at-risk; floors at 0
    const safetyScore = sN > 0 ? Math.max(0, 100 - (atR / sN) * 200) : null;

    if (tAvg !== null) branchTeacherAvg.set(bid, tAvg);
    if (sAvg !== null) branchStudentAvg.set(bid, sAvg);
    branchAtRiskCount.set(bid, atR);

    let totalW = 0, sum = 0;
    if (tAvg !== null)        { sum += tAvg        * BRANCH_W.teacherAvg; totalW += BRANCH_W.teacherAvg; }
    if (sAvg !== null)        { sum += sAvg        * BRANCH_W.studentAvg; totalW += BRANCH_W.studentAvg; }
    if (safetyScore !== null) { sum += safetyScore * BRANCH_W.safety;     totalW += BRANCH_W.safety; }
    // Always set composite — branches with no data get 0 so they still appear in
    // the leaderboard (otherwise newly-created branches stay invisible).
    branchComposite.set(bid, totalW > 0 ? sum / totalW : 0);
  });

  return { studentScores, teacherScores, branchTeacherAvg, branchStudentAvg, branchAtRiskCount, branchComposite };
}

function branchMetaMap(input: LeaderboardInput): Map<string, { name: string; city: string }> {
  const m = new Map<string, { name: string; city: string }>();

  // 1. Seed from canonical `branches` master list — highest priority for name/city
  (input.branches || []).forEach((b) => {
    const bid = b.branchId || b.id;
    if (!bid) return;
    m.set(bid, {
      name: b.name || b.schoolName || bid,
      city: b.city || b.location || b.address || "—",
    });
  });

  // 2. Fall back to principal-attached metadata for any branch not in master list.
  // Principal docs in this codebase use varying field names (`branchName` vs `branch`,
  // `branchCity` vs `city` vs `branchAddress`) — accept all known aliases.
  input.principals.forEach((p: any) => {
    const bid = p.branchId;
    if (!bid || m.has(bid)) return;
    const name = p.branchName || p.branch || p.branchTitle || bid;
    const city = p.branchCity || p.city || p.branchLocation || p.branchAddress || "—";
    m.set(bid, { name, city });
  });

  // 3. Enrich from teacher/student docs — they also carry `branchName`/`branch`
  // when present. Last-resort fallback uses the branchId as the name.
  input.teachers.concat(input.students as any).forEach((d: any) => {
    const bid = d.branchId;
    if (!bid) return;
    if (m.has(bid)) {
      // Upgrade a stub (name === bid) if a richer name is available on this doc
      const existing = m.get(bid)!;
      if (existing.name === bid) {
        const better = d.branchName || d.branch;
        if (better) m.set(bid, { name: better, city: existing.city });
      }
      return;
    }
    m.set(bid, {
      name: d.branchName || d.branch || bid,
      city: d.branchCity || d.city || "—",
    });
  });
  return m;
}

function principalSubLine(tAvg: number | null, sAvg: number | null, atRisk: number, branchName: string): string {
  const parts: string[] = [branchName];
  if (tAvg !== null && tAvg > 0) parts.push(`Teachers ${tAvg.toFixed(0)}`);
  if (sAvg !== null && sAvg > 0) parts.push(`Students ${sAvg.toFixed(0)}`);
  if (atRisk > 0) parts.push(`${atRisk} at-risk`);
  return parts.join(" · ");
}

function classNameMap(classes?: any[]): Map<string, string> {
  const m = new Map<string, string>();
  (classes || []).forEach((c: any) => {
    if (!c?.id) return;
    m.set(c.id, c.name || c.className || c.id);
  });
  return m;
}

// Active-status whitelist for principals. "Active" / "Invited" both render
// in the leaderboard; "Archived"/"Inactive"/"Deleted" / placeholder docs
// (no name AND no email) are excluded. Dedup keeps ONE doc per email
// (case-insensitive) — same email across multiple test/dup registrations
// previously rendered as repeated rows.
const PRINCIPAL_INACTIVE_STATUSES = new Set(["archived", "inactive", "deleted", "removed", "suspended"]);

function dedupActivePrincipals(principals: PrincipalDoc[]): PrincipalDoc[] {
  const seenId = new Set<string>();
  const seenEmail = new Set<string>();
  const out: PrincipalDoc[] = [];
  for (const p of principals) {
    const status = String(p.status || "").toLowerCase();
    if (PRINCIPAL_INACTIVE_STATUSES.has(status)) continue;
    if (!p.name && !p.email) continue;          // placeholder / anonymous
    if (p.id && seenId.has(p.id)) continue;     // exact id dup (rare — same doc referenced twice)
    const email = String(p.email || "").toLowerCase().trim();
    if (email && seenEmail.has(email)) continue; // same person registered twice
    if (p.id) seenId.add(p.id);
    if (email) seenEmail.add(email);
    out.push(p);
  }
  return out;
}

// ── Public entry point ────────────────────────────────────────────────────
export function buildLeaderboards(input: LeaderboardInput): LeaderboardOutput {
  // Filter + dedup principals ONCE at the entry point — every downstream
  // pass (branch meta, window aggregation, principal rendering) sees the
  // same canonical real-principals list. Without this, the principal tab
  // showed test/archived/duplicate rows.
  const cleanInput: LeaderboardInput = {
    ...input,
    principals: dedupActivePrincipals(input.principals),
  };

  const meta = branchMetaMap(cleanInput);
  const classes = classNameMap(cleanInput.classes);

  const scoresAll = cleanInput.scores;
  const attAll    = cleanInput.attendance;
  const assignAll = cleanInput.assignments;
  const tAttAll   = cleanInput.teacherAttendance;

  const cur  = aggregateWindow(cleanInput, inWindow(scoresAll, 7, 0),  inWindow(attAll, 7, 0),  inWindow(assignAll, 7, 0),  inWindow(tAttAll, 7, 0));
  const prev = aggregateWindow(cleanInput, inWindow(scoresAll, 14, 7), inWindow(attAll, 14, 7), inWindow(assignAll, 14, 7), inWindow(tAttAll, 14, 7));

  // Fallback: if current week has no timestamped activity at all, use all-time.
  const useFallback =
    cur.branchComposite.size === 0 &&
    cur.studentScores.size === 0 &&
    cur.teacherScores.size === 0;
  const eff = useFallback
    ? aggregateWindow(cleanInput, scoresAll, attAll, assignAll, tAttAll)
    : cur;

  const effScores = useFallback ? scoresAll : inWindow(scoresAll, 7, 0);
  const effAtt    = useFallback ? attAll    : inWindow(attAll,    7, 0);
  const effAssign = useFallback ? assignAll : inWindow(assignAll, 7, 0);
  const effTAtt   = useFallback ? tAttAll   : inWindow(tAttAll,   7, 0);

  // ── TEACHERS (computed early — branch enrichment depends on it) ──
  const teacherScored: TeacherScore[] = scoreTeachers({
    teachers: cleanInput.teachers,
    scores: effScores,
    attendance: effAtt,
    assignments: effAssign,
    teacherAttendance: effTAtt,
    teachingAssignments: cleanInput.teachingAssignments,
  });

  // ── Per-branch enrichment for AI grounding ──
  // For each branch, surface: top 3 + weak 3 teachers (named) and the
  // strongest 2 + weakest 2 subjects (by mean class avg). Lets the AI
  // (and the deterministic fallback) cite specific people / subjects in
  // "why this rank" + "how to improve" instead of generic advice.
  // Skips orphan "_default" bucket — that branch never renders.
  const WEAK_TEACHER_THRESHOLD = 60;       // composite below this = drag on branch
  const TOP_TEACHER_LIMIT = 3;
  const WEAK_TEACHER_LIMIT = 3;
  const SUBJECT_LIMIT = 2;
  type BranchEnrichment = {
    topTeachers: BranchTeacherSlim[];
    weakTeachers: BranchTeacherSlim[];
    subjectStrengths: BranchSubjectSlim[];
    subjectWeaknesses: BranchSubjectSlim[];
  };
  const branchEnrichment = new Map<string, BranchEnrichment>();
  // 1) Group scored teachers by branch
  const tsByBranch = new Map<string, TeacherScore[]>();
  teacherScored.forEach((ts) => {
    const bid = ts.teacher.branchId || "_default";
    if (bid === "_default") return; // orphans don't enrich any real branch
    if (!tsByBranch.has(bid)) tsByBranch.set(bid, []);
    tsByBranch.get(bid)!.push(ts);
  });
  // 2) Per-branch reduce
  tsByBranch.forEach((tsList, bid) => {
    const slimOf = (ts: TeacherScore): BranchTeacherSlim => ({
      name: ts.teacher.name || ts.teacher.email || "Teacher",
      composite: Math.round(ts.composite * 10) / 10,
      subject: (ts.teacher as any).subject || (Array.isArray(ts.teacher.subjects) ? ts.teacher.subjects[0] : undefined) || undefined,
    });
    const withData = tsList.filter((t) => t.composite > 0);
    const sortedDesc = [...withData].sort((a, b) => b.composite - a.composite);
    const topTeachers = sortedDesc.slice(0, TOP_TEACHER_LIMIT).map(slimOf);
    // Weak = bottom-N AND below threshold (don't tag a 70% teacher as "weak")
    const weakTeachers = [...sortedDesc]
      .reverse()
      .filter((t) => t.composite < WEAK_TEACHER_THRESHOLD)
      .slice(0, WEAK_TEACHER_LIMIT)
      .map(slimOf);

    // Subject avg = mean of teacher.classAvg grouped by teacher.subject.
    // Only counts teachers with classAvg !== null (real exam data).
    const subjMap = new Map<string, { sum: number; n: number }>();
    tsList.forEach((t) => {
      if (t.classAvg === null) return;
      const subj = (t.teacher as any).subject
        || (Array.isArray(t.teacher.subjects) ? t.teacher.subjects[0] : "");
      if (!subj) return;
      const cur = subjMap.get(subj) || { sum: 0, n: 0 };
      cur.sum += t.classAvg;
      cur.n += 1;
      subjMap.set(subj, cur);
    });
    const subjects: BranchSubjectSlim[] = Array.from(subjMap.entries()).map(
      ([s, { sum, n }]) => ({ subject: s, avg: Math.round((sum / n) * 10) / 10 }),
    );
    const sortedSubj = [...subjects].sort((a, b) => b.avg - a.avg);
    const subjectStrengths = sortedSubj.slice(0, SUBJECT_LIMIT);
    // Bottom subjects only when there are 4+ subjects to compare (otherwise
    // top and bottom would overlap or be misleading).
    const subjectWeaknesses = sortedSubj.length >= SUBJECT_LIMIT * 2
      ? sortedSubj.slice(-SUBJECT_LIMIT).reverse()
      : [];

    branchEnrichment.set(bid, { topTeachers, weakTeachers, subjectStrengths, subjectWeaknesses });
  });

  // ── BRANCHES ──
  const branchIds = Array.from(eff.branchComposite.keys());
  const branchRowsRaw = branchIds.map((bid) => {
    const m = meta.get(bid) || { name: bid, city: "—" };
    const composite = eff.branchComposite.get(bid) || 0;
    const prevComposite = prev.branchComposite.get(bid);
    const weekChange = prevComposite !== undefined ? clampDelta(composite - prevComposite) : 0;
    const tCount = cleanInput.teachers.filter((t) => (t.branchId || "_default") === bid).length;
    const sCount = cleanInput.students.filter((s) => (s.branchId || "_default") === bid).length;
    const colors = colorForScore(composite);
    const enr = branchEnrichment.get(bid);
    return {
      id: bid,
      name: m.name,
      city: m.city,
      initial: (m.name || bid).slice(0, 1).toUpperCase(),
      students: sCount,
      teachers: tCount,
      composite,
      weekChange,
      trend: trendOf(weekChange),
      avatarBg: colors.bg,
      avatarColor: colors.color,
      isMyBranch: bid === cleanInput.myBranchId,
      atRisk: eff.branchAtRiskCount.get(bid) || 0,
      teacherAvg: eff.branchTeacherAvg.get(bid) || 0,
      studentAvg: eff.branchStudentAvg.get(bid) || 0,
      topTeachers:       enr?.topTeachers       ?? [],
      weakTeachers:      enr?.weakTeachers      ?? [],
      subjectStrengths:  enr?.subjectStrengths  ?? [],
      subjectWeaknesses: enr?.subjectWeaknesses ?? [],
    };
  })
  .sort((a, b) => b.composite - a.composite);

  const branches: BranchRow[] = branchRowsRaw.map((b, i) => ({ ...b, rank: i + 1 }));

  // ── PRINCIPALS ──
  // Operates on the deduped + active-only list. Orphan principals (no
  // branchId) get "Unassigned" as their branch label so they don't show
  // the raw "_default" sentinel in the UI.
  const principalRowsRaw = cleanInput.principals.map((p) => {
    const hasBranch = !!p.branchId;
    const bid = p.branchId || "_default";
    const branchName = hasBranch ? (meta.get(bid)?.name || bid) : "Unassigned";
    const branchComp = eff.branchComposite.get(bid) || 0;
    const prevComp   = prev.branchComposite.get(bid);
    const baseChange = prevComp !== undefined ? branchComp - prevComp : 0;

    const last = docTimeMs({ date: p.lastActive });
    const ageDays = last > 0 ? (NOW() - last) / DAY_MS : Infinity;
    const activity = principalActivityScore(ageDays);
    const composite = branchComp * PRINCIPAL_W.branch + activity * PRINCIPAL_W.activity;
    const weekChange = clampDelta(baseChange);

    const tAvg = eff.branchTeacherAvg.get(bid) || null;
    const sAvg = eff.branchStudentAvg.get(bid) || null;
    const atR  = eff.branchAtRiskCount.get(bid) || 0;
    const colors = colorForScore(composite);
    // Mirror this principal's branch enrichment so the AI prompt + fallback
    // can cite specific teachers/subjects under their leadership.
    const enr = branchEnrichment.get(bid);

    return {
      id: p.id,
      name: p.name || p.email || "Principal",
      initials: initialsOf(p.name || p.email),
      branch: branchName,
      branchId: bid,
      composite,
      weekChange,
      trend: trendOf(weekChange),
      avatarBg: colors.bg,
      avatarColor: colors.color,
      subLine: principalSubLine(tAvg, sAvg, atR, branchName),
      isMe: p.id === cleanInput.myPrincipalId,
      teacherAvg: tAvg || 0,
      studentAvg: sAvg || 0,
      atRisk: atR,
      topTeachers:       enr?.topTeachers       ?? [],
      weakTeachers:      enr?.weakTeachers      ?? [],
      subjectStrengths:  enr?.subjectStrengths  ?? [],
      subjectWeaknesses: enr?.subjectWeaknesses ?? [],
    };
  })
  .sort((a, b) => b.composite - a.composite);

  const principals: PrincipalRow[] = principalRowsRaw.map((p, i) => ({ ...p, rank: i + 1 }));

  // ── TEACHERS (uses teacherScored already computed above) ──
  const teacherClasses = new Map<string, Set<string>>();
  cleanInput.teachingAssignments.forEach((ta: any) => {
    if (!ta?.teacherId) return;
    if (ta.status && ta.status !== "active") return;
    const cname = (ta.classId && classes.get(ta.classId)) || ta.className || ta.classId;
    if (!cname) return;
    if (!teacherClasses.has(ta.teacherId)) teacherClasses.set(ta.teacherId, new Set());
    teacherClasses.get(ta.teacherId)!.add(cname);
  });

  const teacherRowsRaw: TeacherRow[] = teacherScored.map((ts) => {
    const t = ts.teacher;
    const bid = t.branchId || "_default";
    const branchName = meta.get(bid)?.name || bid;
    const prevC = prev.teacherScores.get(t.id);
    const weekChange = prevC !== undefined ? clampDelta(ts.composite - prevC) : 0;
    const colors = colorForScore(ts.composite);
    // Teacher docs in this codebase carry `subject` (singular string) as
    // the primary field; `subjects[]` array is a legacy/optional shape.
    // Probe singular first so the canonical field wins.
    const subj = (t as any).subject || (Array.isArray(t.subjects) ? t.subjects[0] : "") || "—";
    const cls = Array.from(teacherClasses.get(t.id) || []).join(", ") || "—";
    return {
      rank: 0,
      id: t.id,
      name: t.name || t.email || "Teacher",
      initials: initialsOf(t.name || t.email),
      subject: subj,
      branch: branchName,
      branchId: bid,
      classes: cls,
      composite: ts.composite,
      weekChange,
      trend: trendOf(weekChange),
      avatarBg: colors.bg,
      avatarColor: colors.color,
    };
  });
  const teachers: TeacherRow[] = teacherRowsRaw.map((t, i) => ({ ...t, rank: i + 1 }));

  // ── STUDENTS ──
  const scoresByStudentEff = indexScoresByStudent(effScores);
  const attByStudentEff    = indexAttByStudent(effAtt);

  const studentRowsRaw = cleanInput.students.map((stu) => {
    const out = scoreOneStudent(stu, scoresByStudentEff, attByStudentEff);
    // Include all enrolled students — even if no scores/attendance yet they
    // appear at the bottom with composite 0. Otherwise newly-enrolled students
    // are invisible in the leaderboard until their first test.
    const bid = stu.branchId || "_default";
    const branchName = meta.get(bid)?.name || bid;
    const prevC = prev.studentScores.get(stu.id);
    const weekChange = prevC !== undefined ? clampDelta(out.composite - prevC) : 0;
    const colors = colorForScore(out.composite);
    const dispName = stu.studentName || stu.name || "Student";
    const className = stu.className || (stu.classId ? classes.get(stu.classId) : "") || "—";
    return {
      rank: 0,
      id: stu.id,
      name: dispName,
      initials: initialsOf(dispName),
      class: className,
      branch: branchName,
      branchId: bid,
      roll: stu.rollNo ? `#${String(stu.rollNo).replace(/^#/, "")}` : "—",
      composite: out.composite,
      weekChange,
      trend: trendOf(weekChange),
      avatarBg: colors.bg,
      avatarColor: colors.color,
      atRisk: out.atRisk,
    };
  })
  .sort((a, b) => b.composite - a.composite);

  const students: StudentRow[] = studentRowsRaw.map((s, i) => ({ ...s, rank: i + 1 }));

  // ── META ──
  // Network averages over data-bearing entries only. composite=0 means
  // "no signals at all" (renormalisation in scoreTeachers / scoreOneStudent
  // returns 0 when totalW is 0). Including those entries dragged the
  // displayed network averages artificially down — same fix pattern as
  // TeacherLeaderboard P1-2 (memory: bug_pattern_score_zero_no_data).
  const avgComposite = <T extends { composite: number }>(arr: T[]): number => {
    const data = arr.filter((x) => x.composite > 0);
    return data.length > 0 ? data.reduce((s, x) => s + x.composite, 0) / data.length : 0;
  };
  const networkBranchAvg    = avgComposite(branches);
  const networkPrincipalAvg = avgComposite(principals);
  const networkTeacherAvg   = avgComposite(teachers);
  const networkStudentAvg   = avgComposite(students);
  const myBranch = branches.find((b) => b.isMyBranch);
  const myBranchAvg = myBranch ? myBranch.composite : 0;
  const totalAtRisk = students.filter((s) => s.atRisk).length;
  const myBranchRank = myBranch ? myBranch.rank : null;
  const myPrincipal = principals.find((p) => p.isMe);
  const myPrincipalRank = myPrincipal ? myPrincipal.rank : null;

  return {
    branches,
    principals,
    teachers,
    students,
    meta: {
      weekNumber: isoWeekNumber(),
      networkBranchAvg,
      networkPrincipalAvg,
      networkTeacherAvg,
      networkStudentAvg,
      myBranchAvg,
      totalAtRisk,
      myRank: { branch: myBranchRank, principal: myPrincipalRank },
      multiBranch: branches.length > 1,
      totalTeachers: teachers.length,
      totalStudents: students.length,
      totalBranches: branches.length,
      totalPrincipals: principals.length,
    },
  };
}
