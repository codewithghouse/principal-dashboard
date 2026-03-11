import { useState } from "react";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";
import ClassPerformance from "@/components/ClassPerformance";

const grades = [
  { name: "Grade 6", sections: 2, students: 142, attendance: "93%", health: "85/100", color: "text-success", icon: CheckCircle },
  { name: "Grade 7", sections: 2, students: 138, attendance: "88%", health: "72/100", color: "text-warning", icon: AlertCircle },
  { name: "Grade 8", sections: 2, students: 156, attendance: "91%", health: "80/100", color: "text-success", icon: CheckCircle },
  { name: "Grade 9", sections: 3, students: 201, attendance: "82%", health: "65/100", color: "text-destructive", icon: XCircle },
  { name: "Grade 10", sections: 3, students: 210, attendance: "90%", health: "78/100", color: "text-success", icon: CheckCircle },
];

const sectionsData = [
  { section: "6A", teacher: "Mrs. Anjali", students: 71, avgMarks: "72%", attendance: "94%", weak: "-", status: "Good" },
  { section: "7A", teacher: "Mr. Verma", students: 68, avgMarks: "58%", attendance: "86%", weak: "Mathematics", status: "Average" },
  { section: "9A", teacher: "Mrs. Kavita", students: 67, avgMarks: "48%", attendance: "78%", weak: "Science", status: "Weak" },
  { section: "10C", teacher: "Mr. Reddy", students: 70, avgMarks: "55%", attendance: "88%", weak: "English", status: "Average" },
];

const statusColor = (s: string) => {
  if (s === "Good") return "text-success";
  if (s === "Weak") return "text-destructive";
  return "text-warning";
};

const ClassesSections = () => {
  const [selectedSection, setSelectedSection] = useState<typeof sectionsData[0] | null>(null);

  if (selectedSection) {
    return <ClassPerformance section={selectedSection} onBack={() => setSelectedSection(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Classes & Sections</h1>
        <p className="text-sm text-muted-foreground">Overview of all classes and sections</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {grades.map((g) => (
          <div key={g.name} className="bg-card rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground">{g.name}</h3>
              <g.icon className={`w-5 h-5 ${g.color} group-hover:scale-110 transition-transform`} />
            </div>
            <div className="space-y-2 text-xs font-bold uppercase tracking-wider">
              <div className="flex justify-between items-center bg-muted/20 px-2 py-1.5 rounded"><span className="text-muted-foreground">Sections</span><span className="text-foreground">{g.sections}</span></div>
              <div className="flex justify-between items-center bg-muted/20 px-2 py-1.5 rounded"><span className="text-muted-foreground">Students</span><span className="text-foreground">{g.students}</span></div>
              <div className="flex justify-between items-center bg-muted/20 px-2 py-1.5 rounded"><span className="text-muted-foreground">Avg Attendance</span><span className={g.color}>{g.attendance}</span></div>
              <div className="flex justify-between items-center bg-muted/20 px-2 py-1.5 rounded"><span className="text-muted-foreground">Health Score</span><span className={g.color}>{g.health}</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-border bg-muted/10">
          <h2 className="text-lg font-bold text-foreground uppercase tracking-widest text-xs">Section Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/5 border-b border-border">
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Section</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Class Teacher</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Students</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Avg Marks</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Attendance</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Weak Subject</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Status</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sectionsData.map((s) => (
                <tr key={s.section} className="hover:bg-secondary/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${
                        s.status === 'Good' ? 'bg-success' : s.status === 'Weak' ? 'bg-destructive' : 'bg-warning'
                      }`}>{s.section}</div>
                      <span className="font-bold text-foreground text-sm uppercase tracking-wide">Section {s.section}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-foreground/80">{s.teacher}</td>
                  <td className="px-6 py-4 text-center font-bold text-foreground">{s.students}</td>
                  <td className={`px-6 py-4 text-center font-bold ${statusColor(s.status)}`}>{s.avgMarks}</td>
                  <td className={`px-6 py-4 text-center font-bold ${statusColor(s.status)}`}>{s.attendance}</td>
                  <td className={`px-6 py-4 text-xs font-bold uppercase ${s.weak !== "-" ? "text-warning" : "text-muted-foreground opacity-50"}`}>{s.weak}</td>
                  <td className={`px-6 py-4`}>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      s.status === 'Good' ? 'bg-success/10 text-success' : s.status === 'Weak' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                    }`}>{s.status}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => setSelectedSection(s)}
                      className="bg-primary/5 text-primary border border-primary/10 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClassesSections;

