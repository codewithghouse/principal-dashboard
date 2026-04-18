import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Filter, Download, MessageSquare, FileText } from 'lucide-react';
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

interface ClassAttendanceDetailProps {
  className: string;
  onBack: () => void;
}

const ClassAttendanceDetail = ({ className, onBack }: ClassAttendanceDetailProps) => {
  const { userData } = useAuth();
  const teacherNameRef = useRef("—");

  const [loading, setLoading] = useState(true);
  const [classInfo, setClassInfo] = useState({ teacherName: "—", totalStudents: 0, monthlyAvg: 0, chronicCount: 0 });
  const [calendarData, setCalendarData] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [monthLabel, setMonthLabel] = useState('');

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);

    const now = new Date();
    setMonthLabel(now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    // ── Fetch class teacher (once) ──
    getDocs(query(
      collection(db, 'teaching_assignments'),
      where('schoolId', '==', userData.schoolId),
      where('className', '==', className)
    )).then(taSnap => {
      if (!taSnap.empty) {
        const ta = taSnap.docs[0].data();
        if (ta.teacherName) {
          teacherNameRef.current = ta.teacherName;
        } else if (ta.teacherId) {
          getDocs(query(collection(db, 'teachers'), where('schoolId', '==', userData.schoolId)))
            .then(tSnap => {
              const match = tSnap.docs.find(d => d.id === ta.teacherId);
              if (match) teacherNameRef.current = match.data().name || "—";
            });
        }
      }
    }).catch(() => {});

    // ── Realtime attendance listener ──
    const attConstraints: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) attConstraints.push(where("branchId", "==", userData.branchId));

    const unsub = onSnapshot(query(collection(db, "attendance"), ...attConstraints), (snap) => {
      const allRecords: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filter records for this class
      const gradeNum = className.replace(/Grade\s*/i, '').trim();
      const classRecords = allRecords.filter(r =>
        r.gradeLevel === className ||
        r.className  === className ||
        (r.className && gradeNum && r.className.includes(gradeNum))
      );

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toLocaleDateString('en-CA');

      // ── Build calendar for current month ──
      const year  = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth    = new Date(year, month + 1, 0).getDate();
      const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
      // Monday-based offset: Mon=0, Sun=6
      const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

      const calDays: any[] = [];
      for (let i = 0; i < startOffset; i++) {
        calDays.push({ day: null, pct: null, weekend: false, filler: true });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dow     = new Date(year, month, d).getDay();
        const isWkEnd = dow === 0 || dow === 6;
        const dateStr = new Date(year, month, d).toLocaleDateString('en-CA');

        if (isWkEnd) {
          calDays.push({ day: d, pct: null, weekend: true, filler: false });
        } else {
          const dayRecs = classRecords.filter(r => r.date === dateStr);
          const pct = dayRecs.length === 0
            ? null
            : Math.round((dayRecs.filter(r => r.status === 'present').length / dayRecs.length) * 100);
          calDays.push({ day: d, pct, weekend: false, filler: false });
        }
      }
      setCalendarData(calDays);

      // ── Student-wise aggregation ──
      const studentMap: Record<string, {
        name: string; present: number; absent: number; late: number; notified: boolean
      }> = {};

      classRecords.forEach(r => {
        const sid = r.studentId || r.studentName || 'unknown';
        if (!studentMap[sid]) {
          studentMap[sid] = { name: r.studentName || sid, present: 0, absent: 0, late: 0, notified: false };
        }
        if (r.status === 'present') studentMap[sid].present++;
        else if (r.status === 'absent') {
          studentMap[sid].absent++;
          if (r.parentNotified || r.notified) studentMap[sid].notified = true;
        } else if (r.status === 'late') studentMap[sid].late++;
      });

      const studentList = Object.values(studentMap).map(s => {
        const total = s.present + s.absent + s.late;
        const pct   = total === 0 ? 0 : Math.round((s.present / total) * 100);
        const status =
          pct >= 95 ? 'Excellent' :
          pct >= 85 ? 'Good'      :
          pct >= 75 ? 'Average'   :
          pct >= 60 ? 'Warning'   : 'Critical';
        return {
          initials:  s.name.substring(0, 2).toUpperCase(),
          name:      s.name,
          totalDays: total,
          present:   s.present,
          absent:    s.absent,
          pct:       `${pct}%`,
          pctVal:    pct,
          status,
          notified:  s.notified ? 'Yes' : '—'
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      // ── Class-level stats ──
      const monthlyRecs    = classRecords.filter(r => r.date && r.date >= cutoffStr);
      const monthlyPresent = monthlyRecs.filter(r => r.status === 'present').length;
      const monthlyAvg     = monthlyRecs.length === 0 ? 0 : Math.round((monthlyPresent / monthlyRecs.length) * 100);
      const chronicCount   = studentList.filter(s => s.pctVal < 75).length;

      setStudents(studentList);
      setClassInfo({
        teacherName:    teacherNameRef.current,
        totalStudents:  studentList.length,
        monthlyAvg,
        chronicCount
      });
      setLoading(false);
    });

    return () => unsub();
  }, [userData?.schoolId, userData?.branchId, className]);

  const getDayStyle = (d: any) => {
    if (d.filler || d.weekend || d.pct === null) return { bg: '#f8fafc', text: '#94a3b8' };
    if (d.pct >= 80) return { bg: '#22c55e', text: '#ffffff' };
    if (d.pct >= 70) return { bg: '#f59e0b', text: '#ffffff' };
    return { bg: '#ef4444', text: '#ffffff' };
  };

  const getPctColor = (pct: number) =>
    pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Excellent': case 'Good': return 'text-green-600 font-bold';
      case 'Average': return 'text-amber-500 font-bold';
      case 'Warning':  return 'text-amber-600 font-bold';
      case 'Critical': return 'text-red-500 font-bold';
      default: return 'text-foreground font-bold';
    }
  };

  const exportRegister = () => {
    const html = buildReport({
      title: `Attendance Register — ${className}`,
      subtitle: `Teacher: ${classInfo.teacherName} · ${classInfo.totalStudents} Students`,
      badge: "Attendance",
      heroStats: [
        { label: "Monthly Avg",      value: `${classInfo.monthlyAvg}%`, color: classInfo.monthlyAvg >= 85 ? "#4ade80" : "#fbbf24" },
        { label: "Total Students",   value: classInfo.totalStudents },
        { label: "Chronic Absentees", value: classInfo.chronicCount, color: classInfo.chronicCount > 0 ? "#f87171" : "#4ade80" },
      ],
      sections: [
        {
          title: "Student-wise Attendance",
          type: "table",
          headers: ["Student", "Total Days", "Present", "Absent", "%", "Status", "Parent Notified"],
          rows: students.map(s => ({
            cells: [s.name, s.totalDays, s.present, s.absent, s.pct, s.status, s.notified],
            highlight: s.pctVal < 75,
          })),
        },
      ],
    });
    openReportWindow(html);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-[#1e3a8a] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">
          Attendance
        </button>
        <span>/</span>
        <span className="text-foreground font-semibold">Class Attendance Detail</span>
      </div>

      {/* ===== HEADER CARD ===== */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{className} Attendance</h1>
            <p className="text-sm text-muted-foreground font-medium">
              Class Teacher: {classInfo.teacherName} &bull; {classInfo.totalStudents} Students
            </p>
          </div>
          <div className="flex items-center gap-10">
            <div className="text-right">
              <p className="text-4xl font-black" style={{ color: getPctColor(classInfo.monthlyAvg) }}>
                {classInfo.monthlyAvg}%
              </p>
              <p className="text-xs font-medium text-muted-foreground">Monthly Average</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black text-[#ef4444]">{classInfo.chronicCount}</p>
              <p className="text-xs font-medium text-muted-foreground">Chronic Absentees</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CALENDAR VIEW ===== */}
      <div className="bg-card border border-border rounded-2xl p-7 shadow-sm mb-6">
        <h3 className="text-base font-bold text-foreground mb-6">{monthLabel} Calendar View</h3>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-3 mb-3">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-3">
          {calendarData.map((d, i) => {
            const style = getDayStyle(d);
            return (
              <div
                key={i}
                className="h-[72px] rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-sm transition-all hover:scale-105"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {!d.filler && (
                  <span className="text-sm font-bold" style={{ opacity: 0.8 }}>{d.day}</span>
                )}
                {!d.filler && !d.weekend && d.pct !== null && (
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

      {/* ===== STUDENT-WISE TABLE ===== */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-7 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Student-wise Attendance</h2>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-secondary transition-colors">
              <Filter className="w-4 h-4" /> Filter
            </button>
            <button
              onClick={exportRegister}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-secondary transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground font-medium">
            No attendance records found for this class
          </div>
        ) : (
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
                {students.map((s, idx) => (
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
                      <span className="text-sm font-bold" style={{ color: getPctColor(s.pctVal) }}>{s.pct}</span>
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
        )}
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ef4444] text-white text-sm font-bold hover:bg-red-600 transition-colors shadow-md">
          <MessageSquare className="w-4 h-4" /> Bulk SMS to Absentee Parents
        </button>
        <button
          onClick={exportRegister}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors"
        >
          <FileText className="w-4 h-4 text-muted-foreground" /> Export Attendance Register
        </button>
      </div>

      {/* Back */}
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
