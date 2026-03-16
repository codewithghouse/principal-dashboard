import { useState, useEffect } from "react";
import { Search, Download, Plus } from "lucide-react";
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
import { collection, addDoc, serverTimestamp, query, where, onSnapshot } from "firebase/firestore";
import { sendEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";
import { Loader2 } from "lucide-react";

const statusColor = (s: string) => {
  if (s === "Excellent") return "text-success font-medium";
  if (s === "At Risk") return "text-destructive font-medium";
  if (s === "Average") return "text-warning font-medium";
  return "text-foreground";
};

const Students = () => {
  const { userData } = useAuth();
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!userData?.schoolId) return;

    const q = query(
      collection(db, "students"), 
      where("schoolId", "==", userData.schoolId)
    );

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
          teacherName: data.teacherName || "Not Assigned",
          branch: data.branch || "Main"
        };
      });
      setStudentsData(students);
    }, (error) => {
      console.error("Error fetching students:", error);
      toast.error("Failed to load students data");
    });

    return () => unsubscribe();
  }, [userData?.schoolId]);

  const filteredStudents = studentsData.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.teacherName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (selectedStudent) {
    return <StudentProfile student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Students Directory</h1>
          <p className="text-sm font-medium text-muted-foreground mt-1">
            Real-time roster of all students across {userData?.schoolName || 'the school'}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-primary/5 border border-primary/10 rounded-2xl px-4 py-2 flex flex-col items-end">
             <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total Students</span>
             <span className="text-xl font-black text-primary leading-none">{studentsData.length}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            className="w-full pl-11 pr-4 py-3 text-sm border border-border rounded-xl bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
            placeholder="Search by student name, email, or teacher..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-3 text-sm border border-border rounded-xl bg-card hover:bg-secondary transition-all font-bold text-slate-600 shadow-sm">
          <Download className="w-4 h-4" /> Export Report
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50/50">
                <th className="text-left px-6 py-5 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Student Details</th>
                <th className="text-left px-6 py-5 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Branch</th>
                <th className="text-left px-6 py-5 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Grade & Teacher</th>
                <th className="text-left px-6 py-5 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Contact</th>
                <th className="text-center px-6 py-5 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Attendance</th>
                <th className="text-center px-6 py-5 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Status</th>
                <th className="text-center px-6 py-5 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-slate-700">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shadow-sm border border-primary/5">
                          {s.initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{s.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 italic font-bold text-slate-500">
                      {s.branch || userData?.branch || 'Main'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-[#1e3a8a]">{s.grade} {s.section ? `- ${s.section}` : ''}</span>
                        <span className="text-[11px] text-slate-400 font-bold uppercase mt-1">
                          Teacher: {s.teacherName || 'Not Assigned'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-bold text-xs truncate max-w-[150px]">{s.contact || 'N/A'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-black text-edu-green">{s.attendance}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        s.status === "Active" ? "bg-green-50 text-green-600 border border-green-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => setSelectedStudent(s)}
                        className="bg-slate-100 hover:bg-primary hover:text-white text-slate-600 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all"
                      >
                        Profile
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-slate-200" />
                      </div>
                      <p className="text-xl font-bold text-slate-900">No students found</p>
                      <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Directory is empty</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-8 py-5 border-t border-border bg-slate-50/30 text-xs font-bold text-slate-400">
          <span className="uppercase tracking-widest">Showing {filteredStudents.length} Students</span>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 rounded-xl border border-border hover:bg-white transition-all disabled:opacity-50">Previous</button>
            <button className="px-4 py-2 rounded-xl bg-primary text-white shadow-md">1</button>
            <button className="px-4 py-2 rounded-xl border border-border hover:bg-white transition-all">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Students;

