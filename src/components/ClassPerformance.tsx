import React from 'react';
import { ChevronLeft, Filter, Download, User, BookOpen, Clock, Users } from 'lucide-react';

interface ClassPerformanceProps {
  section: {
    section: string;
    teacher: string;
    students: number;
    avgMarks: string;
    attendance: string;
    status: string;
  };
  onBack: () => void;
}

const studentsPerformance = [
  { rank: 1, initials: "AR", name: "Aarav Reddy", math: 78, science: 82, english: 75, sst: 80, total: "78.8%", attendance: "95%", status: "Good" },
  { rank: 2, initials: "RS", name: "Rahul Sharma", math: 85, science: 76, english: 88, sst: 72, total: "80.2%", attendance: "92%", status: "Good" },
  { rank: 3, initials: "PP", name: "Priya Patel", math: 65, science: 70, english: 62, sst: 68, total: "66.2%", attendance: "88%", status: "Average" },
  { rank: 4, initials: "VK", name: "Vikram Kumar", math: 92, science: 88, english: 90, sst: 94, total: "91.0%", attendance: "98%", status: "Excellent" },
  { rank: 5, initials: "SN", name: "Sneha Nair", math: 74, science: 72, english: 78, sst: 75, total: "74.8%", attendance: "94%", status: "Good" },
];

