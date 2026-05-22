/**
 * PreAnnouncements.tsx — Principal-side composer for pre-primary notices.
 *
 * Writes to the `pp_announcements` Firestore collection that the
 * pre-primary-parent-dashboard /announcements page subscribes to.
 *
 * Single page handles:
 *   • Composing a new notice (title, body, type, audience, optional pin + expiry)
 *   • Audience picker: school-wide / all pre-primary / specific class
 *   • Listing existing notices with read-state badges + sender attribution
 *   • Edit an existing notice
 *   • Pin/unpin
 *   • Soft-delete (hard delete via principal-only rule)
 *
 * Mirrors PreStudents + PreTeachers UX patterns so the principal has a
 * consistent mental model across pre-primary admin pages.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Plus,
  Loader2,
  Sparkles,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Globe,
  GraduationCap,
  Users,
  Search,
  X,
  AlertTriangle,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  type DocumentData,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { format, formatDistanceToNow } from "date-fns";

const PP_TOKENS = ["playgroup", "nursery", "lkg", "ukg", "pre"];

const TYPES = [
  { key: "info", label: "Notice", emoji: "📣" },
  { key: "event", label: "Event", emoji: "🎉" },
  { key: "alert", label: "Important", emoji: "⚠️" },
  { key: "celebration", label: "Celebration", emoji: "🎊" },
  { key: "reminder", label: "Reminder", emoji: "🔔" },
] as const;

type NoticeType = (typeof TYPES)[number]["key"];
type Audience = "school" | "stage" | "class";

const TYPE_BG: Record<NoticeType, string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  event: "bg-pink-50 text-pink-700 border-pink-200",
  alert: "bg-red-50 text-red-700 border-red-200",
  celebration: "bg-yellow-50 text-yellow-700 border-yellow-200",
  reminder: "bg-orange-50 text-orange-700 border-orange-200",
};

const AUDIENCE_ICON = {
  school: Globe,
  stage: GraduationCap,
  class: Users,
} as const;

const AUDIENCE_LABEL = {
  school: "Whole school",
  stage: "All Pre-Primary",
  class: "Specific class",
} as const;

interface ClassRow extends DocumentData {
  id: string;
  schoolId?: string;
  name?: string;
  section?: string;
  stage?: string;
}

interface NoticeRow extends DocumentData {
  id: string;
  schoolId: string;
  audience: Audience;
  classId?: string;
  className?: string;
  title: string;
  body: string;
  type: NoticeType;
  pinned?: boolean;
  publishedAt?: string;
  expiresAt?: string;
  createdBy?: string;
  createdByName?: string;
  createdByRole?: "principal" | "teacher" | "owner";
}

interface FormState {
  title: string;
  body: string;
  type: NoticeType;
  audience: Audience;
  classId: string;
  pinned: boolean;
  expiresAt: string;
}

const emptyForm = (): FormState => ({
  title: "",
  body: "",
  type: "info",
  audience: "stage",
  classId: "",
  pinned: false,
  expiresAt: "",
});

export default function PreAnnouncements() {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId;

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Pre-primary classes — same filter as PreStudents (stage='pre_primary' OR name-token match).
  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, "classes"),
      where("schoolId", "==", schoolId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(
        (d) => ({ ...(d.data() as DocumentData), id: d.id } as ClassRow)
      );
      const pp = all.filter((c) => {
        if (c.stage === "pre_primary") return true;
        const nm = (c.name || "").toLowerCase();
        return PP_TOKENS.some((t) => nm.includes(t));
      });
      setClasses(pp);
    });
    return () => unsub();
  }, [schoolId]);

  // Notices subscription — newest first.
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "pp_announcements"),
      where("schoolId", "==", schoolId),
      orderBy("publishedAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as DocumentData;
          return {
            id: d.id,
            schoolId: data.schoolId,
            audience: data.audience || "school",
            classId: data.classId,
            className: data.className,
            title: data.title || "",
            body: data.body || "",
            type: data.type || "info",
            pinned: Boolean(data.pinned),
            publishedAt:
              data.publishedAt instanceof Timestamp
                ? data.publishedAt.toDate().toISOString()
                : data.publishedAt,
            expiresAt:
              data.expiresAt instanceof Timestamp
                ? data.expiresAt.toDate().toISOString()
                : data.expiresAt,
            createdBy: data.createdBy,
            createdByName: data.createdByName,
            createdByRole: data.createdByRole,
          } as NoticeRow;
        });
        // Pinned first
        list.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.publishedAt || "").localeCompare(a.publishedAt || "");
        });
        setNotices(list);
        setLoading(false);
      },
      (err) => {
        console.error("[PreAnnouncements] subscription error:", err);
        toast.error(
          `Could not load notices: ${err instanceof Error ? err.message : err}`
        );
        setLoading(false);
      }
    );
    return () => unsub();
  }, [schoolId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notices;
    return notices.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.className || "").toLowerCase().includes(q)
    );
  }, [notices, search]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: notices.length,
      pinned: notices.filter((n) => n.pinned).length,
      active: notices.filter(
        (n) => !n.expiresAt || new Date(n.expiresAt).getTime() > now
      ).length,
      schoolWide: notices.filter((n) => n.audience === "school").length,
      class: notices.filter((n) => n.audience === "class").length,
    };
  }, [notices]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (n: NoticeRow) => {
    setEditingId(n.id);
    setForm({
      title: n.title,
      body: n.body,
      type: n.type,
      audience: n.audience,
      classId: n.classId || "",
      pinned: !!n.pinned,
      expiresAt: n.expiresAt ? n.expiresAt.slice(0, 16) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!schoolId || !userData) {
      toast.error("Missing user context");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (form.body.trim().length < 5) {
      toast.error("Body too short");
      return;
    }
    if (form.audience === "class" && !form.classId) {
      toast.error("Pick a class for class-scoped notices");
      return;
    }

    setSaving(true);
    try {
      const matchedClass = classes.find((c) => c.id === form.classId);
      const payload: DocumentData = {
        schoolId,
        audience: form.audience,
        classId: form.audience === "class" ? form.classId : undefined,
        className:
          form.audience === "class" ? matchedClass?.name : undefined,
        title: form.title.trim(),
        body: form.body.trim(),
        type: form.type,
        pinned: form.pinned,
        expiresAt: form.expiresAt
          ? Timestamp.fromDate(new Date(form.expiresAt))
          : undefined,
        createdBy: userData.id,
        createdByName: userData.name || userData.email || "Principal",
        createdByRole: (userData.role as NoticeRow["createdByRole"]) || "principal",
      };

      if (editingId) {
        // Update — preserve publishedAt, refresh updatedAt
        const ref = doc(db, "pp_announcements", editingId);
        await updateDoc(ref, {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        toast.success("Notice updated");
      } else {
        const ref = collection(db, "pp_announcements");
        await addDoc(ref, {
          ...payload,
          publishedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
        toast.success("Notice posted — parents will see it immediately ✓");
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (err) {
      console.error("[PreAnnouncements] save failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not save notice: ${msg.slice(0, 200)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (n: NoticeRow) => {
    try {
      const ref = doc(db, "pp_announcements", n.id);
      await updateDoc(ref, {
        pinned: !n.pinned,
        updatedAt: serverTimestamp(),
      });
      toast.success(n.pinned ? "Unpinned" : "Pinned to top");
    } catch (err) {
      console.error("[PreAnnouncements] toggle pin:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not update: ${msg.slice(0, 120)}`);
    }
  };

  const handleDelete = async (n: NoticeRow) => {
    if (
      !window.confirm(
        `Delete notice "${n.title}"? Parents will stop seeing it immediately.`
      )
    )
      return;
    try {
      await deleteDoc(doc(db, "pp_announcements", n.id));
      toast.success("Notice deleted");
    } catch (err) {
      console.error("[PreAnnouncements] delete:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not delete: ${msg.slice(0, 120)}`);
    }
  };

  if (!schoolId) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Loading school context…
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-br from-[#1e3a8a] to-[#1e3272] text-white flex items-center justify-center shadow-lg">
            <Megaphone className="w-5 h-5 lg:w-6 lg:h-6" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-slate-900">
              Pre-Primary Notices
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-semibold">
              Send announcements directly to pre-primary parents.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="h-10 px-4 rounded-xl bg-[#1e3a8a] text-white font-bold text-sm flex items-center gap-1.5 hover:bg-[#1e3272] active:scale-95 transition"
        >
          <Plus className="w-4 h-4" />
          New Notice
        </button>
      </div>

      {/* Stats banner */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1e3a8a] to-[#1e3272] text-white p-4 shadow-md">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/70 font-bold">
          <Sparkles className="w-3 h-3" /> Overview
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <Stat label="Total" value={stats.total} />
          <Stat label="Active" value={stats.active} />
          <Stat label="Pinned" value={stats.pinned} />
          <Stat label="School-wide" value={stats.schoolWide} />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search title, body, or class…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-slate-500 text-center py-8">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading notices…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onCompose={openNew} hasNotices={notices.length > 0} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((n) => (
            <NoticeCard
              key={n.id}
              notice={n}
              onEdit={() => openEdit(n)}
              onDelete={() => handleDelete(n)}
              onTogglePin={() => handleTogglePin(n)}
            />
          ))}
        </ul>
      )}

      {/* Composer dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (saving) return;
          setDialogOpen(o);
          if (!o) {
            setEditingId(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Notice" : "New Notice"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Changes save instantly. Parents see updates immediately."
                : "Notices push to parent dashboards in real time."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider">
                Title
              </Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Picnic on Friday — pack lunch"
                maxLength={120}
                className="mt-1"
              />
            </div>

            {/* Body */}
            <div>
              <Label htmlFor="body" className="text-xs font-bold uppercase tracking-wider">
                Body
              </Label>
              <textarea
                id="body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Full details parents need to know…"
                rows={4}
                maxLength={1500}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {form.body.length}/1500 · Plain text only (no HTML)
              </p>
            </div>

            {/* Type */}
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider">Type</Label>
              <div className="mt-1 grid grid-cols-5 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setForm({ ...form, type: t.key })}
                    className={`rounded-xl border-2 p-2 text-center transition active:scale-95 ${
                      form.type === t.key
                        ? "border-[#1e3a8a] bg-[#1e3a8a]/5"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    title={t.label}
                  >
                    <div className="text-lg leading-none">{t.emoji}</div>
                    <div className="text-[9px] font-bold mt-0.5 text-slate-600 uppercase tracking-wider">
                      {t.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audience */}
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider">
                Who sees this?
              </Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["school", "stage", "class"] as Audience[]).map((a) => {
                  const Icon = AUDIENCE_ICON[a];
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setForm({ ...form, audience: a })}
                      className={`rounded-xl border-2 p-3 text-left transition active:scale-95 ${
                        form.audience === a
                          ? "border-[#1e3a8a] bg-[#1e3a8a]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-[#1e3a8a]" />
                      <p className="text-xs font-bold text-slate-900 mt-1">
                        {AUDIENCE_LABEL[a]}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {a === "school" && "All school parents"}
                        {a === "stage" && "Pre-primary only"}
                        {a === "class" && "One class"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Class picker (only if audience='class') */}
            {form.audience === "class" && (
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider">
                  Class
                </Label>
                <select
                  value={form.classId}
                  onChange={(e) => setForm({ ...form, classId: e.target.value })}
                  className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
                >
                  <option value="">Pick a pre-primary class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.section ? ` · ${c.section}` : ""}
                    </option>
                  ))}
                </select>
                {classes.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    No pre-primary classes found. Add one in Classes &amp;
                    Sections.
                  </p>
                )}
              </div>
            )}

            {/* Pin + Expiry */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-slate-300 transition">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) =>
                    setForm({ ...form, pinned: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
                    <Pin className="w-3 h-3" /> Pin to top
                  </p>
                  <p className="text-[10px] text-slate-500">Stays at the top</p>
                </div>
              </label>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" /> Expires (optional)
                </Label>
                <Input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) =>
                    setForm({ ...form, expiresAt: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-bold hover:bg-slate-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-[#1e3a8a] text-white font-bold text-sm flex items-center gap-1.5 hover:bg-[#1e3272] active:scale-95 transition disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingId ? (
                "Save changes"
              ) : (
                "Post notice"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-black leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-widest font-bold text-white/70 mt-1">
        {label}
      </p>
    </div>
  );
}

function NoticeCard({
  notice,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  notice: NoticeRow;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const AudienceIcon = AUDIENCE_ICON[notice.audience];
  const typeMeta = TYPES.find((t) => t.key === notice.type) || TYPES[0];
  const expired =
    notice.expiresAt && new Date(notice.expiresAt).getTime() < Date.now();

  return (
    <li
      className={`relative rounded-2xl border-2 p-4 bg-white shadow-sm hover:shadow-md transition ${
        notice.pinned ? "border-yellow-300 bg-yellow-50/40" : "border-slate-200"
      } ${expired ? "opacity-60" : ""}`}
    >
      {notice.pinned && (
        <Pin className="absolute top-3 right-3 w-3.5 h-3.5 text-yellow-500" />
      )}

      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl border ${
            TYPE_BG[notice.type]
          }`}
        >
          {typeMeta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-sm leading-tight">
            {notice.title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
              {typeMeta.label}
            </span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <AudienceIcon className="w-3 h-3" />
              {notice.audience === "class" && notice.className
                ? notice.className
                : AUDIENCE_LABEL[notice.audience]}
            </span>
            {notice.publishedAt && (
              <>
                <span className="text-[10px] text-slate-400">·</span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {formatDistanceToNow(new Date(notice.publishedAt), {
                    addSuffix: true,
                  })}
                </span>
              </>
            )}
            {expired && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                Expired
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed mt-3 whitespace-pre-wrap line-clamp-4">
        {notice.body}
      </p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
        <span className="font-semibold">
          By {notice.createdByName || "Principal"}
          {notice.expiresAt && !expired && (
            <>
              {" · "}
              <span className="text-amber-600">
                expires {format(new Date(notice.expiresAt), "d MMM, h:mm a")}
              </span>
            </>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTogglePin}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"
            title={notice.pinned ? "Unpin" : "Pin to top"}
          >
            {notice.pinned ? (
              <PinOff className="w-3.5 h-3.5 text-yellow-600" />
            ) : (
              <Pin className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      </div>
    </li>
  );
}

function EmptyState({
  onCompose,
  hasNotices,
}: {
  onCompose: () => void;
  hasNotices: boolean;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
      <p className="text-5xl mb-3">📬</p>
      <p className="text-base font-black text-slate-900">
        {hasNotices ? "No matches" : "No notices yet"}
      </p>
      <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">
        {hasNotices
          ? "Try a different search term."
          : "Compose your first notice — pre-primary parents will see it instantly in their app."}
      </p>
      {!hasNotices && (
        <button
          type="button"
          onClick={onCompose}
          className="mt-4 h-10 px-5 rounded-xl bg-[#1e3a8a] text-white font-bold text-sm inline-flex items-center gap-1.5 hover:bg-[#1e3272] transition"
        >
          <Plus className="w-4 h-4" />
          Compose first notice
        </button>
      )}
    </div>
  );
}
