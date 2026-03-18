import React from 'react';
import { ChevronLeft, Calendar, MapPin, User, UserCheck, FileEdit, ArrowUpRight, Send, CheckCircle2, FileText, Image, ShieldAlert, Check, Clock, AlertCircle } from 'lucide-react';

interface IncidentDetailProps {
  incident: any;
  onBack: () => void;
}

// FEATURE 5: Incident Workflow Tracking
const getWorkflowStages = (status: string) => {
  const s = status?.toUpperCase() || 'REPORTED';
  const stages = [
    { label: 'Reported', active: true, completed: true },
    { label: 'Investigation', active: s === 'INVESTIGATION' || s === 'OPEN' || s === 'ACTION_TAKEN' || s === 'RESOLVED', completed: s === 'ACTION_TAKEN' || s === 'RESOLVED' },
    { label: 'Action Taken', active: s === 'ACTION_TAKEN' || s === 'RESOLVED', completed: s === 'RESOLVED' },
    { label: 'Resolved', active: s === 'RESOLVED', completed: s === 'RESOLVED' }
  ];
  return stages;
};

const IncidentDetail = ({ incident, onBack }: IncidentDetailProps) => {
  const safeWitnesses = incident?.witnesses || [];
  const safeActionLog = incident?.actionLog || [];
  const safeAttachments = incident?.attachments || [];
  
  const workflow = getWorkflowStages(incident?.status);

  // FEATURE 6: Action Timeline Generator (Ensures timeline always shows when action req)
  const fullActionLog = safeActionLog.length > 0 ? safeActionLog : [
     { action: "Incident Logged", time: incident?.date || "Recently", by: incident?.reportedBy || "System", color: "bg-blue-500" }
  ];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Discipline Archives</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Incident Details</span>
      </div>

      {/* ===== INCIDENT HEADER ===== */}
      <div className={`rounded-2xl p-7 mb-6 shadow-sm border ${incident?.severity?.toUpperCase() === 'CRITICAL' ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}>
        {/* Top: ID + Severity + Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Case ID: {incident?.id || '#NEW-CASE'}</span>
            <span className={`px-3 py-1 ${incident?.severity?.toUpperCase() === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'} text-[10px] font-bold rounded-full uppercase tracking-wider shadow-sm`}>
              {incident?.severity || 'MEDIUM'}
            </span>
          </div>
          <div className="text-right flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Status:</span>
            <span className={`text-sm font-black ${incident?.status === 'Resolved' ? 'text-green-600' : 'text-amber-500'}`}>{incident?.status || 'Open Investigation'}</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-foreground mb-5">{incident?.title || incident?.type || 'Undocumented Incident'}</h1>

        {/* FEATURE 5: WORKFLOW TRACKER */}
        <div className="flex items-center w-full mt-2 mb-6 max-w-2xl px-2">
           {workflow.map((stage, i) => (
              <React.Fragment key={i}>
                <div className="relative flex flex-col items-center group">
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 ${stage.completed ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white' : stage.active ? 'bg-blue-50 border-blue-400 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-300'}`}>
                      {stage.completed ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                   </div>
                   <span className={`absolute -bottom-6 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider ${stage.active ? 'text-foreground' : 'text-muted-foreground'}`}>{stage.label}</span>
                </div>
                {i < workflow.length - 1 && (
                   <div className={`flex-1 h-1 rounded-full mx-2 ${workflow[i+1].active ? 'bg-[#1e3a8a]' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
           ))}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground pt-3 border-t border-border/50">
          <span className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-4 h-4" /> {incident?.date || 'Unknown Date'} • {incident?.time || ''}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <MapPin className="w-4 h-4" /> {incident?.location || 'Unknown Location'}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <User className="w-4 h-4" /> Rep. by: {incident?.reportedBy || 'Anonymous'}
          </span>
        </div>
      </div>

      {/* ===== 3-COLUMN CONTENT ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-6">
          {/* Involved Student */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-base font-bold text-foreground mb-5">Primary Student</h3>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0">
                {incident?.student?.name ? incident.student.name.substring(0, 2).toUpperCase() : '??'}
              </div>
              <div>
                <h4 className="text-base font-bold text-foreground">{incident?.student?.name || 'Unknown Student'}</h4>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Grade {incident?.student?.grade || 'N/A'}</p>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex justify-between items-center bg-red-50 p-2.5 rounded-lg border border-red-100">
                <span className="text-xs font-bold text-red-900">Total Offenses</span>
                <span className="text-sm font-black text-red-600">{incident?.student?.previousIncidents || 'Unknown'}</span>
              </div>
            </div>
            <button className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 text-[#1e3a8a] text-sm font-bold bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
              <UserCheck className="w-4 h-4" /> Open Dossier
            </button>
          </div>

          {/* FEATURE 8: Witness Engagement Logic */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5 flex items-center justify-between">
              Witness Accounts <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{safeWitnesses.length} Recorded</span>
            </h3>
            {safeWitnesses.length === 0 ? (
               <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500">No witnesses attached to this case.</p>
               </div>
            ) : (
               <div className="space-y-4">
                 {safeWitnesses.map((w: any, i: number) => (
                   <div key={i} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                     <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded-full ${w.color || 'bg-blue-500'} flex items-center justify-center text-white text-[10px] font-bold shadow-sm`}>
                         {w.initials || w.name?.substring(0,2).toUpperCase() || 'W'}
                       </div>
                       <div>
                         <span className="text-sm font-bold text-foreground block">{w.name} <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-muted-foreground ml-1">Grade {w.grade}</span></span>
                       </div>
                     </div>
                     {w.statement && (
                        <p className="text-xs text-slate-600 font-medium italic bg-white p-2 rounded-lg border border-slate-100 border-l-2 border-l-blue-400">"{w.statement}"</p>
                     )}
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>

        {/* ===== MIDDLE COLUMN ===== */}
        <div className="space-y-6">
          {/* Incident Description */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Official Synopsis</h3>
            <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-xl">
              <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                {incident?.description || 'No detailed description available for this incident.'}
              </p>
            </div>
          </div>

          {/* FEATURE 6: Action Timeline Generator */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-6">Action Timeline Log</h3>
            {safeActionLog.length === 0 ? (
               <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 pb-2">
                  <p className="text-xs font-bold text-slate-500">No actions logged for this incident yet.</p>
               </div>
            ) : (
               <div className="relative pl-3 border-l-2 border-slate-100 space-y-6 pb-2">
                   {fullActionLog.map((log: any, i: number) => (
                     <div key={i} className="relative">
                        <div className={`absolute -left-[17px] top-1 w-3 h-3 rounded-full border-2 border-white ring-2 ring-slate-100 ${log.color || 'bg-slate-400'}`} />
                        <div className="pl-5">
                           <p className="text-sm font-bold text-slate-800">{log.action}</p>
                           <p className="text-xs text-slate-500 font-medium mt-0.5">{log.time} • Recorded by <span className="font-bold">{log.by}</span></p>
                        </div>
                     </div>
                   ))}
               </div>
            )}
          </div>
        </div>

        {/* ===== RIGHT COLUMN ===== */}
        <div className="space-y-6">
          {/* Take Action */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Response Protocol</h3>
            <div className="space-y-3">
              {[
                { label: 'Update Status', icon: FileEdit, primary: true },
                { label: 'Escalate Priority', icon: ArrowUpRight, primary: false },
                { label: 'Notify Guardian', icon: Send, primary: false },
                { label: 'Resolve & Close Case', icon: CheckCircle2, primary: false },
              ].map((act, i) => (
                <button
                  key={i}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold transition-all ${
                    act.primary
                      ? 'bg-[#1e3a8a] text-white shadow-md hover:bg-[#1e4fc0]'
                      : 'bg-card border border-border text-foreground hover:bg-slate-50'
                  }`}
                >
                  <act.icon className={`w-4 h-4 ${act.primary ? 'text-white' : 'text-slate-500'}`} />
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Notes */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Closure Remarks</h3>
            <textarea
              rows={4}
              placeholder="Append resolution remarks or final notes..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30 placeholder:text-slate-400"
            />
            <button className="mt-3 w-full px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-900 transition-colors shadow-md">
              Secure Append
            </button>
          </div>

          {/* Attachments */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4 flex justify-between items-center">
              Digital Evidence <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{safeAttachments.length || 0} Files</span>
            </h3>
            {safeAttachments.length === 0 ? (
                 <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs font-bold text-slate-500">
                    No attachments uploaded.
                 </div>
            ) : (
                <div className="space-y-3">
                  {safeAttachments.map((file: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 border border-border rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
                      <Image className="w-4 h-4 text-slate-400 group-hover:text-[#1e3a8a]" />
                      <span className="text-sm font-medium text-foreground group-hover:font-bold">{file.name}</span>
                    </div>
                  ))}
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={onBack}
          className="px-8 py-3 bg-white border border-slate-200 rounded-full text-sm font-black text-slate-700 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-5 h-5 text-slate-400" /> Return to Directory
        </button>
      </div>
    </div>
  );
};

export default IncidentDetail;
