import {
  Heart, Users, GraduationCap, CalendarCheck, AlertCircle,
  TrendingUp, Star, ChevronRight, MessageSquare, Plus, Check, BarChart3,
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
interface HeatCell { cls: string; color: string; avg: number | null; }
interface UrgentComm { id: string; title: string; from: string; time: string; border: string; }

export interface DashboardMobileProps {
  activeTab: "home" | "analytics" | "teachers";
  // counts
  displayHealth: string;
  healthIndex: number | null;
  healthDelta: number | null;
  displayStudents: string;
  displayTeachers: number | string;
  displayAttendance: string;
  attendanceDelta: number | null;
  displayIncidents: number | string;
  pendingIncidents: number | null;
  // sections
  trendData: TrendPoint[];
  riskAlerts: RiskAlert[];
  teacherRows: TeacherRow[];
  heatmapCells: HeatCell[];
  urgentComms: UrgentComm[];
}

const GRAD_HERO = "linear-gradient(105deg, #4cb1dd 0%, #4cb1dd 6%, #111FA2 45%, #0a1570 100%)";
const GRAD_PILL = GRAD_HERO;
const GRAD_ROYAL = "linear-gradient(135deg, #2837c4 0%, #111FA2 55%, #0a1570 100%)";

const heatClassMap: Record<string, string> = {
  "bg-green-500": "bg-emerald-50 text-emerald-700",
  "bg-amber-400": "bg-amber-50 text-amber-700",
  "bg-red-500":   "bg-rose-50 text-rose-700",
  "bg-slate-200": "bg-slate-100 text-slate-500",
};

const DashboardMobile = ({
  activeTab,
  displayHealth, healthIndex, healthDelta,
  displayStudents, displayTeachers, displayAttendance, attendanceDelta, displayIncidents, pendingIncidents,
  trendData, riskAlerts, teacherRows, heatmapCells, urgentComms,
}: DashboardMobileProps) => {

  // ── Derived for Analytics tab ────────────────────────────────────────────
  const trendAvg  = trendData.length ? Math.round((trendData.reduce((s, p) => s + p.v, 0) / trendData.length) * 10) / 10 : null;
  const trendPeak = trendData.length ? Math.max(...trendData.map(p => p.v)) : null;
  const trendLow  = trendData.length ? Math.min(...trendData.map(p => p.v)) : null;

  // Hero bar fill %
  const heroFill = healthIndex !== null ? Math.min(100, Math.max(0, healthIndex)) : 0;

  // Top risk alert
  const topAlert = riskAlerts[0];
  // Top urgent comm for "Recent Activity"
  const topComm = urgentComms[0];

  // ── HOME TAB ─────────────────────────────────────────────────────────────
  if (activeTab === "home") {
    return (
      <div className="space-y-3 pb-4">

        {/* Hero — Academic Health Index */}
        <div
          className="relative overflow-hidden rounded-[22px] px-[18px] py-4 text-white"
          style={{ background: GRAD_HERO, boxShadow: "0 20px 40px -12px rgba(17,31,162,0.42), 0 6px 16px -4px rgba(17,31,162,0.3)" }}
        >
          {/* decorative circles */}
          <div className="pointer-events-none absolute -right-[30px] -top-[30px] w-[140px] h-[140px] rounded-full border border-white/15" />
          <div className="pointer-events-none absolute -right-[10px] -top-[10px] w-[90px] h-[90px] rounded-full border border-white/20" />

          <div className="relative flex items-start justify-between mb-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/85">Academic Health Index</p>
              <p className="text-[11px] text-white/65 mt-[3px]">Overall institutional performance</p>
            </div>
            <div className="w-[34px] h-[34px] rounded-[10px] grid place-items-center bg-white/20 border border-white/20 backdrop-blur-md">
              <Heart className="w-[15px] h-[15px] fill-white stroke-none" />
            </div>
          </div>

          <div className="relative flex items-baseline gap-1 leading-none tracking-[-0.045em]">
            <span className="text-[44px] font-bold">{displayHealth}</span>
            <span className="text-sm font-medium text-white/55">/ 100</span>
          </div>

          <div className="relative mt-3 flex items-center gap-2.5">
            <div className="flex-1 h-[5px] rounded-full bg-white/20 overflow-hidden">
              <div className="h-full rounded-full bg-white" style={{ width: `${heroFill}%` }} />
            </div>
            {healthDelta !== null && (
              <div
                className={`flex items-center gap-0.5 text-[11px] font-semibold px-2 py-[3px] rounded-md ${
                  healthDelta >= 0 ? "bg-emerald-500/25 text-emerald-200" : "bg-rose-500/25 text-rose-200"
                }`}
              >
                <TrendingUp className={`w-[9px] h-[9px] ${healthDelta < 0 ? "rotate-180" : ""}`} />
                {healthDelta >= 0 ? "+" : ""}{healthDelta}
              </div>
            )}
          </div>
        </div>

        {/* Section head */}
        <div className="flex items-baseline justify-between px-0.5 mt-5 mb-2.5">
          <h2 className="text-[13px] font-bold text-slate-900 tracking-tight">Overview</h2>
          <span className="text-xs font-medium text-slate-500">Today</span>
        </div>

        {/* 2x2 Stats grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Students */}
          <div className="bg-white rounded-2xl p-3.5 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-500 leading-tight">Total<br/>Students</span>
              <div
                className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white"
                style={{ background: "linear-gradient(135deg, #4cb1dd, #2c97c7)", boxShadow: "0 4px 10px -2px rgba(76,177,221,0.4)" }}
              >
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-[30px] font-bold leading-none tracking-[-0.042em] text-slate-900 mb-1.5">{displayStudents}</div>
            <div className="text-[11px] font-semibold text-sky-700">Enrolled this branch</div>
          </div>

          {/* Teachers */}
          <div className="bg-white rounded-2xl p-3.5 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-500 leading-tight">Teachers</span>
              <div className="w-[30px] h-[30px] rounded-[9px] grid place-items-center bg-emerald-50 text-emerald-700">
                <GraduationCap className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-[30px] font-bold leading-none tracking-[-0.042em] text-slate-900 mb-1.5">{displayTeachers}</div>
            <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Active staff
            </div>
          </div>

          {/* Attendance */}
          <div className="bg-white rounded-2xl p-3.5 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-500 leading-tight">Today's<br/>Attendance</span>
              <div
                className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white"
                style={{ background: GRAD_PILL, boxShadow: "0 4px 10px -2px rgba(17,31,162,0.5)" }}
              >
                <CalendarCheck className="w-3.5 h-3.5" />
              </div>
            </div>
            <div
              className="text-[30px] font-bold leading-none tracking-[-0.042em] mb-1.5 bg-clip-text text-transparent"
              style={{ backgroundImage: GRAD_PILL }}
            >
              {displayAttendance}
            </div>
            <div className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "#111FA2" }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#111FA2" }} />
              {attendanceDelta !== null
                ? `${attendanceDelta >= 0 ? "+" : ""}${attendanceDelta}% vs yesterday`
                : "Full attendance"}
            </div>
          </div>

          {/* Incidents */}
          <div className="bg-white rounded-2xl p-3.5 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-500 leading-tight">Pending<br/>Incidents</span>
              <div className="w-[30px] h-[30px] rounded-[9px] grid place-items-center bg-rose-50 text-rose-700">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className={`text-[30px] font-bold leading-none tracking-[-0.042em] mb-1.5 ${(pendingIncidents ?? 0) > 0 ? "text-rose-600" : "text-slate-900"}`}>
              {displayIncidents}
            </div>
            <div className={`text-[11px] font-semibold flex items-center gap-1 ${(pendingIncidents ?? 0) > 0 ? "text-rose-600" : "text-emerald-700"}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${(pendingIncidents ?? 0) > 0 ? "bg-rose-500" : "bg-emerald-500"}`} />
              {(pendingIncidents ?? 0) > 0 ? "Action required" : "All clear"}
            </div>
          </div>
        </div>

        {/* Today's Risk Alerts */}
        <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)] mt-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[15px] font-bold text-slate-900 tracking-tight">Today's Risk Alerts</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Students needing attention</div>
            </div>
            <a href="/risk-students" className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "#111FA2" }}>
              View All <ChevronRight className="w-2.5 h-2.5" />
            </a>
          </div>

          {topAlert ? (
            <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-500/10">
              <span className="relative w-[9px] h-[9px] rounded-full bg-rose-500 shrink-0 shadow-[0_0_0_3px_rgba(255,59,48,0.2)]">
                <span className="absolute -inset-1 rounded-full bg-rose-500/40 animate-ping" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-slate-900 tracking-tight truncate">{topAlert.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">{topAlert.detail}</div>
              </div>
              <span className={`${topAlert.badge} text-white text-[9px] font-bold tracking-wider px-2 py-1 rounded-md shrink-0`}>
                {topAlert.level}
              </span>
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-xs font-medium text-slate-500">No active risk alerts</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-3">
            <div className="text-[15px] font-bold text-slate-900 tracking-tight">Recent Activity</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Latest updates</div>
          </div>
          {topComm ? (
            <div
              className="flex items-center gap-3 p-3 rounded-xl border border-black/[0.04]"
              style={{ background: "#f2f3fb" }}
            >
              <div
                className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0"
                style={{ background: GRAD_PILL, boxShadow: "0 3px 8px -2px rgba(17,31,162,0.45)" }}
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-900 tracking-tight truncate">{topComm.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">From {topComm.from}</div>
              </div>
              {topComm.time && (
                <span className="text-[11px] font-semibold text-slate-400">{topComm.time.replace(" ago", "")}</span>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-xs font-medium text-slate-500">No recent activity</p>
            </div>
          )}
        </div>

      </div>
    );
  }

  // ── ANALYTICS TAB ────────────────────────────────────────────────────────
  if (activeTab === "analytics") {
    return (
      <div className="space-y-3 pb-4">

        {/* Attendance Trend */}
        <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[15px] font-bold text-slate-900 tracking-tight">Attendance Trend</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Last 30 days</div>
            </div>
            <a href="/attendance" className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "#111FA2" }}>
              Details <ChevronRight className="w-2.5 h-2.5" />
            </a>
          </div>

          {/* Stats strip */}
          <div className="flex gap-2.5 mb-3 px-3.5 py-3 rounded-xl border border-black/[0.04]" style={{ background: "#f2f3fb" }}>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Avg</div>
              <div className="text-base font-bold tracking-tight text-slate-900 mt-0.5">
                {trendAvg !== null ? `${trendAvg}%` : "--"}
              </div>
            </div>
            <div className="w-px bg-black/[0.06]" />
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Peak</div>
              <div className="text-base font-bold tracking-tight text-slate-900 mt-0.5">
                {trendPeak !== null ? `${trendPeak}%` : "--"}
              </div>
            </div>
            <div className="w-px bg-black/[0.06]" />
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Low</div>
              <div className="text-base font-bold tracking-tight text-slate-900 mt-0.5">
                {trendLow !== null ? `${trendLow}%` : "--"}
              </div>
            </div>
          </div>

          {/* Area chart */}
          <div className="h-[155px] -mx-1">
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs font-medium text-slate-500">No attendance data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mobAttFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#111FA2" stopOpacity={0.5} />
                      <stop offset="60%" stopColor="#111FA2" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#111FA2" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mobAttStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#4cb1dd" />
                      <stop offset="6%" stopColor="#4cb1dd" />
                      <stop offset="45%" stopColor="#111FA2" />
                      <stop offset="100%" stopColor="#0a1570" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 3" stroke="#e8e8ee" vertical={false} />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "#aeaeb2", fontWeight: 600 }}
                    ticks={[5, 15, 25, 30]}
                    dy={4}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 8, fill: "#aeaeb2", fontWeight: 600 }}
                    tickFormatter={v => `${v}%`}
                    dx={-2}
                    width={32}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Attendance"]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", fontSize: 11, fontWeight: 700 }}
                    cursor={{ stroke: "#111FA2", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="url(#mobAttStroke)"
                    strokeWidth={2.8}
                    strokeLinecap="round"
                    fill="url(#mobAttFill)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#fff", stroke: "#111FA2", strokeWidth: 2.5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Class Performance Heatmap */}
        <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-3">
            <div className="text-[15px] font-bold text-slate-900 tracking-tight">Class Performance</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Heatmap overview</div>
          </div>

          {heatmapCells.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs font-medium text-slate-500">No results data yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Populates once exams are graded</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-6 gap-1.5">
                {heatmapCells.slice(0, 12).map(c => {
                  const bg =
                    c.color === "bg-green-500" ? "bg-emerald-50 text-emerald-700" :
                    c.color === "bg-amber-400" ? "bg-amber-50 text-amber-700" :
                    c.color === "bg-red-500"   ? "bg-rose-50 text-rose-700" :
                    "bg-slate-100 text-slate-500";
                  return (
                    <div
                      key={c.cls}
                      className={`${bg} aspect-square rounded-[10px] flex items-start justify-start px-[7px] py-1.5 text-[9px] font-bold`}
                    >
                      {c.cls}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3.5 mt-3 pt-3 border-t border-black/[0.04]">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <span className="w-[7px] h-[7px] rounded-full bg-emerald-500" />Good (≥75%)
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <span className="w-[7px] h-[7px] rounded-full bg-amber-500" />Average (55–74%)
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <span className="w-[7px] h-[7px] rounded-full bg-rose-500" />Weak (&lt;55%)
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top Classes */}
        <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[15px] font-bold text-slate-900 tracking-tight">Top Classes</div>
              <div className="text-[11px] text-slate-500 mt-0.5">By overall score</div>
            </div>
            <a href="/classes" className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "#111FA2" }}>
              All <ChevronRight className="w-2.5 h-2.5" />
            </a>
          </div>

          {heatmapCells.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs font-medium text-slate-500">No class data yet</p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.04]">
              {[...heatmapCells]
                .filter(c => c.avg !== null)
                .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
                .slice(0, 5)
                .map(c => (
                  <div key={c.cls} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-0.5">
                    <div
                      className="w-[42px] h-[42px] rounded-xl grid place-items-center text-white text-xs font-bold shrink-0"
                      style={{ background: GRAD_PILL, boxShadow: "0 4px 10px -2px rgba(17,31,162,0.5)" }}
                    >
                      {c.cls}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-slate-900 tracking-tight truncate">Grade {c.cls}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Section performance</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-[15px] font-bold tracking-tight" style={{ color: "#111FA2" }}>{c.avg}%</div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Avg</div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

      </div>
    );
  }

  // ── TEACHERS TAB ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-4">

      {/* Teacher Performance */}
      <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[15px] font-bold text-slate-900 tracking-tight">Teacher Performance</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Top rated this month</div>
          </div>
          <a href="/teachers" className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "#111FA2" }}>
            View All <ChevronRight className="w-2.5 h-2.5" />
          </a>
        </div>

        {teacherRows.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs font-medium text-slate-500">No teachers added yet</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {teacherRows.map(t => (
              <div key={t.ini + t.name} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-0.5">
                <div className={`${t.bg} w-[38px] h-[38px] rounded-xl grid place-items-center text-white text-[11px] font-bold shrink-0 shadow-[0_3px_8px_-2px_rgba(0,0,0,0.15)]`}>
                  {t.ini}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-slate-900 tracking-tight truncate">{t.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">{t.subject}</div>
                </div>
                <div className="flex items-center gap-1 text-amber-500 text-[13px] font-bold tracking-tight">
                  <Star className="w-[11px] h-[11px] fill-amber-500 stroke-none" />
                  {t.rating.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Urgent Communications */}
      <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[15px] font-bold text-slate-900 tracking-tight">Urgent Communications</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Priority inbox</div>
          </div>
          {urgentComms.length > 0 && (
            <span className="bg-rose-500 text-white text-[9px] font-bold tracking-wider px-2 py-1 rounded-md">
              {urgentComms.length} NEW
            </span>
          )}
        </div>

        {urgentComms.length === 0 ? (
          <div className="flex flex-col items-center py-4 gap-2.5">
            <div
              className="w-12 h-12 rounded-[14px] grid place-items-center text-white"
              style={{ background: GRAD_PILL, boxShadow: "0 6px 14px -3px rgba(17,31,162,0.45)" }}
            >
              <Check className="w-[22px] h-[22px]" strokeWidth={2} />
            </div>
            <p className="text-xs font-medium text-slate-500">No urgent messages</p>
          </div>
        ) : (
          <div className="space-y-2">
            {urgentComms.slice(0, 4).map(c => (
              <div
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-xl border border-black/[0.04] ${c.border.includes("red") ? "bg-rose-50/40" : ""}`}
                style={{ background: c.border.includes("red") ? undefined : "#f2f3fb" }}
              >
                <div
                  className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0"
                  style={{ background: GRAD_PILL, boxShadow: "0 3px 8px -2px rgba(17,31,162,0.45)" }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 tracking-tight truncate">{c.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">From {c.from}</div>
                </div>
                {c.time && (
                  <span className="text-[11px] font-semibold text-slate-400">{c.time.replace(" ago", "")}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-[18px] p-4 border border-black/[0.04] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-3">
          <div className="text-[15px] font-bold text-slate-900 tracking-tight">Quick Actions</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Shortcuts</div>
        </div>

        <div className="space-y-2">
          <a
            href="/students"
            className="flex items-center gap-3 p-3 rounded-xl border border-black/[0.04]"
            style={{ background: "#f2f3fb" }}
          >
            <div
              className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0"
              style={{ background: GRAD_PILL, boxShadow: "0 3px 8px -2px rgba(17,31,162,0.45)" }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-900 tracking-tight">Add Student</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Enroll a new student</div>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">→</span>
          </a>

          <a
            href="/reports"
            className="flex items-center gap-3 p-3 rounded-xl border border-black/[0.04]"
            style={{ background: "#f2f3fb" }}
          >
            <div
              className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0"
              style={{ background: GRAD_ROYAL, boxShadow: "0 3px 8px -2px rgba(17,31,162,0.45)" }}
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-900 tracking-tight">Generate Report</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Export analytics</div>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">→</span>
          </a>
        </div>
      </div>

    </div>
  );
};

export default DashboardMobile;
