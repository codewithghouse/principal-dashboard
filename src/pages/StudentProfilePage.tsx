import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer, MessageSquare, AlertCircle, Loader2, ChevronLeft, ChevronRight, CheckCircle2, Clock, FileText, Shield, Brain, Users, BookOpen, Calendar, TrendingUp, BarChart3, Activity, Eye, GraduationCap, CalendarCheck, Star, ShieldAlert } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { tilt3D, tilt3DStyle } from "@/lib/use3DTilt";
import { dedupAttendanceByDay } from "@/lib/attendanceDedup";
import { SubjectMasteryRadar } from "@/components/SubjectMasteryRadar";

// ── Tokens — aligned to principal-dashboard palette ─────────────────────────
const T = {
  bg:    "#EEF4FF",                  // scaffold background matches dashboard
  white: "#ffffff",
  ink:   "#001040",                  // T1 primary text
  ink2:  "#5070B0",                  // T3 secondary text
  ink3:  "#99AACC",                  // T4 muted text
  bdr:   "rgba(0,85,255,0.10)",      // blue-tinted border
  s1:    "rgba(0,85,255,0.04)",      // subtle surface tint
  s2:    "rgba(0,85,255,0.08)",      // separator
  blue:  "#0055FF",                  // B1 primary blue
  blBg:  "rgba(0,85,255,0.10)",
  blBdr: "rgba(0,85,255,0.22)",
  grn:   "#00C853", glBg: "rgba(0,200,83,0.10)",
  red:   "#FF3355", rlBg: "rgba(255,51,85,0.10)",
  amb:   "#FF8800", alBg: "rgba(255,136,0,0.10)",
  pur:   "#7B3FF4",
};

