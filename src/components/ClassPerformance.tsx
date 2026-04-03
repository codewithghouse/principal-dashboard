import { useState, useEffect } from "react";
import {
  ChevronLeft, Download, Loader2, Users,
  GraduationCap, CalendarCheck, TrendingUp, AlertTriangle
} from "lucide-react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area,
  ResponsiveContainer
} from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

interface ClassDoc {
  id: string;
  name: string;
  grade: string;
  section: string;
  teacherName: string;
  teacherId: string;
  schoolId: string;
  branchId: string;
  avgMarks: string;
  attendance: string;
  status: string;
  studentCount: number;
  weakSubject: string;
}

interface Props {
  classDoc: ClassDoc;
  onBack: () => void;
}

// ── Colour helpers ─────────────────────────────────────────────────────────────
const scoreColor = (v: number) =>
  v >= 70 ? "#22c55e" : v >= 50 ? "#f59e0b" : "#ef4444";

const attColor = (v: number) =>
  v >= 85 ? "#22c55e" : v >= 70 ? "#f59e0b" : "#ef4444";

const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
  return "";
};

const last7Days = (): string[] => {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
};

// ─────────────────────────────────────────────────────────────────────────────

const ClassPerformance = ({ classDoc, onBack }: Props) => {
  const [attRecords,   setAttRecords]   = useState<any[]>([]);
  const [results,      setResults]      = useState<any[]>([]);
  const [enrollments,  setEnrollments]  = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!classDoc.id) { setLoading(false); return; }
    setLoading(true);

    const q = (col: string) => query(collection(db, col), where("classId", "==", classDoc.id));
    let done = 0;
    const tryDone = () => { done++; if (done >= 3) setLoading(false); };

    const u1 = onSnapshot(q("enrollments"), snap => { setEnrollments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); tryDone(); }, () => tryDone());
    const u2 = onSnapshot(q("attendance"),  snap => { setAttRecords(snap.docs.map(d => d.data())); tryDone(); }, () => tryDone());
    const u3 = onSnapshot(q("results"),     snap => { setResults(snap.docs.map(d => d.data())); tryDone(); }, () => tryDone());

    return () => { u1(); u2(); u3(); };
  }, [classDoc.id]);

  // ── Derived: per-student data ─────────────────────────────────────────────
  type StudentRow = {
    sid: string;
    name: string;
    email: string;
    initials: string;
    subjects: Record<string, number>;
    avgScore: number;
    attPct: number | null;
    status: string;
  };

  const studentRows: StudentRow[] = enrollments.map(e => {
    const sid   = e.studentId || e.id;
    const email = (e.studentEmail || e.email || "").toLowerCase();
    const name  = e.studentName || e.name || "Unknown";

    // Results for this student
    const res = results.filter(r =>
      (sid   && r.studentId   === sid) ||
      (email && r.studentEmail?.toLowerCase() === email)
    );

    // Group by subject
    const subMap: Record<string, number[]> = {};
    res.forEach(r => {
      const sub = r.subject || r.subjectName || "General";
      if (!subMap[sub]) subMap[sub] = [];
      subMap[sub].push(Number(r.percentage ?? r.score ?? 0));
    });
    const subjects: Record<string, number> = {};
    Object.entries(subMap).forEach(([sub, scores]) => {
      subjects[sub] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    });

    const allScores = Object.values(subjects);
    const avgScore  = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;

    // Attendance
    const attRecs = attRecords.filter(r =>
      (sid   && r.studentId   === sid) ||
      (email && r.studentEmail?.toLowerCase() === email)
    );
    let attPct: number | null = null;
    if (attRecs.length > 0) {
      const present = attRecs.filter(r => r.status === "present" || r.status === "late").length;
      attPct = Math.round((present / attRecs.length) * 100);
    }

    const status =
      attPct !== null && attPct < 75 ? "At Risk" :
      avgScore >= 80 ? "Excellent" :
      avgScore >= 60 ? "Good" :
      avgScore >= 40 ? "Average" : "At Risk";

    return {
      sid, name, email,
      initials: name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2),
      subjects,
      avgScore,
      attPct,
      status,
    };
  })
  .sort((a, b) => b.avgScore - a.avgScore)
  .map((s, i) => ({ ...s, rank: i + 1 })) as any[];

  // ── Derived: all unique subjects ──────────────────────────────────────────
  const allSubjects: string[] = Array.from(
    new Set(results.map(r => r.subject || r.subjectName || "General").filter(Boolean))
  ).slice(0, 6);

  // ── Subject bar chart data ────────────────────────────────────────────────
  const subjectBarData = allSubjects.map(sub => {
    const scores = results
      .filter(r => (r.subject || r.subjectName) === sub)
      .map(r => Number(r.percentage ?? r.score ?? 0));
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { subject: sub.slice(0, 5).toUpperCase(), avg, color: scoreColor(avg) };
  });

  // ── Donut chart data ──────────────────────────────────────────────────────
  const excellent = studentRows.filter(s => s.status === "Excellent").length;
  const good      = studentRows.filter(s => s.status === "Good").length;
  const average   = studentRows.filter(s => s.status === "Average").length;
  const atRisk    = studentRows.filter(s => s.status === "At Risk").length;
  const pieData = [
    { name: "Excellent", value: excellent, color: "#22c55e" },
    { name: "Good",      value: good,      color: "#1e3a8a" },
    { name: "Average",   value: average,   color: "#f59e0b" },
    { name: "At Risk",   value: atRisk,    color: "#ef4444" },
  ].filter(d => d.value > 0);

  // If no result data yet, show placeholder pie
  const pieDataFinal = pieData.length > 0
    ? pieData
    : [{ name: "No data", value: 1, color: "#e2e8f0" }];

  // ── Attendance trend (last 7 days) ────────────────────────────────────────
  const days7 = last7Days();
  const attTrendData = days7.map(iso => {
    const dayRecs = attRecords.filter(r => toDateStr(r.date) === iso);
    let v: number | null = null;
    if (dayRecs.length > 0) {
      const present = dayRecs.filter(r => r.status === "present" || r.status === "late").length;
      v = Math.round((present / dayRecs.length) * 100);
    }
    return { day: dayLabel(iso), value: v ?? 0, hasData: v !== null };
  });

  // ── Overall class stats ───────────────────────────────────────────────────
  const totalStudents = enrollments.length;
  const classAvgScore = studentRows.length > 0
    ? Math.round(studentRows.reduce((a, s) => a + s.avgScore, 0) / studentRows.length)
    : 0;
  const classAttPct = (() => {
    if (attRecords.length === 0) return null;
    const present = attRecords.filter(r => r.status === "present" || r.status === "late").length;
    return Math.round((present / attRecords.length) * 100);
  })();

  const classStatus =
    classAvgScore >= 70 && (classAttPct === null || classAttPct >= 85) ? "Good" :
    classAvgScore < 45 || (classAttPct !== null && classAttPct < 70)   ? "Weak" :
    "Average";

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const subHeaders = allSubjects.length > 0 ? allSubjects : ["Score"];
    const headers = ["Rank", "Name", "Email", ...subHeaders, "Avg Score", "Attendance", "Status"];
    const rows = studentRows.map((s: any) => [
      s.rank,
      s.name,
      s.email,
      ...subHeaders.map(sub => s.subjects[sub] !== undefined ? `${s.subjects[sub]}%` : "—"),
      `${s.avgScore}%`,
      s.attPct !== null ? `${s.attPct}%` : "—",
      s.status,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${classDoc.name}_performance.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export complete!");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in duration-500 pb-12 space-y-6">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Classes
      </button>

      {/* Header card */}
      <div className={`rounded-2xl p-6 border ${
        classStatus === "Good" ? "bg-green-50 border-green-100" :
        classStatus === "Weak" ? "bg-rose-50 border-rose-100" :
        "bg-amber-50 border-amber-100"
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-black text-slate-900">{classDoc.name}</h1>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white ${
                classStatus === "Good" ? "bg-green-500" :
                classStatus === "Weak" ? "bg-rose-500" : "bg-amber-500"
              }`}>
                {classStatus}
              </span>
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-slate-500 font-medium">
              {classDoc.teacherName && (
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4" /> {classDoc.teacherName}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" /> {totalStudents} Students
              </span>
              {classDoc.grade && (
                <span className="flex items-center gap-1.5">
                  Grade {classDoc.grade}{classDoc.section ? ` — Section ${classDoc.section}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Class Average</p>
            <p className={`text-5xl font-black ${scoreColor(classAvgScore)}`} style={{ color: scoreColor(classAvgScore) }}>
              {loading ? "—" : classAvgScore > 0 ? `${classAvgScore}%` : "—"}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100">
          <Loader2 className="w-10 h-10 text-slate-300 animate-spin mb-4" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Class Data...</p>
        </div>
      ) : (
        <>
          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Students", value: totalStudents, icon: <Users className="w-5 h-5 text-blue-500" />, bg: "bg-blue-50", color: "text-blue-600" },
              { label: "Class Average",  value: classAvgScore > 0 ? `${classAvgScore}%` : "—", icon: <TrendingUp className="w-5 h-5 text-indigo-500" />, bg: "bg-indigo-50", color: scoreColor(classAvgScore) },
              { label: "Attendance",     value: classAttPct !== null ? `${classAttPct}%` : "—", icon: <CalendarCheck className="w-5 h-5 text-emerald-500" />, bg: "bg-emerald-50", color: classAttPct !== null ? attColor(classAttPct) : "#94a3b8" },
              { label: "At Risk",        value: atRisk, icon: <AlertTriangle className="w-5 h-5 text-rose-500" />, bg: "bg-rose-50", color: atRisk > 0 ? "text-rose-600" : "text-slate-400" },
            ].map((item, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">{item.label}</p>
                  <p className={`text-3xl font-black tracking-tight ${item.color}`}
                    style={typeof item.color === "string" && item.color.startsWith("#") ? { color: item.color } : {}}>
                    {item.value}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.bg}`}>
                  {item.icon}
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Donut — Performance Distribution */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Performance Distribution</h3>
              {totalStudents === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-slate-300 text-sm font-medium">No students enrolled</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieDataFinal}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        animationDuration={1000}
                      >
                        {pieDataFinal.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number, n: string) => [`${v} students`, n]}
                        contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 justify-center mt-2">
                    {pieDataFinal.map((d, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-[10px] font-bold text-slate-500">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Bar — Subject-wise Average */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Subject-wise Average</h3>
              {subjectBarData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-slate-300 text-sm font-medium">No results data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={subjectBarData} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(v: number, _: any, props: any) => [`${v}%`, props.payload.subject]}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
                      cursor={{ fill: "rgba(0,0,0,0.02)" }}
                    />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]} animationDuration={1000}>
                      {subjectBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Area — Attendance Trend */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Attendance Trend (7 Days)</h3>
              {attRecords.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-slate-300 text-sm font-medium">No attendance data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={attTrendData}>
                    <defs>
                      <linearGradient id="attGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#1e3a8a" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, "Attendance"]}
                      contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#1e3a8a"
                      strokeWidth={2.5}
                      fill="url(#attGrad2)"
                      dot={{ r: 4, fill: "#fff", stroke: "#1e3a8a", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: "#1e3a8a", stroke: "#fff", strokeWidth: 2 }}
                      animationDuration={1000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Student Performance Table */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Student Performance
                {totalStudents > 0 && <span className="ml-2 text-xs font-medium text-slate-400">({totalStudents} students)</span>}
              </h2>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" /> Export
              </button>
            </div>

            {totalStudents === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Users className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No students enrolled</p>
                <p className="text-xs text-slate-300 mt-1">Students will appear here once enrolled in this class</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rank</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student</th>
                      {allSubjects.slice(0, 4).map(sub => (
                        <th key={sub} className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                          {sub.slice(0, 6)}
                        </th>
                      ))}
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Attendance</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {studentRows.map((s: any) => (
                      <tr
                        key={s.sid}
                        className={`hover:bg-slate-50/30 transition-colors ${s.status === "At Risk" ? "bg-rose-50/20" : ""}`}
                      >
                        {/* Rank */}
                        <td className="px-6 py-4">
                          <span className={`text-base font-black ${s.rank <= 3 ? "text-amber-500" : "text-slate-400"}`}>
                            {s.rank}
                          </span>
                        </td>

                        {/* Student */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-[10px] font-black shrink-0 ${
                              s.status === "Excellent" ? "bg-green-500" :
                              s.status === "At Risk"   ? "bg-rose-500" :
                              s.status === "Good"      ? "bg-[#1e3a8a]" : "bg-amber-500"
                            }`}>
                              {s.initials}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{s.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium truncate max-w-[140px]">{s.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Per subject scores */}
                        {allSubjects.slice(0, 4).map(sub => {
                          const score = s.subjects[sub];
                          return (
                            <td key={sub} className="px-4 py-4 text-center">
                              {score !== undefined ? (
                                <span className="font-black text-sm" style={{ color: scoreColor(score) }}>
                                  {score}%
                                </span>
                              ) : (
                                <span className="text-slate-300 text-sm">—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Avg total */}
                        <td className="px-6 py-4 text-center">
                          <span className="font-black text-sm" style={{ color: s.avgScore > 0 ? scoreColor(s.avgScore) : "#94a3b8" }}>
                            {s.avgScore > 0 ? `${s.avgScore}%` : "—"}
                          </span>
                        </td>

                        {/* Attendance */}
                        <td className="px-6 py-4 text-center">
                          <span className="font-black text-sm" style={{ color: s.attPct !== null ? attColor(s.attPct) : "#cbd5e1" }}>
                            {s.attPct !== null ? `${s.attPct}%` : "—"}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                            s.status === "Excellent" ? "bg-green-50 text-green-700 border-green-100" :
                            s.status === "Good"      ? "bg-blue-50 text-blue-700 border-blue-100" :
                            s.status === "Average"   ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-rose-50 text-rose-700 border-rose-100"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ClassPerformance;
