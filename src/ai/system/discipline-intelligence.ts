// Deterministic discipline intelligence — replaces the AI prompt at
// ai/prompts/discipline-prompt.ts (DISCIPLINE_PROMPT).
//
// Pure function over real Firestore incident logs. Returns the same
// 3-key shape (behavioral_patterns / related_incidents /
// intervention_suggestions) that DisciplineIntelligence.tsx renders.
//
// Why this is safe to system-replace (not AI):
//   AI hallucinating wrong student names on incident reports is a serious
//   trust violation — the deterministic version can only surface students
//   who actually have ≥ N logged incidents in real Firestore data.

export type DisciplineLog = {
  // String OR legacy nested object {name, grade} — coerced to a string in
  // the patterns builder before any string method is called.
  student?: string | { name?: string; grade?: string } | null;
  type?: string;       // incident category, e.g. "Bullying", "Late submission"
  severity?: string;   // "Low" | "Medium" | "High" | "Critical"
  date?: string;
  location?: string;
};

// Coerce the polymorphic student field to a clean string. Was: callers
// did `(l.student || "Unknown").trim()` which crashed when `l.student` was
// the legacy nested object `{name, grade}` (objects don't have `.trim`).
const studentNameOf = (s: DisciplineLog["student"]): string => {
  if (typeof s === "string") return s.trim();
  if (s && typeof s === "object" && typeof s.name === "string") return s.name.trim();
  return "";
};

export type DisciplineInput = {
  logs: DisciplineLog[];
  historical_incidents_count?: number;
};

export type BehavioralPattern = {
  student: string;
  pattern_detected: string;
  severity: "Low" | "Medium" | "High" | "Critical";
};

export type RelatedIncident = {
  cluster_name: string;
  linked_cases: number;
  common_factor: string;
};

export type InterventionSuggestion = {
  action: string;
  target_group: string;
  priority: "Low" | "Medium" | "High";
};

export type DisciplineOutput = {
  behavioral_patterns: BehavioralPattern[];
  related_incidents: RelatedIncident[];
  intervention_suggestions: InterventionSuggestion[];
};

const REPEAT_OFFENDER_THRESHOLD = 3;
const CLUSTER_THRESHOLD = 2;
const MAX_PATTERNS = 6;
const MAX_CLUSTERS = 5;
const MAX_SUGGESTIONS = 5;

const normSeverity = (s: string | undefined): "Low" | "Medium" | "High" | "Critical" => {
  const v = (s || "").trim().toLowerCase();
  if (v === "critical") return "Critical";
  if (v === "high") return "High";
  if (v === "low") return "Low";
  return "Medium";
};

const severityRank = (s: "Low" | "Medium" | "High" | "Critical"): number =>
  ({ Low: 1, Medium: 2, High: 3, Critical: 4 }[s]);

/**
 * Pick the worst severity across a list of incidents — used to assign a
 * single severity tag to a student's overall behavioral pattern.
 */
const worstSeverity = (rows: DisciplineLog[]): "Low" | "Medium" | "High" | "Critical" => {
  let worst: "Low" | "Medium" | "High" | "Critical" = "Low";
  rows.forEach((r) => {
    const s = normSeverity(r.severity);
    if (severityRank(s) > severityRank(worst)) worst = s;
  });
  return worst;
};

/**
 * Build the per-student behavioral patterns list. Only students with
 * REPEAT_OFFENDER_THRESHOLD+ incidents are surfaced — single-incident
 * students don't represent a pattern and naming them would be unfair.
 */
const buildBehavioralPatterns = (logs: DisciplineLog[]): BehavioralPattern[] => {
  const byStudent = new Map<string, DisciplineLog[]>();
  logs.forEach((l) => {
    const name = studentNameOf(l.student);
    if (!name || name === "Unknown") return;
    if (!byStudent.has(name)) byStudent.set(name, []);
    byStudent.get(name)!.push(l);
  });

  const patterns: BehavioralPattern[] = [];
  byStudent.forEach((rows, student) => {
    if (rows.length < REPEAT_OFFENDER_THRESHOLD) return;
    // Find the most common incident type for this student
    const typeCount = new Map<string, number>();
    rows.forEach((r) => {
      const t = (r.type || "Incident").trim();
      typeCount.set(t, (typeCount.get(t) || 0) + 1);
    });
    const sortedTypes = [...typeCount.entries()].sort((a, b) => b[1] - a[1]);
    const [topType, topCount] = sortedTypes[0];
    const sev = worstSeverity(rows);

    const patternDescription = topCount === rows.length
      ? `${rows.length} incidents — all of type "${topType}". Recurring single-issue pattern.`
      : `${rows.length} incidents in this window — most frequent type "${topType}" (${topCount} of ${rows.length}); ${sortedTypes.length > 1 ? `also ${sortedTypes.slice(1, 3).map(([t]) => `"${t}"`).join(", ")}` : "single category"}.`;

    patterns.push({ student, pattern_detected: patternDescription, severity: sev });
  });

  // Sort: Critical first, then by incident count desc
  patterns.sort((a, b) => {
    const sd = severityRank(b.severity) - severityRank(a.severity);
    if (sd !== 0) return sd;
    return 0;
  });
  return patterns.slice(0, MAX_PATTERNS);
};

