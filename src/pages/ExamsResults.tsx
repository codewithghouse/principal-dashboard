import { FileText, Calendar, TrendingUp, Award } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

const exams = [
  { name: "Mid-Term Exam 2026", date: "Feb 15-25, 2026", classes: "All", status: "Upcoming", results: "-" },
  { name: "Unit Test 3", date: "Jan 10-12, 2026", classes: "Grade 6-10", status: "Results Published", results: "68.4% avg" },
  { name: "Unit Test 2", date: "Nov 15-17, 2025", classes: "Grade 6-10", status: "Results Published", results: "72.1% avg" },
];

const ExamsResults = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Exams & Results</h1>
        <p className="text-sm text-muted-foreground">Manage examinations and view results</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Upcoming Exams" value={1} subtitle="Mid-Term 2026" subtitleColor="muted" icon={Calendar} iconColor="text-primary" />
        <StatCard title="Last Exam Avg" value="68.4%" subtitle="Unit Test 3" subtitleColor="muted" icon={TrendingUp} iconColor="text-warning" />
        <StatCard title="Pass Rate" value="84%" subtitle="↑ 2% vs last exam" subtitleColor="success" icon={Award} iconColor="text-success" />
        <StatCard title="Total Exams" value={12} subtitle="This academic year" subtitleColor="muted" icon={FileText} iconColor="text-primary" />
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Exam Schedule</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Exam Name</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Classes</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Results</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((e, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.date}</td>
                <td className="px-4 py-3">{e.classes}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${e.status === "Upcoming" ? "text-primary" : "text-success"}`}>{e.status}</span>
                </td>
                <td className="px-4 py-3">{e.results}</td>
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

export default ExamsResults;
