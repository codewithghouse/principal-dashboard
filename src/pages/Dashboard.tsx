import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Heart, Users, GraduationCap, CalendarCheck, AlertCircle,
  ArrowUp, ArrowDown, Star, ChevronRight,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import DashboardMobile from "@/components/dashboard/DashboardMobile";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RiskAlert {
  id: string;
  name: string;
  detail: string;
  level: "CRITICAL" | "WARNING";
  dot: string;
  badge: string;
  rowBg: string;
}

interface TrendPoint { day: number; v: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-700", "bg-green-600", "bg-amber-500",
  "bg-purple-600", "bg-rose-600", "bg-teal-600",
];

const getInitials = (name: string) =>
  name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

const getAvatarColor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

/** Normalize any date field to "YYYY-MM-DD" string */
const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return "";
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const daysAgoStr = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const relativeTime = (ts: any): string => {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const heatColor = (avg: number | null) => {
  if (avg === null) return "bg-slate-200";
  if (avg >= 75) return "bg-green-500";
  if (avg >= 55) return "bg-amber-400";
  return "bg-red-500";
};

const healthLabel = (idx: number | null) =>
  idx === null ? "Loading" : idx >= 80 ? "Good" : idx >= 65 ? "Average" : "At Risk";

// ─────────────────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mobileTab = ((searchParams.get("tab") as "home" | "analytics" | "teachers") || "home");

  // ── Stats ──────────────────────────────────────────────────────────────────
  const [studentCount,    setStudentCount]    = useState<number | null>(null);
  const [teacherCount,    setTeacherCount]    = useState<number | null>(null);
  const [attendanceToday, setAttendanceToday] = useState<number | null>(null);
  const [attendanceDelta, setAttendanceDelta] = useState<number | null>(null);
  const [pendingIncidents,setPendingIncidents]= useState<number | null>(null);

  // ── Health index ───────────────────────────────────────────────────────────
  const [healthIndex, setHealthIndex] = useState<number | null>(null);
  const [healthDelta, setHealthDelta] = useState<number | null>(null);

  // ── Sections ───────────────────────────────────────────────────────────────
  const [trendData,    setTrendData]    = useState<TrendPoint[]>([]);
  const [riskAlerts,   setRiskAlerts]   = useState<RiskAlert[]>([]);
  const [teacherRows,  setTeacherRows]  = useState<{ ini: string; name: string; subject: string; rating: number; bg: string }[]>([]);
  const [heatmapCells, setHeatmapCells] = useState<{ cls: string; color: string; avg: number | null }[]>([]);
  const [urgentComms,  setUrgentComms]  = useState<{ id: string; title: string; from: string; time: string; border: string }[]>([]);

  // ── Cross-listener refs ────────────────────────────────────────────────────
  // Refs let each listener compute derived values using the latest data from
  // other listeners without creating stale-closure issues.
  const attRisksRef    = useRef<RiskAlert[]>([]);
  const incRisksRef    = useRef<RiskAlert[]>([]);
  const resRisksRef    = useRef<RiskAlert[]>([]);
  const avgScoreRef    = useRef<number | null>(null);  // updated by results listener
  const attTodayRef    = useRef<number | null>(null); // updated by attendance listener
  const pendingIncRef  = useRef<number | null>(null); // updated by incidents listener

  // ── Derived helpers (stable refs, no stale closures) ──────────────────────

  const mergeRisks = useCallback(() => {
    const all = [
      ...attRisksRef.current,
      ...incRisksRef.current,
      ...resRisksRef.current,
    ];
    const seen = new Set<string>();
    const unique = all.filter(a => !seen.has(a.id) && (seen.add(a.id), true));
    setRiskAlerts(unique.slice(0, 5));
  }, []);

  const computeHealthIndex = useCallback(() => {
    const att = attTodayRef.current;
    const score = avgScoreRef.current;
    if (att === null || score === null) return;
    const safety = Math.max(0, 100 - (pendingIncRef.current ?? 0) * 8);
    const idx = Math.round((att * 0.45 + score * 0.35 + safety * 0.20) * 10) / 10;
    setHealthIndex(idx);
  }, []);

  // ── Firestore listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userData?.schoolId) return;

    // Base constraints applied to every query
    const C = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) C.push(where("branchId", "==", userData.branchId));

    const unsubs: (() => void)[] = [];

    // ── 1. Enrollments → total student count ──────────────────────────────
    unsubs.push(onSnapshot(
      query(collection(db, "enrollments"), ...C),
      snap => {
        const unique = new Set(snap.docs.map(d => d.data().studentId));
        setStudentCount(unique.size || snap.size);
      },
      () => setStudentCount(0),
    ));

    // ── 2. Teachers → count + performance rows ─────────────────────────────
    unsubs.push(onSnapshot(
      query(collection(db, "teachers"), ...C),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const active = docs.filter(t => t.status === "Active" || t.isActive !== false);
        setTeacherCount(active.length || docs.length);

        const rows = [...docs]
          .filter(t => t.name)
          .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
          .slice(0, 3)
          .map(t => ({
            ini: getInitials(t.name),
            name: t.name as string,
            subject: (t.subject || "General") as string,
            rating: Math.round(Number(t.rating || 0) * 10) / 10,
            bg: getAvatarColor(t.name),
          }));
        setTeacherRows(rows);
      },
      () => setTeacherCount(0),
    ));

    // ── 3. Attendance (last 30 days) → rate, trend, attendance risk alerts ─
    // Server-side date filter prevents downloading entire attendance history.
    // Requires composite index: attendance (schoolId ASC, date ASC)
    // and (schoolId ASC, branchId ASC, date ASC). Deploy via firestore.indexes.json.
    const attCutoff = daysAgoStr(30);
    unsubs.push(onSnapshot(
      query(collection(db, "attendance"), ...C, where("date", ">=", attCutoff)),
      snap => {
        const records = snap.docs.map(d => d.data()); // already ≤30 days from server
        const today = todayStr();
        const yesterday = daysAgoStr(1);

        // Today's rate
        const todayRecs = records.filter(r => toDateStr(r.date) === today);
        const presentToday = todayRecs.filter(r => r.status === "present" || r.status === "late").length;
        const todayRate = todayRecs.length > 0
          ? Math.round((presentToday / todayRecs.length) * 100)
          : null;
        attTodayRef.current = todayRate;
        setAttendanceToday(todayRate);

        // Delta vs yesterday
        const yestRecs = records.filter(r => toDateStr(r.date) === yesterday);
        const presentYest = yestRecs.filter(r => r.status === "present" || r.status === "late").length;
        const yestRate = yestRecs.length > 0
          ? Math.round((presentYest / yestRecs.length) * 100)
          : null;
        setAttendanceDelta(
          todayRate !== null && yestRate !== null ? todayRate - yestRate : null,
        );

        // 30-day trend — one point per day
        const byDate: Record<string, { p: number; t: number }> = {};
        records.forEach(r => {
          const d = toDateStr(r.date);
          if (!d) return;
          if (!byDate[d]) byDate[d] = { p: 0, t: 0 };
          byDate[d].t++;
          if (r.status === "present" || r.status === "late") byDate[d].p++;
        });
        const trend: TrendPoint[] = [];
        for (let i = 29; i >= 0; i--) {
          const d = daysAgoStr(i);
          const e = byDate[d];
          if (e && e.t > 0) {
            trend.push({ day: 30 - i, v: Math.round((e.p / e.t) * 1000) / 10 });
          }
        }
        if (trend.length > 0) {
          setTrendData(trend);
          // Health delta: last 7 days avg vs 7 days before
          if (trend.length >= 14) {
            const last7  = trend.slice(-7).reduce((s, p) => s + p.v, 0) / 7;
            const prev7  = trend.slice(-14, -7).reduce((s, p) => s + p.v, 0) / 7;
            setHealthDelta(Math.round((last7 - prev7) * 10) / 10);
          }
        }

        // Attendance-based risk: students < 70% in last 30 days (min 5 records)
        const studentMap: Record<string, { name: string; cls: string; p: number; t: number }> = {};
        records.forEach(r => {
          if (!r.studentId) return;
          if (!studentMap[r.studentId])
            studentMap[r.studentId] = { name: r.studentName || "Student", cls: r.className || "", p: 0, t: 0 };
          studentMap[r.studentId].t++;
          if (r.status === "present" || r.status === "late") studentMap[r.studentId].p++;
        });
        attRisksRef.current = Object.entries(studentMap)
          .map(([id, s]) => ({ id, ...s, rate: Math.round((s.p / s.t) * 100) }))
          .filter(s => s.t >= 5 && s.rate < 70)
          .sort((a, b) => a.rate - b.rate)
          .slice(0, 2)
          .map(s => ({
            id: `att_${s.id}`,
            name: s.cls ? `${s.name} – ${s.cls}` : s.name,
            detail: `Attendance ${s.rate}% – At risk`,
            level: s.rate < 50 ? "CRITICAL" as const : "WARNING" as const,
            dot:   s.rate < 50 ? "#ef4444" : "#f59e0b",
            badge: s.rate < 50 ? "bg-red-500" : "bg-amber-500",
            rowBg: s.rate < 50 ? "bg-red-50/60" : "",
          }));
        mergeRisks();
        computeHealthIndex();
      },
      (err) => console.error("[Attendance listener]", err),
    ));

    // ── 4. Incidents → pending count + incident risk alerts ────────────────
    unsubs.push(onSnapshot(
      query(collection(db, "incidents"), ...C),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const pending = docs.filter(d =>
          !d.status || d.status === "open" || d.status === "pending",
        );
        pendingIncRef.current = pending.length;
        setPendingIncidents(pending.length);

        incRisksRef.current = docs
          .filter(d => d.severity === "critical" || d.severity === "high")
          .sort((a, b) => toDateStr(b.date || b.createdAt).localeCompare(toDateStr(a.date || a.createdAt)))
          .slice(0, 2)
          .map(d => ({
            id: `inc_${d.id}`,
            name: d.student?.name || d.studentName || d.title || "Incident",
            detail: d.title || d.incidentType || d.type || "Discipline issue",
            level: d.severity === "critical" ? "CRITICAL" as const : "WARNING" as const,
            dot:   d.severity === "critical" ? "#ef4444" : "#f59e0b",
            badge: d.severity === "critical" ? "bg-red-500" : "bg-amber-500",
            rowBg: d.severity === "critical" ? "bg-red-50/60" : "",
          }));
        mergeRisks();
        computeHealthIndex();
      },
      () => setPendingIncidents(0),
    ));

    // ── 5. Results → class heatmap + low-performance risk alerts ──────────
    unsubs.push(onSnapshot(
      query(collection(db, "results"), ...C),
      snap => {
        const docs = snap.docs.map(d => d.data());

        // Class heatmap
        const classMap: Record<string, { sum: number; count: number }> = {};
        let totalSum = 0, totalCount = 0;
        docs.forEach(d => {
          const cls = (d.className || d.classId || "Unknown") as string;
          const score = Number(d.score ?? d.percentage ?? 0);
          if (!classMap[cls]) classMap[cls] = { sum: 0, count: 0 };
          classMap[cls].sum   += score;
          classMap[cls].count += 1;
          totalSum   += score;
          totalCount += 1;
        });
        const cells = Object.entries(classMap)
          .map(([cls, v]) => ({
            cls,
            avg: v.count > 0 ? Math.round(v.sum / v.count) : null,
          }))
          .sort((a, b) => a.cls.localeCompare(b.cls, undefined, { numeric: true }))
          .slice(0, 12) // cap at 12 cells for heatmap layout
          .map(c => ({ cls: c.cls, color: heatColor(c.avg), avg: c.avg }));
        setHeatmapCells(cells);

        // Overall avg for health index
        if (totalCount > 0) {
          avgScoreRef.current = Math.round(totalSum / totalCount);
          computeHealthIndex();
        }

        // Low-score student risk alerts (avg < 50%)
        const studentScores: Record<string, { name: string; cls: string; scores: number[] }> = {};
        docs.forEach(d => {
          if (!d.studentId) return;
          if (!studentScores[d.studentId])
            studentScores[d.studentId] = { name: d.studentName || "Student", cls: d.className || "", scores: [] };
          studentScores[d.studentId].scores.push(Number(d.score ?? d.percentage ?? 0));
        });
        resRisksRef.current = Object.entries(studentScores)
          .map(([id, s]) => ({
            id,
            name: s.name,
            cls: s.cls,
            avg: s.scores.length > 0 ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0,
          }))
          .filter(s => s.avg < 50)
          .sort((a, b) => a.avg - b.avg)
          .slice(0, 2)
          .map(s => ({
            id: `res_${s.id}`,
            name: s.cls ? `${s.name} – ${s.cls}` : s.name,
            detail: `Avg score ${s.avg}% – Below passing`,
            level: s.avg < 35 ? "CRITICAL" as const : "WARNING" as const,
            dot:   s.avg < 35 ? "#ef4444" : "#f59e0b",
            badge: s.avg < 35 ? "bg-red-500" : "bg-amber-500",
            rowBg: s.avg < 35 ? "bg-red-50/60" : "",
          }));
        mergeRisks();
      },
      () => {},
    ));

    // ── 6. Communications → urgent unread messages ─────────────────────────
    unsubs.push(onSnapshot(
      query(collection(db, "communications"), ...C),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const urgent = docs
          .filter(d => d.unread === true || d.status === "pending" || d.status === "unread")
          .sort((a, b) => {
            const at = a.createdAt?.toMillis?.() ?? 0;
            const bt = b.createdAt?.toMillis?.() ?? 0;
            return bt - at;
          })
          .slice(0, 4)
          .map(d => ({
            id: d.id as string,
            title: (d.title || d.subject || d.category || "Message") as string,
            from:  (d.senderName || d.from || d.senderType || "Parent") as string,
            time:  relativeTime(d.createdAt),
            border: d.priority === "high" || d.type === "complaint"
              ? "border-l-red-500"
              : "border-l-amber-400",
          }));
        setUrgentComms(urgent);
      },
      () => {},
    ));

    return () => unsubs.forEach(u => u());
  }, [userData?.schoolId, userData?.branchId, mergeRisks, computeHealthIndex]);

  // ── Derived display values ─────────────────────────────────────────────────

  const displayHealth = healthIndex !== null ? healthIndex.toFixed(1) : "--";
  const displayStudents = studentCount !== null ? studentCount.toLocaleString() : "--";
  const displayTeachers = teacherCount !== null ? teacherCount : "--";
  const displayAttendance = attendanceToday !== null ? `${attendanceToday}%` : "--";
  const displayIncidents = pendingIncidents !== null ? pendingIncidents : "--";

  // ─────────────────────────────────────────────────────────────────────────

  // ── Mobile view ───────────────────────────────────────────────────────────
  // Renders a tab-based mobile layout. Desktop view below stays untouched.
  if (isMobile) {
    return (
      <div className="animate-in fade-in duration-500">
        <DashboardMobile
          activeTab={mobileTab}
          displayHealth={displayHealth}
          healthIndex={healthIndex}
          healthDelta={healthDelta}
          displayStudents={displayStudents}
          displayTeachers={displayTeachers}
          displayAttendance={displayAttendance}
          attendanceDelta={attendanceDelta}
          displayIncidents={displayIncidents}
          pendingIncidents={pendingIncidents}
          trendData={trendData}
          riskAlerts={riskAlerts}
          teacherRows={teacherRows}
          heatmapCells={heatmapCells}
          urgentComms={urgentComms}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP — Blue Apple Design (matches mobile language)
  // ═══════════════════════════════════════════════════════════════
  const dB1 = "#0055FF", dB2 = "#1166FF", dB4 = "#4499FF";
  const dBG = "#EEF4FF", dBG2 = "#E0ECFF";
  const dT1 = "#001040", dT3 = "#5070B0", dT4 = "#99AACC";
  const dSEP = "rgba(0,85,255,0.08)";
  const dGREEN = "#00C853", dGREEN_D = "#007830", dGREEN_S = "rgba(0,200,83,0.10)", dGREEN_B = "rgba(0,200,83,0.22)";
  const dRED = "#FF3355", dRED_S = "rgba(255,51,85,0.10)", dRED_B = "rgba(255,51,85,0.22)";
  const dORANGE = "#FF8800", dORANGE_S = "rgba(255,136,0,0.10)", dORANGE_B = "rgba(255,136,0,0.22)";
  const dGOLD = "#FFAA00";
  const dVIOLET = "#7B3FF4";
  const dSH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const dSH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";

  const healthLabelText = healthLabel(healthIndex);
  const healthTier = healthIndex === null ? dT3 : healthIndex >= 80 ? dGREEN : healthIndex >= 65 ? dGOLD : dRED;

  return (
    <div className="pb-10 max-w-[1400px] mx-auto px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pt-2 pb-5">
        <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
          <Heart className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Principal Dashboard</div>
          <div className="text-[12px] mt-1" style={{ color: dT3 }}>Real-time school intelligence overview</div>
        </div>
      </div>

      {/* ── Academic Health Hero ──────────────────────────────────────────────── */}
      <div onClick={() => navigate("/student-intelligence")}
        role="button" tabIndex={0}
        className="rounded-[22px] px-7 py-6 flex flex-wrap items-center justify-between gap-5 text-white relative overflow-hidden cursor-pointer"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }} />

        <div className="flex items-center gap-5 relative z-10">
          <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
            <Heart className="w-7 h-7 text-white animate-pulse" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>
              Academic Health Index
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-[52px] font-bold tracking-tight leading-none">{displayHealth}</span>
              <span className="text-lg font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>/100</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-7 relative z-10">
          {healthDelta !== null && (
            <div className="text-right">
              <div className={`flex items-center gap-1.5 justify-end`} style={{ color: healthDelta >= 0 ? "#66EE88" : "#FF88AA" }}>
                {healthDelta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                <span className="text-2xl font-bold tracking-tight">{Math.abs(healthDelta)}%</span>
              </div>
              <p className="text-[11px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>vs Last 7 Days</p>
            </div>
          )}
          {healthDelta !== null && <div className="w-px h-10" style={{ background: "rgba(255,255,255,0.20)" }} />}
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">{healthLabelText}</p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Overall Status</p>
          </div>
        </div>
      </div>

      {/* ── 4 Bright Stat Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">

        {/* Students — blue */}
        <div onClick={() => navigate("/students")}
          role="button" tabIndex={0}
          className="bg-white rounded-[20px] p-5 relative overflow-hidden cursor-pointer"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="absolute -top-6 -right-6 w-[90px] h-[90px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(0,85,255,0.10) 0%, transparent 70%)" }} />
          <div className="flex items-center justify-between mb-4 relative">
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>Total Students</span>
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.28)" }}>
              <Users className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
            </div>
          </div>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: dB1, letterSpacing: "-1.2px" }}>{displayStudents}</p>
          <p className="text-[11px] font-semibold" style={{ color: dT3 }}>Enrolled this branch</p>
        </div>

        {/* Teachers — green */}
        <div onClick={() => navigate("/teachers")}
          role="button" tabIndex={0}
          className="bg-white rounded-[20px] p-5 relative overflow-hidden cursor-pointer"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="absolute -top-6 -right-6 w-[90px] h-[90px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(0,200,83,0.10) 0%, transparent 70%)" }} />
          <div className="flex items-center justify-between mb-4 relative">
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>Teachers</span>
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, boxShadow: "0 4px 14px rgba(0,200,83,0.26)" }}>
              <GraduationCap className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
            </div>
          </div>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: dGREEN_D, letterSpacing: "-1.2px" }}>{displayTeachers}</p>
          <p className="text-[11px] font-semibold" style={{ color: dGREEN_D }}>Active staff</p>
        </div>

        {/* Attendance — gold */}
        <div onClick={() => navigate("/attendance")}
          role="button" tabIndex={0}
          className="bg-white rounded-[20px] p-5 relative overflow-hidden cursor-pointer"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="absolute -top-6 -right-6 w-[90px] h-[90px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,170,0,0.12) 0%, transparent 70%)" }} />
          <div className="flex items-center justify-between mb-4 relative">
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>Today's Attendance</span>
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`, boxShadow: "0 4px 14px rgba(255,170,0,0.28)" }}>
              <CalendarCheck className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
            </div>
          </div>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: dGOLD, letterSpacing: "-1.2px" }}>{displayAttendance}</p>
          {attendanceDelta !== null ? (
            <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: attendanceDelta >= 0 ? dGREEN_D : dRED }}>
              {attendanceDelta >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {Math.abs(attendanceDelta)}% vs yesterday
            </p>
          ) : (
            <p className="text-[11px] font-semibold" style={{ color: dT3 }}>No data yet</p>
          )}
        </div>

        {/* Incidents — red/violet */}
        <div onClick={() => navigate("/discipline")}
          role="button" tabIndex={0}
          className="bg-white rounded-[20px] p-5 relative overflow-hidden cursor-pointer"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="absolute -top-6 -right-6 w-[90px] h-[90px] rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${(pendingIncidents ?? 0) > 0 ? "rgba(255,51,85,0.12)" : "rgba(123,63,244,0.10)"} 0%, transparent 70%)` }} />
          <div className="flex items-center justify-between mb-4 relative">
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>Pending Incidents</span>
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
              style={{
                background: (pendingIncidents ?? 0) > 0 ? `linear-gradient(135deg, ${dRED}, #FF6688)` : `linear-gradient(135deg, ${dVIOLET}, #A07CF8)`,
                boxShadow: (pendingIncidents ?? 0) > 0 ? "0 4px 14px rgba(255,51,85,0.28)" : "0 4px 14px rgba(123,63,244,0.26)",
              }}>
              <AlertCircle className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
            </div>
          </div>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: (pendingIncidents ?? 0) > 0 ? dRED : dVIOLET, letterSpacing: "-1.2px" }}>
            {displayIncidents}
          </p>
          <p className="text-[11px] font-semibold" style={{ color: (pendingIncidents ?? 0) > 0 ? dRED : dT3 }}>
            {(pendingIncidents ?? 0) > 0 ? "Action required" : "All clear"}
          </p>
        </div>
      </div>

      {/* ── Risk Alerts + Attendance Trend ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">

        {/* Risk Alerts card */}
        <div onClick={() => navigate("/risk-students")}
          role="button" tabIndex={0}
          className="bg-white rounded-[20px] overflow-hidden flex flex-col cursor-pointer"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center gap-[10px]">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: dRED_S, border: `0.5px solid ${dRED_B}` }}>
                <AlertCircle className="w-4 h-4" style={{ color: dRED }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Today's Risk Alerts</h2>
            </div>
            <button className="text-[12px] font-bold flex items-center gap-0.5 transition-colors" style={{ color: dB1 }}>
              View All <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1">
            {riskAlerts.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="w-14 h-14 rounded-[16px] mx-auto mb-3 flex items-center justify-center"
                  style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}` }}>
                  <Heart className="w-6 h-6" style={{ color: dGREEN }} strokeWidth={2.2} />
                </div>
                <p className="text-[13px] font-bold" style={{ color: dT1 }}>No active risk alerts</p>
                <p className="text-[11px] mt-1" style={{ color: dT4 }}>All students are performing within acceptable range</p>
              </div>
            ) : (
              riskAlerts.map((a, idx) => {
                const isCrit = a.level === "CRITICAL";
                return (
                  <div key={a.id}
                    className="flex items-center justify-between px-6 py-4 hover:bg-[#F5F9FF] transition-colors cursor-pointer"
                    style={{ borderTop: idx > 0 ? `0.5px solid ${dSEP}` : undefined, background: isCrit ? "rgba(255,51,85,0.03)" : "transparent" }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-[10px] h-[10px] rounded-full shrink-0"
                        style={{ background: a.dot, boxShadow: `0 0 0 3px ${isCrit ? "rgba(255,51,85,0.15)" : "rgba(255,170,0,0.15)"}` }} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold truncate" style={{ color: dT1 }}>{a.name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: dT3 }}>{a.detail}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-[8px] shrink-0 ml-4 text-white"
                      style={{
                        background: isCrit ? `linear-gradient(135deg, ${dRED}, #FF6688)` : `linear-gradient(135deg, ${dGOLD}, #FFCC22)`,
                        color: isCrit ? "#fff" : "#884400",
                        boxShadow: isCrit ? "0 2px 8px rgba(255,51,85,0.26)" : "0 2px 8px rgba(255,170,0,0.24)",
                      }}>
                      {a.level}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Attendance Trend */}
        <div onClick={() => navigate("/attendance")}
          role="button" tabIndex={0}
          className="bg-white rounded-[20px] overflow-hidden cursor-pointer"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center gap-[10px]">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.20)" }}>
                <CalendarCheck className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Attendance Trend · 30 Days</h2>
            </div>
          </div>
          <div className="px-4 pt-5 pb-4">
            {trendData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center">
                <p className="text-[13px] font-bold" style={{ color: dT4 }}>No attendance data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={dB1} stopOpacity={0.30} />
                      <stop offset="95%" stopColor={dB1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,85,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: dT4, fontWeight: 600 }}
                    ticks={[1, 5, 10, 15, 20, 25, 30]}
                    dy={6}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: dT4, fontWeight: 600 }}
                    tickFormatter={v => `${v}%`}
                    dx={-4}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Attendance"]}
                    contentStyle={{ borderRadius: 12, border: `0.5px solid ${dSEP}`, boxShadow: dSH, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}
                    cursor={{ stroke: dB1, strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area type="monotone" dataKey="v" stroke={dB1} strokeWidth={2.5} fill="url(#attGrad)" dot={false}
                    activeDot={{ r: 5, fill: dB1, stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Class Heatmap + Teachers + Comms ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5 items-start">

        {/* Class Performance Heatmap */}
        <div onClick={() => navigate("/academics")}
          role="button" tabIndex={0}
          className="bg-white rounded-[20px] overflow-hidden cursor-pointer"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="flex items-center gap-[10px] px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(123,63,244,0.10)", border: "0.5px solid rgba(123,63,244,0.22)" }}>
              <Star className="w-4 h-4" style={{ color: dVIOLET }} strokeWidth={2.4} />
            </div>
            <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Class Performance Heatmap</h2>
          </div>
          <div className="p-6">
            {heatmapCells.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[13px] font-bold" style={{ color: dT1 }}>No results data yet</p>
                <p className="text-[11px] mt-1" style={{ color: dT4 }}>Heatmap will populate once exams are graded</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-6 gap-3 mb-6">
                  {heatmapCells.map(c => {
                    const avgNum = c.avg ?? 0;
                    const cellGrad = avgNum >= 75 ? `linear-gradient(135deg, ${dGREEN}, #22EE66)` :
                                     avgNum >= 55 ? `linear-gradient(135deg, ${dGOLD}, #FFDD44)` :
                                                    `linear-gradient(135deg, ${dRED}, #FF6688)`;
                    const cellShadow = avgNum >= 75 ? "0 4px 12px rgba(0,200,83,0.22)" :
                                       avgNum >= 55 ? "0 4px 12px rgba(255,170,0,0.22)" :
                                                      "0 4px 12px rgba(255,51,85,0.22)";
                    return (
                      <div key={c.cls} className="flex flex-col items-center gap-2">
                        <span className="text-[10px] font-bold" style={{ color: dT3 }}>{c.cls}</span>
                        <div className="w-full aspect-square rounded-[12px] flex items-center justify-center text-white text-[13px] font-bold"
                          style={{ background: c.avg === null ? dBG2 : cellGrad, boxShadow: c.avg === null ? "none" : cellShadow, letterSpacing: "-0.3px" }}>
                          {c.avg !== null ? `${c.avg}%` : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-5 pt-4" style={{ borderTop: `0.5px solid ${dSEP}` }}>
                  {[
                    { color: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, label: "Good (≥75%)" },
                    { color: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`, label: "Average (55–74%)" },
                    { color: `linear-gradient(135deg, ${dRED}, #FF6688)`, label: "Weak (<55%)" },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-[6px]">
                      <span className="w-3 h-3 rounded-[4px]" style={{ background: color }} />
                      <span className="text-[11px] font-semibold" style={{ color: dT3 }}>{label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">

          {/* Teacher Performance */}
          <div onClick={() => navigate("/teacher-performance")}
            role="button" tabIndex={0}
            className="bg-white rounded-[20px] overflow-hidden cursor-pointer"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center gap-[10px]">
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}` }}>
                  <GraduationCap className="w-4 h-4" style={{ color: dGREEN }} strokeWidth={2.4} />
                </div>
                <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Top Teachers</h2>
              </div>
              <button className="text-[12px] font-bold flex items-center gap-0.5" style={{ color: dB1 }}>
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5">
              {teacherRows.length === 0 ? (
                <p className="text-[13px] font-bold text-center py-6" style={{ color: dT4 }}>No teachers added yet</p>
              ) : (
                <div className="space-y-3">
                  {teacherRows.map(t => (
                    <div key={t.ini + t.name} className="flex items-center gap-3 py-1">
                      <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                        style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 3px 10px rgba(0,85,255,0.22)" }}>
                        {t.ini}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold truncate leading-tight" style={{ color: dT1 }}>{t.name}</p>
                        <p className="text-[11px] font-medium mt-0.5" style={{ color: dT3 }}>{t.subject}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 px-[10px] py-[5px] rounded-full"
                        style={{ background: "rgba(255,170,0,0.10)", border: "0.5px solid rgba(255,170,0,0.22)" }}>
                        <Star className="w-[13px] h-[13px]" style={{ color: dGOLD, fill: dGOLD }} />
                        <span className="text-[12px] font-bold" style={{ color: "#884400" }}>{t.rating}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Urgent Communications */}
          <div onClick={() => navigate("/parent-communication")}
            role="button" tabIndex={0}
            className="bg-white rounded-[20px] overflow-hidden cursor-pointer"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center gap-[10px]">
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: dORANGE_S, border: `0.5px solid ${dORANGE_B}` }}>
                  <AlertCircle className="w-4 h-4" style={{ color: dORANGE }} strokeWidth={2.4} />
                </div>
                <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Urgent Communications</h2>
              </div>
              {urgentComms.length > 0 && (
                <span className="text-[10px] font-bold px-3 py-[5px] rounded-full text-white"
                  style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 2px 8px rgba(255,51,85,0.26)" }}>
                  {urgentComms.length} New
                </span>
              )}
            </div>
            <div className="p-5">
              {urgentComms.length === 0 ? (
                <p className="text-[13px] font-bold text-center py-6" style={{ color: dT4 }}>No urgent messages</p>
              ) : (
                <div className="space-y-2.5">
                  {urgentComms.map(c => {
                    const isHigh = c.border.includes("red");
                    return (
                      <div key={c.id} className="rounded-[14px] px-4 py-3 transition-colors cursor-pointer hover:bg-[#F5F9FF]"
                        style={{
                          background: dBG,
                          borderLeft: `3px solid ${isHigh ? dRED : dGOLD}`,
                        }}>
                        <p className="text-[13px] font-bold leading-snug" style={{ color: dT1 }}>{c.title}</p>
                        <p className="text-[11px] font-medium mt-0.5" style={{ color: dT3 }}>
                          From: {c.from}{c.time ? ` · ${c.time}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Intelligence Card ──────────────────────────────────────────────── */}
      {(riskAlerts.length > 0 || healthIndex !== null) && (
        <div onClick={() => navigate("/reports")}
          role="button" tabIndex={0}
          className="mt-5 rounded-[22px] px-7 py-6 relative overflow-hidden cursor-pointer"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-2 mb-3 relative z-10">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Star className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI School Intelligence</span>
          </div>
          <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
            School is operating at <strong style={{ color: "#fff", fontWeight: 700 }}>{displayHealth}/100 health</strong>
            {healthLabelText !== "Loading" && <> · <strong style={{ color: "#fff", fontWeight: 700 }}>{healthLabelText}</strong> tier</>}.
            {riskAlerts.length > 0 && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{riskAlerts.length} student{riskAlerts.length === 1 ? "" : "s"}</strong> flagged for immediate attention.</>}
            {attendanceToday !== null && <> Today's attendance at <strong style={{ color: "#fff", fontWeight: 700 }}>{attendanceToday}%</strong>{attendanceDelta !== null ? ` (${attendanceDelta >= 0 ? "+" : ""}${attendanceDelta}% vs yesterday)` : ""}.</>}
            {" "}Review risk alerts and urgent communications to maintain momentum.
          </p>
          <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
            <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: dB4 }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated · Real-time data</span>
          </div>
        </div>
      )}

    </div>
  );

};

export default Dashboard;
