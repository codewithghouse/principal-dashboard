import { useState } from "react";
import { AlertTriangle, AlertCircle, Users } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import RiskIntervention from "@/components/RiskIntervention";

const riskStudents = [
  { initials: "RS", name: "Rahul Sharma", grade: "9A", roll: "205", level: "CRITICAL", factors: "Attendance, Academics", days: "15 days", lastAction: "Parent called - no response", assigned: "Mrs. Kavita" },
  { initials: "AK", name: "Ankit Kumar", grade: "10C", roll: "412", level: "CRITICAL", factors: "Academics, Discipline", days: "8 days", lastAction: "Counselor assigned", assigned: "Mr. Sharma" },
  { initials: "PP", name: "Priya Patel", grade: "8B", roll: "156", level: "WARNING", factors: "Discipline (3 incidents)", days: "5 days", lastAction: "Warning letter sent", assigned: "Mrs. Reddy" },
];

const tabs = ["All (12)", "Critical (4)", "Warning (8)", "Monitoring"];

const RiskStudents = () => {
  const [selectedStudent, setSelectedStudent] = useState<typeof riskStudents[0] | null>(null);

  if (selectedStudent) {
    return <RiskIntervention student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Students</h1>
        <p className="text-sm text-muted-foreground">Monitor and intervene with at-risk students</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total At-Risk" value={12} subtitle="↑ 2 from last week" subtitleColor="destructive" icon={AlertTriangle} iconColor="text-destructive" />
        <StatCard title="Critical" value={4} subtitle="Immediate action" subtitleColor="muted" icon={AlertCircle} iconColor="text-destructive" />
        <StatCard title="Warning" value={8} subtitle="Monitor closely" subtitleColor="muted" icon={AlertTriangle} iconColor="text-warning" />
        <StatCard title="New This Week" value={3} subtitle="Since Monday" subtitleColor="muted" icon={Users} iconColor="text-primary" />
      </div>

      <div className="flex items-center gap-2">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            className={`px-5 py-2 text-sm rounded-full font-bold transition-all ${
              i === 0 ? "bg-primary text-primary-foreground shadow-md" : "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-wider text-[11px]">Student</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-wider text-[11px]">Risk Level</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-wider text-[11px]">Risk Factors</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-bold uppercase tracking-wider text-[11px]">Days Flagged</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-wider text-[11px]">Last Action</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-wider text-[11px]">Assigned To</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-bold uppercase tracking-wider text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {riskStudents.map((s) => (
                <tr key={s.roll} className="group hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-sm ${
                        s.level === 'CRITICAL' ? 'bg-destructive text-white' : 'bg-primary text-white'
                      }`}>{s.initials}</div>
                      <div>
                        <p className="font-bold text-foreground leading-tight">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">{s.grade} • Roll {s.roll}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      s.level === "CRITICAL" ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-warning/10 text-warning border border-warning/20"
                    }`}>
                      {s.level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-foreground font-medium">{s.factors}</td>
                  <td className="px-6 py-4 text-center text-foreground font-bold">{s.days}</td>
                  <td className="px-6 py-4 text-muted-foreground font-medium italic">"{s.lastAction}"</td>
                  <td className="px-6 py-4 text-foreground font-bold">{s.assigned}</td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => setSelectedStudent(s)}
                      className="bg-primary/5 text-primary border border-primary/10 px-4 py-2 rounded-lg text-xs font-bold hover:bg-primary hover:text-white transition-all shadow-sm"
                    >
                      View Action
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RiskStudents;

