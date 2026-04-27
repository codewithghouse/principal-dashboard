import { useNavigate } from "react-router-dom";
import {
  Users, GraduationCap, CalendarCheck, AlertCircle, ChevronRight,
  ShieldCheck, Star, CheckCircle2, TrendingUp, TrendingDown,
  BarChart3, PieChart,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface RiskAlert {
  id: string;
  name: string;
  detail: string;
  level: "CRITICAL" | "WARNING";
  dot: string;
  badge: string;
  rowBg: string;
}
interface TrendPoint { day: number; v: number; }
interface TeacherRow { ini: string; name: string; subject: string; rating: number; bg: string; }
interface HeatCell { cls: string; color: string; avg: number | null; students?: number; }
interface UrgentComm { id: string; title: string; from: string; time: string; border: string; }

export interface DashboardMobileProps {
  activeTab: "home" | "analytics" | "teachers";
  displayHealth: string;
  healthIndex: number | null;
  healthDelta: number | null;
  displayStudents: string;
  displayTeachers: number | string;
  displayAttendance: string;
  attendanceDelta: number | null;
  displayIncidents: number | string;
  pendingIncidents: number | null;
  trendData: TrendPoint[];
  riskAlerts: RiskAlert[];
  teacherRows: TeacherRow[];
  heatmapCells: HeatCell[];
  urgentComms: UrgentComm[];
}

// ── Bright-blue theme tokens ──
const B1 = "#0055FF", B2 = "#1166FF", B3 = "#2277FF", B4 = "#4499FF";
const BG = "#EEF4FF", BG2 = "#E0ECFF";
const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
const SEP = "rgba(0,85,255,0.07)";
const GREEN = "#00C853", GREEN_D = "#007830", GREEN_S = "rgba(0,200,83,0.10)", GREEN_B = "rgba(0,200,83,0.22)";
const RED = "#FF3355";
const ORANGE = "#FF8800";
const GOLD = "#FFAA00", GOLD_D = "#A86A00";
const VIOLET = "#7B3FF4";
const SH    = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 8px rgba(0,85,255,0.08), 0 10px 26px rgba(0,85,255,0.10)";
const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.11), 0 18px 44px rgba(0,85,255,0.13)";

// ── Health labels ──
const healthStatus = (idx: number | null) => {
  if (idx === null) return "Loading";
  if (idx >= 80) return "Good";
  if (idx >= 65) return "Moderate";
  return "At Risk";
};

// ── Heatmap color from tailwind class → hex gradient ──
const heatGradient = (color: string) => {
  switch (color) {
    case "bg-green-500": return { bg: `linear-gradient(135deg, ${GREEN}, #66EE88)`, shadow: "0 4px 14px rgba(0,200,83,0.26)" };
    case "bg-amber-400": return { bg: `linear-gradient(135deg, ${ORANGE}, #FFCC22)`, shadow: "0 4px 14px rgba(255,136,0,0.26)" };
    case "bg-red-500":   return { bg: `linear-gradient(135deg, ${RED}, #FF88AA)`,   shadow: "0 4px 14px rgba(255,51,85,0.26)" };
    default:             return { bg: `linear-gradient(135deg, ${B1}, ${B4})`,      shadow: "0 4px 14px rgba(0,85,255,0.22)" };
  }
};

// ── Avatar gradient from existing tailwind class ──
const avatarGradient = (bg: string) => {
  switch (bg) {
    case "bg-blue-700":   return { bg: `linear-gradient(135deg, ${B1}, ${B3})`,           shadow: "0 2px 8px rgba(0,85,255,0.26)" };
    case "bg-green-600":  return { bg: `linear-gradient(135deg, ${GREEN}, #22EE66)`,      shadow: "0 2px 8px rgba(0,200,83,0.24)" };
    case "bg-amber-500":  return { bg: `linear-gradient(135deg, ${ORANGE}, #FFCC22)`,    shadow: "0 2px 8px rgba(255,136,0,0.26)" };
    case "bg-purple-600": return { bg: "linear-gradient(135deg, #7B3FF4, #AA77FF)",       shadow: "0 2px 8px rgba(123,63,244,0.24)" };
    case "bg-rose-600":   return { bg: `linear-gradient(135deg, ${RED}, #FF88AA)`,        shadow: "0 2px 8px rgba(255,51,85,0.24)" };
    case "bg-teal-600":   return { bg: "linear-gradient(135deg, #00C4B4, #22DDCC)",       shadow: "0 2px 8px rgba(0,196,180,0.24)" };
    default:              return { bg: `linear-gradient(135deg, ${B1}, ${B2})`,           shadow: "0 2px 8px rgba(0,85,255,0.22)" };
  }
};