const toDate = (v: any): Date | null => { if (!v) return null; if (v?.toDate) return v.toDate(); if (v?.seconds) return new Date(v.seconds * 1000); const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const timeAgo = (v: any) => { const d = toDate(v); if (!d) return ""; const s = (Date.now() - d.getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(); };

/** Local-date YYYY-MM-DD — avoids the UTC drift bug from `toISOString()`
 *  (which would show IST midnight as the previous day in the calendar). */
const ymd = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/** Case-insensitive check for "is this a teacher-authored note?".
 *  Different writers use "teacher" / "Teacher" / "TEACHER" / "faculty" /
 *  "principal" — strict equality (`===`) silently misclassified all
 *  non-lowercase variants as parent notes, flipping label colors. */
const isTeacherNote = (n: any): boolean => {
  const f = String(n?.from || "").toLowerCase();
  return f === "teacher" || f === "faculty" || f === "principal";
};

/**
 * Normalize a score doc (results / test_scores / gradebook_scores) into
 * a 0–100 percentage. Returns `null` for missing data — caller MUST treat
 * null as "skip", not as zero. Defaulting missing scores to 0 quietly
 * tanks averages, trends, and bar charts. Same helper used in
 * Dashboard.tsx + Recommendations.tsx — single source of normalization.
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

// ── Card theme palette — same vibe vocabulary as Dashboard.tsx 4-card row ───
type CardTheme = "blue" | "gold" | "green" | "red" | "violet";
const THEME: Record<CardTheme, {
  /** Pastel surface gradient — colored at top-left, fades to near-white. */
  surface: string;
  /** Solid icon-badge gradient (used inside the header chip). */
  iconBg: string;
  /** Drop shadow under the icon badge so it lifts off the card. */
  iconShadow: string;
  /** Soft watermark color (subtle bottom-right echo of the badge). */
  watermark: string;
  /** Title text accent color. */
  accent: string;
}> = {
  blue:   { surface: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)", iconBg: "linear-gradient(135deg, #0055FF, #1166FF)",  iconShadow: "0 4px 14px rgba(0,85,255,0.28)",   watermark: "#0055FF", accent: "#001040" },
  gold:   { surface: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)", iconBg: "linear-gradient(135deg, #FFAA00, #FFDD44)",  iconShadow: "0 4px 14px rgba(255,170,0,0.28)",  watermark: "#FFAA00", accent: "#7A4500" },
  green:  { surface: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)", iconBg: "linear-gradient(135deg, #00C853, #22EE66)",  iconShadow: "0 4px 14px rgba(0,200,83,0.26)",   watermark: "#00C853", accent: "#007830" },
  red:    { surface: "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)", iconBg: "linear-gradient(135deg, #FF3355, #FF6688)",  iconShadow: "0 4px 14px rgba(255,51,85,0.28)",  watermark: "#FF3355", accent: "#7A0F1F" },
  violet: { surface: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)", iconBg: "linear-gradient(135deg, #7B3FF4, #A07CF8)",  iconShadow: "0 4px 14px rgba(123,63,244,0.26)", watermark: "#7B3FF4", accent: "#3D1A85" },
};
const SHADOW_VIBE = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)";

/**
 * Themable card matching Dashboard's KPI vibe — pastel surface, colored
 * icon badge in the header, layered shadow, and a faint watermark icon
 * in the bottom-right that echoes the theme. Defaults to "blue" so any
 * untouched legacy callers keep rendering reasonably.
 */
const Card = ({
  children, title, action, style,
  theme = "blue",
  icon: Icon,
  watermark: WatermarkIcon,
}: {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
  theme?: CardTheme;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: React.CSSProperties }>;
  watermark?: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: React.CSSProperties }>;
}) => {
  const tk = THEME[theme];
  const isMobile = useIsMobile();
  return (
    <div
      {...tilt3D}
      style={{
        borderRadius: isMobile ? 14 : 18,
        overflow: "hidden",
        position: "relative",
        background: tk.surface,
        border: `0.5px solid ${T.bdr}`,
        boxShadow: SHADOW_VIBE,
        // tilt3DStyle adds backface-visibility: hidden + flat transform-style
        // so text stays crisp during the lift animation.
        ...tilt3DStyle,
        ...style,
      }}
    >
      {/* Watermark — subtle echo of the theme color, sits behind content. */}
      {WatermarkIcon && (
        <WatermarkIcon
          size={120}
          strokeWidth={1.6}
          color={tk.watermark}
          style={{
            position: "absolute",
            bottom: -20,
            right: -16,
            opacity: 0.06,
            pointerEvents: "none",
          }}
        />
      )}

      {title && (
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: isMobile ? "11px 14px" : "14px 18px",
            borderBottom: `0.5px solid rgba(0,0,0,0.04)`,
            background: "rgba(255,255,255,0.45)", // soft frosted band so the title stays legible over the gradient
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {Icon && (
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: tk.iconBg,
                  boxShadow: tk.iconShadow,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={15} strokeWidth={2.4} color="#fff" />
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: tk.accent, letterSpacing: "-0.1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {title}
            </span>
          </div>
          {action || null}
        </div>
      )}
      <div style={{ padding: isMobile ? "12px 14px" : "16px 20px", position: "relative" }}>{children}</div>
    </div>
  );
};

const DetailLink = () => <span style={{ fontSize: 11, color: T.blue, fontWeight: 500, cursor: "pointer" }}>Details →</span>;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
const StudentProfilePage = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const { userData } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [testScores, setTestScores] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [parentNotes, setParentNotes] = useState<any[]>([]);
  const [interventions, setInterventions] = useState<any[]>([]);
  // Teacher-side behaviour signals — synced from teacher dashboard's
  // StudentBehaviour page. Read here so principals see the same data
  // teachers and parents see (single Firestore source of truth).
  const [studentRatings, setStudentRatings] = useState<any[]>([]);
  const [improvementAreas, setImprovementAreas] = useState<any[]>([]);
  const [calMonth, setCalMonth] = useState(new Date());

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) return;

    const run = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "students", studentId));
        if (!snap.exists()) { setLoading(false); return; }
        const sd = { id: snap.id, ...snap.data() } as any;
        // Defense-in-depth: reject student docs that don't belong to this
        // principal's school/branch, even if Firestore rules let the read through.
        if (sd.schoolId && sd.schoolId !== schoolId) { setLoading(false); return; }
        if (branchId && sd.branchId && sd.branchId !== branchId) { setLoading(false); return; }
        setStudent(sd);
        const email = (sd.email || sd.studentEmail || "").toLowerCase();

        const scopeC: any[] = [where("schoolId", "==", schoolId)];
        if (branchId) scopeC.push(where("branchId", "==", branchId));

        const byId = (col: string) => getDocs(query(
          collection(db, col),
          ...scopeC,
          where("studentId", "==", studentId),
        ));
        const byEmail = (col: string) => email ? getDocs(query(
          collection(db, col),
          ...scopeC,
          where("studentEmail", "==", email),
        )) : Promise.resolve(null as any);
        const merge = (a: any, b: any) => { const l: any[] = []; if (a) a.docs.forEach((d: any) => l.push({ id: d.id, ...d.data() })); if (b) b.docs.forEach((d: any) => { if (!l.find(x => x.id === d.id)) l.push({ id: d.id, ...d.data() }); }); return l; };

        // Score data is co-canonical across THREE collections:
        //   • results          → in-app exam flow
        //   • test_scores      → Excel-ingest pipeline
        //   • gradebook_scores → Excel-ingest pipeline (newer)
        // Reading only `results` + `test_scores` (the previous setup) silently
        // missed all gradebook data. Now all three are merged → AND we also
        // do email-fallback queries for incidents/parent_notes/interventions
        // that may have been written before the studentId-canonicalization fix.
        const [
          aI, aE,
          sI, sE,
          rI, rE,
          gI, gE,
          subI, subE,
          incI, incE,
          pnI, pnE,
          ivI, ivE,
          enrI, enrE,
          srI, srE,
          imI, imE,
        ] = await Promise.all([
          byId("attendance"),         byEmail("attendance"),
          byId("test_scores"),        byEmail("test_scores"),
          byId("results"),            byEmail("results"),
          byId("gradebook_scores"),   byEmail("gradebook_scores"),
          byId("submissions"),        byEmail("submissions"),
          byId("incidents"),          byEmail("incidents"),
          byId("parent_notes"),       byEmail("parent_notes"),
          byId("interventions"),      byEmail("interventions"),
          byId("enrollments"),        byEmail("enrollments"),
          byId("student_ratings"),    byEmail("student_ratings"),
          byId("improvement_areas"),  byEmail("improvement_areas"),
        ]);
        // Dedup across (student, day) — multi-class students may have
        // separate attendance docs (one per class) for the same day if
        // different teachers each marked them. Aggregation across classes
        // would otherwise double-count that day. Latest createdAt wins.
        setAttendance(dedupAttendanceByDay(merge(aI, aE)));
        // Three-way merge — the merge() helper dedups by doc-id so re-fetched
        // docs from email-fallback queries don't double up.
        setTestScores([...merge(sI, sE), ...merge(rI, rE), ...merge(gI, gE)]);
        setSubmissions(merge(subI, subE));
        setIncidents(merge(incI, incE));
        setParentNotes(merge(pnI, pnE));
        setInterventions(merge(ivI, ivE));
        setStudentRatings(merge(srI, srE));
        setImprovementAreas(merge(imI, imE));

        // Multi-class students: collect ALL classIds (not just the first one)
        // so we surface assignments from every class they're enrolled in.
        // The previous single-classId path silently dropped 50% of work
        // for any student in 2+ classes.
        const enrolList = merge(enrI, enrE);
        const classIds = new Set<string>();
        if (sd.classId) classIds.add(String(sd.classId));
        enrolList.forEach((e: any) => { if (e.classId) classIds.add(String(e.classId)); });

        if (classIds.size > 0) {
          // Firestore `in` operator caps at 30 values — safe for a single
          // student who would never realistically be in that many classes.
          const idArr = Array.from(classIds).slice(0, 30);
          const asSnap = await getDocs(query(
            collection(db, "assignments"),
            ...scopeC,
            where("classId", "in", idArr),
          ));
          setAssignments(asSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (e) { console.error("StudentProfile fetch error:", e); }
      finally { setLoading(false); }
    };
    run();
  }, [studentId, userData?.schoolId, userData?.branchId]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const m = useMemo(() => {
    const tot = attendance.length;
    const pres = attendance.filter(r => r.status === "present").length;
    const late = attendance.filter(r => r.status === "late").length;
    const abs = tot - pres - late;
    const attRate = tot > 0 ? ((pres + late) / tot) * 100 : 0;

    // Use pctOfDoc — returns null for missing scores so we can skip them
    // instead of zero-defaulting (which used to drag every average down).
    const vals = testScores.map(pctOfDoc).filter((n): n is number => n !== null);
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

    const subScores: Record<string, number> = {};
    const subCounts: Record<string, number> = {};
    testScores.forEach(t => {
      const p = pctOfDoc(t);
      if (p === null) return;
      const sub = (t.subject || t.subjectName || "General").toUpperCase();
      subScores[sub] = (subScores[sub] || 0) + p;
      subCounts[sub] = (subCounts[sub] || 0) + 1;
    });
    Object.keys(subScores).forEach(k => { subScores[k] = Math.round(subScores[k] / subCounts[k]); });

    // Trend — last-3 vs prior-3. The previous filter dropped NaN but kept
    // zeros, so a missing-score doc would be counted as 0 and tank the
    // recent average. pctOfDoc returns null for missing data → skipped.
    const sorted = [...testScores].sort((a, b) => (toDate(b.timestamp || b.createdAt)?.getTime() || 0) - (toDate(a.timestamp || a.createdAt)?.getTime() || 0));
    const r3 = sorted.slice(0, 3).map(pctOfDoc).filter((n): n is number => n !== null);
    const p3 = sorted.slice(3, 6).map(pctOfDoc).filter((n): n is number => n !== null);
    const rAvg = r3.length ? r3.reduce((a, b) => a + b, 0) / r3.length : 0;
    const pAvg = p3.length ? p3.reduce((a, b) => a + b, 0) / p3.length : 0;
    const trend: "up" | "down" | "flat" = rAvg - pAvg >= 5 ? "up" : pAvg - rAvg >= 5 ? "down" : "flat";

    // Monthly aggregation — months with NO data return `null` for that
    // metric. Recharts skips null points (gap rendering) instead of
    // dropping the line all the way to 0% — which previously made empty
    // months look like a catastrophic crash in performance/attendance.
    const now = new Date();
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const mAtt = attendance.filter(r => { const dt = toDate(r.date); return dt && dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear(); });
      const mSc = testScores.filter(t => { const dt = toDate(t.timestamp || t.createdAt); return dt && dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear(); });
      const mP = mAtt.filter(r => r.status === "present" || r.status === "late").length;
      const attP: number | null = mAtt.length > 0 ? (mP / mAtt.length) * 100 : null;
      const sV = mSc.map(pctOfDoc).filter((n): n is number => n !== null);
      const scP: number | null = sV.length > 0 ? sV.reduce((a, b) => a + b, 0) / sV.length : null;
      return {
        month: MONTHS[d.getMonth()],
        score: scP !== null ? Math.round(scP) : null,
        attendance: attP !== null ? Math.round(attP) : null,
      };
    });

    const subCount = submissions.length;
    const asgCount = assignments.length;
    const completion = asgCount > 0 ? (subCount / asgCount) * 100 : 0;
    const days = new Set(attendance.map(a => toDate(a.date)?.toDateString())).size;

    return { tot, pres, late, abs, attRate, avg, subScores, trend, monthly, subCount, asgCount, completion, days, usableScoreCount: vals.length };
  }, [attendance, testScores, submissions, assignments]);

  // Sort parent notes by createdAt DESC once — all three display sites
  // (Parent Communication, Teacher Observations, Communications) need newest
  // first. MUST live above the loading/not-found early returns so React's
  // hook count stays consistent across renders (Rules of Hooks).
  const sortedParentNotes = useMemo(() =>
    [...parentNotes].sort((a, b) =>
      (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0),
    ),
  [parentNotes]);

  // Risk
  const overallRisk = Math.round((Math.max(0, 100 - m.attRate) + Math.max(0, 100 - m.avg) + Math.max(0, 100 - m.completion) + Math.min(100, incidents.length * 25)) / 4);
  const riskLevel = overallRisk < 20 ? "STABLE" : overallRisk < 45 ? "MONITOR" : overallRisk < 70 ? "ELEVATED" : "CRITICAL";
  const riskColor = overallRisk < 20 ? T.grn : overallRisk < 45 ? T.amb : T.red;

  // Subject entries + radar data
  const subEntries = Object.entries(m.subScores);
  const radarData = subEntries.map(([sub, sc]) => ({ subject: sub.slice(0, 10), score: sc, fullMark: 100 }));

  // Calendar
  const calYear = calMonth.getFullYear();
  const calMon = calMonth.getMonth();
  const firstDay = new Date(calYear, calMon, 1).getDay();
  const daysInMonth = new Date(calYear, calMon + 1, 0).getDate();
  const calDays = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDay + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    const d = new Date(calYear, calMon, dayNum);
    // Use local-date key — the previous toISOString() comparison shifted
    // dates by one in IST (midnight Jan 1 IST = Dec 31 UTC), painting
    // attendance dots on the wrong calendar cells.
    const dateStr = ymd(d);
    const rec = attendance.find(a => {
      const ad = toDate(a.date);
      return ad && ymd(ad) === dateStr;
    });
    return { dayNum, date: d, status: rec?.status || null };
  });
  const calPresent = attendance.filter(a => { const d = toDate(a.date); return d && d.getMonth() === calMon && d.getFullYear() === calYear && a.status === "present"; }).length;
  const calLate = attendance.filter(a => { const d = toDate(a.date); return d && d.getMonth() === calMon && d.getFullYear() === calYear && a.status === "late"; }).length;
  const calAbsent = attendance.filter(a => { const d = toDate(a.date); return d && d.getMonth() === calMon && d.getFullYear() === calYear && a.status === "absent"; }).length;

  // ── Loading / Not found ────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 10 }}>
      <Loader2 className="animate-spin" size={20} color={T.blue} /><span style={{ fontSize: 13, color: T.ink3 }}>Loading student profile...</span>
    </div>
  );
  if (!student) return (
    <div style={{ textAlign: "center", padding: 64 }}>
      <AlertCircle size={40} color={T.red} style={{ margin: "0 auto 12px" }} />
      <p style={{ fontSize: 16, fontWeight: 600, color: T.ink, marginBottom: 6 }}>Student not found</p>
      <button onClick={() => navigate("/students")} style={{ padding: "8px 20px", borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.white, color: T.blue, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>← Back to students</button>
    </div>
  );

  const initials = (student.name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const today = new Date();

  // Score history (most recent first — used by the table below)
  const scoreHistory = [...testScores]
    .sort((a, b) => (toDate(b.timestamp || b.createdAt)?.getTime() || 0) - (toDate(a.timestamp || a.createdAt)?.getTime() || 0))
    .slice(0, 6);

  // Bar chart wants chronological order (oldest → newest, left → right).
  // The previous code did `scoreHistory.reverse()` which MUTATED the array,
  // so the table further down then showed oldest-first instead of newest.
  // `.slice().reverse()` keeps both views correct. Tests with no usable
  // score are FILTERED OUT — drawing a 0% bar for missing data was
  // misleading (suggested the student scored zero on a real test).
  const barChartData = scoreHistory
    .slice()
    .reverse()
    .map(t => ({
      name: (t.subject || t.subjectName || "TEST").slice(0, 8),
      score: pctOfDoc(t),
    }))
    .filter((r): r is { name: string; score: number } => r.score !== null);

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: isMobile ? "14px 12px 80px" : "20px 24px 60px", fontFamily: "'Inter','Plus Jakarta Sans',-apple-system,sans-serif" }}>

      {/* ═══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 14 : 24, gap: 8 }}>
        <button onClick={() => navigate("/students")} aria-label="Return to students" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "7px 12px" : "8px 16px", borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.white, color: T.ink2, fontSize: isMobile ? 11 : 13, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>
          <ArrowLeft size={isMobile ? 13 : 14} /> {isMobile ? "BACK" : "RETURN"}
        </button>
        <div style={{ display: "flex", gap: isMobile ? 6 : 8 }}>
          <button onClick={() => window.print()} aria-label="Export profile as PDF" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "7px 12px" : "8px 16px", borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.white, color: T.ink2, fontSize: isMobile ? 11 : 12, fontWeight: 500, cursor: "pointer" }}>
            <Printer size={isMobile ? 12 : 13} /> {isMobile ? "PDF" : "EXPORT"}
          </button>
          <button onClick={() => navigate("/parent-communication")} aria-label="Contact parent" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "7px 12px" : "8px 16px", borderRadius: 10, border: "none", background: T.blue, color: "#fff", fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: "pointer" }}>
            <MessageSquare size={isMobile ? 12 : 13} /> CONTACT
          </button>
        </div>
      </div>

      {/* ═══ HERO: 3-COLUMN — Left stats | Center photo | Right cards ═══════
           Mobile: stack to a single column with the photo/identity FIRST
           (so principals see who they're looking at without scrolling), then
           the left and right card stacks below. CSS `order` handles the
           reorder without needing to duplicate JSX. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px 1fr", gap: isMobile ? 12 : 20, marginBottom: isMobile ? 14 : 20 }}>

        {/* ── LEFT: Academic + Attendance + Subject Mastery ──────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 12 : 16, order: isMobile ? 2 : 0 }}>
          {/* Academic Performance */}
          <Card title="Academic Performance" theme="blue" icon={GraduationCap} watermark={GraduationCap}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div style={{ position: "relative", width: 64, height: 64 }}>
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke={T.s2} strokeWidth="6" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke={T.blue} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 26} strokeDashoffset={2 * Math.PI * 26 * (1 - m.avg / 100)} transform="rotate(-90 32 32)"
                    style={{ transition: "stroke-dashoffset 1s ease" }} />
                </svg>
                {/* Show CGPA on a 10 scale (Indian-school convention) instead
                    of the previous 4.0 GPA scale which doesn't apply here.
                    Hidden when there are no usable scores so we don't print "0.0". */}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: T.blue }}>
                  {m.usableScoreCount === 0 ? "—" : (m.avg / 10).toFixed(1)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: T.ink }}>
                  {m.usableScoreCount === 0 ? "—" : `${Math.round(m.avg)}%`}
                </div>
                <div style={{ fontSize: 11, color: T.ink3, display: "flex", alignItems: "center", gap: 4 }}>
                  {/* Count matches the AVG it labels — was showing total
                      tests (incl. ones with no score) which made the math
                      look wrong. */}
                  Avg Score // {m.usableScoreCount} test{m.usableScoreCount === 1 ? "" : "s"} graded
                  {m.trend === "up" && <TrendingUp size={12} color={T.grn} />}
                  {m.trend === "down" && <TrendingUp size={12} color={T.red} style={{ transform: "scaleY(-1)" }} />}
                </div>
              </div>
            </div>
            {subEntries.slice(0, 5).map(([sub, sc]) => (
              <div key={sub} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.ink3, width: 100, flexShrink: 0 }}>{sub}</span>
                <div style={{ flex: 1, height: 6, background: T.s1, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${sc}%`, background: sc >= 75 ? T.blue : sc >= 50 ? T.amb : T.red, borderRadius: 3, transition: "width 1s ease" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: sc >= 75 ? T.blue : sc >= 50 ? T.amb : T.red, width: 30, textAlign: "right" }}>{sc}</span>
              </div>
            ))}
          </Card>

          {/* Attendance */}
          <Card title="Attendance" theme="gold" icon={CalendarCheck} watermark={Calendar}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", width: 72, height: 72 }}>
                <svg width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="28" fill="none" stroke={T.s2} strokeWidth="7" />
                  <circle cx="36" cy="36" r="28" fill="none"
                    stroke={m.attRate >= 85 ? T.grn : m.attRate >= 70 ? T.amb : T.red}
                    strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - m.attRate / 100)}
                    transform="rotate(-90 36 36)" style={{ transition: "stroke-dashoffset 1s ease" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: m.attRate >= 85 ? T.grn : T.amb }}>{Math.round(m.attRate)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>Present</div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>Late: {m.late} // Abs: {m.abs}</div>
                <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{m.pres + m.late} / {m.tot} days</div>
              </div>
            </div>
          </Card>

          {/* Subject Mastery */}
          <Card title="Subject Mastery" action={<DetailLink />} theme="violet" icon={BookOpen} watermark={BookOpen}>
            {radarData.length >= 3 && (
              <div style={{ marginBottom: 12 }}>
                <SubjectMasteryRadar data={radarData} color={T.blue} height={200} />
              </div>
            )}
            {subEntries.map(([sub, sc]) => (
              <div key={sub} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: T.ink3, width: 90, flexShrink: 0 }}>{sub}</span>
                <div style={{ flex: 1, height: 6, background: T.s1, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${sc}%`, background: sc >= 75 ? T.blue : sc >= 50 ? T.grn : T.red, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, width: 28, textAlign: "right" }}>{sc}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* ── CENTER: Student Photo + Identity ──────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: isMobile ? 4 : 20, order: isMobile ? 1 : 0 }}>
          <div style={{ width: isMobile ? 100 : 140, height: isMobile ? 100 : 140, borderRadius: "50%", border: `${isMobile ? 3 : 4}px solid ${T.blue}`, background: T.blBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: isMobile ? 10 : 16, boxShadow: "0 8px 30px rgba(59,91,219,0.15)" }}>
            <span style={{ fontSize: isMobile ? 32 : 42, fontWeight: 800, color: T.blue }}>{initials}</span>
          </div>
          <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: T.ink, textAlign: "center", marginBottom: 4, padding: "0 8px" }}>{student.name}</h2>
          <p style={{ fontSize: 12, color: T.ink3, textAlign: "center", marginBottom: 4 }}>{student.className || student.class || "—"}</p>
          <p style={{ fontSize: 11, color: T.ink3, textAlign: "center", marginBottom: isMobile ? 10 : 12 }}>Roll: {student.rollNo || student.roll || "—"} // ID: {(student.id || "").slice(0, 6).toUpperCase()}</p>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ padding: "4px 12px", borderRadius: 20, background: T.glBg, color: T.grn, fontSize: 10, fontWeight: 600 }}>ACTIVE</span>
            <span style={{ padding: "4px 12px", borderRadius: 20, background: riskColor === T.grn ? T.glBg : riskColor === T.amb ? T.alBg : T.rlBg, color: riskColor, fontSize: 10, fontWeight: 600 }}>{riskLevel}</span>
          </div>
        </div>

        {/* ── RIGHT: Behaviour + AI Intelligence + Parent Comms + Teacher Obs ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 12 : 16, order: isMobile ? 3 : 0 }}>
          {/* Behaviour Record */}
          <Card title="Behaviour Record" action={<DetailLink />} theme="red" icon={Shield} watermark={AlertCircle}>
            {incidents.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.glBg, borderRadius: 10 }}>
                <CheckCircle2 size={14} color={T.grn} /><span style={{ fontSize: 12, color: T.grn, fontWeight: 500 }}>No incidents recorded</span>
              </div>
            ) : incidents.slice(0, 3).map(inc => (
              <div key={inc.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.s2}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.red, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.red }}>{(inc.type || "INCIDENT").toUpperCase()}</span>
                  <p style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{(inc.description || inc.content || "").slice(0, 80)}</p>
                </div>
              </div>
            ))}
          </Card>

          {/* AI Intelligence — trend-aware projection. The previous formula
              always nudged the prediction UP regardless of trend, which
              contradicted the "declining" copy below. Now the next-score
              projection moves WITH the trend so the number and the sentence
              tell the same story. */}
          <Card title="AI Intelligence" action={<DetailLink />} theme="violet" icon={Brain} watermark={Brain}>
            {(() => {
              const noData = m.usableScoreCount === 0;
              const drift = m.trend === "up" ? +3 : m.trend === "down" ? -4 : 0;
              const projected = noData ? null : Math.max(0, Math.min(100, Math.round(m.avg + drift)));
              return (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: T.ink3 }}>Projected next score:</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: T.pur }}>
                      {projected === null ? "—" : `${projected}%`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.ink3, lineHeight: 1.6 }}>
                    {noData
                      ? "Not enough graded tests yet to project performance."
                      : m.trend === "up"   ? "Performance trend is positive. Student shows consistent growth."
                      : m.trend === "down" ? "Performance is declining. Intervention may be needed."
                      : "Performance is stable. Encourage continued effort."}
                  </div>
                </>
              );
            })()}
          </Card>

          {/* Parent Communication */}
          <Card title="Parent Communication" action={<DetailLink />} theme="green" icon={MessageSquare} watermark={MessageSquare}>
            {parentNotes.length === 0 ? (
              <p style={{ fontSize: 12, color: T.ink3, textAlign: "center", padding: "8px 0" }}>No messages yet</p>
            ) : sortedParentNotes.slice(0, 2).map(n => (
              <div key={n.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.s2}` }}>
                <div style={{ fontSize: 10, color: isTeacherNote(n) ? T.blue : T.grn, fontWeight: 600, marginBottom: 2 }}>
                  {isTeacherNote(n) ? (n.teacherName || "TEACHER") : "PARENT"} // {timeAgo(n.createdAt)}
                </div>
                <p style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, margin: 0 }}>{(n.content || n.message || "").slice(0, 100)}</p>
              </div>
            ))}
          </Card>

          {/* Teacher Observations — show the LATEST teacher note, not just
              the first one in array order (which was effectively random). */}
          <Card title="Teacher Observations" theme="blue" icon={Users} watermark={Users}>
            {(() => {
              // sortedParentNotes is already DESC by createdAt — just filter
              // for teacher-authored entries via the case-insensitive helper.
              const teacherNotes = sortedParentNotes.filter(isTeacherNote);
              if (teacherNotes.length === 0) {
                return <p style={{ fontSize: 12, color: T.ink3, textAlign: "center" }}>No observations yet</p>;
              }
              const latest = teacherNotes[0];
              return (
                <div style={{ padding: "10px 14px", background: T.blBg, borderLeft: `3px solid ${T.blue}`, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: T.ink2, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                    "{(latest.content || latest.message || "").slice(0, 150)}"
                  </p>
                  <p style={{ fontSize: 10, color: T.ink3, marginTop: 6 }}>
                    — {latest.teacherName || "Teacher"} · {timeAgo(latest.createdAt)}
                  </p>
                </div>
              );
            })()}
          </Card>
        </div>
      </div>

      {/* ═══ 4 BRIGHT STAT CARDS — same vibe as Dashboard.tsx ═════════════════
           Mirrors the Dashboard's primary KPI strip (pastel gradient card +
           solid icon badge + huge number + watermark icon) so the principal
           sees a familiar at-a-glance summary without scrolling deep cards.
           Card 1 → Academic score (blue)
           Card 2 → Attendance % (gold)
           Card 3 → Assignment completion (green)
           Card 4 → Risk level (red/violet) */}
      <div
        style={{
          display: "grid",
          // Inline gridTemplateColumns wins over the Tailwind `md:grid-cols-4`
          // class — must drive the breakpoint switch from `isMobile` instead.
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 14 : 20,
        }}
      >
        {/* Academic Score — blue */}
        <div
          {...tilt3D}
          style={{
            padding: isMobile ? 14 : 20,
            borderRadius: isMobile ? 16 : 20,
            background: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
            border: `0.5px solid ${T.bdr}`,
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)",
            position: "relative",
            overflow: "hidden",
            ...tilt3DStyle,
          }}
        >
          <div
            style={{
              width: isMobile ? 40 : 56,
              height: isMobile ? 40 : 56,
              borderRadius: isMobile ? 12 : 14,
              background: "linear-gradient(135deg, #0055FF, #1166FF)",
              boxShadow: "0 4px 14px rgba(0,85,255,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: isMobile ? 8 : 12,
            }}
          >
            <GraduationCap size={isMobile ? 20 : 26} color="#fff" strokeWidth={2.3} />
          </div>
          <div style={{ fontSize: isMobile ? 9 : 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T.ink3, marginBottom: isMobile ? 4 : 6 }}>
            Academic
          </div>
          <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 700, color: T.blue, letterSpacing: "-1.2px", lineHeight: 1, marginBottom: isMobile ? 4 : 6 }}>
            {m.usableScoreCount === 0 ? "—" : `${Math.round(m.avg)}%`}
          </div>
          <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, color: T.ink2 }}>
            {/* Match the AVG calc — graded tests only, not raw test count. */}
            {m.usableScoreCount} graded · {m.trend === "up" ? "↑ up" : m.trend === "down" ? "↓ decline" : "→ stable"}
          </div>
          <GraduationCap
            size={isMobile ? 40 : 56}
            strokeWidth={2}
            style={{ position: "absolute", bottom: isMobile ? 8 : 12, right: isMobile ? 8 : 12, color: T.blue, opacity: 0.18, pointerEvents: "none" }}
          />
        </div>

        {/* Attendance — gold */}
        <div
          {...tilt3D}
          style={{
            padding: isMobile ? 14 : 20,
            borderRadius: isMobile ? 16 : 20,
            background: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
            border: `0.5px solid ${T.bdr}`,
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)",
            position: "relative",
            overflow: "hidden",
            ...tilt3DStyle,
          }}
        >
          <div
            style={{
              width: isMobile ? 40 : 56,
              height: isMobile ? 40 : 56,
              borderRadius: isMobile ? 12 : 14,
              background: "linear-gradient(135deg, #FFAA00, #FFDD44)",
              boxShadow: "0 4px 14px rgba(255,170,0,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: isMobile ? 8 : 12,
            }}
          >
            <CalendarCheck size={isMobile ? 20 : 26} color="#fff" strokeWidth={2.3} />
          </div>
          <div style={{ fontSize: isMobile ? 9 : 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T.ink3, marginBottom: isMobile ? 4 : 6 }}>
            Attendance
          </div>
          <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 700, color: "#FFAA00", letterSpacing: "-1.2px", lineHeight: 1, marginBottom: isMobile ? 4 : 6 }}>
            {m.tot === 0 ? "—" : `${Math.round(m.attRate)}%`}
          </div>
          <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, color: T.ink2 }}>
            {m.pres + m.late} / {m.tot} day{m.tot === 1 ? "" : "s"}
          </div>
          <BarChart3
            size={isMobile ? 40 : 56}
            strokeWidth={2}
            style={{ position: "absolute", bottom: isMobile ? 8 : 12, right: isMobile ? 8 : 12, color: "#FFAA00", opacity: 0.22, pointerEvents: "none" }}
          />
        </div>

        {/* Assignment completion — green */}
        <div
          {...tilt3D}
          style={{
            padding: isMobile ? 14 : 20,
            borderRadius: isMobile ? 16 : 20,
            background: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
            border: `0.5px solid ${T.bdr}`,
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)",
            position: "relative",
            overflow: "hidden",
            ...tilt3DStyle,
          }}
        >
          <div
            style={{
              width: isMobile ? 40 : 56,
              height: isMobile ? 40 : 56,
              borderRadius: isMobile ? 12 : 14,
              background: "linear-gradient(135deg, #00C853, #22EE66)",
              boxShadow: "0 4px 14px rgba(0,200,83,0.26)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: isMobile ? 8 : 12,
            }}
          >
            <CheckCircle2 size={isMobile ? 20 : 26} color="#fff" strokeWidth={2.3} />
          </div>
          <div style={{ fontSize: isMobile ? 9 : 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T.ink3, marginBottom: isMobile ? 4 : 6 }}>
            Submissions
          </div>
          <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 700, color: "#007830", letterSpacing: "-1.2px", lineHeight: 1, marginBottom: isMobile ? 4 : 6 }}>
            {m.asgCount === 0 ? "—" : `${Math.round(m.completion)}%`}
          </div>
          <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, color: "#007830" }}>
            {m.subCount} of {m.asgCount}
          </div>
          <TrendingUp
            size={isMobile ? 40 : 56}
            strokeWidth={2}
            style={{ position: "absolute", bottom: isMobile ? 8 : 12, right: isMobile ? 8 : 12, color: "#00C853", opacity: 0.22, pointerEvents: "none" }}
          />
        </div>

        {/* Risk Level — red when elevated, violet when stable */}
        <div
          {...tilt3D}
          style={{
            padding: isMobile ? 14 : 20,
            borderRadius: isMobile ? 16 : 20,
            background: overallRisk >= 45
              ? "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)"
              : "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            border: `0.5px solid ${T.bdr}`,
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)",
            position: "relative",
            overflow: "hidden",
            ...tilt3DStyle,
          }}
        >
          <div
            style={{
              width: isMobile ? 40 : 56,
              height: isMobile ? 40 : 56,
              borderRadius: isMobile ? 12 : 14,
              background: overallRisk >= 45
                ? "linear-gradient(135deg, #FF3355, #FF6688)"
                : "linear-gradient(135deg, #7B3FF4, #A07CF8)",
              boxShadow: overallRisk >= 45
                ? "0 4px 14px rgba(255,51,85,0.28)"
                : "0 4px 14px rgba(123,63,244,0.26)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: isMobile ? 8 : 12,
            }}
          >
            <ShieldAlert size={isMobile ? 20 : 26} color="#fff" strokeWidth={2.3} />
          </div>
          <div style={{ fontSize: isMobile ? 9 : 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T.ink3, marginBottom: isMobile ? 4 : 6 }}>
            Risk Level
          </div>
          <div
            style={{
              fontSize: isMobile ? 18 : 28,
              fontWeight: 700,
              color: overallRisk >= 45 ? "#FF3355" : T.pur,
              letterSpacing: "-0.8px",
              lineHeight: 1,
              marginBottom: isMobile ? 4 : 6,
            }}
          >
            {riskLevel}
          </div>
          <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, color: overallRisk >= 45 ? "#FF3355" : T.ink2 }}>
            {overallRisk}/100 · {incidents.length} inc.
          </div>
          <Shield
            size={isMobile ? 40 : 56}
            strokeWidth={2}
            style={{ position: "absolute", bottom: isMobile ? 8 : 12, right: isMobile ? 8 : 12, color: overallRisk >= 45 ? "#FF3355" : T.pur, opacity: 0.22, pointerEvents: "none" }}
          />
        </div>
      </div>

      {/* ═══ PERFORMANCE TIMELINE (full width) ════════════════════════════════ */}
      <Card title="Performance Timeline" action={<DetailLink />} theme="blue" icon={TrendingUp} watermark={Activity} style={{ marginBottom: isMobile ? 14 : 20 }}>
        <div style={{ height: isMobile ? 160 : 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={m.monthly}>
              <defs>
                <linearGradient id="blGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.blue} stopOpacity={0.15} /><stop offset="95%" stopColor={T.blue} stopOpacity={0} /></linearGradient>
                <linearGradient id="gnGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.grn} stopOpacity={0.15} /><stop offset="95%" stopColor={T.grn} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.s2} />
              <XAxis dataKey="month" tick={{ fill: T.ink3, fontSize: 11 }} axisLine={{ stroke: T.s2 }} />
              <YAxis tick={{ fill: T.ink3, fontSize: 11 }} axisLine={{ stroke: T.s2 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: T.white, border: `1px solid ${T.bdr}`, borderRadius: 8, fontSize: 12 }} />
              {/* connectNulls=false → empty months render as gaps, not zero
                  drops. Same pattern Owner BranchesComparison uses. */}
              <Area type="monotone" dataKey="score"      stroke={T.blue} fill="url(#blGrad)" strokeWidth={2.5} connectNulls={false} />
              <Area type="monotone" dataKey="attendance" stroke={T.grn}  fill="url(#gnGrad)" strokeWidth={2}   connectNulls={false} strokeDasharray="5 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ═══ ASSIGNMENTS + RISK ASSESSMENT (2 col) ════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20, marginBottom: isMobile ? 14 : 20 }}>
        {/* Assignments */}
        <Card title={`Assignments · ${m.subCount}/${m.asgCount}`} action={<span style={{ fontSize: 11, color: T.blue, fontWeight: 500, cursor: "pointer" }}>View All →</span>} theme="green" icon={CheckCircle2} watermark={FileText}>
          {[...assignments].sort((a, b) => (toDate(b.dueDate)?.getTime() || 0) - (toDate(a.dueDate)?.getTime() || 0)).slice(0, 5).map(a => {
            const sub = submissions.find((s: any) => s.assignmentId === a.id);
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.s2}` }}>
                <CheckCircle2 size={14} color={sub ? T.grn : T.ink3} />
                <span style={{ fontSize: 13, color: T.ink, flex: 1 }}>{(a.title || "Assignment").slice(0, 35)}</span>
              </div>
            );
          })}
          {assignments.length === 0 && <p style={{ fontSize: 12, color: T.ink3, textAlign: "center" }}>No assignments</p>}
        </Card>

        {/* Risk Assessment */}
        <Card title="Risk Assessment" action={<DetailLink />} theme="red" icon={ShieldAlert} watermark={Shield}>
          <div style={{ fontSize: 22, fontWeight: 800, color: riskColor, marginBottom: 14 }}>{riskLevel}</div>
          {(() => {
            // Behavioural "score" — start at 100 (no incidents = perfect),
            // subtract 20 per incident, floor at 0. Gives a visible bar even
            // when incidents > 0 (the previous `val: -1` rendered an EMPTY
            // bar, hiding the severity behind a tiny "X Events" label).
            const behaviourVal = Math.max(0, 100 - incidents.length * 20);
            const behaviourColor =
              incidents.length === 0 ? T.blue :
              behaviourVal >= 60    ? T.amb  : T.red;
            return [
              { label: "ATTENDANCE", val: m.attRate,    color: m.attRate    >= 85 ? T.blue : T.amb },
              { label: "ACADEMIC",   val: m.avg,        color: m.avg        >= 75 ? T.blue : m.avg >= 50 ? T.amb : T.red },
              { label: "SUBMISSION", val: m.completion, color: m.completion >= 80 ? T.blue : T.amb },
              { label: "BEHAVIOURAL", val: behaviourVal, color: behaviourColor,
                extra: incidents.length > 0 ? `${incidents.length} event${incidents.length === 1 ? "" : "s"}` : undefined },
            ];
          })().map(r => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: T.ink3, width: 100, flexShrink: 0 }}>{r.label}</span>
              <div style={{ flex: 1, height: 6, background: T.s1, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${r.val}%`, background: r.color, borderRadius: 3, transition: "width 1s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: r.color, width: 70, textAlign: "right" }}>
                {r.extra || `${Math.round(r.val)}%`}
              </span>
            </div>
          ))}
        </Card>
      </div>

      {/* ═══ ATTENDANCE CALENDAR + SUPPORT ACTIONS (2 col) ════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20, marginBottom: isMobile ? 14 : 20 }}>
        {/* Calendar */}
        <Card title="Attendance Calendar" action={<span style={{ fontSize: 11, color: T.ink3 }}>Daily attendance record</span>} theme="gold" icon={Calendar} watermark={CalendarCheck}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 }}>
            <button onClick={() => setCalMonth(new Date(calYear, calMon - 1))} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink3 }}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{MONTHS[calMon]} {calYear}</span>
            <button onClick={() => setCalMonth(new Date(calYear, calMon + 1))} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink3 }}><ChevronRight size={16} /></button>
          </div>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ textAlign: "center", padding: "10px 0", background: T.glBg, borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.grn }}>{calPresent}</div><div style={{ fontSize: 10, color: T.grn }}>PRESENT</div>
            </div>
            <div style={{ textAlign: "center", padding: "10px 0", background: T.alBg, borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.amb }}>{calLate}</div><div style={{ fontSize: 10, color: T.amb }}>LATE</div>
            </div>
            <div style={{ textAlign: "center", padding: "10px 0", background: T.rlBg, borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.red }}>{calAbsent}</div><div style={{ fontSize: 10, color: T.red }}>ABSENT</div>
            </div>
          </div>
          {/* Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} style={{ fontSize: 10, fontWeight: 600, color: T.ink3, padding: "4px 0" }}>{d}</div>
            ))}
            {calDays.map((d, i) => {
              if (!d) return <div key={i} />;
              const isToday = d.date.toDateString() === today.toDateString();
              const bg = d.status === "present" ? T.grn : d.status === "late" ? T.amb : d.status === "absent" ? T.red : "transparent";
              const isWknd = d.date.getDay() === 0 || d.date.getDay() === 6;
              return (
                <div key={i} style={{
                  width: 32, height: 32, borderRadius: isToday ? "50%" : 8, margin: "0 auto",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: isToday ? 700 : 400,
                  color: d.status ? "#fff" : isWknd ? T.ink3 : T.ink,
                  background: isToday && !d.status ? T.blue : bg,
                  ...(isToday && !d.status ? { color: "#fff" } : {}),
                }}>
                  {d.dayNum}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 14, marginTop: 12, justifyContent: "center" }}>
            {[{ c: T.grn, l: "Present" }, { c: T.amb, l: "Late" }, { c: T.red, l: "Absent" }, { c: T.s2, l: "Weekend" }, { c: "transparent", l: "No Data" }].map(x => (
              <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: x.c, border: x.c === "transparent" ? `1px solid ${T.s2}` : "none" }} />
                <span style={{ fontSize: 10, color: T.ink3 }}>{x.l}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Support Actions */}
        <Card title="Support Actions" action={<DetailLink />} theme="violet" icon={Activity} watermark={Shield}>
          {interventions.length === 0 ? (
            <p style={{ fontSize: 12, color: T.ink3, textAlign: "center", padding: "20px 0" }}>No active interventions</p>
          ) : interventions.map(iv => (
            <div key={iv.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: `1px solid ${T.s2}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: iv.status === "completed" ? T.grn : T.amb, marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.ink3, marginBottom: 2 }}>{timeAgo(iv.createdAt)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{iv.actionTitle || iv.title || "Intervention"}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, background: T.blBg, color: T.blue, fontSize: 10, fontWeight: 600 }}>{(iv.actionType || iv.type || "GENERAL").toUpperCase()}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 4, background: iv.status === "completed" ? T.glBg : T.alBg, color: iv.status === "completed" ? T.grn : T.amb, fontSize: 10, fontWeight: 600 }}>{iv.status === "completed" ? "Complete" : "Active"}</span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: T.ink3, flexShrink: 0 }}>{iv.assignedTo || ""}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* ═══ BOTTOM: Subject Mastery + Incidents + Overview (3 col) ════════════
           Only 2 cards actually render here (radar duplicate is skipped per
           the comment below). Desktop uses 2-col, mobile stacks. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20, marginBottom: isMobile ? 14 : 20 }}>
        {/* Already covered in left column - skip radar duplicate */}
        {/* Incidents */}
        <Card title="Incidents" action={<DetailLink />} theme="red" icon={AlertCircle} watermark={AlertCircle}>
          {incidents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <CheckCircle2 size={24} color={T.grn} style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: T.grn, fontWeight: 500 }}>No incidents on record</p>
            </div>
          ) : incidents.map(inc => (
            <div key={inc.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.s2}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.red }}>• {(inc.type || "INCIDENT").toUpperCase()}</span>
                <span style={{ fontSize: 10, color: T.ink3 }}>{timeAgo(inc.createdAt || inc.date)}</span>
              </div>
              <p style={{ fontSize: 11, color: T.ink2, marginTop: 4, lineHeight: 1.5 }}>{(inc.description || inc.content || "").slice(0, 120)}</p>
            </div>
          ))}
          {incidents.length > 0 && (
            <div style={{ textAlign: "center", padding: "10px 0", marginTop: 8, background: T.rlBg, borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: T.red, fontWeight: 500 }}>Total: {incidents.length} incident{incidents.length > 1 ? "s" : ""} recorded</span>
            </div>
          )}
        </Card>

        {/* Overview */}
        <Card title="Overview" action={<span style={{ fontSize: 11, color: T.blue, cursor: "pointer" }}>Dashboard →</span>} theme="blue" icon={BarChart3} watermark={Activity}>
          {[
            { icon: FileText, label: "TOTAL TESTS", val: testScores.length },
            { icon: BookOpen, label: "SUBJECTS TRACKED", val: subEntries.length },
            { icon: Calendar, label: "DAYS ON RECORD", val: m.days },
            { icon: Activity, label: "AVG ATTENDANCE", val: `${Math.round(m.attRate)}%` },
            { icon: BarChart3, label: "ASSIGNMENT RATE", val: `${Math.round(m.completion)}%` },
            { icon: MessageSquare, label: "PARENT NOTES", val: parentNotes.length },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.s2}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <item.icon size={14} color={T.ink3} />
                <span style={{ fontSize: 12, color: T.ink3 }}>{item.label}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{item.val}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* ═══ COMMUNICATIONS + SCORE HISTORY (2 col) ═══════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20, marginBottom: isMobile ? 14 : 20 }}>
        {/* Communications */}
        <Card title={`Communications · ${parentNotes.length} entries`} action={<span style={{ fontSize: 11, color: T.blue, cursor: "pointer" }}>View All →</span>} theme="green" icon={MessageSquare} watermark={MessageSquare}>
          {sortedParentNotes.slice(0, 3).map(n => {
            const teacher = isTeacherNote(n);
            return (
              <div key={n.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.s2}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{teacher ? (n.teacherName || "TEACHER") : "PARENT"}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 4, background: teacher ? T.blBg : T.glBg, color: teacher ? T.blue : T.grn, fontSize: 10, fontWeight: 600 }}>{teacher ? "FACULTY" : "PARENT"}</span>
                  <span style={{ fontSize: 10, color: T.ink3, marginLeft: "auto" }}>{timeAgo(n.createdAt)}</span>
                </div>
                <p style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, margin: 0 }}>{(n.content || n.message || "").slice(0, 120)}</p>
              </div>
            );
          })}
          {parentNotes.length === 0 && <p style={{ fontSize: 12, color: T.ink3, textAlign: "center", padding: "16px 0" }}>No communications</p>}
        </Card>

        {/* Score History */}
        <Card title={`Score History · ${testScores.length} records`} action={<span style={{ fontSize: 11, color: T.blue, cursor: "pointer" }}>View All →</span>} theme="blue" icon={FileText} watermark={BarChart3}>
          {barChartData.length > 0 && (
            <div style={{ height: 150, marginBottom: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.s2} />
                  <XAxis dataKey="name" tick={{ fill: T.ink3, fontSize: 9 }} axisLine={{ stroke: T.s2 }} />
                  <YAxis tick={{ fill: T.ink3, fontSize: 9 }} axisLine={{ stroke: T.s2 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: T.white, border: `1px solid ${T.bdr}`, borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="score" fill={T.blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Recent scores table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["SUBJECT", "DATE", "SCORE"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: T.ink3, fontWeight: 600, borderBottom: `1px solid ${T.s2}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {scoreHistory.map(t => {
                const d   = toDate(t.timestamp || t.createdAt);
                const pct = pctOfDoc(t);
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${T.s2}` }}>
                    <td style={{ padding: "8px", color: T.ink }}>{(t.subject || t.subjectName || "TEST").slice(0, 20)}</td>
                    <td style={{ padding: "8px", color: T.ink3 }}>{d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).toUpperCase() : "—"}</td>
                    {/* Don't show "0%" for missing data — em-dash is honest. */}
                    <td style={{ padding: "8px", fontWeight: 600, color: pct !== null ? T.blue : T.ink3 }}>
                      {pct !== null ? `${Math.round(pct)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* ═══ TEACHER RATINGS + IMPROVEMENT AREAS (cross-dashboard sync) ═══════
           Teacher writes via StudentBehaviour page — read here so principal
           sees the same data parents see. Single Firestore source of truth. */}
      {(studentRatings.length > 0 || improvementAreas.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20, marginBottom: isMobile ? 14 : 20 }}>
          {/* Teacher Ratings */}
          <Card title={`Teacher Ratings · ${studentRatings.length}`} action={<DetailLink />} theme="gold" icon={Star} watermark={Star}>
            {studentRatings.length === 0 ? (
              <p style={{ fontSize: 12, color: T.ink3, textAlign: "center", padding: "16px 0" }}>No teacher ratings yet</p>
            ) : (
              <>
                {(() => {
                  const valid = studentRatings.filter(r => typeof r.rating === "number");
                  const avg = valid.length > 0 ? valid.reduce((a, r) => a + r.rating, 0) / valid.length : null;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.s2}`, marginBottom: 6 }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: T.amb, letterSpacing: "-0.6px" }}>
                        {avg !== null ? avg.toFixed(1) : "—"}
                        <span style={{ fontSize: 14, color: T.ink3, fontWeight: 500 }}> / 5</span>
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        {[1,2,3,4,5].map(n => (
                          <Star key={n} size={14}
                            color={avg !== null && n <= Math.round(avg) ? T.amb : T.ink3}
                            fill={avg !== null && n <= Math.round(avg) ? T.amb : "transparent"} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: T.ink3, marginLeft: "auto" }}>avg of {valid.length}</span>
                    </div>
                  );
                })()}
                {[...studentRatings]
                  .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
                  .slice(0, 5)
                  .map(r => (
                  <div key={r.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.s2}` }}>
                    <div style={{ display: "flex", gap: 1, flexShrink: 0, marginTop: 3 }}>
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} size={11}
                          color={typeof r.rating === "number" && n <= r.rating ? T.amb : T.ink3}
                          fill={typeof r.rating === "number" && n <= r.rating ? T.amb : "transparent"} />
                      ))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {r.note && <p style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, margin: 0 }}>{r.note}</p>}
                      <div style={{ fontSize: 10, color: T.ink3, marginTop: 3 }}>
                        {r.teacherName || "Teacher"} · {timeAgo(r.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </Card>

          {/* Improvement Areas */}
          <Card title={`Improvement Areas · ${improvementAreas.length}`} action={<DetailLink />} theme="violet" icon={TrendingUp} watermark={TrendingUp}>
            {improvementAreas.length === 0 ? (
              <p style={{ fontSize: 12, color: T.ink3, textAlign: "center", padding: "16px 0" }}>No improvement areas tracked</p>
            ) : (
              <>
                {(() => {
                  const isResolved = (s?: string) => String(s || "").toLowerCase() === "resolved";
                  const active = improvementAreas.filter(i => !isResolved(i.status));
                  const resolved = improvementAreas.filter(i => isResolved(i.status));
                  return (
                    <div style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.s2}`, marginBottom: 6 }}>
                      <div style={{ flex: 1, padding: "6px 10px", background: T.s1, borderRadius: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: T.amb }}>{active.length}</div>
                        <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>ACTIVE</div>
                      </div>
                      <div style={{ flex: 1, padding: "6px 10px", background: T.s1, borderRadius: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: T.grn }}>{resolved.length}</div>
                        <div style={{ fontSize: 9, color: T.ink3, fontWeight: 600 }}>RESOLVED</div>
                      </div>
                    </div>
                  );
                })()}
                {[...improvementAreas]
                  .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
                  .slice(0, 5)
                  .map(imp => {
                    const resolved = String(imp.status || "").toLowerCase() === "resolved";
                    const pri = String(imp.priority || "low").toLowerCase();
                    const priColor = pri === "high" ? T.red : pri === "medium" ? T.amb : T.blue;
                    const priBg    = pri === "high" ? T.rlBg : pri === "medium" ? "rgba(255,136,0,0.10)" : T.blBg;
                    return (
                      <div key={imp.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.s2}`, opacity: resolved ? 0.6 : 1 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: resolved ? T.grn : "transparent", border: `1.5px solid ${resolved ? T.grn : T.bdr}`, flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {resolved && <CheckCircle2 size={11} color="#fff" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, textDecoration: resolved ? "line-through" : "none" }}>
                              {imp.title || "Untitled"}
                            </span>
                            <span style={{ padding: "1px 7px", borderRadius: 5, background: priBg, color: priColor, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                              {pri}
                            </span>
                          </div>
                          {imp.description && (
                            <p style={{ fontSize: 11, color: T.ink2, lineHeight: 1.4, margin: 0 }}>{imp.description}</p>
                          )}
                          <div style={{ fontSize: 10, color: T.ink3, marginTop: 3 }}>
                            {imp.teacherName || "Teacher"} · {timeAgo(imp.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                })}
              </>
            )}
          </Card>
        </div>
      )}

      {/* ═══ BOTTOM STATUS BAR ════════════════════════════════════════════════
           Mobile: flex-wrap so the 6 chips stack/wrap instead of overflowing
           past the viewport edge. Gap is the row spacing once wrapped. */}
      <div style={{ display: "flex", flexWrap: isMobile ? "wrap" : "nowrap", alignItems: "center", justifyContent: isMobile ? "flex-start" : "space-between", gap: isMobile ? "6px 12px" : 0, padding: isMobile ? "10px 14px" : "10px 20px", background: T.white, border: `1px solid ${T.bdr}`, borderRadius: 12, fontSize: 10, color: T.ink3 }}>
        <span>★ PARENT ENGAGEMENT: {Math.min(100, parentNotes.length * 20)}%</span>
        <span>★ Status: Active</span>
        <span>★ Data: Live</span>
        <span>★ Secured</span>
        <span>★ STUDENT ID: {(student.id || "").slice(0, 8).toUpperCase()}</span>
        <span style={{ color: T.blue, fontWeight: 600 }}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      </div>
    </div>
  );
};

export default StudentProfilePage;