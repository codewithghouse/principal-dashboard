import { useState, useEffect, useRef } from "react";
import {
  BarChart2, CalendarCheck, Star, Users, Search, List,
  Plus, Upload, Download, FileSpreadsheet, X, CheckCircle,
  Loader2, GraduationCap, Eye, Trash2, Edit3, Save,
  TrendingUp, UserCheck, MessageSquare, LayoutGrid
} from "lucide-react";
import TeacherProfile from "@/components/TeacherProfile";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, serverTimestamp, query, where,
  onSnapshot, doc, updateDoc, getDocs, getDoc
} from "firebase/firestore";
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
  { Name: "Dr. Rajesh Kumar",   Email: "rajesh@example.com", Subject: "Physics",     Phone: "9876543211", Experience: "8 years" },
];

// ─── Stat Card (custom, matches mockup) ─────────────────────────────────────
const StatCard = ({
  title, value, subtitle, subtitleGreen = false, subtitleOrange = false, icon: Icon, iconBg
}: {
  title: string; value: string | number; subtitle?: string;
  subtitleGreen?: boolean; subtitleOrange?: boolean;
  icon: any; iconBg: string;
}) => (
  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-slate-500 font-medium">{title}</span>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
    </div>
    <div className="text-2xl font-bold text-slate-800 mb-1">{value}</div>
    {subtitle && (
      <span className={`text-xs font-semibold ${
        subtitleGreen ? "text-green-600" : subtitleOrange ? "text-amber-600" : "text-slate-400"
      }`}>
        {subtitle}
      </span>
    )}
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
const Teachers = () => {
  const { userData } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI State ─────────────────────────────────────────────────────────────
  const [teachersData,     setTeachersData]     = useState<any[]>([]);
  const [selectedTeacher,  setSelectedTeacher]  = useState<any | null>(null);
  const [searchQuery,      setSearchQuery]      = useState("");
  const [subjectFilter,    setSubjectFilter]    = useState("");
  const [statusFilter,     setStatusFilter]     = useState("");
  const [viewMode,         setViewMode]         = useState<"grid" | "list">("grid");

  // ── Dialog State ──────────────────────────────────────────────────────────
  const [isInviteOpen,       setIsInviteOpen]       = useState(false);
  const [isBulkOpen,         setIsBulkOpen]         = useState(false);
  const [isRosterOpen,       setIsRosterOpen]       = useState(false);
  const [teacherToAssign,    setTeacherToAssign]    = useState<any | null>(null);
  const [teacherRoster,      setTeacherRoster]      = useState<any[]>([]);
  const [loadingRoster,      setLoadingRoster]      = useState(false);
  const [isSending,          setIsSending]          = useState(false);

  // ── Edit State ────────────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editName,   setEditName]   = useState("");

  // ── Bulk State ────────────────────────────────────────────────────────────
  const [bulkData,         setBulkData]         = useState<BulkTeacher[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkDone,         setBulkDone]         = useState(false);

  const [inviteForm,       setInviteForm]       = useState({ name: "", email: "", subject: "", assignClassId: "" });
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);

  // ── Aggregated Stats State ────────────────────────────────────────────────
  const [avgRating,       setAvgRating]       = useState<number | null>(null);
  const [reviewCount,     setReviewCount]     = useState(0);
  const [avgClassPerf,    setAvgClassPerf]    = useState<number | null>(null);
  const [teacherAttPct,   setTeacherAttPct]   = useState<number | null>(null);

  // ── Teacher Real-time Fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;

    const constraints: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) constraints.push(where("branchId", "==", branchId));

    const q = query(collection(db, "teachers"), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const COLORS = [
        "bg-[#1e3a8a]", "bg-emerald-600", "bg-amber-500",
        "bg-rose-500",  "bg-indigo-600",  "bg-teal-600",
      ];
      const teachers = snap.docs.map((d, i) => {
        const data = d.data();
        return {
          id:          d.id,
          ...data,
          initials:    data.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "T",
          color:       COLORS[i % COLORS.length],
          experience:  data.experience  || "N/A",
          rating:      data.rating      || "5.0",
          status:      data.status      || "Active",
          subject:     data.subject     || "Faculty",
          classCount:  null as number | null,   // filled async below
          classNames:  "Fetching…",
        };
      });
      setTeachersData(teachers);

      // Per-teacher class count (async, fills in after render)
      teachers.forEach(async (t) => {
        try {
          const aSnap = await getDocs(
            query(collection(db, "teaching_assignments"), where("teacherId", "==", t.id))
          );
          if (aSnap.empty) {
            setTeachersData(prev =>
              prev.map(item => item.id === t.id
                ? { ...item, classCount: 0, classNames: "Unassigned" }
                : item
              )
            );
            return;
          }
          const classIds = [...new Set(aSnap.docs.map(d => d.data().classId).filter(Boolean))];
          const names: string[] = [];
          for (const cId of classIds) {
            const cDoc = await getDoc(doc(db, "classes", cId as string));
            if (cDoc.exists()) names.push(cDoc.data().name);
          }
          setTeachersData(prev =>
            prev.map(item => item.id === t.id
              ? {
                  ...item,
                  classCount: classIds.length,
                  classNames: names.join(", ") || "No Classes",
                  subject:    t.subject || aSnap.docs[0].data().subjectId || "Faculty",
                }
              : item
            )
          );
        } catch { /* silent */ }
      });
    });

    const classQ = query(collection(db, "classes"), where("schoolId", "==", schoolId));
    const unsubClasses = onSnapshot(classQ, (snap) => {
      setAvailableClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub(); unsubClasses(); };
  }, [userData]);

  // ── Avg Class Performance (from results) ─────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    if (!schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, "results"), where("schoolId", "==", schoolId)),
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        if (docs.length === 0) { setAvgClassPerf(null); return; }
        const avg = docs.reduce((s, d) => {
          const pct = d.totalMarks > 0 ? (d.marksObtained / d.totalMarks) * 100 : 0;
          return s + pct;
        }, 0) / docs.length;
        setAvgClassPerf(Math.round(avg * 10) / 10);
      }
    );
    return () => unsub();
  }, [userData]);

  // ── Teacher Attendance % ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    if (!schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, "teacher_attendance"), where("schoolId", "==", schoolId)),
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        if (docs.length === 0) { setTeacherAttPct(null); return; }
        const present = docs.filter(d => d.status === "present").length;
        setTeacherAttPct(Math.round((present / docs.length) * 100));
      }
    );
    return () => unsub();
  }, [userData]);

  // ── Parent Reviews Aggregate ─────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    if (!schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, "teacher_reviews"), where("schoolId", "==", schoolId)),
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        setReviewCount(docs.length);
        if (docs.length > 0) {
          const avg = docs.reduce((s, d) => s + (d.rating || 0), 0) / docs.length;
          setAvgRating(Math.round(avg * 10) / 10);
        }
      }
    );
    return () => unsub();
  }, [userData]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.name || !inviteForm.email) return;

    const assignToClass = async (teacherId: string, classId: string) => {
      if (!classId) return;
      await addDoc(collection(db, "teaching_assignments"), {
        teacherId, classId,
        subjectId: inviteForm.subject || "",
        status: "active",
        createdAt: serverTimestamp(),
      });
    };

    setIsSending(true);
    try {
      const emailObj = inviteForm.email.toLowerCase().trim();
      const schoolId = userData?.schoolId || userData?.school || "";
      const branchId = userData?.branchId || "";

      const qCheck = query(collection(db, "teachers"),
        where("email", "==", emailObj), where("schoolId", "==", schoolId));
      const snap = await getDocs(qCheck);

      if (!snap.empty) {
        const existing = snap.docs[0];
        if (existing.data().status === "Archived") {
          await updateDoc(doc(db, "teachers", existing.id), {
            status: "Invited", isActive: true,
            name: inviteForm.name,
            subject: inviteForm.subject || existing.data().subject,
            reactivatedAt: serverTimestamp(),
          });
          await assignToClass(existing.id, inviteForm.assignClassId);
          try {
            await sendEmail({
              to: emailObj,
              subject: `Welcome Back to ${userData?.schoolName || "EduIntellect"}`,
              html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#1e3a8a">Welcome Back, ${inviteForm.name}!</h2><p>Your account has been restored at <strong>${userData?.schoolName || "the institution"}</strong>.</p><div style="margin:24px 0"><a href="https://teacher-dashboard-ochre.vercel.app" style="background:#1e3a8a;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Open Teacher Dashboard</a></div></div>`,
            });
          } catch (emailErr: any) {
            toast.warning(`Teacher restored, but email failed: ${emailErr?.message || "Unknown error"}`);
          }
          toast.success("Teacher restored & re-invited!");
        } else {
          toast.error("A teacher with this email is already active.");
        }
        setIsInviteOpen(false);
        setInviteForm({ name: "", email: "", subject: "", assignClassId: "" });
        setIsSending(false);
        return;
      }

      const ref = await addDoc(collection(db, "teachers"), {
        name: inviteForm.name, subject: inviteForm.subject,
        email: emailObj, schoolId, branchId,
        status: "Invited", isActive: true,
        createdAt: serverTimestamp(), rating: 5.0, experience: "N/A",
      });
      await assignToClass(ref.id, inviteForm.assignClassId);
      try {
        await sendEmail({
          to: emailObj,
          subject: `Invitation to join ${userData?.schoolName || "EduIntellect"}`,
          html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#1e3a8a">Welcome, ${inviteForm.name}!</h2><p>You have been invited to <strong>${userData?.schoolName || "the institution"}</strong>.</p><div style="margin:24px 0"><a href="https://teacher-dashboard-ochre.vercel.app" style="background:#1e3a8a;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Login to Teacher Portal</a></div></div>`,
        });
        toast.success("Teacher invited & email sent successfully!");
      } catch (emailErr: any) {
        toast.warning(`Teacher added to system, but email failed: ${emailErr?.message || "Unknown error"}`);
      }
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", subject: "", assignClassId: "" });
    } catch (err) {
      toast.error("Failed to invite teacher.");
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteTeacher = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the system? Their records stay intact.`)) return;
    try {
      await updateDoc(doc(db, "teachers", id), {
        status: "Archived", isActive: false, archivedAt: serverTimestamp(),
      });
      const aSnap = await getDocs(
        query(collection(db, "teaching_assignments"), where("teacherId", "==", id))
      );
      await Promise.all(aSnap.docs.map(d => updateDoc(d.ref, { teacherId: null })));
      toast.success("Teacher archived successfully.");
    } catch {
      toast.error("Failed to archive teacher.");
    }
  };

  const handleStartEdit = (t: any) => { setEditingId(t.id); setEditName(t.name); };
  const handleSaveName  = async (id: string) => {
    if (!editName.trim()) return setEditingId(null);
    try {
      await updateDoc(doc(db, "teachers", id), { name: editName.trim() });
      toast.success("Name updated.");
      setEditingId(null);
    } catch { toast.error("Failed to update name."); }
  };

  const handleOpenRoster = async (teacher: any) => {
    setTeacherToAssign(teacher);
    setIsRosterOpen(true);
    setLoadingRoster(true);
    try {
      const snap = await getDocs(
        query(collection(db, "enrollments"), where("teacherId", "==", teacher.id))
      );
      setTeacherRoster(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to fetch roster."); }
    finally { setLoadingRoster(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb   = XLSX.read(bstr, { type: "binary" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws) as any[];
      setBulkData(
        data.map(item => ({
          name:       item.Name       || item.name       || "",
          email:      (item.Email     || item.email      || "").toString().toLowerCase().trim(),
          subject:    item.Subject    || item.subject    || "",
          phone:      item.Phone      || item.phone      || "",
          experience: item.Experience || item.experience || "",
          _status:    "pending" as const,
        })).filter(t => !!t.email)
      );
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkImport = async () => {
    setIsBulkProcessing(true);
    const rows = [...bulkData];
    const schoolId = userData?.schoolId || "";
    const branchId = userData?.branchId || "";
    for (let i = 0; i < rows.length; i++) {
      try {
        const t = rows[i];
        const existing = await getDocs(
          query(collection(db, "teachers"), where("email", "==", t.email), where("schoolId", "==", schoolId))
        );
        if (!existing.empty) { rows[i]._status = "duplicate"; continue; }
        await addDoc(collection(db, "teachers"), {
          name: t.name, email: t.email, subject: t.subject,
          phone: t.phone, experience: t.experience,
          schoolId, branchId, status: "Invited",
          createdAt: serverTimestamp(), rating: 5.0,
        });
        rows[i]._status = "success";
      } catch (err) {
        rows[i]._status = "error";
        rows[i]._error  = String(err);
      }
      setBulkData([...rows]);
    }
    setIsBulkProcessing(false);
    setBulkDone(true);
    toast.success("Bulk import complete");
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TeachersTemplate");
    XLSX.writeFile(wb, "Teacher_Import_Template.xlsx");
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const allSubjects = [...new Set(teachersData.map(t => t.subject).filter(Boolean))];
  const filtered = teachersData.filter(t =>
    t.status !== "Archived" &&
    (t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.email?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!subjectFilter || t.subject === subjectFilter) &&
    (!statusFilter  || t.status  === statusFilter)
  );

  const activeCount  = teachersData.filter(t => t.status === "Active").length;
  const totalCount   = teachersData.filter(t => t.status !== "Archived").length;
  const onLeaveCount = teachersData.filter(t => t.status === "On Leave").length;

  // ── If profile is open, render it ────────────────────────────────────────
  if (selectedTeacher) {
    return <TeacherProfile teacher={selectedTeacher} onBack={() => setSelectedTeacher(null)} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">

      {/* ── PAGE HEADER ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Teachers</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage teaching staff and monitor performance</p>
      </div>

      {/* ── STAT CARDS (4) ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Avg Class Performance"
          value={avgClassPerf !== null ? `${avgClassPerf}%` : "—"}
          subtitle={avgClassPerf !== null ? "Based on recorded results" : "No results yet"}
          subtitleGreen={avgClassPerf !== null && avgClassPerf >= 60}
          icon={TrendingUp}
          iconBg="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Teacher Attendance"
          value={teacherAttPct !== null ? `${teacherAttPct}%` : "—"}
          subtitle={teacherAttPct !== null
            ? teacherAttPct >= 90 ? "Excellent" : teacherAttPct >= 75 ? "Good" : "Needs attention"
            : "No records yet"}
          subtitleGreen={teacherAttPct !== null && teacherAttPct >= 75}
          icon={CalendarCheck}
          iconBg="bg-green-50 text-green-600"
        />
        <StatCard
          title="Parent Feedback"
          value={avgRating !== null ? `${avgRating}/5` : "—"}
          subtitle={reviewCount > 0 ? `Based on ${reviewCount} reviews` : "No reviews yet"}
          icon={Star}
          iconBg="bg-amber-50 text-amber-500"
        />
        <StatCard
          title="Active Teachers"
          value={`${activeCount}/${totalCount}`}
          subtitle={onLeaveCount > 0 ? `${onLeaveCount} on leave` : "All present"}
          subtitleOrange={onLeaveCount > 0}
          subtitleGreen={onLeaveCount === 0}
          icon={Users}
          iconBg="bg-indigo-50 text-indigo-600"
        />
      </div>

      {/* ── TOOLBAR ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search teachers…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
          />
        </div>

        {/* Subject Filter */}
        <select
          value={subjectFilter}
          onChange={e => setSubjectFilter(e.target.value)}
          className="py-2.5 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
        >
          <option value="">All Subjects</option>
          {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="py-2.5 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="On Leave">On Leave</option>
          <option value="Invited">Invited</option>
        </select>

        <div className="flex-1" />

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-[#1e3a8a] text-white" : "text-slate-400 hover:text-slate-600"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-[#1e3a8a] text-white" : "text-slate-400 hover:text-slate-600"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Bulk Import */}
        <button
          onClick={() => setIsBulkOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Bulk Import
        </button>

        {/* Add Teacher */}
        <button
          onClick={() => setIsInviteOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-lg text-sm font-semibold hover:bg-[#1e3a8a]/90 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" /> Add Teacher
        </button>
      </div>

      {/* ── BULK IMPORT DIALOG ────────────────────────────────────────────── */}
      <Dialog open={isBulkOpen} onOpenChange={(o) => { if (!o) { setIsBulkOpen(false); setBulkDone(false); setBulkData([]); } else setIsBulkOpen(true); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Bulk Import Teachers</DialogTitle>
            <DialogDescription className="text-slate-500">Upload an Excel (.xlsx) file to invite multiple teachers at once.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!bulkDone && (
              <div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#1e3a8a]/40 hover:bg-slate-50 transition-all"
                >
                  <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">Click to upload Excel file</p>
                  <p className="text-xs text-slate-400 mt-1">.xlsx or .xls format</p>
                  <input type="file" hidden ref={fileInputRef} accept=".xlsx,.xls" onChange={handleFileUpload} />
                </div>
                <button onClick={downloadTemplate} className="mt-2 text-xs font-semibold text-[#1e3a8a] flex items-center gap-1.5 mx-auto hover:underline">
                  <Download className="w-3 h-3" /> Download template
                </button>
              </div>
            )}
            {bulkData.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[240px] overflow-y-auto">
                {bulkData.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0 bg-white">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.email}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                      t._status === "success"   ? "bg-green-50 text-green-600"  :
                      t._status === "duplicate" ? "bg-amber-50 text-amber-600"  :
                      t._status === "error"     ? "bg-red-50 text-red-600"      :
                      "bg-blue-50 text-blue-600"
                    }`}>{t._status}</span>
                  </div>
                ))}
              </div>
            )}
            {bulkDone && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Invited",    color: "bg-green-50 text-green-600",  count: bulkData.filter(t => t._status === "success").length   },
                  { label: "Duplicates", color: "bg-amber-50 text-amber-600",  count: bulkData.filter(t => t._status === "duplicate").length  },
                  { label: "Failed",     color: "bg-red-50 text-red-600",      count: bulkData.filter(t => t._status === "error").length      },
                ].map(({ label, color, count }) => (
                  <div key={label} className={`p-4 rounded-xl border text-center ${color.replace("text-", "border-").replace("600", "100")}`}>
                    <p className={`text-2xl font-black ${color.split(" ")[1]}`}>{count}</p>
                    <p className={`text-[10px] font-bold uppercase ${color.split(" ")[1]}`}>{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            {!bulkDone ? (
              <button
                onClick={handleBulkImport}
                disabled={bulkData.length === 0 || isBulkProcessing}
                className="w-full h-11 rounded-xl bg-[#1e3a8a] text-white font-semibold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBulkProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Import & Invite All</>}
              </button>
            ) : (
              <button
                onClick={() => { setIsBulkOpen(false); setBulkDone(false); setBulkData([]); }}
                className="w-full h-11 rounded-xl bg-green-600 text-white font-semibold hover:opacity-90 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Done
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── INVITE DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Add Teacher</DialogTitle>
            <DialogDescription className="text-slate-500">
              They'll receive an email invitation to join {userData?.schoolName || "the school"}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name</Label>
              <Input placeholder="Mrs. Kavita Sharma" className="h-11 rounded-xl"
                value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email Address</Label>
              <Input type="email" placeholder="teacher@school.edu" className="h-11 rounded-xl"
                value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</Label>
              <Input placeholder="e.g. Mathematics" className="h-11 rounded-xl"
                value={inviteForm.subject} onChange={e => setInviteForm({ ...inviteForm, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign Class (Optional)</Label>
              <select
                value={inviteForm.assignClassId}
                onChange={e => setInviteForm({ ...inviteForm, assignClassId: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              >
                <option value="">— Not assigned —</option>
                {availableClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={isSending}
              className="w-full h-11 rounded-xl bg-[#1e3a8a] text-white font-semibold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><CheckCircle className="w-4 h-4" /> Send Invitation</>}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── ROSTER DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Class Roster — {teacherToAssign?.name}</DialogTitle>
            <DialogDescription className="text-slate-500">Students currently enrolled under this teacher.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {loadingRoster ? (
              <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#1e3a8a]" /></div>
            ) : teacherRoster.length > 0 ? (
              <div className="rounded-xl overflow-hidden border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-[#1e3a8a] text-white">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Student</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Class</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {teacherRoster.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-800">{s.studentName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{s.studentEmail}</p>
                        </td>
                        <td className="px-5 py-3 font-semibold text-[#1e3a8a]">{s.className || "General"}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                            s.status === "Active" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                          }`}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-400">No enrollment records found</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── TEACHER GRID / LIST ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 bg-white rounded-2xl border border-dashed border-slate-200">
          <GraduationCap className="w-12 h-12 text-slate-200 mb-4" />
          <p className="text-base font-bold text-slate-400">No teachers found</p>
          <p className="text-sm text-slate-300 mt-1">Try changing your search or filters</p>
        </div>
      ) : viewMode === "grid" ? (
        /* ── GRID VIEW ────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(t => (
            <div
              key={t.id}
              onClick={() => setSelectedTeacher(t)}
              className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all cursor-pointer group relative"
            >
              {/* Hover actions */}
              <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={e => { e.stopPropagation(); handleOpenRoster(t); }}
                  className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#1e3a8a] hover:border-[#1e3a8a]/30 transition-colors shadow-sm"
                  title="View Roster"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleStartEdit(t); }}
                  className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-500 hover:border-amber-200 transition-colors shadow-sm"
                  title="Edit Name"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteTeacher(t.id, t.name); }}
                  className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors shadow-sm"
                  title="Archive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Teacher Info Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl ${t.color} flex items-center justify-center text-white text-base font-bold shrink-0 group-hover:scale-105 transition-transform shadow-sm`}>
                  {t.initials}
                </div>
                <div className="min-w-0">
                  {editingId === t.id ? (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSaveName(t.id)}
                        className="w-full text-sm font-bold border border-[#1e3a8a]/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                      />
                      <button onClick={() => handleSaveName(t.id)} className="w-7 h-7 bg-green-500 text-white rounded-lg flex items-center justify-center shrink-0">
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <h3 className="text-sm font-bold text-slate-800 truncate group-hover:text-[#1e3a8a] transition-colors leading-tight">{t.name}</h3>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{t.subject}</p>
                </div>
              </div>

              {/* Stats Rows */}
              <div className="space-y-2.5 border-t border-slate-50 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Classes</span>
                  <span className="text-sm font-bold text-slate-800">
                    {t.classCount === null ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300 inline" /> : t.classCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Experience</span>
                  <span className="text-sm font-bold text-slate-800">{t.experience}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Rating</span>
                  <span className="flex items-center gap-1 text-sm font-bold text-slate-800">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    {t.rating}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-4">
                <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${
                  t.status === "Active"   ? "bg-green-50 text-green-600"  :
                  t.status === "On Leave" ? "bg-amber-50 text-amber-600"  :
                  t.status === "Invited"  ? "bg-blue-50 text-blue-600"    :
                  "bg-slate-50 text-slate-500"
                }`}>
                  {t.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── LIST VIEW ────────────────────────────────────────────────────── */
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Teacher</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</th>
                <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Classes</th>
                <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Experience</th>
                <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Rating</th>
                <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTeacher(t)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl ${t.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {t.initials}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{t.name}</p>
                        <p className="text-xs text-slate-400">{t.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{t.subject}</td>
                  <td className="px-5 py-4 text-center font-semibold text-slate-800">
                    {t.classCount === null ? "…" : t.classCount}
                  </td>
                  <td className="px-5 py-4 text-center text-slate-600">{t.experience}</td>
                  <td className="px-5 py-4 text-center">
                    <span className="flex items-center justify-center gap-1 font-semibold text-slate-800">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{t.rating}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                      t.status === "Active"   ? "bg-green-50 text-green-600"  :
                      t.status === "On Leave" ? "bg-amber-50 text-amber-600"  :
                      t.status === "Invited"  ? "bg-blue-50 text-blue-600"    :
                      "bg-slate-50 text-slate-500"
                    }`}>{t.status}</span>
                  </td>
                  <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => handleOpenRoster(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-[#1e3a8a] transition-colors"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => handleStartEdit(t)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-500 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteTeacher(t.id, t.name)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teachers;
