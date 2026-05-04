import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, Download, Loader2, Users,
  GraduationCap, CalendarCheck, TrendingUp, AlertTriangle,
  UserPlus, Search as SearchIcon, X, Mail, Check
} from "lucide-react";
import {
  PieChart, Pie, Cell, Sector,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area,
  ResponsiveContainer
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, serverTimestamp, getDocs, writeBatch, doc } from "firebase/firestore";
import { toast } from "sonner";
import { pctOfDoc, matchesStudent, isPresent, ymdLocal } from "@/lib/scoreUtils";

interface ClassDoc {
  id: string;
  name: string;
  grade: string;
  section: string;
  teacherName: string;
  teacherId: string;
  schoolId: string;
  branchId: string;
  avgMarks: string;
  attendance: string;
  status: string;
  studentCount: number;
  weakSubject: string;
}

interface Props {
  classDoc: ClassDoc;
  onBack: () => void;
}

// ── Colour helpers ─────────────────────────────────────────────────────────────
const scoreColor = (v: number) =>
  v >= 70 ? "#22c55e" : v >= 50 ? "#f59e0b" : "#ef4444";

const attColor = (v: number) =>
  v >= 85 ? "#22c55e" : v >= 70 ? "#f59e0b" : "#ef4444";

// LOCAL date conversion (NOT UTC). `toISOString().slice(0,10)` flips IST
// midnight to the previous UTC day, shifting attendance records into the
// wrong bucket on the trend chart. ymdLocal handles the timezone correctly.
const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return ymdLocal(d.toDate());
  if (d instanceof Date) return ymdLocal(d);
  return "";
};

const last7Days = (): string[] => {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(ymdLocal(d));
  }
  return days;
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
};

// ─────────────────────────────────────────────────────────────────────────────

