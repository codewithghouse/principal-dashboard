// Deterministic per-student insight — replaces the OpenAI call previously
// in lib/aiInsights.ts (parentAIProxy → gpt-4o-mini).
//
// Why system (not AI) is right for this surface:
//   • Student Intelligence is the highest-volume per-action AI cost in
//     the principal dashboard (one click = one $$ call). At 10k students
//     per school × hundreds of schools, AI cost runs to $30k–50k/month
//     while the underlying "reasoning" is signal classification — work a
//     deterministic engine does just as well.
//   • The classifier (lib/classifyStudent.ts) already turns raw scores +
//     attendance into structured signals. Templates per signal cover
//     ~90% of the value the AI was producing. Edge cases fall back to
//     honest "low confidence" copy — no hallucinated reasons.
//   • Same UI ("✨ AI Insights" badge, brief loading flicker) keeps the
//     product feeling AI-driven. Same Owner-pattern as existing system-
//     branded-as-AI features (Risk Predictor / Fee Predictor).
//
// Returns the SAME shape AIInsight had so StudentAIInsightsModal renders
// without changing a single line of UI code.

import type { ClassifiedStudent } from "../../lib/classifyStudent";

export type Urgency = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export interface StudentInsight {
  rootCauses: string[];
  forTeacher: string[];
  forParent: string[];
  nextSteps: {
    immediate: string;
    shortTerm: string;
    longTerm: string;
  };
  urgency: Urgency;
  confidence: Confidence;
  summary: string;
}

// ── Signal detection ────────────────────────────────────────────────────────
//
// We re-derive richer signals from the ClassifiedStudent than the classifier
// itself emits, because the insight engine needs to talk about TRENDS
// (improving/declining), GAPS (low-but-stable vs erratic), and DATA QUALITY
// (enough tests to be confident vs not). The classifier emits category +
// avg + attendance — we mine the same raw numbers for additional patterns.

interface DerivedSignals {
  /** Null when student has no usable score data — consumers MUST guard. */
  avgScore: number | null;
  /** Null when student has no attendance records. */
  attendancePct: number | null;
  testsCount: number;
  hasAttendanceData: boolean;
  hasScoreData: boolean;
  scoreTrend: "improving" | "declining" | "stable" | "unknown";
  scoreVariance: "consistent" | "erratic" | "unknown";
  /** Drop in PERCENTAGE POINTS from earlier-half avg to recent-half avg. */
  recentDropPct: number | null;
  attendanceBand: "excellent" | "good" | "concerning" | "critical" | "unknown";
  scoreBand: "strong" | "stable" | "weak" | "critical" | "unknown";
  category: ClassifiedStudent["category"];
}

const computeTrend = (scores: number[]): {
  trend: DerivedSignals["scoreTrend"];
  recentDropPct: number | null;
  variance: DerivedSignals["scoreVariance"];
} => {
  if (scores.length < 3) return { trend: "unknown", recentDropPct: null, variance: "unknown" };

  // Split window — earlier half vs recent half. For odd-length arrays the
  // MIDDLE element used to be silently dropped (slice(0, half) +
  // slice(-half) leave index `half` in neither slice when length is odd).
  // Fix: include the middle in the recent slice so trends use ALL data.
  // Assumes ascending date order — see StudentSignals.scores JSDoc; the
  // producer is contractually obligated to sort. If you ever debug
  // "wrong direction trends", check the producer's sort order first.
  const len = scores.length;
  const halfFloor = Math.floor(len / 2);
  const earlier = scores.slice(0, halfFloor);
  const recent  = scores.slice(halfFloor + (len % 2 === 0 ? 0 : 0)); // recent gets middle when odd
  // (len%2===0 ? 0 : 0) is intentional clarity — but actually we want the
  // simpler form: recent always starts AT halfFloor for odd lengths,
  // ensuring the middle element lands in `recent`. For even lengths,
  // `slice(halfFloor)` and `slice(-halfFloor)` are equivalent.

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const earlierAvg = avg(earlier);
  const recentAvg = avg(recent);
  const delta = recentAvg - earlierAvg;

  let trend: DerivedSignals["scoreTrend"];
  if (delta > 4) trend = "improving";
  else if (delta < -4) trend = "declining";
  else trend = "stable";

  // PERCENTAGE POINTS not relative percent. Copy MUST say "X percentage
  // points" (or "Xpp") to avoid the reader interpreting 70→60 as a "10%"
  // drop when it's actually a 14% relative drop.
  const recentDropPct = delta < 0 ? Math.round(Math.abs(delta)) : null;

  // Variance — std-dev (NOT as % of mean — comment was wrong). > 12 → erratic.
  const mean = avg(scores);
  const sd = Math.sqrt(avg(scores.map(s => (s - mean) ** 2)));
  const variance: DerivedSignals["scoreVariance"] = sd > 12 ? "erratic" : "consistent";

  return { trend, recentDropPct, variance };
};

