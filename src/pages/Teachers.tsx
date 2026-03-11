import { useState } from "react";
import { BarChart2, CalendarCheck, Star, Users, Search, List, Plus } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import TeacherProfile from "@/components/TeacherProfile";

const teachersData = [
  { initials: "MK", name: "Mrs. Kavita", subject: "Mathematics", classes: 3, experience: "12 yrs", rating: 4.8, status: "Active", color: "bg-[#1e3a8a]" },
  { initials: "SR", name: "Mr. Ramesh", subject: "Science", classes: 4, experience: "8 yrs", rating: 4.6, status: "Active", color: "bg-success" },
  { initials: "AP", name: "Mrs. Priya", subject: "English", classes: 3, experience: "6 yrs", rating: 4.5, status: "Active", color: "bg-warning" },
  { initials: "VR", name: "Mr. Reddy", subject: "Social Studies", classes: 2, experience: "15 yrs", rating: 4.2, status: "On Leave", color: "bg-destructive" },
];

const Teachers = () => {
  const [selectedTeacher, setSelectedTeacher] = useState<typeof teachersData[0] | null>(null);

  if (selectedTeacher) {
    return <TeacherProfile teacher={selectedTeacher} onBack={() => setSelectedTeacher(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Teachers</h1>
        <p className="text-sm text-muted-foreground">Manage teaching staff and monitor performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Avg Class Performance" value="68.4%" subtitle="↑ 2.1% vs last term" subtitleColor="success" icon={BarChart2} iconColor="text-primary" />
        <StatCard title="Teacher Attendance" value="94.2%" subtitle="Excellent" subtitleColor="success" icon={CalendarCheck} iconColor="text-primary" />
        <StatCard title="Parent Feedback" value="4.3/5" subtitle="Based on 324 reviews" subtitleColor="muted" icon={Star} iconColor="text-warning" />
        <StatCard title="Active Teachers" value="42/45" subtitle="3 on leave" subtitleColor="destructive" icon={Users} iconColor="text-primary" />
      </div>

      <div className="flex items-center justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Search teachers..." />
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-secondary font-bold text-slate-600 transition-colors">
            <List className="w-4 h-4" /> List View
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#1e3a8a] text-white hover:opacity-90 font-bold transition-opacity">
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {teachersData.map((t) => (
          <div 
            key={t.initials} 
            className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            onClick={() => setSelectedTeacher(t)}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl ${t.color} flex items-center justify-center text-lg font-bold text-white shadow-sm ring-4 ring-white`}>{t.initials}</div>
              <div>
                <p className="font-bold text-[#1e293b] text-base group-hover:text-[#1e3a8a] transition-colors">{t.name}</p>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">{t.subject}</p>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-slate-50 italic">
              <div className="flex justify-between items-center"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Classes</span><span className="text-sm font-bold text-[#475569]">{t.classes}</span></div>
              <div className="flex justify-between items-center"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Experience</span><span className="text-sm font-bold text-[#475569]">{t.experience}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Rating</span>
                <span className="flex items-center gap-1 font-bold text-warning">
                  <Star className="w-3.5 h-3.5 fill-warning" /> {t.rating}
                </span>
              </div>
            </div>
            <div className="mt-6 flex justify-between items-center">
              <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${t.status === "Active" ? "bg-green-50 text-green-500 border border-green-100" : "bg-red-50 text-red-500 border border-red-100"}`}>
                {t.status}
              </span>
              <button className="text-[10px] font-black text-[#1e3a8a] uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">View Profile →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Teachers;

