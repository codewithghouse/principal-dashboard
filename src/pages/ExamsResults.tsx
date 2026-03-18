import { useState, useEffect } from "react";
import { FileText, Calendar, Users, Percent, Trophy, AlertTriangle, Plus, Upload, BookOpen, BarChart2, Star, Sparkles, Loader2, User } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import ExamDetail from "@/components/ExamDetail";
import { aiEngine } from "@/lib/ai-engine";
import { useAuth } from "@/lib/AuthContext";

const upcomingExams = [
  { name: "Quarterly Exam", date: "Feb 15-20, 2026", grades: "Grades 6-10", color: "#1e3a8a" },
  { name: "Mid-Term Assessment", date: "Mar 10-15, 2026", grades: "Grades 9-10", color: "#f59e0b" },
  { name: "Unit Test 3", date: "Jan 25-27, 2026", grades: "Grades 6-8", color: "#22c55e" },
];

const initialStats = [
  { label: "Latest Exam", value: "Unit Test 2", subtitle: "Jan 10-12, 2026", icon: FileText, color: "text-[#1e3a8a]", bg: "bg-blue-50" },
  { label: "Students Appeared", value: "824", subtitle: "97.3% attendance", icon: Users, color: "text-[#22c55e]", bg: "bg-green-50" },
  { label: "Pass Rate", value: "78.5%", subtitle: "↓ 2.3% vs last exam", icon: Percent, color: "text-[#f59e0b]", bg: "bg-orange-50", isWarning: true },
  { label: "School Topper", value: "Analyzing...", subtitle: "Identifying diamonds", icon: Trophy, color: "text-[#22c55e]", bg: "bg-green-50" },
];

const ExamsResults = () => {
  const { userData } = useAuth();
  const [showDetail, setShowDetail] = useState(false);
  const [toppers, setToppers] = useState<any[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    const fetchToppers = async () => {
      const schoolId = userData?.schoolId || userData?.id;
      if (!schoolId) return;

      setLoadingAI(true);
      try {
        // Sample data for AI to analyze and identify toppers
        const studentData = [
          { name: "Sneha Nair", grade: "10B", avg: "98.2%" },
          { name: "Arjun Reddy", grade: "10A", avg: "97.5%" },
          { name: "Priya Das", grade: "9C", avg: "96.8%" },
          { name: "Zaid Ali", grade: "8B", avg: "96.2%" },
          { name: "Ananya S.", grade: "7A", avg: "95.9%" }
        ];

        const result = await aiEngine.getInsights({
          feature: "topper_logic",
          schoolId: schoolId,
          data: studentData
        });
        
        if (result && result.toppers) {
          setToppers(result.toppers);
        }
      } catch (error) {
        console.error("Topper identification failed:", error);
      } finally {
        setLoadingAI(false);
      }
    };

    fetchToppers();
  }, [userData?.schoolId, userData?.id]);

  const bestTopper = toppers[0] || { name: "Sneha Nair", grade: "10B", avg: "98.2%" };

  const stats = initialStats.map((s, i) => {
    if (i === 3) {
      return {
        ...s,
        value: loadingAI ? "Analyzing..." : bestTopper.name,
        subtitle: loadingAI ? "Identifying diamonds" : `${bestTopper.grade} • ${bestTopper.avg}`
      };
    }
    return s;
  });

  if (showDetail) {
    return <ExamDetail onBack={() => setShowDetail(false)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exams & Results</h1>
          <p className="text-sm text-muted-foreground">Manage examinations and track academic performance</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm font-bold text-foreground hover:bg-secondary transition-all shadow-sm">
            <Upload className="w-4 h-4 text-primary" /> Bulk Upload Marks
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:bg-[#1e4fc0] transition-all shadow-md">
            <Plus className="w-4 h-4" /> Create New Exam
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-start justify-between relative overflow-hidden group">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{stat.label}</p>
              <h3 className="text-2xl font-bold text-foreground mb-1">{stat.value}</h3>
              <p className="text-xs font-semibold text-muted-foreground">{stat.subtitle}</p>
            </div>
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} transition-transform group-hover:scale-110`}>
              <stat.icon className="w-6 h-6" />
            </div>
            {stat.isWarning && <div className="absolute top-0 right-0 p-2"><AlertTriangle className="w-3 h-3 text-orange-500" /></div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Powered Toppers Section - Feature #40 */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-lg">
                <Sparkles className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">School Diamonds</h3>
                <p className="text-xs text-muted-foreground font-medium">AI-identified top performers across campus</p>
              </div>
            </div>
            {loadingAI && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingAI ? (
               Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-24 bg-secondary/10 rounded-xl border border-dashed border-border animate-pulse" />
               ))
            ) : toppers.length > 0 ? (
              toppers.map((t, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border border-border rounded-xl hover:shadow-md transition-all bg-gradient-to-br from-card to-secondary/5 group">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm">
                       {t.name[0]}
                    </div>
                    <div className="absolute -top-1 -right-1 bg-yellow-400 text-white rounded-full p-0.5 border-2 border-card">
                       <Star className="w-3 h-3 fill-white" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{t.name}</h4>
                    <p className="text-xs text-muted-foreground font-medium">{t.grade} • {t.avg} avg</p>
                    <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">{t.title || 'Topper'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-10 text-center">
                 <Trophy className="w-12 h-12 text-muted-foreground opacity-20 mx-auto mb-2" />
                 <p className="text-sm text-muted-foreground font-medium italic">Generating merit list...</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Exams Card */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-base font-bold text-foreground">Upcoming Exams</h3>
            <div className="p-2 bg-blue-50 rounded-lg">
              <Calendar className="w-5 h-5 text-[#1e3a8a]" />
            </div>
          </div>
          <div className="space-y-4">
            {upcomingExams.map((exam, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border border-border rounded-xl hover:bg-secondary/20 transition-all cursor-pointer">
                <div className="w-1.5 h-12 rounded-full" style={{ backgroundColor: exam.color }} />
                <div>
                  <h4 className="text-sm font-bold text-foreground">{exam.name}</h4>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">{exam.date}</p>
                  <p className="text-[10px] uppercase font-bold text-[#1e3a8a] mt-1 tracking-wider">{exam.grades}</p>
                </div>
              </div>
            ))}
            <button className="w-full py-3 text-sm font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors">
              View Detailed Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamsResults;
