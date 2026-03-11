import React from 'react';
import { ChevronLeft, Filter, Download, User, Users } from 'lucide-react';

interface ClassAttendanceDetailProps {
  className: string;
  onBack: () => void;
}

const attendanceLog = [
  { rank: 1, initials: "AR", name: "Aarav Reddy", totalDays: 15, present: 14, absent: 1, pct: "93%", status: "Good", notified: "-" },
  { rank: 2, initials: "RS", name: "Rahul Sharma", totalDays: 15, present: 7, absent: 8, pct: "46%", status: "Chronic", notified: "Today, 9:20 AM" },
  { rank: 3, initials: "PP", name: "Priya Patel", totalDays: 15, present: 12, absent: 3, pct: "80%", status: "Average", notified: "-" },
  { rank: 4, initials: "VK", name: "Vikram Kumar", totalDays: 15, present: 15, absent: 0, pct: "100%", status: "Excellent", notified: "-" },
  { rank: 5, initials: "SN", name: "Sneha Nair", totalDays: 15, present: 14, absent: 1, pct: "93%", status: "Good", notified: "-" },
];

const calendarDays = [
  { day: 30, pct: null, current: false },
  { day: 31, pct: null, current: false },
  { day: 1, pct: 82, current: true },
  { day: 2, pct: 80, current: true },
  { day: 3, pct: 78, current: true },
  { day: 4, pct: null, current: true, weekend: true },
  { day: 5, pct: null, current: true, weekend: true },
  { day: 6, pct: 72, current: true },
  { day: 7, pct: 76, current: true },
  { day: 8, pct: 77, current: true },
  { day: 9, pct: 80, current: true },
  { day: 10, pct: 78, current: true },
  { day: 11, pct: null, current: true, weekend: true },
  { day: 12, pct: null, current: true, weekend: true },
  { day: 13, pct: 70, current: true },
  { day: 14, pct: 68, current: true },
  { day: 15, pct: 75, current: true },
  { day: 16, pct: 76, current: true },
  { day: 17, pct: 77, current: true },
  { day: 18, pct: null, current: true, weekend: true },
  { day: 19, pct: null, current: true, weekend: true },
];

const ClassAttendanceDetail = ({ className, onBack }: ClassAttendanceDetailProps) => {
  const getDayColor = (pct: number | null) => {
    if (pct === null) return "bg-slate-100 text-slate-400";
    if (pct >= 80) return "bg-[#22c55e] text-white";
    if (pct >= 75) return "bg-[#f59e0b] text-white";
    return "bg-[#ef4444] text-white";
  };

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Attendance</span>
        <span>/</span>
        <span className="text-foreground font-medium">Class Attendance Detail</span>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1e293b]">Grade {className} Attendance</h1>
            <p className="text-sm font-medium text-slate-400 flex items-center gap-4 mt-2">
              <span>Class Teacher: Mrs. Kavita</span>
              <span>•</span>
              <span>67 Students</span>
            </p>
          </div>
        </div>
        <div className="flex gap-12 text-right">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Monthly Average</p>
            <p className="text-4xl font-bold text-[#22c55e]">78%</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Chronic Absentees</p>
            <p className="text-4xl font-bold text-[#ef4444]">12</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm mb-8">
        <h3 className="text-lg font-bold text-[#1e293b] mb-8">January 2026 Calendar View</h3>
        <div className="grid grid-cols-7 gap-4">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-xs font-bold text-slate-400 uppercase mb-2">{d}</div>
          ))}
          {calendarDays.map((d, i) => (
            <div key={i} className={`h-20 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm transition-all hover:scale-105 cursor-default ${getDayColor(d.pct)}`}>
               <span className="text-sm font-bold opacity-60">{d.day}</span>
               {d.pct !== null && <span className="text-xs font-black">{d.pct}%</span>}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-6 mt-8 pt-6 border-t border-slate-50">
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">80-100%</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">70-79%</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Below 70%</span>
           </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden mt-10">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1e293b]">Student-wise Attendance</h2>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              <Filter className="w-4 h-4" /> Filter
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Student</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total Days</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Present</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Absent</th>
                <th className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">%</th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Parent Notified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendanceLog.map((s) => (
                <tr key={s.rank} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-bold text-[#64748b]">
                        {s.initials}
                      </div>
                      <div>
                        <p className="font-bold text-[#1e293b] text-sm">{s.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center font-bold text-slate-500">{s.totalDays}</td>
                  <td className="px-6 py-5 text-center font-bold text-slate-500">{s.present}</td>
                  <td className="px-6 py-5 text-center font-bold text-slate-500">{s.absent}</td>
                  <td className={`px-6 py-5 text-center font-bold ${parseInt(s.pct) < 70 ? 'text-red-500' : 'text-green-500'}`}>{s.pct}</td>
                  <td className="px-6 py-5">
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${
                      s.status === 'Chronic' ? 'text-red-500' : 
                      s.status === 'Excellent' ? 'text-green-500' : 'text-[#1e293b]'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-slate-400 font-medium">{s.notified}</span>
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
          <ChevronLeft className="w-5 h-5" /> Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default ClassAttendanceDetail;
