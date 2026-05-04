import React, { useState, useEffect, useRef } from "react";
import {
  Calculator, Beaker, BookText, Globe2, AlertTriangle,
  ArrowRight, FileText, GraduationCap, CalendarCheck,
  Loader2, Send, TrendingUp, TrendingDown, X, Users,
} from "lucide-react";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import SubjectAnalysis from "@/components/SubjectAnalysis";
import AcademicsMobile from "@/components/dashboard/AcademicsMobile";
import AcademicAnalytics from "@/components/AcademicAnalytics";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { pctOfDoc, ymdLocal } from "@/lib/scoreUtils";

// ─── helpers ─────────────────────────────────────────────────────────────────
// Wraps shared `pctOfDoc` (handles all 4 score schemas: percentage, score+max,
// marks+totalMarks, marksObtained+maxMarks). Returns null for missing data —
// NEVER 0, which previously dragged subject averages down and misclassified
// brand-new subjects as "Weak" red (memory: bug_pattern_score_zero_no_data).
const getScore = (r: any): number | null => pctOfDoc(r);

const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return ymdLocal(d.toDate());
  if (d instanceof Date) return ymdLocal(d);
  return "";
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

// ═══════════════════════════════════════════════════════════════════════════
// AcademicsDesktop — Blue Apple Design
// ═══════════════════════════════════════════════════════════════════════════
const AcademicsDesktop = ({
  loading, subjects, gradeDistData, curriculumData, weakItems,
  onSelectSubject, onOpenSchedule, onGenerateReport,
}: {
  loading: boolean;
  subjects: any[];
  gradeDistData: any[];
  curriculumData: any[];
  weakItems: any[];
  onSelectSubject: (s: any) => void;
  onOpenSchedule: () => void;
  onGenerateReport: () => void;
}) => {
  const B1 = "#0055FF", B2 = "#1166FF", B4 = "#4499FF";
  const BG = "#EEF4FF", BG2 = "#E0ECFF";
  const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
  const SEP = "rgba(0,85,255,0.08)";
  const GREEN = "#00C853", GREEN_D = "#007830", GREEN_S = "rgba(0,200,83,0.10)", GREEN_B = "rgba(0,200,83,0.22)";
  const RED = "#FF3355", RED_S = "rgba(255,51,85,0.10)", RED_B = "rgba(255,51,85,0.22)";
  const ORANGE = "#FF8800";
  const GOLD = "#FFAA00";
  const VIOLET = "#7B3FF4";
  const SH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";
  const SH_BTN = "0 6px 22px rgba(0,85,255,0.38), 0 2px 5px rgba(0,85,255,0.18)";

  const subjectGrad = (name: string) => {
    const n = (name || "").toLowerCase();
    if (n.includes("math")) return `linear-gradient(135deg, ${RED}, #FF6688)`;
    if (n.includes("sci") || n.includes("bio") || n.includes("chem") || n.includes("phy")) return `linear-gradient(135deg, ${VIOLET}, #A07CF8)`;
    if (n.includes("eng") || n.includes("lang") || n.includes("lit")) return `linear-gradient(135deg, ${GOLD}, #FFDD44)`;
    if (n.includes("social") || n.includes("sst") || n.includes("hist") || n.includes("geo")) return `linear-gradient(135deg, ${GREEN}, #22EE66)`;
    return `linear-gradient(135deg, ${B1}, ${B2})`;
  };

  const statusTheme = (status: string) => {
    if (status === "Good")    return { color: GREEN_D, bg: GREEN_S, border: GREEN_B };
    if (status === "Average") return { color: "#884400", bg: "rgba(255,170,0,0.10)", border: "rgba(255,170,0,0.22)" };
    return                        { color: RED, bg: RED_S, border: RED_B };
  };

  const scoreColor = (avg: number) => avg >= 75 ? GREEN_D : avg >= 60 ? ORANGE : RED;

  const totalSubjects = subjects.length;
  const weakCount = subjects.filter(s => s.status === "Weak").length;
  const goodCount = subjects.filter(s => s.status === "Good").length;
  const avgCount  = subjects.filter(s => s.status === "Average").length;
  // Average and top-performer must EXCLUDE no-data subjects (avgNum is 0
  // for those due to the number-only sort key, but they have
  // `hasScoreData: false`). Without this filter, brand-new subjects with
  // no exams drag the school average toward 0 and become "Top Performer
  // — 0%" (memory: bug_pattern_score_zero_no_data).
  const scoredSubjects = subjects.filter(s => s.hasScoreData);
  const overallAvg = scoredSubjects.length > 0
    ? Math.round(scoredSubjects.reduce((s, x) => s + x.avgNum, 0) / scoredSubjects.length)
    : null;
  const topSubject = scoredSubjects.length > 0
    ? [...scoredSubjects].sort((a, b) => b.avgNum - a.avgNum)[0]
    : null;

  return (
    <div className="pb-10 w-full px-2"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
            <GraduationCap className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-bold leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>Academic Performence</div>
            <div className="text-[12px] mt-1" style={{ color: T3 }}>Subject-wise performance across all classes</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onGenerateReport}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH }}>
            <FileText className="w-[14px] h-[14px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
            Generate Report
          </button>
          <button onClick={onOpenSchedule}
            className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <CalendarCheck className="w-[14px] h-[14px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Schedule Remedial</span>
          </button>
        </div>
      </div>

      {/* Dark Hero */}
      <div className="rounded-[22px] px-7 py-6 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <TrendingUp className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>School Average Score</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[48px] font-bold leading-none tracking-tight">{loading || overallAvg === null ? "—" : `${overallAvg}%`}</span>
                <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>
                  {overallAvg === null
                    ? `${totalSubjects} subject${totalSubjects === 1 ? "" : "s"} tracked, no exams yet`
                    : `across ${scoredSubjects.length} subject${scoredSubjects.length === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            {[
              { label: "Good",    val: goodCount, color: "#66EE88" },
              { label: "Average", val: avgCount,  color: "#FFDD44" },
              { label: "Weak",    val: weakCount, color: "#FF88AA" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="w-[10px] h-[10px] rounded-full" style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}33` }} />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>{s.label}</div>
                  <div className="text-[22px] font-bold leading-none" style={{ letterSpacing: "-0.5px" }}>{s.val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4 summary stat cards */}
      {/* 4 stat cards — valColor mutes to slate when value is "—" /  0 so
          empty stats don't visually look like real data with full color. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        {[
          { title: "Total Subjects", val: totalSubjects,                                     valColor: totalSubjects > 0 ? B1 : T4,        sub: totalSubjects > 0 ? "Being tracked" : "None tracked yet",       Icon: BookText,      grad: `linear-gradient(135deg, ${B1}, ${B2})`,    glow: "rgba(0,85,255,0.10)",  shadow: "0 4px 14px rgba(0,85,255,0.26)" },
          { title: "Top Performer",  val: topSubject ? `${topSubject.avgNum}%` : "—",        valColor: topSubject ? GREEN_D : T4,          sub: topSubject ? topSubject.name : "No exam data yet",              Icon: TrendingUp,    grad: `linear-gradient(135deg, ${GREEN}, #22EE66)`, glow: "rgba(0,200,83,0.10)", shadow: "0 4px 14px rgba(0,200,83,0.22)" },
          { title: "Weak Subjects",  val: weakCount,                                         valColor: weakCount > 0 ? RED : T4,           sub: weakCount > 0 ? "Needs remedial" : "All clear",                 Icon: AlertTriangle, grad: `linear-gradient(135deg, ${RED}, #FF6688)`,   glow: "rgba(255,51,85,0.12)", shadow: "0 4px 14px rgba(255,51,85,0.26)" },
          { title: "Classes Flagged", val: weakItems.length,                                 valColor: weakItems.length > 0 ? GOLD : T4,   sub: weakItems.length > 0 ? "Class sections" : "None flagged",       Icon: Users,         grad: `linear-gradient(135deg, ${GOLD}, #FFDD44)`,  glow: "rgba(255,170,0,0.12)", shadow: "0 4px 14px rgba(255,170,0,0.26)" },
        ].map(({ title, val, valColor, sub, Icon, grad, glow, shadow }) => (
          <div key={title} className="bg-white rounded-[20px] p-5 relative overflow-hidden"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="absolute -top-6 -right-6 w-[100px] h-[100px] rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }} />
            <div className="flex items-center justify-between mb-4 relative">
              <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>{title}</span>
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: grad, boxShadow: shadow }}>
                <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
            </div>
            <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: valColor, letterSpacing: "-1.2px" }}>{val}</p>
            <p className="text-[11px] font-semibold truncate" style={{ color: T3 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Section Label */}
      <div className="flex items-center gap-3 mt-6 mb-3">
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.26)" }}>
          <BookText className="w-4 h-4 text-white" strokeWidth={2.4} />
        </div>
        <div className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Subject Performance</div>
        <span className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
          {subjects.length} subject{subjects.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Subject Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-[20px] p-5 animate-pulse" style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
              <div className="w-10 h-10 rounded-[12px] mb-4" style={{ background: BG2 }} />
              <div className="h-3 rounded w-24 mb-3" style={{ background: BG2 }} />
              <div className="h-8 rounded w-20 mb-2" style={{ background: BG2 }} />
              <div className="h-2 rounded w-32" style={{ background: BG2 }} />
            </div>
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="bg-white rounded-[20px] py-20 flex flex-col items-center gap-3 text-center" style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
            style={{ background: BG, border: `0.5px solid ${SEP}` }}>
            <GraduationCap className="w-8 h-8" style={{ color: T4 }} strokeWidth={2} />
          </div>
          <p className="text-[14px] font-bold" style={{ color: T1 }}>No exam scores recorded yet</p>
          <p className="text-[11px] max-w-[280px]" style={{ color: T4 }}>Subject performance will appear once teachers record results</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {subjects.map(s => {
            const theme = statusTheme(s.status);
            const grad = subjectGrad(s.name);
            return (
              <button key={s.id}
                onClick={() => onSelectSubject(s)}
                className="bg-white rounded-[20px] p-5 relative overflow-hidden group text-left transition-transform hover:scale-[1.03]"
                style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
                <div className="absolute -top-6 -right-6 w-[100px] h-[100px] rounded-full pointer-events-none opacity-60"
                  style={{ background: `radial-gradient(circle, ${theme.bg} 0%, transparent 70%)` }} />
                <div className="flex items-center justify-between mb-4 relative">
                  <div className="w-11 h-11 rounded-[13px] flex items-center justify-center"
                    style={{ background: grad, boxShadow: "0 4px 14px rgba(0,85,255,0.22)" }}>
                    <s.icon className="w-5 h-5 text-white" strokeWidth={2.3} />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.08em] px-[10px] py-[4px] rounded-full"
                    style={{ background: theme.bg, color: theme.color, border: `0.5px solid ${theme.border}` }}>
                    {s.status}
                  </span>
                </div>
                <h3 className="text-[14px] font-bold mb-1 truncate" style={{ color: T1, letterSpacing: "-0.1px" }}>{s.name}</h3>
                <div className="text-[30px] font-bold leading-none mb-3" style={{ color: scoreColor(s.avgNum), letterSpacing: "-1px" }}>{s.avg}</div>
                <div className="h-1.5 rounded-[2px] overflow-hidden mb-3" style={{ background: BG2 }}>
                  <div className="h-full rounded-[2px]" style={{ width: `${s.avgNum}%`, background: grad }} />
                </div>
                <div className="flex items-center justify-between pt-3" style={{ borderTop: `0.5px solid ${SEP}` }}>
                  <span className="text-[10px] font-bold" style={{ color: T3 }}>
                    {s.weakSections > 0 ? `${s.weakSections} weak section${s.weakSections === 1 ? "" : "s"}` : "All sections good"}
                  </span>
                  <ArrowRight className="w-[14px] h-[14px] transition-transform group-hover:translate-x-1" style={{ color: B1 }} strokeWidth={2.4} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Analytics row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">

        {/* Grade Distribution */}
        <div className="bg-white rounded-[20px] overflow-hidden"
          style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="flex items-center gap-[10px] px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(123,63,244,0.10)", border: "0.5px solid rgba(123,63,244,0.22)" }}>
              <FileText className="w-4 h-4" style={{ color: VIOLET }} strokeWidth={2.4} />
            </div>
            <h2 className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Grade Distribution</h2>
          </div>
          <div className="p-6">
            {gradeDistData.reduce((s, g) => s + g.value, 0) === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-[13px] font-bold" style={{ color: T4 }}>No data yet</p>
              </div>
            ) : (() => {
              const gradeColors = [GREEN, B1, GOLD, RED];
              const gradeKeys = ["a", "b", "c", "d"];
              const chartData = gradeDistData.map((g, i) => ({
                grade: gradeKeys[i] ?? `g${i}`,
                name: g.name,
                value: g.value,
                fill: `var(--color-${gradeKeys[i] ?? `g${i}`})`,
              }));
              const chartConfig: ChartConfig = {
                value: { label: "Students" },
                a: { label: gradeDistData[0]?.name ?? "A", color: GREEN },
                b: { label: gradeDistData[1]?.name ?? "B", color: B1 },
                c: { label: gradeDistData[2]?.name ?? "C", color: GOLD },
                d: { label: gradeDistData[3]?.name ?? "D", color: RED },
              };
              return (
                <>
                  <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-square max-h-[260px] px-0"
                  >
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="value" hideLabel />} />
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="grade"
                        animationDuration={1000}
                        labelLine={false}
                        label={({ payload, ...props }: any) => {
                          if (!payload?.value) return null;
                          return (
                            <text
                              cx={props.cx}
                              cy={props.cy}
                              x={props.x}
                              y={props.y}
                              textAnchor={props.textAnchor}
                              dominantBaseline={props.dominantBaseline}
                              fill="#ffffff"
                              style={{ fontSize: 14, fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}
                            >
                              {payload.value}
                            </text>
                          );
                        }}
                      />
                    </PieChart>
                  </ChartContainer>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {gradeDistData.map((g, i) => {
                      const c = gradeColors[i];
                      return (
                        <div key={g.name} className="flex items-center gap-2 px-3 py-2 rounded-[12px]"
                          style={{ background: BG, border: `0.5px solid ${SEP}` }}>
                          <span className="w-3 h-3 rounded-[4px]" style={{ background: c }} />
                          <span className="text-[11px] font-bold flex-1 truncate" style={{ color: T2 }}>{g.name}</span>
                          <span className="text-[13px] font-bold" style={{ color: c }}>{g.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Assessment Coverage — % of cohort assessed in each subject */}
        <div className="bg-white rounded-[20px] overflow-hidden"
          style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="flex items-center gap-[10px] px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: GREEN_S, border: `0.5px solid ${GREEN_B}` }}>
              <TrendingUp className="w-4 h-4" style={{ color: GREEN }} strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Assessment Coverage</h2>
              <p className="text-[10px] mt-0.5" style={{ color: T4 }}>% of students tested per subject (relative to most-tested)</p>
            </div>
          </div>
          <div className="p-6">
            {curriculumData.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-[13px] font-bold" style={{ color: T4 }}>No data yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {curriculumData.map(c => {
                  const grad = c.progress >= 75 ? `linear-gradient(90deg, ${GREEN}, #66EE88)` :
                               c.progress >= 55 ? `linear-gradient(90deg, ${B1}, ${B2})` :
                                                   `linear-gradient(90deg, ${GOLD}, #FFDD44)`;
                  const color = c.progress >= 75 ? GREEN_D : c.progress >= 55 ? B1 : "#884400";
                  return (
                    <div key={c.subject}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[13px] font-bold" style={{ color: T1 }}>{c.subject}</span>
                        <span className="text-[13px] font-bold" style={{ color }}>
                          {/* Honest count + percentage — was just %, which made
                              the fabricated number look more legitimate. */}
                          {c.studentsAssessed}/{c.maxStudents} ({c.progress}%)
                        </span>
                      </div>
                      <div className="h-2.5 rounded-[3px] overflow-hidden" style={{ background: BG2 }}>
                        <div className="h-full rounded-[3px] transition-all duration-700" style={{ width: `${c.progress}%`, background: grad }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Weak Subjects Section */}
      {weakItems.length > 0 && (
        <div className="mt-5 rounded-[22px] overflow-hidden relative"
          style={{
            background: "linear-gradient(145deg, rgba(255,51,85,0.04) 0%, rgba(255,255,255,0.6) 100%)",
            boxShadow: SH_LG,
            border: `0.5px solid ${RED_B}`,
          }}>
          <div className="flex items-center gap-[10px] px-6 py-[18px] bg-white" style={{ borderBottom: `0.5px solid ${SEP}` }}>
            <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${RED}, #FF6688)`, boxShadow: "0 4px 14px rgba(255,51,85,0.26)" }}>
              <AlertTriangle className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            <h2 className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Weak Subjects Requiring Attention</h2>
            <span className="text-[11px] font-bold px-3 py-1 rounded-full"
              style={{ background: RED_S, color: RED, border: `0.5px solid ${RED_B}` }}>
              {weakItems.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-6">
            {weakItems.map((w, i) => (
              <div key={i} className="bg-white rounded-[16px] p-4 flex items-center justify-between"
                style={{ border: `0.5px solid ${RED_B}`, boxShadow: SH }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold" style={{ color: T1 }}>{w.subject}</p>
                  <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: T3 }}>
                    <Users className="w-[11px] h-[11px]" strokeWidth={2.3} />
                    {w.className} · {w.studentCount} students
                  </p>
                </div>
                <div className="text-right ml-3">
                  <div className="text-[22px] font-bold leading-none" style={{ color: RED, letterSpacing: "-0.5px" }}>{w.avg}%</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.08em] mt-1" style={{ color: T4 }}>Avg</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Intelligence Card */}
      {!loading && subjects.length > 0 && (
        <div className="mt-5 rounded-[22px] px-7 py-6 relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-2 mb-3 relative z-10">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Academic Intelligence</span>
          </div>
          <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
            {overallAvg !== null ? (
              <>School is averaging <strong style={{ color: "#fff", fontWeight: 700 }}>{overallAvg}%</strong> across <strong style={{ color: "#fff", fontWeight: 700 }}>{scoredSubjects.length} subject{scoredSubjects.length === 1 ? "" : "s"}</strong>.</>
            ) : (
              <>No exam data recorded yet across <strong style={{ color: "#fff", fontWeight: 700 }}>{totalSubjects} tracked subject{totalSubjects === 1 ? "" : "s"}</strong>.</>
            )}
            {topSubject && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{topSubject.name}</strong> leads with <strong style={{ color: "#fff", fontWeight: 700 }}>{topSubject.avg}</strong>.</>}
            {weakCount > 0 && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{weakCount}</strong> subject{weakCount === 1 ? " needs" : "s need"} remedial action across <strong style={{ color: "#fff", fontWeight: 700 }}>{weakItems.length} class section{weakItems.length === 1 ? "" : "s"}</strong>.</>}
            {overallAvg !== null && weakCount > 0 && " Schedule focused revision to lift underperforming cohorts before next assessment."}
          </p>
          <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
            <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: B4 }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated · Real-time data</span>
          </div>
        </div>
      )}

    </div>
  );
};

// ─── component ───────────────────────────────────────────────────────────────
const Academics = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

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
  // P0 listener hygiene + multi-source merge:
  //  - schoolId-only server-side; branchId filtered in compute() via inBranch
  //    (memory: branchid_inference_lag — server-side branchId would silently
  //    drop fresh writes during the trigger's 1-2s backfill window).
  //  - 3 score collections live-merged (results + test_scores + gradebook_scores).
  //    Reading only `results` previously hid ~40% of score data for bulk-upload
  //    schools (memory: Owner Dashboard alternate data sources).
  //  - Real error handlers replace the prior silent `.then()` / no-error
  //    `onSnapshot` so denials surface in console.
  const resultsRef    = useRef<any[]>([]);
  const testScoresRef = useRef<any[]>([]);
  const gradebookRef  = useRef<any[]>([]);

  useEffect(() => {
    if (!schoolId) return;

    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    // Step 1: build teacher → subject map (one-time)
    getDocs(query(collection(db, "teachers"), where("schoolId", "==", schoolId)))
      .then((snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const t = d.data();
          if (!inBranch(t)) return;
          // Only store an actual subject — don't fabricate "General" here
          // (the override is handled in computeMetrics where it's safer).
          const sub = t.subject || t.subjectName;
          if (sub) map[d.id] = String(sub);
        });
        teacherMapRef.current = map;
        // Re-compute once teacher map arrives so subject grouping uses it.
        computeMetrics(resultsRef.current.concat(testScoresRef.current, gradebookRef.current));
      })
      .catch((err) => {
        console.warn("[Academics] teacher map fetch failed:", err);
      });

    // Step 2: live-listen to all 3 score collections; recompute when any
    // of them updates. Branch filter applied in compute().
    const recompute = () => {
      computeMetrics([
        ...resultsRef.current.filter(inBranch),
        ...testScoresRef.current.filter(inBranch),
        ...gradebookRef.current.filter(inBranch),
      ]);
    };

    const u1 = onSnapshot(
      query(collection(db, "results"), where("schoolId", "==", schoolId)),
      (snap) => { resultsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); recompute(); },
      (err) => console.warn("[Academics] results listener failed:", err),
    );
    const u2 = onSnapshot(
      query(collection(db, "test_scores"), where("schoolId", "==", schoolId)),
      (snap) => { testScoresRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); recompute(); },
      (err) => console.warn("[Academics] test_scores listener failed:", err),
    );
    const u3 = onSnapshot(
      query(collection(db, "gradebook_scores"), where("schoolId", "==", schoolId)),
      (snap) => { gradebookRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); recompute(); },
      (err) => console.warn("[Academics] gradebook_scores listener failed:", err),
    );

    // Safety timer — if all listeners are denied or empty, unblock the
    // spinner so the user sees the empty state rather than a perpetual loader.
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    return () => {
      clearTimeout(safetyTimer);
      u1(); u2(); u3();
    };
  }, [schoolId, branchId]);

  const computeMetrics = (results: any[]) => {
    const map = teacherMapRef.current;

    // Cross-collection dedup: an exam written to BOTH `results` AND
    // `test_scores` (some schools mirror via migrations) must not double-
    // count. Fingerprint = student|subject|date|pct.
    const fpSeen = new Set<string>();
    const dedupedResults: any[] = [];
    results.forEach((r) => {
      const pct = getScore(r);
      if (pct === null) return; // skip docs with no usable score
      const subjKey = String(r.subject ?? r.subjectName ?? map[r.teacherId] ?? "").toLowerCase();
      const dateK = toDateStr(r.timestamp ?? r.createdAt ?? r.date);
      const studentKey = String(r.studentId || r.studentEmail || "").toLowerCase();
      const fp = `${studentKey}|${subjKey}|${dateK}|${Math.round(pct * 10)}`;
      if (fpSeen.has(fp)) return;
      fpSeen.add(fp);
      dedupedResults.push({ ...r, _pct: pct });
    });

    // ── group by subject ────────────────────────────────────────────────────
    // P0 B4 fix: subject is taken from the RESULT doc itself first
    // (`r.subject`/`r.subjectName`). Teacher's own subject is only a
    // FALLBACK, not an override. Previously, if a Math teacher recorded a
    // Science exam, it was wrongly grouped under "Math".
    const groups: Record<string, {
      scores: number[];
      studentSet: Set<string>;
      teacherIds: Set<string>;
      classBuckets: Record<string, { scores: number[]; studentSet: Set<string>; className: string }>;
    }> = {};

    dedupedResults.forEach((r) => {
      const subject = (r.subject || r.subjectName || map[r.teacherId] || "Unspecified").toString();
      const score   = r._pct as number;
      const sid     = r.studentId  || (r.studentEmail || "").toLowerCase() || "";
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
    // avgNum is null when the subject has no usable score docs — never
    // defaulted to 0 (which used to cascade into "Weak" status, "0%" UI,
    // and inflated weakCount).
    const computed = Object.entries(groups).map(([name, data]) => {
      const avgNum = data.scores.length
        ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : null;
      const status = avgNum === null ? "No Data" : getSubjectStatus(avgNum).status;
      const statusStyle = avgNum === null
        ? "bg-slate-50 text-slate-500 border-slate-100"
        : getSubjectStatus(avgNum).statusStyle;
      const config = getSubjectConfig(name);
      // weakSections only counts class buckets that HAVE data AND avg < 60.
      const weakSections = Object.values(data.classBuckets).filter((cb) => {
        if (cb.scores.length === 0) return false;
        const avg = cb.scores.reduce((a, b) => a + b, 0) / cb.scores.length;
        return avg < 60;
      }).length;
      return {
        id: name, name,
        avg: avgNum !== null ? `${avgNum}%` : "—",
        // Keep avgNum as a number for sort stability — surface null state
        // via the separate `hasScoreData` flag for UI consumers.
        avgNum: avgNum ?? 0,
        hasScoreData:  avgNum !== null,
        status, statusStyle, weakSections,
        teacherIds:    Array.from(data.teacherIds),
        totalStudents: data.studentSet.size,
        classBuckets:  data.classBuckets,
        ...config,
      };
    }).sort((a, b) => {
      // No-data subjects sort to the bottom so the principal sees
      // real-data weakest-first (the original sort intent).
      if (!a.hasScoreData && b.hasScoreData) return 1;
      if (a.hasScoreData && !b.hasScoreData) return -1;
      return a.avgNum - b.avgNum;
    });

    setSubjects(computed);

    // ── grade distribution ──────────────────────────────────────────────────
    // Only buckets REAL scores (already null-filtered in dedup step). No
    // more fabricated "D <40%" inflation from missing-data 0s.
    const allScores: number[] = dedupedResults.map((r) => r._pct);
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

    // ── assessment coverage (real data) ────────────────────────────────────
    // Was: a fabricated formula `(totalStudents/maxStudents)*80 + avgNum*0.2`
    // that mixed two unrelated signals into a "progress" number that meant
    // nothing (memory: bug_pattern_fabricated_fallback).
    // Now: honest "% of students assessed in this subject relative to the
    // most-assessed subject". Tells the principal "Math has been tested
    // across 80% of the cohort, English only 30%" — real curriculum reach.
    const subjectsWithStudents = computed.filter((s) => s.totalStudents > 0);
    const maxStudents = subjectsWithStudents.length > 0
      ? Math.max(...subjectsWithStudents.map((s) => s.totalStudents))
      : 0;
    const currData = subjectsWithStudents
      .slice(0, 6)
      .map((s) => ({
        subject: s.name,
        progress: maxStudents > 0 ? Math.round((s.totalStudents / maxStudents) * 100) : 0,
        studentsAssessed: s.totalStudents,
        maxStudents,
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
    if (!schoolId) {
      toast.error("School context missing — please re-login.");
      return;
    }
    setIsSending(true);
    try {
      await addDoc(collection(db, "meetings"), {
        title:       `Remedial: ${remedialForm.subject} - ${remedialForm.grade}`,
        participant: `${remedialForm.teacher} & Affected Students`,
        date:        remedialForm.date,
        time:        remedialForm.time,
        type:        "Remedial Class",
        schoolId,
        // null instead of "" — empty strings interfere with `where("branchId", "!=", null)`
        // queries elsewhere (consistency with other writers in this codebase).
        branchId:    branchId || null,
        createdAt:   serverTimestamp(),
      });
      toast.success("Remedial session scheduled successfully!");
      setShowScheduleModal(false);
      setRemedialForm({ subject: "", grade: "", date: "", time: "", teacher: "" });
    } catch (err: any) {
      console.error("[Academics] schedule remedial failed:", err);
      toast.error("Failed: " + (err?.message || "Unknown error"));
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
    <div className={isMobile ? "animate-in fade-in duration-500" : "space-y-8 animate-in fade-in duration-500 pb-12"}>

      {isMobile ? (
        <AcademicsMobile
          loading={loading}
          subjects={subjects}
          gradeDistData={gradeDistData}
          curriculumData={curriculumData}
          weakItems={weakItems}
          onSelectSubject={s => setSelectedSubject(s)}
          onOpenScheduleModal={() => setShowScheduleModal(true)}
          onGenerateReport={() => {
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
        />
      ) : (
      <AcademicsDesktop
        loading={loading}
        subjects={subjects}
        gradeDistData={gradeDistData}
        curriculumData={curriculumData}
        weakItems={weakItems}
        onSelectSubject={(s: any) => setSelectedSubject(s)}
        onOpenSchedule={() => setShowScheduleModal(true)}
        onGenerateReport={() => {
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
      />
      )}

      {/* System-driven analytics card (was AI proxy, now deterministic — see ai/system/academic-analytics.ts) */}
      <AcademicAnalytics />

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
