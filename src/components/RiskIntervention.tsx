import { useState, useEffect } from "react";
import {
  ChevronLeft, CalendarCheck, Bell,
  Loader2, CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  serverTimestamp, orderBy, writeBatch, doc,
} from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
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

// "Assign Remedial Class" + "Escalate to Counselor" removed by request —
// they triggered modals that wrote to interventions/student_flags but had
// no downstream consumer in any dashboard, so the principal saw the toast
// but nothing actually happened. Remaining 2 actions both deep-link into
// the appropriate chat (Parent Communication / Teacher Notes) where the
// principal can edit the prefilled message before sending.
const ACTIONS = [
  {
    id: "meeting",
    title: "Schedule Parent Meeting",
    desc: "Open chat with prefilled meeting request",
    icon: CalendarCheck,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    id: "teacher",
    title: "Notify Class Teacher",
    desc: "Open chat with the assigned faculty",
    icon: Bell,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
];

const RiskIntervention = ({ student, onBack }: Props) => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [history, setHistory]         = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  // Follow-up form
  const [followUp, setFollowUp] = useState({ date: "", assignTo: "", notes: "" });
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Risk-summary lines reused in both prefill messages so the recipient
  // sees the same context the principal sees on the dashboard.
  const summaryLines = (() => {
    const lines: string[] = [];
    lines.push(`Risk Level: ${student.riskLevel}`);
    if (student.riskFactors.length > 0) lines.push(`Risk Factors: ${student.riskFactors.join(", ")}`);
    if (student.daysFlagged > 0) lines.push(`Days flagged: ${student.daysFlagged}`);
    if (student.attPct !== null) lines.push(`Attendance: ${student.attPct}%`);
    if (student.avgScore !== null) lines.push(`Academic average: ${student.avgScore}%`);
    return lines.join("\n");
  })();

  // Open Parent Communication chat with a meeting-request draft pre-filled.
  const openParentChatForMeeting = () => {
    const principalName = (userData as any)?.name || "Principal";
    const childRef = student.name?.trim() || "your child";
    const prefill =
      `Assalamualaikum,\n\n` +
      `I'd like to schedule a parent meeting for ${childRef} regarding their recent academic and attendance trends. ` +
      `The meeting will help us discuss support options together.\n\n` +
      `${summaryLines}\n\n` +
      `Please reply with a convenient date and time.\n\n` +
      `${principalName}`;
    navigate("/parent-communication", {
      state: {
        studentId: student.id,
        studentEmail: student.email,
        prefillMessage: prefill,
      },
    });
  };

  // Open Teacher Notes chat with a risk alert draft pre-filled.
  const openTeacherChatForAlert = () => {
    if (!student.teacherId) {
      toast.error(`No assigned teacher on file for ${student.name}. Please assign a class teacher first.`);
      return;
    }
    const principalName = (userData as any)?.name || "Principal";
    const teacherRef = student.teacherName?.trim() || "Teacher";
    const prefill =
      `Assalamualaikum ${teacherRef},\n\n` +
      `${student.name} (${student.className}) has been flagged on the Risk Dashboard.\n\n` +
      `${summaryLines}\n\n` +
      `Please monitor closely and share any classroom observations.\n\n` +
      `${principalName}`;
    navigate("/teacher-notes", {
      state: {
        teacherId: student.teacherId,
        prefillMessage: prefill,
      },
    });
  };
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

  // `handleSaveAction` + `handleNotifyTeacher` removed — they wrote to
  // `interventions` / `parent_meetings` / `student_flags` collections that
  // weren't read by any other dashboard, OR sent emails that bypassed the
  // in-app messaging system. The 2 remaining actions both navigate to the
  // appropriate chat (Parent Communication / Teacher Notes) where the
  // principal edits the prefilled message and uses the chat as the canonical
  // delivery channel + audit trail.

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
                    if (action.id === "meeting") openParentChatForMeeting();
                    else if (action.id === "teacher") openTeacherChatForAlert();
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                    i === 0
                      ? "bg-[#1e3a8a] border-[#1e3a8a] hover:bg-[#1e4fc0] text-white shadow-md"
                      : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    i === 0 ? "bg-white/20" : action.bg
                  }`}>
                    <action.icon className={`w-5 h-5 ${i === 0 ? "text-white" : action.color}`} />
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

      {/* Action Modal removed — both remaining actions deep-link directly
          to chat. Principal edits the prefilled message there before sending. */}
    </div>
  );
};

export default RiskIntervention;