const ClassPerformance = ({ classDoc, onBack }: Props) => {
  const navigate = useNavigate();

  const [attRecords,   setAttRecords]   = useState<any[]>([]);
  const [results,      setResults]      = useState<any[]>([]);
  // Memory: Owner Dashboard alternate data sources — `test_scores` and
  // `gradebook_scores` are CO-CANONICAL with `results`. Reading only one
  // misses ~40% of records (bulk-upload schools live in the other two).
  const [testScores,   setTestScores]   = useState<any[]>([]);
  const [gradebook,    setGradebook]    = useState<any[]>([]);
  // teaching_assignments — source of "what subjects are taught in this
  // class" even before any exam scores are uploaded. Without this, a brand-
  // new class with assigned teachers/subjects shows "No results data" with
  // no clue about what subjects exist (silent bug).
  const [teachingAssignments, setTeachingAssignments] = useState<any[]>([]);
  const [enrollments,  setEnrollments]  = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activePieIdx, setActivePieIdx] = useState(0);

  // ── Add Student modal state ─────────────────────────────────────────────────
  const [addModal,        setAddModal]        = useState(false);
  const [addTab,          setAddTab]          = useState<"existing" | "invite">("existing");
  const [schoolStudents,  setSchoolStudents]  = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch,   setStudentSearch]   = useState("");
  const [selectedSids,    setSelectedSids]    = useState<string[]>([]);
  const [enrolling,       setEnrolling]       = useState(false);
  const [inviteForm,      setInviteForm]      = useState({ name: "", email: "" });
  const [inviting,        setInviting]        = useState(false);

  // ── Firestore listeners ──────────────────────────────────────────────────────
  // P0: scope by schoolId + classId server-side ONLY. branchId is filtered
  // client-side because the enforceBranchId_* trigger backfills missing
  // branchId with ~1-2s lag — server-side `where("branchId", ...)` would
  // silently hide fresh writes (memory: branchid_inference_lag).
  useEffect(() => {
    if (!classDoc.id || !classDoc.schoolId) { setLoading(false); return; }
    setLoading(true);

    const scopeC: any[] = [where("schoolId", "==", classDoc.schoolId)];
    const q = (col: string) =>
      query(collection(db, col), ...scopeC, where("classId", "==", classDoc.id));

    // Client-side branch filter so the page works for principals whose
    // userData.branchId is null (multi-school scenario) AND keeps
    // freshly-written docs visible during the trigger's backfill window.
    const inBranch = (raw: any): boolean =>
      !classDoc.branchId || !raw?.branchId || raw.branchId === classDoc.branchId;

    let done = 0;
    const tryDone = () => { done++; if (done >= 6) setLoading(false); };

    // Real error handlers — empty `() => tryDone()` swallowed permission
    // denials AND missing-index errors silently. Now logs to console for
    // debugging while still bumping the counter so the spinner clears.
    const errLog = (label: string) => (err: Error) => {
      console.warn(`[ClassPerformance] ${label} listener failed:`, err);
      tryDone();
    };

    const u1 = onSnapshot(q("enrollments"),         snap => { setEnrollments(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(inBranch)); tryDone(); }, errLog("enrollments"));
    const u2 = onSnapshot(q("attendance"),          snap => { setAttRecords(snap.docs.map(d => d.data()).filter(inBranch)); tryDone(); }, errLog("attendance"));
    const u3 = onSnapshot(q("results"),             snap => { setResults(snap.docs.map(d => d.data()).filter(inBranch)); tryDone(); }, errLog("results"));
    // Two co-canonical score collections — must be read alongside `results`
    // or bulk-upload schools see "—" everywhere even when scores exist.
    const u4 = onSnapshot(q("test_scores"),         snap => { setTestScores(snap.docs.map(d => d.data()).filter(inBranch)); tryDone(); }, errLog("test_scores"));
    const u5 = onSnapshot(q("gradebook_scores"),    snap => { setGradebook(snap.docs.map(d => d.data()).filter(inBranch)); tryDone(); }, errLog("gradebook_scores"));
    // teaching_assignments lets us list "Subjects taught in this class"
    // even before exams arrive — fixes the silent bug where Subject-wise
    // chart said "No results data" for brand-new classes that DID have
    // assigned subjects.
    const u6 = onSnapshot(q("teaching_assignments"), snap => { setTeachingAssignments(snap.docs.map(d => d.data()).filter(inBranch)); tryDone(); }, errLog("teaching_assignments"));

    // Safety net: if NO listener fires within 5s (all denied / no auth),
    // unblock the spinner so the user sees the empty state rather than
    // staring at a perpetual loader.
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    return () => {
      clearTimeout(safetyTimer);
      u1(); u2(); u3(); u4(); u5(); u6();
    };
  }, [classDoc.id, classDoc.schoolId, classDoc.branchId]);

  // ── Derived: per-student data ─────────────────────────────────────────────
  // avgScore is `number | null` — null when the student has no usable score
  // docs. Defaulting to 0 silently classified empty students as "At Risk"
  // and inflated the donut + stat card (memory: bug_pattern_score_zero_no_data).
  type StudentStatus = "Excellent" | "Good" | "Average" | "At Risk" | "No Data";
  type StudentRow = {
    sid: string;
    name: string;
    email: string;
    initials: string;
    subjects: Record<string, number>;
    avgScore: number | null;
    attPct: number | null;
    status: StudentStatus;
  };

  // Merge all 3 score sources ONCE per render. Dedup by content fingerprint
  // (subject|date|pct) so an exam written to BOTH `results` and `test_scores`
  // (some schools mirror via migrations) doesn't double-count when computing
  // averages.
  const allScoreDocs = [...results, ...testScores, ...gradebook];

  // Dedup enrollments by studentId/email before iterating so a student
  // with 2 enrollment rows in the same class produces ONE row, not two
  // (and the table count stays consistent with `totalStudents`). Memory:
  // bug_pattern_enrollment_row_dedup — class-roster context wants 1 row
  // per student.
  const seenEnrollKeys = new Set<string>();
  const dedupedEnrollments = enrollments.filter((e: any) => {
    const key = (e.studentId || (e.studentEmail || "").toLowerCase()) || "";
    if (!key || seenEnrollKeys.has(key)) return false;
    seenEnrollKeys.add(key);
    return true;
  });

  const studentRows: (StudentRow & { rank: number })[] = dedupedEnrollments.map(e => {
    const sid   = e.studentId || e.id;
    const email = (e.studentEmail || e.email || "").toLowerCase();
    const name  = e.studentName || e.name || "Unknown";

    // Per-student score docs — dual-key match (studentId OR studentEmail)
    // via shared helper so the matching rule stays consistent across pages.
    const studentScoreDocs = allScoreDocs.filter(r => matchesStudent(r, sid, email));

    // Cross-source dedup before grouping. Fingerprint = subject + date +
    // rounded pct. Without dedup, a single exam recorded in multiple
    // collections inflates the average AND distorts subject breakdown.
    const fpSeen = new Set<string>();
    const dedupedScoreDocs: any[] = [];
    studentScoreDocs.forEach(r => {
      const pct = pctOfDoc(r);
      if (pct === null) return;
      const subj = String(r.subject ?? r.subjectName ?? "General").toLowerCase();
      const dateK = toDateStr(r.timestamp ?? r.createdAt ?? r.date);
      const fp = `${subj}|${dateK}|${Math.round(pct * 10)}`;
      if (fpSeen.has(fp)) return;
      fpSeen.add(fp);
      dedupedScoreDocs.push({ ...r, _pct: pct });
    });

    // Group by subject — pctOfDoc returns null for missing/invalid scores
    // (handles all 4 schemas: percentage, score+max, marks+totalMarks).
    const subMap: Record<string, number[]> = {};
    dedupedScoreDocs.forEach(r => {
      const sub = r.subject || r.subjectName || "General";
      if (!subMap[sub]) subMap[sub] = [];
      subMap[sub].push(r._pct);
    });
    const subjects: Record<string, number> = {};
    Object.entries(subMap).forEach(([sub, scores]) => {
      subjects[sub] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    });

    const allScores = Object.values(subjects);
    // null when no usable score data — never default to 0.
    const avgScore: number | null = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : null;

    // Attendance — dual-key + case-insensitive present/late via shared
    // `isPresent` helper. Previously `r.status === "present"` silently
    // dropped "Present"/"PRESENT"/"Late" → undercounted attendance.
    const attRecs = attRecords.filter(r => matchesStudent(r, sid, email));
    let attPct: number | null = null;
    if (attRecs.length > 0) {
      const present = attRecs.filter(isPresent).length;
      attPct = Math.round((present / attRecs.length) * 100);
    }

    // Status: classify only when we HAVE data. No-data students are
    // marked "No Data" — they no longer pollute the donut or the
    // "At Risk" stat card with phantom red entries.
    let status: StudentStatus;
    if (avgScore === null && attPct === null) {
      status = "No Data";
    } else if (attPct !== null && attPct < 75) {
      status = "At Risk";
    } else if (avgScore !== null && avgScore >= 80) {
      status = "Excellent";
    } else if (avgScore !== null && avgScore >= 60) {
      status = "Good";
    } else if (avgScore !== null && avgScore >= 40) {
      status = "Average";
    } else if (avgScore !== null) {
      // Real low score (< 40)
      status = "At Risk";
    } else {
      // attPct present (>= 75) but no score → don't fabricate, mark No Data
      status = "No Data";
    }

    return {
      sid, name, email,
      initials: name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2),
      subjects,
      avgScore,
      attPct,
      status,
    };
  })
  // Sort: real scores high→low first, then null at the bottom (no-data
  // students don't crowd the top of the rankings).
  .sort((a, b) => {
    if (a.avgScore === null && b.avgScore === null) return 0;
    if (a.avgScore === null) return 1;
    if (b.avgScore === null) return -1;
    return b.avgScore - a.avgScore;
  })
  .map((s, i) => ({ ...s, rank: i + 1 }));

  // ── Derived: all unique subjects ──────────────────────────────────────────
  // UNION of three sources so unscored-but-taught subjects still show:
  //   1. score docs (results + test_scores + gradebook_scores)
  //   2. teaching_assignments (canonical: which subjects the teacher
  //      teaches in this class — present even before exams)
  //   3. classDoc.subject (the class's primary subject field)
  // Without #2 and #3, brand-new classes showed "No results data" with no
  // way for the principal to see what subjects exist (silent bug).
  const allSubjectsSet = new Set<string>();
  allScoreDocs.forEach(r => {
    const s = String(r.subject ?? r.subjectName ?? "").trim();
    if (s) allSubjectsSet.add(s);
  });
  teachingAssignments.forEach(t => {
    const s = String(t.subjectName ?? t.subject ?? "").trim();
    if (s) allSubjectsSet.add(s);
  });
  // Pull classDoc.subject defensively — ClassDoc interface doesn't declare
  // it but the parent (ClassesSections) does pass it through, so we cast.
  const classPrimarySubject = String(((classDoc as any)?.subject) ?? "").trim();
  if (classPrimarySubject) allSubjectsSet.add(classPrimarySubject);
  const allSubjects: string[] = Array.from(allSubjectsSet).slice(0, 6);

  // ── Subject bar chart data ────────────────────────────────────────────────
  // Per-subject avg is computed across all 3 collections with the same
  // fingerprint dedup as the per-student aggregation, so cross-collection
  // mirrors don't double-count and pctOfDoc null-safety prevents missing
  // scores from being averaged in as 0.
  // Subject label preserves the full name (carried via `subjectFull` for the
  // tooltip) and shows a smart abbreviation on the axis. `slice(0, 5)`
  // alone mangled "Physics" → "PHYSI"; this keeps short names whole and
  // truncates longer ones with an ellipsis only when needed.
  const abbreviateSubject = (s: string): string => {
    const cleaned = s.trim();
    if (cleaned.length <= 8) return cleaned;
    // Two-or-more-word names: take first letter of each word (e.g.,
    // "Computer Science" → "CS", "Social Studies" → "SS"). Falls back to
    // a 7-char ellipsis truncate for one-word long names.
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return words.map(w => w[0]).join("").toUpperCase().slice(0, 4);
    return cleaned.slice(0, 7) + "…";
  };
  // Bar entries KEEP unscored subjects (avg=null) so the chart shows the
  // full curriculum, not just subjects with exam data. The chart code
  // below treats null as "—" with a striped gray bar (no fake 0% red bar).
  type SubjectBar = { subject: string; subjectFull: string; avg: number | null; color: string };
  const subjectBarData: SubjectBar[] = allSubjects.map(sub => {
    const subjFp = new Set<string>();
    const pcts: number[] = [];
    allScoreDocs
      .filter(r => (r.subject || r.subjectName) === sub)
      .forEach(r => {
        const pct = pctOfDoc(r);
        if (pct === null) return;
        const dateK = toDateStr(r.timestamp ?? r.createdAt ?? r.date);
        const studentKey = String(r.studentId || r.studentEmail || "").toLowerCase();
        const fp = `${studentKey}|${dateK}|${Math.round(pct * 10)}`;
        if (subjFp.has(fp)) return;
        subjFp.add(fp);
        pcts.push(pct);
      });
    const avg = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    return {
      subject: abbreviateSubject(sub),
      subjectFull: sub,
      avg,
      color: avg !== null ? scoreColor(avg) : "#cbd5e1",
    };
  });
  const hasAnyScoredSubject = subjectBarData.some(d => d.avg !== null);

  // ── Donut chart data ──────────────────────────────────────────────────────
  // Includes a "No Data" tier so students without scores show up as a
  // distinct slate slice, not silently lumped into "At Risk".
  const excellent = studentRows.filter(s => s.status === "Excellent").length;
  const good      = studentRows.filter(s => s.status === "Good").length;
  const average   = studentRows.filter(s => s.status === "Average").length;
  const atRisk    = studentRows.filter(s => s.status === "At Risk").length;
  const noData    = studentRows.filter(s => s.status === "No Data").length;
  const pieData = [
    { name: "Excellent", value: excellent, color: "#22c55e" },
    { name: "Good",      value: good,      color: "#1e3a8a" },
    { name: "Average",   value: average,   color: "#f59e0b" },
    { name: "At Risk",   value: atRisk,    color: "#ef4444" },
    { name: "No Data",   value: noData,    color: "#94a3b8" },
  ].filter(d => d.value > 0);

  // If no result data yet, show placeholder pie
  const pieDataFinal = pieData.length > 0
    ? pieData
    : [{ name: "No data", value: 1, color: "#e2e8f0" }];

  // ── Attendance trend (last 7 days) ────────────────────────────────────────
  // Uses isPresent + ymdLocal so "Present"/"Late"/case variants count and
  // IST midnight doesn't bucket records into the previous UTC day.
  // value = null on no-data days so Recharts renders a GAP instead of a
  // misleading flat 0% line. `hasAnyTrendData` guards the empty state for
  // classes that have lifetime attendance but nothing in the last 7 days.
  const days7 = last7Days();
  const attTrendData = days7.map(iso => {
    const dayRecs = attRecords.filter(r => toDateStr(r.date) === iso);
    let v: number | null = null;
    if (dayRecs.length > 0) {
      const present = dayRecs.filter(isPresent).length;
      v = Math.round((present / dayRecs.length) * 100);
    }
    return { day: dayLabel(iso), value: v, hasData: v !== null };
  });
  const hasAnyTrendData = attTrendData.some(d => d.hasData);

  // ── Overall class stats ───────────────────────────────────────────────────
  // Dedup by studentId/email — legacy bulk imports occasionally wrote two
  // enrollment rows for the same student in one class, which made
  // `enrollments.length` overcount (memory: bug_pattern_enrollment_row_dedup).
  // Same-student-multiple-classes still counts once per class because this
  // page is already scoped to ONE classDoc.id.
  const uniqueStudentKeys = new Set(
    enrollments
      .map((e: any) => (e.studentId || (e.studentEmail || "").toLowerCase()) || "")
      .filter(Boolean),
  );
  const totalStudents = uniqueStudentKeys.size;
  // Average ONLY across students with real score data — null entries don't
  // get counted as 0 (which used to drag classAvgScore down to "Weak").
  const studentScores = studentRows.map(s => s.avgScore).filter((v): v is number => v !== null);
  const classAvgScore: number | null = studentScores.length > 0
    ? Math.round(studentScores.reduce((a, b) => a + b, 0) / studentScores.length)
    : null;
  const classAttPct = (() => {
    if (attRecords.length === 0) return null;
    // Case-insensitive present/late via shared helper.
    const present = attRecords.filter(isPresent).length;
    return Math.round((present / attRecords.length) * 100);
  })();

  // No-data classes get "No Data". When only ONE signal exists (e.g.,
  // attendance recorded but no exams uploaded yet), we judge the class on
  // that single signal alone instead of falling through to "Average" —
  // a class with 100% attendance shouldn't be tagged "Average" just
  // because exams haven't been uploaded.
  const classStatus: "Good" | "Average" | "Weak" | "No Data" = (() => {
    if (classAvgScore === null && classAttPct === null) return "No Data";
    if (classAvgScore !== null && classAttPct !== null) {
      // Both signals present — standard combined rule
      if (classAvgScore >= 70 && classAttPct >= 85) return "Good";
      if (classAvgScore < 45 || classAttPct < 70)   return "Weak";
      return "Average";
    }
    // Single-signal classification — judge on whichever we have
    if (classAvgScore !== null) {
      if (classAvgScore >= 70) return "Good";
      if (classAvgScore < 45)  return "Weak";
      return "Average";
    }
    // attendance-only
    if (classAttPct! >= 85) return "Good";
    if (classAttPct! < 70)  return "Weak";
    return "Average";
  })();

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const subHeaders = allSubjects.length > 0 ? allSubjects : ["Score"];
    const headers = ["Rank", "Name", "Email", ...subHeaders, "Avg Score", "Attendance", "Status"];
    const rows = studentRows.map((s: any) => [
      s.rank,
      s.name,
      s.email,
      ...subHeaders.map(sub => s.subjects[sub] !== undefined ? `${s.subjects[sub]}%` : "—"),
      `${s.avgScore}%`,
      s.attPct !== null ? `${s.attPct}%` : "—",
      s.status,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${classDoc.name}_performance.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export complete!");
  };

  // ── Add Student helpers ───────────────────────────────────────────────────
  // P0: scope by schoolId server-side, branchId client-side. Without this:
  //  (1) crashes if classDoc.branchId is undefined (Firestore rejects
  //      `where("branchId", "==", undefined)`),
  //  (2) silently hides freshly-imported students whose branchId hasn't been
  //      backfilled by the trigger yet (memory: branchid_inference_lag).
  const openAddModal = async () => {
    setAddModal(true);
    setAddTab("existing");
    setStudentSearch("");
    setSelectedSids([]);
    setInviteForm({ name: "", email: "" });
    setStudentsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "students"), where("schoolId", "==", classDoc.schoolId)),
      );
      const enrolledIds = new Set([
        ...enrollments.map((e: any) => e.studentId),
        ...enrollments.map((e: any) => (e.studentEmail || "").toLowerCase()),
      ]);
      const inBranch = (raw: any): boolean =>
        !classDoc.branchId || !raw?.branchId || raw.branchId === classDoc.branchId;
      setSchoolStudents(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(s => inBranch(s) && !enrolledIds.has(s.id) && !enrolledIds.has((s.email || "").toLowerCase()))
      );
    } catch (err) {
      console.warn("[ClassPerformance] openAddModal student fetch failed:", err);
    }
    setStudentsLoading(false);
  };

  const handleAddExisting = async () => {
    if (selectedSids.length === 0) return toast.error("Select at least one student.");
    setEnrolling(true);
    try {
      const toAdd = schoolStudents.filter(s => selectedSids.includes(s.id));
      // Single writeBatch instead of N sequential round-trips. Atomic
      // (all-or-nothing) and ~10× faster for large selections. Chunk at
      // 450 ops to stay under Firestore's 500-op writeBatch cap.
      const CHUNK = 450;
      for (let i = 0; i < toAdd.length; i += CHUNK) {
        const slice = toAdd.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(s => {
          const ref = doc(collection(db, "enrollments"));
          batch.set(ref, {
            studentId:    s.id,
            studentEmail: (s.email || "").toLowerCase(),
            studentName:  s.name || "",
            classId:      classDoc.id,
            className:    classDoc.name,
            teacherId:    classDoc.teacherId   || "",
            teacherName:  classDoc.teacherName || "",
            schoolId:     classDoc.schoolId,
            branchId:     classDoc.branchId,
            createdAt:    serverTimestamp(),
          });
        });
        await batch.commit();
      }
      toast.success(`${toAdd.length} student${toAdd.length > 1 ? "s" : ""} added to ${classDoc.name}!`);
      setAddModal(false);
      setSelectedSids([]);
    } catch (err) {
      console.error("[ClassPerformance] add existing students failed:", err);
      toast.error("Failed to add students. Try again.");
    }
    setEnrolling(false);
  };

  const handleInviteStudent = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim())
      return toast.error("Name and email are required.");
    setInviting(true);
    const email = inviteForm.email.toLowerCase().trim();
    const name  = inviteForm.name.trim();
    // Basic email-shape validation — catches obvious typos before we
    // commit a Firestore write or hit the email API.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      setInviting(false);
      return;
    }
    try {
      // Atomic: students + enrollments in a single writeBatch. Prior code
      // wrote sequentially — if the enrollment failed after the student
      // doc was created, the student would orphan with no class assignment.
      const studentRef = doc(collection(db, "students"));
      const enrollmentRef = doc(collection(db, "enrollments"));
      const batch = writeBatch(db);
      batch.set(studentRef, {
        name,
        email,
        // studentId mirrors the doc ID so the student doc is self-consistent
        // when read by collections that key off `studentId` rather than `id`.
        studentId:   studentRef.id,
        classId:     classDoc.id,
        className:   classDoc.name,
        teacherId:   classDoc.teacherId   || "",
        teacherName: classDoc.teacherName || "",
        schoolId:    classDoc.schoolId,
        branchId:    classDoc.branchId,
        status:      "Active",
        createdAt:   serverTimestamp(),
      });
      batch.set(enrollmentRef, {
        studentId:    studentRef.id,
        studentEmail: email,
        studentName:  name,
        classId:      classDoc.id,
        className:    classDoc.name,
        teacherId:    classDoc.teacherId   || "",
        teacherName:  classDoc.teacherName || "",
        schoolId:     classDoc.schoolId,
        branchId:     classDoc.branchId,
        createdAt:    serverTimestamp(),
      });
      await batch.commit();

      // Actually CHECK the email response. Previously `.catch(() => {})`
      // swallowed 4xx/5xx and the toast lied "invitation sent" on failure.
      // Now report email failures as a separate warning so the principal
      // knows to re-send manually.
      let emailFailed = false;
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: `You've been enrolled — ${classDoc.name}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;"><h2 style="color:#1e3a8a;margin-bottom:8px;">Welcome, ${name}!</h2><p style="color:#555;">You have been enrolled in <strong>${classDoc.name}</strong>${classDoc.teacherName ? ` — Teacher: <strong>${classDoc.teacherName}</strong>` : ""}.</p><div style="margin:28px 0;text-align:center;"><a href="https://parent-dashboard-ten.vercel.app/" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Go to Student Portal</a></div><p style="color:#aaa;font-size:12px;text-align:center;">Use your email (${email}) to sign in.</p></div>`,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.error("[ClassPerformance] invite email API failed:", res.status, errBody);
          emailFailed = true;
        }
      } catch (mailErr) {
        console.error("[ClassPerformance] invite email network failed:", mailErr);
        emailFailed = true;
      }

      if (emailFailed) {
        toast.warning(`${name} enrolled, but invitation email failed. Re-send manually.`);
      } else {
        toast.success(`${name} enrolled & invitation sent!`);
      }
      setInviteForm({ name: "", email: "" });
      setAddModal(false);
    } catch (err) {
      console.error("[ClassPerformance] invite student failed:", err);
      toast.error("Failed to enroll student. Try again.");
    }
    setInviting(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in duration-500 pb-12 space-y-6">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Classes
      </button>

      {/* Header card — neutral slate background for "No Data" so a brand-new
          class doesn't visually scream "Weak/red" before any signals arrive. */}
      <div className={`rounded-2xl p-6 border ${
        classStatus === "Good"    ? "bg-green-50 border-green-100" :
        classStatus === "Weak"    ? "bg-rose-50 border-rose-100" :
        classStatus === "No Data" ? "bg-slate-50 border-slate-100" :
        "bg-amber-50 border-amber-100"
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-black text-slate-900">{classDoc.name}</h1>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white ${
                classStatus === "Good"    ? "bg-green-500" :
                classStatus === "Weak"    ? "bg-rose-500" :
                classStatus === "No Data" ? "bg-slate-400" :
                "bg-amber-500"
              }`}>
                {classStatus}
              </span>
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-slate-500 font-medium">
              {classDoc.teacherName && (
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4" /> {classDoc.teacherName}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" /> {totalStudents} Students
              </span>
              {classDoc.grade && (
                <span className="flex items-center gap-1.5">
                  Grade {classDoc.grade}{classDoc.section ? ` — Section ${classDoc.section}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Class Average</p>
            <p
              className="text-5xl font-black"
              style={{ color: classAvgScore !== null ? scoreColor(classAvgScore) : "#94a3b8" }}
            >
              {loading || classAvgScore === null ? "—" : `${classAvgScore}%`}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100">
          <Loader2 className="w-10 h-10 text-slate-300 animate-spin mb-4" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Class Data...</p>
        </div>
      ) : (
        <>
          {/* Quick stats — dashboard-style cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const cards = [
                {
                  label: "Total Students",
                  value: totalStudents,
                  subtitle: "Enrolled in this class",
                  Icon: Users,
                  cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
                  tileGrad: "linear-gradient(135deg, #0055FF, #1166FF)",
                  tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
                  numColor: "#0055FF",
                  subColor: "#5070B0",
                  decorColor: "#0055FF",
                },
                {
                  label: "Class Average",
                  // null vs 0 distinction — null = no exams uploaded; 0 = real zero.
                  value: classAvgScore !== null ? `${classAvgScore}%` : "—",
                  subtitle: classAvgScore !== null ? "Average score" : "No exams recorded yet",
                  Icon: TrendingUp,
                  cardGrad: "linear-gradient(135deg, #E2E0FA 0%, #F8F7FE 100%)",
                  tileGrad: "linear-gradient(135deg, #4F46E5, #6366F1)",
                  tileShadow: "0 4px 14px rgba(79,70,229,0.28)",
                  numColor: "#4F46E5",
                  subColor: "#6B6FA8",
                  decorColor: "#4F46E5",
                },
                {
                  label: "Attendance",
                  value: classAttPct !== null ? `${classAttPct}%` : "—",
                  subtitle: classAttPct !== null ? "Class average" : "No data yet",
                  Icon: CalendarCheck,
                  cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
                  tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
                  tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
                  numColor: "#007830",
                  subColor: "#007830",
                  decorColor: "#00C853",
                },
                {
                  label: "At Risk",
                  value: atRisk,
                  subtitle: atRisk > 0 ? "Action required" : "All clear",
                  Icon: AlertTriangle,
                  cardGrad: atRisk > 0
                    ? "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)"
                    : "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
                  tileGrad: atRisk > 0
                    ? "linear-gradient(135deg, #FF3355, #FF6688)"
                    : "linear-gradient(135deg, #7B3FF4, #A07CF8)",
                  tileShadow: atRisk > 0
                    ? "0 4px 14px rgba(255,51,85,0.28)"
                    : "0 4px 14px rgba(123,63,244,0.26)",
                  numColor: atRisk > 0 ? "#FF3355" : "#7B3FF4",
                  subColor: atRisk > 0 ? "#FF3355" : "#5070B0",
                  decorColor: atRisk > 0 ? "#FF3355" : "#7B3FF4",
                },
              ];
              return cards.map((c, i) => {
                const Icon = c.Icon;
                return (
                  <div
                    key={i}
                    className="rounded-[20px] p-5 relative overflow-hidden"
                    style={{
                      background: c.cardGrad,
                      boxShadow: "0 0 0 0.5px rgba(0,85,255,0.14), 0 6px 20px rgba(0,85,255,0.10), 0 22px 56px rgba(0,85,255,0.10)",
                      border: "0.5px solid rgba(0,85,255,0.08)",
                    }}
                  >
                    <div
                      className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
                      style={{ background: c.tileGrad, boxShadow: c.tileShadow }}
                    >
                      <Icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
                    </div>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: "#99AACC" }}>
                      {c.label}
                    </span>
                    <p
                      className="text-[34px] font-bold tracking-tight leading-none mb-1.5"
                      style={{ color: c.numColor, letterSpacing: "-1.2px" }}
                    >
                      {c.value}
                    </p>
                    <p className="text-[11px] font-semibold" style={{ color: c.subColor }}>
                      {c.subtitle}
                    </p>
                    <Icon
                      className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                      style={{ color: c.decorColor, opacity: 0.18 }}
                      strokeWidth={2}
                    />
                  </div>
                );
              });
            })()}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Donut — Performance Distribution (interactive shadcn-style) */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Performance Distribution</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tap a tier to highlight</p>
                </div>
                {pieDataFinal.length > 0 && (
                  <Select
                    value={String(Math.min(activePieIdx, pieDataFinal.length - 1))}
                    onValueChange={(v) => setActivePieIdx(Number(v))}
                  >
                    <SelectTrigger className="h-7 w-[130px] rounded-lg pl-2.5 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" className="rounded-xl">
                      {pieDataFinal.map((d, i) => (
                        <SelectItem key={i} value={String(i)} className="rounded-lg">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
                            {d.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {totalStudents === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-slate-300 text-sm font-medium">No students enrolled</div>
              ) : (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={pieDataFinal}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={2}
                          dataKey="value"
                          animationDuration={1000}
                          stroke="#ffffff"
                          strokeWidth={3}
                          activeIndex={Math.min(activePieIdx, pieDataFinal.length - 1)}
                          activeShape={(props: any) => {
                            const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                            return (
                              <g>
                                <Sector
                                  cx={cx}
                                  cy={cy}
                                  innerRadius={innerRadius}
                                  outerRadius={outerRadius + 8}
                                  startAngle={startAngle}
                                  endAngle={endAngle}
                                  fill={fill}
                                />
                                <Sector
                                  cx={cx}
                                  cy={cy}
                                  innerRadius={outerRadius + 12}
                                  outerRadius={outerRadius + 22}
                                  startAngle={startAngle}
                                  endAngle={endAngle}
                                  fill={fill}
                                  opacity={0.5}
                                />
                              </g>
                            );
                          }}
                          onClick={(_, i) => setActivePieIdx(i)}
                          label={(props: any) => {
                            const { cx, cy, midAngle, outerRadius, value, percent } = props;
                            const total = pieDataFinal.reduce((s, d) => s + d.value, 0);
                            if (total === 0 || value === 0) return null;
                            const RADIAN = Math.PI / 180;
                            const r = outerRadius + 16;
                            const x = cx + r * Math.cos(-midAngle * RADIAN);
                            const y = cy + r * Math.sin(-midAngle * RADIAN);
                            return (
                              <text
                                x={x}
                                y={y}
                                fill="#0f172a"
                                textAnchor={x > cx ? "start" : "end"}
                                dominantBaseline="central"
                                style={{ fontSize: 11, fontWeight: 700 }}
                              >
                                {value} ({Math.round(percent * 100)}%)
                              </text>
                            );
                          }}
                          labelLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                        >
                          {pieDataFinal.map((entry, i) => (
                            <Cell key={i} fill={entry.color} className="cursor-pointer" />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number, n: string) => [`${v} students`, n]}
                          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label — shows active tier value */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-[28px] font-black text-slate-900 leading-none tracking-tight">
                        {pieDataFinal[Math.min(activePieIdx, pieDataFinal.length - 1)]?.value ?? 0}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mt-1.5"
                        style={{ color: pieDataFinal[Math.min(activePieIdx, pieDataFinal.length - 1)]?.color ?? "#94a3b8" }}>
                        {pieDataFinal[Math.min(activePieIdx, pieDataFinal.length - 1)]?.name ?? "Students"}
                      </div>
                      <div className="text-[9px] font-semibold text-slate-400 mt-0.5">
                        of {totalStudents} total
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {pieDataFinal.map((d, i) => {
                      const pct = totalStudents > 0 ? Math.round((d.value / totalStudents) * 100) : 0;
                      const isActive = i === activePieIdx;
                      return (
                        <button
                          key={i}
                          onClick={() => setActivePieIdx(i)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-left ${
                            isActive ? "bg-slate-50 border-slate-200 shadow-sm" : "bg-white border-transparent hover:bg-slate-50"
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-slate-700 truncate">{d.name}</div>
                            <div className="text-[10px] font-semibold text-slate-400">{d.value} · {pct}%</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Bar — Subject-wise Average. Shows ALL known subjects (from
                score docs + teaching_assignments + classDoc.subject), with
                gray bars for subjects that don't have exam data yet. The
                tooltip distinguishes "— No exams yet" from a real low score. */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4 gap-2">
                <h3 className="text-sm font-bold text-slate-900">Subject-wise Average</h3>
                {!hasAnyScoredSubject && subjectBarData.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                    No exams uploaded
                  </span>
                )}
              </div>
              {subjectBarData.length === 0 ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-slate-300 text-sm font-medium gap-1">
                  <div>No subjects assigned yet</div>
                  <div className="text-xs text-slate-300">Add a teaching assignment in the Teachers page</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={subjectBarData.map(d => ({ ...d, displayAvg: d.avg ?? 0 }))}
                    barCategoryGap="25%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      // Tooltip text reflects the real state: "—" or
                      // "No exams yet" for unscored, percentage otherwise.
                      formatter={(_v: number, _name: any, props: any) => {
                        const p = props.payload;
                        return [p.avg === null ? "— No exams yet" : `${p.avg}%`, p.subjectFull || p.subject];
                      }}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
                      cursor={{ fill: "rgba(0,0,0,0.02)" }}
                    />
                    <Bar dataKey="displayAvg" radius={[4, 4, 0, 0]} animationDuration={1000}>
                      {subjectBarData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.color}
                          // Lower opacity for unscored bars so they read as
                          // "placeholder" rather than real data.
                          opacity={entry.avg === null ? 0.35 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Area — Attendance Trend */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Attendance Trend (7 Days)</h3>
              {/* Three distinct empty states:
                 1. No attendance records anywhere → "No attendance data"
                 2. Records exist but NONE in last 7 days → clarify it's a
                    time-window issue (don't paint a flat 0% line)
                 3. Some days in last 7 days have data → render the chart
                    (null days appear as gaps via Recharts) */}
              {attRecords.length === 0 ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-slate-300 text-sm font-medium">
                  No attendance data
                </div>
              ) : !hasAnyTrendData ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-slate-400 text-sm font-medium gap-1">
                  <div>No attendance recorded this week</div>
                  <div className="text-xs text-slate-300">Class lifetime attendance is tracked separately above</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={attTrendData}>
                    <defs>
                      <linearGradient id="attGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#1e3a8a" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, "Attendance"]}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#1e3a8a"
                      strokeWidth={2.5}
                      fill="url(#attGrad2)"
                      dot={{ r: 4, fill: "#fff", stroke: "#1e3a8a", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: "#1e3a8a", stroke: "#fff", strokeWidth: 2 }}
                      animationDuration={1000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Student Performance Table */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                Student Performance
                {totalStudents > 0 && <span className="ml-2 text-xs font-medium text-slate-400">({totalStudents} students)</span>}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={openAddModal}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1e3a8a] text-white rounded-xl text-xs font-bold hover:bg-blue-800 transition-colors shadow-sm"
                >
                  <UserPlus className="w-4 h-4" /> Add Student
                </button>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
              </div>
            </div>

            {totalStudents === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Users className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No students enrolled</p>
                <p className="text-xs text-slate-300 mt-1">Students will appear here once enrolled in this class</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rank</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student</th>
                      {allSubjects.slice(0, 4).map(sub => (
                        <th
                          key={sub}
                          // Full name in `title` attribute → hover-tooltip
                          // shows "Mathematics" / "Computer Science" while
                          // the visible text uses the smart abbreviation.
                          title={sub}
                          className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center"
                        >
                          {abbreviateSubject(sub)}
                        </th>
                      ))}
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Attendance</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {studentRows.map((s: any) => (
                      <tr
                        key={s.sid}
                        // Click row → open student profile (matches the
                        // pattern used in Students.tsx and StudentIntelligence).
                        // sid carries either the student doc ID or, for
                        // legacy enrollments, the email — `/students/:id`
                        // route handles both via the page's lookup.
                        onClick={() => s.sid && navigate(`/students/${encodeURIComponent(s.sid)}`)}
                        className={`hover:bg-slate-50/60 cursor-pointer transition-colors ${s.status === "At Risk" ? "bg-rose-50/20" : ""}`}
                        title={`Open profile — ${s.name}`}
                      >
                        {/* Rank */}
                        <td className="px-6 py-4">
                          <span className={`text-base font-black ${s.rank <= 3 ? "text-amber-500" : "text-slate-400"}`}>
                            {s.rank}
                          </span>
                        </td>

                        {/* Student */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-[10px] font-black shrink-0 ${
                              s.status === "Excellent" ? "bg-green-500" :
                              s.status === "At Risk"   ? "bg-rose-500" :
                              s.status === "Good"      ? "bg-[#1e3a8a]" :
                              s.status === "No Data"   ? "bg-slate-400" :
                              "bg-amber-500"
                            }`}>
                              {s.initials}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{s.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium truncate max-w-[140px]">{s.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Per subject scores */}
                        {allSubjects.slice(0, 4).map(sub => {
                          const score = s.subjects[sub];
                          return (
                            <td key={sub} className="px-4 py-4 text-center">
                              {score !== undefined ? (
                                <span className="font-black text-sm" style={{ color: scoreColor(score) }}>
                                  {score}%
                                </span>
                              ) : (
                                <span className="text-slate-300 text-sm">—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Avg total — null = no scores recorded (gray "—"),
                            never fabricated as 0%. */}
                        <td className="px-6 py-4 text-center">
                          <span className="font-black text-sm" style={{ color: s.avgScore !== null ? scoreColor(s.avgScore) : "#94a3b8" }}>
                            {s.avgScore !== null ? `${s.avgScore}%` : "—"}
                          </span>
                        </td>

                        {/* Attendance */}
                        <td className="px-6 py-4 text-center">
                          <span className="font-black text-sm" style={{ color: s.attPct !== null ? attColor(s.attPct) : "#cbd5e1" }}>
                            {s.attPct !== null ? `${s.attPct}%` : "—"}
                          </span>
                        </td>

                        {/* Status — slate badge for "No Data" so empty
                            students aren't visually flagged as red "At Risk". */}
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                            s.status === "Excellent" ? "bg-green-50 text-green-700 border-green-100" :
                            s.status === "Good"      ? "bg-blue-50 text-blue-700 border-blue-100" :
                            s.status === "Average"   ? "bg-amber-50 text-amber-700 border-amber-100" :
                            s.status === "No Data"   ? "bg-slate-50 text-slate-500 border-slate-100" :
                            "bg-rose-50 text-rose-700 border-rose-100"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Add Student Modal ── */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#1e3a8a]" /> Add Students to {classDoc.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Assign existing students or invite new ones</p>
              </div>
              <button onClick={() => setAddModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 shrink-0">
              <button onClick={() => setAddTab("existing")} className={`flex-1 py-3 text-sm font-bold transition-colors ${addTab === "existing" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                From School List
              </button>
              <button onClick={() => setAddTab("invite")} className={`flex-1 py-3 text-sm font-bold transition-colors ${addTab === "invite" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                Invite New Student
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {addTab === "existing" ? (
                <div className="space-y-4">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search by name or email..." value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  {studentsLoading ? (
                    <div className="py-12 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                  ) : (() => {
                    const filtered = schoolStudents.filter(s =>
                      (s.name || "").toLowerCase().includes(studentSearch.toLowerCase()) ||
                      (s.email || "").toLowerCase().includes(studentSearch.toLowerCase())
                    );
                    return filtered.length === 0 ? (
                      <div className="py-12 text-center">
                        <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">
                          {schoolStudents.length === 0 ? "No other students in this school yet." : "No students match your search."}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">Use "Invite New Student" tab to add someone new.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSids.length > 0 && (
                          <p className="text-xs font-bold text-[#1e3a8a] mb-1">{selectedSids.length} selected</p>
                        )}
                        {filtered.map((s: any) => {
                          const isSelected = selectedSids.includes(s.id);
                          return (
                            <div key={s.id} onClick={() => setSelectedSids(prev => isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? "bg-blue-50 border-[#1e3a8a]/30" : "border-slate-100 hover:bg-slate-50"}`}
                            >
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "bg-[#1e3a8a] border-[#1e3a8a]" : "border-slate-300"}`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600 shrink-0">
                                {(s.name || "S").substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{s.name || "Unknown"}</p>
                                <p className="text-xs text-slate-400 truncate">{s.email}</p>
                              </div>
                              {s.className && s.className !== classDoc.name && (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">{s.className}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Student Name *</label>
                    <input type="text" placeholder="e.g. Rahul Sharma" value={inviteForm.name}
                      onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Email Address *</label>
                    <input type="email" placeholder="student@example.com" value={inviteForm.email}
                      onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                    <Mail className="w-4 h-4 text-[#1e3a8a] shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600">Student will receive an email invitation with their login link.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-100 shrink-0">
              <button onClick={() => setAddModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              {addTab === "existing" ? (
                <button onClick={handleAddExisting} disabled={enrolling || selectedSids.length === 0}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {enrolling ? "Adding..." : `Add${selectedSids.length > 0 ? ` (${selectedSids.length})` : ""}`}
                </button>
              ) : (
                <button onClick={handleInviteStudent} disabled={inviting || !inviteForm.name || !inviteForm.email}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {inviting ? "Inviting..." : "Invite & Enroll"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassPerformance;
