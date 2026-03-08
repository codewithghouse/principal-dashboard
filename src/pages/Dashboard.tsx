import { Users, GraduationCap, CalendarCheck, AlertCircle, Heart, ArrowUp, ArrowDown, Star } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "@/components/dashboard/StatCard";

const attendanceData = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  value: 88 + Math.random() * 6 - (i > 18 && i < 24 ? 3 : 0),
}));

const riskAlerts = [
  { name: "Rahul Sharma - 9A", detail: "Attendance 45% | Math Failed", level: "CRITICAL" as const },
  { name: "Priya Patel - 8B", detail: "3 Discipline incidents", level: "WARNING" as const },
  { name: "Class 10C Overall", detail: "Science avg below 50%", level: "WARNING" as const },
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

      {/* Risk Alerts & Attendance Trend */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Today's Risk Alerts</h2>
            <button className="text-sm text-primary font-medium hover:underline">View All →</button>
          </div>
          <div className="space-y-3">
            {riskAlerts.map((alert, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${alert.level === "CRITICAL" ? "bg-destructive" : "bg-warning"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.name}</p>
                    <p className="text-xs text-muted-foreground">{alert.detail}</p>
                  </div>
                </div>
                <span className={alert.level === "CRITICAL" ? "badge-critical" : "badge-warning"}>
                  {alert.level}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-2 bg-card rounded-lg border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Attendance Trend (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 90%)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(220 10% 50%)" />
              <YAxis domain={[85, 96]} tick={{ fontSize: 11 }} stroke="hsl(220 10% 50%)" tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Attendance"]} />
              <Line type="monotone" dataKey="value" stroke="hsl(220, 60%, 25%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Teacher Performance */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Teacher Performance</h2>
          <button className="text-sm text-primary font-medium hover:underline">View All →</button>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">MK</div>
          <div>
            <p className="text-sm font-medium text-foreground">Mrs. Kavita</p>
            <p className="text-xs text-muted-foreground">Mathematics</p>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Star className="w-4 h-4 text-warning fill-warning" />
            <span className="text-sm font-semibold">4.8</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
