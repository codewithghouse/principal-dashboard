// Deterministic recommendation engine — replaces the AI prompt at
// ai/prompts/recommendation-prompt.ts (RECOMMENDATION_PROMPT).
//
// Pure function over real Firestore-aggregated data. Returns the same
// 3-key shape (improvement_recommendations / teacher_effectiveness /
// matched_templates) the Recommendations.tsx component renders.
//
// Logic:
//   • improvement_recommendations — per subject, choose template based on
//     average band + trend (improving/declining/stable). Only weak/declining
//     subjects get aggressive recommendations; strong subjects get a brief
//     "maintain" note so the principal sees coverage of every subject they
//     pass in.
//   • teacher_effectiveness — score = clamp(class_average, 0..100). Verdict
//     comes from the score band (Excellent / Strong / Moderate / Needs
//     support). No invented metrics; we only score on what we have.
//   • matched_templates — emits trigger templates when (a) a subject is
//     declining, (b) a subject is below 50%, (c) risk_students > 0.

export type SubjectPerformance = {
  subject: string;
  average_score: number;
  trend: "improving" | "declining" | "stable";
};

export type TeacherStat = {
  teacher: string;
  subject: string;
  class_average: number;
};

export type RecommendationsInput = {
  grade?: string;
  subject_performance: SubjectPerformance[];
  teacher_stats: TeacherStat[];
  risk_students: number;
};

export type ImprovementRecommendation = {
  subject: string;
  recommendation: string;
};

export type TeacherEffectiveness = {
  teacher: string;
  effectiveness_score: number;
  evaluation: string;
};

export type MatchedTemplate = {
  type: string;
  trigger: string;
};

export type RecommendationsOutput = {
  improvement_recommendations: ImprovementRecommendation[];
  teacher_effectiveness: TeacherEffectiveness[];
  matched_templates: MatchedTemplate[];
};

const MAX_RECOMMENDATIONS = 8;
const MAX_TEACHERS = 12;
const MAX_TEMPLATES = 6;

const recommendationFor = (sp: SubjectPerformance): string => {
  const { subject, average_score, trend } = sp;

  // Critical: average <50% — needs structural intervention regardless of trend
  if (average_score < 50) {
    return `${subject} is at ${average_score}% — below passing threshold. Schedule a curriculum review with the subject teacher and assign 2 weeks of remedial classes for the bottom-third of students.`;
  }

  // Declining — even strong subjects deserve a flag
  if (trend === "declining") {
    if (average_score >= 75) {
      return `${subject} at ${average_score}% but trending down. Investigate which chapter or test triggered the dip and run a targeted recap session.`;
    }
    return `${subject} at ${average_score}% and declining. Pair the teacher with a senior mentor for fortnightly review and reset the term plan.`;
  }

  // Stable / mid-band 50-69
  if (average_score < 70) {
    return `${subject} at ${average_score}% (${trend}). Introduce one weekly mock-style exercise and review the answer scripts — class will lift into the 70%+ band within a month.`;
  }

  // Stable / strong-ish 70-84
  if (average_score < 85) {
    return `${subject} at ${average_score}% (${trend}). Encourage the teacher to introduce one stretch problem per week to break out of the comfort plateau.`;
  }

  // Excellent 85+ improving or stable
  if (trend === "improving") {
    return `${subject} at ${average_score}% and still climbing. Recognise the teacher publicly and consider adding an enrichment track for the top quartile.`;
  }
  return `${subject} at ${average_score}% — performing well. Maintain the current rhythm and review every 6 weeks.`;
};

