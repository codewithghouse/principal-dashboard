import {
  GraduationCap, CheckCircle, AlertTriangle, BarChart3, XCircle,
  TrendingUp, FileText, CalendarCheck, Sparkles, Loader2, ArrowRight,
} from "lucide-react";

export interface AcademicsMobileProps {
  loading: boolean;
  subjects: any[];          // { id, name, avg (string %), avgNum, status, totalStudents, classBuckets, ... }
  gradeDistData: any[];     // [{ name: "A (80-100%)", value: number, color: string }, ...]
  curriculumData: any[];    // [{ subject, progress }]
  weakItems: any[];         // [{ subject, className, avg, studentCount }]
  onSelectSubject: (subject: any) => void;
  onOpenScheduleModal: () => void;
  onGenerateReport: () => void;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const B1 = "#0055FF", B2 = "#1166FF";
const BG = "#EEF4FF", BG2 = "#E0ECFF";
const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
const GREEN = "#00C853", RED = "#FF3355", ORANGE = "#FF8800", GOLD = "#FFAA00";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const SHADOW_SM = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)";
const SHADOW_LG = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)";
const SHADOW_BTN = "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)";

// Subject icon gradient by name
const subjectIconGrad = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes("math")) return "linear-gradient(135deg, #FF3355, #FF6688)";
  if (n.includes("sci") || n.includes("bio") || n.includes("chem") || n.includes("phy")) return "linear-gradient(135deg, #7C3AED, #A78BFA)";
  if (n.includes("eng") || n.includes("lang") || n.includes("lit")) return `linear-gradient(135deg, #002DBB, ${B1})`;
  if (n.includes("social") || n.includes("sst") || n.includes("hist") || n.includes("geo")) return "linear-gradient(135deg, #00C853, #22EE66)";
  if (n.includes("islamic")) return "linear-gradient(135deg, #00C853, #22EE66)";
  return GRAD_PRIMARY;
};

// Overall chip based on generalScore
const overallChip = (score: number) => {
  if (score >= 75) return { label: "EXCELLENT", bg: "rgba(0,200,83,0.22)", bdr: "rgba(0,200,83,0.36)", color: "#66EE88" };
  if (score >= 60) return { label: "GOOD", bg: "rgba(0,85,255,0.22)", bdr: "rgba(0,85,255,0.36)", color: "#88BBFF" };
  if (score >= 45) return { label: "AVERAGE", bg: "rgba(255,170,0,0.22)", bdr: "rgba(255,170,0,0.36)", color: "#FFDD55" };
  return { label: "WEAK", bg: "rgba(255,51,85,0.22)", bdr: "rgba(255,51,85,0.36)", color: "#FF88AA" };
};

// Curriculum chip
const curriculumChip = (avg: number) => {
  if (avg >= 80) return { label: "On Track", bg: "rgba(0,200,83,0.10)", bdr: "rgba(0,200,83,0.22)", color: "#007830" };
  if (avg >= 60) return { label: "Steady", bg: "rgba(0,85,255,0.10)", bdr: "rgba(0,85,255,0.22)", color: B1 };
  if (avg > 0) return { label: "Catching Up", bg: "rgba(255,136,0,0.10)", bdr: "rgba(255,136,0,0.22)", color: "#884400" };
  return { label: "No Data", bg: "rgba(0,85,255,0.06)", bdr: "rgba(0,85,255,0.12)", color: T4 };
};

// Helper — progress bar color by percentage
const progressColor = (pct: number): { color: string; bar: string } => {
  if (pct >= 80) return { color: GREEN, bar: `linear-gradient(90deg, ${GREEN}, #66EE88)` };
  if (pct >= 60) return { color: B1, bar: `linear-gradient(90deg, ${B1}, ${B2})` };
  if (pct >= 40) return { color: ORANGE, bar: `linear-gradient(90deg, ${ORANGE}, #FFCC22)` };
  return { color: RED, bar: `linear-gradient(90deg, ${RED}, #FF88AA)` };
};

