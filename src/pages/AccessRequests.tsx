import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Clock, CheckCircle2, XCircle,
  Mail, Phone, FileText, Loader2, Link2,
  UserCheck, UserX, RefreshCw, Pencil, Trash2, AlertTriangle, Shield,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, deleteDoc,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { sendDeoApprovedEmail, sendDeoRejectedEmail } from "@/lib/resend";
import { toast } from "sonner";

// ── Allowed pages config — keep in sync with principal-dashboard sidebar ─────
const ALL_PAGES = [
  { path: "/",                     label: "Dashboard",              description: "Home & overview" },
  { path: "/students",             label: "Students",               description: "View & add students" },
  { path: "/student-intelligence", label: "Student Intelligence",   description: "AI insights on students" },
  { path: "/risk-students",        label: "Risk Students",          description: "At-risk student list" },
  { path: "/classes",              label: "Classes & Sections",     description: "Class & section setup" },
  { path: "/teachers",             label: "Teachers",               description: "Teachers directory" },
  { path: "/academics",            label: "Academics",              description: "Academic overview" },
  { path: "/attendance",           label: "Attendance",             description: "Mark & view attendance" },
  { path: "/discipline",           label: "Discipline & Incidents", description: "Behaviour records" },
  { path: "/parent-communication", label: "Parent Communication",   description: "Messages to parents" },
  { path: "/teacher-notes",        label: "Teacher Notes",          description: "View teacher notes" },
  { path: "/exams",                label: "Exams & Results",        description: "Enter exam results" },
  { path: "/assignments",          label: "Assignments & Marks",    description: "Enter assignment marks" },
  { path: "/teacher-performance",  label: "Teacher Performance",    description: "Teacher analytics" },
  { path: "/fee-structure",        label: "Fee Structure",          description: "Upload term-wise fee Excel" },
  { path: "/exam-structure",       label: "Exam Structure",         description: "Exam blueprint setup" },
  { path: "/timetable",            label: "Timetable Setup",        description: "School timetable" },
  { path: "/reports",              label: "Reports",                description: "Reports & exports" },
];

const DEFAULT_ALLOWED = ["/students", "/attendance", "/assignments", "/exams"];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  pending:  { label: "Pending",  bg: "bg-amber-100",   text: "text-amber-700",   icon: Clock },
  approved: { label: "Approved", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", bg: "bg-rose-100",    text: "text-rose-700",    icon: XCircle },
  revoked:  { label: "Revoked",  bg: "bg-slate-200",   text: "text-slate-700",   icon: Shield },
};

type TabKey = "pending" | "approved" | "rejected" | "revoked";

