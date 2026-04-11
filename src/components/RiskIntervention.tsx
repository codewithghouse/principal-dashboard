import { useState, useEffect } from "react";
import {
  ChevronLeft, CalendarCheck, BookOpen, Bell, UserCog,
  Loader2, Send, CheckCircle2, AlertCircle, Clock,
  X, AlertTriangle
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, orderBy
} from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";

interface RiskStudent {
  id: string;
  name: string;
  email: string;
  className: string;
  teacherName: string;
  teacherId: string;
  schoolId: string;
  branchId: string;
  attPct: number | null;
  avgScore: number | null;
  incidentCount: number;
  parentEngagement: number;
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

  const initials = student.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // ── Risk factor bars (real data) ─────────────────────────────────────────────
  const riskFactorBars = [
    {
      label: "Attendance",
      value: student.attPct ?? 0,
      desc: student.attPct === null
        ? "No attendance recorded yet"
        : student.attPct < 75
          ? `Below 75% threshold (currently ${student.attPct}%)`
          : `Good — ${student.attPct}%`,
      color: student.attPct === null ? "#94a3b8"
        : student.attPct < 60 ? "#ef4444"
        : student.attPct < 75 ? "#f59e0b"
        : "#22c55e",
    },
    {
      label: "Academic Average",
      value: student.avgScore ?? 0,
      desc: student.avgScore === null
        ? "No exam results recorded yet"
        : student.avgScore < 40
          ? `Below 40% passing marks (${student.avgScore}%)`
          : student.avgScore < 55
            ? `Below average — ${student.avgScore}%`
            : `Passing — ${student.avgScore}%`,
      color: student.avgScore === null ? "#94a3b8"
        : student.avgScore < 40 ? "#ef4444"
        : student.avgScore < 55 ? "#f59e0b"
        : "#22c55e",
    },
    {
      label: "Discipline Score",
      value: Math.max(0, 100 - student.incidentCount * 20),
      desc: student.incidentCount === 0
        ? "No incidents recorded"
        : `${student.incidentCount} incident${student.incidentCount > 1 ? "s" : ""} logged`,
      color: student.incidentCount === 0 ? "#22c55e"
        : student.incidentCount >= 3 ? "#ef4444"
        : "#f59e0b",
    },
    {
      label: "Parent Engagement",
      value: student.parentEngagement,
      desc: student.parentEngagement === 0
        ? "No parent communications logged"
        : student.parentEngagement < 40
          ? "Low engagement with school"
          : "Actively communicating",
      color: student.parentEngagement < 20 ? "#ef4444"
        : student.parentEngagement < 60 ? "#f59e0b"
        : "#22c55e",
    },
  ];

