import { Search, Download, Plus } from "lucide-react";

const students = [
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
  return (
    <div className="space-y-6">
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
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90">
            <Plus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Student</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Roll No</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Grade-Section</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Parent Contact</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Attendance</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Academic Status</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Risk</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.rollNo} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-foreground">{s.initials}</div>
                    <div>
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.gender}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{s.rollNo}</td>
                <td className="px-4 py-3">{s.grade}</td>
                <td className="px-4 py-3">{s.contact}</td>
                <td className="px-4 py-3 text-center font-medium">{s.attendance}</td>
                <td className={`px-4 py-3 ${statusColor(s.status)}`}>{s.status}</td>
                <td className="px-4 py-3 text-center">
                  {s.risk && <span className="w-2.5 h-2.5 inline-block rounded-full bg-destructive" />}
                </td>
                <td className="px-4 py-3 text-center">
                  <button className="text-primary text-sm font-medium hover:underline">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
          <span>Showing 1-5 of 847 students</span>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1 rounded border border-border hover:bg-secondary">Previous</button>
            <button className="px-3 py-1 rounded bg-primary text-primary-foreground">1</button>
            <button className="px-3 py-1 rounded border border-border hover:bg-secondary">2</button>
            <button className="px-3 py-1 rounded border border-border hover:bg-secondary">3</button>
            <span>...</span>
            <button className="px-3 py-1 rounded border border-border hover:bg-secondary">142</button>
            <button className="px-3 py-1 rounded border border-border hover:bg-secondary">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Students;
