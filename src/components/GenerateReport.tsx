import { useState, useEffect } from "react";
import {
  FileText, FileSpreadsheet, BarChart2, Loader2, Download,
  ChevronLeft, Users, CalendarCheck, TrendingUp, AlertTriangle, Shield
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

interface Props {
  templateName: string;
  onBack: () => void;
}

const REPORT_TYPES = [
  "Student Progress",
  "Class Performance",
  "Monthly Attendance",
  "Risk Students",
  "Exam Results",
  "Teacher Performance",
  "Parent Communication",
  "School Overview",
];

/* ── real stats from Firestore ──────────────────────────────── */
interface SchoolStats {
  totalStudents: number;
  avgAttendance: number;
  avgMarks: number;
  atRisk: number;
  incidents: number;
}

const GenerateReport = ({ templateName, onBack }: Props) => {
  const { userData } = useAuth();

  /* config state */
  const [reportType, setReportType] = useState(
    templateName && templateName !== "Custom" ? templateName : "Student Progress"
  );
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [grade,     setGrade]     = useState("");
  const [section,   setSection]   = useState("");
  const [subject,   setSubject]   = useState("");
  const [format,    setFormat]    = useState<"PDF" | "Excel" | "CSV">("PDF");
  const [frequency, setFrequency] = useState("");
  const [emailTo,   setEmailTo]   = useState("");

  /* data state */
  const [stats,      setStats]      = useState<SchoolStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);

  /* ── fetch real school-wide stats ── */
  useEffect(() => {
    if (!userData?.schoolId) return;
    const go = async () => {
      try {
        const sid = userData.schoolId;

        /* total students enrolled */
        const enrollSnap = await getDocs(
          query(collection(db, "enrollments"), where("schoolId", "==", sid))
        );
        const totalStudents = enrollSnap.size;

        /* avg marks from test_scores */
        const scoresSnap = await getDocs(
          query(collection(db, "test_scores"), where("schoolId", "==", sid))
        );
        const allPct = scoresSnap.docs
          .map(d => parseFloat(d.data().percentage ?? d.data().score ?? ""))
          .filter(n => !isNaN(n));
        const avgMarks = allPct.length
          ? Math.round(allPct.reduce((a, b) => a + b, 0) / allPct.length)
          : 0;

        /* at-risk: unique students whose avg score < 50 */
        const studentScoreMap = new Map<string, number[]>();
        scoresSnap.docs.forEach(d => {
          const data  = d.data();
          const sid2  = data.studentId || data.studentEmail || d.id;
          const pct   = parseFloat(data.percentage ?? data.score ?? "");
          if (!isNaN(pct)) {
            if (!studentScoreMap.has(sid2)) studentScoreMap.set(sid2, []);
            studentScoreMap.get(sid2)!.push(pct);
          }
        });
        let atRisk = 0;
        studentScoreMap.forEach(vals => {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          if (avg < 50) atRisk++;
        });

        /* discipline incidents */
        const discSnap = await getDocs(
          query(collection(db, "discipline"), where("schoolId", "==", sid))
        );

        /* attendance avg — count records marked "Present" */
        const attSnap = await getDocs(
          query(collection(db, "attendance"), where("schoolId", "==", sid))
        );
        const presentCount = attSnap.docs.filter(
          d => (d.data().status || "").toLowerCase() === "present"
        ).length;
        const avgAttendance = attSnap.size
          ? Math.round((presentCount / attSnap.size) * 100)
          : 0;

        setStats({ totalStudents, avgMarks, atRisk, incidents: discSnap.size, avgAttendance });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    go();
  }, [userData?.schoolId]);

  /* ── generate & publish report ── */
  const handleGenerate = async () => {
    if (!userData?.schoolId || !stats) return;
    setGenerating(true);
    try {
      const now       = new Date();
      const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const title     = `${reportType} — ${monthLabel}`;

      const payload = {
        schoolId:          userData.schoolId,
        title,
        reportType,
        format,
        grade:             grade   || "All",
        section:           section || "All",
        subject:           subject || "",
        dateFrom,
        dateTo,
        generatedBy:       userData.name || "Principal",
        status:            "Sent",
        publishedToParent: true,
        publishedToTeacher: true,
        studentId:         "all",          // so parent dashboard shows it to everyone
        data: {
          totalStudents:   stats.totalStudents,
          avgAttendance:   stats.avgAttendance,
          avgMarks:        stats.avgMarks,
          atRisk:          stats.atRisk,
          incidents:       stats.incidents,
        },
        createdAt: serverTimestamp(),
      };

      /* save to principal's own history */
      await addDoc(collection(db, "principal_reports"), payload);

      /* save to shared `reports` collection — visible to teachers + parents */
      await addDoc(collection(db, "reports"), payload);

      /* optional schedule */
      if (frequency && emailTo) {
        await addDoc(collection(db, "scheduled_reports"), {
          ...payload,
          frequency,
          recipients: emailTo,
        });
      }

      toast.success("Report generated and published to teachers & parents!");
      onBack();
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate report. Please try again.");
    }
    setGenerating(false);
  };

  /* ── UI ── */
  return (
    <div className="animate-in fade-in duration-300 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        <button onClick={onBack} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" /> Reports
        </button>
        <span>/</span>
        <span className="text-foreground font-semibold">Generate Report</span>
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Generate Report</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Configuration ── */}
        <div className="space-y-5">

          {/* Report Configuration card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5">Report Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Report Type</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium bg-background outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
                >
                  {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Date Range</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">to</span>
                  <input
                    type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Grade</label>
                <input
                  value={grade} onChange={e => setGrade(e.target.value)}
                  placeholder="e.g. Grade 6 or All"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Section</label>
                <input
                  value={section} onChange={e => setSection(e.target.value)}
                  placeholder="e.g. A or All"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Subject (Optional)</label>
                <input
                  value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Mathematics"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none"
                />
              </div>
            </div>
          </div>

          {/* Output Format */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-4">Output Format</h2>
            <div className="grid grid-cols-3 gap-3">
              {(["PDF", "Excel", "CSV"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex flex-col items-center gap-2 py-4 rounded-xl border text-sm font-bold transition-all ${
                    format === f
                      ? f === "PDF"
                        ? "bg-red-50 border-red-300 text-red-600"
                        : f === "Excel"
                        ? "bg-green-50 border-green-300 text-green-600"
                        : "bg-blue-50 border-blue-300 text-blue-600"
                      : "bg-background border-border text-muted-foreground hover:bg-muted/20"
                  }`}
                >
                  {f === "PDF" ? <FileText className="w-5 h-5" /> :
                   f === "Excel" ? <FileSpreadsheet className="w-5 h-5" /> :
                   <BarChart2 className="w-5 h-5" />}
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Preview + Schedule ── */}
        <div className="space-y-5">

          {/* Report Preview */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5">Report Preview</h2>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-[#1e3a8a]" />
                <p className="text-xs text-muted-foreground font-semibold">Loading school data...</p>
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                {/* Preview header */}
                <div className="bg-[#1e3a8a] px-5 py-4 text-center">
                  <h3 className="text-base font-bold text-white">{reportType} Report</h3>
                  <p className="text-xs text-blue-200 mt-0.5">
                    {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                  </p>
                </div>
                {/* Stats rows */}
                <div className="divide-y divide-border">
                  {[
                    { label: "Total Students",      val: stats?.totalStudents ?? "—",       icon: Users,          color: "text-foreground"  },
                    { label: "Average Attendance",  val: `${stats?.avgAttendance ?? 0}%`,   icon: CalendarCheck,  color: "text-foreground"  },
                    { label: "Average Marks",       val: `${stats?.avgMarks ?? 0}%`,        icon: TrendingUp,     color: "text-foreground"  },
                    { label: "At-Risk Students",    val: stats?.atRisk ?? "—",              icon: AlertTriangle,  color: "text-red-500 font-black" },
                    { label: "Discipline Incidents",val: stats?.incidents ?? "—",           icon: Shield,         color: "text-foreground"  },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between px-5 py-3 hover:bg-muted/10">
                      <div className="flex items-center gap-2.5">
                        <row.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${row.color}`}>{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Schedule Delivery (Optional) */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-1">Schedule Delivery</h2>
            <p className="text-xs text-muted-foreground mb-4">Optional — auto-send this report on a schedule</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Frequency</label>
                <select
                  value={frequency}
                  onChange={e => setFrequency(e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none"
                >
                  <option value="">— Select —</option>
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Term-wise</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Email To</label>
                <input
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="email@school.edu"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none"
                />
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || loading}
            className="w-full py-3.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#1e4fc0] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Download className="w-4 h-4" /> Generate &amp; Publish Report</>
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default GenerateReport;
