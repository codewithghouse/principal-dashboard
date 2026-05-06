import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Clock, CheckCircle2, XCircle,
  Mail, Phone, FileText, Loader2, Link2,
  UserCheck, UserX, RefreshCw, Pencil, Trash2, AlertTriangle, Shield,
  Sparkles,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, deleteDoc, runTransaction,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { sendDeoApprovedEmail, sendDeoRejectedEmail } from "@/lib/resend";
import { toast } from "sonner";

// ── Allowed pages config — keep in sync with principal-dashboard sidebar ─────
// MUST mirror App.tsx routes — when a new page is added there, add it here
// too OR principals will never be able to grant DEOs access to it.
const ALL_PAGES = [
  { path: "/",                     label: "Dashboard",              description: "Home & overview" },
  { path: "/students",             label: "Students",               description: "View & add students" },
  { path: "/student-intelligence", label: "Student Intelligence",   description: "AI insights on students" },
  { path: "/risk-students",        label: "Risk Students",          description: "At-risk student list" },
  { path: "/classes",              label: "Classes & Sections",     description: "Class & section setup" },
  { path: "/teachers",             label: "Teachers",               description: "Teachers directory" },
  { path: "/academics",            label: "Academics",              description: "Academic overview" },
  { path: "/syllabus",             label: "Syllabus",               description: "Manage syllabus uploads" },
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
  { path: "/alumni",               label: "Alumni",                 description: "Alumni newsletters & PDFs" },
  { path: "/reports",              label: "Reports",                description: "Reports & exports" },
];

