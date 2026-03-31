import React, { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, Activity, Loader2, UserX, TrendingDown, Clock, ShieldAlert, ChevronRight, BellRing } from "lucide-react";
import { AIController } from "@/ai/controller/ai-controller";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where, addDoc, serverTimestamp } from "firebase/firestore";
import RiskIntervention from "@/components/RiskIntervention";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

interface RiskInsights {
  chronic_absentees: { student: string; reason: string }[];
  attendance_risk: { student: string; risk_level: string; reason: string }[];
  forecast_summary: string;
  at_risk_students: { id?: string; student: string; risk_level: string; factors: string[] }[];
}

const RiskStudents = () => {
  const { userData } = useAuth();
  const [data, setData] = useState<RiskInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);

  const handleEscalate = async (student: any) => {
    setEscalatingId(student.student);
    try {
      await addDoc(collection(db, "escalations"), {
        studentName: student.student,
        studentId: student.id || null,
        riskLevel: student.risk_level,
        factors: student.factors,
        schoolId: userData?.schoolId,
        branch: userData?.branch || "",
        escalatedBy: userData?.name || "Principal",
        escalatedAt: serverTimestamp(),
        status: "open",
        note: `Auto-escalated due to ${student.risk_level} risk level. Factors: ${student.factors?.join(", ")}.`
      });
      toast.success(`Escalation raised for ${student.student}. Counselor will be notified.`);
    } catch {
      toast.error("Failed to raise escalation. Try again.");
    } finally {
      setEscalatingId(null);
    }
  };

  useEffect(() => {
    if (!userData?.schoolId) return;

    const fetchRiskData = async () => {
      setLoading(true);
      try {
        // 1. Fetch real students to analyze
        const constraints = [where("schoolId", "==", userData.schoolId)];
        if (userData.branch) constraints.push(where("branch", "==", userData.branch));

        const q = query(collection(db, "students"), ...constraints);
        const snap = await getDocs(q);
        
        if (snap.empty) {
          setPlaceholderMessage("No student data available to analyze risk. Please sync your student records first.");
          setLoading(false);
          return;
        }

        const students = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // 2. Prepare data for AI analysis
        const aiInput = {
          grade: "All",
          students: students.map((s: any) => ({
            id: s.id,
            name: s.name,
            attendance_rate: s.attendance || 0,
            recent_absences: s.recentAbsences || 0,
            average_score: s.score || s.percentage || 0
          })),
          attendance_history: [90, 88, 85, 82, 80], // Aggregate history
          incident_records: 5
        };

        const result = await AIController.getRiskInsights(aiInput);

        if (result.status === "no_data") {
           setPlaceholderMessage(result.message);
        } else if (result.status === "success" && result.data) {
           setData(result.data);
           setPlaceholderMessage(null);
        } else {
           setPlaceholderMessage(result.message || "An error occurred during AI analysis.");
        }
      } catch (err) {
        console.error("AI Controller Failed:", err);
        setPlaceholderMessage("Failed to run AI analysis. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchRiskData();
  }, [userData?.schoolId]);

  if (selectedStudent) {
    return <RiskIntervention student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  if (!loading && placeholderMessage) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Risk Intelligence</h1>
          <p className="text-sm text-slate-500 font-bold">Predictive analytics for student success</p>
        </div>
        <div className="bg-card border-4 border-dashed border-slate-100 rounded-[2.5rem] p-20 flex flex-col items-center justify-center text-center w-full mb-6 relative overflow-hidden">
           <div className="w-24 h-24 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
              <ShieldAlert className="w-12 h-12 text-slate-300 animate-pulse" />
           </div>
           <p className="text-xl font-black text-slate-400 max-w-md uppercase tracking-widest">{placeholderMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Risk Intelligence Command</h1>
          <p className="text-sm text-slate-500 font-bold italic">AI-Powered early detection of academic and attendance decline</p>
        </div>
        {loading && (
          <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
             <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
             <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">AI Scanning...</span>
          </div>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <RiskStatCard title="Total At-Risk" value={data?.at_risk_students?.length || 0} icon={AlertTriangle} bgColor="bg-red-50" textColor="text-red-600" />
        <RiskStatCard title="Chronic Absentees" value={data?.chronic_absentees?.length || 0} icon={UserX} bgColor="bg-amber-50" textColor="text-amber-500" />
        <RiskStatCard title="Attendance Warnings" value={data?.attendance_risk?.length || 0} icon={Clock} bgColor="bg-orange-50" textColor="text-orange-500" />
        
        <div className="bg-[#1e3a8a] p-6 rounded-[2rem] flex flex-col justify-center relative shadow-xl shadow-indigo-100/50">
           <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-3 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-400"/> 30-Day Forecast</p>
           <p className="text-xs font-bold text-white leading-relaxed italic line-clamp-3">
              {data?.forecast_summary || (loading ? "Generating predictive forecast..." : "No forecast available.")}
           </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Left Col: At Risk Students Matrix */}
         <div className="lg:col-span-2 bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm">
            <div className="px-8 py-6 border-b border-border bg-slate-900 text-white flex items-center justify-between">
               <h3 className="text-lg font-black uppercase tracking-widest flex items-center gap-3"><AlertCircle className="w-5 h-5 text-red-500"/> Multi-Factor Interventions</h3>
               <span className="text-[10px] bg-red-500/20 px-3 py-1 rounded-lg border border-red-500/30">Action Required</span>
            </div>
            
            <div className="divide-y divide-slate-100">
              {data?.at_risk_students && data.at_risk_students.length > 0 ? (
                data.at_risk_students.map((student, idx) => (
                  <div key={idx} className="p-8 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6 group">
                    <div className="flex gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black text-lg shadow-lg">
                        {student.student.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                           <h4 className="text-lg font-black text-slate-800">{student.student}</h4>
                           <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${student.risk_level.toLowerCase() === 'critical' ? 'bg-red-500 text-white border-red-600 animate-pulse' : 'bg-amber-400 text-amber-900 border-amber-500'}`}>
                              {student.risk_level}
                           </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                           {student.factors.map((f, i) => (
                              <span key={i} className="px-3 py-1 bg-white text-slate-500 text-[10px] font-black rounded-lg border border-slate-200 shadow-sm uppercase tracking-tighter">{f}</span>
                           ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {student.risk_level?.toLowerCase() === 'critical' && (
                        <button
                          onClick={() => handleEscalate(student)}
                          disabled={escalatingId === student.student}
                          className="text-[10px] font-black uppercase tracking-widest bg-red-500 text-white px-6 py-4 rounded-2xl hover:bg-red-600 shadow-xl shadow-red-100 transition-all flex items-center gap-2 disabled:opacity-60"
                        >
                          {escalatingId === student.student ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                          Escalate
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedStudent({
                          initials: student.student.substring(0, 2).toUpperCase(),
                          name: student.student,
                          grade: "Unknown",
                          roll: "N/A",
                          level: student.risk_level,
                          days: "Auto",
                          id: student.id
                        })}
                        className="text-[10px] font-black uppercase tracking-widest bg-[#1e3a8a] text-white px-8 py-4 rounded-2xl hover:bg-[#1e4fc0] shadow-xl shadow-indigo-100 transition-all flex items-center gap-2 group-hover:translate-x-1"
                      >
                        Intervene <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-32 text-center flex flex-col items-center">
                   <Activity className="w-16 h-16 text-slate-100 mb-4" />
                   <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-300">All student clusters nominal.</p>
                </div>
              )}
            </div>
         </div>

         {/* Right Col: Chronic Absentees & Attendance Risks */}
         <div className="space-y-8">
            <div className="bg-card rounded-[2.5rem] border border-border shadow-sm overflow-hidden bg-gradient-to-b from-white to-slate-50">
               <div className="px-7 py-5 border-b border-border bg-amber-500 text-white font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-lg z-10 relative">
                  <UserX className="w-4 h-4"/> Chronic Attendance Failures
               </div>
               <div className="divide-y divide-slate-200/50">
                  {data?.chronic_absentees?.map((c, i) => (
                     <div key={i} className="p-6 hover:bg-white transition-all group">
                        <p className="text-base font-black text-slate-800 mb-1 group-hover:text-amber-600 transition-colors">{c.student}</p>
                        <p className="text-xs text-slate-500 font-bold leading-relaxed">{c.reason}</p>
                     </div>
                  ))}
                  {!loading && (!data?.chronic_absentees || data.chronic_absentees.length === 0) && (
                     <div className="p-10 text-center text-[10px] text-slate-400 font-black uppercase tracking-widest opacity-50">Stable</div>
                  )}
               </div>
            </div>

            <div className="bg-card rounded-[2.5rem] border border-border shadow-sm overflow-hidden bg-gradient-to-b from-white to-red-50/20">
               <div className="px-7 py-5 border-b border-border bg-slate-900 text-white font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-lg z-10 relative">
                  <Clock className="w-4 h-4 text-orange-400"/> Predictive Warning Log
               </div>
               <div className="divide-y divide-slate-200/50">
                  {data?.attendance_risk?.map((a, i) => (
                     <div key={i} className="p-6 hover:bg-white transition-all">
                        <div className="flex items-center justify-between mb-2">
                           <p className="text-base font-black text-slate-800">{a.student}</p>
                           <span className="text-[9px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-md uppercase tracking-tight">{a.risk_level}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-bold leading-relaxed italic">{a.reason}</p>
                     </div>
                  ))}
                  {!loading && (!data?.attendance_risk || data.attendance_risk.length === 0) && (
                     <div className="p-10 text-center text-[10px] text-slate-400 font-black uppercase tracking-widest opacity-50">Nominal</div>
                  )}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

const RiskStatCard = ({ title, value, icon: Icon, bgColor, textColor }: any) => (
  <div className={`bg-card p-8 rounded-[2rem] border border-border shadow-sm flex items-start justify-between relative overflow-hidden hover:shadow-xl transition-all group`}>
     <div className={`absolute -right-5 -bottom-5 w-24 h-24 ${bgColor} rounded-full opacity-0 group-hover:opacity-40 transition-opacity blur-2xl`}></div>
     <div className="relative z-10">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">{title}</p>
        <h3 className={`text-4xl font-black ${textColor}`}>{value}</h3>
     </div>
     <div className={`p-4 ${bgColor} ${textColor} rounded-2xl shadow-inner relative z-10`}>
        <Icon className="w-6 h-6"/>
     </div>
  </div>
);

export default RiskStudents;