// ── Component ─────────────────────────────────────────────────────────────────
const AccessRequests = () => {
  const { userData } = useAuth();

  const [requests, setRequests]         = useState<any[]>([]);
  const [deoDocs, setDeoDocs]           = useState<any[]>([]);   // live data_entry_staff docs
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState<TabKey>("pending");

  // Approve / Edit modal state — same modal, different "mode"
  const [modalMode, setModalMode]       = useState<"approve" | "edit">("approve");
  const [approvingReq, setApprovingReq] = useState<any | null>(null);
  const [editingDeoDoc, setEditingDeoDoc] = useState<any | null>(null);
  const [allowedPages, setAllowedPages] = useState<string[]>(DEFAULT_ALLOWED);
  const [approving, setApproving]       = useState(false);

  // Reject modal state
  const [rejectingReq, setRejectingReq] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting]       = useState(false);

  // Revoke modal state
  const [revokingReq, setRevokingReq]   = useState<any | null>(null);
  const [revoking, setRevoking]         = useState(false);

  // ── Realtime listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userData?.schoolId) return;
    const unsubReq = onSnapshot(
      query(collection(db, "access_requests"), where("schoolId", "==", userData.schoolId)),
      snap => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    const unsubDeo = onSnapshot(
      query(collection(db, "data_entry_staff"), where("schoolId", "==", userData.schoolId)),
      snap => setDeoDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => {
        console.warn("[AccessRequests] DEO snapshot error:", err.code, err.message);
        if (err.code === "permission-denied") {
          toast.error("Missing permission to read staff list.");
        }
      }
    );
    return () => { unsubReq(); unsubDeo(); };
  }, [userData?.schoolId]);

  // Quick lookup: requestId → data_entry_staff doc
  const deoByRequestId = useMemo(() => {
    const m = new Map<string, any>();
    deoDocs.forEach(d => { if (d.requestId) m.set(d.requestId, d); });
    return m;
  }, [deoDocs]);

  // ── Copy access link ─────────────────────────────────────────────────────
  const copyLink = () => {
    const base = window.location.origin;
    const link = `${base}/request-access?schoolId=${userData?.schoolId}&branchId=${userData?.branchId || ""}`;
    navigator.clipboard.writeText(link);
    toast.success("Access request link copied!");
  };

  // ── Open "Edit" — reuse approve modal in edit mode ──────────────────────
  const openEdit = (req: any) => {
    const deo = deoByRequestId.get(req.id);
    if (!deo) {
      toast.error("No active DEO record found for this user.");
      return;
    }
    setModalMode("edit");
    setApprovingReq(req);
    setEditingDeoDoc(deo);
    setAllowedPages(Array.isArray(deo.allowedPages) ? deo.allowedPages : DEFAULT_ALLOWED);
  };

  // ── Save edited allowedPages ────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!approvingReq || !editingDeoDoc) return;
    if (allowedPages.length === 0) {
      toast.error("Select at least one page.");
      return;
    }
    setApproving(true);
    try {
      await updateDoc(doc(db, "data_entry_staff", editingDeoDoc.id), {
        allowedPages,
        updatedBy: userData?.email || "",
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "access_requests", approvingReq.id), {
        allowedPages,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Access updated for ${approvingReq.name}`);
      setApprovingReq(null);
      setEditingDeoDoc(null);
      setModalMode("approve");
    } catch (e: any) {
      toast.error("Update failed: " + e.message);
    }
    setApproving(false);
  };

  // ── Revoke — removes access but preserves all records created by this DEO
  const handleRevoke = async () => {
    if (!revokingReq) return;
    const deo = deoByRequestId.get(revokingReq.id);
    setRevoking(true);
    try {
      if (deo) {
        await deleteDoc(doc(db, "data_entry_staff", deo.id));
      }
      await updateDoc(doc(db, "access_requests", revokingReq.id), {
        status:     "revoked",
        revokedBy:  userData?.email || "",
        revokedAt:  serverTimestamp(),
      });
      toast.success(`${revokingReq.name}'s access revoked. Historical records kept intact.`);
      setRevokingReq(null);
    } catch (e: any) {
      toast.error("Revoke failed: " + e.message);
    }
    setRevoking(false);
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

      // 3. Email DEO via server-side template (best-effort — fire and forget).
      //    Sending structured fields — server escapes + renders the HTML.
      sendDeoApprovedEmail({
        to: approvingReq.email,
        name: approvingReq.name,
        schoolName: userData?.schoolName || "School Dashboard",
        subject: `Your access has been approved — ${userData?.schoolName || "School Dashboard"}`,
        allowedPages: allowedPages.map(p => {
          const pg = ALL_PAGES.find(x => x.path === p);
          return { label: pg?.label || p, path: p };
        }),
        loginUrl: window.location.origin,
      }).catch(err => console.warn("[approve email] failed:", err?.message));

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

      // Email DEO via server-side template (best-effort).
      sendDeoRejectedEmail({
        to: rejectingReq.email,
        name: rejectingReq.name,
        schoolName: userData?.schoolName || "School Dashboard",
        subject: `Access Request Update — ${userData?.schoolName || "School Dashboard"}`,
        rejectReason: rejectReason.trim(),
      }).catch(err => console.warn("[reject email] failed:", err?.message));

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
    revoked:  requests.filter(r => r.status === "revoked").length,
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
          <p className="text-[11px] text-blue-700 mt-2 leading-relaxed flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
            <span><strong>Data is safe:</strong> editing pages or revoking access <em>never deletes</em> records the DEO created. Old attendance, marks &amp; notes stay visible even after the staff member changes.</span>
          </p>
        </div>
      </div>

      {/* Stat cards — 4 tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["pending", "approved", "rejected", "revoked"] as const).map(s => {
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
                          onClick={() => { setModalMode("approve"); setEditingDeoDoc(null); setApprovingReq(req); setAllowedPages(DEFAULT_ALLOWED); }}
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
                      <>
                        <span className="hidden md:flex items-center gap-1.5 text-[10px] text-emerald-600 font-black uppercase tracking-widest">
                          <CheckCircle2 className="w-4 h-4" /> Active
                        </span>
                        <button
                          onClick={() => openEdit(req)}
                          title="Edit allowed pages"
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => setRevokingReq(req)}
                          title="Revoke access (data stays safe)"
                          className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Revoke
                        </button>
                      </>
                    )}
                    {req.status === "revoked" && (
                      <button
                        onClick={() => handleReset(req)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Re-approve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Approve / Edit Access Modal (shared) ───────────────────────────── */}
      {approvingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
               onClick={() => { setApprovingReq(null); setEditingDeoDoc(null); setModalMode("approve"); }} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

            <div className={`${modalMode === "edit" ? "bg-[#1e3a8a]" : "bg-emerald-700"} px-6 py-5 flex items-center gap-3 shrink-0`}>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                {modalMode === "edit" ? <Pencil className="w-4 h-4 text-white" /> : <UserCheck className="w-4 h-4 text-white" />}
              </div>
              <div>
                <h2 className="text-sm font-black text-white">
                  {modalMode === "edit" ? "Edit Access" : "Approve Access"}
                </h2>
                <p className={`text-xs ${modalMode === "edit" ? "text-blue-200" : "text-emerald-200"}`}>
                  {approvingReq.name} · {approvingReq.email}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Pages they can access
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAllowedPages(ALL_PAGES.map(p => p.path))}
                      className="text-[9px] font-black text-blue-600 hover:underline uppercase tracking-wider"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setAllowedPages([])}
                      className="text-[9px] font-black text-slate-400 hover:underline uppercase tracking-wider"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {ALL_PAGES.map(pg => (
                    <label key={pg.path} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      allowedPages.includes(pg.path)
                        ? (modalMode === "edit" ? "border-blue-200 bg-blue-50" : "border-emerald-200 bg-emerald-50")
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
                        className={`w-4 h-4 ${modalMode === "edit" ? "accent-blue-600" : "accent-emerald-600"}`}
                      />
                      <div className="flex-1">
                        <p className="text-xs font-black text-slate-700">{pg.label}</p>
                        <p className="text-[10px] text-slate-400">{pg.description}</p>
                      </div>
                      {allowedPages.includes(pg.path) && (
                        <CheckCircle2 className={`w-4 h-4 shrink-0 ${modalMode === "edit" ? "text-blue-500" : "text-emerald-500"}`} />
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">{allowedPages.length} of {ALL_PAGES.length} page{allowedPages.length !== 1 ? "s" : ""} selected</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setApprovingReq(null); setEditingDeoDoc(null); setModalMode("approve"); }}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={modalMode === "edit" ? handleSaveEdit : handleApprove}
                  disabled={approving || allowedPages.length === 0}
                  className={`flex-1 h-11 rounded-xl text-white text-xs font-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                    modalMode === "edit" ? "bg-[#1e3a8a] hover:bg-[#1e294b]" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}>
                  {approving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : (modalMode === "edit" ? <Pencil className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />)}
                  {approving
                    ? (modalMode === "edit" ? "Saving..." : "Approving...")
                    : (modalMode === "edit" ? "Save Changes" : "Grant Access")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Revoke Confirm Modal ───────────────────────────────────────────── */}
      {revokingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRevokingReq(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-rose-600 px-6 py-5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Revoke Access?</h2>
                <p className="text-xs text-rose-200">{revokingReq.name}</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                This will remove <strong>{revokingReq.name}</strong>'s login access immediately.
              </p>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-800 font-semibold leading-relaxed">
                  All records created by this DEO — attendance, marks, assignments, notes — <strong>will stay intact</strong>.
                  You can re-approve or invite a new DEO later.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setRevokingReq(null)}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="flex-1 h-11 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {revoking ? "Revoking..." : "Revoke Access"}
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
