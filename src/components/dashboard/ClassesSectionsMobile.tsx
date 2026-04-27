import {
  Plus, Loader2, BookOpen, MoreHorizontal, Users as UsersIcon,
  ArrowRight, AlertCircle, CheckCircle, XCircle,
} from "lucide-react";

// ── Types (mirrors ClassesSections.tsx) ───────────────────────────────────────
export interface ClassRowMobile {
  id: string;
  name: string;
  grade: string;
  section: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  branchId: string;
  room?: string;
  status: string;
  studentCount: number;
  avgMarks: string;
  avgMarksNum: number;
  attendance: string;
  attendanceNum: number;
  healthScore: number;
  weakSubject: string;
}

export interface GradeSummaryMobile {
  grade: string;
  sections: number;
  students: number;
  avgAttendance: number;
  healthScore: number;
}

export interface ClassesSectionsMobileProps {
  loading: boolean;
  classes: ClassRowMobile[];
  gradesSummary: GradeSummaryMobile[];
  onAddClass: () => void;
  onChangeTeacher: (cls: ClassRowMobile) => void;
  onOpenStudents: (cls: ClassRowMobile) => void;
  onViewSection: (cls: ClassRowMobile) => void;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const B1 = "#0055FF", B2 = "#1166FF";
const BG = "#EEF4FF", BG2 = "#E0ECFF";
const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
const SEP = "rgba(0,85,255,0.07)";
const GREEN = "#00C853", RED = "#FF3355", ORANGE = "#FF8800", GOLD = "#FFAA00";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const SHADOW_SM = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)";
const SHADOW_LG = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)";
const SHADOW_BTN = "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)";

// Avatar gradient palette — deterministic by name hash
const AV_PALETTE = [
  "linear-gradient(135deg, #0044EE, #2277FF)",
  "linear-gradient(135deg, #002DBB, #0055FF)",
  "linear-gradient(135deg, #1A3090, #2277FF)",
  "linear-gradient(135deg, #0066FF, #4499FF)",
  "linear-gradient(135deg, #002080, #0044EE)",
  "linear-gradient(135deg, #00C853, #22EE66)",
];
const avGrad = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) & 0xff;
  return AV_PALETTE[h % AV_PALETTE.length];
};

const teacherInitials = (name?: string) => {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || "").join("").toUpperCase() || "—";
};

// Section status → visual theme
const themeForStatus = (status: string) => {
  if (status === "Good") return {
    stripe: `linear-gradient(180deg, ${GREEN}, #66EE88)`,
    chipGrad: `linear-gradient(135deg, ${GREEN}, #22EE66)`,
    chipShadow: "0 3px 10px rgba(0,200,83,0.28)",
    badgeBg: "rgba(0,200,83,0.10)", badgeBdr: "rgba(0,200,83,0.22)", badgeText: "#007830",
    label: "Healthy",
    Icon: CheckCircle,
  };
  if (status === "Weak") return {
    stripe: "linear-gradient(180deg, #FF3355, #FF6688)",
    chipGrad: "linear-gradient(135deg, #FF3355, #FF6688)",
    chipShadow: "0 3px 10px rgba(255,51,85,0.28)",
    badgeBg: "rgba(255,51,85,0.10)", badgeBdr: "rgba(255,51,85,0.22)", badgeText: RED,
    label: "Weak",
    Icon: XCircle,
  };
  return {
    stripe: "linear-gradient(180deg, #FF8800, #FFCC22)",
    chipGrad: "linear-gradient(135deg, #FF8800, #FFCC22)",
    chipShadow: "0 3px 10px rgba(255,136,0,0.28)",
    badgeBg: "rgba(255,136,0,0.10)", badgeBdr: "rgba(255,136,0,0.22)", badgeText: "#884400",
    label: "Average",
    Icon: AlertCircle,
  };
};

const healthFill = (h: number) => {
  if (h >= 75) return { color: GREEN, bar: `linear-gradient(90deg, ${GREEN}, #66EE88)` };
  if (h >= 50) return { color: GOLD, bar: `linear-gradient(90deg, ${GOLD}, #FFDD44)` };
  if (h > 0) return { color: ORANGE, bar: `linear-gradient(90deg, ${ORANGE}, #FFCC22)` };
  return { color: RED, bar: RED };
};

