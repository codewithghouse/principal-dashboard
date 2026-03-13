import React from 'react';
import { ChevronLeft, CalendarCheck, GraduationCap, Users, ShieldAlert, AlertCircle } from 'lucide-react';

interface RiskInterventionProps {
  student: {
    initials: string;
    name: string;
    grade: string;
    roll: string;
    level: string;
    days: string;
    assigned?: string;
  };
  onBack: () => void;
}

const RiskIntervention = ({ student, onBack }: RiskInterventionProps) => {
  const riskFactors = [
    { label: "Attendance", value: 45, desc: "Below 75% threshold", color: "#ef4444" },
    { label: "Academic Average", value: 38, desc: "Below 40% passing marks", color: "#ef4444" },
    { label: "Discipline Score", value: 85, desc: "No major issues", color: "#22c55e" },
    { label: "Parent Engagement", value: 20, desc: "Unresponsive to communications", color: "#ef4444" },
  ];

  const actions = [
    { title: "Schedule Parent Meeting", desc: "Book appointment with guardian", icon: CalendarCheck, active: true },
    { title: "Assign Remedial Class", desc: "Enroll in after-school support", icon: GraduationCap, active: false },
    { title: "Notify Class Teacher", desc: `Alert ${student.assigned || 'Mrs. Kavita'}`, icon: Users, active: false },
    { title: "Escalate to Counselor", desc: "Refer for professional support", icon: ShieldAlert, active: false },
  ];

  const interventionHistory = [
    { title: "Parent Called", date: "Jan 15, 2026", detail: "No response", dotColor: "#ef4444" },
    { title: "SMS Alert Sent", date: "Jan 12, 2026", detail: "Delivered", dotColor: "#f59e0b" },
    { title: "Flagged as At-Risk", date: "Jan 10, 2026", detail: "Auto-detected", dotColor: "#f59e0b" },
  ];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Risk Students</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Intervention</span>
      </div>

      {/* Page Title */}
      <h1 className="text-xl font-bold text-foreground mb-6 uppercase tracking-tight">
        Result of click: "Risk Student Action"
      </h1>

      {/* ===== STUDENT HEADER CARD ===== */}
      <div className="rounded-2xl p-6 mb-8 flex items-center gap-6 shadow-sm border" style={{ backgroundColor: '#fff5f5', borderColor: '#fecaca' }}>
        <div className="w-16 h-16 rounded-xl bg-[#1e3a8a] flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0">
          {student.initials}
        </div>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">{student.name}</h2>
            <span className="px-3 py-1 rounded-md bg-[#c0392b] text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
              CRITICAL RISK
            </span>
            <span className="px-3 py-1 rounded-md bg-[#f59e0b] text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
              {student.days} Flagged
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Grade {student.grade}  •  Roll No: {student.roll}  •  Parent: Mr. Rajesh Sharma
          </p>
        </div>
      </div>

      {/* ===== CONTENT GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== LEFT: Risk Factor Breakdown ===== */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-7">Risk Factor Breakdown</h3>
            <div className="space-y-7">
              {riskFactors.map((factor, i) => (
                <div key={i} className="pb-6 border-b border-border last:border-0 last:pb-0">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-foreground">{factor.label}</span>
                    <span className="text-sm font-bold" style={{ color: factor.color }}>{factor.value}%</span>
                  </div>
                  <div className="h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${factor.value}%`, backgroundColor: factor.color }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{factor.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Intervention History */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-6">Intervention History</h3>
            <div className="space-y-5">
              {interventionHistory.map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: item.dotColor }} />
                  <div>
                    <p className="text-sm font-bold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground font-medium">{item.date}  •  {item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== RIGHT: Take Action + Schedule Follow-up ===== */}
        <div className="space-y-6">
          {/* Take Action */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-6">Take Action</h3>
            <div className="space-y-3">
              {actions.map((action, i) => (
                <button
                  key={i}
                  className={`w-full p-4 rounded-xl flex items-center gap-4 text-left transition-all border ${
                    action.active
                      ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white shadow-lg'
                      : 'bg-card border-border hover:bg-secondary hover:shadow-sm text-foreground'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    action.active ? 'bg-white/20' : 'bg-secondary'
                  }`}>
                    <action.icon className={`w-5 h-5 ${action.active ? 'text-white' : 'text-[#f59e0b]'}`} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-tight">{action.title}</h4>
                    <p className={`text-xs font-medium ${action.active ? 'text-white/70' : 'text-muted-foreground'}`}>{action.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Follow-up */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-6">Schedule Follow-up</h3>
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Follow-up Date</label>
                <input
                  type="date"
                  className="w-full bg-card py-3 px-4 rounded-xl border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Assign To</label>
                <input
                  type="text"
                  placeholder="Select teacher or counselor..."
                  className="w-full bg-card py-3 px-4 rounded-xl border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30 placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Notes</label>
                <textarea
                  rows={3}
                  placeholder="Add details about the follow-up..."
                  className="w-full bg-card py-3 px-4 rounded-xl border border-border text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30 placeholder:text-muted-foreground/50"
                />
              </div>
              <button className="w-full py-3.5 bg-[#1e3a8a] text-white font-bold text-sm rounded-xl hover:bg-[#1e4fc0] transition-colors shadow-lg">
                Schedule Follow-up
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-white border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to List
        </button>
      </div>
    </div>
  );
};

export default RiskIntervention;
