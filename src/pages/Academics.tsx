import React, { useState, useEffect, useRef } from "react";
import {
  Calculator, Beaker, BookText, Globe2, AlertTriangle,
  ArrowRight, FileText, GraduationCap, CalendarCheck,
  Loader2, Send, TrendingUp, TrendingDown, X, Users,
} from "lucide-react";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import SubjectAnalysis from "@/components/SubjectAnalysis";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";

// ─── helpers ─────────────────────────────────────────────────────────────────
const getScore = (r: any): number => {
  if (typeof r.percentage === "number" && r.percentage > 0) return Math.round(r.percentage);
  const raw = r.marksObtained ?? r.marks ?? r.score ?? r.obtainedMarks ?? r.obtained ?? r.marksScored ?? null;
  if (raw === null) return 0;
  const hasTotal =
    r.totalMarks != null || r.maxMarks != null || r.totalScore != null ||
    r.fullMarks   != null || r.total    != null || r.outOf    != null;
  if (!hasTotal) return Math.min(100, Math.round(Number(raw)));
  const total = r.totalMarks ?? r.maxMarks ?? r.totalScore ?? r.fullMarks ?? r.total ?? r.outOf ?? 100;
  return total > 0 ? Math.round((Number(raw) / Number(total)) * 100) : 0;
};

const getSubjectConfig = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("math"))
    return { icon: Calculator, iconBg: "bg-red-50",    iconColor: "text-red-500" };
  if (n.includes("sci") || n.includes("bio") || n.includes("chem") || n.includes("phy"))
    return { icon: Beaker,     iconBg: "bg-purple-50", iconColor: "text-purple-500" };
  if (n.includes("eng") || n.includes("lang") || n.includes("lit"))
    return { icon: BookText,   iconBg: "bg-amber-50",  iconColor: "text-amber-500" };
  if (n.includes("social") || n.includes("sst") || n.includes("hist") || n.includes("geo"))
    return { icon: Globe2,     iconBg: "bg-green-50",  iconColor: "text-green-500" };
  return   { icon: GraduationCap, iconBg: "bg-slate-50", iconColor: "text-slate-500" };
};

const getSubjectStatus = (avg: number) =>
  avg >= 75
    ? { status: "Good",    statusStyle: "bg-green-50 text-green-600 border-green-100" }
    : avg >= 60
    ? { status: "Average", statusStyle: "bg-amber-50 text-amber-600 border-amber-100" }
    : { status: "Weak",    statusStyle: "bg-red-50 text-red-500 border-red-100" };

