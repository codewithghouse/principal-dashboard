import React from 'react';
import { ChevronLeft, Calendar, User, MessageCircle, AlertCircle, ShieldAlert, GraduationCap, Users } from 'lucide-react';

interface RiskInterventionProps {
  student: {
    initials: string;
    name: string;
    grade: string;
    roll: string;
    level: string;
    days: string;
  };
  onBack: () => void;
}

const RiskIntervention = ({ student, onBack }: RiskInterventionProps) => {
  const riskFactors = [
    { label: "Attendance", value: 45, threshold: "75%", desc: "Below 75% threshold", color: "bg-destructive" },
    { label: "Academic Average", value: 38, threshold: "40%", desc: "Below 40% passing marks", color: "bg-destructive" },
    { label: "Discipline Score", value: 85, threshold: "NA", desc: "No major issues", color: "bg-success" },
    { label: "Parent Engagement", value: 20, threshold: "High", desc: "Unresponsive to communications", color: "bg-destructive" },
  ];

  const actions = [
    { title: "Schedule Parent Meeting", desc: "Book appointment with guardian", icon: Calendar, active: true },
    { title: "Assign Remedial Class", desc: "Enroll in after-school support", icon: GraduationCap, active: false },
    { title: "Notify Class Teacher", desc: "Alert Mrs. Kavita", icon: Users, active: false },
    { title: "Escalate to Counselor", desc: "Refer for professional support", icon: ShieldAlert, active: false },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span>Risk Students</span>
        <span>/</span>
        <span className="text-foreground font-medium">Intervention</span>
      </div>

      <div className="bg-destructive/5 border border-destructive/10 rounded-2xl p-6 mb-8 flex items-center gap-8 shadow-sm">
        <div className="w-16 h-16 rounded-xl bg-destructive flex items-center justify-center text-white text-2xl font-bold shadow-md ring-4 ring-white">
          {student.initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-2xl font-bold text-foreground">{student.name}</h1>
            <span className="bg-destructive text-[10px] font-bold text-white px-2.5 py-1 rounded-full uppercase tracking-wider">CRITICAL RISK</span>
            <span className="bg-[#f97316] text-[10px] font-bold text-white px-2.5 py-1 rounded-full uppercase tracking-wider">{student.days} Flagged</span>
          </div>
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-4">
            <span>Grade {student.grade} • Roll No: {student.roll}</span>
            <span>Parent: Mr. Rajesh Sharma</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Risk Factor Breakdown */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-foreground mb-8">Risk Factor Breakdown</h2>
          <div className="space-y-10">
            {riskFactors.map((factor, i) => (
              <div key={i}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-foreground">{factor.label}</span>
                  <span className={`text-sm font-bold ${factor.color === 'bg-destructive' ? 'text-destructive' : 'text-success'}`}>{factor.value}%</span>
                </div>
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden mb-3">
                  <div 
                    className={`h-full ${factor.color} transition-all duration-1000 ease-out`}
                    style={{ width: `${factor.value}%` }}
                  />
                </div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{factor.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Take Action */}
        <div className="space-y-8">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground mb-6">Take Action</h2>
            <div className="space-y-3">
              {actions.map((action, i) => (
                <button 
                  key={i}
                  className={`w-full p-4 rounded-xl flex items-center gap-4 text-left transition-all border ${
                    action.active 
                      ? 'bg-primary border-primary text-primary-foreground shadow-md' 
                      : 'bg-card border-border hover:bg-secondary text-foreground'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${action.active ? 'bg-white/20' : 'bg-secondary text-primary'}`}>
                    <action.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight">{action.title}</h3>
                    <p className={`text-[11px] font-medium leading-tight ${action.active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{action.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground mb-4">Schedule Follow-up</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Follow-up Date</label>
                <input 
                  type="date" 
                  className="w-full bg-secondary py-2 px-3 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button className="w-full py-2.5 bg-secondary text-foreground font-bold text-xs uppercase rounded-lg hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
         <button 
          onClick={onBack}
          className="px-6 py-2.5 bg-white border border-border rounded-lg text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to List
        </button>
      </div>
    </div>
  );
};

export default RiskIntervention;