/**
 * Group incidents by type → become "clusters". Only clusters with
 * CLUSTER_THRESHOLD+ cases are surfaced.
 */
const buildRelatedIncidents = (logs: DisciplineLog[]): RelatedIncident[] => {
  const byType = new Map<string, DisciplineLog[]>();
  logs.forEach((l) => {
    const type = (l.type || "Uncategorised").trim();
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(l);
  });

  const clusters: RelatedIncident[] = [];
  byType.forEach((rows, type) => {
    if (rows.length < CLUSTER_THRESHOLD) return;
    // Find the most common location for this cluster (becomes the
    // "common_factor"). Falls back to severity if no location dominates.
    const locCount = new Map<string, number>();
    rows.forEach((r) => {
      const loc = (r.location || "").trim();
      if (loc && loc !== "—") locCount.set(loc, (locCount.get(loc) || 0) + 1);
    });
    const dominantLoc = [...locCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const dominantLocFraction = dominantLoc ? dominantLoc[1] / rows.length : 0;
    // Use the coerced name string — the raw `r.student` may be the legacy
    // nested object, and Set keyed on object refs would count every row as
    // unique, breaking the single-student cluster heuristic below.
    const studentCount = new Set(rows.map((r) => studentNameOf(r.student) || "Unknown")).size;

    let common_factor: string;
    // Single-student clusters take priority — when the same name owns every
    // case in a cluster, the location is incidental; the actionable signal
    // is "this is one student's recurring issue", not "this is a place".
    if (studentCount === 1) {
      common_factor = `All ${rows.length} cases involve a single student — individual intervention indicated.`;
    } else if (dominantLoc && dominantLocFraction >= 0.5) {
      common_factor = `${dominantLoc[1]} of ${rows.length} cases occurred at "${dominantLoc[0]}" — location-driven trigger.`;
    } else {
      const worst = worstSeverity(rows);
      common_factor = `${studentCount} different students involved across ${rows.length} cases; worst severity tag in cluster: ${worst}.`;
    }

    clusters.push({
      cluster_name: `Recurring "${type}" cases`,
      linked_cases: rows.length,
      common_factor,
    });
  });

  clusters.sort((a, b) => b.linked_cases - a.linked_cases);
  return clusters.slice(0, MAX_CLUSTERS);
};

/**
 * Build deterministic intervention suggestions from the patterns +
 * clusters above. Each suggestion ties to a real signal — never invented.
 */
const buildInterventions = (
  patterns: BehavioralPattern[],
  clusters: RelatedIncident[],
  totalLogs: number,
): InterventionSuggestion[] => {
  const suggestions: InterventionSuggestion[] = [];

  // Critical / High severity students → counsellor referral (highest priority)
  const criticalStudents = patterns.filter((p) => p.severity === "Critical" || p.severity === "High");
  if (criticalStudents.length > 0) {
    suggestions.push({
      action: `Refer ${criticalStudents.length} repeat-offender student${criticalStudents.length > 1 ? "s" : ""} (${criticalStudents.slice(0, 3).map((s) => s.student).join(", ")}${criticalStudents.length > 3 ? ", ..." : ""}) to the school counsellor this week.`,
      target_group: "Critical / High-severity repeat offenders",
      priority: "High",
    });
  }

  // Location-driven cluster → environmental fix (high priority if 3+ cases)
  const locationClusters = clusters.filter((c) =>
    /occurred at "/.test(c.common_factor),
  );
  if (locationClusters.length > 0) {
    const top = locationClusters[0];
    suggestions.push({
      action: `Increase supervision and review safety protocols where the dominant cluster is occurring — "${top.cluster_name}" has ${top.linked_cases} linked cases.`,
      target_group: "All students in the affected location",
      priority: top.linked_cases >= 5 ? "High" : "Medium",
    });
  }

  // Repeat patterns → parent communication
  if (patterns.length > 0) {
    suggestions.push({
      action: `Schedule parent meetings for the ${patterns.length} student${patterns.length > 1 ? "s" : ""} with repeat behavioural patterns to align home support.`,
      target_group: "Parents of repeat-offender students",
      priority: criticalStudents.length > 0 ? "High" : "Medium",
    });
  }

  // School-wide: if total logs exceed a threshold, propose a
  // school-assembly behavioural reset
  if (totalLogs >= 15) {
    suggestions.push({
      action: `Run a short school-assembly session this fortnight on the most common incident category — ${totalLogs} incidents logged in this window suggests a culture-level message would land.`,
      target_group: "Whole school",
      priority: "Medium",
    });
  }

  // No patterns at all → positive reinforcement message
  if (patterns.length === 0 && clusters.length === 0) {
    suggestions.push({
      action: "No repeat patterns or clusters detected — recognise teachers and students publicly to reinforce the current discipline culture.",
      target_group: "Whole school",
      priority: "Low",
    });
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
};

export function computeDisciplineIntelligence(input: DisciplineInput): DisciplineOutput {
  const logs = Array.isArray(input?.logs) ? input.logs : [];
  const patterns = buildBehavioralPatterns(logs);
  const clusters = buildRelatedIncidents(logs);
  const interventions = buildInterventions(patterns, clusters, logs.length);

  return {
    behavioral_patterns: patterns,
    related_incidents: clusters,
    intervention_suggestions: interventions,
  };
}
