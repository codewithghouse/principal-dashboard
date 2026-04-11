import { useState, useEffect, useRef } from "react";
import {
  CheckCircle, AlertCircle, XCircle, Loader2,
  GraduationCap, Users, BarChart2, CalendarCheck, Plus, X, UserPlus, UserCheck,
  Search as SearchIcon, Mail, Check
} from "lucide-react";
import ClassPerformance from "@/components/ClassPerformance";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp, updateDoc, doc, getDocs, writeBatch
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClassRow {
  id: string;
  name: string;
  grade: string;
  section: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  branchId: string;
  room?: string;
  status: string;
  studentCount: number;
  avgMarks: string;
  avgMarksNum: number;
  attendance: string;
  attendanceNum: number;
  healthScore: number;
  weakSubject: string;
}

interface GradeSummary {
  grade: string;
  sections: number;
  students: number;
  avgAttendance: number;
  healthScore: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const classStatus = (marks: number, att: number): string => {
  if (marks >= 70 && att >= 85) return "Good";
  if (marks < 45 || att < 70)  return "Weak";
  return "Average";
};

const statusIcon = (s: string) =>
  s === "Good" ? CheckCircle : s === "Weak" ? XCircle : AlertCircle;

const statusColor = (s: string) =>
  s === "Good" ? "text-green-600" : s === "Weak" ? "text-rose-600" : "text-amber-500";

const statusBadge = (s: string) =>
  s === "Good"
    ? "bg-green-50 text-green-700 border-green-100"
    : s === "Weak"
    ? "bg-rose-50 text-rose-700 border-rose-100"
    : "bg-amber-50 text-amber-700 border-amber-100";

const healthIcon = (h: number) =>
  h >= 75 ? CheckCircle : h < 50 ? XCircle : AlertCircle;

const healthColor = (h: number) =>
  h >= 75 ? "text-green-600" : h < 50 ? "text-rose-600" : "text-amber-500";

// ─────────────────────────────────────────────────────────────────────────────

const ClassesSections = () => {
  const { userData } = useAuth();

  const [loading, setLoading]               = useState(true);
  const [classes, setClasses]               = useState<ClassRow[]>([]);
  const [gradesSummary, setGradesSummary]   = useState<GradeSummary[]>([]);
  const [selectedSection, setSelectedSection] = useState<ClassRow | null>(null);
  const [addModal, setAddModal]             = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [newClass, setNewClass]             = useState({ name: "", grade: "", section: "", subject: "" });
  const [newClassTeacherId, setNewClassTeacherId] = useState("");

  const [teachers, setTeachers]             = useState<any[]>([]);
  const [assignModal, setAssignModal]       = useState(false);
  const [assigningClass, setAssigningClass] = useState<ClassRow | null>(null);
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assigning, setAssigning]           = useState(false);

  // ── Add Students modal state ───────────────────────────────────────────────
  const [studentModal,     setStudentModal]     = useState(false);
  const [studentModalClass, setStudentModalClass] = useState<ClassRow | null>(null);
  const [studentTab,       setStudentTab]       = useState<"existing" | "invite">("existing");
  const [schoolStudents,   setSchoolStudents]   = useState<any[]>([]);
  const [studentsLoading,  setStudentsLoading]  = useState(false);
  const [studentSearch,    setStudentSearch]    = useState("");
  const [selectedSids,     setSelectedSids]     = useState<string[]>([]);
  const [enrolling,        setEnrolling]        = useState(false);
  const [inviteStudentForm, setInviteStudentForm] = useState({ name: "", email: "" });
  const [inviting,         setInviting]         = useState(false);

  // Cross-listener refs
  const classesRef     = useRef<any[]>([]);
  const enrollRef      = useRef<any[]>([]);
  const attRef         = useRef<any[]>([]);
  const resultsRef     = useRef<any[]>([]);