const ClassesSectionsMobile = ({
  loading, classes, gradesSummary,
  onAddClass, onChangeTeacher, onOpenStudents, onViewSection,
}: ClassesSectionsMobileProps) => {

  const yearStart = new Date().getFullYear();
  const yearEnd = String(yearStart + 1).slice(2);
  const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const uniqueGrades = new Set(classes.map(c => c.grade).filter(Boolean)).size;

  return (
    <div className="pb-6" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}>

      {/* ── Page Head ── */}
      <div className="px-5 pt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.6px]" style={{ color: T1 }}>
            Classes &amp; Sections
          </h1>
          <p className="text-[11px] font-normal mt-1" style={{ color: T3 }}>
            Overview of all classes and sections
          </p>
        </div>
        <button
          onClick={onAddClass}
          className="h-10 px-4 rounded-[14px] flex items-center gap-1.5 text-[12px] font-bold text-white whitespace-nowrap flex-shrink-0 transition-transform active:scale-95 relative overflow-hidden mt-1"
          style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
          <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          <Plus className="w-[13px] h-[13px] relative z-10" strokeWidth={2.5} />
          <span className="relative z-10">Add Class</span>
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: B1 }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>
            Loading classes...
          </p>
        </div>
      ) : (
        <>

          {/* ── Grade scroll cards ── */}
          {gradesSummary.length > 0 && (
            <div className="flex gap-[10px] px-5 pt-3.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {gradesSummary.map(g => {
                const hf = healthFill(g.healthScore);
                const accent = g.healthScore >= 75 ? GREEN : g.healthScore >= 50 ? GOLD : g.healthScore > 0 ? ORANGE : RED;
                const Icon = g.healthScore >= 75 ? CheckCircle : g.healthScore < 50 && g.healthScore > 0 ? XCircle : AlertCircle;
                return (
                  <div key={g.grade}
                    className="rounded-[18px] p-3 bg-white flex-shrink-0 relative overflow-hidden transition-transform active:scale-[0.96]"
                    style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)", minWidth: 152 }}>
                    <div className="absolute -top-5 -right-4 w-16 h-16 rounded-full pointer-events-none"
                      style={{ background: `radial-gradient(circle, ${accent}1A 0%, transparent 70%)` }} />
                    <div className="flex items-center justify-between mb-2 relative">
                      <div className="text-[14px] font-bold tracking-[-0.3px]" style={{ color: T1 }}>Grade {g.grade}</div>
                      <div className="w-6 h-6 rounded-[8px] flex items-center justify-center"
                        style={{ background: `${accent}1F`, border: `0.5px solid ${accent}38` }}>
                        <Icon className="w-[12px] h-[12px]" strokeWidth={2.4} style={{ color: accent }} />
                      </div>
                    </div>
                    <div>
                      {[
                        { label: "Sections", val: g.sections, color: T1 },
                        { label: "Students", val: g.students, color: T1 },
                        { label: "Avg Attendance", val: g.avgAttendance > 0 ? `${g.avgAttendance}%` : "—", color: g.avgAttendance >= 85 ? GREEN : g.avgAttendance >= 70 ? GOLD : g.avgAttendance > 0 ? RED : T4 },
                        { label: "Health Score", val: g.healthScore > 0 ? `${g.healthScore}/100` : "—", color: hf.color },
                      ].map((row, i, arr) => (
                        <div key={row.label} className="flex items-center justify-between py-[3px]"
                          style={i < arr.length - 1 ? { borderBottom: `0.5px solid ${SEP}` } : {}}>
                          <span className="text-[10px] font-semibold" style={{ color: T4 }}>{row.label}</span>
                          <span className="text-[11px] font-bold" style={{ color: row.color }}>{row.val}</span>
                        </div>
                      ))}
                    </div>
                    {/* Health bar */}
                    <div className="h-1 rounded-[2px] mt-2 overflow-hidden" style={{ background: BG2 }}>
                      <div className="h-full rounded-[2px]" style={{ width: `${Math.max(0, Math.min(100, g.healthScore))}%`, background: hf.bar }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Section Performance label ── */}
          <div className="px-5 pt-4 pb-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
            Section Performance
            <span className="px-[9px] py-[3px] rounded-full text-[9px] font-bold ml-1"
              style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.16)" }}>
              {classes.length} {classes.length === 1 ? "class" : "classes"}
            </span>
            <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
          </div>

          {/* ── Section cards ── */}
          {classes.length === 0 ? (
            <div className="mx-5 mt-3 rounded-[22px] py-12 px-5 bg-white text-center"
              style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.10)" }}>
              <BookOpen className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
              <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: T3 }}>
                No classes yet
              </p>
              <p className="text-[11px] mt-2" style={{ color: T4 }}>
                Tap <strong style={{ color: B1 }}>Add Class</strong> to create your first section.
              </p>
            </div>
          ) : (
            classes.map(cls => {
              const theme = themeForStatus(cls.status);
              const StatusIcon = theme.Icon;
              const chipText = (cls.section || cls.name).slice(0, 3).toUpperCase();
              const hasMarks = cls.avgMarksNum > 0 || cls.avgMarks !== "—";
              const hasAtt = cls.attendanceNum > 0 || cls.attendance !== "—";
              const attGood = cls.attendanceNum >= 85;
              const marksColor = !hasMarks ? T4 : cls.avgMarksNum >= 70 ? GREEN : cls.avgMarksNum >= 45 ? ORANGE : RED;
              const attColor = !hasAtt ? T4 : attGood ? GREEN : cls.attendanceNum >= 70 ? ORANGE : RED;
              const attendanceSub = !hasAtt ? "No data" : attGood ? "Excellent" : cls.attendanceNum >= 70 ? "Decent" : "Needs work";
              const marksSub = !hasMarks ? "No data" : cls.avgMarksNum >= 70 ? "On track" : cls.avgMarksNum >= 45 ? "Improving" : "Below par";

              return (
                <div key={cls.id} className="mx-5 mt-[10px] rounded-[22px] bg-white relative overflow-hidden"
                  style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
                  {/* Left accent stripe */}
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: theme.stripe }} />

                  {/* Top: chip + name + status badge */}
                  <div className="flex items-center gap-3 pl-[22px] pr-[18px] pt-4 pb-[14px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                    <div className="w-[42px] h-[42px] rounded-[13px] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      style={{ background: theme.chipGrad, boxShadow: theme.chipShadow }}>
                      {chipText}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold leading-tight tracking-[-0.2px] truncate" style={{ color: T1 }}>
                        {cls.name}
                      </div>
                      {cls.subject && (
                        <div className="text-[11px] font-medium uppercase mt-[3px] tracking-[0.05em] truncate" style={{ color: T3 }}>
                          {cls.subject}
                        </div>
                      )}
                    </div>
                    <span className="px-3 py-[5px] rounded-full text-[10px] font-bold tracking-[0.04em] inline-flex items-center gap-[3px] flex-shrink-0"
                      style={{ background: theme.badgeBg, color: theme.badgeText, border: `0.5px solid ${theme.badgeBdr}` }}>
                      <StatusIcon className="w-[11px] h-[11px]" strokeWidth={2.5} />
                      {theme.label}
                    </span>
                  </div>

                  {/* Teacher row */}
                  <div className="flex items-center gap-[10px] pl-[22px] pr-[18px] py-3" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                    {cls.teacherName ? (
                      <>
                        <div className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                          style={{ background: avGrad(cls.teacherName) }}>
                          {teacherInitials(cls.teacherName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-semibold mr-1" style={{ color: T4 }}>Teacher ·</span>
                          <span className="text-[13px] font-bold tracking-[-0.1px]" style={{ color: T1 }}>
                            {cls.teacherName}
                          </span>
                        </div>
                        <button onClick={() => onChangeTeacher(cls)}
                          className="px-[10px] py-[4px] rounded-full text-[11px] font-bold transition-transform active:scale-90"
                          style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
                          Change
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0"
                          style={{ background: BG2 }}>
                          <UsersIcon className="w-[14px] h-[14px]" style={{ color: T4 }} strokeWidth={2.2} />
                        </div>
                        <span className="text-[12px] font-semibold flex-1" style={{ color: T4 }}>
                          No teacher assigned
                        </span>
                        <button onClick={() => onChangeTeacher(cls)}
                          className="px-[10px] py-[4px] rounded-full text-[11px] font-bold text-white transition-transform active:scale-90"
                          style={{ background: GRAD_PRIMARY, boxShadow: "0 2px 8px rgba(0,85,255,0.28)" }}>
                          Assign
                        </button>
                      </>
                    )}
                  </div>

                  {/* Metrics 3-col */}
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <div className="px-[13px] py-3 flex flex-col gap-1 relative" style={{ borderRight: `0.5px solid ${SEP}` }}>
                      <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Students</div>
                      <div className="text-[18px] font-bold leading-none tracking-[-0.4px]" style={{ color: B1 }}>
                        {cls.studentCount}
                      </div>
                      <div className="text-[10px] font-medium mt-[1px]" style={{ color: T4 }}>Enrolled</div>
                    </div>
                    <div className="px-[13px] py-3 flex flex-col gap-1 relative" style={{ borderRight: `0.5px solid ${SEP}` }}>
                      <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Avg Marks</div>
                      <div className="text-[18px] font-bold leading-none tracking-[-0.4px]" style={{ color: marksColor }}>
                        {hasMarks ? cls.avgMarks : "—"}
                      </div>
                      {hasMarks ? (
                        <div className="h-[3px] rounded-[2px] mt-1 overflow-hidden" style={{ background: BG2 }}>
                          <div className="h-full rounded-[2px]" style={{ width: `${Math.max(0, Math.min(100, cls.avgMarksNum))}%`, background: `linear-gradient(90deg, ${marksColor}, ${marksColor}AA)` }} />
                        </div>
                      ) : (
                        <div className="text-[10px] font-medium mt-[1px]" style={{ color: T4 }}>{marksSub}</div>
                      )}
                    </div>
                    <div className="px-[13px] py-3 flex flex-col gap-1">
                      <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Attendance</div>
                      <div className="text-[18px] font-bold leading-none tracking-[-0.4px]" style={{ color: attColor }}>
                        {hasAtt ? cls.attendance : "—"}
                      </div>
                      {hasAtt ? (
                        <div className="h-[3px] rounded-[2px] mt-1 overflow-hidden" style={{ background: BG2 }}>
                          <div className="h-full rounded-[2px]" style={{ width: `${Math.max(0, Math.min(100, cls.attendanceNum))}%`, background: `linear-gradient(90deg, ${attColor}, ${attColor}AA)` }} />
                        </div>
                      ) : (
                        <div className="text-[10px] font-medium mt-[1px]" style={{ color: T4 }}>{attendanceSub}</div>
                      )}
                    </div>
                  </div>

                  {/* Weak subject strip */}
                  <div className="flex items-center gap-2 px-[14px] py-[10px]" style={{ borderTop: `0.5px solid ${SEP}`, borderBottom: `0.5px solid ${SEP}` }}>
                    <BookOpen className="w-3 h-3 flex-shrink-0" style={{ color: T4 }} strokeWidth={2.3} />
                    <span className="text-[10px] font-semibold" style={{ color: T4 }}>Weak Subject:</span>
                    <span className="text-[11px] font-bold truncate" style={{ color: cls.weakSubject && cls.weakSubject !== "—" ? RED : T3 }}>
                      {cls.weakSubject && cls.weakSubject !== "—" ? cls.weakSubject : "—"}
                    </span>
                  </div>

                  {/* Action bar */}
                  <div className="flex gap-2 px-4 py-[13px]" style={{ background: "rgba(238,244,255,0.50)" }}>
                    <button onClick={() => onOpenStudents(cls)}
                      className="flex-1 h-10 rounded-[13px] flex items-center justify-center gap-1.5 text-[12px] font-bold tracking-[0.02em] transition-transform active:scale-95 bg-white"
                      style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SHADOW_SM }}>
                      <UsersIcon className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.2} />
                      Students
                    </button>
                    <button onClick={() => onViewSection(cls)}
                      className="flex-1 h-10 rounded-[13px] flex items-center justify-center gap-1.5 text-[12px] font-bold text-white tracking-[0.02em] transition-transform active:scale-95 relative overflow-hidden"
                      style={{ background: "linear-gradient(135deg, #001040, #001888)", boxShadow: "0 4px 14px rgba(0,8,64,0.24)" }}>
                      <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 52%)" }} />
                      <ArrowRight className="w-[13px] h-[13px] relative z-10" strokeWidth={2.4} />
                      <span className="relative z-10">View</span>
                    </button>
                    <button onClick={() => onViewSection(cls)}
                      aria-label="More options"
                      className="w-10 h-10 rounded-[13px] flex items-center justify-center transition-transform active:scale-90 bg-white"
                      style={{ border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SHADOW_SM, flex: "0 0 auto" }}>
                      <MoreHorizontal className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* ── Summary dark card ── */}
          {classes.length > 0 && (
            <div className="mx-5 mt-3 rounded-[24px] px-[22px] py-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
                boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
              }}>
              <div className="absolute -top-9 -right-6 w-[160px] h-[160px] rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] mb-3 relative z-10" style={{ color: "rgba(255,255,255,0.48)" }}>
                Institutional Class Summary · {yearStart}–{yearEnd}
              </div>
              <div className="grid grid-cols-3 gap-[1px] rounded-[16px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
                {[
                  { val: classes.length, label: "Sections" },
                  { val: totalStudents, label: "Students" },
                  { val: uniqueGrades, label: "Grades" },
                ].map(({ val, label }) => (
                  <div key={label} className="py-[14px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="text-[22px] font-bold text-white leading-none mb-1" style={{ letterSpacing: "-0.6px" }}>{val}</div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
};

export default ClassesSectionsMobile;