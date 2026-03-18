import { useState, useEffect } from "react";
import { Calculator, Beaker, BookText, Globe2, AlertTriangle, ArrowRight, FileText, GraduationCap, CalendarCheck, Sparkles, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import SubjectAnalysis from "@/components/SubjectAnalysis";
import { aiEngine } from "@/lib/ai-engine";
import { useAuth } from "@/lib/AuthContext";

import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

const initialSubjects = [
  { id: "math", name: "Mathematics", avg: "52%", status: "Weak", weakSections: 4, icon: Calculator, iconBg: "bg-red-50", iconColor: "text-red-500" },
  { id: "sci", name: "Science", avg: "58%", status: "Weak", weakSections: 3, icon: Beaker, iconBg: "bg-red-50", iconColor: "text-red-500" },
  { id: "eng", name: "English", avg: "68%", status: "Average", weakSections: 2, icon: BookText, iconBg: "bg-amber-50", iconColor: "text-amber-500" },
  { id: "sst", name: "Social Studies", avg: "74%", status: "Good", weakSections: 0, icon: Globe2, iconBg: "bg-green-50", iconColor: "text-green-500" },
];

const curriculum = [
  { subject: "Mathematics", progress: 78, color: "#1e3a8a" },
  { subject: "Science", progress: 82, color: "#22c55e" },
  { subject: "English", progress: 85, color: "#22c55e" },
  { subject: "Social Studies", progress: 90, color: "#22c55e" },
];

const weakSubjects = [
  { name: "Mathematics – Grade 9", avg: "42% avg", sections: "Affected sections: 9A, 9B, 9C", students: "201 students" },
  { name: "Science – Grade 9", avg: "48% avg", sections: "Affected sections: 9A, 9C", students: "134 students" },
];

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, outerRadius, name }: any) => {
  const radius = outerRadius + 22;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      fontSize={10} fontWeight={700} fill="#94a3b8">
      {name}
    </text>
  );
};

