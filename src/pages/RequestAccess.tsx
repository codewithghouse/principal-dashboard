import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GraduationCap, Send, CheckCircle, Loader2, User,
  Mail, Phone, FileText, AlertCircle, ShieldCheck
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, serverTimestamp, getDocs, query, where
} from "firebase/firestore";

// ── Public page — NO auth required ───────────────────────────────────────────
const RequestAccess = () => {
  const [params] = useSearchParams();
  const schoolId = params.get("schoolId") || "";
  const branchId = params.get("branchId") || "";

  const [form, setForm] = useState({
    name: "", email: "", phone: "", reason: ""
  });
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState("");
  const [schoolName, setSchoolName]   = useState<string | null>(null);
  const [principalEmail, setPrincipalEmail] = useState<string>("");

  // ── Resolve school name + principal email from schoolId ──────────────────
  useEffect(() => {
    if (!schoolId) return;
    getDocs(query(collection(db, "principals"), where("schoolId", "==", schoolId))).then(snap => {
      if (!snap.empty) {
        const d = snap.docs[0].data();
        setSchoolName(d.schoolName || d.school || schoolId);
        setPrincipalEmail(d.email || "");
      }
    }).catch(() => {});
  }, [schoolId]);

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and Email are required.");
      return;
    }
    if (!schoolId) {
      setError("Invalid link — ask your principal for the correct access request link.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      // 1. Best-effort duplicate check — silently skipped if rules block public reads
      try {
        const existing = await getDocs(
          query(collection(db, "access_requests"),
            where("email", "==", form.email.toLowerCase().trim()),
            where("schoolId", "==", schoolId)
          )
        );
        if (!existing.empty) {
          const status = existing.docs[0].data().status;
          setError(
            status === "approved"
              ? "Your request has already been approved! Try logging in."
              : status === "rejected"
              ? "Your request was rejected. Contact your principal directly."
              : "You already have a pending request. Please wait for approval."
          );
          setSubmitting(false);
          return;
        }
      } catch (preCheckErr: any) {
        // Public users cannot read this collection — that's fine, just create the request.
        // The principal will dedupe manually in Staff Access Control.
        if (preCheckErr?.code !== "permission-denied") {
          throw preCheckErr;
        }
      }

      // 2. Save request
      await addDoc(collection(db, "access_requests"), {
        name:      form.name.trim(),
        email:     form.email.toLowerCase().trim(),
        phone:     form.phone.trim(),
        reason:    form.reason.trim(),
        schoolId,
        branchId,
        status:    "pending",
        createdAt: serverTimestamp(),
      });

      // 3. Notify principal via email (best-effort)
      if (principalEmail) {
        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: principalEmail,
            subject: `New Data Entry Access Request — ${form.name}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
                <div style="background:#1e3a8a;padding:20px 24px;border-radius:8px 8px 0 0;margin:-24px -24px 24px;">
                  <h2 style="color:white;margin:0;font-size:18px;">New Access Request</h2>
                  <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">Data Entry Operator — ${schoolName || schoolId}</p>
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                  <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:130px;">Name</td><td style="font-weight:bold;color:#1e293b;">${form.name}</td></tr>
                  <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Email</td><td style="font-weight:bold;color:#1e293b;">${form.email}</td></tr>
                  ${form.phone ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Phone</td><td style="font-weight:bold;color:#1e293b;">${form.phone}</td></tr>` : ""}
                  ${form.reason ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top;">Reason</td><td style="color:#1e293b;">${form.reason}</td></tr>` : ""}
                </table>
                <p style="color:#64748b;font-size:13px;">Login to your principal dashboard and go to <strong>Staff Access</strong> to approve or reject this request.</p>
              </div>
            `,
          }),
        }).catch(() => {});
      }

      setDone(true);
    } catch (e: any) {
      console.error("RequestAccess submission error:", e);
      setError(e?.code === "permission-denied"
        ? "Permission denied — Firestore rules block public writes. Ask admin to update rules."
        : `Submission failed: ${e?.message || "Please try again."}`
      );
    }
    setSubmitting(false);
  };

  // ── Invalid link ─────────────────────────────────────────────────────────
  if (!schoolId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Invalid Link</h2>
          <p className="text-sm text-slate-500">
            This access request link is invalid or incomplete. Please ask your principal for the correct link.
          </p>
        </div>
      </div>
    );
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Request Submitted!</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your access request has been sent to the principal of{" "}
            <strong>{schoolName || schoolId}</strong>.<br /><br />
            You will be notified once approved. After approval, login with your Google account.
          </p>
          <div className="mt-6 px-5 py-3 bg-blue-50 rounded-2xl text-xs text-blue-700 font-bold">
            Submitted as: {form.email}
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-[#1e3a8a] px-8 py-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest">Edullent</p>
              <p className="text-sm font-black text-white">{schoolName || "School Management"}</p>
            </div>
          </div>
          <h1 className="text-2xl font-black text-white leading-tight">Request Dashboard Access</h1>
          <p className="text-sm text-blue-200 mt-1">Data Entry Operator · Limited Access</p>
        </div>

        {/* Info strip */}
        <div className="bg-blue-50 border-b border-blue-100 px-8 py-4 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 font-medium leading-relaxed">
            Your request will be reviewed by the principal. Once approved, you can log in with your Google account and access the assigned pages only.
          </p>
        </div>

        {/* Form */}
        <div className="p-8 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Full Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input value={form.name} onChange={set("name")}
                placeholder="Your full name"
                className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all" />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Google Email *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input value={form.email} onChange={set("email")} type="email"
                placeholder="Same email as your Google account"
                className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all" />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Must match your Google account — used for login</p>
          </div>

          {/* Phone */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input value={form.phone} onChange={set("phone")} type="tel"
                placeholder="Optional"
                className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all" />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Reason / Role Description</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3.5 w-4 h-4 text-slate-300" />
              <textarea value={form.reason} onChange={set("reason")} rows={3}
                placeholder="Brief description of your role and why you need access..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-blue-300 transition-all resize-none" />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !form.name.trim() || !form.email.trim()}
            className="w-full h-12 rounded-xl bg-[#1e3a8a] text-white text-sm font-black hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {submitting ? "Submitting..." : "Submit Access Request"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestAccess;
