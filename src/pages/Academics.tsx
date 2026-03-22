import { useState, useEffect } from "react";
import { 
  Calculator, Beaker, BookText, Globe2, AlertTriangle, 
  ArrowRight, FileText, GraduationCap, CalendarCheck, 
  Sparkles, Loader2, Grid, Send, Clock, X
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import SubjectAnalysis from "@/components/SubjectAnalysis";
import GenerateReport from "@/components/GenerateReport";
import { aiEngine, generateAcademicInsights } from "@/lib/ai-engine";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
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
import { toast } from "sonner";

const initialSubjects = [
  { id: "math", name: "Mathematics", avg: "52%", status: "Weak", weakSections: 4, icon: Calculator, iconBg: "bg-red-50", iconColor: "text-red-500" },
  { id: "sci", name: "Science", avg: "58%", status: "Weak", weakSections: 3, icon: Beaker, iconBg: "bg-red-50", iconColor: "text-red-500" },
  { id: "eng", name: "English", avg: "68%", status: "Average", weakSections: 2, icon: BookText, iconBg: "bg-amber-50", iconColor: "text-amber-500" },
  { id: "sst", name: "Social Studies", avg: "74%", status: "Good", weakSections: 0, icon: Globe2, iconBg: "bg-green-50", iconColor: "text-green-500" },
];

const Academics = () => {
  const { userData } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSchedulingRemedial, setIsSchedulingRemedial] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [remedialForm, setRemedialForm] = useState({
    subject: "Mathematics",
    grade: "Grade 9",
    date: "",
    time: "",
    teacher: ""
  });

  const [subjectInsights, setSubjectInsights] = useState<any>(null);
  const [curriculumInsights, setCurriculumInsights] = useState<any[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [gradeDistData, setGradeDistData] = useState<any[]>([]);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (!userData?.schoolId) return;

    const q = query(collection(db, "students"), where("schoolId", "==", userData.schoolId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let aCount = 0, bCount = 0, cCount = 0, dCount = 0, total = 0;

      snapshot.docs.forEach(doc => {
        const rawData = doc.data();
        if (!rawData.name && !rawData.grade && !rawData.score) return;
        total++;
        let score = Number(rawData.score || rawData.percentage || 0);
        if (score >= 80) aCount++;
        else if (score >= 60) bCount++;
        else if (score >= 40) cCount++;
        else dCount++;
      });

      setHasRealData(total > 0);
      setGradeDistData([
        { name: "A (80-100%)", value: total > 0 ? aCount : 25, color: "#22c55e" },
        { name: "B (60-79%)", value: total > 0 ? bCount : 35, color: "#1e3a8a" },
        { name: "C (40-59%)", value: total > 0 ? cCount : 25, color: "#f59e0b" },
        { name: "D (Below 40%)", value: total > 0 ? dCount : 15, color: "#ef4444" },
      ]);
    }, (err) => console.warn("Academics data fetch failed (index likely needed):", err));

    return () => unsubscribe();
  }, [userData?.schoolId]);

  useEffect(() => {
    const fetchAI = async () => {
      setLoadingAI(true);
      try {
        const insights = await aiEngine.getInsights({
          feature: "subject_performance",
          schoolId: userData?.schoolId || "demo",
          data: initialSubjects.map(s => ({ name: s.name, avg: s.avg })),
          forceRefresh: true
        });
        setSubjectInsights(insights);

        const curr = await Promise.all(initialSubjects.slice(0, 3).map(async (s) => {
           const res = await generateAcademicInsights({ subject: s.name, total_chapters: 15, completed_chapters: 8 }, "curriculum_tracking");
           return { subject: s.name, ...res };
        }));
        setCurriculumInsights(curr);
      } catch (e) { setAiError(true); }
      finally { setLoadingAI(false); }
    };
    fetchAI();
  }, [userData?.schoolId]);

  const handleScheduleRemedial = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      await addDoc(collection(db, "meetings"), {
        title: `Remedial: ${remedialForm.subject} - ${remedialForm.grade}`,
        participant: `${remedialForm.teacher} & Affected Students`,
        date: remedialForm.date,
        time: remedialForm.time,
        type: "Remedial Class",
        schoolId: userData?.schoolId,
        createdAt: serverTimestamp()
      });
      toast.success("Remedial session scheduled and teachers notified!");
      setIsSchedulingRemedial(false);
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    } finally { setIsSending(false); }
  };

  if (selectedSubject) return <SubjectAnalysis subject={selectedSubject} onBack={() => setSelectedSubject(null)} />;
  if (isGeneratingReport) return <GenerateReport templateName="Academic Master" onBack={() => setIsGeneratingReport(false)} />;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Academic Performance HQ</h1>
        <p className="text-sm font-bold text-slate-500">Subject-wise analytics and curriculum velocity tracking</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {initialSubjects.map((s) => (
          <div key={s.name} className="bg-card border border-border rounded-[2rem] p-8 shadow-sm hover:shadow-xl transition-all group cursor-pointer" onClick={() => setSelectedSubject(s)}>
            <div className="flex items-center justify-between mb-6">
              <div className={`w-12 h-12 rounded-2xl ${s.iconBg} flex items-center justify-center shadow-inner`}>
                <s.icon className={`w-6 h-6 ${s.iconColor} group-hover:scale-110 transition-transform`} />
              </div>
              <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${s.status === 'Weak' ? 'bg-red-50 text-red-500 border-red-100' : 'bg-green-50 text-green-500 border-green-100'}`}>{s.status}</span>
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-1">{s.name}</h3>
            <div className="text-4xl font-black text-slate-900 mb-4">{s.avg}</div>
            <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weak Zones: {s.weakSections}</span>
               <ArrowRight className="w-4 h-4 text-indigo-600 opacity-0 group-hover:opacity-100 transition-all translate-x--2 group-hover:translate-x-0" />
            </div>
          </div>
        ))}
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border border-border rounded-[2.5rem] p-10 shadow-sm">
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-8">Grade Distribution Matrix</h2>
           <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                 <Pie data={gradeDistData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value" animationDuration={1500}>
                    {gradeDistData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                 </Pie>
                 <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: '900' }} />
              </PieChart>
           </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl text-white">
           <h2 className="text-xl font-black uppercase tracking-tight mb-8 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-indigo-400" /> Curriculum Progress AI
           </h2>
           <div className="space-y-8">
              {curriculumInsights.map((c: any, i) => (
                <div key={i} className="group">
                   <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-black uppercase tracking-widest text-slate-400">{c.subject}</span>
                      <span className="text-lg font-black text-indigo-400">{c.completion_percentage}%</span>
                   </div>
                   <div className="h-3 bg-white/5 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-300 rounded-full" style={{ width: `${c.completion_percentage}%` }}></div>
                   </div>
                   <p className="text-[10px] text-slate-500 font-bold italic line-clamp-1">{c.recommendation}</p>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center gap-4 bg-white p-6 rounded-[2rem] border-2 border-slate-50 shadow-sm">
        <button onClick={() => setIsGeneratingReport(true)} className="flex items-center gap-3 px-8 py-4 bg-[#1e3a8a] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:shadow-xl transition-all">
           <FileText className="w-5 h-5" /> Generate Academic Master Report
        </button>
        <button onClick={() => setIsSchedulingRemedial(true)} className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:shadow-xl transition-all">
           <CalendarCheck className="w-5 h-5" /> Schedule Strategic Remedial
        </button>
      </div>

      {/* Remedial Modal */}
      <Dialog open={isSchedulingRemedial} onOpenChange={setIsSchedulingRemedial}>
         <DialogContent className="sm:max-w-[500px] rounded-[3rem] p-10">
            <DialogHeader className="mb-6">
               <div className="w-20 h-20 rounded-3xl bg-amber-100 flex items-center justify-center mb-6 shadow-inner">
                  <CalendarCheck className="w-10 h-10 text-amber-600" />
               </div>
               <DialogTitle className="text-3xl font-black text-slate-900 tracking-tight">Schedule Remedial</DialogTitle>
               <DialogDescription className="text-slate-500 font-bold">Deploying extra support for weak academic clusters.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleScheduleRemedial} className="space-y-6">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase text-slate-400">Subject</Label>
                     <select className="w-full h-12 rounded-xl border border-slate-200 font-bold px-3" value={remedialForm.subject} onChange={e => setRemedialForm({...remedialForm, subject: e.target.value})}>
                        <option>Mathematics</option><option>Science</option><option>English</option>
                     </select>
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase text-slate-400">Grade Level</Label>
                     <select className="w-full h-12 rounded-xl border border-slate-200 font-bold px-3" value={remedialForm.grade} onChange={e => setRemedialForm({...remedialForm, grade: e.target.value})}>
                        <option>Grade 9</option><option>Grade 10</option><option>Grade 6</option>
                     </select>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase text-slate-400">Date</Label>
                     <Input type="date" className="h-12 rounded-xl font-bold" value={remedialForm.date} onChange={e => setRemedialForm({...remedialForm, date: e.target.value})} required/>
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase text-slate-400">Time</Label>
                     <Input type="time" className="h-12 rounded-xl font-bold" value={remedialForm.time} onChange={e => setRemedialForm({...remedialForm, time: e.target.value})} required/>
                  </div>
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Assigned Faculty</Label>
                  <Input placeholder="e.g. Mrs. Kavita" className="h-12 rounded-xl font-bold" value={remedialForm.teacher} onChange={e => setRemedialForm({...remedialForm, teacher: e.target.value})} required/>
               </div>
               <DialogFooter>
                  <button type="submit" disabled={isSending} className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                     {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                     {isSending ? "Processing..." : "Confirm & Notify Faculty"}
                  </button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
    </div>
  );
};

export default Academics;
