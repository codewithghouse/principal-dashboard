import { useState, useEffect } from "react";
import {
  ChevronLeft, Send, CalendarCheck, GraduationCap, FileText,
  AlertCircle, TrendingDown, Clock, Mail, User,
  UserCheck, UserX, Loader2, BookOpen, Shield, MessageSquare,
  Printer, UserCog, X, Calendar, AlertTriangle
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

interface Props {
  student: any;
  onBack: () => void;
}

const TABS = ["Overview", "Academic", "Attendance", "Discipline", "Parent Communication"] as const;
type Tab = typeof TABS[number];

const StudentProfile = ({ student, onBack }: Props) => {
  const [activeTab, setActiveTab]       = useState<Tab>("Overview");
  const [attRecords, setAttRecords]     = useState<any[]>([]);
  const [results, setResults]           = useState<any[]>([]);
  const [incidents, setIncidents]       = useState<any[]>([]);
  const [teachers, setTeachers]         = useState<any[]>([]);
  const [parentNotes, setParentNotes]   = useState<any[]>([]);
  const [parentMeetings, setParentMeetings] = useState<any[]>([]);
  const [studentFlags, setStudentFlags] = useState<any[]>([]);
  const [noteText, setNoteText]         = useState("");
  const [fetching, setFetching]         = useState(true);

  // Quick action modals
  const [meetingModal, setMeetingModal]     = useState(false);
  const [counselorModal, setCounselorModal] = useState(false);
  const [remedialModal, setRemedialModal]   = useState(false);
  const [savingAction, setSavingAction]     = useState(false);
  const [notifyingParent, setNotifyingParent] = useState(false);

  const [meetingForm, setMeetingForm]     = useState({ date: "", time: "", purpose: "" });
  const [counselorForm, setCounselorForm] = useState({ name: "", notes: "" });
  const [remedialForm, setRemedialForm]   = useState({ className: "", reason: "" });

  const studentId    = student.id || student.studentId || "";
  const studentEmail = (student.email || student.studentEmail || "").toLowerCase();
  const classId      = student.classId || "";
  const schoolId     = student.schoolId || "";
  const branchId     = student.branchId || "";

  useEffect(() => {
    if (!schoolId) { setFetching(false); return; }
    if (!studentId && !studentEmail) { setFetching(false); return; }

    const scopeC: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) scopeC.push(where("branchId", "==", branchId));

    const fetchAll = async () => {
      setFetching(true);
      try {
        // Attendance
        const attIdentC = studentEmail
          ? [where("studentEmail", "==", studentEmail)]
          : [where("studentId", "==", studentId)];
        const attSnap = await getDocs(query(collection(db, "attendance"), ...scopeC, ...attIdentC));
        setAttRecords(attSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")));

        // Results / scores
        const resIdentC = studentEmail
          ? [where("studentEmail", "==", studentEmail)]
          : [where("studentId", "==", studentId)];
        const resSnap = await getDocs(query(collection(db, "results"), ...scopeC, ...resIdentC));
        setResults(resSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));

        // Discipline incidents
        const incIdentC = studentEmail
          ? [where("studentEmail", "==", studentEmail)]
          : [where("studentId", "==", studentId)];
        const incSnap = await getDocs(query(collection(db, "incidents"), ...scopeC, ...incIdentC));
        setIncidents(incSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));

        // Parent notes
        if (studentId) {
          const noteSnap = await getDocs(query(collection(db, "parent_notes"), ...scopeC, where("studentId", "==", studentId)));
          setParentNotes(noteSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        }

        // Parent meetings
        const meetIdentC = studentId
          ? [where("studentId", "==", studentId)]
          : studentEmail
            ? [where("studentEmail", "==", studentEmail)]
            : null;
        if (meetIdentC) {
          const meetSnap = await getDocs(query(collection(db, "parent_meetings"), ...scopeC, ...meetIdentC));
          setParentMeetings(meetSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        }

        // Student flags (counselor assignments, remedial, etc.)
        if (studentId) {
          const flagSnap = await getDocs(query(collection(db, "student_flags"), ...scopeC, where("studentId", "==", studentId)));
          setStudentFlags(flagSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        }

        // Teachers via teaching_assignments for this class
        if (classId) {
          const taSnap = await getDocs(query(collection(db, "teaching_assignments"), ...scopeC, where("classId", "==", classId)));
          const tIds = [...new Set(taSnap.docs.map(d => d.data().teacherId).filter(Boolean))];
          if (tIds.length > 0) {
            const tSnap = await getDocs(query(collection(db, "teachers"), ...scopeC));
            const filtered = tSnap.docs
              .filter(d => tIds.includes(d.id))
              .map(d => ({ id: d.id, ...d.data() }));
            setTeachers(filtered);
            if (filtered.length === 0 && student.teacherName) {
              setTeachers([{ name: student.teacherName, subject: "Class Teacher" }]);
            }
          } else if (student.teacherName) {
            setTeachers([{ name: student.teacherName, subject: "Class Teacher" }]);
          }
        }
      } catch (e) {
        console.error("Profile fetch error:", e);
      } finally {
        setFetching(false);
      }
    };

    fetchAll();
  }, [studentId, studentEmail, classId, schoolId, branchId]);

  // ── Computed values ──────────────────────────────────────────────────────────

  const presentCount  = attRecords.filter(r => r.status === "present").length;
  const lateCount     = attRecords.filter(r => r.status === "late").length;
  const absentCount   = attRecords.filter(r => r.status === "absent").length;
  const totalAtt      = attRecords.length;
  const attPct        = totalAtt > 0 ? Math.round(((presentCount + lateCount) / totalAtt) * 100) : 0;

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + Number(r.percentage || r.score || 0), 0) / results.length)
    : null;

  const isAtRisk = (attPct > 0 && attPct < 75) || (avgScore !== null && avgScore < 50);

  // Group results by subject
  const subjectMap: Record<string, { scores: number[]; subject: string }> = {};
  results.forEach(r => {
    const sub = r.subject || r.subjectName || r.className || "General";
    if (!subjectMap[sub]) subjectMap[sub] = { scores: [], subject: sub };
    subjectMap[sub].scores.push(Number(r.percentage || r.score || 0));
  });
  const subjectAvgs = Object.values(subjectMap).map(s => ({
    subject: s.subject,
    avg: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length),
  })).slice(0, 6);

  // ── Counselor assignment check ───────────────────────────────────────────────
  const counselorFlag = studentFlags.find(f => f.type === "counselor_assigned" && f.status === "active");
  const remedialFlag  = studentFlags.find(f => f.type === "remedial_referral"  && f.status === "active");

  // ── Action handlers ──────────────────────────────────────────────────────────

  const handleNotifyParent = async () => {
    const email = studentEmail;
    if (!email) return toast.error("No email address found for this student.");
    setNotifyingParent(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `Important School Notification — ${name}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;">
              <h2 style="color:#1e3a8a;margin-bottom:8px;">School Notification</h2>
              <p style="color:#555;">This is an important notification regarding <strong>${name}</strong> from the school administration.</p>
              ${attPct > 0 && attPct < 75 ? `<p style="color:#dc2626;font-weight:bold;">⚠️ Attendance Alert: Current attendance is ${attPct}%, below the 75% threshold.</p>` : ""}
              ${avgScore !== null && avgScore < 50 ? `<p style="color:#dc2626;font-weight:bold;">⚠️ Academic Alert: Average score is ${avgScore}%, below the passing threshold.</p>` : ""}
              <p style="color:#888;font-size:12px;margin-top:24px;">Please contact the school for further details.</p>
            </div>
          `,
        }),
      });
      if (res.ok) {
        toast.success("Notification sent to parent!");
        // Log this notification as a parent note
        await addDoc(collection(db, "parent_notes"), {
          studentId, studentName: name, studentEmail,
          note: `Automated notification sent to parent email (${email}).`,
          type: "notification", schoolId, branchId,
          createdAt: serverTimestamp(),
        });
        setParentNotes(prev => [{ note: `Automated notification sent to parent email (${email}).`, type: "notification", createdAt: { seconds: Date.now() / 1000 } }, ...prev]);
      } else {
        toast.error("Email delivery failed. Please try again.");
      }
    } catch {
      toast.error("Could not send notification.");
    } finally {
      setNotifyingParent(false);
    }
  };

  const handleScheduleMeeting = async () => {
    if (!meetingForm.date || !meetingForm.purpose.trim()) {
      return toast.error("Date and purpose are required.");
    }
    setSavingAction(true);
    try {
      const doc = {
        studentId, studentName: name, studentEmail,
        date: meetingForm.date, time: meetingForm.time,
        purpose: meetingForm.purpose.trim(),
        status: "scheduled", schoolId, branchId,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "parent_meetings"), doc);
      setParentMeetings(prev => [{ ...doc, createdAt: { seconds: Date.now() / 1000 } }, ...prev]);
      setMeetingForm({ date: "", time: "", purpose: "" });
      setMeetingModal(false);
      toast.success("Parent meeting scheduled!");
    } catch {
      toast.error("Could not schedule meeting.");
    } finally {
      setSavingAction(false);
    }
  };

  const handleAssignCounselor = async () => {
    if (!counselorForm.name.trim()) return toast.error("Counselor name is required.");
    setSavingAction(true);
    try {
      const doc = {
        studentId, studentName: name, studentEmail,
        type: "counselor_assigned",
        counselorName: counselorForm.name.trim(),
        notes: counselorForm.notes.trim(),
        status: "active", schoolId, branchId,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "student_flags"), doc);
      setStudentFlags(prev => [{ ...doc, createdAt: { seconds: Date.now() / 1000 } }, ...prev]);
      setCounselorForm({ name: "", notes: "" });
      setCounselorModal(false);
      toast.success(`Assigned to counselor: ${counselorForm.name.trim()}`);
    } catch {
      toast.error("Could not assign counselor.");
    } finally {
      setSavingAction(false);
    }
  };

  const handleEnrollRemedial = async () => {
    if (!remedialForm.className.trim()) return toast.error("Class name is required.");
    setSavingAction(true);
    try {
      const doc = {
        studentId, studentName: name, studentEmail,
        type: "remedial_referral",
        className: remedialForm.className.trim(),
        reason: remedialForm.reason.trim(),
        status: "active", schoolId, branchId,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "student_flags"), doc);
      setStudentFlags(prev => [{ ...doc, createdAt: { seconds: Date.now() / 1000 } }, ...prev]);
      setRemedialForm({ className: "", reason: "" });
      setRemedialModal(false);
      toast.success("Enrolled in remedial class!");
    } catch {
      toast.error("Could not process enrollment.");
    } finally {
      setSavingAction(false);
    }
  };

  const handleGenerateReport = () => {
    // HTML escaping — blocks stored XSS from any Firestore-sourced field
    // (student name, subject, incident title, etc.).
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
      ));

    const subjectRows = subjectAvgs.map((s: any) => {
      const color = s.avg >= 60 ? "#16a34a" : s.avg >= 40 ? "#d97706" : "#dc2626";
      return `<tr><td>${esc(s.subject)}</td><td style="color:${color};font-weight:bold">${esc(s.avg)}%</td></tr>`;
    }).join("");

    const attRows = attRecords.slice(0, 20).map((r: any) => {
      const color = r.status === "present" ? "#16a34a" : r.status === "absent" ? "#dc2626" : "#d97706";
      return `<tr><td>${esc(r.date || "—")}</td><td>${esc(r.className || "—")}</td><td style="color:${color};font-weight:bold;text-transform:capitalize">${esc(r.status)}</td></tr>`;
    }).join("");

    const incRows = incidents.map((inc: any) => {
      const date = inc.date || (inc.createdAt?.seconds ? new Date(inc.createdAt.seconds * 1000).toLocaleDateString() : "—");
      return `<tr><td>${esc(date)}</td><td>${esc(inc.title || inc.type || "Incident")}</td><td>${esc(inc.severity || "—")}</td></tr>`;
    }).join("");

    const html = `
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Progress Report — ${esc(name)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; padding: 48px; max-width: 820px; margin: auto; color: #1e293b; }
        .header { border-bottom: 3px solid #1e3a8a; padding-bottom: 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-start; }
        .title { font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
        h1 { font-size: 28px; color: #1e3a8a; margin: 6px 0 4px; }
        .sub { font-size: 14px; color: #64748b; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .risk { background: #fee2e2; color: #dc2626; }
        .ok   { background: #dcfce7; color: #16a34a; }
        .warn { background: #fef3c7; color: #d97706; }
        section { margin-bottom: 32px; }
        h2 { font-size: 16px; color: #1e3a8a; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 6px; }
        .stat-value { font-size: 24px; font-weight: 900; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
        td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
        .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
        @media print { body { padding: 24px; } }
      </style></head><body>
      <div class="header">
        <div>
          <div class="title">Student Progress Report</div>
          <h1>${esc(name)}</h1>
          <div class="sub">${esc(student.gradeDisplay || student.className || "—")} &nbsp;•&nbsp; ${esc(studentEmail || "No email")}</div>
        </div>
        <div style="text-align:right">
          ${isAtRisk ? '<span class="badge risk">AT RISK</span>' : '<span class="badge ok">On Track</span>'}
          <div style="font-size:12px;color:#94a3b8;margin-top:8px;">Generated ${esc(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }))}</div>
        </div>
      </div>

      <section>
        <h2>Attendance Summary</h2>
        <div class="stats">
          <div class="stat"><div class="stat-label">Total Days</div><div class="stat-value">${esc(totalAtt)}</div></div>
          <div class="stat"><div class="stat-label">Present</div><div class="stat-value" style="color:#16a34a">${esc(presentCount)}</div></div>
          <div class="stat"><div class="stat-label">Absent</div><div class="stat-value" style="color:#dc2626">${esc(absentCount)}</div></div>
          <div class="stat"><div class="stat-label">Percentage</div><div class="stat-value" style="color:${attPct >= 75 ? "#16a34a" : "#dc2626"}">${totalAtt > 0 ? esc(attPct) + "%" : "—"}</div></div>
        </div>
        ${attRows ? `<table><thead><tr><th>Date</th><th>Class</th><th>Status</th></tr></thead><tbody>${attRows}</tbody></table>` : "<p style='color:#94a3b8;font-size:13px'>No attendance records.</p>"}
      </section>

      ${subjectAvgs.length > 0 ? `
      <section>
        <h2>Academic Performance</h2>
        <table><thead><tr><th>Subject</th><th>Average Score</th></tr></thead><tbody>${subjectRows}</tbody></table>
      </section>` : ""}

      ${incidents.length > 0 ? `
      <section>
        <h2>Discipline Incidents (${incidents.length})</h2>
        <table><thead><tr><th>Date</th><th>Incident</th><th>Severity</th></tr></thead><tbody>${incRows}</tbody></table>
      </section>` : ""}

      <div class="footer">
        <span>Generated by Principal Dashboard</span>
        <span>Confidential — School Use Only</span>
      </div>
      </body></html>
    `;

    // Render in an opaque-origin popup so any residual XSS cannot reach the
    // parent window's Firebase Auth storage.
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      URL.revokeObjectURL(url);
      toast.error("Allow pop-ups to generate the report.");
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addDoc(collection(db, "parent_notes"), {
        studentId, studentName: name, studentEmail,
        note: noteText.trim(), type: "note",
        schoolId, branchId,
        createdAt: serverTimestamp(),
      });
      setParentNotes(prev => [{ note: noteText, type: "note", createdAt: { seconds: Date.now() / 1000 } }, ...prev]);
      setNoteText("");
      toast.success("Note saved.");
    } catch {
      toast.error("Could not save note.");
    }
  };

  const name     = student.name || student.studentName || "Unknown";
  const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const fmtDate = (ts: any) => {
    if (!ts) return "";
    if (ts?.toDate) return ts.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return "Just now";
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="animate-in fade-in duration-500">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Students
      </button>

      {/* Profile Header */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-[72px] h-[72px] rounded-full bg-[#1e3a8a] flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{name}</h1>
                {isAtRisk && (
                  <span className="px-3 py-1 rounded-md bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider">AT RISK</span>
                )}
                {!isAtRisk && attPct >= 90 && (
                  <span className="px-3 py-1 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider">EXCELLENT</span>
                )}
                {counselorFlag && (
                  <span className="px-3 py-1 rounded-md bg-purple-500 text-white text-[10px] font-black uppercase tracking-wider">COUNSELING</span>
                )}
                {remedialFlag && (
                  <span className="px-3 py-1 rounded-md bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider">REMEDIAL</span>
                )}
              </div>
              <p className="text-sm text-slate-500 font-medium mb-2">
                {student.gradeDisplay || student.className || "—"} &nbsp;•&nbsp; {studentEmail || "No email"}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                <span><span className="font-semibold text-slate-700">Branch:</span> {branchId || "—"}</span>
                <span><span className="font-semibold text-slate-700">Status:</span> {student.status || "Active"}</span>
                {student.teacherName && <span><span className="font-semibold text-slate-700">Teacher:</span> {student.teacherName}</span>}
                {counselorFlag && <span><span className="font-semibold text-slate-700">Counselor:</span> {counselorFlag.counselorName}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleNotifyParent}
              disabled={notifyingParent}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md disabled:opacity-60"
            >
              {notifyingParent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Notify Parent
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 mb-8 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap ${
              activeTab === tab ? "text-[#1e3a8a]" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1e3a8a] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {fetching ? (
        <div className="py-32 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-[#1e3a8a] animate-spin mb-4" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Profile Data...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* OVERVIEW TAB */}
            {activeTab === "Overview" && (
              <>
                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 text-center shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Attendance</p>
                    <p className={`text-3xl font-black tracking-tighter ${attPct >= 75 ? "text-emerald-600" : "text-rose-600"}`}>
                      {totalAtt > 0 ? `${attPct}%` : "—"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">{totalAtt} records</p>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 text-center shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Avg Score</p>
                    <p className={`text-3xl font-black tracking-tighter ${avgScore === null ? "text-slate-400" : avgScore >= 60 ? "text-emerald-600" : "text-rose-600"}`}>
                      {avgScore !== null ? `${avgScore}%` : "—"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">{results.length} exams</p>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 text-center shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Incidents</p>
                    <p className={`text-3xl font-black tracking-tighter ${incidents.length === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                      {incidents.length}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">total logged</p>
                  </div>
                </div>

                {/* Risk Factors */}
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 mb-5">Risk Factors</h3>
                  <div className="space-y-3">
                    {totalAtt === 0 && results.length === 0 && incidents.length === 0 && studentFlags.length === 0 ? (
                      <p className="text-sm text-slate-400 font-medium text-center py-6">No data available yet. Risk factors will appear once attendance and results are recorded.</p>
                    ) : (
                      <>
                        {/* Attendance Risk */}
                        {totalAtt > 0 && (
                          <RiskRow
                            icon={attPct < 75 ? <AlertCircle className="w-5 h-5 text-red-500" /> : <UserCheck className="w-5 h-5 text-green-500" />}
                            iconBg={attPct < 75 ? "bg-red-100" : "bg-green-100"}
                            cardBg={attPct < 75 ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"}
                            title={attPct < 75 ? "Low Attendance" : "Good Attendance"}
                            detail={`Current: ${attPct}% — Threshold: 75% (${absentCount} absent day${absentCount !== 1 ? "s" : ""})`}
                            badge={attPct < 75 ? "CRITICAL" : "GOOD"}
                            badgeBg={attPct < 75 ? "bg-red-500" : "bg-green-500"}
                          />
                        )}

                        {/* Academic Risk */}
                        {avgScore !== null && (
                          <RiskRow
                            icon={avgScore < 65 ? <TrendingDown className="w-5 h-5 text-rose-500" /> : <BookOpen className="w-5 h-5 text-green-500" />}
                            iconBg={avgScore < 50 ? "bg-red-100" : avgScore < 65 ? "bg-amber-100" : "bg-green-100"}
                            cardBg={avgScore < 50 ? "bg-red-50 border-red-100" : avgScore < 65 ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100"}
                            title={avgScore < 50 ? "Poor Academic Performance" : avgScore < 65 ? "Below Average Performance" : "Good Academic Performance"}
                            detail={`Average: ${avgScore}% across ${results.length} exam(s)${subjectAvgs.filter(s => s.avg < 40).length > 0 ? ` — ${subjectAvgs.filter(s => s.avg < 40).map(s => s.subject).join(", ")} below 40%` : ""}`}
                            badge={avgScore < 50 ? "CRITICAL" : avgScore < 65 ? "WARNING" : "GOOD"}
                            badgeBg={avgScore < 50 ? "bg-red-500" : avgScore < 65 ? "bg-amber-500" : "bg-green-500"}
                          />
                        )}

                        {/* Discipline Risk */}
                        {incidents.length > 0 && (
                          <RiskRow
                            icon={<Shield className="w-5 h-5 text-amber-500" />}
                            iconBg="bg-amber-100"
                            cardBg="bg-amber-50 border-amber-100"
                            title="Discipline Incidents"
                            detail={`${incidents.length} incident(s) logged${incidents.filter(i => i.severity === "critical").length > 0 ? ` — ${incidents.filter(i => i.severity === "critical").length} critical` : ""}`}
                            badge={incidents.filter(i => i.severity === "critical").length > 0 ? "CRITICAL" : "WARNING"}
                            badgeBg={incidents.filter(i => i.severity === "critical").length > 0 ? "bg-red-500" : "bg-amber-500"}
                          />
                        )}

                        {/* Counselor assigned */}
                        {counselorFlag && (
                          <RiskRow
                            icon={<UserCog className="w-5 h-5 text-purple-500" />}
                            iconBg="bg-purple-100"
                            cardBg="bg-purple-50 border-purple-100"
                            title="Counselor Assigned"
                            detail={`Assigned to: ${counselorFlag.counselorName}${counselorFlag.notes ? ` — ${counselorFlag.notes}` : ""}`}
                            badge="ACTIVE"
                            badgeBg="bg-purple-500"
                          />
                        )}

                        {/* Remedial class */}
                        {remedialFlag && (
                          <RiskRow
                            icon={<BookOpen className="w-5 h-5 text-amber-500" />}
                            iconBg="bg-amber-100"
                            cardBg="bg-amber-50 border-amber-100"
                            title="Enrolled in Remedial Class"
                            detail={`Class: ${remedialFlag.className}${remedialFlag.reason ? ` — ${remedialFlag.reason}` : ""}`}
                            badge="ENROLLED"
                            badgeBg="bg-amber-500"
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Recent Attendance (last 5) */}
                {attRecords.length > 0 && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 mb-5">Recent Attendance (Last 5)</h3>
                    <div className="space-y-3">
                      {attRecords.slice(0, 5).map((r, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60 border border-slate-100">
                          <div className="flex items-center gap-3">
                            {r.status === "present" && <UserCheck className="w-4 h-4 text-emerald-500" />}
                            {r.status === "absent"  && <UserX    className="w-4 h-4 text-rose-500"    />}
                            {r.status === "late"    && <Clock    className="w-4 h-4 text-amber-500"   />}
                            <span className="text-sm font-bold text-slate-700">{r.date}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 font-medium">{r.className || ""}</span>
                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                              r.status === "present" ? "bg-emerald-50 text-emerald-600" :
                              r.status === "absent"  ? "bg-rose-50 text-rose-600" :
                              "bg-amber-50 text-amber-600"
                            }`}>
                              {r.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ACADEMIC TAB */}
            {activeTab === "Academic" && (
              <>
                {subjectAvgs.length > 0 ? (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 mb-5">Subject-wise Performance</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {subjectAvgs.map((s, i) => (
                        <div key={i} className="bg-slate-50/60 border border-slate-100 rounded-xl p-5 text-center hover:shadow-md transition-all">
                          <p className="text-xs font-bold text-slate-400 uppercase mb-3 truncate">{s.subject}</p>
                          <p className="text-3xl font-black tracking-tighter"
                            style={{ color: s.avg >= 60 ? "#22c55e" : s.avg >= 40 ? "#f59e0b" : "#ef4444" }}>
                            {s.avg}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState icon={<BookOpen className="w-12 h-12" />} message="No exam results recorded yet." />
                )}

                {results.length > 0 && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 mb-5">All Exam Records</h3>
                    <div className="space-y-3">
                      {results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50/60 rounded-xl border border-slate-100">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{r.assignmentTitle || r.examName || r.subject || "Exam"}</p>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">{r.subject || r.className || ""} {r.date ? `• ${r.date}` : ""}</p>
                          </div>
                          <span className={`text-lg font-black px-4 py-1.5 rounded-xl border ${
                            Number(r.percentage || r.score || 0) >= 60
                              ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                              : "text-rose-600 bg-rose-50 border-rose-100"
                          }`}>
                            {Math.round(Number(r.percentage || r.score || 0))}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ATTENDANCE TAB */}
            {activeTab === "Attendance" && (
              <>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Total Days",  value: totalAtt,     color: "#1e3a8a" },
                    { label: "Present",     value: presentCount, color: "#22c55e" },
                    { label: "Absent",      value: absentCount,  color: "#ef4444" },
                    { label: "Percentage",  value: totalAtt > 0 ? `${attPct}%` : "—", color: attPct >= 75 ? "#22c55e" : "#ef4444" },
                  ].map((item, i) => (
                    <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 text-center shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{item.label}</p>
                      <p className="text-2xl font-black tracking-tighter" style={{ color: item.color }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {attRecords.length > 0 ? (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 mb-5">Full Attendance Log</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                            <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Class</th>
                            <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Teacher</th>
                            <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {attRecords.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="py-3 font-bold text-slate-700">{r.date}</td>
                              <td className="py-3 text-slate-500 font-medium">{r.className || "—"}</td>
                              <td className="py-3 text-slate-500 font-medium">{r.teacherName || "—"}</td>
                              <td className="py-3">
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                  r.status === "present" ? "bg-emerald-50 text-emerald-600" :
                                  r.status === "absent"  ? "bg-rose-50 text-rose-600" :
                                  "bg-amber-50 text-amber-600"
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <EmptyState icon={<CalendarCheck className="w-12 h-12" />} message="No attendance records found." />
                )}
              </>
            )}

            {/* DISCIPLINE TAB */}
            {activeTab === "Discipline" && (
              incidents.length > 0 ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 mb-5">Discipline Incidents ({incidents.length})</h3>
                  <div className="space-y-3">
                    {incidents.map((inc, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 bg-slate-50/60 rounded-xl border border-slate-100">
                        <div className={`w-1 h-12 rounded-full shrink-0 mt-1 ${
                          inc.severity === "critical" ? "bg-red-500" :
                          inc.severity === "high"     ? "bg-amber-500" : "bg-blue-400"
                        }`} />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-800">{inc.title || inc.type || "Incident"}</p>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">
                            {inc.date || (inc.createdAt?.toDate ? inc.createdAt.toDate().toLocaleDateString() : "")}
                          </p>
                          {inc.description && <p className="text-xs text-slate-500 mt-1">{inc.description}</p>}
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                          inc.severity === "critical" ? "bg-red-50 text-red-600 border-red-100" :
                          inc.severity === "high"     ? "bg-amber-50 text-amber-600 border-amber-100" :
                          "bg-blue-50 text-blue-600 border-blue-100"
                        }`}>
                          {inc.severity || inc.type || "incident"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState icon={<Shield className="w-12 h-12" />} message="No discipline incidents recorded." />
              )
            )}

            {/* PARENT COMMUNICATION TAB */}
            {activeTab === "Parent Communication" && (
              <>
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 mb-5">Add Note / Communication</h3>
                  <textarea
                    className="w-full h-28 p-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30 placeholder:text-slate-400"
                    placeholder="Add a note about parent communication, follow-up, etc..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                  />
                  <button
                    onClick={handleSaveNote}
                    disabled={!noteText.trim()}
                    className="mt-3 px-6 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-40"
                  >
                    Save Note
                  </button>
                </div>

                {/* Scheduled Meetings */}
                {parentMeetings.length > 0 && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 mb-5">Scheduled Meetings</h3>
                    <div className="space-y-3">
                      {parentMeetings.map((m, i) => (
                        <div key={i} className="flex items-start gap-4 p-4 bg-blue-50/60 rounded-xl border border-blue-100">
                          <Calendar className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-800">{m.purpose}</p>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                              {m.date}{m.time ? ` at ${m.time}` : ""}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{fmtDate(m.createdAt)}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border shrink-0 ${
                            m.status === "completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-blue-50 text-blue-600 border-blue-100"
                          }`}>
                            {m.status || "scheduled"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Communication Log */}
                {parentNotes.length > 0 ? (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 mb-5">Communication Log</h3>
                    <div className="space-y-3">
                      {parentNotes.map((n, i) => (
                        <div key={i} className={`p-4 rounded-xl border ${n.type === "notification" ? "bg-amber-50 border-amber-100" : "bg-slate-50/60 border-slate-100"}`}>
                          <div className="flex items-start gap-2">
                            {n.type === "notification" && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                            <p className="text-sm font-medium text-slate-700 flex-1">{n.note}</p>
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">{fmtDate(n.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState icon={<MessageSquare className="w-12 h-12" />} message="No communication notes yet." />
                )}
              </>
            )}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="space-y-6">

            {/* Quick Actions */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-5">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setMeetingModal(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md"
                >
                  <CalendarCheck className="w-4 h-4" /> Schedule Parent Meeting
                </button>
                <button
                  onClick={() => setCounselorModal(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <UserCog className="w-4 h-4 text-purple-500" />
                  {counselorFlag ? "Update Counselor" : "Assign to Counselor"}
                </button>
                <button
                  onClick={() => setRemedialModal(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  {remedialFlag ? "Update Remedial Class" : "Enroll in Remedial Class"}
                </button>
                <button
                  onClick={handleGenerateReport}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Printer className="w-4 h-4 text-slate-400" /> Generate Progress Report
                </button>
                <button
                  onClick={() => setActiveTab("Attendance")}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText className="w-4 h-4 text-slate-400" /> Full Attendance Log
                </button>
              </div>
            </div>

            {/* Class Teachers */}
            {teachers.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 mb-5">Assigned Teachers</h3>
                <div className="space-y-4">
                  {teachers.map((t, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-[#1e3a8a] flex items-center justify-center text-white text-xs font-bold shadow-md">
                        {(t.name || "T").substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{t.name}</p>
                        <p className="text-xs text-slate-400 font-medium">{t.subject || "Teacher"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Info */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-5">Contact Info</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{name}</span>
                </div>
                {studentEmail && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 truncate">{studentEmail}</span>
                  </div>
                )}
                <button
                  onClick={handleNotifyParent}
                  disabled={notifyingParent}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors shadow-md disabled:opacity-60"
                >
                  {notifyingParent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Notification
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE MEETING MODAL ── */}
      {meetingModal && (
        <Modal title="Schedule Parent Meeting" onClose={() => setMeetingModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Meeting Date *</label>
              <input
                type="date"
                value={meetingForm.date}
                onChange={e => setMeetingForm(p => ({ ...p, date: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Time (optional)</label>
              <input
                type="time"
                value={meetingForm.time}
                onChange={e => setMeetingForm(p => ({ ...p, time: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Purpose / Agenda *</label>
              <textarea
                value={meetingForm.purpose}
                onChange={e => setMeetingForm(p => ({ ...p, purpose: e.target.value }))}
                placeholder="e.g. Discuss attendance concerns, academic performance review..."
                className="w-full h-24 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setMeetingModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleMeeting}
                disabled={savingAction}
                className="flex-1 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
                Schedule Meeting
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── ASSIGN COUNSELOR MODAL ── */}
      {counselorModal && (
        <Modal title="Assign to Counselor" onClose={() => setCounselorModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Counselor Name *</label>
              <input
                type="text"
                value={counselorForm.name}
                onChange={e => setCounselorForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Enter counselor's name"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Notes (optional)</label>
              <textarea
                value={counselorForm.notes}
                onChange={e => setCounselorForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Reason for referral, specific concerns..."
                className="w-full h-24 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCounselorModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignCounselor}
                disabled={savingAction}
                className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
                Assign Counselor
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── REMEDIAL CLASS MODAL ── */}
      {remedialModal && (
        <Modal title="Enroll in Remedial Class" onClose={() => setRemedialModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Class / Program Name *</label>
              <input
                type="text"
                value={remedialForm.className}
                onChange={e => setRemedialForm(p => ({ ...p, className: e.target.value }))}
                placeholder="e.g. Math Remedial Batch A, Extra English Class"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Reason (optional)</label>
              <textarea
                value={remedialForm.reason}
                onChange={e => setRemedialForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Subject weakness, exam failure, teacher recommendation..."
                className="w-full h-24 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setRemedialModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEnrollRemedial}
                disabled={savingAction}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                Enroll Student
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Shared components ──────────────────────────────────────────────────────────

const RiskRow = ({
  icon, iconBg, cardBg, title, detail, badge, badgeBg
}: {
  icon: React.ReactNode; iconBg: string; cardBg: string;
  title: string; detail: string; badge: string; badgeBg: string;
}) => (
  <div className={`flex items-center justify-between p-4 rounded-xl border ${cardBg}`}>
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 font-medium">{detail}</p>
      </div>
    </div>
    <span className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white shadow-sm shrink-0 ml-3 ${badgeBg}`}>
      {badge}
    </span>
  </div>
);

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between p-6 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const EmptyState = ({ icon, message }: { icon: React.ReactNode; message: string }) => (
  <div className="bg-white border border-slate-100 rounded-2xl py-24 flex flex-col items-center justify-center text-slate-300 shadow-sm">
    <div className="mb-4 opacity-30">{icon}</div>
    <p className="text-sm font-black uppercase tracking-widest text-slate-400">{message}</p>
  </div>
);

export default StudentProfile;
