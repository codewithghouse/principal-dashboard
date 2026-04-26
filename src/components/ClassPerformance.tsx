import { useState, useEffect } from "react";
import {
  ChevronLeft, Download, Loader2, Users,
  GraduationCap, CalendarCheck, TrendingUp, AlertTriangle,
  UserPlus, Search as SearchIcon, X, Mail, Check
} from "lucide-react";
import {
  PieChart, Pie, Cell, Sector,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area,
  ResponsiveContainer
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
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
  const [activePieIdx, setActivePieIdx] = useState(0);

  // ── Add Student modal state ─────────────────────────────────────────────────
  const [addModal,        setAddModal]        = useState(false);
  const [addTab,          setAddTab]          = useState<"existing" | "invite">("existing");
  const [schoolStudents,  setSchoolStudents]  = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch,   setStudentSearch]   = useState("");
  const [selectedSids,    setSelectedSids]    = useState<string[]>([]);
  const [enrolling,       setEnrolling]       = useState(false);
  const [inviteForm,      setInviteForm]      = useState({ name: "", email: "" });
  const [inviting,        setInviting]        = useState(false);

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!classDoc.id || !classDoc.schoolId) { setLoading(false); return; }
    setLoading(true);

    const scopeC: any[] = [where("schoolId", "==", classDoc.schoolId)];
    if (classDoc.branchId) scopeC.push(where("branchId", "==", classDoc.branchId));
    const q = (col: string) =>
      query(collection(db, col), ...scopeC, where("classId", "==", classDoc.id));

    let done = 0;
    const tryDone = () => { done++; if (done >= 3) setLoading(false); };

    const u1 = onSnapshot(q("enrollments"), snap => { setEnrollments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); tryDone(); }, () => tryDone());
    const u2 = onSnapshot(q("attendance"),  snap => { setAttRecords(snap.docs.map(d => d.data())); tryDone(); }, () => tryDone());
    const u3 = onSnapshot(q("results"),     snap => { setResults(snap.docs.map(d => d.data())); tryDone(); }, () => tryDone());

    return () => { u1(); u2(); u3(); };
  }, [classDoc.id, classDoc.schoolId, classDoc.branchId]);

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

  // ── Add Student helpers ───────────────────────────────────────────────────
  const openAddModal = async () => {
    setAddModal(true);
    setAddTab("existing");
    setStudentSearch("");
    setSelectedSids([]);
    setInviteForm({ name: "", email: "" });
    setStudentsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "students"),
          where("schoolId", "==", classDoc.schoolId),
          where("branchId", "==", classDoc.branchId)
        )
      );
      const enrolledIds = new Set([
        ...enrollments.map((e: any) => e.studentId),
        ...enrollments.map((e: any) => (e.studentEmail || "").toLowerCase()),
      ]);
      setSchoolStudents(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(s => !enrolledIds.has(s.id) && !enrolledIds.has((s.email || "").toLowerCase()))
      );
    } catch { }
    setStudentsLoading(false);
  };

  const handleAddExisting = async () => {
    if (selectedSids.length === 0) return toast.error("Select at least one student.");
    setEnrolling(true);
    try {
      const toAdd = schoolStudents.filter(s => selectedSids.includes(s.id));
      for (const s of toAdd) {
        await addDoc(collection(db, "enrollments"), {
          studentId:    s.id,
          studentEmail: (s.email || "").toLowerCase(),
          studentName:  s.name || "",
          classId:      classDoc.id,
          className:    classDoc.name,
          teacherId:    classDoc.teacherId   || "",
          teacherName:  classDoc.teacherName || "",
          schoolId:     classDoc.schoolId,
          branchId:     classDoc.branchId,
          createdAt:    serverTimestamp(),
        });
      }
      toast.success(`${toAdd.length} student${toAdd.length > 1 ? "s" : ""} added to ${classDoc.name}!`);
      setAddModal(false);
      setSelectedSids([]);
    } catch {
      toast.error("Failed to add students. Try again.");
    }
    setEnrolling(false);
  };

  const handleInviteStudent = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim())
      return toast.error("Name and email are required.");
    setInviting(true);
    const email = inviteForm.email.toLowerCase().trim();
    const name  = inviteForm.name.trim();
    try {
      const studentDocRef = await addDoc(collection(db, "students"), {
        name, email, studentId: email,
        classId:     classDoc.id,   className:   classDoc.name,
        teacherId:   classDoc.teacherId   || "",
        teacherName: classDoc.teacherName || "",
        schoolId:    classDoc.schoolId,
        branchId:    classDoc.branchId,
        status:      "Active",      createdAt:   serverTimestamp(),
      });
      // Use student doc ID as enrollment.studentId so parent-dashboard
      // (which queries enrollments by studentData.id) can see the class.
      await addDoc(collection(db, "enrollments"), {
        studentId:    studentDocRef.id,
        studentEmail: email,
        studentName:  name,
        classId:      classDoc.id,   className:   classDoc.name,
        teacherId:    classDoc.teacherId   || "",
        teacherName:  classDoc.teacherName || "",
        schoolId:     classDoc.schoolId,
        branchId:     classDoc.branchId,
        createdAt:    serverTimestamp(),
      });
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `You've been enrolled — ${classDoc.name}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;"><h2 style="color:#1e3a8a;margin-bottom:8px;">Welcome, ${name}!</h2><p style="color:#555;">You have been enrolled in <strong>${classDoc.name}</strong>${classDoc.teacherName ? ` — Teacher: <strong>${classDoc.teacherName}</strong>` : ""}.</p><div style="margin:28px 0;text-align:center;"><a href="https://parent-dashboard-ten.vercel.app/" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Go to Student Portal</a></div><p style="color:#aaa;font-size:12px;text-align:center;">Use your email (${email}) to sign in.</p></div>`,
        }),
      }).catch(() => {});
      toast.success(`${name} enrolled & invitation sent!`);
      setInviteForm({ name: "", email: "" });
      setAddModal(false);
    } catch {
      toast.error("Failed to enroll student. Try again.");
    }
    setInviting(false);
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
          {/* Quick stats — dashboard-style cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const cards = [
                {
                  label: "Total Students",
                  value: totalStudents,
                  subtitle: "Enrolled in this class",
                  Icon: Users,
                  cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
                  tileGrad: "linear-gradient(135deg, #0055FF, #1166FF)",
                  tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
                  numColor: "#0055FF",
                  subColor: "#5070B0",
                  decorColor: "#0055FF",
                },
                {
                  label: "Class Average",
                  value: classAvgScore > 0 ? `${classAvgScore}%` : "—",
                  subtitle: classAvgScore > 0 ? "Average score" : "No data yet",
                  Icon: TrendingUp,
                  cardGrad: "linear-gradient(135deg, #E2E0FA 0%, #F8F7FE 100%)",
                  tileGrad: "linear-gradient(135deg, #4F46E5, #6366F1)",
                  tileShadow: "0 4px 14px rgba(79,70,229,0.28)",
                  numColor: "#4F46E5",
                  subColor: "#6B6FA8",
                  decorColor: "#4F46E5",
                },
                {
                  label: "Attendance",
                  value: classAttPct !== null ? `${classAttPct}%` : "—",
                  subtitle: classAttPct !== null ? "Class average" : "No data yet",
                  Icon: CalendarCheck,
                  cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
                  tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
                  tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
                  numColor: "#007830",
                  subColor: "#007830",
                  decorColor: "#00C853",
                },
                {
                  label: "At Risk",
                  value: atRisk,
                  subtitle: atRisk > 0 ? "Action required" : "All clear",
                  Icon: AlertTriangle,
                  cardGrad: atRisk > 0
                    ? "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)"
                    : "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
                  tileGrad: atRisk > 0
                    ? "linear-gradient(135deg, #FF3355, #FF6688)"
                    : "linear-gradient(135deg, #7B3FF4, #A07CF8)",
                  tileShadow: atRisk > 0
                    ? "0 4px 14px rgba(255,51,85,0.28)"
                    : "0 4px 14px rgba(123,63,244,0.26)",
                  numColor: atRisk > 0 ? "#FF3355" : "#7B3FF4",
                  subColor: atRisk > 0 ? "#FF3355" : "#5070B0",
                  decorColor: atRisk > 0 ? "#FF3355" : "#7B3FF4",
                },
              ];
              return cards.map((c, i) => {
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
                      <Icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
                    </div>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: "#99AACC" }}>
                      {c.label}
                    </span>
                    <p
                      className="text-[34px] font-bold tracking-tight leading-none mb-1.5"
                      style={{ color: c.numColor, letterSpacing: "-1.2px" }}
                    >
                      {c.value}
                    </p>
                    <p className="text-[11px] font-semibold" style={{ color: c.subColor }}>
                      {c.subtitle}
                    </p>
                    <Icon
                      className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                      style={{ color: c.decorColor, opacity: 0.18 }}
                      strokeWidth={2}
                    />
                  </div>
                );
              });
            })()}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Donut — Performance Distribution (interactive shadcn-style) */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Performance Distribution</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tap a tier to highlight</p>
                </div>
                {pieDataFinal.length > 0 && (
                  <Select
                    value={String(Math.min(activePieIdx, pieDataFinal.length - 1))}
                    onValueChange={(v) => setActivePieIdx(Number(v))}
                  >
                    <SelectTrigger className="h-7 w-[130px] rounded-lg pl-2.5 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" className="rounded-xl">
                      {pieDataFinal.map((d, i) => (
                        <SelectItem key={i} value={String(i)} className="rounded-lg">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
                            {d.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {totalStudents === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-slate-300 text-sm font-medium">No students enrolled</div>
              ) : (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={pieDataFinal}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={2}
                          dataKey="value"
                          animationDuration={1000}
                          stroke="#ffffff"
                          strokeWidth={3}
                          activeIndex={Math.min(activePieIdx, pieDataFinal.length - 1)}
                          activeShape={(props: any) => {
                            const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                            return (
                              <g>
                                <Sector
                                  cx={cx}
                                  cy={cy}
                                  innerRadius={innerRadius}
                                  outerRadius={outerRadius + 8}
                                  startAngle={startAngle}
                                  endAngle={endAngle}
                                  fill={fill}
                                />
                                <Sector
                                  cx={cx}
                                  cy={cy}
                                  innerRadius={outerRadius + 12}
                                  outerRadius={outerRadius + 22}
                                  startAngle={startAngle}
                                  endAngle={endAngle}
                                  fill={fill}
                                  opacity={0.5}
                                />
                              </g>
                            );
                          }}
                          onClick={(_, i) => setActivePieIdx(i)}
                          label={(props: any) => {
                            const { cx, cy, midAngle, outerRadius, value, percent } = props;
                            const total = pieDataFinal.reduce((s, d) => s + d.value, 0);
                            if (total === 0 || value === 0) return null;
                            const RADIAN = Math.PI / 180;
                            const r = outerRadius + 16;
                            const x = cx + r * Math.cos(-midAngle * RADIAN);
                            const y = cy + r * Math.sin(-midAngle * RADIAN);
                            return (
                              <text
                                x={x}
                                y={y}
                                fill="#0f172a"
                                textAnchor={x > cx ? "start" : "end"}
                                dominantBaseline="central"
                                style={{ fontSize: 11, fontWeight: 700 }}
                              >
                                {value} ({Math.round(percent * 100)}%)
                              </text>
                            );
                          }}
                          labelLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                        >
                          {pieDataFinal.map((entry, i) => (
                            <Cell key={i} fill={entry.color} className="cursor-pointer" />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number, n: string) => [`${v} students`, n]}
                          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label — shows active tier value */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-[28px] font-black text-slate-900 leading-none tracking-tight">
                        {pieDataFinal[Math.min(activePieIdx, pieDataFinal.length - 1)]?.value ?? 0}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mt-1.5"
                        style={{ color: pieDataFinal[Math.min(activePieIdx, pieDataFinal.length - 1)]?.color ?? "#94a3b8" }}>
                        {pieDataFinal[Math.min(activePieIdx, pieDataFinal.length - 1)]?.name ?? "Students"}
                      </div>
                      <div className="text-[9px] font-semibold text-slate-400 mt-0.5">
                        of {totalStudents} total
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {pieDataFinal.map((d, i) => {
                      const pct = totalStudents > 0 ? Math.round((d.value / totalStudents) * 100) : 0;
                      const isActive = i === activePieIdx;
                      return (
                        <button
                          key={i}
                          onClick={() => setActivePieIdx(i)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-left ${
                            isActive ? "bg-slate-50 border-slate-200 shadow-sm" : "bg-white border-transparent hover:bg-slate-50"
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-slate-700 truncate">{d.name}</div>
                            <div className="text-[10px] font-semibold text-slate-400">{d.value} · {pct}%</div>
                          </div>
                        </button>
                      );
                    })}
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
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                Student Performance
                {totalStudents > 0 && <span className="ml-2 text-xs font-medium text-slate-400">({totalStudents} students)</span>}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={openAddModal}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1e3a8a] text-white rounded-xl text-xs font-bold hover:bg-blue-800 transition-colors shadow-sm"
                >
                  <UserPlus className="w-4 h-4" /> Add Student
                </button>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
              </div>
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

      {/* ── Add Student Modal ── */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#1e3a8a]" /> Add Students to {classDoc.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Assign existing students or invite new ones</p>
              </div>
              <button onClick={() => setAddModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 shrink-0">
              <button onClick={() => setAddTab("existing")} className={`flex-1 py-3 text-sm font-bold transition-colors ${addTab === "existing" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                From School List
              </button>
              <button onClick={() => setAddTab("invite")} className={`flex-1 py-3 text-sm font-bold transition-colors ${addTab === "invite" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                Invite New Student
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {addTab === "existing" ? (
                <div className="space-y-4">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search by name or email..." value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  {studentsLoading ? (
                    <div className="py-12 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                  ) : (() => {
                    const filtered = schoolStudents.filter(s =>
                      (s.name || "").toLowerCase().includes(studentSearch.toLowerCase()) ||
                      (s.email || "").toLowerCase().includes(studentSearch.toLowerCase())
                    );
                    return filtered.length === 0 ? (
                      <div className="py-12 text-center">
                        <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">
                          {schoolStudents.length === 0 ? "No other students in this school yet." : "No students match your search."}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">Use "Invite New Student" tab to add someone new.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSids.length > 0 && (
                          <p className="text-xs font-bold text-[#1e3a8a] mb-1">{selectedSids.length} selected</p>
                        )}
                        {filtered.map((s: any) => {
                          const isSelected = selectedSids.includes(s.id);
                          return (
                            <div key={s.id} onClick={() => setSelectedSids(prev => isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? "bg-blue-50 border-[#1e3a8a]/30" : "border-slate-100 hover:bg-slate-50"}`}
                            >
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "bg-[#1e3a8a] border-[#1e3a8a]" : "border-slate-300"}`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600 shrink-0">
                                {(s.name || "S").substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{s.name || "Unknown"}</p>
                                <p className="text-xs text-slate-400 truncate">{s.email}</p>
                              </div>
                              {s.className && s.className !== classDoc.name && (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">{s.className}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Student Name *</label>
                    <input type="text" placeholder="e.g. Rahul Sharma" value={inviteForm.name}
                      onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Email Address *</label>
                    <input type="email" placeholder="student@example.com" value={inviteForm.email}
                      onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                    <Mail className="w-4 h-4 text-[#1e3a8a] shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600">Student will receive an email invitation with their login link.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-100 shrink-0">
              <button onClick={() => setAddModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              {addTab === "existing" ? (
                <button onClick={handleAddExisting} disabled={enrolling || selectedSids.length === 0}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {enrolling ? "Adding..." : `Add${selectedSids.length > 0 ? ` (${selectedSids.length})` : ""}`}
                </button>
              ) : (
                <button onClick={handleInviteStudent} disabled={inviting || !inviteForm.name || !inviteForm.email}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {inviting ? "Inviting..." : "Invite & Enroll"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassPerformance;
