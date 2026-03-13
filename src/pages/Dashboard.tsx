import { Users, GraduationCap, CalendarCheck, AlertCircle, Heart, ArrowUp, ArrowDown, Star, MessageSquare } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import StatCard from "@/components/dashboard/StatCard";

const attendanceData = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  value: +(90 + Math.sin(i * 0.3) * 2.5 - (i > 18 && i < 24 ? 3 : 0) + (i > 24 ? 2 : 0)).toFixed(1),
}));

const riskAlerts = [
  { name: "Rahul Sharma – 9A", detail: "Attendance 45% | Math Failed", level: "CRITICAL" as const },
  { name: "Priya Patel – 8B", detail: "3 Discipline incidents", level: "WARNING" as const },
  { name: "Class 10C Overall", detail: "Science avg below 50%", level: "WARNING" as const },
];

const classHeatmap = [
  { cls: "6A", status: "good" }, { cls: "6B", status: "good" },
  { cls: "7A", status: "average" }, { cls: "7B", status: "good" },
  { cls: "8A", status: "good" }, { cls: "8B", status: "average" },
  { cls: "9A", status: "weak" }, { cls: "9B", status: "average" },
  { cls: "9C", status: "average" }, { cls: "10A", status: "good" },
  { cls: "10B", status: "good" }, { cls: "10C", status: "weak" },
];

const topTeachers = [
  { initials: "MK", name: "Mrs. Kavita", subject: "Mathematics", rating: 4.8, color: "bg-[#1e3a8a]" },
  { initials: "SR", name: "Mr. Ramesh", subject: "Science", rating: 4.6, color: "bg-[#22c55e]" },
  { initials: "AP", name: "Mrs. Priya", subject: "English", rating: 4.5, color: "bg-[#8b5cf6]" },
];

const urgentComms = [
  { title: "Fee Payment Complaint", from: "Mr. Gupta (Parent of 8A)", time: "2h ago", color: "#ef4444" },
  { title: "Bus Route Issue", from: "Mrs. Reddy (Parent of 7B)", time: "4h ago", color: "#f59e0b" },
];

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Welcome back, Principal. Here's your command center overview.</p>
      </div>

      {/* Academic Health Index */}
      <div className="health-banner flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary-foreground/20 flex items-center justify-center">
            <Heart className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm text-primary-foreground/80">Academic Health Index</p>
            <p className="text-3xl font-bold text-primary-foreground">
              78.4<span className="text-lg font-normal">/100</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="flex items-center gap-1 text-primary-foreground">
              <ArrowUp className="w-4 h-4" />
              <span className="text-lg font-semibold">3.2%</span>
            </div>
            <p className="text-xs text-primary-foreground/70">vs Last Month</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold text-primary-foreground">Good</span>
            <p className="text-xs text-primary-foreground/70">Overall Status</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Students" value={847} subtitle="↑ 12 new this month" subtitleColor="success" icon={Users} iconColor="text-primary" />
        <StatCard title="Teachers" value={42} subtitle="All active" subtitleColor="success" icon={GraduationCap} iconColor="text-primary" />
        <StatCard title="Today's Attendance" value="91.2%" subtitle="↓ 2.1% vs yesterday" subtitleColor="destructive" icon={CalendarCheck} iconColor="text-warning" />
        <StatCard title="Pending Incidents" value={3} subtitle="Action required" subtitleColor="destructive" icon={AlertCircle} iconColor="text-destructive" />
      </div>

      {/* Row 1: Risk Alerts + Attendance Trend */}
      <div className="grid grid-cols-5 gap-5">
        {/* Today's Risk Alerts */}
        <div className="col-span-3 bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-foreground">Today's Risk Alerts</h2>
            <button className="text-sm text-primary font-semibold hover:underline">View All →</button>
          </div>
          <div className="space-y-3">
            {riskAlerts.map((alert, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl hover:shadow-sm transition-all cursor-pointer" style={{ backgroundColor: '#fff5f5' }}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${alert.level === "CRITICAL" ? "bg-[#ef4444]" : "bg-[#f59e0b]"}`} />
                  <div>
                    <p className="text-sm font-bold text-foreground">{alert.name}</p>
                    <p className="text-xs text-muted-foreground font-medium">{alert.detail}</p>
                  </div>
                </div>
                <span className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white shadow-sm ${
                  alert.level === "CRITICAL" 
                    ? "bg-[#ef4444]" 
                    : "bg-[#f59e0b]"
                }`}>
                  {alert.level}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance Trend */}
        <div className="col-span-2 bg-card rounded-xl border border-border p-6 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-4">Attendance Trend (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={attendanceData}>
              <defs>
                <linearGradient id="attendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="hsl(220, 60%, 25%)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 92%)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis domain={[85, 95]} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Attendance"]} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }} />
              <Area type="monotone" dataKey="value" stroke="hsl(220, 60%, 25%)" strokeWidth={2.5} fill="url(#attendGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Class Heatmap + Teacher Performance + Urgent Comms */}
      <div className="grid grid-cols-5 gap-5">
        {/* Class Performance Heatmap */}
        <div className="col-span-2 bg-card rounded-xl border border-border p-6 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-5">Class Performance Heatmap</h2>
          <div className="grid grid-cols-6 gap-2 mb-5">
            {classHeatmap.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{c.cls}</span>
                <div className={`w-full h-10 rounded-lg shadow-sm transition-all hover:scale-105 cursor-pointer ${
                  c.status === 'good' ? 'bg-[#22c55e]' :
                  c.status === 'average' ? 'bg-[#f59e0b]' :
                  'bg-[#ef4444]'
                }`} />
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-5 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#22c55e]" />
              <span className="text-[11px] font-bold text-muted-foreground">Good</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#f59e0b]" />
              <span className="text-[11px] font-bold text-muted-foreground">Average</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#ef4444]" />
              <span className="text-[11px] font-bold text-muted-foreground">Weak</span>
            </div>
          </div>
        </div>

        {/* Right Column: Teacher Performance + Urgent Communications */}
        <div className="col-span-3 space-y-5">
          {/* Teacher Performance */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-foreground">Teacher Performance</h2>
              <button className="text-sm text-primary font-semibold hover:underline">View All →</button>
            </div>
            <div className="space-y-4">
              {topTeachers.map((t, i) => (
                <div key={i} className="flex items-center gap-4 group cursor-pointer">
                  <div className={`w-11 h-11 rounded-xl ${t.color} flex items-center justify-center text-white text-xs font-bold shadow-md`}>
                    {t.initials}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-medium">{t.subject}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span className="text-sm font-black text-foreground">{t.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Urgent Communications */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-foreground">Urgent Communications</h2>
              <span className="px-3 py-1 rounded-lg bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-wider border border-red-100">3 New</span>
            </div>
            <div className="space-y-3">
              {urgentComms.map((msg, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-red-50/40 rounded-xl hover:bg-red-50/70 transition-colors cursor-pointer border border-red-50">
                  <div className="w-1 h-full min-h-[40px] rounded-full shrink-0" style={{ backgroundColor: msg.color }} />
                  <div>
                    <p className="text-sm font-bold text-foreground">{msg.title}</p>
                    <p className="text-xs text-muted-foreground font-medium">From: {msg.from}  •  {msg.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
