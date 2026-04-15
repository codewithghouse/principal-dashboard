import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Download, Plus, MapPin, GraduationCap, User,
  Loader2, Sparkles, Hash, ChevronLeft, ChevronRight, X,
  AlertTriangle, Filter, Upload, FileSpreadsheet, Archive, CheckCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, serverTimestamp,
  query, where, onSnapshot, writeBatch, doc, getDocs
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { sendEmail } from "@/lib/resend";
import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────────────
interface BulkStudent {
  name: string;
  email: string;
  class?: string;
  rollNo?: string;
  parentPhone?: string;
  admissionDate?: string;
  _status?: "pending" | "success" | "error" | "duplicate";
  _error?: string;
}

const TEMPLATE_DATA = [
  { Name: "Aryan Sharma", Email: "aryan@example.com", Class: "8-A", RollNo: "01", ParentPhone: "9876543210", AdmissionDate: "2024-06-01" },
  { Name: "Priya Verma",  Email: "priya@example.com", Class: "8-B", RollNo: "02", ParentPhone: "9876543211", AdmissionDate: "2024-06-01" },
];

const ITEMS_PER_PAGE = 15;

const Students = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [studentsData, setStudentsData]     = useState<any[]>([]);
  const [classes, setClasses]               = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [searchTerm, setSearchTerm]         = useState("");
  const [currentPage, setCurrentPage]       = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [newStudent, setNewStudent]         = useState({ name: "", email: "", classId: "" });
  const [atRiskFilter, setAtRiskFilter]     = useState(false);

  // Bulk upload
  const [showBulkModal, setShowBulkModal]   = useState(false);
  const [bulkRows, setBulkRows]             = useState<BulkStudent[]>([]);
  const [bulkUploading, setBulkUploading]   = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  // Academic year archiving
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiving, setArchiving]               = useState(false);
  const [archiveYear, setArchiveYear]           = useState(new Date().getFullYear().toString());

  // Hold latest snapshots in refs so merges are instant
  const attRef        = useRef<any[]>([]);
  const enrollRef     = useRef<any[]>([]);
  const studentRef    = useRef<any[]>([]);
  const teacherMapRef = useRef<Map<string, string>>(new Map()); // teacherId → teacherName

  // ── helpers ─────────────────────────────────────────────────────────────────

  const computeAttendance = (s: any): { display: string; pct: number | null } => {
    const email = (s.email || s.studentEmail || "").toLowerCase();
    const id    = s.id || s.studentId;
    const recs  = attRef.current.filter(r =>
      (id    && r.studentId === id) ||
      (email && r.studentEmail?.toLowerCase() === email)
    );
    if (recs.length === 0) return { display: "—", pct: null };
    const present = recs.filter(r => r.status === "present" || r.status === "late").length;
    const pct = Math.round((present / recs.length) * 100);
    return { display: `${pct}%`, pct };
  };

  const merge = () => {
    const map = new Map<string, any>();

    // A. students collection (authoritative)
    studentRef.current.forEach(d => {
      const key = (d.email || d.studentEmail || d.id).toLowerCase();
      map.set(key, { ...d });
    });

    // B. enrollments collection (fill gaps)
    enrollRef.current.forEach(d => {
      const key = (d.studentEmail || d.email || d.studentId || d.id).toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: d.studentId || d.id,
          name: d.studentName || d.name || "Unknown",
          email: d.studentEmail || d.email || "",
          classId: d.classId || "",
          className: d.className || "",
          schoolId: d.schoolId || "",
          branchId: d.branchId || "",
          teacherName: d.teacherName || "",
          status: "Active",
          ...d,
        });
      } else {
        const ex = map.get(key)!;
        map.set(key, {
          ...ex,
          className:   ex.className   || d.className   || "",
          classId:     ex.classId     || d.classId     || "",
          teacherName: ex.teacherName || d.teacherName || "",
        });
      }
    });

    const list = Array.from(map.values())
      .map(s => {
        const att = computeAttendance(s);
        const isAtRisk = (att.pct !== null && att.pct < 75);
        return {
          ...s,
          name:         s.name || s.studentName || "Unknown",
          initials:     (s.name || s.studentName || "S")
                          .split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
          gradeDisplay: s.className || s.classId || "—",
          status:       s.status || "Active",
          faculty:      teacherMapRef.current.get(s.teacherId) || s.teacherName || "—",
          attendance:   att.display,
          attPct:       att.pct,
          isAtRisk,
        };
      })
      .sort((a, b) => {
        // At-risk students first, then alphabetical
        if (a.isAtRisk && !b.isAtRisk) return -1;
        if (!a.isAtRisk && b.isAtRisk) return 1;
        return a.name.localeCompare(b.name);
      });

    setStudentsData(list);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    setLoading(true);

    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];

    const unsubEnroll = onSnapshot(query(collection(db, "enrollments"), ...C), snap => {
      enrollRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

    const unsubStudents = onSnapshot(query(collection(db, "students"), ...C), snap => {
      studentRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

    const unsubAtt = onSnapshot(query(collection(db, "attendance"), ...C), snap => {
      attRef.current = snap.docs.map(d => d.data());
      merge();
    });

    const unsubCls = onSnapshot(query(collection(db, "classes"), ...C), snap => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Teachers — build id→name map so enrollment rows show correct faculty
    const unsubTeachers = onSnapshot(query(collection(db, "teachers"), ...C), snap => {
      const m = new Map<string, string>();
      snap.docs.forEach(d => {
        const t = d.data();
        if (t.name) m.set(d.id, t.name);
      });
      teacherMapRef.current = m;
      merge();
    });

    return () => { unsubEnroll(); unsubStudents(); unsubAtt(); unsubCls(); unsubTeachers(); };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Add student ──────────────────────────────────────────────────────────────

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.classId) {
      return toast.error("Name and Class are required.");
    }
    if (!newStudent.email) {
      return toast.error("Email is required to enroll a student.");
    }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");

    const cls = classes.find(c => c.id === newStudent.classId);
    const sid = newStudent.email.toLowerCase().trim();
    const studentName = newStudent.name.trim();

    setSaving(true);
    try {
      // 1. Add to students collection
      await addDoc(collection(db, "students"), {
        name:        studentName,
        email:       sid,
        studentId:   sid,
        classId:     newStudent.classId,
        className:   cls?.name || "",
        teacherId:   cls?.teacherId || "",
        teacherName: cls?.teacherName || "",
        schoolId,
        branchId,
        status:      "Active",
        createdAt:   serverTimestamp(),
      });

      // 2. Add to enrollments — this makes student appear in teacher dashboard
      await addDoc(collection(db, "enrollments"), {
        studentId:    sid,
        studentEmail: sid,
        studentName:  studentName,
        classId:      newStudent.classId,
        className:    cls?.name || "",
        teacherId:    cls?.teacherId || "",
        teacherName:  cls?.teacherName || "",
        schoolId,
        branchId,
        createdAt:    serverTimestamp(),
      });

      // 3. Send welcome email (non-blocking — don't fail enrollment if email fails)
      if (sid) {
        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: sid,
            subject: `You've been enrolled — ${cls?.name || "Class"} | ${userData?.schoolName || "School"}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;">
                <h2 style="color:#1e3a8a;margin-bottom:8px;">Welcome, ${studentName}!</h2>
                <p style="color:#555;">You have been enrolled in <strong>${cls?.name || "your class"}</strong>.</p>
                <table style="margin:20px 0;width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;color:#888;font-size:13px;">School</td><td style="font-weight:bold;color:#333;">${userData?.schoolName || schoolId}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;font-size:13px;">Class</td><td style="font-weight:bold;color:#333;">${cls?.name || "—"}</td></tr>
                  ${cls?.teacherName ? `<tr><td style="padding:8px 0;color:#888;font-size:13px;">Teacher</td><td style="font-weight:bold;color:#333;">${cls.teacherName}</td></tr>` : ""}
                </table>
                <div style="margin:28px 0;text-align:center;">
                  <a href="https://parent-dashboard-ten.vercel.app/" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
                    Login to Student Portal
                  </a>
                </div>
                <p style="color:#aaa;font-size:12px;text-align:center;">Use your email (${sid}) to sign in.</p>
              </div>
            `,
          }),
        }).catch(() => {}); // silent fail — enrollment already saved
      }

      toast.success(`${studentName} enrolled & invitation sent!`);
      setIsAddModalOpen(false);
      setNewStudent({ name: "", email: "", classId: "" });
    } catch {
      toast.error("Enrollment failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Bulk Upload ──────────────────────────────────────────────────────────────

  const parseBulkFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb   = XLSX.read(data, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      const parsed: BulkStudent[] = rows.map(r => ({
        name:          String(r["Name"] || r["name"] || "").trim(),
        email:         String(r["Email"] || r["email"] || "").trim().toLowerCase(),
        class:         String(r["Class"] || r["class"] || "").trim(),
        rollNo:        String(r["RollNo"] || r["Roll No"] || r["roll_no"] || "").trim(),
        parentPhone:   String(r["ParentPhone"] || r["Parent Phone"] || "").trim(),
        admissionDate: String(r["AdmissionDate"] || r["Admission Date"] || "").trim(),
        _status:       "pending",
      })).filter(r => r.name && r.email);
      setBulkRows(parsed);
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const ws  = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "student_upload_template.xlsx");
  };

  const handleBulkUpload = async () => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");
    if (bulkRows.length === 0) return;

    setBulkUploading(true);

    // Build existing email set for duplicate detection
    const existingEmails = new Set(
      studentsData.map(s => (s.email || s.studentEmail || "").toLowerCase())
    );

    // Mark duplicates before writing
    const tagged = bulkRows.map(r => ({
      ...r,
      _status: existingEmails.has(r.email) ? ("duplicate" as const) : ("pending" as const),
    }));
    setBulkRows(tagged);

    const toWrite = tagged.filter(r => r._status === "pending");
    if (toWrite.length === 0) {
      toast.warning("All rows are duplicates — nothing to upload.");
      setBulkUploading(false);
      return;
    }

    // Firestore batch limit is 500 ops; 2 docs per student → 250 students per batch
    const BATCH_SIZE = 200;
    let successCount = 0;

    try {
      for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
        const chunk = toWrite.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(r => {
          // Find classId by class name match
          const cls = classes.find(c =>
            c.name?.toLowerCase() === r.class?.toLowerCase() ||
            c.id?.toLowerCase()   === r.class?.toLowerCase()
          );

          const studentDocRef = doc(collection(db, "students"));
          batch.set(studentDocRef, {
            name:          r.name,
            email:         r.email,
            studentId:     r.email,
            classId:       cls?.id || r.class || "",
            className:     cls?.name || r.class || "",
            teacherId:     cls?.teacherId || "",
            teacherName:   cls?.teacherName || "",
            rollNo:        r.rollNo || "",
            parentPhone:   r.parentPhone || "",
            admissionDate: r.admissionDate || "",
            schoolId,
            branchId,
            status:        "Active",
            createdAt:     serverTimestamp(),
          });

          const enrollDocRef = doc(collection(db, "enrollments"));
          batch.set(enrollDocRef, {
            studentId:    r.email,
            studentEmail: r.email,
            studentName:  r.name,
            classId:      cls?.id || r.class || "",
            className:    cls?.name || r.class || "",
            teacherId:    cls?.teacherId || "",
            teacherName:  cls?.teacherName || "",
            schoolId,
            branchId,
            createdAt:    serverTimestamp(),
          });
        });

        await batch.commit();
        successCount += chunk.length;

        // Fire invite emails in parallel — don't await so it doesn't slow the upload
        Promise.allSettled(
          chunk
            .filter(r => !!r.email)
            .map(r => {
              const cls = classes.find(c =>
                c.name?.toLowerCase() === r.class?.toLowerCase() ||
                c.id?.toLowerCase()   === r.class?.toLowerCase()
              );
              return sendEmail({
                to: r.email,
                subject: `You've been enrolled${cls ? ` — ${cls.name}` : ""}`,
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                    <div style="background:#1e3a8a;padding:24px 28px;">
                      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">EDUINTELLECT</h1>
                      <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Student Portal Invitation</p>
                    </div>
                    <div style="padding:28px;background:#fff;">
                      <h2 style="color:#1e293b;margin:0 0 12px;">Welcome, ${r.name}!</h2>
                      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">
                        You have been enrolled${cls ? ` in <strong>${cls.name}</strong>${cls.teacherName ? ` — Teacher: <strong>${cls.teacherName}</strong>` : ""}` : " at your school"}.
                      </p>
                      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
                        Log in with this email address (<strong>${r.email}</strong>) to access your student portal.
                      </p>
                      <div style="text-align:center;margin:24px 0;">
                        <a href="https://parent-dashboard-ten.vercel.app/"
                           style="background:#1e3a8a;color:#fff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
                          Go to Student Portal
                        </a>
                      </div>
                    </div>
                    <div style="background:#f1f5f9;padding:14px 28px;text-align:center;">
                      <p style="color:#94a3b8;font-size:11px;margin:0;">Powered by EduIntellect Cloud Architecture</p>
                    </div>
                  </div>
                `,
              });
            })
        ); // intentionally not awaited — emails sent in background
      }

      setBulkRows(prev => prev.map(r =>
        r._status === "pending" ? { ...r, _status: "success" as const } : r
      ));
      toast.success(`${successCount} students uploaded & invite emails sent!`);
    } catch (e: any) {
      toast.error("Bulk upload failed: " + e.message);
      setBulkRows(prev => prev.map(r =>
        r._status === "pending" ? { ...r, _status: "error" as const, _error: e.message } : r
      ));
    }
    setBulkUploading(false);
  };

  // ── Academic Year Archive ────────────────────────────────────────────────────

  const handleArchive = async () => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");

    setArchiving(true);
    try {
      const snap = await getDocs(
        query(collection(db, "students"), where("schoolId", "==", schoolId), where("branchId", "==", branchId))
      );

      if (snap.empty) {
        toast.warning("No students to archive.");
        setArchiving(false);
        return;
      }

      // Archive in chunks of 400 (each student = 1 write to archive)
      const BATCH_SIZE = 400;
      const docs = snap.docs;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const chunk = docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(d => {
          const archiveRef = doc(db, "students_archive", archiveYear, "students", d.id);
          batch.set(archiveRef, {
            ...d.data(),
            archivedAt:  serverTimestamp(),
            archiveYear: archiveYear,
          });
        });
        await batch.commit();
      }

      toast.success(`${docs.length} students archived to year ${archiveYear}!`);
      setShowArchiveModal(false);
    } catch (e: any) {
      toast.error("Archive failed: " + e.message);
    }
    setArchiving(false);
  };

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const headers = ["Name", "Email", "Class", "Branch", "Faculty", "Attendance", "Status"];
    const rows = studentsData.map(s => [
      s.name,
      s.email || s.studentEmail || "",
      s.gradeDisplay,
      s.branchId || userData?.branchId || "",
      s.faculty,
      s.attendance,
      s.status,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "students_export.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Export complete!");
  };

  // ── Pagination & filter ──────────────────────────────────────────────────────

  const filtered = studentsData.filter(s => {
    const matchSearch =
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.gradeDisplay?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || s.studentEmail || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchRisk = !atRiskFilter || s.isAtRisk;
    return matchSearch && matchRisk;
  });

  const atRiskCount = studentsData.filter(s => s.isAtRisk).length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset to page 1 when search changes
  useEffect(() => setCurrentPage(1), [searchTerm]);

  // ── Student profile view ─────────────────────────────────────────────────────

  if (selectedStudent) {
    // Navigate to JARVIS HUD profile page
    navigate(`/students/${selectedStudent.id}`);
    setSelectedStudent(null);
    return null;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 text-left">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-left">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Student Directory</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1e3a8a]" /> Real-time Enrollment Audit Engine
          </p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-[1.5rem] px-8 py-3 flex flex-col items-center shadow-sm">
          <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Total Scholars</span>
          <span className="text-2xl font-black text-slate-900 leading-none">{studentsData.length}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative max-w-xl flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-12 pr-6 py-4 text-sm font-bold border border-slate-100 rounded-2xl bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all"
            placeholder="Search roster..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* AT RISK filter toggle */}
          <button
            onClick={() => { setAtRiskFilter(f => !f); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border-2 ${
              atRiskFilter
                ? "bg-rose-500 text-white border-rose-500 shadow-rose-200"
                : "bg-white text-rose-500 border-rose-100 hover:border-rose-300"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            At Risk {atRiskCount > 0 && <span className={`ml-1 px-2 py-0.5 rounded-full text-[9px] font-black ${atRiskFilter ? "bg-white/30 text-white" : "bg-rose-100 text-rose-600"}`}>{atRiskCount}</span>}
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-[#1e3a8a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" /> Add Scholar
          </button>
          <button
            onClick={handleExport}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-100 transition-all shadow-sm"
          >
            <Download className="w-4 h-4 text-indigo-600" /> Export
          </button>
          <button
            onClick={() => { setBulkRows([]); setShowBulkModal(true); }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-emerald-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:border-emerald-300 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4" /> Bulk Upload
          </button>
          <button
            onClick={() => setShowArchiveModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-amber-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-amber-600 hover:border-amber-300 transition-all shadow-sm"
          >
            <Archive className="w-4 h-4" /> Archive Year
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2.5rem] border-2 border-slate-50 overflow-hidden shadow-sm">
        <div className="overflow-x-auto text-left">
          <table className="w-full text-sm text-left min-w-[700px]">
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
              ) : paginated.length > 0 ? (
                paginated.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/30 transition-colors group text-left">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600 shadow-sm border border-indigo-100 group-hover:scale-110 transition-transform">
                          {s.initials}
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-slate-800 leading-tight text-base uppercase italic">{s.name}</p>
                            {s.isAtRisk && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[8px] font-black uppercase tracking-wider">AT RISK</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-wider flex items-center gap-1">
                            <Hash className="w-3 h-3" /> {s.email || s.studentEmail || s.id?.slice(0, 10)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="flex items-center gap-2 text-slate-500 font-black uppercase text-[10px] tracking-widest">
                        <MapPin className="w-3.5 h-3.5 text-rose-400" />
                        {s.branchId || userData?.branchId || "Main"}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="px-4 py-1.5 bg-[#1e3a8a] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/10">
                        {s.gradeDisplay}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest max-w-[150px] truncate">
                          {s.faculty}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`text-sm font-black px-3 py-1.5 rounded-xl border ${
                        s.attendance === "—"
                          ? "text-slate-400 bg-slate-50 border-slate-100"
                          : parseInt(s.attendance) >= 75
                            ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                            : "text-rose-600 bg-rose-50 border-rose-100"
                      }`}>
                        {s.attendance}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-sm border ${
                        s.status === "Active"
                          ? "bg-green-50 text-green-600 border-green-100"
                          : "bg-blue-50 text-blue-600 border-blue-100"
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
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      {searchTerm ? "No search results found" : "No scholars found in registry"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > ITEMS_PER_PAGE && (
          <div className="px-4 sm:px-8 py-4 sm:py-6 border-t border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-2 rounded-xl border border-slate-100 hover:bg-slate-50 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                if (page > totalPages) return null;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-xl text-[11px] font-black transition-all ${
                      currentPage === page
                        ? "bg-[#1e3a8a] text-white shadow-lg"
                        : "border border-slate-100 text-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-2 rounded-xl border border-slate-100 hover:bg-slate-50 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bulk Upload Modal ────────────────────────────────────────────── */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="bg-emerald-700 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">Bulk Student Upload</h2>
                  <p className="text-xs text-emerald-200">Upload Excel / CSV to enroll multiple students</p>
                </div>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Upload zone */}
              <div className="border-2 border-dashed border-emerald-200 rounded-2xl p-6 text-center bg-emerald-50/40 hover:bg-emerald-50 transition-colors cursor-pointer"
                onClick={() => bulkFileRef.current?.click()}>
                <Upload className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Click to select Excel / CSV file</p>
                <p className="text-[10px] text-slate-400 mt-1">Columns: Name, Email, Class, RollNo, ParentPhone, AdmissionDate</p>
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) parseBulkFile(e.target.files[0]); e.target.value = ""; }}
                />
              </div>

              {/* Template download */}
              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-200 text-xs font-black text-emerald-600 hover:bg-emerald-50 transition-colors">
                <Download className="w-4 h-4" /> Download Template
              </button>

              {/* Preview table */}
              {bulkRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{bulkRows.length} rows detected</p>
                    <div className="flex gap-2 text-[9px] font-black uppercase">
                      <span className="text-slate-400">{bulkRows.filter(r => r._status === "pending").length} pending</span>
                      <span className="text-emerald-600">{bulkRows.filter(r => r._status === "success").length} done</span>
                      <span className="text-amber-500">{bulkRows.filter(r => r._status === "duplicate").length} dup</span>
                      <span className="text-rose-500">{bulkRows.filter(r => r._status === "error").length} err</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase">Name</th>
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase">Email</th>
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase">Class</th>
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {bulkRows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-semibold text-slate-700 truncate max-w-[120px]">{r.name}</td>
                            <td className="px-3 py-2 text-slate-400 truncate max-w-[160px]">{r.email}</td>
                            <td className="px-3 py-2 text-slate-500">{r.class || "—"}</td>
                            <td className="px-3 py-2 text-center">
                              {r._status === "pending"   && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black">PENDING</span>}
                              {r._status === "success"   && <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-600 text-[9px] font-black">DONE</span>}
                              {r._status === "duplicate" && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-600 text-[9px] font-black">DUP</span>}
                              {r._status === "error"     && <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-600 text-[9px] font-black" title={r._error}>ERR</span>}
                            </td>
                          </tr>
                        ))}
                        {bulkRows.length > 50 && (
                          <tr><td colSpan={4} className="px-3 py-2 text-center text-[10px] text-slate-400">+{bulkRows.length - 50} more rows</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowBulkModal(false)}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpload}
                  disabled={bulkUploading || bulkRows.filter(r => r._status === "pending").length === 0}
                  className="flex-1 h-11 rounded-xl bg-emerald-700 text-white text-xs font-black hover:bg-emerald-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {bulkUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {bulkUploading ? "Uploading..." : `Upload ${bulkRows.filter(r => r._status === "pending").length} Students`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Year Modal ───────────────────────────────────────────── */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !archiving && setShowArchiveModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="bg-amber-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Archive className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">Archive Academic Year</h2>
                  <p className="text-xs text-amber-200">Snapshot all students to archive collection</p>
                </div>
              </div>
              {!archiving && (
                <button onClick={() => setShowArchiveModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-amber-800">
                  This will copy all <strong>{studentsData.length} students</strong> into an archive collection under the selected year.
                  Original records will NOT be deleted — this is a snapshot only.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Archive Year</label>
                <input
                  type="number"
                  value={archiveYear}
                  onChange={e => setArchiveYear(e.target.value)}
                  min="2020"
                  max="2040"
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-700 outline-none focus:border-amber-400 transition-all"
                />
                <p className="text-[10px] text-slate-400 mt-1">Stored at: students_archive/{archiveYear}/students/...</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowArchiveModal(false)} disabled={archiving}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40">
                  Cancel
                </button>
                <button onClick={handleArchive} disabled={archiving}
                  className="flex-1 h-11 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {archiving ? "Archiving..." : "Archive Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Scholar Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[480px] rounded-[2rem] p-0 overflow-hidden bg-white">
          <div className="bg-[#1e3a8a] px-6 sm:px-10 py-6 sm:py-8">
            <DialogTitle className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <GraduationCap className="w-6 h-6" /> Add New Scholar
            </DialogTitle>
            <DialogDescription className="text-blue-200/60 font-bold uppercase text-[10px] tracking-widest mt-1">
              Institutional Enrollment Registry
            </DialogDescription>
          </div>

          <div className="p-6 sm:p-10 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Full Name *</Label>
              <Input
                placeholder="e.g. Rahul Sharma"
                value={newStudent.name}
                onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                className="rounded-xl border-slate-200 font-bold py-6 px-5 focus:ring-[#1e3a8a]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email</Label>
              <Input
                type="email"
                placeholder="student@example.com"
                value={newStudent.email}
                onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                className="rounded-xl border-slate-200 font-bold py-6 px-5"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Class *</Label>
              {classes.length > 0 ? (
                <select
                  value={newStudent.classId}
                  onChange={e => setNewStudent({ ...newStudent, classId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] appearance-none"
                >
                  <option value="">Select a class...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.grade ? ` — Grade ${c.grade}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm font-bold text-amber-700">
                  No classes found. Ask teacher to create classes first.
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddStudent}
                disabled={saving || !newStudent.name || !newStudent.classId}
                className="flex-1 bg-[#1e3a8a] text-white px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Scholar
              </button>
              <button
                onClick={() => { setIsAddModalOpen(false); setNewStudent({ name: "", email: "", classId: "" }); }}
                className="px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Students;
