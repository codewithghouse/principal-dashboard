import { useState, useEffect, useMemo } from "react";
import {
  FileText, Users, Percent, Trophy, AlertTriangle,
  ChevronRight, Loader2, Calendar, TrendingDown, TrendingUp
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from "recharts";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where } from "firebase/firestore";
import ExamDetail from "@/components/ExamDetail";

/* ══════════════════════════════════════════════════════════════
   Shared types  (imported by ExamDetail)
══════════════════════════════════════════════════════════════ */
export interface ClassRow {
  section: string; appeared: number; passed: number; failed: number;
  passRate: number; topper: string; topperPct: number; avgPct: number;
}
export interface MeritEntry { rank: number; name: string; className: string; avgPct: number; }
export interface FailEntry  { name: string; className: string; avgPct: number; initials: string; }
export interface ExamGroup {
  name: string; dateLabel: string; totalStudents: number;
  passRate: number; avgPct: number; scores: any[];
  classSummary: ClassRow[]; meritList: MeritEntry[]; failList: FailEntry[];
}

/* ──────────────────────────────────────────────────────────── */
function chunk<T>(arr: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function fmtDate(str: string) {
  if (!str) return "";
  const d = new Date(str);
  return isNaN(d.getTime()) ? str
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildExamGroup(name: string, scores: any[]): ExamGroup {
  const appeared = scores.filter(s => !s.isAbsent && s.score !== null && s.score !== undefined);

  const classMap = new Map<string, any[]>();
  appeared.forEach(s => {
    const cls = s.className || s.classId || "Unknown";
    if (!classMap.has(cls)) classMap.set(cls, []);
    classMap.get(cls)!.push(s);
  });

  const classSummary: ClassRow[] = Array.from(classMap.entries()).map(([cls, rows]) => {
    const passed = rows.filter(r => r.percentage >= 50);
    const avg    = rows.reduce((a, r) => a + r.percentage, 0) / rows.length;
    const top    = [...rows].sort((a, b) => b.percentage - a.percentage)[0];
    return {
      section: cls, appeared: rows.length,
      passed: passed.length, failed: rows.length - passed.length,
      passRate: Math.round(passed.length / rows.length * 100),
      topper: top ? `${top.studentName} (${Math.round(top.percentage)}%)` : "—",
      topperPct: top?.percentage || 0, avgPct: Math.round(avg),
    };
  }).sort((a, b) => a.section.localeCompare(b.section));

  const stMap = new Map<string, { name: string; className: string; total: number; count: number }>();
  appeared.forEach(s => {
    if (!stMap.has(s.studentId))
      stMap.set(s.studentId, { name: s.studentName, className: s.className || s.classId || "", total: 0, count: 0 });
    const e = stMap.get(s.studentId)!; e.total += s.percentage; e.count++;
  });
  const meritList: MeritEntry[] = Array.from(stMap.values())
    .map(v => ({ name: v.name, className: v.className, avgPct: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avgPct - a.avgPct).slice(0, 5)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const fMap = new Map<string, { name: string; className: string; total: number; count: number }>();
  appeared.filter(s => s.percentage < 50).forEach(s => {
    if (!fMap.has(s.studentId))
      fMap.set(s.studentId, { name: s.studentName, className: s.className || s.classId || "", total: 0, count: 0 });
    const e = fMap.get(s.studentId)!; e.total += s.percentage; e.count++;
  });
  const failList: FailEntry[] = Array.from(fMap.values())
    .map(v => ({ name: v.name, className: v.className, avgPct: Math.round(v.total / v.count), initials: v.name?.substring(0, 2).toUpperCase() || "??" }))
    .sort((a, b) => a.avgPct - b.avgPct).slice(0, 8);

  const dates = [...new Set(scores.map(s => s.testDate || s.date || "").filter(Boolean))].sort();
  const dateLabel = dates.length === 0 ? "—"
    : dates.length === 1 ? fmtDate(dates[0])
    : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`;

  const totalPassed = appeared.filter(s => s.percentage >= 50).length;
  const totalAvg    = appeared.length ? appeared.reduce((a, s) => a + s.percentage, 0) / appeared.length : 0;

  return { name, dateLabel, totalStudents: appeared.length,
    passRate: appeared.length ? Math.round(totalPassed / appeared.length * 100) : 0,
    avgPct: Math.round(totalAvg), scores, classSummary, meritList, failList };
}

/* ══════════════════════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════════════════════ */
const BORDER_COLORS = ["#1e3a8a", "#d97706", "#16a34a"];
const GRADE_COLORS  = ["#16a34a", "#1d4ed8", "#d97706", "#ef4444"];

export default function ExamsResults() {
  const { userData } = useAuth();

  const [allScores,      setAllScores]      = useState<any[]>([]);
  const [upcomingExams,  setUpcomingExams]  = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [selectedExam,   setSelectedExam]   = useState<ExamGroup | null>(null);

  /* ── fetch data ── */
  useEffect(() => {
    if (!userData?.schoolId) return;
    const go = async () => {
      try {
        /* 1. test_scores by schoolId */
        const scoresSnap = await getDocs(
          query(collection(db, "test_scores"), where("schoolId", "==", userData.schoolId))
        );
        const rawScores = scoresSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

        /* 2. enrich with className from tests */
        const testIds = [...new Set(rawScores.map(s => s.testId).filter(Boolean))] as string[];
        const testsMap = new Map<string, any>();
        for (const ids of chunk(testIds, 30)) {
          const tSnap = await getDocs(query(collection(db, "tests"), where("__name__", "in", ids)));
          tSnap.docs.forEach(d => testsMap.set(d.id, { id: d.id, ...d.data() }));
        }
        const enriched = rawScores.map(s => {
          const t = testsMap.get(s.testId);
          return { ...s, className: s.className || t?.className || "", testDate: s.testDate || t?.testDate || t?.date || "" };
        });
        setAllScores(enriched);

        /* 3. upcoming tests via teachers */
        const tSnap = await getDocs(
          query(collection(db, "teachers"), where("schoolId", "==", userData.schoolId))
        );
        const tIds = tSnap.docs.map(d => d.id);
        const upcoming: any[] = [];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (const ids of chunk(tIds, 10)) {
          if (!ids.length) continue;
          const uSnap = await getDocs(
            query(collection(db, "tests"), where("teacherId", "in", ids))
          );
          uSnap.docs.forEach(d => {
            const data = { id: d.id, ...d.data() } as any;
            const examDate = new Date(data.testDate || data.date || 0);
            if (examDate >= today && data.status !== "Completed")
              upcoming.push(data);
          });
        }
        upcoming.sort((a, b) =>
          new Date(a.testDate || a.date || 0).getTime() - new Date(b.testDate || b.date || 0).getTime()
        );
        setUpcomingExams(upcoming);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    go();
  }, [userData?.schoolId]);

  /* ── derived: exam groups ── */
  const examGroups = useMemo<ExamGroup[]>(() => {
    const map = new Map<string, any[]>();
    allScores.forEach(s => {
      const key = s.testName || s.testId || "Unnamed Exam";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries())
      .map(([name, scores]) => buildExamGroup(name, scores))
      .sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));
  }, [allScores]);

  /* ── derived: latest exam ── */
  const latestExam = examGroups[0] || null;
  const prevExam   = examGroups[1] || null;

  /* ── derived: subject pass rates ── */
  const subjectData = useMemo(() => {
    const map = new Map<string, { passed: number; total: number }>();
    allScores.filter(s => !s.isAbsent && s.score !== null).forEach(s => {
      const subj = (s.subject || s.subjectName || "Unknown").trim();
      if (!map.has(subj)) map.set(subj, { passed: 0, total: 0 });
      const e = map.get(subj)!; e.total++;
      if (s.percentage >= 50) e.passed++;
    });
    return Array.from(map.entries())
      .map(([name, { passed, total }]) => ({ name: name.length > 8 ? name.slice(0, 8) : name, passRate: Math.round(passed / total * 100) }))
      .sort((a, b) => a.passRate - b.passRate);
  }, [allScores]);

  /* ── derived: grade distribution ── */
  const gradeData = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, Failed: 0 };
    (latestExam?.scores || []).filter(s => !s.isAbsent && s.score !== null).forEach(s => {
      const g = s.grade || "";
      if (g === "A") counts.A++;
      else if (g === "B") counts.B++;
      else if (g === "C") counts.C++;
      else counts.Failed++;
    });
    return [
      { name: "A Grade", value: counts.A,      color: GRADE_COLORS[0] },
      { name: "B Grade", value: counts.B,      color: GRADE_COLORS[1] },
      { name: "C Grade", value: counts.C,      color: GRADE_COLORS[2] },
      { name: "Failed",  value: counts.Failed, color: GRADE_COLORS[3] },
    ].filter(d => d.value > 0);
  }, [latestExam]);

  /* ── derived: failed students by subject ── */
  const failedBySubject = useMemo(() => {
    const map = new Map<string, any[]>();
    (latestExam?.scores || []).filter(s => !s.isAbsent && s.percentage < 50).forEach(s => {
      const subj = (s.subject || s.subjectName || "Unknown").trim();
      if (!map.has(subj)) map.set(subj, []);
      map.get(subj)!.push(s);
    });
    return Array.from(map.entries())
      .map(([subject, students]) => ({ subject, students: students.sort((a, b) => a.percentage - b.percentage) }))
      .sort((a, b) => b.students.length - a.students.length);
  }, [latestExam]);

  /* ── derived: pass rate trend ── */
  const passRateDiff = latestExam && prevExam
    ? latestExam.passRate - prevExam.passRate : null;

  /* ── school topper ── */
  const topper = latestExam?.meritList[0] || null;

  /* ── detail view ── */
  if (selectedExam) {
    return <ExamDetail exam={selectedExam} allExams={examGroups} onBack={() => setSelectedExam(null)} userData={userData} />;
  }

  /* ══ MAIN RENDER ══════════════════════════════════════════════ */
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">

      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
          RESULT OF CLICK: "EXAMS &amp; RESULTS"
        </p>
        <p className="text-sm text-muted-foreground">Manage exams and view student results</p>
      </div>

      {/* ── Upcoming Exams ── */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-5">Upcoming Exams</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : upcomingExams.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No upcoming exams scheduled. Teachers can create exams from the Teacher Dashboard.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingExams.slice(0, 3).map((exam, i) => {
              const color = BORDER_COLORS[i % BORDER_COLORS.length];
              const dateStr = fmtDate(exam.testDate || exam.date || "");
              return (
                <div key={exam.id} className="p-4 rounded-xl border border-border bg-muted/10 hover:bg-muted/20 transition-colors"
                  style={{ borderLeftWidth: "4px", borderLeftColor: color }}>
                  <p className="text-sm font-bold text-foreground mb-1">{exam.title || exam.testName}</p>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {dateStr || "Date TBD"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {exam.className ? `Class: ${exam.className}` : exam.subject || ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4 Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Latest Exam */}
        <div
          className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => latestExam && setSelectedExam(latestExam)}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground">Latest Exam</p>
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-lg font-black text-foreground leading-tight mb-1">
            {loading ? "…" : latestExam?.name || "No data"}
          </p>
          <p className="text-xs text-muted-foreground">{loading ? "" : latestExam?.dateLabel || ""}</p>
          {latestExam && (
            <p className="text-[10px] text-blue-600 font-semibold mt-2 group-hover:underline">View Results →</p>
          )}
        </div>

        {/* Students Appeared */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground">Students Appeared</p>
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <p className="text-3xl font-black text-foreground mb-1">
            {loading ? "…" : latestExam?.totalStudents ?? "—"}
          </p>
          {latestExam && (
            <p className="text-xs text-muted-foreground">
              {latestExam.scores.filter(s => !s.isAbsent).length} of {latestExam.scores.length} total
            </p>
          )}
        </div>

        {/* Pass Rate */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground">Pass Rate</p>
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Percent className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <p className={`text-3xl font-black mb-1 ${
            loading ? "text-foreground"
              : (latestExam?.passRate ?? 0) >= 75 ? "text-green-600"
              : (latestExam?.passRate ?? 0) >= 50 ? "text-amber-500"
              : "text-red-500"
          }`}>
            {loading ? "…" : latestExam ? `${latestExam.passRate}%` : "—"}
          </p>
          {passRateDiff !== null && (
            <p className={`text-xs flex items-center gap-1 ${passRateDiff >= 0 ? "text-green-600" : "text-red-500"}`}>
              {passRateDiff >= 0
                ? <TrendingUp className="w-3 h-3" />
                : <TrendingDown className="w-3 h-3" />}
              {Math.abs(passRateDiff)}% vs last exam
            </p>
          )}
        </div>

        {/* School Topper */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground">School Topper</p>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-lg font-black text-foreground leading-tight mb-1">
            {loading ? "…" : topper?.name || "—"}
          </p>
          {topper && (
            <p className="text-xs text-muted-foreground">
              {topper.className && `${topper.className} • `}{topper.avgPct}%
            </p>
          )}
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Subject-wise Pass Rates */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-4">Subject-wise Pass Rates</h3>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : subjectData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No subject data yet</p>
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }} domain={[0, 100]} />
                  <RechartsTip
                    formatter={(v: any) => [`${v}%`, "Pass Rate"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Bar dataKey="passRate" radius={[4, 4, 0, 0]} maxBarSize={52} label={{ position: "top", fontSize: 11, fontWeight: 700, fill: "#475569", formatter: (v: any) => `${v}%` }}>
                    {subjectData.map((d, i) => (
                      <Cell key={i} fill={d.passRate >= 80 ? "#16a34a" : d.passRate >= 60 ? "#d97706" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Grade Distribution */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-4">Grade Distribution</h3>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : gradeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No grade data yet</p>
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gradeData} cx="45%" cy="50%" innerRadius={60} outerRadius={90}
                    paddingAngle={3} dataKey="value" stroke="none" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {gradeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Legend
                    iconType="circle" iconSize={10}
                    formatter={(value) => <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{value}</span>}
                  />
                  <RechartsTip
                    formatter={(v: any, name) => [`${v} students`, name]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Failed Students by Subject ── */}
      {!loading && failedBySubject.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2 bg-red-50/40">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="text-base font-bold text-red-900">Failed Students by Subject</h3>
            {latestExam && <span className="text-xs text-muted-foreground ml-1">— {latestExam.name}</span>}
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {failedBySubject.slice(0, 4).map(({ subject, students }) => (
                <div key={subject} className="border border-red-100 rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2.5 flex items-center justify-between">
                    <p className="text-xs font-bold text-red-700 uppercase tracking-wide">{subject}</p>
                    <span className="text-xs font-black text-red-500">{students.length} failed</span>
                  </div>
                  <div className="divide-y divide-red-50">
                    {students.slice(0, 4).map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                            {s.studentName?.substring(0, 2).toUpperCase()}
                          </div>
                          <p className="text-xs font-semibold text-foreground truncate">{s.studentName}</p>
                        </div>
                        <span className="text-xs font-bold text-red-500 shrink-0 ml-2">{Math.round(s.percentage)}%</span>
                      </div>
                    ))}
                    {students.length > 4 && (
                      <p className="px-4 py-2 text-[10px] text-muted-foreground font-semibold">+{students.length - 4} more</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── All Exams table ── */}
      {!loading && examGroups.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">All Exams</h3>
            <span className="text-xs text-muted-foreground font-semibold">{examGroups.length} exams</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {["Exam Name", "Date", "Students", "Pass Rate", "Avg %", ""].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {examGroups.map((exam, i) => (
                  <tr key={i} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1e3a8a]/10 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-[#1e3a8a]" />
                        </div>
                        <span className="text-sm font-bold text-foreground">{exam.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{exam.dateLabel || "—"}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-foreground">{exam.totalStudents}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${exam.passRate >= 75 ? "text-green-600" : exam.passRate >= 50 ? "text-amber-500" : "text-red-500"}`}>
                        {exam.passRate}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${exam.avgPct >= 70 ? "text-green-600" : exam.avgPct >= 50 ? "text-amber-500" : "text-red-500"}`}>
                        {exam.avgPct}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedExam(exam)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a8a] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a8a]/90 transition-colors whitespace-nowrap"
                      >
                        View Exam Results <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && examGroups.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-12 text-center shadow-sm">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm font-bold text-muted-foreground">No exam results yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Teachers submit scores via Teacher Dashboard → Tests &amp; Exams.
          </p>
        </div>
      )}
    </div>
  );
}
