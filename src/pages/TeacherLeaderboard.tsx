import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  collection, query, where, onSnapshot,
} from "firebase/firestore";
import {
  Trophy, Loader2, Users, Award, Crown,
  TrendingUp, Filter, ChevronDown, X, Search, Sparkles, BookOpen,
  AlertTriangle, Check, ChevronLeft, BarChart3, ChevronRight,
} from "lucide-react";
import {
  scoreTeachers, TeacherScore, TeacherDoc, ScoreDoc,
  AttendanceDoc, AssignmentDoc, TeacherAttendanceDoc,
} from "@/lib/teacherScorer";
import { useIsMobile } from "@/hooks/use-mobile";

type TimeRange = "term" | "month" | "all";

const TONE_CLASSES: Record<string, string> = {
  gold:    "bg-amber-50   text-amber-700   border-amber-200",
  blue:    "bg-blue-50    text-blue-700    border-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  violet:  "bg-violet-50  text-violet-700  border-violet-200",
  rose:    "bg-rose-50    text-rose-700    border-rose-200",
};

const initialsOf = (name?: string) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
};

const scoreTone = (n: number) =>
  n >= 80 ? "text-emerald-600" : n >= 60 ? "text-blue-600" : n >= 40 ? "text-amber-600" : "text-rose-600";

const scoreBgTone = (n: number) =>
  n >= 80 ? "bg-emerald-500" : n >= 60 ? "bg-blue-500" : n >= 40 ? "bg-amber-500" : "bg-rose-500";

function cutoffFor(range: TimeRange): Date | null {
  const now = new Date();
  if (range === "month") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (range === "term")  { const d = new Date(now); d.setDate(d.getDate() - 120); return d; }
  return null;
}

function filterByTime<T>(items: T[], cutoff: Date | null, keys: string[]): T[] {
  if (!cutoff) return items;
  const cutMs = cutoff.getTime();
  return items.filter((d: any) => {
    for (const k of keys) {
      const v = d[k];
      if (!v) continue;
      const ms = v?.toMillis?.() ?? (typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : new Date(v).getTime());
      if (Number.isFinite(ms) && ms >= cutMs) return true;
    }
    return false;
  });
}

