import { CheckCircle, AlertCircle, XCircle } from "lucide-react";

const grades = [
  { name: "Grade 6", sections: 2, students: 142, attendance: "93%", health: "85/100", color: "text-success", icon: CheckCircle },
  { name: "Grade 7", sections: 2, students: 138, attendance: "88%", health: "72/100", color: "text-warning", icon: AlertCircle },
  { name: "Grade 8", sections: 2, students: 156, attendance: "91%", health: "80/100", color: "text-success", icon: CheckCircle },
  { name: "Grade 9", sections: 3, students: 201, attendance: "82%", health: "65/100", color: "text-destructive", icon: XCircle },
  { name: "Grade 10", sections: 3, students: 210, attendance: "90%", health: "78/100", color: "text-success", icon: CheckCircle },
];

const sections = [
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
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Classes & Sections</h1>
        <p className="text-sm text-muted-foreground">Overview of all classes and sections</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {grades.map((g) => (
          <div key={g.name} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">{g.name}</h3>
              <g.icon className={`w-5 h-5 ${g.color}`} />
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Sections</span><span className="font-medium">{g.sections}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Students</span><span className="font-medium">{g.students}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Avg Attendance</span><span className={`font-medium ${g.color}`}>{g.attendance}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Health Score</span><span className={`font-medium ${g.color}`}>{g.health}</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Section Performance</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Section</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Class Teacher</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Students</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Avg Marks</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Attendance</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Weak Subject</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.section} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3 font-semibold text-foreground">{s.section}</td>
                <td className="px-4 py-3">{s.teacher}</td>
                <td className="px-4 py-3 text-center">{s.students}</td>
                <td className={`px-4 py-3 text-center font-medium ${statusColor(s.status)}`}>{s.avgMarks}</td>
                <td className={`px-4 py-3 text-center font-medium ${statusColor(s.status)}`}>{s.attendance}</td>
                <td className={`px-4 py-3 ${s.weak !== "-" ? "text-warning font-medium" : "text-muted-foreground"}`}>{s.weak}</td>
                <td className={`px-4 py-3 font-medium ${statusColor(s.status)}`}>{s.status}</td>
                <td className="px-4 py-3 text-center">
                  <button className="text-primary text-sm font-medium hover:underline">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClassesSections;
