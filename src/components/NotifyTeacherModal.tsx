import { useState, useEffect } from "react";
import { X, Send, Loader2, GraduationCap } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import type { ClassifiedStudent } from "@/lib/classifyStudent";
import { CATEGORY_META } from "@/lib/classifyStudent";

interface Props {
  student: ClassifiedStudent;
  onClose: () => void;
}

interface TeacherOption {
  id: string;
  name?: string;
  subject?: string;
  email?: string;
  schoolId?: string;
  branchId?: string;
}

/**
 * NotifyTeacherModal
 * Pre-fills a message to the student's class teacher based on the
 * auto-classified category. Principal can edit before sending.
 * Writes to `principal_to_teacher_notes` collection so it appears in the
 * teacher's dashboard inbox.
 */
export default function NotifyTeacherModal({ student, onClose }: Props) {
  const { userData } = useAuth();
  const meta = CATEGORY_META[student.category];

  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [message, setMessage] = useState(() => defaultMessage(student));
  const [sending, setSending] = useState(false);

  // Fetch teachers for this classId (to pre-select + populate dropdown)
  useEffect(() => {
    if (!userData?.schoolId) return;

    // Cancellation flag — prevents state updates after unmount or rapid
    // classId change (protects against stale async setState).
    let cancelled = false;
    setLoadingTeachers(true);

    (async () => {
      try {
        const fetchAllTeachers = async (): Promise<TeacherOption[]> => {
          const c = [where("schoolId", "==", userData.schoolId)];
          if (userData.branchId) c.push(where("branchId", "==", userData.branchId));
          const snap = await getDocs(query(collection(db, "teachers"), ...c));
          return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TeacherOption, "id">) }));
        };

        let list: TeacherOption[] = [];

        if (student.classId) {
          // Try class-scoped lookup via teaching_assignments first
          const taC = [where("schoolId", "==", userData.schoolId)];
          if (userData.branchId) taC.push(where("branchId", "==", userData.branchId));
          const assignSnap = await getDocs(query(
            collection(db, "teaching_assignments"),
            ...taC,
            where("classId", "==", student.classId),
          ));
          const teacherIds = Array.from(new Set(
            assignSnap.docs.map(d => d.data().teacherId).filter(Boolean),
          ));

          if (teacherIds.length > 0) {
            const all = await fetchAllTeachers();
            list = all.filter(t => teacherIds.includes(t.id));
          }
        }

        // Fall back to all teachers if no classId or class had no assignments
        if (list.length === 0) list = await fetchAllTeachers();

        if (cancelled) return;
        setTeachers(list);
        if (list.length > 0) setSelectedTeacherId(list[0].id);
      } catch (err) {
        if (cancelled) return;
        console.error("[NotifyTeacherModal] teacher fetch failed:", err);
        toast.error("Couldn't load teachers. Please try again.");
      } finally {
        if (!cancelled) setLoadingTeachers(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userData?.schoolId, userData?.branchId, student.classId]);

  const handleSend = async () => {
    // Pre-validate BEFORE flipping sending state so no spinner flash on errors
    if (!selectedTeacherId) {
      toast.error("Select a teacher first.");
      return;
    }
    const msgText = message.trim();
    if (!msgText) {
      toast.error("Message cannot be empty.");
      return;
    }
    if (!userData?.schoolId) {
      toast.error("Session lost. Please log in again.");
      return;
    }
    // Authoritative principal uid for audit trail — fall back to doc id
    const principalUid = auth.currentUser?.uid || (userData as { id?: string }).id;
    if (!principalUid) {
      toast.error("Unable to verify principal identity. Please log in again.");
      return;
    }

    setSending(true);
    try {
      const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);
      const teacherName = selectedTeacher?.name || "Teacher";

      await addDoc(collection(db, "principal_to_teacher_notes"), {
        schoolId: userData.schoolId,
        branchId: userData.branchId || null,
        teacherId: selectedTeacherId,
        teacherName,
        studentId: student.studentId,
        studentName: student.studentName,
        category: student.category,
        // Write BOTH field names — teacher dashboard reads `message`,
        // other code paths read `content`.
        message: msgText,
        content: msgText,
        from: "principal",
        principalId: principalUid,
        principalName: (userData as { name?: string }).name || "Principal",
        read: false,
        timestamp: serverTimestamp(),
        _lastModifiedBy: principalUid,
      });
      toast.success(`Message sent to ${teacherName} about ${student.studentName}`);
      onClose();
    } catch (err) {
      console.error("[NotifyTeacherModal] send failed:", err);
      const msg = err instanceof Error ? err.message : "Please try again.";
      toast.error(`Failed to send — ${msg}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-[#1e3a8a]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notify Teacher</h2>
              <p className="text-xs text-slate-500">
                About {student.studentName} · <span style={{ color: meta.color }}>{meta.label}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {/* Teacher selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
              Send to teacher
            </label>
            {loadingTeachers ? (
              <div className="h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            ) : teachers.length === 0 ? (
              <div className="h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center px-3">
                <span className="text-xs font-semibold text-rose-600">No teachers found for this class</span>
              </div>
            ) : (
              <select
                value={selectedTeacherId}
                onChange={e => setSelectedTeacherId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              >
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.subject ? `· ${t.subject}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
              Message (edit as needed)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={7}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Teacher will see this in their in-app inbox.
            </p>
          </div>

          {/* Reasons pill */}
          <div
            className="rounded-xl p-3 border"
            style={{ background: meta.bg, borderColor: meta.border }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: meta.color }}>
              Auto-detected reasons
            </p>
            <ul className="text-xs text-slate-700 leading-relaxed">
              {student.reasons.map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !selectedTeacherId || teachers.length === 0}
            className="px-5 py-2 rounded-xl bg-[#1e3a8a] text-white text-sm font-semibold hover:bg-[#1e4fc0] disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultMessage(s: ClassifiedStudent): string {
  const lines: string[] = [
    `ACTION REQUIRED — STUDENT PERFORMANCE ALERT`,
    ``,
    `${s.studentName} (Class ${s.className || "—"}, Roll ${s.rollNo || "—"}) has been auto-flagged as "${CATEGORY_META[s.category].label.toUpperCase()}".`,
    ``,
    `Auto-detected signals:`,
    ...s.reasons.map(r => `  • ${r}`),
    ``,
  ];

  if (s.category === "weak") {
    lines.push(
      `This student is underperforming in your class. You are directly responsible for this outcome. Submit a written intervention plan within 48 hours covering:`,
      `  1. Root cause analysis — academic gap, attendance, or behaviour`,
      `  2. Specific remedial actions — extra classes, 1-on-1 sessions, revised lesson plan`,
      `  3. Mandatory parent meeting scheduled within this week`,
      `  4. Weekly progress check-ins reported back to me`,
      ``,
      `Failure to respond will be recorded in your performance review.`,
    );
  } else if (s.category === "developing") {
    lines.push(
      `${s.studentName.split(" ")[0]} is below expected performance. Share a focused improvement plan within 72 hours addressing:`,
      `  1. Specific weak topics / concepts`,
      `  2. Concrete practice tasks assigned`,
      `  3. Target score for next assessment`,
      ``,
      `Proactive teaching is expected — not reactive.`,
    );
  } else {
    lines.push(
      `${s.studentName.split(" ")[0]} is performing well. Maintain this standard — but do not let them stagnate. Deliverables within this week:`,
      `  1. Enrichment assignments / advanced problem sets`,
      `  2. Peer-tutoring assignment if available`,
      `  3. Extracurricular / leadership recommendation`,
      ``,
      `Every student must continue growing. This is non-negotiable.`,
    );
  }

  lines.push(``, `— Principal`);
  return lines.join("\n");
}