// ─── component ───────────────────────────────────────────────────────────────
const Academics = () => {
  const { userData } = useAuth();

  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);
  const [subjects,        setSubjects]        = useState<any[]>([]);
  const [gradeDistData,   setGradeDistData]   = useState<any[]>([]);
  const [curriculumData,  setCurriculumData]  = useState<any[]>([]);
  const [weakItems,       setWeakItems]       = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [remedialForm, setRemedialForm] = useState({
    subject: "", grade: "", date: "", time: "", teacher: "",
  });
  const [isSending, setIsSending] = useState(false);

  const teacherMapRef = useRef<Record<string, string>>({}); // teacherId → subject
  const schoolId = userData?.schoolId || userData?.school || "";
  const branchId = userData?.branchId || "";

  // ── data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;

    const constraints = [where("schoolId", "==", schoolId)];
    if (branchId) constraints.push(where("branchId", "==", branchId));

    // Step 1: build teacher → subject map (one-time)
    getDocs(query(collection(db, "teachers"), ...constraints)).then((snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const t = d.data();
        map[d.id] = t.subject || t.subjectName || "General";
      });
      teacherMapRef.current = map;
    });

    // Step 2: listen to results
    const unsub = onSnapshot(
      query(collection(db, "results"), ...constraints),
      (snap) => {
        const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        computeMetrics(results);
      }
    );

    return () => unsub();
  }, [schoolId, branchId]);

  const computeMetrics = (results: any[]) => {
    const map = teacherMapRef.current;

    // ── group by subject ────────────────────────────────────────────────────
    const groups: Record<string, {
      scores: number[];
      studentSet: Set<string>;
      teacherIds: Set<string>;
      classBuckets: Record<string, { scores: number[]; studentSet: Set<string>; className: string }>;
    }> = {};

    results.forEach((r) => {
      const subject = map[r.teacherId] || r.subject || r.subjectName || "General";
      const score   = getScore(r);
      const sid     = r.studentId  || "";
      const tid     = r.teacherId  || "";
      const cid     = r.classId    || "";
      const cName   = r.className  || cid;

      if (!groups[subject]) {
        groups[subject] = { scores: [], studentSet: new Set(), teacherIds: new Set(), classBuckets: {} };
      }
      groups[subject].scores.push(score);
      if (sid) groups[subject].studentSet.add(sid);
      if (tid) groups[subject].teacherIds.add(tid);

      if (cid) {
        if (!groups[subject].classBuckets[cid])
          groups[subject].classBuckets[cid] = { scores: [], studentSet: new Set(), className: cName };
        groups[subject].classBuckets[cid].scores.push(score);
        if (sid) groups[subject].classBuckets[cid].studentSet.add(sid);
      }
    });

    // ── subject cards ───────────────────────────────────────────────────────
    const computed = Object.entries(groups).map(([name, data]) => {
      const avgNum = data.scores.length
        ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : 0;
      const { status, statusStyle } = getSubjectStatus(avgNum);
      const config = getSubjectConfig(name);
      const weakSections = Object.values(data.classBuckets).filter((cb) => {
        const avg = cb.scores.reduce((a, b) => a + b, 0) / cb.scores.length;
        return avg < 60;
      }).length;
      return {
        id: name, name,
        avg: `${avgNum}%`, avgNum,
        status, statusStyle, weakSections,
        teacherIds:    Array.from(data.teacherIds),
        totalStudents: data.studentSet.size,
        classBuckets:  data.classBuckets,
        ...config,
      };
    }).sort((a, b) => a.avgNum - b.avgNum);

    setSubjects(computed);

    // ── grade distribution ──────────────────────────────────────────────────
    const allScores = results.map((r) => getScore(r));
    const total = allScores.length;
    const a = allScores.filter((s) => s >= 80).length;
    const b = allScores.filter((s) => s >= 60 && s < 80).length;
    const c = allScores.filter((s) => s >= 40 && s < 60).length;
    const d = allScores.filter((s) => s < 40).length;
    setGradeDistData([
      { name: "A (80-100%)", value: a, color: "#22c55e" },
      { name: "B (60-79%)",  value: b, color: "#1e3a8a" },
      { name: "C (40-59%)",  value: c, color: "#f59e0b" },
      { name: "D (Below 40%)", value: d, color: "#ef4444" },
    ]);

    // ── curriculum progress (coverage proxy) ───────────────────────────────
    const maxStudents = Math.max(...computed.map((s) => s.totalStudents), 1);
    const currData = computed.slice(0, 6).map((s) => ({
      subject:  s.name,
      progress: Math.min(95, Math.round((s.totalStudents / maxStudents) * 80 + s.avgNum * 0.2)),
    }));
    setCurriculumData(currData);

    // ── weak subjects requiring attention ───────────────────────────────────
    const weak: any[] = [];
    computed.forEach((s) => {
      Object.entries(s.classBuckets).forEach(([, cb]: [string, any]) => {
        const avg = Math.round(cb.scores.reduce((a: number, b: number) => a + b, 0) / cb.scores.length);
        if (avg < 60) {
          weak.push({
            subject:      s.name,
            className:    cb.className,
            avg,
            studentCount: cb.studentSet.size,
            color:        s.iconColor,
          });
        }
      });
    });
    setWeakItems(weak.sort((a, b) => a.avg - b.avg).slice(0, 6));

    setLoading(false);
  };

  // ── schedule remedial ─────────────────────────────────────────────────────
  const handleScheduleRemedial = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      await addDoc(collection(db, "meetings"), {
        title:       `Remedial: ${remedialForm.subject} - ${remedialForm.grade}`,
        participant: `${remedialForm.teacher} & Affected Students`,
        date:        remedialForm.date,
        time:        remedialForm.time,
        type:        "Remedial Class",
        schoolId,
        branchId,
        createdAt:   serverTimestamp(),
      });
      toast.success("Remedial session scheduled successfully!");
      setShowScheduleModal(false);
      setRemedialForm({ subject: "", grade: "", date: "", time: "", teacher: "" });
    } catch (err: any) {
      toast.error("Failed: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  // ── conditional render ────────────────────────────────────────────────────
  if (selectedSubject) {
    return <SubjectAnalysis subject={selectedSubject} onBack={() => setSelectedSubject(null)} />;
  }

  // ── main render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Academic Performance</h1>
        <p className="text-sm text-muted-foreground font-medium mt-1">Subject-wise academic performance overview</p>
      </div>

      {/* ── SUBJECT STAT CARDS ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
          {[1,2,3,4].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-6 shadow-sm animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-24 mb-4" />
              <div className="h-10 bg-slate-100 rounded w-20 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="col-span-4 py-20 text-center bg-card rounded-2xl border border-dashed border-border">
          <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400">No exam scores recorded yet</p>
          <p className="text-xs text-slate-300 mt-1">Subject performance will appear once teachers record results</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
          {subjects.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedSubject(s)}
              className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-5">
                <div className={`w-11 h-11 rounded-xl ${s.iconBg} flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.iconColor}`} />
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${s.statusStyle}`}>
                  {s.status}
                </span>
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">{s.name}</h3>
              <div className={`text-3xl font-black mb-3 ${s.avgNum < 60 ? "text-red-500" : s.avgNum < 75 ? "text-amber-500" : "text-green-600"}`}>
                {s.avg}
              </div>
              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Weak Sections: {s.weakSections}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ANALYTICS ROW ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Grade Distribution Donut */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-6">Grade Distribution – Latest Exam</h2>
          {gradeDistData.reduce((s, g) => s + g.value, 0) === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm font-bold">
              No data yet
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={gradeDistData}
                cx="50%" cy="45%"
                innerRadius={65} outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                animationDuration={1200}
                label={({ cx, cy, midAngle, innerRadius, outerRadius, name }: any) => {
                  const RADIAN = Math.PI / 180;
                  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                  const x = cx + (r + 28) * Math.cos(-midAngle * RADIAN);
                  const y = cy + (r + 28) * Math.sin(-midAngle * RADIAN);
                  return (
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#64748b">
                      {name}
                    </text>
                  );
                }}
                labelLine={false}
              >
                {gradeDistData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [value, name]}
                contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", fontSize: "12px", fontWeight: 700 }}
              />
            </PieChart>
          </ResponsiveContainer>
          )}
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-2">
            {gradeDistData.map((g) => (
              <div key={g.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: g.color }} />
                <span className="text-[11px] font-semibold text-muted-foreground">{g.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Curriculum Progress */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-6">Curriculum Progress</h2>
          {curriculumData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm font-bold">
              No data yet
            </div>
          ) : (
            <div className="space-y-5">
              {curriculumData.map((c) => (
                <div key={c.subject}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-bold text-foreground">{c.subject}</span>
                    <span className="text-sm font-black text-foreground">{c.progress}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${c.progress}%`,
                        background: c.progress >= 75 ? "#22c55e" : c.progress >= 55 ? "#1e3a8a" : "#f59e0b",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── WEAK SUBJECTS REQUIRING ATTENTION ────────────────────────────────── */}
      {weakItems.length > 0 && (
        <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-bold text-foreground">Weak Subjects Requiring Attention</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weakItems.map((w, i) => (
              <div key={i} className="bg-card border border-red-100 rounded-xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{w.subject} – {w.className}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {w.studentCount} students
                  </p>
                </div>
                <span className="text-lg font-black text-red-500">{w.avg}% avg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ACTION BUTTONS ────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-wrap items-center gap-3">
        <button
          onClick={() => subjects.length > 0 && setSelectedSubject(subjects[0])}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-sm"
        >
          <TrendingUp className="w-4 h-4" /> View Subject Details
        </button>
        <button
          onClick={() => {
            const html = buildReport({
              title: "Academic Performance Report",
              badge: "Academics",
              heroStats: [
                { label: "Subjects Tracked", value: subjects.length },
                { label: "Weak Subjects",    value: subjects.filter(s => s.status === "Weak").length,    color: "#f87171" },
                { label: "Good Subjects",    value: subjects.filter(s => s.status === "Good").length,    color: "#4ade80" },
                { label: "Average Subjects", value: subjects.filter(s => s.status === "Average").length, color: "#fbbf24" },
              ],
              sections: [
                {
                  title: "Subject-wise Performance",
                  type: "table",
                  headers: ["Subject", "Average", "Status", "Weak Sections"],
                  rows: subjects.map(s => ({
                    cells: [s.name, s.avg, s.status, s.weakSections],
                    highlight: s.status === "Weak",
                  })),
                },
              ],
            });
            openReportWindow(html);
          }}
          className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-bold text-foreground hover:bg-secondary transition-colors"
        >
          <FileText className="w-4 h-4" /> Generate Academic Report
        </button>
        <button
          onClick={() => setShowScheduleModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-bold text-foreground hover:bg-secondary transition-colors"
        >
          <CalendarCheck className="w-4 h-4" /> Schedule Remedial
        </button>
      </div>

      {/* ── SCHEDULE REMEDIAL MODAL ───────────────────────────────────────────── */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-black text-foreground">Schedule Remedial</h3>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleScheduleRemedial} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Subject</label>
                  <select
                    className="w-full h-11 px-3 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    value={remedialForm.subject}
                    onChange={(e) => setRemedialForm({ ...remedialForm, subject: e.target.value })}
                    required
                  >
                    <option value="">Select</option>
                    {subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Grade / Class</label>
                  <input
                    type="text"
                    placeholder="e.g. Grade 9"
                    className="w-full h-11 px-3 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    value={remedialForm.grade}
                    onChange={(e) => setRemedialForm({ ...remedialForm, grade: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Date</label>
                  <input
                    type="date"
                    className="w-full h-11 px-3 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    value={remedialForm.date}
                    onChange={(e) => setRemedialForm({ ...remedialForm, date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Time</label>
                  <input
                    type="time"
                    className="w-full h-11 px-3 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    value={remedialForm.time}
                    onChange={(e) => setRemedialForm({ ...remedialForm, time: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Assigned Teacher</label>
                <input
                  type="text"
                  placeholder="e.g. Mrs. Kavita"
                  className="w-full h-11 px-3 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  value={remedialForm.teacher}
                  onChange={(e) => setRemedialForm({ ...remedialForm, teacher: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowScheduleModal(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="flex-1 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isSending ? "Scheduling…" : "Confirm & Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Academics;
