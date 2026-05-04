import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Heart, Users, GraduationCap, CalendarCheck, AlertCircle,
  ArrowUp, ArrowDown, Star, ChevronRight,
  TrendingUp, BarChart3, PieChart, Building2, Clock, AlertTriangle,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs, limit } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { tilt3D, tilt3DStyle } from "@/lib/use3DTilt";
import DashboardMobile from "@/components/dashboard/DashboardMobile";
import Recommendations from "@/components/Recommendations";

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
  // Accept Firestore Timestamp class, plain `{seconds, nanoseconds}` shape,
  // numeric millis, ISO string, or Date instance. Different writers produce
  // different shapes — the previous version only handled Firestore class +
  // raw Date, silently returning "" for the other variants.
  let d: Date | null = null;
  if (!ts) return "";
  if (ts instanceof Date) d = ts;
  else if (typeof ts?.toDate === "function") d = ts.toDate();
  else if (typeof ts?.toMillis === "function") d = new Date(ts.toMillis());
  else if (typeof ts === "number") d = new Date(ts);
  else if (typeof ts === "string") d = new Date(ts);
  else if (typeof ts?.seconds === "number") d = new Date(ts.seconds * 1000);
  if (!d || isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
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

/**
 * Normalize a score doc (results / test_scores / gradebook_scores) into
 * a 0–100 percentage. Returns null when the doc has no usable score —
 * callers must treat null as "no data", NOT as zero. Defaulting missing
 * scores to 0 silently poisons heatmaps and tier classifiers.
 */
const pctOfDoc = (d: any): number | null => {
  const numOf = (v: any): number => {
    if (v === null || v === undefined || v === "") return NaN;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : NaN;
  };
  const direct = numOf(d?.percentage);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(100, direct));
  const raw = [d?.score, d?.marks, d?.obtainedMarks, d?.marksObtained]
    .map(numOf).find(Number.isFinite);
  const max = [d?.maxScore, d?.totalMarks, d?.maxMarks, d?.outOf]
    .map(numOf).find(Number.isFinite);
  if (Number.isFinite(raw) && Number.isFinite(max) && (max as number) > 0) {
    return Math.max(0, Math.min(100, (raw as number) / (max as number) * 100));
  }
  if (Number.isFinite(raw) && (raw as number) >= 0 && (raw as number) <= 100) return raw as number;
  return null;
};

/** Pick the first non-empty class label, preferring human-readable name.
 *  Optional resolver maps an opaque `classId` to its human-readable name
 *  via the classes master collection — without it, score docs that carry
 *  only `classId` get dropped from the heatmap. */
