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
import { tilt3D, tilt3DStyle } from "@/lib/use3DTilt";

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
    // Unified blue halo — matches Students-page cards (reference visual).
    const SH = "0 0 0 0.5px rgba(0,85,255,0.12), 0 3px 12px rgba(0,85,255,0.14), 0 12px 32px rgba(0,85,255,0.18)";
    const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.14), 0 6px 20px rgba(0,85,255,0.18), 0 22px 56px rgba(0,85,255,0.22)";

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

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP — Blue Apple Design
  // ═══════════════════════════════════════════════════════════════
  const dB1 = "#0055FF", dB2 = "#1166FF", dB4 = "#4499FF";
  const dBG = "#EEF4FF", dBG2 = "#E0ECFF";
  const dT1 = "#001040", dT2 = "#002080", dT3 = "#5070B0", dT4 = "#99AACC";
  const dSEP = "rgba(0,85,255,0.08)";
  const dGREEN = "#00C853", dGREEN_D = "#007830", dGREEN_S = "rgba(0,200,83,0.10)", dGREEN_B = "rgba(0,200,83,0.22)";
  const dRED = "#FF3355", dRED_S = "rgba(255,51,85,0.10)", dRED_B = "rgba(255,51,85,0.22)";
  const dORANGE = "#FF8800", dORANGE_S = "rgba(255,136,0,0.10)", dORANGE_B = "rgba(255,136,0,0.22)";
  const dGOLD = "#FFAA00";
  const dVIOLET = "#7B3FF4";
  // Unified blue halo — matches Students-page cards (reference visual).
  const dSH = "0 0 0 0.5px rgba(0,85,255,0.12), 0 3px 12px rgba(0,85,255,0.14), 0 12px 32px rgba(0,85,255,0.18)";
  const dSH_LG = "0 0 0 0.5px rgba(0,85,255,0.14), 0 6px 20px rgba(0,85,255,0.18), 0 22px 56px rgba(0,85,255,0.22)";
  const dSH_BTN = "0 6px 22px rgba(0,85,255,0.42), 0 2px 6px rgba(0,85,255,0.22)";

  const tierThemeD = {
    weak:       { color: dRED,    soft: dRED_S,    border: dRED_B,    grad: `linear-gradient(135deg, ${dRED}, #FF6688)`,    shadow: "0 4px 14px rgba(255,51,85,0.26)",  Icon: AlertTriangle, label: "Weak",       desc: "Needs immediate attention" },
    developing: { color: dORANGE, soft: dORANGE_S, border: dORANGE_B, grad: `linear-gradient(135deg, ${dORANGE}, #FFCC22)`, shadow: "0 4px 14px rgba(255,136,0,0.26)", Icon: TrendingUp,    label: "Developing", desc: "Moderate performance" },
    smart:      { color: dGREEN,  soft: dGREEN_S,  border: dGREEN_B,  grad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`,  shadow: "0 4px 14px rgba(0,200,83,0.24)",  Icon: Award,         label: "Smart",      desc: "Strong performer" },
  };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
            <Sparkles className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Student Intelligence</div>
            <div className="text-[12px] mt-1" style={{ color: dT3 }}>Auto-detected performance tiers · Filter by class · Notify in one click</div>
          </div>
        </div>
        <button
          onClick={() => setNotifyAllOpen(true)}
          disabled={loading || classified.length === 0}
          className="h-11 px-5 rounded-[14px] flex items-center gap-2 text-[13px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          style={{
            background: "linear-gradient(135deg, #001040, #001888)",
            boxShadow: "0 6px 22px rgba(0,8,64,0.28), 0 2px 6px rgba(0,8,64,0.14)",
          }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, transparent 52%)" }} />
          <Megaphone className="w-4 h-4 relative z-10" strokeWidth={2.3} />
          <span className="relative z-10">Notify All Class Teachers</span>
        </button>
      </div>

      {/* Dark Hero */}
      <div style={{ perspective: "1200px" }}>
      <div
        {...tilt3D}
        className="rounded-[22px] px-7 py-6 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
          ...tilt3DStyle,
        }}>
        <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
        <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Users className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>Total Students Analyzed</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[48px] font-bold leading-none tracking-tight">{classified.length}</span>
                <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>students</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            {(["weak", "developing", "smart"] as Category[]).map(k => {
              const t = tierThemeD[k];
              return (
                <div key={k} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                    <t.Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>{t.label}</div>
                    <div className="text-[24px] font-bold leading-none" style={{ letterSpacing: "-0.6px" }}>{counts[k]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* Tier Cards (filter tabs) */}
      <div className="grid grid-cols-3 gap-4 mt-5" style={{ perspective: "1200px" }}>
        {TABS.map(t => {
          const td = tierThemeD[t.key];
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              {...tilt3D}
              className="rounded-[20px] p-5 text-left relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40"
              style={{
                background: active ? `linear-gradient(145deg, ${td.soft} 0%, rgba(255,255,255,0.4) 100%)` : "#FFFFFF",
                border: `0.5px solid ${active ? td.color + "66" : dSEP}`,
                boxShadow: active ? `${dSH_LG}, 0 0 0 2px ${td.color}22` : dSH_LG,
                ...tilt3DStyle,
              }}>
              <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
              <div className="absolute -top-8 -right-8 w-[110px] h-[110px] rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${td.soft} 0%, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-3 relative">
                <div className="w-11 h-11 rounded-[13px] flex items-center justify-center"
                  style={{ background: td.grad, boxShadow: td.shadow }}>
                  <td.Icon className="w-5 h-5 text-white" strokeWidth={2.3} />
                </div>
                {active && (
                  <div className="w-[8px] h-[8px] rounded-full animate-pulse" style={{ background: td.color, boxShadow: `0 0 0 3px ${td.color}33` }} />
                )}
              </div>
              <div className="text-[36px] font-bold leading-none mb-2" style={{ color: td.color, letterSpacing: "-1.2px" }}>{counts[t.key]}</div>
              <div className="text-[14px] font-bold mb-1" style={{ color: dT1, letterSpacing: "-0.2px" }}>{td.label}</div>
              <div className="text-[11px]" style={{ color: dT3 }}>{td.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3 mt-5 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,85,255,0.42)" }} strokeWidth={2.2} />
          <input
            type="text"
            placeholder="Search student, roll no, class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-11 pr-4 bg-white rounded-[14px] text-[13px] font-medium outline-none"
            style={{ border: `0.5px solid ${dSEP}`, color: dT1, boxShadow: dSH, fontFamily: "inherit" }}
          />
        </div>
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className="h-11 px-4 pr-10 bg-white rounded-[14px] text-[13px] font-semibold outline-none cursor-pointer appearance-none"
          style={{
            border: `0.5px solid ${dSEP}`,
            color: dT2,
            boxShadow: dSH,
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
      </div>

      {/* Section Label */}
      <div className="flex items-center gap-3 mt-6 mb-3">
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
          style={{ background: tierThemeD[activeTab].grad, boxShadow: tierThemeD[activeTab].shadow }}>
          {(() => { const Ic = tierThemeD[activeTab].Icon; return <Ic className="w-4 h-4 text-white" strokeWidth={2.4} />; })()}
        </div>
        <div className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>
          {CATEGORY_META[activeTab].label} Students
        </div>
        <span className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{ background: tierThemeD[activeTab].soft, color: tierThemeD[activeTab].color, border: `0.5px solid ${tierThemeD[activeTab].border}` }}>
          {visible.length}
        </span>
        {classFilter !== "all" && (
          <button onClick={() => setClassFilter("all")}
            className="ml-auto text-[12px] font-bold hover:underline" style={{ color: dB1 }}>
            Clear class filter
          </button>
        )}
      </div>

      {/* Student Cards */}
      {loading ? (
        <div className="bg-white rounded-[20px] py-16 flex flex-col items-center gap-3" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: dB1 }} />
          <p className="text-[12px] font-bold uppercase tracking-widest" style={{ color: dT4 }}>Loading student intelligence…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-[20px] py-16 flex flex-col items-center gap-3" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-14 h-14 rounded-[16px] flex items-center justify-center"
            style={{ background: tierThemeD[activeTab].soft, border: `0.5px solid ${tierThemeD[activeTab].border}` }}>
            {(() => { const Ic = tierThemeD[activeTab].Icon; return <Ic className="w-6 h-6" style={{ color: tierThemeD[activeTab].color }} strokeWidth={2.2} />; })()}
          </div>
          <p className="text-[14px] font-bold" style={{ color: dT1 }}>
            No students in this tier {classFilter !== "all" ? "for selected class" : ""}.
          </p>
          <p className="text-[11px]" style={{ color: dT4 }}>Try switching tier or clearing class filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" style={{ perspective: "1200px" }}>
          {visible.map(stu => {
            const t = tierThemeD[stu.category];
            const initials = (stu.studentName || "S").trim().split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            const scoreColor = stu.avgScore >= 75 ? dGREEN_D : stu.avgScore >= 50 ? dORANGE : dRED;
            const attColor = stu.attendancePct >= 85 ? dGREEN_D : stu.attendancePct >= 70 ? dORANGE : dRED;
            return (
              <div
                key={stu.studentId}
                {...tilt3D}
                className="bg-white rounded-[20px] overflow-hidden relative"
                style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
                <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: t.grad }} />

                <button
                  onClick={() => navigate(`/students/${stu.studentId}`)}
                  className="w-full flex items-center gap-4 pl-6 pr-5 pt-5 pb-4 text-left hover:bg-[#F8FAFF] transition-colors"
                  style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                  <div className="w-[52px] h-[52px] rounded-[16px] flex items-center justify-center text-[17px] font-bold text-white shrink-0"
                    style={{ background: t.grad, boxShadow: t.shadow }}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <div className="text-[15px] font-bold truncate" style={{ color: dT1, letterSpacing: "-0.2px" }}>{stu.studentName}</div>
                      <div className="px-[10px] py-[4px] rounded-full text-[9px] font-bold uppercase tracking-[0.08em]"
                        style={{ background: t.soft, color: t.color, border: `0.5px solid ${t.border}` }}>
                        {CATEGORY_META[stu.category].label}
                      </div>
                    </div>
                    <div className="text-[11px] font-medium" style={{ color: dT3 }}>
                      {stu.className ? `Class ${stu.className}` : "No class"}{stu.rollNo ? ` · Roll ${stu.rollNo}` : ""}
                    </div>
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: dT3 }}>
                      {stu.reasons?.length > 0 ? stu.reasons.join(" · ") : "On track"}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: dT4 }} />
                </button>

                {/* Score strip */}
                <div className="grid grid-cols-3">
                  {[
                    { label: "Avg Score", val: stu.scores.length > 0 ? `${stu.avgScore}%` : "—", color: scoreColor, pct: stu.avgScore },
                    { label: "Attendance", val: stu.totalAttendance > 0 ? `${stu.attendancePct}%` : "—", color: attColor, pct: stu.attendancePct },
                    { label: "Tier", val: CATEGORY_META[stu.category].label, color: t.color, pct: 100 },
                  ].map((cell, i, arr) => (
                    <div key={cell.label} className="px-4 py-3" style={{ borderRight: i < arr.length - 1 ? `0.5px solid ${dSEP}` : undefined, borderBottom: `0.5px solid ${dSEP}` }}>
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-1" style={{ color: dT4 }}>{cell.label}</div>
                      <div className="text-[20px] font-bold leading-none mb-1.5" style={{ color: cell.color, letterSpacing: "-0.4px" }}>{cell.val}</div>
                      <div className="h-1 rounded-[2px]" style={{ background: dBG2 }}>
                        <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, Math.max(0, cell.pct))}%`, background: cell.color }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-4">
                  <button onClick={() => setAiInsightStudent(stu)}
                    className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] font-bold transition-transform hover:scale-[1.02]"
                    style={{ background: dBG, border: `0.5px solid rgba(0,85,255,0.18)`, color: dB1, boxShadow: dSH }}>
                    <Sparkles className="w-[13px] h-[13px]" strokeWidth={2.3} />
                    AI Analysis
                  </button>
                  <button onClick={() => setNotifyTeacher(stu)}
                    className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
                    style={{ border: `0.5px solid ${dSEP}`, color: dT2, boxShadow: dSH }}>
                    <GraduationCap className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
                    Notify Teacher
                  </button>
                  <button onClick={() => setNotifyParent(stu)}
                    className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] font-bold text-white transition-transform hover:scale-[1.02] relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, boxShadow: "0 4px 14px rgba(0,200,83,0.30)" }}>
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, transparent 52%)" }} />
                    <MessageSquare className="w-[13px] h-[13px] relative z-10" strokeWidth={2.3} />
                    <span className="relative z-10">Notify Parent</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Intelligence Card */}
      {!loading && counts.weak > 0 && (
        <div className="mt-5 rounded-[22px] px-7 py-6 relative overflow-hidden"
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
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Class Intelligence</span>
          </div>
          {(() => {
            const weakFirst = classified.filter(s => s.category === "weak").sort((a, b) => a.avgScore - b.avgScore)[0];
            return (
              <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
                <strong style={{ color: "#fff", fontWeight: 700 }}>{counts.weak} student{counts.weak === 1 ? "" : "s"}</strong> performing below passing threshold.
                {weakFirst && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{weakFirst.studentName}</strong>'s <strong style={{ color: "#fff", fontWeight: 700 }}>{weakFirst.avgScore}% average</strong> requires immediate teacher intervention.</>}
                {" "}Focused revision and teacher support can significantly improve outcomes before the next assessment.
              </p>
            );
          })()}
          <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
            <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: dB4 }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated from real-time assessment data</span>
          </div>
        </div>
      )}

      {/* Modals */}
      {notifyTeacher && <NotifyTeacherModal student={notifyTeacher} onClose={() => setNotifyTeacher(null)} />}
      {notifyParent && <NotifyParentModal student={notifyParent} onClose={() => setNotifyParent(null)} />}
      {notifyAllOpen && <NotifyAllTeachersModal classified={classified} onClose={() => setNotifyAllOpen(false)} />}
      {aiInsightStudent && <StudentAIInsightsModal student={aiInsightStudent} onClose={() => setAiInsightStudent(null)} />}
    </div>
  );
}

