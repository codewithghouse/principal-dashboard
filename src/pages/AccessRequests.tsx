import { useState, useEffect } from "react";
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, Copy,
  User, Mail, Phone, FileText, Loader2, Link2,
  ClipboardList, UserCheck, UserX, RefreshCw
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// ── Allowed pages config ──────────────────────────────────────────────────────
const ALL_PAGES = [
  { path: "/students",    label: "Students",           description: "View & add students" },
  { path: "/attendance",  label: "Attendance",         description: "Mark & view attendance" },
  { path: "/assignments", label: "Assignments & Marks", description: "Enter assignment marks" },
  { path: "/exams",       label: "Exams & Results",    description: "Enter exam results" },
  { path: "/teacher-notes", label: "Teacher Notes",   description: "View teacher notes" },
  { path: "/classes",     label: "Classes & Sections", description: "View class info" },
];

const DEFAULT_ALLOWED = ["/students", "/attendance", "/assignments", "/exams"];

const STATUS_CONFIG = {
  pending:  { label: "Pending",  bg: "bg-amber-100",  text: "text-amber-700",  icon: Clock },
  approved: { label: "Approved", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", bg: "bg-rose-100",   text: "text-rose-700",   icon: XCircle },
};

// ── Component ─────────────────────────────────────────────────────────────────
const AccessRequests = () => {
  const { userData } = useAuth();

  const [requests, setRequests]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState<"pending" | "approved" | "rejected">("pending");

  // Approve modal state
  const [approvingReq, setApprovingReq] = useState<any | null>(null);
  const [allowedPages, setAllowedPages] = useState<string[]>(DEFAULT_ALLOWED);
  const [approving, setApproving]       = useState(false);

  // Reject modal state
  const [rejectingReq, setRejectingReq] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting]       = useState(false);

  // ── Realtime listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userData?.schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, "access_requests"), where("schoolId", "==", userData.schoolId)),
      snap => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userData?.schoolId]);

  // ── Copy access link ─────────────────────────────────────────────────────
  const copyLink = () => {
    const base = window.location.origin;
    const link = `${base}/request-access?schoolId=${userData?.schoolId}&branchId=${userData?.branchId || ""}`;
    navigator.clipboard.writeText(link);
    toast.success("Access request link copied!");
  };

  // ── Approve ──────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!approvingReq) return;
    if (allowedPages.length === 0) {
      toast.error("Select at least one page to grant access.");
      return;
    }
    setApproving(true);
    try {
      // 1. Create data_entry_staff record → DEO can now login
      await addDoc(collection(db, "data_entry_staff"), {
        name:         approvingReq.name,
        email:        approvingReq.email,
        phone:        approvingReq.phone || "",
        reason:       approvingReq.reason || "",
        role:         "data_entry",
        schoolId:     userData!.schoolId,
        branchId:     userData!.branchId || "",
        schoolName:   userData!.schoolName || "",
        status:       "approved",
        allowedPages,
        approvedBy:   userData!.email,
        approvedAt:   serverTimestamp(),
        requestId:    approvingReq.id,
        createdAt:    serverTimestamp(),
      });

      // 2. Update request status
      await updateDoc(doc(db, "access_requests", approvingReq.id), {
        status:     "approved",
        reviewedBy: userData!.email,
        reviewedAt: serverTimestamp(),
        allowedPages,
      });

      // 3. Email DEO (best-effort)
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: approvingReq.email,
          subject: `Your access has been approved — ${userData?.schoolName || "School Dashboard"}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
              <div style="background:#1e3a8a;padding:20px 24px;border-radius:8px 8px 0 0;margin:-24px -24px 24px;">
                <h2 style="color:white;margin:0;">Access Approved!</h2>
                <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">${userData?.schoolName || "School Dashboard"}</p>
              </div>
              <p style="color:#334155;">Hi <strong>${approvingReq.name}</strong>,</p>
              <p style="color:#64748b;">Your request for Data Entry access has been <strong style="color:#16a34a;">approved</strong> by the principal.</p>
              <p style="color:#64748b;font-weight:bold;">You now have access to:</p>
              <ul style="color:#334155;">${allowedPages.map(p => {
                const pg = ALL_PAGES.find(x => x.path === p);
                return `<li style="padding:4px 0;">${pg?.label || p}</li>`;
              }).join("")}</ul>
              <div style="margin:28px 0;text-align:center;">
                <a href="${window.location.origin}" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
                  Login Now with Google
                </a>
              </div>
              <p style="color:#94a3b8;font-size:12px;">Use your Google account (${approvingReq.email}) to sign in.</p>
            </div>
          `,
        }),
      }).catch(() => {});

      toast.success(`${approvingReq.name} approved successfully!`);
      setApprovingReq(null);
      setAllowedPages(DEFAULT_ALLOWED);
    } catch (e: any) {
      toast.error("Approval failed: " + e.message);
    }
    setApproving(false);
  };

  // ── Reject ───────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectingReq) return;
    setRejecting(true);
    try {
      await updateDoc(doc(db, "access_requests", rejectingReq.id), {
        status:          "rejected",
        rejectionReason: rejectReason.trim(),
        reviewedBy:      userData!.email,
        reviewedAt:      serverTimestamp(),
      });

      // Email DEO
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: rejectingReq.email,
          subject: `Access Request Update — ${userData?.schoolName || "School Dashboard"}`,
          html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#1e3a8a;">Access Request Decision</h2>
            <p>Hi <strong>${rejectingReq.name}</strong>, your access request has been <strong style="color:#dc2626;">declined</strong>.</p>
            ${rejectReason ? `<p style="color:#64748b;">Reason: ${rejectReason}</p>` : ""}
            <p style="color:#94a3b8;font-size:13px;">Contact your principal for more information.</p>
          </div>`,
        }),
      }).catch(() => {});

      toast.success("Request rejected.");
      setRejectingReq(null);
      setRejectReason("");
    } catch (e: any) {
      toast.error("Rejection failed: " + e.message);
    }
    setRejecting(false);
  };

  // ── Re-open a rejected request to pending ────────────────────────────────
  const handleReset = async (req: any) => {
    await updateDoc(doc(db, "access_requests", req.id), { status: "pending", rejectionReason: "" });
    toast.success("Request moved back to pending.");
  };

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = requests.filter(r => r.status === tab);
  const counts   = {
    pending:  requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };

  const formatDate = (ts: any) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 text-left">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Staff Access Control</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1e3a8a]" /> Data Entry Operator Requests · Approval Workflow
          </p>
        </div>
        <button
          onClick={copyLink}
          className="flex items-center gap-2 px-6 py-4 bg-[#1e3a8a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
        >
          <Link2 className="w-4 h-4" /> Copy Request Link
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-black text-blue-800">How to invite a Data Entry Operator</p>
          <p className="text-xs text-blue-600 mt-1 leading-relaxed">
            Click <strong>"Copy Request Link"</strong> and share it with the person. They fill in the form — their request appears here as <em>Pending</em>. You approve it and choose which pages they can access. They then log in with their Google account.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {(["pending", "approved", "rejected"] as const).map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <div key={s} className={`${cfg.bg} rounded-2xl p-5 flex items-center gap-4 cursor-pointer border-2 transition-all ${tab === s ? "border-current opacity-100 scale-[1.02] shadow-md" : "border-transparent opacity-80"}`}
              onClick={() => setTab(s)}>
              <cfg.icon className={`w-7 h-7 ${cfg.text} shrink-0`} />
              <div>
                <p className={`text-2xl font-black ${cfg.text}`}>{counts[s]}</p>
                <p className={`text-[10px] font-black uppercase tracking-widest ${cfg.text} opacity-70`}>{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tab requests */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading requests...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-100 p-16 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No {tab} requests</p>
          {tab === "pending" && (
            <p className="text-xs text-slate-300 mt-1">Share the request link with your data entry team</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
            return (
              <div key={req.id} className="bg-white rounded-3xl border-2 border-slate-50 shadow-sm hover:shadow-md transition-shadow p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                  {/* Left: person info */}
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#1e3a8a]/10 flex items-center justify-center text-[#1e3a8a] font-black text-lg shrink-0">
                      {(req.name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-800 text-base">{req.name}</p>
                        <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                          <Mail className="w-3 h-3" /> {req.email}
                        </span>
                        {req.phone && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                            <Phone className="w-3 h-3" /> {req.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                          <Clock className="w-3 h-3" /> {formatDate(req.createdAt)}
                        </span>
                      </div>
                      {req.reason && (
                        <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1">
                          <FileText className="w-3 h-3 mt-0.5 shrink-0 text-slate-300" />
                          {req.reason}
                        </p>
                      )}
                      {req.status === "approved" && req.allowedPages && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(req.allowedPages as string[]).map(p => {
                            const pg = ALL_PAGES.find(x => x.path === p);
                            return (
                              <span key={p} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-md border border-emerald-100">
                                {pg?.label || p}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {req.status === "rejected" && req.rejectionReason && (
                        <p className="text-xs text-rose-500 mt-1.5">Reason: {req.rejectionReason}</p>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {req.status === "pending" && (
                      <>
                        <button
                          onClick={() => { setApprovingReq(req); setAllowedPages(DEFAULT_ALLOWED); }}
                          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors shadow-sm"
                        >
                          <UserCheck className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => { setRejectingReq(req); setRejectReason(""); }}
                          className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-colors"
                        >
                          <UserX className="w-4 h-4" /> Reject
                        </button>
                      </>
                    )}
                    {req.status === "rejected" && (
                      <button
                        onClick={() => handleReset(req)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Re-open
                      </button>
                    )}
                    {req.status === "approved" && (
                      <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-black uppercase tracking-widest">
                        <CheckCircle2 className="w-4 h-4" /> Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Approve Modal ──────────────────────────────────────────────────── */}
      {approvingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setApprovingReq(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

            <div className="bg-emerald-700 px-6 py-5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Approve Access</h2>
                <p className="text-xs text-emerald-200">{approvingReq.name} · {approvingReq.email}</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                  Select pages to grant access
                </p>
                <div className="space-y-2">
                  {ALL_PAGES.map(pg => (
                    <label key={pg.path} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      allowedPages.includes(pg.path)
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-100 hover:border-slate-200"
                    }`}>
                      <input
                        type="checkbox"
                        checked={allowedPages.includes(pg.path)}
                        onChange={e => setAllowedPages(prev =>
                          e.target.checked
                            ? [...prev, pg.path]
                            : prev.filter(p => p !== pg.path)
                        )}
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-black text-slate-700">{pg.label}</p>
                        <p className="text-[10px] text-slate-400">{pg.description}</p>
                      </div>
                      {allowedPages.includes(pg.path) && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">{allowedPages.length} page{allowedPages.length !== 1 ? "s" : ""} selected</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setApprovingReq(null)}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleApprove} disabled={approving || allowedPages.length === 0}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  {approving ? "Approving..." : "Grant Access"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ───────────────────────────────────────────────────── */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectingReq(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">

            <div className="bg-rose-600 px-6 py-5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <UserX className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Reject Request</h2>
                <p className="text-xs text-rose-200">{rejectingReq.name}</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Reason (optional)</label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why this request is rejected..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-rose-300 transition-all resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRejectingReq(null)}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleReject} disabled={rejecting}
                  className="flex-1 h-11 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                  {rejecting ? "Rejecting..." : "Reject Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessRequests;
