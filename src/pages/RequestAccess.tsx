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
// Reason length cap — protects DB from accidentally huge text (paste of an
// entire CV) and matches what the principal can comfortably scan.
const REASON_MAX_LEN = 1000;
// Email format guard — same regex shape we use across the app for validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SchoolValidity = "loading" | "valid" | "invalid";

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
  // schoolValidity gates the form — a typo'd or non-existent schoolId in the
  // URL used to silently produce a working form that wrote garbage docs.
  // We now resolve via the public `principals` lookup before allowing submit.
  const [schoolValidity, setSchoolValidity] = useState<SchoolValidity>("loading");

  // ── Resolve school name + principal email from schoolId ──────────────────
  useEffect(() => {
    if (!schoolId) {
      setSchoolValidity("invalid");
      return;
    }
    setSchoolValidity("loading");
    getDocs(query(collection(db, "principals"), where("schoolId", "==", schoolId)))
      .then(snap => {
        if (snap.empty) {
          // Public reads on principals are allowed; an empty result means
          // the schoolId in the URL doesn't belong to any registered school.
          setSchoolValidity("invalid");
          return;
        }
        const d = snap.docs[0].data();
        setSchoolName(d.schoolName || d.school || schoolId);
        setPrincipalEmail(d.email || "");
        setSchoolValidity("valid");
      })
      .catch((err) => {
        // permission-denied (rules tightening) or network — degraded mode:
        // accept submissions but skip the principal-name display. This
        // preserves uptime if rules ever block public principals reads.
        console.warn("[RequestAccess] school lookup failed:", err?.code || err?.message);
        setSchoolValidity("valid");
      });
  }, [schoolId]);

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    const name = form.name.trim();
    const email = form.email.toLowerCase().trim();
    const phone = form.phone.trim();
    const reason = form.reason.trim();

    if (!name || !email) {
      setError("Name and Email are required.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (reason.length > REASON_MAX_LEN) {
      setError(`Reason is too long (${reason.length} chars, max ${REASON_MAX_LEN}).`);
      return;
    }
    if (!schoolId || schoolValidity === "invalid") {
      setError("Invalid link — ask your principal for the correct access request link.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      // 1. Best-effort duplicate check. ANY error is logged + swallowed —
      //    permission-denied (public can't list), network blip, etc. The
      //    principal's UI dedupes manually if a duplicate slips through.
      try {
        const existing = await getDocs(
          query(collection(db, "access_requests"),
            where("email", "==", email),
            where("schoolId", "==", schoolId)
          )
        );
        if (!existing.empty) {
          const status = String(existing.docs[0].data().status || "").toLowerCase();
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
        // Best-effort — never block submission on dedup-check failure.
        console.warn("[RequestAccess] dedup pre-check failed:", preCheckErr?.code || preCheckErr?.message);
      }

      // 2. Save request — uses the locally-trimmed values computed above.
      await addDoc(collection(db, "access_requests"), {
        name,
        email,
        phone,
        reason,
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

  // ── Loading: resolving the school from the URL ──────────────────────────
  if (schoolValidity === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-[#1e3a8a]" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            Verifying invitation…
          </p>
        </div>
      </div>
    );
  }

  // ── Invalid: schoolId missing OR doesn't match any registered school ────
  if (schoolValidity === "invalid") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Invalid Link</h2>
          <p className="text-sm text-slate-500">
            {schoolId
              ? <>This access request link points to a school that doesn't exist (<code className="text-[11px] bg-slate-100 px-1 rounded">{schoolId.slice(0, 8)}…</code>). Ask your principal for the correct link.</>
              : <>This access request link is invalid or incomplete. Please ask your principal for the correct link.</>}
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
                maxLength={REASON_MAX_LEN}
                placeholder="Brief description of your role and why you need access..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-blue-300 transition-all resize-none" />
              {form.reason.length > REASON_MAX_LEN * 0.8 && (
                <p className="text-[10px] text-slate-400 mt-1 text-right">
                  {form.reason.length} / {REASON_MAX_LEN}
                </p>
              )}
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
