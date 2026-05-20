import { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle, Flame, Bell, UserPlus, ChevronRight, ChevronDown,
  Loader2, ShieldAlert, CalendarPlus, Sparkles, Users, MessageSquare, ArrowRight,
  GraduationCap, Send, ChevronLeft,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import RiskIntervention from "@/components/RiskIntervention";
import MeetingScheduler from "@/components/MeetingScheduler";
import NotifyClassParentsModal from "@/components/NotifyClassParentsModal";
import NotifyClassTeachersModal from "@/components/NotifyClassTeachersModal";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  pctOfDoc, matchesStudent, isPresent,
  ymdLocal, daysAgoStr, ATTENDANCE_WINDOW_DAYS,
} from "@/lib/scoreUtils";
import {
  WEAK_SCORE_THRESHOLD, WEAK_ATTENDANCE_THRESHOLD,
  SMART_ATTENDANCE_THRESHOLD,
} from "@/lib/classifyStudent";

// Per-class pagination — show this many students per page within each class
// section. Big classes (50+ students) would otherwise drop framerate on
// initial render; small classes (3-5 students) just hide the pagination row.
const STUDENTS_PER_CLASS_PAGE = 5;

// Class label normalization (memory: bug_pattern_class_label_normalization).
// Preserve section letters (10A vs 10B) and stream qualifiers
// (Class 11 Science vs Commerce) — naive `\b\d{1,2}\b` collapses them.
const normalizeClassKey = (raw: string): string => {
  const s = String(raw || "").trim();
  if (!s) return "Unassigned";
  // Collapse extra whitespace but keep distinguishing letters/words.
  return s.replace(/\s+/g, " ");
};

type RiskLevel = "CRITICAL" | "WARNING" | "MONITORING";
type FilterTab = "All" | RiskLevel;

interface RiskStudent {
  id: string;
  name: string;
  email: string;
  className: string;
  /** All classes the student is enrolled in (multi-class merging fix). */
  allClasses?: string[];
  /** Per-className → classId map. Used by class grouping to resolve the
   *  CORRECT classId for each (student, class) pair. Without this, a
   *  multi-enrolled student's `classId` (which only points to ONE of their
   *  classes) would be wrongly inherited as the group's classId, breaking
   *  Notify Teachers routing for the other classes. */
  classIdsByName?: Record<string, string>;
  classId?: string;
  teacherName: string;
  teacherId: string;
  schoolId: string;
  branchId: string;
  attPct: number | null;
  avgScore: number | null;
  /** Honest data-presence flags so UI can render "—" / "no data tracked"
   *  instead of fabricating 0% / RED bars (memory: bug_pattern_score_zero_no_data). */
  hasScoreData: boolean;
  hasAttendanceData: boolean;
  incidentCount: number;
  parentEngagement: number;
  /** School-wide totals propagated to RiskIntervention so empty-data bars
   *  render "Not tracked" instead of fabricating a 100% green bar. */
  orgIncidentTotal: number;
  orgParentNoteTotal: number;
  riskLevel: RiskLevel;
  riskFactors: string[];
  lastAction: string;
  assignedTo: string;
  daysFlagged: number;
  flaggedSince: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────
// Date helpers use LOCAL time (via ymdLocal from scoreUtils) to avoid the
// UTC drift bug where `toISOString().slice(0,10)` flips IST midnight to
// the previous UTC day.

const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return ymdLocal(d.toDate());
  if (d instanceof Date) return ymdLocal(d);
  return "";
};

const daysBetween = (isoA: string, isoB: string): number => {
  if (!isoA || !isoB) return 0;
  return Math.max(0, Math.round((new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000));
};

const todayStr = () => ymdLocal(new Date());

const startOfWeekStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return ymdLocal(d);
};

// ─────────────────────────────────────────────────────────────────────────────