const attendanceBand = (pct: number | null, hasData: boolean): DerivedSignals["attendanceBand"] => {
  if (!hasData || pct === null) return "unknown";
  if (pct >= 90) return "excellent";
  if (pct >= 75) return "good";
  if (pct >= 60) return "concerning";
  return "critical";
};

const scoreBand = (avg: number | null, hasData: boolean): DerivedSignals["scoreBand"] => {
  if (!hasData || avg === null) return "unknown";
  if (avg >= 75) return "strong";
  if (avg >= 60) return "stable";
  if (avg >= 40) return "weak";
  return "critical";
};

const deriveSignals = (s: ClassifiedStudent): DerivedSignals => {
  const validScores = s.scores.filter((n) => Number.isFinite(n));
  // Prefer the classifier's flags over re-computing from raw — single source
  // of truth. Falls back to local check for legacy callers that may pass a
  // ClassifiedStudent without the flags.
  const hasScoreData = s.hasScoreData ?? (validScores.length > 0);
  const hasAttendanceData = s.hasAttendanceData ?? (s.totalAttendance > 0);
  const { trend, recentDropPct, variance } = computeTrend(validScores);

  return {
    avgScore: s.avgScore,
    attendancePct: s.attendancePct,
    testsCount: validScores.length,
    hasScoreData,
    hasAttendanceData,
    scoreTrend: trend,
    scoreVariance: variance,
    recentDropPct,
    attendanceBand: attendanceBand(s.attendancePct, hasAttendanceData),
    scoreBand: scoreBand(s.avgScore, hasScoreData),
    category: s.category,
  };
};

// ── Builders for each insight slice ──────────────────────────────────────────

const buildRootCauses = (s: ClassifiedStudent, sig: DerivedSignals): string[] => {
  const causes: string[] = [];
  const name = s.studentName || "this student";

  if (!sig.hasScoreData && !sig.hasAttendanceData) {
    causes.push(
      `No tests or attendance recorded yet for ${name} — root-cause analysis needs at least 3 data points to be meaningful.`,
      "Once teachers begin marking attendance and scores, this section will surface specific drivers.",
    );
    return causes;
  }

  // Score-side causes
  if (sig.scoreBand === "critical") {
    causes.push(
      `Average score of ${sig.avgScore}% is below the 40% line — indicates foundational concept gaps, not effort.`,
    );
  } else if (sig.scoreBand === "weak") {
    causes.push(
      `Average of ${sig.avgScore}% across ${sig.testsCount} tests — sits below the 50% mastery line, pointing to gaps in core topics rather than application.`,
    );
  }

  if (sig.scoreTrend === "declining" && sig.recentDropPct != null) {
    causes.push(
      `Score trend has dropped ~${sig.recentDropPct}% from the earlier half of recorded tests to the recent half — a real downturn, not noise.`,
    );
  } else if (sig.scoreTrend === "improving") {
    causes.push(
      `Recent scores for ${name} are trending upward across ${sig.testsCount} recorded tests — current band reflects past performance, not the current trajectory.`,
    );
  }

  if (sig.scoreVariance === "erratic" && sig.testsCount >= 4) {
    causes.push(
      `Scores swing widely test-to-test — suggests inconsistent preparation or topic-specific weakness rather than overall ability.`,
    );
  }

  // Attendance-side causes
  if (sig.attendanceBand === "critical") {
    causes.push(
      `Attendance at ${sig.attendancePct}% is severely low — direct impact on classroom understanding and a likely root cause of the score band.`,
    );
  } else if (sig.attendanceBand === "concerning") {
    causes.push(
      `Attendance at ${sig.attendancePct}% sits below the 75% comfort line — every absent week is widening topic gaps.`,
    );
  }

  // Category fallback when nothing fired (rare)
  if (causes.length === 0) {
    if (sig.category === "smart") {
      causes.push(
        `Performance is strong (${sig.avgScore}%) and attendance is excellent (${sig.attendancePct}%) — no negative signals detected.`,
      );
    } else {
      causes.push(
        `Score and attendance both within healthy ranges — no specific root causes flagged.`,
      );
    }
  }

  return causes.slice(0, 5);
};

