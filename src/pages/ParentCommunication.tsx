import { MessageSquare, Send, Clock, CheckCircle } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

const messages = [
  { parent: "Mr. Rajesh Sharma", student: "Rahul Sharma (9A)", subject: "Attendance concern", date: "Jan 17, 2026", status: "Unread" },
  { parent: "Mrs. Sunita Patel", student: "Priya Patel (8B)", subject: "Discipline follow-up", date: "Jan 16, 2026", status: "Replied" },
  { parent: "Mr. Vikram Kumar", student: "Ankit Kumar (10C)", subject: "Exam results query", date: "Jan 15, 2026", status: "Pending" },
];

const ParentCommunication = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Parent Communication</h1>
        <p className="text-sm text-muted-foreground">Manage parent messages and notifications</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Messages" value={156} subtitle="This month" subtitleColor="muted" icon={MessageSquare} iconColor="text-primary" />
        <StatCard title="Sent Today" value={8} subtitle="5 automated" subtitleColor="muted" icon={Send} iconColor="text-success" />
        <StatCard title="Pending Replies" value={5} subtitle="Action needed" subtitleColor="warning" icon={Clock} iconColor="text-warning" />
        <StatCard title="Response Rate" value="92%" subtitle="Excellent" subtitleColor="success" icon={CheckCircle} iconColor="text-success" />
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Recent Messages</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Parent</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Student</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Subject</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium text-foreground">{m.parent}</td>
                <td className="px-4 py-3">{m.student}</td>
                <td className="px-4 py-3">{m.subject}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.date}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${m.status === "Replied" ? "text-success" : m.status === "Unread" ? "text-destructive" : "text-warning"}`}>
                    {m.status}
                  </span>
                </td>
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

export default ParentCommunication;