const classLabelOf = (d: any, classMap?: Map<string, string>): string | null => {
  const name = d?.className || d?.class || d?.classLabel;
  if (typeof name === "string" && name.trim()) return name.trim();
  if (classMap && d?.classId) {
    const resolved = classMap.get(String(d.classId));
    if (resolved) return resolved;
  }
  // Don't render raw classIds (e.g., "abc123xyz") — confusing to the user.
  return null;
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

  // Live time ticker for the toolbar — updates every minute. Same UX cue as
  // the Owner dashboard so users always see "this is real-time".
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const branchLabel = (userData?.branchName || userData?.branch || userData?.branchTitle || "") as string;

  // ── Mapping issue detector ────────────────────────────────────────────────
  // The principal is scoped to a branchId, so every listener applies
  // `where("branchId", "==", X)`. If writers elsewhere in the system forget
  // to stamp `branchId` on documents (a known footgun across the codebase
  // — see `branchid_inference_lag` memory), the dashboard renders a totally
  // empty UI even though the school clearly has data. Detect that case by
  // probing schoolId-only when branch-scoped reads come back empty, and
  // surface an actionable amber banner instead of silent emptiness.
  const [mappingIssue, setMappingIssue] = useState<
    | { kind: "branch-missing"; sample: number; total: number }
    | null
  >(null);
  useEffect(() => {
    if (!userData?.schoolId || !userData?.branchId) return;
    // Wait until both primary listeners have reported (non-null = first
    // snapshot received). If either is still null we don't know yet.
    if (studentCount === null || teacherCount === null) return;
    if (studentCount > 0 || teacherCount > 0) {
      setMappingIssue(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const probe = await getDocs(query(
          collection(db, "enrollments"),
          where("schoolId", "==", userData.schoolId),
          limit(10),
        ));
        if (cancelled) return;
        if (probe.empty) {
          // Genuinely empty school — not a mapping issue, just no data yet.
          setMappingIssue(null);
          return;
        }
        const missing = probe.docs.filter(d => !d.data().branchId).length;
        setMappingIssue({ kind: "branch-missing", sample: missing, total: probe.size });
      } catch {
        // Probe is best-effort. Fail silently — empty UI is no worse than
        // before.
      }
    })();
    return () => { cancelled = true; };
  }, [userData?.schoolId, userData?.branchId, studentCount, teacherCount]);

  // ── Sections ───────────────────────────────────────────────────────────────
  const [trendData,    setTrendData]    = useState<TrendPoint[]>([]);
  const [riskAlerts,   setRiskAlerts]   = useState<RiskAlert[]>([]);
  const [teacherRows,  setTeacherRows]  = useState<{ ini: string; name: string; subject: string; rating: number; bg: string }[]>([]);
  const [heatmapCells, setHeatmapCells] = useState<{ cls: string; color: string; avg: number | null; students: number }[]>([]);
  const [urgentComms,  setUrgentComms]  = useState<{ id: string; title: string; from: string; time: string; border: string }[]>([]);

  // ── Cross-listener refs ────────────────────────────────────────────────────
  // Refs let each listener compute derived values using the latest data from
  // other listeners without creating stale-closure issues.
  const attRisksRef    = useRef<RiskAlert[]>([]);
  const incRisksRef    = useRef<RiskAlert[]>([]);
  const resRisksRef    = useRef<RiskAlert[]>([]);
  const avgScoreRef    = useRef<number | null>(null);  // updated by score recompute
  const attTodayRef    = useRef<number | null>(null);  // strictly TODAY's rate (for stat card)
  // Most-recent day with attendance data in the last 30 days. Used for the
  // health index so that on Sundays / holidays / morning-before-mark-time,
  // the hero doesn't sit at "Loading" forever just because today happens to
  // have no records yet.
  const attRecentRef   = useRef<number | null>(null);
  const pendingIncRef  = useRef<number | null>(null);  // updated by incidents listener

  // Score docs are co-canonical across THREE collections: schools using the
  // legacy in-app flow write to `results`, schools using the Excel-ingest
  // pipeline write to `test_scores` + `gradebook_scores`. Reading only one
  // silently misses ~40% of records, which is exactly what the previous
  // single-source listener did. Each listener writes to its own ref and
  // calls `recomputeScoreView()` to merge → heatmap, low-score risks,
  // class avg map (used by Top Teachers), and avgScoreRef (health index).
  const resultsRef        = useRef<any[]>([]);
  const testScoresRef     = useRef<any[]>([]);
  const gradebookRef      = useRef<any[]>([]);
  // Top teachers ranks teachers by the avg score across the classes they
  // teach. teaching_assignments tells us teacher → classes; we then average
  // across the merged scores keyed by class label.
  const teachersRef             = useRef<any[]>([]);
  const teachingAssignmentsRef  = useRef<any[]>([]);
  const scoresByClassRef        = useRef<Map<string, { sum: number; count: number }>>(new Map());
  // classes master list — resolves opaque `classId` references in
  // teaching_assignments + score docs to a human-readable className. Without
  // this, a teaching_assignment carrying only `classId: "abc123"` could
  // never be joined to a score doc carrying only `className: "10B"` even
  // though they refer to the same class. Silent join failure → permanently
  // empty Top Teachers card.
  const classIdToNameRef        = useRef<Map<string, string>>(new Map());

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
    // Health index is a holistic indicator — it should reflect the school's
    // recent state, not strictly today. Today's attendance can legitimately
    // be missing (Sunday, holiday, before mark-time) without making the
    // index unknowable. Fall back to the most-recent day with attendance.
    const att = attTodayRef.current ?? attRecentRef.current;
    const score = avgScoreRef.current;
    // Need at least one of (attendance, score) to be meaningful; safety
    // alone (which is mostly 100 for incident-free schools) would give a
    // false-positive 100% health on a brand-new tenant with no data.
    if (att === null && score === null) return;

    const W = { att: 0.45, score: 0.35, safety: 0.20 };
    let sum = 0, totalW = 0;
    if (att   !== null) { sum += att   * W.att;    totalW += W.att; }
    if (score !== null) { sum += score * W.score;  totalW += W.score; }
    // Safety always contributes — incident-free is a real signal.
    const safety = Math.max(0, 100 - (pendingIncRef.current ?? 0) * 8);
    sum += safety * W.safety; totalW += W.safety;

    setHealthIndex(Math.round((sum / totalW) * 10) / 10);
  }, []);

  /**
   * Top 3 teachers ranked by the average score across the classes they
   * actually teach (joined via teaching_assignments). Old logic sorted by
   * `t.rating` which most teacher docs don't carry → arbitrary first-3.
   */
  const recomputeTopTeachers = useCallback(() => {
    const teachers = teachersRef.current;
    const tas      = teachingAssignmentsRef.current;
    const byClass  = scoresByClassRef.current;
    const classMap = classIdToNameRef.current;

    if (teachers.length === 0) {
      setTeacherRows([]);
      return;
    }

    // teacher → set of class labels. teaching_assignments docs commonly
    // carry only `classId` (no `className`), while score docs commonly
    // carry only `className`. Without resolving classId → className via
    // the master classes map, the join silently fails and Top Teachers
    // stays permanently empty even when both teachers AND scores exist.
    const teacherToClasses = new Map<string, Set<string>>();
    tas.forEach((ta: any) => {
      if (!ta?.teacherId) return;
      if (ta.status && String(ta.status).toLowerCase() !== "active") return;
      const direct = ta.className || ta.class || ta.classLabel;
      const resolved = ta.classId ? classMap.get(String(ta.classId)) : null;
      const cls = (typeof direct === "string" && direct.trim()) ? direct.trim() : resolved;
      if (!cls) return;
      if (!teacherToClasses.has(ta.teacherId)) teacherToClasses.set(ta.teacherId, new Set());
      teacherToClasses.get(ta.teacherId)!.add(cls);
    });

    const ranked = teachers
      .filter(t => t.name)
      .map(t => {
        const classes = teacherToClasses.get(t.id);
        if (!classes || classes.size === 0) return null;
        let sum = 0, count = 0;
        classes.forEach(c => {
          const agg = byClass.get(c);
          if (agg && agg.count > 0) { sum += agg.sum; count += agg.count; }
        });
        if (count === 0) return null;
        return { t, score: sum / count };
      })
      .filter((x): x is { t: any; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    setTeacherRows(ranked.map(r => {
      const t = r.t;
      const subj = t.subject || (Array.isArray(t.subjects) ? t.subjects[0] : "") || "General";
      // Display as a 0–10 rating (matches the Star UX) derived from
      // class-avg %. e.g. 78% → 7.8.
      return {
        ini: getInitials(t.name),
        name: t.name as string,
        subject: subj as string,
        rating: Math.round(r.score) / 10,
        bg: getAvatarColor(t.name),
      };
    }));
  }, []);

  /**
   * Re-derive heatmap, low-score risk alerts, scoresByClass index, and
   * avgScoreRef from the union of `results` + `test_scores` + `gradebook_scores`.
   * Skips docs with no usable percentage (no zero-default — see pctOfDoc).
   */
  const recomputeScoreView = useCallback(() => {
    const allDocs = [
      ...resultsRef.current,
      ...testScoresRef.current,
      ...gradebookRef.current,
    ];

    // Class heatmap + class avg index (for top teachers)
    type ClassAgg = { sum: number; count: number; students: Set<string> };
    const classMap: Record<string, ClassAgg> = {};
    const idResolver = classIdToNameRef.current;
    let totalSum = 0, totalCount = 0;
    allDocs.forEach(d => {
      const pct = pctOfDoc(d);
      if (pct === null) return; // No data ≠ 0 — skip
      const cls = classLabelOf(d, idResolver);
      if (!cls) return;
      if (!classMap[cls]) classMap[cls] = { sum: 0, count: 0, students: new Set() };
      classMap[cls].sum   += pct;
      classMap[cls].count += 1;
      if (d.studentId) classMap[cls].students.add(String(d.studentId));
      totalSum += pct; totalCount += 1;
    });

    const cells = Object.entries(classMap)
      .map(([cls, v]) => ({
        cls,
        avg: v.count > 0 ? Math.round(v.sum / v.count) : null,
        students: v.students.size,
      }))
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
      .slice(0, 12)
      .map(c => ({ cls: c.cls, color: heatColor(c.avg), avg: c.avg, students: c.students }));
    setHeatmapCells(cells);

    // Update class index for Top Teachers ranking
    const cMap = new Map<string, { sum: number; count: number }>();
    Object.entries(classMap).forEach(([cls, v]) => {
      cMap.set(cls, { sum: v.sum, count: v.count });
    });
    scoresByClassRef.current = cMap;

    // Overall avg → health index
    if (totalCount > 0) {
      avgScoreRef.current = Math.round(totalSum / totalCount);
      computeHealthIndex();
    }

    // Low-score student risk alerts (per-student avg < 50%)
    const studentScores: Record<string, { name: string; cls: string; scores: number[] }> = {};
    allDocs.forEach(d => {
      if (!d.studentId) return;
      const pct = pctOfDoc(d);
      if (pct === null) return;
      const sid = String(d.studentId);
      if (!studentScores[sid]) {
        // Resolve class label via the same idResolver used by the heatmap so
        // a score doc carrying only `classId` still surfaces its class in
        // the risk alert (e.g. "Syed Muqeeth – 10B" not "Syed Muqeeth – ").
        const cls = classLabelOf(d, idResolver) || "";
        studentScores[sid] = { name: d.studentName || "Student", cls, scores: [] };
      }
      studentScores[sid].scores.push(pct);
    });
    resRisksRef.current = Object.entries(studentScores)
      .map(([id, s]) => ({
        id, name: s.name, cls: s.cls,
        avg: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length),
      }))
      // require at least 2 scores so a single bad test doesn't flood the feed
      .filter(s => studentScores[s.id].scores.length >= 2 && s.avg < 50)
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

    // Re-rank Top Teachers (depends on the freshly-rebuilt class avg index)
    recomputeTopTeachers();
  }, [computeHealthIndex, mergeRisks, recomputeTopTeachers]);

  // ── Firestore listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userData?.schoolId) return;

    // Base constraints applied to every query
    const C = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) C.push(where("branchId", "==", userData.branchId));

    const unsubs: (() => void)[] = [];

    // ── 1. Enrollments → total student count ──────────────────────────────
    // Multi-class students get one enrollment row per class — dedup by
    // studentId. If the field is missing on every doc we report 0 (the truth)
    // rather than counting raw rows, which would silently double-count.
    unsubs.push(onSnapshot(
      query(collection(db, "enrollments"), ...C),
      snap => {
        const unique = new Set<string>();
        snap.docs.forEach(d => {
          const sid = d.data().studentId;
          if (sid) unique.add(String(sid));
        });
        setStudentCount(unique.size);
      },
      () => setStudentCount(0),
    ));

    // ── 2. Teachers → count + (top-teacher rows recomputed elsewhere) ─────
    // Treat missing `status` and missing `isActive` as Active by default —
    // the previous mixed `status === "Active" || isActive !== false` check
    // dropped any teacher with `status: undefined` even when isActive was
    // true, then fell back to "all docs" when the active filter returned 0
    // (silently inflating the count when one teacher had a stale status).
    unsubs.push(onSnapshot(
      query(collection(db, "teachers"), ...C),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const active = docs.filter(t => {
          if (t.isActive === false) return false;
          if (typeof t.status === "string" &&
              ["inactive", "deleted", "removed", "suspended"].includes(t.status.toLowerCase())) {
            return false;
          }
          return true;
        });
        setTeacherCount(active.length);
        teachersRef.current = active;
        recomputeTopTeachers();
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

        // Most-recent daily rate — drives the health index when today
        // hasn't been marked yet. Walk i=0→29 (today first) and pick the
        // first day with at least one record.
        let recentRate: number | null = null;
        for (let i = 0; i <= 29; i++) {
          const d = daysAgoStr(i);
          const e = byDate[d];
          if (e && e.t > 0) {
            recentRate = Math.round((e.p / e.t) * 100);
            break;
          }
        }
        attRecentRef.current = recentRate;

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
        // Status field is case-inconsistent across writers — some flows
        // store "Open" / "Pending" capitalized, others lowercase. Normalize
        // before comparing so we don't silently miss capitalized variants.
        const isOpen = (s: any) => {
          if (typeof s !== "string") return false;
          const norm = s.toLowerCase();
          return norm === "open" || norm === "pending";
        };
        const isUrgent = (s: any) => {
          if (typeof s !== "string") return false;
          const norm = s.toLowerCase();
          return norm === "critical" || norm === "high";
        };
        // Strict pending: only docs whose writer explicitly set an open status.
        // Treating missing-status as pending caused legacy resolved incidents
        // (where the resolve writer forgot to stamp `status`) to inflate the
        // counter forever. If a doc has no status field, we leave it out — the
        // resolve flow now sets status, so anything legacy is a no-op.
        const pending = docs.filter(d => isOpen(d.status));
        pendingIncRef.current = pending.length;
        setPendingIncidents(pending.length);

        incRisksRef.current = docs
          // Only show CRITICAL/HIGH that are still open. A resolved critical
          // incident shouldn't sit in today's risk feed.
          .filter(d => isUrgent(d.severity) && isOpen(d.status))
          // Sort by recency. Different incident writers stamp different
          // timestamp fields (`date` from in-app form, `createdAt` from
          // serverTimestamp helpers, `timestamp` from older flows). Try all
          // three so the freshest critical incident always sits on top.
          .sort((a, b) => toDateStr(b.date || b.createdAt || b.timestamp)
            .localeCompare(toDateStr(a.date || a.createdAt || a.timestamp)))
          .slice(0, 2)
          .map(d => {
            const isCritical = String(d.severity || "").toLowerCase() === "critical";
            return {
              id: `inc_${d.id}`,
              name: d.student?.name || d.studentName || d.title || "Incident",
              detail: d.title || d.incidentType || d.type || "Discipline issue",
              level: isCritical ? "CRITICAL" as const : "WARNING" as const,
              dot:   isCritical ? "#ef4444" : "#f59e0b",
              badge: isCritical ? "bg-red-500" : "bg-amber-500",
              rowBg: isCritical ? "bg-red-50/60" : "",
            };
          });
        mergeRisks();
        computeHealthIndex();
      },
      () => setPendingIncidents(0),
    ));

    // ── 5. Score sources (3 collections, co-canonical) ─────────────────────
    // Schools using the in-app flow write to `results`. Schools using the
    // Excel-ingest pipeline write to `test_scores` and/or `gradebook_scores`.
    // Reading only one source silently misses ~40% of records → empty
    // heatmap, no low-score alerts, no health-index score component.
    // Each listener updates its ref + calls `recomputeScoreView()` which
    // merges all three into the UI projections (heatmap, risks, top teachers).
    unsubs.push(onSnapshot(
      query(collection(db, "results"), ...C),
      snap => {
        resultsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        recomputeScoreView();
      },
      () => {},
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "test_scores"), ...C),
      snap => {
        testScoresRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        recomputeScoreView();
      },
      () => {},
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "gradebook_scores"), ...C),
      snap => {
        gradebookRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        recomputeScoreView();
      },
      () => {},
    ));

    // ── 5b. Teaching assignments → teacher → classes mapping for Top Teachers
    unsubs.push(onSnapshot(
      query(collection(db, "teaching_assignments"), ...C),
      snap => {
        teachingAssignmentsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        recomputeTopTeachers();
      },
      () => {},
    ));

    // ── 5c. Classes master list → classId resolver for joins ──────────────
    // Lets us join teaching_assignments (which often only carry classId)
    // with score docs (which often only carry className). Without this, the
    // Top Teachers card silently stays empty even when both sides have
    // data — a classic identity-mismatch silent bug.
    unsubs.push(onSnapshot(
      query(collection(db, "classes"), ...C),
      snap => {
        const m = new Map<string, string>();
        snap.docs.forEach(d => {
          const data = d.data() as any;
          const name = data.name || data.className || data.label;
          if (typeof name === "string" && name.trim()) m.set(d.id, name.trim());
        });
        classIdToNameRef.current = m;
        // Both downstream consumers may already have data — re-run them
        // so they pick up the now-resolvable class labels.
        recomputeScoreView();
        recomputeTopTeachers();
      },
      () => {},
    ));

    // ── 6. Communications → urgent unread messages ─────────────────────────
    unsubs.push(onSnapshot(
      query(collection(db, "communications"), ...C),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        // Writers in this codebase use `read: false`, but `communications`
        // documents from older flows (and parent-initiated threads) may use
        // `unread: true` or a status string. Accept all known signals so we
        // don't silently miss urgent items.
        const urgent = docs
          .filter(d =>
            d.unread === true ||
            d.read === false ||
            d.status === "pending" ||
            d.status === "unread",
          )
          .sort((a, b) => {
            // Different writers use different timestamp fields — try both
            // canonical names before falling back to `date` strings.
            const tsOf = (x: any): number => {
              const fromTs = x?.createdAt?.toMillis?.() ?? x?.timestamp?.toMillis?.();
              if (Number.isFinite(fromTs)) return fromTs as number;
              if (typeof x?.createdAt === "number") return x.createdAt;
              if (typeof x?.timestamp === "number") return x.timestamp;
              const t = new Date(x?.date || 0).getTime();
              return Number.isFinite(t) ? t : 0;
            };
            return tsOf(b) - tsOf(a);
          })
          .slice(0, 4)
          .map(d => ({
            id: d.id as string,
            title: (d.title || d.subject || d.category || "Message") as string,
            from:  (d.senderName || d.from || d.senderType || "Parent") as string,
            // Match the same multi-field timestamp resolution as the sort
            // above — older threads use `timestamp`, newer ones `createdAt`.
            time:  relativeTime(d.createdAt || d.timestamp || d.date),
            border: d.priority === "high" || d.type === "complaint"
              ? "border-l-red-500"
              : "border-l-amber-400",
          }));
        setUrgentComms(urgent);
      },
      () => {},
    ));

    return () => unsubs.forEach(u => u());
  }, [
    userData?.schoolId, userData?.branchId,
    mergeRisks, computeHealthIndex,
    recomputeScoreView, recomputeTopTeachers,
  ]);

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
          branchLabel={branchLabel}
          mappingIssue={mappingIssue}
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
  // Bright light-blue halo — user said previous values were too faint
  // to register as a real drop shadow. Opacity bumped across all three
  // layers + wider blur so the sky-blue tone (#4499FF) genuinely pops
  // around each card at rest.
  // Matches Students' SHADOW_LG — soft blue-tinted layered glow.
  const dSH = "0 0 0 .5px rgba(0,85,255,.10), 0 2px 10px rgba(0,85,255,.10), 0 10px 28px rgba(0,85,255,.12)";
  const dSH_LG = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)";

  const healthLabelText = healthLabel(healthIndex);

  return (
    <div className="min-h-screen animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: "#EEF4FF" }}>
    <div className="pb-10 w-full px-2">

      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pt-2 pb-5 flex-wrap">
        <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
          <Heart className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Principal Dashboard</div>
          <div className="text-[12px] mt-1" style={{ color: dT3 }}>Real-time school intelligence overview</div>
        </div>
        {/* Branch + live time chips — give the user a constant
            visual confirmation of which scope they're viewing. */}
        <div className="flex items-center gap-2 shrink-0">
          {branchLabel && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
              style={{ background: "rgba(0,85,255,0.08)", color: dB1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
              <Building2 className="w-[13px] h-[13px]" strokeWidth={2.4} />
              {branchLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{ background: "rgba(0,200,83,0.08)", color: dGREEN_D, border: "0.5px solid rgba(0,200,83,0.18)" }}>
            <Clock className="w-[13px] h-[13px]" strokeWidth={2.4} />
            {now.toLocaleString("en-IN", {
              weekday: "short", day: "numeric", month: "short",
              hour: "numeric", minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* ── Mapping Issue Banner ──────────────────────────────────────────────
           Shown when the branch-scoped queries return 0 docs but the school
           clearly has data. Almost always means writers didn't stamp
           `branchId` on enrollments / teachers / etc., so the principal sees
           a ghost-empty dashboard. Actionable amber instead of silent emptiness. */}
      {mappingIssue && (
        <div className="mb-5 rounded-[16px] p-4 flex items-start gap-3"
          style={{
            background: "linear-gradient(135deg, rgba(255,170,0,0.08) 0%, rgba(255,170,0,0.04) 100%)",
            border: "0.5px solid rgba(255,170,0,0.32)",
            boxShadow: "0 4px 14px rgba(255,170,0,0.10)",
          }}>
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,170,0,0.14)", border: "0.5px solid rgba(255,170,0,0.30)" }}>
            <AlertTriangle className="w-[18px] h-[18px]" style={{ color: "#A85D00" }} strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold leading-snug" style={{ color: "#7A4500" }}>
              No data linked to {branchLabel || "this branch"} yet
            </p>
            <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: "#8A5500" }}>
              Found {mappingIssue.total} school-level enrollment record{mappingIssue.total === 1 ? "" : "s"} but{" "}
              <strong style={{ color: "#7A4500", fontWeight: 700 }}>
                {mappingIssue.sample} {mappingIssue.sample === 1 ? "lacks" : "lack"} a <code style={{ background: "rgba(255,170,0,0.18)", padding: "1px 5px", borderRadius: 4, fontFamily: "ui-monospace, monospace" }}>branchId</code>
              </strong>{" "}
              field. Ask your DEO to re-upload Excel data with the branch column filled, or run the migration tool from Settings → Data → Migration Engine.
            </p>
          </div>
        </div>
      )}

      {/* ── Academic Health Hero ──────────────────────────────────────────────── */}
      <div onClick={() => navigate("/student-intelligence")}
        role="button" tabIndex={0}
        {...tilt3D}
        className="rounded-[22px] px-7 py-6 flex flex-wrap items-center justify-between gap-5 text-white relative overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
          ...tilt3DStyle,
        }}>
        <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5" style={{ perspective: "1200px" }}>

        {/* Students — blue */}
        <div onClick={() => navigate("/students")}
          role="button" tabIndex={0}
          {...tilt3D}
          className="rounded-[20px] p-5 relative overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40"
          style={{ background: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)", boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
          <div className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.28)", transform: "translateZ(18px)" }}>
            <Users className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
          </div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: dT4 }}>Total Students</span>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: dB1, letterSpacing: "-1.2px", transform: "translateZ(10px)" }}>{displayStudents}</p>
          <p className="text-[11px] font-semibold" style={{ color: dT3 }}>Enrolled this branch</p>
          <Users className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none" style={{ color: dB1, opacity: 0.18 }} strokeWidth={2} />
        </div>

        {/* Teachers — green */}
        <div onClick={() => navigate("/teachers")}
          role="button" tabIndex={0}
          {...tilt3D}
          className="rounded-[20px] p-5 relative overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40"
          style={{ background: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)", boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
          <div className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
            style={{ background: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, boxShadow: "0 4px 14px rgba(0,200,83,0.26)", transform: "translateZ(18px)" }}>
            <GraduationCap className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
          </div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: dT4 }}>Teachers</span>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: dGREEN_D, letterSpacing: "-1.2px", transform: "translateZ(10px)" }}>{displayTeachers}</p>
          <p className="text-[11px] font-semibold" style={{ color: dGREEN_D }}>Active staff</p>
          <TrendingUp className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none" style={{ color: dGREEN, opacity: 0.22 }} strokeWidth={2} />
        </div>

        {/* Attendance — gold */}
        <div onClick={() => navigate("/attendance")}
          role="button" tabIndex={0}
          {...tilt3D}
          className="rounded-[20px] p-5 relative overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40"
          style={{ background: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)", boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
          <div className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
            style={{ background: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`, boxShadow: "0 4px 14px rgba(255,170,0,0.28)", transform: "translateZ(18px)" }}>
            <CalendarCheck className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
          </div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: dT4 }}>Today's Attendance</span>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: dGOLD, letterSpacing: "-1.2px", transform: "translateZ(10px)" }}>{displayAttendance}</p>
          {attendanceDelta !== null ? (
            <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: attendanceDelta >= 0 ? dGREEN_D : dRED }}>
              {attendanceDelta >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {Math.abs(attendanceDelta)}% vs yesterday
            </p>
          ) : attendanceToday !== null ? (
            // Today HAS data, but yesterday doesn't — so we can't compute a
            // delta. The previous "No data yet" copy contradicted the % above.
            <p className="text-[11px] font-semibold" style={{ color: dT3 }}>No prior-day baseline</p>
          ) : (
            <p className="text-[11px] font-semibold" style={{ color: dT3 }}>No attendance marked today</p>
          )}
          <BarChart3 className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none" style={{ color: dGOLD, opacity: 0.22 }} strokeWidth={2} />
        </div>

        {/* Incidents — red/violet */}
        <div onClick={() => navigate("/discipline")}
          role="button" tabIndex={0}
          {...tilt3D}
          className="rounded-[20px] p-5 relative overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40"
          style={{
            background: (pendingIncidents ?? 0) > 0
              ? "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)"
              : "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle,
          }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
          <div className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
            style={{
              background: (pendingIncidents ?? 0) > 0 ? `linear-gradient(135deg, ${dRED}, #FF6688)` : `linear-gradient(135deg, ${dVIOLET}, #A07CF8)`,
              boxShadow: (pendingIncidents ?? 0) > 0 ? "0 4px 14px rgba(255,51,85,0.28)" : "0 4px 14px rgba(123,63,244,0.26)",
              transform: "translateZ(18px)",
            }}>
            <AlertCircle className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
          </div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: dT4 }}>Pending Incidents</span>
          <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: (pendingIncidents ?? 0) > 0 ? dRED : dVIOLET, letterSpacing: "-1.2px" }}>
            {displayIncidents}
          </p>
          <p className="text-[11px] font-semibold" style={{ color: (pendingIncidents ?? 0) > 0 ? dRED : dT3 }}>
            {(pendingIncidents ?? 0) > 0 ? "Action required" : "All clear"}
          </p>
          <PieChart className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
            style={{ color: (pendingIncidents ?? 0) > 0 ? dRED : dVIOLET, opacity: 0.22 }} strokeWidth={2} />
        </div>
      </div>

      {/* ── Risk Alerts + Attendance Trend ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5" style={{ perspective: "1200px" }}>

        {/* Risk Alerts card */}
        <div onClick={() => navigate("/risk-students")}
          role="button" tabIndex={0}
          {...tilt3D}
          className="bg-white rounded-[20px] overflow-hidden flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40 relative"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
          <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center gap-[10px]">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: dRED_S, border: `0.5px solid ${dRED_B}` }}>
                <AlertCircle className="w-4 h-4" style={{ color: dRED }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Today's Risk Alerts</h2>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); navigate("/risk-students"); }}
              className="text-[12px] font-bold flex items-center gap-0.5 transition-colors" style={{ color: dB1 }}>
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
          {...tilt3D}
          className="bg-white rounded-[20px] overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40 relative"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5 items-start" style={{ perspective: "1200px" }}>

        {/* Class Performance Heatmap */}
        <div onClick={() => navigate("/academics")}
          role="button" tabIndex={0}
          {...tilt3D}
          className="bg-white rounded-[20px] overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40 relative"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
          <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center gap-[10px]">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: "rgba(123,63,244,0.10)", border: "0.5px solid rgba(123,63,244,0.22)" }}>
                <Star className="w-4 h-4" style={{ color: dVIOLET }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Class Performance Heatmap</h2>
            </div>
            {heatmapCells.length > 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: "rgba(123,63,244,0.10)", color: dVIOLET, border: "0.5px solid rgba(123,63,244,0.22)" }}>
                {heatmapCells.length} {heatmapCells.length === 1 ? "Class" : "Classes"}
              </span>
            )}
          </div>
          <div className="p-6">
            {heatmapCells.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[13px] font-bold" style={{ color: dT1 }}>No results data yet</p>
                <p className="text-[11px] mt-1" style={{ color: dT4 }}>Heatmap will populate once exams are graded</p>
              </div>
            ) : (() => {
              const scored = heatmapCells.filter(c => c.avg !== null);
              const overallAvg = scored.length > 0
                ? Math.round(scored.reduce((s, c) => s + (c.avg ?? 0), 0) / scored.length)
                : null;
              const topCell = scored[0]; // already sorted desc by avg
              const atRiskCount = scored.filter(c => (c.avg ?? 100) < 55).length;
              const overallGrad = (overallAvg ?? 0) >= 75 ? `linear-gradient(135deg, ${dGREEN}, #22EE66)`
                : (overallAvg ?? 0) >= 55 ? `linear-gradient(135deg, ${dGOLD}, #FFDD44)`
                : `linear-gradient(135deg, ${dRED}, #FF6688)`;

              return (
                <>
                  {/* Summary stats strip */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <div className="no-card-hover rounded-[12px] p-3" style={{ background: "rgba(0,85,255,0.05)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
                      <p className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>Classes</p>
                      <p className="text-[20px] font-bold leading-tight mt-0.5" style={{ color: dB1, letterSpacing: "-0.5px" }}>{heatmapCells.length}</p>
                    </div>
                    <div className="no-card-hover rounded-[12px] p-3 relative overflow-hidden"
                      style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}` }}>
                      <p className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>Overall Avg</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <p className="text-[20px] font-bold leading-tight" style={{ color: dGREEN_D, letterSpacing: "-0.5px" }}>
                          {overallAvg !== null ? `${overallAvg}%` : "—"}
                        </p>
                      </div>
                      {overallAvg !== null && (
                        <span className="absolute right-2 bottom-2 w-2.5 h-2.5 rounded-full" style={{ background: overallGrad }} />
                      )}
                    </div>
                    <div className="no-card-hover rounded-[12px] p-3" style={{ background: "rgba(255,170,0,0.08)", border: "0.5px solid rgba(255,170,0,0.20)" }}>
                      <p className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>Top Class</p>
                      {topCell ? (
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <p className="text-[15px] font-bold leading-tight truncate" style={{ color: "#884400", letterSpacing: "-0.3px" }}>{topCell.cls}</p>
                          <span className="text-[11px] font-bold" style={{ color: dGOLD }}>{topCell.avg}%</span>
                        </div>
                      ) : (
                        <p className="text-[15px] font-bold leading-tight mt-0.5" style={{ color: dT4 }}>—</p>
                      )}
                    </div>
                    <div className="no-card-hover rounded-[12px] p-3"
                      style={{ background: atRiskCount > 0 ? dRED_S : dGREEN_S, border: `0.5px solid ${atRiskCount > 0 ? dRED_B : dGREEN_B}` }}>
                      <p className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>At Risk</p>
                      <p className="text-[20px] font-bold leading-tight mt-0.5"
                        style={{ color: atRiskCount > 0 ? dRED : dGREEN_D, letterSpacing: "-0.5px" }}>
                        {atRiskCount}
                      </p>
                    </div>
                  </div>

                  {/* Vertical bar chart — refined, aesthetic */}
                  <div className="mb-5 rounded-[16px] p-4 pt-5"
                    style={{
                      background: "linear-gradient(180deg, rgba(0,85,255,0.025) 0%, rgba(0,85,255,0.01) 100%)",
                      border: "0.5px solid rgba(0,85,255,0.08)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
                    }}>
                    {/* Plot area: Y-axis gridlines + bars */}
                    <div className="relative" style={{ height: "260px", paddingLeft: "34px", paddingRight: "10px" }}>
                      {/* Horizontal gridlines + Y-axis labels */}
                      {[100, 75, 50, 25, 0].map(v => (
                        <div key={v} className="absolute left-0 right-0 pointer-events-none"
                          style={{ bottom: `${v}%` }}>
                          <span className="absolute left-0 top-0 -translate-y-1/2 text-[9px] font-bold w-[28px] text-right pr-1.5" style={{ color: dT4, letterSpacing: "0.02em" }}>
                            {v}
                          </span>
                          <div className="ml-[34px] h-px" style={{
                            background: v === 0 ? "rgba(0,85,255,0.20)" : "rgba(0,85,255,0.06)",
                            backgroundImage: v === 0 ? undefined : `repeating-linear-gradient(90deg, rgba(0,85,255,0.10) 0 3px, transparent 3px 7px)`,
                          }} />
                        </div>
                      ))}
                      {/* School-avg dashed reference line */}
                      {overallAvg !== null && (
                        <div className="absolute left-[34px] right-2 pointer-events-none z-10"
                          style={{ bottom: `${overallAvg}%` }}>
                          <div className="h-px" style={{
                            backgroundImage: `repeating-linear-gradient(90deg, ${dT1} 0 5px, transparent 5px 10px)`,
                            opacity: 0.6,
                          }} />
                          <span className="absolute right-0 -top-[9px] text-[8.5px] font-bold px-2 py-[2px] rounded-full"
                            style={{
                              background: `linear-gradient(135deg, ${dT1}, #002080)`,
                              color: "#fff",
                              letterSpacing: "0.06em",
                              boxShadow: "0 2px 6px rgba(0,16,64,0.28)",
                            }}>
                            AVG {overallAvg}%
                          </span>
                        </div>
                      )}
                      {/* Bars */}
                      <div className="absolute left-[34px] right-2 top-0 bottom-0 flex items-end justify-around gap-2.5">
                        {heatmapCells.map((c, i) => {
                          const avgNum = c.avg ?? 0;
                          const tier = avgNum >= 75 ? "good" : avgNum >= 55 ? "avg" : "weak";
                          const fillGrad = tier === "good" ? `linear-gradient(180deg, #44FF88 0%, ${dGREEN} 60%, #00A040 100%)` :
                                           tier === "avg"  ? `linear-gradient(180deg, #FFE066 0%, ${dGOLD} 60%, #CC7700 100%)` :
                                                              `linear-gradient(180deg, #FF99AA 0%, ${dRED} 60%, #CC1133 100%)`;
                          const fillShadow = tier === "good" ? "0 -1px 10px rgba(0,200,83,0.32), 0 4px 10px rgba(0,200,83,0.20), inset 0 0 0 0.5px rgba(255,255,255,0.18)" :
                                             tier === "avg"  ? "0 -1px 10px rgba(255,170,0,0.32), 0 4px 10px rgba(255,170,0,0.20), inset 0 0 0 0.5px rgba(255,255,255,0.18)" :
                                                                "0 -1px 10px rgba(255,51,85,0.32), 0 4px 10px rgba(255,51,85,0.20), inset 0 0 0 0.5px rgba(255,255,255,0.18)";
                          const scoreColor = tier === "good" ? dGREEN_D : tier === "avg" ? "#884400" : dRED;
                          const scoreBg    = tier === "good" ? dGREEN_S : tier === "avg" ? "rgba(255,170,0,0.10)" : dRED_S;
                          const scoreBorder= tier === "good" ? dGREEN_B : tier === "avg" ? "rgba(255,170,0,0.22)" : dRED_B;
                          const rank = i + 1;
                          return (
                            <div key={c.cls} className="flex-1 max-w-[40px] h-full flex flex-col items-center justify-end relative"
                              title={c.students > 0 ? `${c.cls} · ${c.avg ?? 0}% · ${c.students} student${c.students === 1 ? "" : "s"} · Rank #${rank}` : `${c.cls} · ${c.avg ?? 0}% · Rank #${rank}`}>
                              {/* Faint vertical lane behind bar */}
                              <span className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[18px] rounded-t-[4px] pointer-events-none"
                                style={{ background: "rgba(0,85,255,0.025)" }} />
                              {/* Score pill above bar */}
                              <span className="text-[9.5px] font-bold mb-[5px] leading-none shrink-0 px-1.5 py-[2px] rounded-full relative z-10"
                                style={{
                                  color: scoreColor,
                                  background: scoreBg,
                                  border: `0.5px solid ${scoreBorder}`,
                                  letterSpacing: "-0.1px",
                                }}>
                                {c.avg !== null ? `${c.avg}%` : "—"}
                              </span>
                              {/* The stick bar */}
                              <div className="w-[16px] rounded-t-[6px] transition-all duration-[700ms] ease-out relative z-10"
                                style={{
                                  height: c.avg !== null ? `calc(${avgNum}% - 22px)` : "2px",
                                  minHeight: c.avg === null ? "2px" : "5px",
                                  background: c.avg !== null ? fillGrad : dBG2,
                                  boxShadow: c.avg !== null ? fillShadow : "none",
                                }}>
                                {/* Inner highlight on top of bar */}
                                {c.avg !== null && (
                                  <>
                                    <span className="absolute top-[1.5px] left-[2px] right-[2px] h-[4px] rounded-t-[4px]"
                                      style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))" }} />
                                    <span className="absolute top-0 bottom-0 left-[1.5px] w-[1.5px] rounded-full"
                                      style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0))" }} />
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* X-axis: class names + rank pills */}
                    <div className="flex items-start justify-around gap-2.5 mt-3 pt-2"
                      style={{ paddingLeft: "34px", paddingRight: "10px", borderTop: "0.5px solid rgba(0,85,255,0.06)" }}>
                      {heatmapCells.map((c, i) => {
                        const rank = i + 1;
                        const isPodium = c.avg !== null && rank <= 3;
                        return (
                          <div key={c.cls} className="flex-1 max-w-[40px] flex flex-col items-center gap-[5px]">
                            <span className="text-[10px] font-bold truncate max-w-full" style={{ color: dT1, letterSpacing: "-0.1px" }}>{c.cls}</span>
                            <span className="text-[8px] font-bold w-[15px] h-[15px] rounded-full flex items-center justify-center leading-none"
                              style={{
                                background: isPodium ? `linear-gradient(135deg, ${dGOLD}, #FFDD44)` : dBG2,
                                color: isPodium ? "#fff" : dT3,
                                boxShadow: isPodium ? "0 1.5px 4px rgba(255,170,0,0.32)" : "none",
                              }}>
                              {rank}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-x-5 gap-y-2 pt-4 flex-wrap" style={{ borderTop: `0.5px solid ${dSEP}` }}>
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
                    {overallAvg !== null && (
                      <div className="flex items-center gap-[6px]">
                        <span className="w-[2px] h-3.5 rounded-full" style={{ background: dT1, opacity: 0.55 }} />
                        <span className="text-[11px] font-semibold" style={{ color: dT3 }}>School avg ({overallAvg}%)</span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">

          {/* Teacher Performance */}
          <div onClick={() => navigate("/teacher-performance")}
            role="button" tabIndex={0}
            {...tilt3D}
            className="bg-white rounded-[20px] overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40 relative"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
            <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
            <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center gap-[10px]">
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}` }}>
                  <GraduationCap className="w-4 h-4" style={{ color: dGREEN }} strokeWidth={2.4} />
                </div>
                <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Top Teachers</h2>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); navigate("/teacher-performance"); }}
                className="text-[12px] font-bold flex items-center gap-0.5" style={{ color: dB1 }}>
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5">
              {teacherRows.length === 0 ? (
                // Distinguish "no teachers in directory" from "teachers exist
                // but their classes have no graded scores yet" — the latter
                // is the more common case once the dashboard is live, and
                // saying "no teachers added" misleads the user into thinking
                // their roster is empty.
                <p className="text-[13px] font-bold text-center py-6" style={{ color: dT4 }}>
                  {teacherCount && teacherCount > 0
                    ? "Score data needed to rank teachers"
                    : "No teachers added yet"}
                </p>
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
            {...tilt3D}
            className="bg-white rounded-[20px] overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0055FF]/40 relative"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}`, ...tilt3DStyle }}>
            <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
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
          {...tilt3D}
          className="mt-5 rounded-[22px] px-7 py-6 relative overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
            ...tilt3DStyle,
          }}>
          <div data-glow className="absolute inset-0 pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
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
            {/* Prefer today's attendance, but fall back to most-recent so
                the card stays informative on Sundays / mark-pending mornings
                instead of dropping the whole sentence. */}
            {attendanceToday !== null
              ? <> Today's attendance at <strong style={{ color: "#fff", fontWeight: 700 }}>{attendanceToday}%</strong>{attendanceDelta !== null ? ` (${attendanceDelta >= 0 ? "+" : ""}${attendanceDelta}% vs yesterday)` : ""}.</>
              : attRecentRef.current !== null
                ? <> Recent attendance at <strong style={{ color: "#fff", fontWeight: 700 }}>{attRecentRef.current}%</strong> — today not yet marked.</>
                : null}
            {" "}Review risk alerts and urgent communications to maintain momentum.
          </p>
          <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
            <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: dB4 }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated · Real-time data</span>
          </div>
        </div>
      )}

      {/* System-driven recommendations (was AI proxy, now deterministic — see ai/system/recommendations.ts) */}
      <Recommendations />

    </div>
    </div>
  );

};

export default Dashboard;
