import { ShieldAlert, Clock, AlertTriangle, AlertCircle, Plus } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

const incidents = [
  { date: "Jan 17, 2026", student: "Rahul Sharma (9A)", type: "Bullying", severity: "CRITICAL", status: "Under Review" },
  { date: "Jan 16, 2026", student: "Priya Patel (8B)", type: "Disruptive Behavior", severity: "MEDIUM", status: "Resolved" },
  { date: "Jan 15, 2026", student: "Arjun Mehta (9C)", type: "Property Damage", severity: "MEDIUM", status: "Open" },
];

const Discipline = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Discipline & Incidents</h1>
          <p className="text-sm text-muted-foreground">Track and manage disciplinary incidents</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-4 h-4" /> Log New Incident
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Incidents" value={12} subtitle="Logged today" subtitleColor="muted" icon={ShieldAlert} iconColor="text-primary" />
        <StatCard title="Pending Actions" value={2} subtitle="Require follow-up" subtitleColor="warning" icon={Clock} iconColor="text-warning" />
        <StatCard title="This Week" value={3} subtitle="Total incidents" subtitleColor="muted" icon={AlertTriangle} iconColor="text-warning" />
        <StatCard title="Critical Cases" value={1} subtitle="High priority" subtitleColor="destructive" icon={AlertCircle} iconColor="text-destructive" />
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Recent Incidents</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Student</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Type</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Severity</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3 text-muted-foreground">{inc.date}</td>
                <td className="px-4 py-3 font-medium text-foreground">{inc.student}</td>
                <td className="px-4 py-3">{inc.type}</td>
                <td className="px-4 py-3">
                  <span className={inc.severity === "CRITICAL" ? "badge-critical" : "badge-warning"}>{inc.severity}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${inc.status === "Resolved" ? "text-success" : inc.status === "Open" ? "text-warning" : "text-destructive"}`}>
                    {inc.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button className="text-primary text-sm font-medium hover:underline">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button className="text-sm text-primary font-medium hover:underline">View All Incidents</button>
          <button className="text-sm text-primary font-medium hover:underline">Generate Report</button>
        </div>
      </div>
    </div>
  );
};

export default Discipline;