const DashboardMobile = ({
  activeTab,
  displayHealth, healthIndex, healthDelta,
  displayStudents, displayTeachers, displayAttendance, attendanceDelta, displayIncidents, pendingIncidents,
  trendData, riskAlerts, teacherRows, heatmapCells, urgentComms,
}: DashboardMobileProps) => {
  const navigate = useNavigate();

  // ── Derived ──
  const heroFill = healthIndex !== null ? Math.min(100, Math.max(0, healthIndex)) : 0;
  const incidentsNum = typeof pendingIncidents === "number" ? pendingIncidents : null;
  const attDeltaNum = typeof attendanceDelta === "number" ? attendanceDelta : null;

  // ── Sub-views ──
  const Hero = (
    <div
      onClick={() => navigate("/student-intelligence")}
      className="mx-5 mt-3 rounded-[24px] px-5 py-[18px] relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style={{
        background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
        boxShadow: "0 8px 28px rgba(0,8,60,0.32), 0 0 0 0.5px rgba(255,255,255,0.12)",
        transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
      }}>
      <div className="absolute -top-[44px] -right-[30px] w-[180px] h-[180px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
      <div className="absolute -bottom-[44px] right-[60px] w-[140px] h-[140px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 65%)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }} />

      <div className="flex items-center justify-between mb-[14px] relative z-10">
        <div className="flex items-center gap-[10px]">
          <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)" }}>
            <ShieldCheck className="w-[18px] h-[18px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.1} />
          </div>
          <div>
            <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.50)" }}>Academic Health Index</div>
            <div className="flex items-baseline gap-1">
              <div className="text-[28px] font-bold leading-none text-white" style={{ letterSpacing: "-1px" }}>{displayHealth}</div>
              <div className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>/100</div>
            </div>
          </div>
        </div>
        <div className="text-right relative z-10">
          <div className="text-[8px] font-bold uppercase tracking-[0.10em] mb-1" style={{ color: "rgba(255,255,255,0.42)" }}>Overall Status</div>
          <div className="text-[18px] font-bold text-white" style={{ letterSpacing: "-0.3px" }}>{healthStatus(healthIndex)}</div>
          {healthDelta !== null && (
            <div className="flex items-center gap-1 justify-end mt-[2px]" style={{ color: healthDelta >= 0 ? "#66EE88" : "#FF8899" }}>
              {healthDelta >= 0 ? <TrendingUp className="w-[11px] h-[11px]" /> : <TrendingDown className="w-[11px] h-[11px]" />}
              <span className="text-[10px] font-bold">{Math.abs(healthDelta)}% vs 7d</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-[6px] rounded-[3px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.16)" }}>
        <div className="h-full rounded-[3px]" style={{ width: `${heroFill}%`, background: `linear-gradient(90deg, ${B4}, ${GREEN})` }} />
      </div>
    </div>
  );

  const incidentsActive = incidentsNum !== null && incidentsNum > 0;
  const StatGrid = (
    <div className="grid grid-cols-2 gap-[10px] px-5 pt-[14px]">
      {[
        {
          label: "Total\nStudents", value: displayStudents, sub: "Enrolled this branch",
          cardBg: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
          icon: Users, iconBg: `linear-gradient(135deg, ${B1}, ${B2})`, iconShadow: "0 4px 14px rgba(0,85,255,0.28)",
          valColor: B1, subColor: T3,
          decorIcon: Users, decorColor: B1, decorOpacity: 0.18,
          to: "/students",
        },
        {
          label: "Teachers", value: displayTeachers, sub: "Active staff",
          cardBg: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
          icon: GraduationCap, iconBg: `linear-gradient(135deg, ${GREEN}, #22EE66)`, iconShadow: "0 4px 14px rgba(0,200,83,0.26)",
          valColor: GREEN_D, subColor: GREEN_D,
          decorIcon: TrendingUp, decorColor: GREEN, decorOpacity: 0.22,
          to: "/teachers",
        },
        {
          label: "Today's\nAttendance", value: displayAttendance,
          sub: attDeltaNum !== null ? `${attDeltaNum >= 0 ? "+" : ""}${attDeltaNum}% vs yesterday` : "No data yet",
          cardBg: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
          icon: CalendarCheck, iconBg: `linear-gradient(135deg, ${GOLD}, #FFDD44)`, iconShadow: "0 4px 14px rgba(255,170,0,0.28)",
          valColor: GOLD_D,
          subColor: attDeltaNum !== null ? (attDeltaNum >= 0 ? GREEN_D : RED) : T4,
          decorIcon: BarChart3, decorColor: GOLD, decorOpacity: 0.22,
          to: "/attendance",
        },
        {
          label: "Pending\nIncidents", value: displayIncidents,
          sub: incidentsActive ? "Action required" : "All clear",
          cardBg: incidentsActive
            ? "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)"
            : "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
          icon: AlertCircle,
          iconBg: incidentsActive ? `linear-gradient(135deg, ${RED}, #FF6688)` : `linear-gradient(135deg, ${VIOLET}, #A07CF8)`,
          iconShadow: incidentsActive ? "0 4px 14px rgba(255,51,85,0.28)" : "0 4px 14px rgba(123,63,244,0.26)",
          valColor: incidentsActive ? RED : VIOLET,
          subColor: incidentsActive ? RED : T3,
          decorIcon: PieChart, decorColor: incidentsActive ? RED : VIOLET, decorOpacity: 0.22,
          to: "/discipline",
        },
      ].map(({ label, value, sub, cardBg, icon: Icon, iconBg, iconShadow, valColor, subColor, decorIcon: Decor, decorColor, decorOpacity, to }) => (
        <button
          key={label}
          onClick={() => navigate(to)}
          className="rounded-[20px] px-4 py-4 relative overflow-hidden cursor-pointer active:scale-[0.96] transition-transform text-left"
          style={{ background: cardBg, boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
          <div
            className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center mb-[10px] relative z-10"
            style={{ background: iconBg, boxShadow: iconShadow }}>
            <Icon className="w-[22px] h-[22px] text-white" strokeWidth={2.3} />
          </div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-[6px] leading-[1.3] whitespace-pre-line relative z-10" style={{ color: T4 }}>
            {label}
          </span>
          <div className="text-[28px] font-bold leading-none mb-[6px] relative z-10" style={{ color: valColor, letterSpacing: "-1px" }}>
            {String(value)}
          </div>
          <div className="text-[11px] font-semibold truncate relative z-10" style={{ color: subColor }}>{sub}</div>
          <Decor className="absolute bottom-[10px] right-[10px] w-12 h-12 pointer-events-none" style={{ color: decorColor, opacity: decorOpacity }} strokeWidth={2} />
        </button>
      ))}
    </div>
  );

  const SectionLabel = ({ text }: { text: string }) => (
    <div className="px-5 pt-[18px] text-[9px] font-bold uppercase tracking-[0.10em] flex items-center gap-2" style={{ color: T4 }}>
      <span>{text}</span>
      <span className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
    </div>
  );

  const SectionCard = ({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
    <div onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`mx-5 mt-3 bg-white rounded-[22px] overflow-hidden ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
      {children}
    </div>
  );

  const RiskAlerts = (
    <>
      <SectionLabel text="Risk Alerts" />
      <SectionCard onClick={() => navigate("/risk-students")}>
        <div className="px-[18px] pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${SEP}` }}>
          <div className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Today's Risk Alerts</div>
          <button onClick={() => navigate("/risk-students")}
            className="text-[12px] font-bold flex items-center gap-[3px] active:opacity-70"
            style={{ color: B1 }}>
            View All <ChevronRight className="w-[13px] h-[13px]" strokeWidth={2.5} />
          </button>
        </div>
        {riskAlerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{ background: GREEN_S, border: `0.5px solid ${GREEN_B}`, boxShadow: "0 0 0 6px rgba(0,200,83,0.05)" }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: GREEN }} strokeWidth={2.2} />
            </div>
            <div className="text-[13px] font-semibold" style={{ color: T3 }}>No active risk alerts</div>
          </div>
        ) : (
          riskAlerts.map((a, i, arr) => {
            const critical = a.level === "CRITICAL";
            return (
              <button key={a.id}
                onClick={() => navigate("/risk-students")}
                className="w-full flex items-center gap-3 px-[18px] py-[14px] text-left active:bg-[#F5F9FF] transition-colors"
                style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : "none" }}>
                <span className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{
                    background: critical ? RED : ORANGE,
                    boxShadow: critical ? "0 0 0 3px rgba(255,51,85,0.18)" : "0 0 0 3px rgba(255,136,0,0.16)",
                  }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.2px", marginBottom: 3 }}>{a.name}</div>
                  <div className="text-[11px] font-medium truncate" style={{ color: T3 }}>{a.detail}</div>
                </div>
                <div className="px-[10px] py-[5px] rounded-full text-[9px] font-bold text-white uppercase tracking-[0.08em] shrink-0"
                  style={{
                    background: critical ? RED : ORANGE,
                    boxShadow: critical ? "0 2px 8px rgba(255,51,85,0.28)" : "0 2px 8px rgba(255,136,0,0.26)",
                  }}>
                  {critical ? "Critical" : "Warning"}
                </div>
              </button>
            );
          })
        )}
      </SectionCard>
    </>
  );

  const TrendChart = (
    <SectionCard onClick={() => navigate("/attendance")}>
      <button
        onClick={() => navigate("/attendance")}
        className="w-full px-[18px] pt-4 pb-3 flex items-center justify-between active:opacity-80"
        style={{ borderBottom: `0.5px solid ${SEP}` }}>
        <div className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Attendance Trend</div>
        <div className="text-[11px] font-semibold" style={{ color: T4 }}>Last 30 days</div>
      </button>
      <div className="p-[18px]">
        {trendData.length === 0 ? (
          <div className="flex flex-col items-center gap-[6px] py-6">
            <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
              <CalendarCheck className="w-5 h-5" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.2} />
            </div>
            <div className="text-[12px] font-medium" style={{ color: T4 }}>No attendance data yet</div>
          </div>
        ) : (
          <div style={{ height: 110 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashMobileLine" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={B1} />
                    <stop offset="100%" stopColor="#66BBFF" />
                  </linearGradient>
                  <linearGradient id="dashMobileArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={B1} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={B1} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="rgba(0,85,255,0.06)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: T4, fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: T4, fontWeight: 600 }} domain={[0, 100]} width={30} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "0.5px solid rgba(0,85,255,0.15)", boxShadow: "0 4px 20px rgba(0,85,255,0.12)", fontSize: 11, padding: "6px 10px" }}
                  formatter={(val: any) => [`${val}%`, "Attendance"]}
                  labelFormatter={(d: any) => `Day ${d}`}
                />
                <Area type="monotone" dataKey="v" stroke="url(#dashMobileLine)" strokeWidth={2.5} fill="url(#dashMobileArea)" dot={{ r: 3, strokeWidth: 2, stroke: "#fff", fill: B1 }} activeDot={{ r: 6, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </SectionCard>
  );

  const Heatmap = (
    <SectionCard onClick={() => navigate("/academics")}>
      <div className="px-[18px] pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${SEP}` }}>
        <div className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Class Performance</div>
        <button onClick={() => navigate("/academics")}
          className="text-[12px] font-bold flex items-center gap-[3px] active:opacity-70"
          style={{ color: B1 }}>
          Details <ChevronRight className="w-[13px] h-[13px]" strokeWidth={2.5} />
        </button>
      </div>
      <div className="p-[14px]">
        {heatmapCells.length === 0 ? (
          <div className="flex flex-col items-center gap-[6px] py-6">
            <div className="text-[12px] font-medium" style={{ color: T4 }}>No class data yet</div>
          </div>
        ) : (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-[10px]" style={{ color: T4 }}>Institutional Grade</div>
            <div className="flex gap-[10px] items-end overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {heatmapCells.map((c) => {
                const grad = heatGradient(c.color);
                return (
                  <button key={c.cls}
                    onClick={(e) => { e.stopPropagation(); navigate(`/academics?class=${encodeURIComponent(c.cls)}`); }}
                    className="flex flex-col items-center gap-[6px] shrink-0 active:scale-[0.92] transition-transform"
                    style={{ transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                    <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center"
                      style={{ background: grad.bg, boxShadow: grad.shadow }}>
                      {c.avg !== null && (
                        <span className="text-[13px] font-bold text-white" style={{ letterSpacing: "-0.2px" }}>{c.avg}%</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold tracking-[0.04em]" style={{ color: T3 }}>{c.cls}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-[14px] pt-3 mt-3" style={{ borderTop: `0.5px solid ${SEP}` }}>
              <div className="flex items-center gap-[5px] text-[10px] font-semibold" style={{ color: T3 }}>
                <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />Good (≥75%)
              </div>
              <div className="flex items-center gap-[5px] text-[10px] font-semibold" style={{ color: T3 }}>
                <span className="w-2 h-2 rounded-full" style={{ background: ORANGE }} />Average (55-74%)
              </div>
              <div className="flex items-center gap-[5px] text-[10px] font-semibold" style={{ color: T3 }}>
                <span className="w-2 h-2 rounded-full" style={{ background: RED }} />Weak (&lt;55%)
              </div>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );

  const TeachersCard = (
    <>
      <SectionLabel text="Faculty" />
      <SectionCard onClick={() => navigate("/teacher-performance")}>
        <div className="px-[18px] pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${SEP}` }}>
          <div className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Teacher Performance</div>
          <button onClick={() => navigate("/teacher-performance")}
            className="text-[12px] font-bold flex items-center gap-[3px] active:opacity-70"
            style={{ color: B1 }}>
            View All <ChevronRight className="w-[13px] h-[13px]" strokeWidth={2.5} />
          </button>
        </div>
        {teacherRows.length === 0 ? (
          <div className="flex flex-col items-center gap-[6px] py-6">
            <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
              <GraduationCap className="w-5 h-5" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.2} />
            </div>
            <div className="text-[12px] font-medium" style={{ color: T4 }}>No teachers yet</div>
          </div>
        ) : (
          teacherRows.map((t, i, arr) => {
            const av = avatarGradient(t.bg);
            return (
              <button key={`${t.name}-${i}`}
                onClick={(e) => { e.stopPropagation(); navigate("/teachers"); }}
                className="w-full flex items-center gap-3 px-[18px] py-[13px] text-left active:bg-[#F5F9FF] transition-colors"
                style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : "none" }}>
                <div className="w-10 h-10 rounded-[13px] flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                  style={{ background: av.bg, boxShadow: av.shadow }}>
                  {t.ini}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.2px", marginBottom: 2 }}>{t.name}</div>
                  <div className="text-[11px] font-medium truncate" style={{ color: T3 }}>{t.subject}</div>
                </div>
                <div className="flex items-center gap-1 text-[14px] font-bold shrink-0" style={{ color: GOLD }}>
                  <Star className="w-[13px] h-[13px]" fill={GOLD} stroke={GOLD} />
                  {t.rating || "—"}
                </div>
              </button>
            );
          })
        )}
      </SectionCard>
    </>
  );

  const UrgentComms = (
    <>
      <SectionLabel text="Communications" />
      <SectionCard onClick={() => navigate("/parent-communication")}>
        <div className="px-[18px] pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: `0.5px solid ${SEP}` }}>
          <div className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Urgent Communications</div>
          {urgentComms.length === 0 ? (
            <div className="px-[10px] py-1 rounded-full text-[10px] font-bold"
              style={{ background: GREEN_S, border: `0.5px solid ${GREEN_B}`, color: GREEN_D }}>
              All clear
            </div>
          ) : (
            <button onClick={() => navigate("/parent-communication")}
              className="text-[12px] font-bold flex items-center gap-[3px] active:opacity-70"
              style={{ color: B1 }}>
              View All <ChevronRight className="w-[13px] h-[13px]" strokeWidth={2.5} />
            </button>
          )}
        </div>
        {urgentComms.length === 0 ? (
          <div className="flex flex-col items-center gap-[8px] px-4 py-5">
            <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: "0 0 0 8px rgba(0,85,255,0.04)" }}>
              <CheckCircle2 className="w-[22px] h-[22px]" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.1} />
            </div>
            <div className="text-[13px] font-medium" style={{ color: T3 }}>No urgent messages</div>
            <div className="text-[11px] font-normal text-center max-w-[200px] leading-[1.55]" style={{ color: T4 }}>
              All communication channels are clear.
            </div>
          </div>
        ) : (
          urgentComms.map((c, i, arr) => {
            const isHigh = c.border === "border-l-red-500";
            return (
              <button key={c.id}
                onClick={() => navigate("/parent-communication")}
                className="w-full flex items-start gap-3 px-[18px] py-[13px] text-left active:bg-[#F5F9FF] transition-colors"
                style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : "none" }}>
                <div className="w-1 h-10 rounded-full shrink-0 mt-0.5" style={{ background: isHigh ? RED : ORANGE }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.1px", marginBottom: 2 }}>{c.title}</div>
                  <div className="text-[11px] font-medium truncate" style={{ color: T3 }}>
                    {c.from}{c.time ? ` · ${c.time}` : ""}
                  </div>
                </div>
                <div className="px-[9px] py-[3px] rounded-full text-[9px] font-bold shrink-0 uppercase tracking-[0.06em]"
                  style={{
                    background: isHigh ? "rgba(255,51,85,0.10)" : "rgba(255,136,0,0.10)",
                    color: isHigh ? RED : "#884400",
                    border: `0.5px solid ${isHigh ? "rgba(255,51,85,0.22)" : "rgba(255,136,0,0.22)"}`,
                  }}>
                  {isHigh ? "High" : "Normal"}
                </div>
              </button>
            );
          })
        )}
      </SectionCard>
    </>
  );

  // ═══════════════════════════════════════════════════════════════
  // ANALYTICS TAB — Trend + Heatmap in focused view
  // ═══════════════════════════════════════════════════════════════
  if (activeTab === "analytics") {
    return (
      <div
        className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>
        <div className="px-5 pt-4">
          <div className="text-[24px] font-bold" style={{ color: T1, letterSpacing: "-0.6px" }}>Analytics</div>
          <div className="text-[12px] font-normal mt-[3px]" style={{ color: T3 }}>Attendance trends and class performance</div>
        </div>
        {Hero}
        {TrendChart}
        {Heatmap}
        <div className="h-4" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TEACHERS TAB — Teacher list + rating breakdown
  // ═══════════════════════════════════════════════════════════════
  if (activeTab === "teachers") {
    return (
      <div
        className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>
        <div className="px-5 pt-4">
          <div className="text-[24px] font-bold" style={{ color: T1, letterSpacing: "-0.6px" }}>Faculty</div>
          <div className="text-[12px] font-normal mt-[3px]" style={{ color: T3 }}>Teacher performance &amp; ratings</div>
        </div>
        {TeachersCard}
        <div className="mx-5 mt-3 bg-white rounded-[20px] px-5 py-4" style={{ boxShadow: SH, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <button onClick={() => navigate("/teacher-leaderboard")}
            className="w-full flex items-center justify-between active:opacity-80">
            <div>
              <div className="text-[14px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Full Leaderboard</div>
              <div className="text-[11px] font-medium mt-[2px]" style={{ color: T3 }}>See ranked teacher scores</div>
            </div>
            <ChevronRight className="w-[16px] h-[16px]" style={{ color: B1 }} strokeWidth={2.5} />
          </button>
        </div>
        <div className="h-4" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // HOME TAB — Full comprehensive view (default)
  // ═══════════════════════════════════════════════════════════════
  return (
    <div
      className="animate-in fade-in duration-500 -mx-3 -mt-3"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>
      {Hero}
      {StatGrid}
      {RiskAlerts}
      <SectionLabel text="Analytics" />
      {TrendChart}
      {Heatmap}
      {TeachersCard}
      {UrgentComms}
      <div className="h-4" />
      {/* Reserve scoped tokens */}
      <span className="hidden">{T2}{BG2}</span>
    </div>
  );
};

export default DashboardMobile;