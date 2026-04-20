import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, Flame, Bell, UserPlus, ChevronRight,
  Loader2, ShieldAlert, CalendarPlus, Sparkles, Users, MessageSquare, ArrowRight
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import RiskIntervention from "@/components/RiskIntervention";
import MeetingScheduler from "@/components/MeetingScheduler";
import { useIsMobile } from "@/hooks/use-mobile";

type RiskLevel = "CRITICAL" | "WARNING" | "MONITORING";
type FilterTab = "All" | RiskLevel;

interface RiskStudent {
  id: string;
  name: string;
  email: string;
  className: string;
  teacherName: string;
  teacherId: string;
  schoolId: string;
  branchId: string;
  attPct: number | null;
  avgScore: number | null;
  incidentCount: number;
  parentEngagement: number; // 0-100 score based on notes/meetings
  riskLevel: RiskLevel;
  riskFactors: string[];
  lastAction: string;
  assignedTo: string;
  daysFlagged: number;
  flaggedSince: string; // ISO date string
}

// ── helpers ────────────────────────────────────────────────────────────────────

const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return "";
};

const daysBetween = (isoA: string, isoB: string): number => {
  if (!isoA || !isoB) return 0;
  return Math.max(0, Math.round((new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000));
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const startOfWeekStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────────────────────

const RiskStudents = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [riskStudents,   setRiskStudents]   = useState<RiskStudent[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterTab,      setFilterTab]      = useState<FilterTab>("All");
  const [selectedStudent, setSelectedStudent] = useState<RiskStudent | null>(null);
  const [meetingStudent,  setMeetingStudent]  = useState<RiskStudent | null>(null);

  // Cross-listener refs
  const computeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentsRef      = useRef<any[]>([]);
  const enrollmentsRef   = useRef<any[]>([]);
  const attRef           = useRef<any[]>([]);
  const resultsRef       = useRef<any[]>([]);
  const incidentsRef     = useRef<any[]>([]);
  const parentNotesRef   = useRef<any[]>([]);
  const interventionsRef = useRef<any[]>([]);
  const flagsRef         = useRef<any[]>([]);
  // 3rd factor: assignments + submissions
  const assignmentsRef   = useRef<any[]>([]);
  const submissionsRef   = useRef<any[]>([]);

  // ── compute all at-risk students from current refs ──────────────────────────
  const compute = () => {
    // Build unique student map: id → base info
    const map = new Map<string, any>();

    studentsRef.current.forEach(s => {
      const key = s.id;
      map.set(key, { ...s, _source: "students" });
    });
    enrollmentsRef.current.forEach(e => {
      const key = e.studentId || e.id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: e.studentName || e.name || "Unknown",
          email: e.studentEmail || e.email || "",
          className: e.className || "",
          teacherName: e.teacherName || "",
          teacherId: e.teacherId || "",
          schoolId: e.schoolId || "",
          branchId: e.branchId || "",
          _source: "enrollments",
        });
      }
    });

    const today = todayStr();
    const results: RiskStudent[] = [];

    map.forEach((s) => {
      const email = (s.email || s.studentEmail || "").toLowerCase();
      const sid   = s.id;

      // ── Attendance ──
      const attRecs = attRef.current.filter(r => r.studentId === sid);
      let attPct: number | null = null;
      if (attRecs.length > 0) {
        const present = attRecs.filter(r => r.status === "present" || r.status === "late").length;
        attPct = Math.round((present / attRecs.length) * 100);
      }

      // ── Academic ──
      const resultRecs = resultsRef.current.filter(r => r.studentId === sid);
      let avgScore: number | null = null;
      if (resultRecs.length > 0) {
        const sum = resultRecs.reduce((a, r) => a + Number(r.percentage || r.score || 0), 0);
        avgScore = Math.round(sum / resultRecs.length);
      }

      // ── Incidents ──
      const incRecs = incidentsRef.current.filter(r => r.studentId === sid);

      // ── Parent engagement score (0-100) ──
      const notes = parentNotesRef.current.filter(r => r.studentId === sid);
      const parentEngagement = Math.min(100, notes.length * 20); // 5+ notes = 100%

      // ── 3rd Factor: Task / Assignment completion ──
      const studentClassIds = enrollmentsRef.current
        .filter(e => e.studentId === sid)
        .map(e => e.classId).filter(Boolean);

      // All assignments for student's classes
      const studentAssignments = assignmentsRef.current.filter(a =>
        studentClassIds.includes(a.classId)
      );
      // Student's submissions
      const studentSubmissions = submissionsRef.current.filter(s2 => s2.studentId === sid);
      const submittedIds = new Set(studentSubmissions.map(s2 => s2.homeworkId || s2.assignmentId));
      const now = new Date();
      const overdueAssignments = studentAssignments.filter(a => {
        const due = a.dueDate ? new Date(a.dueDate) : null;
        return due && due < now && !submittedIds.has(a.id);
      });
      const taskCompletionPct = studentAssignments.length > 0
        ? Math.round(((studentAssignments.length - overdueAssignments.length) / studentAssignments.length) * 100)
        : null;

      // ── Delta-based attendance drop detection ──
      // Compare last 7 days vs previous 7 days — "sudden drop"
      const sevenDaysAgo  = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const fourteenDaysAgo = new Date(); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const recent7  = attRecs.filter(r => r.date && new Date(r.date) >= sevenDaysAgo);
      const prev7    = attRecs.filter(r => r.date && new Date(r.date) >= fourteenDaysAgo && new Date(r.date) < sevenDaysAgo);
      const recent7Pct = recent7.length > 0 ? Math.round((recent7.filter(r => r.status === "present").length / recent7.length) * 100) : null;
      const prev7Pct   = prev7.length   > 0 ? Math.round((prev7.filter(r => r.status === "present").length   / prev7.length)   * 100) : null;
      const attDrop = (recent7Pct !== null && prev7Pct !== null) ? prev7Pct - recent7Pct : null;

      // ── Determine risk level ──
      const factors: string[] = [];
      let riskLevel: RiskLevel | null = null;

      if (attPct !== null && attPct < 60) { factors.push("Attendance <60%"); riskLevel = "CRITICAL"; }
      else if (attPct !== null && attPct < 75) { factors.push("Attendance <75%"); if (!riskLevel) riskLevel = "WARNING"; }

      // Delta drop: sudden 20%+ drop in recent 7 days
      if (attDrop !== null && attDrop >= 20) {
        factors.push(`Sudden drop (${attDrop}% this week)`);
        if (!riskLevel) riskLevel = "WARNING";
      }

      if (avgScore !== null && avgScore < 40) { factors.push("Academics <40%"); riskLevel = "CRITICAL"; }
      else if (avgScore !== null && avgScore < 55) { factors.push("Academics <55%"); if (!riskLevel) riskLevel = "WARNING"; }

      // 3rd factor: tasks
      if (taskCompletionPct !== null && overdueAssignments.length >= 3) {
        factors.push(`${overdueAssignments.length} tasks overdue`);
        if (!riskLevel) riskLevel = "WARNING";
        if (overdueAssignments.length >= 5 && (attPct !== null && attPct < 75)) riskLevel = "CRITICAL";
      } else if (taskCompletionPct !== null && overdueAssignments.length >= 1 && taskCompletionPct < 50) {
        factors.push(`Tasks ${taskCompletionPct}% done`);
        if (!riskLevel) riskLevel = "MONITORING";
      }

      const criticalInc = incRecs.filter(i => i.severity === "critical" || i.severity === "high").length;
      if (criticalInc >= 2) { factors.push("Discipline"); riskLevel = "CRITICAL"; }
      else if (incRecs.length >= 1) { factors.push("Discipline"); if (!riskLevel) riskLevel = "WARNING"; }

      // MONITORING: subtle attendance trend
      if (!riskLevel && (attPct !== null || avgScore !== null)) {
        if (attPct !== null && attPct < 85) { factors.push("Attendance trend"); riskLevel = "MONITORING"; }
        else if (attDrop !== null && attDrop >= 10) { factors.push("Attendance declining"); riskLevel = "MONITORING"; }
      }

      if (!riskLevel || factors.length === 0) return; // Not at risk

      // ── Days flagged (from earliest at-risk indicator) ──
      const earliestAttDate = attRecs
        .filter(r => r.status === "absent")
        .map(r => toDateStr(r.date))
        .filter(Boolean)
        .sort()[0];
      const flaggedSince = earliestAttDate || today;
      const daysFlagged  = daysBetween(flaggedSince, today);

      // ── Last action from interventions ──
      const studentInterventions = interventionsRef.current
        .filter(i => i.studentId === sid)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const lastAction = studentInterventions[0]?.actionTitle || "—";

      // ── Assigned counselor from flags ──
      const counselorFlag = flagsRef.current.find(f =>
        f.studentId === sid && f.type === "counselor_assigned" && f.status === "active"
      );
      const assignedTo = counselorFlag?.counselorName || s.teacherName || "—";

      results.push({
        id: sid,
        name: s.name || s.studentName || "Unknown",
        email,
        className: s.className || "",
        teacherName: s.teacherName || "",
        teacherId: s.teacherId || "",
        schoolId: s.schoolId || userData?.schoolId || "",
        branchId: s.branchId || userData?.branchId || "",
        attPct,
        avgScore,
        incidentCount: incRecs.length,
        parentEngagement,
        riskLevel,
        riskFactors: factors,
        lastAction,
        assignedTo,
        daysFlagged,
        flaggedSince,
      });
    });

    // Sort: CRITICAL first, then WARNING, then MONITORING; within level by daysFlagged desc
    results.sort((a, b) => {
      const order = { CRITICAL: 0, WARNING: 1, MONITORING: 2 };
      if (order[a.riskLevel] !== order[b.riskLevel]) return order[a.riskLevel] - order[b.riskLevel];
      return b.daysFlagged - a.daysFlagged;
    });

    setRiskStudents(results);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    setLoading(true);
    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];
    const unsubs: (() => void)[] = [];

    // Debounce: all 10 listeners share one timer so compute() only runs once
    // after they all settle (prevents 10 redundant re-renders on initial load)
    const scheduleCompute = () => {
      if (computeTimerRef.current) clearTimeout(computeTimerRef.current);
      computeTimerRef.current = setTimeout(compute, 30);
    };

    unsubs.push(onSnapshot(query(collection(db, "students"),       ...C), snap => { studentsRef.current    = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }));
    unsubs.push(onSnapshot(query(collection(db, "enrollments"),    ...C), snap => { enrollmentsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }));
    unsubs.push(onSnapshot(query(collection(db, "attendance"),     ...C), snap => { attRef.current         = snap.docs.map(d => d.data()); scheduleCompute(); }));
    unsubs.push(onSnapshot(query(collection(db, "results"),        ...C), snap => { resultsRef.current     = snap.docs.map(d => d.data()); scheduleCompute(); }));
    unsubs.push(onSnapshot(query(collection(db, "incidents"),      ...C), snap => { incidentsRef.current   = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }));
    unsubs.push(onSnapshot(query(collection(db, "parent_notes"),   ...C), snap => { parentNotesRef.current = snap.docs.map(d => d.data()); scheduleCompute(); }));
    unsubs.push(onSnapshot(query(collection(db, "interventions"),  ...C), snap => { interventionsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "student_flags"),  ...C), snap => { flagsRef.current       = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, () => {}));
    // 3rd factor listeners
    unsubs.push(onSnapshot(query(collection(db, "assignments"),    ...C), snap => { assignmentsRef.current  = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "submissions"),    ...C), snap => { submissionsRef.current  = snap.docs.map(d => ({ id: d.id, ...d.data() })); scheduleCompute(); }, () => {}));

    return () => {
      if (computeTimerRef.current) clearTimeout(computeTimerRef.current);
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
        ) : (
          filtered.map(s => {
            const theme = levelTheme(s.riskLevel);
            const initials = getInitials(s.name);
            return (
              <div key={s.id} className="mx-5 mt-3 bg-white rounded-[24px] overflow-hidden relative"
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

                {/* Score strip */}
                <div className="flex">
                  <div className="flex-1 px-[14px] py-3" style={{ borderRight: `0.5px solid ${SEP}` }}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em] mb-1" style={{ color: T4 }}>AVG Score</div>
                    <div className="text-[22px] font-bold leading-none mb-1" style={{ color: s.avgScore != null && s.avgScore < 40 ? RED : s.avgScore != null && s.avgScore < 55 ? ORANGE : GREEN_D, letterSpacing: "-0.5px" }}>
                      {s.avgScore != null ? `${s.avgScore}%` : "—"}
                    </div>
                    <div className="h-1 rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                      <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, Math.max(0, s.avgScore || 0))}%`, background: s.avgScore != null && s.avgScore < 40 ? `linear-gradient(90deg, ${RED}, #FF88AA)` : s.avgScore != null && s.avgScore < 55 ? `linear-gradient(90deg, ${ORANGE}, #FFDD44)` : `linear-gradient(90deg, ${GREEN}, #66EE88)` }} />
                    </div>
                  </div>
                  <div className="flex-1 px-[14px] py-3" style={{ borderRight: `0.5px solid ${SEP}` }}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em] mb-1" style={{ color: T4 }}>Attendance</div>
                    <div className="text-[22px] font-bold leading-none mb-1" style={{ color: s.attPct != null && s.attPct >= 85 ? GREEN_D : s.attPct != null && s.attPct >= 70 ? ORANGE : RED, letterSpacing: "-0.5px" }}>
                      {s.attPct != null ? `${s.attPct}%` : "—"}
                    </div>
                    <div className="h-1 rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                      <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, Math.max(0, s.attPct || 0))}%`, background: s.attPct != null && s.attPct >= 85 ? `linear-gradient(90deg, ${GREEN}, #66EE88)` : s.attPct != null && s.attPct >= 70 ? `linear-gradient(90deg, ${ORANGE}, #FFDD44)` : `linear-gradient(90deg, ${RED}, #FF88AA)` }} />
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
                    style={{ background: "linear-gradient(135deg, #001040, #001888)", boxShadow: "0 4px 14px rgba(0,8,64,0.26)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                    <ArrowRight className="w-[13px] h-[13px]" strokeWidth={2.3} />
                    View Action
                  </button>
                  <button onClick={() => navigate("/parent-communication")}
                    className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[7px] text-[12px] font-bold active:scale-[0.95] transition-transform bg-white"
                    style={{ border: "0.5px solid rgba(0,85,255,0.16)", color: "#002080", boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                    <MessageSquare className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
                    Notify
                  </button>
                </div>
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
                { label: "Send alert to parent",              sub: "Low priority · Optional",       ico: MessageSquare,grad: `linear-gradient(135deg, ${GREEN}, #22EE66)`, onClick: () => navigate("/parent-communication") },
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
    <div className="pb-10 max-w-[1400px] mx-auto px-2 animate-in fade-in duration-500"
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

      {/* 4 Stat Cards (filters) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        {[
          { key: "CRITICAL" as FilterTab,   label: "Critical",        val: criticalCount,  sub: "Immediate action", Icon: Flame,       grad: `linear-gradient(135deg, ${dRED}, #FF6688)`,   valColor: dRED,    glow: "rgba(255,51,85,0.12)", shadow: "0 4px 14px rgba(255,51,85,0.26)" },
          { key: "WARNING" as FilterTab,    label: "Warning",         val: warningCount,   sub: "Monitor closely",  Icon: Bell,        grad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`,  valColor: dGOLD,   glow: "rgba(255,170,0,0.12)", shadow: "0 4px 14px rgba(255,170,0,0.24)" },
          { key: "All" as FilterTab,        label: "New This Week",   val: newThisWeek,    sub: "Since Monday",     Icon: UserPlus,    grad: `linear-gradient(135deg, ${dB1}, ${dB2})`,      valColor: dB1,     glow: "rgba(0,85,255,0.10)",  shadow: "0 4px 14px rgba(0,85,255,0.26)" },
          { key: "MONITORING" as FilterTab, label: "Monitoring",      val: monitoringCount, sub: "Under watch",     Icon: ShieldAlert, grad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, valColor: dGREEN_D, glow: "rgba(0,200,83,0.10)",  shadow: "0 4px 14px rgba(0,200,83,0.22)" },
        ].map(({ key, label, val, sub, Icon, grad, valColor, glow, shadow }) => (
          <button key={label}
            onClick={() => setFilterTab(key)}
            className="bg-white rounded-[20px] p-5 relative overflow-hidden text-left transition-transform hover:scale-[1.02]"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${filterTab === key ? valColor + "66" : dSEP}` }}>
            <div className="absolute -top-6 -right-6 w-[100px] h-[100px] rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }} />
            <div className="flex items-center justify-between mb-4 relative">
              <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>{label}</span>
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: grad, boxShadow: shadow }}>
                <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
            </div>
            <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: valColor, letterSpacing: "-1.2px" }}>
              {loading ? "—" : val}
            </p>
            <p className="text-[11px] font-semibold" style={{ color: dT3 }}>{sub}</p>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mt-5">
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
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(s => {
            const theme = levelThemeD(s.riskLevel);
            return (
              <div key={s.id} className="bg-white rounded-[20px] overflow-hidden relative"
                style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: theme.grad }} />

                {/* Header row */}
                <button onClick={() => setSelectedStudent(s)}
                  className="w-full flex items-center gap-4 pl-6 pr-5 pt-5 pb-4 text-left hover:bg-[#F8FAFF] transition-colors"
                  style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                  <div className="w-[52px] h-[52px] rounded-[16px] flex items-center justify-center text-[17px] font-bold text-white shrink-0"
                    style={{ background: theme.grad, boxShadow: theme.shadow }}>
                    {getInitialsD(s.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <div className="text-[15px] font-bold truncate" style={{ color: dT1, letterSpacing: "-0.2px" }}>{s.name}</div>
                      <span className="px-[10px] py-[4px] rounded-full text-[9px] font-bold uppercase tracking-[0.08em] text-white"
                        style={{ background: theme.grad, boxShadow: `0 2px 6px ${theme.color}44` }}>
                        {s.riskLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: dT3 }}>
                      <Users className="w-[11px] h-[11px]" strokeWidth={2.5} />
                      {s.className || "—"}
                      {s.attPct !== null && ` · Att: ${s.attPct}%`}
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                    style={{ background: theme.color, boxShadow: `0 0 0 3px ${theme.color}33` }} />
                </button>

                {/* Meta grid */}
                <div className="grid grid-cols-4">
                  {[
                    { label: "Risk Level", val: s.riskLevel.charAt(0) + s.riskLevel.slice(1).toLowerCase(), color: theme.color },
                    { label: "Days Flagged", val: s.daysFlagged > 0 ? `${s.daysFlagged}d` : "Today", color: s.daysFlagged >= 10 ? dRED : s.daysFlagged >= 5 ? dORANGE : dT1 },
                    { label: "Factors", val: String(s.riskFactors.length), color: dT1 },
                    { label: "Assigned", val: s.assignedTo && s.assignedTo !== "—" ? s.assignedTo.split(" ")[0] : "—", color: s.assignedTo && s.assignedTo !== "—" ? dT1 : dT4 },
                  ].map((cell, i, arr) => (
                    <div key={cell.label} className="px-4 py-3"
                      style={{ borderRight: i < arr.length - 1 ? `0.5px solid ${dSEP}` : undefined, borderBottom: `0.5px solid ${dSEP}` }}>
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-[5px]" style={{ color: dT4 }}>{cell.label}</div>
                      <div className="text-[14px] font-bold truncate" style={{ color: cell.color, letterSpacing: "-0.1px" }}>{cell.val}</div>
                    </div>
                  ))}
                </div>

                {/* Risk factors chips */}
                {s.riskFactors.length > 0 && (
                  <div className="px-6 py-3 flex flex-wrap gap-1.5" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                    {s.riskFactors.slice(0, 4).map((f, i) => (
                      <span key={i} className="inline-flex items-center px-[10px] py-[4px] rounded-full text-[10px] font-bold"
                        style={{ background: dRED_S, color: dRED, border: `0.5px solid ${dRED_B}` }}>
                        {f}
                      </span>
                    ))}
                    {s.riskFactors.length > 4 && (
                      <span className="inline-flex items-center px-[10px] py-[4px] rounded-full text-[10px] font-bold"
                        style={{ background: dBG2, color: dT3 }}>
                        +{s.riskFactors.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Score strip */}
                <div className="grid grid-cols-3">
                  {[
                    { label: "Avg Score", val: s.avgScore != null ? `${s.avgScore}%` : "—", color: s.avgScore != null && s.avgScore < 40 ? dRED : s.avgScore != null && s.avgScore < 55 ? dORANGE : dGREEN_D, pct: s.avgScore ?? 0 },
                    { label: "Attendance", val: s.attPct != null ? `${s.attPct}%` : "—", color: s.attPct != null && s.attPct >= 85 ? dGREEN_D : s.attPct != null && s.attPct >= 70 ? dORANGE : dRED, pct: s.attPct ?? 0 },
                    { label: "Last Action", val: s.lastAction && s.lastAction !== "—" ? s.lastAction : "None yet", color: s.lastAction && s.lastAction !== "—" ? dT1 : dT4, pct: 0, isText: true },
                  ].map((cell, i, arr) => (
                    <div key={cell.label} className="px-4 py-3"
                      style={{ borderRight: i < arr.length - 1 ? `0.5px solid ${dSEP}` : undefined, borderBottom: `0.5px solid ${dSEP}` }}>
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-1" style={{ color: dT4 }}>{cell.label}</div>
                      <div className={`${cell.isText ? "text-[13px]" : "text-[20px]"} font-bold leading-none ${cell.isText ? "mb-0 truncate" : "mb-1.5"}`}
                        style={{ color: cell.color, letterSpacing: "-0.3px" }}>{cell.val}</div>
                      {!cell.isText && (
                        <div className="h-1 rounded-[2px]" style={{ background: dBG2 }}>
                          <div className="h-full rounded-[2px]" style={{ width: `${Math.min(100, Math.max(0, cell.pct))}%`, background: cell.color }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-4">
                  <button onClick={() => setMeetingStudent(s)}
                    className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] font-bold text-white transition-transform hover:scale-[1.02] relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: dSH_BTN }}>
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 52%)" }} />
                    <CalendarPlus className="w-[13px] h-[13px] relative z-10" strokeWidth={2.3} />
                    <span className="relative z-10">Schedule Meet</span>
                  </button>
                  <button onClick={() => setSelectedStudent(s)}
                    className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] font-bold text-white transition-transform hover:scale-[1.02]"
                    style={{ background: "linear-gradient(135deg, #001040, #001888)", boxShadow: "0 4px 14px rgba(0,8,64,0.26)" }}>
                    <ArrowRight className="w-[13px] h-[13px]" strokeWidth={2.3} />
                    View Intervention
                  </button>
                  <button onClick={() => navigate("/parent-communication")}
                    className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
                    style={{ border: `0.5px solid ${dSEP}`, color: dT2, boxShadow: dSH }}>
                    <MessageSquare className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
                    Notify Parent
                  </button>
                </div>
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
                { label: "Send alert to parent", sub: "Low priority · Optional", Icon: MessageSquare, grad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, onClick: () => navigate("/parent-communication") },
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
    </div>
  );
};


export default RiskStudents;
