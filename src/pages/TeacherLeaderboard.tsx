import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  collection, query, where, onSnapshot,
} from "firebase/firestore";
import {
  Trophy, Loader2, Users, Award, Crown,
  TrendingUp, Filter, ChevronDown, X, Search, Sparkles, BookOpen,
} from "lucide-react";
import {
  scoreTeachers, TeacherScore, TeacherDoc, ScoreDoc,
  AttendanceDoc, AssignmentDoc, TeacherAttendanceDoc,
} from "@/lib/teacherScorer";

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

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1e294b] tracking-tight flex items-center gap-2">
            <Trophy className="w-7 h-7 text-amber-500" /> Teacher Leaderboard
          </h1>
          <p className="text-slate-500 text-xs md:text-sm font-medium mt-0.5">
            Top performers in your branch — auto-ranked by student outcomes + engagement
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-slate-100 rounded-xl p-1">
            {(["term", "month", "all"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  timeRange === r ? "bg-white text-[#1e3a8a] shadow-sm" : "text-slate-500"
                }`}
              >
                {r === "term" ? "This Term" : r === "month" ? "This Month" : "All Time"}
              </button>
            ))}
          </div>
          <div className="relative">
            <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="appearance-none border border-slate-200 rounded-xl pl-9 pr-10 py-2 text-xs font-bold text-slate-600 bg-white outline-none focus:ring-2 focus:ring-[#1e3a8a]/10 min-w-[180px]"
            >
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Teachers", value: stats.total,                                      icon: Users,     color: "text-blue-600",    bg: "bg-blue-50",    note: classFilter === "All" ? "In branch" : "Teaching this class" },
          { label: "Avg Performance", value: `${stats.avg.toFixed(1)}%`,                      icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", note: "Across filtered set" },
          { label: "Active Teachers", value: stats.active,                                    icon: Sparkles,  color: "text-violet-600",  bg: "bg-violet-50",  note: "With recent data" },
          { label: "Top Performer",   value: stats.top ? `${stats.top.composite.toFixed(0)}%` : "—", icon: Crown, color: "text-amber-600",   bg: "bg-amber-50",   note: stats.top?.teacher.name || "No teachers yet" },
        ].map((s) => (
          <div key={s.label} className="clickable-card bg-white p-4 md:p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{s.label}</p>
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
            </div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-[#1e294b] tracking-tight mb-1">{s.value}</h3>
            <p className={`text-[10px] font-bold ${s.color} truncate`}>{s.note}</p>
          </div>
        ))}
      </div>

      {/* Empty */}
      {ranked.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center">
          <Trophy className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-base font-extrabold text-[#1e294b] mb-1">No teachers to rank yet</h3>
          <p className="text-sm text-slate-500 font-medium max-w-md mx-auto">
            {classFilter !== "All"
              ? "No teachers assigned to this class yet, or no performance data recorded."
              : "Once teachers are added and academic data is recorded, they'll appear here with rankings."}
          </p>
        </div>
      ) : (
        <>
          {/* Top Podium — only teachers with real data */}
          {top3.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 via-white to-blue-50 rounded-3xl border border-amber-100 p-5 md:p-8 pt-10">
              <div className="flex items-center gap-2 mb-8">
                <Award className="w-5 h-5 text-amber-600" />
                <h2 className="text-sm font-extrabold text-[#1e294b] uppercase tracking-wider">
                  {top3.length === 1 ? "Top Performer" : top3.length === 2 ? "Top 2 Performers" : "Top 3 Performers"}
                </h2>
              </div>
              <div className={`grid gap-3 md:gap-6 items-end ${
                top3.length === 1 ? "grid-cols-1 max-w-xs mx-auto" :
                top3.length === 2 ? "grid-cols-2 max-w-2xl mx-auto" :
                "grid-cols-3"
              }`}>
                {top3.length >= 3 && top3[1] && <PodiumCard rank={2} score={top3[1]} onClick={() => setSelected(top3[1])} />}
                {top3[0] && <PodiumCard rank={1} score={top3[0]} onClick={() => setSelected(top3[0])} />}
                {top3.length === 2 && top3[1] && <PodiumCard rank={2} score={top3[1]} onClick={() => setSelected(top3[1])} />}
                {top3.length >= 3 && top3[2] && <PodiumCard rank={3} score={top3[2]} onClick={() => setSelected(top3[2])} />}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teacher by name or email..."
                className="pl-10 h-10 w-full border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
              />
            </div>
            {classFilter !== "All" && (
              <button
                onClick={() => setClassFilter("All")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider transition-all"
              >
                <X className="w-3 h-3" /> Clear Class
              </button>
            )}
          </div>

          {/* Full ranked list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#1e294b] uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Full Rankings ({ranked.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {(rest.length > 0 ? rest : ranked).map((r, i) => {
                const rank = rest.length > 0 ? i + 4 : i + 1;
                return <TeacherRow key={r.teacher.id} rank={rank} score={r} onClick={() => setSelected(r)} />;
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
function PodiumCard({ rank, score, onClick }: { rank: 1 | 2 | 3; score: TeacherScore; onClick: () => void }) {
  const heightClass = rank === 1 ? "min-h-[260px]" : rank === 2 ? "min-h-[220px]" : "min-h-[200px]";
  const accent =
    rank === 1 ? { border: "border-amber-300", bg: "bg-gradient-to-br from-amber-100 to-white", ring: "ring-amber-400/40", badgeBg: "bg-amber-500", trophy: "text-amber-600" }
    : rank === 2 ? { border: "border-slate-300", bg: "bg-gradient-to-br from-slate-100 to-white", ring: "ring-slate-400/30", badgeBg: "bg-slate-400", trophy: "text-slate-500" }
    : { border: "border-orange-300", bg: "bg-gradient-to-br from-orange-100 to-white", ring: "ring-orange-400/30", badgeBg: "bg-orange-500", trophy: "text-orange-600" };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`clickable-card relative ${accent.bg} ${accent.border} border-2 rounded-3xl p-4 md:p-5 pt-8 flex flex-col items-center justify-end text-center shadow-sm hover:ring-4 ${accent.ring} transition-all cursor-pointer ${heightClass}`}
    >
      <div className={`absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full ${accent.badgeBg} flex items-center justify-center text-white font-black text-lg md:text-xl shadow-lg ring-4 ring-white`}>
        {rank}
      </div>
      {rank === 1 && <Crown className={`w-7 h-7 md:w-8 md:h-8 ${accent.trophy} mb-2`} />}
      <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full bg-white border-2 ${accent.border} flex items-center justify-center text-base md:text-lg font-extrabold text-[#1e294b] shadow-sm mb-3`}>
        {initialsOf(score.teacher.name)}
      </div>
      <h4 className="text-sm md:text-base font-extrabold text-[#1e294b] truncate w-full px-2">
        {score.teacher.name || score.teacher.email || "Teacher"}
      </h4>
      <div className={`text-2xl md:text-3xl font-black mt-2 ${scoreTone(score.composite)}`}>
        {score.composite.toFixed(0)}%
      </div>
      <div className="flex flex-wrap justify-center gap-1 mt-2">
        {score.reasons.slice(0, 2).map((b, i) => (
          <span key={i} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${TONE_CLASSES[b.tone]}`}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TeacherRow({ rank, score, onClick }: { rank: number; score: TeacherScore; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="px-4 md:px-5 py-3.5 flex items-center gap-3 md:gap-4 hover:bg-slate-50/60 transition-colors cursor-pointer"
    >
      <div className="w-7 md:w-9 text-center text-xs md:text-sm font-black text-slate-400">#{rank}</div>
      <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-xs md:text-sm font-extrabold text-[#1e294b] flex-shrink-0">
        {initialsOf(score.teacher.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-[#1e294b] truncate">
          {score.teacher.name || score.teacher.email || "Teacher"}
        </p>
        {score.teacher.email && (
          <p className="text-[10px] font-bold text-slate-400 truncate">{score.teacher.email}</p>
        )}
      </div>
      <div className="hidden md:flex flex-wrap gap-1 max-w-[340px] justify-end">
        {score.reasons.slice(0, 2).map((b, i) => (
          <span key={i} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${TONE_CLASSES[b.tone]}`}>
            {b.label}: {b.value}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 ml-auto md:ml-0">
        <div className="w-20 md:w-32 flex flex-col items-end">
          <p className={`text-base md:text-lg font-black ${scoreTone(score.composite)}`}>
            {score.composite.toFixed(0)}%
          </p>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${scoreBgTone(score.composite)} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(100, score.composite)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ score, onClose }: { score: TeacherScore; onClose: () => void }) {
  const metrics = [
    { label: "Class Avg Score",  value: score.classAvg,    weight: 35, unit: "%" },
    { label: "Pass Rate",        value: score.passRate,    weight: 20, unit: "%" },
    { label: "Class Attendance", value: score.attendance,  weight: 20, unit: "%" },
    { label: "Assignments",      value: score.assignments, weight: 15, unit: " posted", raw: true },
    { label: "Punctuality",      value: score.punctuality, weight: 10, unit: "%" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-blue-50 flex items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-white border-2 border-amber-200 flex items-center justify-center text-base font-extrabold text-[#1e294b] flex-shrink-0">
              {initialsOf(score.teacher.name)}
            </div>
            <div>
              <h3 className="text-base md:text-lg font-extrabold text-[#1e294b]">
                {score.teacher.name || score.teacher.email}
              </h3>
              <p className="text-xs font-semibold text-slate-500">{score.teacher.email || "No email"}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xl md:text-2xl font-black ${scoreTone(score.composite)}`}>
                  {score.composite.toFixed(1)}%
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Composite Score
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 transition-all">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {score.reasons.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Why They Rank Here
              </p>
              <div className="flex flex-wrap gap-2">
                {score.reasons.map((b, i) => (
                  <span key={i} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${TONE_CLASSES[b.tone]}`}>
                    {b.label} · {b.value}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Score Breakdown</p>
            <div className="space-y-3">
              {metrics.map((m) => {
                const hasData = m.value !== null && m.value !== undefined;
                const displayVal = hasData
                  ? m.raw
                    ? `${m.value}${m.unit}`
                    : `${(m.value as number).toFixed(1)}${m.unit}`
                  : "No data";
                const pctBar = hasData && !m.raw ? Math.min(100, m.value as number) : 0;
                return (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">{m.label}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {m.weight}% weight
                        </span>
                      </div>
                      <span className={`text-xs font-extrabold ${hasData ? scoreTone(Number(m.value)) : "text-slate-400"}`}>
                        {displayVal}
                      </span>
                    </div>
                    {hasData && !m.raw && (
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full ${scoreBgTone(Number(m.value))} rounded-full transition-all duration-500`}
                          style={{ width: `${pctBar}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Students</p>
              <p className="text-lg font-extrabold text-[#1e294b]">{score.studentCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tests Recorded</p>
              <p className="text-lg font-extrabold text-[#1e294b]">{score.testCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assignments</p>
              <p className="text-lg font-extrabold text-[#1e294b]">{score.assignments}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-semibold">
            Weighted signals: scores 35% · pass rate 20% · attendance 20% · assignments 15% · punctuality 10%
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#1e3a8a] text-white text-xs font-bold hover:bg-[#152961] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}