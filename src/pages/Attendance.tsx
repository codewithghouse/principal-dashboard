import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "@/components/dashboard/StatCard";
import { CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";

const trendData = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  value: 88 + Math.random() * 6,
}));

const gradeAttendance = [
  { grade: "Grade 6", pct: "95%", color: "bg-success" },
  { grade: "Grade 7", pct: "94%", color: "bg-success" },
  { grade: "Grade 8", pct: "91%", color: "bg-success" },
  { grade: "Grade 9", pct: "82%", color: "bg-warning" },
  { grade: "Grade 10", pct: "90%", color: "bg-success" },
];

const absentStudents = [
  { initials: "RS", name: "Rahul Sharma", grade: "9A", contact: "+91 98765 43211", consecutive: "5 days", monthly: "45%", status: "Chronic" },
];

const Attendance = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground">Monitor student attendance patterns and trends</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Today's Present" value="91.2%" subtitle="772 students" subtitleColor="muted" icon={CheckCircle} iconColor="text-success" />
        <StatCard title="Absent Today" value={75} subtitle="8.8% of total" subtitleColor="destructive" icon={XCircle} iconColor="text-destructive" />
        <StatCard title="Late Arrivals" value={23} subtitle="2.7% of total" subtitleColor="warning" icon={Clock} iconColor="text-warning" />
        <StatCard title="Monthly Avg" value="89.4%" subtitle="↑ 1.2% vs last month" subtitleColor="success" icon={TrendingUp} iconColor="text-primary" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Grade-wise Attendance</h2>
          <div className="space-y-3">
            {gradeAttendance.map((g) => (
              <div key={g.grade} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-20">{g.grade}</span>
                <div className="flex-1 h-2 bg-secondary rounded-full">
                  <div className={`h-2 ${g.color} rounded-full`} style={{ width: g.pct }} />
                </div>
                <span className="text-sm font-medium w-12 text-right">{g.pct}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">30-Day Attendance Trend</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 90%)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(220 10% 50%)" />
              <YAxis domain={[85, 96]} tick={{ fontSize: 11 }} stroke="hsl(220 10% 50%)" tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Attendance"]} />
              <Line type="monotone" dataKey="value" stroke="hsl(220, 60%, 25%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Absent Students Today</h2>
          <button className="text-sm text-primary font-medium hover:underline">Alert Parents</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Student</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Grade-Section</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Parent Contact</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Consecutive Absent</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Monthly %</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {absentStudents.map((s) => (
              <tr key={s.name} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">{s.initials}</div>
                    <span className="font-medium text-foreground">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">{s.grade}</td>
                <td className="px-4 py-3">{s.contact}</td>
                <td className="px-4 py-3 text-center text-destructive font-medium">{s.consecutive}</td>
                <td className="px-4 py-3 text-center text-destructive font-medium">{s.monthly}</td>
                <td className="px-4 py-3"><span className="badge-critical">{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;
