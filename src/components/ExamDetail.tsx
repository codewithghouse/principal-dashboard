import React from 'react';
import { ChevronLeft, ArrowRight, Trophy, AlertTriangle, Download, Filter, Search } from 'lucide-react';

interface ExamDetailProps {
  exam: {
    name: string;
    date: string;
    totalStudents: number;
    passRate: string;
    average: string;
    classSummary: {
      section: string;
      appeared: number;
      passed: number;
      failed: number;
      passPercentage: string;
      topper: string;
      topperScore: string;
      avgPercentage: string;
      isWarning?: boolean;
    }[];
    meritList: {
      name: string;
      section: string;
      score: string;
      rank: number;
    }[];
    failList: {
      name: string;
      section: string;
      score: string;
      initials: string;
    }[];
  };
  onBack: () => void;
}

const ExamDetail = ({ exam, onBack }: ExamDetailProps) => {
  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Exams</span>
        <span>/</span>
        <span className="text-foreground font-medium">Exam Results</span>
      </div>

      {/* Exam Header Card */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 mb-8 shadow-sm">
         <div className="flex justify-between items-center">
            <div>
               <h1 className="text-3xl font-black text-[#1e293b]">{exam.name}</h1>
               <p className="text-sm font-bold text-slate-400 mt-2">
                  Date: {exam.date}  •  Total Students: {exam.totalStudents}
               </p>
            </div>
            <div className="flex gap-12">
               <div className="text-right">
                  <div className="text-3xl font-black text-[#22c55e]">{exam.passRate}</div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pass Rate</p>
               </div>
               <div className="text-right">
                  <div className="text-3xl font-black text-[#f59e0b]">{exam.average}</div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Average</p>
               </div>
            </div>
         </div>
      </div>

      {/* Class-wise Summary Table */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden mb-8">
         <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between">
            <h2 className="text-xl font-black text-[#1e293b]">Class-wise Results Summary</h2>
            <div className="flex gap-3">
               <button className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-[#1e3a8a] transition-colors border border-slate-100">
                  <Download className="w-5 h-5" />
               </button>
               <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-[#1e293b] rounded-xl text-xs font-black uppercase tracking-widest border border-slate-100">
                  <Filter className="w-4 h-4" /> Filter
               </button>
            </div>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full">
               <thead>
                  <tr className="bg-slate-50/50">
                     <th className="px-10 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Section</th>
                     <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Appeared</th>
                     <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Passed</th>
                     <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Failed</th>
                     <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Pass %</th>
                     <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Topper</th>
                     <th className="px-10 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Avg %</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {exam.classSummary.map((item, i) => (
                     <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${item.isWarning ? 'bg-red-50/30' : ''}`}>
                        <td className="px-10 py-6 text-sm font-black text-[#1e293b]">{item.section}</td>
                        <td className="px-6 py-6 text-sm font-bold text-slate-500">{item.appeared}</td>
                        <td className="px-6 py-6 text-sm font-black text-green-500">{item.passed}</td>
                        <td className="px-6 py-6 text-sm font-black text-red-500">{item.failed}</td>
                        <td className={`px-6 py-6 text-sm font-black ${item.isWarning ? 'text-red-500' : 'text-green-500'}`}>
                           {item.passPercentage}
                        </td>
                        <td className="px-6 py-6">
                           <div className="text-sm font-bold text-[#1e293b]">{item.topper}</div>
                           <div className="text-[10px] font-black text-slate-400 uppercase">({item.topperScore})</div>
                        </td>
                        <td className={`px-10 py-6 text-sm font-black ${item.isWarning ? 'text-red-500' : 'text-[#22c55e]'}`}>
                           {item.avgPercentage}
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {/* Two Columns List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* Merit List */}
         <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-lg font-black text-[#1e293b]">School Merit List (Top 5)</h3>
               <button className="text-xs font-black text-[#1e3a8a] uppercase tracking-widest flex items-center gap-1 hover:underline">
                  View All <ArrowRight className="w-3 h-3" />
               </button>
            </div>
            <div className="space-y-4">
               {exam.meritList.map((student, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-green-50/30 rounded-2xl border border-green-50/50 group hover:scale-[1.02] transition-all cursor-pointer">
                     <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                           i === 0 ? 'bg-yellow-400 text-white' : 
                           i === 1 ? 'bg-slate-300 text-white' : 
                           'bg-orange-300 text-white'
                        }`}>
                           {i + 1}
                        </div>
                        <div>
                           <div className="text-sm font-bold text-[#1e293b]">{student.name} ({student.section})</div>
                        </div>
                     </div>
                     <div className="text-sm font-black text-[#22c55e]">{student.score}</div>
                  </div>
               ))}
            </div>
         </div>

         {/* Fail List */}
         <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-lg font-black text-[#1e293b]">Fail List (Needs Attention)</h3>
               <button className="text-xs font-black text-red-500 uppercase tracking-widest flex items-center gap-1 hover:underline">
                  View All <ArrowRight className="w-3 h-3" />
               </button>
            </div>
            <div className="space-y-4">
               {exam.failList.map((student, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-red-50/30 rounded-2xl border border-red-50/50 group hover:scale-[1.02] transition-all cursor-pointer">
                     <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-black text-white shadow-sm">
                           {student.initials}
                        </div>
                        <div className="text-sm font-bold text-[#1e293b]">{student.name} ({student.section})</div>
                     </div>
                     <div className="text-sm font-black text-red-500">{student.score}</div>
                  </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default ExamDetail;
