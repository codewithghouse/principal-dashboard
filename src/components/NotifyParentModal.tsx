import { useState } from "react";
import { X, Send, Loader2, MessageSquare, Mail } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import type { ClassifiedStudent } from "@/lib/classifyStudent";
import { CATEGORY_META } from "@/lib/classifyStudent";

// Basic email-shape validation — catches empty/obviously-bad values before
// we hit the email API and waste a request.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (s: string) => EMAIL_RE.test(s.trim());

// HTML-escape untrusted fields before injecting into the email template.
// Prevents stored-XSS via school names / principal names that may contain
// angle brackets, ampersands or quotes.
function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch] || ch));
}

interface Props {
  student: ClassifiedStudent;
  onClose: () => void;
}

/**
 * NotifyParentModal
 * Writes to `principal_to_parent_notes` (shows in parent dashboard inbox)
 * AND optionally triggers an email via the send-email API.
 */
export default function NotifyParentModal({ student, onClose }: Props) {
  const { userData } = useAuth();
  const meta = CATEGORY_META[student.category];

  const [message, setMessage] = useState(() => defaultMessage(student));
  const [sendEmailFlag, setSendEmailFlag] = useState(true);
  const [sending, setSending] = useState(false);

  const parentEmail = student.parentEmail || student.email || "";

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Message cannot be empty.");
      return;
    }
    setSending(true);
    try {
      // 1) In-app note — always written
      const msgText = message.trim();
      await addDoc(collection(db, "principal_to_parent_notes"), {
        schoolId: userData?.schoolId,
        branchId: userData?.branchId || null,
        studentId: student.studentId,
        studentName: student.studentName,
        parentEmail,
        category: student.category,
        // write BOTH field names so either dashboard render path works
        message: msgText,
        content: msgText,
        from: "principal",
        principalId: (userData as any)?.uid || (userData as any)?.id || "",
        principalName: (userData as any)?.name || "Principal",
        read: false,
        timestamp: serverTimestamp(),
        _lastModifiedBy: (userData as any)?.uid || "principal",
      });

      // 2) Optional email (non-blocking — in-app note is authoritative)
      if (sendEmailFlag && parentEmail) {
        try {
          const html = buildParentEmailHtml({
            studentName: student.studentName,
            schoolName: (userData as any)?.schoolName || "Edullent",
            principalName: (userData as any)?.name || "Principal",
            message: message.trim(),
          });
          const res = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: parentEmail,
              subject: `Update about ${student.studentName}`,
              html,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn("[NotifyParent] email API returned error:", res.status, err);
            toast.warning("Email failed — in-app note was still delivered.");
          }
        } catch (emailErr) {
          console.warn("[NotifyParent] email failed (in-app note still sent):", emailErr);
          toast.warning("Email failed — in-app note was still delivered.");
        }
      }

      toast.success(`Message sent to ${student.studentName}'s parent`);
      onClose();
    } catch (err: any) {
      console.error("[NotifyParent] send failed:", err);
      toast.error("Failed to send. Try again.");
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
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notify Parent</h2>
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
          {/* Parent info */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Recipient</p>
            {parentEmail ? (
              <p className="text-sm font-semibold text-slate-800">{parentEmail}</p>
            ) : (
              <p className="text-sm font-semibold text-rose-600">No parent email on file — in-app note only</p>
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
              rows={8}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 resize-none"
            />
          </div>

          {/* Email toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendEmailFlag}
              onChange={e => setSendEmailFlag(e.target.checked)}
              disabled={!parentEmail}
              className="w-4 h-4 rounded accent-emerald-600"
            />
            <Mail className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-700">
              Also send as email {!parentEmail && <span className="text-rose-500">(no email on file)</span>}
            </span>
          </label>

          {/* Reasons pill */}
          <div
            className="rounded-xl p-3 border"
            style={{ background: meta.bg, borderColor: meta.border }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: meta.color }}>
              What triggered this
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
            disabled={sending}
            className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function buildParentEmailHtml({
  studentName, schoolName, principalName, message,
}: {
  studentName: string;
  schoolName: string;
  principalName: string;
  message: string;
}): string {
  // Every dynamic field is HTML-escaped before interpolation to prevent
  // stored-XSS via untrusted values (school name, principal name etc. are
  // user-editable fields).
  const safeName     = escapeHtml(studentName);
  const safeSchool   = escapeHtml(schoolName);
  const safePrincipal = escapeHtml(principalName);
  const safeBody     = escapeHtml(message).replace(/\n/g, "<br>");

  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: #1e3a8a; padding: 24px 28px;">
        <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">EDULLENT</h1>
        <p style="color: #bfdbfe; margin: 4px 0 0; font-size: 13px;">Update from ${safeSchool}</p>
      </div>
      <div style="padding: 28px; background: #fff;">
        <h2 style="color: #1e293b; font-size: 17px; margin: 0 0 6px;">About ${safeName}</h2>
        <p style="color: #64748b; font-size: 12px; margin: 0 0 18px;">Sent by ${safePrincipal}</p>
        <div style="background: #f8fafc; border-left: 3px solid #1e3a8a; padding: 16px 18px; border-radius: 0 8px 8px 0; color: #334155; font-size: 14px; line-height: 1.65;">
          ${safeBody}
        </div>
      </div>
      <div style="background: #f1f5f9; padding: 14px 28px; text-align: center;">
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">Powered by Edullent &middot; ${safeSchool}</p>
      </div>
    </div>
  `;
}

function defaultMessage(s: ClassifiedStudent): string {
  const first = s.studentName.split(" ")[0] || s.studentName;

  if (s.category === "weak") {
    return [
      `Dear Parent,`,
      ``,
      `This is an important update about ${first}'s progress.`,
      ``,
      `We have observed the following concerns:`,
      ...s.reasons.map(r => `  • ${r}`),
      ``,
      `We would like to partner with you to support ${first}. Please reach out to the class teacher at your earliest convenience so we can agree on a plan together.`,
      ``,
      `Thank you for your attention.`,
      ``,
      `Best regards,`,
      `School Principal`,
    ].join("\n");
  }

  if (s.category === "developing") {
    return [
      `Dear Parent,`,
      ``,
      `I wanted to share a progress update on ${first}.`,
      ``,
      `${first} is doing steady work with some areas for growth:`,
      ...s.reasons.map(r => `  • ${r}`),
      ``,
      `With consistent support at home, ${first} can reach their full potential. Regular reading, homework supervision, and encouragement will make a big difference.`,
      ``,
      `Please feel free to reach out if you have any questions.`,
      ``,
      `Best regards,`,
      `School Principal`,
    ].join("\n");
  }

  // smart
  return [
    `Dear Parent,`,
    ``,
    `Wonderful news — ${first} is performing excellently!`,
    ``,
    `Highlights:`,
    ...s.reasons.map(r => `  • ${r}`),
    ``,
    `We are proud of ${first}'s dedication. We encourage you to celebrate this achievement at home. We will continue challenging ${first} with enriched learning opportunities.`,
    ``,
    `Thank you for your continued support.`,
    ``,
    `Best regards,`,
    `School Principal`,
  ].join("\n");
}