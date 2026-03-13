import React, { useState } from 'react';
import { ChevronLeft, Star, Mail, Phone, Edit2, Send, GraduationCap, Award, Calendar, FileText, UserCheck, RefreshCw } from 'lucide-react';

interface TeacherProfileProps {
  teacher: {
    initials: string;
    name: string;
    subject: string;
    classes: number;
    experience: string;
    rating: number;
    status: string;
  };
  onBack: () => void;
}

const TeacherProfile = ({ teacher, onBack }: TeacherProfileProps) => {
  const [activeTab, setActiveTab] = useState('Profile');

  const tabs = ['Profile', 'Classes', 'Performance', 'Attendance', 'Reviews'];

  const metrics = [
    { label: 'Class Average', value: 62, color: '#22c55e', textColor: '#22c55e', display: '62%' },
    { label: 'Pass Rate', value: 84, color: '#22c55e', textColor: '#22c55e', display: '84%' },
    { label: 'Student Satisfaction', value: 96, color: '#22c55e', textColor: '#22c55e', display: '4.8/5' },
  ];

  const assignedClasses = [
    { cls: '9A', students: 67, status: 'Weak', statusColor: '#ef4444' },
    { cls: '8B', students: 72, status: 'Good', statusColor: '#22c55e' },
    { cls: '10A', students: 68, status: 'Good', statusColor: '#22c55e' },
  ];

  const quickActions = [
    { label: 'Reassign Class', icon: RefreshCw },
    { label: 'View Schedule', icon: Calendar },
    { label: 'Generate Report', icon: FileText },
    { label: 'View Attendance', icon: UserCheck },
  ];

  const thisMonthStats = [
    { label: 'Classes Taken', value: '48/52', color: '#1e293b' },
    { label: 'Attendance', value: '92%', color: '#22c55e' },
    { label: 'Tests Conducted', value: '6', color: '#1e293b' },
    { label: 'Parent Meetings', value: '4', color: '#1e293b' },
  ];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Teachers</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Teacher Profile</span>
      </div>

      {/* ===== PROFILE HEADER ===== */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="w-[76px] h-[76px] rounded-2xl bg-[#1e3a8a] flex items-center justify-center text-white text-3xl font-bold shadow-lg shrink-0">
              {teacher.initials}
            </div>
            {/* Info */}
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{teacher.name}</h1>
                <div className="flex items-center gap-1">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  <span className="text-lg font-bold text-foreground">{teacher.rating}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground font-medium mb-2.5">
                {teacher.subject} Teacher  •  {teacher.experience} Experience
              </p>
              <div className="flex items-center gap-8 text-sm text-muted-foreground">
                <span><span className="font-semibold text-foreground">Email:</span>  kavita.m@school.edu</span>
                <span><span className="font-semibold text-foreground">Phone:</span>  +91 98765 12345</span>
              </div>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
              <Send className="w-4 h-4" /> Message
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

      {/* ===== 3-COLUMN CONTENT GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-6">
          {/* Qualifications */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-6">Qualifications</h3>
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5 text-[#1e3a8a]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">M.Sc. Mathematics</p>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">Osmania University, 2012</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">B.Ed.</p>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">Hyderabad University, 2014</p>
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Classes */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Assigned Classes</h3>
            <div className="space-y-3">
              {assignedClasses.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border hover:shadow-sm transition-all cursor-pointer">
                  <div>
                    <p className="text-lg font-bold text-foreground">{c.cls}</p>
                    <p className="text-xs text-muted-foreground font-medium">{c.students} students</p>
                  </div>
                  <span className="text-xs font-bold" style={{ color: c.statusColor }}>{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== MIDDLE COLUMN ===== */}
        <div className="space-y-6">
          {/* Performance Metrics */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-6">Performance Metrics</h3>
            <div className="space-y-6">
              {metrics.map((m, i) => (
                <div key={i} className="p-4 bg-secondary/20 rounded-xl border border-border">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-muted-foreground">{m.label}</span>
                    <span className="text-sm font-bold" style={{ color: m.textColor }}>{m.display}</span>
                  </div>
                  <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${m.value}%`, backgroundColor: m.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Reviews */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Recent Reviews</h3>
            <div className="space-y-4">
              {/* Review 1 */}
              <div className="p-4 bg-secondary/20 rounded-xl border border-border">
                <div className="flex gap-0.5 mb-2">
                  {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed italic">
                  "Excellent teaching methods, very clear explanations"
                </p>
                <p className="text-[11px] text-muted-foreground/70 font-bold mt-2">– Parent of 9A</p>
              </div>
              {/* Review 2 */}
              <div className="p-4 bg-secondary/20 rounded-xl border border-border">
                <div className="flex gap-0.5 mb-2">
                  {[1,2,3,4].map(s => <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />)}
                  <Star className="w-4 h-4 text-gray-200 fill-gray-200" />
                </div>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed italic">
                  "Good with concepts but could improve on giving more homework"
                </p>
                <p className="text-[11px] text-muted-foreground/70 font-bold mt-2">– Parent of 8B</p>
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT COLUMN ===== */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Quick Actions</h3>
            <div className="space-y-3">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  className="w-full p-4 border border-border rounded-xl flex items-center gap-4 hover:bg-secondary hover:shadow-sm transition-all text-left"
                >
                  <action.icon className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* This Month */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">This Month</h3>
            <div className="space-y-4">
              {thisMonthStats.map((stat, i) => (
                <div key={i} className="flex justify-between items-center py-1">
                  <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                  <span className="text-sm font-bold" style={{ color: stat.color }}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Teaching Schedule Today */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Today's Schedule</h3>
            <div className="space-y-3">
              {[
                { time: '8:30 AM', cls: '9A', room: 'Room 201', status: 'Completed' },
                { time: '10:00 AM', cls: '8B', room: 'Room 105', status: 'Completed' },
                { time: '11:30 AM', cls: '10A', room: 'Room 302', status: 'Upcoming' },
                { time: '2:00 PM', cls: '9A', room: 'Lab 3', status: 'Upcoming' },
              ].map((slot, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/20">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-16">{slot.time}</span>
                    <div>
                      <p className="text-sm font-bold text-foreground">Class {slot.cls}</p>
                      <p className="text-[11px] text-muted-foreground font-medium">{slot.room}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                    slot.status === 'Completed'
                      ? 'bg-green-50 text-green-600 border border-green-100'
                      : 'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}>
                    {slot.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Teachers
        </button>
      </div>
    </div>
  );
};

export default TeacherProfile;
