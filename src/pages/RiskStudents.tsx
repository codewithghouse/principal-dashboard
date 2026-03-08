import { AlertTriangle, AlertCircle, Users } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

const riskStudents = [
  { initials: "RS", name: "Rahul Sharma", grade: "9A", roll: "205", level: "CRITICAL", factors: "Attendance, Academics", days: "15 days", lastAction: "Parent called - no response", assigned: "Mrs. Kavita" },
  { initials: "AK", name: "Ankit Kumar", grade: "10C", roll: "412", level: "CRITICAL", factors: "Academics, Discipline", days: "8 days", lastAction: "Counselor assigned", assigned: "Mr. Sharma" },
  { initials: "PP", name: "Priya Patel", grade: "8B", roll: "156", level: "WARNING", factors: "Discipline (3 incidents)", days: "5 days", lastAction: "Warning letter sent", assigned: "Mrs. Reddy" },
];

const tabs = ["All (12)", "Critical (4)", "Warning (8)", "Monitoring"];

const RiskStudents = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Students</h1>
        <p className="text-sm text-muted-foreground">Monitor and intervene with at-risk students</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total At-Risk" value={12} subtitle="↑ 2 from last week" subtitleColor="destructive" icon={AlertTriangle} iconColor="text-destructive" />
        <StatCard title="Critical" value={4} subtitle="Immediate action" subtitleColor="muted" icon={AlertCircle} iconColor="text-destructive" />
        <StatCard title="Warning" value={8} subtitle="Monitor closely" subtitleColor="muted" icon={AlertTriangle} iconColor="text-warning" />
        <StatCard title="New This Week" value={3} subtitle="Since Monday" subtitleColor="muted" icon={Users} iconColor="text-primary" />
      </div>

      <div className="flex items-center gap-2">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm rounded-full font-medium transition-colors ${
              i === 0 ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:bg-secondary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Student</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Risk Level</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Risk Factors</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Days Flagged</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Last Action</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Assigned To</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {riskStudents.map((s) => (
              <tr key={s.roll} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">{s.initials}</div>
                    <div>
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.grade} • Roll {s.roll}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={s.level === "CRITICAL" ? "badge-critical" : "badge-warning"}>{s.level}</span>
                </td>
                <td className="px-4 py-3 text-foreground">{s.factors}</td>
                <td className="px-4 py-3 text-center text-foreground">{s.days}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.lastAction}</td>
                <td className="px-4 py-3 text-foreground">{s.assigned}</td>
                <td className="px-4 py-3 text-center">
                  <button className="text-primary text-sm font-medium hover:underline">View Action</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RiskStudents;
