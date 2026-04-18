import { useState, useEffect, useMemo } from "react";
import {
  Library, FileText, Trash2, Eye, Building2, Calendar,
  Search, Loader2, BookOpen
} from "lucide-react";
import { toast } from "sonner";
import { db, storage } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  deleteDoc, doc
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { useAuth } from "@/lib/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SyllabusDoc {
  id: string;
  schoolId?: string;
  branchId?: string;
  classId?: string;
  className?: string;
  subject?: string;
  academicYear?: string;
  title?: string;
  fileUrl?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedByTeacherId?: string;
  uploadedAt?: any;
  isActive?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }
  return `${size.toFixed(size >= 10 || unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
};

const formatRelativeTime = (timestamp: any): string => {
  if (!timestamp) return "—";
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWk  = Math.floor(diffDay / 7);
  const diffMo  = Math.floor(diffDay / 30);
  const diffYr  = Math.floor(diffDay / 365);

  if (diffSec < 60)  return "just now";
  if (diffMin < 60)  return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr  < 24)  return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7)   return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  if (diffWk  < 5)   return `${diffWk} week${diffWk === 1 ? "" : "s"} ago`;
  if (diffMo  < 12)  return `${diffMo} month${diffMo === 1 ? "" : "s"} ago`;
  return `${diffYr} year${diffYr === 1 ? "" : "s"} ago`;
};

const getUploadedAtMs = (timestamp: any): number => {
  if (!timestamp) return 0;
  const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({
  title, value, subtitle, icon: Icon, iconBg,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  iconBg: string;
}) => (
  <div className="clickable-card bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-slate-500 font-medium">{title}</span>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
    </div>
    <div className="text-2xl font-bold text-[#1e294b] mb-1">{value}</div>
    {subtitle && (
      <span className="text-xs font-semibold text-slate-400">{subtitle}</span>
    )}
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
const Syllabus = () => {
  const { userData } = useAuth();

  const [syllabi,       setSyllabi]       = useState<SyllabusDoc[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  const [classFilter,   setClassFilter]   = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  // ── Real-time syllabi listener ───────────────────────────────────────────
  useEffect(() => {
    if (!userData) {
      setLoading(false);
      return;
    }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId || "";
    if (!schoolId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const constraints: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) constraints.push(where("branchId", "==", branchId));

    const q = query(collection(db, "syllabi"), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (cancelled) return;
        const docs: SyllabusDoc[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as SyllabusDoc))
          .sort((a, b) => {
            const am = (a.uploadedAt as any)?.toMillis?.() ?? 0;
            const bm = (b.uploadedAt as any)?.toMillis?.() ?? 0;
            return bm - am;
          });
        setSyllabi(docs);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        console.error("Syllabi listener error:", err);
        setError(err.message || "Failed to load syllabi.");
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [userData]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    syllabi.forEach((s) => {
      const key = s.className || s.classId || "";
      if (key) map.set(key, key);
    });
    return Array.from(map.values()).sort();
  }, [syllabi]);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    syllabi.forEach((s) => { if (s.subject) set.add(s.subject); });
    return Array.from(set).sort();
  }, [syllabi]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return syllabi.filter((s) => {
      if (classFilter && (s.className || s.classId) !== classFilter) return false;
      if (subjectFilter && s.subject !== subjectFilter) return false;
      if (q) {
        const hay = `${s.fileName || ""} ${s.title || ""} ${s.uploadedByName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [syllabi, classFilter, subjectFilter, searchQuery]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalCount    = syllabi.length;
  const classesCount  = useMemo(
    () => new Set(syllabi.map((s) => s.classId).filter(Boolean)).size,
    [syllabi]
  );
  const subjectsCount = useMemo(
    () => new Set(syllabi.map((s) => s.subject).filter(Boolean)).size,
    [syllabi]
  );
  const updatedThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return syllabi.filter((s) => getUploadedAtMs(s.uploadedAt) >= cutoff).length;
  }, [syllabi]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleView = (fileUrl?: string) => {
    if (!fileUrl) {
      toast.error("File URL is missing.");
      return;
    }
    window.open(fileUrl, "_blank", "noopener");
  };

  const handleDelete = async (s: SyllabusDoc) => {
    const label = s.title || s.fileName || `Syllabus - ${s.subject || ""}`;
    if (!confirm(`Delete "${label}"? This will permanently remove the file.`)) return;

    setDeletingId(s.id);
    try {
      if (s.filePath) {
        try {
          await deleteObject(ref(storage, s.filePath));
        } catch (storageErr: any) {
          // object-not-found is acceptable — still remove the doc
          if (storageErr?.code !== "storage/object-not-found") {
            console.error("Storage delete error:", storageErr);
            toast.warning(`Storage delete failed: ${storageErr?.message || "Unknown error"}. Removing record anyway.`);
          }
        }
      }
      await deleteDoc(doc(db, "syllabi", s.id));
      toast.success("Syllabus deleted.");
    } catch (err: any) {
      console.error("Delete syllabus error:", err);
      toast.error(`Failed to delete: ${err?.message || "Unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Unauthed state ───────────────────────────────────────────────────────
  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center py-28 bg-white rounded-2xl border border-dashed border-slate-200">
        <Library className="w-12 h-12 text-slate-200 mb-4" />
        <p className="text-base font-bold text-slate-400">Please sign in</p>
        <p className="text-sm text-slate-300 mt-1">You need to be logged in to view syllabi.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">

      {/* ── PAGE HEADER ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-[#1e294b]">Syllabus</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          View and manage syllabi uploaded by teachers for your branch
        </p>
      </div>

      {/* ── STAT CARDS ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Syllabi"
          value={totalCount}
          subtitle={totalCount === 0 ? "None uploaded yet" : "Across all classes"}
          icon={Library}
          iconBg="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Classes Covered"
          value={classesCount}
          subtitle={classesCount === 0 ? "No classes yet" : "With at least one syllabus"}
          icon={Building2}
          iconBg="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Subjects Covered"
          value={subjectsCount}
          subtitle={subjectsCount === 0 ? "No subjects yet" : "Distinct subjects"}
          icon={BookOpen}
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Updated This Week"
          value={updatedThisWeek}
          subtitle="Past 7 days"
          icon={Calendar}
          iconBg="bg-amber-50 text-amber-600"
        />
      </div>

      {/* ── FILTERS ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by filename, title, or teacher…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
          />
        </div>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="py-2.5 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
        >
          <option value="">All Classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="py-2.5 px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
        >
          <option value="">All Subjects</option>
          {subjectOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* ── ERROR STATE ───────────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-sm text-rose-600">
          {error}
        </div>
      )}

      {/* ── LOADING / EMPTY / GRID ────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-28">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 bg-white rounded-2xl border border-dashed border-slate-200">
          {syllabi.length === 0 ? (
            <>
              <Library className="w-12 h-12 text-slate-200 mb-4" />
              <p className="text-base font-bold text-slate-400">No syllabi uploaded yet</p>
              <p className="text-sm text-slate-300 mt-1">Teachers can upload syllabi from their dashboard.</p>
            </>
          ) : (
            <>
              <FileText className="w-12 h-12 text-slate-200 mb-4" />
              <p className="text-base font-bold text-slate-400">No syllabi match your filters</p>
              <p className="text-sm text-slate-300 mt-1">Try clearing filters or changing your search.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const title = s.title || `Syllabus - ${s.subject || "General"}`;
            const classLabel = s.className || s.classId || "Class";
            return (
              <div
                key={s.id}
                className="clickable-card bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Top row: class + subject badge */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold text-[#1e294b] bg-slate-100 px-2.5 py-1 rounded-full truncate">
                    {classLabel}
                  </span>
                  {s.subject && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full truncate">
                      {s.subject}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-[#1e294b] leading-tight mb-1 line-clamp-2">
                  {title}
                </h3>

                {/* Filename + size */}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{s.fileName || "file.pdf"}</span>
                  <span className="text-slate-300">·</span>
                  <span className="shrink-0">{formatFileSize(s.fileSize)}</span>
                </div>

                {/* Uploaded by + time */}
                <p className="text-xs text-slate-500 mb-3">
                  <span className="font-semibold text-slate-600">
                    {s.uploadedByName || "Unknown"}
                  </span>
                  <span className="text-slate-300 mx-1.5">·</span>
                  {formatRelativeTime(s.uploadedAt)}
                </p>

                {/* Academic year badge */}
                {s.academicYear && (
                  <div className="mb-4">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 uppercase tracking-wide">
                      <Calendar className="w-3 h-3" />
                      {s.academicYear}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto flex items-center gap-2 pt-3 border-t border-slate-50">
                  <button
                    onClick={() => handleView(s.fileUrl)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#1e3a8a] text-white rounded-lg text-xs font-semibold hover:opacity-90 transition"
                  >
                    <Eye className="w-3.5 h-3.5" /> View PDF
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                    className="w-9 h-9 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Delete syllabus"
                  >
                    {deletingId === s.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Syllabus;