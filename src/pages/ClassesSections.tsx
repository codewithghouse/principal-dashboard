import { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, XCircle, Loader2, Sparkles, LayoutGrid } from "lucide-react";
import ClassPerformance from "@/components/ClassPerformance";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

const statusColor = (s: string) => {
  if (s === "Good") return "text-green-600";
  if (s === "Weak") return "text-rose-600";
  return "text-amber-600";
};

const ClassesSections = () => {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [gradesSummary, setGradesSummary] = useState<any[]>([]);
  const [selectedSection, setSelectedSection] = useState<any | null>(null);

  useEffect(() => {
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID || userData?.school_id;
    const branch = userData?.branch || userData?.branchName || "";

    if (!schoolId) {
      console.warn("[CLASSES] Waiting for valid school context...");
      return;
    }

    setLoading(true);
    const constraints = [where("schoolId", "==", schoolId)];
    if (branch) constraints.push(where("branch", "==", branch));

    const unsub = onSnapshot(query(collection(db, "classes"), ...constraints), async (snap) => {
       const classDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
       
       const enrichedClasses = await Promise.all(classDocs.map(async (c) => {
          const taSnap = await getDocs(query(collection(db, "teaching_assignments"), where("classId", "==", c.id)));
          const assignments = taSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          
          const resultsSnap = await getDocs(query(collection(db, "results"), where("classId", "==", c.id)));
          const attendanceSnap = await getDocs(query(collection(db, "attendance"), where("classId", "==", c.id)));
          
          const avgScore = resultsSnap.empty ? 0 : resultsSnap.docs.reduce((acc, doc) => acc + (parseFloat(doc.data().score) || 0), 0) / resultsSnap.size;
          const attendanceRate = attendanceSnap.empty ? 0 : (attendanceSnap.docs.filter(d => d.data().status === 'present').length / attendanceSnap.size) * 100;

          let status = "Average";
          if (avgScore > 75 && attendanceRate > 90) status = "Good";
          else if (avgScore < 50 || attendanceRate < 70) status = "Weak";

          return {
             ...c,
             assignmentsCount: assignments.length,
             avgMarks: `${Math.round(avgScore)}%`,
             attendance: `${Math.round(attendanceRate)}%`,
             healthScore: Math.round((avgScore + attendanceRate) / 2),
             status,
             icon: status === 'Good' ? CheckCircle : status === 'Weak' ? XCircle : AlertCircle,
             color: status === 'Good' ? 'text-green-600' : status === 'Weak' ? 'text-rose-600' : 'text-amber-600'
          };
       }));

       setClasses(enrichedClasses);

       const grades: Record<string, any> = {};
       enrichedClasses.forEach(c => {
          const g = c.grade || "Ungraded";
          if (!grades[g]) grades[g] = { name: `Grade ${g}`, sections: 0, students: 0, health: 0, count: 0 };
          grades[g].sections++;
          grades[g].students += (parseInt(c.studentCount) || 0);
          grades[g].health += c.healthScore;
          grades[g].count++;
       });

       const finalGrades = Object.values(grades).map((g: any) => ({
          ...g,
          health: `${Math.round(g.health / g.count)}/100`,
          color: (g.health / g.count) > 75 ? "text-green-600" : (g.health / g.count) < 50 ? "text-rose-600" : "text-amber-600",
          icon: (g.health / g.count) > 75 ? CheckCircle : (g.health / g.count) < 50 ? XCircle : AlertCircle
       }));

       setGradesSummary(finalGrades.sort((a,b) => a.name.localeCompare(b.name)));
       setLoading(false);
    });

    return () => unsub();
  }, [userData]);

  if (selectedSection) {
    return <ClassPerformance section={selectedSection} onBack={() => setSelectedSection(null)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
         <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Institutional Architecture</h1>
            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
               <Sparkles className="w-4 h-4 text-[#1e3a8a]"/> Subdivision Performance & Faculty Mapping
            </p>
         </div>
      </div>

      {loading ? (
          <div className="py-24 flex flex-col items-center justify-center bg-white rounded-[3rem] border-2 border-slate-50 shadow-sm text-slate-300">
             <Loader2 className="w-12 h-12 animate-spin mb-4" />
             <p className="text-xs font-black uppercase tracking-widest">Compiling Institutional Metrics...</p>
          </div>
      ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
               {gradesSummary.map((g) => (
               <div key={g.name} className="bg-white rounded-[2rem] border-2 border-slate-50 p-6 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                  <div className="absolute -right-10 -top-10 w-24 h-24 bg-slate-50 rounded-full blur-2xl group-hover:bg-indigo-50 transition-colors"></div>
                  <div className="flex items-center justify-between mb-6 relative z-10">
                     <h3 className="text-lg font-black text-slate-800">{g.name}</h3>
                     <g.icon className={`w-6 h-6 ${g.color} group-hover:scale-125 transition-transform`} />
                  </div>
                  <div className="space-y-3 text-xs font-bold uppercase tracking-widest relative z-10">
                     <div className="flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl border border-slate-50">
                        <span className="text-slate-400">Sections</span>
                        <span className="text-slate-900">{g.sections} Units</span>
                     </div>
                     <div className="flex justify-between items-center bg-slate-50/50 px-3 py-2 rounded-xl border border-slate-50">
                        <span className="text-slate-400">Health</span>
                        <span className={`font-black ${g.color}`}>{g.health}</span>
                     </div>
                  </div>
               </div>
               ))}
            </div>

            <div className="bg-white rounded-[3rem] border-2 border-slate-50 overflow-hidden shadow-sm">
               <div className="px-10 py-8 border-b-2 border-slate-50 bg-slate-50/20 flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">
                     <LayoutGrid className="w-6 h-6 text-[#1e3a8a]"/> Section Deep Audit
                  </h2>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                     <thead>
                     <tr className="bg-slate-50/30">
                        <th className="text-left px-10 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Section Registry</th>
                        <th className="text-left px-10 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Faculty Count</th>
                        <th className="text-center px-10 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Students</th>
                        <th className="text-center px-10 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Avg Marks</th>
                        <th className="text-center px-10 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Attendance</th>
                        <th className="text-left px-10 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Status</th>
                        <th className="text-right px-10 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Actions</th>
                     </tr>
                     </thead>
                     <tbody className="divide-y-2 divide-slate-50">
                     {classes.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                           <td className="px-10 py-6">
                              <div className="flex items-center gap-4">
                                 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg ${
                                    s.status === 'Good' ? 'bg-green-500' : s.status === 'Weak' ? 'bg-rose-500' : 'bg-amber-500'
                                 }`}>{s.name}</div>
                                 <div className="text-left">
                                    <p className="font-black text-slate-800 text-base uppercase leading-none">{s.name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 tracking-wider">Room: {s.room || 'A-101'}</p>
                                 </div>
                              </div>
                           </td>
                           <td className="px-10 py-6 font-bold text-slate-600 text-xs uppercase tracking-widest">
                              <span className="px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">{s.assignmentsCount} Faculty</span>
                           </td>
                           <td className="px-10 py-6 text-center font-black text-slate-900 text-base">{s.studentCount || 0}</td>
                           <td className={`px-10 py-6 text-center font-black text-base ${statusColor(s.status)}`}>{s.avgMarks}</td>
                           <td className={`px-10 py-6 text-center font-black text-base ${statusColor(s.status)}`}>{s.attendance}</td>
                           <td className="px-10 py-6">
                              <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                                 s.status === 'Good' ? 'bg-green-50 text-green-600 border-green-100' : s.status === 'Weak' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                              }`}>{s.status}</span>
                           </td>
                           <td className="px-10 py-6 text-right">
                              <button 
                                 onClick={() => setSelectedSection(s)}
                                 className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95"
                              >
                                 View Metrics
                              </button>
                           </td>
                        </tr>
                     ))}
                     </tbody>
                  </table>
               </div>
            </div>
          </>
      )}
    </div>
  );
};

export default ClassesSections;

