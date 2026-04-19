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
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

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

  /* ═══════════════════════════════════════════════════════════════
     MOBILE — Bright Blue Apple UI
     ═══════════════════════════════════════════════════════════════ */
  if (isMobile) {
    const B1 = "#0055FF", B3 = "#2277FF", B4 = "#4499FF";
    const BG = "#EEF4FF", BG2 = "#E0ECFF";
    const T1 = "#001040", T3 = "#5070B0", T4 = "#99AACC";
    const SEP = "rgba(0,85,255,0.07)";
    const GREEN = "#00C853", GREEN_D = "#007830", GREEN_S = "rgba(0,200,83,0.10)", GREEN_B = "rgba(0,200,83,0.22)";
    const RED = "#FF3355", RED_S = "rgba(255,51,85,0.10)", RED_B = "rgba(255,51,85,0.22)";
    const ORANGE = "#FF8800", ORANGE_S = "rgba(255,136,0,0.10)", ORANGE_B = "rgba(255,136,0,0.22)";
    const SH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 8px rgba(0,85,255,0.08), 0 10px 26px rgba(0,85,255,0.10)";
    const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.11), 0 18px 44px rgba(0,85,255,0.13)";

    const weakList = classified.filter(s => s.category === "weak" && (classFilter === "all" || s.classId === classFilter) && (!search || `${s.studentName} ${s.rollNo} ${s.className}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => a.avgScore - b.avgScore);
    const devList = classified.filter(s => s.category === "developing" && (classFilter === "all" || s.classId === classFilter) && (!search || `${s.studentName} ${s.rollNo} ${s.className}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => a.avgScore - b.avgScore);
    const smartList = classified.filter(s => s.category === "smart" && (classFilter === "all" || s.classId === classFilter) && (!search || `${s.studentName} ${s.rollNo} ${s.className}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.avgScore - a.avgScore);

    const getInitials = (name: string) =>
      (name || "S").trim().split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

    // Tier card theme helper
    const tierTheme = {
      weak:       { color: RED,    bg: "linear-gradient(145deg, rgba(255,51,85,0.08) 0%, rgba(255,51,85,0.03) 100%)",  border: "rgba(255,51,85,0.22)",  iconBg: "rgba(255,51,85,0.12)",  iconBorder: "rgba(255,51,85,0.22)",  desc: "Needs immediate attention" },
      developing: { color: ORANGE, bg: "linear-gradient(145deg, rgba(255,136,0,0.08) 0%, rgba(255,136,0,0.03) 100%)", border: "rgba(255,136,0,0.22)", iconBg: "rgba(255,136,0,0.12)", iconBorder: "rgba(255,136,0,0.22)", desc: "Moderate performance" },
      smart:      { color: GREEN,  bg: "linear-gradient(145deg, rgba(0,200,83,0.08) 0%, rgba(0,200,83,0.03) 100%)",   border: "rgba(0,200,83,0.22)",   iconBg: "rgba(0,200,83,0.12)",   iconBorder: "rgba(0,200,83,0.22)",   desc: "Strong performer" },
    };

    const StudentCard = ({ stu }: { stu: ClassifiedStudent }) => {
      const t = tierTheme[stu.category];
      const initials = getInitials(stu.studentName);
      const scoreColor = stu.avgScore >= 75 ? GREEN_D : stu.avgScore >= 50 ? ORANGE : RED;
      const attColor = stu.attendancePct >= 85 ? GREEN_D : stu.attendancePct >= 70 ? ORANGE : RED;
      const avatarGrad =
        stu.category === "weak"       ? `linear-gradient(135deg, ${B1}, ${B3})` :
        stu.category === "developing" ? `linear-gradient(135deg, ${ORANGE}, #FFCC22)` :
                                        `linear-gradient(135deg, ${GREEN}, #22EE66)`;
      const avatarShadow =
        stu.category === "weak"       ? "0 4px 14px rgba(0,85,255,0.28)" :
        stu.category === "developing" ? "0 4px 14px rgba(255,136,0,0.28)" :
                                        "0 4px 14px rgba(0,200,83,0.26)";

      return (
        <div className="mx-5 mt-3 bg-white rounded-[24px] overflow-hidden"
          style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          {/* Tap row to open profile */}
          <button onClick={() => navigate(`/students/${stu.studentId}`)}
            className="w-full flex items-start gap-[14px] px-[18px] pt-[18px] pb-4 text-left active:bg-[#F5F9FF] transition-colors"
            style={{ borderBottom: `0.5px solid ${SEP}` }}>
            <div className="w-[50px] h-[50px] rounded-[16px] flex items-center justify-center text-[17px] font-bold text-white shrink-0"
              style={{ background: avatarGrad, boxShadow: avatarShadow }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <div className="text-[16px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.3px" }}>{stu.studentName}</div>
                <div className="px-[10px] py-[4px] rounded-full text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={{ background: stu.category === "weak" ? RED_S : stu.category === "developing" ? ORANGE_S : GREEN_S,
                           color: stu.category === "weak" ? RED : stu.category === "developing" ? "#884400" : GREEN_D,
                           border: `0.5px solid ${stu.category === "weak" ? RED_B : stu.category === "developing" ? ORANGE_B : GREEN_B}` }}>
                  {stu.category}
                </div>
              </div>
              <div className="text-[11px] font-medium mb-[3px]" style={{ color: T3 }}>
                {stu.className ? `Class ${stu.className}` : "No class"}{stu.rollNo ? ` · Roll ${stu.rollNo}` : ""}
              </div>
              <div className="text-[11px] font-normal truncate" style={{ color: T3 }}>
                {stu.reasons?.length > 0 ? stu.reasons.join(" · ") : "On track"}
              </div>
            </div>
          </button>

          {/* Score strip */}
          <div className="flex" style={{ borderBottom: `0.5px solid ${SEP}` }}>
            {[
              { label: "AVG Score", val: stu.scores.length > 0 ? `${stu.avgScore}%` : "—", color: scoreColor, pct: stu.avgScore, grad: stu.avgScore >= 75 ? `linear-gradient(90deg, ${GREEN}, #66EE88)` : stu.avgScore >= 50 ? `linear-gradient(90deg, ${ORANGE}, #FFCC22)` : `linear-gradient(90deg, ${RED}, #FF88AA)` },
              { label: "Attendance", val: stu.totalAttendance > 0 ? `${stu.attendancePct}%` : "—", color: attColor, pct: stu.attendancePct, grad: stu.attendancePct >= 85 ? `linear-gradient(90deg, ${GREEN}, #66EE88)` : stu.attendancePct >= 70 ? `linear-gradient(90deg, ${ORANGE}, #FFCC22)` : `linear-gradient(90deg, ${RED}, #FF88AA)` },
              { label: "Tier", val: CATEGORY_META[stu.category].label, color: t.color, pct: 100, grad: stu.category === "weak" ? `linear-gradient(90deg, ${RED}, #FF88AA)` : stu.category === "developing" ? `linear-gradient(90deg, ${ORANGE}, #FFCC22)` : `linear-gradient(90deg, ${GREEN}, #66EE88)` },
            ].map((cell, i, arr) => (
              <div key={cell.label} className="flex-1 px-4 py-[14px] flex flex-col gap-[5px] relative">
                {i < arr.length - 1 && <span className="absolute right-0 top-3 bottom-3 w-[0.5px]" style={{ background: "rgba(0,85,255,0.10)" }} />}
                <span className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>{cell.label}</span>
                <span className="text-[22px] font-bold leading-none" style={{ color: cell.color, letterSpacing: "-0.6px" }}>{cell.val}</span>
                <div className="h-1 rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                  <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, Math.max(0, cell.pct))}%`, background: cell.grad }} />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-[18px] py-[14px]">
            <button onClick={e => { e.stopPropagation(); setAiInsightStudent(stu); }}
              className="flex-1 h-[42px] rounded-[14px] flex items-center justify-center gap-[6px] text-[12px] font-bold tracking-[0.02em] active:scale-[0.95] transition-transform"
              style={{ background: BG, border: "0.5px solid rgba(0,85,255,0.16)", color: B1, boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <Sparkles className="w-[13px] h-[13px]" strokeWidth={2.3} />
              AI Analysis
            </button>
            <button onClick={e => { e.stopPropagation(); setNotifyTeacher(stu); }}
              className="flex-1 h-[42px] rounded-[14px] flex items-center justify-center gap-[6px] text-[12px] font-bold tracking-[0.02em] active:scale-[0.95] transition-transform bg-white"
              style={{ border: "0.5px solid rgba(0,85,255,0.14)", color: "#002080", boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <GraduationCap className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
              Teacher
            </button>
            <button onClick={e => { e.stopPropagation(); setNotifyParent(stu); }}
              className="flex-1 h-[42px] rounded-[14px] flex items-center justify-center gap-[6px] text-[12px] font-bold tracking-[0.02em] text-white active:scale-[0.95] transition-transform relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${GREEN}, #22EE66)`, boxShadow: "0 4px 14px rgba(0,200,83,0.32)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 52%)" }} />
              <MessageSquare className="w-[13px] h-[13px] relative z-10" strokeWidth={2.3} />
              <span className="relative z-10">Parent</span>
            </button>
          </div>
        </div>
      );
    };

    const SectionHeader = ({ tier, label, count, Icon }: { tier: Category; label: string; count: number; Icon: any }) => {
      const t = tierTheme[tier];
      return (
        <div className="flex items-center gap-[10px] px-5 pt-[18px]">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: t.iconBg, border: `0.5px solid ${t.iconBorder}` }}>
            <Icon className="w-4 h-4" style={{ color: t.color }} strokeWidth={2.3} />
          </div>
          <div className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>{label}</div>
          <div className="px-[10px] py-[4px] rounded-full text-[11px] font-bold"
            style={{ background: tier === "weak" ? RED_S : tier === "developing" ? ORANGE_S : GREEN_S,
                     color: tier === "weak" ? RED : tier === "developing" ? "#884400" : GREEN_D,
                     border: `0.5px solid ${tier === "weak" ? RED_B : tier === "developing" ? ORANGE_B : GREEN_B}` }}>
            {count}
          </div>
        </div>
      );
    };

    const EmptySection = ({ tier, msg }: { tier: Category; msg: string }) => {
      const t = tierTheme[tier];
      const Icon = tier === "weak" ? AlertTriangle : tier === "developing" ? TrendingUp : Award;
      return (
        <div className="mx-5 mt-[10px] bg-white rounded-[20px] px-[18px] py-[22px] flex flex-col items-center gap-2"
          style={{ boxShadow: SH, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
            style={{ background: t.iconBg, border: `0.5px solid ${t.iconBorder}` }}>
            <Icon className="w-5 h-5" style={{ color: t.color }} strokeWidth={2.2} />
          </div>
          <div className="text-[14px] font-bold" style={{ color: "#002080", letterSpacing: "-0.2px" }}>No {CATEGORY_META[tier].label.toLowerCase()} students</div>
          <div className="text-[12px] text-center max-w-[220px] leading-[1.55] font-normal" style={{ color: T4 }}>{msg}</div>
        </div>
      );
    };

    return (
      <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>

        {/* Page Head */}
        <div className="px-5 pt-4">
          <div className="text-[26px] font-bold mb-[5px]" style={{ color: T1, letterSpacing: "-0.7px" }}>Student Intelligence</div>
          <div className="text-[12px] leading-[1.65] font-normal" style={{ color: T3 }}>
            Auto-detected performance tiers · Filter by class · Notify teacher or parent in one click
          </div>
        </div>

        {/* Notify All Button */}
        <button
          onClick={() => setNotifyAllOpen(true)}
          disabled={loading || classified.length === 0}
          className="mx-5 mt-[14px] w-[calc(100%-40px)] h-[50px] rounded-[16px] flex items-center justify-center gap-2 text-[14px] font-bold text-white disabled:opacity-50 relative overflow-hidden active:scale-[0.97] transition-transform"
          style={{
            background: "linear-gradient(135deg, #001040, #001888)",
            boxShadow: "0 6px 22px rgba(0,8,64,0.30), 0 2px 6px rgba(0,8,64,0.16)",
            letterSpacing: "-0.1px",
            transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
          }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 52%)" }} />
          <Megaphone className="w-4 h-4 relative z-10" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.2} />
          <span className="relative z-10">Notify All Class Teachers</span>
        </button>

        {/* Search */}
        <div className="mx-5 mt-3 relative">
          <div className="absolute left-[15px] top-1/2 -translate-y-1/2 pointer-events-none">
            <Search className="w-4 h-4" style={{ color: "rgba(0,85,255,0.42)" }} strokeWidth={2.2} />
          </div>
          <input
            type="text"
            placeholder="Search student, roll no, class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full py-[13px] pr-4 pl-11 rounded-[16px] text-[14px] font-normal outline-none bg-white"
            style={{ border: "0.5px solid rgba(0,85,255,0.12)", color: T1, letterSpacing: "-0.1px", boxShadow: SH, fontFamily: "inherit" }}
          />
        </div>

        {/* Class dropdown */}
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className="w-[calc(100%-40px)] mx-5 mt-[10px] py-3 px-4 rounded-[14px] text-[14px] font-semibold outline-none cursor-pointer appearance-none bg-white"
          style={{
            border: "0.5px solid rgba(0,85,255,0.14)",
            color: T1,
            boxShadow: SH,
            fontFamily: "inherit",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 14px center",
          }}>
          <option value="all">All Classes ({classified.length})</option>
          {classes.map(c => {
            const inClass = classified.filter(s => s.classId === c.id).length;
            return (
              <option key={c.id} value={c.id}>{c.name || c.className} ({inClass})</option>
            );
          })}
        </select>

        {/* Tier cards */}
        <div className="grid grid-cols-3 gap-[10px] px-5 pt-[14px]">
          {([
            { key: "weak" as Category,       count: counts.weak,       label: "Weak",       icon: AlertTriangle },
            { key: "developing" as Category, count: counts.developing, label: "Developing", icon: TrendingUp },
            { key: "smart" as Category,      count: counts.smart,      label: "Smart",      icon: Award },
          ]).map(({ key, count, label, icon: Icon }) => {
            const t = tierTheme[key];
            const active = activeTab === key;
            return (
              <button key={key}
                onClick={() => setActiveTab(key)}
                className="rounded-[20px] px-[14px] py-4 relative overflow-hidden active:scale-[0.96] transition-transform text-left"
                style={{
                  background: t.bg,
                  border: `0.5px solid ${active ? t.color : t.border}`,
                  transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                  boxShadow: active ? `0 0 0 2px ${t.color}22` : "none",
                }}>
                {active && (
                  <div className="absolute top-[10px] right-[10px] w-[6px] h-[6px] rounded-full animate-pulse"
                    style={{ background: t.color, boxShadow: `0 0 0 2.5px ${t.color}33` }} />
                )}
                <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center mb-2"
                  style={{ background: t.iconBg, border: `0.5px solid ${t.iconBorder}` }}>
                  <Icon className="w-[15px] h-[15px]" style={{ color: t.color }} strokeWidth={2.5} />
                </div>
                <div className="text-[30px] font-bold leading-none mb-[5px]" style={{ color: t.color, letterSpacing: "-1px" }}>{count}</div>
                <div className="text-[13px] font-bold mb-[3px]" style={{ color: T1, letterSpacing: "-0.1px" }}>{label}</div>
                <div className="text-[10px] font-normal leading-[1.4]" style={{ color: T3 }}>{t.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Loading spinner */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} />
            <p className="text-[12px] font-medium" style={{ color: T4 }}>Loading student intelligence…</p>
          </div>
        )}

        {/* Weak Section */}
        {!loading && (
          <>
            <SectionHeader tier="weak" label="Weak Students" count={weakList.length} Icon={Users} />
            {weakList.length === 0
              ? <EmptySection tier="weak" msg={search || classFilter !== "all" ? "No matches for current filters." : "Great — no students in the weak tier right now."} />
              : weakList.map(stu => <StudentCard key={stu.studentId} stu={stu} />)}

            <SectionHeader tier="smart" label="Smart Students" count={smartList.length} Icon={Users} />
            {smartList.length === 0
              ? <EmptySection tier="smart" msg={search || classFilter !== "all" ? "No matches for current filters." : "No smart-tier students yet — add scores to see top performers."} />
              : smartList.map(stu => <StudentCard key={stu.studentId} stu={stu} />)}

            {/* AI Insight dark card — shows when there are weak students */}
            {weakList.length > 0 && (
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
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Class Intelligence</span>
                </div>
                <p className="text-[13px] leading-[1.72] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
                  <strong style={{ color: "#fff", fontWeight: 700 }}>{weakList.length} student{weakList.length === 1 ? "" : "s"}</strong> performing below passing threshold.
                  {weakList[0] && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{weakList[0].studentName}</strong>'s <strong style={{ color: "#fff", fontWeight: 700 }}>{weakList[0].avgScore}% average</strong> requires immediate teacher intervention.</>}
                  {" "}Focused revision and teacher support can significantly improve outcomes before the next assessment.
                </p>
                <div className="flex items-center gap-[6px] mt-[14px] pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
                  <div className="w-[6px] h-[6px] rounded-full" style={{ background: B4 }} />
                  <span className="text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.40)" }}>Auto-generated from real-time assessment data</span>
                </div>
              </div>
            )}

            <SectionHeader tier="developing" label="Developing Students" count={devList.length} Icon={Users} />
            {devList.length === 0
              ? <EmptySection tier="developing" msg="All students are either performing well or need immediate attention." />
              : devList.map(stu => <StudentCard key={stu.studentId} stu={stu} />)}
          </>
        )}

        <div className="h-6" />

        {/* Modals — shared with desktop state */}
        {notifyTeacher && <NotifyTeacherModal student={notifyTeacher} onClose={() => setNotifyTeacher(null)} />}
        {notifyParent && <NotifyParentModal student={notifyParent} onClose={() => setNotifyParent(null)} />}
        {notifyAllOpen && <NotifyAllTeachersModal classified={classified} onClose={() => setNotifyAllOpen(false)} />}
        {aiInsightStudent && <StudentAIInsightsModal student={aiInsightStudent} onClose={() => setAiInsightStudent(null)} />}
      </div>
    );
  }

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