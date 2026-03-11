import React, { useState } from 'react';
import { ChevronLeft, Star, Mail, Phone, Edit2, Send, GraduationCap, Briefcase, BarChart2, Calendar, FileText, UserCheck, RefreshCw } from 'lucide-react';

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
    { label: 'Class Average', value: 62, color: 'bg-warning' },
    { label: 'Pass Rate', value: 84, color: 'bg-success' },
    { label: 'Student Satisfaction', value: 96, color: 'bg-success', display: '4.8/5' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Teachers</span>
        <span>/</span>
        <span className="text-foreground font-medium">Teacher Profile</span>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-[#1e3a8a] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
            {teacher.initials}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-[#1e293b]">{teacher.name} Menon</h1>
              <span className="flex items-center gap-1 text-warning font-bold">
                <Star className="w-5 h-5 fill-warning" /> {teacher.rating}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-400 flex items-center gap-4 mb-3">
              <span>{teacher.subject} Teacher</span>
              <span>•</span>
              <span>{teacher.experience} Experience</span>
            </p>
            <div className="flex items-center gap-6 text-xs font-bold text-slate-500">
              <span className="flex items-center gap-2 italic"><Mail className="w-4 h-4 text-slate-300" /> Email: kavita.m@school.edu</span>
              <span className="flex items-center gap-2 italic"><Phone className="w-4 h-4 text-slate-300" /> Phone: +91 98765 12345</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            <Edit2 className="w-4 h-4" /> Edit
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity">
            <Send className="w-4 h-4" /> Message
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-100 mb-8 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-4 text-sm font-bold transition-all relative ${
              activeTab === tab ? 'text-[#1e3a8a]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1e3a8a] rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1e293b] mb-6">Qualifications</h3>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <GraduationCap className="w-5 h-5 text-[#1e3a8a]" />
                </div>
                <div>
                  <p className="font-bold text-[#1e293b] text-sm leading-tight">M.Sc. Mathematics</p>
                  <p className="text-xs text-slate-400 font-medium mt-1">Osmania University, 2012</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <Star className="w-5 h-5 text-[#1e3a8a]" />
                </div>
                <div>
                  <p className="font-bold text-[#1e293b] text-sm leading-tight">B.Ed.</p>
                  <p className="text-xs text-slate-400 font-medium mt-1">Hyderabad University, 2014</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1e293b] mb-6">Assigned Classes</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl">
                <div>
                  <p className="font-bold text-[#1e293b] text-sm">9A</p>
                  <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">67 students</p>
                </div>
                <span className="text-[10px] font-bold text-red-500 uppercase">Weak</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl">
                <div>
                  <p className="font-bold text-[#1e293b] text-sm">8B</p>
                  <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">72 students</p>
                </div>
                <span className="text-[10px] font-bold text-green-500 uppercase">Good</span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1e293b] mb-8">Performance Metrics</h3>
            <div className="space-y-8">
              {metrics.map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-slate-400">{m.label}</span>
                    <span className={`text-sm font-bold ${m.color === 'bg-warning' ? 'text-orange-500' : 'text-green-500'}`}>
                      {m.display || `${m.value}%`}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${m.color} transition-all duration-1000`} 
                      style={{ width: `${m.value}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1e293b] mb-4">Recent Reviews</h3>
            <div className="flex gap-1 mb-2">
              {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 text-warning fill-warning" />)}
            </div>
            <p className="text-xs text-slate-400 italic font-medium leading-relaxed">
              "Great teaching style, very thorough with concepts. Students find her classes engaging."
            </p>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1e293b] mb-6">Quick Actions</h3>
            <div className="space-y-3">
              {[
                { label: 'Reassign Class', icon: RefreshCw },
                { label: 'View Schedule', icon: Calendar },
                { label: 'Generate Report', icon: FileText },
                { label: 'View Attendance', icon: UserCheck },
              ].map((action, i) => (
                <button 
                  key={i}
                  className="w-full p-4 border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <action.icon className="w-5 h-5 text-[#1e293b]" />
                    <span className="text-sm font-bold text-[#475569]">{action.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[15px] font-bold text-[#1e293b] mb-6">This Month</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-slate-400 uppercase text-[11px]">Classes Taken</span>
                <span className="font-bold text-[#1e293b]">48/52</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-slate-400 uppercase text-[11px]">Attendance</span>
                <span className="font-bold text-green-500">92%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherProfile;
