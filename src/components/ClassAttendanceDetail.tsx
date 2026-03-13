import React from 'react';
import { ChevronLeft, Filter, Download, MessageSquare, FileText } from 'lucide-react';

interface ClassAttendanceDetailProps {
  className: string;
  onBack: () => void;
}

const attendanceLog = [
  { initials: "AR", name: "Aarav Reddy", totalDays: 15, present: 14, absent: 1, pct: "93%", status: "Good", notified: "-" },
  { initials: "RS", name: "Rahul Sharma", totalDays: 15, present: 7, absent: 8, pct: "47%", status: "Critical", notified: "Yes" },
  { initials: "PP", name: "Priya Patel", totalDays: 15, present: 12, absent: 3, pct: "80%", status: "Average", notified: "-" },
  { initials: "VK", name: "Vikram Kumar", totalDays: 15, present: 15, absent: 0, pct: "100%", status: "Excellent", notified: "-" },
  { initials: "SN", name: "Sneha Nair", totalDays: 15, present: 14, absent: 1, pct: "93%", status: "Good", notified: "-" },
  { initials: "NG", name: "Neha Gupta", totalDays: 15, present: 10, absent: 5, pct: "67%", status: "Warning", notified: "Yes" },
];

// Calendar data for January 2026
const calendarDays = [
  // Week 1 (Mon 30 Dec - Sun 5 Jan)
  { day: 30, pct: null, weekend: false, filler: true },
  { day: 31, pct: null, weekend: false, filler: true },
  { day: 1, pct: 82, weekend: false, filler: false },
  { day: 2, pct: 80, weekend: false, filler: false },
  { day: 3, pct: 78, weekend: false, filler: false },
  { day: 4, pct: null, weekend: true, filler: false },
  { day: 5, pct: null, weekend: true, filler: false },
  // Week 2
  { day: 6, pct: 72, weekend: false, filler: false },
  { day: 7, pct: 76, weekend: false, filler: false },
  { day: 8, pct: 77, weekend: false, filler: false },
  { day: 9, pct: 80, weekend: false, filler: false },
  { day: 10, pct: 78, weekend: false, filler: false },
  { day: 11, pct: null, weekend: true, filler: false },
  { day: 12, pct: null, weekend: true, filler: false },
  // Week 3
  { day: 13, pct: 70, weekend: false, filler: false },
  { day: 14, pct: 68, weekend: false, filler: false },
  { day: 15, pct: 75, weekend: false, filler: false },
  { day: 16, pct: 76, weekend: false, filler: false },
  { day: 17, pct: 77, weekend: false, filler: false },
  { day: 18, pct: null, weekend: true, filler: false },
  { day: 19, pct: null, weekend: true, filler: false },
];

const ClassAttendanceDetail = ({ className, onBack }: ClassAttendanceDetailProps) => {
  const getDayStyle = (d: typeof calendarDays[0]) => {
    if (d.filler || d.weekend) return { bg: '#f8fafc', text: '#94a3b8' };
    if (d.pct === null) return { bg: '#f8fafc', text: '#94a3b8' };
    if (d.pct >= 80) return { bg: '#22c55e', text: '#ffffff' };
    if (d.pct >= 70) return { bg: '#f59e0b', text: '#ffffff' };
    return { bg: '#ef4444', text: '#ffffff' };
  };

  const getPctColor = (pct: string) => {
    const val = parseInt(pct);
    if (val >= 90) return '#22c55e';
    if (val >= 70) return '#f59e0b';
    return '#ef4444';
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Excellent': return 'text-green-600 font-bold';
      case 'Good': return 'text-green-600 font-bold';
      case 'Average': return 'text-amber-500 font-bold';
      case 'Warning': return 'text-amber-500 font-bold';
      case 'Critical': return 'text-red-500 font-bold';
      default: return 'text-foreground font-bold';
    }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Attendance</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Class Attendance Detail</span>
      </div>

      {/* ===== HEADER CARD ===== */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Grade {className} Attendance</h1>
            <p className="text-sm text-muted-foreground font-medium">
              Class Teacher: Mrs. Kavita  •  67 Students
            </p>
          </div>
          <div className="flex items-center gap-10">
            <div className="text-right">
              <p className="text-4xl font-black text-[#22c55e]">78%</p>
              <p className="text-xs font-medium text-muted-foreground">Monthly Average</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black text-[#ef4444]">12</p>
              <p className="text-xs font-medium text-muted-foreground">Chronic Absentees</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CALENDAR VIEW ===== */}
      <div className="bg-card border border-border rounded-2xl p-7 shadow-sm mb-6">
        <h3 className="text-base font-bold text-foreground mb-6">January 2026 Calendar View</h3>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-3 mb-3">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-3">
          {calendarDays.map((d, i) => {
            const style = getDayStyle(d);
            return (
              <div
                key={i}
                className="h-[72px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105 cursor-default shadow-sm"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                <span className="text-sm font-bold" style={{ opacity: d.filler ? 0.4 : 0.7 }}>{d.day}</span>
                {d.pct !== null && (
                  <span className="text-xs font-black">{d.pct}%</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-6 pt-5 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
            <span className="text-[10px] font-bold text-muted-foreground">80-100%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
            <span className="text-[10px] font-bold text-muted-foreground">70-79%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
            <span className="text-[10px] font-bold text-muted-foreground">Below 70%</span>
          </div>
        </div>
      </div>

      {/* ===== STUDENT-WISE ATTENDANCE TABLE ===== */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-7 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Student-wise Attendance</h2>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-secondary transition-colors">
              <Filter className="w-4 h-4" /> Filter
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-secondary transition-colors">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Student</th>
                <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Total Days</th>
                <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Present</th>
                <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Absent</th>
                <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">%</th>
                <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Status</th>
                <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Parent Notified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendanceLog.map((s, idx) => (
                <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-7 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                        {s.initials}
                      </div>
                      <span className="font-bold text-foreground text-sm">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-7 py-5 text-sm font-medium text-muted-foreground">{s.totalDays}</td>
                  <td className="px-7 py-5 text-sm font-medium text-muted-foreground">{s.present}</td>
                  <td className="px-7 py-5">
                    <span className={`text-sm font-bold ${s.absent >= 5 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {s.absent}
                    </span>
                  </td>
                  <td className="px-7 py-5">
                    <span className="text-sm font-bold" style={{ color: getPctColor(s.pct) }}>{s.pct}</span>
                  </td>
                  <td className="px-7 py-5">
                    <span className={`text-sm ${getStatusStyle(s.status)}`}>{s.status}</span>
                  </td>
                  <td className="px-7 py-5">
                    <span className={`text-sm font-medium ${s.notified === 'Yes' ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                      {s.notified}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ef4444] text-white text-sm font-bold hover:bg-red-600 transition-colors shadow-md">
          <MessageSquare className="w-4 h-4" /> Bulk SMS to Absentee Parents
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <FileText className="w-4 h-4 text-muted-foreground" /> Export Attendance Register
        </button>
      </div>

      {/* Back Button */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Attendance
        </button>
      </div>
    </div>
  );
};

export default ClassAttendanceDetail;
