import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, CalendarCheck, GraduationCap, Users, 
  ShieldAlert, AlertCircle, Loader2, Send, Clock, 
  CheckCircle2, Plus, MessageSquare, Phone
} from 'lucide-react';
import { db } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, addDoc, 
  serverTimestamp, orderBy, limit 
} from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface RiskInterventionProps {
  student: {
    id: string;
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
  const { userData } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isActionOpen, setIsActionOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedAction, setSelectedAction] = useState<any>(null);

  const [form, setForm] = useState({
    notes: "",
    date: "",
    assignedTo: ""
  });

  useEffect(() => {
    if (!student.id) return;

    const q = query(
      collection(db, "interventions"),
      where("studentId", "==", student.id),
      orderBy("createdAt", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [student.id]);

  const riskFactors = [
    { label: "Attendance Consistency", value: 65, desc: "Failing to meet 85% requirement", color: "#f59e0b" },
    { label: "Academic Trend", value: 42, desc: "3 consecutive test score drops", color: "#ef4444" },
    { label: "Submission Rate", value: 30, desc: "High volume of overdue tasks", color: "#ef4444" },
    { label: "Conduct Index", value: 92, desc: "Positive peer behavior", color: "#22c55e" },
  ];

  const actions = [
    { id: 'meeting', title: "Schedule Parent Meeting", desc: "Book appointment with guardian", icon: CalendarCheck, color: "text-blue-600" },
    { id: 'remedial', title: "Assign Remedial Class", desc: "Enroll in after-school support", icon: GraduationCap, color: "text-emerald-600" },
    { id: 'teacher', title: "Notify Class Teacher", desc: `Direct alert to faculty`, icon: Users, color: "text-indigo-600" },
    { id: 'counselor', title: "Refer to Counselor", desc: "Schedule psychological assessment", icon: ShieldAlert, color: "text-red-500" },
  ];

  const handleActionClick = (action: any) => {
    setSelectedAction(action);
    setIsActionOpen(true);
  };

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.notes) {
      toast.error("Please provide intervention notes");
      return;
    }

    setIsSending(true);
    try {
      // 1. Save to Interventions History
      await addDoc(collection(db, "interventions"), {
        studentId: student.id,
        studentName: student.name,
        actionId: selectedAction.id,
        actionTitle: selectedAction.title,
        notes: form.notes,
        status: "Applied",
        principalId: userData?.schoolId,
        date: new Date().toLocaleDateString(),
        createdAt: serverTimestamp()
      });

      // 2. If it's a meeting, also save to meetings collection
      if (selectedAction.id === 'meeting') {
        await addDoc(collection(db, "meetings"), {
          title: `Intervention: ${student.name}`,
          participant: "Parent & Principal",
          date: form.date || new Date().toLocaleDateString(),
          time: "TBD",
          type: "Critical Intervention",
          studentId: student.id,
          createdAt: serverTimestamp()
        });
      }

      toast.success(`${selectedAction.title} registered successfully!`);
      setIsActionOpen(false);
      setForm({ notes: "", date: "", assignedTo: "" });
    } catch (e: any) {
      toast.error("Intervention failed: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-5 duration-700 pb-20">
      <div className="flex items-center justify-between mb-8">
         <div className="flex items-center gap-4">
            <button 
              onClick={onBack} 
              className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-900 hover:bg-slate-50 transition-all shadow-sm"
            >
               <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
               <h1 className="text-3xl font-black text-slate-900 tracking-tight">Strategic Intervention</h1>
               <p className="text-sm font-bold text-slate-500">Deploying tactical support for {student.name}</p>
            </div>
         </div>
         <button className="px-6 py-3 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Priority Escalation
         </button>
      </div>

      {/* ===== STUDENT IDENTITY CARD ===== */}
      <div className="bg-[#1e3a8a] text-white p-10 rounded-[3rem] shadow-2xl shadow-indigo-200 relative overflow-hidden mb-10">
         <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -tr-20"></div>
         <div className="flex items-center gap-10 relative z-10">
            <div className="w-24 h-24 rounded-3xl bg-white/10 flex items-center justify-center text-4xl font-black backdrop-blur-md shadow-inner">
               {student.initials}
            </div>
            <div className="flex-1">
               <div className="flex items-center gap-4 mb-3">
                  <h2 className="text-4xl font-black tracking-tight">{student.name}</h2>
                  <span className={`px-4 py-1.5 rounded-xl ${student.level === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-400'} text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-xl`}>
                     {student.level} LEVEL RISK
                  </span>
               </div>
               <div className="flex items-center gap-6 text-white/60 font-black uppercase tracking-widest text-xs">
                  <span className="flex items-center gap-2"><GraduationCap className="w-4 h-4" /> {student.grade}</span>
                  <span className="w-px h-4 bg-white/20"></span>
                  <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Roll No: {student.roll}</span>
                  <span className="w-px h-4 bg-white/20"></span>
                  <span className="flex items-center gap-2 text-red-300"><Clock className="w-4 h-4" /> {student.days} Observation</span>
               </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* ===== LEFT: Analytics Breakdown ===== */}
        <div className="lg:col-span-7 space-y-10">
          <div className="bg-card border border-border rounded-[2.5rem] p-10 shadow-sm">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-10 flex items-center gap-3">
               <div className="w-2 h-8 bg-indigo-600 rounded-full"></div> 
               Risk Factor Diagnostics
            </h3>
            <div className="space-y-10">
              {riskFactors.map((factor, i) => (
                <div key={i} className="group">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-black text-slate-700 uppercase tracking-widest">{factor.label}</span>
                    <span className="text-lg font-black" style={{ color: factor.color }}>{factor.value}%</span>
                  </div>
                  <div className="h-4 bg-slate-100 rounded-2xl overflow-hidden shadow-inner mb-3">
                    <div
                      className="h-full rounded-2xl transition-all duration-1500 ease-out shadow-lg"
                      style={{ width: `${factor.value}%`, backgroundColor: factor.color }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic">{factor.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Intervention Logs */}
          <div className="bg-card border border-border rounded-[2.5rem] p-10 shadow-sm">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-8">Intervention Audit Trail</h3>
            <div className="space-y-8 relative">
               <div className="absolute left-6 top-6 bottom-6 w-1 bg-slate-50 rounded-full"></div>
               {loading ? (
                  <div className="flex justify-center p-10"><Loader2 className="w-10 h-10 animate-spin text-slate-200" /></div>
               ) : history.length > 0 ? history.map((item, i) => (
                <div key={i} className="flex items-start gap-8 relative z-10 transition-all hover:translate-x-1">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg bg-white border border-slate-100`}>
                     <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 flex-1">
                    <div className="flex justify-between items-start mb-2">
                       <p className="text-base font-black text-slate-800">{item.actionTitle}</p>
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.date}</span>
                    </div>
                    <p className="text-sm text-slate-500 font-bold leading-relaxed">{item.notes}</p>
                  </div>
                </div>
              )) : (
                 <div className="py-12 text-center text-slate-300 font-black uppercase tracking-widest">No previous actions logged.</div>
              )}
            </div>
          </div>
        </div>

        {/* ===== RIGHT: Deployment Center ===== */}
        <div className="lg:col-span-5 space-y-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-8">Deployment Center</h3>
            <div className="space-y-4">
              {actions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => handleActionClick(action)}
                  className={`w-full p-6 rounded-3xl flex items-center gap-5 text-left transition-all border border-slate-800 bg-slate-800/40 hover:bg-slate-800 group shadow-lg`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-slate-900 shadow-inner group-hover:scale-110 transition-transform`}>
                    <action.icon className={`w-7 h-7 ${action.color}`} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-black text-white uppercase tracking-tight mb-1">{action.title}</h4>
                    <p className={`text-[10px] font-black uppercase text-slate-500 tracking-widest`}>{action.desc}</p>
                  </div>
                  <Plus className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors" />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
             <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
             <h3 className="text-lg font-black uppercase tracking-[0.2em] mb-4">Command Directive</h3>
             <p className="text-sm font-bold text-indigo-100 leading-relaxed mb-8">Interventions registered here are transmitted to department heads and faculty members in real-time. Automated parent notifications will be dispatched upon confirmation.</p>
             <div className="flex gap-4">
                <button className="flex-1 h-12 bg-white/10 backdrop-blur-md rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-white/20 transition-all border border-white/10">View Parent Log</button>
                <button className="flex-1 h-12 bg-white/10 backdrop-blur-md rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-white/20 transition-all border border-white/10">Contact Support</button>
             </div>
          </div>
        </div>
      </div>

      {/* Action Modal */}
      <Dialog open={isActionOpen} onOpenChange={setIsActionOpen}>
         <DialogContent className="sm:max-w-[500px] rounded-[3rem] p-10">
            <DialogHeader className="mb-6">
               <div className="w-20 h-20 rounded-3xl bg-slate-900 flex items-center justify-center mb-6 shadow-2xl">
                  {selectedAction && <selectedAction.icon className={`w-10 h-10 ${selectedAction.color}`} />}
               </div>
               <DialogTitle className="text-3xl font-black text-slate-900 tracking-tight">Deploy Intervention</DialogTitle>
               <DialogDescription className="text-slate-500 font-bold text-base">Registering action for {student.name}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleConfirmAction} className="space-y-8">
               <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Intervention Analysis / Notes</Label>
                  <Textarea 
                     placeholder="State the reason and expected outcome of this intervention..." 
                     className="min-h-[140px] rounded-[1.5rem] border-slate-200 font-bold p-5"
                     value={form.notes}
                     onChange={e => setForm({...form, notes: e.target.value})}
                  />
               </div>
               
               {selectedAction?.id === 'meeting' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                     <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Proposed Meeting Date</Label>
                     <Input 
                        type="date" 
                        className="h-14 rounded-xl border-slate-200 font-bold px-5"
                        value={form.date}
                        onChange={e => setForm({...form, date: e.target.value})}
                     />
                  </div>
               )}

               <DialogFooter className="pt-4">
                  <button 
                    type="submit" 
                    disabled={isSending}
                    className="w-full h-16 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-3"
                  >
                     {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                     {isSending ? "Transmitting..." : `Finalize ${selectedAction?.title}`}
                  </button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
    </div>
  );
};

export default RiskIntervention;
