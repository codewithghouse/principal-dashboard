import { useState } from "react";
import { ShieldAlert, Clock, AlertTriangle, AlertCircle, Plus, LayoutGrid, FileText, ArrowRight } from "lucide-react";
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
    location: "Schoo Library",
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

const Discipline = () => {
  const [selectedIncident, setSelectedIncident] = useState<typeof incidentsData[0] | null>(null);

  if (selectedIncident) {
    return <IncidentDetail incident={selectedIncident} onBack={() => setSelectedIncident(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-[#1e293b]">Discipline & Incidents</h1>
        <p className="text-sm text-slate-400 font-medium">Track and manage disciplinary incidents</p>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-start justify-between">
           <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-tight mb-4">Today's Incidents</p>
              <div className="text-4xl font-black text-[#1e293b] mb-1">2</div>
              <p className="text-xs font-bold text-slate-400">Logged today</p>
           </div>
           <div className="p-2 bg-red-50 text-red-500 rounded-full">
              <AlertCircle className="w-5 h-5" />
           </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-start justify-between">
           <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-tight mb-4">Pending Actions</p>
              <div className="text-4xl font-black text-[#1e293b] mb-1">3</div>
              <p className="text-xs font-bold text-slate-400">Require follow-up</p>
           </div>
           <div className="p-2 bg-orange-50 text-orange-500 rounded-full">
              <Clock className="w-5 h-5" />
           </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-start justify-between">
           <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-tight mb-4">This Week</p>
              <div className="text-4xl font-black text-[#1e293b] mb-1">8</div>
              <p className="text-xs font-bold text-slate-400">Total incidents</p>
           </div>
           <div className="p-2 bg-blue-50 text-blue-600 rounded-full">
              <LayoutGrid className="w-5 h-5" />
           </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-start justify-between">
           <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-tight mb-4">Critical Cases</p>
              <div className="text-4xl font-black text-[#1e293b] mb-1">1</div>
              <p className="text-xs font-bold text-slate-400">High priority</p>
           </div>
           <div className="p-2 bg-red-50 text-red-600 rounded-full">
              <AlertTriangle className="w-5 h-5" />
           </div>
        </div>
      </div>

      <div className="flex justify-between items-center py-2">
         <div className="flex gap-4">
            <div className="w-24 h-10 border border-slate-100 rounded-xl bg-white/50" />
            <div className="w-24 h-10 border border-slate-100 rounded-xl bg-white/50" />
            <div className="w-24 h-10 border border-slate-100 rounded-xl bg-white/50" />
         </div>
         <button className="flex items-center gap-2 px-6 py-3 bg-[#e11d48] text-white rounded-xl text-sm font-black shadow-lg shadow-red-200 hover:opacity-90 transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Log New Incident
         </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         {/* Incident Type Breakdown */}
         <div className="lg:col-span-5 bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
            <h3 className="text-xl font-black text-[#1e293b] mb-12">Incident Type Breakdown</h3>
            <div className="relative h-64 flex items-center justify-center">
               <svg viewBox="0 0 100 100" className="w-52 h-52 transform -rotate-[70deg]">
                  {/* Total circumference for r=25 is ~157 */}
                  {/* Behavior (Orange) - 55% */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#f59e0b" strokeWidth="50" strokeDasharray="86.3 157" strokeDashoffset="0" />
                  {/* Academic (Blue) - 25% */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#1e3a8a" strokeWidth="50" strokeDasharray="39.2 157" strokeDashoffset="-86.3" />
                  {/* Safety (Red) - 12% */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#ef4444" strokeWidth="50" strokeDasharray="18.8 157" strokeDashoffset="-125.5" />
                  {/* Property (Grey) - 8% */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#94a3b8" strokeWidth="50" strokeDasharray="12.7 157" strokeDashoffset="-144.3" />
               </svg>
               
               {/* Label: Behavior (Right) */}
               <div className="absolute top-1/2 right-[5%] flex items-center translate-x-1/2">
                  <div className="w-10 h-[1px] bg-slate-200" />
                  <span className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest whitespace-nowrap">Behavior</span>
               </div>
               
               {/* Label: Property (Top Left) */}
               <div className="absolute top-10 left-4 flex items-center">
                  <span className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">Property</span>
                  <div className="w-10 h-[1px] bg-slate-200" />
               </div>
               
               {/* Label: Safety (Left) */}
               <div className="absolute top-[40%] left-4 flex items-center">
                  <span className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">Safety</span>
                  <div className="w-6 h-[1px] bg-red-200" />
               </div>
               
               {/* Label: Academic (Bottom Left) */}
               <div className="absolute bottom-16 left-4 flex items-center">
                  <span className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">Academic</span>
                  <div className="w-10 h-[1px] bg-blue-200" />
               </div>
            </div>
         </div>

         {/* Recent Incidents Table */}
         <div className="lg:col-span-7 bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 flex items-center justify-between">
               <h3 className="text-xl font-black text-[#1e293b]">Recent Incidents</h3>
            </div>
            <div className="overflow-x-auto flex-1">
               <table className="w-full">
                  <thead>
                     <tr className="bg-slate-50 border-y border-slate-100">
                        <th className="text-left px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="text-left px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Student</th>
                        <th className="text-left px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                        <th className="text-left px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Severity</th>
                        <th className="text-left px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="text-left px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                     </tr>
                  </thead>
                  <tbody>
                     {incidentsData.map((inc, i) => (
                        <tr 
                          key={i} 
                          className={`border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer group ${inc.severity === 'CRITICAL' ? 'bg-red-50/30' : ''}`}
                          onClick={() => setSelectedIncident(inc)}
                        >
                           <td className="px-8 py-6 text-xs font-bold text-slate-500 whitespace-nowrap">{inc.date}</td>
                           <td className="px-8 py-6">
                              <p className="text-sm font-black text-[#1e293b] group-hover:text-[#1e3a8a] transition-colors">{inc.student.name} ({inc.student.grade})</p>
                           </td>
                           <td className="px-8 py-6 text-sm font-bold text-slate-600">{inc.type}</td>
                           <td className="px-8 py-6">
                              <span className={`text-[11px] font-black italic tracking-tighter ${inc.severity === 'CRITICAL' ? 'text-red-500' : 'text-orange-500'}`}>
                                 {inc.severity}
                              </span>
                           </td>
                           <td className="px-8 py-6">
                              <span className={`text-sm font-bold ${inc.status === "Resolved" ? "text-green-500" : inc.status === "Open" ? "text-orange-500" : "text-red-500"}`}>
                                 {inc.status}
                              </span>
                           </td>
                           <td className="px-8 py-6">
                              <button className="text-sm font-black text-[#1e3a8a] uppercase tracking-tighter hover:underline flex items-center gap-1">
                                 View <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex items-center justify-between">
               <button className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-[#1e3a8a] transition-colors">
                  <LayoutGrid className="w-4 h-4" /> View All Incidents
               </button>
               <button className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-[#1e3a8a] transition-colors">
                  <FileText className="w-4 h-4" /> Generate Report
               </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Discipline;
