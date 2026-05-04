import React, { useState, useEffect } from "react";
import { Lightbulb, Target, BookOpen, UserCheck, Loader2, Sparkles, Activity } from "lucide-react";
import { AIController } from "@/ai/controller/ai-controller";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

interface RecommendationData {
  improvement_recommendations: { subject: string; recommendation: string }[];
  teacher_effectiveness: { teacher: string; effectiveness_score: number; evaluation: string }[];
  matched_templates: { type: string; trigger: string }[];
}

/**
 * Normalize a score doc to a 0–100 percentage. Returns `null` when the doc
 * has no usable score — caller MUST treat null as "no data" (skip), not as
 * zero. Defaulting missing scores to 0 silently inflates the at-risk count
 * and tanks every subject average.
 */
const pctOfDoc = (d: any): number | null => {
  const numOf = (v: any): number => {
    if (v === null || v === undefined || v === "") return NaN;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : NaN;
  };
  const direct = numOf(d?.percentage);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(100, direct));
  const raw = [d?.score, d?.marks, d?.obtainedMarks, d?.marksObtained]
    .map(numOf).find(Number.isFinite);
  const max = [d?.maxScore, d?.totalMarks, d?.maxMarks, d?.outOf]
    .map(numOf).find(Number.isFinite);
  if (Number.isFinite(raw) && Number.isFinite(max) && (max as number) > 0) {
    return Math.max(0, Math.min(100, (raw as number) / (max as number) * 100));
  }
  if (Number.isFinite(raw) && (raw as number) >= 0 && (raw as number) <= 100) return raw as number;
  return null;
};

const Recommendations = () => {
  const { userData } = useAuth();
  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);

  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) return;

    const fetchRecommendations = async () => {
      try {
        const constraints: any[] = [where("schoolId", "==", schoolId)];
        if (branchId) constraints.push(where("branchId", "==", branchId));

        // Read from ALL three score collections — the previous version
        // only read `results`, which silently missed schools using the
        // Excel-ingest pipeline (test_scores + gradebook_scores). Drop the
        // 500-row cap too: the cap silently truncated larger schools and
        // gave them recommendations based on whichever 500 docs Firestore
        // returned (effectively random-order without an `orderBy`).
        const [resultsSnap, testSnap, gradebookSnap] = await Promise.all([
          getDocs(query(collection(db, "results"),          ...constraints)),
          getDocs(query(collection(db, "test_scores"),      ...constraints)),
          getDocs(query(collection(db, "gradebook_scores"), ...constraints)),
        ]);
        const results = [
          ...resultsSnap.docs.map(d => d.data() as any),
          ...testSnap.docs.map(d => d.data() as any),
          ...gradebookSnap.docs.map(d => d.data() as any),
        ];

        if (results.length === 0) {
          const result = await AIController.getRecommendations(null);
          if (result.status === "no_data") setPlaceholderMessage(result.message);
          else setPlaceholderMessage(result.message || "No data available.");
          setLoading(false);
          return;
        }

        // Aggregate subject performance — keyed by ID where available so two
        // teachers named "Sara" don't collapse into one row.
        const subjMap: Record<string, number[]> = {};
        const teacherMap: Record<string, { id: string; displayName: string; subject: string; scores: number[] }> = {};
        const studentScores: Record<string, number[]> = {};
        const gradeCounts: Record<string, number> = {};

        results.forEach(r => {
          const pct = pctOfDoc(r);
          if (pct === null) return; // no usable score → skip, don't 0-default

          const subject = r.subject || r.subjectName || "General";
          if (!subjMap[subject]) subjMap[subject] = [];
          subjMap[subject].push(pct);

          // Teacher key prefers ID (stable) over name (collidable).
          const tId = r.teacherId || r.teacherEmail || r.teacherName;
          if (tId) {
            const key = String(tId);
            if (!teacherMap[key]) {
              teacherMap[key] = {
                id: key,
                displayName: r.teacherName || r.teacherEmail || key,
                subject,
                scores: [],
              };
            }
            teacherMap[key].scores.push(pct);
          }

          const sid = r.studentId || r.studentEmail;
          if (sid) {
            const skey = String(sid);
            if (!studentScores[skey]) studentScores[skey] = [];
            studentScores[skey].push(pct);
          }

          // Pick the most-frequent grade as "primary" rather than the first
          // one we happened to encounter. For multi-grade branches the first
          // doc's grade was arbitrary noise.
          const grade = r.grade || r.className;
          if (grade) gradeCounts[String(grade)] = (gradeCounts[String(grade)] || 0) + 1;
        });

        const subject_performance = Object.entries(subjMap).map(([subject, scores]) => {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const recent = scores.slice(-Math.max(5, Math.floor(scores.length / 3)));
          const earlier = scores.slice(0, Math.max(5, Math.floor(scores.length / 3)));
          const recentAvg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
          const earlierAvg = earlier.reduce((a, b) => a + b, 0) / (earlier.length || 1);
          const trend = recentAvg > earlierAvg + 2 ? "improving" : recentAvg < earlierAvg - 2 ? "declining" : "stable";
          return { subject, average_score: Math.round(avg), trend };
        });

        const teacher_stats = Object.values(teacherMap).map(v => ({
          teacher: v.displayName,
          subject: v.subject,
          class_average: Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
        }));

        // Require at least 2 scores before counting a student as at-risk —
        // a single bad test shouldn't permanently brand them. Combined with
        // the no-zero-default fix above, this gives a defensible at-risk count.
        const risk_students = Object.values(studentScores).filter(scores => {
          if (scores.length < 2) return false;
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          return avg < 50;
        }).length;

        const primaryGrade = Object.entries(gradeCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || "All";

        const aiInput = {
          grade: primaryGrade,
          subject_performance,
          teacher_stats,
          risk_students,
        };

        const result = await AIController.getRecommendations(aiInput);

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
  }, [userData?.schoolId, userData?.branchId]);

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