const teacherEvaluationFor = (score: number): string => {
  if (score >= 85) return `Excellent — class average of ${score}% places this teacher in the top tier. Showcase practices in next staff briefing.`;
  if (score >= 70) return `Strong — class average of ${score}% is above target. Light-touch coaching to push from "strong" to "excellent" recommended.`;
  if (score >= 55) return `Moderate — class average of ${score}% is acceptable but below the 70% comfort line. Pair with a senior teacher for fortnightly mentoring.`;
  if (score >= 40) return `Needs support — class average of ${score}% is concerning. Schedule classroom observations this week and draw up a 30-day improvement plan.`;
  return `Critical — class average of ${score}% requires immediate intervention. Re-evaluate teaching methodology, consider syllabus repacing, and involve subject HOD.`;
};

export function computeRecommendations(input: RecommendationsInput): RecommendationsOutput {
  const subjectPerformance = Array.isArray(input?.subject_performance) ? input.subject_performance : [];
  const teacherStats = Array.isArray(input?.teacher_stats) ? input.teacher_stats : [];
  const riskStudents = Math.max(0, Math.floor(input?.risk_students ?? 0));

  // ── Improvement recommendations — sort: critical (<50%) first, then declining,
  //    then by ascending average so weakest is at the top
  const sortedSubjects = [...subjectPerformance].sort((a, b) => {
    const aCrit = a.average_score < 50 ? 0 : 1;
    const bCrit = b.average_score < 50 ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;
    const aDecl = a.trend === "declining" ? 0 : 1;
    const bDecl = b.trend === "declining" ? 0 : 1;
    if (aDecl !== bDecl) return aDecl - bDecl;
    return a.average_score - b.average_score;
  });

  const improvement_recommendations: ImprovementRecommendation[] = sortedSubjects
    .slice(0, MAX_RECOMMENDATIONS)
    .map((sp) => ({ subject: sp.subject, recommendation: recommendationFor(sp) }));

  // ── Teacher effectiveness — sort: lowest first (need most support)
  const teacher_effectiveness: TeacherEffectiveness[] = [...teacherStats]
    .sort((a, b) => a.class_average - b.class_average)
    .slice(0, MAX_TEACHERS)
    .map((t) => {
      const score = Math.max(0, Math.min(100, Math.round(t.class_average)));
      return {
        teacher: t.teacher,
        effectiveness_score: score,
        evaluation: teacherEvaluationFor(score),
      };
    });

  // ── Matched templates — only emit when a real signal fires
  const matched_templates: MatchedTemplate[] = [];

  const decliningSubjects = subjectPerformance.filter((s) => s.trend === "declining");
  if (decliningSubjects.length > 0) {
    matched_templates.push({
      type: "Subject Decline Alert",
      trigger: `${decliningSubjects.length} subject${decliningSubjects.length > 1 ? "s" : ""} (${decliningSubjects.slice(0, 3).map((s) => s.subject).join(", ")}${decliningSubjects.length > 3 ? "..." : ""}) showing a downward trend in recent assessments.`,
    });
  }

  const criticalSubjects = subjectPerformance.filter((s) => s.average_score < 50);
  if (criticalSubjects.length > 0) {
    matched_templates.push({
      type: "Below Passing Threshold",
      trigger: `${criticalSubjects.length} subject${criticalSubjects.length > 1 ? "s" : ""} below 50% average — curriculum review required.`,
    });
  }

  if (riskStudents > 0) {
    matched_templates.push({
      type: "At-Risk Student Cluster",
      trigger: `${riskStudents} student${riskStudents > 1 ? "s" : ""} averaging below 50% across all subjects — recommend pairing each with a mentor and scheduling parent meetings.`,
    });
  }

  // Coverage guard: if everything is healthy, surface a positive template so
  // the card never renders empty.
  if (matched_templates.length === 0) {
    matched_templates.push({
      type: "School Health: Strong",
      trigger: "No critical signals detected across subjects, teachers, or student risk in this window. Recognise the staff in the next briefing to reinforce the trend.",
    });
  }

  return {
    improvement_recommendations,
    teacher_effectiveness,
    matched_templates: matched_templates.slice(0, MAX_TEMPLATES),
  };
}
