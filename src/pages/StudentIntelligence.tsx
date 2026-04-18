import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection, onSnapshot, query, where,
  type QueryConstraint, type DocumentData,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2, Search, Users, AlertTriangle, TrendingUp, Award,
  GraduationCap, MessageSquare, ChevronRight, Megaphone,
} from "lucide-react";
import {
  classifyStudent, CATEGORY_META,
  type ClassifiedStudent, type Category, type StudentSignals,
} from "@/lib/classifyStudent";
import NotifyTeacherModal from "@/components/NotifyTeacherModal";
import NotifyParentModal from "@/components/NotifyParentModal";
import NotifyAllTeachersModal from "@/components/NotifyAllTeachersModal";
import StudentAIInsightsModal from "@/components/StudentAIInsightsModal";
import { Sparkles } from "lucide-react";

// ── Minimal shapes for Firestore data we read ─────────────────────────────
interface StudentDoc extends DocumentData {
  id: string;
  name?: string;
  studentName?: string;
  email?: string;
  parentEmail?: string;
  parentPhone?: string;
  classId?: string;
  className?: string;
  rollNo?: string;
  roll?: string;
  branchId?: string;
  schoolId?: string;
}
interface ScoreDoc extends DocumentData {
  studentId?: string;
  percentage?: number | string;
  score?: number | string;
  mark?: number | string;
  marks?: number | string;
  maxMarks?: number | string;
  maxScore?: number | string;
  totalMarks?: number | string;
}
interface AttendanceDoc extends DocumentData {
  studentId?: string;
  status?: string;
}
interface EnrollmentDoc extends DocumentData {
  studentId?: string;
  rollNo?: string | number;
  roll?: string | number;
}
interface ClassDoc extends DocumentData {
  id: string;
  name?: string;
  className?: string;
}

/**
 * StudentIntelligence — single unified page for auto-detected student tiers.
 * Weak / Developing / Smart with class filter + per-student notify actions.
 */

const TABS: { key: Category; label: string; icon: any }[] = [
  { key: "weak",       label: "Weak",       icon: AlertTriangle },
  { key: "developing", label: "Developing", icon: TrendingUp },
  { key: "smart",      label: "Smart",      icon: Award },
];