  // ── Compute derived class rows from latest refs ────────────────────────────
  const compute = () => {
    const rows: ClassRow[] = classesRef.current.map(c => {
      // Student count from enrollments
      const enrolled = enrollRef.current.filter(e => e.classId === c.id);
      const studentCount = enrolled.length;

      // Attendance for this class
      const attRecs = attRef.current.filter(r => r.classId === c.id);
      let attendanceNum = 0;
      if (attRecs.length > 0) {
        const present = attRecs.filter(r => r.status === "present" || r.status === "late").length;
        attendanceNum = Math.round((present / attRecs.length) * 100);
      }

      // Results for this class — avg marks + weak subject
      const resRecs = resultsRef.current.filter(r => r.classId === c.id);
      let avgMarksNum = 0;
      let weakSubject = "—";

      if (resRecs.length > 0) {
        const totalScore = resRecs.reduce((a, r) => a + Number(r.percentage ?? r.score ?? 0), 0);
        avgMarksNum = Math.round(totalScore / resRecs.length);

        // Group by subject → find weakest
        const subMap: Record<string, { sum: number; count: number }> = {};
        resRecs.forEach(r => {
          const sub = r.subject || r.subjectName || "";
          if (!sub) return;
          if (!subMap[sub]) subMap[sub] = { sum: 0, count: 0 };
          subMap[sub].sum += Number(r.percentage ?? r.score ?? 0);
          subMap[sub].count++;
        });
        const subs = Object.entries(subMap)
          .map(([sub, v]) => ({ sub, avg: Math.round(v.sum / v.count) }))
          .sort((a, b) => a.avg - b.avg);
        if (subs.length > 0 && subs[0].avg < 60) weakSubject = subs[0].sub;
      }

      const status = classStatus(avgMarksNum, attendanceNum);
      const healthScore = attRecs.length > 0 || resRecs.length > 0
        ? Math.round((avgMarksNum * 0.5 + attendanceNum * 0.5))
        : 0;

      return {
        id: c.id,
        name: c.name || `${c.grade}${c.section || ""}`,
        grade: c.grade || "",
        section: c.section || "",
        subject: c.subject || "",
        teacherId: c.teacherId || "",
        teacherName: c.teacherName || "",
        schoolId: c.schoolId || "",
        branchId: c.branchId || "",
        room: c.room || "",
        status,
        studentCount,
        avgMarks: avgMarksNum > 0 ? `${avgMarksNum}%` : "—",
        avgMarksNum,
        attendance: attendanceNum > 0 ? `${attendanceNum}%` : "—",
        attendanceNum,
        healthScore,
        weakSubject,
      };
    });

    // Sort: by grade then section
    rows.sort((a, b) => {
      const ga = Number(a.grade) || a.grade;
      const gb = Number(b.grade) || b.grade;
      if (ga < gb) return -1;
      if (ga > gb) return 1;
      return a.section.localeCompare(b.section);
    });

    setClasses(rows);

    // Build grade summary
    const gradeMap: Record<string, { sections: number; students: number; attSum: number; healthSum: number; count: number }> = {};
    rows.forEach(r => {
      const g = r.grade || "Other";
      if (!gradeMap[g]) gradeMap[g] = { sections: 0, students: 0, attSum: 0, healthSum: 0, count: 0 };
      gradeMap[g].sections++;
      gradeMap[g].students += r.studentCount;
      gradeMap[g].attSum   += r.attendanceNum;
      gradeMap[g].healthSum += r.healthScore;
      gradeMap[g].count++;
    });

    const summary: GradeSummary[] = Object.entries(gradeMap)
      .map(([grade, v]) => ({
        grade,
        sections: v.sections,
        students: v.students,
        avgAttendance: v.count > 0 ? Math.round(v.attSum / v.count) : 0,
        healthScore:   v.count > 0 ? Math.round(v.healthSum / v.count) : 0,
      }))
      .sort((a, b) => {
        const na = Number(a.grade), nb = Number(b.grade);
        return isNaN(na) || isNaN(nb) ? a.grade.localeCompare(b.grade) : na - nb;
      });

    setGradesSummary(summary);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    setLoading(true);
    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(query(collection(db, "classes"),     ...C), snap => { classesRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() })); compute(); }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "enrollments"), ...C), snap => { enrollRef.current  = snap.docs.map(d => d.data()); compute(); }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "attendance"),  ...C), snap => { attRef.current     = snap.docs.map(d => d.data()); compute(); }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "results"),     ...C), snap => { resultsRef.current = snap.docs.map(d => d.data()); compute(); }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "teachers"),    ...C), snap => { setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, () => {}));

    return () => unsubs.forEach(u => u());
  }, [userData?.schoolId, userData?.branchId]);

  // ── Add class ────────────────────────────────────────────────────────────────
  const handleAddClass = async () => {
    if (!newClass.name.trim() || !newClass.grade.trim()) {
      return toast.error("Class name and grade are required.");
    }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");

    const selectedTeacher = teachers.find(t => t.id === newClassTeacherId);

    setSaving(true);
    try {
      const classRef = await addDoc(collection(db, "classes"), {
        name:        newClass.name.trim(),
        grade:       newClass.grade.trim(),
        section:     newClass.section.trim(),
        subject:     newClass.subject.trim(),
        teacherId:   selectedTeacher?.id   || "",
        teacherName: selectedTeacher?.name || "",
        schoolId,
        branchId,
        status: "Active",
        createdAt: serverTimestamp(),
      });

      if (selectedTeacher) {
        await addDoc(collection(db, "teaching_assignments"), {
          teacherId:   selectedTeacher.id,
          classId:     classRef.id,
          subjectName: newClass.subject.trim(),
          schoolId,
          branchId,
          status: "active",
          createdAt: serverTimestamp(),
        });
      }

      toast.success(`Class "${newClass.name}" created!${selectedTeacher ? ` Assigned to ${selectedTeacher.name}.` : ""}`);
      setAddModal(false);
      setNewClass({ name: "", grade: "", section: "", subject: "" });
      setNewClassTeacherId("");
    } catch {
      toast.error("Could not create class.");
    } finally {
      setSaving(false);
    }
  };

  // ── Assign teacher to existing class ────────────────────────────────────────
  const handleAssignTeacher = async () => {
    if (!assigningClass || !assignTeacherId) return toast.error("Please select a teacher.");
    const teacher = teachers.find(t => t.id === assignTeacherId);
    if (!teacher) return;

    setAssigning(true);
    try {
      // 1. Update class doc
      await updateDoc(doc(db, "classes", assigningClass.id), {
        teacherId:   teacher.id,
        teacherName: teacher.name || "",
      });

      // 2. Upsert teaching_assignment
      await addDoc(collection(db, "teaching_assignments"), {
        teacherId:   teacher.id,
        classId:     assigningClass.id,
        subjectName: assigningClass.subject || "",
        schoolId:    assigningClass.schoolId,
        branchId:    assigningClass.branchId,
        status:      "active",
        createdAt:   serverTimestamp(),
      });

      // 3. Update all enrollments for this class
      const enrollSnap = await getDocs(
        query(collection(db, "enrollments"), where("classId", "==", assigningClass.id))
      );
      if (!enrollSnap.empty) {
        const batch = writeBatch(db);
        enrollSnap.docs.forEach(d => {
          batch.update(d.ref, { teacherId: teacher.id, teacherName: teacher.name || "" });
        });
        await batch.commit();
      }

      toast.success(`${teacher.name} assigned to ${assigningClass.name}!`);
      setAssignModal(false);
      setAssigningClass(null);
      setAssignTeacherId("");
    } catch {
      toast.error("Failed to assign teacher. Try again.");
    } finally {
      setAssigning(false);
    }
  };

  // ── Add Students to class ────────────────────────────────────────────────────
  const openStudentModal = async (cls: ClassRow) => {
    setStudentModalClass(cls);
    setStudentModal(true);
    setStudentTab("existing");
    setStudentSearch("");
    setSelectedSids([]);
    setInviteStudentForm({ name: "", email: "" });
    setStudentsLoading(true);
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setStudentsLoading(false); return; }
    try {
      const [studentSnap, enrollSnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolId", "==", schoolId), where("branchId", "==", branchId))),
        getDocs(query(collection(db, "enrollments"), where("classId", "==", cls.id), where("schoolId", "==", schoolId))),
      ]);
      const enrolledIds = new Set([
        ...enrollSnap.docs.map(d => d.data().studentId),
        ...enrollSnap.docs.map(d => (d.data().studentEmail || "").toLowerCase()),
      ]);
      setSchoolStudents(
        studentSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(s => !enrolledIds.has(s.id) && !enrolledIds.has((s.email || "").toLowerCase()))
      );
    } catch { }
    setStudentsLoading(false);
  };

  const handleAddExistingToClass = async () => {
    if (!studentModalClass || selectedSids.length === 0) return toast.error("Select at least one student.");
    setEnrolling(true);
    try {
      const toAdd = schoolStudents.filter(s => selectedSids.includes(s.id));
      for (const s of toAdd) {
        await addDoc(collection(db, "enrollments"), {
          studentId:    s.id,
          studentEmail: (s.email || "").toLowerCase(),
          studentName:  s.name || "",
          classId:      studentModalClass.id,
          className:    studentModalClass.name,
          teacherId:    studentModalClass.teacherId   || "",
          teacherName:  studentModalClass.teacherName || "",
          schoolId:     studentModalClass.schoolId,
          branchId:     studentModalClass.branchId,
          createdAt:    serverTimestamp(),
        });
      }
      toast.success(`${toAdd.length} student${toAdd.length > 1 ? "s" : ""} added to ${studentModalClass.name}!`);
      setStudentModal(false);
      setSelectedSids([]);
    } catch {
      toast.error("Failed to add students. Try again.");
    }
    setEnrolling(false);
  };

  const handleInviteStudentToClass = async () => {
    if (!studentModalClass) return;
    if (!inviteStudentForm.name.trim() || !inviteStudentForm.email.trim())
      return toast.error("Name and email are required.");
    setInviting(true);
    const email = inviteStudentForm.email.toLowerCase().trim();
    const name  = inviteStudentForm.name.trim();
    const cls   = studentModalClass;
    try {
      await addDoc(collection(db, "students"), {
        name, email, studentId: email,
        classId:     cls.id,   className:   cls.name,
        teacherId:   cls.teacherId   || "",
        teacherName: cls.teacherName || "",
        schoolId:    cls.schoolId,
        branchId:    cls.branchId,
        status:      "Active",      createdAt:   serverTimestamp(),
      });
      await addDoc(collection(db, "enrollments"), {
        studentId:    email,
        studentEmail: email,
        studentName:  name,
        classId:      cls.id,   className:   cls.name,
        teacherId:    cls.teacherId   || "",
        teacherName:  cls.teacherName || "",
        schoolId:     cls.schoolId,
        branchId:     cls.branchId,
        createdAt:    serverTimestamp(),
      });
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `You've been enrolled — ${cls.name}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;"><h2 style="color:#1e3a8a;margin-bottom:8px;">Welcome, ${name}!</h2><p style="color:#555;">You have been enrolled in <strong>${cls.name}</strong>${cls.teacherName ? ` — Teacher: <strong>${cls.teacherName}</strong>` : ""}.</p><div style="margin:28px 0;text-align:center;"><a href="https://parent-dashboard-ten.vercel.app/" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Go to Student Portal</a></div><p style="color:#aaa;font-size:12px;text-align:center;">Use your email (${email}) to sign in.</p></div>`,
        }),
      }).catch(() => {});
      toast.success(`${name} enrolled & invitation sent!`);
      setInviteStudentForm({ name: "", email: "" });
      setStudentModal(false);
    } catch {
      toast.error("Failed to enroll student. Try again.");
    }
    setInviting(false);
  };

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selectedSection) {
    return (
      <ClassPerformance
        classDoc={selectedSection}
        onBack={() => setSelectedSection(null)}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Classes & Sections</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">Overview of all classes and sections</p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" /> Add Class
        </button>
      </div>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm">
          <Loader2 className="w-10 h-10 animate-spin text-slate-300 mb-4" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Classes...</p>
        </div>
      ) : (
        <>
          {/* Grade Summary Cards */}
          {gradesSummary.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {gradesSummary.map(g => {
                const Icon = healthIcon(g.healthScore);
                return (
                  <div key={g.grade} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-black text-slate-900">Grade {g.grade}</h3>
                      <Icon className={`w-5 h-5 ${healthColor(g.healthScore)}`} />
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Sections</span>
                        <span className="font-black text-slate-900">{g.sections}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Students</span>
                        <span className="font-black text-slate-900">{g.students}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Avg Attendance</span>
                        <span className={`font-black ${g.avgAttendance >= 85 ? "text-green-600" : g.avgAttendance >= 70 ? "text-amber-500" : "text-rose-600"}`}>
                          {g.avgAttendance > 0 ? `${g.avgAttendance}%` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Health Score</span>
                        <span className={`font-black ${healthColor(g.healthScore)}`}>
                          {g.healthScore > 0 ? `${g.healthScore}/100` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Section Performance Table */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Section Performance</h2>
              <span className="text-xs text-slate-400 font-medium">{classes.length} class{classes.length !== 1 ? "es" : ""}</span>
            </div>

            {classes.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                  <GraduationCap className="w-10 h-10 text-slate-200" />
                </div>
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No classes found</p>
                <p className="text-xs text-slate-300 mt-2">Add a class or wait for teachers to create classes</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Section</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Class Teacher</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Students</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Avg Marks</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Attendance</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Weak Subject</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {classes.map(cls => {
                      const Icon = statusIcon(cls.status);
                      return (
                        <tr key={cls.id} className="hover:bg-slate-50/30 transition-colors group">
                          {/* Section */}
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm ${
                                cls.status === "Good" ? "bg-green-500" :
                                cls.status === "Weak" ? "bg-rose-500" : "bg-amber-500"
                              }`}>
                                {cls.name.slice(0, 3)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{cls.name}</p>
                                {cls.subject && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{cls.subject}</p>}
                              </div>
                            </div>
                          </td>

                          {/* Teacher */}
                          <td className="px-6 py-5">
                            {cls.teacherName ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span className="text-sm font-medium text-slate-700">{cls.teacherName}</span>
                                </div>
                                <button
                                  onClick={() => { setAssigningClass(cls); setAssignTeacherId(cls.teacherId || ""); setAssignModal(true); }}
                                  className="text-[10px] text-blue-500 hover:text-blue-700 font-bold underline underline-offset-2"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAssigningClass(cls); setAssignTeacherId(""); setAssignModal(true); }}
                                className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-bold hover:bg-amber-100 transition-colors"
                              >
                                <UserPlus className="w-3 h-3" /> Assign Teacher
                              </button>
                            )}
                          </td>

                          {/* Students */}
                          <td className="px-6 py-5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-black text-slate-900">{cls.studentCount}</span>
                            </div>
                          </td>

                          {/* Avg Marks */}
                          <td className="px-6 py-5 text-center">
                            <span className={`font-black text-base ${
                              cls.avgMarksNum >= 70 ? "text-green-600" :
                              cls.avgMarksNum >= 50 ? "text-amber-500" :
                              cls.avgMarksNum > 0   ? "text-rose-600" : "text-slate-300"
                            }`}>
                              {cls.avgMarks}
                            </span>
                          </td>

                          {/* Attendance */}
                          <td className="px-6 py-5 text-center">
                            <span className={`font-black text-base ${
                              cls.attendanceNum >= 85 ? "text-green-600" :
                              cls.attendanceNum >= 70 ? "text-amber-500" :
                              cls.attendanceNum > 0   ? "text-rose-600" : "text-slate-300"
                            }`}>
                              {cls.attendance}
                            </span>
                          </td>

                          {/* Weak Subject */}
                          <td className="px-6 py-5">
                            <span className={`text-sm font-medium ${cls.weakSubject !== "—" ? "text-rose-500" : "text-slate-300"}`}>
                              {cls.weakSubject}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${statusColor(cls.status)}`} />
                              <span className={`text-sm font-bold ${statusColor(cls.status)}`}>{cls.status}</span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openStudentModal(cls)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-black hover:bg-indigo-100 transition-colors"
                                title="Add students to this class"
                              >
                                <UserPlus className="w-3.5 h-3.5" /> Students
                              </button>
                              <button
                                onClick={() => setSelectedSection(cls)}
                                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-[#1e3a8a] transition-colors shadow-sm"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Add Class Modal ── */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add New Class</h3>
              <button onClick={() => setAddModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Class Name *</label>
                <input
                  type="text"
                  placeholder="e.g. 9A, Class 10B"
                  value={newClass.name}
                  onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Grade *</label>
                  <input
                    type="text"
                    placeholder="e.g. 9, 10"
                    value={newClass.grade}
                    onChange={e => setNewClass(p => ({ ...p, grade: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Section</label>
                  <input
                    type="text"
                    placeholder="e.g. A, B"
                    value={newClass.section}
                    onChange={e => setNewClass(p => ({ ...p, section: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Subject (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Mathematics, Science"
                  value={newClass.subject}
                  onChange={e => setNewClass(p => ({ ...p, subject: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Assign Class Teacher (optional)</label>
                <select
                  value={newClassTeacherId}
                  onChange={e => setNewClassTeacherId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-white appearance-none"
                >
                  <option value="">— Assign later —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.subject ? ` · ${t.subject}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setAddModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddClass}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Students Modal ── */}
      {studentModal && studentModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#1e3a8a]" /> Add Students to {studentModalClass.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Assign existing students or invite new ones</p>
              </div>
              <button onClick={() => setStudentModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 shrink-0">
              <button onClick={() => setStudentTab("existing")} className={`flex-1 py-3 text-sm font-bold transition-colors ${studentTab === "existing" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                From School List
              </button>
              <button onClick={() => setStudentTab("invite")} className={`flex-1 py-3 text-sm font-bold transition-colors ${studentTab === "invite" ? "text-[#1e3a8a] border-b-2 border-[#1e3a8a]" : "text-slate-400 hover:text-slate-600"}`}>
                Invite New Student
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {studentTab === "existing" ? (
                <div className="space-y-4">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search by name or email..." value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  {studentsLoading ? (
                    <div className="py-12 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                  ) : (() => {
                    const filtered = schoolStudents.filter(s =>
                      (s.name || "").toLowerCase().includes(studentSearch.toLowerCase()) ||
                      (s.email || "").toLowerCase().includes(studentSearch.toLowerCase())
                    );
                    return filtered.length === 0 ? (
                      <div className="py-12 text-center">
                        <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">
                          {schoolStudents.length === 0 ? "All school students are already in this class." : "No students match your search."}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">Use "Invite New Student" to add someone new.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSids.length > 0 && (
                          <p className="text-xs font-bold text-[#1e3a8a] mb-1">{selectedSids.length} selected</p>
                        )}
                        {filtered.map((s: any) => {
                          const isSel = selectedSids.includes(s.id);
                          return (
                            <div key={s.id} onClick={() => setSelectedSids(prev => isSel ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSel ? "bg-blue-50 border-[#1e3a8a]/30" : "border-slate-100 hover:bg-slate-50"}`}
                            >
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? "bg-[#1e3a8a] border-[#1e3a8a]" : "border-slate-300"}`}>
                                {isSel && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-600 shrink-0">
                                {(s.name || "S").substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{s.name || "Unknown"}</p>
                                <p className="text-xs text-slate-400 truncate">{s.email}</p>
                              </div>
                              {s.className && s.className !== studentModalClass.name && (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">{s.className}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Student Name *</label>
                    <input type="text" placeholder="e.g. Rahul Sharma" value={inviteStudentForm.name}
                      onChange={e => setInviteStudentForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Email Address *</label>
                    <input type="email" placeholder="student@example.com" value={inviteStudentForm.email}
                      onChange={e => setInviteStudentForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                    <Mail className="w-4 h-4 text-[#1e3a8a] shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600">Student will receive an email invitation with their login link.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-100 shrink-0">
              <button onClick={() => setStudentModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              {studentTab === "existing" ? (
                <button onClick={handleAddExistingToClass} disabled={enrolling || selectedSids.length === 0}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {enrolling ? "Adding..." : `Add${selectedSids.length > 0 ? ` (${selectedSids.length})` : ""}`}
                </button>
              ) : (
                <button onClick={handleInviteStudentToClass} disabled={inviting || !inviteStudentForm.name || !inviteStudentForm.email}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {inviting ? "Inviting..." : "Invite & Enroll"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Teacher Modal ── */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#1e3a8a]" />
                  {assigningClass?.teacherName ? "Change Class Teacher" : "Assign Class Teacher"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{assigningClass?.name}</p>
              </div>
              <button
                onClick={() => { setAssignModal(false); setAssigningClass(null); setAssignTeacherId(""); }}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Select Teacher *</label>
                {teachers.length === 0 ? (
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-medium text-amber-700">
                    No teachers found. Add teachers first from the Teachers page.
                  </div>
                ) : (
                  <select
                    value={assignTeacherId}
                    onChange={e => setAssignTeacherId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-white appearance-none"
                  >
                    <option value="">— Select a teacher —</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.subject ? ` · ${t.subject}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {assigningClass?.teacherName && (
                <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                  Current teacher: <span className="font-bold text-slate-600">{assigningClass.teacherName}</span>
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setAssignModal(false); setAssigningClass(null); setAssignTeacherId(""); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignTeacher}
                  disabled={assigning || !assignTeacherId}
                  className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  {assigning ? "Assigning..." : "Assign Teacher"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassesSections;