// DEFAULT pre-selection in the approve-modal — covers common data-entry duties:
// dashboard, students, classes, attendance, assignments, exams, teacher notes,
// fees. Principal can deselect or extend before approving. Was 4 pages; user
// research showed approvals were under-granting access.
const DEFAULT_ALLOWED = [
  "/",
  "/students",
  "/classes",
  "/attendance",
  "/assignments",
  "/exams",
  "/teacher-notes",
  "/fee-structure",
];

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
  const isMobile = useIsMobile();

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
  // Atomic update of BOTH the staff doc (source of truth for runtime guard)
  // AND the request audit trail. Two-write race previously could leave the
  // staff record on new pages but the audit row on stale pages.
  const handleSaveEdit = async () => {
    if (!approvingReq || !editingDeoDoc) return;
    if (allowedPages.length === 0) {
      toast.error("Select at least one page.");
      return;
    }
    setApproving(true);
    try {
      const staffRef   = doc(db, "data_entry_staff", editingDeoDoc.id);
      const requestRef = doc(db, "access_requests", approvingReq.id);
      await runTransaction(db, async (tx) => {
        const staffSnap = await tx.get(staffRef);
        if (!staffSnap.exists()) {
          throw new Error("Staff record no longer exists — refresh and try again.");
        }
        tx.update(staffRef, {
          allowedPages,
          updatedBy: userData?.email || "",
          updatedAt: serverTimestamp(),
        });
        tx.update(requestRef, {
          allowedPages,
          updatedAt: serverTimestamp(),
        });
      });
      toast.success(`Access updated for ${approvingReq.name}`);
      setApprovingReq(null);
      setEditingDeoDoc(null);
      setModalMode("approve");
    } catch (e: any) {
      toast.error("Update failed: " + (e?.message || "unknown"));
    }
    setApproving(false);
  };

  // ── Revoke — removes access but preserves all records created by this DEO.
  // Atomic: staff-doc delete + request status flip happen together. Without
  // the transaction, a partial failure could leave the DEO logged out
  // (staff doc gone) while the request still showed "approved" — confusing
  // audit trail and re-approval risk.
  const handleRevoke = async () => {
    if (!revokingReq) return;
    const deo = deoByRequestId.get(revokingReq.id);
    setRevoking(true);
    try {
      const requestRef = doc(db, "access_requests", revokingReq.id);
      const staffRef = deo ? doc(db, "data_entry_staff", deo.id) : null;
      await runTransaction(db, async (tx) => {
        // Always update the audit row; delete staff doc only if present.
        if (staffRef) tx.delete(staffRef);
        tx.update(requestRef, {
          status:     "revoked",
          revokedBy:  userData?.email || "",
          revokedAt:  serverTimestamp(),
        });
      });
      toast.success(`${revokingReq.name}'s access revoked. Historical records kept intact.`);
      setRevokingReq(null);
    } catch (e: any) {
      toast.error("Revoke failed: " + (e?.message || "unknown"));
    }
    setRevoking(false);
  };

  // ── Approve ──────────────────────────────────────────────────────────────
  // Atomic transaction: data_entry_staff create + access_requests status
  // update happen together. If either fails, both roll back — no orphan
  // staff doc with the request still showing "pending", and no flipped
  // request status without the staff record (which would let the DEO log
  // in but fail every read).
  const handleApprove = async () => {
    if (!approvingReq) return;
    if (allowedPages.length === 0) {
      toast.error("Select at least one page to grant access.");
      return;
    }
    setApproving(true);
    try {
      // Pre-generate the new staff doc ref so the transaction can `set` it.
      const newStaffRef = doc(collection(db, "data_entry_staff"));
      const requestRef  = doc(db, "access_requests", approvingReq.id);

      await runTransaction(db, async (tx) => {
        // Re-read the request inside the transaction to defend against a
        // concurrent revoke/reject (Firestore retries the txn if either
        // doc was changed between our reads and writes).
        const reqSnap = await tx.get(requestRef);
        if (!reqSnap.exists()) throw new Error("Request no longer exists.");
        const cur = reqSnap.data() as any;
        if (cur.status === "approved") {
          throw new Error("Already approved by another admin.");
        }
        tx.set(newStaffRef, {
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
        tx.update(requestRef, {
          status:     "approved",
          reviewedBy: userData!.email,
          reviewedAt: serverTimestamp(),
          allowedPages,
        });
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
  // Case-insensitive status compare — defends against legacy docs with
  // capitalized/mixed-case status values that would otherwise be invisible
  // in every tab.
  const statusOf = (r: any) => String(r?.status || "").toLowerCase();
  const filtered = requests.filter(r => statusOf(r) === tab);
  const counts   = {
    pending:  requests.filter(r => statusOf(r) === "pending").length,
    approved: requests.filter(r => statusOf(r) === "approved").length,
    rejected: requests.filter(r => statusOf(r) === "rejected").length,
    revoked:  requests.filter(r => statusOf(r) === "revoked").length,
  };

  const formatDate = (ts: any) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const B1 = "#0055FF";
  const B2 = "#1166FF";
  const B3 = "#2277FF";
  const BG = "#EEF4FF";
  const T1 = "#001040";
  const T2 = "#002080";
  const T3 = "#5070B0";
  const T4 = "#99AACC";
  const SEP = "rgba(0,85,255,0.07)";
  const GREEN = "#00C853";
  const GREEN_D = "#007830";
  const RED = "#FF3355";
  const RED_D = "#B01030";
  const ORANGE_D = "#884400";
  const VIOLET = "#7B3FF4";

  const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
  const SHADOW_SM = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08), 0 10px 26px rgba(0,85,255,.10)";
  const SHADOW_LG = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)";
  const SHADOW_BTN = "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)";

  const AV_PALETTE = [
    `linear-gradient(135deg, ${B1}, ${B3})`,
    `linear-gradient(135deg, ${VIOLET}, #A075FF)`,
    `linear-gradient(135deg, ${GREEN}, #22DD77)`,
    `linear-gradient(135deg, #FF8800, #FFCC44)`,
  ];
  const avGrad = (seed: string) => {
    let h = 0;
    for (const ch of seed || "") h = (h * 31 + ch.charCodeAt(0)) & 0xff;
    return AV_PALETTE[h % AV_PALETTE.length];
  };

  const statTabs: Array<{ k: TabKey; label: string; color: "yellow" | "green" | "red" | "grey"; icon: any; iconColor: string; numColor: string; lblColor: string }> = [
    { k: "pending",  label: "Pending",  color: "yellow", icon: Clock,        iconColor: "#FF8800", numColor: "#664400", lblColor: "#664400" },
    { k: "approved", label: "Approved", color: "green",  icon: CheckCircle2, iconColor: GREEN,     numColor: "#004018", lblColor: "#005A20" },
    { k: "rejected", label: "Rejected", color: "red",    icon: XCircle,      iconColor: RED,       numColor: "#60081A", lblColor: "#8A0A22" },
    { k: "revoked",  label: "Revoked",  color: "grey",   icon: Shield,       iconColor: "#3A4358", numColor: "#3A4358", lblColor: "#3A4358" },
  ];
  const tabBgMap: Record<"yellow" | "green" | "red" | "grey", string> = {
    yellow: "linear-gradient(135deg,#FFF4D1 0%,#FFE58A 55%,#FFD55C 100%)",
    green:  "linear-gradient(135deg,#DEFCE8 0%,#8CF0B0 55%,#50E088 100%)",
    red:    "linear-gradient(135deg,#FFE3E8 0%,#FFA8B8 55%,#FF7085 100%)",
    grey:   "linear-gradient(135deg,#E8ECF5 0%,#C8D0E0 55%,#AEB8CC 100%)",
  };
  const tabBorderMap: Record<"yellow" | "green" | "red" | "grey", string> = {
    yellow: "rgba(255,170,0,0.4)",
    green:  "rgba(0,200,83,0.4)",
    red:    "rgba(255,51,85,0.4)",
    grey:   "rgba(120,130,155,0.4)",
  };
  const slblBadgeStyle: Record<TabKey, React.CSSProperties> = {
    pending:  { background: "rgba(255,170,0,0.14)", color: "#885500", border: "0.5px solid rgba(255,170,0,0.32)" },
    approved: { background: "rgba(0,200,83,0.10)", color: GREEN_D, border: "0.5px solid rgba(0,200,83,0.22)" },
    rejected: { background: "rgba(255,51,85,0.10)", color: RED_D, border: "0.5px solid rgba(255,51,85,0.22)" },
    revoked:  { background: "rgba(120,130,155,0.10)", color: "#3A4358", border: "0.5px solid rgba(120,130,155,0.22)" },
  };

  const renderStaffCard = (req: any, compact: boolean = false) => {
    const deo = deoByRequestId.get(req.id);
    const allowedPages = (req.allowedPages as string[]) || deo?.allowedPages || [];
    const initials = (req.name || "?")
      .split(" ")
      .map((n: string) => n[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2);
    const statusTag = req.status === "approved"
      ? { label: "✓ Approved", bg: "rgba(0,200,83,0.10)", color: GREEN_D, border: "0.5px solid rgba(0,200,83,0.22)" }
      : req.status === "rejected"
      ? { label: "Rejected", bg: "rgba(255,51,85,0.10)", color: RED_D, border: "0.5px solid rgba(255,51,85,0.22)" }
      : req.status === "revoked"
      ? { label: "Revoked", bg: "rgba(120,130,155,0.10)", color: "#3A4358", border: "0.5px solid rgba(120,130,155,0.22)" }
      : { label: "Pending", bg: "rgba(255,170,0,0.14)", color: "#885500", border: "0.5px solid rgba(255,170,0,0.32)" };

    const stripeGradient = req.status === "approved"
      ? `linear-gradient(180deg, ${GREEN}, #66EE88)`
      : req.status === "rejected"
      ? `linear-gradient(180deg, ${RED}, #FF7788)`
      : req.status === "revoked"
      ? "linear-gradient(180deg, #AEB8CC, #C8D0E0)"
      : "linear-gradient(180deg, #FF8800, #FFCC44)";

    return (
      <div
        key={req.id}
        style={{
          margin: compact ? "10px 0 0" : "0 0 14px",
          background: "#fff",
          borderRadius: 20,
          boxShadow: SHADOW_LG,
          border: "0.5px solid rgba(0,85,255,0.10)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: stripeGradient }} />

        <div style={{ padding: compact ? "14px 16px" : "18px 22px", display: "flex", alignItems: "center", gap: compact ? 11 : 16 }}>
          <div
            style={{
              width: compact ? 42 : 56,
              height: compact ? 42 : 56,
              borderRadius: compact ? 13 : 16,
              background: avGrad(req.name || req.email || ""),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: compact ? 15 : 19,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(0,85,255,0.24)",
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10, marginBottom: compact ? 3 : 7, flexWrap: "wrap" }}>
              <div style={{ fontSize: compact ? 15 : 18, fontWeight: 700, color: T1, letterSpacing: "-0.25px" }}>
                {req.name || "—"}
              </div>
              <div
                style={{
                  padding: compact ? "2px 8px" : "4px 11px",
                  borderRadius: 100,
                  fontSize: compact ? 8 : 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: statusTag.bg,
                  color: statusTag.color,
                  border: statusTag.border,
                }}
              >
                {statusTag.label}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 8 : 14, marginBottom: compact ? 0 : 9 }}>
              <span style={{ fontSize: compact ? 10 : 12, color: T3, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Mail size={compact ? 11 : 13} strokeWidth={2.2} />
                {req.email || "—"}
              </span>
              {req.phone && (
                <span style={{ fontSize: compact ? 10 : 12, color: T3, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Phone size={compact ? 11 : 13} strokeWidth={2.2} />
                  {req.phone}
                </span>
              )}
              <span style={{ fontSize: compact ? 10 : 12, color: T3, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Clock size={compact ? 11 : 13} strokeWidth={2.2} />
                {formatDate(req.createdAt)}
              </span>
            </div>
            {!compact && allowedPages.length > 0 && req.status === "approved" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allowedPages.map((p) => {
                  const pg = ALL_PAGES.find((x) => x.path === p);
                  return (
                    <span
                      key={p}
                      style={{
                        padding: "4px 11px",
                        borderRadius: 100,
                        background: "rgba(0,200,83,0.10)",
                        color: GREEN_D,
                        border: "0.5px solid rgba(0,200,83,0.22)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {pg?.label || p}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {compact && allowedPages.length > 0 && req.status === "approved" && (
          <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: 5 }}>
            {allowedPages.map((p) => {
              const pg = ALL_PAGES.find((x) => x.path === p);
              return (
                <span
                  key={p}
                  style={{
                    padding: "3px 9px",
                    borderRadius: 100,
                    background: "rgba(0,200,83,0.10)",
                    color: GREEN_D,
                    border: "0.5px solid rgba(0,200,83,0.22)",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {pg?.label || p}
                </span>
              );
            })}
          </div>
        )}

        {req.reason && (
          <div style={{ padding: compact ? "8px 16px" : "10px 22px", background: "rgba(0,85,255,0.03)", borderTop: `0.5px solid ${SEP}`, fontSize: compact ? 10 : 12, color: T3, fontWeight: 500, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <FileText size={compact ? 11 : 13} strokeWidth={2.2} color={T3} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong style={{ color: T1, fontWeight: 700 }}>Reason:</strong> {req.reason}</span>
          </div>
        )}
        {req.status === "rejected" && req.rejectionReason && (
          <div style={{ padding: compact ? "8px 16px" : "10px 22px", background: "rgba(255,51,85,0.04)", borderTop: `0.5px solid ${SEP}`, fontSize: compact ? 10 : 12, color: RED_D, fontWeight: 500 }}>
            <strong style={{ fontWeight: 700 }}>Rejection:</strong> {req.rejectionReason}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: compact ? "10px 12px" : "12px 18px", display: "flex", gap: compact ? 6 : 10, background: "rgba(0,85,255,0.03)", borderTop: `0.5px solid ${SEP}` }}>
          {req.status === "pending" && (
            <>
              <button
                onClick={() => { setModalMode("approve"); setEditingDeoDoc(null); setApprovingReq(req); setAllowedPages(DEFAULT_ALLOWED); }}
                style={{
                  flex: 1,
                  height: compact ? 34 : 40,
                  borderRadius: compact ? 10 : 12,
                  background: `linear-gradient(135deg, ${GREEN}, #22DD77)`,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  fontSize: compact ? 10 : 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,200,83,0.32)",
                  fontFamily: "inherit",
                }}
              >
                <UserCheck size={compact ? 11 : 13} strokeWidth={2.5} />
                Approve
              </button>
              <button
                onClick={() => { setRejectingReq(req); setRejectReason(""); }}
                style={{
                  flex: 1,
                  height: compact ? 34 : 40,
                  borderRadius: compact ? 10 : 12,
                  background: "rgba(255,51,85,0.10)",
                  color: RED_D,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  fontSize: compact ? 10 : 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "0.5px solid rgba(255,51,85,0.22)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <UserX size={compact ? 11 : 13} strokeWidth={2.5} />
                Reject
              </button>
            </>
          )}
          {req.status === "approved" && (
            <>
              <div
                style={{
                  flex: 1,
                  height: compact ? 34 : 40,
                  borderRadius: compact ? 10 : 12,
                  background: "rgba(0,200,83,0.10)",
                  color: GREEN_D,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  fontSize: compact ? 10 : 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "0.5px solid rgba(0,200,83,0.22)",
                }}
              >
                <CheckCircle2 size={compact ? 11 : 13} strokeWidth={2.5} />
                Active
              </div>
              <button
                onClick={() => openEdit(req)}
                style={{
                  flex: 1,
                  height: compact ? 34 : 40,
                  borderRadius: compact ? 10 : 12,
                  background: "#fff",
                  color: B1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  fontSize: compact ? 10 : 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "0.5px solid rgba(0,85,255,0.22)",
                  boxShadow: "0 2px 6px rgba(0,85,255,0.10)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Pencil size={compact ? 11 : 13} strokeWidth={2.5} />
                Edit
              </button>
              <button
                onClick={() => setRevokingReq(req)}
                style={{
                  flex: 1,
                  height: compact ? 34 : 40,
                  borderRadius: compact ? 10 : 12,
                  background: "rgba(255,51,85,0.10)",
                  color: RED_D,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  fontSize: compact ? 10 : 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "0.5px solid rgba(255,51,85,0.22)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Trash2 size={compact ? 11 : 13} strokeWidth={2.5} />
                Revoke
              </button>
            </>
          )}
          {(req.status === "rejected" || req.status === "revoked") && (
            <button
              onClick={() => handleReset(req)}
              style={{
                flex: 1,
                height: compact ? 34 : 40,
                borderRadius: compact ? 10 : 12,
                background: GRAD_PRIMARY,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                fontSize: compact ? 10 : 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                border: "none",
                cursor: "pointer",
                boxShadow: SHADOW_BTN,
                position: "relative",
                overflow: "hidden",
                fontFamily: "inherit",
              }}
            >
              <RefreshCw size={compact ? 11 : 13} strokeWidth={2.5} />
              {req.status === "rejected" ? "Re-open" : "Re-approve"}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ─── MOBILE RETURN ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0", paddingBottom: 24 }}>
        {/* Page head */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: GRAD_PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,85,255,.32)" }}>
                <Shield size={16} color="#fff" strokeWidth={2.4} />
              </div>
              Staff Access
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 5 }}>
              <span>DEO Requests</span>
              <span style={{ color: T4, fontWeight: 700 }}>·</span>
              <span>Approval Flow</span>
            </div>
          </div>
        </div>

        {/* Copy link button */}
        <button
          onClick={copyLink}
          style={{
            margin: "12px 20px 0",
            width: "calc(100% - 40px)",
            height: 44,
            borderRadius: 14,
            background: GRAD_PRIMARY,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            border: "none",
            boxShadow: SHADOW_BTN,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          <Link2 size={15} strokeWidth={2.4} />
          Copy Request Link
        </button>

        {/* Info card */}
        <div style={{ margin: "14px 20px 0", background: "#fff", borderRadius: 18, padding: "14px 16px", boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(0,85,255,.10)", border: "0.5px solid rgba(0,85,255,.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Link2 size={14} color={B1} strokeWidth={2.3} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: B1 }}>How to invite a DEO</div>
          </div>
          <div style={{ fontSize: 10, color: T3, fontWeight: 500, lineHeight: 1.6, marginBottom: 8 }}>
            Click <strong style={{ color: T1, fontWeight: 700 }}>"Copy Request Link"</strong> and share it. They fill the form — request appears here as <em style={{ color: ORANGE_D, fontStyle: "italic", fontWeight: 600 }}>Pending</em>. You approve and choose which pages they can access.
          </div>
          <div style={{ padding: "8px 11px", background: "rgba(0,200,83,0.08)", borderRadius: 10, border: "0.5px solid rgba(0,200,83,0.2)", display: "flex", alignItems: "flex-start", gap: 7 }}>
            <ShieldCheck size={13} color={GREEN_D} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 10, color: GREEN_D, fontWeight: 500, lineHeight: 1.55 }}>
              <strong style={{ color: "#004018", fontWeight: 700 }}>Data is safe:</strong> editing pages or revoking access <em style={{ fontStyle: "italic", fontWeight: 600 }}>never deletes</em> records the DEO created.
            </div>
          </div>
        </div>

        {/* Hero */}
        <div style={{ margin: "14px 20px 0", background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)", borderRadius: 22, padding: "16px 18px", position: "relative", overflow: "hidden", boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)" }}>
          <div style={{ position: "absolute", top: -36, right: -24, width: 150, height: 150, background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)", borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,.16)", border: "0.5px solid rgba(255,255,255,.24)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>Access Workflow</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1 }}>{counts.approved + counts.pending} Active</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 100, background: "rgba(0,200,83,.22)", border: "0.5px solid rgba(0,200,83,.4)", fontSize: 11, fontWeight: 700, color: "#66FFAA" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#66FFAA", boxShadow: "0 0 8px rgba(102,255,170,.8)" }} />
              Secure
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, background: "rgba(255,255,255,.12)", borderRadius: 14, overflow: "hidden", position: "relative", zIndex: 1 }}>
            {[
              { v: counts.pending, l: "Pending", c: "#FFDD88" },
              { v: counts.approved, l: "Approved", c: "#66EE88" },
              { v: counts.rejected, l: "Rejected", c: "#FF99AA" },
              { v: counts.revoked, l: "Revoked", c: "#fff" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "10px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.c, letterSpacing: "-0.2px", lineHeight: 1, marginBottom: 3 }}>{s.v}</div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Tab Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
          {statTabs.map((t) => {
            const active = tab === t.k;
            const Ico = t.icon;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                style={{
                  borderRadius: 18,
                  padding: 14,
                  position: "relative",
                  overflow: "hidden",
                  cursor: "pointer",
                  background: tabBgMap[t.color],
                  border: active ? "2px solid #000820" : `0.5px solid ${tabBorderMap[t.color]}`,
                  boxShadow: active ? "0 0 0 3px rgba(0,0,0,.08), 0 10px 28px rgba(0,0,0,.1)" : "0 8px 22px rgba(0,0,0,.06)",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div style={{ position: "absolute", top: -18, right: -18, width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.65) 0%,transparent 70%)", pointerEvents: "none" }} />
                <div style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(255,255,255,.75)", border: "0.5px solid rgba(255,255,255,.95)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, position: "relative", zIndex: 1, boxShadow: "0 2px 6px rgba(0,0,0,.05)" }}>
                  <Ico size={15} color={t.iconColor} strokeWidth={2.5} />
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.9px", lineHeight: 1, marginBottom: 4, color: t.numColor, position: "relative", zIndex: 1 }}>{counts[t.k]}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lblColor, position: "relative", zIndex: 1 }}>{t.label}</div>
              </button>
            );
          })}
        </div>

        {/* Section label */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, padding: "16px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <span>{statTabs.find((s) => s.k === tab)?.label} {tab === "pending" ? "Requests" : tab === "approved" ? "Staff" : "List"}</span>
          <span style={{ padding: "3px 9px", borderRadius: 100, fontSize: 9, fontWeight: 700, ...slblBadgeStyle[tab] }}>
            {counts[tab]} {tab === "pending" ? "awaiting" : tab === "approved" ? "active" : "total"}
          </span>
          <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,0.12)" }} />
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ padding: "50px 0", textAlign: "center" }}>
            <Loader2 size={28} color={B1} style={{ animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ margin: "14px 20px 0", background: "#fff", borderRadius: 20, padding: "40px 20px", boxShadow: SHADOW_SM, border: "0.5px dashed rgba(0,85,255,0.22)", textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: "linear-gradient(135deg,#E5EEFF,#D4E4FF)", border: "0.5px solid rgba(0,85,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <ShieldCheck size={26} color={B1} strokeWidth={2.2} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T3, marginBottom: 6 }}>No {tab} Requests</div>
            {tab === "pending" && (
              <div style={{ fontSize: 11, color: T4, fontWeight: 500, lineHeight: 1.5 }}>
                Share the request link with<br />your data entry team
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "10px 20px 0" }}>
            {filtered.map((req) => renderStaffCard(req, true))}
          </div>
        )}

        {/* AI Card */}
        <div style={{ margin: "12px 20px 0", background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)", borderRadius: 22, padding: "18px 20px", boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -34, right: -22, width: 140, height: 140, background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)", borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,.18)", border: "0.5px solid rgba(255,255,255,.26)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>AI Access Intelligence</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
            Inbox has <strong style={{ color: "#fff", fontWeight: 700 }}>{counts.pending} pending</strong>. <strong style={{ color: "#fff", fontWeight: 700 }}>{counts.approved} approved DEOs</strong> actively handling data entry. {counts.pending > 0 ? "Review pending requests within 24h to keep ops moving." : "Inbox is clear — share your link with trusted team members only."}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "rgba(255,255,255,.12)", borderRadius: 14, overflow: "hidden", position: "relative", zIndex: 1, marginTop: 12 }}>
            {[
              { v: counts.pending, l: "Pending", c: "#FFDD88" },
              { v: counts.approved, l: "Active", c: "#66EE88" },
              { v: counts.rejected, l: "Rejected", c: "#FF99AA" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: s.c, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>{s.v}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── DESKTOP RETURN ──────────────────────────────────────────────────────
  return (
    <div
      style={{
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        background: BG,
        minHeight: "100vh",
        margin: "-16px -24px 0",
        padding: "24px 32px 40px",
      }}
    >
      {/* Page head */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: T1, letterSpacing: "-1px", margin: 0, lineHeight: 1.1, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: GRAD_PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(0,85,255,.32)" }}>
              <Shield size={22} color="#fff" strokeWidth={2.3} />
            </div>
            Staff Access Control
          </h1>
          <div style={{ fontSize: 12, color: T3, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8, paddingLeft: 58, marginTop: 8 }}>
            <span>Data Entry Operator Requests</span>
            <span style={{ color: T4 }}>·</span>
            <span>Approval Workflow</span>
          </div>
        </div>
        <button
          onClick={copyLink}
          style={{
            padding: "13px 22px",
            borderRadius: 14,
            background: GRAD_PRIMARY,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: SHADOW_BTN,
            border: "none",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: "inherit",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <Link2 size={15} strokeWidth={2.4} />
          Copy Request Link
        </button>
      </div>

      {/* Info card */}
      <div style={{ background: "#fff", borderRadius: 18, padding: "18px 22px", boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,.12)", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,85,255,.04) 0%,transparent 70%)", pointerEvents: "none" }} />
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(0,85,255,.10)", border: "0.5px solid rgba(0,85,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Link2 size={18} color={B1} strokeWidth={2.3} />
        </div>
        <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: B1, marginBottom: 4 }}>How to invite a Data Entry Operator</div>
          <div style={{ fontSize: 12, color: T3, fontWeight: 500, lineHeight: 1.65, marginBottom: 10 }}>
            Click <strong style={{ color: T1, fontWeight: 700 }}>"Copy Request Link"</strong> and share it with the person. They fill the form — the request appears here as <em style={{ color: ORANGE_D, fontStyle: "italic", fontWeight: 600 }}>Pending</em>. You approve and choose which pages they can access. They then log in with their Google account.
          </div>
          <div style={{ fontSize: 12, color: GREEN_D, fontWeight: 500, lineHeight: 1.55, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <ShieldCheck size={14} color={GREEN_D} strokeWidth={2.5} />
            <span><strong style={{ color: "#004018", fontWeight: 700 }}>Data is safe:</strong> editing pages or revoking access <em style={{ color: T2, fontStyle: "italic", fontWeight: 600 }}>never deletes</em> records the DEO created. Old attendance, marks &amp; notes stay visible.</span>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards — dashboard-style */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 26 }}>
        {statTabs.map((t) => {
          const active = tab === t.k;
          const Ico = t.icon;
          // Map status → dashboard palette
          const palette: Record<typeof t.color, { cardGrad: string; tileGrad: string; tileShadow: string; valColor: string; decorColor: string; ringColor: string }> = {
            yellow: {
              cardGrad: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
              tileGrad: "linear-gradient(135deg, #FFAA00, #FFDD44)",
              tileShadow: "0 4px 14px rgba(255,170,0,0.28)",
              valColor: "#FFAA00",
              decorColor: "#FFAA00",
              ringColor: "rgba(255,170,0,0.42)",
            },
            green: {
              cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
              tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
              tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
              valColor: "#007830",
              decorColor: "#00C853",
              ringColor: "rgba(0,200,83,0.42)",
            },
            red: {
              cardGrad: "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)",
              tileGrad: "linear-gradient(135deg, #FF3355, #FF6688)",
              tileShadow: "0 4px 14px rgba(255,51,85,0.28)",
              valColor: "#FF3355",
              decorColor: "#FF3355",
              ringColor: "rgba(255,51,85,0.42)",
            },
            grey: {
              cardGrad: "linear-gradient(135deg, #E2E5EC 0%, #F7F9FC 100%)",
              tileGrad: "linear-gradient(135deg, #475569, #64748B)",
              tileShadow: "0 4px 14px rgba(71,85,105,0.26)",
              valColor: "#475569",
              decorColor: "#475569",
              ringColor: "rgba(71,85,105,0.36)",
            },
          };
          const p = palette[t.color];
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                borderRadius: 20,
                padding: 20,
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
                background: p.cardGrad,
                border: `0.5px solid ${active ? p.ringColor : "rgba(0,85,255,0.08)"}`,
                boxShadow: active
                  ? `0 0 0 2px ${p.ringColor}, 0 6px 20px rgba(0,85,255,0.10), 0 22px 56px rgba(0,85,255,0.10)`
                  : "0 0 0 0.5px rgba(0,85,255,0.14), 0 6px 20px rgba(0,85,255,0.10), 0 22px 56px rgba(0,85,255,0.10)",
                fontFamily: "inherit",
                textAlign: "left",
                transition: "transform .18s cubic-bezier(.34,1.56,.64,1)",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: p.tileGrad,
                  boxShadow: p.tileShadow,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <Ico size={26} color="#fff" strokeWidth={2.3} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#99AACC", marginBottom: 6 }}>
                {t.label}
              </div>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-1.2px", lineHeight: 1, marginBottom: 6, color: p.valColor }}>
                {counts[t.k]}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#5070B0" }}>
                {active ? "Filtering" : "Tap to filter"}
              </div>
              <Ico
                size={56}
                color={p.decorColor}
                strokeWidth={2}
                style={{ position: "absolute", bottom: 12, right: 12, opacity: 0.18, pointerEvents: "none" }}
              />
            </button>
          );
        })}
      </div>

      {/* Section label */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T4, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{statTabs.find((s) => s.k === tab)?.label} {tab === "pending" ? "Requests" : tab === "approved" ? "Staff" : "List"}</span>
        <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 10, fontWeight: 700, ...slblBadgeStyle[tab] }}>
          {counts[tab]} {tab === "pending" ? "awaiting" : tab === "approved" ? "active" : "total"}
        </span>
        <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <Loader2 size={32} color={B1} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T4, margin: 0 }}>
            Loading requests...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 24, padding: "60px 24px", boxShadow: SHADOW_SM, border: "0.5px dashed rgba(0,85,255,0.22)", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: "linear-gradient(135deg,#E5EEFF,#D4E4FF)", border: "0.5px solid rgba(0,85,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ShieldCheck size={32} color={B1} strokeWidth={2.2} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T3, marginBottom: 8 }}>No {tab} Requests</div>
          {tab === "pending" && (
            <div style={{ fontSize: 12, color: T4, fontWeight: 500, lineHeight: 1.5 }}>
              Share the request link with your data entry team.
            </div>
          )}
        </div>
      ) : (
        <div>
          {filtered.map((req) => renderStaffCard(req, false))}
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
