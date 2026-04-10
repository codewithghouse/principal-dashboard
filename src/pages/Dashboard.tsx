import { useState, useEffect, useRef, useCallback } from "react";
import {
  Heart, Users, GraduationCap, CalendarCheck, AlertCircle,
  ArrowUp, ArrowDown, Star, ChevronRight,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

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
  const [heatmapCells, setHeatmapCells] = useState<{ cls: string; color: string }[]>([]);
  const [urgentComms,  setUrgentComms]  = useState<{ id: string; title: string; from: string; time: string; border: string }[]>([]);

  // ── Cross-listener refs ────────────────────────────────────────────────────
  // Refs let each listener compute derived values using the latest data from
  // other listeners without creating stale-closure issues.
  const attRisksRef    = useRef<RiskAlert[]>([]);
  const incRisksRef    = useRef<RiskAlert[]>([]);
  const resRisksRef    = useRef<RiskAlert[]>([]);
  const avgScoreRef    = useRef<number>(78);        // updated by results listener
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
    if (att === null) return;
    const safety = Math.max(0, 100 - (pendingIncRef.current ?? 0) * 8);
    const idx = Math.round((att * 0.45 + avgScoreRef.current * 0.35 + safety * 0.20) * 10) / 10;
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
    // Requires Firestore composite index: attendance (schoolId, date ASC)
    // or (schoolId, branch, date ASC). Create in Firebase Console if missing.
    unsubs.push(onSnapshot(
      query(collection(db, "attendance"), ...C),
      snap => {
        const cutoff = daysAgoStr(30);
        const records = snap.docs.map(d => d.data()).filter(r => toDateStr(r.date) >= cutoff);
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
          .map(c => ({ cls: c.cls, color: heatColor(c.avg) }));
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

  return (
    <div className="space-y-5 pb-10 animate-in fade-in duration-500">

      {/* ── Academic Health Banner ───────────────────────────────────────────── */}
      <div className="bg-[#1e3a8a] rounded-2xl px-4 sm:px-7 py-5 sm:py-6 flex flex-wrap items-center justify-between gap-4 sm:gap-5 text-white relative overflow-hidden shadow-lg">
        {/* Decorative blobs */}
        <div className="absolute -right-10 -top-10 w-56 h-56 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute right-40 -bottom-8 w-36 h-36 bg-white/5 rounded-full pointer-events-none" />

        {/* Left — score */}
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-13 h-13 rounded-xl bg-white/10 flex items-center justify-center shrink-0 p-3">
            <Heart className="w-7 h-7 text-white animate-pulse" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50 mb-1">
              Academic Health Index
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-5xl font-black tracking-tight leading-none">{displayHealth}</span>
              <span className="text-lg font-bold text-white/30">/100</span>
            </div>
          </div>
        </div>

        {/* Right — trend + status */}
        <div className="flex items-center gap-7 relative z-10">
          {healthDelta !== null && (
            <div className="text-right">
              <div className={`flex items-center gap-1.5 justify-end ${healthDelta >= 0 ? "text-green-400" : "text-red-400"}`}>
                {healthDelta >= 0
                  ? <ArrowUp className="w-4 h-4" />
                  : <ArrowDown className="w-4 h-4" />}
                <span className="text-2xl font-black tracking-tight">{Math.abs(healthDelta)}%</span>
              </div>
              <p className="text-[11px] font-medium text-white/45 mt-0.5">vs Last 7 Days</p>
            </div>
          )}
          {healthDelta !== null && <div className="w-px h-10 bg-white/20 hidden sm:block" />}
          <div className="text-right hidden sm:block">
            <p className="text-2xl font-black tracking-tight">{healthLabel(healthIndex)}</p>
            <p className="text-[11px] font-medium text-white/45 mt-0.5">Overall Status</p>
          </div>
        </div>
      </div>

      {/* ── 4 Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">

        {/* Total Students */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Total Students</span>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-indigo-600" />
            </div>
          </div>
          <p className="text-[2.5rem] font-black tracking-tight text-foreground leading-none mb-2">{displayStudents}</p>
          <p className="text-xs font-semibold text-muted-foreground">Enrolled this branch</p>
        </div>

        {/* Teachers */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Teachers</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <GraduationCap className="w-4.5 h-4.5 text-emerald-600" />
            </div>
          </div>
          <p className="text-[2.5rem] font-black tracking-tight text-foreground leading-none mb-2">{displayTeachers}</p>
          <p className="text-xs font-semibold text-emerald-500">Active staff</p>
        </div>

        {/* Attendance */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Today's Attendance</span>
            <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
              <CalendarCheck className="w-4.5 h-4.5 text-orange-500" />
            </div>
          </div>
          <p className="text-[2.5rem] font-black tracking-tight text-foreground leading-none mb-2">{displayAttendance}</p>
          {attendanceDelta !== null ? (
            <p className={`text-xs font-semibold flex items-center gap-1 ${attendanceDelta >= 0 ? "text-green-500" : "text-red-500"}`}>
              {attendanceDelta >= 0
                ? <ArrowUp className="w-3 h-3" />
                : <ArrowDown className="w-3 h-3" />}
              {Math.abs(attendanceDelta)}% vs yesterday
            </p>
          ) : (
            <p className="text-xs font-semibold text-muted-foreground">No data yet</p>
          )}
        </div>

        {/* Pending Incidents */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Pending Incidents</span>
            <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-4.5 h-4.5 text-red-500" />
            </div>
          </div>
          <p className={`text-[2.5rem] font-black tracking-tight leading-none mb-2 ${(pendingIncidents ?? 0) > 0 ? "text-red-500" : "text-foreground"}`}>
            {displayIncidents}
          </p>
          <p className={`text-xs font-semibold ${(pendingIncidents ?? 0) > 0 ? "text-red-500" : "text-muted-foreground"}`}>
            {(pendingIncidents ?? 0) > 0 ? "Action required" : "All clear"}
          </p>
        </div>
      </div>

      {/* ── Risk Alerts + Attendance Trend ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Today's Risk Alerts */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Today's Risk Alerts</h2>
            <button className="text-xs font-semibold text-[#1e3a8a] hover:text-[#1e4fc0] flex items-center gap-0.5 transition-colors">
              View All <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 divide-y divide-border/60">
            {riskAlerts.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">No active risk alerts</p>
                <p className="text-xs text-muted-foreground/60 mt-1">All students are performing within acceptable range</p>
              </div>
            ) : (
              riskAlerts.map(a => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between px-6 py-4 ${a.rowBg} hover:bg-muted/30 transition-colors duration-150`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.dot }} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                    </div>
                  </div>
                  <span className={`${a.badge} text-white text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-md shrink-0 ml-4`}>
                    {a.level}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Attendance Trend */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Attendance Trend (Last 30 Days)</h2>
          </div>
          <div className="px-4 pt-5 pb-4">
            {trendData.length === 0 ? (
              <div className="h-[188px] flex items-center justify-center">
                <p className="text-sm font-medium text-muted-foreground">No attendance data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={188}>
                <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1e3a8a" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                    ticks={[1, 5, 10, 15, 20, 25, 30]}
                    dy={6}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                    tickFormatter={v => `${v}%`}
                    dx={-4}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Attendance"]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", fontSize: 12, fontWeight: 700 }}
                    cursor={{ stroke: "#1e3a8a", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#1e3a8a"
                    strokeWidth={2}
                    fill="url(#attGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#1e3a8a", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Class Heatmap + Teachers + Comms ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* Class Performance Heatmap */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Class Performance Heatmap</h2>
          </div>
          <div className="p-6">
            {heatmapCells.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">No results data yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Heatmap will populate once exams are graded</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-6 gap-2.5 mb-5">
                  {heatmapCells.map(c => (
                    <div key={c.cls} className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground">{c.cls}</span>
                      <div className={`${c.color} w-full aspect-square rounded-lg shadow-sm opacity-90`} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-5 pt-4 border-t border-border/60">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm" />
                    <span className="text-[11px] font-semibold text-muted-foreground">Good (≥75%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm" />
                    <span className="text-[11px] font-semibold text-muted-foreground">Average (55–74%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" />
                    <span className="text-[11px] font-semibold text-muted-foreground">Weak (&lt;55%)</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">

          {/* Teacher Performance */}
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Teacher Performance</h2>
              <button className="text-xs font-semibold text-[#1e3a8a] hover:text-[#1e4fc0] flex items-center gap-0.5 transition-colors">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5">
              {teacherRows.length === 0 ? (
                <p className="text-sm font-medium text-muted-foreground text-center py-6">No teachers added yet</p>
              ) : (
                <div className="space-y-3.5">
                  {teacherRows.map(t => (
                    <div key={t.ini + t.name} className="flex items-center gap-3 py-0.5">
                      <div className={`w-9 h-9 rounded-full ${t.bg} flex items-center justify-center text-white text-xs font-black shrink-0`}>
                        {t.ini}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate leading-tight">{t.name}</p>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">{t.subject}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-sm font-black text-foreground">{t.rating}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Urgent Communications */}
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Urgent Communications</h2>
              {urgentComms.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full tracking-wide">
                  {urgentComms.length} New
                </span>
              )}
            </div>
            <div className="p-5">
              {urgentComms.length === 0 ? (
                <p className="text-sm font-medium text-muted-foreground text-center py-6">No urgent messages</p>
              ) : (
                <div className="space-y-3">
                  {urgentComms.map(c => (
                    <div key={c.id} className={`border-l-4 ${c.border} bg-muted/40 rounded-r-xl pl-4 pr-3 py-3 hover:bg-muted/70 transition-colors duration-150 cursor-pointer`}>
                      <p className="text-sm font-bold text-foreground leading-snug">{c.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        From: {c.from}{c.time ? ` · ${c.time}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Dashboard;