const RiskStudents = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [riskStudents,   setRiskStudents]   = useState<RiskStudent[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterTab,      setFilterTab]      = useState<FilterTab>("All");
  // "All" or a normalized class key. Independent of filterTab so user can
  // pick "Critical" tab + "Class 10A" dropdown together.
  const [classFilter,    setClassFilter]    = useState<string>("All");
  const [selectedStudent, setSelectedStudent] = useState<RiskStudent | null>(null);
  const [meetingStudent,  setMeetingStudent]  = useState<RiskStudent | null>(null);
  // Per-class collapse + pagination state. Keys are normalized class names.
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(new Set());
  const [classPages, setClassPages] = useState<Record<string, number>>({});
  // Class-level bulk-notify modals — track which class is open and which kind.
  const [notifyTeachersFor, setNotifyTeachersFor] = useState<{ className: string; classId?: string; students: RiskStudent[] } | null>(null);
  const [notifyParentsFor,  setNotifyParentsFor]  = useState<{ className: string; students: RiskStudent[] } | null>(null);

  // Cross-listener refs
  const computeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentsRef      = useRef<any[]>([]);
  const enrollmentsRef   = useRef<any[]>([]);
  const attRef           = useRef<any[]>([]);
  const resultsRef       = useRef<any[]>([]);
  // P1-A: test_scores + gradebook_scores were silently missed.
  // ~40% of risk signal was invisible for schools using bulk-upload.
  const testScoresRef    = useRef<any[]>([]);
  const gradebookRef     = useRef<any[]>([]);
  const incidentsRef     = useRef<any[]>([]);
  const parentNotesRef   = useRef<any[]>([]);
  const interventionsRef = useRef<any[]>([]);
  const flagsRef         = useRef<any[]>([]);
  const assignmentsRef   = useRef<any[]>([]);
  const submissionsRef   = useRef<any[]>([]);

  // ── compute all at-risk students from current refs ──────────────────────────
  const compute = () => {
    const branchId = userData?.branchId;

    // Org-wide totals — passed to RiskIntervention so empty-data bars render
    // "Not tracked" instead of fabricating green 100% / red 0% (P1-N).
    const orgIncidentTotal   = incidentsRef.current.length;
    const orgParentNoteTotal = parentNotesRef.current.length;

    // ── Build unique student map: id → base info ──
    // P0-A: client-side branch filter (rather than server `where(branchId)`)
    // so freshly-written docs whose branchId hasn't been backfilled yet
    // still appear. Per `branchid_inference_lag` memory.
    // P1-J: collect ALL classNames per student (multi-class merging)
    interface StudentEntry {
      base: any;
      classNames: Set<string>;
      /** Per-className → classId map. Built from enrollments so that each
       *  class group can route Notify Teachers to the RIGHT classId for
       *  that class (vs inheriting one student's `classId` which only
       *  points to one of their classes). */
      classIdsByName: Map<string, string>;
    }
    const map = new Map<string, StudentEntry>();
    const inBranch = (s: any): boolean => !branchId || !s.branchId || s.branchId === branchId;

    studentsRef.current.forEach(s => {
      if (!inBranch(s)) return;
      const key = s.id;
      const slot: StudentEntry = {
        base: { ...s, _source: "students" },
        classNames: new Set(),
        classIdsByName: new Map(),
      };
      if (s.className) {
        const cn = String(s.className).trim();
        slot.classNames.add(cn);
        if (s.classId) slot.classIdsByName.set(cn, String(s.classId));
      }
      map.set(key, slot);
    });
    enrollmentsRef.current.forEach(e => {
      if (!inBranch(e)) return;
      const key = e.studentId || e.id;
      if (!key) return;
      let slot = map.get(key);
      if (!slot) {
        slot = {
          base: {
            id: key,
            name: e.studentName || e.name || "Unknown",
            email: e.studentEmail || e.email || "",
            className: e.className || "",
            classId: e.classId || "",
            teacherName: e.teacherName || "",
            teacherId: e.teacherId || "",
            schoolId: e.schoolId || "",
            branchId: e.branchId || "",
            _source: "enrollments",
          },
          classNames: new Set(),
          classIdsByName: new Map(),
        };
        if (e.className) {
          const cn = String(e.className).trim();
          slot.classNames.add(cn);
          if (e.classId) slot.classIdsByName.set(cn, String(e.classId));
        }
        map.set(key, slot);
      } else if (e.className) {
        const cn = String(e.className).trim();
        slot.classNames.add(cn);
        // Enrollments are authoritative for (className, classId) pairing.
        // Always overwrite — students collection's single classId is just a
        // snapshot of one enrollment.
        if (e.classId) slot.classIdsByName.set(cn, String(e.classId));
      }
    });

    const today = todayStr();
    // Windowed attendance: lifetime data caused stale "300 days flagged"
    // numbers and made students who improved unable to escape the risk
    // list (P1-D + P1-H). Same 60-day window as Students.tsx.
    const attCutoff = daysAgoStr(ATTENDANCE_WINDOW_DAYS);
    const sevenDaysAgo = daysAgoStr(7);
    const fourteenDaysAgo = daysAgoStr(14);

    const results: RiskStudent[] = [];

    map.forEach(({ base: s, classNames, classIdsByName }) => {
      // P1-F: dual-key match (studentId + studentEmail). Legacy bulk imports
      // that wrote only studentEmail were silently invisible to risk calcs.
      const email = (s.email || s.studentEmail || "").toLowerCase();
      const sid   = s.id;

      // ── Attendance (windowed + late-counts-as-present + dual-key) ──
      const attRecs = attRef.current.filter(r => {
        if (!matchesStudent(r, sid, email)) return false;
        const d = toDateStr(r.date);
        return d && d >= attCutoff;
      });
      const attPct = attRecs.length > 0
        ? Math.round((attRecs.filter(isPresent).length / attRecs.length) * 100)
        : null;
      const hasAttendanceData = attRecs.length > 0;

      // ── Academic (multi-source merge: results + test_scores + gradebook) ──
      // P1-A + P1-B: unified pctOfDoc handles all 4 score schemas, never
      // returns 0 for missing data. Cross-collection dedup by content
      // fingerprint stops migrations that mirrored the same exam from
      // counting it twice.
      const allScoreDocs = [
        ...resultsRef.current,
        ...testScoresRef.current,
        ...gradebookRef.current,
      ].filter(r => matchesStudent(r, sid, email));
      const fpSeen = new Set<string>();
      const validPcts: number[] = [];
      allScoreDocs.forEach(d => {
        const pct = pctOfDoc(d);
        if (pct === null) return;
        const subj = String(d.subject ?? d.subjectName ?? "").toLowerCase();
        const dateK = toDateStr(d.timestamp ?? d.createdAt ?? d.date);
        const fp = `${subj}|${dateK}|${Math.round(pct * 10)}`;
        if (fpSeen.has(fp)) return;
        fpSeen.add(fp);
        validPcts.push(pct);
      });
      const avgScore = validPcts.length > 0
        ? Math.round(validPcts.reduce((a, b) => a + b, 0) / validPcts.length)
        : null;
      const hasScoreData = validPcts.length > 0;

      // ── Incidents (case-insensitive severity per P1-E) ──
      const incRecs = incidentsRef.current.filter(r => matchesStudent(r, sid, email));
      const sevOf = (s: any) => String(s ?? "").toLowerCase();
      const criticalInc = incRecs.filter(i => sevOf(i.severity) === "critical" || sevOf(i.severity) === "high").length;

      // ── Parent engagement score (0-100) ──
      const notes = parentNotesRef.current.filter(r => matchesStudent(r, sid, email));
      const parentEngagement = Math.min(100, notes.length * 20);

      // ── 3rd Factor: Task / Assignment completion ──
      const studentClassIds = enrollmentsRef.current
        .filter(e => matchesStudent(e, sid, email))
        .map(e => e.classId).filter(Boolean);

      const studentAssignments = assignmentsRef.current.filter(a =>
        studentClassIds.includes(a.classId)
      );
      const studentSubmissions = submissionsRef.current.filter(s2 => matchesStudent(s2, sid, email));
      const submittedIds = new Set(studentSubmissions.map(s2 => s2.homeworkId || s2.assignmentId));
      const now = new Date();
      const overdueAssignments = studentAssignments.filter(a => {
        const due = a.dueDate ? new Date(a.dueDate) : null;
        return due && due < now && !submittedIds.has(a.id);
      });
      const taskCompletionPct = studentAssignments.length > 0
        ? Math.round(((studentAssignments.length - overdueAssignments.length) / studentAssignments.length) * 100)
        : null;

      // ── Delta-based attendance drop (last 7 vs prev 7) ──
      // P1-C: BOTH sides use isPresent so "all late" doesn't fake a 100% drop.
      const recent7  = attRecs.filter(r => { const d = toDateStr(r.date); return d && d >= sevenDaysAgo; });
      const prev7    = attRecs.filter(r => { const d = toDateStr(r.date); return d && d >= fourteenDaysAgo && d < sevenDaysAgo; });
      const recent7Pct = recent7.length > 0 ? Math.round((recent7.filter(isPresent).length / recent7.length) * 100) : null;
      const prev7Pct   = prev7.length   > 0 ? Math.round((prev7.filter(isPresent).length   / prev7.length)   * 100) : null;
      const attDrop = (recent7Pct !== null && prev7Pct !== null) ? prev7Pct - recent7Pct : null;

      // ── Determine risk level (thresholds imported from classifyStudent.ts) ──
      // CRITICAL_SCORE (40) and CRITICAL_ATT (60) are local — the imported
      // WEAK_* are warning thresholds. Two-tier system, single source of truth.
      const CRITICAL_SCORE_THRESHOLD = 40;
      const CRITICAL_ATT_THRESHOLD   = 60;
      const factors: string[] = [];
      let riskLevel: RiskLevel | null = null;

      if (attPct !== null && attPct < CRITICAL_ATT_THRESHOLD) {
        factors.push(`Attendance <${CRITICAL_ATT_THRESHOLD}%`);
        riskLevel = "CRITICAL";
      } else if (attPct !== null && attPct < WEAK_ATTENDANCE_THRESHOLD) {
        factors.push(`Attendance <${WEAK_ATTENDANCE_THRESHOLD}%`);
        if (!riskLevel) riskLevel = "WARNING";
      }

      if (attDrop !== null && attDrop >= 20) {
        factors.push(`Sudden drop (${attDrop}% this week)`);
        if (!riskLevel) riskLevel = "WARNING";
      }

      if (avgScore !== null && avgScore < CRITICAL_SCORE_THRESHOLD) {
        factors.push(`Academics <${CRITICAL_SCORE_THRESHOLD}%`);
        riskLevel = "CRITICAL";
      } else if (avgScore !== null && avgScore < WEAK_SCORE_THRESHOLD + 5) {
        // Slightly above WEAK threshold (50+5=55) still WARN-worthy
        factors.push(`Academics <${WEAK_SCORE_THRESHOLD + 5}%`);
        if (!riskLevel) riskLevel = "WARNING";
      }

      if (taskCompletionPct !== null && overdueAssignments.length >= 3) {
        factors.push(`${overdueAssignments.length} tasks overdue`);
        if (!riskLevel) riskLevel = "WARNING";
        if (overdueAssignments.length >= 5 && (attPct !== null && attPct < WEAK_ATTENDANCE_THRESHOLD)) riskLevel = "CRITICAL";
      } else if (taskCompletionPct !== null && overdueAssignments.length >= 1 && taskCompletionPct < 50) {
        factors.push(`Tasks ${taskCompletionPct}% done`);
        if (!riskLevel) riskLevel = "MONITORING";
      }

      if (criticalInc >= 2) { factors.push("Discipline"); riskLevel = "CRITICAL"; }
      else if (incRecs.length >= 1) { factors.push("Discipline"); if (!riskLevel) riskLevel = "WARNING"; }

      if (!riskLevel && (hasAttendanceData || hasScoreData)) {
        if (attPct !== null && attPct < SMART_ATTENDANCE_THRESHOLD) {
          factors.push("Attendance trend");
          riskLevel = "MONITORING";
        } else if (attDrop !== null && attDrop >= 10) {
          factors.push("Attendance declining");
          riskLevel = "MONITORING";
        }
      }

      if (!riskLevel || factors.length === 0) return; // Not at risk

      // ── Days flagged ── P1-H: bound to the windowed range so we never
      // claim "300 days flagged" from one absence 10 months ago. The earliest
      // NEGATIVE signal across all data sources WITHIN the window is the
      // meaningful date — using only attendance previously made students
      // with academic-only risk default to "today", inflating the
      // "new this week" stat card forever.
      const negativeSignalDates: string[] = [];
      attRecs
        .filter(r => String(r.status || "").toLowerCase() === "absent")
        .forEach(r => { const d = toDateStr(r.date); if (d) negativeSignalDates.push(d); });
      // Score signals: only failing scores within the window count.
      allScoreDocs.forEach(d => {
        const pct = pctOfDoc(d);
        if (pct === null || pct >= WEAK_SCORE_THRESHOLD) return;
        const ds = toDateStr(d.timestamp ?? d.createdAt ?? d.date);
        if (ds && ds >= attCutoff) negativeSignalDates.push(ds);
      });
      // Incident dates within window.
      incRecs.forEach(i => {
        const ds = toDateStr(i.date ?? i.timestamp ?? i.createdAt);
        if (ds && ds >= attCutoff) negativeSignalDates.push(ds);
      });
      // Overdue assignments — count their due date as the flag onset.
      overdueAssignments.forEach(a => {
        const ds = toDateStr(a.dueDate);
        if (ds && ds >= attCutoff) negativeSignalDates.push(ds);
      });
      const flaggedSince = negativeSignalDates.length > 0
        ? negativeSignalDates.sort()[0]
        : today;
      const daysFlagged  = Math.min(
        ATTENDANCE_WINDOW_DAYS,
        daysBetween(flaggedSince, today),
      );

      // ── Last action from interventions ──
      const studentInterventions = interventionsRef.current
        .filter(i => matchesStudent(i, sid, email))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const lastAction = studentInterventions[0]?.actionTitle || "—";

      // ── Assigned counselor from flags ──
      const counselorFlag = flagsRef.current.find(f =>
        matchesStudent(f, sid, email) && f.type === "counselor_assigned" && f.status === "active"
      );
      const assignedTo = counselorFlag?.counselorName || s.teacherName || "—";

      // Multi-class display: join sorted class names with ", "
      const allClasses = Array.from(classNames).filter(Boolean).sort();
      const classDisplay = allClasses.length > 0 ? allClasses.join(", ") : (s.className || "");

      results.push({
        id: sid,
        name: s.name || s.studentName || "Unknown",
        email,
        className: classDisplay,
        allClasses,
        classIdsByName: Object.fromEntries(classIdsByName),
        classId: s.classId || studentClassIds[0] || "",
        teacherName: s.teacherName || "",
        teacherId: s.teacherId || "",
        schoolId: s.schoolId || userData?.schoolId || "",
        branchId: s.branchId || userData?.branchId || "",
        attPct,
        avgScore,
        hasScoreData,
        hasAttendanceData,
        incidentCount: incRecs.length,
        parentEngagement,
        orgIncidentTotal,
        orgParentNoteTotal,
        riskLevel,
        riskFactors: factors,
        lastAction,
        assignedTo,
        daysFlagged,
        flaggedSince,
      });
    });

    results.sort((a, b) => {
      const order = { CRITICAL: 0, WARNING: 1, MONITORING: 2 };
      if (order[a.riskLevel] !== order[b.riskLevel]) return order[a.riskLevel] - order[b.riskLevel];
      return b.daysFlagged - a.daysFlagged;
    });

    setRiskStudents(results);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────
  // P0-A + P0-B: scope by schoolId ONLY (NOT branchId). Per memory
  // `branchid_inference_lag`, the enforceBranchId_* trigger backfills
  // missing branchId with ~1-2s lag → server-side branchId filter blinds
  // the principal to fresh writes during that window AND permanently
  // hides any record where the trigger never ran. Branch isolation is
  // enforced client-side in compute() via inBranch().
  // Also: principals whose userData.branchId is null/undefined no longer
  // see a permanently empty page — they get school-wide view by default.
  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) { setLoading(false); return; }

    setLoading(true);
    const C = [where("schoolId", "==", schoolId)];
    const unsubs: (() => void)[] = [];

    // Debounce: all 12 listeners share one timer so compute() only runs once
    // after they all settle (prevents redundant re-renders on initial load).
    // Bumped from 30ms to 80ms to better coalesce on slow devices.
    const scheduleCompute = () => {
      if (computeTimerRef.current) clearTimeout(computeTimerRef.current);
      computeTimerRef.current = setTimeout(compute, 80);
    };

    // P2-E: Real error handlers — empty `() => {}` swallowed permission
    // denials silently. Now logs to console for debugging AND bumps the
    // loader off so the page doesn't spin forever on a single rule deny.
    const errLog = (label: string) => (err: Error) => {
      console.warn(`[RiskStudents] ${label} listener failed:`, err);
      // Don't unblock loader on individual failures — we want to see if
      // the OTHER listeners can still produce useful output.
    };

    unsubs.push(onSnapshot(query(collection(db, "students"),         ...C), snap => { studentsRef.current     = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("students")));
    unsubs.push(onSnapshot(query(collection(db, "enrollments"),      ...C), snap => { enrollmentsRef.current  = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("enrollments")));
    unsubs.push(onSnapshot(query(collection(db, "attendance"),       ...C), snap => { attRef.current          = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("attendance")));
    // P1-A: 3 score sources (results + test_scores + gradebook_scores)
    unsubs.push(onSnapshot(query(collection(db, "results"),          ...C), snap => { resultsRef.current      = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("results")));
    unsubs.push(onSnapshot(query(collection(db, "test_scores"),      ...C), snap => { testScoresRef.current   = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("test_scores")));
    unsubs.push(onSnapshot(query(collection(db, "gradebook_scores"), ...C), snap => { gradebookRef.current    = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("gradebook_scores")));
    unsubs.push(onSnapshot(query(collection(db, "incidents"),        ...C), snap => { incidentsRef.current    = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("incidents")));
    unsubs.push(onSnapshot(query(collection(db, "parent_notes"),     ...C), snap => { parentNotesRef.current  = snap.docs.map(d => d.data()); scheduleCompute(); }, errLog("parent_notes")));
    unsubs.push(onSnapshot(query(collection(db, "interventions"),    ...C), snap => { interventionsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("interventions")));
    unsubs.push(onSnapshot(query(collection(db, "student_flags"),    ...C), snap => { flagsRef.current        = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("student_flags")));
    unsubs.push(onSnapshot(query(collection(db, "assignments"),      ...C), snap => { assignmentsRef.current  = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("assignments")));
    unsubs.push(onSnapshot(query(collection(db, "submissions"),      ...C), snap => { submissionsRef.current  = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, errLog("submissions")));

    // Safety net: if NO listener fires within 5s (all denied / index missing),
    // unblock the spinner so the user sees the empty state rather than spinning forever.
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    return () => {
      if (computeTimerRef.current) clearTimeout(computeTimerRef.current);
      clearTimeout(safetyTimer);
      unsubs.forEach(u => u());
    };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Derived counts ───────────────────────────────────────────────────────────
  const criticalCount  = riskStudents.filter(s => s.riskLevel === "CRITICAL").length;
  const warningCount   = riskStudents.filter(s => s.riskLevel === "WARNING").length;
  const weekStart      = startOfWeekStr();
  const newThisWeek    = riskStudents.filter(s => s.flaggedSince >= weekStart).length;

  const filtered = filterTab === "All"
    ? riskStudents
    : riskStudents.filter(s => s.riskLevel === filterTab);

  // ── Class grouping + per-class pagination ──────────────────────────────────
  // A student enrolled in 2 classes (e.g., a tutor + main section) shows up
  // once per class in `allClasses`. We group by EACH normalized class so the
  // principal sees them where they expect — accepting some duplication of
  // multi-class students is the right call (memory:
  // bug_pattern_enrollment_row_dedup says: dedup for "per-student" views,
  // keep duplicates for class rosters; this section IS a class roster).
  interface ClassGroup {
    key: string;
    label: string;
    classId?: string;
    students: RiskStudent[];
    counts: { total: number; critical: number; warning: number; monitoring: number };
  }

  const classGroups: ClassGroup[] = useMemo(() => {
    const map = new Map<string, ClassGroup>();
    filtered.forEach(s => {
      const classes = (s.allClasses && s.allClasses.length > 0) ? s.allClasses : [s.className || ""];
      classes.forEach(rawCls => {
        const key = normalizeClassKey(rawCls);
        // Resolve THIS class's classId from the per-class map (B4 fix). Fall
        // back to s.classId only when the map didn't capture this className
        // (rare — only if enrollment had no classId field at all).
        const resolvedClassId = s.classIdsByName?.[String(rawCls).trim()] || s.classId || "";
        let g = map.get(key);
        if (!g) {
          g = {
            key,
            label: key,
            classId: resolvedClassId,
            students: [],
            counts: { total: 0, critical: 0, warning: 0, monitoring: 0 },
          };
          map.set(key, g);
        } else if (!g.classId && resolvedClassId) {
          // First entry had no classId; later student in same group does → adopt.
          g.classId = resolvedClassId;
        }
        g.students.push(s);
        g.counts.total += 1;
        if (s.riskLevel === "CRITICAL") g.counts.critical += 1;
        else if (s.riskLevel === "WARNING") g.counts.warning += 1;
        else if (s.riskLevel === "MONITORING") g.counts.monitoring += 1;
      });
    });
    // Sort: classes with most CRITICAL first, then by total. "Unassigned"
    // always last so it doesn't visually dominate.
    const sorted = Array.from(map.values());
    sorted.sort((a, b) => {
      if (a.key === "Unassigned" && b.key !== "Unassigned") return 1;
      if (b.key === "Unassigned" && a.key !== "Unassigned") return -1;
      if (a.counts.critical !== b.counts.critical) return b.counts.critical - a.counts.critical;
      if (a.counts.total !== b.counts.total) return b.counts.total - a.counts.total;
      return a.key.localeCompare(b.key);
    });
    return sorted;
  }, [filtered]);

  // Dropdown options — sourced from FULL riskStudents (not filtered) so the
  // user can always switch to any class regardless of which risk-tab is
  // active. Sort numerically when possible so "Class 9" lands before "Class 10".
  const allClassesAvailable = useMemo(() => {
    const set = new Set<string>();
    riskStudents.forEach(s => {
      const classes = (s.allClasses && s.allClasses.length > 0) ? s.allClasses : [s.className || ""];
      classes.forEach(rawCls => {
        const k = normalizeClassKey(rawCls);
        if (k) set.add(k);
      });
    });
    const arr = Array.from(set);
    arr.sort((a, b) => {
      if (a === "Unassigned" && b !== "Unassigned") return 1;
      if (b === "Unassigned" && a !== "Unassigned") return -1;
      // Try numeric prefix sort: "Class 9" → 9, "10A" → 10
      const num = (s: string) => {
        const m = s.match(/\d+/);
        return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
      };
      const na = num(a), nb = num(b);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
    return arr;
  }, [riskStudents]);

  // Apply classFilter to classGroups before rendering.
  const visibleClassGroups = useMemo(() => {
    if (classFilter === "All") return classGroups;
    return classGroups.filter(g => g.key === classFilter);
  }, [classGroups, classFilter]);

  // Reset stale class selection when the chosen class disappears from the
  // available list (e.g., student left the class while page is open).
  useEffect(() => {
    if (classFilter !== "All" && !allClassesAvailable.includes(classFilter)) {
      setClassFilter("All");
    }
  }, [allClassesAvailable, classFilter]);

  const toggleClass = (key: string) => {
    setCollapsedClasses(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const goPage = (key: string, page: number) => {
    setClassPages(prev => ({ ...prev, [key]: Math.max(1, page) }));
  };
  const pageOf = (key: string) => classPages[key] || 1;

  // Pre-generate the message used when "Notify Parent" deep-links to chat.
  const buildParentDraft = (s: RiskStudent): string => {
    const factors = s.riskFactors.length > 0 ? s.riskFactors.join(", ") : "recent academic and attendance trends";
    const parts: string[] = [];
    parts.push(`Hello,`);
    parts.push("");
    parts.push(`I am reaching out regarding ${s.name}, who has been flagged as ${s.riskLevel.toLowerCase()} based on ${factors}.`);
    if (s.attPct !== null) parts.push(`Recent attendance: ${s.attPct}%.`);
    if (s.avgScore !== null) parts.push(`Average academic score: ${s.avgScore}%.`);
    parts.push("");
    parts.push("Could we discuss support options for your child? Please reply at your convenience.");
    parts.push("");
    parts.push("Warm regards,");
    parts.push("Principal");
    return parts.join("\n");
  };

  const openParentChat = (s: RiskStudent) => {
    navigate("/parent-communication", {
      state: {
        studentId: s.id,
        studentEmail: s.email,
        prefillMessage: buildParentDraft(s),
      },
    });
  };

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selectedStudent) {
    return (
      <RiskIntervention
        student={selectedStudent}
        onBack={() => setSelectedStudent(null)}
      />
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     MOBILE — Bright Blue Apple UI
     ═══════════════════════════════════════════════════════════════ */
  if (isMobile) {
    const B1 = "#0055FF", B2 = "#1166FF";
    const BG = "#EEF4FF", BG2 = "#E0ECFF";
    const T1 = "#001040", T3 = "#5070B0", T4 = "#99AACC";
    const SEP = "rgba(0,85,255,0.07)";
    const GREEN = "#00C853", GREEN_D = "#007830", GREEN_S = "rgba(0,200,83,0.10)", GREEN_B = "rgba(0,200,83,0.22)";
    const RED = "#FF3355";
    const ORANGE = "#FF8800";
    const GOLD = "#FFAA00";
    const SH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 8px rgba(0,85,255,0.08), 0 10px 26px rgba(0,85,255,0.10)";
    const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.11), 0 18px 44px rgba(0,85,255,0.13)";
    const SH_BTN = "0 6px 22px rgba(0,85,255,0.40), 0 2px 5px rgba(0,85,255,0.20)";

    const monitoringCount = riskStudents.filter(s => s.riskLevel === "MONITORING").length;

    const levelTheme = (lvl: RiskLevel) => {
      if (lvl === "CRITICAL") return {
        accent: `linear-gradient(180deg, ${RED}, #FF6688)`,
        avBg:   `linear-gradient(135deg, ${RED}, #FF6688)`,
        avShadow: "0 4px 14px rgba(255,51,85,0.30)",
        badgeBg: RED, badgeColor: "#fff", badgeShadow: "0 2px 8px rgba(255,51,85,0.28)",
        dotColor: RED, dotRing: "rgba(255,51,85,0.20)",
        scoreColor: RED, scoreGrad: `linear-gradient(90deg, ${RED}, #FF88AA)`,
      };
      if (lvl === "WARNING") return {
        accent: `linear-gradient(180deg, ${GOLD}, #FFDD44)`,
        avBg:   `linear-gradient(135deg, ${GOLD}, #FFDD44)`,
        avShadow: "0 4px 14px rgba(255,170,0,0.30)",
        badgeBg: GOLD, badgeColor: "#884400", badgeShadow: "0 2px 8px rgba(255,170,0,0.26)",
        dotColor: GOLD, dotRing: "rgba(255,170,0,0.20)",
        scoreColor: "#884400", scoreGrad: `linear-gradient(90deg, ${GOLD}, #FFDD44)`,
      };
      return {
        accent: `linear-gradient(180deg, ${B1}, ${B2})`,
        avBg:   `linear-gradient(135deg, ${B1}, ${B2})`,
        avShadow: "0 4px 14px rgba(0,85,255,0.28)",
        badgeBg: B1, badgeColor: "#fff", badgeShadow: "0 2px 8px rgba(0,85,255,0.28)",
        dotColor: B1, dotRing: "rgba(0,85,255,0.20)",
        scoreColor: B1, scoreGrad: `linear-gradient(90deg, ${B1}, #4499FF)`,
      };
    };

    const getInitials = (name: string) =>
      (name || "S").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

    // Top student for contextual AI/timeline/recommended sections
    const topStudent = filtered.find(s => s.riskLevel === "CRITICAL") || filtered[0];

    return (
      <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>

        {/* Page Head */}
        <div className="px-5 pt-4">
          <div className="text-[26px] font-bold mb-1" style={{ color: T1, letterSpacing: "-0.7px" }}>Risk Students</div>
          <div className="text-[12px] font-normal" style={{ color: T3 }}>Monitor and intervene with at-risk students</div>
        </div>

        {/* Risk Hero Banner (red gradient) */}
        <div className="mx-5 mt-[14px] rounded-[24px] px-5 py-[18px] relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #660011 0%, #990022 35%, #CC0033 70%, #FF3355 100%)",
            boxShadow: "0 8px 28px rgba(204,0,51,0.32), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-10 -right-7 w-[170px] h-[170px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.016) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.016) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }} />

          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-[10px]">
              <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)" }}>
                <AlertTriangle className="w-[18px] h-[18px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.55)" }}>Total At-Risk</div>
                <div className="text-[30px] font-bold leading-none text-white" style={{ letterSpacing: "-1px" }}>{loading ? "—" : riskStudents.length}</div>
              </div>
            </div>
            <div className="flex items-center gap-[5px] px-[13px] py-[6px] rounded-full text-[11px] font-bold text-white"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.28)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)" }}>
              <Sparkles className="w-[11px] h-[11px] text-white" strokeWidth={2.5} />
              Needs Action
            </div>
          </div>
          <div className="flex items-center gap-1 mt-1 text-[11px] font-bold relative z-10" style={{ color: "rgba(255,255,255,0.65)" }}>
            <span className="mr-[2px]">{newThisWeek >= 0 ? `${newThisWeek} new` : "0"} this week</span>
            <span>· Monitoring Active</span>
          </div>
        </div>

        {/* Stat Grid 2x2 — each filters */}
        <div className="grid grid-cols-2 gap-[10px] px-5 pt-[14px]">
          {[
            { key: "CRITICAL",   label: "Critical",        val: criticalCount,                                sub: "Immediate action", subColor: RED,     iconColor: RED,    iconBg: "rgba(255,51,85,0.12)",  iconBorder: "rgba(255,51,85,0.22)", Icon: Flame,      valColor: RED },
            { key: "WARNING",    label: "Warning",         val: warningCount,                                 sub: "Monitor closely",  subColor: "#884400", iconColor: GOLD,   iconBg: "rgba(255,170,0,0.12)", iconBorder: "rgba(255,170,0,0.22)", Icon: Bell,       valColor: GOLD },
            { key: "All",        label: "New This Week",   val: newThisWeek,                                  sub: "Since Monday",     subColor: T3,      iconColor: B1,     iconBg: "rgba(0,85,255,0.10)",  iconBorder: "rgba(0,85,255,0.18)",  Icon: UserPlus,   valColor: B1 },
            { key: "MONITORING", label: "Monitoring",      val: monitoringCount,                              sub: "Under watch",      subColor: GREEN_D, iconColor: GREEN,  iconBg: "rgba(0,200,83,0.10)",  iconBorder: "rgba(0,200,83,0.20)",  Icon: ShieldAlert, valColor: GREEN_D },
          ].map(({ key, label, val, sub, subColor, iconColor, iconBg, iconBorder, Icon, valColor }) => (
            <button
              key={label}
              onClick={() => setFilterTab(key as FilterTab)}
              className="bg-white rounded-[20px] px-4 py-[15px] relative overflow-hidden cursor-pointer active:scale-[0.96] transition-transform text-left"
              style={{ boxShadow: SH_LG, border: `0.5px solid ${filterTab === key ? iconColor + "66" : "rgba(0,85,255,0.10)"}`, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center absolute top-[14px] right-[14px]"
                style={{ background: iconBg, border: `0.5px solid ${iconBorder}` }}>
                <Icon className="w-[14px] h-[14px]" style={{ color: iconColor }} strokeWidth={2.4} />
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-2" style={{ color: T4 }}>{label}</div>
              <div className="text-[28px] font-bold leading-none mb-1" style={{ color: valColor, letterSpacing: "-1px" }}>{loading ? "—" : val}</div>
              <div className="text-[11px] font-medium truncate" style={{ color: subColor }}>{sub}</div>
            </button>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-[7px] px-5 pt-[14px] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {([
            { key: "All" as FilterTab,         label: "All",        count: riskStudents.length },
            { key: "CRITICAL" as FilterTab,    label: "Critical",   count: criticalCount },
            { key: "WARNING" as FilterTab,     label: "Warning",    count: warningCount },
            { key: "MONITORING" as FilterTab,  label: "Monitoring", count: monitoringCount },
          ]).map(({ key, label, count }) => {
            const active = filterTab === key;
            return (
              <button key={key} onClick={() => setFilterTab(key)}
                className="px-4 py-[9px] rounded-[13px] text-[12px] font-bold whitespace-nowrap flex-shrink-0 active:scale-[0.94] transition-transform"
                style={{
                  background: active ? `linear-gradient(135deg, ${B1}, ${B2})` : "#FFFFFF",
                  color: active ? "#fff" : T3,
                  border: active ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,0.12)",
                  boxShadow: active ? SH_BTN : SH,
                  transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                {label} ({count})
              </button>
            );
          })}
        </div>

        {/* Class filter dropdown — mobile */}
        <div className="px-5 pt-3">
          <div className="relative">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full rounded-[14px] font-bold cursor-pointer block"
              style={{
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                // Explicit dimensions + line-height matching height = perfect
                // vertical centering. Tailwind's h-11 alone left iOS Safari
                // and Edge clipping descenders because the default line-height
                // of <select> on those engines is shorter than the box.
                height: 44,
                lineHeight: "44px",
                fontSize: 14,
                paddingTop: 0,
                paddingBottom: 0,
                paddingLeft: 16,
                paddingRight: 38,
                textIndent: 0,
                verticalAlign: "middle",
                background: classFilter !== "All"
                  ? `linear-gradient(135deg, ${B1}, ${B2})`
                  : "#FFFFFF",
                color: classFilter !== "All" ? "#fff" : T1,
                border: `0.5px solid ${classFilter !== "All" ? "transparent" : "rgba(0,85,255,0.12)"}`,
                boxShadow: classFilter !== "All" ? SH_BTN : SH,
              }}
            >
              <option value="All" style={{ color: "#000", background: "#fff" }}>All Classes</option>
              {allClassesAvailable.map(c => (
                <option key={c} value={c} style={{ color: "#000", background: "#fff" }}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-[15px] h-[15px] absolute pointer-events-none"
              style={{
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: classFilter !== "All" ? "#fff" : T3,
              }}
              strokeWidth={2.4}
            />
          </div>
        </div>

        {/* Section label */}
        <div className="px-5 pt-4 text-[9px] font-bold uppercase tracking-[0.10em] flex items-center gap-2" style={{ color: T4 }}>
          <span>Student Risk Profiles</span>
          <span className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
        </div>

        {/* Loading / Empty / Risk cards */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <Loader2 className="w-10 h-10 animate-spin" style={{ color: B1 }} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T4 }}>Analyzing Student Risk Data…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-5 mt-3 bg-white rounded-[24px] py-10 flex flex-col items-center gap-[10px]"
            style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center"
              style={{ background: GREEN_S, border: `0.5px solid ${GREEN_B}`, boxShadow: "0 0 0 8px rgba(0,200,83,0.05)" }}>
              <ShieldAlert className="w-7 h-7" style={{ color: GREEN }} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>
              {filterTab === "All" ? "No at-risk students detected" : `No ${filterTab.toLowerCase()} students`}
            </div>
            <div className="text-[11px] text-center max-w-[220px] font-normal leading-[1.55]" style={{ color: T4 }}>
              {filterTab === "All" ? "Risk factors appear when attendance or results data is recorded." : "Try switching to All to see the full list."}
            </div>
          </div>
        ) : visibleClassGroups.length === 0 ? (
          <div className="mx-5 mt-3 bg-white rounded-[24px] py-10 flex flex-col items-center gap-[10px]"
            style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center"
              style={{ background: GREEN_S, border: `0.5px solid ${GREEN_B}` }}>
              <ShieldAlert className="w-7 h-7" style={{ color: GREEN }} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>
              No students match
            </div>
            <div className="text-[11px] text-center max-w-[220px] font-normal leading-[1.55]" style={{ color: T4 }}>
              Try clearing the class filter or switching to All.
            </div>
          </div>
        ) : (
          visibleClassGroups.map(g => {
            const collapsed = collapsedClasses.has(g.key);
            const totalPages = Math.max(1, Math.ceil(g.students.length / STUDENTS_PER_CLASS_PAGE));
            const currentPage = Math.min(pageOf(g.key), totalPages);
            const startIdx = (currentPage - 1) * STUDENTS_PER_CLASS_PAGE;
            const pagedStudents = g.students.slice(startIdx, startIdx + STUDENTS_PER_CLASS_PAGE);

            return (
              <div key={g.key} className="mx-5 mt-3">
                {/* Class header */}
                <div className="bg-white rounded-[16px] px-3 py-3 flex items-center gap-2"
                  style={{ boxShadow: SH, border: "0.5px solid rgba(0,85,255,0.10)" }}>
                  <button
                    onClick={() => toggleClass(g.key)}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left active:opacity-70"
                  >
                    <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                      style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.22)" }}>
                      {collapsed
                        ? <ChevronRight className="w-[13px] h-[13px]" style={{ color: B1 }} strokeWidth={2.5} />
                        : <ChevronDown  className="w-[13px] h-[13px]" style={{ color: B1 }} strokeWidth={2.5} />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold truncate" style={{ color: T1 }}>Class {g.label}</div>
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] font-bold flex-wrap">
                        <span className="px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,85,255,0.10)", color: B1 }}>
                          {g.counts.total}
                        </span>
                        {g.counts.critical > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,51,85,0.10)", color: RED }}>
                            {g.counts.critical} crit
                          </span>
                        )}
                        {g.counts.warning > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,170,0,0.10)", color: GOLD }}>
                            {g.counts.warning} warn
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>

                {/* Class-level bulk action buttons */}
                {!collapsed && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setNotifyTeachersFor({ className: g.label, classId: g.classId, students: g.students })}
                      className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[11px] font-bold text-white active:scale-[0.95] transition-transform"
                      style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}
                    >
                      <GraduationCap className="w-[12px] h-[12px]" strokeWidth={2.4} />
                      Notify Teachers
                    </button>
                    <button
                      onClick={() => setNotifyParentsFor({ className: g.label, students: g.students })}
                      className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[11px] font-bold text-white active:scale-[0.95] transition-transform"
                      style={{ background: `linear-gradient(135deg, ${RED}, #FF6688)`, boxShadow: "0 4px 14px rgba(255,51,85,0.26)" }}
                    >
                      <Send className="w-[12px] h-[12px]" strokeWidth={2.4} />
                      Notify Parents
                    </button>
                  </div>
                )}

                {/* Student cards within class */}
                {!collapsed && pagedStudents.map(s => {
                  const theme = levelTheme(s.riskLevel);
                  const initials = getInitials(s.name);
                  return (
              <div key={`${g.key}::${s.id}`} className="mt-3 bg-white rounded-[24px] overflow-hidden relative"
                style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
                {/* Accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[2px]" style={{ background: theme.accent }} />

                {/* Top row — tap opens detail view */}
                <button
                  onClick={() => setSelectedStudent(s)}
                  className="w-full flex items-start gap-[13px] pl-[22px] pr-[18px] pt-[18px] pb-[14px] text-left active:bg-[#F5F9FF] transition-colors"
                  style={{ borderBottom: `0.5px solid ${SEP}` }}>
                  <div className="w-12 h-12 rounded-[15px] flex items-center justify-center text-[17px] font-bold text-white shrink-0"
                    style={{ background: theme.avBg, boxShadow: theme.avShadow }}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <div className="text-[16px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.3px" }}>{s.name}</div>
                      <div className="px-[11px] py-[5px] rounded-full text-[10px] font-bold uppercase tracking-[0.08em]"
                        style={{ background: theme.badgeBg, color: theme.badgeColor, boxShadow: theme.badgeShadow }}>
                        {s.riskLevel}
                      </div>
                    </div>
                    <div className="flex items-center gap-[5px] text-[11px] font-medium" style={{ color: T3 }}>
                      <Users className="w-[11px] h-[11px]" strokeWidth={2.5} />
                      {s.className || "—"}
                      {s.attPct !== null && ` · Att: ${s.attPct}%`}
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full shrink-0 mt-1"
                    style={{ background: theme.dotColor, boxShadow: `0 0 0 2.5px ${theme.dotRing}` }} />
                </button>

                {/* Meta grid 2x2 */}
                <div className="grid grid-cols-2">
                  <div className="px-[14px] py-[13px] flex flex-col gap-1"
                    style={{ borderRight: `0.5px solid ${SEP}`, borderBottom: `0.5px solid ${SEP}` }}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Risk Level</div>
                    <div className="flex items-center gap-[5px] text-[13px] font-bold" style={{ color: T1, letterSpacing: "-0.1px" }}>
                      <span className="w-[7px] h-[7px] rounded-full animate-pulse" style={{ background: theme.dotColor, boxShadow: `0 0 0 2.5px ${theme.dotRing}` }} />
                      {s.riskLevel === "CRITICAL" ? "Critical" : s.riskLevel === "WARNING" ? "Warning" : "Monitoring"}
                    </div>
                  </div>
                  <div className="px-[14px] py-[13px] flex flex-col gap-1" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Days Flagged</div>
                    <div className="flex items-center gap-[4px] text-[14px] font-bold" style={{ color: ORANGE }}>
                      <Loader2 className="w-3 h-3" style={{ display: "none" }} />
                      <CalendarPlus className="w-[12px] h-[12px]" strokeWidth={2.4} />
                      {s.daysFlagged > 0 ? `${s.daysFlagged} day${s.daysFlagged === 1 ? "" : "s"}` : "Today"}
                    </div>
                  </div>
                  <div className="px-[14px] py-[13px] flex flex-col gap-1" style={{ borderRight: `0.5px solid ${SEP}` }}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Risk Factors</div>
                    <div className="flex flex-wrap gap-1">
                      {s.riskFactors.slice(0, 2).map((f, i) => (
                        <span key={i} className="inline-flex items-center px-[9px] py-[3px] rounded-full text-[10px] font-bold"
                          style={{ background: "rgba(255,51,85,0.09)", color: RED, border: "0.5px solid rgba(255,51,85,0.20)" }}>
                          {f}
                        </span>
                      ))}
                      {s.riskFactors.length > 2 && (
                        <span className="text-[10px] font-bold" style={{ color: T3 }}>+{s.riskFactors.length - 2}</span>
                      )}
                    </div>
                  </div>
                  <div className="px-[14px] py-[13px] flex flex-col gap-1">
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Assigned To</div>
                    <div className="flex items-center gap-[5px] text-[13px] font-bold" style={{ color: T1, letterSpacing: "-0.1px" }}>
                      {s.assignedTo && s.assignedTo !== "—" ? (
                        <>
                          <span className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})` }}>
                            {getInitials(s.assignedTo)}
                          </span>
                          <span className="truncate">{s.assignedTo}</span>
                        </>
                      ) : (
                        <span style={{ color: T4 }}>Unassigned</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score strip — CF-4 fix: null avgScore renders GRAY (no
                    data), not GREEN. Previously a student with no score
                    docs was visually marked as "doing well" — actively
                    misleading the principal. */}
                <div className="flex">
                  <div className="flex-1 px-[14px] py-3" style={{ borderRight: `0.5px solid ${SEP}` }}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em] mb-1" style={{ color: T4 }}>AVG Score</div>
                    <div className="text-[22px] font-bold leading-none mb-1" style={{
                      color: s.avgScore == null ? T4
                        : s.avgScore < 40 ? RED
                        : s.avgScore < 55 ? ORANGE
                        : GREEN_D,
                      letterSpacing: "-0.5px",
                    }}>
                      {s.avgScore != null ? `${s.avgScore}%` : "—"}
                    </div>
                    <div className="h-1 rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                      <div className="h-full rounded-[2px]" style={{
                        width: s.avgScore == null ? "100%" : `${Math.min(100, Math.max(0, s.avgScore))}%`,
                        background: s.avgScore == null
                          // gray striped pattern for "no data" — visually distinct from a low real value
                          ? "repeating-linear-gradient(45deg, rgba(0,85,255,0.04) 0 4px, rgba(0,85,255,0.10) 4px 8px)"
                          : s.avgScore < 40 ? `linear-gradient(90deg, ${RED}, #FF88AA)`
                          : s.avgScore < 55 ? `linear-gradient(90deg, ${ORANGE}, #FFDD44)`
                          : `linear-gradient(90deg, ${GREEN}, #66EE88)`,
                      }} />
                    </div>
                  </div>
                  <div className="flex-1 px-[14px] py-3" style={{ borderRight: `0.5px solid ${SEP}` }}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em] mb-1" style={{ color: T4 }}>Attendance</div>
                    <div className="text-[22px] font-bold leading-none mb-1" style={{
                      color: s.attPct == null ? T4
                        : s.attPct >= 85 ? GREEN_D
                        : s.attPct >= 70 ? ORANGE
                        : RED,
                      letterSpacing: "-0.5px",
                    }}>
                      {s.attPct != null ? `${s.attPct}%` : "—"}
                    </div>
                    <div className="h-1 rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                      <div className="h-full rounded-[2px]" style={{
                        width: s.attPct == null ? "100%" : `${Math.min(100, Math.max(0, s.attPct))}%`,
                        background: s.attPct == null
                          ? "repeating-linear-gradient(45deg, rgba(0,85,255,0.04) 0 4px, rgba(0,85,255,0.10) 4px 8px)"
                          : s.attPct >= 85 ? `linear-gradient(90deg, ${GREEN}, #66EE88)`
                          : s.attPct >= 70 ? `linear-gradient(90deg, ${ORANGE}, #FFDD44)`
                          : `linear-gradient(90deg, ${RED}, #FF88AA)`,
                      }} />
                    </div>
                  </div>
                  <div className="flex-1 px-[14px] py-3">
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em] mb-1" style={{ color: T4 }}>Last Action</div>
                    <div className="text-[13px] font-bold leading-tight mb-1 truncate" style={{ color: s.lastAction && s.lastAction !== "—" ? T1 : T3, letterSpacing: "-0.1px" }}>
                      {s.lastAction && s.lastAction !== "—" ? s.lastAction : "None yet"}
                    </div>
                    <div className="h-1 rounded-[2px]" style={{ background: BG2 }} />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 px-4 py-[13px]" style={{ background: "rgba(238,244,255,0.50)" }}>
                  <button onClick={() => setMeetingStudent(s)}
                    className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[7px] text-[12px] font-bold text-white active:scale-[0.95] transition-transform relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                    <CalendarPlus className="w-[13px] h-[13px] relative z-10" strokeWidth={2.3} />
                    <span className="relative z-10">Meet</span>
                  </button>
                  <button onClick={() => setSelectedStudent(s)}
                    className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[7px] text-[12px] font-bold text-white active:scale-[0.95] transition-transform"
                    style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2447A8 100%)", boxShadow: "0 4px 14px rgba(30,58,138,0.32)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                    <ArrowRight className="w-[13px] h-[13px]" strokeWidth={2.3} />
                    View Action
                  </button>
                  <button onClick={() => openParentChat(s)}
                    className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[7px] text-[12px] font-bold active:scale-[0.95] transition-transform bg-white"
                    style={{ border: "0.5px solid rgba(0,85,255,0.16)", color: "#002080", boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                    <MessageSquare className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
                    Notify
                  </button>
                </div>
              </div>
                  );
                })}

                {/* Class-scoped pagination — only when needed */}
                {!collapsed && totalPages > 1 && (
                  <div className="mt-3 bg-white rounded-[16px] px-3 py-2.5 flex items-center justify-between gap-2"
                    style={{ boxShadow: SH, border: "0.5px solid rgba(0,85,255,0.10)" }}>
                    <div className="text-[10px] font-medium" style={{ color: T3 }}>
                      {startIdx + 1}-{Math.min(startIdx + STUDENTS_PER_CLASS_PAGE, g.students.length)} / {g.students.length}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => goPage(g.key, currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="h-7 px-2 rounded-[9px] flex items-center text-[10px] font-bold disabled:opacity-40"
                        style={{ background: "#fff", color: T1, border: "0.5px solid rgba(0,85,255,0.10)" }}
                      >
                        <ChevronLeft className="w-[11px] h-[11px]" strokeWidth={2.5} />
                      </button>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(0,85,255,0.10)", color: B1 }}>
                        {currentPage}/{totalPages}
                      </span>
                      <button
                        onClick={() => goPage(g.key, currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        className="h-7 px-2 rounded-[9px] flex items-center text-[10px] font-bold disabled:opacity-40"
                        style={{ background: "#fff", color: T1, border: "0.5px solid rgba(0,85,255,0.10)" }}
                      >
                        <ChevronRight className="w-[11px] h-[11px]" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* AI Risk Intelligence — contextual on top student */}
        {!loading && topStudent && (
          <div className="mx-5 mt-3 rounded-[24px] px-[22px] py-5 relative overflow-hidden"
            style={{
              background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
              boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
            }}>
            <div className="absolute -top-[38px] -right-[26px] w-[160px] h-[160px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }} />
            <div className="flex items-center gap-[6px] mb-3 relative z-10">
              <div className="w-7 h-7 rounded-[9px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <Sparkles className="w-[14px] h-[14px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Risk Intelligence</span>
            </div>
            <p className="text-[13px] leading-[1.72] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
              <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudent.name}</strong> has been flagged as <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudent.riskLevel.toLowerCase()}</strong> for <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudent.daysFlagged} day{topStudent.daysFlagged === 1 ? "" : "s"}</strong>.
              {topStudent.avgScore != null && topStudent.avgScore < 40 && <> Average score of <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudent.avgScore}%</strong> is significantly below the passing threshold.</>}
              {topStudent.attPct != null && <> Attendance {topStudent.attPct >= 85 ? "remains strong" : "needs improvement"} at {topStudent.attPct}%.</>}
              {topStudent.assignedTo && topStudent.assignedTo !== "—" && <> Intervention by <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudent.assignedTo}</strong> recommended.</>}
            </p>
            <div className="flex items-center gap-2 mt-[14px] pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
              <div className="w-[6px] h-[6px] rounded-full" style={{ background: "#4499FF" }} />
              <span className="text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.40)" }}>Auto-generated · Real-time data</span>
            </div>
          </div>
        )}

        {/* Intervention Timeline */}
        {!loading && topStudent && (
          <div className="mx-5 mt-3 bg-white rounded-[22px] px-[18px] py-[18px]"
            style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="text-[15px] font-bold mb-[14px]" style={{ color: T1, letterSpacing: "-0.2px" }}>Intervention Timeline</div>

            {[
              { color: RED,    ring: "rgba(255,51,85,0.20)",  action: `Student flagged as ${topStudent.riskLevel.charAt(0) + topStudent.riskLevel.slice(1).toLowerCase()}`, date: `${topStudent.daysFlagged || 0} days ago · Auto-detected`, connector: true },
              { color: GOLD,   ring: "rgba(255,170,0,0.20)",  action: topStudent.assignedTo && topStudent.assignedTo !== "—" ? `Assigned to ${topStudent.assignedTo}` : "Awaiting counselor assignment", date: topStudent.assignedTo && topStudent.assignedTo !== "—" ? `${topStudent.daysFlagged || 0} days ago · Admin` : "Needs admin review", connector: true },
              { color: topStudent.lastAction && topStudent.lastAction !== "—" ? B1 : "rgba(0,85,255,0.35)", ring: "rgba(0,85,255,0.12)", action: topStudent.lastAction && topStudent.lastAction !== "—" ? topStudent.lastAction : "No action taken yet", date: topStudent.lastAction && topStudent.lastAction !== "—" ? "Recorded intervention" : "Waiting for teacher intervention", connector: false, muted: !(topStudent.lastAction && topStudent.lastAction !== "—") },
            ].map((row, i) => (
              <div key={i} className="flex gap-3 mb-[14px] last:mb-0">
                <div className="flex flex-col items-center gap-0 w-4 shrink-0 mt-[2px]">
                  <div className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: row.color, boxShadow: `0 0 0 2.5px ${row.ring}` }} />
                  {row.connector && <div className="w-[1.5px] flex-1 min-h-[22px] mt-[3px]" style={{ background: `linear-gradient(180deg, ${row.color}55, rgba(0,85,255,0.10))` }} />}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold leading-tight mb-[2px]"
                    style={{ color: row.muted ? T4 : T1, letterSpacing: "-0.1px", fontWeight: row.muted ? 600 : 700 }}>
                    {row.action}
                  </div>
                  <div className="text-[10px] font-semibold" style={{ color: T4 }}>{row.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recommended Actions */}
        {!loading && topStudent && (
          <div className="mx-5 mt-3 bg-white rounded-[22px] p-[18px]"
            style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="flex items-center gap-[10px] mb-[13px]">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
                <Sparkles className="w-4 h-4" style={{ color: B1 }} strokeWidth={2.3} />
              </div>
              <div className="text-[14px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Recommended Actions</div>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label: "Schedule a parent-teacher meeting", sub: "High priority · Within 3 days", ico: CalendarPlus, grad: `linear-gradient(135deg, ${B1}, ${B2})`, onClick: () => setMeetingStudent(topStudent) },
                { label: "Assign additional practice work",   sub: "Medium priority · This week",   ico: Users,        grad: `linear-gradient(135deg, ${RED}, #FF6688)`, onClick: () => navigate("/assignments") },
                { label: "Send alert to parent",              sub: "Low priority · Optional",       ico: MessageSquare,grad: `linear-gradient(135deg, ${GREEN}, #22EE66)`, onClick: () => openParentChat(topStudent) },
              ].map(({ label, sub, ico: Icon, grad, onClick }) => (
                <button key={label} onClick={onClick}
                  className="flex items-center gap-[10px] px-[14px] py-3 rounded-[14px] active:scale-[0.98] transition-transform text-left"
                  style={{ background: BG, border: "0.5px solid rgba(0,85,255,0.12)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                  <div className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: grad }}>
                    <Icon className="w-[13px] h-[13px] text-white" strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.1px" }}>{label}</div>
                    <div className="text-[11px] font-medium mt-[2px] truncate" style={{ color: T3 }}>{sub}</div>
                  </div>
                  <ChevronRight className="w-[13px] h-[13px]" style={{ color: T4 }} strokeWidth={2.5} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="h-6" />

        {/* Meeting Scheduler — shared with desktop state */}
        <MeetingScheduler
          open={!!meetingStudent}
          onClose={() => setMeetingStudent(null)}
          context={meetingStudent ? {
            type: "student",
            name: meetingStudent.name,
            id: meetingStudent.id,
            email: meetingStudent.email,
            reason: `Risk level: ${meetingStudent.riskLevel}. Factors: ${meetingStudent.riskFactors.join(", ")}`,
          } : undefined}
        />

        {/* Class-level bulk-notify modals */}
        {notifyTeachersFor && (
          <NotifyClassTeachersModal
            className={notifyTeachersFor.className}
            classId={notifyTeachersFor.classId}
            students={notifyTeachersFor.students}
            onClose={() => setNotifyTeachersFor(null)}
          />
        )}
        {notifyParentsFor && (
          <NotifyClassParentsModal
            className={notifyParentsFor.className}
            students={notifyParentsFor.students}
            onClose={() => setNotifyParentsFor(null)}
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP — Blue Apple Design
  // ═══════════════════════════════════════════════════════════════
  const dB1 = "#0055FF", dB2 = "#1166FF", dB4 = "#4499FF";
  const dBG = "#EEF4FF", dBG2 = "#E0ECFF";
  const dT1 = "#001040", dT2 = "#002080", dT3 = "#5070B0", dT4 = "#99AACC";
  const dSEP = "rgba(0,85,255,0.08)";
  const dGREEN = "#00C853", dGREEN_D = "#007830", dGREEN_S = "rgba(0,200,83,0.10)", dGREEN_B = "rgba(0,200,83,0.22)";
  const dRED = "#FF3355", dRED_S = "rgba(255,51,85,0.10)", dRED_B = "rgba(255,51,85,0.22)";
  const dORANGE = "#FF8800";
  const dGOLD = "#FFAA00";
  const dSH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const dSH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";
  const dSH_BTN = "0 6px 22px rgba(0,85,255,0.38), 0 2px 5px rgba(0,85,255,0.18)";

  const monitoringCount = riskStudents.filter(s => s.riskLevel === "MONITORING").length;

  const levelThemeD = (lvl: RiskLevel) => {
    if (lvl === "CRITICAL") return { color: dRED,    soft: dRED_S,    border: dRED_B,    grad: `linear-gradient(135deg, ${dRED}, #FF6688)`,    shadow: "0 4px 14px rgba(255,51,85,0.26)" };
    if (lvl === "WARNING")  return { color: dGOLD,   soft: "rgba(255,170,0,0.10)", border: "rgba(255,170,0,0.22)", grad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`, shadow: "0 4px 14px rgba(255,170,0,0.24)" };
    return                      { color: dB1,    soft: "rgba(0,85,255,0.10)",  border: "rgba(0,85,255,0.20)",  grad: `linear-gradient(135deg, ${dB1}, ${dB2})`,     shadow: "0 4px 14px rgba(0,85,255,0.26)" };
  };

  const getInitialsD = (name: string) =>
    (name || "S").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const topStudentD = filtered.find(s => s.riskLevel === "CRITICAL") || filtered[0];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center gap-4 pt-2 pb-5">
        <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 6px 18px rgba(255,51,85,0.28)" }}>
          <AlertTriangle className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Risk Students</div>
          <div className="text-[12px] mt-1" style={{ color: dT3 }}>Monitor and intervene with at-risk students</div>
        </div>
      </div>

      {/* Red Hero Banner */}
      <div className="rounded-[22px] px-7 py-6 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #660011 0%, #990022 35%, #CC0033 70%, #FF3355 100%)",
          boxShadow: "0 10px 36px rgba(204,0,51,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <AlertTriangle className="w-7 h-7 text-white animate-pulse" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>Total At-Risk</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[48px] font-bold leading-none tracking-tight">{loading ? "—" : riskStudents.length}</span>
                <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>students flagged</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.28)" }}>
              <Sparkles className="w-[13px] h-[13px]" strokeWidth={2.4} />
              Needs Action
            </div>
            <div className="flex items-center gap-2 text-[12px] font-bold" style={{ color: "rgba(255,255,255,0.82)" }}>
              <UserPlus className="w-[14px] h-[14px]" strokeWidth={2.4} />
              {newThisWeek} new this week
            </div>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards (filters) — refined with stronger label/subtitle
          contrast, tier-tinted backdrops, top accent stripe, and a clearer
          active state. The previous slate-400 (#94A3B8) text on both label
          and subtitle was washed out on most monitors. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        {[
          { key: "CRITICAL" as FilterTab,   label: "Critical",      val: criticalCount,   sub: "Immediate action", Icon: Flame,       grad: `linear-gradient(135deg, ${dRED}, #FF6688)`,   valColor: dRED,     subColor: "#B81E3C", labelColor: "#7A1428", tintBg: "linear-gradient(180deg, rgba(255,51,85,0.05) 0%, rgba(255,255,255,0) 60%)", ringColor: "rgba(255,51,85,0.40)",  activeShadow: "0 10px 28px rgba(255,51,85,0.18)", shadow: "0 6px 16px rgba(255,51,85,0.22)"  },
          { key: "WARNING" as FilterTab,    label: "Warning",       val: warningCount,    sub: "Monitor closely",  Icon: Bell,        grad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`,  valColor: "#B87000", subColor: "#7A4500", labelColor: "#5A3300", tintBg: "linear-gradient(180deg, rgba(255,170,0,0.06) 0%, rgba(255,255,255,0) 60%)", ringColor: "rgba(255,170,0,0.45)",  activeShadow: "0 10px 28px rgba(255,170,0,0.18)", shadow: "0 6px 16px rgba(255,170,0,0.22)"  },
          { key: "All" as FilterTab,        label: "New This Week", val: newThisWeek,     sub: "Since Monday",     Icon: UserPlus,    grad: `linear-gradient(135deg, ${dB1}, ${dB2})`,     valColor: dB1,      subColor: dT2,       labelColor: dT1,       tintBg: "linear-gradient(180deg, rgba(0,85,255,0.05) 0%, rgba(255,255,255,0) 60%)",   ringColor: "rgba(0,85,255,0.40)",   activeShadow: "0 10px 28px rgba(0,85,255,0.18)",   shadow: "0 6px 16px rgba(0,85,255,0.22)"  },
          { key: "MONITORING" as FilterTab, label: "Monitoring",    val: monitoringCount, sub: "Under watch",      Icon: ShieldAlert, grad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, valColor: dGREEN_D, subColor: dGREEN_D,  labelColor: "#005020", tintBg: "linear-gradient(180deg, rgba(0,200,83,0.05) 0%, rgba(255,255,255,0) 60%)",   ringColor: "rgba(0,200,83,0.40)",   activeShadow: "0 10px 28px rgba(0,200,83,0.18)",   shadow: "0 6px 16px rgba(0,200,83,0.22)"  },
        ].map(({ key, label, val, sub, Icon, grad, valColor, subColor, labelColor, tintBg, ringColor, activeShadow, shadow }) => {
          const active = filterTab === key;
          return (
            <button
              key={label}
              onClick={() => setFilterTab(key)}
              className="rounded-[18px] px-5 py-[18px] relative text-left transition-all duration-200 ease-out hover:-translate-y-[2px] focus:outline-none overflow-hidden"
              style={{
                background: "#fff",
                boxShadow: active
                  ? `0 0 0 1.5px ${ringColor}, ${activeShadow}, 0 1px 2px rgba(15,23,42,0.04)`
                  : "0 0 0 0.5px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05)",
              }}
            >
              {/* Soft tier-tinted backdrop — fades to white at the bottom
                  so the big number still pops without the card feeling busy. */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: tintBg }} />
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.10em]" style={{ color: labelColor }}>
                    {label}
                  </span>
                  <div
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ background: grad, boxShadow: shadow }}
                  >
                    <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
                  </div>
                </div>
                <p
                  className="text-[34px] font-bold tracking-tight leading-none mb-2"
                  style={{ color: valColor, letterSpacing: "-1.2px", fontFeatureSettings: "'tnum' 1" }}
                >
                  {loading ? "—" : val}
                </p>
                <p className="text-[12px] font-semibold" style={{ color: subColor, letterSpacing: "-0.05px" }}>{sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter tabs + Class dropdown */}
      <div className="flex gap-2 flex-wrap mt-5 items-center">
        {(["All", "CRITICAL", "WARNING", "MONITORING"] as FilterTab[]).map(tab => {
          const active = filterTab === tab;
          const displayCount = tab === "All" ? riskStudents.length : tab === "CRITICAL" ? criticalCount : tab === "WARNING" ? warningCount : monitoringCount;
          return (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className="h-10 px-5 rounded-[13px] text-[13px] font-bold transition-transform hover:scale-[1.02]"
              style={{
                background: active ? `linear-gradient(135deg, ${dB1}, ${dB2})` : "#FFFFFF",
                color: active ? "#fff" : dT3,
                border: active ? "0.5px solid transparent" : `0.5px solid ${dSEP}`,
                boxShadow: active ? dSH_BTN : dSH,
              }}>
              {tab === "All" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()} ({displayCount})
            </button>
          );
        })}
        {/* Class filter dropdown */}
        <div className="relative ml-auto" style={{ minWidth: 220 }}>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full rounded-[13px] font-bold cursor-pointer block custom-chrome"
            style={{
              // .custom-chrome opts out of the global `select { padding/font/line-height !important }`
              // rules in index.css. Without it, the global 12px/16px padding +
              // 14px font + 1.5 line-height squeezes "All Classes" inside a
              // 40px box and clips the text vertically.
              "--cc-padding": "0 36px 0 16px",
              "--cc-font-size": "13px",
              "--cc-font-weight": "700",
              "--cc-line-height": "40px",
              WebkitAppearance: "none",
              MozAppearance: "none",
              appearance: "none",
              height: 40,
              textIndent: 0,
              verticalAlign: "middle",
              background: classFilter !== "All"
                ? `linear-gradient(135deg, ${dB1}, ${dB2})`
                : "#FFFFFF",
              color: classFilter !== "All" ? "#fff" : dT2,
              border: `0.5px solid ${classFilter !== "All" ? "transparent" : dSEP}`,
              boxShadow: classFilter !== "All" ? dSH_BTN : dSH,
            } as any}
          >
            <option value="All" style={{ color: "#000", background: "#fff" }}>All Classes</option>
            {allClassesAvailable.map(c => (
              <option key={c} value={c} style={{ color: "#000", background: "#fff" }}>
                {c}
              </option>
            ))}
          </select>
          <ChevronDown
            className="w-4 h-4 absolute pointer-events-none"
            style={{
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: classFilter !== "All" ? "#fff" : dT3,
            }}
            strokeWidth={2.4}
          />
        </div>
      </div>

      {/* Section Label */}
      <div className="flex items-center gap-3 mt-6 mb-3">
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
          style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.22)" }}>
          <Users className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.4} />
        </div>
        <div className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Student Risk Profiles</div>
        <span className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{ background: "rgba(0,85,255,0.10)", color: dB1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
          {filtered.length}
        </span>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="bg-white rounded-[20px] py-16 flex flex-col items-center gap-3" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: dB1 }} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: dT4 }}>Analyzing Student Risk Data…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[20px] py-20 flex flex-col items-center gap-3 text-center" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
            style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}`, boxShadow: "0 0 0 8px rgba(0,200,83,0.05)" }}>
            <ShieldAlert className="w-8 h-8" style={{ color: dGREEN }} strokeWidth={2.2} />
          </div>
          <p className="text-[14px] font-bold" style={{ color: dT1 }}>
            {filterTab === "All" ? "No at-risk students detected" : `No ${filterTab.toLowerCase()} students`}
          </p>
          <p className="text-[11px] max-w-[280px]" style={{ color: dT4 }}>
            {filterTab === "All" ? "Risk factors appear when attendance or results data is recorded" : "Try switching to All to see the full list"}
          </p>
        </div>
      ) : visibleClassGroups.length === 0 ? (
        <div className="bg-white rounded-[20px] py-20 flex flex-col items-center gap-3 text-center" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
            style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}` }}>
            <ShieldAlert className="w-8 h-8" style={{ color: dGREEN }} strokeWidth={2.2} />
          </div>
          <p className="text-[14px] font-bold" style={{ color: dT1 }}>No students match this class</p>
          <p className="text-[11px] max-w-[280px]" style={{ color: dT4 }}>
            Clear the class filter or switch to "All Classes" to see the full list.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {visibleClassGroups.map(g => {
            const collapsed = collapsedClasses.has(g.key);
            const totalPages = Math.max(1, Math.ceil(g.students.length / STUDENTS_PER_CLASS_PAGE));
            const currentPage = Math.min(pageOf(g.key), totalPages);
            const startIdx = (currentPage - 1) * STUDENTS_PER_CLASS_PAGE;
            const pagedStudents = g.students.slice(startIdx, startIdx + STUDENTS_PER_CLASS_PAGE);

            return (
              <div key={g.key} className="bg-white rounded-[20px] overflow-hidden"
                style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
                {/* Class header — collapsible + 2 bulk action buttons */}
                <div className="px-5 py-4 flex items-center gap-3 flex-wrap"
                  style={{ borderBottom: collapsed ? "none" : `0.5px solid ${dSEP}`, background: "linear-gradient(180deg, #F8FAFF 0%, #FFFFFF 100%)" }}>
                  <button
                    onClick={() => toggleClass(g.key)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90"
                  >
                    <div className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0"
                      style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.22)" }}>
                      {collapsed
                        ? <ChevronRight className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.5} />
                        : <ChevronDown  className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.5} />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[16px] font-bold truncate" style={{ color: dT1, letterSpacing: "-0.3px" }}>
                        Class {g.label}
                      </div>
                      {/* Stat pills — inline padding + inline-flex centering
                          to dodge the global `span { line-height: 1.5 !important }`
                          and `[class^="px-2"] { padding-left: 8px !important }`
                          overrides in index.css that were clipping descenders
                          (the "g" in "warning") and pushing text off-center. */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {(() => {
                          const pillBase = {
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "5px 11px",
                            borderRadius: 9999,
                            fontSize: 12,
                            fontWeight: 700,
                            lineHeight: 1.2,
                            letterSpacing: "0.01em",
                            whiteSpace: "nowrap" as const,
                          };
                          return (
                            <>
                              <span style={{ ...pillBase, background: "rgba(0,85,255,0.12)", color: dT2, border: "0.5px solid rgba(0,85,255,0.30)" }}>
                                {g.counts.total} at-risk
                              </span>
                              {g.counts.critical > 0 && (
                                <span style={{ ...pillBase, background: "rgba(255,51,85,0.12)", color: "#B81E3C", border: "0.5px solid rgba(255,51,85,0.34)" }}>
                                  {g.counts.critical} critical
                                </span>
                              )}
                              {g.counts.warning > 0 && (
                                <span style={{ ...pillBase, background: "rgba(255,170,0,0.14)", color: "#7A4500", border: "0.5px solid rgba(255,170,0,0.38)" }}>
                                  {g.counts.warning} warning
                                </span>
                              )}
                              {g.counts.monitoring > 0 && (
                                <span style={{ ...pillBase, background: "rgba(0,200,83,0.12)", color: dGREEN_D, border: "0.5px solid rgba(0,200,83,0.34)" }}>
                                  {g.counts.monitoring} monitoring
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setNotifyTeachersFor({ className: g.label, classId: g.classId, students: g.students })}
                      className="custom-chrome rounded-[12px] flex items-center text-[12px] font-bold text-white transition-transform hover:scale-[1.02]"
                      style={{ "--cc-padding": "0 16px", height: 38, background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: dSH_BTN, gap: 8, letterSpacing: "-0.1px" } as any}
                    >
                      <GraduationCap className="w-[15px] h-[15px]" strokeWidth={2.5} />
                      Notify Teachers
                    </button>
                    <button
                      onClick={() => setNotifyParentsFor({ className: g.label, students: g.students })}
                      className="custom-chrome rounded-[12px] flex items-center text-[12px] font-bold text-white transition-transform hover:scale-[1.02]"
                      style={{ "--cc-padding": "0 16px", height: 38, background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 4px 14px rgba(255,51,85,0.26)", gap: 8, letterSpacing: "-0.1px" } as any}
                    >
                      <Send className="w-[15px] h-[15px]" strokeWidth={2.5} />
                      Notify All Parents
                    </button>
                  </div>
                </div>

                {/* Expanded body — paginated student grid */}
                {!collapsed && (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {pagedStudents.map(s => {
                        const theme = levelThemeD(s.riskLevel);
                        return (
                          <div key={`${g.key}::${s.id}`} className="bg-white rounded-[16px] overflow-hidden relative"
                            style={{ boxShadow: dSH, border: `0.5px solid ${dSEP}` }}>
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: theme.grad }} />

                            <button onClick={() => setSelectedStudent(s)}
                              className="w-full flex items-center gap-3 pl-5 pr-4 pt-4 pb-3 text-left hover:bg-[#F8FAFF] transition-colors"
                              style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                              <div className="w-[44px] h-[44px] rounded-[14px] flex items-center justify-center text-[15px] font-bold text-white shrink-0"
                                style={{ background: theme.grad, boxShadow: theme.shadow }}>
                                {getInitialsD(s.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <div className="text-[15px] font-bold truncate" style={{ color: dT1, letterSpacing: "-0.3px" }}>{s.name}</div>
                                  <span className="px-[10px] py-[4px] rounded-full text-[10px] font-bold uppercase tracking-[0.10em] text-white"
                                    style={{ background: theme.grad, boxShadow: `0 2px 6px ${theme.color}55` }}>
                                    {s.riskLevel}
                                  </span>
                                </div>
                                {/* Subline bumped 10.5→12px and tone darkened
                                    dT3→dT2 so flagged-since / attendance /
                                    average reads cleanly at desktop sizes. */}
                                <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: dT2, letterSpacing: "-0.05px" }}>
                                  {s.daysFlagged > 0 ? `${s.daysFlagged}d flagged` : "Flagged today"}
                                  {s.attPct !== null && ` · Att ${s.attPct}%`}
                                  {s.avgScore !== null && ` · Avg ${s.avgScore}%`}
                                </div>
                              </div>
                              <div className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                                style={{ background: theme.color, boxShadow: `0 0 0 3px ${theme.color}33` }} />
                            </button>

                            {s.riskFactors.length > 0 && (
                              <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                                {s.riskFactors.slice(0, 3).map((f, i) => (
                                  <span key={i} className="inline-flex items-center px-[10px] py-[4px] rounded-full text-[11px] font-bold"
                                    style={{ background: "rgba(255,51,85,0.12)", color: "#B81E3C", border: `0.5px solid rgba(255,51,85,0.32)`, letterSpacing: "0.01em" }}>
                                    {f}
                                  </span>
                                ))}
                                {s.riskFactors.length > 3 && (
                                  <span className="inline-flex items-center px-[10px] py-[4px] rounded-full text-[11px] font-bold"
                                    style={{ background: dBG2, color: dT2, border: `0.5px solid rgba(0,85,255,0.18)` }}>
                                    +{s.riskFactors.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Per-student actions — icons bumped 12→15px
                                with darker stroke + tighter letter-spacing
                                for a more polished, readable bar. */}
                            <div className="flex gap-2 p-3">
                              <button onClick={() => setMeetingStudent(s)}
                                className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-2 text-[12px] font-bold text-white transition-transform hover:scale-[1.02]"
                                style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: dSH_BTN, letterSpacing: "-0.1px" }}>
                                <CalendarPlus className="w-[15px] h-[15px]" strokeWidth={2.5} />
                                Meet
                              </button>
                              <button onClick={() => setSelectedStudent(s)}
                                className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-2 text-[12px] font-bold text-white transition-transform hover:scale-[1.02]"
                                style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2447A8 100%)", boxShadow: "0 4px 14px rgba(30,58,138,0.32)", letterSpacing: "-0.1px" }}>
                                <ArrowRight className="w-[15px] h-[15px]" strokeWidth={2.5} />
                                Action
                              </button>
                              <button onClick={() => openParentChat(s)}
                                className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
                                style={{ border: `0.5px solid ${dSEP}`, color: dT2, boxShadow: dSH, letterSpacing: "-0.1px" }}>
                                <MessageSquare className="w-[15px] h-[15px]" style={{ color: dB1 }} strokeWidth={2.5} />
                                Notify Parent
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Class-scoped pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <div className="text-[11px] font-medium" style={{ color: dT3 }}>
                          Showing {startIdx + 1}-{Math.min(startIdx + STUDENTS_PER_CLASS_PAGE, g.students.length)} of {g.students.length}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => goPage(g.key, currentPage - 1)}
                            disabled={currentPage <= 1}
                            className="h-8 px-3 rounded-[10px] flex items-center gap-1 text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: "#fff", color: dT2, border: `0.5px solid ${dSEP}`, boxShadow: dSH }}
                          >
                            <ChevronLeft className="w-[12px] h-[12px]" strokeWidth={2.5} />
                            Prev
                          </button>
                          <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                            style={{ background: "rgba(0,85,255,0.10)", color: dB1 }}>
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            onClick={() => goPage(g.key, currentPage + 1)}
                            disabled={currentPage >= totalPages}
                            className="h-8 px-3 rounded-[10px] flex items-center gap-1 text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: "#fff", color: dT2, border: `0.5px solid ${dSEP}`, boxShadow: dSH }}
                          >
                            Next
                            <ChevronRight className="w-[12px] h-[12px]" strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI Risk Intelligence + Actions row */}
      {!loading && topStudentD && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">

          {/* AI Intelligence Card */}
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
                <Sparkles className="w-4 h-4 text-white" strokeWidth={2.4} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Risk Intelligence</span>
            </div>
            <p className="text-[14px] leading-[1.75] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.88)" }}>
              <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudentD.name}</strong> has been flagged as <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudentD.riskLevel.toLowerCase()}</strong> for <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudentD.daysFlagged} day{topStudentD.daysFlagged === 1 ? "" : "s"}</strong>.
              {topStudentD.avgScore != null && topStudentD.avgScore < 40 && <> Average score of <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudentD.avgScore}%</strong> is significantly below the passing threshold.</>}
              {topStudentD.attPct != null && <> Attendance {topStudentD.attPct >= 85 ? "remains strong" : "needs improvement"} at {topStudentD.attPct}%.</>}
              {topStudentD.assignedTo && topStudentD.assignedTo !== "—" && <> Intervention by <strong style={{ color: "#fff", fontWeight: 700 }}>{topStudentD.assignedTo}</strong> recommended.</>}
            </p>
            <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
              <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: dB4 }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated · Real-time data</span>
            </div>
          </div>

          {/* Recommended Actions */}
          <div className="bg-white rounded-[22px] p-6"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center gap-[10px] mb-4">
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.20)" }}>
                <Sparkles className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.4} />
              </div>
              <div className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Recommended Actions</div>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label: "Schedule parent-teacher meeting", sub: "High priority · Within 3 days", Icon: CalendarPlus, grad: `linear-gradient(135deg, ${dB1}, ${dB2})`, onClick: () => setMeetingStudent(topStudentD) },
                { label: "Assign additional practice work", sub: "Medium priority · This week", Icon: Users, grad: `linear-gradient(135deg, ${dRED}, #FF6688)`, onClick: () => navigate("/assignments") },
                { label: "Send alert to parent", sub: "Low priority · Optional", Icon: MessageSquare, grad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, onClick: () => openParentChat(topStudentD) },
              ].map(({ label, sub, Icon, grad, onClick }) => (
                <button key={label} onClick={onClick}
                  className="flex items-center gap-3 px-4 py-3 rounded-[14px] transition-transform hover:scale-[1.01] text-left"
                  style={{ background: dBG, border: `0.5px solid ${dSEP}` }}>
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: grad }}>
                    <Icon className="w-[14px] h-[14px] text-white" strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate" style={{ color: dT1, letterSpacing: "-0.1px" }}>{label}</div>
                    <div className="text-[11px] font-medium mt-0.5 truncate" style={{ color: dT3 }}>{sub}</div>
                  </div>
                  <ChevronRight className="w-[14px] h-[14px]" style={{ color: dT4 }} strokeWidth={2.5} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Meeting Scheduler Modal */}
      <MeetingScheduler
        open={!!meetingStudent}
        onClose={() => setMeetingStudent(null)}
        context={meetingStudent ? {
          type: "student",
          name: meetingStudent.name,
          id:   meetingStudent.id,
          email: meetingStudent.email,
          reason: `Risk level: ${meetingStudent.riskLevel}. Factors: ${meetingStudent.riskFactors.join(", ")}`
        } : undefined}
      />

      {/* Class-level bulk-notify modals */}
      {notifyTeachersFor && (
        <NotifyClassTeachersModal
          className={notifyTeachersFor.className}
          classId={notifyTeachersFor.classId}
          students={notifyTeachersFor.students}
          onClose={() => setNotifyTeachersFor(null)}
        />
      )}
      {notifyParentsFor && (
        <NotifyClassParentsModal
          className={notifyParentsFor.className}
          students={notifyParentsFor.students}
          onClose={() => setNotifyParentsFor(null)}
        />
      )}
    </div>
  );
};


export default RiskStudents;