export default function StudentIntelligence() {
  const { userData } = useAuth();
  const navigate = useNavigate();

  // Raw collections — typed for safety against Firestore schema drift
  const [students, setStudents]         = useState<StudentDoc[]>([]);
  const [scores, setScores]             = useState<ScoreDoc[]>([]);
  const [results, setResults]           = useState<ScoreDoc[]>([]);
  const [gradebook, setGradebook]       = useState<ScoreDoc[]>([]);
  const [attendance, setAttendance]     = useState<AttendanceDoc[]>([]);
  const [classes, setClasses]           = useState<ClassDoc[]>([]);
  const [enrollments, setEnrollments]   = useState<EnrollmentDoc[]>([]);

  // Per-listener loading so we only leave the spinner when ALL streams delivered
  // their first snapshot (previously only attendance controlled this flag,
  // which caused premature "loaded" flashes).
  const [loadedCount, setLoadedCount]   = useState(0);
  const TOTAL_LISTENERS                 = 7;
  const loading                         = loadedCount < TOTAL_LISTENERS;

  // UI state
  const [activeTab, setActiveTab]       = useState<Category>("weak");
  const [classFilter, setClassFilter]   = useState<string>("all");
  const [search, setSearch]             = useState("");
  const [notifyTeacher, setNotifyTeacher] = useState<ClassifiedStudent | null>(null);
  const [notifyParent, setNotifyParent]   = useState<ClassifiedStudent | null>(null);
  const [notifyAllOpen, setNotifyAllOpen] = useState(false);
  const [aiInsightStudent, setAiInsightStudent] = useState<ClassifiedStudent | null>(null);

  // ── Fetch all tenant-scoped data (real-time) ──────────────────────────────
  useEffect(() => {
    if (!userData?.schoolId) return;

    // Reset loading state whenever school/branch changes
    setLoadedCount(0);

    // Build reusable constraint sets. Principal scoped to a branch gets
    // branch-filtered data across every collection to avoid cross-branch leakage
    // on large schools. Owner (no branchId) gets the full school view.
    const schoolOnly: QueryConstraint[] = [where("schoolId", "==", userData.schoolId)];
    const schoolAndBranch: QueryConstraint[] = userData.branchId
      ? [...schoolOnly, where("branchId", "==", userData.branchId)]
      : schoolOnly;

    // Only flip loadedCount once per listener (first snapshot only).
    const seen = new Set<string>();
    const markLoaded = (key: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      setLoadedCount(n => n + 1);
    };

    const errHandler = (collName: string) => (err: Error) => {
      console.error(`[StudentIntelligence] ${collName} listener failed:`, err);
      toast.error(`Couldn't load ${collName}. Refresh to retry.`);
      markLoaded(collName); // unblock UI even on error
    };

    const unsubs = [
      onSnapshot(
        query(collection(db, "students"), ...schoolAndBranch),
        snap => {
          setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudentDoc)));
          markLoaded("students");
        },
        errHandler("students"),
      ),
      onSnapshot(
        query(collection(db, "test_scores"), ...schoolAndBranch),
        snap => {
          setScores(snap.docs.map(d => d.data() as ScoreDoc));
          markLoaded("test_scores");
        },
        errHandler("test_scores"),
      ),
      onSnapshot(
        query(collection(db, "results"), ...schoolAndBranch),
        snap => {
          setResults(snap.docs.map(d => d.data() as ScoreDoc));
          markLoaded("results");
        },
        errHandler("results"),
      ),
      // Gradebook scores — teacher-entered marks (mark/maxMarks or score/maxScore shape)
      onSnapshot(
        query(collection(db, "gradebook_scores"), ...schoolAndBranch),
        snap => {
          setGradebook(snap.docs.map(d => d.data() as ScoreDoc));
          markLoaded("gradebook_scores");
        },
        errHandler("gradebook_scores"),
      ),
      onSnapshot(
        query(collection(db, "attendance"), ...schoolAndBranch),
        snap => {
          setAttendance(snap.docs.map(d => d.data() as AttendanceDoc));
          markLoaded("attendance");
        },
        errHandler("attendance"),
      ),
      onSnapshot(
        query(collection(db, "classes"), ...schoolAndBranch),
        snap => {
          setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassDoc)));
          markLoaded("classes");
        },
        errHandler("classes"),
      ),
      // Enrollments — used as fallback for roll number when not on student doc
      onSnapshot(
        query(collection(db, "enrollments"), ...schoolAndBranch),
        snap => {
          setEnrollments(snap.docs.map(d => d.data() as EnrollmentDoc));
          markLoaded("enrollments");
        },
        errHandler("enrollments"),
      ),
    ];
    return () => unsubs.forEach(u => u());
  }, [userData?.schoolId, userData?.branchId]);

  // ── Build per-student aggregates + classify ────────────────────────────────
  const classified = useMemo<ClassifiedStudent[]>(() => {
    if (students.length === 0) return [];

    // Index scores by studentId
    const scoreMap = new Map<string, number[]>();
    const addScore = (sid: string, pct: number) => {
      if (!sid || isNaN(pct)) return;
      if (!scoreMap.has(sid)) scoreMap.set(sid, []);
      scoreMap.get(sid)!.push(Math.max(0, Math.min(100, pct)));
    };
    // Normalize score → percentage across the 3 different schemas we support.
    const pctOf = (doc: any): number | null => {
      // 1) explicit percentage
      if (doc.percentage != null && !isNaN(Number(doc.percentage))) return Number(doc.percentage);
      // 2) mark / maxMarks (gradebook_scores pattern)
      const mark = Number(doc.mark ?? doc.marks ?? NaN);
      const maxMarks = Number(doc.maxMarks ?? doc.max_marks ?? doc.totalMarks ?? NaN);
      if (!isNaN(mark) && !isNaN(maxMarks) && maxMarks > 0) return (mark / maxMarks) * 100;
      // 3) score / maxScore (alt gradebook pattern)
      const score = Number(doc.score ?? NaN);
      const maxScore = Number(doc.maxScore ?? doc.max_score ?? NaN);
      if (!isNaN(score) && !isNaN(maxScore) && maxScore > 0) return (score / maxScore) * 100;
      // 4) score as raw percentage (legacy test_scores)
      if (!isNaN(score) && score >= 0 && score <= 100) return score;
      return null;
    };
    scores.forEach(s => {
      const pct = pctOf(s);
      if (pct != null) addScore(s.studentId, pct);
    });
    results.forEach(r => {
      const pct = pctOf(r);
      if (pct != null) addScore(r.studentId, pct);
    });
    gradebook.forEach(g => {
      const pct = pctOf(g);
      if (pct != null) addScore(g.studentId, pct);
    });

    // Attendance aggregate by studentId
    const attMap = new Map<string, { total: number; present: number }>();
    attendance.forEach(a => {
      if (!a.studentId) return;
      const key = a.studentId;
      const prev = attMap.get(key) || { total: 0, present: 0 };
      prev.total++;
      if (String(a.status ?? "").toLowerCase() === "present") prev.present++;
      attMap.set(key, prev);
    });

    // Class name lookup
    const classNameMap = new Map<string, string>();
    classes.forEach(c => classNameMap.set(c.id, c.name || c.className || ""));

    // Enrollment → roll fallback: studentId → rollNo (first match wins)
    const enrollRollMap = new Map<string, string>();
    enrollments.forEach(e => {
      const sid = e.studentId as string;
      const roll = String(e.rollNo ?? e.roll ?? "").trim();
      if (sid && roll && !enrollRollMap.has(sid)) enrollRollMap.set(sid, roll);
    });

    return students.map(stu => {
      const rollNo =
        stu.rollNo ||
        stu.roll ||
        enrollRollMap.get(stu.id) ||
        "";
      const signals: StudentSignals = {
        studentId: stu.id,
        studentName: stu.name || stu.studentName || "Unnamed",
        className: classNameMap.get(stu.classId) || stu.className || "",
        classId: stu.classId,
        rollNo,
        email: stu.email,
        parentEmail: stu.parentEmail,
        parentPhone: stu.parentPhone,
        branchId: stu.branchId,
        totalAttendance: attMap.get(stu.id)?.total || 0,
        presentAttendance: attMap.get(stu.id)?.present || 0,
        scores: scoreMap.get(stu.id) || [],
      };
      return classifyStudent(signals);
    });
  }, [students, scores, results, gradebook, attendance, classes, enrollments]);

  // ── Filter + group ────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classified.filter(s => {
      if (s.category !== activeTab) return false;
      if (classFilter !== "all" && s.classId !== classFilter) return false;
      if (q) {
        const hay = `${s.studentName} ${s.rollNo || ""} ${s.className || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // within category, weakest first
      if (a.category === "weak" || a.category === "developing") return a.avgScore - b.avgScore;
      return b.avgScore - a.avgScore;
    });
  }, [classified, activeTab, classFilter, search]);

  const counts = useMemo(() => ({
    weak:       classified.filter(s => s.category === "weak").length,
    developing: classified.filter(s => s.category === "developing").length,
    smart:      classified.filter(s => s.category === "smart").length,
  }), [classified]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">
            Auto-detected performance tiers · Filter by class · Notify teacher or parent in one click
          </p>
        </div>
        <button
          onClick={() => setNotifyAllOpen(true)}
          disabled={loading || classified.length === 0}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-[#1e4fc0] transition-colors shadow-sm disabled:opacity-50 self-start md:self-auto"
        >
          <Megaphone className="w-4 h-4" />
          Notify All Class Teachers
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search student, roll no, class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        </div>
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        >
          <option value="all">All Classes ({classified.length})</option>
          {classes.map(c => {
            const inClass = classified.filter(s => s.classId === c.id).length;
            return (
              <option key={c.id} value={c.id}>
                {c.name || c.className} ({inClass})
              </option>
            );
          })}
        </select>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-3">
        {TABS.map(t => {
          const meta = CATEGORY_META[t.key];
          const active = activeTab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`rounded-2xl p-4 text-left transition-all border-2 ${
                active
                  ? "shadow-md"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
              style={active ? { background: meta.bg, borderColor: meta.border } : undefined}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: meta.bg }}
                >
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                </div>
                <span
                  className="text-2xl font-black"
                  style={{ color: active ? meta.color : "#334155" }}
                >
                  {counts[t.key]}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900">{t.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                {meta.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-900">
              {CATEGORY_META[activeTab].label} Students ({visible.length})
            </span>
          </div>
          {classFilter !== "all" && (
            <button
              onClick={() => setClassFilter("all")}
              className="text-xs font-semibold text-[#1e3a8a] hover:underline"
            >
              Clear class filter
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#1e3a8a]" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">
              No students in this tier {classFilter !== "all" ? "for selected class" : ""}.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map(stu => (
              <StudentRow
                key={stu.studentId}
                student={stu}
                onOpenProfile={() => navigate(`/students/${stu.studentId}`)}
                onAnalyzeAI={() => setAiInsightStudent(stu)}
                onNotifyTeacher={() => setNotifyTeacher(stu)}
                onNotifyParent={() => setNotifyParent(stu)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {notifyTeacher && (
        <NotifyTeacherModal
          student={notifyTeacher}
          onClose={() => setNotifyTeacher(null)}
        />
      )}
      {notifyParent && (
        <NotifyParentModal
          student={notifyParent}
          onClose={() => setNotifyParent(null)}
        />
      )}
      {notifyAllOpen && (
        <NotifyAllTeachersModal
          classified={classified}
          onClose={() => setNotifyAllOpen(false)}
        />
      )}
      {aiInsightStudent && (
        <StudentAIInsightsModal
          student={aiInsightStudent}
          onClose={() => setAiInsightStudent(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// StudentRow — single student card in the list
// ═══════════════════════════════════════════════════════════════════════════
function StudentRow({
  student,
  onOpenProfile,
  onAnalyzeAI,
  onNotifyTeacher,
  onNotifyParent,
}: {
  student: ClassifiedStudent;
  onOpenProfile: () => void;
  onAnalyzeAI: () => void;
  onNotifyTeacher: () => void;
  onNotifyParent: () => void;
}) {
  const meta = CATEGORY_META[student.category];
  const initials = (student.studentName || "S")
    .trim()
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      onClick={onOpenProfile}
      role="button"
      tabIndex={0}
      className="flex flex-col md:flex-row items-start md:items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
    >
      {/* Avatar + identity */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ background: meta.bg, color: meta.color }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-900 truncate">{student.studentName}</p>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
            >
              {meta.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Class {student.className || "—"} · Roll {student.rollNo || "—"}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
            {student.reasons.join(" · ")}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:flex md:items-center gap-3 md:gap-6 w-full md:w-auto md:mr-3">
        <div className="text-center md:text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg</p>
          <p
            className="text-sm font-bold"
            style={{ color: student.avgScore >= 75 ? "#059669" : student.avgScore >= 50 ? "#d97706" : "#dc2626" }}
          >
            {student.avgScore > 0 || student.scores.length > 0 ? `${student.avgScore}%` : "—"}
          </p>
        </div>
        <div className="text-center md:text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attd</p>
          <p
            className="text-sm font-bold"
            style={{ color: student.attendancePct >= 85 ? "#059669" : student.attendancePct >= 70 ? "#d97706" : "#dc2626" }}
          >
            {student.totalAttendance > 0 ? `${student.attendancePct}%` : "—"}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
        <button
          onClick={(e) => { e.stopPropagation(); onAnalyzeAI(); }}
          className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-semibold text-[#1e3a8a] hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
          title="AI-powered root cause + improvement plan"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Analysis
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onNotifyTeacher(); }}
          className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-[#1e3a8a] transition-colors"
        >
          <GraduationCap className="w-3.5 h-3.5" />
          Notify Teacher
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onNotifyParent(); }}
          className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Notify Parent
        </button>
        <ChevronRight className="hidden md:block w-4 h-4 text-slate-300" />
      </div>
    </div>
  );
}