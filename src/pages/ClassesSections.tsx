import { useState, useEffect, useRef } from "react";
import {
  CheckCircle, AlertCircle, XCircle, Loader2,
  GraduationCap, Users, BarChart2, CalendarCheck, Plus, X, UserPlus, UserCheck,
  Search as SearchIcon, Mail, Check, Pencil
} from "lucide-react";
import ClassPerformance from "@/components/ClassPerformance";
import ClassesSectionsMobile from "@/components/dashboard/ClassesSectionsMobile";
import StudentsPagination from "@/components/dashboard/StudentsPagination";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp, updateDoc, doc, getDocs, writeBatch
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { pctOfDoc, isPresent, ymdLocal, daysAgoStr, ATTENDANCE_WINDOW_DAYS } from "@/lib/scoreUtils";

// ── Types ──────────────────────────────────────────────────────────────────────

type ClassStatus = "Good" | "Average" | "Weak" | "No Data";

interface ClassRow {
  id: string;
  name: string;
  grade: string;
  section: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  branchId: string;
  room?: string;
  // status is a plain `string` (not the ClassStatus union) so this type is
  // assignment-compatible with ClassRowMobile when the mobile component
  // hands a row back through its callbacks. Internally `classStatus()`
  // returns the narrow ClassStatus, which is a subtype of string.
  status: string;
  studentCount: number;
  avgMarks: string;          // display string ("78%" or "—")
  avgMarksNum: number | null; // null when no score data (per memory: bug_pattern_score_zero_no_data)
  attendance: string;
  attendanceNum: number | null;
  healthScore: number | null;
  weakSubject: string;
  // Optional so this type stays assignment-compatible with ClassRowMobile
  // (the mobile component's interface marks these optional). Compute() always
  // populates them, but we don't enforce it at the type level for the boundary.
  hasScoreData?: boolean;
  hasAttendanceData?: boolean;
}

interface GradeSummary {
  grade: string;
  sections: number;
  students: number;
  avgAttendance: number | null;
  healthScore: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Status accepts null for no-data — never fabricates "Weak" from missing
// signals (memory: bug_pattern_score_zero_no_data warned that 0% defaults
// were silently classifying classes with no exams as Weak/Red forever).
const classStatus = (marks: number | null, att: number | null): ClassStatus => {
  if (marks === null && att === null) return "No Data";
  if (marks !== null && marks >= 70 && att !== null && att >= 85) return "Good";
  if ((marks !== null && marks < 45) || (att !== null && att < 70)) return "Weak";
  return "Average";
};

const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return ymdLocal(d.toDate());
  if (d instanceof Date) return ymdLocal(d);
  return "";
};

const statusIcon = (s: string) =>
  s === "Good" ? CheckCircle : s === "Weak" ? XCircle : s === "No Data" ? AlertCircle : AlertCircle;

const statusColor = (s: string) =>
  s === "Good" ? "text-green-600" :
  s === "Weak" ? "text-rose-600" :
  s === "No Data" ? "text-slate-400" :
  "text-amber-500";

const statusBadge = (s: string) =>
  s === "Good"
    ? "bg-green-50 text-green-700 border-green-100"
    : s === "Weak"
    ? "bg-rose-50 text-rose-700 border-rose-100"
    : s === "No Data"
    ? "bg-slate-50 text-slate-500 border-slate-100"
    : "bg-amber-50 text-amber-700 border-amber-100";

const healthIcon = (h: number | null) =>
  h === null ? AlertCircle : h >= 75 ? CheckCircle : h < 50 ? XCircle : AlertCircle;

const healthColor = (h: number | null) =>
  h === null ? "text-slate-400" :
  h >= 75 ? "text-green-600" :
  h < 50 ? "text-rose-600" :
  "text-amber-500";

// ─────────────────────────────────────────────────────────────────────────────

