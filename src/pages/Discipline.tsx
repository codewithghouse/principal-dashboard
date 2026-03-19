import { useState, useEffect } from "react";
import { ShieldAlert, Clock, AlertTriangle, AlertCircle, Plus, LayoutGrid, FileText, Calendar, Pin, PinOff } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, limit, getDocs } from "firebase/firestore";
import IncidentDetail from "@/components/IncidentDetail";
import DisciplineIntelligence from "@/components/DisciplineIntelligence";

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

// FEATURE 4: Severity Mapping
const getSeverityBadge = (severity: string) => {
  const s = severity?.toUpperCase() || 'LOW';
  if (s === 'HIGH' || s === 'CRITICAL') return <span className="px-3 py-1 bg-red-100 text-red-700 border border-red-200 text-[10px] font-black uppercase tracking-wider rounded-md">High (Action Req)</span>;
  if (s === 'MEDIUM') return <span className="px-3 py-1 bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black uppercase tracking-wider rounded-md">Medium (Warning)</span>;
  return <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black uppercase tracking-wider rounded-md">Low (Note)</span>;
};

const Discipline = () => {
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // FEATURE 7: Critical Case Pinning state (locally mocked for demonstration if Firebase lacks 'pinned' fields)
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const q = query(collection(db, "incidents"), limit(50));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setIncidents(data);
        }
      } catch (e) {
        console.warn("Incidents fetch error", e);
      }
      setLoading(false);
    };
    fetchIncidents();
  }, []);

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPinnedIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  };

  const pinnedCases = incidents.filter(i => pinnedIds.includes(i.id));
  const otherIncidents = incidents.filter(i => !pinnedIds.includes(i.id));

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

      {!loading && incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card border border-dashed border-border rounded-3xl mt-10 shadow-sm">
          <ShieldAlert className="w-16 h-16 text-slate-300 mb-6" />
          <h2 className="text-xl font-bold text-slate-700 mb-2">No incidents recorded yet.</h2>
          <p className="text-sm text-slate-500 font-medium max-w-md text-center">
            The Discipline system will automatically activate and display analytics once incident reports and severity warnings are logged into the database.
          </p>
        </div>
      ) : (
        <>
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

          {/* ===== FEATURE 7: PINNED CASES PANEL ===== */}
          {pinnedCases.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm mt-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                 <Pin className="w-5 h-5 text-red-600 fill-red-600" />
                 <h2 className="text-base font-bold text-red-900">Critical Pinned Cases</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                 {pinnedCases.map(inc => (
                    <div key={inc.id} onClick={() => setSelectedIncident(inc)} className="bg-white border border-red-100 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow relative group">
                       <button onClick={(e) => togglePin(e, inc.id)} className="absolute top-3 right-3 p-1 rounded hover:bg-red-50 transition-colors">
                          <PinOff className="w-4 h-4 text-red-400" />
                       </button>
                       <p className="text-xs font-bold text-muted-foreground mb-1">{inc.date}</p>
                       <h3 className="text-sm font-bold text-slate-800 mb-1 pr-6 truncate">{inc.title || inc.type}</h3>
                       <p className="text-xs font-medium text-red-600 mb-3">{inc.student?.name || "Unknown Student"}</p>
                       <div className="flex items-center justify-between mt-auto">
                          {getSeverityBadge(inc.severity)}
                          <span className="text-[10px] font-black uppercase text-slate-400">{inc.status}</span>
                       </div>
                    </div>
                 ))}
              </div>
            </div>
          )}

          {/* ===== FILTER ROW + LOG BUTTON ===== */}
          <div className="flex justify-between items-center pt-2">
            <div className="flex gap-3">
              {['All Types', 'This Week', 'Critical Only'].map((f, i) => (
                <button key={i} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  i === 0 ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-card border-border text-muted-foreground hover:bg-secondary'
                }`}>
                  {f}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-[#e11d48] text-white rounded-xl text-sm font-bold shadow-lg shadow-red-200 hover:bg-red-600 transition-all cursor-not-allowed opacity-80" title="Activate once logged.">
              <Plus className="w-4 h-4" /> Log New Incident
            </button>
          </div>

          {/* ===== PIE CHART + RECENT INCIDENTS ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Incident Type Breakdown - PieChart */}
            <div className="lg:col-span-4 bg-card border border-border rounded-2xl p-7 shadow-sm">
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
            <div className="lg:col-span-8 space-y-6">
              {/* FEATURE 5: ONGOING WORKFLOW CASES */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-7 py-5 border-b border-border flex items-center gap-3">
                   <Clock className="w-5 h-5 text-amber-500" />
                   <h3 className="text-base font-bold text-foreground">Ongoing Workflow Cases</h3>
                </div>
                {otherIncidents.filter(i => i.status !== 'Resolved').length === 0 ? (
                   <div className="py-10 text-center bg-slate-50">
                     <p className="text-sm font-bold text-slate-500">No active workflow cases currently tracked.</p>
                   </div>
                ) : (
                  <div className="divide-y divide-border">
                    {otherIncidents.filter(i => i.status !== 'Resolved').map((inc, i) => (
                      <div key={inc.id || i} className="p-4 px-7 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedIncident(inc)}>
                         <div>
                            <p className="text-sm font-bold text-slate-800 mb-1">{inc.student?.name || 'Unknown'} <span className="text-xs text-red-500 ml-2">({inc.severity || 'Medium'})</span></p>
                            <p className="text-xs font-medium text-slate-500">{inc.title || inc.type}</p>
                         </div>
                         <div className="text-right">
                           <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">{inc.status || 'Reported'}</span>
                           <p className="text-[10px] text-slate-400 mt-1">{inc.date}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Full Incident Directory */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-7 py-5">
                  <h3 className="text-base font-bold text-foreground">Full Incident Directory</h3>
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
                        <th className="text-center px-7 py-3 text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Pin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {otherIncidents.map((inc, i) => (
                        <tr
                          key={inc.id || i}
                          className={`hover:bg-secondary/30 transition-colors cursor-pointer ${inc.severity?.toUpperCase() === 'CRITICAL' || inc.severity?.toUpperCase() === 'HIGH' ? 'bg-red-50/20' : ''}`}
                          onClick={() => setSelectedIncident(inc)}
                        >
                          <td className="px-7 py-5 text-sm font-medium text-muted-foreground whitespace-nowrap">{inc.date}</td>
                          <td className="px-7 py-5 text-sm font-bold text-foreground">{inc.student?.name || 'Unknown'}</td>
                          <td className="px-7 py-5 text-sm font-medium text-foreground">{inc.type || inc.title}</td>
                          <td className="px-7 py-5">
                            {getSeverityBadge(inc.severity)}
                          </td>
                          <td className="px-7 py-5">
                            <span className={`text-sm font-bold ${
                              inc.status === "Resolved" ? "text-green-600" :
                              inc.status === "Open" ? "text-amber-600" :
                              "text-slate-600"
                            }`}>
                              {inc.status || 'Reported'}
                            </span>
                          </td>
                          <td className="px-7 py-5 text-center">
                            <button 
                               onClick={(e) => togglePin(e, inc.id)} 
                               className="p-2 rounded-lg hover:bg-slate-200 transition-colors"
                               title="Pin Case to Dashboard"
                            >
                               <Pin className="w-4 h-4 text-slate-400 hover:text-red-500" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* AI Discipline Engine Layer (Features 19 & 21) */}
      <div className="mt-8 mb-8">
         <DisciplineIntelligence />
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <LayoutGrid className="w-4 h-4 text-muted-foreground" /> View All Archives
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <FileText className="w-4 h-4 text-muted-foreground" /> Generate Full Report
        </button>
      </div>
    </div>
  );
};

export default Discipline;
