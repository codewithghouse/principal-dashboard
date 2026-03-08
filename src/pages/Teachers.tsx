import { BarChart2, CalendarCheck, Star, Users, Search, List, Plus } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

const teachers = [
  { initials: "MK", name: "Mrs. Kavita", subject: "Mathematics", classes: 3, experience: "12 yrs", rating: 4.8, status: "Active", color: "bg-primary" },
  { initials: "SR", name: "Mr. Ramesh", subject: "Science", classes: 4, experience: "8 yrs", rating: 4.6, status: "Active", color: "bg-success" },
  { initials: "AP", name: "Mrs. Priya", subject: "English", classes: 3, experience: "6 yrs", rating: 4.5, status: "Active", color: "bg-warning" },
  { initials: "VR", name: "Mr. Reddy", subject: "Social Studies", classes: 2, experience: "15 yrs", rating: 4.2, status: "On Leave", color: "bg-destructive" },
];

const Teachers = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Teachers</h1>
        <p className="text-sm text-muted-foreground">Manage teaching staff and monitor performance</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
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
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-secondary">
            <List className="w-4 h-4" /> List View
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90">
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {teachers.map((t) => (
          <div key={t.initials} className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-sm font-semibold text-primary-foreground`}>{t.initials}</div>
              <div>
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.subject}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Classes</span><span className="font-medium">{t.classes}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Experience</span><span className="font-medium">{t.experience}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rating</span>
                <span className="flex items-center gap-1 font-medium">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" /> {t.rating}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${t.status === "Active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                {t.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Teachers;
