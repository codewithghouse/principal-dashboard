import { useState } from "react";
import { FileText, Calendar, TrendingUp, Award, Users, Percent, Trophy } from "lucide-react";
import ExamDetail from "@/components/ExamDetail";

const upcomingExams = [
  { name: "Quarterly Exam", date: "Feb 15-20, 2026", grades: "Grades 6-10", color: "border-[#1e3a8a]" },
  { name: "Mid-Term Assessment", date: "Mar 10-15, 2026", grades: "Grades 9-10", color: "border-[#f59e0b]" },
  { name: "Unit Test 3", date: "Jan 25-27, 2026", grades: "Grades 6-8", color: "border-[#22c55e]" },
];

const detailedExamData = {
  name: "Unit Test 2 - January 2026",
  date: "Jan 10-12, 2026",
  totalStudents: 824,
  passRate: "78.5%",
  average: "68.2%",
  classSummary: [
    { section: "6A", appeared: 71, passed: 68, failed: 3, passPercentage: "95.8%", topper: "Rohan K", topperScore: "86%", avgPercentage: "72.4%" },
    { section: "7A", appeared: 68, passed: 54, failed: 14, passPercentage: "79.4%", topper: "Meera S", topperScore: "78%", avgPercentage: "64.2%" },
    { section: "9A", appeared: 67, passed: 42, failed: 25, passPercentage: "62.7%", topper: "Aarav R", topperScore: "76%", avgPercentage: "52.8%", isWarning: true },
    { section: "10B", appeared: 70, passed: 64, failed: 6, passPercentage: "91.4%", topper: "Sneha N", topperScore: "98%", avgPercentage: "76.5%" },
  ],
  meritList: [
    { name: "Sneha Nair", section: "10B", score: "98.2%", rank: 1 },
    { name: "Aarav Reddy", section: "9A", score: "96.4%", rank: 2 },
    { name: "Meera Shah", section: "8C", score: "95.8%", rank: 3 },
    { name: "Rohan Kumar", section: "6A", score: "94.2%", rank: 4 },
    { name: "Ankit Jaiswal", section: "7B", score: "93.5%", rank: 5 },
  ],
  failList: [
    { name: "Rahul Sharma", section: "9A", initials: "RS", score: "42%" },
    { name: "Ankit Kumar", section: "10C", initials: "AK", score: "38%" },
    { name: "Priya Singh", section: "8B", initials: "PS", score: "40%" },
    { name: "Sunil Verma", section: "9A", initials: "SV", score: "35%" },
  ]
};

const stats = [
  { label: "Latest Exam", value: "Unit Test 2", subtitle: "Jan 10-12, 2026", icon: FileText, color: "text-[#1e3a8a]", bg: "bg-blue-50", clickable: true },
  { label: "Students Appeared", value: "824", subtitle: "97.3% attendance", icon: Users, color: "text-[#22c55e]", bg: "bg-green-50" },
  { label: "Pass Rate", value: "78.5%", subtitle: "↓ 2.3% vs last exam", icon: Percent, color: "text-[#f59e0b]", bg: "bg-orange-50", trend: "down" },
  { label: "School Topper", value: "Sneha Nair", subtitle: "Grade 10B • 98.2%", icon: Trophy, color: "text-[#22c55e]", bg: "bg-green-50" },
];