const ClassPerformance = ({ section, onBack }: ClassPerformanceProps) => {
  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer">Classes</span>
        <span>/</span>
        <span className="text-foreground font-medium">Class Performance</span>
      </div>

      <div className="bg-[#fff1f2] border border-red-100 rounded-2xl p-6 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl font-bold text-[#1e293b] flex items-center gap-4">
            Grade {section.section}
            <span className="bg-[#ef4444] text-[11px] font-bold text-white px-3 py-1 rounded-full uppercase tracking-wider">WEAK</span>
          </h1>
          <div className="flex items-center gap-6 text-sm font-medium text-[#64748b]">
            <span className="flex items-center gap-2"><User className="w-4 h-4" /> Class Teacher: {section.teacher}</span>
            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-slate-400" /> Room: 201</span>
            <span className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> {section.students} Students</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400 uppercase mb-1">Class Average</p>
          <p className="text-5xl font-bold text-[#ef4444]">{section.avgMarks}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Performance Distribution */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm min-h-[300px]">
           <h3 className="text-[14px] font-bold text-[#1e293b] mb-10">Performance Distribution</h3>
           <div className="relative h-44 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-36 h-36 transform -rotate-90">
                <circle cx="50" cy="50" r="35" fill="none" stroke="#f1f5f9" strokeWidth="15" />
                {/* At Risk - 15% (Red) */}
                <circle cx="50" cy="50" r="35" fill="none" stroke="#ef4444" strokeWidth="15" strokeDasharray="10 210" strokeDashoffset="0" />
                {/* Average - 30% (Orange) */}
                <circle cx="50" cy="50" r="35" fill="none" stroke="#f59e0b" strokeWidth="15" strokeDasharray="66 154" strokeDashoffset="-10" />
                {/* Good - 40% (Blue) */}
                <circle cx="50" cy="50" r="35" fill="none" stroke="#1e3a8a" strokeWidth="15" strokeDasharray="88 132" strokeDashoffset="-76" />
                {/* Excellent - 15% (Green) */}
                <circle cx="50" cy="50" r="35" fill="none" stroke="#22c55e" strokeWidth="15" strokeDasharray="33 187" strokeDashoffset="-164" />
              </svg>

              {/* Labels with Leader Lines */}
              <div className="absolute top-0 left-8 flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 mb-1">At Risk</span>
                <div className="w-[1px] h-6 bg-slate-300 transform -rotate-45" />
              </div>
              <div className="absolute top-2 right-8 flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 mb-1">Excellent</span>
                <div className="w-[1px] h-6 bg-slate-300 transform rotate-45" />
              </div>
              <div className="absolute top-1/2 -left-2 -translate-y-1/2 flex items-center gap-1 px-2">
                <span className="text-[10px] font-bold text-slate-400">Average</span>
                <div className="w-6 h-[1px] bg-slate-300" />
              </div>
              <div className="absolute bottom-2 right-4 flex flex-col items-center">
                <div className="w-[1px] h-6 bg-slate-300 transform -rotate-45" />
                <span className="text-[10px] font-bold text-slate-400 mt-1">Good</span>
              </div>
           </div>
        </div>

        {/* Subject-wise Average */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
           <h3 className="text-[14px] font-bold text-[#1e293b] mb-8">Subject-wise Average</h3>
           <div className="relative h-44 mt-4">
              {/* Y-Axis Grid */}
              <div className="absolute inset-0 flex flex-col justify-between">
                 {[100, 80, 60, 40, 20, 0].map(val => (
                   <div key={val} className="flex items-center gap-3 w-full">
                      <span className="text-[10px] text-slate-400 w-6 font-bold">{val}%</span>
                      <div className="flex-1 h-[1px] bg-slate-100" />
                   </div>
                 ))}
              </div>
              {/* Bars */}
              <div className="absolute inset-0 pl-9 pr-2 flex items-end justify-around gap-4 pb-[1px]">
                 {[
                   { label: "Math", value: 42, color: "bg-[#ef4444]" },
                   { label: "Sci", value: 48, color: "bg-[#ef4444]" },
                   { label: "Eng", value: 58, color: "bg-[#f59e0b]" },
                   { label: "SST", value: 62, color: "bg-[#f59e0b]" },
                 ].map((s, i) => (
                   <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                      <div className={`w-10 ${s.color} rounded-t-sm relative`} style={{ height: `${s.value}%` }}>
                         <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[10px] font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded transition-opacity">{s.value}%</div>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-1">{s.label}</span>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Attendance Trend */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
           <h3 className="text-[14px] font-bold text-[#1e293b] mb-8">Attendance Trend</h3>
           <div className="relative h-44 mt-4">
              {/* Y-Axis Grid */}
              <div className="absolute inset-0 flex flex-col justify-between">
                 {[90, 85, 80, 75, 70].map(val => (
                   <div key={val} className="flex items-center gap-3 w-full">
                      <span className="text-[10px] text-slate-400 w-6 font-bold">{val}%</span>
                      <div className="flex-1 h-[1px] bg-slate-100 shadow-[0_0_0_0.5px_#f8fafc]" />
                   </div>
                 ))}
              </div>
              {/* Line Chart */}
              <div className="absolute inset-x-0 inset-y-0 pl-9 pr-4 pb-[1px]">
                 <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    {/* Spline Path */}
                    <path 
                      d="M 0,40 C 15,40 25,55 33,65 S 50,35 66,45 S 85,60 100,55" 
                      fill="none" 
                      stroke="#ef4444" 
                      strokeWidth="2" 
                    />
                    {/* Dots */}
                    {[0, 25, 50, 75, 100].map((x, i) => (
                       <circle 
                         key={i} 
                         cx={x} 
                         cy={[40, 50, 65, 45, 55][i]} 
                         r="1.5" 
                         className="fill-white stroke-[#ef4444] stroke-[1px]" 
                       />
                    ))}
                 </svg>
                 <div className="flex justify-between mt-3 text-[11px] font-bold text-slate-400">
                    <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden mt-10">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#1e293b]">Student Performance</h2>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              <Filter className="w-4 h-4" /> Filter
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4 ml-0.5" /> Export
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Rank</th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Student</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Math</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Science</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">English</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">SST</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Attendance</th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentsPerformance.map((student) => (
                <tr key={student.rank} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-6 font-bold text-[#1e293b] text-lg">{student.rank}</td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-bold text-[#64748b]">
                        {student.initials}
                      </div>
                      <span className="font-bold text-[#1e293b]">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-center font-bold text-[#22c55e]">{student.math}%</td>
                  <td className="px-6 py-6 text-center font-bold text-[#22c55e]">{student.science}%</td>
                  <td className="px-6 py-6 text-center font-bold text-[#22c55e]">{student.english}%</td>
                  <td className="px-6 py-6 text-center font-bold text-[#22c55e]">{student.sst}%</td>
                  <td className="px-6 py-6 text-center font-bold text-[#475569]">{student.total}</td>
                  <td className="px-6 py-6 text-center font-bold text-[#22c55e]">{student.attendance}</td>
                  <td className="px-6 py-6">
                    <span className="text-[12px] font-bold text-[#1e293b] uppercase tracking-wide">
                      {student.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10">
        <button 
          onClick={onBack}
          className="px-8 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#1e293b] shadow-sm hover:bg-slate-50 transition-colors inline-flex items-center gap-3"
        >
          <ChevronLeft className="w-5 h-5" /> Back to Sections
        </button>
      </div>
    </div>
  );
};


export default ClassPerformance;