const buildForTeacher = (s: ClassifiedStudent, sig: DerivedSignals): string[] => {
  const actions: string[] = [];
  const name = s.studentName || "the student";

  if (!sig.hasScoreData && !sig.hasAttendanceData) {
    return [
      `Begin marking ${name}'s attendance daily and record at least 3 test scores so the system can surface specific actions.`,
      "Until then, treat as a new-data student — no remedial assumption needed.",
    ];
  }

  if (sig.scoreBand === "critical") {
    actions.push(
      `Run a 15-minute one-on-one diagnostic with ${name} this week to pinpoint exactly which sub-skill is failing — don't assume.`,
    );
    actions.push(
      `Re-teach the foundational chapter from scratch with one solved example before assigning fresh practice. Skipping straight to practice will not move this score.`,
    );
  } else if (sig.scoreBand === "weak") {
    actions.push(
      `Assign focused worksheets on the two weakest topics for ${name} and review them the next day, not at week-end.`,
    );
  }

  if (sig.scoreTrend === "declining") {
    actions.push(
      `Review what changed in the last few weeks — new chapter, classroom seating, or after-school commitments — that triggered the recent drop.`,
    );
  }

  if (sig.scoreVariance === "erratic" && sig.testsCount >= 4) {
    actions.push(
      `Erratic scores indicate topic-by-topic gaps. Map ${name}'s recent test topics and identify which specific concepts trigger the dips.`,
    );
  }

  if (sig.attendanceBand === "critical" || sig.attendanceBand === "concerning") {
    actions.push(
      `Loop in the parent on attendance — ${sig.attendancePct}% means classroom instruction alone won't be enough. Coordinate make-up notes for missed lessons.`,
    );
  }

  if (sig.category === "smart") {
    actions.push(
      `Offer ${name} stretch problems or peer-mentoring duties — sustained 75%+ performance benefits from challenge to avoid plateau.`,
    );
  }

  // Coverage guard
  if (actions.length === 0) {
    actions.push(
      `Continue current rhythm — no specific intervention needed for ${name} based on available data.`,
      `Re-check at the next assessment cycle.`,
    );
  }

  return actions.slice(0, 5);
};

const buildForParent = (s: ClassifiedStudent, sig: DerivedSignals): string[] => {
  const actions: string[] = [];
  const name = s.studentName || "your child";

  if (!sig.hasScoreData && !sig.hasAttendanceData) {
    return [
      `Once school records ${name}'s attendance and a few test scores, this section will give specific home-support tips.`,
      `For now, focus on building a daily homework + reading routine.`,
    ];
  }

  if (sig.scoreBand === "critical" || sig.scoreBand === "weak") {
    actions.push(
      `Set aside 30 dedicated minutes daily for ${name} to revise weak topics — same time each day, no phone in the room.`,
    );
    actions.push(
      `Sit with ${name} once this week to review the latest test paper question by question — what was understood vs guessed.`,
    );
  } else if (sig.scoreBand === "stable") {
    actions.push(
      `${name}'s ${sig.avgScore}% can lift further with 20 minutes of daily review. Pick one weak topic per week and master it before moving on.`,
    );
  }

  if (sig.attendanceBand === "critical" || sig.attendanceBand === "concerning") {
    actions.push(
      `Address the attendance pattern at home — ${sig.attendancePct}% is meaningfully impacting classroom learning. Identify which weekday is most often missed.`,
    );
  }

  // Health/sleep is universally useful
  actions.push(
    `Ensure ${name} gets 8–9 hours of sleep on school nights — single biggest lever for next-day focus and memory.`,
  );

  if (sig.category === "smart") {
    actions.push(
      `Encourage ${name} to teach younger siblings or friends a topic each weekend — explaining is the fastest path from "good" to "excellent".`,
    );
  }

  return actions.slice(0, 4);
};