// ═════════════════════════════════════════════════════════════════════════
export default function TeacherLeaderboard() {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const schoolId = userData?.schoolId as string | undefined;
  const branchId = userData?.branchId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherDoc[]>([]);
  const [testScores, setTestScores] = useState<ScoreDoc[]>([]);
  const [results, setResults] = useState<ScoreDoc[]>([]);
  const [gradebook, setGradebook] = useState<ScoreDoc[]>([]);
  const [attendance, setAttendance] = useState<AttendanceDoc[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDoc[]>([]);
  const [tAttendance, setTAttendance] = useState<TeacherAttendanceDoc[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachingAssignments, setTeachingAssignments] = useState<any[]>([]);

  const [classFilter, setClassFilter] = useState<string>("All");
  const [timeRange, setTimeRange] = useState<TimeRange>("term");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TeacherScore | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }

    let loadedCount = 0;
    const total = 9;
    const markLoaded = () => { loadedCount++; if (loadedCount >= total) setLoading(false); };

    // Build query with optional branchId scope
    const scoped = (col: string) => {
      const base = [where("schoolId", "==", schoolId)];
      if (branchId) base.push(where("branchId", "==", branchId));
      return query(collection(db, col), ...base);
    };

    const unsubs = [
      onSnapshot(scoped("teachers"),            (s) => { setTeachers(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("test_scores"),         (s) => { setTestScores(s.docs.map((d) => d.data() as ScoreDoc)); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("results"),             (s) => { setResults(s.docs.map((d) => d.data() as ScoreDoc)); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("gradebook_scores"),    (s) => { setGradebook(s.docs.map((d) => d.data() as ScoreDoc)); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("attendance"),          (s) => { setAttendance(s.docs.map((d) => d.data() as AttendanceDoc)); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("assignments"),         (s) => { setAssignments(s.docs.map((d) => d.data() as AssignmentDoc)); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("teacher_attendance"),  (s) => { setTAttendance(s.docs.map((d) => d.data() as TeacherAttendanceDoc)); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("classes"),             (s) => { setClasses(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); markLoaded(); }, () => markLoaded()),
      onSnapshot(scoped("teaching_assignments"),(s) => { setTeachingAssignments(s.docs.map((d) => d.data() as any)); markLoaded(); }, () => markLoaded()),
    ];

    return () => unsubs.forEach((u) => u());
  }, [schoolId, branchId]);

  // ── Class options ───────────────────────────────────────────────────────
  const classOptions = useMemo(() => {
    return [
      { id: "All", name: "All Classes" },
      ...classes
        .map((c: any) => ({ id: c.id, name: c.name || c.className || c.id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }, [classes]);

  // Map: classId → teacherId[] (from teaching_assignments)
  const classToTeachers = useMemo(() => {
    const m = new Map<string, Set<string>>();
    teachingAssignments.forEach((ta: any) => {
      const cid = ta.classId;
      const tid = ta.teacherId;
      if (!cid || !tid) return;
      if ((ta.status || "active") !== "active") return;
      if (!m.has(cid)) m.set(cid, new Set());
      m.get(cid)!.add(tid);
    });
    return m;
  }, [teachingAssignments]);

  // ── Apply filters + compute scores ───────────────────────────────────────
  const ranked: TeacherScore[] = useMemo(() => {
    const cut = cutoffFor(timeRange);

    // If class filter active → restrict to teachers who teach that class
    let scopedTeachers = teachers;
    if (classFilter !== "All") {
      const allowedIds = classToTeachers.get(classFilter) || new Set();
      scopedTeachers = teachers.filter((t) => allowedIds.has(t.id));
    }

    // Score using class-scoped data if class filter applied
    const byClass = (items: any[]) =>
      classFilter === "All" ? items : items.filter((x: any) => x.classId === classFilter);

    const scored = scoreTeachers({
      teachers:           scopedTeachers,
      scores:             filterByTime(byClass([...testScores, ...results, ...gradebook]), cut, ["date", "createdAt", "uploadedAt"]),
      attendance:         filterByTime(byClass(attendance), cut, ["date", "createdAt"]),
      assignments:        filterByTime(byClass(assignments), cut, ["createdAt", "uploadedAt", "date"]),
      teacherAttendance:  filterByTime(tAttendance, cut, ["date", "createdAt"]),
      teachingAssignments: classFilter === "All"
        ? teachingAssignments
        : teachingAssignments.filter((ta: any) => ta.classId === classFilter),
    });

    const q = search.trim().toLowerCase();
    if (!q) return scored;
    return scored.filter((t) =>
      (t.teacher.name || "").toLowerCase().includes(q) ||
      (t.teacher.email || "").toLowerCase().includes(q)
    );
  }, [teachers, testScores, results, gradebook, attendance, assignments, tAttendance, classToTeachers, classFilter, timeRange, search]);

  const stats = useMemo(() => {
    const total = ranked.length;
    const avg = total > 0 ? ranked.reduce((a, b) => a + b.composite, 0) / total : 0;
    const top = ranked[0];
    const active = ranked.filter((r) => r.testCount > 0 || r.assignments > 0).length;
    return { total, avg, top, active };
  }, [ranked]);

  const hasData = (r: TeacherScore) =>
    r.composite > 0 && (r.testCount > 0 || r.assignments > 0 || r.attendance !== null);
  const dataTeachers   = ranked.filter(hasData);
  const noDataTeachers = ranked.filter((r) => !hasData(r));
  const top3 = dataTeachers.slice(0, 3);
  const rest = [...dataTeachers.slice(3), ...noDataTeachers];

  // ═══════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" />
      </div>
    );
  }

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const B3 = "#2277FF";
    const GREEN = "#00C853";
    const RED = "#FF3355";
    const ORANGE = "#FF8800";
    const GOLD = "#FFAA00";
    const VIOLET = "#7B3FF4";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const toneToColor = (tone: string) => {
      switch (tone) {
        case "gold":    return { bg: "rgba(255,170,0,.10)", color: "#885500", border: "rgba(255,170,0,.22)" };
        case "emerald": return { bg: "rgba(0,200,83,.10)", color: "#007830", border: "rgba(0,200,83,.22)" };
        case "blue":    return { bg: "rgba(0,85,255,.10)", color: B1, border: "rgba(0,85,255,.18)" };
        case "violet":  return { bg: "rgba(123,63,244,.10)", color: VIOLET, border: "rgba(123,63,244,.22)" };
        case "rose":    return { bg: "rgba(255,51,85,.10)", color: "#B01030", border: "rgba(255,51,85,.22)" };
        default:        return { bg: "rgba(0,85,255,.10)", color: B1, border: "rgba(0,85,255,.18)" };
      }
    };

    const avatarGradFor = (rank: number, composite: number) => {
      if (rank === 1) return `linear-gradient(135deg, ${GOLD}, #FFCC22)`;
      if (rank === 2) return `linear-gradient(135deg, #B0B8C0, #D8DDE2)`;
      if (rank === 3) return `linear-gradient(135deg, ${ORANGE}, #FFAA00)`;
      if (composite >= 80) return `linear-gradient(135deg, ${GREEN}, #22EE66)`;
      if (composite >= 60) return `linear-gradient(135deg, ${B1}, ${B3})`;
      if (composite > 0) return `linear-gradient(135deg, ${ORANGE}, #FFCC22)`;
      return `linear-gradient(135deg, ${RED}, #FF7788)`;
    };
    const avShadowFor = (rank: number, composite: number) => {
      if (rank === 1) return "0 4px 12px rgba(255,170,0,.35)";
      if (rank === 3) return "0 4px 12px rgba(255,136,0,.28)";
      if (composite >= 60) return "0 4px 12px rgba(0,85,255,.24)";
      if (composite > 0) return "0 4px 12px rgba(255,136,0,.24)";
      return "0 4px 12px rgba(255,51,85,.24)";
    };
    const accentFor = (composite: number, hasDataFlag: boolean) => {
      if (!hasDataFlag) return `linear-gradient(180deg, ${RED}, #FF7788)`;
      if (composite >= 80) return `linear-gradient(180deg, ${GREEN}, #66EE88)`;
      if (composite >= 60) return `linear-gradient(180deg, ${B1}, #4499FF)`;
      if (composite >= 40) return `linear-gradient(180deg, ${ORANGE}, #FFCC22)`;
      return `linear-gradient(180deg, ${RED}, #FF7788)`;
    };
    const compositeColor = (n: number) => n >= 80 ? GREEN : n >= 60 ? B1 : n >= 40 ? ORANGE : RED;

    const currentClassName =
      classOptions.find((c) => c.id === classFilter)?.name || "All Classes";

    const avgTierInfo =
      stats.avg >= 80
        ? { label: "Excellent", bg: "rgba(0,200,83,.22)", border: "rgba(0,200,83,.38)", color: "#66EE88", icon: <Check size={11} strokeWidth={2.5} /> }
        : stats.avg >= 60
        ? { label: "Healthy", bg: "rgba(0,85,255,.22)", border: "rgba(0,85,255,.38)", color: "#99BBFF", icon: <TrendingUp size={11} strokeWidth={2.5} /> }
        : stats.avg >= 40
        ? { label: "Average", bg: "rgba(255,170,0,.22)", border: "rgba(255,170,0,.38)", color: "#FFDD44", icon: <TrendingUp size={11} strokeWidth={2.5} /> }
        : stats.avg > 0
        ? { label: "Needs Focus", bg: "rgba(255,51,85,.22)", border: "rgba(255,51,85,.38)", color: "#FF99AA", icon: <AlertTriangle size={11} strokeWidth={2.5} /> }
        : { label: "No Data", bg: "rgba(153,170,204,.18)", border: "rgba(153,170,204,.32)", color: "#CCDDEE", icon: <AlertTriangle size={11} strokeWidth={2.5} /> };

    // ── DETAIL VIEW ──
    if (selected) {
      const metrics = [
        { label: "Class Avg Score",  value: selected.classAvg,    weight: 35, unit: "%" as const, raw: false },
        { label: "Pass Rate",        value: selected.passRate,    weight: 20, unit: "%" as const, raw: false },
        { label: "Class Attendance", value: selected.attendance,  weight: 20, unit: "%" as const, raw: false },
        { label: "Assignments",      value: selected.assignments, weight: 15, unit: " posted" as const, raw: true },
        { label: "Punctuality",      value: selected.punctuality, weight: 10, unit: "%" as const, raw: false },
      ];
      const selectedRank = ranked.findIndex((r) => r.teacher.id === selected.teacher.id) + 1;
      const signalsWithData = metrics.filter((m) => m.value !== null && m.value !== undefined && (m.raw ? Number(m.value) > 0 : true)).length;

      const barColorFor = (n: number) =>
        n >= 80
          ? `linear-gradient(90deg, ${GREEN}, #66EE88)`
          : n >= 60
          ? `linear-gradient(90deg, ${B1}, #4499FF)`
          : n >= 40
          ? `linear-gradient(90deg, ${ORANGE}, #FFCC22)`
          : `linear-gradient(90deg, ${RED}, #FF7788)`;

      return (
        <div
          style={{
            fontFamily: "'DM Sans', -apple-system, sans-serif",
            background: "#EEF4FF",
            minHeight: "100vh",
            paddingBottom: 24,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => setSelected(null)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.12)",
                  cursor: "pointer",
                }}
                aria-label="Back"
              >
                <ChevronLeft size={16} color={B1} strokeWidth={2.3} />
              </button>
              <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>Teacher Details</div>
            </div>
          </div>

          {/* Detail Hero */}
          <div
            style={{
              margin: "14px 20px 0",
              background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
              borderRadius: 22,
              padding: "22px 18px 20px",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -36,
                right: -24,
                width: 160,
                height: 160,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative", zIndex: 1, display: "inline-block", marginBottom: 12 }}>
              <div
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: "50%",
                  background: "linear-gradient(140deg,#fff,#E5EEFF)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  color: B1,
                  boxShadow: "0 10px 24px rgba(0,0,0,.25), 0 0 0 3px rgba(255,255,255,.25)",
                }}
              >
                {initialsOf(selected.teacher.name)}
              </div>
              {selectedRank === 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 26,
                    height: 26,
                    borderRadius: 9,
                    background: "linear-gradient(140deg,#FFCC44,#FF8800)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 10px rgba(255,136,0,.5), 0 0 0 2px rgba(0,24,136,1)",
                  }}
                >
                  <Crown size={13} color="#fff" strokeWidth={2.4} />
                </div>
              )}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px", position: "relative", zIndex: 1, marginBottom: 3 }}>
              {selected.teacher.name || selected.teacher.email || "Teacher"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", fontWeight: 500, position: "relative", zIndex: 1, marginBottom: 14 }}>
              {selected.teacher.email || "No email"}
            </div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 4, position: "relative", zIndex: 1 }}>
              Composite Score
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, color: "#66EEAA", letterSpacing: "-1.6px", lineHeight: 1, position: "relative", zIndex: 1, marginBottom: 14 }}>
              {selected.composite.toFixed(1)}%
            </div>
            {selected.reasons.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", position: "relative", zIndex: 1 }}>
                {selected.reasons.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "5px 11px",
                      borderRadius: 100,
                      background: "rgba(255,170,0,.22)",
                      border: "0.5px solid rgba(255,170,0,.38)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#FFCC44",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Check size={9} strokeWidth={2.6} />
                    {r.label} · {r.value}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Breakdown */}
          <div
            style={{
              margin: "12px 20px 0",
              background: "#fff",
              borderRadius: 20,
              boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
              border: "0.5px solid rgba(0,85,255,.10)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T4 }}>
                Score Breakdown
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: B1,
                  padding: "2px 8px",
                  borderRadius: 100,
                  background: "rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.16)",
                }}
              >
                {signalsWithData}/5 signals
              </div>
            </div>

            {metrics.map((m, i) => {
              const hasData = m.value !== null && m.value !== undefined && (!m.raw || Number(m.value) > 0);
              const numVal = hasData ? Number(m.value) : 0;
              const displayVal = hasData
                ? m.raw
                  ? `${m.value}${m.unit}`
                  : `${numVal.toFixed(1)}${m.unit}`
                : m.raw
                ? `0${m.unit}`
                : "No data";
              const valClass: "nodata" | "green" | "red" | "normal" = !hasData
                ? "nodata"
                : m.raw
                ? Number(m.value) > 0
                  ? "green"
                  : "red"
                : numVal >= 70
                ? "green"
                : numVal < 50
                ? "red"
                : "normal";
              const valColor =
                valClass === "nodata" ? T4 : valClass === "green" ? "#00994A" : valClass === "red" ? RED : T2;
              const pctBar = hasData && !m.raw ? Math.min(100, numVal) : m.raw && Number(m.value) > 0 ? 4 : 0;

              return (
                <div
                  key={m.label}
                  style={{
                    padding: "11px 16px",
                    borderTop: i === 0 ? `0.5px solid ${SEP}` : `0.5px solid ${SEP}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7, gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T2, letterSpacing: "-0.1px" }}>{m.label}</div>
                      <div
                        style={{
                          padding: "2px 7px",
                          borderRadius: 100,
                          background: "rgba(0,85,255,.08)",
                          border: "0.5px solid rgba(0,85,255,.14)",
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: B1,
                          flexShrink: 0,
                        }}
                      >
                        {m.weight}% Wt
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: valClass === "nodata" ? 12 : 13,
                        fontWeight: valClass === "nodata" ? 500 : 700,
                        letterSpacing: "-0.2px",
                        flexShrink: 0,
                        color: valColor,
                        fontStyle: valClass === "nodata" ? "italic" : "normal",
                      }}
                    >
                      {displayVal}
                    </div>
                  </div>
                  <div style={{ height: 6, background: "#E0ECFF", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 3,
                        background: hasData
                          ? m.raw
                            ? Number(m.value) > 0
                              ? `linear-gradient(90deg, ${GREEN}, #66EE88)`
                              : `linear-gradient(90deg, ${RED}, #FF7788)`
                            : barColorFor(numVal)
                          : "#E0ECFF",
                        width: `${pctBar}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mini stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "12px 20px 0" }}>
            {[
              { lbl: "Students", val: selected.studentCount, color: B1 },
              { lbl: "Tests Rec.", val: selected.testCount, color: selected.testCount > 0 ? T1 : T4 },
              { lbl: "Assignments", val: selected.assignments, color: selected.assignments > 0 ? T1 : T4 },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: "12px 8px",
                  textAlign: "center",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.10)",
                }}
              >
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
                  {s.lbl}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Weight note */}
          <div
            style={{
              margin: "12px 20px 0",
              padding: "10px 14px",
              background: "rgba(0,85,255,.04)",
              borderRadius: 12,
              border: "0.5px dashed rgba(0,85,255,.20)",
              fontSize: 10,
              color: T3,
              fontWeight: 500,
              lineHeight: 1.55,
              textAlign: "center",
            }}
          >
            Weighted signals:{" "}
            <strong style={{ color: B1, fontWeight: 700 }}>scores 35%</strong> ·{" "}
            <strong style={{ color: B1, fontWeight: 700 }}>pass rate 20%</strong> ·{" "}
            <strong style={{ color: B1, fontWeight: 700 }}>attendance 20%</strong> ·{" "}
            <strong style={{ color: B1, fontWeight: 700 }}>assignments 15%</strong> ·{" "}
            <strong style={{ color: B1, fontWeight: 700 }}>punctuality 10%</strong>
          </div>

          {/* AI */}
          <div
            style={{
              margin: "12px 20px 0",
              background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
              borderRadius: 22,
              padding: "18px 20px",
              boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -34,
                right: -22,
                width: 140,
                height: 140,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.18)",
                  border: "0.5px solid rgba(255,255,255,.26)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                AI Teacher Intelligence
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
              <strong style={{ color: "#fff", fontWeight: 700 }}>
                {selected.teacher.name || "This teacher"}
              </strong>
              's{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>
                {selected.composite.toFixed(1)}%
              </strong>{" "}
              composite is tracked across{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>
                {signalsWithData} of 5
              </strong>{" "}
              signals.{" "}
              {selected.reasons.length > 0 && (
                <>
                  Standout: {selected.reasons.slice(0, 2).map((r, i) => (
                    <span key={i}>
                      <strong style={{ color: "#fff", fontWeight: 700 }}>
                        {r.label.toLowerCase()} ({r.value})
                      </strong>
                      {i < Math.min(selected.reasons.length, 2) - 1 ? ", " : "."}
                    </span>
                  ))}
                </>
              )}
              {signalsWithData < 5 && " Complete remaining signals to validate the rank against full outcomes."}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1,
                background: "rgba(255,255,255,.12)",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
                marginTop: 12,
              }}
            >
              {[
                { v: `${signalsWithData}/5`, l: "Signals", c: "#fff" },
                { v: `${selected.composite.toFixed(1)}%`, l: "Composite", c: "#66EEAA" },
                { v: `#${selectedRank}`, l: "Rank", c: "#FFDD44" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: s.c, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Close btn */}
          <button
            onClick={() => setSelected(null)}
            style={{
              margin: "14px 20px 0",
              width: "calc(100% - 40px)",
              height: 46,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${B1}, ${B2})`,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
              letterSpacing: "0.02em",
            }}
          >
            <X size={14} color="#fff" strokeWidth={2.4} />
            Close Details
          </button>

          <div style={{ height: 20 }} />
        </div>
      );
    }

    // ── LIST VIEW ──
    return (
      <div
        style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          background: "#EEF4FF",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* PAGE HEAD */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3, display: "flex", alignItems: "center", gap: 7 }}>
              <Trophy size={22} color={GOLD} strokeWidth={2.2} />
              Leaderboard
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5 }}>
              Top performers auto-ranked by<br />student outcomes + engagement
            </div>
          </div>
          <div style={{ position: "relative", flexShrink: 0, marginTop: 4 }}>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                background: "#fff",
                border: "0.5px solid rgba(0,85,255,.14)",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                borderRadius: 14,
                padding: "8px 32px 8px 11px",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                color: T1,
                outline: "none",
                cursor: "pointer",
                maxWidth: 170,
              }}
            >
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
              <ChevronDown size={13} color={T3} strokeWidth={2.4} />
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginTop: 4, textAlign: "center" }}>
              {currentClassName.length > 16 ? currentClassName.slice(0, 14) + "…" : ""}
            </div>
          </div>
        </div>

        {/* FILTER PILLS */}
        <div style={{ display: "flex", gap: 7, padding: "12px 20px 0" }}>
          {(["term", "month", "all"] as TimeRange[]).map((r) => {
            const isActive = timeRange === r;
            return (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                style={{
                  flex: 1,
                  padding: "9px 6px",
                  borderRadius: 12,
                  background: isActive ? `linear-gradient(135deg, ${B1}, ${B2})` : "#fff",
                  border: isActive ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,.12)",
                  color: isActive ? "#fff" : T3,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  boxShadow: isActive
                    ? "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)"
                    : "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {r === "term" ? "This Term" : r === "month" ? "This Month" : "All Time"}
              </button>
            );
          })}
        </div>

        {/* HERO */}
        <div
          style={{
            margin: "14px 20px 0",
            background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
            borderRadius: 22,
            padding: "16px 18px",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -36,
              right: -24,
              width: 150,
              height: 150,
              background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: "rgba(255,255,255,.16)",
                  border: "0.5px solid rgba(255,255,255,.24)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Trophy size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                  Branch Avg Score
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1 }}>
                  {stats.avg.toFixed(1)}%
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 100,
                background: avgTierInfo.bg,
                border: `0.5px solid ${avgTierInfo.border}`,
                fontSize: 11,
                fontWeight: 700,
                color: avgTierInfo.color,
              }}
            >
              {avgTierInfo.icon}
              {avgTierInfo.label}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "rgba(255,255,255,.12)",
              borderRadius: 14,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
            }}
          >
            {[
              { v: stats.total, l: "Teachers", c: "#fff" },
              { v: dataTeachers.length, l: "Top Perf.", c: "#FFDD44" },
              { v: noDataTeachers.length, l: "No Data", c: noDataTeachers.length > 0 ? "#FF8899" : "#fff" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "11px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.c, letterSpacing: "-0.4px", lineHeight: 1, marginBottom: 3 }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* STAT GRID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
          {[
            {
              label: "Total Teachers",
              value: stats.total,
              sub: classFilter === "All" ? "In branch" : "Teaching this class",
              color: B1,
              subColor: T4,
              icon: <Users size={13} color={B1} strokeWidth={2.4} />,
              bg: "rgba(0,85,255,.10)",
              border: "rgba(0,85,255,.18)",
              glow: "rgba(0,85,255,.10)",
            },
            {
              label: "Avg Performance",
              value: `${stats.avg.toFixed(1)}%`,
              sub: "Across set",
              color: stats.avg >= 80 ? GREEN : stats.avg >= 60 ? B1 : stats.avg >= 40 ? ORANGE : stats.avg > 0 ? RED : T4,
              subColor: stats.avg >= 60 ? "#007830" : stats.avg > 0 ? "#884400" : T4,
              icon: <TrendingUp size={13} color={ORANGE} strokeWidth={2.4} />,
              bg: "rgba(255,136,0,.10)",
              border: "rgba(255,136,0,.22)",
              glow: "rgba(255,136,0,.10)",
            },
            {
              label: "Active Teachers",
              value: stats.active,
              sub: "With recent data",
              color: stats.active > 0 ? VIOLET : T3,
              subColor: T4,
              icon: <Sparkles size={13} color={VIOLET} strokeWidth={2.4} />,
              bg: "rgba(123,63,244,.10)",
              border: "rgba(123,63,244,.22)",
              glow: "rgba(123,63,244,.10)",
            },
            {
              label: "Top Performer",
              value: stats.top ? `${stats.top.composite.toFixed(0)}%` : "—",
              sub: stats.top?.teacher.name || "No teachers yet",
              color: GOLD,
              subColor: "#885500",
              icon: <Crown size={13} color={GOLD} strokeWidth={2.4} />,
              bg: "rgba(255,170,0,.12)",
              border: "rgba(255,170,0,.22)",
              glow: "rgba(255,170,0,.10)",
            },
          ].map((c, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                borderRadius: 20,
                padding: 15,
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                border: "0.5px solid rgba(0,85,255,.10)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -18,
                  right: -14,
                  width: 65,
                  height: 65,
                  background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 13,
                  right: 13,
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: c.bg,
                  border: `0.5px solid ${c.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {c.icon}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T4, marginBottom: 9 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1, marginBottom: 4, color: c.color }}>
                {c.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: c.subColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.sub}
              </div>
            </div>
          ))}
        </div>

        {/* TOP PERFORMER SPOTLIGHT */}
        {stats.top && (
          <button
            onClick={() => setSelected(stats.top!)}
            style={{
              margin: "14px 20px 0",
              width: "calc(100% - 40px)",
              background: "linear-gradient(140deg,#FFF6D6 0%,#FFE58A 42%,#FFCC44 100%)",
              borderRadius: 22,
              padding: "18px 18px",
              position: "relative",
              overflow: "hidden",
              border: "0.5px solid rgba(255,170,0,.28)",
              boxShadow: "0 8px 28px rgba(255,170,0,.24), 0 0 0 .5px rgba(255,170,0,.22)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -36,
                right: -30,
                width: 160,
                height: 160,
                background: "radial-gradient(circle, rgba(255,255,255,.55) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 11px",
                  borderRadius: 100,
                  background: "rgba(255,255,255,.65)",
                  border: "0.5px solid rgba(255,170,0,.35)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#885500",
                }}
              >
                <Award size={10} color="#885500" strokeWidth={2.5} />
                Top Performer
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: 100,
                  background: "linear-gradient(135deg,#FF8800,#FFAA00)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(255,136,0,.35)",
                }}
              >
                <Crown size={11} color="#fff" strokeWidth={2.5} />
                #1
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: "50%",
                  background: "linear-gradient(140deg,#fff,#F0F6FF)",
                  border: "3px solid rgba(255,255,255,.95)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: 700,
                  color: B1,
                  boxShadow: "0 10px 24px rgba(0,85,255,.20), 0 0 0 4px rgba(255,170,0,.25)",
                }}
              >
                {initialsOf(stats.top.teacher.name)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#331F00", letterSpacing: "-0.3px", marginTop: 2 }}>
                {stats.top.teacher.name || stats.top.teacher.email || "Teacher"}
              </div>
              <div style={{ fontSize: 42, fontWeight: 700, color: "#00994A", letterSpacing: "-1.6px", lineHeight: 1, marginTop: -2 }}>
                {stats.top.composite.toFixed(0)}%
              </div>
              {stats.top.reasons.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
                  {stats.top.reasons.slice(0, 2).map((r, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "5px 11px",
                        borderRadius: 100,
                        background: "rgba(255,255,255,.75)",
                        border: "0.5px solid rgba(255,170,0,.35)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#885500",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Check size={9} color="#885500" strokeWidth={2.6} />
                      {r.label} · {r.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </button>
        )}

        {/* SEARCH */}
        <div style={{ margin: "14px 20px 0", position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <Search size={15} color="rgba(0,85,255,.42)" strokeWidth={2.2} />
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher by name or email..."
            style={{
              width: "100%",
              padding: "12px 16px 12px 42px",
              background: "#fff",
              borderRadius: 14,
              border: "0.5px solid rgba(0,85,255,.12)",
              fontFamily: "inherit",
              fontSize: 13,
              color: T1,
              fontWeight: 400,
              outline: "none",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
            }}
          />
        </div>

        {/* Clear class chip (if filter active) */}
        {classFilter !== "All" && (
          <div style={{ padding: "8px 20px 0", display: "flex" }}>
            <button
              onClick={() => setClassFilter("All")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 11px",
                borderRadius: 100,
                background: "rgba(0,85,255,.08)",
                border: "0.5px solid rgba(0,85,255,.16)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: B1,
                cursor: "pointer",
              }}
            >
              <X size={10} strokeWidth={2.5} />
              Clear Class
            </button>
          </div>
        )}

        {/* SECTION LABEL */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: T4,
            padding: "16px 20px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Filter size={11} strokeWidth={2.4} />
          <span>Full Rankings</span>
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 100,
              background: "rgba(0,85,255,.10)",
              border: "0.5px solid rgba(0,85,255,.16)",
              fontSize: 9,
              fontWeight: 700,
              color: B1,
              textTransform: "none",
              letterSpacing: "0.04em",
            }}
          >
            {ranked.length} teacher{ranked.length === 1 ? "" : "s"}
          </span>
          <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
        </div>

        {/* RANK LIST */}
        {ranked.length === 0 ? (
          <div
            style={{
              margin: "12px 20px 0",
              background: "#fff",
              borderRadius: 22,
              padding: "32px 20px",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
              border: "0.5px dashed rgba(0,85,255,.22)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              textAlign: "center",
            }}
          >
            <Trophy size={44} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
            <div style={{ fontSize: 14, fontWeight: 700, color: T1 }}>No teachers to rank yet</div>
            <div style={{ fontSize: 11, color: T4, maxWidth: 260, lineHeight: 1.5 }}>
              {classFilter !== "All"
                ? "No teachers assigned to this class yet, or no performance data recorded."
                : "Once teachers are added and academic data is recorded, they'll appear here with rankings."}
            </div>
          </div>
        ) : (
          ranked.map((r, i) => {
            const rank = i + 1;
            const rowHasData = hasData(r);
            const initText = initialsOf(r.teacher.name);
            const email = r.teacher.email || "—";

            return (
              <button
                key={r.teacher.id}
                onClick={() => setSelected(r)}
                style={{
                  margin: "10px 20px 0",
                  width: "calc(100% - 40px)",
                  background: "#fff",
                  borderRadius: 18,
                  padding: "14px 16px 14px 18px",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08), 0 10px 26px rgba(0,85,255,.10)",
                  border: "0.5px solid rgba(0,85,255,.08)",
                  position: "relative",
                  overflow: "hidden",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: accentFor(r.composite, rowHasData),
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T4, letterSpacing: "-0.2px", minWidth: 22 }}>
                    #{rank}
                  </div>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: avatarGradFor(rank, r.composite),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                      boxShadow: avShadowFor(rank, r.composite),
                    }}
                  >
                    {initText}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.teacher.name || r.teacher.email || "Teacher"}
                    </div>
                    <div style={{ fontSize: 10, color: T4, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 155 }}>
                      {email}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, color: compositeColor(r.composite) }}>
                      {r.composite.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
                      Composite
                    </div>
                  </div>
                </div>
                {!rowHasData ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${SEP}`, display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        padding: "4px 10px",
                        borderRadius: 100,
                        fontSize: 9,
                        fontWeight: 700,
                        background: "rgba(255,51,85,.10)",
                        color: "#B01030",
                        border: "0.5px solid rgba(255,51,85,.22)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <AlertTriangle size={9} color="#B01030" strokeWidth={2.6} />
                      New Teacher · No data yet
                    </div>
                  </div>
                ) : r.reasons.length > 0 ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${SEP}`, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {r.reasons.slice(0, 2).map((reason, ri) => {
                      const tc = toneToColor(reason.tone);
                      return (
                        <div
                          key={ri}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 100,
                            fontSize: 9,
                            fontWeight: 700,
                            background: tc.bg,
                            color: tc.color,
                            border: `0.5px solid ${tc.border}`,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {reason.label}: {reason.value}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {rowHasData && (
                  <div style={{ marginTop: 10, height: 4, background: "#E0ECFF", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 2,
                        background: `linear-gradient(90deg, ${compositeColor(r.composite)}, ${r.composite >= 80 ? "#66EE88" : r.composite >= 60 ? "#4499FF" : r.composite >= 40 ? "#FFCC22" : "#FF7788"})`,
                        width: `${Math.min(100, Math.max(2, r.composite))}%`,
                      }}
                    />
                  </div>
                )}
              </button>
            );
          })
        )}

        {/* AI CARD */}
        {ranked.length > 0 && (
          <div
            style={{
              margin: "12px 20px 0",
              background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
              borderRadius: 22,
              padding: "18px 20px",
              boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -34,
                right: -22,
                width: 140,
                height: 140,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.18)",
                  border: "0.5px solid rgba(255,255,255,.26)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                AI Leaderboard Intelligence
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
              {stats.top ? (
                <>
                  <strong style={{ color: "#fff", fontWeight: 700 }}>
                    {stats.top.teacher.name || "Top teacher"}
                  </strong>{" "}
                  dominates the board with a{" "}
                  <strong style={{ color: "#fff", fontWeight: 700 }}>
                    {stats.top.composite.toFixed(0)}% composite
                  </strong>
                  {stats.top.reasons.length > 0 && (
                    <>
                      {" "}— leading on{" "}
                      {stats.top.reasons.slice(0, 2).map((r, i) => (
                        <span key={i}>
                          <strong style={{ color: "#fff", fontWeight: 700 }}>
                            {r.label.toLowerCase()} ({r.value})
                          </strong>
                          {i < Math.min(stats.top!.reasons.length, 2) - 1 ? " and " : ""}
                        </span>
                      ))}
                    </>
                  )}
                  .{" "}
                </>
              ) : (
                <>No teachers have recorded data yet.{" "}</>
              )}
              {noDataTeachers.length > 0 && (
                <>
                  <strong style={{ color: "#fff", fontWeight: 700 }}>
                    {noDataTeachers.length} teacher{noDataTeachers.length === 1 ? "" : "s"}
                  </strong>{" "}
                  {noDataTeachers.length === 1 ? "is" : "are"} new with{" "}
                  <strong style={{ color: "#fff", fontWeight: 700 }}>no data yet</strong>. Schedule their first assessments to unlock full rankings.
                </>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1,
                background: "rgba(255,255,255,.12)",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
                marginTop: 12,
              }}
            >
              {[
                { v: stats.total, l: "Teachers", c: "#fff" },
                { v: stats.top ? `${stats.top.composite.toFixed(0)}%` : "—", l: "Top Score", c: "#FFDD44" },
                { v: noDataTeachers.length, l: "New", c: noDataTeachers.length > 0 ? "#FF99AA" : "#fff" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: s.c, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>
    );
  }

  const desktopAvgTier =
    stats.avg >= 80
      ? { label: "Excellent", bg: "rgba(0,200,83,.22)", border: "rgba(0,200,83,.38)", color: "#66EE88" }
      : stats.avg >= 60
      ? { label: "Healthy", bg: "rgba(0,85,255,.22)", border: "rgba(0,85,255,.38)", color: "#99BBFF" }
      : stats.avg >= 40
      ? { label: "Average", bg: "rgba(255,170,0,.22)", border: "rgba(255,170,0,.38)", color: "#FFDD44" }
      : stats.avg > 0
      ? { label: "Needs Focus", bg: "rgba(255,51,85,.22)", border: "rgba(255,51,85,.38)", color: "#FF99AA" }
      : { label: "No Data", bg: "rgba(153,170,204,.18)", border: "rgba(153,170,204,.32)", color: "#CCDDEE" };

  return (
    <div
      className="animate-in fade-in duration-300"
      style={{
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        paddingBottom: 40,
      }}
    >
      {/* ─── Header ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, #FFAA00, #FFCC44)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 22px rgba(255,170,0,.35)",
            }}
          >
            <Trophy size={24} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#001040", letterSpacing: "-0.7px", margin: 0, lineHeight: 1.1 }}>
              Teacher Leaderboard
            </h1>
            <p style={{ fontSize: 13, color: "#5070B0", fontWeight: 400, marginTop: 4, margin: 0 }}>
              Top performers in your branch — auto-ranked by student outcomes + engagement
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Time range segmented */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#fff",
              padding: 4,
              borderRadius: 14,
              border: "0.5px solid rgba(0,85,255,.12)",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
            }}
          >
            {(["term", "month", "all"] as TimeRange[]).map((r) => {
              const active = timeRange === r;
              return (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 10,
                    background: active ? "linear-gradient(135deg, #0055FF, #1166FF)" : "transparent",
                    color: active ? "#fff" : "#5070B0",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: active ? "0 3px 10px rgba(0,85,255,.32)" : "none",
                    transition: "all .18s",
                    fontFamily: "inherit",
                  }}
                >
                  {r === "term" ? "This Term" : r === "month" ? "This Month" : "All Time"}
                </button>
              );
            })}
          </div>

          {/* Class filter */}
          <div style={{ position: "relative" }}>
            <BookOpen
              size={14}
              color="rgba(0,85,255,.6)"
              strokeWidth={2.2}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                background: "#fff",
                border: "0.5px solid rgba(0,85,255,.14)",
                borderRadius: 14,
                padding: "9px 34px 9px 34px",
                fontSize: 12,
                fontWeight: 700,
                color: "#002080",
                outline: "none",
                cursor: "pointer",
                minWidth: 190,
                boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                fontFamily: "inherit",
              }}
            >
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              color="rgba(0,85,255,.6)"
              strokeWidth={2.2}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            />
          </div>
        </div>
      </div>

      {/* ─── Dark Hero Banner ────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
          borderRadius: 24,
          padding: "22px 28px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 12px 36px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -40,
            width: 240,
            height: 240,
            background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.014) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px)",
            backgroundSize: "22px 22px",
            inset: 0,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 1,
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                background: "rgba(255,255,255,.16)",
                border: "0.5px solid rgba(255,255,255,.24)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trophy size={26} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,.50)",
                  marginBottom: 4,
                }}
              >
                Branch Avg Score
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "-1.2px",
                  lineHeight: 1,
                }}
              >
                {stats.avg.toFixed(1)}%
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 18px",
              borderRadius: 100,
              background: desktopAvgTier.bg,
              border: `0.5px solid ${desktopAvgTier.border}`,
              fontSize: 13,
              fontWeight: 700,
              color: desktopAvgTier.color,
            }}
          >
            <BarChart3 size={14} strokeWidth={2.5} />
            {desktopAvgTier.label} tier
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "rgba(255,255,255,.12)",
              borderRadius: 14,
              overflow: "hidden",
              minWidth: 320,
            }}
          >
            {[
              { v: stats.total, l: "Teachers", c: "#fff" },
              { v: dataTeachers.length, l: "With Data", c: "#FFDD44" },
              { v: noDataTeachers.length, l: "New", c: noDataTeachers.length > 0 ? "#FF99AA" : "#fff" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,.08)",
                  padding: "14px 18px",
                  textAlign: "center",
                  minWidth: 100,
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: s.c,
                    letterSpacing: "-0.5px",
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {s.v}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,.40)",
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── 4 Stat Cards — dashboard-style ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          {
            label: "Total Teachers",
            value: stats.total,
            sub: classFilter === "All" ? "In branch" : "Teaching this class",
            Icon: Users,
            cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
            tileGrad: "linear-gradient(135deg, #0055FF, #1166FF)",
            tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
            valColor: "#0055FF",
            decorColor: "#0055FF",
          },
          {
            label: "Avg Performance",
            value: `${stats.avg.toFixed(1)}%`,
            sub: "Across filtered set",
            Icon: TrendingUp,
            cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
            tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
            tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
            valColor: "#007830",
            decorColor: "#00C853",
          },
          {
            label: "Active Teachers",
            value: stats.active,
            sub: "With recent data",
            Icon: Sparkles,
            cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            tileGrad: "linear-gradient(135deg, #7B3FF4, #A07CF8)",
            tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
            valColor: "#7B3FF4",
            decorColor: "#7B3FF4",
          },
          {
            label: "Top Performer",
            value: stats.top ? `${stats.top.composite.toFixed(0)}%` : "—",
            sub: stats.top?.teacher.name || "No teachers yet",
            Icon: Crown,
            cardGrad: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
            tileGrad: "linear-gradient(135deg, #FFAA00, #FFDD44)",
            tileShadow: "0 4px 14px rgba(255,170,0,0.28)",
            valColor: "#FFAA00",
            decorColor: "#FFAA00",
          },
        ].map((c, i) => {
          const Icon = c.Icon;
          return (
            <div
              key={i}
              className="rounded-[20px] p-5 relative overflow-hidden"
              style={{
                background: c.cardGrad,
                boxShadow: "0 0 0 0.5px rgba(0,85,255,0.14), 0 6px 20px rgba(0,85,255,0.10), 0 22px 56px rgba(0,85,255,0.10)",
                border: "0.5px solid rgba(0,85,255,0.08)",
              }}
            >
              <div
                className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
                style={{ background: c.tileGrad, boxShadow: c.tileShadow }}
              >
                <Icon size={26} color="#fff" strokeWidth={2.3} />
              </div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: "#99AACC" }}>{c.label}</span>
              <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5 truncate" style={{ color: c.valColor, letterSpacing: "-1.2px" }}>{c.value}</p>
              <p className="text-[11px] font-semibold truncate" style={{ color: "#5070B0" }}>{c.sub}</p>
              <Icon
                size={56}
                color={c.decorColor}
                strokeWidth={2}
                className="absolute bottom-3 right-3 pointer-events-none"
                style={{ opacity: 0.18 }}
              />
            </div>
          );
        })}
      </div>

      {/* ─── Empty / Rankings ──────────────────────────────────────── */}
      {ranked.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "0.5px dashed rgba(0,85,255,.22)",
            borderRadius: 24,
            padding: "64px 24px",
            textAlign: "center",
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
          }}
        >
          <Trophy size={56} color="rgba(0,85,255,.22)" strokeWidth={1.8} style={{ margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#001040", margin: "0 0 6px 0" }}>
            No teachers to rank yet
          </h3>
          <p style={{ fontSize: 13, color: "#5070B0", fontWeight: 400, maxWidth: 440, margin: "0 auto", lineHeight: 1.55 }}>
            {classFilter !== "All"
              ? "No teachers assigned to this class yet, or no performance data recorded."
              : "Once teachers are added and academic data is recorded, they'll appear here with rankings."}
          </p>
        </div>
      ) : (
        <>
          {/* Top Performer Spotlight + Podium — dashboard-style (slate blue) */}
          {top3.length > 0 && (
            <div
              style={{
                background: "linear-gradient(135deg, #D4DCEE 0%, #F5F7FC 100%)",
                border: "0.5px solid rgba(94,122,196,0.10)",
                borderRadius: 24,
                padding: "26px 30px 30px",
                position: "relative",
                overflow: "hidden",
                boxShadow: "0 0 0 0.5px rgba(94,122,196,0.14), 0 6px 20px rgba(94,122,196,0.10), 0 22px 56px rgba(94,122,196,0.12)",
                marginBottom: 20,
              }}
            >
              {/* Decorative faded crown bottom-right */}
              <Crown
                size={140}
                color="#5E7AC4"
                strokeWidth={1.4}
                style={{
                  position: "absolute",
                  bottom: -22,
                  right: -18,
                  opacity: 0.12,
                  pointerEvents: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, position: "relative", zIndex: 1 }}>
                {/* Vibrant gradient tile — dashboard pattern */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #5E7AC4, #8094D4)",
                    boxShadow: "0 4px 14px rgba(94,122,196,0.30)",
                  }}
                >
                  <Crown size={22} color="#fff" strokeWidth={2.3} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: "#99AACC",
                      marginBottom: 3,
                    }}
                  >
                    Spotlight
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#001040",
                      letterSpacing: "-0.3px",
                      lineHeight: 1.1,
                    }}
                  >
                    {top3.length === 1 ? "Top Performer" : top3.length === 2 ? "Top 2 Performers" : "Top 3 Performers"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 18,
                  alignItems: "end",
                  position: "relative",
                  zIndex: 1,
                  gridTemplateColumns:
                    top3.length === 1 ? "1fr" : top3.length === 2 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                  maxWidth: top3.length === 1 ? 400 : top3.length === 2 ? 760 : "100%",
                  margin: top3.length < 3 ? "0 auto" : undefined,
                }}
              >
                {top3.length >= 3 && top3[1] && <PodiumCard rank={2} score={top3[1]} onClick={() => setSelected(top3[1])} />}
                {top3[0] && <PodiumCard rank={1} score={top3[0]} onClick={() => setSelected(top3[0])} />}
                {top3.length === 2 && top3[1] && <PodiumCard rank={2} score={top3[1]} onClick={() => setSelected(top3[1])} />}
                {top3.length >= 3 && top3[2] && <PodiumCard rank={3} score={top3[2]} onClick={() => setSelected(top3[2])} />}
              </div>
            </div>
          )}

          {/* Search + Clear Class */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 460 }}>
              <Search
                size={16}
                color="rgba(0,85,255,.42)"
                strokeWidth={2.2}
                style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teacher by name or email..."
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 42px",
                  background: "#fff",
                  borderRadius: 14,
                  border: "0.5px solid rgba(0,85,255,.12)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  color: "#001040",
                  fontWeight: 400,
                  outline: "none",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                }}
              />
            </div>
            {classFilter !== "All" && (
              <button
                onClick={() => setClassFilter("All")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "8px 14px",
                  borderRadius: 100,
                  background: "rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.16)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#0055FF",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <X size={12} strokeWidth={2.5} />
                Clear Class
              </button>
            )}
          </div>

          {/* Full Rankings card */}
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "0.5px solid rgba(0,85,255,.10)",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 22px",
                borderBottom: "0.5px solid rgba(0,85,255,.07)",
                background: "linear-gradient(90deg, rgba(0,85,255,.04), transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#001040",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: 0,
                }}
              >
                <Filter size={13} color="#0055FF" strokeWidth={2.3} />
                Full Rankings
                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: 100,
                    background: "rgba(0,85,255,.10)",
                    border: "0.5px solid rgba(0,85,255,.16)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#0055FF",
                    letterSpacing: "0.04em",
                    textTransform: "none",
                  }}
                >
                  {ranked.length} teacher{ranked.length === 1 ? "" : "s"}
                </span>
              </h3>
            </div>
            <div style={{ maxHeight: 620, overflowY: "auto" }}>
              {(rest.length > 0 ? rest : ranked).map((r, i) => {
                const rank = rest.length > 0 ? i + 4 : i + 1;
                const isLast = i === (rest.length > 0 ? rest.length - 1 : ranked.length - 1);
                return (
                  <div key={r.teacher.id} style={{ borderBottom: isLast ? "none" : "0.5px solid rgba(0,85,255,.07)" }}>
                    <TeacherRow rank={rank} score={r} onClick={() => setSelected(r)} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {selected && <DetailModal score={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers for desktop visual tokens (shared by PodiumCard / TeacherRow / Modal)
const toneSwatch = (tone: string) => {
  switch (tone) {
    case "gold":    return { bg: "rgba(255,170,0,.10)", color: "#885500", border: "rgba(255,170,0,.22)" };
    case "emerald": return { bg: "rgba(0,200,83,.10)", color: "#007830", border: "rgba(0,200,83,.22)" };
    case "blue":    return { bg: "rgba(0,85,255,.10)", color: "#0055FF", border: "rgba(0,85,255,.18)" };
    case "violet":  return { bg: "rgba(123,63,244,.10)", color: "#7B3FF4", border: "rgba(123,63,244,.22)" };
    case "rose":    return { bg: "rgba(255,51,85,.10)", color: "#B01030", border: "rgba(255,51,85,.22)" };
    default:        return { bg: "rgba(0,85,255,.10)", color: "#0055FF", border: "rgba(0,85,255,.18)" };
  }
};

const compositeHex = (n: number) =>
  n >= 80 ? "#00994A" : n >= 60 ? "#0055FF" : n >= 40 ? "#FF8800" : "#FF3355";

const compositeBar = (n: number) =>
  n >= 80
    ? "linear-gradient(90deg, #00C853, #66EE88)"
    : n >= 60
    ? "linear-gradient(90deg, #0055FF, #4499FF)"
    : n >= 40
    ? "linear-gradient(90deg, #FF8800, #FFCC22)"
    : "linear-gradient(90deg, #FF3355, #FF7788)";

function PodiumCard({ rank, score, onClick }: { rank: 1 | 2 | 3; score: TeacherScore; onClick: () => void }) {
  const minH = rank === 1 ? 300 : rank === 2 ? 260 : 240;
  const accent =
    rank === 1
      ? {
          bg: "#FFFFFF",
          border: "rgba(47,164,215,.18)",
          badge: "#2FA4D7",
          badgeShadow: "0 4px 12px rgba(47,164,215,.22)",
          avRing: "rgba(47,164,215,.20)",
          avShadow: "0 0 0 1px rgba(47,164,215,.18), 0 4px 14px rgba(15,23,42,.06)",
          crownColor: "#2FA4D7",
        }
      : rank === 2
      ? {
          bg: "linear-gradient(140deg,#fff 0%,#F0F3F8 60%,#D8DDE4 100%)",
          border: "rgba(160,172,190,.5)",
          badge: "linear-gradient(135deg,#7E8CA0,#A8B4C4)",
          badgeShadow: "0 6px 18px rgba(126,140,160,.4)",
          avRing: "rgba(126,140,160,.35)",
          avShadow: "0 0 0 4px rgba(160,172,190,.2), 0 10px 24px rgba(0,85,255,.15)",
          crownColor: "#7E8CA0",
        }
      : {
          bg: "linear-gradient(140deg,#fff 0%,#FFE8D4 60%,#FFC58A 100%)",
          border: "rgba(255,136,0,.45)",
          badge: "linear-gradient(135deg,#FF8800,#FFAA55)",
          badgeShadow: "0 6px 18px rgba(255,136,0,.4)",
          avRing: "rgba(255,136,0,.4)",
          avShadow: "0 0 0 4px rgba(255,136,0,.2), 0 10px 24px rgba(255,136,0,.22)",
          crownColor: "#FF8800",
        };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{
        position: "relative",
        background: accent.bg,
        border: `0.5px solid ${accent.border}`,
        borderRadius: 24,
        padding: "40px 18px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        cursor: "pointer",
        minHeight: minH,
        boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)",
        transition: "transform .18s cubic-bezier(.34,1.56,.64,1)",
      }}
    >
      {/* Rank badge */}
      <div
        style={{
          position: "absolute",
          top: -22,
          left: "50%",
          transform: "translateX(-50%)",
          width: 46,
          height: 46,
          borderRadius: "50%",
          background: accent.badge,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 18,
          fontWeight: 700,
          boxShadow: accent.badgeShadow,
          border: "4px solid #fff",
        }}
      >
        {rank}
      </div>

      {/* Crown only on #1 */}
      {rank === 1 && (
        <Crown size={30} color={accent.crownColor} strokeWidth={2.3} style={{ marginBottom: 8 }} />
      )}

      {/* Avatar */}
      <div
        style={{
          width: 66,
          height: 66,
          borderRadius: "50%",
          background: "linear-gradient(140deg,#fff,#E5EEFF)",
          border: `3px solid ${accent.avRing}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          color: "#0055FF",
          boxShadow: accent.avShadow,
          marginBottom: 14,
        }}
      >
        {initialsOf(score.teacher.name)}
      </div>

      <h4
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#001040",
          letterSpacing: "-0.3px",
          margin: "0 0 8px 0",
          padding: "0 8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          width: "100%",
        }}
      >
        {score.teacher.name || score.teacher.email || "Teacher"}
      </h4>

      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: compositeHex(score.composite),
          letterSpacing: "-1px",
          lineHeight: 1,
          marginBottom: 10,
        }}
      >
        {score.composite.toFixed(0)}%
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
        {score.reasons.slice(0, 2).map((b, i) => {
          const tc = toneSwatch(b.tone);
          return (
            <span
              key={i}
              style={{
                padding: "4px 10px",
                borderRadius: 100,
                background: tc.bg,
                color: tc.color,
                border: `0.5px solid ${tc.border}`,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              {b.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TeacherRow({ rank, score, onClick }: { rank: number; score: TeacherScore; onClick: () => void }) {
  const GREEN = "#00C853";
  const RED = "#FF3355";
  const ORANGE = "#FF8800";
  const B1 = "#0055FF";
  const composite = score.composite;

  const avatarGrad =
    composite >= 80
      ? `linear-gradient(135deg, ${GREEN}, #22EE66)`
      : composite >= 60
      ? `linear-gradient(135deg, ${B1}, #4499FF)`
      : composite >= 40
      ? `linear-gradient(135deg, ${ORANGE}, #FFCC22)`
      : `linear-gradient(135deg, ${RED}, #FF7788)`;

  const avShadow =
    composite >= 80
      ? "0 4px 12px rgba(0,200,83,.28)"
      : composite >= 60
      ? "0 4px 12px rgba(0,85,255,.28)"
      : composite >= 40
      ? "0 4px 12px rgba(255,136,0,.28)"
      : "0 4px 12px rgba(255,51,85,.28)";

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,85,255,.03)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      style={{
        padding: "16px 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        transition: "background .15s",
      }}
    >
      <div
        style={{
          width: 40,
          fontSize: 13,
          fontWeight: 700,
          color: "#99AACC",
          letterSpacing: "-0.2px",
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        #{rank}
      </div>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          background: avatarGrad,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
          boxShadow: avShadow,
        }}
      >
        {initialsOf(score.teacher.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#001040",
            letterSpacing: "-0.2px",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {score.teacher.name || score.teacher.email || "Teacher"}
        </p>
        {score.teacher.email && (
          <p
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#99AACC",
              margin: "2px 0 0 0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {score.teacher.email}
          </p>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          justifyContent: "flex-end",
          maxWidth: 340,
        }}
      >
        {score.reasons.slice(0, 2).map((b, i) => {
          const tc = toneSwatch(b.tone);
          return (
            <span
              key={i}
              style={{
                padding: "4px 10px",
                borderRadius: 100,
                background: tc.bg,
                color: tc.color,
                border: `0.5px solid ${tc.border}`,
                fontSize: 10,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {b.label}: {b.value}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, minWidth: 150 }}>
        <p
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: compositeHex(composite),
            letterSpacing: "-0.4px",
            margin: 0,
            lineHeight: 1,
          }}
        >
          {composite.toFixed(0)}%
        </p>
        <div
          style={{
            width: 140,
            height: 6,
            borderRadius: 3,
            background: "#E0ECFF",
            overflow: "hidden",
            marginTop: 6,
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              background: compositeBar(composite),
              width: `${Math.min(100, Math.max(0, composite))}%`,
              transition: "width .5s ease",
            }}
          />
        </div>
      </div>
      <ChevronRight size={16} color="#99AACC" strokeWidth={2.3} />
    </div>
  );
}

function DetailModal({ score, onClose }: { score: TeacherScore; onClose: () => void }) {
  const metrics = [
    { label: "Class Avg Score",  value: score.classAvg,    weight: 35, unit: "%",       raw: false },
    { label: "Pass Rate",        value: score.passRate,    weight: 20, unit: "%",       raw: false },
    { label: "Class Attendance", value: score.attendance,  weight: 20, unit: "%",       raw: false },
    { label: "Assignments",      value: score.assignments, weight: 15, unit: " posted", raw: true  },
    { label: "Punctuality",      value: score.punctuality, weight: 10, unit: "%",       raw: false },
  ];
  const signalsWithData = metrics.filter(
    (m) => m.value !== null && m.value !== undefined && (!m.raw || Number(m.value) > 0)
  ).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,10,60,.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeIn .25s ease both",
      }}
    >
      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes popIn{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 28,
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 40px 80px rgba(0,10,60,.45), 0 0 0 .5px rgba(255,255,255,.1)",
          animation: "popIn .4s cubic-bezier(.34,1.26,.64,1) both",
          fontFamily: "'DM Sans', -apple-system, sans-serif",
        }}
      >
        {/* Dark hero header */}
        <div
          style={{
            padding: "24px 28px",
            background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -60,
              right: -40,
              width: 200,
              height: 200,
              background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 1 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(140deg,#fff,#E5EEFF)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 700,
                color: "#0055FF",
                boxShadow: "0 10px 24px rgba(0,0,0,.25), 0 0 0 3px rgba(255,255,255,.25)",
                flexShrink: 0,
              }}
            >
              {initialsOf(score.teacher.name)}
            </div>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px", margin: 0 }}>
                {score.teacher.name || score.teacher.email}
              </h3>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", fontWeight: 500, margin: "3px 0 0 0" }}>
                {score.teacher.email || "No email"}
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: "#66EEAA", letterSpacing: "-0.8px", lineHeight: 1 }}>
                  {score.composite.toFixed(1)}%
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,.50)",
                  }}
                >
                  Composite Score
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              background: "rgba(255,255,255,.14)",
              border: "0.5px solid rgba(255,255,255,.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
            }}
          >
            <X size={16} color="#fff" strokeWidth={2.3} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
          {score.reasons.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#99AACC",
                  marginBottom: 10,
                }}
              >
                Why They Rank Here
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {score.reasons.map((b, i) => {
                  const tc = toneSwatch(b.tone);
                  return (
                    <span
                      key={i}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 100,
                        background: tc.bg,
                        color: tc.color,
                        border: `0.5px solid ${tc.border}`,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {b.label} · {b.value}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#99AACC",
                }}
              >
                Score Breakdown
              </div>
              <div
                style={{
                  padding: "3px 10px",
                  borderRadius: 100,
                  background: "rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.16)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#0055FF",
                }}
              >
                {signalsWithData}/5 signals
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {metrics.map((m) => {
                const hasData = m.value !== null && m.value !== undefined && (!m.raw || Number(m.value) > 0);
                const numVal = hasData ? Number(m.value) : 0;
                const displayVal = hasData
                  ? m.raw
                    ? `${m.value}${m.unit}`
                    : `${numVal.toFixed(1)}${m.unit}`
                  : m.raw
                  ? `0${m.unit}`
                  : "No data";
                const pctBar = hasData && !m.raw ? Math.min(100, numVal) : m.raw && Number(m.value) > 0 ? 4 : 0;
                const valColor = !hasData
                  ? "#99AACC"
                  : m.raw
                  ? Number(m.value) > 0 ? "#00994A" : "#FF3355"
                  : compositeHex(numVal);
                return (
                  <div key={m.label}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#002080", letterSpacing: "-0.1px" }}>
                          {m.label}
                        </span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 100,
                            background: "rgba(0,85,255,.08)",
                            border: "0.5px solid rgba(0,85,255,.14)",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#0055FF",
                          }}
                        >
                          {m.weight}% Weight
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: valColor,
                          fontStyle: !hasData ? "italic" : "normal",
                        }}
                      >
                        {displayVal}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 7,
                        borderRadius: 4,
                        background: "#E0ECFF",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 4,
                          background: hasData
                            ? m.raw
                              ? Number(m.value) > 0
                                ? "linear-gradient(90deg, #00C853, #66EE88)"
                                : "linear-gradient(90deg, #FF3355, #FF7788)"
                              : compositeBar(numVal)
                            : "#E0ECFF",
                          width: `${pctBar}%`,
                          transition: "width .5s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { lbl: "Students", val: score.studentCount },
              { lbl: "Tests Recorded", val: score.testCount },
              { lbl: "Assignments", val: score.assignments },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: "#EEF4FF",
                  borderRadius: 14,
                  padding: 16,
                  textAlign: "center",
                  border: "0.5px solid rgba(0,85,255,.10)",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#99AACC",
                    marginBottom: 6,
                  }}
                >
                  {s.lbl}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#001040", letterSpacing: "-0.5px", lineHeight: 1 }}>
                  {s.val}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 28px",
            borderTop: "0.5px solid rgba(0,85,255,.07)",
            background: "#EEF4FF",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: 11, color: "#5070B0", fontWeight: 500, margin: 0, lineHeight: 1.55 }}>
            Weighted signals:{" "}
            <strong style={{ color: "#0055FF", fontWeight: 700 }}>scores 35%</strong> ·{" "}
            <strong style={{ color: "#0055FF", fontWeight: 700 }}>pass 20%</strong> ·{" "}
            <strong style={{ color: "#0055FF", fontWeight: 700 }}>attendance 20%</strong> ·{" "}
            <strong style={{ color: "#0055FF", fontWeight: 700 }}>assignments 15%</strong> ·{" "}
            <strong style={{ color: "#0055FF", fontWeight: 700 }}>punctuality 10%</strong>
          </p>
          <button
            onClick={onClose}
            style={{
              padding: "10px 22px",
              borderRadius: 12,
              background: "linear-gradient(135deg, #0055FF, #1166FF)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
              fontFamily: "inherit",
              letterSpacing: "0.02em",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <X size={14} strokeWidth={2.4} />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}