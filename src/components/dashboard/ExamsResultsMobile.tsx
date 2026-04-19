import {
  FileText, Plus, Calendar, Users, Trophy, ChevronRight, ChevronLeft,
  Loader2, Sparkles, Download, Printer, Share2, BarChart3, AlertTriangle,
  CheckCircle, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import type { ExamGroup } from "@/pages/ExamsResults";

export interface ExamsResultsMobileProps {
  loading: boolean;
  upcomingExams: any[];
  examGroups: ExamGroup[];
  latestExam: ExamGroup | null;
  subjectData: { name: string; passRate: number }[];
  gradeData: { name: string; value: number; color: string }[];
  topper: { name: string; className: string; avgPct: number } | null;
  totalSchoolStudents?: number;
  selectedExam: ExamGroup | null;
  onSelectExam: (exam: ExamGroup) => void;
  onBackFromDetail: () => void;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const B1 = "#0055FF", B2 = "#1166FF";
const BG = "#EEF4FF", BG2 = "#E0ECFF";
const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
const GREEN = "#00C853", RED = "#FF3355", ORANGE = "#FF8800", GOLD = "#FFAA00";
const SEP = "rgba(0,85,255,0.07)";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const SHADOW_SM  = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)";
const SHADOW_LG  = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)";
const SHADOW_BTN = "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)";

const passRateColor = (pct: number) =>
  pct >= 75 ? GREEN : pct >= 50 ? GOLD : RED;

const avgScoreColor = (pct: number) =>
  pct >= 70 ? GREEN : pct >= 50 ? GOLD : RED;

const verdictChip = (pct: number) => {
  if (pct >= 85) return { label: "Excellent", color: "#66EE88" };
  if (pct >= 75) return { label: "Strong", color: "#66EE88" };
  if (pct >= 60) return { label: "Good", color: "#88BBFF" };
  if (pct >= 45) return { label: "Average", color: "#FFDD55" };
  return { label: "Critical", color: "#FF88AA" };
};

// Avatar gradient (deterministic by name)
const avGrad = (seed: string) => {
  const palette = [
    "linear-gradient(135deg, #0044EE, #2277FF)",
    "linear-gradient(135deg, #002DBB, #0055FF)",
    "linear-gradient(135deg, #1A3090, #2277FF)",
    "linear-gradient(135deg, #0066FF, #4499FF)",
    "linear-gradient(135deg, #002080, #0044EE)",
  ];
  let h = 0;
  for (const c of seed || "") h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return palette[h % palette.length];
};

const initialsOf = (name: string) => {
  const parts = (name || "").trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || "").join("").toUpperCase() || "??";
};

