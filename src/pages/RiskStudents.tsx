import React, { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, Activity, Loader2, UserX, TrendingDown, Clock, ShieldAlert } from "lucide-react";
import { AIController } from "@/ai/controller/ai-controller";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, limit } from "firebase/firestore";

interface RiskInsights {
  chronic_absentees: { student: string; reason: string }[];
  attendance_risk: { student: string; risk_level: string; reason: string }[];
  forecast_summary: string;
  at_risk_students: { student: string; risk_level: string; factors: string[] }[];
}

const RiskStudents = () => {
  const [data, setData] = useState<RiskInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchRiskData = async () => {
      try {
        // Query database to evaluate populated state
        const snap = await getDocs(query(collection(db, "students"), limit(5)));
        const dataExists = !snap.empty;

        // Structured Input
        const mockInput = dataExists ? {
           grade: "9",
           students: [
             { name: "Ali", attendance_rate: 62, recent_absences: 5, average_score: 48 },
             { name: "Sara", attendance_rate: 91, recent_absences: 0, average_score: 78 },
             { name: "Zaid", attendance_rate: 74, recent_absences: 3, average_score: 55 }
           ],
           attendance_history: [92, 88, 84, 79, 74],
           incident_records: 3
        } : null;

        const result = await AIController.getRiskInsights(mockInput);

        if (result.status === "no_data") {
           setPlaceholderMessage(result.message);
        } else if (result.status === "success" && result.data) {
           setData(result.data);
           setPlaceholderMessage(null);
        } else {
           setPlaceholderMessage(result.message || "An error occurred.");
        }
      } catch (err) {
        console.error("AI Controller Failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRiskData();
  }, []);

  if (!loading && placeholderMessage) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Risk Students</h1>
          <p className="text-sm text-muted-foreground">Monitor and intervene with at-risk students</p>
        </div>
        <div className="bg-card border border-border shadow-sm rounded-2xl p-10 flex flex-col items-center justify-center text-center w-full mb-6 relative overflow-hidden group">
           <div className="absolute -right-10 -top-10 w-40 h-40 bg-red-50 rounded-full blur-3xl opacity-50 block"></div>
           <ShieldAlert className="w-12 h-12 text-slate-300 mb-4 animate-pulse duration-1000 relative z-10" />
           <p className="text-base font-bold text-slate-600 max-w-md relative z-10">{placeholderMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Risk Students</h1>
          <p className="text-sm text-muted-foreground">AI-Powered early detection of attendance and academic decline</p>
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-red-500" />}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-start justify-between relative overflow-hidden hover:shadow-md transition-shadow">
           <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total At-Risk</p>
              <h3 className="text-3xl font-black text-red-600">{data?.at_risk_students?.length || 0}</h3>
           </div>
           <div className="p-3 bg-red-50 text-red-500 rounded-xl"><AlertTriangle className="w-6 h-6"/></div>
        </div>

        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-start justify-between relative overflow-hidden hover:shadow-md transition-shadow">
           <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Chronic Absentees</p>
              <h3 className="text-3xl font-black text-amber-500">{data?.chronic_absentees?.length || 0}</h3>
           </div>
           <div className="p-3 bg-amber-50 text-amber-500 rounded-xl"><UserX className="w-6 h-6"/></div>
        </div>

        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-start justify-between relative overflow-hidden hover:shadow-md transition-shadow">
           <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Attendance Warnings</p>
              <h3 className="text-3xl font-black text-orange-500">{data?.attendance_risk?.length || 0}</h3>
           </div>
           <div className="p-3 bg-orange-50 text-orange-500 rounded-xl"><Clock className="w-6 h-6"/></div>
        </div>

        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex flex-col justify-center relative overflow-hidden bg-gradient-to-br from-red-50/50 to-orange-50/50 group">
           <p className="text-[10px] font-bold text-red-800 uppercase tracking-widest mb-2 flex items-center gap-1"><TrendingDown className="w-3 h-3 group-hover:scale-110 transition-transform"/> 30-Day Forecast</p>
           <p className="text-xs font-bold text-red-900 leading-tight italic line-clamp-3">
              {data?.forecast_summary || (loading ? "Generating forecast..." : "No forecast available.")}
           </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Left Col: At Risk Students Matrix */}
         <div className="lg:col-span-2 bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-border bg-slate-50 flex items-center justify-between">
               <h3 className="text-base font-bold text-foreground flex items-center gap-2"><AlertCircle className="w-5 h-5 text-red-500"/> Multi-Factor At-Risk Interventions</h3>
            </div>
            {data?.at_risk_students && data.at_risk_students.length > 0 ? (
               <div className="divide-y divide-border">
                  {data.at_risk_students.map((student, idx) => (
                     <div key={idx} className="p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                           <div className="flex items-center gap-3 mb-2.5">
                              <h4 className="text-sm font-bold text-slate-800">{student.student}</h4>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${student.risk_level.toLowerCase() === 'critical' ? 'bg-red-500 text-white border-red-600' : 'bg-amber-400 text-amber-900 border-amber-500'}`}>
                                 {student.risk_level}
                              </span>
                           </div>
                           <div className="flex flex-wrap gap-2">
                              {student.factors.map((f, i) => (
                                 <span key={i} className="px-2 py-1 bg-white text-slate-600 text-[10px] font-bold rounded border border-slate-200 shadow-sm">{f}</span>
                              ))}
                           </div>
                        </div>
                        <button className="text-xs font-bold bg-[#1e3a8a] text-white px-5 py-2.5 flex items-center justify-center rounded-xl hover:bg-[#1e4fc0] shadow-md shrink-0 transition-colors">Intervene Now</button>
                     </div>
                  ))}
               </div>
            ) : (
               <div className="py-16 text-center text-slate-400 font-medium italic text-sm flex flex-col items-center">
                  <Activity className="w-10 h-10 text-slate-200 mb-3" />
                  {loading ? "Analyzing multi-factor student matrices..." : "No at-risk students identified."}
               </div>
            )}
         </div>

         {/* Right Col: Chronic Absentees & Attendance Risks */}
         <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
               <div className="px-5 py-4 border-b border-border bg-amber-50 text-amber-900 font-bold text-sm flex items-center gap-2">
                  <UserX className="w-4 h-4 text-amber-700"/> Chronic Absentees List
               </div>
               <div className="divide-y divide-border">
                  {data?.chronic_absentees?.map((c, i) => (
                     <div key={i} className="p-5 bg-white hover:bg-amber-50/30 transition-colors">
                        <p className="text-sm font-bold text-slate-800 mb-1">{c.student}</p>
                        <p className="text-xs text-slate-500 font-medium leading-tight">{c.reason}</p>
                     </div>
                  ))}
                  {!loading && (!data?.chronic_absentees || data.chronic_absentees.length === 0) && (
                     <div className="p-8 text-center text-xs text-slate-400 italic font-medium">No chronic patterns detected</div>
                  )}
               </div>
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
               <div className="px-5 py-4 border-b border-border bg-orange-50 text-orange-900 font-bold text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-700"/> Continuous Warning Log
               </div>
               <div className="divide-y divide-border">
                  {data?.attendance_risk?.map((a, i) => (
                     <div key={i} className="p-5 bg-white hover:bg-orange-50/30 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                           <p className="text-sm font-bold text-slate-800">{a.student}</p>
                           <span className="text-[10px] font-black text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded leading-none">{a.risk_level}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium leading-tight">{a.reason}</p>
                     </div>
                  ))}
                  {!loading && (!data?.attendance_risk || data.attendance_risk.length === 0) && (
                     <div className="p-8 text-center text-xs text-slate-400 italic font-medium">All attendance nominal</div>
                  )}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};
export default RiskStudents;
