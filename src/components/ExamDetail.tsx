import { useState, useMemo } from "react";
import {
  ChevronLeft, ArrowRight, Download, Printer, Share2, BarChart2,
  X, TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { db, auth } from "@/lib/firebase";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
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

  /* ── Previous exam (same series, immediately prior by actual date) ──
     Bugs fixed in this pass:
       1. Operator precedence — `A === B || C && D` previously parsed as
          `A === B || (C && D)`, so if the current exam name contained "unit",
          ANY other exam containing "unit" matched regardless of series prefix.
          Now uses explicit parens.
       2. `dateLabel.localeCompare` for ordering — string-compare gave wrong
          order for human-formatted dates ("5 Mar" vs "12 Mar"). Now uses real
          timestamps from each exam's underlying score docs.
       3. Picked `[0]` after ASC sort — that's the OLDEST exam in the match
          set, not the most recent one immediately before the current. Now
          sorts DESC by date and picks the first one whose latest-date is
          STRICTLY before the current exam's latest-date. */
  const prevExam = useMemo(() => {
    const dateMs = (g: { scores: any[] }): number => {
      let max = 0;
      g.scores.forEach((s: any) => {
        const raw = s.testDate || s.date;
        if (!raw) return;
        const d = raw?.toDate ? raw.toDate() : new Date(raw);
        const ms = d?.getTime?.() || 0;
        if (ms > max) max = ms;
      });
      return max;
    };
    const seriesKey = (n: string) =>
      (n || "").trim().toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    const currKey = seriesKey(exam.name);
    const currMs = dateMs(exam);

    const candidates = allExams
      .filter(e =>
        e.name !== exam.name &&
        // Match same series by first-two-words prefix (so "Unit Test 1"
        // groups with "Unit Test 2", but "Unit Test" doesn't match
        // "Final Exam" just because both contain text).
        seriesKey(e.name) === currKey,
      )
      .map(e => ({ exam: e, ms: dateMs(e) }))
      .filter(x => x.ms > 0 && (currMs === 0 || x.ms < currMs))
      .sort((a, b) => b.ms - a.ms);

    return candidates[0]?.exam || null;
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

  /* ── Share with Parents ──
     Sends a personalised exam-result note to ONLY the parents whose child
     actually appeared in this exam — was: blasted to every parent in the
     school via an enrollments fetch (parents of kids in unrelated classes
     got "your child's result" messages for exams their kid never took).

     Schema fixes baked in:
       - `timestamp: serverTimestamp()` (was: `createdAt`) — matches the rest
         of `principal_to_parent_notes` so PrincipalNotesPage's sort + parent
         inbox queries pick this up.
       - `principalId` populated — without it parent dashboard's reply flow
         can't address the response.
       - `writeBatch` chunked at 450 ops (was: 500-doc Promise.all that may
         partially commit on failure). */
  const handleShare = async () => {
    // Re-check the in-flight flag at function entry — `disabled` updates on
    // next render, so a synchronous double-click could otherwise enter the
    // handler twice and write duplicate notes.
    if (sharingParents) return;
    if (!userData?.schoolId) return toast.error("School data not found.");

    // Recipients: parents of students who actually appeared in this exam.
    // Dedup by studentId in case the same student has multiple score rows.
    const seen = new Set<string>();
    const recipients = exam.scores
      .filter((s: any) => s.studentId)
      .filter((s: any) => {
        const k = String(s.studentId);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((s: any) => ({
        studentId:    String(s.studentId),
        studentEmail: (s.studentEmail || "").toLowerCase() || null,
        studentName:  s.studentName || "",
        className:    s.className   || s.classId || "",
        percentage:   typeof s.percentage === "number" ? s.percentage : null,
        grade:        s.grade || "",
        isAbsent:     !!s.isAbsent,
        score:        s.score,
        maxScore:     s.maxScore,
      }));

    if (recipients.length === 0) {
      toast.info("No students in this exam to notify.");
      return;
    }

    setSharingParents(true);
    try {
      const principalUid = auth.currentUser?.uid || (userData as any)?.id || "";
      const principalName = userData?.fullName || userData?.name || "Principal";

      const CHUNK = 450;
      let written = 0;
      for (let i = 0; i < recipients.length; i += CHUNK) {
        const slice = recipients.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(r => {
          const ref = doc(collection(db, "principal_to_parent_notes"));
          // Personalised body — actual child + actual score + class avg context.
          const childResult = r.isAbsent
            ? "marked as absent for this exam"
            : `scored ${r.percentage !== null ? `${Math.round(r.percentage)}%` : "—"}${r.grade ? ` (${r.grade})` : ""}`;
          // Fallback name avoids "Dear Parent of ,\n" gibberish when
          // studentName happens to be missing on legacy enrollment rows.
          const childRef = r.studentName?.trim() || "your child";
          const message =
            `📊 *${exam.name} Result*\n\n` +
            `Dear Parent of ${childRef},\n\n` +
            `${childRef} has ${childResult} in *${exam.name}*.\n\n` +
            `🏫 School Pass Rate: ${exam.passRate}%\n` +
            `📈 School Average: ${exam.avgPct}%\n\n` +
            `Please open the Parent Dashboard → Performance for the full report.\n\n` +
            `— ${principalName}`;
          batch.set(ref, {
            schoolId:     userData.schoolId,
            branchId:     userData.branchId || null,
            principalId:  principalUid,
            principalName,
            studentId:    r.studentId,
            studentEmail: r.studentEmail,
            studentName:  r.studentName,
            parentName:   `Parent of ${r.studentName}`,
            className:    r.className,
            // Both field names so any consumer renders correctly.
            message,
            content:      message,
            from:         "principal",
            category:     "exam_result",
            examName:     exam.name,
            read:         false,
            timestamp:    serverTimestamp(),
            _lastModifiedBy: principalUid,
          });
        });
        await batch.commit();
        written += slice.length;
      }
      toast.success(`Results shared with ${written} parent${written === 1 ? "" : "s"}.`, {
        description: "Notification posted to Parent Communication.",
      });
    } catch (e: any) {
      console.error("[ExamDetail] handleShare failed:", e);
      toast.error(`Failed to share: ${e?.message || "Unknown error"}`);
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
