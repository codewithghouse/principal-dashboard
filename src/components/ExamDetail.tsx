import { useState, useMemo } from "react";
import {
  ChevronLeft, ArrowRight, Download, Printer, Share2, BarChart2,
  X, TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { toast } from "sonner";
import type { ExamGroup } from "@/pages/ExamsResults";

interface ExamDetailProps {
  exam: ExamGroup;
  allExams: ExamGroup[];
  onBack: () => void;
  userData: any;
}

/* ─── colour helpers ─────────────────────────────────────────── */
const rateColor = (pct: number) =>
  pct >= 75 ? "text-green-600" : pct >= 50 ? "text-amber-500" : "text-red-500";

const rowHighlight = (passRate: number) =>
  passRate < 65 ? "bg-red-50/50" : "";

const rankBg = (rank: number) =>
  rank === 1 ? "bg-amber-400" : rank === 2 ? "bg-slate-300" : rank === 3 ? "bg-orange-300" : "bg-blue-200";

/* ─── component ──────────────────────────────────────────────── */
export default function ExamDetail({ exam, allExams, onBack, userData }: ExamDetailProps) {
  const [showCompare, setShowCompare]   = useState(false);
  const [sharingParents, setSharingParents] = useState(false);

  /* ── Previous exam (same name prefix, older by date) ── */
  const prevExam = useMemo(() => {
    const others = allExams.filter(e =>
      e.name !== exam.name &&
      (e.name.split(" ").slice(0, 2).join(" ") === exam.name.split(" ").slice(0, 2).join(" ") ||
       exam.name.toLowerCase().includes("unit") && e.name.toLowerCase().includes("unit"))
    );
    return others.sort((a, b) => a.dateLabel.localeCompare(b.dateLabel))[0] || null;
  }, [allExams, exam]);

  /* ── Download Results (CSV) ── */
  const handleDownload = () => {
    const headers = ["Student Name", "Class", "Score", "Max Score", "Percentage", "Grade", "Status"];
    const rows = exam.scores.map(s => [
      s.studentName || "",
      s.className   || s.classId || "",
      s.score       ?? (s.isAbsent ? "ABSENT" : ""),
      s.maxScore    || "",
      s.isAbsent ? "ABSENT" : `${Math.round(s.percentage || 0)}%`,
      s.grade       || "",
      s.isAbsent ? "Absent" : (s.percentage >= 50 ? "Passed" : "Failed"),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${exam.name}_Results.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Results downloaded!");
  };

  /* ── Print Report Cards ── */
  const handlePrint = () => {
    const presentScores = exam.scores.filter(s => !s.isAbsent);
    const html = buildReport({
      title: exam.name,
      subtitle: `Date: ${exam.dateLabel} · Total Students: ${exam.totalStudents}`,
      badge: "Exam Results",
      heroStats: [
        { label: "Pass Rate",  value: `${exam.passRate}%`,  color: exam.passRate  >= 75 ? "#4ade80" : "#fbbf24" },
        { label: "Average",    value: `${exam.avgPct}%`,    color: exam.avgPct    >= 75 ? "#4ade80" : "#fbbf24" },
        { label: "Appeared",   value: exam.totalStudents },
        { label: "Passed",     value: presentScores.filter(s => (s.percentage || 0) >= 50).length },
      ],
      sections: [
        {
          title: "Report Cards",
          type: "table",
          headers: ["Student Name", "Class", "Score", "Percentage", "Grade", "Result"],
          rows: presentScores.map(s => ({
            cells: [
              s.studentName,
              s.className || s.classId || "—",
              `${s.score ?? "—"}/${s.maxScore ?? "—"}`,
              `${Math.round(s.percentage || 0)}%`,
              s.grade || "—",
              s.percentage >= 50 ? "PASS" : "FAIL",
            ],
            highlight: (s.percentage || 0) < 50,
          })),
        },
      ],
    });
    openReportWindow(html);
    toast.success("Print window opened!");
  };

  /* ── Share with Parents ── */
  const handleShare = async () => {
    if (!userData?.schoolId) return toast.error("School data not found.");
    setSharingParents(true);
    try {
      /* Fetch all student enrollments for this school/branch */
      const enrollConstraints: any[] = [where("schoolId", "==", userData.schoolId)];
      if (userData.branchId) enrollConstraints.push(where("branchId", "==", userData.branchId));
      const snap = await getDocs(
        query(collection(db, "enrollments"), ...enrollConstraints)
      );
      const message = `📊 *${exam.name} Results Published*\n\nDear Parent,\n\nThe results for *${exam.name}* have been published.\n\n🏫 School Pass Rate: ${exam.passRate}%\n📈 School Average: ${exam.avgPct}%\n\nPlease check your child's result in the Parent Dashboard under "Performance" section.\n\n— ${userData.name || "Principal"}`;

      const promises = snap.docs.slice(0, 500).map(d => {
        const enrollment = d.data();
        return addDoc(collection(db, "principal_to_parent_notes"), {
          studentId:   enrollment.studentId   || "",
          studentName: enrollment.studentName || "",
          parentName:  enrollment.parentName  || `Parent of ${enrollment.studentName}`,
          message,
          content: message,
          from:    "principal",
          type:    "exam_result",
          examName: exam.name,
          read:    false,
          schoolId: userData.schoolId,
          branchId: userData.branchId || "",
          createdAt: serverTimestamp(),
        });
      });

      await Promise.all(promises);
      toast.success(`Results shared with ${snap.docs.length} parent(s)!`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to share. Try again.");
    }
    setSharingParents(false);
  };

  /* ── Compare modal ── */
  const CompareModal = () => {
    if (!showCompare) return null;
    const curr = exam;
    const prev = prevExam;
    const diff = (a: number, b: number) => {
      const d = a - b;
      if (d > 0) return { label: `+${d}%`, icon: TrendingUp,   color: "text-green-600" };
      if (d < 0) return { label: `${d}%`,  icon: TrendingDown,  color: "text-red-500" };
      return { label: "0%", icon: Minus, color: "text-muted-foreground" };
    };
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#1e3a8a]" /> Compare with Previous
            </h3>
            <button onClick={() => setShowCompare(false)} className="p-1.5 hover:bg-muted rounded-full">
              <X className="w-4 h-4" />
            </button>
          </div>

          {!prev ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No previous exam found to compare with.</p>
            </div>
          ) : (
            <div className="px-6 py-6 space-y-4">
              {[
                { label: "Pass Rate", curr: curr.passRate, prev: prev.passRate, unit: "%" },
                { label: "Average",   curr: curr.avgPct,   prev: prev.avgPct,   unit: "%" },
                { label: "Students",  curr: curr.totalStudents, prev: prev.totalStudents, unit: "" },
              ].map(row => {
                const d = diff(row.curr, row.prev);
                const Icon = d.icon;
                return (
                  <div key={row.label} className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{row.label}</p>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{prev.name}</p>
                          <p className="text-lg font-black text-foreground">{row.prev}{row.unit}</p>
                        </div>
                        <span className="text-muted-foreground">→</span>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">{curr.name}</p>
                          <p className="text-lg font-black text-foreground">{row.curr}{row.unit}</p>
                        </div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-bold ${d.color}`}>
                      <Icon className="w-4 h-4" /> {d.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ─── render ─────────────────────────────────────────────────── */
  return (
    <div className="animate-in fade-in duration-300 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <button onClick={onBack} className="hover:text-foreground transition-colors">
          Exams &amp; Results
        </button>
        <span>/</span>
        <span className="text-foreground font-semibold">Exam Results</span>
      </div>

      {/* ── Header card ── */}
      <div className="bg-card border border-border rounded-2xl p-7 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{exam.name}</h1>
            <p className="text-sm text-muted-foreground">
              Date: {exam.dateLabel || "—"} &nbsp;•&nbsp; Total Students: {exam.totalStudents}
            </p>
          </div>
          <div className="flex gap-8 shrink-0">
            <div className="text-right">
              <p className={`text-3xl font-black ${rateColor(exam.passRate)}`}>{exam.passRate}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pass Rate</p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-black ${rateColor(exam.avgPct)}`}>{exam.avgPct}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Average</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Class-wise Results Summary ── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-7 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Class-wise Results Summary</h2>
        </div>
        <div className="overflow-x-auto">
          {exam.classSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No class data available.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Section", "Appeared", "Passed", "Failed", "Pass %", "Topper", "Avg %"].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {exam.classSummary.map((row, i) => (
                  <tr key={i} className={`hover:bg-muted/10 transition-colors ${rowHighlight(row.passRate)}`}>
                    <td className="px-6 py-4 text-sm font-bold text-foreground">{row.section}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{row.appeared}</td>
                    <td className={`px-6 py-4 text-sm font-bold ${rateColor(row.passRate)}`}>{row.passed}</td>
                    <td className="px-6 py-4 text-sm font-bold text-red-500">{row.failed}</td>
                    <td className={`px-6 py-4 text-sm font-bold ${rateColor(row.passRate)}`}>{row.passRate}%</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{row.topper}</td>
                    <td className={`px-6 py-4 text-sm font-bold ${rateColor(row.avgPct)}`}>{row.avgPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Merit + Fail lists ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Merit List */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-foreground">School Merit List (Top 5)</h3>
            <button className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {exam.meritList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data yet.</p>
            ) : exam.meritList.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-green-50/30 border border-green-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${rankBg(s.rank)}`}>
                    {s.rank}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{s.name}</p>
                    {s.className && <p className="text-xs text-muted-foreground">{s.className}</p>}
                  </div>
                </div>
                <span className="text-sm font-bold text-green-600">{s.avgPct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fail List */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-foreground">Fail List (Needs Attention)</h3>
            <button className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {exam.failList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No failed students — great!</p>
            ) : exam.failList.map((s, i) => (
              <div key={i} className={`flex items-center justify-between p-4 border rounded-xl ${i === 0 ? "bg-red-50/60 border-red-100" : "bg-red-50/20 border-red-50"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                    {s.initials}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{s.name}</p>
                    {s.className && <p className="text-xs text-muted-foreground">{s.className}</p>}
                  </div>
                </div>
                <span className="text-sm font-bold text-red-500">{s.avgPct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1e3a8a] text-white rounded-lg text-sm font-bold shadow-md hover:bg-[#1e3a8a]/90 transition-colors"
        >
          <Download className="w-4 h-4" /> Download Results
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-6 py-2.5 bg-card border border-border text-foreground rounded-lg text-sm font-bold hover:bg-muted/30 transition-colors shadow-sm"
        >
          <Printer className="w-4 h-4 text-muted-foreground" /> Print Report Cards
        </button>
        <button
          onClick={handleShare}
          disabled={sharingParents}
          className="flex items-center gap-2 px-6 py-2.5 bg-card border border-border text-foreground rounded-lg text-sm font-bold hover:bg-muted/30 transition-colors shadow-sm disabled:opacity-60"
        >
          <Share2 className="w-4 h-4 text-muted-foreground" />
          {sharingParents ? "Sharing…" : "Share with Parents"}
        </button>
        <button
          onClick={() => setShowCompare(true)}
          className="flex items-center gap-2 px-6 py-2.5 bg-card border border-border text-foreground rounded-lg text-sm font-bold hover:bg-muted/30 transition-colors shadow-sm"
        >
          <BarChart2 className="w-4 h-4 text-muted-foreground" /> Compare with Previous
        </button>
      </div>

      {/* Back button */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-muted/30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Exams
        </button>
      </div>

      {/* Compare modal */}
      <CompareModal />
    </div>
  );
}
