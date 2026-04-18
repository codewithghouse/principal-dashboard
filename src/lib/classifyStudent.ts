/**
 * classifyStudent.ts
 * Rule-based classifier that bucket students into Weak / Developing / Smart
 * based on academic performance + attendance signals.
 *
 * Thresholds (tunable):
 *   - Weak:       avgScore < 50  OR  attendance < 70
 *   - Smart:      avgScore >= 75 AND attendance >= 85
 *   - Developing: everything in-between
 */

export type Category = "weak" | "developing" | "smart";

export interface StudentSignals {
  studentId: string;
  studentName: string;
  className?: string;
  classId?: string;
  rollNo?: string;
  email?: string;
  parentEmail?: string;
  parentPhone?: string;
  branchId?: string;
  /** Raw inputs — caller pre-aggregates from Firestore */
  totalAttendance: number;
  presentAttendance: number;
  scores: number[];            // percentages 0-100
}

export interface ClassifiedStudent extends StudentSignals {
  avgScore: number;            // 0-100 (rounded)
  attendancePct: number;       // 0-100 (rounded)
  category: Category;
  reasons: string[];           // human-readable, e.g. ["Low avg score (42%)", "Attendance 65%"]
  priority: number;            // sortable: higher = more urgent (weak > dev > smart)
}

const WEAK_SCORE_THRESHOLD       = 50;
const WEAK_ATTENDANCE_THRESHOLD  = 70;
const SMART_SCORE_THRESHOLD      = 75;
const SMART_ATTENDANCE_THRESHOLD = 85;

export function classifyStudent(s: StudentSignals): ClassifiedStudent {
  // Defensive: filter out any non-finite scores that slipped past upstream
  // normalization (e.g., Firestore doc with `percentage: null`).
  const validScores = s.scores.filter(
    n => typeof n === "number" && Number.isFinite(n),
  );
  const avgScore = validScores.length
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : 0;

  const attendancePct =
    s.totalAttendance > 0 && Number.isFinite(s.totalAttendance)
      ? Math.round((s.presentAttendance / s.totalAttendance) * 100)
      : 0;

  const reasons: string[] = [];
  let category: Category;

  if (avgScore < WEAK_SCORE_THRESHOLD || attendancePct < WEAK_ATTENDANCE_THRESHOLD) {
    category = "weak";
    if (validScores.length === 0) reasons.push("No test data recorded yet");
    if (avgScore < WEAK_SCORE_THRESHOLD && validScores.length > 0)
      reasons.push(`Low average score (${avgScore}%)`);
    if (attendancePct < WEAK_ATTENDANCE_THRESHOLD && s.totalAttendance > 0)
      reasons.push(`Low attendance (${attendancePct}%)`);
    if (reasons.length === 0) reasons.push("Insufficient data — review manually");
  } else if (avgScore >= SMART_SCORE_THRESHOLD && attendancePct >= SMART_ATTENDANCE_THRESHOLD) {
    category = "smart";
    reasons.push(`Strong performance (${avgScore}%)`);
    reasons.push(`Excellent attendance (${attendancePct}%)`);
  } else {
    category = "developing";
    reasons.push(`Average score ${avgScore}%`);
    reasons.push(`Attendance ${attendancePct}%`);
    if (avgScore >= 65) reasons.push("Close to mastery threshold");
  }

  const priority =
    category === "weak" ? 3 :
    category === "developing" ? 2 : 1;

  return {
    ...s,
    avgScore,
    attendancePct,
    category,
    reasons,
    priority,
  };
}

export const CATEGORY_META: Record<Category, {
  label: string;
  color: string;
  bg: string;
  border: string;
  emoji: string;
  description: string;
}> = {
  weak: {
    label: "Weak",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    emoji: "🔴",
    description: "Needs immediate attention — low scores or attendance",
  },
  developing: {
    label: "Developing",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fed7aa",
    emoji: "🟡",
    description: "Moderate performance — room to improve",
  },
  smart: {
    label: "Smart",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    emoji: "🟢",
    description: "Strong performer — recognize and challenge further",
  },
};