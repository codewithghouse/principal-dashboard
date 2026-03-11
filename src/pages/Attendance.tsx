import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "@/components/dashboard/StatCard";
import { CheckCircle, XCircle, Clock, TrendingUp, Calendar, ArrowRight } from "lucide-react";
import ClassAttendanceDetail from "@/components/ClassAttendanceDetail";

const trendData = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  value: 88 + Math.random() * 6,
}));

const gradeAttendance = [
  { grade: "Grade 6", pct: "95%", color: "bg-[#22c55e]", students: 142 },
  { grade: "Grade 7", pct: "94%", color: "bg-[#22c55e]", students: 138 },
  { grade: "Grade 8", pct: "91%", color: "bg-[#22c55e]", students: 156 },
  { grade: "Grade 9", pct: "82%", color: "bg-[#f59e0b]", students: 201 },
  { grade: "Grade 10", pct: "90%", color: "bg-[#22c55e]", students: 210 },
];

const absentStudents = [
  { initials: "RS", name: "Rahul Sharma", grade: "9A", contact: "+91 98765 43211", consecutive: "5 days", monthly: "45%", status: "Chronic" },
  { initials: "AR", name: "Aarav Reddy", grade: "8B", contact: "+91 98765 43222", consecutive: "1 day", monthly: "93%", status: "Occasional" },
];

const Attendance = () => {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  if (selectedClass) {
    return <ClassAttendanceDetail className={selectedClass} onBack={() => setSelectedClass(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-[#1e293b]">Attendance</h1>
        <p className="text-sm text-slate-400">Monitor student attendance patterns and trends</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Present" value="91.2%" subtitle="772 students" subtitleColor="muted" icon={CheckCircle} iconColor="text-green-500" />
        <StatCard title="Absent Today" value={75} subtitle="8.8% of total" subtitleColor="destructive" icon={XCircle} iconColor="text-red-500" />
        <StatCard title="Late Arrivals" value={23} subtitle="2.7% of total" subtitleColor="warning" icon={Clock} iconColor="text-orange-500" />
        <StatCard title="Monthly Avg" value="89.4%" subtitle="↑ 1.2% vs last month" subtitleColor="success" icon={TrendingUp} iconColor="text-blue-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#1e293b] mb-6 flex items-center justify-between">
            Grade-wise Attendance
            <span className="text-[10px] font-bold text-slate-400 uppercase">Click bar for details</span>
          </h2>
          <div className="space-y-6">
            {gradeAttendance.map((g) => (
              <div 
                key={g.grade} 
                className="group cursor-pointer"
                onClick={() => setSelectedClass(g.grade)}
              >
                <div className="flex justify-between text-xs font-bold text-slate-400 uppercase mb-2 group-hover:text-[#1e3a8a] transition-colors">
                   <span>{g.grade}</span>
                   <span>{g.pct}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-2.5 bg-slate-50 rounded-full overflow-hidden">
                    <div className={`h-full ${g.color} rounded-full transition-all duration-1000 group-hover:brightness-95`} style={{ width: g.pct }} />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-[#1e3a8a] transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#1e293b] mb-6">30-Day Attendance Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis domain={[85, 96]} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(v: number) => [`${v.toFixed(1)}%`, "Attendance"]} 
              />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm mt-8">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-[#1e293b]">Absent Students Today</h2>
          <button className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors">
            <Calendar className="w-4 h-4" /> Alert All Parents
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="text-left px-6 py-4 text-slate-400 font-bold uppercase tracking-widest text-[11px]">Student</th>
                <th className="text-left px-6 py-4 text-slate-400 font-bold uppercase tracking-widest text-[11px]">Grade-Section</th>
                <th className="text-left px-6 py-4 text-slate-400 font-bold uppercase tracking-widest text-[11px]">Parent Contact</th>
                <th className="text-center px-6 py-4 text-slate-400 font-bold uppercase tracking-widest text-[11px]">Consecutive Absent</th>
                <th className="text-center px-6 py-4 text-slate-400 font-bold uppercase tracking-widest text-[11px]">Monthly %</th>
                <th className="text-left px-6 py-4 text-slate-400 font-bold uppercase tracking-widest text-[11px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {absentStudents.map((s) => (
                <tr key={s.name} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-[10px] font-bold text-[#64748b]">
                        {s.initials}
                      </div>
                      <span className="font-bold text-[#1e293b]">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-bold text-slate-600">{s.grade}</td>
                  <td className="px-6 py-5 italic text-slate-400 text-sm">{s.contact}</td>
                  <td className="px-6 py-5 text-center text-red-500 font-black">{s.consecutive}</td>
                  <td className="px-6 py-5 text-center text-red-500 font-black">{s.monthly}</td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      s.status === 'Chronic' ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-orange-50 text-orange-500 border border-orange-100'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
