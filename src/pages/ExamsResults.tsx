import { useState } from "react";
import { FileText, Calendar, Users, Percent, Trophy, AlertTriangle, Plus, Upload, BookOpen, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import ExamDetail from "@/components/ExamDetail";

const upcomingExams = [
  { name: "Quarterly Exam", date: "Feb 15-20, 2026", grades: "Grades 6-10", color: "#1e3a8a" },
  { name: "Mid-Term Assessment", date: "Mar 10-15, 2026", grades: "Grades 9-10", color: "#f59e0b" },
  { name: "Unit Test 3", date: "Jan 25-27, 2026", grades: "Grades 6-8", color: "#22c55e" },
];

const stats = [
  { label: "Latest Exam", value: "Unit Test 2", subtitle: "Jan 10-12, 2026", icon: FileText, color: "text-[#1e3a8a]", bg: "bg-blue-50" },
  { label: "Students Appeared", value: "824", subtitle: "97.3% attendance", icon: Users, color: "text-[#22c55e]", bg: "bg-green-50" },
  { label: "Pass Rate", value: "78.5%", subtitle: "↓ 2.3% vs last exam", icon: Percent, color: "text-[#f59e0b]", bg: "bg-orange-50", isWarning: true },
  { label: "School Topper", value: "Sneha Nair", subtitle: "Grade 10B • 98.2%", icon: Trophy, color: "text-[#22c55e]", bg: "bg-green-50" },
];

const barData = [
  { name: 'Math', rate: 68, color: '#ef4444' },
  { name: 'Science', rate: 74, color: '#f59e0b' },
  { name: 'English', rate: 86, color: '#22c55e' },
  { name: 'SST', rate: 92, color: '#16a34a' },
];

const pieData = [
  { name: 'A Grade', value: 30, color: '#22c55e' },
  { name: 'B Grade', value: 40, color: '#1e3a8a' },
  { name: 'C Grade', value: 20, color: '#f59e0b' },
  { name: 'Failed', value: 10, color: '#ef4444' },
];

const failedBySubject = [
  { subject: "Mathematics", count: "127", color: "text-red-500" },
  { subject: "Science", count: "98", color: "text-red-500" },
  { subject: "English", count: "45", color: "text-amber-500" },
  { subject: "Social Studies", count: "23", color: "text-green-500" },
];

const ExamsResults = () => {
  const [showDetail, setShowDetail] = useState(false);

  // Fallback data for detail view
  const detailedExamData = {
    name: "Unit Test 2 - January 2026",
    date: "Jan 10-12, 2026",
    totalStudents: 824,
    passRate: "78.5%",
    average: "68.2%",
    classSummary: [],
    meritList: [],
    failList: []
  };

  if (showDetail) {
    return <ExamDetail exam={detailedExamData as any} onBack={() => setShowDetail(false)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">EXAMS & RESULTS</h1>
        <p className="text-sm text-muted-foreground">Manage exams and view student results</p>
      </div>

      {/* ===== UPCOMING EXAMS ===== */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-4">Upcoming Exams</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {upcomingExams.map((exam, i) => (
            <div key={i} className="bg-secondary/20 border-l-4 rounded-xl p-5 hover:bg-secondary/40 transition-all cursor-pointer" style={{ borderLeftColor: exam.color }}>
              <h3 className="text-sm font-bold text-foreground">{exam.name}</h3>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium">{exam.date}</p>
              <p className="text-[10px] font-bold text-muted-foreground/60 mt-1 uppercase tracking-wider">{exam.grades}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, i) => (
          <div 
            key={i} 
            className="bg-card border border-border rounded-xl p-6 shadow-sm flex items-start justify-between cursor-pointer hover:bg-secondary/10 transition-colors"
            onClick={() => i === 0 && setShowDetail(true)}
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">{stat.label}</p>
              <h4 className="text-xl font-bold text-foreground">{stat.value}</h4>
              <p className={`text-[11px] font-bold ${stat.isWarning ? 'text-amber-500' : 'text-muted-foreground'}`}>{stat.subtitle}</p>
            </div>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color} shadow-sm`}>
              <stat.icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      {/* ===== CHARTS SECTION ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subject-wise Pass Rates */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h3 className="text-base font-black text-foreground mb-8">Subject-wise Pass Rates</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
                  unit="%"
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', shadow: 'none', fontWeight: 'bold' }}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={50} label={{ position: 'top', fontSize: 10, fontWeight: 700, fill: '#64748b', offset: 10 }}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grade Distribution */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h3 className="text-base font-black text-foreground mb-8 text-center lg:text-left">Grade Distribution</h3>
          <div className="relative h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={pieData} 
                  innerRadius={60} 
                  outerRadius={100} 
                  paddingAngle={0} 
                  dataKey="value"
                  animationDuration={1500}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Label Overlay for visual accuracy */}
            <div className="absolute top-[10%] right-[10%] text-[10px] font-bold text-muted-foreground flex items-center gap-1">
               <div className="w-4 h-[1px] bg-slate-300" /> A Grade
            </div>
            <div className="absolute top-[50%] right-[5%] text-[10px] font-bold text-muted-foreground flex items-center gap-1">
               <div className="w-5 h-[1px] bg-slate-300" /> B Grade
            </div>
            <div className="absolute top-[60%] left-[5%] text-[10px] font-bold text-muted-foreground flex items-center gap-1">
               C Grade <div className="w-5 h-[1px] bg-slate-300" />
            </div>
            <div className="absolute top-[15%] left-[10%] text-[10px] font-bold text-muted-foreground flex items-center gap-1">
               Failed <div className="w-4 h-[1px] bg-slate-300" />
            </div>
          </div>
          {/* Custom Legend */}
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            {pieData.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-sm`} style={{ backgroundColor: item.color }} />
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== FAILED STUDENTS BY SUBJECT ===== */}
      <div className="bg-[#fdf2f2] border border-red-100 rounded-2xl p-7 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-500 p-1.5 rounded-lg shadow-sm">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-base font-bold text-[#1e293b]">Failed Students by Subject</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {failedBySubject.map((item, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-5 text-center shadow-sm">
              <p className="text-xs font-bold text-slate-400 capitalize mb-2">{item.subject}</p>
              <h4 className={`text-4xl font-black ${item.color}`}>{item.count}</h4>
              <p className="text-[10px] font-bold text-slate-300 mt-1 uppercase">students</p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== BOTTOM ACTION BUTTONS ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="flex items-center gap-2 px-6 py-3 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-[#1e4fc0] transition-colors">
          <Calendar className="w-4 h-4" /> Schedule Exam
        </button>
        <button className="flex items-center gap-2 px-6 py-3 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <Upload className="w-4 h-4 text-muted-foreground" /> Upload Results
        </button>
        <button className="flex items-center gap-2 px-6 py-3 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <BookOpen className="w-4 h-4 text-muted-foreground" /> Generate Report Cards
        </button>
        <button className="flex items-center gap-2 px-6 py-3 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <BarChart2 className="w-4 h-4 text-muted-foreground" /> View Analysis
        </button>
      </div>
    </div>
  );
};

export default ExamsResults;
