import React, { useState } from 'react';
import { ChevronLeft, Edit3, Send, CalendarCheck, UserPlus, GraduationCap, FileText, AlertCircle, TrendingDown, Clock, Phone, Mail, User, UserCheck } from 'lucide-react';

interface StudentProfileProps {
  student: {
    initials: string;
    name: string;
    rollNo: string;
    grade: string;
    gender: string;
    contact?: string;
    attendance?: string;
    status?: string;
    risk?: boolean;
  };
  onBack: () => void;
}

const StudentProfile = ({ student, onBack }: StudentProfileProps) => {
  const [activeTab, setActiveTab] = useState('Overview');

  const tabs = ['Overview', 'Academic', 'Attendance', 'Discipline', 'Parent Communication'];

  // Dynamic data based on student risk status
  const isAtRisk = student.risk || student.status === 'At Risk';
  const studentAge = 14;
  const fatherName = `Mr. ${student.name.split(' ')[1] || 'Sharma'}`;
  const studentContact = student.contact || '+91 98765 43211';
  const studentEmail = `${student.name.toLowerCase().split(' ').join('.')?.charAt(0)}${student.name.toLowerCase().split(' ')[1] || 'student'}@email.com`;

  const riskFactors = isAtRisk ? [
    { icon: AlertCircle, iconBg: 'bg-red-100', iconColor: 'text-red-500', title: 'Low Attendance', detail: `Current: ${student.attendance || '45%'} (Below 75% threshold)`, level: 'CRITICAL' },
    { icon: TrendingDown, iconBg: 'bg-red-100', iconColor: 'text-red-500', title: 'Poor Academic Performance', detail: 'Math: 32%, Science: 38% (Below 40%)', level: 'CRITICAL' },
    { icon: Clock, iconBg: 'bg-amber-100', iconColor: 'text-amber-500', title: 'Late Submissions', detail: '5 assignments submitted late this month', level: 'WARNING' },
  ] : [
    { icon: AlertCircle, iconBg: 'bg-green-100', iconColor: 'text-green-500', title: 'Good Attendance', detail: `Current: ${student.attendance || '94%'} (Above threshold)`, level: 'GOOD' },
  ];

  const examPerformance = isAtRisk
    ? [
        { subject: 'Mathematics', score: 32, color: '#ef4444' },
        { subject: 'Science', score: 38, color: '#ef4444' },
        { subject: 'English', score: 58, color: '#f59e0b' },
        { subject: 'Social Studies', score: 62, color: '#f59e0b' },
      ]
    : [
        { subject: 'Mathematics', score: 88, color: '#22c55e' },
        { subject: 'Science', score: 82, color: '#22c55e' },
        { subject: 'English', score: 76, color: '#f59e0b' },
        { subject: 'Social Studies', score: 91, color: '#22c55e' },
      ];

  const classTeachers = [
    { initials: 'MK', name: 'Mrs. Kavita', role: `Class Teacher – ${student.grade}`, color: '#1e3a8a' },
    { initials: 'SR', name: 'Mr. Ramesh', role: 'Math Teacher', color: '#22c55e' },
  ];

  return (
    <div className="animate-in fade-in duration-500">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Students
      </button>

      {/* ===== PROFILE HEADER ===== */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-[72px] h-[72px] rounded-full bg-[#c0392b] flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0">
              {student.initials}
            </div>
            {/* Info */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{student.name}</h1>
                {isAtRisk && (
                  <span className="px-3 py-1 rounded-md bg-[#c0392b] text-white text-[10px] font-black uppercase tracking-wider">AT RISK</span>
                )}
                {!isAtRisk && student.status === 'Excellent' && (
                  <span className="px-3 py-1 rounded-md bg-[#22c55e] text-white text-[10px] font-black uppercase tracking-wider">EXCELLENT</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-medium mb-2">
                Roll No: {student.rollNo}  •  Grade {student.grade}  •  Age: {studentAge}
              </p>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <span><span className="font-semibold text-foreground">Father:</span>  {fatherName}</span>
                <span><span className="font-semibold text-foreground">Contact:</span>  {studentContact}</span>
                <span><span className="font-semibold text-foreground">Email:</span>  {studentEmail}</span>
              </div>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
              <Edit3 className="w-4 h-4" /> Edit
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
              <Send className="w-4 h-4" /> Notify Parent
            </button>
          </div>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="flex border-b border-border mb-8">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap ${
              activeTab === tab ? 'text-[#1e3a8a]' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1e3a8a] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ===== CONTENT GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== LEFT COLUMN (2/3 width) ===== */}
        <div className="lg:col-span-2 space-y-6">
          {/* Risk Factors */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Risk Factors</h3>
            <div className="space-y-3">
              {riskFactors.map((risk, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl border" style={{
                  backgroundColor: risk.level === 'CRITICAL' ? '#fff5f5' : risk.level === 'WARNING' ? '#fffbeb' : '#f0fdf4',
                  borderColor: risk.level === 'CRITICAL' ? '#fecaca' : risk.level === 'WARNING' ? '#fde68a' : '#bbf7d0',
                }}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl ${risk.iconBg} flex items-center justify-center`}>
                      <risk.icon className={`w-5 h-5 ${risk.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{risk.title}</p>
                      <p className="text-xs text-muted-foreground font-medium">{risk.detail}</p>
                    </div>
                  </div>
                  <span className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white shadow-sm ${
                    risk.level === 'CRITICAL' ? 'bg-[#ef4444]' :
                    risk.level === 'WARNING' ? 'bg-[#f59e0b]' :
                    'bg-[#22c55e]'
                  }`}>
                    {risk.level}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Latest Exam Performance */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Latest Exam Performance</h3>
            <div className="grid grid-cols-4 gap-4">
              {examPerformance.map((exam, i) => (
                <div key={i} className="bg-secondary/30 border border-border rounded-xl p-5 text-center hover:shadow-md transition-all">
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-3">{exam.subject}</p>
                  <p className="text-3xl font-black tracking-tighter" style={{ color: exam.color }}>
                    {exam.score}%
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Attendance Overview */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Attendance Overview</h3>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Days', value: '180', color: '#1e3a8a' },
                { label: 'Present', value: isAtRisk ? '81' : '169', color: '#22c55e' },
                { label: 'Absent', value: isAtRisk ? '99' : '8', color: '#ef4444' },
                { label: 'Percentage', value: student.attendance || '94%', color: isAtRisk ? '#ef4444' : '#22c55e' },
              ].map((item, i) => (
                <div key={i} className="bg-secondary/30 border border-border rounded-xl p-5 text-center">
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-2">{item.label}</p>
                  <p className="text-2xl font-black tracking-tighter" style={{ color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Incidents (only for at-risk) */}
          {isAtRisk && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-foreground mb-5">Recent Incidents</h3>
              <div className="space-y-3">
                {[
                  { title: 'Absent without notice', date: 'Mar 10, 2026', type: 'Attendance', color: '#ef4444' },
                  { title: 'Failed Math unit test', date: 'Mar 05, 2026', type: 'Academic', color: '#f59e0b' },
                  { title: 'Parent meeting missed', date: 'Feb 28, 2026', type: 'Communication', color: '#8b5cf6' },
                ].map((incident, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-secondary/30 rounded-xl border border-border">
                    <div className="w-1 h-10 rounded-full" style={{ backgroundColor: incident.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{incident.title}</p>
                      <p className="text-xs text-muted-foreground font-medium">{incident.date}</p>
                    </div>
                    <span className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-secondary text-muted-foreground border border-border">{incident.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== RIGHT COLUMN (1/3 width) ===== */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full flex items-center gap-3 p-4 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
                <CalendarCheck className="w-4 h-4" /> Schedule Parent Meeting
              </button>
              <button className="w-full flex items-center gap-3 p-4 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-secondary transition-colors">
                <UserPlus className="w-4 h-4 text-muted-foreground" /> Assign to Counselor
              </button>
              <button className="w-full flex items-center gap-3 p-4 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-secondary transition-colors">
                <GraduationCap className="w-4 h-4 text-muted-foreground" /> Enroll in Remedial Class
              </button>
              <button className="w-full flex items-center gap-3 p-4 rounded-xl bg-card border border-border text-sm font-bold text-foreground hover:bg-secondary transition-colors">
                <FileText className="w-4 h-4 text-muted-foreground" /> Generate Progress Report
              </button>
            </div>
          </div>

          {/* Class Teachers */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Class Teachers</h3>
            <div className="space-y-4">
              {classTeachers.map((t, i) => (
                <div key={i} className="flex items-center gap-4 group cursor-pointer">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-md" style={{ backgroundColor: t.color }}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground group-hover:text-[#1e3a8a] transition-colors">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-medium">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Notes</h3>
            <textarea
              className="w-full h-28 p-4 rounded-xl border border-border bg-secondary/30 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30 placeholder:text-muted-foreground/50"
              placeholder="Add private notes about this student..."
            />
            <button className="mt-3 w-full py-2.5 rounded-xl border border-border text-sm font-bold text-[#1e3a8a] hover:bg-secondary transition-colors">
              Save Note
            </button>
          </div>

          {/* Parent Contact Card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Parent Contact</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{fatherName}</p>
                  <p className="text-xs text-muted-foreground font-medium">Father / Guardian</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl border border-border">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{studentContact}</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl border border-border">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{studentEmail}</span>
              </div>
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#22c55e] text-white text-sm font-bold hover:bg-[#16a34a] transition-colors shadow-md">
                <Phone className="w-4 h-4" /> Call Parent
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentProfile;
