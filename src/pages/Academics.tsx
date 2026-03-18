import { useState, useEffect } from "react";
import { Calculator, Beaker, BookText, Globe2, AlertTriangle, ArrowRight, FileText, GraduationCap, CalendarCheck, Sparkles, Loader2, Grid } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import SubjectAnalysis from "@/components/SubjectAnalysis";
import { aiEngine, generateAcademicInsights } from "@/lib/ai-engine";
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
  const [curriculumInsights, setCurriculumInsights] = useState<any[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState(false);
  
  // Dynamic Grade Distribution State
  const [gradeDistData, setGradeDistData] = useState<any[]>([
    { name: "A (80-100%)", value: 0, color: "#22c55e" },
    { name: "B (60-79%)", value: 0, color: "#1e3a8a" },
    { name: "C (40-59%)", value: 0, color: "#f59e0b" },
    { name: "D (Below 40%)", value: 0, color: "#ef4444" },
  ]);
  const [hasRealData, setHasRealData] = useState(false);

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
        if (!rawData.name && !rawData.grade && !rawData.score) return;
        
        total++;
        let score = rawData.score || rawData.percentage || 0;
        
        if (score) {
          const numScore = Number(score);
          if (numScore >= 80) aCount++;
          else if (numScore >= 60) bCount++;
          else if (numScore >= 40) cCount++;
          else dCount++;
        } 
        else if (rawData.grade && typeof rawData.grade === 'string') {
          const g = rawData.grade.toUpperCase();
          if (g.includes('A')) aCount++;
          else if (g.includes('B')) bCount++;
          else if (g.includes('C')) cCount++;
          else dCount++;
        } else {
          dCount++;
        }
      });

      setHasRealData(total > 0);

      if (total > 0) {
        setGradeDistData([
          { name: "A (80-100%)", value: aCount, color: "#22c55e" },
          { name: "B (60-79%)", value: bCount, color: "#1e3a8a" },
          { name: "C (40-59%)", value: cCount, color: "#f59e0b" },
          { name: "D (Below 40%)", value: dCount, color: "#ef4444" },
        ]);
      } else {
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
      const schoolId = userData?.schoolId || userData?.id || "school_demo_001";
      
      setLoadingAI(true);
      setAiError(false);
      try {
        const insights = await aiEngine.getInsights({
          feature: "subject_performance",
          schoolId: schoolId,
          data: initialSubjects.map(s => ({ name: s.name, avg: s.avg })),
          forceRefresh: true
        });
        
        if (insights && !insights.error) {
          setSubjectInsights(insights);
        } else {
          setAiError(true);
        }

        // Generate Feature 2: Curriculum Progress Tracking
        const mockCurriculumData = initialSubjects.map(s => ({
          subject: s.name,
          total_chapters: 15,
          completed_chapters: s.name === "Mathematics" ? 6 : (s.name === "Science" ? 8 : 12),
          pending_chapters: s.name === "Mathematics" ? 9 : (s.name === "Science" ? 7 : 3)
        }));

        const currInsights = await Promise.all(mockCurriculumData.map(async (data) => {
          try {
            const res = await generateAcademicInsights(data, "curriculum_tracking");
            return { subject: data.subject, ...res };
          } catch(e) {
             return { subject: data.subject, completion_percentage: Math.round((data.completed_chapters/data.total_chapters)*100), status: "Processing Error", recommendation: "Failed to fetch AI data" };
          }
        }));
        setCurriculumInsights(currInsights);

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

      {/* ===== GRADE-WISE PERFORMANCE HEATMAP ===== */}
      <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-6">Grade-wise Performance Heatmap</h2>
        {!hasRealData ? (
          <div className="flex flex-col items-center justify-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
             <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center mb-3">
                <Grid className="w-6 h-6 text-slate-400" />
             </div>
             <p className="text-sm font-bold text-slate-600 text-center max-w-sm">
               Performance heatmap will generate automatically once academic data is available.
             </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
               <thead>
                  <tr>
                    <th className="text-left font-bold text-xs text-muted-foreground uppercase tracking-wider p-3 pb-4">Grade Level</th>
                    {['Mathematics', 'Science', 'English', 'History'].map(sub => (
                      <th key={sub} className="text-center font-bold text-xs text-muted-foreground uppercase tracking-wider p-3 pb-4">{sub}</th>
                    ))}
                  </tr>
               </thead>
               <tbody>
                  {[
                    { grade: "Grade 6", Math: 88, Science: 92, English: 78, History: 85 },
                    { grade: "Grade 7", Math: 76, Science: 80, English: 84, History: 79 },
                    { grade: "Grade 8", Math: 90, Science: 85, English: 88, History: 92 },
                    { grade: "Grade 9", Math: 65, Science: 70, English: 80, History: 72 },
                    { grade: "Grade 10", Math: 82, Science: 88, English: 90, History: 85 },
                  ].map((row, i) => (
                    <tr key={row.grade} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors group">
                      <td className="p-3 py-4 font-bold text-sm text-slate-800">{row.grade}</td>
                      {['Math', 'Science', 'English', 'History'].map(sub => {
                         const score = row[sub as keyof typeof row] as number;
                         const color = score >= 85 ? 'bg-[#22c55e]' : score >= 75 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]';
                         const textColor = score >= 75 ? 'text-white' : 'text-white';
                         return (
                           <td key={sub} className="p-2">
                             <div 
                               className={`w-full h-11 ${color} rounded-lg flex items-center justify-center ${textColor} font-bold text-sm shadow-sm opacity-90 hover:opacity-100 cursor-help transition-all transform hover:scale-105`} 
                               title={`${sub} Average: ${score}% (Hover Insights)`}
                             >
                               {score}%
                             </div>
                           </td>
                         )
                      })}
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>
        )}
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
          <h2 className="text-base font-bold text-foreground mb-6">Curriculum Progress (AI Analyzed)</h2>
          <div className="space-y-7">
            {loadingAI ? (
              <>
                <div className="h-8 bg-secondary/20 rounded-xl border border-dashed border-primary/20 animate-pulse" />
                <div className="h-8 bg-secondary/20 rounded-xl border border-dashed border-primary/20 animate-pulse" />
                <div className="h-8 bg-secondary/20 rounded-xl border border-dashed border-primary/20 animate-pulse" />
              </>
            ) : curriculumInsights.length > 0 ? (
              curriculumInsights.map((c: any, idx: number) => (
                <div key={idx}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold text-foreground">{c.subject}</span>
                    <span className="text-sm font-black text-[#1e3a8a]">{c.completion_percentage}%</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${c.status === 'Behind Schedule' ? 'text-red-500' : 'text-green-500'}`}>{c.status}</span>
                  </div>
                  <div className="w-full h-3 bg-[#f1f5f9] rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${c.status === 'Behind Schedule' ? 'bg-red-500' : 'bg-[#22c55e]'}`}
                      style={{ width: `${c.completion_percentage}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium leading-tight mt-1">{c.recommendation}</p>
                </div>
              ))
            ) : (
                <div className="py-8 flex flex-col items-center justify-center text-center bg-white rounded-xl border border-dashed border-border">
                  <p className="text-xs font-bold text-muted-foreground">Curriculum Data Pending</p>
                </div>
            )}
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
          {loadingAI ? (
            <>
              <div className="h-20 bg-secondary/20 rounded-xl border border-dashed border-red-200 animate-pulse flex items-center justify-center">
                <p className="text-xs font-bold text-red-400 uppercase tracking-widest">AI Identifying Weak Zones...</p>
              </div>
              <div className="h-20 bg-secondary/20 rounded-xl border border-dashed border-red-200 animate-pulse flex items-center justify-center">
                <p className="text-xs font-bold text-red-400 uppercase tracking-widest">Generating Action Plan...</p>
              </div>
            </>
          ) : (!subjectInsights?.weak_sections && !subjectInsights?.weakSubjects) ? (
            <div className="col-span-full py-10 flex flex-col items-center justify-center text-center bg-white rounded-xl border border-dashed border-red-200">
               <AlertTriangle className="w-10 h-10 text-red-300 mb-3" />
               <p className="text-sm font-bold text-red-600">No AI Assessed Weak Subjects Found</p>
               <p className="text-xs text-red-400/80 mt-1.5 max-w-sm font-medium">Once detailed subject-wise exam records are inserted into the database, the AI will automatically detect and highlight the real weak areas here instead of showing dummy data.</p>
            </div>
          ) : (subjectInsights?.weak_sections || subjectInsights?.weakSubjects || []).map((ws: any, i: number) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 flex items-center justify-between hover:shadow-sm transition-all cursor-pointer" style={{ borderLeft: '4px solid #ef4444' }}>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">{ws.name || ws.subject}</p>
                <p className="text-xs text-muted-foreground font-medium">{ws.sections || ws.issue || 'Analyzing affected areas'}  •  {ws.students || 'Multiple students'}</p>
              </div>
              <span className="text-sm font-bold text-red-500 shrink-0 italic">{ws.avg || ws.score || 'Critical'}</span>
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
