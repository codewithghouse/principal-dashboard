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
    <div className="pb-10 w-full px-2 animate-in fade-in duration-300" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* Breadcrumb */}
      <div className="pt-2 pb-3 flex items-center gap-[6px]">
        <button onClick={onBack}
          className="flex items-center gap-1 text-[11px] font-bold transition-opacity active:opacity-60 hover:opacity-80"
          style={{ color: "#0055FF" }}>
          <ChevronLeft className="w-3 h-3" strokeWidth={2.5} />
          Assignments &amp; Marks
        </button>
        <span className="text-[11px]" style={{ color: "#99AACC" }}>/</span>
        <span className="text-[11px] font-bold truncate max-w-[280px] capitalize" style={{ color: "#002080" }}>{group.title}</span>
      </div>

      {/* Marks hero card */}
      <div className="rounded-[22px] bg-white p-6 relative overflow-hidden mb-4"
        style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
        <div className="absolute -top-6 -right-5 w-[130px] h-[130px] rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, rgba(0,85,255,0.06) 0%, transparent 70%)` }} />
        <div className="flex items-start justify-between gap-4 relative">
          <div className="min-w-0 flex-1">
            <div className="text-[24px] font-bold leading-tight tracking-[-0.5px] capitalize mb-[8px]" style={{ color: "#001040" }}>
              {group.title}
            </div>
            <div className="text-[12px] font-semibold flex items-center gap-[8px] flex-wrap" style={{ color: "#5070B0" }}>
              <span className="px-[10px] py-[3px] rounded-full text-[11px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)" }}>{group.className}</span>
              <span>Teacher: <strong style={{ color: "#002080", fontWeight: 700 }}>{group.teacherName}</strong></span>
              <span className="w-[3px] h-[3px] rounded-full" style={{ background: "#99AACC" }} />
              <span>Due: {fmtDate(group.dueDate)}</span>
            </div>
          </div>
          <button onClick={handleDownload}
            className="h-[42px] px-5 rounded-[12px] flex items-center gap-[7px] text-[12px] font-bold text-white uppercase tracking-[0.06em] transition-transform active:scale-95 hover:scale-[1.02] relative overflow-hidden flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)" }}>
            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Download className="w-[14px] h-[14px] relative z-10" strokeWidth={2.4} />
            <span className="relative z-10">Download Marks</span>
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-2 rounded-[4px] overflow-hidden mt-5" style={{ background: "#E0ECFF" }}>
          <div className="h-full rounded-[4px]"
            style={{ width: `${Math.max(0, Math.min(100, group.avgScore))}%`, background: `linear-gradient(90deg, #0055FF, #66BBFF)` }} />
        </div>
      </div>

      {/* Bright stat cards 4-wide */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Graded", val: group.gradedCount, sub: "Students", variant: "green", Icon: Check },
          { label: "Avg Score", val: `${group.avgScore}%`, sub: group.avgScore >= 70 ? "Strong" : group.avgScore >= 50 ? "Average" : "Needs work", variant: "blue", Icon: TrendingUp },
          { label: "Top Score", val: `${group.topScore}%`, sub: "Highest", variant: "gold", Icon: Trophy },
          { label: "Top Student", val: (group.topStudent || "—").split(" ").slice(0, 2).join(" "), sub: "Topper", variant: "violet", Icon: Users, isText: true },
        ].map((s, i) => {
          const styles: Record<string, { bg: string; bdr: string; lbl: string; val: string; icoColor: string }> = {
            blue:   { bg: "linear-gradient(140deg, #DDEAFF 0%, #A8C5FF 55%, #7AA5FF 100%)", bdr: "rgba(0,85,255,0.4)",   lbl: "#002080", val: "#001055", icoColor: "#001055" },
            violet: { bg: "linear-gradient(140deg, #EEE0FF 0%, #C9A8FF 55%, #A880FF 100%)", bdr: "rgba(123,63,244,0.4)", lbl: "#3A1580", val: "#280C5C", icoColor: "#3A1580" },
            green:  { bg: "linear-gradient(140deg, #DEFCE8 0%, #8CF0B0 55%, #50E088 100%)", bdr: "rgba(0,200,83,0.4)",   lbl: "#005A20", val: "#004018", icoColor: "#005A20" },
            gold:   { bg: "linear-gradient(140deg, #FFF6D1 0%, #FFE488 55%, #FFCC33 100%)", bdr: "rgba(255,170,0,0.4)",  lbl: "#664400", val: "#472A00", icoColor: "#664400" },
          };
          const st = styles[s.variant];
          const Icon = s.Icon;
          return (
            <div key={i} className="rounded-[20px] p-5 relative overflow-hidden"
              style={{ background: st.bg, border: `0.5px solid ${st.bdr}`, boxShadow: "0 10px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>
              <div className="absolute -top-6 -right-5 w-[90px] h-[90px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)" }} />
              <div className="absolute top-4 right-4 w-[32px] h-[32px] rounded-[11px] flex items-center justify-center z-[1]"
                style={{ background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(255,255,255,0.95)", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <Icon className="w-[15px] h-[15px]" style={{ color: st.icoColor }} strokeWidth={2.5} />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.09em] mb-[10px] relative z-[1]" style={{ color: st.lbl }}>{s.label}</div>
              {s.isText ? (
                <div className="text-[18px] font-bold leading-tight tracking-[-0.3px] mb-[5px] relative z-[1] truncate" style={{ color: st.val }}>{s.val}</div>
              ) : (
                <div className="text-[34px] font-bold leading-none tracking-[-1px] mb-[5px] relative z-[1]" style={{ color: st.val }}>{s.val}</div>
              )}
              <div className="text-[11px] font-semibold relative z-[1]" style={{ color: st.lbl }}>{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Section label */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
        Student-wise Marks
        <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
          {sorted.length} {sorted.length === 1 ? "student" : "students"}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* Student marks table */}
      <div className="rounded-[22px] bg-white overflow-hidden"
        style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr style={{ background: "rgba(0,85,255,0.04)", borderBottom: "0.5px solid rgba(0,85,255,0.07)" }}>
                {["#", "Student", "Score", "Grade", "AI Feedback"].map(h => (
                  <th key={h} className="px-5 py-[14px] text-left text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "#99AACC" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i, arr) => {
                const score  = r.score !== null && r.score !== undefined ? parseFloat(r.score) : null;
                const graded = score !== null && !isNaN(score);
                const lg     = graded ? scoreLetter(score!) : null;
                const scoreColor = !graded ? "#99AACC" : score! >= 80 ? "#00C853" : score! >= 60 ? "#0055FF" : score! >= 40 ? "#FF8800" : "#FF3355";
                const gStyle = !lg ? null
                  : lg.letter === "A" ? { bg: "rgba(0,200,83,0.10)", c: "#007830", bdr: "rgba(0,200,83,0.22)", fill: "linear-gradient(90deg, #00C853, #66EE88)" }
                  : lg.letter === "B" ? { bg: "rgba(0,85,255,0.10)", c: "#0055FF", bdr: "rgba(0,85,255,0.22)", fill: "linear-gradient(90deg, #0055FF, #4499FF)" }
                  : lg.letter === "C" ? { bg: "rgba(255,136,0,0.10)", c: "#884400", bdr: "rgba(255,136,0,0.22)", fill: "linear-gradient(90deg, #FF8800, #FFCC22)" }
                  : { bg: "rgba(255,51,85,0.10)", c: "#FF3355", bdr: "rgba(255,51,85,0.22)", fill: "linear-gradient(90deg, #FF3355, #FF88AA)" };
                const name = r.studentName || "—";
                return (
                  <tr key={r.studentId || i} className="transition-colors hover:bg-[#F5F9FF]"
                    style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(0,85,255,0.05)" } : {}}>
                    <td className="px-5 py-[14px] text-[11px] font-bold" style={{ color: "#99AACC" }}>{i + 1}</td>
                    <td className="px-5 py-[14px]">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #0044EE, #2277FF)", boxShadow: "0 3px 10px rgba(0,85,255,0.24)" }}>
                          {name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-bold tracking-[-0.2px]" style={{ color: "#001040" }}>{name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-[14px]">
                      {graded ? (
                        <div className="flex items-center gap-3">
                          <span className="text-[15px] font-bold tracking-[-0.3px]" style={{ color: scoreColor }}>{score}/100</span>
                          <div className="h-1 w-[80px] rounded-[2px] overflow-hidden" style={{ background: "#E0ECFF" }}>
                            <div className="h-full rounded-[2px]" style={{ width: `${Math.max(0, Math.min(100, score!))}%`, background: gStyle!.fill }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold" style={{ color: "#99AACC" }}>Not graded</span>
                      )}
                    </td>
                    <td className="px-5 py-[14px]">
                      {lg && gStyle ? (
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-[11px] text-[13px] font-bold"
                          style={{ background: gStyle.bg, color: gStyle.c, border: `0.5px solid ${gStyle.bdr}` }}>
                          {lg.letter}
                        </span>
                      ) : <span style={{ color: "#99AACC" }}>—</span>}
                    </td>
                    <td className="px-5 py-[14px] max-w-md">
                      {r.feedback ? (
                        <span className="text-[12px] leading-[1.55]" style={{ color: "#5070B0" }}>{r.feedback}</span>
                      ) : graded ? (
                        <div>
                          <p className="text-[12px] leading-[1.55]" style={{ color: "#5070B0" }}>
                            {aiFeedback(score!, r.studentName || "", group.title)}
                          </p>
                          <span className="inline-flex items-center gap-1 mt-[6px] px-[9px] py-[3px] rounded-full text-[10px] font-bold"
                            style={{ background: "rgba(123,63,244,0.10)", color: "#7B3FF4", border: "0.5px solid rgba(123,63,244,0.22)" }}>
                            <Sparkles className="w-[10px] h-[10px]" strokeWidth={2.3} /> AI
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#99AACC" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Back button */}
      <button onClick={onBack}
        className="mt-5 h-[42px] px-5 rounded-[12px] flex items-center gap-[7px] text-[12px] font-bold bg-white transition-transform active:scale-95 hover:scale-[1.02]"
        style={{ color: "#002080", border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09)" }}>
        <ChevronLeft className="w-[14px] h-[14px]" strokeWidth={2.4} />
        Back to Assignments
      </button>
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

  /* ── list view (desktop) ── */
  const dSchoolAvgTier = !stats.totalGraded ? { label: "No data", c: "#CCDDEE", bg: "rgba(153,170,204,.18)", bdr: "rgba(153,170,204,.32)" }
    : stats.avgScore >= 80 ? { label: "Excellent", c: "#66EE88", bg: "rgba(0,200,83,0.22)", bdr: "rgba(0,200,83,0.4)" }
    : stats.avgScore >= 60 ? { label: "Strong", c: "#66EE88", bg: "rgba(0,200,83,0.22)", bdr: "rgba(0,200,83,0.4)" }
    : stats.avgScore >= 45 ? { label: "Average", c: "#FFDD88", bg: "rgba(255,170,0,0.22)", bdr: "rgba(255,170,0,0.4)" }
    : { label: "Needs Work", c: "#FF99AA", bg: "rgba(255,51,85,0.22)", bdr: "rgba(255,51,85,0.4)" };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* Top toolbar */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.7px] flex items-center gap-[10px]" style={{ color: "#001040" }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
              <FileText className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Assignments &amp; Marks
          </div>
          <div className="text-[12px] font-normal mt-[6px] ml-[46px] flex items-center gap-[6px]" style={{ color: "#5070B0" }}>
            <span>Class-wise Marks</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Teacher Submissions</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>AI Feedback Engine</span>
          </div>
        </div>
      </div>

      {/* Dark hero banner */}
      <div className="rounded-[22px] px-6 py-5 relative overflow-hidden flex items-center justify-between gap-5 mb-4"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[12px] min-w-0 relative z-10">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
            <TrendingUp className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] mb-[5px]" style={{ color: "rgba(255,255,255,0.50)" }}>
              School Avg Score · {stats.totalGraded} Graded Submission{stats.totalGraded === 1 ? "" : "s"}
            </div>
            <div className="text-[34px] font-bold text-white leading-none tracking-[-1px]">
              {loading ? "—" : `${stats.avgScore}%`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          <div className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-full"
            style={{ background: dSchoolAvgTier.bg, border: `0.5px solid ${dSchoolAvgTier.bdr}` }}>
            <span className="text-[12px] font-bold" style={{ color: dSchoolAvgTier.c }}>{dSchoolAvgTier.label}</span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: stats.totalAssignments, label: "Assignments", color: "#fff" },
              { val: stats.totalGraded, label: "Graded", color: "#66EE88" },
              { val: stats.topStudent && stats.topStudent !== "—" ? stats.topStudent.split(" ")[0] : "—", label: "Topper", color: "#FFDD88" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[10px] px-[14px] text-center min-w-[80px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[17px] font-bold leading-none mb-[3px] truncate" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[8px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bright stat cards 4-wide */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: "Total Assignments", val: loading ? "—" : stats.totalAssignments, sub: "This term", variant: "blue", Icon: BookOpen },
          { label: "Total Graded", val: loading ? "—" : stats.totalGraded, sub: stats.totalAssignments > 0 ? `Across ${stats.totalAssignments} assignment${stats.totalAssignments === 1 ? "" : "s"}` : "No data", variant: "green", Icon: Check },
          { label: "School Avg Score", val: loading ? "—" : stats.totalGraded > 0 ? `${stats.avgScore}%` : "—", sub: dSchoolAvgTier.label, variant: "gold", Icon: TrendingUp },
          { label: "Top Performer", val: loading ? "—" : stats.topStudent, sub: stats.topStudent && stats.topStudent !== "—" ? "Highest across submissions" : "No data", variant: "violet", Icon: Trophy, isText: true },
        ].map((s, i) => {
          const styles: Record<string, { bg: string; bdr: string; lbl: string; val: string; icoColor: string }> = {
            blue:   { bg: "linear-gradient(140deg, #DDEAFF 0%, #A8C5FF 55%, #7AA5FF 100%)", bdr: "rgba(0,85,255,0.4)",   lbl: "#002080", val: "#001055", icoColor: "#001055" },
            violet: { bg: "linear-gradient(140deg, #EEE0FF 0%, #C9A8FF 55%, #A880FF 100%)", bdr: "rgba(123,63,244,0.4)", lbl: "#3A1580", val: "#280C5C", icoColor: "#3A1580" },
            green:  { bg: "linear-gradient(140deg, #DEFCE8 0%, #8CF0B0 55%, #50E088 100%)", bdr: "rgba(0,200,83,0.4)",   lbl: "#005A20", val: "#004018", icoColor: "#005A20" },
            gold:   { bg: "linear-gradient(140deg, #FFF6D1 0%, #FFE488 55%, #FFCC33 100%)", bdr: "rgba(255,170,0,0.4)",  lbl: "#664400", val: "#472A00", icoColor: "#664400" },
          };
          const st = styles[s.variant];
          const Icon = s.Icon;
          return (
            <div key={i} className="rounded-[20px] p-5 relative overflow-hidden"
              style={{ background: st.bg, border: `0.5px solid ${st.bdr}`, boxShadow: "0 10px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>
              <div className="absolute -top-6 -right-5 w-[90px] h-[90px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)" }} />
              <div className="absolute top-4 right-4 w-[32px] h-[32px] rounded-[11px] flex items-center justify-center z-[1]"
                style={{ background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(255,255,255,0.95)", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <Icon className="w-[15px] h-[15px]" style={{ color: st.icoColor }} strokeWidth={2.5} />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.09em] mb-[10px] relative z-[1]" style={{ color: st.lbl }}>{s.label}</div>
              {s.isText ? (
                <div className="text-[18px] font-bold leading-tight tracking-[-0.3px] mb-[5px] relative z-[1] truncate" style={{ color: st.val }}>{s.val}</div>
              ) : (
                <div className="text-[34px] font-bold leading-none tracking-[-1px] mb-[5px] relative z-[1]" style={{ color: st.val }}>{s.val}</div>
              )}
              <div className="text-[11px] font-semibold relative z-[1] truncate" style={{ color: st.lbl }}>{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Class filter pills */}
      {!loading && classes.length > 1 && (
        <div className="flex gap-[7px] flex-wrap mb-5">
          {classes.map(cls => {
            const active = classFilter === cls;
            return (
              <button key={cls} onClick={() => setClassFilter(cls)}
                className="h-[36px] px-4 rounded-[12px] text-[12px] font-bold whitespace-nowrap transition-transform active:scale-95 hover:scale-[1.03] relative overflow-hidden"
                style={active
                  ? { background: "linear-gradient(135deg, #0055FF, #1166FF)", color: "#fff", boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)", letterSpacing: "0.04em" }
                  : { background: "#fff", color: "#5070B0", border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09)", letterSpacing: "0.04em" }}>
                {active && <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />}
                <span className="relative z-10">{cls}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Section label */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
        {classFilter === "All" ? "All Assignments" : `${classFilter} Assignments`}
        <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
          {filtered.length} {filtered.length === 1 ? "assignment" : "assignments"}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* Assignments table */}
      {loading ? (
        <div className="rounded-[22px] py-16 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <Loader2 className="w-9 h-9 animate-spin mx-auto mb-3" style={{ color: "#0055FF" }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#99AACC" }}>Loading assignments…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[22px] py-16 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-16 h-16 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
            <FileText className="w-7 h-7" style={{ color: "rgba(0,85,255,0.45)" }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-bold mb-1" style={{ color: "#001040" }}>No assignment marks yet</p>
          <p className="text-[12px] max-w-[440px] mx-auto leading-[1.55]" style={{ color: "#99AACC" }}>
            Teachers enter marks via Teacher Dashboard → Assignments → Grade Assignment.
          </p>
        </div>
      ) : (
        <div className="rounded-[22px] bg-white overflow-hidden"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr style={{ background: "rgba(0,85,255,0.04)", borderBottom: "0.5px solid rgba(0,85,255,0.07)" }}>
                  {["Assignment", "Class", "Teacher", "Due Date", "Graded", "Avg Score", "Top Score", ""].map(h => (
                    <th key={h} className="px-5 py-[14px] text-left text-[10px] font-bold uppercase tracking-[0.10em] whitespace-nowrap" style={{ color: "#99AACC" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, i, arr) => {
                  const allGraded = g.gradedCount === g.results.length && g.gradedCount > 0;
                  const avgColor = g.avgScore >= 70 ? "#00C853" : g.avgScore >= 50 ? "#FF8800" : "#FF3355";
                  return (
                    <tr key={g.homeworkId || i} className="transition-colors hover:bg-[#F5F9FF]"
                      style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(0,85,255,0.05)" } : {}}>
                      {/* Assignment name */}
                      <td className="px-5 py-[14px]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0"
                            style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 3px 10px rgba(0,85,255,0.28)" }}>
                            <FileText className="w-[16px] h-[16px] text-white" strokeWidth={2.3} />
                          </div>
                          <p className="text-[13px] font-bold tracking-[-0.2px] capitalize" style={{ color: "#001040" }}>{g.title}</p>
                        </div>
                      </td>
                      {/* Class */}
                      <td className="px-5 py-[14px]">
                        <span className="px-[10px] py-[3px] rounded-full text-[11px] font-bold text-white"
                          style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 2px 7px rgba(0,85,255,0.28)" }}>
                          {g.className}
                        </span>
                      </td>
                      {/* Teacher */}
                      <td className="px-5 py-[14px] text-[12px] font-semibold" style={{ color: "#5070B0" }}>{g.teacherName}</td>
                      {/* Due date */}
                      <td className="px-5 py-[14px]">
                        <span className="text-[11px] font-semibold flex items-center gap-[4px]" style={{ color: "#99AACC" }}>
                          <Clock className="w-3 h-3" strokeWidth={2.3} /> {fmtDate(g.dueDate)}
                        </span>
                      </td>
                      {/* Graded */}
                      <td className="px-5 py-[14px]">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold" style={{ color: "#001040" }}>{g.gradedCount}</span>
                          <span className="text-[11px] font-semibold" style={{ color: "#99AACC" }}>/ {g.results.length}</span>
                          {allGraded && (
                            <span className="flex items-center gap-[3px] px-[7px] py-[2px] rounded-full text-[10px] font-bold"
                              style={{ background: "rgba(0,200,83,0.10)", color: "#007830", border: "0.5px solid rgba(0,200,83,0.22)" }}>
                              <Check className="w-[10px] h-[10px]" strokeWidth={2.6} /> Complete
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Avg score */}
                      <td className="px-5 py-[14px]">
                        {g.gradedCount > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold" style={{ color: avgColor, letterSpacing: "-0.2px" }}>{g.avgScore}%</span>
                            <div className="h-1 w-[70px] rounded-[2px] overflow-hidden" style={{ background: "#E0ECFF" }}>
                              <div className="h-full rounded-[2px]"
                                style={{ width: `${Math.max(0, Math.min(100, g.avgScore))}%`, background: `linear-gradient(90deg, ${avgColor}, ${avgColor}AA)` }} />
                            </div>
                          </div>
                        ) : <span className="text-[11px]" style={{ color: "#99AACC" }}>—</span>}
                      </td>
                      {/* Top score */}
                      <td className="px-5 py-[14px]">
                        {g.gradedCount > 0 ? (
                          <div>
                            <p className="text-[14px] font-bold" style={{ color: "#00C853" }}>{g.topScore}%</p>
                            <p className="text-[11px] font-semibold truncate max-w-[120px]" style={{ color: "#99AACC" }}>{g.topStudent}</p>
                          </div>
                        ) : <span className="text-[11px]" style={{ color: "#99AACC" }}>—</span>}
                      </td>
                      {/* View button */}
                      <td className="px-5 py-[14px]">
                        <button onClick={() => setSelectedGroup(g)}
                          className="h-9 px-4 rounded-[11px] flex items-center gap-[5px] text-[11px] font-bold text-white transition-transform active:scale-95 hover:scale-[1.03] relative overflow-hidden whitespace-nowrap"
                          style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 3px 10px rgba(0,85,255,0.26)" }}>
                          <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                          <span className="relative z-10">View Marks</span>
                          <ChevronRight className="w-3 h-3 relative z-10" strokeWidth={2.5} />
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
    </div>
  );
}