const AcademicsMobile = ({
  loading, subjects, gradeDistData, curriculumData, weakItems,
  onSelectSubject, onOpenScheduleModal, onGenerateReport,
}: AcademicsMobileProps) => {

  // ── Derived metrics ──────────────────────────────────────────────────────
  const generalScore = subjects.length > 0
    ? Math.round(subjects.reduce((sum, s) => sum + (s.avgNum || 0), 0) / subjects.length)
    : 0;

  const weakCount = subjects.filter(s => s.status === "Weak").length;
  const strongCount = subjects.filter(s => s.status === "Good").length;

  // Grade buckets (A/B/C/D) — compute percentages
  const buckets = ["A", "B", "C", "D"].map((letter, idx) => {
    const entry = gradeDistData[idx] || { value: 0, color: "#9ca3af" };
    return { letter, count: entry.value || 0 };
  });
  const gradeTotal = buckets.reduce((s, b) => s + b.count, 0);
  const gradePcts = buckets.map(b => ({
    letter: b.letter,
    count: b.count,
    pct: gradeTotal > 0 ? Math.round((b.count / gradeTotal) * 100) : 0,
  }));

  const topGrade = gradePcts.reduce((top, cur) => cur.count > top.count ? cur : top, gradePcts[0]).letter;
  const atRiskPct = gradePcts[3]?.pct || 0; // D grade %

  const curriculumAvg = curriculumData.length > 0
    ? Math.round(curriculumData.reduce((s, c) => s + (c.progress || 0), 0) / curriculumData.length)
    : 0;

  const overall = overallChip(generalScore);
  const currChip = curriculumChip(curriculumAvg);

  // ── Donut geometry ───────────────────────────────────────────────────────
  const donutR = 58;
  const donutCircumference = 2 * Math.PI * donutR; // ≈ 364.4
  const GRADE_COLORS: Record<string, string> = { A: GREEN, B: B1, C: GOLD, D: RED };
  const GRADE_RANGES: Record<string, string> = { A: "80–100%", B: "60–79%", C: "40–59%", D: "Below 40%" };
  const GRADE_SUBS: Record<string, string> = { A: "Top tier", B: "Average", C: "Monitor", D: "Critical" };
  const GRADE_FILLS: Record<string, string> = {
    A: `linear-gradient(90deg, ${GREEN}, #66EE88)`,
    B: `linear-gradient(90deg, ${B1}, #4499FF)`,
    C: `linear-gradient(90deg, ${GOLD}, #FFDD44)`,
    D: `linear-gradient(90deg, ${RED}, #FF88AA)`,
  };
  const GRADE_SUB_COLORS: Record<string, string> = { A: "#007830", B: "#0033CC", C: "#884400", D: "#CC0033" };

  // Build donut segments with stroke-dasharray
  let donutOffset = 0;
  const donutSegments = gradePcts.map(({ letter, pct }) => {
    const dashLen = (pct / 100) * donutCircumference;
    const seg = {
      letter,
      color: GRADE_COLORS[letter],
      dasharray: `${dashLen} ${donutCircumference - dashLen}`,
      dashoffset: -donutOffset,
    };
    donutOffset += dashLen;
    return seg;
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleViewDetails = () => {
    // Drill into the lowest-average subject if available (most actionable).
    if (subjects.length > 0) onSelectSubject(subjects[0]);
  };

  const handleGradeCardClick = (letter: string) => {
    // Find a subject that best represents this bucket — pick the one whose avgNum falls in the range.
    const ranges: Record<string, (n: number) => boolean> = {
      A: n => n >= 80,
      B: n => n >= 60 && n < 80,
      C: n => n >= 40 && n < 60,
      D: n => n < 40,
    };
    const match = subjects.find(s => ranges[letter]?.(s.avgNum || 0));
    if (match) onSelectSubject(match);
  };

  // ── AI insight text ──────────────────────────────────────────────────────
  const insightVerdict = overall.label;
  const aiText = (
    <>
      Overall class performance is <strong>{insightVerdict[0] + insightVerdict.slice(1).toLowerCase()} at {generalScore}%</strong>.
      {atRiskPct > 0 && <> A <strong>{atRiskPct}% of students</strong> are scoring below 40% (Grade D).</>}
      {" "}Curriculum completion is <strong>{curriculumAvg}%</strong>.
      {atRiskPct >= 20
        ? " Immediate remedial sessions for Grade D students are recommended before the next assessment."
        : weakCount > 0
          ? " Review weak subjects and schedule targeted remediation."
          : " Keep up the consistent progress."}
    </>
  );

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}
        className="pb-6 flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: B1 }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>
          Loading academic data…
        </p>
      </div>
    );
  }

  return (
    <div className="pb-6" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}>

      {/* ── Page Head ── */}
      <div className="px-5 pt-3">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.6px]" style={{ color: T1 }}>
          Academic Performance
        </h1>
        <p className="text-[11px] font-normal mt-1" style={{ color: T3 }}>
          Subject-wise academic performance overview
        </p>
      </div>

      {/* ── Hero Banner ── */}
      <div className="mx-5 mt-3.5 rounded-[24px] px-5 py-[18px] relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 8px 28px rgba(0,8,60,0.30), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-10 -right-7 w-[160px] h-[160px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between mb-[14px] relative z-10">
          <div className="flex items-center gap-[10px]">
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
              <GraduationCap className="w-[18px] h-[18px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
            </div>
            <div>
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.50)" }}>
                General Score
              </div>
              <div className="text-[28px] font-bold text-white leading-none tracking-[-1px]">
                {generalScore}%
              </div>
            </div>
          </div>
          <div className="px-[13px] py-[6px] rounded-full text-[11px] font-bold"
            style={{ background: overall.bg, border: `0.5px solid ${overall.bdr}`, color: overall.color }}>
            {overall.label}
          </div>
        </div>
        <div className="flex items-center gap-[7px] relative z-10 flex-wrap">
          <div className="flex items-center gap-[5px] px-3 py-[6px] rounded-full text-[11px] font-bold"
            style={{ background: "rgba(255,255,255,0.12)", border: "0.5px solid rgba(255,255,255,0.20)", color: "rgba(255,255,255,0.80)" }}>
            <div className="w-[6px] h-[6px] rounded-full" style={{ background: RED, boxShadow: `0 0 0 2px rgba(255,51,85,0.22)` }} />
            Weak Sections: {weakCount}
          </div>
          <div className="flex items-center gap-[5px] px-3 py-[6px] rounded-full text-[11px] font-bold"
            style={{ background: "rgba(255,255,255,0.12)", border: "0.5px solid rgba(255,255,255,0.20)", color: "rgba(255,255,255,0.80)" }}>
            <div className="w-[6px] h-[6px] rounded-full" style={{ background: GREEN, boxShadow: `0 0 0 2px rgba(0,200,83,0.22)` }} />
            Strong: {strongCount}
          </div>
        </div>
      </div>

      {/* ── Overview Strip ── */}
      <div className="grid grid-cols-3 gap-[10px] px-5 pt-3.5">
        <button onClick={() => handleGradeCardClick(topGrade)}
          className="rounded-[18px] p-[14px] bg-white flex flex-col items-center gap-1 transition-transform active:scale-95"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-7 h-7 rounded-[9px] flex items-center justify-center mb-[3px]"
            style={{ background: "rgba(0,200,83,0.10)", border: "0.5px solid rgba(0,200,83,0.22)" }}>
            <CheckCircle className="w-[14px] h-[14px]" style={{ color: GREEN }} strokeWidth={2.5} />
          </div>
          <div className="text-[19px] font-bold leading-none tracking-[-0.5px]" style={{ color: gradeTotal > 0 ? GREEN : T4 }}>
            {gradeTotal > 0 ? topGrade : "—"}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-center" style={{ color: T4 }}>Top Grade</div>
        </button>

        <button onClick={handleViewDetails} disabled={subjects.length === 0}
          className="rounded-[18px] p-[14px] bg-white flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-60"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-7 h-7 rounded-[9px] flex items-center justify-center mb-[3px]"
            style={{ background: "rgba(255,136,0,0.12)", border: "0.5px solid rgba(255,136,0,0.22)" }}>
            <AlertTriangle className="w-[14px] h-[14px]" style={{ color: ORANGE }} strokeWidth={2.5} />
          </div>
          <div className="text-[19px] font-bold leading-none tracking-[-0.5px]" style={{ color: ORANGE }}>{weakCount}</div>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-center" style={{ color: T4 }}>Weak Sec.</div>
        </button>

        <button onClick={handleViewDetails} disabled={subjects.length === 0}
          className="rounded-[18px] p-[14px] bg-white flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-60"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-7 h-7 rounded-[9px] flex items-center justify-center mb-[3px]"
            style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
            <BarChart3 className="w-[14px] h-[14px]" style={{ color: B1 }} strokeWidth={2.5} />
          </div>
          <div className="text-[19px] font-bold leading-none tracking-[-0.5px]" style={{ color: B1 }}>
            {curriculumAvg > 0 ? `${curriculumAvg}%` : "—"}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-center" style={{ color: T4 }}>Curriculum</div>
        </button>
      </div>

      {/* ── Section label: Grade Distribution ── */}
      <div className="px-5 pt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
        Grade Distribution
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* ── Donut Card ── */}
      <div className="mx-5 mt-3 rounded-[24px] p-5 bg-white relative overflow-hidden"
        style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
        <div className="absolute -top-8 -right-6 w-[130px] h-[130px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0,85,255,0.05) 0%, transparent 70%)" }} />
        <div className="flex items-center justify-between mb-[18px] relative z-10">
          <div className="text-[15px] font-bold tracking-[-0.2px]" style={{ color: T1 }}>
            Grade Distribution — Latest Exam
          </div>
          <div className="px-[11px] py-1 rounded-full text-[11px] font-bold"
            style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
            Live
          </div>
        </div>

        <div className="flex items-center gap-5 relative z-10">
          {/* Donut */}
          <div className="relative w-[140px] h-[140px] flex-shrink-0">
            <svg width="140" height="140" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={donutR} fill="none" stroke={BG2} strokeWidth="20" />
              {gradeTotal > 0 ? donutSegments.map(seg => (
                <circle key={seg.letter}
                  cx="80" cy="80" r={donutR} fill="none"
                  stroke={seg.color}
                  strokeWidth="20"
                  strokeDasharray={seg.dasharray}
                  strokeDashoffset={seg.dashoffset}
                  strokeLinecap="butt"
                  transform="rotate(-90 80 80)" />
              )) : null}
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-[24px] font-bold leading-none tracking-[-0.8px]" style={{ color: T1 }}>
                {generalScore}%
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] mt-[2px]" style={{ color: T4 }}>
                General
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-[10px] flex-1 min-w-0">
            {gradePcts.map(({ letter, pct }) => (
              <div key={letter} className="flex items-center gap-2">
                <div className="w-[10px] h-[10px] rounded-[3px] flex-shrink-0" style={{ background: GRADE_COLORS[letter] }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold tracking-[-0.1px]" style={{ color: T1 }}>{letter} Grade</div>
                  <div className="text-[10px] font-medium" style={{ color: T4 }}>{GRADE_RANGES[letter]}</div>
                </div>
                <div className="text-[13px] font-bold tracking-[-0.1px]" style={{ color: GRADE_COLORS[letter] }}>
                  {pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Grade Detail Grid ── */}
      <div className="grid grid-cols-2 gap-2 px-5 pt-3">
        {gradePcts.map(({ letter, pct }) => (
          <button key={letter}
            onClick={() => handleGradeCardClick(letter)}
            className="rounded-[18px] p-[14px] bg-white relative overflow-hidden transition-transform active:scale-[0.96] text-left"
            style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="absolute -top-4 -right-3 w-[60px] h-[60px] rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${GRADE_COLORS[letter]}1A 0%, transparent 70%)` }} />
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center mb-2 relative"
              style={{ background: `${GRADE_COLORS[letter]}1F`, border: `0.5px solid ${GRADE_COLORS[letter]}38` }}>
              {letter === "A" ? <CheckCircle className="w-[14px] h-[14px]" style={{ color: GRADE_COLORS[letter] }} strokeWidth={2.5} />
                : letter === "B" ? <BarChart3 className="w-[14px] h-[14px]" style={{ color: GRADE_COLORS[letter] }} strokeWidth={2.5} />
                : letter === "C" ? <AlertTriangle className="w-[14px] h-[14px]" style={{ color: GRADE_COLORS[letter] }} strokeWidth={2.5} />
                : <XCircle className="w-[14px] h-[14px]" style={{ color: GRADE_COLORS[letter] }} strokeWidth={2.5} />}
            </div>
            <div className="text-[24px] font-bold leading-none tracking-[-0.6px] mb-[3px] relative" style={{ color: GRADE_COLORS[letter] }}>
              {letter}
            </div>
            <div className="text-[10px] font-semibold mb-[3px]" style={{ color: T4 }}>{GRADE_RANGES[letter]}</div>
            <div className="text-[11px] font-semibold" style={{ color: GRADE_SUB_COLORS[letter] }}>
              {pct}% · {GRADE_SUBS[letter]}
            </div>
            <div className="h-1 rounded-[2px] mt-2 overflow-hidden" style={{ background: BG2 }}>
              <div className="h-full rounded-[2px]"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: GRADE_FILLS[letter] }} />
            </div>
          </button>
        ))}
      </div>

      {/* ── Section label: Curriculum Progress ── */}
      <div className="px-5 pt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
        Curriculum Progress
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* ── Curriculum Progress Card ── */}
      {curriculumData.length > 0 ? (
        <div className="mx-5 mt-3 rounded-[24px] p-5 bg-white"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold tracking-[-0.2px]" style={{ color: T1 }}>Curriculum Progress</div>
            <div className="px-[11px] py-1 rounded-full text-[11px] font-bold"
              style={{ background: currChip.bg, color: currChip.color, border: `0.5px solid ${currChip.bdr}` }}>
              {currChip.label}
            </div>
          </div>
          {curriculumData.map((row, i) => {
            const pct = Math.max(0, Math.min(100, row.progress || 0));
            const pc = progressColor(pct);
            const sub = subjects.find(s => s.name === row.subject);
            const avgText = sub ? `Avg ${sub.avg} · ${sub.totalStudents} students` : `${pct}% coverage`;
            return (
              <button key={i} onClick={() => sub && onSelectSubject(sub)} disabled={!sub}
                className={`w-full text-left ${i < curriculumData.length - 1 ? "mb-4" : ""} ${sub ? "active:opacity-75 transition-opacity" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-[7px] min-w-0">
                    <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center flex-shrink-0"
                      style={{ background: subjectIconGrad(row.subject) }}>
                      <GraduationCap className="w-3 h-3 text-white" strokeWidth={2.4} />
                    </div>
                    <span className="text-[13px] font-bold tracking-[-0.1px] truncate" style={{ color: T1 }}>{row.subject}</span>
                  </div>
                  <span className="text-[14px] font-bold tracking-[-0.2px] flex-shrink-0" style={{ color: pc.color }}>
                    {pct}%
                  </span>
                </div>
                <div className="h-[10px] rounded-[5px] overflow-hidden" style={{ background: BG2 }}>
                  <div className="h-full rounded-[5px] relative overflow-hidden"
                    style={{ width: `${pct}%`, background: pc.bar }}>
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.22) 0%, transparent 100%)" }} />
                  </div>
                </div>
                <div className="text-[10px] font-medium mt-[5px]" style={{ color: T4 }}>{avgText}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mx-5 mt-3 rounded-[24px] p-8 bg-white text-center"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
          <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: T3 }}>No curriculum data</p>
        </div>
      )}

      {/* ── Action Row ── */}
      <div className="flex gap-2 px-5 pt-3.5 flex-wrap">
        <button onClick={handleViewDetails} disabled={subjects.length === 0}
          className="flex-1 min-w-[100px] h-11 rounded-[14px] flex items-center justify-center gap-[7px] text-[12px] font-bold text-white transition-transform active:scale-95 relative overflow-hidden disabled:opacity-60"
          style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
          <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          <TrendingUp className="w-[13px] h-[13px] relative z-10" strokeWidth={2.3} />
          <span className="relative z-10">View Details</span>
        </button>
        <button onClick={onGenerateReport}
          className="flex-1 min-w-[100px] h-11 rounded-[14px] flex items-center justify-center gap-[7px] text-[12px] font-bold bg-white transition-transform active:scale-95"
          style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SHADOW_SM }}>
          <FileText className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
          Generate Report
        </button>
      </div>

      <div className="px-5 mt-2">
        <button onClick={onOpenScheduleModal}
          className="w-full h-11 rounded-[14px] flex items-center justify-center gap-[7px] text-[12px] font-bold transition-transform active:scale-95"
          style={{ background: "rgba(0,200,83,0.10)", border: "0.5px solid rgba(0,200,83,0.22)", color: "#007830" }}>
          <CalendarCheck className="w-[13px] h-[13px]" strokeWidth={2.3} />
          Schedule Remedial
        </button>
      </div>

      {/* ── AI Insight Dark Card ── */}
      <div className="mx-5 mt-3 rounded-[24px] px-[22px] py-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
          boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
        }}>
        <div className="absolute -top-9 -right-6 w-[155px] h-[155px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[6px] mb-[11px] relative z-10">
          <div className="w-7 h-7 rounded-[9px] flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
            <Sparkles className="w-[14px] h-[14px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
            AI Performance Intelligence
          </span>
        </div>
        <div className="text-[13px] leading-[1.72] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
          {aiText}
        </div>

        <div className="grid grid-cols-3 gap-[1px] rounded-[16px] overflow-hidden relative z-10 mt-[14px]" style={{ background: "rgba(255,255,255,0.12)" }}>
          {[
            { val: `${generalScore}%`, label: "General" },
            { val: curriculumAvg > 0 ? `${curriculumAvg}%` : "—", label: "Curriculum" },
            { val: `${atRiskPct}%`, label: "At Risk" },
          ].map(({ val, label }) => (
            <div key={label} className="py-[13px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="text-[20px] font-bold text-white leading-none mb-1" style={{ letterSpacing: "-0.5px" }}>{val}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Weak Items List (if any) ── */}
      {weakItems.length > 0 && (
        <>
          <div className="px-5 pt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
            Needs Attention
            <span className="px-[9px] py-[3px] rounded-full text-[9px] font-bold ml-1"
              style={{ background: "rgba(255,51,85,0.10)", color: RED, border: "0.5px solid rgba(255,51,85,0.22)" }}>
              {weakItems.length}
            </span>
            <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
          </div>
          <div className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden"
            style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
            {weakItems.map((w, i, arr) => {
              const sub = subjects.find(s => s.name === w.subject);
              return (
                <button key={`${w.subject}-${w.className}-${i}`}
                  onClick={() => sub && onSelectSubject(sub)}
                  disabled={!sub}
                  className="w-full flex items-center gap-3 px-[18px] py-[14px] text-left transition-colors active:bg-[rgba(0,85,255,0.04)]"
                  style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(0,85,255,0.07)" } : {}}>
                  <div className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0"
                    style={{ background: subjectIconGrad(w.subject) }}>
                    <AlertTriangle className="w-[15px] h-[15px] text-white" strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold tracking-[-0.1px] truncate" style={{ color: T1 }}>
                      {w.subject} · {w.className}
                    </div>
                    <div className="text-[11px] font-medium mt-[2px]" style={{ color: T4 }}>
                      {w.studentCount} student{w.studentCount === 1 ? "" : "s"} · avg {w.avg}%
                    </div>
                  </div>
                  <div className="px-[10px] py-1 rounded-full text-[11px] font-bold flex-shrink-0"
                    style={{ background: "rgba(255,51,85,0.10)", color: RED, border: "0.5px solid rgba(255,51,85,0.22)" }}>
                    {w.avg}%
                  </div>
                  {sub && <ArrowRight className="w-[13px] h-[13px] flex-shrink-0" style={{ color: "rgba(0,85,255,0.4)" }} strokeWidth={2.3} />}
                </button>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
};

export default AcademicsMobile;