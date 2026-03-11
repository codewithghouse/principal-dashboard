import React, { useState } from 'react';
import { ChevronLeft, MessageSquare, Phone, TrendingUp, CheckCircle2, AlertCircle, Clock, BookOpen, User, Calendar, MoreVertical } from 'lucide-react';

interface StudentProfileProps {
  student: {
    initials: string;
    name: string;
    rollNo: string;
    grade: string;
    gender: string;
  };
  onBack: () => void;
}

const StudentProfile = ({ student, onBack }: StudentProfileProps) => {
  const [activeTab, setActiveTab] = useState('Overview');

  const tabs = ['Overview', 'Academic History', 'Attendance', 'Behavioral', 'Health'];

  const academicData = [
    { label: 'Term 1 Exam', value: 82, color: 'bg-primary' },
    { label: 'Term 2 Exam', value: 78, color: 'bg-primary' },
    { label: 'Mid-Term', value: 85, color: 'bg-success' },
    { label: 'Assignment Avg', value: 88, color: 'bg-success' },
    { label: 'Current Grade', value: 84, color: 'bg-primary' },
  ];

  const recentNotes = [
    { title: 'Excellence in Mathematics', author: 'Dr. Sarah Wilson', date: 'Oct 12, 2023', type: 'Positive' },
    { title: 'Late Submission: History', author: 'Prof. James Bond', date: 'Oct 08, 2023', type: 'Warning' },
    { title: 'Sports Meet Participation', author: 'Coach Mike', date: 'Sep 25, 2023', type: 'Activity' },
  ];

  const enrollmentInfo = [
    { label: 'Enrollment Date', value: 'Aug 15, 2022' },
    { label: 'Student ID', value: `STU-${student.rollNo}` },
    { label: 'House', value: 'Blue House' },
    { label: 'Blood Group', value: 'O+' },
  ];

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={onBack}
          className="p-2 border border-border rounded-lg hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-white text-2xl font-bold shadow-sm">
            {student.initials}
          </div>
          <div>
             <h1 className="text-2xl font-bold text-foreground">{student.name}</h1>
             <p className="text-muted-foreground text-sm font-medium">
                Grade {student.grade} • Roll: {student.rollNo} • {student.gender}
             </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
            View Parent Profile
          </button>
          <button className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity whitespace-nowrap">
            Generate Progress Report
          </button>
        </div>
      </div>

      <div className="flex border-b border-border mb-8 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap ${
              activeTab === tab ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Personal Info & Enrollment */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Personal Details
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Full Name', value: student.name },
                { label: 'Gender', value: student.gender },
                { label: 'Date of Birth', value: 'Mar 12, 2009' },
                { label: 'Primary Contact', value: '+91 98765 43210' },
                { label: 'Address', value: '123 Skyview Apt, Mumbai' },
              ].map((info, i) => (
                <div key={i} className="flex justify-between items-start text-sm font-medium group">
                  <span className="text-muted-foreground">{info.label}</span>
                  <span className="text-foreground font-bold text-right">{info.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Enrollment Status
            </h3>
            <div className="space-y-4 text-sm font-medium">
              {enrollmentInfo.map((info, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{info.label}</span>
                  <span className="text-foreground font-bold">{info.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Middle Column: Academic Performance */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-foreground">Academic Performance</h3>
            <span className="text-[10px] uppercase font-bold text-muted-foreground bg-secondary px-2 py-1 rounded">Overall Rank: #12</span>
          </div>
          
          <div className="space-y-7">
            {academicData.map((data, i) => (
              <div key={i}>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-muted-foreground uppercase">{data.label}</span>
                  <span className="text-foreground">{data.value}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${data.color} transition-all duration-1000 ease-out`} 
                    style={{ width: `${data.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-border flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">Growth Trend</p>
              <p className="text-lg font-bold text-success flex items-center gap-1">
                <TrendingUp className="w-5 h-5" /> Positive 5.2%
              </p>
            </div>
            <button className="text-primary text-xs font-bold hover:underline">View Marksheets</button>
          </div>
        </div>

        {/* Right Column: Attendance & Remarks */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
             <div className="flex items-center justify-between mb-6">
               <h3 className="font-bold text-foreground">Attendance Summary</h3>
               <span className="text-2xl font-bold text-primary">94%</span>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-success/10 border border-success/20 rounded-xl p-3 text-center">
                   <p className="text-xs font-bold text-success uppercase">Present</p>
                   <p className="text-xl font-bold text-success">172</p>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center">
                   <p className="text-xs font-bold text-destructive uppercase">Absent</p>
                   <p className="text-xl font-bold text-destructive">8</p>
                </div>
             </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-foreground mb-6">Recent Faculty Remarks</h3>
            <div className="space-y-5">
              {recentNotes.map((note, i) => (
                <div key={i} className="flex gap-4 relative">
                  <div className={`w-1 shrink-0 rounded-full ${
                    note.type === 'Positive' ? 'bg-success' : 
                    note.type === 'Warning' ? 'bg-destructive' : 'bg-primary'
                  }`} />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-foreground leading-tight">{note.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-1">{note.author} • {note.date}</p>
                  </div>
                  <button className="text-muted-foreground hover:text-foreground">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button className="w-full mt-8 py-2.5 rounded-lg border border-border font-bold text-primary hover:bg-secondary transition-colors text-xs uppercase tracking-wide">
              View All Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentProfile;
