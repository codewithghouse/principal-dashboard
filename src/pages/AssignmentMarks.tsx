import { useState, useEffect, useMemo } from "react";
import {
  FileText, Users, TrendingUp, Trophy, ChevronRight, ChevronLeft,
  Loader2, AlertTriangle, Check, Clock, X, BookOpen, Download,
  Sparkles, Upload, ArrowRight, Star
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import AssignmentMarksMobile from "@/components/dashboard/AssignmentMarksMobile";

/* ── helpers ─────────────────────────────────────────────────── */
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function scoreLetter(s: number) {
  if (s >= 80) return { letter: "A", color: "text-green-600 bg-green-50" };
  if (s >= 60) return { letter: "B", color: "text-blue-600 bg-blue-50" };
  if (s >= 40) return { letter: "C", color: "text-amber-600 bg-amber-50" };
  return { letter: "D", color: "text-red-600 bg-red-50" };
}

function aiFeedback(score: number, studentName: string, title: string): string {
  const first = (studentName || "Student").split(" ")[0];
  // Use score digits to vary phrases so each student gets different wording
  const v = Math.floor(score) % 3;
  if (score >= 90) {
    return [
      `Outstanding performance, ${first}! Demonstrates excellent mastery of ${title}.`,
      `Exceptional work! ${first} has shown a thorough understanding of all concepts in ${title}.`,
      `Brilliant submission, ${first}. Keep this level of excellence — you're a top performer!`,
    ][v];
  }
  if (score >= 75) {
    return [
      `Good job, ${first}! Solid understanding shown. A bit more depth could push you to the top.`,
      `Well done, ${first}. Key concepts covered well — revisit the finer details to excel further.`,
      `Nice work on ${title}, ${first}. You're on the right track; refine your approach to reach the top.`,
    ][v];
  }
  if (score >= 60) {
    return [
      `Decent effort, ${first}. Focus on the weaker areas of ${title} to improve your score.`,
      `You have a fair grasp, ${first}. Revisiting the core concepts will help you score higher.`,
      `Average performance. Consistent practice and revision of ${title} is recommended, ${first}.`,
    ][v];
  }
  if (score >= 40) {
    return [
      `${first} needs more effort. Review the ${title} material thoroughly and seek teacher guidance.`,
      `Below average performance. ${first} should revisit ${title} concepts and practice regularly.`,
      `More practice needed, ${first}. Focus on understanding the fundamentals before the next test.`,
    ][v];
  }
  return `${first} requires immediate attention and support. Please review ${title} with extra guidance from the teacher.`;
}

function fmtDate(val: any) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── types ───────────────────────────────────────────────────── */
interface AssignmentGroup {
  homeworkId:    string;
  title:         string;
  className:     string;
  teacherName:   string;
  dueDate:       any;
  results:       any[];   // raw result docs
  gradedCount:   number;
  avgScore:      number;
  topScore:      number;
  topStudent:    string;
}

/* ════════════════════════════════════════════════════════════
   DETAIL VIEW
════════════════════════════════════════════════════════════ */
function AssignmentDetail({ group, onBack }: { group: AssignmentGroup; onBack: () => void }) {
  const isMobile = useIsMobile();

  const handleDownload = () => {
    const headers = ["Student Name", "Score /100", "Grade", "Feedback"];
    const rows = group.results.map(r => {
      const sc = r.score !== null && r.score !== undefined ? parseFloat(r.score) : null;
      const graded = sc !== null && !isNaN(sc);
      const fb = r.feedback || (graded ? aiFeedback(sc!, r.studentName || "", group.title) + " [AI]" : "");
      return [
        r.studentName || "",
        r.score ?? "—",
        graded ? scoreLetter(sc!).letter : "—",
        fb,
      ];
    });
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${group.title}_${group.className}_Marks.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Marks downloaded!");
  };

  const sorted = [...group.results].sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

  // ───────────────────────── MOBILE DETAIL ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const B3 = "#2277FF";
    const GREEN = "#00C853";
    const RED = "#FF3355";
    const ORANGE = "#FF8800";
    const GOLD = "#FFAA00";
    const VIOLET = "#7B3FF4";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const avGrads = [
      `linear-gradient(135deg, #002DBB, ${B1})`,
      `linear-gradient(135deg, ${B1}, ${B3})`,
      `linear-gradient(135deg, ${VIOLET}, #AA77FF)`,
      `linear-gradient(135deg, ${GREEN}, #22EE66)`,
      `linear-gradient(135deg, ${GOLD}, #FFCC55)`,
    ];

    const topShort = (group.topStudent || "—").split(" ").slice(0, 2).join(" ");

    return (
      <div
        style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          background: "#EEF4FF",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* BREADCRUMB */}
        <div style={{ padding: "12px 20px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={onBack}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: B1,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              padding: 0,
            }}
          >
            <ChevronLeft size={12} strokeWidth={2.5} />
            Assignments & Marks
          </button>
          <span style={{ fontSize: 11, color: T4 }}>/</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: T2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {group.title}
          </span>
        </div>

        {/* MARKS HERO */}
        <div
          style={{
            margin: "12px 20px 0",
            background: "#fff",
            borderRadius: 22,
            padding: "18px 20px",
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
            border: "0.5px solid rgba(0,85,255,.10)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -24,
              right: -18,
              width: 100,
              height: 100,
              background: "radial-gradient(circle, rgba(0,85,255,.06) 0%, transparent 70%)",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T1, letterSpacing: "-0.4px", textTransform: "capitalize", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {group.title}
              </div>
              <div style={{ fontSize: 11, color: T4, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: 100,
                    background: `linear-gradient(135deg, ${B1}, ${B2})`,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {group.className}
                </span>
                <span>Teacher: {group.teacherName}</span>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: T4 }} />
                <span>Due: {fmtDate(group.dueDate)}</span>
              </div>
            </div>
            <button
              onClick={handleDownload}
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 13,
                background: `linear-gradient(135deg, ${B1}, ${B2})`,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                cursor: "pointer",
                border: "none",
                boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
                flexShrink: 0,
                marginTop: 4,
              }}
            >
              <Download size={13} strokeWidth={2.2} />
              Download
            </button>
          </div>
          <div style={{ height: 8, background: "#E0ECFF", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 4,
                background: `linear-gradient(90deg, ${B1}, #66BBFF)`,
                width: `${Math.min(100, Math.max(0, group.avgScore))}%`,
              }}
            />
          </div>
        </div>

        {/* DETAIL STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
          {[
            {
              label: "Total Graded",
              value: group.gradedCount,
              color: GREEN,
              icon: <Check size={13} color={GREEN} strokeWidth={2.4} />,
              bg: "rgba(0,200,83,.10)",
              border: "rgba(0,200,83,.22)",
              glow: "rgba(0,200,83,.10)",
              isText: false,
            },
            {
              label: "Avg Score",
              value: `${group.avgScore}%`,
              color: ORANGE,
              icon: <TrendingUp size={13} color={ORANGE} strokeWidth={2.4} />,
              bg: "rgba(255,136,0,.10)",
              border: "rgba(255,136,0,.22)",
              glow: "rgba(255,136,0,.10)",
              isText: false,
            },
            {
              label: "Top Score",
              value: `${group.topScore}%`,
              color: GREEN,
              icon: <Trophy size={13} color={GOLD} strokeWidth={2.4} />,
              bg: "rgba(255,170,0,.10)",
              border: "rgba(255,170,0,.22)",
              glow: "rgba(0,200,83,.10)",
              isText: false,
            },
            {
              label: "Top Student",
              value: topShort,
              color: T1,
              icon: <Users size={13} color={B1} strokeWidth={2.4} />,
              bg: "rgba(0,85,255,.10)",
              border: "rgba(0,85,255,.18)",
              glow: "rgba(0,85,255,.10)",
              isText: true,
            },
          ].map((c, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                borderRadius: 18,
                padding: 14,
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                border: "0.5px solid rgba(0,85,255,.10)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -16,
                  right: -12,
                  width: 60,
                  height: 60,
                  background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: c.bg,
                  border: `0.5px solid ${c.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 7,
                }}
              >
                {c.icon}
              </div>
              <div
                style={{
                  fontSize: c.isText ? 13 : 22,
                  fontWeight: 700,
                  color: c.color,
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                  marginBottom: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.value}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4 }}>
                {c.label}
              </div>
            </div>
          ))}
        </div>

        {/* SECTION LABEL */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: T4,
            padding: "16px 20px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Student-wise Marks</span>
          <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
        </div>

        {/* STUDENT MARKS TABLE */}
        <div
          style={{
            margin: "12px 20px 0",
            background: "#fff",
            borderRadius: 22,
            overflow: "hidden",
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
            border: "0.5px solid rgba(0,85,255,.10)",
          }}
        >
          <div style={{ padding: "15px 18px 12px", borderBottom: `0.5px solid ${SEP}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T1 }}>Student-wise Marks</div>
          </div>

          {sorted.length === 0 ? (
            <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <FileText size={36} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
              <div style={{ fontSize: 13, fontWeight: 700, color: T2 }}>No submissions yet</div>
            </div>
          ) : (
            sorted.map((r, i) => {
              const score = r.score !== null && r.score !== undefined ? parseFloat(r.score) : null;
              const graded = score !== null && !isNaN(score);
              const gradeInfo = graded
                ? score! >= 80
                  ? { letter: "A", bg: "rgba(0,200,83,.10)", color: "#007830", border: "0.5px solid rgba(0,200,83,.22)", barFrom: GREEN, barTo: "#66EE88" }
                  : score! >= 60
                  ? { letter: "B", bg: "rgba(0,85,255,.10)", color: B1, border: "0.5px solid rgba(0,85,255,.22)", barFrom: B1, barTo: "#66BBFF" }
                  : score! >= 40
                  ? { letter: "C", bg: "rgba(255,170,0,.10)", color: "#884400", border: "0.5px solid rgba(255,170,0,.22)", barFrom: GOLD, barTo: "#FFCC55" }
                  : { letter: "D", bg: "rgba(255,51,85,.10)", color: RED, border: "0.5px solid rgba(255,51,85,.22)", barFrom: RED, barTo: "#FF88AA" }
                : null;
              const feedbackText =
                r.feedback ||
                (graded ? aiFeedback(score!, r.studentName || "", group.title) : null);
              const needsAttention = graded && score! < 40;
              const isLast = i === sorted.length - 1;

              return (
                <div key={r.studentId || i} style={{ display: "flex", flexDirection: "column", borderBottom: isLast ? "none" : `0.5px solid ${SEP}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 18px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T4, width: 18, textAlign: "center", flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: avGrads[i % avGrads.length],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                        boxShadow: "0 3px 10px rgba(0,85,255,.24)",
                      }}
                    >
                      {(r.studentName || "ST").substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.studentName || "—"}
                      </div>
                      <div style={{ fontSize: 11, color: T4, fontWeight: 600 }}>
                        {r.className || group.className}
                      </div>
                      {graded && gradeInfo && (
                        <div style={{ height: 4, width: 120, background: "#E0ECFF", borderRadius: 2, overflow: "hidden", marginTop: 5 }}>
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 2,
                              background: `linear-gradient(90deg, ${gradeInfo.barFrom}, ${gradeInfo.barTo})`,
                              width: `${Math.min(100, Math.max(0, score!))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px", color: graded ? (gradeInfo!.letter === "D" ? RED : gradeInfo!.letter === "A" ? GREEN : gradeInfo!.color) : T4 }}>
                        {graded ? `${score}/100` : "—"}
                      </div>
                      {gradeInfo && (
                        <div
                          style={{
                            padding: "4px 11px",
                            borderRadius: 100,
                            fontSize: 11,
                            fontWeight: 700,
                            textAlign: "center",
                            background: gradeInfo.bg,
                            color: gradeInfo.color,
                            border: gradeInfo.border,
                          }}
                        >
                          {gradeInfo.letter}
                        </div>
                      )}
                    </div>
                  </div>
                  {feedbackText && (
                    <div
                      style={{
                        padding: "10px 18px 14px",
                        background: needsAttention ? "rgba(255,51,85,.04)" : "rgba(0,85,255,.04)",
                        borderTop: `0.5px solid ${SEP}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.10em",
                          textTransform: "uppercase",
                          color: needsAttention ? RED : VIOLET,
                          marginBottom: 6,
                        }}
                      >
                        {needsAttention ? (
                          <AlertTriangle size={11} strokeWidth={2.3} />
                        ) : (
                          <Sparkles size={11} strokeWidth={2.3} />
                        )}
                        AI Feedback{needsAttention ? " · Needs Attention" : ""}
                      </div>
                      <div style={{ fontSize: 12, color: T3, lineHeight: 1.65, fontWeight: 400 }}>
                        {feedbackText}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* AI DARK */}
        {sorted.length > 0 && (
          <div
            style={{
              margin: "12px 20px 0",
              background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
              borderRadius: 22,
              padding: "18px 20px",
              boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -34,
                right: -22,
                width: 140,
                height: 140,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.18)",
                  border: "0.5px solid rgba(255,255,255,.26)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                AI Marks Intelligence
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
              {group.title} shows a class average of{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>{group.avgScore}%</strong>.{" "}
              {group.topStudent && group.topStudent !== "—" && (
                <>
                  <strong style={{ color: "#fff", fontWeight: 700 }}>
                    {group.topStudent} ({group.topScore}%)
                  </strong>{" "}
                  demonstrates excellent understanding.
                </>
              )}
              {sorted.some((r) => {
                const sc = r.score !== null && r.score !== undefined ? parseFloat(r.score) : null;
                return sc !== null && !isNaN(sc) && sc < 40;
              }) && (
                <>
                  {" "}Some students need immediate remedial intervention — schedule extra sessions and notify parents.
                </>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1,
                background: "rgba(255,255,255,.12)",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
                marginTop: 12,
              }}
            >
              {(() => {
                const nums = sorted
                  .map((r) => (r.score !== null && r.score !== undefined ? parseFloat(r.score) : NaN))
                  .filter((n) => !isNaN(n));
                const lowest = nums.length ? Math.min(...nums) : null;
                return [
                  { v: `${group.avgScore}%`, l: "Avg Score", color: "#fff" },
                  { v: `${group.topScore}%`, l: "Highest", color: "#66EE88" },
                  { v: lowest !== null ? `${lowest}%` : "—", l: "Lowest", color: "#FF8899" },
                ];
              })().map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: s.color, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BACK BUTTON */}
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 42,
            padding: "0 16px",
            borderRadius: 14,
            background: "#fff",
            border: "0.5px solid rgba(0,85,255,.14)",
            fontSize: 13,
            fontWeight: 700,
            color: T2,
            cursor: "pointer",
            boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
            margin: "14px 20px 0",
          }}
        >
          <ChevronLeft size={13} strokeWidth={2.5} />
          Back to Assignments
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 pb-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <button onClick={onBack} className="hover:text-foreground transition-colors">Assignments & Marks</button>
        <span>/</span>
        <span className="text-foreground font-semibold">{group.title}</span>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground mb-1">{group.title}</h1>
            <p className="text-sm text-muted-foreground">
              {group.className} &nbsp;•&nbsp; Teacher: {group.teacherName} &nbsp;•&nbsp; Due: {fmtDate(group.dueDate)}
            </p>
          </div>
          <button onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-[#1e3a8a]/90 transition-colors shrink-0">
            <Download className="w-4 h-4" /> Download Marks
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Graded", val: group.gradedCount, icon: Check,        color: "bg-green-50 text-green-600" },
          { label: "Avg Score",    val: `${group.avgScore}%`, icon: TrendingUp, color: "bg-blue-50 text-blue-600" },
          { label: "Top Score",    val: `${group.topScore}%`, icon: Trophy,     color: "bg-amber-50 text-amber-600" },
          { label: "Top Student",  val: group.topStudent || "—", icon: Users,   color: "bg-purple-50 text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-semibold">{s.label}</p>
              <p className="text-sm font-black text-foreground truncate">{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Student marks table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Student-wise Marks</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {["#", "Student Name", "Score /100", "Grade", "Feedback"].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r, i) => {
                const score  = r.score !== null && r.score !== undefined ? parseFloat(r.score) : null;
                const graded = score !== null && !isNaN(score);
                const lg     = graded ? scoreLetter(score!) : null;
                return (
                  <tr key={r.studentId || i} className="hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-3 text-sm text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1e3a8a]/10 flex items-center justify-center text-[11px] font-bold text-[#1e3a8a] shrink-0">
                          {(r.studentName || "?").substring(0, 2).toUpperCase()}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{r.studentName || "—"}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {graded ? (
                        <span className="text-sm font-bold text-foreground">{score}/100</span>
                      ) : (
                        <span className="text-xs text-muted-foreground font-semibold">Not graded</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {lg ? (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${lg.color}`}>
                          {lg.letter}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-5 py-3 max-w-xs">
                      {r.feedback ? (
                        <span className="text-sm text-muted-foreground">{r.feedback}</span>
                      ) : graded ? (
                        <div>
                          <p className="text-sm text-muted-foreground leading-snug">{aiFeedback(score!, r.studentName || "", group.title)}</p>
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded-full">
                            ✦ AI
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Back */}
      <div className="mt-6">
        <button onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-muted/30 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Assignments
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════ */
export default function AssignmentMarks() {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const [allResults,    setAllResults]    = useState<any[]>([]);
  const [assignMap,     setAssignMap]     = useState<Map<string, any>>(new Map());
  const [loading,       setLoading]       = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<AssignmentGroup | null>(null);
  const [classFilter,   setClassFilter]   = useState("All");

  /* ── fetch ── */
  useEffect(() => {
    if (!userData?.schoolId) return;
    const go = async () => {
      try {
        /* 1. results by schoolId + branchId */
        const c: any[] = [where("schoolId", "==", userData.schoolId)];
        if (userData.branchId) c.push(where("branchId", "==", userData.branchId));
        const rSnap = await getDocs(query(collection(db, "results"), ...c));
        const results = rSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        setAllResults(results);

        /* 2. fetch assignments metadata by homeworkId (max 10 per "in" query) */
        const hwIds = [...new Set(results.map(r => r.homeworkId).filter(Boolean))] as string[];
        const aMap  = new Map<string, any>();
        for (const ids of chunk(hwIds, 10)) {
          const aSnap = await getDocs(
            query(collection(db, "assignments"), where("__name__", "in", ids))
          );
          aSnap.docs.forEach(d => aMap.set(d.id, { id: d.id, ...d.data() }));
        }
        setAssignMap(aMap);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    go();
  }, [userData?.schoolId, userData?.branchId]);

  /* ── build assignment groups ── */
  const groups = useMemo<AssignmentGroup[]>(() => {
    const map = new Map<string, any[]>();
    allResults.forEach(r => {
      const key = r.homeworkId || r.assignmentTitle || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    return Array.from(map.entries()).map(([hwId, results]) => {
      const aData   = assignMap.get(hwId) || {};
      const graded  = results.filter(r => r.score !== null && r.score !== undefined && r.score !== "");
      const scores  = graded.map(r => parseFloat(r.score)).filter(n => !isNaN(n));
      const avg     = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const top     = scores.length ? Math.max(...scores) : 0;
      const topR    = graded.find(r => parseFloat(r.score) === top);
      return {
        homeworkId:  hwId,
        title:       aData.title       || results[0]?.assignmentTitle || "Unnamed Assignment",
        className:   aData.className   || results[0]?.className        || "—",
        teacherName: aData.teacherName || results[0]?.teacherName      || "—",
        dueDate:     aData.dueDate     || null,
        results,
        gradedCount: graded.length,
        avgScore:    avg,
        topScore:    Math.round(top),
        topStudent:  topR?.studentName || "—",
      };
    }).sort((a, b) => {
      const da = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate || 0);
      const db_ = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate || 0);
      return db_.getTime() - da.getTime();
    });
  }, [allResults, assignMap]);

  /* ── class list for filter tabs ── */
  const classes = useMemo(() => {
    const set = new Set(groups.map(g => g.className).filter(c => c && c !== "—"));
    return ["All", ...Array.from(set).sort()];
  }, [groups]);

  const filtered = classFilter === "All" ? groups : groups.filter(g => g.className === classFilter);

  /* ── overall stats ── */
  const stats = useMemo(() => {
    const allScores = allResults.map(r => parseFloat(r.score)).filter(n => !isNaN(n));
    const avg       = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
    const topR      = [...allResults].sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0))[0];
    return {
      totalAssignments: groups.length,
      totalGraded:      allResults.filter(r => r.score !== null && r.score !== undefined && r.score !== "").length,
      avgScore:         avg,
      topStudent:       topR?.studentName || "—",
    };
  }, [allResults, groups]);

  /* ── mobile render (handles both list + detail internally — intercepts before desktop early-return) ── */
  if (isMobile) {
    return (
      <AssignmentMarksMobile
        loading={loading}
        groups={groups}
        filtered={filtered}
        stats={stats}
        classes={classes}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        selectedGroup={selectedGroup}
        onSelectGroup={g => setSelectedGroup(g)}
        onBackFromDetail={() => setSelectedGroup(null)}
      />
    );
  }

  /* ── detail view (desktop) ── */
  if (selectedGroup) {
    return <AssignmentDetail group={selectedGroup} onBack={() => setSelectedGroup(null)} />;
  }

  /* ── list view ── */
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assignments &amp; Marks</h1>
        <p className="text-sm text-muted-foreground">Class-wise assignment marks submitted by teachers</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Assignments", val: loading ? "…" : stats.totalAssignments, icon: BookOpen, color: "bg-blue-50 text-blue-600" },
          { label: "Total Graded",      val: loading ? "…" : stats.totalGraded,      icon: Check,    color: "bg-green-50 text-green-600" },
          { label: "School Avg Score",  val: loading ? "…" : `${stats.avgScore}%`,   icon: TrendingUp, color: "bg-amber-50 text-amber-600" },
          { label: "Top Performer",     val: loading ? "…" : stats.topStudent,       icon: Trophy,   color: "bg-purple-50 text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-semibold">{s.label}</p>
              <p className="text-lg font-black text-foreground truncate">{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Class filter tabs */}
      {!loading && classes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {classes.map(cls => (
            <button key={cls} onClick={() => setClassFilter(cls)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                classFilter === cls
                  ? "bg-[#1e3a8a] text-white border-[#1e3a8a]"
                  : "bg-card text-muted-foreground border-border hover:border-[#1e3a8a] hover:text-[#1e3a8a]"
              }`}>
              {cls}
            </button>
          ))}
        </div>
      )}

      {/* Assignments table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">
            {classFilter === "All" ? "All Assignments" : `${classFilter} — Assignments`}
          </h2>
          <span className="text-xs text-muted-foreground font-semibold">{filtered.length} assignments</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-bold text-muted-foreground">No assignment marks yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Teachers enter marks via Teacher Dashboard → Assignments → Grade Assignment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {["Assignment", "Class", "Teacher", "Due Date", "Graded", "Avg Score", "Top Score", ""].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((g, i) => (
                  <tr key={g.homeworkId || i} className="hover:bg-muted/10 transition-colors">
                    {/* Assignment name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#1e3a8a]/10 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-[#1e3a8a]" />
                        </div>
                        <p className="text-sm font-bold text-foreground">{g.title}</p>
                      </div>
                    </td>
                    {/* Class */}
                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-foreground">{g.className}</span>
                    </td>
                    {/* Teacher */}
                    <td className="px-5 py-4 text-sm text-muted-foreground">{g.teacherName}</td>
                    {/* Due date */}
                    <td className="px-5 py-4">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {fmtDate(g.dueDate)}
                      </span>
                    </td>
                    {/* Graded */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{g.gradedCount}</span>
                        <span className="text-xs text-muted-foreground">/ {g.results.length}</span>
                        {g.gradedCount === g.results.length && g.gradedCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-green-600" />
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Avg score */}
                    <td className="px-5 py-4">
                      <span className={`text-sm font-bold ${g.avgScore >= 70 ? "text-green-600" : g.avgScore >= 50 ? "text-amber-500" : "text-red-500"}`}>
                        {g.gradedCount > 0 ? `${g.avgScore}%` : "—"}
                      </span>
                    </td>
                    {/* Top score */}
                    <td className="px-5 py-4">
                      {g.gradedCount > 0 ? (
                        <div>
                          <p className="text-sm font-bold text-green-600">{g.topScore}%</p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[100px]">{g.topStudent}</p>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    {/* View button */}
                    <td className="px-5 py-4">
                      <button onClick={() => setSelectedGroup(g)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a8a] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a8a]/90 transition-colors whitespace-nowrap">
                        View Marks <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
