/**
 * NotifyClassTeachersModal.tsx
 *
 * Notify the teacher(s) of a single class about all at-risk students in
 * that class. Two modes:
 *   - "single"  → pick one teacher from a dropdown
 *   - "all"     → notify every teacher mapped to this class
 *
 * Teacher discovery: query `teaching_assignments` for the classId, then
 * resolve teacherIds → `teachers` collection. If teaching_assignments is
 * empty (e.g., a class without explicit subject mapping), falls back to
 * matching teachers whose `classId` field equals the class.
 *
 * Writes to `principal_to_teacher_notes` (one doc per teacher) — same
 * collection the Teacher Dashboard inbox reads from.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Send, Loader2, GraduationCap, Users, AlertTriangle, MessageSquare } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

interface RiskStudentLite {
  id: string;
  name: string;
  email: string;
  className: string;
  classId?: string;
  riskLevel: "CRITICAL" | "WARNING" | "MONITORING";
  riskFactors: string[];
}

interface TeacherOption {
  id: string;
  name: string;
  email?: string;
  subject?: string;
}

interface Props {
  className: string;
  classId?: string;
  students: RiskStudentLite[];
  onClose: () => void;
}

export default function NotifyClassTeachersModal({ className, classId, students, onClose }: Props) {
  const { userData } = useAuth();
  const [mode, setMode] = useState<"single" | "all">("all");
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [message, setMessage] = useState(() => buildDefaultMessage(className, students));
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!userData?.schoolId) {
      setLoadingTeachers(false);
      return;
    }
    let cancelled = false;
    setLoadingTeachers(true);
    (async () => {
      try {
        // P0: scope by schoolId ONLY server-side, then client-filter by branchId.
        // The enforceBranchId_* trigger backfills missing branchId with ~1-2s
        // lag, so server-side `where("branchId", "==", X)` silently hides
        // freshly-added teachers/assignments (memory: branchid_inference_lag).
        const c: any[] = [where("schoolId", "==", userData.schoolId)];
        const branchId = userData.branchId;
        const inBranch = (raw: any): boolean =>
          !branchId || !raw?.branchId || raw.branchId === branchId;

        const allSnap = await getDocs(query(collection(db, "teachers"), ...c));
        const allTeachers: TeacherOption[] = allSnap.docs
          .filter(d => inBranch(d.data()))
          .map(d => {
            const td = d.data() as any;
            return {
              id: d.id,
              name: (td.name || td.fullName || "").trim(),
              email: (td.email || "").trim(),
              subject: td.subject || td.subjects?.[0] || "",
            };
          })
          .filter(t => t.name); // drop ghost docs without name

        // Build raw-data lookup for fallback class matching (avoid repeated find()).
        const rawById = new Map<string, any>();
        allSnap.docs.forEach(d => rawById.set(d.id, d.data()));

        // Resolve teaching_assignments → which teachers teach this class
        let teacherIdsForClass = new Set<string>();
        if (classId) {
          try {
            const assignSnap = await getDocs(
              query(
                collection(db, "teaching_assignments"),
                ...c,
                where("classId", "==", classId),
              ),
            );
            assignSnap.docs.forEach(d => {
              const data = d.data() as any;
              if (!inBranch(data)) return;
              if (data.teacherId) teacherIdsForClass.add(data.teacherId);
            });
          } catch (err) {
            console.warn("[NotifyClassTeachersModal] teaching_assignments lookup failed:", err);
          }
        }

        // Fallback 1: teacher docs with classId field directly matching
        if (teacherIdsForClass.size === 0 && classId) {
          allTeachers.forEach(t => {
            if (rawById.get(t.id)?.classId === classId) teacherIdsForClass.add(t.id);
          });
        }

        // Fallback 2: classNames / classes array on teacher doc
        if (teacherIdsForClass.size === 0) {
          allTeachers.forEach(t => {
            const raw = rawById.get(t.id);
            const names: string[] = raw?.classNames || raw?.classes || [];
            if (Array.isArray(names) && names.map(String).includes(className)) {
              teacherIdsForClass.add(t.id);
            }
          });
        }

        // P0-CRITICAL: do NOT silently fall back to "all branch teachers"
        // when no class mapping is found. Bulk-notifying every teacher in
        // the school for a class they don't teach is a privacy + spam risk.
        // Show empty state instead so the principal sets up assignments first.
        const filtered = teacherIdsForClass.size > 0
          ? allTeachers.filter(t => teacherIdsForClass.has(t.id))
          : [];

        if (cancelled) return;
        setTeachers(filtered);
        if (filtered.length > 0 && !selectedTeacherId) {
          setSelectedTeacherId(filtered[0].id);
        }
      } catch (err) {
        console.warn("[NotifyClassTeachersModal] teacher fetch failed:", err);
      } finally {
        if (!cancelled) setLoadingTeachers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userData?.schoolId, userData?.branchId, classId, className]);

  // Recipients = either single picked teacher, or all teachers. The teacher
  // dashboard inbox (`principal_to_teacher_notes`) queries by teacherId,
  // NOT email — so email is optional metadata, never a delivery gate.
  const recipients = useMemo(() => {
    return mode === "all"
      ? teachers
      : teachers.filter(t => t.id === selectedTeacherId);
  }, [mode, teachers, selectedTeacherId]);
  const withoutEmail = useMemo(() => recipients.filter(t => !t.email).length, [recipients]);

  const handleSend = async () => {
    if (!userData?.schoolId) {
      toast.error("Session lost — please log in again.");
      return;
    }
    if (!message.trim()) {
      toast.error("Message cannot be empty.");
      return;
    }
    if (recipients.length === 0) {
      toast.error("No teachers selected.");
      return;
    }
    setSending(true);
    try {
      const principalUid = auth.currentUser?.uid || (userData as any)?.id || "";
      const principalName = (userData as any)?.fullName || (userData as any)?.name || "Principal";
      // writeBatch — class-scoped recipient list rarely exceeds 100, but
      // chunking to 450 keeps us safe under the 500-op cap regardless.
      const CHUNK = 450;
      let written = 0;
      for (let i = 0; i < recipients.length; i += CHUNK) {
        const slice = recipients.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(t => {
          const ref = doc(collection(db, "principal_to_teacher_notes"));
          batch.set(ref, {
            principalId: principalUid,
            principalName,
            teacherId: t.id,
            teacherName: t.name,
            teacherEmail: t.email || null,
            subject: t.subject || null,
            className,
            classId: classId || null,
            riskStudents: students.map(s => ({
              id: s.id,
              name: s.name,
              riskLevel: s.riskLevel,
              factors: s.riskFactors,
            })),
            studentCount: students.length,
            message: message.trim(),
            from: "principal",
            category: "risk_class_alert",
            timestamp: serverTimestamp(),
            schoolId: userData.schoolId,
            branchId: userData.branchId || null,
            read: false,
          });
        });
        await batch.commit();
        written += slice.length;
      }
      toast.success(
        mode === "all"
          ? `Notified ${written} teacher${written === 1 ? "" : "s"} for ${className}`
          : `Notified ${recipients[0].name}`
      );
      onClose();
    } catch (err: any) {
      console.error("[NotifyClassTeachersModal] send failed:", err);
      toast.error(err?.message || "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-700 to-blue-600 px-5 py-4 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white tracking-tight truncate">
                Notify Teacher{mode === "all" ? "s" : ""}
              </h2>
              <p className="text-[11px] text-blue-100 mt-0.5 truncate">
                Class {className} · {students.length} at-risk student{students.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-50 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5 pt-4 shrink-0">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
            <button
              onClick={() => setMode("single")}
              disabled={sending}
              className={`px-4 h-9 rounded-lg text-[12px] font-bold transition-colors ${
                mode === "single" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
              }`}
            >
              Single Teacher
            </button>
            <button
              onClick={() => setMode("all")}
              disabled={sending}
              className={`px-4 h-9 rounded-lg text-[12px] font-bold transition-colors ${
                mode === "all" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
              }`}
            >
              All Teachers
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loadingTeachers ? (
            <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Loading teachers…</span>
            </div>
          ) : teachers.length === 0 ? (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-amber-800">No teachers found for this class</p>
              <p className="text-[11px] text-amber-700 mt-1">
                Add teaching assignments in the Teachers page first.
              </p>
            </div>
          ) : (
            <>
              {/* Single mode: dropdown */}
              {mode === "single" && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Recipient
                  </label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    disabled={sending}
                    className="w-full h-11 rounded-xl border-2 border-slate-100 focus:border-blue-300 focus:outline-none px-4 text-sm font-medium text-slate-800 bg-white disabled:opacity-50"
                  >
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.subject ? ` · ${t.subject}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* All mode: count summary — every class teacher gets the
                  in-app inbox message; email is optional. */}
              {mode === "all" && (
                <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-white" strokeWidth={2.4} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">In-app inbox</div>
                      <div className="text-base font-black text-blue-900 mt-0.5">
                        {recipients.length} teacher{recipients.length === 1 ? "" : "s"} will get this message
                      </div>
                      <p className="text-[11px] text-blue-700/80 mt-1 leading-snug">
                        Lands in their Principal Notes inbox — no email required.
                        {withoutEmail > 0 && ` ${withoutEmail} without email on file.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Message editor */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={9}
                  disabled={sending}
                  className="w-full rounded-xl border-2 border-slate-100 focus:border-blue-300 focus:outline-none px-4 py-3 text-sm text-slate-800 leading-relaxed font-medium resize-none disabled:opacity-50"
                />
              </div>

            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 flex items-center gap-2 shrink-0 bg-white">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 h-11 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || loadingTeachers || recipients.length === 0}
            className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {mode === "all"
                  ? `Send to ${recipients.length} teacher${recipients.length === 1 ? "" : "s"}`
                  : "Send"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildDefaultMessage(className: string, students: RiskStudentLite[]): string {
  const lines: string[] = [];
  lines.push(`Dear Teacher,`);
  lines.push("");
  lines.push(
    `Class ${className} currently has ${students.length} student${students.length === 1 ? "" : "s"} flagged at risk based on attendance, academics, or recent disciplinary signals. Please review the list below and add any classroom observations or planned interventions.`
  );
  lines.push("");
  // Top 5 to keep the default short — full list is in the doc payload anyway.
  students.slice(0, 5).forEach(s => {
    const factors = s.riskFactors.slice(0, 2).join(", ") || "general concerns";
    lines.push(`• ${s.name} (${s.riskLevel}) — ${factors}`);
  });
  if (students.length > 5) lines.push(`…and ${students.length - 5} more.`);
  lines.push("");
  lines.push("Kindly share an update by end of week so we can align on next steps.");
  lines.push("");
  lines.push("Thank you,");
  lines.push("Principal");
  return lines.join("\n");
}
