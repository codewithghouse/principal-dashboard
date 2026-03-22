import { useState, useEffect, useRef } from "react";
import { BarChart2, CalendarCheck, Star, Users, Search, List, Plus, Upload, Download, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2, GraduationCap, Eye } from "lucide-react";
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
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, getDocs } from "firebase/firestore";
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
  const [isAssignOpen, setIsAssignOpen]       = useState(false);
  const [isRosterOpen, setIsRosterOpen]       = useState(false);
  const [teacherToAssign, setTeacherToAssign] = useState<any | null>(null);
  const [teacherRoster, setTeacherRoster]     = useState<any[]>([]);
  const [loadingRoster, setLoadingRoster]     = useState(false);
  const [assignedGrade, setAssignedGrade]     = useState("");
  const [isSending, setIsSending]             = useState(false);

  // Bulk state
  const [bulkData, setBulkData]               = useState<BulkTeacher[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkDone, setBulkDone]               = useState(false);

  const [inviteForm, setInviteForm] = useState({ name: "", email: "", subject: "" });

  // ── Real-time Teachers Fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    
    // Debug: See what fields principal has
    console.log("📋 Principal userData:", JSON.stringify(userData, null, 2));
    
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branch   = userData?.branch   || userData?.branchName;
    
    if (!schoolId) {
      console.warn("⚠️ No schoolId found in principal data. Check Firestore document fields.");
      return;
    }
    
    const constraints: any[] = [where("schoolId", "==", schoolId)];
    // Only filter by branch if it's set (helps see all teachers if branch mismatch)
    if (branch) constraints.push(where("branch", "==", branch));

    console.log(`🔍 Fetching teachers for schoolId: ${schoolId}, branch: ${branch}`);
    const q = query(collection(db, "teachers"), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      console.log(`✅ Teachers found: ${snap.size}`);
      const colors = ["bg-primary", "bg-edu-green", "bg-edu-orange", "bg-edu-blue", "bg-edu-purple"];
      setTeachersData(snap.docs.map((d, i) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          initials: data.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || "T",
          color: colors[i % colors.length],
          classes: data.classes || "N/A",
          experience: data.experience || "N/A",
          rating: data.rating || "5.0",
          status: data.status || "Active"
        };
      }));
    }, (err) => { console.error("Teachers fetch error:", err); toast.error("Failed to load teachers"); });
    return () => unsub();
  }, [userData?.schoolId, userData?.branch]);

  // ── Download Excel Template ───────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teachers");
    // Column widths
    ws["!cols"] = [{ wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    XLSX.writeFile(wb, "teacher_bulk_template.xlsx");
    toast.success("Template downloaded!");
  };

  // ── Parse Excel File ──────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        const parsed: BulkTeacher[] = rows.map((r: any) => ({
          name:       (r["Name"] || r["name"] || "").toString().trim(),
          email:      (r["Email"] || r["email"] || "").toString().trim().toLowerCase(),
          subject:    (r["Subject"] || r["subject"] || "").toString().trim(),
          phone:      (r["Phone"] || r["phone"] || "").toString().trim(),
          experience: (r["Experience"] || r["experience"] || "").toString().trim(),
          _status:    "pending" as const
        })).filter(r => r.name && r.email);

        if (parsed.length === 0) {
          toast.error("No valid rows found. Make sure columns: Name, Email are present.");
          return;
        }
        setBulkData(parsed);
        setBulkDone(false);
        toast.success(`${parsed.length} teachers loaded — ready to import!`);
      } catch {
        toast.error("Failed to read file. Please use the template format.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // ── Process Bulk Import ───────────────────────────────────────────────────
  const handleBulkImport = async () => {
    if (!userData?.schoolId || bulkData.length === 0) return;
    setIsBulkProcessing(true);

    // Fetch existing emails to check duplicates
    const existingSnap = await getDocs(
      query(collection(db, "teachers"), where("schoolId", "==", userData.schoolId))
    );
    const existingEmails = new Set(existingSnap.docs.map(d => d.data().email?.toLowerCase()));

    let success = 0, fail = 0, duplicate = 0;
    const updated = [...bulkData];
    
    // Resolve schoolId from different possible field names
    const schoolId   = userData.schoolId   || userData.school   || userData.schoolID || "";
    const schoolName = userData.schoolName || userData.school   || "";
    const branch     = userData.branch     || userData.branchName || "";
    
    console.log(`📤 Bulk import using: schoolId=${schoolId}, branch=${branch}`);

    for (let i = 0; i < updated.length; i++) {
      const t = updated[i];
      if (existingEmails.has(t.email)) {
        updated[i] = { ...t, _status: "duplicate", _error: "Already exists" };
        duplicate++;
        setBulkData([...updated]);
        continue;
      }
      try {
        // 1. Save to Firestore
        const docData = {
          name:       t.name,
          email:      t.email,
          subject:    t.subject || "",
          phone:      t.phone || "",
          experience: t.experience || "",
          schoolId,
          schoolName,
          branch,
          status:     "Invited",
          role:       "teacher",
          createdAt:  serverTimestamp()
        };
        console.log(`💾 Saving teacher: ${t.email}`, docData);
        await addDoc(collection(db, "teachers"), docData);

        // 2. Send Email (non-blocking — teacher is saved even if email fails)
        const dashboardUrl = "https://teacher-dashboard-ochre.vercel.app";
        try {
          await sendEmail({
            to: t.email,
            subject: `You're invited to join ${schoolName} as a Teacher`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #1e3a8a; margin-bottom: 8px;">Welcome to EduIntellect 🎓</h2>
                <p>Hello <strong>${t.name}</strong>,</p>
                <p>You have been invited to join <strong>${schoolName} — ${branch}</strong> as a Teacher.</p>
                <p>Click below to access your dashboard using your Google account (<em>${t.email}</em>):</p>
                <div style="margin: 28px 0;">
                  <a href="${dashboardUrl}" style="background:#1e3a8a; color:#fff; padding:12px 28px; text-decoration:none; border-radius:8px; font-weight:bold;">
                    Open Teacher Dashboard
                  </a>
                </div>
                <p style="color:#64748b; font-size:13px;">If you have questions, contact school administration.</p>
                <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;" />
                <p style="font-size:11px; color:#94a3b8;">EduIntellect School Management Platform</p>
              </div>
            `
          });
          console.log(`📧 Email sent to ${t.email}`);
        } catch (emailErr) {
          // Email failed but teacher was saved — mark as success with warning
          console.warn(`⚠️ Email failed for ${t.email} but DB saved:`, emailErr);
        }

        updated[i] = { ...t, _status: "success" };
        success++;
      } catch (err: any) {
        updated[i] = { ...t, _status: "error", _error: err.message || "Failed" };
        fail++;
      }
      setBulkData([...updated]);
    }

    setIsBulkProcessing(false);
    setBulkDone(true);
    toast.success(`✅ Done! ${success} invited, ${duplicate} duplicates, ${fail} failed.`);
  };

  // ── Single Invite ─────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.name) return toast.error("Please fill all fields");
    setIsSending(true);
    try {
      await addDoc(collection(db, "teachers"), {
        ...inviteForm,
        email:      inviteForm.email.toLowerCase(),
        schoolId:   userData?.schoolId,
        schoolName: userData?.schoolName,
        branch:     userData?.branch,
        status:     "Invited",
        role:       "teacher",
        createdAt:  serverTimestamp()
      });
      const dashboardUrl = "https://teacher-dashboard-ochre.vercel.app";
      await sendEmail({
        to: inviteForm.email,
        subject: `Invitation to join ${userData?.schoolName} as a Teacher`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#1e3a8a;">Welcome to EduIntellect 🎓</h2>
            <p>Hello <strong>${inviteForm.name}</strong>,</p>
            <p>You are invited to join <strong>${userData?.schoolName} (${userData?.branch})</strong> as a Teacher.</p>
            <div style="margin:28px 0;">
              <a href="${dashboardUrl}" style="background:#1e3a8a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;">Access Teacher Dashboard</a>
            </div>
            <p style="font-size:11px;color:#94a3b8;">EduIntellect School Management Platform</p>
          </div>
        `
      });
      toast.success(`Invitation sent to ${inviteForm.email}!`);
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", subject: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setIsSending(false);
    }
  };

  // ── Assign Grade ──────────────────────────────────────────────────────────
  const handleAssignGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherToAssign || !assignedGrade) return;
    setIsSending(true);
    try {
      await updateDoc(doc(db, "teachers", teacherToAssign.id), { classes: assignedGrade });
      toast.success(`Assigned ${assignedGrade} to ${teacherToAssign.name}`);
      setIsAssignOpen(false);
    } catch { toast.error("Failed to assign grade"); }
    finally { setIsSending(false); }
  };

  // ── Open Roster ───────────────────────────────────────────────────────────
  const handleOpenRoster = async (teacher: any) => {
    setTeacherToAssign(teacher);
    setIsRosterOpen(true);
    setLoadingRoster(true);
    try {
      const snap = await getDocs(query(collection(db, "students"), where("teacherId", "==", teacher.id)));
      setTeacherRoster(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load roster"); }
    finally { setLoadingRoster(false); }
  };

  const filtered = teachersData.filter(t =>
    t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedTeacher) return <TeacherProfile teacher={selectedTeacher} onBack={() => setSelectedTeacher(null)} />;

  // ── Status badge color ────────────────────────────────────────────────────
  const statusColor = (s?: string) => {
    if (s === "success")   return "bg-green-50 text-green-600 border border-green-200";
    if (s === "error")     return "bg-red-50 text-red-600 border border-red-200";
    if (s === "duplicate") return "bg-amber-50 text-amber-600 border border-amber-200";
    return "bg-slate-100 text-slate-500";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Teachers</h1>
        <p className="text-sm text-muted-foreground">Manage teaching staff and monitor performance</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Avg Class Performance" value="68.4%"  subtitle="↑ 2.1% vs last term"   subtitleColor="success"     icon={BarChart2}     iconColor="text-primary" />
        <StatCard title="Teacher Attendance"    value="94.2%"  subtitle="Excellent"              subtitleColor="success"     icon={CalendarCheck} iconColor="text-primary" />
        <StatCard title="Parent Feedback"       value="4.3/5"  subtitle="Based on 324 reviews"  subtitleColor="muted"       icon={Star}          iconColor="text-warning" />
        <StatCard title="Active Teachers"       value={`${teachersData.filter(t => t.status === "Active").length}`} subtitle={`${teachersData.length} total`} subtitleColor="muted" icon={Users} iconColor="text-primary" />
      </div>

      <Recommendations />

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-8">
        <div className="relative max-w-xs flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search teachers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bulk Import Button */}
          <button
            onClick={() => { setIsBulkOpen(true); setBulkData([]); setBulkDone(false); }}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-indigo-200 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Bulk Import
          </button>
          {/* Single Invite */}
          <button
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#1e3a8a] text-white hover:opacity-90 font-bold transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        </div>
      </div>

      {/* ── BULK IMPORT MODAL ─────────────────────────────────────────────── */}
      <Dialog open={isBulkOpen} onOpenChange={(o) => { if (!isBulkProcessing) setIsBulkOpen(o); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[#1e294b] flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" /> Bulk Teacher Import
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Upload an Excel (.xlsx) file to invite multiple teachers at once. Each teacher will receive an email invitation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Step 1 – Download Template */}
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
              <p className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-1">Step 1 — Download Template</p>
              <p className="text-xs text-slate-500 mb-3">Use this template to enter your teachers. Required columns: <strong>Name, Email</strong>. Optional: Subject, Phone, Experience.</p>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:opacity-90 transition"
              >
                <Download className="w-4 h-4" /> Download Template
              </button>
            </div>

            {/* Step 2 – Upload */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 border-dashed">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Step 2 — Upload Filled File</p>
              <p className="text-xs text-slate-400 mb-3">Supports .xlsx format only</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
              >
                <Upload className="w-4 h-4" /> Choose Excel File
              </button>
            </div>

            {/* Preview Table */}
            {bulkData.length > 0 && (
              <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-[#1e3a8a] flex items-center justify-between">
                  <span className="text-[11px] font-black text-white uppercase tracking-widest">{bulkData.length} Teachers Loaded</span>
                  {!bulkDone && (
                    <button onClick={() => setBulkData([])} className="text-white/60 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-black">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Subject</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {bulkData.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-bold text-slate-800">{t.name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{t.email}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{t.subject || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            {t._status === "pending" && <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">Pending</span>}
                            {t._status === "success" && <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />}
                            {t._status === "error"   && (
                              <span title={t._error} className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-500">Error</span>
                            )}
                            {t._status === "duplicate" && (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-600">Duplicate</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Summary after done */}
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

          <DialogFooter className="pt-4">
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
                onClick={() => setIsBulkOpen(false)}
                className="w-full h-12 rounded-xl bg-green-600 text-white font-bold hover:opacity-90 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Done — Close
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SINGLE INVITE MODAL ───────────────────────────────────────────── */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e294b]">Invite Teacher</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Send an invitation to join {userData?.schoolName}. They will login using Google.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name</Label>
              <Input id="name" placeholder="e.g. Mrs. Kavita" className="rounded-xl border-slate-200"
                value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500">Email Address</Label>
              <Input id="email" type="email" placeholder="teacher@gmail.com" className="rounded-xl border-slate-200"
                value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject" className="text-xs font-bold uppercase tracking-wider text-slate-500">Primary Subject</Label>
              <Input id="subject" placeholder="e.g. Mathematics" className="rounded-xl border-slate-200"
                value={inviteForm.subject} onChange={e => setInviteForm({ ...inviteForm, subject: e.target.value })} />
            </div>
            <DialogFooter className="pt-4">
              <button type="submit" disabled={isSending}
                className="w-full h-12 rounded-xl bg-[#1e3a8a] text-white font-bold hover:opacity-90 transition flex items-center justify-center gap-2">
                {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Send Invitation"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── ASSIGN GRADE MODAL ────────────────────────────────────────────── */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e294b]">Assign Grade / Class</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">Assign a grade to {teacherToAssign?.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignGrade} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="grade" className="text-xs font-bold uppercase tracking-wider text-slate-500">Select Grade</Label>
              <select id="grade" value={assignedGrade} onChange={e => setAssignedGrade(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" required>
                <option value="">Select a Grade</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => <option key={g} value={`Grade ${g}`}>Grade {g}</option>)}
              </select>
            </div>
            <DialogFooter className="pt-4">
              <button type="submit" disabled={isSending}
                className="w-full h-12 rounded-xl bg-[#1e3a8a] text-white font-bold hover:opacity-90 transition flex items-center justify-center gap-2">
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
                {isSending ? "Assigning..." : "Confirm Assignment"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── ROSTER MODAL ──────────────────────────────────────────────────── */}
      <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e294b]">Class Roster: {teacherToAssign?.name}</DialogTitle>
            <DialogDescription className="text-slate-500 font-bold italic">Students assigned to this teacher.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingRoster ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : teacherRoster.length > 0 ? (
              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#1e3a8a] text-white font-bold uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-4 py-4">Student</th>
                      <th className="px-4 py-4">Grade</th>
                      <th className="px-4 py-4 text-center">Section</th>
                      <th className="px-4 py-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {teacherRoster.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-900">{s.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{s.email}</div>
                        </td>
                        <td className="px-4 py-4 font-black text-[#1e3a8a]">{s.grade}</td>
                        <td className="px-4 py-4 text-center font-black text-slate-600">{s.section || "N/A"}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${s.status === "Active" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-tighter">No students assigned yet.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── TEACHERS GRID ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filtered.length > 0 ? filtered.map(t => (
          <div key={t.id}
            className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            onClick={() => setSelectedTeacher(t)}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl ${t.color} flex items-center justify-center text-lg font-bold text-white shadow-sm ring-4 ring-white`}>
                {t.initials}
              </div>
              <div>
                <p className="font-bold text-[#1e293b] text-base group-hover:text-[#1e3a8a] transition-colors">{t.name}</p>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">{t.subject}</p>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-slate-50 italic">
              <div className="flex justify-between items-center"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Classes</span><span className="text-sm font-bold text-[#475569]">{t.classes}</span></div>
              <div className="flex justify-between items-center"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Experience</span><span className="text-sm font-bold text-[#475569]">{t.experience}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Rating</span>
                <span className="flex items-center gap-1 font-bold text-warning">
                  <Star className="w-3.5 h-3.5 fill-warning" /> {t.rating}
                </span>
              </div>
            </div>
            <div className="mt-6 flex justify-between items-center">
              <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${t.status === "Active" ? "bg-green-50 text-green-500 border border-green-100" : t.status === "Invited" ? "bg-blue-50 text-blue-500 border border-blue-100" : "bg-red-50 text-red-500 border border-red-100"}`}>
                {t.status}
              </span>
              <button onClick={e => { e.stopPropagation(); setTeacherToAssign(t); setAssignedGrade(t.classes === "N/A" ? "" : t.classes); setIsAssignOpen(true); }}
                className="text-[10px] font-black text-[#1e3a8a] uppercase tracking-tighter hover:underline flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> Assign
              </button>
              <button onClick={e => { e.stopPropagation(); handleOpenRoster(t); }}
                className="text-[10px] font-black text-[#1e3a8a] uppercase tracking-tighter hover:underline flex items-center gap-1">
                <Eye className="w-3 h-3" /> Roster
              </button>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No teachers found</h3>
            <p className="text-sm text-slate-500 max-w-xs text-center mt-1">Use "Bulk Import" to invite multiple teachers at once, or "Add Teacher" for one by one.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Teachers;
