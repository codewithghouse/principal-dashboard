/**
 * PreMessagesOversight.tsx — Principal oversight of pre-primary teacher↔parent
 * chats.
 *
 * Design intent (locked with founder 2026-05-25):
 *   • Principal sees thread METADATA only (parent name, child name, teacher,
 *     last-active, unread counters, report-flag indicator). Message contents
 *     are intentionally hidden by default — privacy + trust.
 *   • Tapping a thread WITHOUT any report flags ➜ just shows metadata + a
 *     "no reports filed" notice. The principal cannot read the conversation.
 *   • Tapping a thread WITH at least one report flag ➜ unlocks a read-only
 *     view: shows the reported messages + reporter reason + thread context.
 *   • The page also surfaces a global "Recent reports" inbox alongside the
 *     thread list so the principal can triage flagged content fast.
 *
 * Writes:
 *   • Mark report `status` as 'reviewed' / 'dismissed' (principal closes the
 *     loop on a flag without touching the thread itself).
 *
 * Does NOT post messages on behalf of either side — chat composer lives only
 * in the teacher + parent apps. Principal is observer + moderator.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  MessageCircle,
  Search,
  Shield,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";

type SenderRole = "teacher" | "parent";

interface ThreadRow {
  id: string;
  schoolId: string;
  classId: string;
  className?: string;
  studentId: string;
  studentName: string;
  parentEmail: string;
  parentName?: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  lastMessage?: {
    text: string;
    senderRole: SenderRole;
    senderName: string;
    sentAt: string;
  };
  unreadParent?: number;
  unreadTeacher?: number;
  archived?: boolean;
  reportFlagCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ReportRow {
  id: string;
  schoolId: string;
  classId: string;
  threadId: string;
  studentId: string;
  messageId: string;
  messageText: string;
  messageSenderRole: SenderRole;
  messageSenderName: string;
  reportedBy: string;
  reportedByName: string;
  reportedByRole: SenderRole;
  reason: string;
  status: "pending" | "reviewed" | "dismissed";
  reportedAt: string;
}

interface ReadOnlyMessage {
  id: string;
  text: string;
  sentAt: string;
  senderRole: SenderRole;
  senderName: string;
  deleted?: boolean;
}

const NAVY = "#1e3a8a";
const SOFT_BLUE = "#0055FF";

export default function PreMessagesOversight() {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId;

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [activeThread, setActiveThread] = useState<ThreadRow | null>(null);
  const [threadMessages, setThreadMessages] = useState<ReadOnlyMessage[]>([]);
  const [threadMessagesLoading, setThreadMessagesLoading] = useState(false);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    const tq = query(
      collection(db, "pp_message_threads"),
      where("schoolId", "==", schoolId),
      orderBy("updatedAt", "desc")
    );
    const unsubT = onSnapshot(
      tq,
      (snap) => {
        setThreads(
          snap.docs.map(
            (d) => ({ ...(d.data() as DocumentData), id: d.id } as ThreadRow)
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error("[PreMessagesOversight] threads:", err);
        toast.error(
          `Could not load threads: ${err instanceof Error ? err.message : err}`
        );
        setLoading(false);
      }
    );

    const rq = query(
      collection(db, "pp_message_reports"),
      where("schoolId", "==", schoolId),
      orderBy("reportedAt", "desc")
    );
    const unsubR = onSnapshot(
      rq,
      (snap) => {
        setReports(
          snap.docs.map(
            (d) => ({ ...(d.data() as DocumentData), id: d.id } as ReportRow)
          )
        );
      },
      (err) => {
        console.error("[PreMessagesOversight] reports:", err);
      }
    );

    return () => {
      unsubT();
      unsubR();
    };
  }, [schoolId]);

  // When a thread is opened AND it has report flags, fetch only the flagged
  // messages by id. Principal NEVER sees the rest of the thread.
  useEffect(() => {
    if (!activeThread) {
      setThreadMessages([]);
      return;
    }
    const flagCount = activeThread.reportFlagCount || 0;
    if (flagCount === 0) {
      setThreadMessages([]);
      return;
    }
    setThreadMessagesLoading(true);
    const threadReports = reports.filter(
      (r) => r.threadId === activeThread.id
    );
    const fetchFlagged = async () => {
      try {
        const messageIds = Array.from(
          new Set(threadReports.map((r) => r.messageId))
        );
        const out: ReadOnlyMessage[] = [];
        for (const mid of messageIds) {
          try {
            // Use a query for safety so we don't 404 on a deleted id.
            const q = query(
              collection(db, "pp_message_threads", activeThread.id, "messages")
            );
            const snap = await getDocs(q);
            const m = snap.docs.find((d) => d.id === mid);
            if (m) {
              const data = m.data() as DocumentData;
              out.push({
                id: m.id,
                text: (data.text as string) || "",
                sentAt: (data.sentAt as string) || "",
                senderRole: (data.senderRole as SenderRole) || "teacher",
                senderName: (data.senderName as string) || "",
                deleted: !!data.deleted,
              });
            }
          } catch (e) {
            console.warn("[Oversight] fetch message failed:", mid, e);
          }
        }
        out.sort((a, b) => (a.sentAt > b.sentAt ? 1 : -1));
        setThreadMessages(out);
      } finally {
        setThreadMessagesLoading(false);
      }
    };
    fetchFlagged();
  }, [activeThread, reports]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (filterFlagged && !(t.reportFlagCount && t.reportFlagCount > 0)) {
        return false;
      }
      if (q) {
        const hay = `${t.studentName} ${t.parentName || ""} ${
          t.teacherName || ""
        } ${t.className || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [threads, search, filterFlagged]);

  const pendingReports = useMemo(
    () => reports.filter((r) => r.status === "pending"),
    [reports]
  );

  const stats = useMemo(() => {
    const flagged = threads.filter(
      (t) => (t.reportFlagCount || 0) > 0
    ).length;
    return {
      total: threads.length,
      active: threads.filter((t) => !t.archived).length,
      flagged,
      pendingReports: pendingReports.length,
    };
  }, [threads, pendingReports.length]);

  const updateReportStatus = async (
    r: ReportRow,
    status: "reviewed" | "dismissed"
  ) => {
    try {
      await updateDoc(doc(db, "pp_message_reports", r.id), {
        status,
        reviewedBy: userData?.id || "",
        reviewedByName: userData?.name || userData?.email || "Principal",
        reviewedAt: new Date().toISOString(),
        _lastModifiedAt: serverTimestamp(),
      });
      toast.success(
        status === "reviewed" ? "Marked as reviewed" : "Report dismissed"
      );
    } catch (e) {
      console.error("[Oversight] updateReport:", e);
      toast.error(
        `Could not update: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  if (!schoolId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Sign in to view the messages oversight.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-100">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-[#1e3a8a] text-white flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Pre-primary
            </p>
            <h1 className="text-2xl font-black text-slate-900">
              Messages Oversight
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Trust-by-default. Message contents stay private unless a parent
              or teacher reports them. You can see metadata + flagged
              messages.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatTile
            label="Total threads"
            value={stats.total}
            icon={<MessageCircle className="w-4 h-4" />}
            tone="navy"
          />
          <StatTile
            label="Active"
            value={stats.active}
            icon={<Sparkles className="w-4 h-4" />}
            tone="green"
          />
          <StatTile
            label="Flagged threads"
            value={stats.flagged}
            icon={<Flag className="w-4 h-4" />}
            tone={stats.flagged > 0 ? "orange" : "slate"}
          />
          <StatTile
            label="Pending reports"
            value={stats.pendingReports}
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={stats.pendingReports > 0 ? "red" : "slate"}
            pulse={stats.pendingReports > 0}
          />
        </div>
      </div>

      {/* Pending reports inbox — only shown when there's something to do */}
      {pendingReports.length > 0 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-orange-100">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">
                Action needed
              </p>
              <h2 className="text-lg font-black text-slate-900">
                Pending reports
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-black uppercase tracking-widest">
              {pendingReports.length}
            </span>
          </div>
          <ul className="space-y-3">
            {pendingReports.slice(0, 6).map((r) => (
              <li
                key={r.id}
                className="border border-orange-100 rounded-xl p-3 bg-orange-50/40"
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-white text-[9px] font-black text-orange-700 uppercase tracking-widest shadow-inner border border-orange-100">
                    Flagged by {r.reportedByRole}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    {formatDistanceToNow(new Date(r.reportedAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    by {r.reportedByName}
                  </span>
                </div>
                <p className="text-sm text-slate-900 mt-2 whitespace-pre-wrap break-words">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Message from {r.messageSenderName} ({r.messageSenderRole})
                  </span>
                  {r.messageText}
                </p>
                {r.reason && (
                  <p className="text-xs text-slate-600 mt-2 italic">
                    "Why: {r.reason}"
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const t = threads.find((tt) => tt.id === r.threadId);
                      if (t) setActiveThread(t);
                    }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#1e3a8a] text-white hover:opacity-90"
                  >
                    Open thread
                  </button>
                  <button
                    type="button"
                    onClick={() => updateReportStatus(r, "reviewed")}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 inline-flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Mark reviewed
                  </button>
                  <button
                    type="button"
                    onClick={() => updateReportStatus(r, "dismissed")}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center gap-1"
                  >
                    <XCircle className="w-3 h-3" /> Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {pendingReports.length > 6 && (
            <p className="text-[11px] text-slate-500 text-center mt-3">
              + {pendingReports.length - 6} more pending — open a flagged
              thread to triage.
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search child, parent, teacher, class…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]"
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterFlagged((p) => !p)}
          className={
            "text-xs font-bold px-3 py-2 rounded-lg inline-flex items-center gap-1 transition " +
            (filterFlagged
              ? "bg-orange-100 text-orange-700"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200")
          }
        >
          <Flag className="w-3 h-3" />
          {filterFlagged ? "Showing flagged only" : "Filter: flagged only"}
        </button>
      </div>

      {/* Threads list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            All threads
          </p>
          <h2 className="text-base font-black text-slate-900">
            {filteredThreads.length} thread
            {filteredThreads.length === 1 ? "" : "s"}
          </h2>
        </div>
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No matching threads.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredThreads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActiveThread(t)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition flex items-center gap-4"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                    style={{
                      background: (t.reportFlagCount || 0) > 0
                        ? "linear-gradient(135deg, #F97316, #DC2626)"
                        : "linear-gradient(135deg, #1e3a8a, #3B82F6)",
                    }}
                  >
                    {(t.studentName?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-900 truncate">
                        {t.studentName}
                      </p>
                      {t.archived && (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1">
                          <Archive className="w-2.5 h-2.5" />
                          Archived
                        </span>
                      )}
                      {(t.reportFlagCount || 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1">
                          <Flag className="w-2.5 h-2.5" />
                          {t.reportFlagCount} flag
                          {t.reportFlagCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {t.parentName || t.parentEmail} ↔{" "}
                      {t.teacherName || "Teacher"}
                      {t.className ? ` · ${t.className}` : ""}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Last activity:{" "}
                      {t.updatedAt
                        ? formatDistanceToNow(new Date(t.updatedAt), {
                            addSuffix: true,
                          })
                        : "—"}
                    </p>
                  </div>
                  {(t.reportFlagCount || 0) > 0 ? (
                    <Eye className="w-4 h-4 text-orange-500 shrink-0" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activeThread && (
        <ThreadDrawer
          thread={activeThread}
          messages={threadMessages}
          messagesLoading={threadMessagesLoading}
          relatedReports={reports.filter(
            (r) => r.threadId === activeThread.id
          )}
          onClose={() => setActiveThread(null)}
          onReportStatus={updateReportStatus}
        />
      )}
    </div>
  );
}

/* ─────────────── StatTile ─────────────── */

function StatTile({
  label,
  value,
  icon,
  tone,
  pulse,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "navy" | "green" | "orange" | "red" | "slate";
  pulse?: boolean;
}) {
  const palette: Record<typeof tone, { bg: string; fg: string }> = {
    navy: { bg: "bg-blue-50", fg: "text-blue-700" },
    green: { bg: "bg-emerald-50", fg: "text-emerald-700" },
    orange: { bg: "bg-orange-50", fg: "text-orange-700" },
    red: { bg: "bg-red-50", fg: "text-red-700" },
    slate: { bg: "bg-slate-50", fg: "text-slate-500" },
  };
  return (
    <div
      className={`rounded-xl p-3 ${palette[tone].bg} ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <div className={`inline-flex items-center gap-1 ${palette[tone].fg}`}>
        {icon}
        <span className="text-[9px] font-black uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
    </div>
  );
}

/* ─────────────── Thread Drawer (read-only) ─────────────── */

function ThreadDrawer({
  thread,
  messages,
  messagesLoading,
  relatedReports,
  onClose,
  onReportStatus,
}: {
  thread: ThreadRow;
  messages: ReadOnlyMessage[];
  messagesLoading: boolean;
  relatedReports: ReportRow[];
  onClose: () => void;
  onReportStatus: (
    r: ReportRow,
    status: "reviewed" | "dismissed"
  ) => Promise<void>;
}) {
  const hasFlags = (thread.reportFlagCount || 0) > 0;
  const pending = relatedReports.filter((r) => r.status === "pending");

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-end"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
            style={{
              background: hasFlags
                ? "linear-gradient(135deg, #F97316, #DC2626)"
                : "linear-gradient(135deg, #1e3a8a, #3B82F6)",
            }}
          >
            {(thread.studentName?.[0] || "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Thread
            </p>
            <h3 className="text-lg font-black text-slate-900 truncate">
              {thread.studentName}
            </h3>
            <p className="text-xs text-slate-500 truncate">
              {thread.parentName || thread.parentEmail} ↔{" "}
              {thread.teacherName || "Teacher"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {thread.className ? `${thread.className} · ` : ""}
              Created{" "}
              {thread.createdAt
                ? format(new Date(thread.createdAt), "d MMM yyyy")
                : "—"}{" "}
              · Last activity{" "}
              {thread.updatedAt
                ? formatDistanceToNow(new Date(thread.updatedAt), {
                    addSuffix: true,
                  })
                : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!hasFlags ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 text-center">
              <EyeOff className="w-7 h-7 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-black text-slate-700">
                No reports filed on this thread
              </p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Message contents stay between the teacher and the parent.
                Either side can flag a message — once flagged, the message
                appears here for your review. You always see metadata
                (participants, timestamps, unread counts).
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-orange-600" />
                  <p className="text-xs font-black text-orange-700 uppercase tracking-widest">
                    {thread.reportFlagCount} message
                    {thread.reportFlagCount === 1 ? "" : "s"} flagged
                  </p>
                </div>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  You can review the flagged content below. The rest of the
                  conversation stays private.
                </p>
              </div>

              {messagesLoading ? (
                <div className="p-8 flex items-center justify-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-8">
                  Reported messages could not be loaded.
                </p>
              ) : (
                <ul className="space-y-3">
                  {messages.map((m) => {
                    const matchingReports = relatedReports.filter(
                      (r) => r.messageId === m.id
                    );
                    return (
                      <li
                        key={m.id}
                        className="rounded-xl border border-slate-100 p-3 bg-white"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={
                              "px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest " +
                              (m.senderRole === "teacher"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-sky-100 text-sky-700")
                            }
                          >
                            {m.senderRole}
                          </span>
                          <span className="text-[11px] font-bold text-slate-600">
                            {m.senderName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {m.sentAt
                              ? format(
                                  new Date(m.sentAt),
                                  "d MMM · h:mm a"
                                )
                              : ""}
                          </span>
                          {m.deleted && (
                            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest">
                              Deleted by sender
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-900 mt-2 whitespace-pre-wrap break-words">
                          {m.deleted ? (
                            <span className="italic text-slate-400">
                              Message deleted — original copy retained on
                              the report.
                            </span>
                          ) : (
                            m.text || (
                              <span className="italic text-slate-400">
                                (empty)
                              </span>
                            )
                          )}
                        </p>
                        {matchingReports.map((r) => (
                          <div
                            key={r.id}
                            className="mt-3 pt-3 border-t border-dashed border-slate-200"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">
                                Reported by {r.reportedByRole}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {r.reportedByName} ·{" "}
                                {format(
                                  new Date(r.reportedAt),
                                  "d MMM · h:mm a"
                                )}
                              </span>
                              <span
                                className={
                                  "ml-auto text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full " +
                                  (r.status === "pending"
                                    ? "bg-orange-100 text-orange-700"
                                    : r.status === "reviewed"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-500")
                                }
                              >
                                {r.status}
                              </span>
                            </div>
                            {r.reason && (
                              <p className="text-xs text-slate-600 mt-2 italic">
                                "{r.reason}"
                              </p>
                            )}
                            {r.status === "pending" && (
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => onReportStatus(r, "reviewed")}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 inline-flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Reviewed
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onReportStatus(r, "dismissed")
                                  }
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center gap-1"
                                >
                                  <XCircle className="w-3 h-3" /> Dismiss
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {/* Metadata footer always visible */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
              Thread metadata
            </p>
            <dl className="text-xs text-slate-700 space-y-1">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Unread (parent)</dt>
                <dd className="font-bold">{thread.unreadParent || 0}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Unread (teacher)</dt>
                <dd className="font-bold">{thread.unreadTeacher || 0}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Archived</dt>
                <dd className="font-bold">{thread.archived ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Teacher email</dt>
                <dd className="font-bold truncate">{thread.teacherEmail}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Parent email</dt>
                <dd className="font-bold truncate">{thread.parentEmail}</dd>
              </div>
            </dl>
          </div>

          {pending.length > 0 && (
            <p className="text-[11px] text-orange-600 text-center font-bold">
              {pending.length} report{pending.length === 1 ? "" : "s"} still
              pending review on this thread.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Reserved for future use.
void NAVY;
void SOFT_BLUE;