  // ── Intervention history listener ────────────────────────────────────────────
  useEffect(() => {
    if (!student.id) { setHistLoading(false); return; }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) { setHistLoading(false); return; }

    // Base constraints — always scoped to this school/branch
    const baseConstraints: any[] = [
      where("studentId", "==", student.id),
      where("schoolId", "==", schoolId),
    ];
    if (branchId) baseConstraints.push(where("branchId", "==", branchId));

    // Track fallback listener so it can be cleaned up
    let unsub2: (() => void) | null = null;

    // Try with orderBy first; if composite index missing, fall back to unordered
    const q = query(
      collection(db, "interventions"),
      ...baseConstraints,
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      snap => {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setHistLoading(false);
      },
      () => {
        // Fallback without orderBy (no composite index needed)
        const q2 = query(collection(db, "interventions"), ...baseConstraints);
        unsub2 = onSnapshot(q2, snap2 => {
          setHistory(
            snap2.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          );
          setHistLoading(false);
        });
      }
    );

    return () => { unsub(); unsub2?.(); };
  }, [student.id, userData?.schoolId, userData?.branchId]);

  // ── Save action ──────────────────────────────────────────────────────────────
  const handleSaveAction = async () => {
    if (!selectedAction) return;
    if (!actionNotes.trim()) return toast.error("Please add notes for this action.");
    setSaving(true);
    try {
      await addDoc(collection(db, "interventions"), {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        actionId: selectedAction.id,
        actionTitle: selectedAction.title,
        notes: actionNotes.trim(),
        date: actionDate || new Date().toISOString().slice(0, 10),
        status: "Applied",
        schoolId: student.schoolId || userData?.schoolId || "",
        branchId: student.branchId || userData?.branchId || "",
        createdAt: serverTimestamp(),
      });

      // If meeting → also save to parent_meetings
      if (selectedAction.id === "meeting" && actionDate) {
        await addDoc(collection(db, "parent_meetings"), {
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          purpose: actionNotes.trim(),
          date: actionDate,
          status: "scheduled",
          schoolId: student.schoolId || userData?.schoolId || "",
          branchId: student.branchId || userData?.branchId || "",
          createdAt: serverTimestamp(),
        });
      }

      // If counselor → save to student_flags
      if (selectedAction.id === "counselor") {
        await addDoc(collection(db, "student_flags"), {
          studentId: student.id,
          studentName: student.name,
          studentEmail: student.email,
          type: "counselor_assigned",
          counselorName: "TBD",
          notes: actionNotes.trim(),
          status: "active",
          schoolId: student.schoolId || userData?.schoolId || "",
          branchId: student.branchId || userData?.branchId || "",
          createdAt: serverTimestamp(),
        });
      }

      toast.success(`${selectedAction.title} saved!`);
      setActionModal(false);
      setActionNotes("");
      setActionDate("");
    } catch {
      toast.error("Could not save action.");
    } finally {
      setSaving(false);
    }
  };

  // ── Notify teacher ───────────────────────────────────────────────────────────
  const handleNotifyTeacher = async () => {
    if (!student.email) return toast.error("No student email found.");
    setNotifying(true);
    try {
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: student.email,
          subject: `Risk Alert: ${student.name} needs attention`,
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
      await addDoc(collection(db, "interventions"), {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        actionId: "teacher",
        actionTitle: "Notify Class Teacher",
        notes: `Email notification sent to ${student.teacherName || "teacher"} regarding ${student.riskLevel} risk.`,
        date: new Date().toISOString().slice(0, 10),
        status: "Applied",
        schoolId: student.schoolId || userData?.schoolId || "",
        branchId: student.branchId || userData?.branchId || "",
        createdAt: serverTimestamp(),
      });
      toast.success("Teacher notified via email!");
    } catch {
      toast.error("Notification failed.");
    } finally {
      setNotifying(false);
    }
  };

  // ── Schedule follow-up ───────────────────────────────────────────────────────
  const handleScheduleFollowUp = async () => {
    if (!followUp.date) return toast.error("Please select a follow-up date.");
    setSavingFollowUp(true);
    try {
      await addDoc(collection(db, "interventions"), {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        actionId: "followup",
        actionTitle: "Follow-up Scheduled",
        notes: followUp.notes.trim() || "Scheduled follow-up",
        date: followUp.date,
        assignedTo: followUp.assignTo.trim(),
        status: "Scheduled",
        schoolId: student.schoolId || userData?.schoolId || "",
        branchId: student.branchId || userData?.branchId || "",
        createdAt: serverTimestamp(),
      });
      setFollowUp({ date: "", assignTo: "", notes: "" });
      toast.success("Follow-up scheduled!");
    } catch {
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
              {riskFactorBars.map((f, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-700">{f.label}</span>
                    <span className="text-sm font-black" style={{ color: f.color }}>
                      {f.value}%
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${f.value}%`, backgroundColor: f.color }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-1.5">{f.desc}</p>
                </div>
              ))}
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
              {(selectedAction.id === "meeting" || selectedAction.id === "followup") && (
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Date</label>
                  <input
                    type="date"
                    value={actionDate}
                    onChange={e => setActionDate(e.target.value)}
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