const ExamsResults = () => {
  const [showDetail, setShowDetail] = useState(false);

  if (showDetail) {
    return <ExamDetail exam={detailedExamData} onBack={() => setShowDetail(false)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-[#1e293b]">Exams & Results</h1>
        <p className="text-sm text-slate-400 font-medium tracking-tight">Manage exams and view student results</p>
      </div>

      {/* Upcoming Exams Section */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
         <h2 className="text-xl font-black text-[#1e293b] mb-6">Upcoming Exams</h2>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {upcomingExams.map((exam, i) => (
               <div key={i} className={`bg-slate-50/50 border-l-4 ${exam.color} rounded-2xl p-6 hover:bg-white hover:shadow-md transition-all cursor-pointer group`}>
                  <h3 className="text-lg font-black text-[#1e293b] group-hover:text-[#1e3a8a] transition-colors">{exam.name}</h3>
                  <p className="text-sm font-bold text-slate-400 mt-2">{exam.date}</p>
                  <p className="text-xs font-black text-slate-300 mt-1 uppercase tracking-widest">{exam.grades}</p>
               </div>
            ))}
         </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         {stats.map((stat, i) => (
            <div 
               key={i} 
               className={`bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm flex items-start justify-between ${stat.clickable ? 'cursor-pointer hover:border-blue-200 transition-colors group' : ''}`}
               onClick={() => stat.clickable && setShowDetail(true)}
            >
               <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 group-hover:text-blue-500 transition-colors">{stat.label}</p>
                  <div className="text-2xl font-black text-[#1e293b] mb-1">{stat.value}</div>
                  <p className={`text-xs font-bold ${stat.trend === 'down' ? 'text-orange-500' : 'text-slate-400'}`}>
                     {stat.subtitle}
                  </p>
               </div>
               <div className={`p-3 ${stat.bg} ${stat.color} rounded-2xl shadow-sm`}>
                  <stat.icon className="w-5 h-5" />
               </div>
            </div>
         ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         {/* Subject-wise Pass Rates */}
         <div className="lg:col-span-7 bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm text-center">
            <h3 className="text-xl font-black text-[#1e293b] mb-10 text-left">Subject-wise Pass Rates</h3>
            <div className="relative h-64 flex items-end justify-between px-10 border-b border-slate-100/50">
               {/* Grid lines */}
               {[100, 80, 60, 40, 20, 0].map((val) => (
                  <div key={val} className="absolute left-0 right-0 h-[1px] bg-slate-100/30 flex items-center" style={{ bottom: `${val}%` }}>
                     <span className="text-[10px] font-bold text-slate-300 ml-[-35px]">{val}%</span>
                  </div>
               ))}

               {[
                  { subject: 'Math', rate: 68, color: '#ef4444', label: '68%' },
                  { subject: 'Science', rate: 74, color: '#f59e0b', label: '74%' },
                  { subject: 'English', rate: 86, color: '#22c55e', label: '86%' },
                  { subject: 'SST', rate: 92, color: '#15803d', label: '92%' },
               ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-3 w-16 relative z-10">
                     <span className="text-[11px] font-black text-slate-400">{item.label}</span>
                     <div 
                        className="w-12 rounded-t-xl transition-all duration-1000 transform origin-bottom hover:scale-x-110 shadow-lg"
                        style={{ height: `${item.rate * 2}px`, backgroundColor: item.color }}
                     />
                     <span className="absolute -bottom-8 text-sm font-black text-[#1e293b]">{item.subject}</span>
                  </div>
               ))}
            </div>
            <div className="h-8" /> {/* Spacer for x-axis labels */}
         </div>

         {/* Grade Distribution */}
         <div className="lg:col-span-5 bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h3 className="text-xl font-black text-[#1e293b] mb-12">Grade Distribution</h3>
            <div className="relative h-64 flex items-center justify-center">
               <svg viewBox="0 0 100 100" className="w-52 h-52 transform -rotate-90">
                  {/* A Grade - Green */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#22c55e" strokeWidth="20" strokeDasharray="62.8 157" strokeDashoffset="0" />
                  {/* B Grade - Blue */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#1e3a8a" strokeWidth="20" strokeDasharray="47.1 157" strokeDashoffset="-62.8" />
                  {/* C Grade - Orange */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#f59e0b" strokeWidth="20" strokeDasharray="31.4 157" strokeDashoffset="-109.9" />
                  {/* Failed - Red */}
                  <circle cx="50" cy="50" r="25" fill="none" stroke="#ef4444" strokeWidth="20" strokeDasharray="15.7 157" strokeDashoffset="-141.3" />
               </svg>

               {/* Leader Lines & Labels */}
               <div className="absolute top-[10%] right-4 flex items-center">
                  <div className="w-8 h-[1px] bg-slate-200" />
                  <span className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-tighter">A Grade</span>
               </div>
               <div className="absolute top-1/2 -right-8 flex items-center">
                  <div className="w-12 h-[1px] bg-slate-200" />
                  <span className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-tighter">B Grade</span>
               </div>
               <div className="absolute top-1/2 -left-12 flex items-center translate-y-12">
                  <span className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-tighter">C Grade</span>
                  <div className="w-12 h-[1px] bg-slate-200" />
               </div>
               <div className="absolute top-10 left-4 flex items-center">
                  <span className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-tighter">Failed</span>
                  <div className="w-8 h-[1px] bg-slate-200" />
               </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 mt-8">
               {[
                  { label: 'A Grade', color: 'bg-green-500' },
                  { label: 'B Grade', color: 'bg-blue-800' },
                  { label: 'C Grade', color: 'bg-orange-500' },
                  { label: 'Failed', color: 'bg-red-500' },
               ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                     <div className={`w-3 h-3 rounded-full ${item.color}`} />
                     <span className="text-[10px] font-black text-slate-400 uppercase">{item.label}</span>
                  </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default ExamsResults;