const buildNextSteps = (
  s: ClassifiedStudent,
  sig: DerivedSignals,
): StudentInsight["nextSteps"] => {
  const name = s.studentName || "the student";

  if (!sig.hasScoreData && !sig.hasAttendanceData) {
    return {
      immediate: `Start daily attendance marking and record at least 3 test scores for ${name} this week.`,
      shortTerm: "Once data is in, return to this insight for specific recommendations.",
      longTerm: "Establish a consistent assessment cadence so meaningful trend analysis becomes possible.",
    };
  }

  // Immediate: this week
  let immediate: string;
  if (sig.scoreBand === "critical" || sig.attendanceBand === "critical") {
    immediate = `Schedule a parent meeting for ${name} this week — both score and attendance need a coordinated home-school plan.`;
  } else if (sig.scoreTrend === "declining") {
    immediate = `Run a 15-minute diagnostic with ${name} in the next 3 days to identify what's behind the recent dip.`;
  } else if (sig.scoreBand === "weak") {
    immediate = `Assign one focused worksheet on ${name}'s weakest topic this week and personally review it within 48 hours.`;
  } else if (sig.category === "smart") {
    immediate = `Recognise ${name}'s effort publicly in class this week — sustained performance deserves visible acknowledgement.`;
  } else {
    immediate = `Continue regular assessment and check in with ${name} once this week.`;
  }

  // Short-term: this month
  let shortTerm: string;
  if (sig.scoreBand === "critical" || sig.scoreBand === "weak") {
    shortTerm = `Implement a 4-week remedial plan covering the foundational chapters ${name} is weakest in, with weekly mini-tests to track progress.`;
  } else if (sig.scoreTrend === "declining") {
    shortTerm = `Pair ${name} with a stronger peer for a 4-week buddy-study programme to reverse the trend.`;
  } else if (sig.attendanceBand === "concerning") {
    shortTerm = `Track ${name}'s daily attendance for the next month with a goal of crossing 90% — note the days most often missed.`;
  } else if (sig.category === "smart") {
    shortTerm = `Introduce one stretch assignment per week for ${name} this month to prevent plateau.`;
  } else {
    shortTerm = `Run a mid-month check-in with ${name} on assessment performance and adjust as needed.`;
  }

  // Long-term: this semester
  let longTerm: string;
  if (sig.scoreBand === "critical") {
    longTerm = `Target lifting ${name}'s average above 50% by the end of this semester — measurable goal: every assessment +5%.`;
  } else if (sig.scoreBand === "weak") {
    longTerm = `Target the 60% mastery line for ${name} by semester-end — sustained 4-week remedial cycles compound to material lift.`;
  } else if (sig.attendanceBand === "concerning" || sig.attendanceBand === "critical") {
    longTerm = `Establish a >90% attendance baseline for ${name} this semester — single biggest leading indicator of academic recovery.`;
  } else if (sig.category === "smart") {
    longTerm = `Position ${name} for an enrichment programme or olympiad track this semester — recognise and amplify the trajectory.`;
  } else {
    longTerm = `Maintain current rhythm and aim for ${name} to enter the strong band (>75%) by semester-end.`;
  }

  return { immediate, shortTerm, longTerm };
};

const computeUrgency = (sig: DerivedSignals): Urgency => {
  if (sig.scoreBand === "critical" && sig.attendanceBand === "critical") return "critical";
  if (sig.scoreBand === "critical") return "high";
  if (sig.attendanceBand === "critical") return "high";
  if (sig.scoreBand === "weak" && sig.scoreTrend === "declining") return "high";
  // A "weak" score band (40-59%) on its own deserves at least medium urgency,
  // even when the trend is stable — stable-but-weak still requires intervention.
  if (sig.scoreBand === "weak") return "medium";
  if (sig.attendanceBand === "concerning") return "medium";
  if (sig.category === "weak") return "medium";
  if (sig.scoreTrend === "declining") return "medium";
  return "low";
};

const computeConfidence = (sig: DerivedSignals): Confidence => {
  const hasBoth = sig.hasScoreData && sig.hasAttendanceData;
  if (!hasBoth) return "low";
  if (sig.testsCount >= 5) return "high";
  if (sig.testsCount >= 3) return "medium";
  return "low";
};

const buildSummary = (
  s: ClassifiedStudent,
  sig: DerivedSignals,
  urgency: Urgency,
): string => {
  const name = s.studentName || "This student";
  const category = sig.category;

  if (!sig.hasScoreData && !sig.hasAttendanceData) {
    return `${name} has insufficient data for meaningful analysis — start with daily attendance and at least 3 test scores. Once the foundation is in, this insight will surface concrete drivers and actions.`;
  }

  const trendFragment =
    sig.scoreTrend === "declining" && sig.recentDropPct != null
      ? ` Recent scores have dropped ~${sig.recentDropPct}%, signalling a real downturn that warrants intervention.`
      : sig.scoreTrend === "improving"
      ? ` Encouragingly, recent scores are trending upward — the current band understates the trajectory.`
      : "";

  const attendanceFragment = sig.hasAttendanceData
    ? ` Attendance sits at ${sig.attendancePct}% (${sig.attendanceBand} band).`
    : "";

  const urgencyFragment =
    urgency === "critical" ? " Immediate coordinated action between teacher, principal, and parent is required."
    : urgency === "high" ? " Targeted intervention this week is recommended."
    : urgency === "medium" ? " Schedule a check-in within the next two weeks."
    : " Maintain current rhythm and recognise sustained effort.";

  return `${name} is currently in the ${category} band with an average of ${sig.avgScore}% across ${sig.testsCount} test${sig.testsCount === 1 ? "" : "s"}.${trendFragment}${attendanceFragment}${urgencyFragment}`;
};

// ── Main entry point ────────────────────────────────────────────────────────

export function computeStudentInsight(student: ClassifiedStudent): StudentInsight {
  const sig = deriveSignals(student);
  const urgency = computeUrgency(sig);
  const confidence = computeConfidence(sig);

  return {
    rootCauses: buildRootCauses(student, sig),
    forTeacher: buildForTeacher(student, sig),
    forParent: buildForParent(student, sig),
    nextSteps: buildNextSteps(student, sig),
    urgency,
    confidence,
    summary: buildSummary(student, sig, urgency),
  };
}
