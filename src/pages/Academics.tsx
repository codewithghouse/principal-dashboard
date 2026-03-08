import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const subjects = [
  { name: "Mathematics", avg: "52%", trend: "↓ 3.2% vs last term", status: "Weak", weakSections: 4 },
  { name: "Science", avg: "58%", trend: "↓ 1.8% vs last term", status: "Weak", weakSections: 3 },
  { name: "English", avg: "68%", trend: "↑ 2.1% vs last term", status: "Average", weakSections: 2 },
  { name: "Social Studies", avg: "74%", trend: "↑ 4.5% vs last term", status: "Good", weakSections: 0 },
];

const gradeData = [
  { grade: "D (<40%)", count: 85 },
  { grade: "C (40-59%)", count: 220 },
  { grade: "B (60-79%)", count: 340 },
  { grade: "A (80-100%)", count: 202 },
];

const curriculum = [
  { subject: "Mathematics", progress: 78 },
  { subject: "Science", progress: 82 },
  { subject: "English", progress: 85 },
  { subject: "Social Studies", progress: 90 },
];

const statusColor = (s: string) => {
  if (s === "Good") return "text-success";
  if (s === "Weak") return "text-destructive";
  return "text-warning";
};

const Academics = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Academics</h1>
        <p className="text-sm text-muted-foreground">Subject-wise academic performance overview</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {subjects.map((s) => (
          <div key={s.name} className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.name}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${statusColor(s.status)} bg-secondary`}>{s.status}</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{s.avg}</div>
            <span className={`text-xs ${s.trend.startsWith("↓") ? "text-destructive" : "text-success"}`}>{s.trend}</span>
            <span className="text-xs text-muted-foreground">Weak Sections: {s.weakSections}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Grade Distribution - Latest Exam</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={gradeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 90%)" />
              <XAxis dataKey="grade" tick={{ fontSize: 11 }} stroke="hsl(220 10% 50%)" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(220 10% 50%)" />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(220, 60%, 25%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">Curriculum Progress</h2>
          <div className="space-y-4">
            {curriculum.map((c) => (
              <div key={c.subject}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-foreground">{c.subject}</span>
                  <span className="font-medium">{c.progress}%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full">
                  <div className="h-2 bg-primary rounded-full" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Academics;
