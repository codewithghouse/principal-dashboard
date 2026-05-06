import { useState, useEffect, useMemo } from "react";
import {
  FileText, FileSpreadsheet, BarChart2, Loader2, Download,
  ChevronLeft, Users, CalendarCheck, TrendingUp, AlertTriangle, Shield,
  Settings, Eye,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { pctOfDoc, isPresent } from "@/lib/scoreUtils";

interface Props {
  templateName: string;
  onBack: () => void;
}

const REPORT_TYPES = [
  "Student Progress",
  "Class Performance",
  "Monthly Attendance",
  "Risk Students",
  "Exam Results",
  "Teacher Performance",
  "School Overview",
];

// Per-template aggregated data. Single fetch on mount, then `buildPayload`
// derives template-specific previews and report sections from it.
// This is the fix for "every template shows identical data" — bugfix
// memory: bug_pattern_fabricated_fallback (every template-payload was
// identical, bypassing the user's reportType selection).
interface PerStudent {
  key: string; name: string; classLabel: string;
  avgScore: number; testCount: number;
  attendance: number; presentDays: number; totalDays: number;
}
interface PerClass    { classLabel: string; students: number; avgScore: number; attendance: number }
interface PerSubject  { subject: string; tests: number; avgScore: number; topScore: number }
interface PerTeacher  { name: string; subjects: string[]; classes: string[]; avgClassScore: number }
// Raw rows captured ONCE per session (mount). Filters then mutate which
// subset participates in aggregation — re-fetching from Firestore on every
// keystroke would be wasteful (and racy with branchId backfill lag).
interface RawData {
  enrollments: any[];
  uniqueScores: Array<{ raw: any; pct: number }>;
  attendances: any[];
  discRecs: any[];
  teachers: any[];
  classDocs: any[];
  taDocs: any[];
}

// Filters that apply to the report aggregation. Empty/undefined means
// "no filter on this dimension". Matching is lenient bidirectional
// substring for grade/section/subject (memory: pattern_3tier_attribution
// — class-label drift defeats strict equality).
interface ReportFilters {
  grade: string;
  section: string;
  subject: string;
  dateFrom: string;
  dateTo: string;
}

interface AggregatedData {
  totalStudents: number;
  avgAttendance: number;
  avgMarks: number;
  passRate: number;
  atRisk: number;
  incidents: number;
  perStudent: PerStudent[];
  perClass: PerClass[];
  perSubject: PerSubject[];
  perTeacher: PerTeacher[];
  disciplineByType: Array<{ type: string; count: number }>;
}

// ─────────────────────────────────────────────────────────────────────
// Filter helpers — bidirectional substring matching defends against
// label drift (Math/Mathematics, "Grade 6"/6/VI). Memory:
// pattern_3tier_attribution + bug_pattern_class_label_normalization.
// ─────────────────────────────────────────────────────────────────────
const matchesText = (filterVal: string, recVal: string): boolean => {
  const f = String(filterVal || "").trim().toLowerCase();
  if (!f || f === "all") return true;
  const r = String(recVal || "").trim().toLowerCase();
  if (!r) return false;
  return r === f || r.includes(f) || f.includes(r);
};

const recordTimestamp = (rec: any): Date | null => {
  // Enumerate every writer-timestamp variant. Memory:
  // bug_pattern_filterbytime_field_drift — each collection writes a
  // different field; missing one silently drops ~40% of records.
  const ts = rec?.timestamp || rec?.createdAt || rec?.uploadedAt
    || rec?.updatedAt || rec?.date || rec?.sentAt;
  if (!ts) return null;
  if (ts?.toDate) return ts.toDate();
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (ts instanceof Date) return ts;
  return null;
};

// Pure aggregation function — takes raw fetched rows + active filters,
// returns the rolled-up AggregatedData for the current report. Re-runs
// on every filter change via the useMemo in the component above.
function aggregateData(raw: RawData, filters: ReportFilters): AggregatedData {
  // ─── classes & class meta ───
  const classNameById = new Map<string, string>();
  const classMetaById = new Map<string, { label: string; grade: string; section: string }>();
  raw.classDocs.forEach((c: any) => {
    const cgrade = String(c.grade || c.gradeName || "").trim();
    const csection = String(c.section || "").trim();
    const label = c.name || c.className ||
      (csection ? `${cgrade} ${csection}`.trim() : cgrade) || c.id;
    classNameById.set(c.id, label);
    classMetaById.set(c.id, { label, grade: cgrade, section: csection });
  });

  // ─── date range predicate ───
  const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const toDate = filters.dateTo ? (() => { const t = new Date(filters.dateTo); t.setHours(23, 59, 59, 999); return t; })() : null;
  const inDateRange = (rec: any): boolean => {
    if (!fromDate && !toDate) return true;
    const d = recordTimestamp(rec);
    // Strict: when user has set a date filter, drop records without dates.
    if (!d) return false;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  };

  // ─── grade/section filter on a class via classId ───
  const hasGSFilter = !!(filters.grade || filters.section);
  const classMatches = (cid: string, fallbackGrade?: string, fallbackSection?: string): boolean => {
    if (!hasGSFilter) return true;
    const meta = cid ? classMetaById.get(cid) : null;
    const g = meta?.grade ?? fallbackGrade ?? "";
    const s = meta?.section ?? fallbackSection ?? "";
    return matchesText(filters.grade, g) && matchesText(filters.section, s);
  };

  // ─── studentInfo (filtered by grade/section) ───
  // Each studentInfo carries name, classLabel, AND every classId they're
  // enrolled in (multi-section coverage). Memory: bug_pattern_enrollment_row_dedup.
  const studentInfo = new Map<string, {
    name: string; classLabel: string; classId: string; email: string;
    allClassIds: Set<string>;
  }>();
  raw.enrollments.forEach((e: any) => {
    const k = String(e.studentId || (e.studentEmail || "").toLowerCase() || "");
    if (!k) return;
    const enrollClassId = String(e.classId || "");
    // Apply grade/section filter — enrollment must match.
    const enrollGrade = String(e.grade || "");
    const enrollSection = String(e.section || "");
    if (!classMatches(enrollClassId, enrollGrade, enrollSection)) return;

    const fromMap = enrollClassId ? classNameById.get(enrollClassId) : "";
    const cls = [e.grade, e.className, e.class].find((v: any) => v) || "";
    const fallbackLabel = enrollSection ? `${cls} ${enrollSection}`.trim() : String(cls);
    const classLabel = fromMap || fallbackLabel;
    if (!studentInfo.has(k)) {
      studentInfo.set(k, {
        name: e.studentName || e.name || e.studentEmail || "—",
        classLabel,
        classId: enrollClassId,
        email: (e.studentEmail || "").toLowerCase(),
        allClassIds: new Set(enrollClassId ? [enrollClassId] : []),
      });
    } else if (enrollClassId) {
      studentInfo.get(k)!.allClassIds.add(enrollClassId);
    }
  });
  const totalStudents = studentInfo.size;
  const activeStudentKeys = new Set(studentInfo.keys());
  const activeClassIds = new Set<string>();
  studentInfo.forEach(info => info.allClassIds.forEach(c => activeClassIds.add(c)));

  // ─── filtered scores (date + subject + active student) ───
  const scoresFiltered = raw.uniqueScores.filter(({ raw: s }) => {
    if (!inDateRange(s)) return false;
    if (filters.subject && !matchesText(filters.subject, String(s.subject || s.subjectName || ""))) return false;
    const k = String(s.studentId || (s.studentEmail || "").toLowerCase() || "");
    if (k && hasGSFilter && !activeStudentKeys.has(k)) return false;
    // Score has classId but no studentKey match — only keep if classId is active.
    const cid = String(s.classId || "");
    if (!k && hasGSFilter && cid && !activeClassIds.has(cid)) return false;
    return true;
  });

  const avgMarks = scoresFiltered.length
    ? Math.round(scoresFiltered.reduce((a, b) => a + b.pct, 0) / scoresFiltered.length)
    : 0;
  const passCount = scoresFiltered.filter(s => s.pct >= 35).length;
  const passRate  = scoresFiltered.length ? Math.round((passCount / scoresFiltered.length) * 100) : 0;

  // ─── filtered attendance (date + active student) ───
  const attFiltered = raw.attendances.filter((a: any) => {
    if (!inDateRange(a)) return false;
    const k = String(a.studentId || (a.studentEmail || "").toLowerCase() || "");
    if (k && hasGSFilter && !activeStudentKeys.has(k)) return false;
    const cid = String(a.classId || "");
    if (!k && hasGSFilter && cid && !activeClassIds.has(cid)) return false;
    return true;
  });

  // ─── per-student score+attendance ───
  const scoreByStudent = new Map<string, number[]>();
  scoresFiltered.forEach(({ raw: s, pct }) => {
    const k = String(s.studentId || (s.studentEmail || "").toLowerCase() || "");
    if (!k) return;
    if (!scoreByStudent.has(k)) scoreByStudent.set(k, []);
    scoreByStudent.get(k)!.push(pct);
  });
  const attByStudent = new Map<string, { present: number; total: number }>();
  attFiltered.forEach((a: any) => {
    const k = String(a.studentId || (a.studentEmail || "").toLowerCase() || "");
    if (!k) return;
    if (!attByStudent.has(k)) attByStudent.set(k, { present: 0, total: 0 });
    const r = attByStudent.get(k)!;
    r.total++;
    if (isPresent(a)) r.present++;
  });

  const perStudent: PerStudent[] = [];
  let atRisk = 0;
  studentInfo.forEach((info, k) => {
    const sList = scoreByStudent.get(k) || [];
    const avgS  = sList.length ? Math.round(sList.reduce((a, b) => a + b, 0) / sList.length) : 0;
    const att   = attByStudent.get(k) || { present: 0, total: 0 };
    const attPct = att.total ? Math.round((att.present / att.total) * 100) : 0;
    const flagged = (sList.length > 0 && avgS < 50) || (att.total > 0 && attPct < 70);
    if (flagged) atRisk++;
    perStudent.push({
      key: k, name: info.name, classLabel: info.classLabel,
      avgScore: avgS, testCount: sList.length,
      attendance: attPct, presentDays: att.present, totalDays: att.total,
      flagged,
    });
  });
  perStudent.sort((a, b) => b.avgScore - a.avgScore);

  const presentCountAll = attFiltered.filter(isPresent).length;
  const avgAttendance = attFiltered.length
    ? Math.round((presentCountAll / attFiltered.length) * 100)
    : 0;

  // ─── per-class (keyed by classId — stable join) ───
  type ClassBucket = { scores: number[]; att: { p: number; t: number }; studentKeys: Set<string> };
  const classBucket = new Map<string, ClassBucket>();
  const ensureBucket = (cid: string): ClassBucket => {
    if (!classBucket.has(cid)) {
      classBucket.set(cid, { scores: [], att: { p: 0, t: 0 }, studentKeys: new Set() });
    }
    return classBucket.get(cid)!;
  };
  // Seed only classes that pass grade/section filter.
  raw.classDocs.forEach((c: any) => {
    if (!classMatches(c.id)) return;
    ensureBucket(c.id);
  });
  studentInfo.forEach((info, k) => {
    info.allClassIds.forEach(cid => {
      if (classBucket.has(cid)) ensureBucket(cid).studentKeys.add(k);
    });
  });
  scoresFiltered.forEach(({ raw: s, pct }) => {
    const cid = String(s.classId || "");
    if (!cid || !classBucket.has(cid)) return;
    ensureBucket(cid).scores.push(pct);
  });
  attFiltered.forEach((a: any) => {
    const cid = String(a.classId || "");
    if (!cid || !classBucket.has(cid)) return;
    const b = ensureBucket(cid);
    b.att.t++;
    if (isPresent(a)) b.att.p++;
  });
  const perClass: PerClass[] = [];
  classBucket.forEach((m, cid) => {
    const label = classNameById.get(cid) || cid;
    const avgScore = m.scores.length ? Math.round(m.scores.reduce((a, b) => a + b, 0) / m.scores.length) : 0;
    const attendance = m.att.t ? Math.round((m.att.p / m.att.t) * 100) : 0;
    if (m.studentKeys.size === 0 && m.scores.length === 0 && m.att.t === 0) return;
    perClass.push({ classLabel: label, students: m.studentKeys.size, avgScore, attendance });
  });
  perClass.sort((a, b) => b.avgScore - a.avgScore);

  // ─── per-subject ───
  const subjMap = new Map<string, { scores: number[] }>();
  scoresFiltered.forEach(({ raw: s, pct }) => {
    const subj = String(s.subject || s.subjectName || "").trim();
    if (!subj) return;
    if (!subjMap.has(subj)) subjMap.set(subj, { scores: [] });
    subjMap.get(subj)!.scores.push(pct);
  });
  const perSubject: PerSubject[] = [];
  subjMap.forEach((m, subjectName) => {
    if (m.scores.length === 0) return;
    const avgScore = Math.round(m.scores.reduce((a, b) => a + b, 0) / m.scores.length);
    const topScore = Math.round(Math.max(...m.scores));
    perSubject.push({ subject: subjectName, tests: m.scores.length, avgScore, topScore });
  });
  perSubject.sort((a, b) => b.avgScore - a.avgScore);

  // ─── per-teacher (3-tier attribution against FILTERED scores) ───
  const perTeacher: PerTeacher[] = raw.teachers.map((t: any) => {
    const tEmail = String(t.email || "").toLowerCase();
    const tAssigns = raw.taDocs.filter((a: any) =>
      a.teacherId === t.id ||
      (tEmail && String(a.teacherEmail || "").toLowerCase() === tEmail)
    );
    const subjectsSet = new Set<string>();
    tAssigns.forEach((a: any) => a.subject && subjectsSet.add(a.subject));
    if (t.subject) subjectsSet.add(t.subject);
    if (Array.isArray(t.subjects)) t.subjects.forEach((s: string) => s && subjectsSet.add(s));
    const subjects = [...subjectsSet];
    const teacherSubjectKeys = new Set(subjects.map(s => s.toLowerCase()));

    const classIdsSet = new Set<string>();
    tAssigns.forEach((a: any) => a.classId && classIdsSet.add(String(a.classId)));
    raw.classDocs.forEach((c: any) => {
      if (c.teacherId === t.id) { classIdsSet.add(c.id); return; }
      const cEmail = String(c.teacherEmail || "").toLowerCase();
      if (tEmail && cEmail && cEmail === tEmail) classIdsSet.add(c.id);
    });
    const classIds = [...classIdsSet];
    const classLabels = classIds.map(cid => classNameById.get(cid) || cid);

    const tScores = scoresFiltered.filter(({ raw: s }) => {
      if (s.teacherId && s.teacherId === t.id) return true;
      const sEmail = String(s.teacherEmail || "").toLowerCase();
      if (tEmail && sEmail && sEmail === tEmail) return true;
      if (!s.classId || !classIds.includes(String(s.classId))) return false;
      const sub = String(s.subject || s.subjectName || "").toLowerCase().trim();
      if (!sub) return true;
      if (teacherSubjectKeys.size === 0) return true;
      for (const key of teacherSubjectKeys) {
        if (key === sub || key.includes(sub) || sub.includes(key)) return true;
      }
      return false;
    });

    const avgClassScore = tScores.length
      ? Math.round(tScores.reduce((a, b) => a + b.pct, 0) / tScores.length)
      : 0;

    return {
      name: t.name || t.teacherName || t.fullName || t.email || "Unnamed Teacher",
      subjects,
      classes: classLabels,
      avgClassScore,
    };
  });
  perTeacher.sort((a, b) => b.avgClassScore - a.avgClassScore);

  // ─── discipline (date-filtered) ───
  const discFiltered = raw.discRecs.filter((d: any) => {
    if (!inDateRange(d)) return false;
    const k = String(d.studentId || (d.studentEmail || "").toLowerCase() || "");
    if (k && hasGSFilter && !activeStudentKeys.has(k)) return false;
    return true;
  });
  const incidents = discFiltered.length;
  const discTypeMap = new Map<string, number>();
  discFiltered.forEach((d: any) => {
    const t = String(d.type || d.category || d.reason || "Other");
    discTypeMap.set(t, (discTypeMap.get(t) || 0) + 1);
  });
  const disciplineByType = Array.from(discTypeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalStudents, avgMarks, atRisk, incidents, avgAttendance, passRate,
    perStudent, perClass, perSubject, perTeacher,
    disciplineByType,
  };
}

const GenerateReport = ({ templateName, onBack }: Props) => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

  const [reportType, setReportType] = useState(
    templateName && templateName !== "Custom" ? templateName : "Student Progress"
  );
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [grade,     setGrade]     = useState("");
  const [section,   setSection]   = useState("");
  const [subject,   setSubject]   = useState("");
  const [format,    setFormat]    = useState<"PDF" | "Excel" | "CSV">("PDF");

  const [rawData,    setRawData]    = useState<RawData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!userData?.schoolId) return;
    const go = async () => {
      try {
        const sid = userData.schoolId;
        // schoolId-only at server; branchId in-memory.
        // Memory: branchid_inference_lag — server-side branchId where()
        // silently drops freshly-written records during the 1-2s
        // enforceBranchId Cloud Function backfill window.
        const C: any[] = [where("schoolId", "==", sid)];
        const inBranch = (raw: any) =>
          !userData.branchId || !raw?.branchId || raw.branchId === userData.branchId;

        // Parallel fetch of every collection we need.
        const [
          enrollSnap, testScoresSnap, gradebookSnap, resultsSnap,
          discSnap, attSnap, teachersSnap,
          classesSnap, taSnap,
        ] = await Promise.all([
          getDocs(query(collection(db, "enrollments"),           ...C)),
          getDocs(query(collection(db, "test_scores"),           ...C)),
          getDocs(query(collection(db, "gradebook_scores"),      ...C)),
          getDocs(query(collection(db, "results"),               ...C)),
          getDocs(query(collection(db, "discipline"),            ...C)),
          getDocs(query(collection(db, "attendance"),            ...C)),
          getDocs(query(collection(db, "teachers"),              ...C)),
          getDocs(query(collection(db, "classes"),               ...C)),
          getDocs(query(collection(db, "teaching_assignments"),  ...C)),
        ]);

        const enrollments = enrollSnap.docs.map(d => d.data()).filter(inBranch) as any[];
        const classDocs   = classesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(inBranch) as any[];
        const attendances = attSnap.docs.map(d => d.data()).filter(inBranch) as any[];
        const teachers    = teachersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(inBranch) as any[];
        const taDocs      = taSnap.docs.map(d => d.data()).filter(inBranch) as any[];
        const discRecs    = discSnap.docs.map(d => d.data()).filter(inBranch) as any[];

        // Read ALL THREE score collections + dedup via fingerprint. Memory:
        // owner_dashboard_alternate_data_sources + bug_pattern_score_field_singular_mark.
        const allScoreDocs = [
          ...testScoresSnap.docs, ...gradebookSnap.docs, ...resultsSnap.docs,
        ].map(d => d.data()).filter(inBranch) as any[];

        const fpSeen = new Set<string>();
        const uniqueScores: Array<{ raw: any; pct: number }> = [];
        for (const s of allScoreDocs) {
          const pct = pctOfDoc(s);
          if (pct === null) continue;
          const studentKey = String(s.studentId || (s.studentEmail || "").toLowerCase() || "");
          const subj = String(s.subject || s.subjectName || "").toLowerCase();
          const ts = s.timestamp || s.createdAt || s.uploadedAt || s.updatedAt || s.date;
          const dateK = ts
            ? (typeof ts === "string"
                ? ts.slice(0, 10)
                : ts?.toDate ? ts.toDate().toISOString().slice(0, 10) : "")
            : "";
          const fp = `${studentKey}|${subj}|${dateK}|${Math.round(pct * 10)}`;
          if (fpSeen.has(fp)) continue;
          fpSeen.add(fp);
          uniqueScores.push({ raw: s, pct });
        }

        setRawData({
          enrollments, uniqueScores, attendances, discRecs,
          teachers, classDocs, taDocs,
        });
      } catch (e) {
        console.error("[GenerateReport] data fetch failed:", e);
        toast.error("Failed to load report data. Please refresh.");
      }
      setLoading(false);
    };
    go();
  }, [userData?.schoolId, userData?.branchId]);

  // Re-aggregate whenever filters change. Filters apply IN-MEMORY against
  // the once-fetched raw rows — no Firestore re-fetch (memory:
  // bug_pattern_filterbytime_field_drift — date filtering must enumerate
  // every writer-timestamp variant per collection). Memoized so heavy
  // aggregation only runs when filters/raw actually change.
  const agg = useMemo<AggregatedData | null>(() => {
    if (!rawData) return null;
    return aggregateData(rawData, { grade, section, subject, dateFrom, dateTo });
  }, [rawData, grade, section, subject, dateFrom, dateTo]);

  // ───────────────────────────────────────────────────────────────
  // Template-specific payload builder.
  // Each report type produces DIFFERENT preview rows + saved sections,
  // so a parent/teacher receiving "Risk Students" sees an at-risk
  // table — not the same generic 5-stat snapshot every other template
  // has been silently rendering. Memory: bug_pattern_fabricated_fallback.
  // ───────────────────────────────────────────────────────────────
  type PreviewRow = { label: string; val: string | number; Icon: any; danger?: boolean };
  type HeroStat   = { label: string; value: string | number; color?: string };
  type Section    =
    | { title: string; type: "bars"; bars: Array<{ label: string; value: number }> }
    | { title: string; type: "stats"; stats: Array<{ label: string; value: string | number; color?: string }> }
    | { title: string; type: "table"; headers: string[]; rows: Array<{ cells: any[]; highlight?: boolean }> }
    | { title: string; type: "text"; text: string };
  type Payload    = { preview: PreviewRow[]; heroStats: HeroStat[]; sections: Section[]; snippet: string };

  const COLOR_GOOD = "#4ade80";
  const COLOR_WARN = "#fbbf24";
  const COLOR_BAD  = "#f87171";

  const buildPayload = (rType: string, a: AggregatedData): Payload => {
    switch (rType) {
      case "Student Progress": {
        const top    = a.perStudent.filter(p => p.testCount > 0).slice(0, 10);
        const flagged = a.perStudent.filter(p => p.flagged);
        return {
          preview: [
            { label: "Total Students",   val: a.totalStudents,         Icon: Users },
            { label: "Avg Score (school)",val: `${a.avgMarks}%`,        Icon: TrendingUp },
            { label: "Pass Rate",        val: `${a.passRate}%`,         Icon: CalendarCheck },
            { label: "Top Performer",    val: top[0] ? `${top[0].name} (${top[0].avgScore}%)` : "—", Icon: TrendingUp },
            { label: "At-Risk",          val: flagged.length,           Icon: AlertTriangle, danger: flagged.length > 0 },
          ],
          heroStats: [
            { label: "Total Students", value: a.totalStudents },
            { label: "Avg Score",      value: `${a.avgMarks}%`,  color: a.avgMarks >= 75 ? COLOR_GOOD : COLOR_WARN },
            { label: "Pass Rate",      value: `${a.passRate}%`,  color: a.passRate >= 80 ? COLOR_GOOD : COLOR_WARN },
            { label: "At-Risk",        value: flagged.length,    color: flagged.length > 0 ? COLOR_BAD : COLOR_GOOD },
          ],
          sections: [
            {
              title: "Top 10 Students",
              type: "table",
              headers: ["Name", "Class", "Avg Score", "Attendance", "Tests"],
              rows: top.map(p => ({
                cells: [p.name, p.classLabel || "—", `${p.avgScore}%`, `${p.attendance}%`, p.testCount],
              })),
            },
            ...(flagged.length > 0 ? [{
              title: `Flagged Students (${flagged.length})`,
              type: "table" as const,
              headers: ["Name", "Class", "Avg Score", "Attendance"],
              rows: flagged.slice(0, 30).map(p => ({
                cells: [p.name, p.classLabel || "—", `${p.avgScore}%`, `${p.attendance}%`],
                highlight: true,
              })),
            }] : []),
          ],
          snippet: `${a.totalStudents} students · avg ${a.avgMarks}% · ${a.passRate}% pass rate · ${flagged.length} flagged`,
        };
      }

      case "Class Performance": {
        return {
          preview: [
            { label: "Total Classes",    val: a.perClass.length,                                                   Icon: Users },
            { label: "Top Class",        val: a.perClass[0] ? `${a.perClass[0].classLabel} (${a.perClass[0].avgScore}%)` : "—", Icon: TrendingUp },
            { label: "Weak Class",       val: a.perClass.length ? `${a.perClass[a.perClass.length - 1].classLabel} (${a.perClass[a.perClass.length - 1].avgScore}%)` : "—", Icon: AlertTriangle, danger: true },
            { label: "School Avg",       val: `${a.avgMarks}%`,                                                    Icon: CalendarCheck },
            { label: "Total Students",   val: a.totalStudents,                                                     Icon: Users },
          ],
          heroStats: [
            { label: "Classes",     value: a.perClass.length },
            { label: "School Avg",  value: `${a.avgMarks}%`, color: a.avgMarks >= 75 ? COLOR_GOOD : COLOR_WARN },
            { label: "Avg Attendance", value: `${a.avgAttendance}%`, color: a.avgAttendance >= 85 ? COLOR_GOOD : COLOR_WARN },
            { label: "Students",    value: a.totalStudents },
          ],
          sections: [
            {
              title: "Class-wise Performance",
              type: "table",
              headers: ["Class", "Students", "Avg Score", "Attendance"],
              rows: a.perClass.map(c => ({
                cells: [c.classLabel, c.students, `${c.avgScore}%`, `${c.attendance}%`],
                highlight: c.avgScore < 50,
              })),
            },
            {
              title: "Top 5 Classes (Avg Score)",
              type: "bars",
              bars: a.perClass.slice(0, 5).map(c => ({ label: c.classLabel, value: c.avgScore })),
            },
          ],
          snippet: `${a.perClass.length} classes evaluated · top ${a.perClass[0]?.classLabel || "—"} (${a.perClass[0]?.avgScore || 0}%)`,
        };
      }

      case "Monthly Attendance": {
        const lowAtt = a.perStudent.filter(p => p.totalDays > 0 && p.attendance < 75)
          .sort((x, y) => x.attendance - y.attendance);
        const totalDays = a.perStudent.reduce((s, p) => s + p.totalDays, 0);
        const presentDays = a.perStudent.reduce((s, p) => s + p.presentDays, 0);
        return {
          preview: [
            { label: "Avg Attendance",   val: `${a.avgAttendance}%`,                          Icon: CalendarCheck },
            { label: "Present Records",  val: presentDays.toLocaleString(),                   Icon: CalendarCheck },
            { label: "Absent Records",   val: (totalDays - presentDays).toLocaleString(),     Icon: AlertTriangle, danger: (totalDays - presentDays) > 0 },
            { label: "Below 75%",        val: lowAtt.length,                                  Icon: AlertTriangle, danger: lowAtt.length > 0 },
            { label: "Total Students",   val: a.totalStudents,                                Icon: Users },
          ],
          heroStats: [
            { label: "Avg Attendance",   value: `${a.avgAttendance}%`, color: a.avgAttendance >= 85 ? COLOR_GOOD : COLOR_WARN },
            { label: "Present Records",  value: presentDays.toLocaleString() },
            { label: "Absent Records",   value: (totalDays - presentDays).toLocaleString(), color: COLOR_BAD },
            { label: "Below 75%",        value: lowAtt.length, color: lowAtt.length > 0 ? COLOR_BAD : COLOR_GOOD },
          ],
          sections: [
            ...(lowAtt.length > 0 ? [{
              title: `Students Below 75% (${lowAtt.length})`,
              type: "table" as const,
              headers: ["Name", "Class", "Attendance", "Present / Total"],
              rows: lowAtt.slice(0, 50).map(p => ({
                cells: [p.name, p.classLabel || "—", `${p.attendance}%`, `${p.presentDays} / ${p.totalDays}`],
                highlight: true,
              })),
            }] : []),
            {
              title: "Class-wise Attendance",
              type: "bars",
              bars: a.perClass.slice(0, 8).map(c => ({ label: c.classLabel, value: c.attendance })),
            },
          ],
          snippet: `${a.avgAttendance}% average · ${lowAtt.length} students below 75%`,
        };
      }

      case "Risk Students": {
        const risk = a.perStudent.filter(p => p.flagged)
          .sort((x, y) => (x.avgScore + x.attendance) - (y.avgScore + y.attendance));
        const reasons = {
          score: risk.filter(p => p.testCount > 0 && p.avgScore < 50).length,
          attendance: risk.filter(p => p.totalDays > 0 && p.attendance < 70).length,
        };
        return {
          preview: [
            { label: "At-Risk Students",  val: risk.length,                                       Icon: AlertTriangle, danger: risk.length > 0 },
            { label: "Low Score (<50%)",  val: reasons.score,                                     Icon: TrendingUp,    danger: reasons.score > 0 },
            { label: "Low Attendance",    val: reasons.attendance,                                Icon: CalendarCheck, danger: reasons.attendance > 0 },
            { label: "Discipline Cases",  val: a.incidents,                                       Icon: Shield,        danger: a.incidents > 0 },
            { label: "Total Students",    val: a.totalStudents,                                   Icon: Users },
          ],
          heroStats: [
            { label: "At-Risk",        value: risk.length, color: COLOR_BAD },
            { label: "Low Score",      value: reasons.score, color: COLOR_BAD },
            { label: "Low Attendance", value: reasons.attendance, color: COLOR_BAD },
            { label: "Discipline",     value: a.incidents, color: a.incidents > 0 ? COLOR_BAD : COLOR_GOOD },
          ],
          sections: risk.length === 0 ? [
            { title: "No At-Risk Students", type: "text", text: "All students currently meet score and attendance thresholds." },
          ] : [
            {
              title: "At-Risk List",
              type: "table",
              headers: ["Name", "Class", "Score", "Attendance", "Reason"],
              rows: risk.slice(0, 100).map(p => ({
                cells: [
                  p.name, p.classLabel || "—",
                  p.testCount > 0 ? `${p.avgScore}%` : "—",
                  p.totalDays > 0 ? `${p.attendance}%` : "—",
                  [
                    p.testCount > 0 && p.avgScore < 50 ? "Score" : "",
                    p.totalDays > 0 && p.attendance < 70 ? "Attendance" : "",
                  ].filter(Boolean).join(" + ") || "—",
                ],
                highlight: true,
              })),
            },
          ],
          snippet: `${risk.length} students flagged · ${reasons.score} academic · ${reasons.attendance} attendance`,
        };
      }

      case "Exam Results": {
        return {
          preview: [
            { label: "Subjects",         val: a.perSubject.length,                                                          Icon: TrendingUp },
            { label: "Avg Score",        val: `${a.avgMarks}%`,                                                              Icon: TrendingUp },
            { label: "Top Subject",      val: a.perSubject[0] ? `${a.perSubject[0].subject} (${a.perSubject[0].avgScore}%)` : "—", Icon: TrendingUp },
            { label: "Pass Rate",        val: `${a.passRate}%`,                                                              Icon: CalendarCheck },
            { label: "Total Students",   val: a.totalStudents,                                                              Icon: Users },
          ],
          heroStats: [
            { label: "Subjects",   value: a.perSubject.length },
            { label: "Avg Score",  value: `${a.avgMarks}%`, color: a.avgMarks >= 75 ? COLOR_GOOD : COLOR_WARN },
            { label: "Pass Rate",  value: `${a.passRate}%`, color: a.passRate >= 80 ? COLOR_GOOD : COLOR_WARN },
            { label: "Students",   value: a.totalStudents },
          ],
          sections: [
            {
              title: "Subject-wise Results",
              type: "table",
              headers: ["Subject", "Tests", "Avg Score", "Top Score"],
              rows: a.perSubject.map(s => ({
                cells: [s.subject, s.tests, `${s.avgScore}%`, `${s.topScore}%`],
                highlight: s.avgScore < 50,
              })),
            },
            {
              title: "Subject Averages",
              type: "bars",
              bars: a.perSubject.slice(0, 8).map(s => ({ label: s.subject, value: s.avgScore })),
            },
          ],
          snippet: `${a.perSubject.length} subjects · avg ${a.avgMarks}% · top ${a.perSubject[0]?.subject || "—"}`,
        };
      }

      case "Teacher Performance": {
        const ranked = a.perTeacher.filter(t => t.avgClassScore > 0);
        return {
          preview: [
            { label: "Total Teachers",   val: a.perTeacher.length,                                                   Icon: Users },
            { label: "Top Teacher",      val: ranked[0] ? `${ranked[0].name} (${ranked[0].avgClassScore}%)` : "—",  Icon: TrendingUp },
            { label: "Weak Teacher",     val: ranked.length ? `${ranked[ranked.length - 1].name} (${ranked[ranked.length - 1].avgClassScore}%)` : "—", Icon: AlertTriangle },
            { label: "School Avg",       val: `${a.avgMarks}%`,                                                       Icon: CalendarCheck },
            { label: "Classes Covered",  val: a.perClass.length,                                                      Icon: Users },
          ],
          heroStats: [
            { label: "Teachers",   value: a.perTeacher.length },
            { label: "School Avg", value: `${a.avgMarks}%`, color: a.avgMarks >= 75 ? COLOR_GOOD : COLOR_WARN },
            { label: "Classes",    value: a.perClass.length },
            { label: "Subjects",   value: a.perSubject.length },
          ],
          sections: [
            {
              title: "Teacher Roster",
              type: "table",
              headers: ["Name", "Subjects", "Classes", "Class Avg"],
              rows: a.perTeacher.map(t => ({
                cells: [
                  t.name,
                  (t.subjects || []).join(", ") || "—",
                  (t.classes || []).join(", ") || "—",
                  t.avgClassScore > 0 ? `${t.avgClassScore}%` : "—",
                ],
                highlight: t.avgClassScore > 0 && t.avgClassScore < 50,
              })),
            },
          ],
          snippet: `${a.perTeacher.length} teachers · top ${ranked[0]?.name || "—"} (${ranked[0]?.avgClassScore || 0}%)`,
        };
      }

      case "School Overview":
      case "Custom":
      default: {
        return {
          preview: [
            { label: "Total Students",      val: a.totalStudents,         Icon: Users },
            { label: "Average Attendance",  val: `${a.avgAttendance}%`,   Icon: CalendarCheck },
            { label: "Average Marks",       val: `${a.avgMarks}%`,        Icon: TrendingUp },
            { label: "At-Risk Students",    val: a.atRisk,                Icon: AlertTriangle, danger: a.atRisk > 0 },
            { label: "Discipline Incidents",val: a.incidents,             Icon: Shield,        danger: a.incidents > 0 },
          ],
          heroStats: [
            { label: "Total Students", value: a.totalStudents },
            { label: "Avg Attendance", value: `${a.avgAttendance}%`, color: a.avgAttendance >= 85 ? COLOR_GOOD : COLOR_WARN },
            { label: "Avg Marks",      value: `${a.avgMarks}%`,      color: a.avgMarks >= 75 ? COLOR_GOOD : COLOR_WARN },
            { label: "At-Risk",        value: a.atRisk,              color: a.atRisk > 0 ? COLOR_BAD : COLOR_GOOD },
          ],
          sections: [
            {
              title: "Performance Overview",
              type: "bars",
              bars: [
                { label: "Average Attendance", value: a.avgAttendance },
                { label: "Average Marks",      value: a.avgMarks },
                { label: "Pass Rate",          value: a.passRate },
              ],
            },
            {
              title: "Key Metrics",
              type: "stats",
              stats: [
                { label: "Total Students",      value: a.totalStudents },
                { label: "At-Risk Students",    value: a.atRisk, color: a.atRisk > 0 ? COLOR_BAD : undefined },
                { label: "Discipline Incidents",value: a.incidents },
                { label: "Total Classes",       value: a.perClass.length },
                { label: "Total Teachers",      value: a.perTeacher.length },
              ],
            },
          ],
          snippet: `${a.totalStudents} students · ${a.avgAttendance}% attendance · ${a.avgMarks}% avg marks · ${a.atRisk} at-risk`,
        };
      }
    }
  };

  const payload = agg ? buildPayload(reportType, agg) : null;

  const handleGenerate = async () => {
    if (!userData?.schoolId || !agg || !payload) return;
    setGenerating(true);
    try {
      const now       = new Date();
      const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const title     = `${reportType} — ${monthLabel}`;

      const payload = {
        schoolId:          userData.schoolId,
        // branchId MUST be on the doc — listeners on principal/teacher
        // dashboards filter by it (in-memory). Without this field the
        // generated report was invisible in every "recent" list.
        // Memory: branchid_inference_lag, bug_pattern_branch_filter_on_event_streams.
        branchId:          userData.branchId || null,
        title,
        reportType,
        format,
        grade:             grade   || "All",
        section:           section || "All",
        subject:           subject || "",
        dateFrom,
        dateTo,
        generatedBy:       userData.name || "Principal",
        status:            "Sent",
        publishedToParent: true,
        publishedToTeacher: true,
        studentId:         "all",
        // Branding embedded on the doc itself so teacher/parent dashboards
        // render the SAME WYSIWYG HTML report (branch name, logo, theme)
        // without an extra fetch on the principal record. logoUrl is
        // captured at publish-time — if the principal updates their logo
        // later, NEW reports get the new logo, OLD reports keep the old
        // (intentional snapshot semantics for audit trail).
        // branchName is the user-facing identity (each branch is a
        // school in the Edullent model); schoolName kept as fallback for
        // owner-published / single-branch tenants.
        // Principal docs use varying field names — match leaderboardData.ts.
        branchName:
          (userData as any).branchName
          || (userData as any).branch
          || (userData as any).branchTitle
          || "",
        schoolName:        userData.schoolName || "",
        logoUrl:           (userData as any).logoUrl || "",
        themeColor:        (userData as any).themeColor || "#0055FF",
        data: {
          // Per-template hero stats + sections — produced by buildPayload
          // so each report type renders DIFFERENT data downstream. Plus
          // base aggregates retained for backward compatibility with old
          // download handlers (will be ignored once handleDownload reads
          // heroStats/sections directly).
          heroStats:       payload.heroStats,
          sections:        payload.sections,
          snippet:         payload.snippet,
          totalStudents:   agg.totalStudents,
          avgAttendance:   agg.avgAttendance,
          avgMarks:        agg.avgMarks,
          atRisk:          agg.atRisk,
          incidents:       agg.incidents,
        },
        createdAt: serverTimestamp(),
      };

      // Atomic two-doc write: principal_reports + mirror in reports must
      // both succeed or both fail. Sequential addDoc could leave an
      // orphan in principal_reports if the second write fails for any
      // reason (rules / network / quota), making the report visible to
      // the principal but invisible to teachers/parents.
      // Use the SAME doc ID across both collections so delete can target
      // both atomically (otherwise principal-side delete leaves a ghost
      // in `reports` visible to parents/teachers forever).
      const batch = writeBatch(db);
      const pRef = doc(collection(db, "principal_reports"));
      const rRef = doc(db, "reports", pRef.id);
      batch.set(pRef, payload);
      batch.set(rRef, payload);
      await batch.commit();

      toast.success("Report generated and published to teachers & parents!");
      onBack();
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate report. Please try again.");
    }
    setGenerating(false);
  };

  const B1 = "#0055FF", B2 = "#1166FF", B4 = "#4499FF";
  const BG = "#EEF4FF";
  const T1 = "#001040", T3 = "#5070B0", T4 = "#99AACC";
  const SEP = "rgba(0,85,255,0.08)";
  const GREEN_D = "#007830";
  const RED = "#FF3355", RED_D = "#B01030";
  const VIOLET = "#7B3FF4", VIOLET_S = "rgba(123,63,244,0.10)", VIOLET_B = "rgba(123,63,244,0.22)";
  const SH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";
  const SH_BTN = "0 6px 22px rgba(0,85,255,0.38), 0 2px 5px rgba(0,85,255,0.18)";

  const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const generateDisabled = generating || loading;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 13px",
    background: BG,
    borderRadius: 12,
    border: "0.5px solid rgba(0,85,255,0.14)",
    fontFamily: "inherit",
    fontSize: 12,
    color: T1,
    fontWeight: 600,
    outline: "none",
    letterSpacing: "-0.1px",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235070B0' stroke-width='2.4' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 13px center",
    paddingRight: 34,
  };

  const fmtTheme = (f: "PDF" | "Excel" | "CSV") => {
    if (f === "PDF")    return { bg: "linear-gradient(135deg,#FFE3E8,#FFC0C8)", border: "rgba(255,51,85,0.35)", color: RED_D, shadow: "0 4px 12px rgba(255,51,85,0.18)" };
    if (f === "Excel")  return { bg: "linear-gradient(135deg,#DEFCE8,#B0F0C8)", border: "rgba(0,200,83,0.35)", color: GREEN_D, shadow: "0 4px 12px rgba(0,200,83,0.18)" };
    return                  { bg: "linear-gradient(135deg,#DDEAFF,#B4CCFF)", border: "rgba(0,85,255,0.35)", color: B1,     shadow: "0 4px 12px rgba(0,85,255,0.18)" };
  };

  // Template-driven preview rows — switches with reportType (memory:
  // bug_pattern_fabricated_fallback). Falls back to placeholder skeleton
  // until aggregations resolve.
  const previewRows: Array<{ label: string; val: string | number; Icon: any; danger?: boolean }> =
    payload?.preview || [
      { label: "Total Students",      val: "—", Icon: Users },
      { label: "Average Attendance",  val: "—", Icon: CalendarCheck },
      { label: "Average Marks",       val: "—", Icon: TrendingUp },
      { label: "At-Risk Students",    val: "—", Icon: AlertTriangle },
      { label: "Discipline Incidents",val: "—", Icon: Shield },
    ];

  // ═══════════════════════════════════════════════════════════════
  //  MOBILE
  // ═══════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>

        <div className="px-5 pt-4 flex items-center gap-[10px]">
          <button onClick={onBack}
            className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center bg-white active:scale-[0.94] transition-transform"
            style={{ border: "0.5px solid rgba(0,85,255,0.12)", boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
            <ChevronLeft className="w-4 h-4" style={{ color: B1 }} strokeWidth={2.3} />
          </button>
          <div className="text-[14px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Generate Report</div>
        </div>

        <div className="flex items-center gap-[6px] px-5 mt-1 text-[10px] font-medium" style={{ color: T4 }}>
          <button onClick={onBack} style={{ color: T3 }}>Reports</button>
          <span>›</span>
          <strong style={{ color: T1, fontWeight: 700 }}>Generate</strong>
        </div>

        <div className="px-5 pt-[14px] flex items-start gap-3">
          <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0 mt-1"
            style={{ background: `linear-gradient(135deg, ${VIOLET}, #A075FF)`, boxShadow: "0 4px 12px rgba(123,63,244,0.32)" }}>
            <Settings className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[22px] font-bold leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>{reportType}</div>
            <div className="text-[11px] mt-1" style={{ color: T3 }}>Configure parameters to generate the report</div>
          </div>
        </div>

        <div className="mx-5 mt-3 bg-white rounded-[20px] p-4 relative overflow-hidden"
          style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="absolute -top-[30px] -right-[30px] w-[120px] h-[120px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(0,85,255,0.05) 0%, transparent 70%)" }} />

          <div className="flex items-center gap-[9px] mb-[14px] relative z-10">
            <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.20)" }}>
              <Settings className="w-[15px] h-[15px]" style={{ color: B1 }} strokeWidth={2.3} />
            </div>
            <div className="text-[13px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Report Configuration</div>
          </div>

          <div className="space-y-3 relative z-10">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[5px]" style={{ color: T4 }}>Report Type</div>
              <select value={reportType} onChange={e => setReportType(e.target.value)} style={selectStyle}>
                {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[5px]" style={{ color: T4 }}>Date Range</div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-[6px] items-center">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] px-1" style={{ color: T4 }}>to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[5px]" style={{ color: T4 }}>Grade</div>
                <input value={grade} onChange={e => setGrade(e.target.value)} placeholder="All" style={inputStyle} />
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[5px]" style={{ color: T4 }}>Section</div>
                <input value={section} onChange={e => setSection(e.target.value)} placeholder="All" style={inputStyle} />
              </div>
            </div>

            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[5px]" style={{ color: T4 }}>Subject (Optional)</div>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Mathematics" style={inputStyle} />
            </div>

            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[5px]" style={{ color: T4 }}>Output Format</div>
              <div className="grid grid-cols-3 gap-[7px]">
                {(["PDF", "Excel", "CSV"] as const).map(f => {
                  const active = format === f;
                  const t = fmtTheme(f);
                  return (
                    <button key={f}
                      onClick={() => setFormat(f)}
                      className="rounded-[12px] py-[12px] flex flex-col items-center gap-[5px] text-[11px] font-bold active:scale-[0.95] transition-transform"
                      style={{
                        background: active ? t.bg : BG,
                        border: active ? `0.5px solid ${t.border}` : `0.5px solid rgba(0,85,255,0.14)`,
                        color: active ? t.color : T3,
                        boxShadow: active ? t.shadow : "none",
                        transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                      }}>
                      <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center">
                        {f === "PDF" ? <FileText className="w-[15px] h-[15px]" strokeWidth={2.3} /> :
                         f === "Excel" ? <FileSpreadsheet className="w-[15px] h-[15px]" strokeWidth={2.3} /> :
                         <BarChart2 className="w-[15px] h-[15px]" strokeWidth={2.3} />}
                      </div>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-5 mt-3 bg-white rounded-[20px] overflow-hidden"
          style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="px-4 pt-[14px] pb-[10px]">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: T4 }}>Report Preview</div>
          </div>
          {loading ? (
            <div className="mx-4 mb-[14px] py-9 rounded-[14px] flex flex-col items-center gap-3" style={{ background: BG }}>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} />
              <p className="text-[11px] font-semibold tracking-[0.04em]" style={{ color: T4 }}>Loading school data…</p>
            </div>
          ) : (
            <div className="mx-4 mb-[14px] rounded-[14px] overflow-hidden"
              style={{ border: `0.5px solid rgba(0,85,255,0.14)`, boxShadow: "0 4px 12px rgba(0,85,255,0.08)" }}>
              <div className="px-4 py-[14px] text-center relative overflow-hidden"
                style={{ background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)" }}>
                <div className="absolute -top-[30px] -right-[20px] w-[100px] h-[100px] rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
                <div className="text-[14px] font-bold text-white mb-[2px] relative z-10" style={{ letterSpacing: "-0.2px" }}>{reportType} Report</div>
                <div className="text-[10px] font-semibold relative z-10" style={{ color: "rgba(255,255,255,0.60)", letterSpacing: "0.04em" }}>{monthLabel}</div>
              </div>
              {previewRows.map(row => (
                <div key={row.label} className="flex items-center justify-between px-4 py-[10px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                  <div className="flex items-center gap-[6px]">
                    <row.Icon className="w-[13px] h-[13px]" style={{ color: T4 }} strokeWidth={2.3} />
                    <span className="text-[11px] font-semibold" style={{ color: T3 }}>{row.label}</span>
                  </div>
                  <span className="text-[13px] font-bold" style={{ color: row.danger ? RED : T1, letterSpacing: "-0.2px" }}>{row.val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-5 mt-3">
          <button onClick={handleGenerate} disabled={generateDisabled}
            className="w-full h-12 rounded-[14px] flex items-center justify-center gap-2 text-[14px] font-bold text-white relative overflow-hidden active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{
              background: generateDisabled ? "linear-gradient(135deg, #8899C5, #A5B2D0)" : `linear-gradient(135deg, ${B1}, ${B2})`,
              boxShadow: generateDisabled ? "0 4px 12px rgba(100,120,180,0.25)" : SH_BTN,
              transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
            }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            {generating ? (
              <><Loader2 className="w-[15px] h-[15px] animate-spin relative z-10" /><span className="relative z-10">Generating…</span></>
            ) : (
              <><Download className="w-[15px] h-[15px] relative z-10" strokeWidth={2.4} /><span className="relative z-10">Generate & Publish Report</span></>
            )}
          </button>
        </div>

        {!loading && agg && payload && (
          <div className="mx-5 mt-3 rounded-[22px] px-5 py-[18px] relative overflow-hidden"
            style={{
              background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
              boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
            }}>
            <div className="absolute -top-[34px] -right-[22px] w-[140px] h-[140px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
            <div className="flex items-center gap-[6px] mb-[10px] relative z-10">
              <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <Eye className="w-[13px] h-[13px] text-white" strokeWidth={2.3} />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>Report Snapshot</span>
            </div>
            <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
              {payload.heroStats.slice(0, 3).map(s => (
                <div key={s.label} className="text-center py-3" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[19px] font-bold leading-none mb-[3px]" style={{ color: s.color || "#fff", letterSpacing: "-0.5px" }}>{s.value}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-6" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${SEP}`, color: T3, boxShadow: SH }}>
            <ChevronLeft className="w-4 h-4" strokeWidth={2.3} />
            Back to Reports
          </button>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${VIOLET}, #A075FF)`, boxShadow: "0 6px 18px rgba(123,63,244,0.32)" }}>
              <Settings className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-[24px] font-bold leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>{reportType}</div>
              <div className="text-[12px] mt-1" style={{ color: T3 }}>Configure parameters to generate the report</div>
            </div>
          </div>
        </div>
        <button onClick={handleGenerate} disabled={generateDisabled}
          className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          style={{
            background: generateDisabled ? "linear-gradient(135deg, #8899C5, #A5B2D0)" : `linear-gradient(135deg, ${B1}, ${B2})`,
            boxShadow: generateDisabled ? "0 4px 12px rgba(100,120,180,0.25)" : SH_BTN,
          }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          {generating ? <><Loader2 className="w-[15px] h-[15px] animate-spin relative z-10" /><span className="relative z-10">Generating…</span></>
                      : <><Download className="w-[15px] h-[15px] relative z-10" strokeWidth={2.4} /><span className="relative z-10">Generate & Publish</span></>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="space-y-5">

          <div className="bg-white rounded-[20px] p-6 relative overflow-hidden"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="absolute -top-[30px] -right-[30px] w-[120px] h-[120px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(0,85,255,0.05) 0%, transparent 70%)" }} />
            <div className="flex items-center gap-[10px] mb-5 relative z-10">
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.26)" }}>
                <Settings className="w-4 h-4 text-white" strokeWidth={2.4} />
              </div>
              <h2 className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>Report Configuration</h2>
            </div>

            <div className="space-y-4 relative z-10">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.10em] mb-[6px]" style={{ color: T4 }}>Report Type</div>
                <select value={reportType} onChange={e => setReportType(e.target.value)} style={{ ...selectStyle, fontSize: 13, padding: "12px 14px", paddingRight: 34 }}>
                  {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.10em] mb-[6px]" style={{ color: T4 }}>Date Range</div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-[10px] items-center">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T4 }}>to</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.10em] mb-[6px]" style={{ color: T4 }}>Grade</div>
                  <input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. Grade 6 or All" style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.10em] mb-[6px]" style={{ color: T4 }}>Section</div>
                  <input value={section} onChange={e => setSection(e.target.value)} placeholder="A or All" style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.10em] mb-[6px]" style={{ color: T4 }}>Subject (Optional)</div>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Mathematics" style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-6"
            style={{ boxShadow: SH, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center gap-[10px] mb-4">
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#FFE3E8,#FFC0C8)", border: "0.5px solid rgba(255,51,85,0.22)" }}>
                <FileText className="w-4 h-4" style={{ color: RED_D }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>Output Format</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(["PDF", "Excel", "CSV"] as const).map(f => {
                const active = format === f;
                const t = fmtTheme(f);
                return (
                  <button key={f}
                    onClick={() => setFormat(f)}
                    className="rounded-[12px] py-[18px] flex flex-col items-center gap-[6px] text-[12px] font-bold transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active ? t.bg : BG,
                      border: active ? `0.5px solid ${t.border}` : `0.5px solid rgba(0,85,255,0.14)`,
                      color: active ? t.color : T3,
                      boxShadow: active ? t.shadow : "none",
                    }}>
                    <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center">
                      {f === "PDF" ? <FileText className="w-[18px] h-[18px]" strokeWidth={2.3} /> :
                       f === "Excel" ? <FileSpreadsheet className="w-[18px] h-[18px]" strokeWidth={2.3} /> :
                       <BarChart2 className="w-[18px] h-[18px]" strokeWidth={2.3} />}
                    </div>
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        <div className="space-y-5">

          <div className="bg-white rounded-[20px] overflow-hidden"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center gap-[10px] px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: VIOLET_S, border: `0.5px solid ${VIOLET_B}` }}>
                <Eye className="w-4 h-4" style={{ color: VIOLET }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>Report Preview</h2>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="py-16 rounded-[14px] flex flex-col items-center gap-3" style={{ background: BG }}>
                  <Loader2 className="w-10 h-10 animate-spin" style={{ color: B1 }} />
                  <p className="text-[12px] font-semibold tracking-[0.04em]" style={{ color: T4 }}>Loading school data…</p>
                </div>
              ) : (
                <div className="rounded-[14px] overflow-hidden"
                  style={{ border: `0.5px solid rgba(0,85,255,0.14)`, boxShadow: "0 4px 12px rgba(0,85,255,0.08)" }}>
                  <div className="px-6 py-[18px] text-center relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)" }}>
                    <div className="absolute -top-[30px] -right-[20px] w-[120px] h-[120px] rounded-full pointer-events-none"
                      style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
                    <div className="text-[18px] font-bold text-white mb-[3px] relative z-10" style={{ letterSpacing: "-0.3px" }}>{reportType} Report</div>
                    <div className="text-[11px] font-semibold relative z-10" style={{ color: "rgba(255,255,255,0.60)", letterSpacing: "0.04em" }}>{monthLabel}</div>
                  </div>
                  {previewRows.map(row => (
                    <div key={row.label} className="flex items-center justify-between px-6 py-[14px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <div className="flex items-center gap-2">
                        <row.Icon className="w-[15px] h-[15px]" style={{ color: T4 }} strokeWidth={2.3} />
                        <span className="text-[13px] font-semibold" style={{ color: T3 }}>{row.label}</span>
                      </div>
                      <span className="text-[16px] font-bold" style={{ color: row.danger ? RED : T1, letterSpacing: "-0.3px" }}>{row.val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button onClick={handleGenerate} disabled={generateDisabled}
            className="w-full h-[54px] rounded-[14px] flex items-center justify-center gap-[9px] text-[14px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: generateDisabled ? "linear-gradient(135deg, #8899C5, #A5B2D0)" : `linear-gradient(135deg, ${B1}, ${B2})`,
              boxShadow: generateDisabled ? "0 4px 12px rgba(100,120,180,0.25)" : SH_BTN,
            }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            {generating ? <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Generating…</span></>
                        : <><Download className="w-4 h-4 relative z-10" strokeWidth={2.4} /><span className="relative z-10">Generate & Publish Report</span></>}
          </button>

          {!loading && agg && payload && (
            <div className="rounded-[22px] px-7 py-6 relative overflow-hidden"
              style={{
                background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
                boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
              }}>
              <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <Eye className="w-4 h-4 text-white" strokeWidth={2.4} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>Report Snapshot</span>
              </div>
              <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
                {payload.snippet}. Report will publish to both teachers and parents on generate.
              </p>
              <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
                <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: B4 }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-scoped to {(userData as any)?.branchName || userData?.schoolName || "your school"}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateReport;