import React from 'react';
import { ChevronLeft, Download, Lightbulb, TrendingUp, TrendingDown, AlertCircle, Calculator, Beaker, BookText, Globe2 } from 'lucide-react';

interface SubjectAnalysisProps {
  subject: {
    name: string;
    avg: string;
    icon: any;
    iconBg: string;
  };
  onBack: () => void;
}

const SubjectAnalysis = ({ subject, onBack }: SubjectAnalysisProps) => {
  const sectionsPerformance = [
    { section: "10B", value: 68, color: "bg-[#22c55e]" },
    { section: "10A", value: 72, color: "bg-[#22c55e]" },
    { section: "8B", value: 62, color: "bg-[#f59e0b]" },
    { section: "8A", value: 58, color: "bg-[#f59e0b]" },
    { section: "9C", value: 55, color: "bg-[#f59e0b]" },
    { section: "9B", value: 48, color: "bg-[#ef4444]" },
    { section: "9A", value: 42, color: "bg-[#ef4444]" },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Academics</span>
        <span>/</span>
        <span className="text-foreground font-medium">Subject Analysis</span>
      </div>

      <div className="bg-[#fff1f2] border border-red-100 rounded-2xl p-6 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className={`p-4 rounded-xl ${subject.iconBg} shadow-sm`}>
            <subject.icon className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[#1e293b]">{subject.name}</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Overall Average: <span className="text-[#ef4444] font-bold">{subject.avg}</span> 
              <span className="mx-2">•</span> 
              847 students
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4 text-slate-400" /> Export PDF
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity">
            <Lightbulb className="w-4 h-4" /> View Recommendations
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Section-wise Performance */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
           <h3 className="text-lg font-bold text-[#1e293b] mb-10">Section-wise Performance</h3>
           <div className="space-y-4">
              {sectionsPerformance.map((s, i) => (
                <div key={i} className="flex items-center gap-4 group">
                  <span className="text-[11px] font-bold text-slate-400 w-8">{s.section}</span>
                  <div className="flex-1 h-8 bg-slate-50 rounded-sm relative overflow-hidden">
                    <div 
                      className={`h-full ${s.color} transition-all duration-1000 shadow-sm`} 
                      style={{ width: `${s.value}%` }} 
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#1e293b] opacity-60 group-hover:opacity-100">
                      {s.value}%
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between mt-6 pt-4 border-t border-slate-50 text-[10px] font-bold text-slate-400">
                <span>0%</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span>
              </div>
           </div>
        </div>

        {/* Performance Insights */}
        <div className="lg:col-span-5 space-y-6">
           <div className="bg-[#f0fdf4] border border-green-100 rounded-2xl p-6 flex gap-4">
              <div className="p-2.5 bg-green-500 rounded-xl text-white h-fit">
                 <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                 <h4 className="text-sm font-bold text-green-700 uppercase tracking-tight">Top Performing Section</h4>
                 <p className="text-lg font-bold text-green-800 mt-1">10A with 72% average <span className="text-sm font-medium opacity-60">(Mrs. Kavita)</span></p>
              </div>
           </div>

           <div className="bg-[#fef2f2] border border-red-100 rounded-2xl p-6 flex gap-4">
              <div className="p-2.5 bg-red-500 rounded-xl text-white h-fit">
                 <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                 <h4 className="text-sm font-bold text-red-700 uppercase tracking-tight">Weakest Section</h4>
                 <p className="text-lg font-bold text-red-800 mt-1">9A with 42% average <span className="text-sm font-medium opacity-60">(Mrs. Kavita)</span></p>
              </div>
           </div>

           <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6">
              <h4 className="text-sm font-bold text-[#1e293b] mb-4">Key Issues Identified</h4>
              <ul className="space-y-3">
                 {[
                   "Algebra concepts weak across grades 8-9",
                   "Geometry application problems",
                   "Time management in exams"
                 ].map((issue, i) => (
                   <li key={i} className="flex items-center gap-3 text-sm font-medium text-slate-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      {issue}
                   </li>
                 ))}
              </ul>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Student Marks Distribution */}
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
           <h3 className="text-lg font-bold text-[#1e293b] mb-10">Student Marks Distribution</h3>
           <div className="h-56 relative border-l border-b border-slate-100 mt-8 ml-8">
              <div className="absolute inset-0 flex items-end justify-around px-8 gap-4">
                 {[20, 35, 65, 95, 75, 45, 25].map((val, i) => (
                    <div key={i} className="flex-1 bg-[#1e3a8a]/10 rounded-t-sm relative group">
                       <div 
                         className="absolute bottom-0 inset-x-0 bg-[#f59e0b] rounded-t-sm transition-all duration-1000" 
                         style={{ height: `${val}%` }} 
                       />
                    </div>
                 ))}
              </div>
              {/* Labels Simulation */}
              <div className="absolute -left-10 inset-y-0 flex flex-col justify-between text-[10px] font-bold text-slate-300 py-2">
                 <span>350</span><span>300</span><span>250</span><span>200</span><span>150</span><span>100</span><span>50</span><span>0</span>
              </div>
           </div>
        </div>

        {/* Teacher Effectiveness */}
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
           <h3 className="text-lg font-bold text-[#1e293b] mb-8">Teacher Effectiveness</h3>
           <div className="space-y-6">
              {[
                { name: "Mrs. Kavita", grades: "Grades 8-10", avg: "58%", initials: "MK" },
                { name: "Mr. Sharma", grades: "Grades 6-7", avg: "64%", initials: "RS" },
                { name: "Ms. Priya", grades: "Grades 9-10", avg: "52%", initials: "PP" },
              ].map((t, i) => (
                <div key={i} className="flex items-center justify-between p-4 border border-slate-50 rounded-2xl hover:bg-slate-50 transition-colors">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[#1e3a8a] flex items-center justify-center text-white font-bold text-sm">
                        {t.initials}
                      </div>
                      <div>
                        <p className="font-bold text-[#1e293b]">{t.name}</p>
                        <p className="text-xs text-slate-400 font-bold uppercase">{t.grades}</p>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-lg font-black text-[#f59e0b]">{t.avg}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">AVG</p>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

export default SubjectAnalysis;
