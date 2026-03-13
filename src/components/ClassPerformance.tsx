import React from 'react';
import { ChevronLeft, Filter, Download, User, BookOpen, Clock, Users } from 'lucide-react';
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  AreaChart, Area, 
  ResponsiveContainer, Legend
} from 'recharts';

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

// Chart Data
const pieData = [
  { name: 'Excellent', value: 15, color: '#22c55e' },
  { name: 'Good', value: 40, color: '#1e3a8a' },
  { name: 'Average', value: 30, color: '#f59e0b' },
  { name: 'At Risk', value: 15, color: '#ef4444' },
];

const subjectData = [
  { subject: 'MATH', avg: 42, color: '#ef4444' },
  { subject: 'SCI', avg: 48, color: '#ef4444' },
  { subject: 'ENG', avg: 58, color: '#f59e0b' },
  { subject: 'SST', avg: 62, color: '#f59e0b' },
];

const attendanceTrendData = [
  { day: 'M', value: 82 },
  { day: 'T', value: 80 },
  { day: 'W', value: 78 },
  { day: 'T ', value: 83 },
  { day: 'F', value: 81 },
];

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, name }: any) => {
  const radius = outerRadius + 25;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      fontSize={10} fontWeight={700} fill="#94a3b8">
      {name}
    </text>
  );
};

const CustomBarTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
        {payload[0].payload.subject}: {payload[0].value}%
      </div>
    );
  }
  return null;
};

const CustomAreaTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
        Attendance: {payload[0].value}%
      </div>
    );
  }
  return null;
};

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
        {/* Performance Distribution - Donut Chart */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-[14px] font-bold text-[#1e293b] mb-2">Performance Distribution</h3>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
                label={renderCustomizedLabel}
                labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                animationBegin={0}
                animationDuration={1200}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value}%`, name]}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Subject-wise Average - Bar Chart */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-[14px] font-bold text-[#1e293b] mb-2">Subject-wise Average</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={subjectData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="subject" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }} 
              />
              <YAxis 
                domain={[0, 100]} 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]} animationDuration={1200}>
                {subjectData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Attendance Trend - Area Chart */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-[14px] font-bold text-[#1e293b] mb-2">Attendance Trend</h3>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={attendanceTrendData}>
              <defs>
                <linearGradient id="attendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }} 
              />
              <YAxis 
                domain={[70, 90]} 
                axisLine={false} 
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomAreaTooltip />} />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#ef4444" 
                strokeWidth={2.5} 
                fill="url(#attendGradient)"
                dot={{ r: 5, fill: '#ffffff', stroke: '#ef4444', strokeWidth: 2.5 }}
                activeDot={{ r: 7, fill: '#ef4444', stroke: '#ffffff', strokeWidth: 2 }}
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
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
