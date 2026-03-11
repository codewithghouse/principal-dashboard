import { useState } from "react";
import { Calculator, Beaker, BookText, Globe2, AlertTriangle, ArrowRight } from "lucide-react";
import SubjectAnalysis from "@/components/SubjectAnalysis";

const subjects = [
  { name: "Mathematics", avg: "52%", trend: "↓ 3.2% vs last term", status: "Weak", weakSections: 4, icon: Calculator, color: "text-[#ef4444]", bg: "bg-red-50", iconBg: "bg-red-50 text-red-500" },
  { name: "Science", avg: "58%", trend: "↓ 1.8% vs last term", status: "Weak", weakSections: 3, icon: Beaker, color: "text-[#ef4444]", bg: "bg-red-50", iconBg: "bg-red-50 text-red-500" },
  { name: "English", avg: "68%", trend: "↑ 2.1% vs last term", status: "Average", weakSections: 2, icon: BookText, color: "text-[#f59e0b]", bg: "bg-orange-50", iconBg: "bg-orange-50 text-orange-500" },
  { name: "Social Studies", avg: "74%", trend: "↑ 4.5% vs last term", status: "Good", weakSections: 0, icon: Globe2, color: "text-[#22c55e]", bg: "bg-green-50", iconBg: "bg-green-50 text-green-500" },
];

const curriculum = [
  { subject: "Mathematics", progress: 78, color: "bg-[#1e3a8a]" },
  { subject: "Science", progress: 82, color: "bg-[#22c55e]" },
  { subject: "English", progress: 85, color: "bg-[#22c55e]" },
  { subject: "Social Studies", progress: 90, color: "bg-[#22c55e]" },
];

const Academics = () => {
  const [selectedSubject, setSelectedSubject] = useState<typeof subjects[0] | null>(null);

  if (selectedSubject) {
    return <SubjectAnalysis subject={selectedSubject} onBack={() => setSelectedSubject(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-[#1e293b]">Academics</h1>
        <p className="text-sm text-slate-400">Subject-wise academic performance overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {subjects.map((s) => (
          <div 
            key={s.name} 
            className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group cursor-pointer"
            onClick={() => setSelectedSubject(s)}
          >
            <div className="flex items-center justify-between mb-6">
              <div className={`p-2.5 rounded-xl ${s.iconBg}`}>
                <s.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                s.status === 'Weak' ? 'bg-red-50 text-red-500 border border-red-100' :
                s.status === 'Average' ? 'bg-orange-50 text-orange-500 border border-orange-100' :
                'bg-green-50 text-green-500 border border-green-100'
              }`}>
                {s.status}
              </span>
            </div>
            <h3 className="text-lg font-bold text-[#1e293b] mb-1 group-hover:text-[#1e3a8a] transition-colors">{s.name}</h3>
            <div className="text-4xl font-black text-[#ef4444] mb-3">{s.avg}</div>
            <div className="flex items-center gap-2 mb-6">
              <span className={`text-[11px] font-bold ${s.trend.startsWith('↓') ? 'text-red-500' : 'text-green-500'}`}>{s.trend}</span>
            </div>
            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Weak Sections: {s.weakSections}</span>
              <span className="text-[10px] font-black text-[#1e3a8a] uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex items-center gap-1">
                Analysis <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        ))}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade Distribution */}
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-lg font-bold text-[#1e293b] mb-10">Grade Distribution – Latest Exam</h2>
          <div className="relative h-64 flex items-center justify-center">
             <svg viewBox="0 0 100 100" className="w-48 h-48 transform -rotate-90">
               {/* Background Circle */}
               <circle cx="50" cy="50" r="35" fill="none" stroke="#f1f5f9" strokeWidth="20" />
               
               {/* D (Below 40%) - Red (15%) */}
               <circle cx="50" cy="50" r="35" fill="none" stroke="#ef4444" strokeWidth="20" strokeDasharray="10 210" strokeDashoffset="0" />
               {/* C (40-59%) - Orange (25%) */}
               <circle cx="50" cy="50" r="35" fill="none" stroke="#f59e0b" strokeWidth="20" strokeDasharray="50 170" strokeDashoffset="-10" />
               {/* B (60-79%) - Blue (35%) */}
               <circle cx="50" cy="50" r="35" fill="none" stroke="#1e3a8a" strokeWidth="20" strokeDasharray="80 140" strokeDashoffset="-60" />
               {/* A (80-100%) - Green (25%) */}
               <circle cx="50" cy="50" r="35" fill="none" stroke="#22c55e" strokeWidth="20" strokeDasharray="60 160" strokeDashoffset="-140" />
             </svg>

             {/* Leader Lines and Labels */}
             <div className="absolute top-2 left-16 flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 mb-1">D (Below 40%)</span>
                <div className="w-[1px] h-10 bg-red-200 transform -rotate-45" />
             </div>
             
             <div className="absolute top-2 right-12 flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 mb-1">A (80-100%)</span>
                <div className="w-[1px] h-10 bg-green-200 transform rotate-45" />
             </div>

             <div className="absolute bottom-16 -left-1 flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">C (40-59%)</span>
                <div className="w-10 h-[1px] bg-orange-200 transform-origin-left rotate-12" />
             </div>

             <div className="absolute bottom-10 right-[5%] flex flex-col items-center">
                <div className="w-[1px] h-12 bg-blue-200 transform -rotate-[30deg]" />
                <span className="text-[10px] font-bold text-slate-400 mt-1">B (60-79%)</span>
             </div>
          </div>

          <div className="flex justify-center flex-wrap gap-4 mt-8">
             <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-[#22c55e]"/> <span className="text-[10px] font-bold text-slate-500 uppercase">A (80-100%)</span></div>
             <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-[#1e3a8a]"/> <span className="text-[10px] font-bold text-slate-500 uppercase">B (60-79%)</span></div>
             <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-[#f59e0b]"/> <span className="text-[10px] font-bold text-slate-500 uppercase">C (40-59%)</span></div>
             <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-[#ef4444]"/> <span className="text-[10px] font-bold text-slate-500 uppercase">D (Below 40%)</span></div>
          </div>
        </div>

        {/* Curriculum Progress */}
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-lg font-bold text-[#1e293b] mb-10">Curriculum Progress</h2>
          <div className="space-y-10">
            {curriculum.map((c) => (
              <div key={c.subject}>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-[#475569]">{c.subject}</span>
                  <span className="text-sm font-bold text-[#1e293b]">{c.progress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${c.color} transition-all duration-1000 shadow-sm`} style={{ width: `${c.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex items-center gap-4 animate-pulse">
        <div className="p-3 bg-red-500 rounded-full text-white shadow-md">
           <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
           <h3 className="text-lg font-bold text-red-700">Weak Subjects Requiring Attention</h3>
           <p className="text-sm text-red-500 font-medium italic">Urgent review meeting suggested for Mathematics & Science departments.</p>
        </div>
      </div>
    </div>
  );
};

export default Academics;

