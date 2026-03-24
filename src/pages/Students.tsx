import { useState, useEffect } from "react";
import { Search, Download, Plus, MapPin, GraduationCap, User, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import StudentProfile from "@/components/StudentProfile";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, getDocs, doc, getDoc } from "firebase/firestore";
import { sendEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";

const Students = () => {
  const { userData } = useAuth();
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.schoolId) return;

    setLoading(true);
    const schoolId = userData?.schoolId || userData?.school || "";
    const branch   = userData?.branch   || userData?.branchName || "";

    const constraints = [where("schoolId", "==", schoolId)];
    if (branch) constraints.push(where("branch", "==", branch));

    const q = query(collection(db, "students"), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const students = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          initials: data.name ? data.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : "S",
          gender: data.gender || "Not Specified",
          contact: data.phone || data.parentEmail || data.email,
          attendance: data.attendance || "95%",
          status: data.status || "Active",
          risk: data.risk || false,
          grade: "Evaluating...",
          teacherNames: "Checking Registry...",
          branch: data.branch || branch || "Main"
        };
      });
      setStudentsData(students);
      setLoading(false);

      // Deep Audit for Enrollments per Student
      students.forEach(async (s) => {
          try {
              const enrollQ = query(collection(db, "enrollments"), where("studentId", "==", s.id));
              const enrollSnap = await getDocs(enrollQ);
              const enrollments = enrollSnap.docs.map(d => d.data());
              
              if (enrollments.length > 0) {
                  const uniqueGrades = Array.from(new Set(enrollments.map(e => e.className || e.grade))).filter(g => !!g).join(", ") || "General";
                  const teacherIds = Array.from(new Set(enrollments.map(e => e.teacherId))).filter(id => !!id);
                  const names: string[] = [];
                  for(const tId of teacherIds) {
                      const tDoc = await getDoc(doc(db, "teachers", tId));
                      if (tDoc.exists()) names.push(tDoc.data().name);
                  }
                  
                  setStudentsData(prev => prev.map(item => item.id === s.id ? {
                      ...item, 
                      grade: uniqueGrades,
                      teacherNames: names.join(", ") || "Unassigned"
                   } : item));
              } else {
                  setStudentsData(prev => prev.map(item => item.id === s.id ? {
                      ...item, 
                      grade: "Roster Static",
                      teacherNames: "No Assignments"
                  } : item));
              }
          } catch (e) { console.error(e); }
      });

    }, (error) => {
      console.error("Error fetching students:", error);
      toast.error("Failed to load students data");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userData]);

  const filteredStudents = studentsData.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.teacherNames && s.teacherNames.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (s.grade && s.grade.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (selectedStudent) {
    return <StudentProfile student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-left">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Student Directory</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1e3a8a]"/> Real-time Enrollment Audit Engine
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 border border-indigo-100 rounded-[1.5rem] px-8 py-3 flex flex-col items-center shadow-sm">
             <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Total Scholars</span>
             <span className="text-2xl font-black text-slate-900 leading-none">{studentsData.length}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative max-w-xl flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            className="w-full pl-12 pr-6 py-4 text-sm font-bold border border-slate-100 rounded-2xl bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all border-none" 
            placeholder="Search by name, grade, or faculty..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-100 hover:bg-slate-50 transition-all shadow-sm">
          <Download className="w-4 h-4 text-indigo-600" /> Export Registry
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border-2 border-slate-50 overflow-hidden shadow-sm">
        <div className="overflow-x-auto text-left">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b-2 border-slate-50">
                <th className="px-8 py-6 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Scholar Details</th>
                <th className="px-8 py-6 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Campus Branch</th>
                <th className="px-8 py-6 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Institutional Grade</th>
                <th className="px-8 py-6 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Assigned Faculty</th>
                <th className="px-8 py-6 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] text-center">Attendance</th>
                <th className="px-8 py-6 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] text-center">Identity</th>
                <th className="px-8 py-6 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                  <tr>
                      <td colSpan={7} className="py-20 text-center">
                          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auditing Registry...</p>
                      </td>
                  </tr>
              ) : filteredStudents.length > 0 ? (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600 shadow-sm border border-indigo-100 group-hover:scale-110 transition-transform`}>
                          {s.initials}
                        </div>
                        <div className="text-left">
                          <p className="font-black text-slate-800 leading-tight text-base truncate max-w-[150px] uppercase font-bold italic">{s.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-wider">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                       <span className="flex items-center gap-2 text-slate-500 font-black uppercase text-[10px] tracking-widest">
                          <MapPin className="w-3.5 h-3.5 text-rose-400" /> {s.branch || 'Main Campus'}
                       </span>
                    </td>
                    <td className="px-8 py-5">
                       <span className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/10">
                          {s.grade}
                       </span>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex items-center gap-2">
                           <User className="w-4 h-4 text-emerald-500" />
                           <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest max-w-[150px] truncate">
                                {s.teacherNames}
                           </span>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">{s.attendance}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-sm border ${
                        s.status === "Active" ? "bg-green-50 text-green-600 border-green-100" : "bg-blue-50 text-blue-600 border-blue-100"
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => setSelectedStudent(s)}
                        className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95"
                      >
                        Profile
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-8 py-32 text-center opacity-40">
                    <User className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Institutional Roster Empty</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Students;
