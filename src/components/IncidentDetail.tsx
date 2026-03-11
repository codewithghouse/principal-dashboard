import React from 'react';
import { ChevronLeft, Calendar, MapPin, User, UserCheck, AlertTriangle, FileEdit, ArrowUpRight, Megaphone, CheckCircle2, MoreVertical } from 'lucide-react';

interface IncidentDetailProps {
  incident: {
    id: string;
    title: string;
    date: string;
    time: string;
    location: string;
    reportedBy: string;
    severity: string;
    status: string;
    student: {
      name: string;
      grade: string;
      rollNo: string;
      initials: string;
      riskStatus: string;
      previousIncidents: number;
    };
    description: string;
    witnesses: { name: string; grade: string; initials: string; color: string }[];
    actionLog: { action: string; time: string; by: string; color: string }[];
  };
  onBack: () => void;
}

const IncidentDetail = ({ incident, onBack }: IncidentDetailProps) => {
  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Discipline</span>
        <span>/</span>
        <span className="text-foreground font-medium">Incident Detail</span>
      </div>

      <div className="bg-[#fff1f2] border border-red-100 rounded-3xl p-8 mb-8 relative shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Incident ID: {incident.id}</span>
          <span className="px-3 py-1 bg-red-500 text-white text-[10px] font-black rounded-full uppercase tracking-tighter shadow-sm">
            {incident.severity}
          </span>
        </div>
        
        <div className="flex justify-between items-start">
           <div>
              <h1 className="text-3xl font-black text-[#1e293b] mb-4">{incident.title}</h1>
              <div className="flex flex-wrap items-center gap-6 text-sm font-bold text-slate-500 mt-2">
                 <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-300" /> {incident.date} • {incident.time}</span>
                 <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-300" /> {incident.location}</span>
                 <span className="flex items-center gap-2"><User className="w-4 h-4 text-slate-300" /> Reported by: {incident.reportedBy}</span>
              </div>
           </div>
           <div className="text-right">
              <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Status</span>
              <span className="px-6 py-2 bg-orange-50 text-orange-500 border border-orange-100 rounded-2xl text-xs font-black shadow-sm group cursor-pointer hover:bg-orange-100 transition-colors">
                {incident.status}
              </span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Involved Student & Witnesses */}
        <div className="lg:col-span-4 space-y-8">
           <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-8">Involved Student</h3>
              <div className="flex items-center gap-5 mb-8">
                 <div className="w-20 h-20 bg-red-500 rounded-3xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-red-100">
                   {incident.student.initials}
                 </div>
                 <div>
                    <h4 className="text-xl font-black text-[#1e293b] leading-tight">{incident.student.name}</h4>
                    <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-tight">Grade {incident.student.grade} • Roll {incident.student.rollNo}</p>
                 </div>
              </div>
              <div className="space-y-4 pt-6 border-t border-slate-50">
                 <div className="flex justify-between">
                    <span className="text-sm font-bold text-slate-400">Previous Incidents</span>
                    <span className="text-sm font-black text-red-500">{incident.student.previousIncidents}</span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-sm font-bold text-slate-400">Risk Status</span>
                    <span className="text-sm font-black text-red-500">{incident.student.riskStatus}</span>
                 </div>
                 <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 text-[#1e3a8a] text-sm font-black hover:bg-slate-50 rounded-2xl transition-colors">
                    <UserCheck className="w-4 h-4" /> View Student Profile
                 </button>
              </div>
           </div>

           <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-6">Witnesses</h3>
              <div className="space-y-4">
                 {incident.witnesses.map((w, i) => (
                   <div key={i} className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl">
                      <div className={`w-10 h-10 rounded-xl ${w.color} flex items-center justify-center text-white text-xs font-black shadow-sm`}>
                        {w.initials}
                      </div>
                      <span className="text-sm font-black text-[#475569]">{w.name} ({w.grade})</span>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Middle Column: Description & Action Taken Log */}
        <div className="lg:col-span-4 space-y-8">
           <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm h-fit">
              <h3 className="text-lg font-black text-[#1e293b] mb-6">Incident Description</h3>
              <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-3xl leading-relaxed">
                 <p className="text-sm font-medium text-slate-600 italic">
                    {incident.description}
                 </p>
              </div>
           </div>

           <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-8">Action Taken Log</h3>
              <div className="space-y-8 relative">
                 <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-100" />
                 {incident.actionLog.map((log, i) => (
                   <div key={i} className="relative pl-10">
                      <div className={`absolute left-0 top-1 w-4 h-4 rounded-full ${log.color} ring-4 ring-white shadow-sm`} />
                      <div>
                         <p className="text-sm font-black text-[#1e293b] leading-tight">{log.action}</p>
                         <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
                            {log.time} by {log.by}
                         </p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Right Column: Take Action & Resolution Notes */}
        <div className="lg:col-span-4 space-y-8">
           <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-8">Take Action</h3>
              <div className="space-y-3">
                 {[
                   { label: 'Update Status', icon: FileEdit, primary: true },
                   { label: 'Escalate', icon: ArrowUpRight },
                   { label: 'Notify Parents', icon: Megaphone },
                   { label: 'Close Incident', icon: CheckCircle2 },
                 ].map((act, i) => (
                   <button 
                     key={i}
                     className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-black transition-all ${
                       act.primary 
                       ? 'bg-[#1e3a8a] text-white shadow-lg shadow-blue-100 ring-2 ring-blue-500/20' 
                       : 'bg-white border border-slate-100 text-[#475569] hover:bg-slate-50'
                     }`}
                   >
                     <act.icon className={`w-5 h-5 ${act.primary ? 'text-white' : 'text-slate-400'}`} />
                     {act.label}
                   </button>
                 ))}
              </div>
           </div>

           <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-6">Resolution Notes</h3>
              <div className="p-6 h-40 bg-slate-50/50 border border-slate-100 border-dashed rounded-3xl flex items-center justify-center">
                 <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">No notes added yet</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default IncidentDetail;
