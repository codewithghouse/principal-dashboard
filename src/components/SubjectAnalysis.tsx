import { useState, useEffect } from "react";
import { ChevronLeft, Download, Lightbulb, TrendingUp, TrendingDown, Loader2, User } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { aiEngine, generateAcademicInsights } from "@/lib/ai-engine";

interface SubjectAnalysisProps {
  subject: {
    name: string;
    avg: string;
    icon: any;
    iconBg?: string;
    iconColor?: string;
  };
  onBack: () => void;
}

const SubjectAnalysis = ({ subject, onBack }: SubjectAnalysisProps) => {
  const { userData } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  const [drilledInsights, setDrilledInsights] = useState<any>(null);
  const [loadingDrill, setLoadingDrill] = useState(false);

  useEffect(() => {
    const fetchDrill = async () => {
      setLoadingDrill(true);
      try {
        const res = await generateAcademicInsights({
          subject: subject.name,
          average_score: parseInt(subject.avg),
          pass_rate: 75
        }, "drill_down_analysis");
        setDrilledInsights(res);
      } catch (e) {
        console.error("Drill analysis error:", e);
      }
      setLoadingDrill(false);
    };
    fetchDrill();
  }, [subject.name, subject.avg]);

  useEffect(() => {
    const schoolId = userData?.schoolId || userData?.id;
    if (!schoolId) return;

    // Fetch teachers for this school who teach this subject (or all teachers)
    const q = query(
      collection(db, "teachers"),
      where("schoolId", "==", schoolId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const colors = ["#1e3a8a", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
      const data = snapshot.docs.map((doc, idx) => {
        const t = doc.data();
        const performance = Math.floor(Math.random() * (95 - 65 + 1)) + 65; // Simulated for now
        
        return {
          id: doc.id,
          name: t.name || "Unknown Teacher",
          grades: t.classes || "N/A",
          avg: `${performance}%`,
          avgColor: performance < 70 ? "#ef4444" : performance < 85 ? "#f59e0b" : "#22c55e",
          initials: t.name ? t.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : "T",
          avatarBg: colors[idx % colors.length]
        };
      });
      setTeachers(data);
      setLoadingTeachers(false);
    }, (error) => {
      console.error("Error fetching teachers:", error);
      setLoadingTeachers(false);
    });

    return () => unsubscribe();
  }, [userData?.schoolId, userData?.id]);

  const [marksDistData, setMarksDistData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

  useEffect(() => {
    const fetchChartData = async () => {
      const schoolId = userData?.schoolId || userData?.id;
      if (!schoolId) return;

      console.info(`%c 📊 [UI] Fetching Marks Distribution for: ${subject.name} `, 'color: #8b5cf6; font-weight: bold;');
      setLoadingChart(true);
      try {
        const result = await aiEngine.getInsights({
          feature: "marks_distribution",
          schoolId: `${schoolId}_${subject.name.toLowerCase()}`,
          data: { subject: subject.name, avg: subject.avg }
        });
        
        if (result && result.distribution) {
          setMarksDistData(result.distribution);
        }
      } catch (error) {
        console.error("Error fetching chart data:", error);
      } finally {
        setLoadingChart(false);
      }
    };

    fetchChartData();
  }, [subject.name, userData?.schoolId, userData?.id]);

  const [sectionsPerformance, setSectionsPerformance] = useState<any[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);

  useEffect(() => {
    const fetchSectionsData = async () => {
      const schoolId = userData?.schoolId || userData?.id;
      if (!schoolId) return;

      console.info(`%c 📈 [UI] Fetching Section Performance for: ${subject.name} `, 'color: #3b82f6; font-weight: bold;');
      setLoadingSections(true);
      try {
        // Step 1: Fetch real students to calculate actual section averages
        const { getDocs } = await import("firebase/firestore"); // Dynamic import to prevent scope issues
        const q = query(collection(db, "students"), where("schoolId", "==", schoolId));
        const snap = await getDocs(q);
        
        const sectionMap: Record<string, { total: number; count: number }> = {};
        snap.forEach(doc => {
            const data = doc.data();
            const sec = data.grade || data.section;
            const score = Number(data.score || data.percentage || 0);
            if (sec && score > 0) {
                if (!sectionMap[sec]) sectionMap[sec] = { total: 0, count: 0 };
                sectionMap[sec].total += score;
                sectionMap[sec].count += 1;
            }
        });

        // Step 2: Format aggregated real data
        const rawSectionAverages = Object.keys(sectionMap).map(sec => ({
            section: sec,
            average_score: Math.round(sectionMap[sec].total / sectionMap[sec].count)
        }));

        // Step 3: Pass to AI (AI will format it beautifully, or simulate if empty)
        const payloadData = { 
          subject: subject.name, 
          overall_avg: subject.avg,
          real_database_sections: rawSectionAverages.length > 0 ? rawSectionAverages : "No real section data available yet. Please simulate 4-5 realistic sections (e.g. 10A, 10B, 9A) based on the overall average."
        };

        const result = await aiEngine.getInsights({
          feature: "section_performance",
          schoolId: `${schoolId}_sections_${subject.name.toLowerCase()}`,
          data: payloadData,
          forceRefresh: rawSectionAverages.length > 0 // Force fresh AI analysis if real data is available
        });
        
        if (result && result.sections) {
          setSectionsPerformance(result.sections);
        }
      } catch (error) {
        console.error("Error fetching sections data:", error);
      } finally {
        setLoadingSections(false);
      }
    };

    fetchSectionsData();
  }, [subject.name, userData?.schoolId, userData?.id]);

  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
          {payload[0].payload.range}: {payload[0].value} students
        </div>
      );
    }
    return null;
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Academics</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Subject Analysis</span>
      </div>

      {/* ===== SUBJECT HEADER ===== */}
      <div className="rounded-2xl p-6 mb-8 flex items-center justify-between shadow-sm border" style={{ backgroundColor: '#fff5f5', borderColor: '#fecaca' }}>
        <div className="flex items-center gap-5">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm ${subject.iconBg || 'bg-red-50'}`}>
            <subject.icon className={`w-7 h-7 ${subject.iconColor || 'text-red-500'}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{subject.name}</h1>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              Overall Average: <span className="text-red-500 font-bold">{subject.avg}</span>
              <span className="mx-2">•</span>
              847 students
            </p>
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          <button className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-bold text-foreground bg-card hover:bg-secondary transition-colors">
            <Download className="w-4 h-4 text-red-500" /> Export PDF
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] rounded-xl text-sm font-bold text-white hover:bg-[#1e4fc0] transition-colors shadow-md">
            <Lightbulb className="w-4 h-4" /> View Recommendations
          </button>
        </div>
      </div>

      {/* ===== TOP ROW: Section Performance + Insights ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Section-wise Performance - Horizontal Bar Chart (recharts) */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-foreground">Section-wise Performance</h3>
            {loadingSections && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {loadingSections ? (
            <div className="h-[320px] flex items-center justify-center bg-secondary/10 rounded-xl border border-dashed border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Analyzing Sections...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={sectionsPerformance}
                layout="vertical"
                margin={{ top: 5, right: 40, left: 5, bottom: 5 }}
                barCategoryGap="22%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="section"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }}
                  width={35}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
                          {payload[0].payload.section}: {payload[0].value}%
                        </div>
                      );
                    }
                    return null;
                  }}
                  cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={1200} barSize={22}>
                  {sectionsPerformance.map((entry, index) => (
                    <Cell key={`section-bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Performance Insights */}
        <div className="space-y-4">
          {/* Top Performing Section */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-foreground mb-1">Top Performing Section</h4>
                <p className="text-sm text-muted-foreground font-medium">10A with 72% average (Mrs. Kavita)</p>
              </div>
            </div>
          </div>

          {/* Weakest Section */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <TrendingDown className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-foreground mb-1">Weakest Section</h4>
                <p className="text-sm text-muted-foreground font-medium">9A with 42% average (Mrs. Kavita)</p>
              </div>
            </div>
          </div>

          {/* Key Issues Identified */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h4 className="text-sm font-bold text-foreground mb-3">Key Issues Identified</h4>
            <ul className="space-y-2.5">
              {[
                "Algebra concepts weak across grades 8-9",
                "Geometry application problems",
                "Time management in exams"
              ].map((issue, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground font-medium">
                  <span className="text-foreground mt-1.5">•</span>
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ===== BOTTOM ROW: Marks Distribution + Teacher Effectiveness ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Student Marks Distribution - Bar Chart */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-foreground">Student Marks Distribution</h3>
            {loadingChart && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {loadingChart ? (
            <div className="h-[260px] flex items-center justify-center bg-secondary/10 rounded-xl border border-dashed border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Generating Distribution...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={marksDistData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="range"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                <Bar dataKey="students" radius={[4, 4, 0, 0]} animationDuration={1200}>
                  {marksDistData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Teacher Effectiveness */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-6">Teacher Effectiveness</h3>
          <div className="space-y-4">
            {loadingTeachers ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">Loading staff data...</p>
              </div>
            ) : teachers.length > 0 ? (
              teachers.map((t, i) => (
                <div key={t.id || i} className="flex items-center justify-between p-5 border border-border rounded-xl hover:shadow-sm transition-all cursor-pointer bg-secondary/20">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md" style={{ backgroundColor: t.avatarBg }}>
                      {t.initials}
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground font-medium">{t.grades}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black" style={{ color: t.avgColor }}>{t.avg}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">avg</p>
                  </div>
                </div>
              ))
            ) : (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                  <User className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs font-bold uppercase tracking-widest">No teachers found</p>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== AI DRILL-DOWN ANALYSIS ===== */}
      <div className="mt-6 border border-border rounded-xl bg-card overflow-hidden">
        <div className="bg-primary/5 p-4 border-b border-border flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-foreground">AI Drill-down Analysis</h2>
        </div>
        <div className="p-5">
           {loadingDrill ? (
               <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-secondary rounded w-3/4"></div>
                  <div className="h-4 bg-secondary rounded w-1/2"></div>
                  <div className="h-20 bg-secondary/50 rounded-xl mt-4"></div>
               </div>
           ) : drilledInsights ? (
               <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground mb-1">Key AI Insight</h3>
                    <p className="text-sm text-muted-foreground">{drilledInsights.subject_insight}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                      <h4 className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">Primary Strengths</h4>
                      <ul className="list-disc pl-4 text-sm text-green-700 font-medium space-y-1">
                        {drilledInsights.strengths?.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                    <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                      <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2">Improvement Focus</h4>
                      <ul className="list-disc pl-4 text-sm text-red-700 font-medium space-y-1">
                        {drilledInsights.improvement_focus?.map((f: string, i: number) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <h4 className="text-sm font-bold text-slate-800 mb-1">Strategy Recommendation</h4>
                    <p className="text-sm text-slate-600">{drilledInsights.recommendation}</p>
                  </div>
               </div>
           ) : (
             <p className="text-sm text-muted-foreground">Unable to generate AI insights at this moment. Please check connectivity.</p>
           )}
        </div>
      </div>

      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Academics
        </button>
      </div>
    </div>
  );
};

export default SubjectAnalysis;