const ClassesSections = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

  const [loading, setLoading]               = useState(true);
  const [classes, setClasses]               = useState<ClassRow[]>([]);
  const [gradesSummary, setGradesSummary]   = useState<GradeSummary[]>([]);
  const [selectedSection, setSelectedSection] = useState<ClassRow | null>(null);
  const [addModal, setAddModal]             = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [newClass, setNewClass]             = useState({ name: "", grade: "", section: "", subject: "" });
  const [newClassTeacherId, setNewClassTeacherId] = useState("");

  const [teachers, setTeachers]             = useState<any[]>([]);
  const [assignModal, setAssignModal]       = useState(false);
  const [assigningClass, setAssigningClass] = useState<ClassRow | null>(null);
  const [assignTeacherId, setAssignTeacherId] = useState("");
  // S2 role-aware teacher assignment (memory: session_2026-05-19_holiday_architecture).
  // "class" → singular primary teacher per class; replaces existing designation.
  // "subject" → additive subject teacher; does not touch classes.classTeacherId.
  const [assignRole, setAssignRole]         = useState<"class" | "subject">("class");
  const [assignSubject, setAssignSubject]   = useState("");
  const [assigning, setAssigning]           = useState(false);

  // S2 migration helper (one-shot backfill — idempotent).
  const [migrating, setMigrating]           = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ classes: number; assignments: number; demoted: number } | null>(null);

  // ── Edit class state ─────────────────────────────────────────────────────
  // Rename triggers parent-dashboard/functions cascadeClassRename which
  // propagates the new className across ~25 denormalized collections.
  const [editClassModal, setEditClassModal] = useState(false);
  const [editingClass, setEditingClass]     = useState<ClassRow | null>(null);
  const [editFields, setEditFields]         = useState({ name: "", grade: "", section: "", subject: "" });
  const [savingEdit, setSavingEdit]         = useState(false);

  // ── Add Students modal state ───────────────────────────────────────────────
  const [studentModal,     setStudentModal]     = useState(false);
  const [studentModalClass, setStudentModalClass] = useState<ClassRow | null>(null);
  const [studentTab,       setStudentTab]       = useState<"existing" | "invite">("existing");
  const [schoolStudents,   setSchoolStudents]   = useState<any[]>([]);
  const [studentsLoading,  setStudentsLoading]  = useState(false);
  const [studentSearch,    setStudentSearch]    = useState("");
  const [selectedSids,     setSelectedSids]     = useState<string[]>([]);
  const [enrolling,        setEnrolling]        = useState(false);
  const [inviteStudentForm, setInviteStudentForm] = useState({ name: "", email: "" });
  const [inviting,         setInviting]         = useState(false);

  // ── Section table pagination ────────────────────────────────────────────────
  // Big schools (50+ classes) would otherwise render every row at once,
  // dropping framerate on initial load. Defaults to 10 per page; user can
  // bump to 25/50/100 via the size selector.
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState(10);
  // Reset to page 1 when the underlying classes set changes (avoids landing
  // on an empty page if classes shrank, e.g., after a delete).
  useEffect(() => { setCurrentPage(1); }, [classes.length, pageSize]);

  // Cross-listener refs
  const classesRef     = useRef<any[]>([]);
  const enrollRef      = useRef<any[]>([]);
  const attRef         = useRef<any[]>([]);
  const resultsRef     = useRef<any[]>([]);
  // Memory: Owner Dashboard alternate data sources — `test_scores` and
  // `gradebook_scores` are CO-CANONICAL with `results`. Reading only one
  // misses ~40% of records (bulk-upload schools live in the other two).
  const testScoresRef  = useRef<any[]>([]);
  const gradebookRef   = useRef<any[]>([]);

  // ── Compute derived class rows from latest refs ────────────────────────────
  const compute = () => {
    // Per-render constants (avoid recomputing per-class)
    const branchId = userData?.branchId;
    // P0: client-side branch filter (server-side would silently drop fresh
    // writes whose branchId hasn't been backfilled by the trigger yet —
    // memory: branchid_inference_lag).
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    const attCutoff = daysAgoStr(ATTENDANCE_WINDOW_DAYS);

    // Pre-merge all 3 score sources ONCE so we can dedup cross-collection.
    const allScoreDocs = [
      ...resultsRef.current,
      ...testScoresRef.current,
      ...gradebookRef.current,
    ];

    // Class-key match: prefer classId; fall back to className when classId
    // missing on the record (legacy bulk imports). For class-roster context
    // we want all matching rows, not unique-students.
    const matchesClass = (raw: any, classId: string, className: string): boolean => {
      if (!raw) return false;
      if (raw.classId && raw.classId === classId) return true;
      if (!raw.classId && raw.className && className && String(raw.className).trim() === className.trim()) return true;
      return false;
    };

    const rows: ClassRow[] = classesRef.current
      .filter(inBranch)
      .map(c => {
      const className = c.name || `${c.grade}${c.section || ""}`;

      // Student count from enrollments — dedup by studentId (memory:
      // bug_pattern_enrollment_row_dedup — a student in 2 sub-rows of same
      // class shouldn't count twice).
      const enrolled = enrollRef.current.filter(e => inBranch(e) && matchesClass(e, c.id, className));
      const uniqueStudentIds = new Set(
        enrolled.map(e => (e.studentId || (e.studentEmail || "").toLowerCase()) || "").filter(Boolean),
      );
      const studentCount = uniqueStudentIds.size;

      // Attendance — windowed to last 60d, late-counts-as-present helper.
      const attRecs = attRef.current.filter(r => {
        if (!inBranch(r) || !matchesClass(r, c.id, className)) return false;
        const d = toDateStr(r.date);
        return !d || d >= attCutoff; // missing date → keep (better than drop)
      });
      const attendanceNum = attRecs.length > 0
        ? Math.round((attRecs.filter(isPresent).length / attRecs.length) * 100)
        : null;
      const hasAttendanceData = attRecs.length > 0;

      // Multi-source academic merge with content fingerprint dedup so the
      // same exam recorded in `results` AND `test_scores` (some schools
      // mirror) doesn't double-count.
      const classScoreDocs = allScoreDocs.filter(r => inBranch(r) && matchesClass(r, c.id, className));
      const fpSeen = new Set<string>();
      const validPcts: number[] = [];
      const subAccum: Record<string, { sum: number; count: number }> = {};
      classScoreDocs.forEach(d => {
        const pct = pctOfDoc(d);
        if (pct === null) return;
        const subj = String(d.subject ?? d.subjectName ?? "").toLowerCase();
        const dateK = toDateStr(d.timestamp ?? d.createdAt ?? d.date);
        const fp = `${subj}|${dateK}|${Math.round(pct * 10)}`;
        if (fpSeen.has(fp)) return;
        fpSeen.add(fp);
        validPcts.push(pct);
        const subName = String(d.subject ?? d.subjectName ?? "").trim();
        if (subName) {
          if (!subAccum[subName]) subAccum[subName] = { sum: 0, count: 0 };
          subAccum[subName].sum += pct;
          subAccum[subName].count++;
        }
      });
      const avgMarksNum = validPcts.length > 0
        ? Math.round(validPcts.reduce((a, b) => a + b, 0) / validPcts.length)
        : null;
      const hasScoreData = validPcts.length > 0;

      // Weak subject only when we have real data
      let weakSubject = "—";
      if (hasScoreData) {
        const ranked = Object.entries(subAccum)
          .map(([sub, v]) => ({ sub, avg: Math.round(v.sum / v.count) }))
          .sort((a, b) => a.avg - b.avg);
        if (ranked.length > 0 && ranked[0].avg < 60) weakSubject = ranked[0].sub;
      }

      // Status + health honor null → "No Data" instead of fabricating "Weak"
      const status = classStatus(avgMarksNum, attendanceNum);
      const healthScore = (() => {
        if (!hasScoreData && !hasAttendanceData) return null;
        if (hasScoreData && hasAttendanceData) {
          return Math.round(avgMarksNum! * 0.5 + attendanceNum! * 0.5);
        }
        // Single signal — use it directly rather than averaging with 0
        return hasScoreData ? avgMarksNum! : attendanceNum!;
      })();

      return {
        id: c.id,
        name: className,
        grade: c.grade || "",
        section: c.section || "",
        subject: c.subject || "",
        teacherId: c.teacherId || "",
        teacherName: c.teacherName || "",
        schoolId: c.schoolId || "",
        branchId: c.branchId || "",
        room: c.room || "",
        status,
        studentCount,
        avgMarks: avgMarksNum !== null ? `${avgMarksNum}%` : "—",
        avgMarksNum,
        attendance: attendanceNum !== null ? `${attendanceNum}%` : "—",
        attendanceNum,
        healthScore,
        weakSubject,
        hasScoreData,
        hasAttendanceData,
      };
    });

    // Sort: numeric grade first, then section. Pure-string grades ("XII")
    // sort lexically among themselves AFTER numeric ones.
    rows.sort((a, b) => {
      const na = Number(a.grade), nb = Number(b.grade);
      const aIsNum = !isNaN(na), bIsNum = !isNaN(nb);
      if (aIsNum && bIsNum && na !== nb) return na - nb;
      if (aIsNum && !bIsNum) return -1;
      if (!aIsNum && bIsNum) return 1;
      if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      return a.section.localeCompare(b.section);
    });

    setClasses(rows);

    // Grade summary — average ONLY across classes WITH data so that
    // unstarted classes don't drag the grade-level average down.
    const gradeMap: Record<string, {
      sections: number; students: number;
      attVals: number[]; healthVals: number[];
    }> = {};
    rows.forEach(r => {
      const g = r.grade || "Ungraded";
      if (!gradeMap[g]) gradeMap[g] = { sections: 0, students: 0, attVals: [], healthVals: [] };
      gradeMap[g].sections++;
      gradeMap[g].students += r.studentCount;
      if (r.attendanceNum !== null) gradeMap[g].attVals.push(r.attendanceNum);
      if (r.healthScore !== null)   gradeMap[g].healthVals.push(r.healthScore);
    });

    const summary: GradeSummary[] = Object.entries(gradeMap)
      .map(([grade, v]) => ({
        grade,
        sections: v.sections,
        students: v.students,
        avgAttendance: v.attVals.length > 0
          ? Math.round(v.attVals.reduce((a, b) => a + b, 0) / v.attVals.length)
          : null,
        healthScore: v.healthVals.length > 0
          ? Math.round(v.healthVals.reduce((a, b) => a + b, 0) / v.healthVals.length)
          : null,
      }))
      .sort((a, b) => {
        const na = Number(a.grade), nb = Number(b.grade);
        return isNaN(na) || isNaN(nb) ? a.grade.localeCompare(b.grade) : na - nb;
      });

    setGradesSummary(summary);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────
  // P0: scope by schoolId ONLY server-side. branchId is filtered in compute()
  // via inBranch() because the enforceBranchId_* trigger backfills missing
  // branchId with ~1-2s lag → a server-side `where("branchId", ...)` would
  // silently hide fresh writes (memory: branchid_inference_lag).
  // Also: do NOT require branchId — multi-school principals or principals
  // without explicit branchId must still see their school's classes.
  const computeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) { setLoading(false); return; }

    setLoading(true);
    const C = [where("schoolId", "==", schoolId)];
    const unsubs: (() => void)[] = [];

    // Debounce: 7 listeners share one timer so compute() runs once after the
    // initial burst (prevents redundant re-renders and flicker on first load).
    const scheduleCompute = () => {
      if (computeTimerRef.current) clearTimeout(computeTimerRef.current);
      computeTimerRef.current = setTimeout(compute, 80);
    };

    // Real error handlers — empty `() => {}` swallowed permission denials
    // silently. Now logs to console for debugging without blocking other
    // listeners from producing useful output.
    const errLog = (label: string) => (err: Error) => {
      console.warn(`[ClassesSections] ${label} listener failed:`, err);
    };

    unsubs.push(onSnapshot(query(collection(db, "classes"),          ...C), snap => { classesRef.current    = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("classes")));
    unsubs.push(onSnapshot(query(collection(db, "enrollments"),      ...C), snap => { enrollRef.current     = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("enrollments")));
    unsubs.push(onSnapshot(query(collection(db, "attendance"),       ...C), snap => { attRef.current        = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("attendance")));
    // 3 score sources merged + content-fingerprint deduped in compute().
    unsubs.push(onSnapshot(query(collection(db, "results"),          ...C), snap => { resultsRef.current    = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("results")));
    unsubs.push(onSnapshot(query(collection(db, "test_scores"),      ...C), snap => { testScoresRef.current = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("test_scores")));
    unsubs.push(onSnapshot(query(collection(db, "gradebook_scores"), ...C), snap => { gradebookRef.current  = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("gradebook_scores")));
    unsubs.push(onSnapshot(query(collection(db, "teachers"),         ...C), snap => { setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, errLog("teachers")));

    // Safety net: if NO listener fires within 5s (rules deny / index missing),
    // unblock the spinner so the user sees the empty state rather than spinning.
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    return () => {
      if (computeTimerRef.current) clearTimeout(computeTimerRef.current);
      clearTimeout(safetyTimer);
      unsubs.forEach(u => u());
    };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Add class ────────────────────────────────────────────────────────────────
  const handleAddClass = async () => {
    const name = newClass.name.trim();
    const grade = newClass.grade.trim();
    if (!name || !grade) {
      return toast.error("Class name and grade are required.");
    }
    const schoolId = userData?.schoolId;
    // branchId is optional now (some principals don't have it set explicitly)
    const branchId = userData?.branchId || null;
    if (!schoolId) return toast.error("School context missing.");

    // Duplicate check — prevent two "10A" classes silently coexisting.
    const existsSame = classes.some(c =>
      c.name.toLowerCase() === name.toLowerCase()
      && (c.grade || "").toLowerCase() === grade.toLowerCase()
    );
    if (existsSame) {
      return toast.error(`A class named "${name}" already exists for grade ${grade}.`);
    }

    const selectedTeacher = teachers.find(t => t.id === newClassTeacherId);
    // S2 class-teacher designation (memory: session_2026-05-19_holiday_architecture):
    // - classes.classTeacherEmail is the AUTH-LEVEL match field used by the
    //   Firestore attendance create rule (auth.uid != teachers doc id, so we
    //   key the gate on email which Firebase Auth provides as a claim).
    // - classes.classTeacherId stays as the Firestore teachers doc id for
    //   UI display + back-compat with existing readers.
    // - role:"class" on the teaching_assignment lets cross-dashboard readers
    //   distinguish primary class teacher from subject teachers.
    const teacherEmailLower = (selectedTeacher?.email || "").toLowerCase();

    // One-homeroom-per-teacher constraint check (added 2026-05-20).
    // If the selected teacher is already class teacher of another class, the
    // new class designation will demote them from that one. Confirm first.
    const otherHomeroomsForAdd = selectedTeacher
      ? classesRef.current.filter((c: any) => {
          if (!c) return false;
          if (c.classTeacherId === selectedTeacher.id) return true;
          if (!c.classTeacherId && c.teacherId === selectedTeacher.id) return true;
          return false;
        })
      : [];
    if (otherHomeroomsForAdd.length > 0 && selectedTeacher) {
      const names = otherHomeroomsForAdd
        .map((c: any) => c.name || `${c.grade || ""}${c.section || ""}`)
        .filter(Boolean)
        .join(", ");
      const ok = window.confirm(
        `${selectedTeacher.name} is currently class teacher of: ${names}.\n\n` +
        `A teacher can be class teacher of only ONE class. ` +
        `Creating ${name} with them as class teacher will REMOVE their class-teacher status from ${names}.\n\n` +
        `Continue? (Tip: leave Class Teacher empty and designate later from the modal.)`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // Atomic: class + (optional) teaching_assignment in one writeBatch so
      // a failed assignment never leaves an orphan class.
      const batch = writeBatch(db);
      const classRef = doc(collection(db, "classes"));
      batch.set(classRef, {
        name,
        grade,
        section:     newClass.section.trim(),
        subject:     newClass.subject.trim(),
        teacherId:   selectedTeacher?.id   || "",
        teacherName: selectedTeacher?.name || "",
        // S2 designation fields — written alongside legacy teacherId so
        // existing readers keep working. Empty strings (not null) match
        // the legacy convention above; the attendance rule treats missing
        // classTeacherEmail as "no designation → fall through to staff gate".
        classTeacherId:    selectedTeacher?.id   || "",
        classTeacherEmail: teacherEmailLower,
        schoolId,
        branchId,
        status: "Active",
        createdAt: serverTimestamp(),
      });

      if (selectedTeacher) {
        const taRef = doc(collection(db, "teaching_assignments"));
        batch.set(taRef, {
          teacherId:    selectedTeacher.id,
          teacherEmail: teacherEmailLower,
          teacherName:  selectedTeacher.name || "",
          classId:      classRef.id,
          className:    name,
          subjectName:  newClass.subject.trim(), // legacy field — readers still use this
          subject:      newClass.subject.trim(), // S2 canonical field
          role:         "class",                  // S2 — initial assignment IS the class teacher
          schoolId,
          branchId,
          status: "active",
          createdAt: serverTimestamp(),
        });
        // One-homeroom enforcement: demote teacher from their previous
        // homeroom(s) in the same atomic batch.
        otherHomeroomsForAdd.forEach((c: any) => {
          batch.update(doc(db, "classes", c.id), {
            classTeacherId:    "",
            classTeacherEmail: "",
            teacherId:         "",
            teacherName:       "",
          });
        });
      }

      await batch.commit();

      // Deactivate this teacher's prior class-role teaching_assignments in
      // other classes. Done as a separate query+batch because the count is
      // bounded by one teacher's assignments (typically <10) and keeping it
      // out of the main create batch avoids a Firestore read inside the
      // initial setSaving optimistic path.
      if (selectedTeacher && otherHomeroomsForAdd.length > 0) {
        try {
          const teacherTaSnap = await getDocs(query(
            collection(db, "teaching_assignments"),
            where("schoolId", "==", schoolId),
            where("teacherId", "==", selectedTeacher.id),
          ));
          const demoteOps = teacherTaSnap.docs.filter(d => {
            const data = d.data() as Record<string, any>;
            // Only existing assignments in OTHER classes (we just created this one).
            if (data.classId === classRef.id) return false;
            const s = data.status;
            const isActive = !s || (typeof s === "string" && s.toLowerCase() === "active");
            if (!isActive) return false;
            const r = data.role;
            return !r || (typeof r === "string" && r.toLowerCase() === "class");
          });
          if (demoteOps.length > 0) {
            const CHUNK = 450;
            for (let i = 0; i < demoteOps.length; i += CHUNK) {
              const slice = demoteOps.slice(i, i + CHUNK);
              const demoteBatch = writeBatch(db);
              slice.forEach(d => demoteBatch.update(d.ref, { status: "inactive", deactivatedAt: serverTimestamp() }));
              await demoteBatch.commit();
            }
          }
        } catch (demoteErr) {
          console.warn("[ClassesSections] post-create demotion partial failure:", demoteErr);
          toast.warning("Class created, but couldn't fully demote teacher from old class. Re-designate manually.");
        }
      }

      toast.success(`Class "${name}" created!${selectedTeacher ? ` Assigned to ${selectedTeacher.name}.` : ""}`);
      setAddModal(false);
      setNewClass({ name: "", grade: "", section: "", subject: "" });
      setNewClassTeacherId("");
    } catch (err) {
      console.error("[ClassesSections] add class failed:", err);
      toast.error("Could not create class.");
    } finally {
      setSaving(false);
    }
  };

  // ── Assign teacher to existing class ────────────────────────────────────────
  // P0 fixes:
  //  1. Single atomic writeBatch — prior 3-step sequential write could leave
  //     class with new teacher but orphaned old teaching_assignment.
  //  2. Mark prior active teaching_assignments for this class as "inactive"
  //     before adding the new one (prevents duplicate active rows from
  //     accumulating with every teacher change — memory: stale denormalized
  //     state pattern).
  //  3. Enrollments query is schoolId-scoped (was unscoped — cross-tenant
  //     leak risk per memory: bug_pattern_unscoped_collection_reads).
  const handleAssignTeacher = async () => {
    if (!assigningClass || !assignTeacherId) return toast.error("Please select a teacher.");
    const teacher = teachers.find(t => t.id === assignTeacherId);
    if (!teacher) return;
    const schoolId = assigningClass.schoolId || userData?.schoolId;
    if (!schoolId) {
      return toast.error("School context missing — please re-login.");
    }
    const branchId = assigningClass.branchId || userData?.branchId || null;
    // S2 role gate. "class" replaces designation; "subject" is additive.
    const role: "class" | "subject" = assignRole;
    const teacherEmailLower = (teacher.email || "").toLowerCase();
    // For subject role, require a subject string so the assignment is
    // attributable — otherwise principal can't tell two subject teachers
    // for the same class apart on lists.
    const trimmedSubject = assignSubject.trim();
    if (role === "subject" && !trimmedSubject) {
      return toast.error("Please enter the subject this teacher will teach.");
    }
    const subjectForWrite = role === "subject"
      ? trimmedSubject
      : (assigningClass.subject || trimmedSubject || "");

    // ── ONE-HOMEROOM-PER-TEACHER constraint (added 2026-05-20) ─────────────
    // Real-world rule: a teacher is class teacher of AT MOST one class (their
    // homeroom). For all other classes they may be subject teacher. Before
    // saving a class-teacher designation, detect any other class where this
    // teacher is currently designated (post-migration `classTeacherId` match
    // OR legacy `teacherId` fallback) and confirm with the principal that we
    // will demote them from those classes.
    const otherHomerooms = role === "class"
      ? classesRef.current.filter((c: any) => {
          if (!c || c.id === assigningClass.id) return false;
          if (c.classTeacherId === teacher.id) return true;
          // Legacy fallback: pre-migration class still uses teacherId as
          // primary designation. Treat as class teacher.
          if (!c.classTeacherId && c.teacherId === teacher.id) return true;
          return false;
        })
      : [];
    if (otherHomerooms.length > 0) {
      const names = otherHomerooms
        .map((c: any) => c.name || `${c.grade || ""}${c.section || ""}`)
        .filter(Boolean)
        .join(", ");
      const ok = window.confirm(
        `${teacher.name} is currently class teacher of: ${names}.\n\n` +
        `A teacher can be class teacher of only ONE class. ` +
        `Assigning them here will REMOVE their class-teacher status from ${names}.\n\n` +
        `Continue?`
      );
      if (!ok) return;
    }

    setAssigning(true);
    try {
      // Pre-fetch everything we need to write so we can batch atomically.
      // Status filter moved CLIENT-SIDE — legacy teaching_assignments docs
      // created before the status field was introduced lack the field
      // entirely. A server-side `where status == "active"` silently excluded
      // those docs from the reassignment flow → old assignments never got
      // deactivated → ghost assignments persisted → new teacher inherited
      // the class with stale records. Memory: bug_pattern_teacher_class_pickers_single_source variant.
      //
      // For role==="subject" we DON'T need to pre-fetch enrollments — subject
      // teachers don't replace the primary teacher, so the enrollments rows'
      // teacherId/teacherName denorm stays pointed at the class teacher.
      //
      // For role==="class" we ALSO pre-fetch ALL teaching_assignments for this
      // teacher (by teacherId) so we can deactivate their role:"class" rows in
      // OTHER classes. Enforces one-homeroom-per-teacher.
      const [allTaSnap, teacherTaSnap, enrollSnap] = await Promise.all([
        getDocs(query(
          collection(db, "teaching_assignments"),
          where("schoolId", "==", schoolId),
          where("classId", "==", assigningClass.id),
        )),
        role === "class"
          ? getDocs(query(
              collection(db, "teaching_assignments"),
              where("schoolId", "==", schoolId),
              where("teacherId", "==", teacher.id),
            ))
          : Promise.resolve({ docs: [] as any[] }),
        role === "class"
          ? getDocs(query(
              collection(db, "enrollments"),
              where("schoolId", "==", schoolId),
              where("classId", "==", assigningClass.id),
            ))
          : Promise.resolve({ docs: [] as any[] }),
      ]);
      // Client-side filter — treat docs without a `status` field as active
      // (legacy default before the field was added). For role==="class" we
      // ALSO restrict deactivation to existing role:"class" (or legacy/missing
      // role — same as treating missing role as "class"); subject-teacher
      // assignments must survive a class-teacher reassignment.
      const isActive = (d: any) => {
        const s = (d.data() as { status?: unknown }).status;
        return !s || (typeof s === "string" && s.toLowerCase() === "active");
      };
      const isClassRoleOrLegacy = (d: any) => {
        const r = (d.data() as { role?: unknown }).role;
        return !r || (typeof r === "string" && r.toLowerCase() === "class");
      };
      const oldTaSnap = {
        docs: role === "class"
          ? allTaSnap.docs.filter(d => isActive(d) && isClassRoleOrLegacy(d))
          : [],
      };

      // Build the full ordered op list as plain data, then commit in 450-op
      // chunks. Capturing the latest batch ref is safer than closures over
      // a re-bound `batch` variable.
      type Op =
        | { kind: "set"; ref: any; data: any }
        | { kind: "update"; ref: any; data: any };
      const ops: Op[] = [];

      // 1. Class doc update — ONLY when designating class teacher. For
      //    role==="subject" the primary class teacher fields stay untouched.
      if (role === "class") {
        ops.push({
          kind: "update",
          ref: doc(db, "classes", assigningClass.id),
          data: {
            teacherId:         teacher.id,
            teacherName:       teacher.name || "",
            // S2 designation fields — keyed on teacher's Firestore doc id
            // (for UI lookup) AND email (for Firestore rule auth match).
            classTeacherId:    teacher.id,
            classTeacherEmail: teacherEmailLower,
          },
        });
      }

      // 2. Deactivate the prior CLASS-role active teaching_assignment(s) so
      //    duplicate active class teachers don't accumulate. Subject teachers
      //    are NOT deactivated.
      oldTaSnap.docs.forEach(d => {
        ops.push({
          kind: "update",
          ref: d.ref,
          data: { status: "inactive", deactivatedAt: serverTimestamp() },
        });
      });

      // 2b. One-homeroom-per-teacher enforcement: clear classTeacherId/Email
      //     on any OTHER class where this teacher is currently designated
      //     AND deactivate their role:"class" (or legacy) teaching_assignments
      //     for those other classes.
      if (role === "class") {
        otherHomerooms.forEach((c: any) => {
          ops.push({
            kind: "update",
            ref: doc(db, "classes", c.id),
            data: {
              classTeacherId:    "",
              classTeacherEmail: "",
              // Also clear legacy teacherId/teacherName so the demotion is
              // visible in all readers (some still consume classes.teacherId).
              teacherId:         "",
              teacherName:       "",
            },
          });
        });
        // Deactivate this teacher's active class-role assignments in OTHER classes.
        teacherTaSnap.docs.forEach((d: any) => {
          const data = d.data() as Record<string, any>;
          if (data.classId === assigningClass.id) return;
          const s = data.status;
          const isActive = !s || (typeof s === "string" && s.toLowerCase() === "active");
          if (!isActive) return;
          const r = data.role;
          const isClassRoleOrLegacy = !r || (typeof r === "string" && r.toLowerCase() === "class");
          if (!isClassRoleOrLegacy) return;
          ops.push({
            kind: "update",
            ref: d.ref,
            data: { status: "inactive", deactivatedAt: serverTimestamp() },
          });
        });
      }

      // 3. New active teaching_assignment with explicit role + subject.
      ops.push({
        kind: "set",
        ref: doc(collection(db, "teaching_assignments")),
        data: {
          teacherId:    teacher.id,
          teacherEmail: teacherEmailLower,
          teacherName:  teacher.name || "",
          classId:      assigningClass.id,
          className:    assigningClass.name,
          subjectName:  subjectForWrite,        // legacy field for existing readers
          subject:      subjectForWrite,        // S2 canonical field
          role,                                  // S2 — "class" | "subject"
          schoolId,
          branchId,
          status:       "active",
          createdAt:    serverTimestamp(),
        },
      });

      // 4. Update enrollments with new teacher fields — ONLY when class teacher
      //    is being changed. Subject teacher additions never touch enrollments.
      enrollSnap.docs.forEach(d => {
        ops.push({
          kind: "update",
          ref: d.ref,
          data: { teacherId: teacher.id, teacherName: teacher.name || "" },
        });
      });

      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const slice = ops.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(op => {
          if (op.kind === "set") batch.set(op.ref, op.data);
          else batch.update(op.ref, op.data);
        });
        await batch.commit();
      }

      const roleLabel = role === "class" ? "class teacher" : `subject teacher (${subjectForWrite})`;
      toast.success(`${teacher.name} assigned as ${roleLabel} for ${assigningClass.name}.`);
      setAssignModal(false);
      setAssigningClass(null);
      setAssignTeacherId("");
      setAssignRole("class");
      setAssignSubject("");
    } catch (err) {
      console.error("[ClassesSections] assign teacher failed:", err);
      toast.error("Failed to assign teacher. Try again.");
    } finally {
      setAssigning(false);
    }
  };

  // ── S2 Migration helper — one-shot backfill + duplicate resolution ──────
  // Idempotent. Safe to re-run.
  //
  // What it does:
  //  1. **Detect duplicates** — group classes by their "effective" primary
  //     teacher (post-migration `classTeacherId` if set, else legacy
  //     `teacherId`). Any teacher appearing on > 1 class violates the
  //     one-homeroom-per-teacher rule (memory: bug_pattern_one_homeroom_per_teacher).
  //  2. **Pick canonical class** for each duplicated teacher = earliest
  //     `createdAt`. That stays as their homeroom.
  //  3. **Demote** the teacher from all OTHER classes: clear
  //     classes.teacherId / teacherName / classTeacherId / classTeacherEmail.
  //     Those classes show "Assign Teacher" amber — principal designates the
  //     real class teacher.
  //  4. **Set S2 fields** on canonical class: classTeacherId + classTeacherEmail.
  //  5. **Stamp role** on every active teaching_assignment without one:
  //     - canonical class's TA for that teacher → role:"class"
  //     - any other TA → role:"subject" + subject inferred from the class's
  //       own `subject` field (so subject-teacher chips render correctly).
  //  6. **Don't touch** classes where the primary teacher is unique (only on
  //     one class) — just backfill classTeacherId/Email + role:"class" TA.
  // Memory: cross_dashboard_linking_rule applied — verified all 11 readers
  // tolerate the new fields (additive only, no rename).
  const runClassTeacherMigration = async () => {
    const schoolId = userData?.schoolId;
    if (!schoolId) return toast.error("School context missing — please re-login.");
    if (!confirm(
      "Backfill class-teacher designation for this school?\n\n" +
      "• Sets new S2 fields on each class\n" +
      "• Detects teachers who are class teacher of MULTIPLE classes (against the rule) and keeps them only on the FIRST class they were assigned to — the rest become 'no class teacher' so you can re-designate.\n" +
      "• Their teaching_assignments on other classes auto-flip to Subject Teacher with the class's subject.\n\n" +
      "Safe to re-run. New designations come from the Assign Teacher modal."
    )) return;
    setMigrating(true);
    setMigrationResult(null);
    try {
      const teachersById = new Map(teachers.map(t => [t.id as string, t]));
      const [classesSnap, taSnap] = await Promise.all([
        getDocs(query(collection(db, "classes"), where("schoolId", "==", schoolId))),
        getDocs(query(collection(db, "teaching_assignments"), where("schoolId", "==", schoolId))),
      ]);

      type ClassRec = {
        id: string;
        createdAt: number;
        classTeacherId: string;
        teacherId: string;
        subject: string;
        name: string;
      };
      const classRecords: ClassRec[] = classesSnap.docs.map(d => {
        const data = d.data() as Record<string, any>;
        const ts = data.createdAt;
        const createdAt: number =
          typeof ts?.toMillis === "function" ? ts.toMillis()
          : typeof ts === "number"            ? ts
          : 0;
        return {
          id: d.id,
          createdAt,
          classTeacherId: typeof data.classTeacherId === "string" ? data.classTeacherId : "",
          teacherId:      typeof data.teacherId      === "string" ? data.teacherId      : "",
          subject:        typeof data.subject        === "string" ? data.subject        : "",
          name:           typeof data.name           === "string" ? data.name           : "",
        };
      });
      // Effective primary teacher per class: classTeacherId wins; else legacy teacherId.
      const effectiveTeacherForClass = new Map<string, string>();
      classRecords.forEach(c => {
        const eff = c.classTeacherId || c.teacherId;
        if (eff) effectiveTeacherForClass.set(c.id, eff);
      });
      // Group classes by their effective primary teacher.
      const teacherToClasses = new Map<string, ClassRec[]>();
      classRecords.forEach(c => {
        const eff = effectiveTeacherForClass.get(c.id);
        if (!eff) return;
        if (!teacherToClasses.has(eff)) teacherToClasses.set(eff, []);
        teacherToClasses.get(eff)!.push(c);
      });
      // For each teacher → canonical (earliest createdAt) class id.
      const canonicalClassForTeacher = new Map<string, string>();
      teacherToClasses.forEach((list, tid) => {
        if (list.length === 0) return;
        const sorted = [...list].sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
          return a.id.localeCompare(b.id);   // deterministic tie-break
        });
        canonicalClassForTeacher.set(tid, sorted[0].id);
      });
      // Quick subject lookup per class id (used for TA subject backfill).
      const classSubjectById = new Map<string, string>();
      const classRecById = new Map<string, ClassRec>();
      classRecords.forEach(c => {
        classRecById.set(c.id, c);
        if (c.subject) classSubjectById.set(c.id, c.subject);
      });

      type Op = { ref: any; data: any };
      const ops: Op[] = [];
      let classesMigrated = 0;
      let demoted = 0;

      // ── Pass 1: classes ───────────────────────────────────────────────
      classRecords.forEach(c => {
        const eff = effectiveTeacherForClass.get(c.id);
        if (!eff) return;
        const canonical = canonicalClassForTeacher.get(eff);
        const isCanonical = canonical === c.id;
        if (isCanonical) {
          // Backfill S2 fields if missing. teacherId/teacherName left alone
          // (already correct since this class is canonical for this teacher).
          if (!c.classTeacherId) {
            const t = teachersById.get(eff);
            const email = (t?.email || "").toLowerCase();
            ops.push({
              ref: doc(db, "classes", c.id),
              data: { classTeacherId: eff, classTeacherEmail: email },
            });
            classesMigrated++;
          }
        } else {
          // Non-canonical: this teacher should NOT be class teacher here.
          // Clear ALL teacher fields so the class shows "Assign Teacher".
          ops.push({
            ref: doc(db, "classes", c.id),
            data: {
              classTeacherId:    "",
              classTeacherEmail: "",
              teacherId:         "",
              teacherName:       "",
            },
          });
          demoted++;
        }
      });

      // ── Pass 2: teaching_assignments ──────────────────────────────────
      let assignmentsMigrated = 0;
      taSnap.docs.forEach(d => {
        const data = d.data() as Record<string, any>;
        const hasRole = typeof data.role === "string" && data.role.length > 0;
        const s = data.status;
        const active = !s || (typeof s === "string" && s.toLowerCase() === "active");
        if (!active) return; // historical noise — skip
        const teacherId = typeof data.teacherId === "string" ? data.teacherId : "";
        const classId   = typeof data.classId   === "string" ? data.classId   : "";
        const t = teacherId ? teachersById.get(teacherId) : null;
        const canonical = canonicalClassForTeacher.get(teacherId);
        const inferredRole: "class" | "subject" =
          canonical && canonical === classId ? "class" : "subject";
        const patch: Record<string, any> = {};
        if (!hasRole) patch.role = inferredRole;
        if (!data.teacherEmail && t?.email) patch.teacherEmail = (t.email || "").toLowerCase();
        if (inferredRole === "subject") {
          const classSubj = classSubjectById.get(classId) || "";
          // Backfill subject/subjectName only if missing — preserve any explicit
          // subject the principal may have set already.
          if (!data.subject && classSubj) patch.subject = classSubj;
          if (!data.subjectName && classSubj) patch.subjectName = classSubj;
        }
        if (Object.keys(patch).length > 0) {
          ops.push({ ref: d.ref, data: patch });
          assignmentsMigrated++;
        }
      });

      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const slice = ops.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(op => batch.update(op.ref, op.data));
        await batch.commit();
      }

      setMigrationResult({ classes: classesMigrated, assignments: assignmentsMigrated, demoted });
      if (ops.length === 0) {
        toast.success("Nothing to migrate — all classes + assignments already carry S2 fields.");
      } else if (demoted > 0) {
        toast.success(
          `Migrated ${classesMigrated} classes + ${assignmentsMigrated} assignments. ` +
          `Demoted ${demoted} duplicate class-teacher designation${demoted === 1 ? "" : "s"} — re-designate via the Assign Teacher modal.`,
          { duration: 8000 },
        );
      } else {
        toast.success(`Migrated ${classesMigrated} classes + ${assignmentsMigrated} assignments.`);
      }
    } catch (err) {
      console.error("[ClassesSections] class-teacher migration failed:", err);
      toast.error("Migration failed. Check console.");
    } finally {
      setMigrating(false);
    }
  };

  // ── Edit class (rename + grade/section/subject) ──────────────────────────
  // The rename cascade is server-side: parent-dashboard/functions
  // cascadeClassRename auto-propagates the new className across ~25
  // denormalized collections. UI just writes the source doc.
  const openEditClass = (cls: ClassRow) => {
    setEditingClass(cls);
    setEditFields({
      name:    cls.name    || "",
      grade:   cls.grade   || "",
      section: cls.section || "",
      subject: cls.subject || "",
    });
    setEditClassModal(true);
  };

  const handleSaveClassEdit = async () => {
    if (!editingClass) return;
    const nextName = editFields.name.trim();
    if (!nextName) return toast.error("Class name cannot be empty.");
    // Duplicate-name guard — same shape as handleAddClass.
    const nameLower = nextName.toLowerCase();
    const gradeLower = editFields.grade.trim().toLowerCase();
    const clash = classes.some(c =>
      c.id !== editingClass.id
      && c.name.toLowerCase() === nameLower
      && (c.grade || "").toLowerCase() === gradeLower
    );
    if (clash) return toast.error(`Another class "${nextName}" already exists at grade ${editFields.grade || "—"}.`);
    setSavingEdit(true);
    try {
      const patch: Record<string, any> = {
        name:    nextName,
        grade:   editFields.grade.trim(),
        section: editFields.section.trim(),
        subject: editFields.subject.trim(),
      };
      await updateDoc(doc(db, "classes", editingClass.id), patch);
      const renamed = nextName !== editingClass.name;
      if (renamed) {
        toast.success(
          `Class renamed to "${nextName}". Cascade is updating all dashboards — refresh in a few seconds.`,
          { duration: 6000 },
        );
      } else {
        toast.success(`Class "${nextName}" updated.`);
      }
      setEditClassModal(false);
      setEditingClass(null);
    } catch (err) {
      console.error("[ClassesSections] save class edit failed:", err);
      toast.error("Failed to save class changes.");
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Add Students to class ────────────────────────────────────────────────────
  const openStudentModal = async (cls: ClassRow) => {
    setStudentModalClass(cls);
    setStudentModal(true);
    setStudentTab("existing");
    setStudentSearch("");
    setSelectedSids([]);
    setInviteStudentForm({ name: "", email: "" });
    setStudentsLoading(true);
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setStudentsLoading(false); return; }
    try {
      const [studentSnap, enrollSnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolId", "==", schoolId), where("branchId", "==", branchId))),
        getDocs(query(collection(db, "enrollments"), where("classId", "==", cls.id), where("schoolId", "==", schoolId))),
      ]);
      const enrolledIds = new Set([
        ...enrollSnap.docs.map(d => d.data().studentId),
        ...enrollSnap.docs.map(d => (d.data().studentEmail || "").toLowerCase()),
      ]);
      setSchoolStudents(
        studentSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(s => !enrolledIds.has(s.id) && !enrolledIds.has((s.email || "").toLowerCase()))
      );
    } catch { }
    setStudentsLoading(false);
  };

  const handleAddExistingToClass = async () => {
    if (!studentModalClass || selectedSids.length === 0) return toast.error("Select at least one student.");
    setEnrolling(true);
    try {
      const toAdd = schoolStudents.filter(s => selectedSids.includes(s.id));
      // Single writeBatch instead of N sequential round-trips. Chunk at 450
      // ops to stay under Firestore's 500-op cap (handles huge bulk imports).
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
            classId:      studentModalClass.id,
            className:    studentModalClass.name,
            teacherId:    studentModalClass.teacherId   || "",
            teacherName:  studentModalClass.teacherName || "",
            schoolId:     studentModalClass.schoolId,
            branchId:     studentModalClass.branchId,
            createdAt:    serverTimestamp(),
          });
        });
        await batch.commit();
      }
      toast.success(`${toAdd.length} student${toAdd.length > 1 ? "s" : ""} added to ${studentModalClass.name}!`);
      setStudentModal(false);
      setSelectedSids([]);
    } catch (err) {
      console.error("[ClassesSections] add existing students failed:", err);
      toast.error("Failed to add students. Try again.");
    }
    setEnrolling(false);
  };

  const handleInviteStudentToClass = async () => {
    if (!studentModalClass) return;
    if (!inviteStudentForm.name.trim() || !inviteStudentForm.email.trim())
      return toast.error("Name and email are required.");
    setInviting(true);
    const email = inviteStudentForm.email.toLowerCase().trim();
    const name  = inviteStudentForm.name.trim();
    const cls   = studentModalClass;
    // Basic email-shape validation — catches obvious typos before we hit
    // the email API and waste a request.
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
        classId:     cls.id,
        className:   cls.name,
        teacherId:   cls.teacherId   || "",
        teacherName: cls.teacherName || "",
        schoolId:    cls.schoolId,
        branchId:    cls.branchId,
        status:      "Active",
        createdAt:   serverTimestamp(),
      });
      batch.set(enrollmentRef, {
        studentId:    studentRef.id,
        studentEmail: email,
        studentName:  name,
        classId:      cls.id,
        className:    cls.name,
        teacherId:    cls.teacherId   || "",
        teacherName:  cls.teacherName || "",
        schoolId:     cls.schoolId,
        branchId:     cls.branchId,
        createdAt:    serverTimestamp(),
      });
      await batch.commit();

      // P0-D pattern (per RiskIntervention fix): actually CHECK the email
      // response. Previously `.catch(() => {})` swallowed 4xx/5xx and the
      // toast lied "invitation sent" on failure. Now report email failures
      // as a separate warning so the principal can re-send.
      let emailFailed = false;
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: `You've been enrolled — ${cls.name}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;"><h2 style="color:#1e3a8a;margin-bottom:8px;">Welcome, ${name}!</h2><p style="color:#555;">You have been enrolled in <strong>${cls.name}</strong>${cls.teacherName ? ` — Teacher: <strong>${cls.teacherName}</strong>` : ""}.</p><div style="margin:28px 0;text-align:center;"><a href="https://parent-dashboard-ten.vercel.app/" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Go to Student Portal</a></div><p style="color:#aaa;font-size:12px;text-align:center;">Use your email (${email}) to sign in.</p></div>`,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          console.error("[ClassesSections] invite email API failed:", res.status, errBody);
          emailFailed = true;
        }
      } catch (mailErr) {
        console.error("[ClassesSections] invite email network failed:", mailErr);
        emailFailed = true;
      }

      if (emailFailed) {
        toast.warning(`${name} enrolled, but invitation email failed. Re-send manually.`);
      } else {
        toast.success(`${name} enrolled & invitation sent!`);
      }
      setInviteStudentForm({ name: "", email: "" });
      setStudentModal(false);
    } catch (err) {
      console.error("[ClassesSections] invite student failed:", err);
      toast.error("Failed to enroll student. Try again.");
    }
    setInviting(false);
  };

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selectedSection) {
    return (
      <ClassPerformance
        classDoc={selectedSection}
        onBack={() => setSelectedSection(null)}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={isMobile ? "animate-in fade-in duration-500" : "space-y-8 animate-in fade-in duration-500 pb-12"}>

      {isMobile ? (
        <ClassesSectionsMobile
          loading={loading}
          classes={classes}
          gradesSummary={gradesSummary}
          onAddClass={() => setAddModal(true)}
          onChangeTeacher={cls => {
            setAssigningClass(cls);
            setAssignTeacherId(cls.teacherId || "");
            setAssignModal(true);
          }}
          onEditClass={cls => openEditClass(cls)}
          onOpenStudents={cls => openStudentModal(cls)}
          onViewSection={cls => setSelectedSection(cls)}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      ) : (
      <>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Classes & Sections</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">Overview of all classes and sections</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runClassTeacherMigration}
            disabled={migrating}
            title="Backfill class-teacher designation for existing classes (idempotent — safe to re-run)"
            className="flex items-center gap-2 px-4 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 disabled:opacity-60 transition-colors shadow-sm"
          >
            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {migrating ? "Migrating..." : "Backfill Class Teachers"}
            {migrationResult && (
              <span className="text-[10px] font-black ml-1 flex items-center gap-1">
                <span className="text-emerald-600">
                  · {migrationResult.classes + migrationResult.assignments} updated
                </span>
                {migrationResult.demoted > 0 && (
                  <span className="text-amber-600">
                    · {migrationResult.demoted} demoted
                  </span>
                )}
              </span>
            )}
          </button>
          <button
            onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md"
          >
            <Plus className="w-4 h-4" /> Add Class
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm">
          <Loader2 className="w-10 h-10 animate-spin text-slate-300 mb-4" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Classes...</p>
        </div>
      ) : (
        <>
          {/* Grade Summary Cards */}
          {gradesSummary.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {gradesSummary.map(g => {
                const Icon = healthIcon(g.healthScore);
                return (
                  <div key={g.grade} className="bg-white border border-slate-100 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-sm font-black text-slate-900">Grade {g.grade}</h3>
                      <Icon className={`w-4 h-4 ${healthColor(g.healthScore)}`} />
                    </div>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Sections</span>
                        <span className="font-black text-slate-900">{g.sections}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Students</span>
                        <span className="font-black text-slate-900">{g.students}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Avg Attendance</span>
                        <span className={`font-black ${
                          g.avgAttendance === null ? "text-slate-300"
                          : g.avgAttendance >= 85 ? "text-green-600"
                          : g.avgAttendance >= 70 ? "text-amber-500"
                          : "text-rose-600"
                        }`}>
                          {g.avgAttendance !== null ? `${g.avgAttendance}%` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Health Score</span>
                        <span className={`font-black ${healthColor(g.healthScore)}`}>
                          {g.healthScore !== null ? `${g.healthScore}/100` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Section Performance Table */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Section Performance</h2>
              <span className="text-xs text-slate-400 font-medium">{classes.length} class{classes.length !== 1 ? "es" : ""}</span>
            </div>

            {classes.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                  <GraduationCap className="w-10 h-10 text-slate-200" />
                </div>
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No classes found</p>
                <p className="text-xs text-slate-300 mt-2">Add a class or wait for teachers to create classes</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Section</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Class Teacher</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Students</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Avg Marks</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Attendance</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Weak Subject</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {classes
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map(cls => {
                      const Icon = statusIcon(cls.status);
                      return (
                        <tr key={cls.id} className="hover:bg-slate-50/30 transition-colors group">
                          {/* Section */}
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm ${
                                cls.status === "Good"    ? "bg-green-500" :
                                cls.status === "Weak"    ? "bg-rose-500" :
                                cls.status === "No Data" ? "bg-slate-400" :
                                "bg-amber-500"
                              }`}>
                                {cls.name.slice(0, 3)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-slate-900 truncate">{cls.name}</p>
                                  <button
                                    onClick={() => openEditClass(cls)}
                                    title="Edit class (rename cascades to all dashboards)"
                                    className="text-slate-300 hover:text-[#1e3a8a] transition-colors shrink-0"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                                {cls.subject && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{cls.subject}</p>}
                              </div>
                            </div>
                          </td>

                          {/* Teacher */}
                          <td className="px-6 py-5">
                            {cls.teacherName ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span className="text-sm font-medium text-slate-700">{cls.teacherName}</span>
                                </div>
                                <button
                                  onClick={() => { setAssigningClass(cls); setAssignTeacherId(cls.teacherId || ""); setAssignModal(true); }}
                                  className="text-[10px] text-blue-500 hover:text-blue-700 font-bold underline underline-offset-2"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAssigningClass(cls); setAssignTeacherId(""); setAssignModal(true); }}
                                className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-bold hover:bg-amber-100 transition-colors"
                              >
                                <UserPlus className="w-3 h-3" /> Assign Teacher
                              </button>
                            )}
                          </td>

                          {/* Students */}
                          <td className="px-6 py-5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-black text-slate-900">{cls.studentCount}</span>
                            </div>
                          </td>

                          {/* Avg Marks — null = "—" gray (no data), never red */}
                          <td className="px-6 py-5 text-center">
                            <span className={`font-black text-base ${
                              cls.avgMarksNum === null   ? "text-slate-300" :
                              cls.avgMarksNum >= 70      ? "text-green-600" :
                              cls.avgMarksNum >= 50      ? "text-amber-500" :
                              "text-rose-600"
                            }`}>
                              {cls.avgMarks}
                            </span>
                          </td>

                          {/* Attendance — same null-safe logic */}
                          <td className="px-6 py-5 text-center">
                            <span className={`font-black text-base ${
                              cls.attendanceNum === null ? "text-slate-300" :
                              cls.attendanceNum >= 85    ? "text-green-600" :
                              cls.attendanceNum >= 70    ? "text-amber-500" :
                              "text-rose-600"
                            }`}>
                              {cls.attendance}
                            </span>
                          </td>

                          {/* Weak Subject */}
                          <td className="px-6 py-5">
                            <span className={`text-sm font-medium ${cls.weakSubject !== "—" ? "text-rose-500" : "text-slate-300"}`}>
                              {cls.weakSubject}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${statusColor(cls.status)}`} />
                              <span className={`text-sm font-bold ${statusColor(cls.status)}`}>{cls.status}</span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openStudentModal(cls)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-black hover:bg-indigo-100 transition-colors"
                                title="Add students to this class"
                              >
                                <UserPlus className="w-3.5 h-3.5" /> Students
                              </button>
                              <button
                                onClick={() => setSelectedSection(cls)}
                                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-[#1e3a8a] transition-colors shadow-sm"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination footer — only renders when classes exist */}
            {classes.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100">
                <StudentsPagination
                  totalItems={classes.length}
                  currentPage={currentPage}
                  setCurrentPage={setCurrentPage}
                  pageSize={pageSize}
                  setPageSize={setPageSize}
                  variant="desktop"
                  itemNoun={{ one: "class", other: "classes" }}
                />
              </div>
            )}
          </div>
        </>
      )}
      </>
      )}

      {/* ── Add Class Modal ── */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add New Class</h3>
              <button onClick={() => setAddModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Class Name *</label>
                <input
                  type="text"
                  placeholder="e.g. 9A, Class 10B"
                  value={newClass.name}
                  onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Grade *</label>
                  <input
                    type="text"
                    placeholder="e.g. 9, 10"
                    value={newClass.grade}
                    onChange={e => setNewClass(p => ({ ...p, grade: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Section</label>
                  <input
                    type="text"
                    placeholder="e.g. A, B"
                    value={newClass.section}
                    onChange={e => setNewClass(p => ({ ...p, section: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Subject (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Mathematics, Science"
                  value={newClass.subject}
                  onChange={e => setNewClass(p => ({ ...p, subject: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Assign Class Teacher (optional)</label>
                <select
                  value={newClassTeacherId}
                  onChange={e => setNewClassTeacherId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-white appearance-none"
                >
                  <option value="">— Assign later —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.subject ? ` · ${t.subject}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setAddModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddClass}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Students Modal ── */}
      {studentModal && studentModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#1e3a8a]" /> Add Students to {studentModalClass.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Assign existing students or invite new ones</p>
              </div>
              <button onClick={() => setStudentModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 shrink-0">
              <button onClick={() => setStudentTab("existing")} className={`flex-1 py-3 text-sm font-bold transition-colors ${studentTab === "existing" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                From School List
              </button>
              <button onClick={() => setStudentTab("invite")} className={`flex-1 py-3 text-sm font-bold transition-colors ${studentTab === "invite" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                Invite New Student
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {studentTab === "existing" ? (
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
                          {schoolStudents.length === 0 ? "All school students are already in this class." : "No students match your search."}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">Use "Invite New Student" to add someone new.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSids.length > 0 && (
                          <p className="text-xs font-bold text-[#1e3a8a] mb-1">{selectedSids.length} selected</p>
                        )}
                        {filtered.map((s: any) => {
                          const isSel = selectedSids.includes(s.id);
                          return (
                            <div key={s.id} onClick={() => setSelectedSids(prev => isSel ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSel ? "bg-blue-50 border-[#1e3a8a]/30" : "border-slate-100 hover:bg-slate-50"}`}
                            >
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? "bg-[#1e3a8a] border-[#1e3a8a]" : "border-slate-300"}`}>
                                {isSel && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600 shrink-0">
                                {(s.name || "S").substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{s.name || "Unknown"}</p>
                                <p className="text-xs text-slate-400 truncate">{s.email}</p>
                              </div>
                              {s.className && s.className !== studentModalClass.name && (
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
                    <input type="text" placeholder="e.g. Rahul Sharma" value={inviteStudentForm.name}
                      onChange={e => setInviteStudentForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Email Address *</label>
                    <input type="email" placeholder="student@example.com" value={inviteStudentForm.email}
                      onChange={e => setInviteStudentForm(p => ({ ...p, email: e.target.value }))}
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
              <button onClick={() => setStudentModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              {studentTab === "existing" ? (
                <button onClick={handleAddExistingToClass} disabled={enrolling || selectedSids.length === 0}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {enrolling ? "Adding..." : `Add${selectedSids.length > 0 ? ` (${selectedSids.length})` : ""}`}
                </button>
              ) : (
                <button onClick={handleInviteStudentToClass} disabled={inviting || !inviteStudentForm.name || !inviteStudentForm.email}
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

      {/* ── Edit Class Modal (rename cascades server-side) ── */}
      {editClassModal && editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-[#1e3a8a]" />
                  Edit Class
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{editingClass.name}</p>
              </div>
              <button
                onClick={() => { setEditClassModal(false); setEditingClass(null); }}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Class Name *</label>
                <input
                  type="text"
                  placeholder="e.g. 9A, Class 10B"
                  value={editFields.name}
                  onChange={e => setEditFields(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
                {editFields.name.trim() && editFields.name.trim() !== editingClass.name && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 leading-relaxed">
                    <strong>Heads up:</strong> renaming this class will propagate the new name across teacher / parent / owner dashboards via background cascade. Takes a few seconds to fully sync.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Grade</label>
                  <input
                    type="text"
                    placeholder="e.g. 9, 10"
                    value={editFields.grade}
                    onChange={e => setEditFields(p => ({ ...p, grade: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Section</label>
                  <input
                    type="text"
                    placeholder="e.g. A, B"
                    value={editFields.section}
                    onChange={e => setEditFields(p => ({ ...p, section: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Mathematics, Science"
                  value={editFields.subject}
                  onChange={e => setEditFields(p => ({ ...p, subject: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setEditClassModal(false); setEditingClass(null); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveClassEdit}
                  disabled={savingEdit || !editFields.name.trim()}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {savingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Teacher Modal (S2: role-aware) ── */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#1e3a8a]" />
                  Assign Teacher to Class
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{assigningClass?.name}</p>
              </div>
              <button
                onClick={() => { setAssignModal(false); setAssigningClass(null); setAssignTeacherId(""); setAssignRole("class"); setAssignSubject(""); }}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Role selector */}
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Role *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignRole("class")}
                    className={`px-3 py-3 rounded-xl border text-left transition-colors ${
                      assignRole === "class"
                        ? "border-[#1e3a8a] bg-blue-50/60 ring-2 ring-[#1e3a8a]/20"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className={`text-sm font-black ${assignRole === "class" ? "text-[#1e3a8a]" : "text-slate-800"}`}>Class Teacher</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium leading-snug">Marks daily attendance · one per class</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignRole("subject")}
                    className={`px-3 py-3 rounded-xl border text-left transition-colors ${
                      assignRole === "subject"
                        ? "border-violet-500 bg-violet-50/60 ring-2 ring-violet-500/20"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className={`text-sm font-black ${assignRole === "subject" ? "text-violet-700" : "text-slate-800"}`}>Subject Teacher</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium leading-snug">Teaches a subject · multiple per class</p>
                  </button>
                </div>
              </div>

              {/* Subject input — REQUIRED for subject role */}
              {assignRole === "subject" && (
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Subject *</label>
                  <input
                    type="text"
                    placeholder="e.g. Mathematics, Hindi"
                    value={assignSubject}
                    onChange={e => setAssignSubject(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>
              )}

              {/* Teacher select */}
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Select Teacher *</label>
                {teachers.length === 0 ? (
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-medium text-amber-700">
                    No teachers found. Add teachers first from the Teachers page.
                  </div>
                ) : (
                  <select
                    value={assignTeacherId}
                    onChange={e => setAssignTeacherId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-white appearance-none"
                  >
                    <option value="">— Select a teacher —</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.subject ? ` · ${t.subject}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Current designation hint */}
              {assigningClass?.teacherName && assignRole === "class" && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  Current class teacher: <span className="font-bold text-slate-700">{assigningClass.teacherName}</span> — will be replaced.
                </p>
              )}
              {assignRole === "subject" && (
                <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2 leading-relaxed">
                  Subject teachers can record incidents, notes, and grades — but only the class teacher marks daily attendance.
                </p>
              )}
              {/* One-homeroom-per-teacher conflict warning. Shown when the
                  selected teacher is already class teacher of another class
                  AND the chosen role is "class" — saving will move them. */}
              {assignRole === "class" && assignTeacherId && (() => {
                const t = teachers.find(x => x.id === assignTeacherId);
                if (!t) return null;
                const otherHomerooms = classesRef.current.filter((c: any) => {
                  if (!c || (assigningClass && c.id === assigningClass.id)) return false;
                  if (c.classTeacherId === t.id) return true;
                  if (!c.classTeacherId && c.teacherId === t.id) return true;
                  return false;
                });
                if (otherHomerooms.length === 0) return null;
                const names = otherHomerooms
                  .map((c: any) => c.name || `${c.grade || ""}${c.section || ""}`)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed text-amber-800">
                    <strong>Note:</strong> {t.name} is currently class teacher of <strong>{names}</strong>. A teacher can be class teacher of only one class — saving will remove them from {names}.
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setAssignModal(false); setAssigningClass(null); setAssignTeacherId(""); setAssignRole("class"); setAssignSubject(""); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignTeacher}
                  disabled={assigning || !assignTeacherId || (assignRole === "subject" && !assignSubject.trim())}
                  className={`flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 ${
                    assignRole === "class" ? "bg-[#1e3a8a] hover:bg-[#1e4fc0]" : "bg-violet-600 hover:bg-violet-700"
                  }`}
                >
                  {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  {assigning ? "Assigning..." : assignRole === "class" ? "Assign Class Teacher" : "Add Subject Teacher"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassesSections;
