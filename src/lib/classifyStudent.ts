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
  /** Raw inputs — caller pre-aggregates from Firestore.
   *  ⚠ MUST be in ASCENDING DATE ORDER (oldest first) — downstream trend
   *  analysis in `student-insight.ts` slices the array as
   *  `earlier = scores.slice(0, half)` and `recent = scores.slice(-half)`.
   *  If the producer hands us reverse-chronological data, every "trend"
   *  message is silently INVERTED. classifyStudent does NOT sort because
   *  we'd lose that contract — sort at the producer if your data isn't
   *  already in order. */
  totalAttendance: number;
  presentAttendance: number;
  scores: number[];            // percentages 0-100, ASC by date
}

// Tunable thresholds — exported so other modules can stay aligned. Memory
// `bug_pattern_score_zero_no_data` warned about constants drifting across
// pages; importing from here is the cure. Mastery gateway is a separate
// constant because it lives only in the "developing" reasons copy.
export const WEAK_SCORE_THRESHOLD       = 50;
export const WEAK_ATTENDANCE_THRESHOLD  = 70;
export const SMART_SCORE_THRESHOLD      = 75;
export const SMART_ATTENDANCE_THRESHOLD = 85;
export const MASTERY_GATEWAY            = 65;

export interface ClassifiedStudent extends StudentSignals {
  /** Average percentage 0-100 (rounded) — null when no usable scores.
   *  Consumers MUST handle null explicitly: defaulting null to 0
   *  silently classifies score-less students as "Weak", inflating the
   *  at-risk count. */
  avgScore: number | null;
  /** Attendance % 0-100 (rounded) — null when no attendance records. */
  attendancePct: number | null;
  category: Category;
  reasons: string[];
  priority: number;
  /** True only when the student has at least one usable score. UI uses this
   *  to show "—" instead of "0%" and to skip score-based reasons. */
  hasScoreData: boolean;
  /** True only when the student has at least one attendance record. */
  hasAttendanceData: boolean;
}

export function classifyStudent(s: StudentSignals): ClassifiedStudent {
  // Defensive: filter out any non-finite scores that slipped past upstream
  // normalization (e.g., Firestore doc with `percentage: null`). Also clamp
  // 0–100 in case bonus marks slipped through.
  const validScores = s.scores
    .filter(n => typeof n === "number" && Number.isFinite(n))
    .map(n => Math.max(0, Math.min(100, n)));
  const hasScoreData = validScores.length > 0;
  const avgScore: number | null = hasScoreData
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : null;

  const hasAttendanceData = s.totalAttendance > 0 && Number.isFinite(s.totalAttendance);
  const attendancePct: number | null = hasAttendanceData
    ? Math.round((s.presentAttendance / s.totalAttendance) * 100)
    : null;

  const reasons: string[] = [];
  let category: Category;

  // Classification: only judge against signals we ACTUALLY have. A student
  // with no scores but high attendance shouldn't be tarred as Weak just
  // because avgScore defaults to 0. Same for the inverse. The previous
  // version triggered "weak" purely from missing data, which is exactly the
  // memory `bug_pattern_score_zero_no_data` failure.
  const failsScore      = hasScoreData      && (avgScore!      < WEAK_SCORE_THRESHOLD);
  const failsAttendance = hasAttendanceData && (attendancePct! < WEAK_ATTENDANCE_THRESHOLD);
  const passesSmartScore      = hasScoreData      && (avgScore!      >= SMART_SCORE_THRESHOLD);
  const passesSmartAttendance = hasAttendanceData && (attendancePct! >= SMART_ATTENDANCE_THRESHOLD);

  if (failsScore || failsAttendance) {
    category = "weak";
    if (failsScore) reasons.push(`Low average score (${avgScore}%)`);
    if (failsAttendance) reasons.push(`Low attendance (${attendancePct}%)`);
  } else if (
    // Strict Smart needs BOTH signals AND both above bar. If only one signal
    // exists, can't promote — fall through to "developing" with a hint.
    passesSmartScore && passesSmartAttendance
  ) {
    category = "smart";
    reasons.push(`Strong performance (${avgScore}%)`);
    reasons.push(`Excellent attendance (${attendancePct}%)`);
  } else {
    category = "developing";
    if (hasScoreData)      reasons.push(`Average score ${avgScore}%`);
    if (hasAttendanceData) reasons.push(`Attendance ${attendancePct}%`);
    if (hasScoreData && (avgScore as number) >= MASTERY_GATEWAY) {
      reasons.push("Close to mastery threshold");
    }
    if (!hasScoreData)      reasons.push("No test data recorded yet");
    if (!hasAttendanceData) reasons.push("No attendance recorded yet");
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
    hasScoreData,
    hasAttendanceData,
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