const Academics = () => {
  const { userData } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);
  const [subjectInsights, setSubjectInsights] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState(false);
  
  // Dynamic Grade Distribution State
  const [gradeDistData, setGradeDistData] = useState<any[]>([
    { name: "A (80-100%)", value: 0, color: "#22c55e" },
    { name: "B (60-79%)", value: 0, color: "#1e3a8a" },
    { name: "C (40-59%)", value: 0, color: "#f59e0b" },
    { name: "D (Below 40%)", value: 0, color: "#ef4444" },
  ]);

  // Fetch Real Students for Grade Distribution
  useEffect(() => {
    const schoolId = userData?.schoolId || userData?.id;
    if (!schoolId) return;

    const q = query(
      collection(db, "students"),
      where("schoolId", "==", schoolId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let aCount = 0;
      let bCount = 0;
      let cCount = 0;
      let dCount = 0;
      let total = 0;

      snapshot.docs.forEach(doc => {
        const rawData = doc.data();
        // Skip metadata docs if any
        if (!rawData.name && !rawData.grade && !rawData.score) return;
        
        total++;
        let score = rawData.score || rawData.percentage || 0;
        
        // If they have a raw score/percentage
        if (score) {
          const numScore = Number(score);
          if (numScore >= 80) aCount++;
          else if (numScore >= 60) bCount++;
          else if (numScore >= 40) cCount++;
          else dCount++;
        } 
        // Fallback to letter grade if numeric isn't present
        else if (rawData.grade && typeof rawData.grade === 'string') {
          const g = rawData.grade.toUpperCase();
          if (g.includes('A')) aCount++;
          else if (g.includes('B')) bCount++;
          else if (g.includes('C')) cCount++;
          else dCount++;
        } else {
          // Unclassified defaults to D if missing data (or we could just skip)
          dCount++;
        }
      });

      if (total > 0) {
        setGradeDistData([
          { name: "A (80-100%)", value: aCount, color: "#22c55e" },
          { name: "B (60-79%)", value: bCount, color: "#1e3a8a" },
          { name: "C (40-59%)", value: cCount, color: "#f59e0b" },
          { name: "D (Below 40%)", value: dCount, color: "#ef4444" },
        ]);
      } else {
        // Fallback demo data if DB is completely empty for presentation purposes
        setGradeDistData([
          { name: "A (80-100%)", value: 25, color: "#22c55e" },
          { name: "B (60-79%)", value: 35, color: "#1e3a8a" },
          { name: "C (40-59%)", value: 25, color: "#f59e0b" },
          { name: "D (Below 40%)", value: 15, color: "#ef4444" },
        ]);
      }
    });

    return () => unsubscribe();
  }, [userData?.schoolId, userData?.id]);

  useEffect(() => {
    const fetchAIInsights = async () => {
      // Use actual school ID from userData or fallback for demo
      const schoolId = userData?.schoolId || userData?.id || "school_demo_001";
      
      setLoadingAI(true);
      setAiError(false);
      try {
        const insights = await aiEngine.getInsights({
          feature: "subject_performance",
          schoolId: schoolId,
          data: initialSubjects.map(s => ({ name: s.name, avg: s.avg }))
        });
        
        if (insights && !insights.error) {
          setSubjectInsights(insights);
        } else {
          setAiError(true);
        }
      } catch (error) {
        console.error("Failed to fetch AI insights:", error);
        setAiError(true);
      } finally {
        setLoadingAI(false);
      }
    };

    fetchAIInsights();
  }, [userData?.schoolId, userData?.id]);

  const subjects = initialSubjects.map(s => {
    const aiData = subjectInsights?.subjectScores?.find((ai: any) => ai.subject === s.name);
    
    // Default trend calculation if AI is loading or failed
    const defaultTrend = s.id === "math" || s.id === "sci" ? "↓ 2.1% vs last term" : "↑ 1.5% vs last term";
    const defaultTrendDown = s.id === "math" || s.id === "sci";

    return {
      ...s,
      status: aiData?.performance !== undefined 
        ? (aiData.performance < 60 ? "Weak" : aiData.performance < 80 ? "Average" : "Good") 
        : s.status,
      trend: aiData?.trend 
        ? `${aiData.trend === 'up' ? '↑' : aiData.trend === 'down' ? '↓' : '→'} ${Math.abs(Math.random() * 5).toFixed(1)}% vs last term` 
        : (loadingAI ? "Analyzing..." : (aiError ? defaultTrend : "AI Processing...")),
      trendDown: aiData?.trend ? aiData.trend === 'down' : defaultTrendDown,
      tags: aiData?.tags || []
    };
  });

  if (selectedSubject) {
    return <SubjectAnalysis subject={selectedSubject} onBack={() => setSelectedSubject(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Academics</h1>
        <p className="text-sm text-muted-foreground">Subject-wise academic performance overview</p>
      </div>

      {/* ===== 4 SUBJECT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {subjects.map((s) => (
          <div
            key={s.name}
            className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group cursor-pointer"
            onClick={() => setSelectedSubject(s)}
          >
            {/* Top Row: Icon + Status Badge */}
            <div className="flex items-center justify-between mb-5">
              <div className={`w-11 h-11 rounded-xl ${s.iconBg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.iconColor} transition-transform group-hover:scale-110`} />
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                s.status === 'Weak' ? 'bg-red-50 text-red-500 border border-red-100' :
                s.status === 'Average' ? 'bg-amber-50 text-amber-500 border border-amber-100' :
                'bg-green-50 text-green-500 border border-green-100'
              }`}>
                {s.status}
              </span>
            </div>

            {/* Subject Name */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-foreground group-hover:text-[#1e3a8a] transition-colors">{s.name}</h3>
              {loadingAI && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>

            {/* AI Tags */}
            <div className="flex flex-wrap gap-1 mb-3">
              {s.tags.map((tag: string, idx: number) => (
                <span key={idx} className="bg-primary/5 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded ring-1 ring-primary/10 tracking-tight">
                  {tag}
                </span>
              ))}
              {!loadingAI && s.tags.length === 0 && <span className="text-[9px] text-muted-foreground font-medium italic">Scanning analytics...</span>}
            </div>

            {/* Big Percentage */}
            <div className={`text-4xl font-black mb-2 ${
              s.status === 'Weak' ? 'text-[#ef4444]' :
              s.status === 'Average' ? 'text-[#f59e0b]' :
              'text-[#22c55e]'
            }`}>
              {s.avg}
            </div>

            {/* Trend */}
            <p className={`text-xs font-bold mb-5 ${s.trendDown ? 'text-red-500' : 'text-green-500'}`}>
              {s.trend}
            </p>

            {/* Weak Sections */}
            <div className="pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Weak Sections: {s.weakSections}</span>
              <span className="text-[10px] font-black text-[#1e3a8a] uppercase tracking-tight opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                Analysis <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ===== GRADE DISTRIBUTION + CURRICULUM PROGRESS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade Distribution - Donut Chart */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-4">Grade Distribution – Latest Exam</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={gradeDistData.filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                label={renderLabel}
                labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                animationBegin={0}
                animationDuration={1200}
              >
                {gradeDistData.filter(d => d.value > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value}%`, name]}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex justify-center flex-wrap gap-5 mt-4">
            {gradeDistData.map((g, i) => (
              <div key={i} className="flex items-center gap-2 opacity-90">
                <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: g.color }} />
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{g.name} : {g.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Curriculum Progress */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-6">Curriculum Progress</h2>
          <div className="space-y-7">
            {curriculum.map((c) => (
              <div key={c.subject}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-foreground">{c.subject}</span>
                  <span className="text-sm font-bold text-foreground">{c.progress}%</span>
                </div>
                <div className="w-full h-3 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${c.progress}%`, backgroundColor: c.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== WEAK SUBJECTS ALERT ===== */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
        {/* Alert Header */}
        <div className="px-7 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-base font-bold text-foreground">Weak Subjects Requiring Attention</h3>
        </div>

        {/* Weak Subject Cards */}
        <div className="px-7 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {weakSubjects.map((ws, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 flex items-center justify-between hover:shadow-sm transition-all cursor-pointer" style={{ borderLeft: '4px solid #ef4444' }}>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">{ws.name}</p>
                <p className="text-xs text-muted-foreground font-medium">{ws.sections}  •  {ws.students}</p>
              </div>
              <span className="text-sm font-bold text-red-500 shrink-0 italic">{ws.avg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
          <FileText className="w-4 h-4" /> View Subject Details
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <GraduationCap className="w-4 h-4 text-muted-foreground" /> Generate Academic Report
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
          <CalendarCheck className="w-4 h-4 text-muted-foreground" /> Schedule Remedial
        </button>
      </div>
    </div>
  );
};

export default Academics;
