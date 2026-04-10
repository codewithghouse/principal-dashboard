import { useState, useEffect } from "react";
import {
  GraduationCap, TrendingUp, TrendingDown, Minus,
  Users, Star, BarChart3, ChevronRight, Loader2, X, BookOpen
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

// ── helpers ──────────────────────────────────────────────────────────────────
const grade = (pct: number) => pct >= 85 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : "D";
const gradeColor = (g: string) => g === "A" ? "text-green-600 bg-green-50" : g === "B" ? "text-blue-600 bg-blue-50" : g === "C" ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";

interface TeacherStat {
  id: string;
  name: string;
  subjects: string[];
  classes: string[];
  avgScore: number | null;
  prevAvgScore: number | null;  // avg from before last 30 days — for trend
  studentCount: number;
  classCount: number;
  topSubject: string;
  weakSubject: string;
  monthlyScores: { month: string; avg: number }[];
  vsSchoolAvg: number | null;  // diff from school average
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TeacherPerformance = () => {
  const { userData } = useAuth();
  const [teachers,    setTeachers]    = useState<TeacherStat[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<TeacherStat | null>(null);
  const [schoolAvg,   setSchoolAvg]   = useState<number>(0);
  const [search,      setSearch]      = useState("");

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);

    // ── Listen to teachers ────────────────────────────────────────────────
    const tUnsub = onSnapshot(
      query(collection(db, "teachers"), where("schoolId", "==", userData.schoolId)),
      async (tSnap) => {
        const teacherDocs = tSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        // ── Fetch test_scores, teaching_assignments in parallel ───────────
        const [scoresSnap, assignSnap] = await Promise.all([
          getDocs(query(collection(db, "test_scores"), where("schoolId", "==", userData.schoolId))),
          getDocs(query(collection(db, "teaching_assignments"), where("schoolId", "==", userData.schoolId))),
        ]);

        const scores   = scoresSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const assigns  = assignSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        const now     = new Date();
        const cutoff30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString().slice(0,10);
        const cutoff60 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60).toISOString().slice(0,10);

        // School-wide average
        const allPcts = scores.map(s => parseFloat(s.percentage ?? s.score ?? "")).filter(n => !isNaN(n));
        const overallAvg = allPcts.length ? Math.round(allPcts.reduce((a,b)=>a+b,0) / allPcts.length) : 0;
        setSchoolAvg(overallAvg);

        const stats: TeacherStat[] = teacherDocs.map(t => {
          // Classes & subjects from teaching_assignments
          const tAssigns = assigns.filter(a => a.teacherId === t.id || a.teacherEmail === t.email);
          const subjects  = [...new Set(tAssigns.map((a: any) => a.subject).filter(Boolean))] as string[];
          const classes   = [...new Set(tAssigns.map((a: any) => a.className || a.classId).filter(Boolean))] as string[];
          const classIds  = [...new Set(tAssigns.map((a: any) => a.classId).filter(Boolean))] as string[];

          // Test scores for this teacher's classes
          const tScores = scores.filter(s =>
            classIds.includes(s.classId) || tAssigns.some((a: any) => a.classId === s.classId)
          );

          const pcts = tScores.map(s => parseFloat(s.percentage ?? s.score ?? "")).filter(n => !isNaN(n));
          const avgScore = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0) / pcts.length) : null;

          // Previous 30-60 days avg for trend
          const prevScores = tScores.filter(s => {
            const d = s.createdAt?.toDate?.()?.toISOString?.()?.slice(0,10) ?? s.date ?? "";
            return d >= cutoff60 && d < cutoff30;
          });
          const prevPcts = prevScores.map(s => parseFloat(s.percentage ?? s.score ?? "")).filter(n => !isNaN(n));
          const prevAvg  = prevPcts.length ? Math.round(prevPcts.reduce((a,b)=>a+b,0) / prevPcts.length) : null;

          // Monthly trend (last 4 months)
          const months = Array.from({length:4}, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth()-3+i, 1);
            return { label: MONTH_NAMES[d.getMonth()], month: d.getMonth(), year: d.getFullYear() };
          });
          const monthlyScores = months.map(({ label, month, year }) => {
            const mScores = tScores.filter(s => {
              const ts = s.createdAt?.toDate?.() || (s.date ? new Date(s.date) : null);
              return ts && ts.getMonth() === month && ts.getFullYear() === year;
            });
            const mPcts = mScores.map(s => parseFloat(s.percentage ?? s.score ?? "")).filter(n => !isNaN(n));
            return { month: label, avg: mPcts.length ? Math.round(mPcts.reduce((a,b)=>a+b,0)/mPcts.length) : 0 };
          });

          // Per-subject breakdown
          const subjectMap: Record<string, number[]> = {};
          tScores.forEach(s => {
            const sub = s.subject || "Unknown";
            if (!subjectMap[sub]) subjectMap[sub] = [];
            const pct = parseFloat(s.percentage ?? s.score ?? "");
            if (!isNaN(pct)) subjectMap[sub].push(pct);
          });
          const subjectAvgs = Object.entries(subjectMap).map(([sub, vals]) => ({
            sub, avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)
          }));
          const topSubject  = subjectAvgs.length ? subjectAvgs.sort((a,b)=>b.avg-a.avg)[0].sub : "—";
          const weakSubject = subjectAvgs.length ? subjectAvgs.sort((a,b)=>a.avg-b.avg)[0].sub : "—";

          const studentCount = [...new Set(tScores.map(s => s.studentId || s.studentEmail))].length;

          return {
            id: t.id,
            name: t.name || t.teacherName || "Unknown",
            subjects,
            classes,
            avgScore,
            prevAvgScore: prevAvg,
            studentCount,
            classCount: classes.length,
            topSubject,
            weakSubject,
            monthlyScores,
            vsSchoolAvg: avgScore != null ? avgScore - overallAvg : null,
          };
        });

        setTeachers(stats.filter(t => t.name !== "Unknown"));
        setLoading(false);
      }
    );
    return () => tUnsub();
  }, [userData?.schoolId]);

  const filtered = teachers.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subjects.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  const trend = (t: TeacherStat) => {
    if (t.avgScore == null || t.prevAvgScore == null) return null;
    const delta = t.avgScore - t.prevAvgScore;
    if (delta > 2)  return { icon: TrendingUp,   color: "text-green-500", label: `+${delta}%` };
    if (delta < -2) return { icon: TrendingDown,  color: "text-red-500",   label: `${delta}%` };
    return               { icon: Minus,          color: "text-slate-400",  label: "Stable" };
  };

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e294b] tracking-tight">Teacher Performance</h1>
          <p className="text-sm text-slate-400 font-medium mt-0.5">Impact analysis — same subject across teachers, same teacher across classes</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2 border border-slate-100">
          <BarChart3 className="w-4 h-4 text-[#1e3a8a]" />
          <span className="text-xs font-bold text-[#1e294b]">School Avg: {schoolAvg}%</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by teacher or subject..."
          className="w-full pl-10 pr-4 h-10 bg-white border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 shadow-sm transition-all" />
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Teachers", value: teachers.length,  color: "text-blue-600",  bg: "bg-blue-50"  },
          { label: "Avg Class Score", value: `${schoolAvg}%`, color: "text-green-600", bg: "bg-green-50" },
          { label: "Top Performers", value: teachers.filter(t => (t.avgScore ?? 0) >= 80).length, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Needs Support",  value: teachers.filter(t => t.avgScore != null && t.avgScore < 60).length, color: "text-red-600", bg: "bg-red-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className={`text-2xl font-bold ${s.color}`}>{loading ? "—" : s.value}</div>
            <div className="text-xs text-slate-400 font-semibold mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Teacher Cards / Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-slate-100">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-100 text-center">
          <GraduationCap className="w-8 h-8 text-slate-200 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No teacher data found</p>
          <p className="text-xs text-slate-300 mt-1">Assign teachers to classes to see performance</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="bg-slate-50/50">
                  {["Teacher", "Subjects", "Classes", "Students", "Avg Score", "vs School", "Trend", "Detail"].map(h => (
                    <th key={h} className="py-4 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(t => {
                  const T     = trend(t);
                  const TIcon = T?.icon;
                  const g     = t.avgScore != null ? grade(t.avgScore) : "—";
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#1e3a8a]/10 flex items-center justify-center text-[11px] font-black text-[#1e3a8a]">
                            {t.name.substring(0,2).toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-[#1e294b]">{t.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex flex-wrap gap-1">
                          {t.subjects.slice(0,2).map(s => (
                            <span key={s} className="text-[9px] font-bold text-[#1e3a8a] bg-blue-50 px-2 py-0.5 rounded-full">{s}</span>
                          ))}
                          {t.subjects.length > 2 && <span className="text-[9px] text-slate-400 font-bold">+{t.subjects.length-2}</span>}
                          {t.subjects.length === 0 && <span className="text-[10px] text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-xs font-semibold text-slate-500">{t.classCount || "—"}</td>
                      <td className="py-4 px-5 text-xs font-semibold text-slate-500">{t.studentCount || "—"}</td>
                      <td className="py-4 px-5">
                        {t.avgScore != null ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1e294b]">{t.avgScore}%</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${gradeColor(g)}`}>{g}</span>
                          </div>
                        ) : <span className="text-xs text-slate-300">No data</span>}
                      </td>
                      <td className="py-4 px-5">
                        {t.vsSchoolAvg != null ? (
                          <span className={`text-xs font-bold ${t.vsSchoolAvg >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {t.vsSchoolAvg >= 0 ? "+" : ""}{t.vsSchoolAvg}%
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-4 px-5">
                        {T && TIcon ? (
                          <div className={`flex items-center gap-1 ${T.color}`}>
                            <TIcon className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-black">{T.label}</span>
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-4 px-5">
                        <button onClick={() => setSelected(t)}
                          className="flex items-center gap-1 text-[10px] font-black text-[#1e3a8a] hover:underline">
                          View <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Teacher Detail Drawer ─────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-base font-bold text-[#1e294b]">{selected.name}</h2>
                <p className="text-xs text-slate-400 font-medium">{selected.subjects.join(", ") || "No subjects assigned"}</p>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">

              {/* Key metrics */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Avg Score",    value: selected.avgScore != null ? `${selected.avgScore}%` : "—", color: "text-[#1e3a8a]" },
                  { label: "vs School",    value: selected.vsSchoolAvg != null ? `${selected.vsSchoolAvg >= 0 ? "+" : ""}${selected.vsSchoolAvg}%` : "—", color: selected.vsSchoolAvg != null && selected.vsSchoolAvg >= 0 ? "text-green-600" : "text-red-500" },
                  { label: "Classes",      value: selected.classCount || 0,  color: "text-slate-700" },
                  { label: "Students",     value: selected.studentCount || 0, color: "text-slate-700" },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-xl p-4">
                    <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
                    <div className="text-[10px] text-slate-400 font-semibold mt-1">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Classes taught */}
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Classes Assigned</h4>
                <div className="flex flex-wrap gap-2">
                  {selected.classes.length ? selected.classes.map(c => (
                    <span key={c} className="text-xs font-bold bg-blue-50 text-[#1e3a8a] px-3 py-1 rounded-full">{c}</span>
                  )) : <span className="text-xs text-slate-300">No classes assigned yet</span>}
                </div>
              </div>

              {/* Subject highlights */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-xl p-4">
                  <div className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-1">Top Subject</div>
                  <div className="text-sm font-bold text-green-700">{selected.topSubject}</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-4">
                  <div className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Needs Focus</div>
                  <div className="text-sm font-bold text-amber-700">{selected.weakSubject}</div>
                </div>
              </div>

              {/* Monthly trend chart */}
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Score Trend (Last 4 Months)</h4>
                {selected.monthlyScores.every(m => m.avg === 0) ? (
                  <div className="flex items-center justify-center h-32 bg-slate-50 rounded-xl">
                    <p className="text-xs text-slate-300 font-medium">No monthly data available</p>
                  </div>
                ) : (
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selected.monthlyScores} margin={{top:5,right:5,left:-30,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill:"#94a3b8",fontSize:10,fontWeight:600}} />
                        <YAxis domain={[40,100]} axisLine={false} tickLine={false} tick={{fill:"#94a3b8",fontSize:10,fontWeight:600}} />
                        <Tooltip contentStyle={{borderRadius:"12px",border:"none",boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}
                          formatter={(v:any) => [`${v}%`, "Avg Score"]} />
                        <Line type="monotone" dataKey="avg" stroke="#1e3a8a" strokeWidth={2.5}
                          dot={{r:4,fill:"#1e3a8a",stroke:"#fff",strokeWidth:2}} activeDot={{r:5,strokeWidth:0}} connectNulls />
                        {/* School average reference line */}
                        <Line type="monotone" dataKey={() => schoolAvg} name="School Avg" stroke="#94a3b8"
                          strokeDasharray="4 2" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 mt-2 justify-center">
                      <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#1e3a8a] rounded" /><span className="text-[10px] text-slate-400 font-semibold">Teacher Avg</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-slate-300 rounded" style={{borderTop:"2px dashed #94a3b8"}} /><span className="text-[10px] text-slate-400 font-semibold">School Avg</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherPerformance;
