/**
 * NotifyClassParentsModal.tsx
 *
 * Bulk-send an in-app chat message to every at-risk parent in a class. Each
 * parent receives a personalized note (their child's name + risk level
 * substituted into the template). Messages land in the Parent Communication
 * chat — NOT email — so parentEmail is optional. We still look it up from
 * `enrollments` to enrich `parentName` and store `parentEmail` on the doc
 * for any future email integrations, but we never gate delivery on it.
 *
 * Writes one doc per student into `principal_to_parent_notes` (same
 * collection the Parent Communication chat reads from). Atomic via
 * writeBatch chunked at 450 ops to stay under Firestore's 500-op limit.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Send, Loader2, Users, MessageSquare, Mail } from "lucide-react";
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
  attPct: number | null;
  avgScore: number | null;
}

interface Props {
  className: string;
  students: RiskStudentLite[];
  onClose: () => void;
}

const DEFAULT_TEMPLATE =
  "Dear Parent,\n\n" +
  "We wanted to bring to your attention that {NAME} has been flagged as {RISK} based on recent academic and attendance trends. " +
  "Key concerns: {FACTORS}.\n\n" +
  "We would like to discuss support options and next steps. Please reach out at your earliest convenience or reply to this message.\n\n" +
  "Warm regards,\n" +
  "Principal";

export default function NotifyClassParentsModal({ className, students, onClose }: Props) {
  const { userData } = useAuth();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [parentLookups, setParentLookups] = useState<Map<string, { parentEmail?: string; parentName?: string }>>(new Map());
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [sending, setSending] = useState(false);

  // Lookup parent emails via enrollments. We use studentId match — the same
  // collection is the source of truth for parent contacts in the Parent
  // Communication page, so we stay consistent.
  useEffect(() => {
    if (!userData?.schoolId || students.length === 0) {
      setLoadingLookups(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // P0: scope by schoolId server-side, branchId client-side. Server-side
        // branchId filter would silently drop fresh enrollments whose
        // branchId hasn't been backfilled by the trigger yet (memory:
        // branchid_inference_lag) — principal would miss those parents.
        const branchId = userData.branchId;
        const inBranch = (raw: any): boolean =>
          !branchId || !raw?.branchId || raw.branchId === branchId;
        const snap = await getDocs(
          query(collection(db, "enrollments"), where("schoolId", "==", userData.schoolId)),
        );
        if (cancelled) return;
        const lookup = new Map<string, { parentEmail?: string; parentName?: string }>();
        snap.docs.forEach(d => {
          const data = d.data() as any;
          if (!inBranch(data)) return;
          const sid = (data.studentId || "").trim();
          const sem = (data.studentEmail || data.email || "").trim().toLowerCase();
          const entry = {
            parentEmail: (data.parentEmail || "").trim() || undefined,
            parentName: (data.parentName || "").trim() || undefined,
          };
          if (sid && !lookup.has(sid)) lookup.set(sid, entry);
          if (sem && !lookup.has(`em:${sem}`)) lookup.set(`em:${sem}`, entry);
        });
        setParentLookups(lookup);
      } catch (err) {
        console.warn("[NotifyClassParentsModal] enrollment lookup failed:", err);
      } finally {
        if (!cancelled) setLoadingLookups(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userData?.schoolId, userData?.branchId, students.length]);

  // Every at-risk student is deliverable — chat is keyed by studentId, so
  // parentEmail is NOT required. The lookup just adds parentName/email
  // metadata when available; missing values fall back to "Parent of {name}".
  const recipients = useMemo(() => {
    return students.map(s => {
      const byId = parentLookups.get(s.id);
      const byEmail = s.email ? parentLookups.get(`em:${s.email.toLowerCase()}`) : undefined;
      const merged = byId || byEmail || {};
      return { ...s, ...merged };
    });
  }, [students, parentLookups]);
  const withEmail = recipients.filter(r => r.parentEmail).length;

  const personalize = (s: RiskStudentLite): string => {
    const factors = s.riskFactors.length > 0 ? s.riskFactors.join(", ") : "low engagement";
    return template
      .replace(/\{NAME\}/g, s.name || "your child")
      .replace(/\{RISK\}/g, s.riskLevel.toLowerCase())
      .replace(/\{FACTORS\}/g, factors);
  };

  const handleSendAll = async () => {
    if (!userData?.schoolId) {
      toast.error("Session lost — please log in again.");
      return;
    }
    if (recipients.length === 0) {
      toast.error("No at-risk students to notify.");
      return;
    }
    if (!template.trim()) {
      toast.error("Message cannot be empty.");
      return;
    }
    setSending(true);
    try {
      const principalUid = auth.currentUser?.uid || (userData as any)?.id || "";
      const principalName = (userData as any)?.fullName || (userData as any)?.name || "Principal";
      // Chunk at 450 ops to stay under Firestore's 500-op writeBatch limit.
      const CHUNK = 450;
      let written = 0;
      for (let i = 0; i < recipients.length; i += CHUNK) {
        const slice = recipients.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(s => {
          const ref = doc(collection(db, "principal_to_parent_notes"));
          batch.set(ref, {
            principalId: principalUid,
            principalName,
            studentId: s.id,
            studentEmail: s.email || null,
            studentName: s.name,
            parentEmail: s.parentEmail || null,
            parentName: s.parentName || `Parent of ${s.name}`,
            className: s.className || className,
            classId: s.classId || null,
            message: personalize(s),
            from: "principal",
            category: "risk_alert",
            riskLevel: s.riskLevel,
            timestamp: serverTimestamp(),
            schoolId: userData.schoolId,
            branchId: userData.branchId || null,
            read: false,
          });
        });
        await batch.commit();
        written += slice.length;
      }
      toast.success(`Sent message to ${written} parent${written === 1 ? "" : "s"} in Class ${className}`);
      onClose();
    } catch (err: any) {
      console.error("[NotifyClassParentsModal] send failed:", err);
      toast.error(err?.message || "Failed to send messages.");
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
        <div className="bg-gradient-to-br from-rose-600 to-rose-500 px-5 py-4 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white tracking-tight truncate">
                Notify All Parents
              </h2>
              <p className="text-[11px] text-rose-100 mt-0.5 truncate">
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loadingLookups ? (
            <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Preparing chat messages…</span>
            </div>
          ) : (
            <>
              {/* Delivery summary — every at-risk student gets an in-app
                  chat message; parentEmail is only used to enrich metadata. */}
              <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-white" strokeWidth={2.4} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">In-app chat</div>
                    <div className="text-base font-black text-rose-800 mt-0.5">
                      {recipients.length} parent{recipients.length === 1 ? "" : "s"} will get this message
                    </div>
                    <p className="text-[11px] text-rose-700/80 mt-1 leading-snug">
                      Lands in Parent Communication chat — no email required.
                      {withEmail > 0 && ` ${withEmail} also has email on file.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Template editor */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message Template
                </label>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={8}
                  disabled={sending}
                  className="w-full rounded-xl border-2 border-slate-100 focus:border-rose-300 focus:outline-none px-4 py-3 text-sm text-slate-800 leading-relaxed font-medium resize-none disabled:opacity-50"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Placeholders: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{"{NAME}"}</code>{" "}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">{"{RISK}"}</code>{" "}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">{"{FACTORS}"}</code> auto-fill per student.
                </p>
              </div>

              {/* Preview first recipient */}
              {recipients.length > 0 && (
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" />
                    Preview ({recipients[0].name})
                  </div>
                  <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                    {personalize(recipients[0])}
                  </p>
                </div>
              )}
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
            onClick={handleSendAll}
            disabled={sending || loadingLookups || recipients.length === 0}
            className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send to {recipients.length} parent{recipients.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
