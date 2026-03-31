import { useState, useEffect } from "react";
import { Search, Download, Plus, MapPin, GraduationCap, User, Loader2, Sparkles, ShieldCheck, Hash } from "lucide-react";
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
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, getDocs, doc, getDoc, limit } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

const Students = () => {
  const { userData } = useAuth();
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: "", rollNumber: "", classId: "", section: "", email: "" });

  useEffect(() => {
    // ── STEP 1: RESOLVE CONTEXT ──
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID || userData?.school_id;
    const branch = userData?.branch || userData?.branchName || "";

    if (!schoolId) {
      console.warn("[STUDENTS] Waiting for school context in userData...", userData);
      return;
    }

    setLoading(true);
    console.log(`[STUDENTS] Hybrid SYNC started for ${schoolId} (Branch: ${branch || 'Base'})`);

    // ── STEP 2: HYBRID FEDERATED FETCH ──
    // We fetch from both 'students' and 'enrollments' to ensure we capture all data in the DB
    const qStudents = query(collection(db, "students"), where("schoolId", "==", schoolId));
    const qEnrollments = query(collection(db, "enrollments"), where("schoolId", "==", schoolId));

    const processResults = async (sSnap: any, eSnap: any) => {
        let masterMap = new Map();

        // A. Process Master Registry
        sSnap?.docs?.forEach((d: any) => {
            const data = d.data();
            masterMap.set(d.id, { id: d.id, source: 'students', ...data });
        });

        // B. Process Enrollment Registry (Fallback/Supplementary)
        eSnap?.docs?.forEach((d: any) => {
            const data = d.data();
            const sId = data.studentId || d.id;
            if (!masterMap.has(sId)) {
                masterMap.set(sId, { 
                    id: sId, 
                    source: 'enrollments',
                    name: data.studentName || data.name,
                    rollNumber: data.rollNumber || data.rollNo || data.roll || "N/A",
                    classId: data.classId || "Unassigned",
                    ...data 
                });
            }
        });

        let studentsList = Array.from(masterMap.values());
        console.log(`[STUDENTS] Merged registry created: ${studentsList.length} unique scholars found.`);

        // ── STEP 3: Fallback Logic if School Field is named 'school' ──
        if (studentsList.length === 0) {
            console.warn("[STUDENTS] Double registry empty. Trying 'school' field fallback...");
            const f1 = await getDocs(query(collection(db, "students"), where("school", "==", schoolId)));
            const f2 = await getDocs(query(collection(db, "enrollments"), where("school", "==", schoolId)));
            f1.docs.forEach(d => masterMap.set(d.id, { id: d.id, ...d.data() }));
            f2.docs.forEach(d => {
                const data = d.data();
                const sId = data.studentId || d.id;
                if (!masterMap.has(sId)) masterMap.set(sId, { id: sId, name: data.studentName, ...data });
            });
            studentsList = Array.from(masterMap.values());
        }

        // ── STEP 4: Branch Isolation ──
        if (branch && studentsList.length > 0) {
            console.log(`[STUDENTS] Isolated Branch Audit: "${branch}"`);
            const filtered = studentsList.filter((s: any) => {
                const sBranch = (s.branch || s.branchName || s.campus || "").toString().toLowerCase();
                return sBranch.includes(branch.toLowerCase()) || branch.toLowerCase().includes(sBranch);
            });

            if (filtered.length === 0) {
                const distinct = Array.from(new Set(studentsList.map(s => s.branch || s.branchName || s.campus || "N/A")));
                console.error(`[STUDENTS] Branch Mismatch! Principal Branch: "${branch}". Documents in DB use: ${distinct.join(", ")}`);
                // Final Last Ditch: Show everything if we have data for the school but nothing for the branch
                // (This helps the user see that the data exists and just the field is wrong)
            }
            studentsList = filtered;
        }

        const mapped = studentsList.map((data: any) => ({
            id: data.id,
            ...data,
            name: data.name || data.studentName || "Unknown",
            rollNumber: data.rollNumber || data.rollNo || data.roll || "N/A",
            classId: data.classId || data.grade || "Unassigned",
            section: data.section || "",
            initials: (data.name || data.studentName || "S").split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2),
            status: data.status || "Active",
            attendance: "...", 
            faculty: "Loading..."
        }));

        setStudentsData(mapped);
        setLoading(false);

        // Async Audits
        mapped.forEach(async (s) => {
            try {
                const taSnap = await getDocs(query(collection(db, "teaching_assignments"), where("classId", "==", s.classId)));
                const names = Array.from(new Set(taSnap.docs.map(d => d.data().teacherName || d.data().teacherId))).filter(Boolean);
                
                const attSnap = await getDocs(query(collection(db, "attendance"), where("studentId", "==", s.id)));
                let attStr = "0%";
                if (!attSnap.empty) {
                    const pres = attSnap.docs.filter(d => d.data().status === 'present').length;
                    attStr = `${Math.round((pres / attSnap.size) * 100)}%`;
                }
                setStudentsData(prev => prev.map(item => item.id === s.id ? { ...item, faculty: names.join(", ") || "Not Assigned", attendance: attStr } : item));
            } catch (e) { console.error(e); }
        });
    };

    // ── STEP 5: Live Listeners ──
    const unsubStudents = onSnapshot(qStudents, (sSnap) => {
        getDocs(qEnrollments).then(eSnap => processResults(sSnap, eSnap));
    });

    return () => unsubStudents();
  }, [userData]);

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.classId) {
      toast.error("Name and Class are required.");
      return;
    }
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID || userData?.school_id;
    const branch = userData?.branch || userData?.branchName || "Main";
    try {
      await addDoc(collection(db, "students"), {
        ...newStudent,
        schoolId,
        branch,
        status: "Active",
        createdAt: serverTimestamp(),
      });
      toast.success("Scholar enrollment successful!");
      setIsAddModalOpen(false);
      setNewStudent({ name: "", rollNumber: "", classId: "", section: "", email: "" });
    } catch (err) {
      toast.error("Connection failure.");
    }
  };

  const filteredStudents = studentsData.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.classId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.rollNumber?.toString().includes(searchTerm)
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
            placeholder="Search roster..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button onClick={() => setIsAddModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-[#1e3a8a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">
            <Plus className="w-4 h-4" /> Add Scholar
          </button>
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-100 transition-all shadow-sm">
            <Download className="w-4 h-4 text-indigo-600" /> Export
          </button>
        </div>
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
                      <td colSpan={7} className="py-24 text-center">
                          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Constructing Federated Roster...</p>
                      </td>
                  </tr>
              ) : filteredStudents.length > 0 ? (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/30 transition-colors group text-left">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600 shadow-sm border border-indigo-100 group-hover:scale-110 transition-transform`}>
                          {s.initials}
                        </div>
                        <div className="text-left">
                          <p className="font-black text-slate-800 leading-tight text-base uppercase italic">{s.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-wider flex items-center gap-1">
                            <Hash className="w-3 h-3"/> Roll: {s.rollNumber}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                       <span className="flex items-center gap-2 text-slate-500 font-black uppercase text-[10px] tracking-widest">
                          <MapPin className="w-3.5 h-3.5 text-rose-400" /> {s.branch || s.branchName || 'Main Campus'}
                       </span>
                    </td>
                    <td className="px-8 py-5">
                       <span className="px-4 py-1.5 bg-[#1e3a8a] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/10">
                          {s.classId} {s.section}
                       </span>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex items-center gap-2">
                           <GraduationCap className="w-4 h-4 text-emerald-500" />
                           <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest max-w-[150px] truncate">
                                {s.faculty}
                           </span>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`text-sm font-black px-3 py-1.5 rounded-xl border ${parseInt(s.attendance) > 85 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-amber-600 bg-amber-50 border-amber-100"}`}>{s.attendance}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-sm border ${s.status === "Active" ? "bg-green-50 text-green-600 border-green-100" : "bg-blue-50 text-blue-600 border-blue-100"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button onClick={() => setSelectedStudent(s)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95">
                        Profile
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-8 py-32 text-center opacity-40">
                    <User className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{searchTerm ? "No Search Results Found" : "No Scholars Found in Registry"}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[2rem] p-8 bg-white">
           <DialogHeader>
              <DialogTitle className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                 <GraduationCap className="w-6 h-6 text-[#1e3a8a]"/> Add New Scholar
              </DialogTitle>
              <DialogDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Institutional Enrollment Registry</DialogDescription>
           </DialogHeader>
           <div className="grid gap-6 py-6 text-left">
              <div className="grid gap-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Full Name</Label>
                 <Input placeholder="e.g. Rahul Sharma" value={newStudent.name} onChange={(e) => setNewStudent({...newStudent, name: e.target.value})} className="rounded-xl border-slate-100 font-bold py-6 px-5 focus:ring-[#1e3a8a]"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Class ID</Label>
                    <Input placeholder="e.g. 10A" value={newStudent.classId} onChange={(e) => setNewStudent({...newStudent, classId: e.target.value})} className="rounded-xl border-slate-100 font-bold py-6 px-5"/>
                 </div>
                 <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Roll Number</Label>
                    <Input placeholder="e.g. 101" value={newStudent.rollNumber} onChange={(e) => setNewStudent({...newStudent, rollNumber: e.target.value})} className="rounded-xl border-slate-100 font-bold py-6 px-5"/>
                 </div>
              </div>
              <div className="grid gap-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Parent Email</Label>
                 <Input placeholder="parent@example.com" value={newStudent.email} onChange={(e) => setNewStudent({...newStudent, email: e.target.value})} className="rounded-xl border-slate-100 font-bold py-6 px-5"/>
              </div>
           </div>
           <DialogFooter className="gap-3 sm:justify-start">
              <button onClick={handleAddStudent} className="flex-1 bg-[#1e3a8a] text-white px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">Add Scholar</button>
              <button onClick={() => setIsAddModalOpen(false)} className="flex-1 bg-slate-50 text-slate-400 px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all border-none shadow-none">Cancel</button>
           </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Students;
