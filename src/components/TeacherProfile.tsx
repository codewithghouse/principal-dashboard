import React, { useState } from 'react';
import {
  ChevronLeft, Star, Edit2, Send, GraduationCap, Award,
  Calendar, FileText, UserCheck, RefreshCw, Mail, Phone,
  BookOpen, Users, Clock, CheckCircle
} from 'lucide-react';

interface TeacherProfileProps {
  teacher: any; // full Firestore doc passed from Teachers.tsx
  onBack: () => void;
}

const TeacherProfile = ({ teacher, onBack }: TeacherProfileProps) => {
  const [activeTab, setActiveTab] = useState('Profile');
  const tabs = ['Profile', 'Classes', 'Performance', 'Attendance', 'Reviews'];

  // ── Derive safe values from real Firestore data ─────────────────────────
  const name       = teacher.name       || 'Unknown Teacher';
  const subject    = teacher.subject    || 'N/A';
  const experience = teacher.experience || 'N/A';
  const email      = teacher.email      || '—';
  const phone      = teacher.phone      || '—';
  const status     = teacher.status     || 'Active';
  const classes    = teacher.classes    || '—';
  const rating     = teacher.rating     || '5.0';
  const initials   = teacher.initials   || name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const schoolName = teacher.schoolName || '—';
  const branch     = teacher.branch     || '—';

  // ── Color badge helper ───────────────────────────────────────────────────
  const statusBadge = (s: string) => {
    if (s === 'Active')  return 'bg-green-50 text-green-600 border border-green-100';
    if (s === 'Invited') return 'bg-blue-50 text-blue-600 border border-blue-100';
    return 'bg-slate-50 text-slate-500 border border-slate-100';
  };

  const quickActions = [
    { label: 'Reassign Class',  icon: RefreshCw },
    { label: 'View Schedule',   icon: Calendar  },
    { label: 'Generate Report', icon: FileText  },
    { label: 'View Attendance', icon: UserCheck },
  ];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">
          Teachers
        </button>
        <span>/</span>
        <span className="text-foreground font-semibold">Teacher Profile</span>
      </div>

      {/* ── PROFILE HEADER ────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className={`w-[76px] h-[76px] rounded-2xl ${teacher.color || 'bg-[#1e3a8a]'} flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0`}>
              {initials}
            </div>
            {/* Info */}
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{name}</h1>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-base font-bold text-foreground">{rating}</span>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${statusBadge(status)}`}>
                  {status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-medium mb-2.5">
                {subject} Teacher &nbsp;•&nbsp; {experience} Experience
              </p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground">Email:</span>
                  <span>{email}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground">Phone:</span>
                  <span>{phone || '—'}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-1 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground">School:</span>
                  <span>{schoolName}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground">Branch:</span>
                  <span>{branch}</span>
                </span>
              </div>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
            >
              <Send className="w-4 h-4" /> Message
            </a>
          </div>
        </div>
      </div>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border mb-8 overflow-x-auto">
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

      {/* ── 3-COLUMN CONTENT GRID ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Real Teacher Info Card (replaces hardcoded Qualifications) */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Teacher Info</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-[#1e3a8a]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Subject</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{subject}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Experience</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{experience}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Assigned Class</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{classes}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Status</p>
                  <p className={`text-sm font-bold mt-0.5 ${status === 'Active' ? 'text-green-600' : 'text-blue-600'}`}>
                    {status}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Contact Details</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Mail className="w-4 h-4 text-[#1e3a8a] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Email</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Phone className="w-4 h-4 text-[#1e3a8a] shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Phone</p>
                  <p className="text-sm font-bold text-slate-800">{phone || 'Not provided'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── MIDDLE COLUMN ───────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* School Info */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">School Assignment</h3>
            <div className="space-y-4">
              <div className="p-4 bg-[#1e3a8a]/5 rounded-xl border border-[#1e3a8a]/10">
                <p className="text-[10px] font-black text-[#1e3a8a] uppercase tracking-wider mb-1">School</p>
                <p className="text-sm font-bold text-slate-800">{schoolName}</p>
              </div>
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider mb-1">Branch</p>
                <p className="text-sm font-bold text-slate-800">{branch}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-wider mb-1">Assigned Class</p>
                <p className="text-sm font-bold text-slate-800">{classes}</p>
              </div>
            </div>
          </div>

          {/* No data banner for performance (future feature) */}
          <div className="bg-card border border-dashed border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-3">Performance Metrics</h3>
            <div className="text-center py-8">
              <Award className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">No performance data yet</p>
              <p className="text-xs text-slate-300 mt-1">Data will appear once teacher is active</p>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
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

          {/* Summary Card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Quick Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-sm font-medium text-muted-foreground">Subject</span>
                <span className="text-sm font-bold text-[#1e3a8a]">{subject}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-sm font-medium text-muted-foreground">Experience</span>
                <span className="text-sm font-bold text-foreground">{experience}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-sm font-medium text-muted-foreground">Rating</span>
                <span className="text-sm font-bold text-amber-500 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {rating}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-sm font-medium text-muted-foreground">Status</span>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${statusBadge(status)}`}>
                  {status}
                </span>
              </div>
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
