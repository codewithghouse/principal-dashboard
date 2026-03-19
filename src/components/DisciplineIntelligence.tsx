import React, { useState, useEffect } from "react";
import { Link, Fingerprint, Activity, Loader2, Sparkles, AlertCircle, ShieldAlert } from "lucide-react";
import { AIController } from "@/ai/controller/ai-controller";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, limit } from "firebase/firestore";

interface DisciplineData {
  behavioral_patterns: { student: string; pattern_detected: string; severity: string }[];
  related_incidents: { cluster_name: string; linked_cases: number; common_factor: string }[];
  intervention_suggestions: { action: string; target_group: string; priority: string }[];
}

const DisciplineIntelligence = () => {
  const [data, setData] = useState<DisciplineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchDisciplineData = async () => {
      try {
        const snap = await getDocs(query(collection(db, "incidents"), limit(5)));
        const dataExists = !snap.empty;

        const mockInput = dataExists ? {
           logs: [
             { student: "Zaid", type: "Bullying", severity: "High", date: "2023-10-12", location: "Playground" },
             { student: "Zaid", type: "Insubordination", severity: "Medium", date: "2023-10-15", location: "Classroom" },
             { student: "Ali", type: "Vandalism", severity: "Medium", date: "2023-10-18", location: "Playground" }
           ],
           historical_incidents_count: 14
        } : null;

        const result = await AIController.getDisciplineInsights(mockInput);

        if (result.status === "no_data") {
           setPlaceholderMessage(result.message);
        } else if (result.status === "success" && result.data) {
           setData(result.data);
           setPlaceholderMessage(null);
        } else {
           setPlaceholderMessage(result.message || "An error occurred.");
        }
      } catch (err) {
        console.error("Discipline Intelligence API failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDisciplineData();
  }, []);

  if (!loading && placeholderMessage) {
    return (
       <div className="bg-card border border-border shadow-sm rounded-2xl p-10 flex flex-col items-center justify-center text-center w-full my-6 relative overflow-hidden group">
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-red-50 rounded-full blur-3xl opacity-50 block"></div>
          <AlertCircle className="w-12 h-12 text-slate-300 mb-4 animate-pulse duration-1000 relative z-10" />
          <p className="text-base font-bold text-slate-600 max-w-md relative z-10">{placeholderMessage}</p>
       </div>
    );
  }

  const getSeverityColor = (sev: string) => {
     let s = sev.toLowerCase();
     if (s === 'critical') return "bg-red-500 text-white border-red-600";
     if (s === 'high') return "bg-red-100 text-red-700 border-red-200";
     if (s === 'medium') return "bg-amber-100 text-amber-700 border-amber-200";
     return "bg-slate-100 text-slate-700 border-slate-200";
  };

  return (
    <div className="my-8 animate-in fade-in zoom-in-95 duration-500">
       <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-red-500" /> Behavioral & Incident AI Engine
            </h2>
            <p className="text-xs font-semibold text-muted-foreground mt-1">AI-powered tracking for student behavior and clustered incident detection.</p>
          </div>
          {loading && <Loader2 className="w-5 h-5 animate-spin text-red-500" />}
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* Behavioral Pattern Analytics */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
             <div className="px-5 py-4 border-b border-border bg-slate-50 flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-slate-700"/>
                <h3 className="text-sm font-bold text-slate-800">Behavioral Pattern Analytics</h3>
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? ( <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Analyzing student patterns...</div> ) : (
                   data?.behavioral_patterns?.map((m, i) => (
                      <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors">
                         <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                            <p className="text-sm font-bold text-slate-800">{m.student}</p>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border shadow-sm ${getSeverityColor(m.severity)}`}>{m.severity} RISK</span>
                         </div>
                         <p className="text-sm font-medium text-slate-600">"{m.pattern_detected}"</p>
                      </div>
                   ))
                )}
             </div>
          </div>

          {/* Related Incident Linking */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
             <div className="px-5 py-4 border-b border-border bg-slate-50 flex items-center gap-2">
                <Link className="w-4 h-4 text-slate-700"/>
                <h3 className="text-sm font-bold text-slate-800">Related Incident Linking</h3>
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? ( <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Clustering events...</div> ) : (
                   data?.related_incidents?.map((r, i) => (
                      <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors">
                         <div className="flex items-center gap-2 mb-2">
                             <ShieldAlert className="w-4 h-4 text-red-400"/>
                             <p className="text-sm font-bold text-slate-800">{r.cluster_name}</p>
                             <span className="text-[10px] bg-red-50 text-red-700 font-black px-2 py-0.5 rounded ml-auto">{r.linked_cases} Cases Linked</span>
                         </div>
                         <p className="text-sm font-semibold text-slate-600 leading-snug italic border-l-2 border-red-200 pl-3 mt-3">Root Cause: {r.common_factor}</p>
                      </div>
                   ))
                )}
             </div>
          </div>
       </div>

       {/* Interventions Matrix */}
       <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
          <div className="px-5 py-4 border-b border-border bg-blue-50 flex items-center gap-2">
             <Activity className="w-4 h-4 text-blue-700"/>
             <h3 className="text-sm font-bold text-blue-900">Recommended Disciplinary Interventions</h3>
          </div>
          <div className="divide-y divide-border flex-1 bg-white">
             {loading ? ( <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Formulating interventions...</div> ) : (
                data?.intervention_suggestions?.map((c, i) => (
                   <div key={i} className="p-5 hover:bg-blue-50/30 transition-colors flex items-start gap-4 justify-between">
                      <div>
                         <p className="text-sm font-bold text-slate-800 mb-1">{c.action}</p>
                         <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Targeting: {c.target_group}</p>
                      </div>
                      <span className={`px-2.5 py-1 text-[10px] font-black tracking-widest uppercase rounded border ${c.priority.toLowerCase() === 'high' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                         {c.priority} Priority
                      </span>
                   </div>
                ))
             )}
          </div>
       </div>

    </div>
  );
};
export default DisciplineIntelligence;
