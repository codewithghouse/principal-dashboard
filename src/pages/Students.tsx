import { useState } from "react";
import { Search, Download, Plus } from "lucide-react";
import StudentProfile from "@/components/StudentProfile";

const studentsData = [
  { initials: "AR", name: "Aarav Reddy", gender: "Male", rollNo: "101", grade: "10A", contact: "+91 98765 43210", attendance: "94%", status: "Excellent", risk: false },
  { initials: "RS", name: "Rahul Sharma", gender: "Male", rollNo: "205", grade: "9A", contact: "+91 98765 43211", attendance: "45%", status: "At Risk", risk: true },
  { initials: "PP", name: "Priya Patel", gender: "Female", rollNo: "156", grade: "8B", contact: "+91 98765 43212", attendance: "78%", status: "Average", risk: false },
  { initials: "VK", name: "Vikram Kumar", gender: "Male", rollNo: "089", grade: "7A", contact: "+91 98765 43213", attendance: "91%", status: "Good", risk: false },
  { initials: "SN", name: "Sneha Nair", gender: "Female", rollNo: "312", grade: "10B", contact: "+91 98765 43214", attendance: "88%", status: "Good", risk: false },
];

const statusColor = (s: string) => {
  if (s === "Excellent") return "text-success font-medium";
  if (s === "At Risk") return "text-destructive font-medium";
  if (s === "Average") return "text-warning font-medium";
  return "text-foreground";
};

const Students = () => {
  const [selectedStudent, setSelectedStudent] = useState<typeof studentsData[0] | null>(null);

  if (selectedStudent) {
    return <StudentProfile student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Students</h1>
        <p className="text-sm text-muted-foreground">Manage and view all student records</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Search students..." />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-secondary transition-colors font-medium">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 font-medium transition-opacity">
            <Plus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Student</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Roll No</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Grade-Section</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Parent Contact</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Attendance</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Academic Status</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Risk</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {studentsData.map((s) => (
                <tr key={s.rollNo} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-[10px] font-bold text-white shadow-sm">{s.initials}</div>
                      <div>
                        <p className="font-bold text-foreground leading-tight">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">{s.gender}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{s.rollNo}</td>
                  <td className="px-6 py-4 font-medium">{s.grade}</td>
                  <td className="px-6 py-4 text-muted-foreground font-medium">{s.contact}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-primary">{s.attendance}</span>
                  </td>
                  <td className={`px-6 py-4 ${statusColor(s.status)} text-xs font-bold`}>
                    <span className={`px-2 py-1 rounded-full bg-muted/50`}>{s.status}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {s.risk && <div className="w-2 h-2 mx-auto rounded-full bg-destructive animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => setSelectedStudent(s)}
                      className="text-primary text-xs font-bold hover:underline uppercase tracking-wider"
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-border text-sm text-muted-foreground font-medium">
          <span>Showing 1-5 of 847 students</span>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">Previous</button>
            <div className="flex items-center gap-1">
              <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-white font-bold shadow-sm">1</button>
              <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary font-bold">2</button>
              <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary font-bold">3</button>
            </div>
            <button className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Students;

