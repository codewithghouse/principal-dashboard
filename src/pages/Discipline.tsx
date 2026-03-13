import { useState } from "react";
import { ShieldAlert, Clock, AlertTriangle, AlertCircle, Plus, LayoutGrid, FileText, Calendar } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import IncidentDetail from "@/components/IncidentDetail";

const incidentsData = [
  {
    id: "#INC-2026-0117",
    title: "Bullying Incident - Physical Altercation",
    date: "Jan 17, 2026",
    time: "11:30 AM",
    location: "School Playground",
    reportedBy: "Mr. Verma",
    student: {
      name: "Rahul Sharma",
      grade: "9A",
      rollNo: "205",
      initials: "RS",
      riskStatus: "Critical",
      previousIncidents: 3
    },
    type: "Bullying",
    severity: "CRITICAL",
    status: "Under Review",
    description: "Student Rahul Sharma was involved in a physical altercation with another student during recess. Witnesses report that Rahul pushed the other student to the ground after a verbal argument. The victim sustained minor bruises. Mr. Verma intervened and separated the students immediately.",
    witnesses: [
      { name: "Ankit Kumar", grade: "9A", initials: "AK", color: "bg-[#1e3a8a]" },
      { name: "Sneha Patel", grade: "9B", initials: "SP", color: "bg-[#22c55e]" }
    ],
    actionLog: [
      { action: "Incident Reported", time: "Jan 17, 2026 • 11:45 AM", by: "Mr. Verma", color: "bg-green-500" },
      { action: "Student Isolated", time: "Jan 17, 2026 • 12:00 PM", by: "Principal Office", color: "bg-orange-500" }
    ]
  },
  {
    id: "#INC-2026-0116",
    title: "Disruptive Behavior during Assembly",
    date: "Jan 16, 2026",
    time: "09:15 AM",
    location: "Assembly Hall",
    reportedBy: "Ms. Priya",
    student: { name: "Priya Patel", grade: "8B", rollNo: "112", initials: "PP", riskStatus: "Normal", previousIncidents: 1 },
    type: "Disruptive Behavior",
    severity: "MEDIUM",
    status: "Resolved",
    description: "Standard disruptive behavior during the morning assembly.",
    witnesses: [],
    actionLog: []
  },
  {
    id: "#INC-2026-0115",
    title: "Vandalism - Library Desk",
    date: "Jan 15, 2026",
    time: "02:45 PM",
    location: "School Library",
    reportedBy: "Librarian",
    student: { name: "Arjun Mehta", grade: "9C", rollNo: "331", initials: "AM", riskStatus: "At Risk", previousIncidents: 2 },
    type: "Property Damage",
    severity: "MEDIUM",
    status: "Open",
    description: "Intentional damage to library property.",
    witnesses: [],
    actionLog: []
  },
];

const pieData = [
  { name: "Behavioral", value: 55, color: "#f59e0b" },
  { name: "Academic", value: 25, color: "#1e3a8a" },
  { name: "Safety", value: 12, color: "#ef4444" },
  { name: "Property", value: 8, color: "#94a3b8" },
];

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, outerRadius, name }: any) => {
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      fontSize={10} fontWeight={700} fill="#64748b">
      {name}
    </text>
  );
};

const Discipline = () => {
  const [selectedIncident, setSelectedIncident] = useState<typeof incidentsData[0] | null>(null);

  if (selectedIncident) {
    return <IncidentDetail incident={selectedIncident} onBack={() => setSelectedIncident(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Discipline & Incidents</h1>
        <p className="text-sm text-muted-foreground">Track and manage disciplinary incidents</p>
      </div>

      {/* ===== 4 STAT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Today's Incidents */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Today's Incidents</span>
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
          </div>
          <p className="text-4xl font-black text-foreground mb-1">2</p>
          <p className="text-xs text-muted-foreground font-medium">Logged today</p>
        </div>

        {/* Pending Actions */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Pending Actions</span>
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <p className="text-4xl font-black text-red-500 mb-1">3</p>
          <p className="text-xs text-muted-foreground font-medium">Require follow-up</p>
        </div>

        {/* This Week */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">This Week</span>
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-4xl font-black text-foreground mb-1">8</p>
          <p className="text-xs text-muted-foreground font-medium">Total incidents</p>
        </div>

        {/* Critical Cases */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Critical Cases</span>
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
          </div>
          <p className="text-4xl font-black text-red-500 mb-1">1</p>
          <p className="text-xs text-muted-foreground font-medium">High priority</p>
        </div>
      </div>

      {/* ===== FILTER ROW + LOG BUTTON ===== */}
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          {['All Types', 'This Week', 'Critical Only'].map((f, i) => (
            <button key={i} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
              i === 0 ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-card border-border text-muted-foreground hover:bg-secondary'
            }`}>
              {f}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-[#e11d48] text-white rounded-xl text-sm font-bold shadow-lg shadow-red-200 hover:bg-red-600 transition-all">
          <Plus className="w-4 h-4" /> Log New Incident
        </button>
      </div>

      {/* ===== PIE CHART + RECENT INCIDENTS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Incident Type Breakdown - PieChart */}
        <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-2">Incident Type Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={85}
                dataKey="value"
                label={renderLabel}
                labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                animationBegin={0}
                animationDuration={1200}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value}%`, name]}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Incidents Table */}
        <div className="lg:col-span-7 bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-7 py-5">
            <h3 className="text-base font-bold text-foreground">Recent Incidents</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-y border-border bg-secondary/30">
                  <th className="text-left px-7 py-3 text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Date</th>
                  <th className="text-left px-7 py-3 text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Student</th>
                  <th className="text-left px-7 py-3 text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Type</th>
                  <th className="text-left px-7 py-3 text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Severity</th>
                  <th className="text-left px-7 py-3 text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Status</th>
                  <th className="text-left px-7 py-3 text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {incidentsData.map((inc, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-secondary/30 transition-colors cursor-pointer ${inc.severity === 'CRITICAL' ? 'bg-red-50/30' : ''}`}
                    onClick={() => setSelectedIncident(inc)}
                  >
                    <td className="px-7 py-5 text-sm font-medium text-muted-foreground whitespace-nowrap">{inc.date}</td>
                    <td className="px-7 py-5 text-sm font-bold text-foreground">{inc.student.name} ({inc.student.grade})</td>
                    <td className="px-7 py-5 text-sm font-medium text-foreground">{inc.type}</td>
                    <td className="px-7 py-5">
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        inc.severity === 'CRITICAL' ? 'text-red-500' : 'text-amber-500'
                      }`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-7 py-5">
                      <span className={`text-sm font-bold ${
                        inc.status === "Resolved" ? "text-muted-foreground" :
                        inc.status === "Open" ? "text-foreground" :
                        "text-foreground"
                      }`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="px-7 py-5">
                      <button className="text-sm font-bold text-[#1e3a8a] hover:underline">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <LayoutGrid className="w-4 h-4 text-muted-foreground" /> View All Incidents
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <FileText className="w-4 h-4 text-muted-foreground" /> Generate Report
        </button>
      </div>
    </div>
  );
};

export default Discipline;