// ── CSV export helper ─────────────────────────────────────────────────────────
const exportCSV = (exam: ExamGroup) => {
  const rows: string[] = [];
  rows.push("Rank,Student,Class,Average %,Result");
  exam.meritList.forEach(m => {
    rows.push([m.rank, JSON.stringify(m.name), JSON.stringify(m.className), m.avgPct, "Pass"].join(","));
  });
  exam.failList.forEach(f => {
    rows.push(["—", JSON.stringify(f.name), JSON.stringify(f.className), f.avgPct, "Fail"].join(","));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${exam.name.replace(/[^a-z0-9]+/gi, "_")}_results.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Results CSV downloaded");
};

const ExamsResultsMobile = ({
  loading, upcomingExams, examGroups, latestExam,
  subjectData, gradeData, topper, totalSchoolStudents,
  selectedExam, onSelectExam, onBackFromDetail,
}: ExamsResultsMobileProps) => {

  // ── Donut geometry for grade distribution (dashboard) ──
  const donutR = 35;
  const donutC = 2 * Math.PI * donutR;
  let _offset = 0;
  const donutTotal = gradeData.reduce((s, g) => s + g.value, 0);
  const donutSegments = donutTotal > 0 ? gradeData.map(g => {
    const pct = (g.value / donutTotal) * 100;
    const len = (pct / 100) * donutC;
    const seg = { ...g, pct: Math.round(pct), dasharray: `${len} ${donutC - len}`, dashoffset: -_offset };
    _offset += len;
    return seg;
  }) : [];

  const topBarLabel = donutSegments[0]?.name.split(" ")[0] || "—";
  const topBarPct = donutSegments[0]?.pct || 0;

  // ── Max pass rate for bar scaling (used in dashboard chart) ──
  const maxPass = subjectData.length > 0 ? Math.max(...subjectData.map(s => s.passRate), 100) : 100;

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}
        className="pb-6 flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: B1 }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>
          Loading exams…
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — Exam Results Detail
  // ══════════════════════════════════════════════════════════════════════════
  if (selectedExam) {
    const exam = selectedExam;
    const avgColor = avgScoreColor(exam.avgPct);
    const passColor = passRateColor(exam.passRate);

    const handleDownload = () => exportCSV(exam);
    const handlePrint = () => {
      toast.info("Opening print dialog…");
      window.setTimeout(() => window.print(), 50);
    };
    const handleShare = () => toast.info("Parent sharing — coming soon");
    const handleCompare = () => toast.info("Previous exam comparison — coming soon");

    const aiVerdict =
      exam.avgPct >= 75 ? "Strong performance" :
      exam.avgPct >= 60 ? "Solid results" :
      exam.avgPct >= 45 ? "Average performance" : "Needs attention";
    const topMerit = exam.meritList[0];
    const lowest = exam.failList[exam.failList.length - 1] || exam.meritList[exam.meritList.length - 1];

    return (
      <div className="pb-6" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}>

        {/* Breadcrumb */}
        <div className="px-5 pt-3 flex items-center gap-[6px]">
          <button onClick={onBackFromDetail}
            className="flex items-center gap-1 text-[11px] font-bold transition-opacity active:opacity-60"
            style={{ color: B1 }}>
            <ChevronLeft className="w-3 h-3" strokeWidth={2.5} />
            Exams &amp; Results
          </button>
          <span className="text-[11px]" style={{ color: T4 }}>/</span>
          <span className="text-[11px] font-bold" style={{ color: T2 }}>Exam Results</span>
        </div>

        {/* Exam hero card */}
        <div className="mx-5 mt-3 rounded-[22px] bg-white p-[18px] relative overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="absolute -top-5 -right-4 w-[90px] h-[90px] rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${passColor}14 0%, transparent 70%)` }} />
          <div className="flex items-start justify-between gap-3 mb-3 relative">
            <div className="min-w-0 flex-1">
              <div className="text-[20px] font-bold leading-tight tracking-[-0.4px] capitalize mb-1 truncate" style={{ color: T1 }}>
                {exam.name}
              </div>
              <div className="text-[11px] font-semibold flex items-center gap-[6px] flex-wrap" style={{ color: T4 }}>
                <Calendar className="w-[11px] h-[11px]" strokeWidth={2.4} />
                {exam.dateLabel || "—"}
                <span className="w-[3px] h-[3px] rounded-full" style={{ background: T4 }} />
                Total Students: {exam.totalStudents}
              </div>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <div className="text-right">
                <div className="text-[22px] font-bold leading-none tracking-[-0.6px]" style={{ color: passColor }}>
                  {exam.passRate}%
                </div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em] mt-[3px]" style={{ color: T4 }}>Pass Rate</div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-bold leading-none tracking-[-0.6px]" style={{ color: avgColor }}>
                  {exam.avgPct}%
                </div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em] mt-[3px]" style={{ color: T4 }}>Average</div>
              </div>
            </div>
          </div>
          <div className="h-[6px] rounded-[3px] overflow-hidden" style={{ background: BG2 }}>
            <div className="h-full rounded-[3px]"
              style={{ width: `${Math.max(0, Math.min(100, exam.avgPct))}%`, background: `linear-gradient(90deg, ${avgColor}, ${avgColor}AA)` }} />
          </div>
        </div>

        {/* Class-wise summary */}
        {exam.classSummary.length > 0 && (
          <div className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden"
            style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="px-[18px] pt-[15px] pb-3" style={{ borderBottom: `0.5px solid ${SEP}` }}>
              <div className="text-[14px] font-bold" style={{ color: T1 }}>Class-wise Results Summary</div>
            </div>
            <div className="grid gap-1 px-4 py-[9px]" style={{ gridTemplateColumns: "1fr .7fr .7fr .7fr 1fr .7fr", background: BG, borderBottom: `0.5px solid ${SEP}` }}>
              <span className="text-[8px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Section</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>App.</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.09em]" style={{ color: GREEN }}>Pass</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.09em]" style={{ color: RED }}>Fail</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Topper</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Avg%</span>
            </div>
            {exam.classSummary.map((row, i, arr) => (
              <div key={row.section} className="grid gap-1 px-4 py-[13px] items-center"
                style={{ gridTemplateColumns: "1fr .7fr .7fr .7fr 1fr .7fr", borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : undefined }}>
                <span className="text-[11px] font-bold" style={{ color: T1 }}>{row.section}</span>
                <span className="text-[11px] font-semibold" style={{ color: T1 }}>{row.appeared}</span>
                <span className="text-[11px] font-bold" style={{ color: GREEN }}>{row.passed}</span>
                <span className="text-[11px] font-bold" style={{ color: RED }}>{row.failed}</span>
                <span className="text-[10px] font-semibold truncate" style={{ color: T1 }}>{row.topper}</span>
                <span className="text-[11px] font-bold" style={{ color: avgScoreColor(row.avgPct) }}>{row.avgPct}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Merit list */}
        {exam.meritList.length > 0 && (
          <div className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden"
            style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="px-[18px] pt-[15px] pb-3 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${SEP}` }}>
              <div className="text-[14px] font-bold" style={{ color: T1 }}>🏆 School Merit List (Top {exam.meritList.length})</div>
            </div>
            {exam.meritList.map((m, i, arr) => {
              const gradeLbl = m.avgPct >= 80 ? "A Grade" : m.avgPct >= 60 ? "B Grade" : m.avgPct >= 40 ? "C Grade" : "D Grade";
              const gradeBg = m.avgPct >= 80 ? "rgba(0,200,83,0.10)" : m.avgPct >= 60 ? "rgba(0,85,255,0.10)" : m.avgPct >= 40 ? "rgba(255,136,0,0.10)" : "rgba(255,51,85,0.10)";
              const gradeBdr = m.avgPct >= 80 ? "rgba(0,200,83,0.22)" : m.avgPct >= 60 ? "rgba(0,85,255,0.22)" : m.avgPct >= 40 ? "rgba(255,136,0,0.22)" : "rgba(255,51,85,0.22)";
              const gradeColor = m.avgPct >= 80 ? "#007830" : m.avgPct >= 60 ? B1 : m.avgPct >= 40 ? "#884400" : "#CC0033";
              const scoreColor = m.avgPct >= 80 ? GREEN : m.avgPct >= 60 ? B1 : m.avgPct >= 40 ? ORANGE : RED;
              const rankGrad =
                m.rank === 1 ? "linear-gradient(135deg,#FFAA00,#FFDD44)" :
                m.rank === 2 ? "linear-gradient(135deg,#99AACC,#BBC8E4)" :
                m.rank === 3 ? "linear-gradient(135deg,#C87533,#E8A66B)" :
                "rgba(0,85,255,0.10)";
              const rankColor = m.rank === 1 ? "#884400" : m.rank === 2 ? "#334455" : m.rank === 3 ? "#5A3512" : B1;
              const rankShadow = m.rank <= 3 ? "0 2px 8px rgba(255,170,0,0.22)" : "none";

              return (
                <div key={`${m.name}-${i}`} className="flex items-center gap-[13px] px-[18px] py-[14px] transition-colors active:bg-[rgba(0,85,255,0.04)]"
                  style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : undefined }}>
                  <div className="w-7 h-7 rounded-[9px] flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                    style={{ background: rankGrad, color: rankColor, boxShadow: rankShadow }}>
                    {m.rank}
                  </div>
                  <div className="w-10 h-10 rounded-[13px] flex items-center justify-center text-[14px] font-bold text-white flex-shrink-0"
                    style={{ background: avGrad(m.name), boxShadow: "0 2px 8px rgba(0,85,255,0.24)" }}>
                    {initialsOf(m.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold tracking-[-0.2px] truncate" style={{ color: T1 }}>{m.name}</div>
                    <div className="text-[11px] font-semibold mt-[2px] truncate" style={{ color: T4 }}>Class {m.className}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[17px] font-bold leading-none tracking-[-0.3px]" style={{ color: scoreColor }}>{m.avgPct}%</div>
                    <div className="inline-flex items-center justify-center mt-[3px] px-[8px] py-[2px] rounded-full text-[9px] font-bold"
                      style={{ background: gradeBg, color: gradeColor, border: `0.5px solid ${gradeBdr}` }}>
                      {gradeLbl}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Fail list */}
        <div className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="px-[18px] pt-[15px] pb-3 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${SEP}` }}>
            <div className="text-[14px] font-bold" style={{ color: T1 }}>⚠ Fail List (Needs Attention)</div>
          </div>
          {exam.failList.length === 0 ? (
            <div className="py-6 px-[18px] flex flex-col items-center gap-[9px]">
              <div className="w-[50px] h-[50px] rounded-[16px] flex items-center justify-center"
                style={{ background: "rgba(0,200,83,0.10)", border: "0.5px solid rgba(0,200,83,0.22)" }}>
                <CheckCircle className="w-[22px] h-[22px]" style={{ color: GREEN }} strokeWidth={2.2} />
              </div>
              <div className="text-[14px] font-bold tracking-[-0.2px]" style={{ color: GREEN }}>No failed students — great!</div>
              <div className="text-[11px]" style={{ color: T4 }}>All students passed this exam 🎉</div>
            </div>
          ) : (
            exam.failList.map((f, i, arr) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-[13px] px-[18px] py-[13px]"
                style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : undefined }}>
                <div className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #FF3355, #FF6688)", boxShadow: "0 2px 8px rgba(255,51,85,0.24)" }}>
                  {f.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold tracking-[-0.2px] truncate" style={{ color: T1 }}>{f.name}</div>
                  <div className="text-[11px] font-semibold mt-[1px] truncate" style={{ color: T4 }}>Class {f.className}</div>
                </div>
                <div className="text-[15px] font-bold tracking-[-0.3px] flex-shrink-0" style={{ color: RED }}>{f.avgPct}%</div>
              </div>
            ))
          )}
        </div>

        {/* AI insight dark card */}
        <div className="mx-5 mt-3 rounded-[22px] px-5 py-[18px] relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}>
          <div className="absolute -top-9 -right-5 w-[140px] h-[140px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-[6px] mb-[10px] relative z-10">
            <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Sparkles className="w-[13px] h-[13px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              AI Result Intelligence
            </span>
          </div>
          <div className="text-[12px] leading-[1.72] relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
            {aiVerdict} with a <strong style={{ color: "#fff", fontWeight: 700 }}>{exam.passRate}% pass rate</strong> and an average of <strong style={{ color: "#fff", fontWeight: 700 }}>{exam.avgPct}%</strong>.
            {topMerit && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{topMerit.name}</strong> leads with <strong style={{ color: "#fff", fontWeight: 700 }}>{topMerit.avgPct}%</strong>.</>}
            {exam.failList.length > 0
              ? <> {exam.failList.length} student{exam.failList.length === 1 ? "" : "s"} need remedial support.</>
              : lowest ? <> Lowest scorer at {lowest.avgPct}% — above the passing threshold.</> : null}
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden mt-3 relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: `${exam.passRate}%`, label: "Pass Rate", color: "#66EE88" },
              { val: `${exam.avgPct}%`, label: "Average", color: "#fff" },
              { val: exam.failList.length, label: "Failures", color: exam.failList.length === 0 ? "#66EE88" : "#FF88AA" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-3 px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[19px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.5px" }}>{val}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-5 pt-3.5 flex-wrap">
          <button onClick={handleDownload}
            className="flex-1 min-w-[100px] h-[42px] rounded-[14px] flex items-center justify-center gap-[6px] text-[12px] font-bold text-white transition-transform active:scale-95 relative overflow-hidden"
            style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Download className="w-[13px] h-[13px] relative z-10" strokeWidth={2.2} />
            <span className="relative z-10">Download Results</span>
          </button>
          <button onClick={handlePrint}
            className="flex-1 min-w-[100px] h-[42px] rounded-[14px] flex items-center justify-center gap-[6px] text-[12px] font-bold bg-white transition-transform active:scale-95"
            style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SHADOW_SM }}>
            <Printer className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.2} />
            Print Cards
          </button>
        </div>
        <div className="flex gap-2 px-5 pt-2 flex-wrap">
          <button onClick={handleShare}
            className="flex-1 min-w-[100px] h-[42px] rounded-[14px] flex items-center justify-center gap-[6px] text-[12px] font-bold transition-transform active:scale-95"
            style={{ background: "rgba(0,200,83,0.10)", color: "#007830", border: "0.5px solid rgba(0,200,83,0.22)" }}>
            <Share2 className="w-[13px] h-[13px]" strokeWidth={2.2} />
            Share with Parents
          </button>
          <button onClick={handleCompare}
            className="flex-1 min-w-[100px] h-[42px] rounded-[14px] flex items-center justify-center gap-[6px] text-[12px] font-bold bg-white transition-transform active:scale-95"
            style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SHADOW_SM }}>
            <BarChart3 className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.2} />
            Compare Previous
          </button>
        </div>

        <button onClick={onBackFromDetail}
          className="mx-5 mt-3 h-10 px-[14px] rounded-[13px] flex items-center gap-[6px] text-[12px] font-bold bg-white transition-colors active:bg-[#EEF4FF]"
          style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: SHADOW_SM }}>
          <ChevronLeft className="w-[13px] h-[13px]" strokeWidth={2.5} />
          Back to Exams
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Exams & Results Dashboard
  // ══════════════════════════════════════════════════════════════════════════
  const handleCreateExam = () => toast.info("Exams are created by teachers from the Teacher Dashboard.");

  return (
    <div className="pb-6" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}>

      {/* Page head */}
      <div className="px-5 pt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[3px] flex items-center gap-[5px]" style={{ color: T4 }}>
            <div className="w-[5px] h-[5px] rounded-full" style={{ background: B1, boxShadow: "0 0 0 2px rgba(0,85,255,0.18)" }} />
            Exams &amp; Results
          </div>
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.6px]" style={{ color: T1 }}>
            Exams &amp; Results
          </h1>
          <p className="text-[11px] font-normal mt-[2px]" style={{ color: T3 }}>
            Manage exams and view student results
          </p>
        </div>
        <button onClick={handleCreateExam}
          className="h-[38px] px-[14px] rounded-[13px] flex items-center gap-[6px] text-[12px] font-bold text-white whitespace-nowrap flex-shrink-0 transition-transform active:scale-95 relative overflow-hidden mt-1"
          style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
          <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          <Plus className="w-3 h-3 relative z-10" strokeWidth={2.5} />
          <span className="relative z-10">Create Exam</span>
        </button>
      </div>

      {/* Hero banner */}
      {latestExam ? (
        <div className="mx-5 mt-3.5 rounded-[22px] px-[18px] py-4 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
            boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-9 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center justify-between mb-[14px] relative z-10">
            <div className="flex items-center gap-[10px] min-w-0">
              <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
                <FileText className="w-[18px] h-[18px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
              </div>
              <div className="min-w-0">
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.50)" }}>
                  Latest Exam
                </div>
                <div className="text-[24px] font-bold text-white leading-none tracking-[-0.7px] truncate capitalize">
                  {latestExam.name}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-[5px] px-3 py-[5px] rounded-full flex-shrink-0"
              style={{ background: "rgba(0,200,83,0.20)", border: "0.5px solid rgba(0,200,83,0.35)" }}>
              <div className="w-[5px] h-[5px] rounded-full" style={{ background: "#00EE88" }} />
              <span className="text-[11px] font-bold" style={{ color: "#66EE88" }}>{latestExam.dateLabel}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: latestExam.totalStudents, label: "Students", color: "#fff" },
              { val: `${latestExam.passRate}%`, label: "Pass Rate", color: verdictChip(latestExam.passRate).color },
              { val: `${latestExam.avgPct}%`, label: "Avg Score", color: verdictChip(latestExam.avgPct).color },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[11px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[18px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Upcoming exams */}
      <div className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden"
        style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
        <div className="px-[18px] pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${SEP}` }}>
          <div className="text-[15px] font-bold" style={{ color: T1 }}>Upcoming Exams</div>
          <button onClick={handleCreateExam}
            className="h-8 px-3 rounded-[10px] text-[11px] font-bold text-white flex items-center gap-[5px] active:scale-95 transition-transform"
            style={{ background: GRAD_PRIMARY, boxShadow: "0 3px 10px rgba(0,85,255,0.28)" }}>
            <Plus className="w-[11px] h-[11px]" strokeWidth={2.5} />
            Schedule
          </button>
        </div>
        {upcomingExams.length === 0 ? (
          <div className="py-[26px] px-5 flex flex-col items-center gap-[9px]">
            <div className="w-[54px] h-[54px] rounded-[18px] flex items-center justify-center"
              style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: "0 0 0 8px rgba(0,85,255,0.04)" }}>
              <Calendar className="w-6 h-6" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.1} />
            </div>
            <div className="text-[14px] font-bold tracking-[-0.2px]" style={{ color: T2 }}>No upcoming exams scheduled</div>
            <div className="text-[11px] text-center max-w-[220px] leading-[1.55] font-normal" style={{ color: T4 }}>
              Teachers can create exams from the Teacher Dashboard.
            </div>
          </div>
        ) : (
          upcomingExams.slice(0, 6).map((ex: any, i: number, arr: any[]) => (
            <div key={ex.id || i} className="px-[18px] py-[14px] flex items-center gap-3"
              style={{ borderBottom: i < Math.min(arr.length, 6) - 1 ? `0.5px solid ${SEP}` : undefined }}>
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
                <Calendar className="w-4 h-4" style={{ color: B1 }} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold truncate" style={{ color: T1 }}>{ex.testName || ex.subject || "Upcoming"}</div>
                <div className="text-[11px] font-semibold mt-[2px]" style={{ color: T4 }}>
                  {ex.testDate || ex.date || "—"}{ex.className ? ` · ${ex.className}` : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Key Metrics section */}
      <div className="px-5 pt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
        Key Metrics
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      <div className="grid grid-cols-2 gap-[10px] px-5 pt-3">
        {/* Latest Exam card */}
        <button onClick={() => latestExam && onSelectExam(latestExam)} disabled={!latestExam}
          className="rounded-[20px] p-[15px] bg-white relative overflow-hidden text-left transition-transform active:scale-[0.96] disabled:opacity-60"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="absolute -top-4 -right-3 w-[65px] h-[65px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(0,85,255,0.10) 0%, transparent 70%)" }} />
          <div className="absolute top-3 right-3 w-7 h-7 rounded-[9px] flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
            <FileText className="w-[13px] h-[13px]" style={{ color: B1 }} strokeWidth={2.4} />
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.07em] mb-[9px]" style={{ color: T4 }}>Latest Exam</div>
          <div className="text-[16px] font-bold tracking-[-0.2px] mb-1 capitalize truncate" style={{ color: T1 }}>
            {latestExam ? latestExam.name : "—"}
          </div>
          <div className="text-[10px] font-bold flex items-center gap-[3px]" style={{ color: B1 }}>
            View Results <ChevronRight className="w-[11px] h-[11px]" strokeWidth={2.5} />
          </div>
        </button>

        {/* Students Appeared */}
        <div className="rounded-[20px] p-[15px] bg-white relative overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="absolute -top-4 -right-3 w-[65px] h-[65px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(0,85,255,0.10) 0%, transparent 70%)" }} />
          <div className="absolute top-3 right-3 w-7 h-7 rounded-[9px] flex items-center justify-center"
            style={{ background: "rgba(0,200,83,0.10)", border: "0.5px solid rgba(0,200,83,0.22)" }}>
            <Users className="w-[13px] h-[13px]" style={{ color: GREEN }} strokeWidth={2.4} />
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.07em] mb-[9px]" style={{ color: T4 }}>Students Appeared</div>
          <div className="text-[26px] font-bold leading-none tracking-[-0.8px] mb-1" style={{ color: B1 }}>
            {latestExam ? latestExam.totalStudents : 0}
          </div>
          <div className="text-[10px] font-semibold" style={{ color: T4 }}>
            {latestExam && totalSchoolStudents ? `${latestExam.totalStudents} of ${totalSchoolStudents} total` : latestExam ? `${latestExam.totalStudents} students` : "—"}
          </div>
        </div>

        {/* Pass Rate */}
        <div className="rounded-[20px] p-[15px] bg-white relative overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="absolute -top-4 -right-3 w-[65px] h-[65px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(0,200,83,0.10) 0%, transparent 70%)" }} />
          <div className="absolute top-3 right-3 w-7 h-7 rounded-[9px] flex items-center justify-center"
            style={{ background: "rgba(0,200,83,0.10)", border: "0.5px solid rgba(0,200,83,0.22)" }}>
            <TrendingUp className="w-[13px] h-[13px]" style={{ color: GREEN }} strokeWidth={2.4} />
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.07em] mb-[9px]" style={{ color: T4 }}>Pass Rate</div>
          <div className="text-[26px] font-bold leading-none tracking-[-0.8px] mb-1"
            style={{ color: latestExam ? passRateColor(latestExam.passRate) : T4 }}>
            {latestExam ? `${latestExam.passRate}%` : "—"}
          </div>
          <div className="text-[10px] font-bold"
            style={{ color: latestExam ? passRateColor(latestExam.passRate) : T4 }}>
            {latestExam ? verdictChip(latestExam.passRate).label : "No data"}
          </div>
        </div>

        {/* Topper */}
        <div className="rounded-[20px] p-[15px] bg-white relative overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="absolute -top-4 -right-3 w-[65px] h-[65px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,170,0,0.10) 0%, transparent 70%)" }} />
          <div className="absolute top-3 right-3 w-7 h-7 rounded-[9px] flex items-center justify-center"
            style={{ background: "rgba(255,170,0,0.10)", border: "0.5px solid rgba(255,170,0,0.22)" }}>
            <Trophy className="w-[13px] h-[13px]" style={{ color: GOLD }} strokeWidth={2.4} />
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.07em] mb-[9px]" style={{ color: T4 }}>School Topper</div>
          <div className="text-[14px] font-bold tracking-[-0.2px] mb-1 truncate" style={{ color: T1 }}>
            {topper ? topper.name : "—"}
          </div>
          <div className="text-[10px] font-bold" style={{ color: GOLD }}>
            {topper ? `${topper.className} · ${topper.avgPct}%` : "No data"}
          </div>
        </div>
      </div>

      {/* Analytics section label */}
      <div className="px-5 pt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
        Analytics
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      <div className="grid grid-cols-2 gap-[10px] px-5 pt-3">
        {/* Pass Rates bar chart */}
        <div className="rounded-[20px] p-4 bg-white"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="text-[13px] font-bold tracking-[-0.2px] mb-[14px]" style={{ color: T1 }}>Pass Rates</div>
          <div className="flex items-end gap-[6px] h-20 mb-2">
            {subjectData.slice(0, 3).map((s, i) => {
              const heightPct = Math.max(4, (s.passRate / maxPass) * 100);
              const color = s.passRate >= 75 ? GREEN : s.passRate >= 50 ? GOLD : RED;
              return (
                <div key={s.name || i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-[5px] relative" style={{ height: `${heightPct}%`, background: `linear-gradient(180deg, ${color}, ${color}AA)`, boxShadow: `0 3px 10px ${color}42`, minHeight: 4 }}>
                    <div className="absolute -top-[17px] left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap" style={{ color: T1 }}>{s.passRate}%</div>
                  </div>
                  <div className="text-[8px] font-bold uppercase tracking-[0.04em] truncate max-w-full" style={{ color: T4 }}>
                    {s.name.slice(0, 4)}
                  </div>
                </div>
              );
            })}
            {subjectData.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-[10px] font-semibold" style={{ color: T4 }}>
                No subject data
              </div>
            )}
          </div>
          <div className="flex gap-[6px] mt-1">
            <div className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: T4 }}>
              <div className="w-[7px] h-[7px] rounded-[2px]" style={{ background: GREEN }} />Pass
            </div>
            <div className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: T4 }}>
              <div className="w-[7px] h-[7px] rounded-[2px]" style={{ background: RED }} />Fail
            </div>
          </div>
        </div>

        {/* Grade Distribution donut */}
        <div className="rounded-[20px] p-4 bg-white"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="text-[13px] font-bold tracking-[-0.2px] mb-[14px]" style={{ color: T1 }}>Grade Distribution</div>
          <div className="flex flex-col items-center gap-[10px]">
            <div className="relative w-[90px] h-[90px]">
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r={donutR} fill="none" stroke={BG2} strokeWidth="14" />
                {donutSegments.map((seg, i) => (
                  <circle key={i} cx="45" cy="45" r={donutR} fill="none"
                    stroke={seg.color} strokeWidth="14"
                    strokeDasharray={seg.dasharray} strokeDashoffset={seg.dashoffset}
                    transform="rotate(-90 45 45)" />
                ))}
              </svg>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-[16px] font-bold leading-none tracking-[-0.4px]" style={{ color: T1 }}>
                  {donutTotal > 0 ? `${topBarPct}%` : "—"}
                </div>
                <div className="text-[8px] font-bold uppercase tracking-[0.07em] mt-[2px]" style={{ color: T4 }}>
                  {topBarLabel}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-[6px] w-full">
              {donutSegments.length > 0 ? donutSegments.map((seg, i) => (
                <div key={i} className="flex items-center gap-[6px] text-[10px] font-semibold" style={{ color: T3 }}>
                  <div className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: seg.color }} />
                  <span className="truncate">{seg.name} · {seg.pct}%</span>
                </div>
              )) : (
                <div className="text-[10px] font-semibold text-center" style={{ color: T4 }}>No data</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* All Exams */}
      <div className="px-5 pt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
        All Exams
        <span className="px-[9px] py-[3px] rounded-full text-[9px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.16)" }}>
          {examGroups.length} {examGroups.length === 1 ? "exam" : "exams"}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {examGroups.length === 0 ? (
        <div className="mx-5 mt-3 rounded-[22px] p-8 bg-white text-center"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
          <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: T3 }}>No exam results yet</p>
          <p className="text-[11px] mt-2" style={{ color: T4 }}>Results will appear once teachers record marks.</p>
        </div>
      ) : (
        <div className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          {examGroups.map((exam, i, arr) => (
            <div key={exam.name} className="flex items-center gap-[10px] px-[18px] py-[14px] transition-colors active:bg-[#EEF4FF]"
              style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : undefined }}>
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
                <FileText className="w-[14px] h-[14px]" style={{ color: B1 }} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold tracking-[-0.2px] capitalize truncate" style={{ color: T1 }}>{exam.name}</div>
                <div className="text-[11px] font-semibold mt-[2px]" style={{ color: T4 }}>
                  {exam.dateLabel} · {exam.totalStudents} Student{exam.totalStudents === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-[5px] flex-shrink-0">
                <div className="flex gap-[5px]">
                  <span className="px-[9px] py-[3px] rounded-full text-[10px] font-bold"
                    style={{ background: "rgba(0,200,83,0.10)", color: "#007830", border: "0.5px solid rgba(0,200,83,0.22)" }}>
                    {exam.passRate}%
                  </span>
                  <span className="px-[9px] py-[3px] rounded-full text-[10px] font-bold"
                    style={{ background: "rgba(255,170,0,0.10)", color: "#884400", border: "0.5px solid rgba(255,170,0,0.22)" }}>
                    {exam.avgPct}% avg
                  </span>
                </div>
                <button onClick={() => onSelectExam(exam)}
                  className="h-9 px-[13px] rounded-[12px] text-[11px] font-bold text-white flex items-center gap-[5px] active:scale-95 transition-transform relative overflow-hidden"
                  style={{ background: GRAD_PRIMARY, boxShadow: "0 3px 10px rgba(0,85,255,0.26)" }}>
                  <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                  <span className="relative z-10">View Results</span>
                  <ChevronRight className="w-[11px] h-[11px] relative z-10" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI card */}
      {latestExam && (
        <div className="mx-5 mt-3 rounded-[22px] px-5 py-[18px] relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}>
          <div className="absolute -top-9 -right-5 w-[140px] h-[140px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-[6px] mb-[10px] relative z-10">
            <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Sparkles className="w-[13px] h-[13px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              AI Exam Intelligence
            </span>
          </div>
          <div className="text-[12px] leading-[1.72] relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
            The <strong style={{ color: "#fff", fontWeight: 700 }}>{latestExam.name}</strong> exam shows a <strong style={{ color: "#fff", fontWeight: 700 }}>{latestExam.passRate}% pass rate</strong> with an average of <strong style={{ color: "#fff", fontWeight: 700 }}>{latestExam.avgPct}%</strong>.
            {topper && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{topper.name}</strong> topped at <strong style={{ color: "#fff", fontWeight: 700 }}>{topper.avgPct}%</strong>.</>}
            {upcomingExams.length === 0
              ? " No upcoming exams are scheduled — consider planning the next assessment cycle."
              : ` ${upcomingExams.length} upcoming exam${upcomingExams.length === 1 ? "" : "s"} scheduled.`}
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden mt-3 relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: examGroups.length, label: "Exams", color: "#fff" },
              { val: `${latestExam.passRate}%`, label: "Pass Rate", color: "#66EE88" },
              { val: `${latestExam.avgPct}%`, label: "Avg Score", color: "#fff" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-3 px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[19px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.5px" }}>{val}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when no data at all */}
      {!latestExam && examGroups.length === 0 && (
        <div className="mx-5 mt-3 rounded-[22px] p-8 bg-white text-center"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(255,170,0,0.50)" }} strokeWidth={1.8} />
          <p className="text-[13px] font-bold tracking-[-0.2px]" style={{ color: T1 }}>No exam data yet</p>
          <p className="text-[11px] mt-2" style={{ color: T4 }}>
            Once teachers record exam scores, analytics will appear here.
          </p>
        </div>
      )}

    </div>
  );
};

export default ExamsResultsMobile;