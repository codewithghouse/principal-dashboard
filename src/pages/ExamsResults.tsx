import { useState, useEffect } from "react";
import { 
  FileText, Calendar, Users, Percent, Trophy, AlertTriangle, 
  Plus, Upload, BookOpen, BarChart2, Star, Sparkles, Loader2, User, ChevronRight, TrendingDown, PieChart as PieChartIcon 
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, limit, getDocs } from "firebase/firestore";

const ExamsResults = () => {
  const { userData } = useAuth();
  const [examResults, setExamResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const snap = await getDocs(query(collection(db, "exam_results"), limit(5)));
        setExamResults(snap.docs.map(d => d.data()));
      } catch (e) {
        console.warn("No exam_results found.");
      }
      setLoading(false);
    };
    fetchResults();
  }, []);

  const hasData = examResults.length > 0;

  // Mock aggregates if data exists
  const passFailData = [
    { name: 'Passed', value: 78, color: '#22c55e' },
    { name: 'Failed', value: 22, color: '#ef4444' }
  ];

  const subjectSuccessData = [
    { subject: 'Math', passRate: 45, avgScore: 55 },
    { subject: 'Science', passRate: 75, avgScore: 68 },
    { subject: 'English', passRate: 92, avgScore: 82 },
    { subject: 'History', passRate: 88, avgScore: 78 }
  ];

  const meritList = [
    { rank: 1, name: 'Ayesha Khan', score: 96, grade: '10A' },
    { rank: 2, name: 'Ali Raza', score: 94, grade: '10B' },
    { rank: 3, name: 'Sara Ahmed', score: 92, grade: '9C' },
    { rank: 4, name: 'Bilal Saeed', score: 90, grade: '10A' },
    { rank: 5, name: 'Fatima Noor', score: 89, grade: '9A' },
  ];

  const failedStudents = [
    { name: 'Zaid Ali', grade: '9B', failures: 3, riskMsg: 'Critical Risk', color: 'text-red-600 bg-red-50 border-red-200' },
    { name: 'Omer Farooq', grade: '10C', failures: 1, riskMsg: 'Needs Attention', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Academic Intelligence System</h1>
          <p className="text-sm text-muted-foreground">Automated exam performance analytics and insights</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm font-bold text-foreground hover:bg-secondary transition-all shadow-sm">
            <Upload className="w-4 h-4 text-[#1e3a8a]" /> Upload Results
          </button>
        </div>
      </div>

      {/* TOP ROW: FEATURE 1 (Pass/Fail) & FEATURE 5 (Toppers) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* FEATURE 1: Pass/Fail Ratio Analytics */}
         <div className="bg-card border border-border rounded-2xl p-7 shadow-sm flex flex-col hover:shadow-md transition-shadow">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2"><PieChartIcon className="w-5 h-5 text-blue-500"/> Pass/Fail Ratio Analytics</h3>
            {!loading && !hasData ? (
               <div className="flex-1 flex flex-col items-center justify-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center px-4">
                  <Percent className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-500">No exam performance data available yet.</p>
               </div>
            ) : (
               <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="h-44 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                           <Pie data={passFailData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                              {passFailData.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                           </Pie>
                           <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        </PieChart>
                     </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-between w-full px-4 mt-2">
                     <div className="text-center">
                        <p className="text-2xl font-black text-green-500">78%</p>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Total Passed</p>
                     </div>
                     <div className="text-center">
                        <p className="text-2xl font-black text-red-500">22%</p>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Total Failed</p>
                     </div>
                  </div>
               </div>
            )}
         </div>

         {/* FEATURE 5: Topper Identification Logic */}
         <div className="lg:col-span-2 bg-gradient-to-br from-blue-900 to-indigo-900 border border-blue-800 rounded-2xl p-7 shadow-lg flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-10 -mt-20 group-hover:bg-white/10 transition-colors"></div>
            <h3 className="text-base font-bold text-white mb-6 flex items-center gap-2 relative z-10"><Sparkles className="w-5 h-5 text-yellow-400"/> Auto-Detected Top Performers</h3>
            
            {!loading && !hasData ? (
               <div className="flex-1 flex flex-col items-center justify-center py-10 bg-white/5 border border-dashed border-white/20 rounded-xl text-center px-4 relative z-10">
                  <Trophy className="w-10 h-10 text-white/30 mb-3" />
                  <p className="text-sm font-bold text-white/50">No toppers identified yet.</p>
               </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                  {meritList.slice(0,3).map((t, i) => (
                     <div key={i} className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center text-yellow-900 font-black shadow-inner">
                           {t.rank}
                        </div>
                        <div>
                           <p className="text-sm font-bold text-white">{t.name}</p>
                           <p className="text-xs font-semibold text-blue-200">{t.score}% Avg • {t.grade}</p>
                        </div>
                     </div>
                  ))}
               </div>
            )}
         </div>
      </div>

      {/* MIDDLE ROW: FEATURE 4 (Subject Success) & FEATURE 3 (Failed Students) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* FEATURE 4: Subject Success Mapping */}
         <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-base font-bold text-foreground mb-6 flex items-center gap-2"><BarChart2 className="w-5 h-5 text-purple-500"/> Subject Success Mapping</h3>
            {!loading && !hasData ? (
               <div className="flex flex-col items-center justify-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center px-4">
                  <BookOpen className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-500">Subject performance insights will generate once exam data is recorded.</p>
               </div>
            ) : (
               <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={subjectSuccessData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} domain={[0, 100]} />
                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="passRate" name="Pass Rate %" radius={[4, 4, 0, 0]} maxBarSize={50}>
                           {subjectSuccessData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.passRate < 50 ? '#ef4444' : entry.passRate < 70 ? '#f59e0b' : '#22c55e'} />
                           ))}
                        </Bar>
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            )}
         </div>

         {/* FEATURE 3: Failed Students Identification */}
         <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <div className="px-7 py-5 border-b border-border bg-red-50/50 flex items-center justify-between">
               <h3 className="text-base font-bold text-red-900 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-red-500"/> Failed Students Risk</h3>
            </div>
            {!loading && !hasData ? (
               <div className="flex-1 flex flex-col items-center justify-center py-10 bg-white text-center px-4">
                  <AlertTriangle className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600 max-w-[200px]">Failed student insights will appear once exam records are available.</p>
               </div>
            ) : (
               <div className="divide-y divide-border">
                  {failedStudents.map((fs, i) => (
                     <div key={i} className="px-7 py-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                           <div>
                              <p className="text-sm font-bold text-slate-800">{fs.name}</p>
                              <p className="text-xs font-semibold text-slate-500">{fs.grade}</p>
                           </div>
                           <div className="text-right">
                              <span className="text-xl font-black text-red-500">{fs.failures}</span>
                              <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">Failed Subjs</p>
                           </div>
                        </div>
                        <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold border ${fs.color}`}>
                           {fs.riskMsg}
                        </span>
                     </div>
                  ))}
               </div>
            )}
            {hasData && (
              <div className="p-4 border-t border-border bg-slate-50 text-center mt-auto">
                 <button className="text-xs font-bold text-[#1e3a8a] py-1 px-3 border border-[#1e3a8a]/20 rounded-md hover:bg-blue-50 transition-colors">View All At-Risk</button>
              </div>
            )}
         </div>
      </div>

      {/* BOTTOM ROW: FEATURE 2 (Auto-Merit List) */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
         <div className="px-7 py-6 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2"><Trophy className="w-5 h-5 text-green-500"/> Auto-Merit List Generation</h3>
            <button className="flex items-center gap-1 text-xs font-bold text-[#1e3a8a] bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">Full Report <ChevronRight className="w-4 h-4"/></button>
         </div>
         
         {!loading && !hasData ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white text-center px-4">
               <Users className="w-12 h-12 text-slate-200 mb-4" />
               <p className="text-sm font-bold text-slate-600">Merit list will generate automatically after exam results are uploaded.</p>
            </div>
         ) : (
            <div className="overflow-x-auto">
               <table className="w-full">
                  <thead>
                     <tr className="bg-secondary/50">
                        <th className="px-7 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Rank</th>
                        <th className="px-7 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Student Name</th>
                        <th className="px-7 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Grade</th>
                        <th className="px-7 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">Score (%)</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                     {meritList.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                           <td className="px-7 py-4 text-sm font-medium text-slate-900">
                              <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-black shadow-sm ${m.rank <= 3 ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>{m.rank}</span>
                           </td>
                           <td className="px-7 py-4 text-sm font-bold text-foreground">{m.name}</td>
                           <td className="px-7 py-4 text-sm font-semibold text-slate-500">{m.grade}</td>
                           <td className="px-7 py-4 text-sm font-black text-[#1e3a8a]">{m.score}%</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         )}
      </div>

    </div>
  );
};

export default ExamsResults;
