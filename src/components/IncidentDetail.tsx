import React from 'react';
import { ChevronLeft, Calendar, MapPin, User, UserCheck, FileEdit, ArrowUpRight, Send, CheckCircle2, FileText, Image } from 'lucide-react';

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
  const fullActionLog = [
    ...incident.actionLog,
    { action: "Parents Notified", time: "Jan 17, 2026 • 12:30 PM", by: "via SMS", color: "bg-amber-500" },
  ];

  const relatedIncidents = [
    { type: "Disruptive Behavior", date: "Jan 10, 2026" },
    { type: "Verbal Abuse", date: "Dec 28, 2025" },
  ];

  const attachments = [
    { name: "Incident_Report.pdf", icon: FileText },
    { name: "Photo_Evidence.jpg", icon: Image },
  ];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Discipline</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Incident Detail</span>
      </div>

      {/* ===== INCIDENT HEADER ===== */}
      <div className="rounded-2xl p-7 mb-6 shadow-sm" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
        {/* Top: ID + Severity + Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Incident ID: {incident.id}</span>
            <span className="px-3 py-1 bg-red-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wider shadow-sm">
              {incident.severity}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-muted-foreground block mb-1">Status</span>
            <span className="text-sm font-bold text-amber-500">{incident.status}</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-foreground mb-3">{incident.title}</h1>

        {/* Meta row */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> {incident.date} • {incident.time}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4" /> {incident.location}
          </span>
          <span className="flex items-center gap-1.5">
            <User className="w-4 h-4" /> Reported by: {incident.reportedBy}
          </span>
        </div>
      </div>

      {/* ===== 3-COLUMN CONTENT ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-6">
          {/* Involved Student */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Involved Student</h3>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 bg-red-500 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0">
                {incident.student.initials}
              </div>
              <div>
                <h4 className="text-base font-bold text-foreground">{incident.student.name}</h4>
                <p className="text-xs text-muted-foreground font-medium">Grade {incident.student.grade} • Roll {incident.student.rollNo}</p>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Previous Incidents</span>
                <span className="text-sm font-bold text-red-500">{incident.student.previousIncidents}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Risk Status</span>
                <span className="text-sm font-bold text-red-500">{incident.student.riskStatus}</span>
              </div>
            </div>
            <button className="w-full mt-5 flex items-center justify-center gap-2 py-2.5 text-[#1e3a8a] text-sm font-bold hover:bg-secondary rounded-xl transition-colors border border-border">
              <UserCheck className="w-4 h-4" /> View Student Profile
            </button>
          </div>

          {/* Witnesses */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Witnesses</h3>
            <div className="space-y-3">
              {incident.witnesses.map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${w.color} flex items-center justify-center text-white text-[10px] font-bold shadow-sm`}>
                    {w.initials}
                  </div>
                  <span className="text-sm font-medium text-foreground">{w.name} ({w.grade})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== MIDDLE COLUMN ===== */}
        <div className="space-y-6">
          {/* Incident Description */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Incident Description</h3>
            <div className="p-5 bg-secondary/30 border border-border rounded-xl" style={{ borderLeft: '3px solid #1e3a8a' }}>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                {incident.description}
              </p>
            </div>
          </div>

          {/* Action Taken Log */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Action Taken Log</h3>
            <div className="space-y-5">
              {fullActionLog.map((log, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${log.color}`} />
                  <div>
                    <p className="text-sm font-bold text-foreground">{log.action}</p>
                    <p className="text-xs text-muted-foreground font-medium">{log.time} by {log.by}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Related Incidents */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Related Incidents</h3>
            <div className="space-y-3">
              {relatedIncidents.map((ri, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm font-medium text-foreground">{ri.type}</span>
                  <span className="text-xs text-muted-foreground font-medium">{ri.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== RIGHT COLUMN ===== */}
        <div className="space-y-6">
          {/* Take Action */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Take Action</h3>
            <div className="space-y-3">
              {[
                { label: 'Update Status', icon: FileEdit, primary: true },
                { label: 'Escalate', icon: ArrowUpRight, primary: false },
                { label: 'Notify Parents', icon: Send, primary: false },
                { label: 'Close Incident', icon: CheckCircle2, primary: false },
              ].map((act, i) => (
                <button
                  key={i}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold transition-all ${
                    act.primary
                      ? 'bg-[#1e3a8a] text-white shadow-md hover:bg-[#1e4fc0]'
                      : 'bg-card border border-border text-foreground hover:bg-secondary'
                  }`}
                >
                  <act.icon className={`w-4 h-4 ${act.primary ? 'text-white' : 'text-muted-foreground'}`} />
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Notes */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Resolution Notes</h3>
            <textarea
              rows={5}
              placeholder="Add resolution notes..."
              className="w-full bg-secondary/30 border border-border rounded-xl p-4 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30 placeholder:text-muted-foreground/50"
            />
            <button className="mt-3 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
              Save Notes
            </button>
          </div>

          {/* Attachments */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Attachments</h3>
            <div className="space-y-3">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border border-border rounded-xl hover:bg-secondary transition-colors cursor-pointer">
                  <file.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Discipline
        </button>
      </div>
    </div>
  );
};

export default IncidentDetail;
