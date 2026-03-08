import { FileText, Download } from "lucide-react";

const reports = [
  { name: "Monthly Attendance Report", type: "Attendance", generated: "Jan 15, 2026", format: "PDF" },
  { name: "Academic Performance Summary", type: "Academics", generated: "Jan 10, 2026", format: "PDF" },
  { name: "Discipline Incident Log", type: "Discipline", generated: "Jan 8, 2026", format: "Excel" },
  { name: "Teacher Performance Review", type: "Teachers", generated: "Jan 5, 2026", format: "PDF" },
];

const Reports = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and download reports</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {["Attendance", "Academics", "Discipline", "Custom"].map((type) => (
          <button key={type} className="stat-card hover:border-primary transition-colors text-left">
            <FileText className="w-8 h-8 text-primary mb-2" />
            <p className="font-medium text-foreground">{type} Report</p>
            <p className="text-xs text-muted-foreground">Generate {type.toLowerCase()} report</p>
          </button>
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Recent Reports</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Report Name</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Type</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Generated</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Format</th>
              <th className="text-center px-4 py-3 text-muted-foreground font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3">{r.type}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.generated}</td>
                <td className="px-4 py-3">{r.format}</td>
                <td className="px-4 py-3 text-center">
                  <button className="flex items-center gap-1 text-primary text-sm font-medium hover:underline mx-auto">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;
