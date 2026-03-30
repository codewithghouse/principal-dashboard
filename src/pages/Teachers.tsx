import { useState, useEffect, useRef } from "react";
import { BarChart2, CalendarCheck, Star, Users, Search, List, Plus, Upload, Download, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2, GraduationCap, Eye, Trash2, Edit3, Save } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import TeacherProfile from "@/components/TeacherProfile";
import Recommendations from "@/components/Recommendations";
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
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, getDocs, deleteDoc } from "firebase/firestore";
import { sendEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BulkTeacher {
  name: string;
  email: string;
  subject?: string;
  phone?: string;
  experience?: string;
  _status?: "pending" | "success" | "error" | "duplicate";
  _error?: string;
}

const TEMPLATE_DATA = [
  { Name: "Mrs. Kavita Sharma", Email: "kavita@example.com", Subject: "Mathematics", Phone: "9876543210", Experience: "5 years" },
  { Name: "Dr. Rajesh Kumar", Email: "rajesh@example.com", Subject: "Physics", Phone: "9876543211", Experience: "8 years" },
];

const Teachers = () => {
  const { userData } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [teachersData, setTeachersData]       = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [searchQuery, setSearchQuery]         = useState("");
  const [isInviteOpen, setIsInviteOpen]       = useState(false);
  const [isBulkOpen, setIsBulkOpen]           = useState(false);
  const [isRosterOpen, setIsRosterOpen]       = useState(false);
  const [teacherToAssign, setTeacherToAssign] = useState<any | null>(null);
  const [teacherRoster, setTeacherRoster]     = useState<any[]>([]);
  const [loadingRoster, setLoadingRoster]     = useState(false);
  const [isSending, setIsSending]             = useState(false);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Bulk state
  const [bulkData, setBulkData]               = useState<BulkTeacher[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkDone, setBulkDone]               = useState(false);

  const [inviteForm, setInviteForm] = useState({ name: "", email: "", subject: "" });

  // ── Real-time Teachers Fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branch   = userData?.branch   || userData?.branchName;
    
    if (!schoolId) return;
    
    const constraints: any[] = [where("schoolId", "==", schoolId)];
    if (branch) constraints.push(where("branch", "==", branch));

    const q = query(collection(db, "teachers"), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const colors = ["bg-indigo-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-[#1e3a8a]"];
      
      const teachers = snap.docs.map((d, i) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          initials: data.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || "T",
          color: colors[i % colors.length],
          experience: data.experience || "N/A",
          rating: data.rating || "5.0",
          status: data.status || "Active",
          actualClasses: "Fetching..."
        };
      });
      setTeachersData(teachers);
      
      teachers.forEach(async (t) => {
          const classQ = query(collection(db, "classes"), where("teacherId", "==", t.id));
          const classSnap = await getDocs(classQ);
          const classNames = classSnap.docs.map(doc => doc.data().name).join(", ") || "No Classes";
          
          setTeachersData(prev => prev.map(item => item.id === t.id ? {...item, actualClasses: classNames} : item));
      });
    });

    return () => unsub();
  }, [userData]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.name || !inviteForm.email) return;

    setIsSending(true);
    try {
      const emailObj = inviteForm.email.toLowerCase().trim();
      const schoolId = userData?.schoolId || userData?.school || "";
      const branch   = userData?.branch || "";

      // 1. Check for accidental deletions (Archived Faculty)
      const qCheck = query(collection(db, "teachers"), where("email", "==", emailObj), where("schoolId", "==", schoolId));
      const snap = await getDocs(qCheck);

      if (!snap.empty) {
         const existingDoc = snap.docs[0];
         const existingData = existingDoc.data();

         if (existingData.status === "Archived") {
             // Rescue the teacher and restore original ID links!
             await updateDoc(doc(db, "teachers", existingDoc.id), {
                 status: "Invited",
                 name: inviteForm.name,
                 subject: inviteForm.subject || existingData.subject,
                 reactivatedAt: serverTimestamp()
             });

             try {
                await sendEmail({
                  to: emailObj,
                  subject: `Welcome Back to ${userData?.schoolName || "EduIntellect"}`,
                  html: `<p>Hello ${inviteForm.name},</p><p>Your teacher account has been successfully restored. Your historical classes and student rosters remain intact.</p>`
                });
             } catch (emailErr) {
                console.info("Email API bypassed locally during Reactivation.");
             }

             toast.success("Legacy Teacher successfully Restored & Re-invited!");
             setIsInviteOpen(false);
             setInviteForm({ name: "", email: "", subject: "" });
             setIsSending(false);
             return;
         } else {
             // Active or already invited
             toast.error("Faculty member with this email is already active.");
             setIsSending(false);
             return;
         }
      }
      
      // 2. Add New Teacher if completely fresh
      await addDoc(collection(db, "teachers"), {
        ...inviteForm,
        email: emailObj,
        schoolId,
        branch,
        status: "Invited",
        createdAt: serverTimestamp(),
        rating: 5.0,
        experience: "N/A"
      });

      // Localhost environment fallback
      try {
         await sendEmail({
           to: emailObj,
           subject: `Invitation to join ${userData?.schoolName || "EduIntellect"}`,
           html: `<p>Hello ${inviteForm.name},</p><p>You have been invited as a teacher. Please login to the Teacher Portal.</p>`
         });
      } catch (emailErr) {
         console.info("Local Environment: Database Injection successful, but Email API bypassed (Vercel Serverless not active on Localhost).", emailErr);
      }

      toast.success("Teacher Database Injection Successful!");
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", subject: "" });
    } catch (err) {
      console.error(err);
      toast.error("Database connection failed.");
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteTeacher = async (id: string, name: string) => {
      if (!confirm(`Are you sure you want to de-board ${name}? All their institutional records will be archived.`)) return;
      try {
          // Soft-Delete: We archive the teacher instead of destroying the record.
          // This allows them to be seamlessly restored if re-invited using the same email.
          await updateDoc(doc(db, "teachers", id), { 
              status: "Archived",
              archivedAt: serverTimestamp() 
          });
          toast.success("Faculty record archived successfully.");
      } catch (e) {
          toast.error("Failed to archive faculty record.");
      }
  };

  const handleStartEdit = (t: any) => {
      setEditingId(t.id);
      setEditName(t.name);
  };

  const handleSaveName = async (id: string) => {
      if (!editName.trim()) return setEditingId(null);
      try {
          await updateDoc(doc(db, "teachers", id), { name: editName.trim() });
          toast.success("Identity updated.");
          setEditingId(null);
      } catch (e) {
          toast.error("Failed to update identity.");
      }
  };

  const handleOpenRoster = async (teacher: any) => {
    setTeacherToAssign(teacher);
    setIsRosterOpen(true);
    setLoadingRoster(true);
    try {
      const q = query(collection(db, "enrollments"), where("teacherId", "==", teacher.id));
      const snap = await getDocs(q);
      const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTeacherRoster(students);
    } catch (err) {
      toast.error("Failed to fetch roster.");
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const formatted: BulkTeacher[] = data.map(item => ({
        name: item.Name || item.name || "",
        email: (item.Email || item.email || "").toString().toLowerCase().trim(),
        subject: item.Subject || item.subject || "",
        phone: item.Phone || item.phone || "",
        experience: item.Experience || item.experience || "",
        _status: "pending" as const
      })).filter(t => !!t.email);

      setBulkData(formatted);
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkImport = async () => {
    setIsBulkProcessing(true);
    const results = [...bulkData];
    const schoolId = userData?.schoolId || "";
    const branch = userData?.branch || "";

    for (let i = 0; i < results.length; i++) {
      try {
        const t = results[i];
        const q = query(collection(db, "teachers"), where("email", "==", t.email), where("schoolId", "==", schoolId));
        const existing = await getDocs(q);

        if (!existing.empty) {
          results[i]._status = "duplicate" as const;
          continue;
        }

        await addDoc(collection(db, "teachers"), {
          name: t.name,
          email: t.email.toLowerCase(),
          subject: t.subject,
          phone: t.phone,
          experience: t.experience,
          schoolId,
          branch,
          status: "Invited",
          createdAt: serverTimestamp(),
          rating: 5.0
        });

        results[i]._status = "success" as const;
      } catch (err) {
        results[i]._status = "error" as const;
        results[i]._error = String(err);
      }
      setBulkData([...results]);
    }
    setIsBulkProcessing(false);
    setBulkDone(true);
    toast.success("Bulk import process complete");
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TeachersTemplate");
    XLSX.writeFile(wb, "Teacher_Import_Template.xlsx");
  };

  const filtered = teachersData.filter(t => 
    t.status !== "Archived" && (
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Faculty Registry</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#1e3a8a]"/> Academic Command Center
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
           <button onClick={() => setIsBulkOpen(true)} className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-[#1e3a8a]/20 transition-all shadow-sm">
             <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Bulk Import
           </button>
           <button onClick={() => setIsInviteOpen(true)} className="flex items-center gap-2 px-8 py-3 bg-[#1e3a8a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:translate-y-[-2px] transition-all shadow-xl shadow-indigo-500/10">
             <Plus className="w-5 h-5" /> Add Teacher
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
        <StatCard title="Active Faculty" value={teachersData.filter(t => t.status === "Active").length} icon={Users} subtitleColor="success" />
        <StatCard title="Invited" value={teachersData.filter(t => t.status === "Invited").length} icon={CalendarCheck} subtitleColor="muted" />
        <StatCard title="Avg Rating" value="4.8" icon={Star} subtitleColor="warning" />
        <StatCard title="Retention" value="96%" icon={BarChart2} subtitleColor="success" />
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 font-bold" />
        <input
          type="text"
          placeholder="Search by faculty name, subject, or email..."
          className="w-full pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-[1.5rem] text-sm font-bold focus:outline-none focus:ring-4 focus:ring-[#1e3a8a]/5 shadow-sm transition-all border-none"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto rounded-[3rem]">
          <DialogHeader className="p-4">
            <DialogTitle className="text-2xl font-black text-[#1e3a8a]">Institutional Bulk Import</DialogTitle>
            <DialogDescription className="text-slate-400 font-bold italic text-left">
              Upload an Excel (.xlsx) file with Teacher details.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 space-y-6">
            {!bulkDone && (
              <div className="space-y-4 text-center">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-slate-100 rounded-[2.5rem] p-12 text-center hover:border-[#1e3a8a]/20 hover:bg-slate-50 transition-all cursor-pointer group"
                >
                  <Upload className="w-12 h-12 text-slate-200 mx-auto mb-4 group-hover:text-[#1e3a8a] transition-colors" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Click or Drag Excel File</p>
                  <input type="file" hidden ref={fileInputRef} accept=".xlsx, .xls" onChange={handleFileUpload} />
                </div>
                <button onClick={downloadTemplate} className="text-[10px] font-black uppercase text-[#1e3a8a] flex items-center gap-1 mx-auto hover:underline">
                  <Download className="w-3 h-3" /> Download Official Template
                </button>
              </div>
            )}

            {bulkData.length > 0 && (
              <div className="border border-slate-50 rounded-[2rem] overflow-hidden max-h-[300px] overflow-y-auto bg-slate-50/50">
                <div className="p-4 space-y-2">
                  {bulkData.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                      <div className="text-left">
                        <p className="font-extrabold text-slate-800 text-xs">{t.name}</p>
                        <p className="text-[9px] font-bold text-slate-400">{t.email}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${
                        t._status === "success" ? "bg-green-50 text-green-600" : 
                        t._status === "duplicate" ? "bg-amber-50 text-amber-600" :
                        t._status === "error" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                      }`}>
                        {t._status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulkDone && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-green-50 border border-green-100 text-center">
                  <p className="text-2xl font-black text-green-600">{bulkData.filter(t => t._status === "success").length}</p>
                  <p className="text-[10px] font-black uppercase text-green-500">Invited</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                  <p className="text-2xl font-black text-amber-600">{bulkData.filter(t => t._status === "duplicate").length}</p>
                  <p className="text-[10px] font-black uppercase text-amber-500">Duplicates</p>
                </div>
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-center">
                  <p className="text-2xl font-black text-red-600">{bulkData.filter(t => t._status === "error").length}</p>
                  <p className="text-[10px] font-black uppercase text-red-500">Failed</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-6">
            {!bulkDone ? (
              <button
                onClick={handleBulkImport}
                disabled={bulkData.length === 0 || isBulkProcessing}
                className="w-full h-12 rounded-xl bg-[#1e3a8a] text-white font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBulkProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Import & Invite All</>
                )}
              </button>
            ) : (
              <button
                onClick={() => { setIsBulkOpen(false); setBulkDone(false); setBulkData([]); }}
                className="w-full h-12 rounded-xl bg-green-600 text-white font-bold hover:opacity-90 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Done — Close
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-[3rem]">
          <DialogHeader className="p-4 text-left">
            <DialogTitle className="text-xl font-black text-[#1e3a8a]">Invite Faculty</DialogTitle>
            <DialogDescription className="text-slate-400 font-bold italic">
              They will join {userData?.schoolName || 'the institution'}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 p-4 text-left">
            <div className="space-y-2">
              <Label className="uppercase text-[10px] font-black text-slate-400 ml-1">Full Name</Label>
              <Input placeholder="e.g. Mrs. Kavita" className="h-12 rounded-xl font-bold bg-slate-50 border-none"
                value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label className="uppercase text-[10px] font-black text-slate-400 ml-1">Email Address</Label>
              <Input type="email" placeholder="teacher@gmail.com" className="h-12 rounded-xl font-bold bg-slate-50 border-none"
                value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label className="uppercase text-[10px] font-black text-slate-400 ml-1">Primary Subject</Label>
              <Input placeholder="e.g. Mathematics" className="h-12 rounded-xl font-bold bg-slate-50 border-none"
                value={inviteForm.subject} onChange={e => setInviteForm({ ...inviteForm, subject: e.target.value })} />
            </div>
            <button type="submit" disabled={isSending}
              className="w-full h-14 mt-4 rounded-2xl bg-[#1e3a8a] text-white font-black uppercase tracking-widest hover:opacity-90 transition flex items-center justify-center gap-3">
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {isSending ? "Sending Invitation..." : "Confirm Invitation"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto rounded-3xl text-left">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[#1e3a8a] text-left">Class Roster: {teacherToAssign?.name}</DialogTitle>
            <DialogDescription className="text-slate-400 font-bold italic text-left">Active institutional enrollments.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingRoster ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" /></div>
            ) : teacherRoster.length > 0 ? (
              <div className="border border-slate-50 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#1e3a8a] text-white font-bold uppercase text-[9px] tracking-widest">
                    <tr>
                      <th className="px-6 py-5">Student</th>
                      <th className="px-6 py-5">Class</th>
                      <th className="px-6 py-5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {teacherRoster.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{s.studentName}</div>
                          <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">{s.studentEmail}</div>
                        </td>
                        <td className="px-6 py-4 font-black text-[#1e3a8a]">{s.className || 'General'}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest ${s.status === "Active" ? "bg-green-50 text-green-500" : "bg-blue-50 text-blue-500"}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No enrollment records found.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filtered.length > 0 ? filtered.map(t => (
          <div key={t.id}
            className="bg-white rounded-[2.5rem] border border-slate-50 p-8 shadow-sm hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden"
          >
             <div className="absolute top-4 right-4 flex gap-2">
                 <button onClick={e => { e.stopPropagation(); handleOpenRoster(t); }} className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-indigo-100 shadow-sm"><Eye className="w-4 h-4" /></button>
                 <button onClick={e => { e.stopPropagation(); handleStartEdit(t); }} className="p-2.5 bg-slate-50 text-slate-400 hover:text-amber-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-amber-100 shadow-sm"><Edit3 className="w-4 h-4" /></button>
                 <button onClick={e => { e.stopPropagation(); handleDeleteTeacher(t.id, t.name); }} className="p-2.5 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-rose-100 shadow-sm"><Trash2 className="w-4 h-4" /></button>
             </div>

            <div className="flex flex-col items-center text-center mb-8">
              <div className={`w-20 h-20 rounded-[2rem] ${t.color} flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-black/10 mb-4 group-hover:scale-110 transition-transform`}>
                {t.initials}
              </div>
              <div className="w-full flex flex-col items-center justify-center">
                {editingId === t.id ? (
                    <div className="flex items-center gap-2 mt-2 w-full" onClick={e => e.stopPropagation()}>
                        <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)} className="h-10 rounded-xl text-center font-black border-2 border-indigo-200 bg-indigo-50/30" onKeyDown={e => e.key === "Enter" && handleSaveName(t.id)} />
                        <button onClick={() => handleSaveName(t.id)} className="p-2 bg-emerald-500 text-white rounded-xl shadow-lg"><Save className="w-4 h-4" /></button>
                    </div>
                ) : (
                    <h3 className="font-black text-slate-800 text-lg leading-tight group-hover:text-[#1e3a8a] transition-colors">{t.name}</h3>
                )}
                <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-1 tracking-widest">{t.subject}</p>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-50">
              <div className="flex justify-between items-center group/row">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic group-hover/row:text-indigo-400 transition-colors">Course Classes</span>
                  <span className="text-xs font-black text-slate-700 max-w-[120px] truncate text-right">{t.actualClasses}</span>
              </div>
              <div className="flex justify-between items-center group/row">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic group-hover/row:text-emerald-400 transition-colors">Tenure</span>
                  <span className="text-xs font-black text-slate-700">{t.experience}</span>
              </div>
              <div className="flex justify-between items-center group/row">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic group-hover/row:text-amber-400 transition-colors">Rating</span>
                <span className="flex items-center gap-1 font-black text-amber-500 text-xs">
                  <Star className="w-3 h-3 fill-amber-500" /> {t.rating}
                </span>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] border-2 shadow-sm ${
                  t.status === "Active" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                  t.status === "Invited" ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-rose-50 text-rose-600 border-rose-100"
              }`}>
                {t.status}
              </span>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-32 flex flex-col items-center justify-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
            <div className="w-20 h-20 rounded-[2rem] bg-slate-50 flex items-center justify-center mb-6">
              <Users className="w-10 h-10 text-slate-200" />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">No Faculty Data Found</h3>
            <p className="text-[11px] font-bold text-slate-400 max-w-xs text-center mt-2 uppercase tracking-widest leading-relaxed">System is ready for teacher onboarding. Use "Bulk Import" to sync faculty database.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Teachers;
