import React, { useState, useEffect } from "react";
import { Lightbulb, Target, BookOpen, UserCheck, Loader2, Sparkles, Activity } from "lucide-react";
import { AIController } from "@/ai/controller/ai-controller";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, limit } from "firebase/firestore";

interface RecommendationData {
  improvement_recommendations: { subject: string; recommendation: string }[];
  teacher_effectiveness: { teacher: string; effectiveness_score: number; evaluation: string }[];
  matched_templates: { type: string; trigger: string }[];
}

const Recommendations = () => {
  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const snap = await getDocs(query(collection(db, "exam_results"), limit(5)));
        const dataExists = !snap.empty;

        // Structured Input Format strictly mimicking the prompt's request requirements
        const mockInput = dataExists ? {
           grade: "10",
           subject_performance: [
             { subject: "Mathematics", average_score: 61, trend: "declining", weak_topics: ["Geometry", "Trigonometry"] },
             { subject: "English", average_score: 74, trend: "stable" }
           ],
           teacher_stats: [
             { teacher: "Mr. Khan", subject: "Mathematics", class_average: 61 },
             { teacher: "Ms. Sara", subject: "English", class_average: 74 }
           ],
           risk_students: 4
        } : null;

        const result = await AIController.getRecommendations(mockInput);

        if (result.status === "no_data") {
           setPlaceholderMessage(result.message);
        } else if (result.status === "success" && result.data) {
           setData(result.data);
           setPlaceholderMessage(null);
        } else {
           setPlaceholderMessage(result.message || "An error occurred.");
        }
      } catch (err) {
        console.error("AI Controller Recommendation Request Failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendations();
  }, []);

  if (!loading && placeholderMessage) {
    return (
       <div className="bg-card border border-border shadow-sm rounded-2xl p-10 flex flex-col items-center justify-center text-center w-full mt-6 relative overflow-hidden group">
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-50 rounded-full blur-3xl opacity-50 block"></div>
          <Lightbulb className="w-12 h-12 text-slate-300 mb-4 animate-pulse duration-1000 relative z-10" />
          <p className="text-base font-bold text-slate-600 max-w-md relative z-10">{placeholderMessage}</p>
       </div>
    );
  }

  return (
    <div className="mt-8 animate-in fade-in zoom-in-95 duration-500">
       <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-indigo-500" /> AI Action Recommendations
            </h2>
            <p className="text-xs font-semibold text-muted-foreground mt-1">Intelligent insights for actionable school improvement.</p>
          </div>
          {loading && <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />}
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          
          {/* Action Recommendation Cards */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
             <div className="px-5 py-4 border-b border-border bg-blue-50 text-blue-900 font-bold text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-600"/> Improvement Recommendations
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? (
                   <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Analyzing gaps...</div>
                ) : (
                   data?.improvement_recommendations?.map((item, i) => (
                      <div key={i} className="p-5 hover:bg-blue-50/30 transition-colors">
                         <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="w-4 h-4 text-slate-400" />
                            <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{item.subject}</p>
                         </div>
                         <p className="text-sm font-medium text-slate-700 leading-relaxed">{item.recommendation}</p>
                      </div>
                   ))
                )}
             </div>
          </div>

          {/* Teacher Effectiveness Scoring */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
             <div className="px-5 py-4 border-b border-border bg-emerald-50 text-emerald-900 font-bold text-sm flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600"/> Teacher Effectiveness Matrix
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? (
                   <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Evaluating staff...</div>
                ) : (
                   data?.teacher_effectiveness?.map((item, i) => (
                      <div key={i} className="p-5 hover:bg-emerald-50/30 transition-colors">
                         <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-bold text-slate-800">{item.teacher}</p>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${item.effectiveness_score >= 80 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
                               Score: {item.effectiveness_score}/100
                            </span>
                         </div>
                         <p className="text-xs font-semibold text-slate-500 italic">Conclusion: {item.evaluation}</p>
                      </div>
                   ))
                )}
             </div>
          </div>

          {/* Suggested Templates Matching */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
             <div className="px-5 py-4 border-b border-border bg-purple-50 text-purple-900 font-bold text-sm flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-purple-600"/> Intervention Matcher
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? (
                   <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Matching scenarios...</div>
                ) : (
                   data?.matched_templates?.map((item, i) => (
                      <div key={i} className="p-5 hover:bg-purple-50/30 transition-colors">
                         <span className="inline-block mb-2 px-2.5 py-1 bg-purple-100 text-purple-800 text-[10px] font-extrabold uppercase rounded shadow-sm border border-purple-200">
                            {item.type}
                         </span>
                         <div className="flex items-start gap-2">
                            <Activity className="w-3.5 h-3.5 text-slate-400 mt-1 shrink-0" />
                            <p className="text-xs font-medium text-slate-600 leading-snug">Triggered by: {item.trigger}</p>
                         </div>
                      </div>
                   ))
                )}
             </div>
          </div>

       </div>
    </div>
  );
};
export default Recommendations;
