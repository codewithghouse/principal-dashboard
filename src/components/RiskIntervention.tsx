import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft, CalendarCheck, BookOpen, Bell, UserCog,
  Loader2, Send, CheckCircle2, AlertCircle, Clock, X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  serverTimestamp, orderBy, writeBatch, doc, getDoc, getDocs, limit,
} from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { ymdLocal } from "@/lib/scoreUtils";

interface RiskStudent {
  id: string;
  name: string;
  email: string;
  className: string;
  classId?: string;
  teacherName: string;
  teacherId: string;
  schoolId: string;
  branchId: string;
  attPct: number | null;
  avgScore: number | null;
  hasScoreData?: boolean;
  hasAttendanceData?: boolean;
  incidentCount: number;
  parentEngagement: number;
  /** Org-wide totals — used so empty-data bars can render "no data tracked"
   *  instead of fabricating a 100% / RED bar from zero signals. */
  orgIncidentTotal?: number;
  orgParentNoteTotal?: number;
  riskLevel: string;
  riskFactors: string[];
  lastAction: string;
  assignedTo: string;
  daysFlagged: number;
}

interface Props {
  student: RiskStudent;
  onBack: () => void;
}

const ACTIONS = [
  {
    id: "meeting",
    title: "Schedule Parent Meeting",
    desc: "Book appointment with guardian",
    icon: CalendarCheck,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    id: "remedial",
    title: "Assign Remedial Class",
    desc: "Enroll in after-school support",
    icon: BookOpen,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    id: "teacher",
    title: "Notify Class Teacher",
    desc: `Alert assigned faculty member`,
    icon: Bell,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    id: "counselor",
    title: "Escalate to Counselor",
    desc: "Refer for professional support",
    icon: UserCog,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
];

const RiskIntervention = ({ student, onBack }: Props) => {
  const { userData } = useAuth();

  const [history, setHistory]         = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [notifying, setNotifying]     = useState(false);

  // Follow-up form
  const [followUp, setFollowUp] = useState({ date: "", assignTo: "", notes: "" });
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Action modal
  const [actionModal, setActionModal]   = useState(false);
  const [selectedAction, setSelectedAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [actionNotes, setActionNotes]   = useState("");
  const [actionDate, setActionDate]     = useState("");
  const [counselorName, setCounselorName] = useState("");
  // Lock to prevent rapid double-click of "Notify Teacher" sending two emails
  // before setNotifying lands (iOS/keyboard bounce — Resend rate-limit risk).
  const notifyingRef = useRef(false);

  const initials = student.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // ── Risk factor bars (P1-M + P1-N + CF-4 fixes) ──────────────────────────
  // Bars now distinguish 4 states explicitly:
  //   • value=null     → "—" + gray (no data)
  //   • org has 0 data → "Not tracked" + gray (school doesn't use this signal)
  //   • value=0/low    → red (real risk)
  //   • value=high     → green (real positive)
  // The previous version showed RED bars at "0%" for both real risk AND
  // for empty data — and rendered Discipline=100% even when the school
  // never logged a single incident. Both were fabricated visuals.
  type RiskBar = { label: string; value: number | null; desc: string; color: string; tracked: boolean };
  const GRAY = "#94a3b8";

  const orgTracksIncidents   = (student.orgIncidentTotal ?? 1) > 0;
  const orgTracksParentNotes = (student.orgParentNoteTotal ?? 1) > 0;

  const riskFactorBars: RiskBar[] = [
    {
      label: "Attendance",
      value: student.attPct,
      tracked: true,
      desc: student.attPct === null
        ? "No attendance recorded yet"
        : student.attPct < 75
          ? `Below 75% threshold (currently ${student.attPct}%)`
          : `Good — ${student.attPct}%`,
      color: student.attPct === null ? GRAY
        : student.attPct < 60 ? "#ef4444"
        : student.attPct < 75 ? "#f59e0b"
        : "#22c55e",
    },
    {
      label: "Academic Average",
      value: student.avgScore,
      tracked: true,
      desc: student.avgScore === null
        ? "No exam results recorded yet"
        : student.avgScore < 40
          ? `Below 40% passing marks (${student.avgScore}%)`
          : student.avgScore < 55
            ? `Below average — ${student.avgScore}%`
            : `Passing — ${student.avgScore}%`,
      color: student.avgScore === null ? GRAY
        : student.avgScore < 40 ? "#ef4444"
        : student.avgScore < 55 ? "#f59e0b"
        : "#22c55e",
    },
    {
      label: "Discipline Score",
      tracked: orgTracksIncidents,
      value: orgTracksIncidents ? Math.max(0, 100 - student.incidentCount * 20) : null,
      desc: !orgTracksIncidents
        ? "Not tracked at this school"
        : student.incidentCount === 0
          ? "No incidents recorded"
          : `${student.incidentCount} incident${student.incidentCount > 1 ? "s" : ""} logged`,
      color: !orgTracksIncidents ? GRAY
        : student.incidentCount === 0 ? "#22c55e"
        : student.incidentCount >= 3 ? "#ef4444"
        : "#f59e0b",
    },
    {
      label: "Parent Engagement",
      tracked: orgTracksParentNotes,
      value: orgTracksParentNotes ? student.parentEngagement : null,
      desc: !orgTracksParentNotes
        ? "No parent comms tracked at this school"
        : student.parentEngagement === 0
          ? "No parent communications logged"
          : student.parentEngagement < 40
            ? "Low engagement with school"
            : "Actively communicating",
      color: !orgTracksParentNotes ? GRAY
        : student.parentEngagement < 20 ? "#ef4444"
        : student.parentEngagement < 60 ? "#f59e0b"
        : "#22c55e",
    },
  ];

  // ── Intervention history listener ────────────────────────────────────────────
  // Dual-key fetch (memory: dual_query_pattern_studentid_email): reads ALL
  // interventions for this school, then client-filters by studentId OR
  // studentEmail. studentId-only listener silently misses legacy writes
  // that captured only studentEmail. Also drops server-side branchId filter
  // (memory: branchid_inference_lag) and applies branch in-memory.
  useEffect(() => {
    if (!student.id && !student.email) { setHistLoading(false); return; }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) { setHistLoading(false); return; }

    const studentEmail = (student.email || "").toLowerCase().trim();
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;
    const matchesStudent = (raw: any): boolean => {
      const sid = String(raw?.studentId || "");
      const sem = String(raw?.studentEmail || "").toLowerCase().trim();
      return (student.id && sid === student.id) || (!!studentEmail && sem === studentEmail);
    };

    // Track fallback listener so it can be cleaned up
    let unsub2: (() => void) | null = null;

    // Try with orderBy first; if composite index missing, fall back to unordered.
    const q = query(
      collection(db, "interventions"),
      where("schoolId", "==", schoolId),
      orderBy("createdAt", "desc"),
    );

    const apply = (docs: any[]) => {
      setHistory(
        docs
          .filter(d => inBranch(d) && matchesStudent(d))
          .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
      );
      setHistLoading(false);
    };

    const unsub = onSnapshot(
      q,
      snap => apply(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {
        // Fallback without orderBy (no composite index needed)
        const q2 = query(collection(db, "interventions"), where("schoolId", "==", schoolId));
        unsub2 = onSnapshot(q2, snap2 => apply(snap2.docs.map(d => ({ id: d.id, ...d.data() }))));
      }
    );

    return () => { unsub(); unsub2?.(); };
  }, [student.id, student.email, userData?.schoolId, userData?.branchId]);

  // ── Save action ──────────────────────────────────────────────────────────────
  const handleSaveAction = async () => {
    if (!selectedAction) return;
    if (!actionNotes.trim()) return toast.error("Please add notes for this action.");

    // P0-E: REJECT writes when schoolId can't be resolved. Empty-string
    // schoolId orphans the doc — invisible to scoped queries forever.
    const schoolId = student.schoolId || userData?.schoolId;
    if (!schoolId) {
      toast.error("Session expired — please re-login.");
      return;
    }
    const branchId = student.branchId || userData?.branchId || null;

    // Counselor escalation requires a real assignee — "TBD" silently
    // showed as "Assigned: TBD" forever in RiskStudents' Assigned-To cell.
    if (selectedAction.id === "counselor" && !counselorName.trim()) {
      toast.error("Please enter the counselor's name.");
      return;
    }

    setSaving(true);
    try {
      // P1-Q: Single atomic batch instead of sequential addDocs. The previous
      // version could leave an orphan `interventions` doc if the second
      // `parent_meetings` / `student_flags` write failed.
      const batch = writeBatch(db);
      const dateStr = actionDate || ymdLocal(new Date());

      const interventionRef = doc(collection(db, "interventions"));
      batch.set(interventionRef, {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        actionId: selectedAction.id,
        actionTitle: selectedAction.title,
        notes: actionNotes.trim(),
        date: dateStr,
        status: "Applied",
        schoolId,
        branchId,
        createdAt: serverTimestamp(),
      });

      if (selectedAction.id === "meeting" && actionDate) {
        const meetingRef = doc(collection(db, "parent_meetings"));
        batch.set(meetingRef, {
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          purpose: actionNotes.trim(),
          date: actionDate,
          status: "scheduled",
          schoolId,
          branchId,
          createdAt: serverTimestamp(),
        });
      }

      if (selectedAction.id === "counselor") {
        const flagRef = doc(collection(db, "student_flags"));
        batch.set(flagRef, {
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          type: "counselor_assigned",
          counselorName: counselorName.trim(),
          notes: actionNotes.trim(),
          status: "active",
          schoolId,
          branchId,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();

      toast.success(`${selectedAction.title} saved!`);
      setActionModal(false);
      setActionNotes("");
      setActionDate("");
      setCounselorName("");
    } catch (err) {
      // P3: log the actual error so production rule denials are debuggable.
      console.error("[RiskIntervention] save failed:", err);
      toast.error("Could not save action.");
    } finally {
      setSaving(false);
    }
  };

  // ── Notify teacher ───────────────────────────────────────────────────────────
  // 🔴 PRIVACY-CRITICAL: previously emailed `student.email` (the STUDENT)
  // with a "Risk Alert: you need attention" subject. Now resolves the
  // teacher's actual email via teacherId → teachers doc → email field.
  // If we can't resolve the teacher email, REFUSE TO SEND rather than
  // fall back to the student's address.
  const handleNotifyTeacher = async () => {
    // Double-click guard — iOS/keyboard can fire twice before setNotifying
    // lands. ref-based lock fires synchronously.
    if (notifyingRef.current) return;
    notifyingRef.current = true;

    const schoolId = student.schoolId || userData?.schoolId;
    if (!schoolId) {
      toast.error("Session expired — please re-login.");
      notifyingRef.current = false;
      return;
    }
    const branchId = student.branchId || userData?.branchId || null;

    setNotifying(true);
    try {
      // Resolve teacher email — try teacherId first (canonical), fall back
      // to looking up via the class doc if needed.
      let teacherEmail = "";
      let resolvedTeacherName = student.teacherName || "Teacher";
      if (student.teacherId) {
        try {
          const tSnap = await getDoc(doc(db, "teachers", student.teacherId));
          if (tSnap.exists()) {
            const t = tSnap.data() as any;
            teacherEmail = String(t.email || "").trim();
            if (t.name) resolvedTeacherName = t.name;
          }
        } catch (err) {
          console.warn("[RiskIntervention] teacher lookup by id failed:", err);
        }
      }
      // Class-fallback: if no teacherId or teacher doc had no email
      if (!teacherEmail && student.classId) {
        try {
          const taSnap = await getDocs(query(
            collection(db, "teaching_assignments"),
            where("schoolId", "==", schoolId),
            where("classId", "==", student.classId),
            limit(1),
          ));
          const taTeacherId = taSnap.docs[0]?.data()?.teacherId;
          if (taTeacherId) {
            const tSnap = await getDoc(doc(db, "teachers", taTeacherId));
            if (tSnap.exists()) {
              const t = tSnap.data() as any;
              teacherEmail = String(t.email || "").trim();
              if (t.name) resolvedTeacherName = t.name;
            }
          }
        } catch (err) {
          console.warn("[RiskIntervention] teacher lookup by class failed:", err);
        }
      }

      if (!teacherEmail) {
        toast.error(`No email on file for ${resolvedTeacherName}. Add it in Teachers settings to enable alerts.`);
        return;
      }

      // P0-D: actually CHECK the response. Previously HTTP 4xx/5xx was
      // silently logged as "Teacher notified!" — principal trusted a lie.
      // Build redacted subject (P3 polish — student name out of inbox preview).
      const schoolName = (userData as any)?.schoolName || (userData as any)?.branchName || "your school";
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: teacherEmail,
          subject: `Risk alert from ${schoolName}`,
          html: `<div style="font-family:sans-serif;padding:24px">
            <h2 style="color:#1e3a8a">Risk Alert — ${student.name}</h2>
            <p>Risk Level: <strong>${student.riskLevel}</strong></p>
            <p>Factors: ${student.riskFactors.join(", ")}</p>
            ${student.attPct !== null ? `<p>Attendance: ${student.attPct}%</p>` : ""}
            ${student.avgScore !== null ? `<p>Academic Average: ${student.avgScore}%</p>` : ""}
            <p style="color:#888;font-size:12px">Please take appropriate action.</p>
          </div>`,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("[RiskIntervention] email API failed:", res.status, errBody);
        toast.error(`Email failed (${res.status}). Try again or check console.`);
        return;
      }

      // Only log the intervention AFTER email succeeded — no false positives.
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "interventions")), {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        actionId: "teacher",
        actionTitle: "Notify Class Teacher",
        notes: `Email sent to ${resolvedTeacherName} (${teacherEmail}) regarding ${student.riskLevel} risk.`,
        date: ymdLocal(new Date()),
        status: "Applied",
        schoolId,
        branchId,
        createdAt: serverTimestamp(),
      });
      await batch.commit();

      toast.success(`Teacher (${resolvedTeacherName}) notified via email!`);
    } catch (err) {
      console.error("[RiskIntervention] notify teacher failed:", err);
      toast.error("Notification failed.");
    } finally {
      setNotifying(false);
      notifyingRef.current = false;
    }
  };

  // ── Schedule follow-up ───────────────────────────────────────────────────────
  const handleScheduleFollowUp = async () => {
    if (!followUp.date) return toast.error("Please select a follow-up date.");
    const schoolId = student.schoolId || userData?.schoolId;
    if (!schoolId) {
      toast.error("Session expired — please re-login.");
      return;
    }
    const branchId = student.branchId || userData?.branchId || null;
    setSavingFollowUp(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "interventions")), {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        actionId: "followup",
        actionTitle: "Follow-up Scheduled",
        notes: followUp.notes.trim() || "Scheduled follow-up",
        date: followUp.date,
        assignedTo: followUp.assignTo.trim(),
        status: "Scheduled",
        schoolId,
        branchId,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setFollowUp({ date: "", assignTo: "", notes: "" });
      toast.success("Follow-up scheduled!");
    } catch (err) {
      console.error("[RiskIntervention] follow-up failed:", err);
      toast.error("Could not schedule follow-up.");
    } finally {
      setSavingFollowUp(false);
    }
  };

  const fmtDate = (ts: any) => {
    if (!ts) return "";
    if (ts?.toDate) return ts.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (ts?.seconds) return new Date(ts.seconds * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return "";
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in duration-500 pb-12 space-y-6">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Risk Students
      </button>

      {/* Student Header */}
      <div className={`rounded-2xl p-6 border ${
        student.riskLevel === "CRITICAL" ? "bg-rose-50 border-rose-100" :
        student.riskLevel === "WARNING"  ? "bg-amber-50 border-amber-100" :
        "bg-slate-50 border-slate-100"
      }`}>
        <div className="flex items-center gap-5">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md ${
            student.riskLevel === "CRITICAL" ? "bg-rose-500" :
            student.riskLevel === "WARNING"  ? "bg-amber-500" : "bg-slate-500"
          }`}>
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-2xl font-black text-slate-900">{student.name}</h1>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white ${
                student.riskLevel === "CRITICAL" ? "bg-rose-500" :
                student.riskLevel === "WARNING"  ? "bg-amber-500" : "bg-slate-500"
              }`}>
                {student.riskLevel} RISK
              </span>
              {student.daysFlagged > 0 && (
                <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                  {student.daysFlagged} Days Flagged
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-medium">
              {student.className || "—"}{student.teacherName ? ` • Teacher: ${student.teacherName}` : ""}
              {student.email ? ` • ${student.email}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Risk Factor Breakdown + History ── */}
        <div className="space-y-6">

          {/* Risk Factor Breakdown */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-6">Risk Factor Breakdown</h2>
            <div className="space-y-6">
              {riskFactorBars.map((f, i) => {
                // Null value → render "—" + striped/empty bar (no fake 0%
                // visual that misleads). The bar's WIDTH stays 100% (full
                // gray track) when the value is null OR when the school
                // doesn't track that signal at all.
                const isUnknown = f.value === null;
                const valueLabel = isUnknown ? "—" : `${f.value}%`;
                const barWidth = isUnknown ? 100 : Math.max(0, Math.min(100, f.value!));
                const barBg = isUnknown
                  // diagonal stripe for "no data" — visually distinct from a low real value
                  ? "repeating-linear-gradient(45deg, #f1f5f9 0 6px, #e2e8f0 6px 12px)"
                  : f.color;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-700">{f.label}</span>
                      <span className="text-sm font-black" style={{ color: f.color }}>
                        {valueLabel}
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${barWidth}%`, background: barBg }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-1.5">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Intervention History */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-5">Intervention History</h2>
            {histLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No interventions logged yet.</p>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-slate-100 rounded-full" />
                {history.map((item, i) => (
                  <div key={i} className="flex items-start gap-4 relative z-10">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm ${
                      item.status === "Applied" ? "bg-emerald-100" :
                      item.status === "Scheduled" ? "bg-blue-100" : "bg-amber-100"
                    }`}>
                      {item.status === "Applied"
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        : item.status === "Scheduled"
                          ? <Clock className="w-4 h-4 text-blue-500" />
                          : <AlertCircle className="w-4 h-4 text-amber-500" />
                      }
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800">{item.actionTitle}</p>
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">{item.date || fmtDate(item.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>
                      {item.assignedTo && <p className="text-[10px] text-slate-400 mt-0.5">Assigned to: {item.assignedTo}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Take Action + Follow-up ── */}
        <div className="space-y-6">

          {/* Take Action */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-5">Take Action</h2>
            <div className="space-y-3">
              {ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (action.id === "teacher") {
                      handleNotifyTeacher();
                    } else {
                      setSelectedAction(action);
                      setActionNotes("");
                      setActionDate("");
                      setActionModal(true);
                    }
                  }}
                  disabled={action.id === "teacher" && notifying}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                    i === 0
                      ? "bg-[#1e3a8a] border-[#1e3a8a] hover:bg-[#1e4fc0] text-white shadow-md"
                      : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                  } disabled:opacity-60`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    i === 0 ? "bg-white/20" : action.bg
                  }`}>
                    {action.id === "teacher" && notifying
                      ? <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                      : <action.icon className={`w-5 h-5 ${i === 0 ? "text-white" : action.color}`} />
                    }
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${i === 0 ? "text-white" : "text-slate-800"}`}>{action.title}</p>
                    <p className={`text-xs font-medium ${i === 0 ? "text-white/70" : "text-slate-400"}`}>{action.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Follow-up */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-5">Schedule Follow-up</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Follow-up Date *</label>
                <input
                  type="date"
                  value={followUp.date}
                  onChange={e => setFollowUp(p => ({ ...p, date: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Assign To</label>
                <input
                  type="text"
                  placeholder="e.g. Class teacher, Counselor..."
                  value={followUp.assignTo}
                  onChange={e => setFollowUp(p => ({ ...p, assignTo: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Notes</label>
                <textarea
                  placeholder="Purpose of follow-up..."
                  value={followUp.notes}
                  onChange={e => setFollowUp(p => ({ ...p, notes: e.target.value }))}
                  className="w-full h-20 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <button
                onClick={handleScheduleFollowUp}
                disabled={savingFollowUp || !followUp.date}
                className="w-full py-3.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingFollowUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
                Schedule Follow-up
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Modal ── */}
      {actionModal && selectedAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedAction.bg}`}>
                  <selectedAction.icon className={`w-5 h-5 ${selectedAction.color}`} />
                </div>
                <h3 className="text-base font-bold text-slate-900">{selectedAction.title}</h3>
              </div>
              <button onClick={() => setActionModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Date input — meetings need a scheduled date; remedial &
                  counselor benefit from one too. The dead "followup" branch
                  (which had no matching ACTIONS entry) was removed. */}
              {(selectedAction.id === "meeting" || selectedAction.id === "remedial" || selectedAction.id === "counselor") && (
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">
                    {selectedAction.id === "meeting" ? "Meeting Date" : "Start Date"}
                  </label>
                  <input
                    type="date"
                    value={actionDate}
                    onChange={e => setActionDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
              )}
              {/* P1-O: Real counselor-name input replaces the "TBD" literal
                  that used to be hardcoded on every escalation write. */}
              {selectedAction.id === "counselor" && (
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Counselor Name *</label>
                  <input
                    type="text"
                    value={counselorName}
                    onChange={e => setCounselorName(e.target.value)}
                    placeholder="e.g. Mr. Anand Verma"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Notes / Reason *</label>
                <textarea
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  placeholder={`Details for ${selectedAction.title.toLowerCase()}...`}
                  className="w-full h-28 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setActionModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAction}
                  disabled={saving}
                  className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${
                    selectedAction.id === "counselor" ? "bg-purple-600 hover:bg-purple-700" :
                    selectedAction.id === "remedial"  ? "bg-emerald-600 hover:bg-emerald-700" :
                    "bg-[#1e3a8a] hover:bg-[#1e4fc0]"
                  }`}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskIntervention;
