import React, { useEffect, useState } from "react";
import { Activity, BarChart2, Calendar, Loader2, Sparkles } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import { AIController } from "@/ai/controller/ai-controller";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { pctOfDoc } from "@/lib/scoreUtils";

interface AnalyticsData {
  performance_trend?: string;
  distribution_summary?: string;
  monthly_trend?: string;
  historical_comparison?: string;
}

const AcademicAnalytics = () => {
  const { userData } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);
  const [distributionData, setDistributionData] = useState<{ range: string; count: number }[]>([]);
  const [monthlyTrendData, setMonthlyTrendData] = useState<{ month: string; avg: number }[]>([]);

  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) return;

    const fetchAnalytics = async () => {
      try {
        // P0: schoolId-only server-side; branchId in-memory (memory:
        // branchid_inference_lag — server-side branchId filter would
        // silently hide fresh writes during the trigger backfill window).
        const inBranch = (raw: any): boolean =>
          !branchId || !raw?.branchId || raw.branchId === branchId;

        // Multi-source fetch — `results` alone misses bulk-upload schools
        // that write to `test_scores` or `gradebook_scores` (~40% data loss).
        const [resSnap, tsSnap, gbSnap] = await Promise.all([
          getDocs(query(collection(db, "results"),          where("schoolId", "==", schoolId))).catch(err => { console.warn("[AcademicAnalytics] results fetch failed:", err); return null; }),
          getDocs(query(collection(db, "test_scores"),      where("schoolId", "==", schoolId))).catch(err => { console.warn("[AcademicAnalytics] test_scores fetch failed:", err); return null; }),
          getDocs(query(collection(db, "gradebook_scores"), where("schoolId", "==", schoolId))).catch(err => { console.warn("[AcademicAnalytics] gradebook_scores fetch failed:", err); return null; }),
        ]);

        const rawDocs = [
          ...(resSnap?.docs.map(d => d.data()) ?? []),
          ...(tsSnap?.docs.map(d => d.data())  ?? []),
          ...(gbSnap?.docs.map(d => d.data())  ?? []),
        ].filter(inBranch);

        // Cross-collection dedup + null-safe pct extraction. Drops missing-
        // score docs entirely (was: `parseFloat(r.score) || 0` defaulted to
        // 0, inflating the "<40" bucket and dragging averages down).
        const fpSeen = new Set<string>();
        const rawResults: { _pct: number; subject: string; timestamp: any; }[] = [];
        rawDocs.forEach(r => {
          const pct = pctOfDoc(r);
          if (pct === null) return;
          const subject = String(r.subject ?? r.subjectName ?? "Unspecified");
          const ts = r.timestamp ?? r.createdAt ?? r.date;
          const dateK = (() => {
            if (!ts) return "";
            if (typeof ts === "string") return ts.slice(0, 10);
            if (ts?.toDate) return ts.toDate().toISOString().slice(0, 10);
            return "";
          })();
          const studentKey = String(r.studentId || r.studentEmail || "").toLowerCase();
          const fp = `${studentKey}|${subject.toLowerCase()}|${dateK}|${Math.round(pct * 10)}`;
          if (fpSeen.has(fp)) return;
          fpSeen.add(fp);
          rawResults.push({ _pct: pct, subject, timestamp: ts });
        });

        if (rawResults.length === 0) {
           setDistributionData([]);
           setMonthlyTrendData([]);
           setPlaceholderMessage("No academic records found for this institution.");
           setLoading(false);
           return;
        }

        // 1. Calculate Score Distribution Mapping — only from real scores
        const ranges = [
           { range: "90-100", count: 0, min: 90, max: 100 },
           { range: "75-89", count: 0, min: 75, max: 89 },
           { range: "60-74", count: 0, min: 60, max: 74 },
           { range: "40-59", count: 0, min: 40, max: 59 },
           { range: "<40", count: 0, min: 0, max: 39 },
        ];

        rawResults.forEach(r => {
           const score = r._pct;
           const range = ranges.find(rg => score >= rg.min && score <= rg.max);
           if (range) range.count++;
        });
        setDistributionData(ranges.map(({ range, count }) => ({ range, count })));

        // 2. Monthly Average Trend — bucket key includes YEAR so
        // Jan 2024 and Jan 2025 don't collapse into the same "Jan" bucket.
        const monthlyScores: Record<string, { total: number; count: number; year: number; monthIdx: number; label: string }> = {};
        rawResults.forEach(r => {
           if (!r.timestamp) return;
           const date = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
           if (Number.isNaN(date.getTime())) return;
           const monthShort = date.toLocaleString('default', { month: 'short' });
           const year = date.getFullYear();
           const key = `${year}-${String(date.getMonth()).padStart(2, "0")}`;
           if (!monthlyScores[key]) monthlyScores[key] = { total: 0, count: 0, year, monthIdx: date.getMonth(), label: `${monthShort} ${String(year).slice(2)}` };
           monthlyScores[key].total += r._pct;
           monthlyScores[key].count++;
        });

        const trendData = Object.values(monthlyScores)
           .sort((a, b) => a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx)
           .map(s => ({
              // Label includes 2-digit year so the user can distinguish
              // multi-year data points on the chart.
              month: s.label,
              avg: parseFloat((s.total / s.count).toFixed(1)),
           }))
           .slice(-5); // Show last 5 month-buckets
        setMonthlyTrendData(trendData);

        // 3. Prepare AI Dataset — same null-safe percentages
        const academicDataset = {
           total_records: rawResults.length,
           average_performance: (rawResults.reduce((acc, r) => acc + r._pct, 0) / rawResults.length).toFixed(1),
           subjects: Array.from(new Set(rawResults.map(r => r.subject))).map(sub => {
              const subResults = rawResults.filter(r => r.subject === sub);
              const avg = subResults.reduce((acc, r) => acc + r._pct, 0) / subResults.length;
              return {
                 name: sub,
                 average_score: Math.round(avg),
                 pass_rate: Math.round((subResults.filter(r => r._pct > 40).length / subResults.length) * 100)
              };
           }),
           monthly_average: trendData.map(t => t.avg)
        };

        // Implementation of AI Controller layer calling
        const result = await AIController.getAcademicAnalytics(academicDataset);

        if (result.status === "no_data") {
           setPlaceholderMessage(result.message);
        } else if (result.status === "success" && result.data) {
           setData(result.data);
           setPlaceholderMessage(null);
        }
      } catch (err) {
        console.error("Failed to load academic analytics via controller:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [userData?.schoolId, userData?.branchId]);

  if (!loading && placeholderMessage) {
     return (
        <div className="bg-card border border-border shadow-sm rounded-2xl p-10 flex flex-col items-center justify-center text-center w-full mb-6 relative overflow-hidden group">
           <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-50 rounded-full blur-3xl opacity-50 block"></div>
           <Activity className="w-12 h-12 text-slate-300 mb-4 animate-pulse duration-1000 relative z-10" />
           <p className="text-base font-bold text-slate-600 max-w-md relative z-10">{placeholderMessage}</p>
        </div>
     );
  }

  // Derive mini-badges for visuals based on keywords in the return string
  function extractTrendWord(str?: string) {
     if (!str) return "STABLE";
     const l = str.toLowerCase();
     if (l.includes("improv") || l.includes("increas")) return "IMPROVING";
     if (l.includes("declin") || l.includes("decreas")) return "DECLINING";
     return "STABLE";
  }

  function getTrendColor(trendMode: string) {
     if (trendMode === "IMPROVING") return "text-green-600 bg-green-50 border-green-200";
     if (trendMode === "DECLINING") return "text-red-600 bg-red-50 border-red-200";
     return "text-amber-600 bg-amber-50 border-amber-200";
  }

  return (
    <div className="bg-card border border-border shadow-sm rounded-2xl p-7 mb-6 w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
         <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-indigo-500" /> Academic Analytics Engine
            </h2>
            <p className="text-sm font-medium text-muted-foreground mt-1">AI-driven academic performance mapping and historical comparison</p>
         </div>
         {loading && <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
         {/* INSIGHT CARDS (Left Side) */}
         <div className="lg:col-span-5 space-y-4">
            {/* Performance Trend Analysis */}
            <div className="p-5 border border-border rounded-xl bg-slate-50/50 hover:bg-white transition-all shadow-none hover:shadow-sm group">
               <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-slate-800"><Activity className="w-4 h-4 text-blue-500"/> Performance Trend</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${getTrendColor(extractTrendWord(data?.performance_trend))}`}>
                     {loading ? "PROCESSING" : extractTrendWord(data?.performance_trend)}
                  </span>
               </div>
               <p className="text-sm font-semibold text-slate-600 leading-relaxed group-hover:text-slate-900 transition-colors">
                  {data?.performance_trend || (loading ? "Generating insight..." : "No trend insight available.")}
               </p>
            </div>

            {/* Monthly Trend Analytics */}
            <div className="p-5 border border-border rounded-xl bg-slate-50/50 hover:bg-white transition-all shadow-none hover:shadow-sm group">
               <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-slate-800"><Calendar className="w-4 h-4 text-purple-500"/> Monthly Average Trend</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${getTrendColor(extractTrendWord(data?.monthly_trend))}`}>
                     {loading ? "PROCESSING" : extractTrendWord(data?.monthly_trend)}
                  </span>
               </div>
               <p className="text-sm font-semibold text-slate-600 leading-relaxed group-hover:text-slate-900 transition-colors">
                  {data?.monthly_trend || (loading ? "Generating insight..." : "No monthly insight available.")}
               </p>
            </div>

            {/* Historical Comparison */}
            <div className="p-5 border border-border rounded-xl bg-slate-50/50 hover:bg-white transition-all shadow-none hover:shadow-sm group">
               <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-slate-800"><BarChart2 className="w-4 h-4 text-green-500"/> Historical Comparison</h3>
               </div>
               <p className="text-sm font-semibold text-slate-600 leading-relaxed group-hover:text-slate-900 transition-colors">
                  {data?.historical_comparison || (loading ? "Generating insight..." : "No historical comparison available.")}
               </p>
            </div>
         </div>

         {/* CHARTS (Right Side) */}
         <div className="lg:col-span-7 grid grid-rows-2 gap-4">
            
            {/* Grade Distribution Mapping */}
            <div className="border border-border rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
               <h3 className="text-sm font-bold flex flex-wrap gap-2 items-center justify-between text-slate-800 mb-4">
                  Grade Distribution Mapping
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-black uppercase border border-blue-200/50">Cohort Analytics</span>
               </h3>
               <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={distributionData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} dy={5} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dx={-10} />
                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                           {distributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === 2 ? '#3b82f6' : '#cbd5e1'} />
                           ))}
                        </Bar>
                     </BarChart>
                  </ResponsiveContainer>
               </div>
               <p className="text-xs font-semibold text-slate-600 mt-3 text-center italic bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 flex items-center justify-center gap-2">
                  <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 block"></span>
                  {data?.distribution_summary || "Analyzing score distribution clusters..."}
               </p>
            </div>

            {/* Monthly Performance Graphs */}
            <div className="border border-border rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col">
               <h3 className="text-sm font-bold flex flex-wrap gap-2 items-center justify-between text-slate-800 mb-4">
                  Monthly Performance Tracking
                  <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-1 rounded font-black uppercase border border-purple-200/50">Timeline</span>
               </h3>
               <div className="flex-1 w-full relative min-h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                           <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} dy={5} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dx={-10} domain={[40, 100]} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }} />
                        <Area type="monotone" dataKey="avg" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorAvg)" />
                     </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>

         </div>
      </div>
    </div>
  );
};

export default AcademicAnalytics;
