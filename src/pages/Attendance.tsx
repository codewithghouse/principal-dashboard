import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CheckCircle, XCircle, Clock, TrendingUp, Send, Edit3, Bell, FileText } from "lucide-react";
import ClassAttendanceDetail from "@/components/ClassAttendanceDetail";

const trendData = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  value: parseFloat((88 + Math.sin(i * 0.4) * 3 + Math.random() * 2).toFixed(1)),
}));

const gradeHeatmap = [
  { grade: "Grade 6", pct: "94%", value: 94, color: "#22c55e", textColor: "white" },
  { grade: "Grade 7", pct: "88%", value: 88, color: "#f59e0b", textColor: "white" },
  { grade: "Grade 8", pct: "91%", value: 91, color: "#22c55e", textColor: "white" },
  { grade: "Grade 9", pct: "82%", value: 82, color: "#ef4444", textColor: "white" },
  { grade: "Grade 10", pct: "90%", value: 90, color: "#22c55e", textColor: "white" },
];

const absentStudents = [
  { initials: "RS", name: "Rahul Sharma", grade: "9A", contact: "+91 98765 43211", consecutive: "5 days", monthly: "45%", status: "Chronic" },
  { initials: "NG", name: "Neha Gupta", grade: "7A", contact: "+91 98765 43220", consecutive: "2 days", monthly: "68%", status: "Warning" },
  { initials: "AK", name: "Ankit Kumar", grade: "10C", contact: "+91 98765 43233", consecutive: "3 days", monthly: "52%", status: "Chronic" },
  { initials: "DM", name: "Divya Mehta", grade: "9B", contact: "+91 98765 43244", consecutive: "1 day", monthly: "89%", status: "Occasional" },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
        Day {payload[0].payload.day}: {payload[0].value}%
      </div>
    );
  }
  return null;
};

const Attendance = () => {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  if (selectedClass) {
    return <ClassAttendanceDetail className={selectedClass} onBack={() => setSelectedClass(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground">Monitor student attendance patterns and trends</p>
      </div>

      {/* ===== 4 STAT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Today's Present */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Today's Present</span>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-4xl font-black text-[#1e3a8a] mb-1">772</p>
          <p className="text-xs text-muted-foreground font-medium">91.2% attendance</p>
        </div>

        {/* Absent Today */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Absent Today</span>
            <XCircle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-4xl font-black text-red-500 mb-1">75</p>
          <p className="text-xs text-muted-foreground font-medium">8.8% of total</p>
        </div>

        {/* Late Arrivals */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Late Arrivals</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-4xl font-black text-amber-500 mb-1">23</p>
          <p className="text-xs text-muted-foreground font-medium">2.7% of total</p>
        </div>

        {/* Monthly Avg */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Monthly Avg</span>
            <TrendingUp className="w-5 h-5 text-[#1e3a8a]" />
          </div>
          <p className="text-4xl font-black text-foreground mb-1">89.4%</p>
          <p className="text-xs text-green-500 font-bold">↑ 1.2% vs last month</p>
        </div>
      </div>

      {/* ===== HEATMAP + TREND ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade-wise Attendance Heatmap */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-6">Grade-wise Attendance Heatmap</h2>
          <div className="flex items-end justify-between gap-3 mb-6">
            {gradeHeatmap.map((g, i) => (
              <div key={i} className="flex-1 text-center cursor-pointer" onClick={() => setSelectedClass(g.grade)}>
                <p className="text-xs font-bold text-muted-foreground mb-2">{g.grade}</p>
                <div
                  className="rounded-xl py-4 px-2 hover:scale-105 transition-transform shadow-sm"
                  style={{ backgroundColor: g.color }}
                >
                  <p className="text-lg font-black text-white">{g.pct}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-6 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              <span className="text-[10px] font-bold text-muted-foreground">90-100%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
              <span className="text-[10px] font-bold text-muted-foreground">80-89%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
              <span className="text-[10px] font-bold text-muted-foreground">Below 80%</span>
            </div>
          </div>
        </div>

        {/* 30-Day Attendance Trend */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-2">30-Day Attendance Trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#64748b" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                interval={4}
              />
              <YAxis
                domain={[85, 95]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#475569"
                strokeWidth={2}
                fill="url(#trendGradient)"
                dot={{ r: 3, fill: '#ffffff', stroke: '#475569', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#475569', stroke: '#ffffff', strokeWidth: 2 }}
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== ABSENT STUDENTS TABLE ===== */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-7 py-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Absent Students Today</h2>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
            <Send className="w-4 h-4" /> Alert Parents
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Student</th>
                <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Grade-Section</th>
                <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Parent Contact</th>
                <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Consecutive Absent</th>
                <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Monthly %</th>
                <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {absentStudents.map((s) => (
                <tr key={s.name} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-7 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                        {s.initials}
                      </div>
                      <span className="font-bold text-foreground text-sm">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-7 py-5 font-bold text-foreground text-sm">{s.grade}</td>
                  <td className="px-7 py-5 text-muted-foreground text-sm font-medium">{s.contact}</td>
                  <td className="px-7 py-5">
                    <span className="text-red-500 font-bold text-sm">{s.consecutive}</span>
                  </td>
                  <td className="px-7 py-5">
                    <span className={`font-bold text-sm ${
                      parseFloat(s.monthly) < 60 ? 'text-red-500' :
                      parseFloat(s.monthly) < 80 ? 'text-amber-500' :
                      'text-green-500'
                    }`}>{s.monthly}</span>
                  </td>
                  <td className="px-7 py-5">
                    <span className="text-sm font-bold text-foreground">{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
          <Edit3 className="w-4 h-4" /> Mark Attendance
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" /> Send Absence Alerts
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <FileText className="w-4 h-4 text-muted-foreground" /> Generate Monthly Report
        </button>
      </div>
    </div>
  );
};

export default Attendance;
