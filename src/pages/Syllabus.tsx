import { useState, useEffect, useMemo } from "react";
import {
  Library, FileText, Trash2, Eye, Building2, Calendar,
  Search, Loader2, BookOpen, Upload, Download, Sparkles,
  CheckCircle2, Clock
} from "lucide-react";
import { toast } from "sonner";
import { db, storage } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  deleteDoc, doc
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

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

  // ── Derived info for AI / primary card ───────────────────────────────────
  const lastUploadRel = useMemo(() => {
    if (!syllabi.length) return null;
    const latest = syllabi.reduce((a, b) =>
      getUploadedAtMs(a.uploadedAt) > getUploadedAtMs(b.uploadedAt) ? a : b
    );
    return { rel: formatRelativeTime(latest.uploadedAt), by: latest.uploadedByName || "Unknown" };
  }, [syllabi]);

  const lastUploadShort = useMemo(() => {
    if (!syllabi.length) return "—";
    const latest = syllabi.reduce((a, b) =>
      getUploadedAtMs(a.uploadedAt) > getUploadedAtMs(b.uploadedAt) ? a : b
    );
    const ms = Date.now() - getUploadedAtMs(latest.uploadedAt);
    const d = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (d <= 0) return "Today";
    if (d < 7) return `${d}d`;
    const w = Math.floor(d / 7);
    if (w < 5) return `${w}w`;
    const mo = Math.floor(d / 30);
    return `${mo}mo`;
  }, [syllabi]);

  const initials = (userData?.fullName || userData?.name || userData?.email || "AD")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // ───────────────────────────────────────── MOBILE RETURN ─────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const GREEN = "#00C853";
    const RED = "#FF3355";
    const VIOLET = "#7B3FF4";
    const GOLD = "#FFAA00";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const stripeFor = (idx: number) => {
      const palette = [
        `linear-gradient(180deg, ${B1}, #4499FF)`,
        `linear-gradient(180deg, ${VIOLET}, #AA77FF)`,
        `linear-gradient(180deg, ${GREEN}, #22EE66)`,
        `linear-gradient(180deg, ${GOLD}, #FFCC55)`,
      ];
      return palette[idx % palette.length];
    };
    const chipBgFor = (idx: number) => {
      const palette = [
        `linear-gradient(135deg, ${B1}, ${B2})`,
        `linear-gradient(135deg, ${VIOLET}, #AA77FF)`,
        `linear-gradient(135deg, ${GREEN}, #22EE66)`,
        `linear-gradient(135deg, ${GOLD}, #FFCC55)`,
      ];
      return palette[idx % palette.length];
    };
    const chipShadow = (idx: number) => {
      const palette = [
        "0 2px 8px rgba(0,85,255,.28)",
        "0 2px 8px rgba(123,63,244,.28)",
        "0 2px 8px rgba(0,200,83,.28)",
        "0 2px 8px rgba(255,170,0,.28)",
      ];
      return palette[idx % palette.length];
    };

    const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const handleUploadInfo = () => {
      toast.info("Teachers upload syllabi from their own dashboard.", {
        description: "Principals can view, download, and remove uploaded files.",
      });
    };

    const handleDownload = (s: SyllabusDoc) => {
      if (!s.fileUrl) {
        toast.error("File URL is missing.");
        return;
      }
      const a = document.createElement("a");
      a.href = s.fileUrl;
      a.download = s.fileName || "syllabus.pdf";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    return (
      <div
        style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          background: "#EEF4FF",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* PAGE HEAD */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3 }}>
              Syllabus
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5 }}>
              View and manage syllabi uploaded<br />by teachers for your branch
            </div>
          </div>
          <button
            onClick={handleUploadInfo}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 14,
              background: `linear-gradient(135deg, ${B1}, ${B2})`,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
              marginTop: 4,
              flexShrink: 0,
            }}
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />
            Upload
          </button>
        </div>

        {/* STAT GRID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
          {[
            {
              label: "Total Syllabi",
              value: totalCount,
              sub: totalCount === 0 ? "None uploaded yet" : "Across all classes",
              color: B1,
              icon: <Library size={14} color={B1} strokeWidth={2.4} />,
              bg: "rgba(0,85,255,.10)",
              border: "rgba(0,85,255,.18)",
              glow: "rgba(0,85,255,.10)",
              onClick: () => { setClassFilter(""); setSubjectFilter(""); setSearchQuery(""); },
            },
            {
              label: "Classes Covered",
              value: classesCount,
              sub: classesCount === 0 ? "No classes yet" : "With at least one syllabus",
              color: GREEN,
              icon: <Building2 size={14} color={GREEN} strokeWidth={2.4} />,
              bg: "rgba(0,200,83,.10)",
              border: "rgba(0,200,83,.20)",
              glow: "rgba(0,200,83,.10)",
              onClick: () => {
                if (classOptions.length > 0) {
                  toast.info(`${classesCount} class${classesCount === 1 ? "" : "es"} covered: ${classOptions.slice(0, 6).join(", ")}`);
                } else {
                  toast.info("No class data yet.");
                }
              },
            },
            {
              label: "Subjects Covered",
              value: subjectsCount,
              sub: subjectsCount === 0 ? "No subjects yet" : "Distinct subjects",
              color: VIOLET,
              icon: <BookOpen size={14} color={VIOLET} strokeWidth={2.4} />,
              bg: "rgba(123,63,244,.10)",
              border: "rgba(123,63,244,.20)",
              glow: "rgba(123,63,244,.10)",
              onClick: () => {
                if (subjectOptions.length > 0) {
                  toast.info(`Subjects: ${subjectOptions.join(", ")}`);
                } else {
                  toast.info("No subject metadata yet.");
                }
              },
            },
            {
              label: "Updated This Week",
              value: updatedThisWeek,
              sub: "Past 7 days",
              color: GOLD,
              icon: <Calendar size={14} color={GOLD} strokeWidth={2.4} />,
              bg: "rgba(255,170,0,.12)",
              border: "rgba(255,170,0,.22)",
              glow: "rgba(255,170,0,.10)",
              onClick: () => {
                if (updatedThisWeek === 0) {
                  toast.info("No uploads in the past 7 days.");
                } else {
                  toast.info(`${updatedThisWeek} syllabus update${updatedThisWeek === 1 ? "" : "s"} in the past 7 days.`);
                }
              },
            },
          ].map((card, i) => (
            <button
              key={i}
              onClick={card.onClick}
              style={{
                background: "#fff",
                borderRadius: 20,
                padding: 16,
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                border: "none",
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -20,
                  right: -16,
                  width: 70,
                  height: 70,
                  background: `radial-gradient(circle, ${card.glow} 0%, transparent 70%)`,
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T4, lineHeight: 1.4, flex: 1, paddingRight: 6 }}>
                  {card.label}
                </div>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: card.bg,
                    border: `0.5px solid ${card.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1, marginBottom: 5, color: card.color }}>
                {card.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: T3 }}>{card.sub}</div>
            </button>
          ))}
        </div>

        {/* SEARCH */}
        <div style={{ margin: "12px 20px 0", display: "flex", gap: 8 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
              <Search size={15} color="rgba(0,85,255,.42)" strokeWidth={2.2} />
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename, title, or teacher..."
              style={{
                width: "100%",
                padding: "12px 14px 12px 42px",
                background: "#fff",
                borderRadius: 14,
                border: "0.5px solid rgba(0,85,255,.12)",
                fontFamily: "inherit",
                fontSize: 13,
                color: T1,
                fontWeight: 400,
                outline: "none",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08), 0 10px 26px rgba(0,85,255,.10)",
              }}
            />
          </div>
        </div>

        {/* FILTERS */}
        <div style={{ display: "flex", gap: 8, padding: "8px 20px 0" }}>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            style={{
              flex: 1,
              padding: "0 12px",
              background: "#fff",
              borderRadius: 14,
              border: "0.5px solid rgba(0,85,255,.12)",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 700,
              color: T2,
              boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
              cursor: "pointer",
              height: 46,
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            <option value="">All Classes</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            style={{
              flex: 1,
              padding: "0 12px",
              background: "#fff",
              borderRadius: 14,
              border: "0.5px solid rgba(0,85,255,.12)",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 700,
              color: T2,
              boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
              cursor: "pointer",
              height: 46,
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            <option value="">All Subjects</option>
            {subjectOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* SECTION LABEL */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: T4,
            padding: "16px 20px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Uploaded Syllabi</span>
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 100,
              background: "rgba(0,85,255,.10)",
              border: "0.5px solid rgba(0,85,255,.16)",
              fontSize: 9,
              fontWeight: 700,
              color: B1,
              textTransform: "none",
              letterSpacing: "0.04em",
            }}
          >
            {filtered.length} document{filtered.length === 1 ? "" : "s"}
          </span>
          <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
        </div>

        {/* ERROR */}
        {error && !loading && (
          <div
            style={{
              margin: "12px 20px 0",
              padding: 14,
              background: "rgba(255,51,85,.08)",
              border: "0.5px solid rgba(255,51,85,.18)",
              borderRadius: 14,
              fontSize: 12,
              color: RED,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {/* LOADING / EMPTY / LIST */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={28} color={B1} style={{ animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              margin: "12px 20px 0",
              background: "#fff",
              borderRadius: 22,
              padding: "32px 20px 28px",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 20,
                background: `linear-gradient(135deg, ${B1}, ${B2})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 0 0 10px rgba(0,85,255,.07)",
                marginBottom: 4,
              }}
            >
              {syllabi.length === 0 ? (
                <Library size={28} color="#fff" strokeWidth={2.2} />
              ) : (
                <FileText size={28} color="#fff" strokeWidth={2.2} />
              )}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T1, letterSpacing: "-0.3px", textAlign: "center" }}>
              {syllabi.length === 0 ? "No syllabi uploaded yet" : "No syllabi match your filters"}
            </div>
            <div style={{ fontSize: 12, color: T3, textAlign: "center", maxWidth: 220, lineHeight: 1.6, fontWeight: 400 }}>
              {syllabi.length === 0
                ? "Teachers can upload syllabi from their own dashboard. They will appear here once uploaded."
                : "Try clearing filters or changing your search."}
            </div>
            {syllabi.length > 0 && (
              <button
                onClick={() => { setClassFilter(""); setSubjectFilter(""); setSearchQuery(""); }}
                style={{
                  marginTop: 6,
                  padding: "9px 18px",
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${B1}, ${B2})`,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 6px 22px rgba(0,85,255,.40)",
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((s, idx) => {
            const title = s.title || `Syllabus - ${s.subject || "General"}`;
            const classLabel = s.className || s.classId || "Class";
            const isRecent = getUploadedAtMs(s.uploadedAt) >= recentThreshold;
            const teacherName = s.uploadedByName || "Unknown";
            const teacherInit = teacherName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={s.id}
                style={{
                  margin: "12px 20px 0",
                  background: "#fff",
                  borderRadius: 24,
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                  border: "0.5px solid rgba(0,85,255,.10)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: stripeFor(idx) }} />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "18px 18px 16px", borderBottom: `0.5px solid ${SEP}`, position: "relative" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "5px 13px",
                        borderRadius: 100,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        flexShrink: 0,
                        background: chipBgFor(idx),
                        color: "#fff",
                        boxShadow: chipShadow(idx),
                      }}
                    >
                      {classLabel}
                    </div>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        background: isRecent ? "rgba(0,200,83,.10)" : "rgba(0,85,255,.10)",
                        border: `0.5px solid ${isRecent ? "rgba(0,200,83,.22)" : "rgba(0,85,255,.18)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title={isRecent ? "Recently uploaded" : "Uploaded"}
                    >
                      {isRecent
                        ? <CheckCircle2 size={16} color={GREEN} strokeWidth={2.3} />
                        : <Clock size={16} color={B1} strokeWidth={2.3} />}
                    </div>
                  </div>

                  <div style={{ flex: 1, paddingLeft: 4, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T1, letterSpacing: "-0.3px", marginBottom: 6, lineHeight: 1.3 }}>
                      {title}
                    </div>

                    <button
                      onClick={() => handleView(s.fileUrl)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "8px 10px",
                        background: "rgba(0,85,255,.05)",
                        borderRadius: 11,
                        border: "0.5px solid rgba(0,85,255,.10)",
                        marginBottom: 8,
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          background: "rgba(255,51,85,.10)",
                          border: "0.5px solid rgba(255,51,85,.18)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <FileText size={12} color={RED} strokeWidth={2.3} />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: T2,
                          letterSpacing: "-0.1px",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.fileName || "file.pdf"}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: T4,
                          flexShrink: 0,
                          background: "#E0ECFF",
                          padding: "2px 7px",
                          borderRadius: 100,
                        }}
                      >
                        {formatFileSize(s.fileSize)}
                      </span>
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 100,
                          background: "#EEF4FF",
                          border: "0.5px solid rgba(0,85,255,.12)",
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            background: `linear-gradient(135deg, ${GREEN}, #22EE66)`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            fontWeight: 700,
                            color: "#fff",
                            flexShrink: 0,
                          }}
                        >
                          {teacherInit}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T2 }}>{teacherName}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: T4 }}>
                        <Clock size={11} strokeWidth={2.3} />
                        {formatRelativeTime(s.uploadedAt)}
                      </div>
                      {s.subject && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 10px",
                            borderRadius: 100,
                            background: "rgba(123,63,244,.10)",
                            border: "0.5px solid rgba(123,63,244,.20)",
                            fontSize: 10,
                            fontWeight: 700,
                            color: VIOLET,
                          }}
                        >
                          <BookOpen size={10} strokeWidth={2.5} />
                          {s.subject}
                        </div>
                      )}
                      {s.academicYear && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 10px",
                            borderRadius: 100,
                            background: "rgba(0,85,255,.10)",
                            border: "0.5px solid rgba(0,85,255,.18)",
                            fontSize: 10,
                            fontWeight: 700,
                            color: B1,
                          }}
                        >
                          <Calendar size={10} strokeWidth={2.5} />
                          {s.academicYear}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, padding: "13px 18px", background: "rgba(238,244,255,.50)" }}>
                  <button
                    onClick={() => handleView(s.fileUrl)}
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      fontSize: 12,
                      fontWeight: 700,
                      background: `linear-gradient(135deg, ${B1}, ${B2})`,
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
                    }}
                  >
                    <Eye size={13} strokeWidth={2.2} />
                    View PDF
                  </button>
                  <button
                    onClick={() => handleDownload(s)}
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      fontSize: 12,
                      fontWeight: 700,
                      background: "rgba(0,200,83,.10)",
                      color: "#007830",
                      border: "0.5px solid rgba(0,200,83,.22)",
                      cursor: "pointer",
                    }}
                  >
                    <Download size={13} strokeWidth={2.2} />
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                    style={{
                      flex: 0.55,
                      height: 42,
                      borderRadius: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      fontSize: 12,
                      fontWeight: 700,
                      background: "rgba(255,51,85,.10)",
                      color: RED,
                      border: "0.5px solid rgba(255,51,85,.22)",
                      cursor: "pointer",
                      opacity: deletingId === s.id ? 0.5 : 1,
                    }}
                    aria-label="Delete syllabus"
                  >
                    {deletingId === s.id
                      ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      : <Trash2 size={13} strokeWidth={2.3} />}
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* AI INSIGHT */}
        {!loading && syllabi.length > 0 && (
          <div
            style={{
              margin: "12px 20px 0",
              background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
              borderRadius: 24,
              padding: "20px 22px",
              boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -36,
                right: -24,
                width: 155,
                height: 155,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 11, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: "rgba(255,255,255,.18)",
                  border: "0.5px solid rgba(255,255,255,.26)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={14} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                AI Syllabus Intelligence
              </span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.72, fontWeight: 400, position: "relative", zIndex: 1 }}>
              <strong style={{ color: "#fff", fontWeight: 700 }}>{totalCount} syllab{totalCount === 1 ? "us" : "i"}</strong> uploaded for{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>{classesCount} class{classesCount === 1 ? "" : "es"}</strong>.{" "}
              Subject coverage at{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>
                {classesCount === 0 ? "0%" : `${Math.min(100, Math.round((subjectsCount / Math.max(1, classesCount)) * 100))}%`}
              </strong>
              {subjectsCount === 0 ? " — no subject tags assigned yet." : "."}
              {lastUploadRel && (
                <>
                  {" "}
                  <strong style={{ color: "#fff", fontWeight: 700 }}>{lastUploadRel.by}</strong> uploaded the latest document{" "}
                  <strong style={{ color: "#fff", fontWeight: 700 }}>{lastUploadRel.rel}</strong>.
                </>
              )}
              {subjectsCount === 0 && " Consider adding subject metadata to improve tracking and student accessibility."}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1,
                background: "rgba(255,255,255,.12)",
                borderRadius: 16,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
                marginTop: 14,
              }}
            >
              {[
                { v: totalCount, l: "Syllabi" },
                { v: classesCount, l: "Classes" },
                { v: lastUploadShort, l: "Last Upload" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "13px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 4 }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 20 }} />
        <span style={{ display: "none" }}>{initials}</span>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP — Blue Apple Design
  // ═══════════════════════════════════════════════════════════════
  const dB1 = "#0055FF", dB2 = "#1166FF", dB4 = "#4499FF";
  const dBG = "#EEF4FF", dBG2 = "#E0ECFF";
  const dT1 = "#001040", dT2 = "#002080", dT3 = "#5070B0", dT4 = "#99AACC";
  const dSEP = "rgba(0,85,255,0.08)";
  const dGREEN = "#00C853", dGREEN_D = "#007830", dGREEN_S = "rgba(0,200,83,0.10)", dGREEN_B = "rgba(0,200,83,0.22)";
  const dRED = "#FF3355";
  const dGOLD = "#FFAA00";
  const dVIOLET = "#7B3FF4";
  const dSH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const dSH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center gap-4 pt-2 pb-5">
        <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
          <Library className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Syllabus</div>
          <div className="text-[12px] mt-1" style={{ color: dT3 }}>View and manage syllabi uploaded by teachers for your branch</div>
        </div>
      </div>

      {/* Dark Hero */}
      <div className="rounded-[22px] px-7 py-6 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <FileText className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>Syllabus Library</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[48px] font-bold leading-none tracking-tight">{loading ? "—" : totalCount}</span>
                <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>total documents</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <Clock className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>Last Upload</div>
                <div className="text-[18px] font-bold leading-none" style={{ letterSpacing: "-0.3px" }}>{lastUploadShort}</div>
              </div>
            </div>
            <div className="w-px h-10" style={{ background: "rgba(255,255,255,0.18)" }} />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <CheckCircle2 className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>This Week</div>
                <div className="text-[22px] font-bold leading-none" style={{ letterSpacing: "-0.5px" }}>{updatedThisWeek}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards — dashboard-style */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        {[
          {
            title: "Total Syllabi", val: totalCount, valColor: dB1,
            sub: totalCount === 0 ? "None uploaded yet" : "Across all classes",
            Icon: Library,
            cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
            tileGrad: `linear-gradient(135deg, ${dB1}, ${dB2})`,
            tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
            decorColor: dB1,
          },
          {
            title: "Classes Covered", val: classesCount, valColor: dVIOLET,
            sub: classesCount === 0 ? "No classes yet" : "With ≥ 1 syllabus",
            Icon: Building2,
            cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            tileGrad: `linear-gradient(135deg, ${dVIOLET}, #A07CF8)`,
            tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
            decorColor: dVIOLET,
          },
          {
            title: "Subjects Covered", val: subjectsCount, valColor: dGREEN_D,
            sub: subjectsCount === 0 ? "No subjects yet" : "Distinct subjects",
            Icon: BookOpen,
            cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
            tileGrad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`,
            tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
            decorColor: dGREEN,
          },
          {
            title: "Updated This Week", val: updatedThisWeek, valColor: dGOLD,
            sub: "Past 7 days",
            Icon: Calendar,
            cardGrad: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
            tileGrad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`,
            tileShadow: "0 4px 14px rgba(255,170,0,0.28)",
            decorColor: dGOLD,
          },
        ].map(({ title, val, valColor, sub, Icon, cardGrad, tileGrad, tileShadow, decorColor }) => (
          <div
            key={title}
            className="rounded-[20px] p-5 relative overflow-hidden"
            style={{ background: cardGrad, boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}
          >
            <div
              className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
              style={{ background: tileGrad, boxShadow: tileShadow }}
            >
              <Icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
            </div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: dT4 }}>{title}</span>
            <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: valColor, letterSpacing: "-1.2px" }}>{val}</p>
            <p className="text-[11px] font-semibold truncate" style={{ color: dT3 }}>{sub}</p>
            <Icon
              className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
              style={{ color: decorColor, opacity: 0.18 }}
              strokeWidth={2}
            />
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 mt-5 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,85,255,0.42)" }} strokeWidth={2.2} />
          <input
            type="text"
            placeholder="Search by filename, title, or teacher…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-11 pr-4 bg-white rounded-[14px] text-[13px] font-medium outline-none"
            style={{ border: `0.5px solid ${dSEP}`, color: dT1, boxShadow: dSH, fontFamily: "inherit" }}
          />
        </div>
        {[
          { value: classFilter, set: setClassFilter, all: "All Classes", opts: classOptions },
          { value: subjectFilter, set: setSubjectFilter, all: "All Subjects", opts: subjectOptions },
        ].map((f, i) => (
          <select key={i}
            value={f.value}
            onChange={(e) => f.set(e.target.value)}
            className="h-11 px-4 pr-10 bg-white rounded-[14px] text-[13px] font-semibold outline-none cursor-pointer appearance-none"
            style={{
              border: `0.5px solid ${dSEP}`,
              color: dT2,
              boxShadow: dSH,
              fontFamily: "inherit",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 14px center",
            }}>
            <option value="">{f.all}</option>
            {f.opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="mt-4 p-4 rounded-[14px] text-[13px] font-medium"
          style={{ background: "rgba(255,51,85,0.06)", border: "0.5px solid rgba(255,51,85,0.20)", color: dRED }}>
          {error}
        </div>
      )}

      {/* Section Label */}
      <div className="flex items-center gap-3 mt-6 mb-3">
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.26)" }}>
          <FileText className="w-4 h-4 text-white" strokeWidth={2.4} />
        </div>
        <div className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Uploaded Syllabi</div>
        <span className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{ background: "rgba(0,85,255,0.10)", color: dB1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
          {filtered.length}
        </span>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="bg-white rounded-[20px] py-16 flex flex-col items-center gap-3" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: dB1 }} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: dT4 }}>Loading syllabi…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[20px] py-20 flex flex-col items-center gap-3 text-center" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.08)", border: `0.5px solid ${dSEP}` }}>
            {syllabi.length === 0 ? (
              <Library className="w-8 h-8" style={{ color: dT4 }} strokeWidth={2} />
            ) : (
              <FileText className="w-8 h-8" style={{ color: dT4 }} strokeWidth={2} />
            )}
          </div>
          {syllabi.length === 0 ? (
            <>
              <p className="text-[14px] font-bold" style={{ color: dT1 }}>No syllabi uploaded yet</p>
              <p className="text-[11px] max-w-[280px]" style={{ color: dT4 }}>Teachers can upload syllabi from their dashboard.</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-bold" style={{ color: dT1 }}>No syllabi match your filters</p>
              <p className="text-[11px] max-w-[280px]" style={{ color: dT4 }}>Try clearing filters or changing your search.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const title = s.title || `Syllabus · ${s.subject || "General"}`;
            const classLabel = s.className || s.classId || "Class";
            return (
              <div key={s.id} className="bg-white rounded-[20px] overflow-hidden flex flex-col relative"
                style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>

                {/* Top header with gradient icon */}
                <div className="flex items-start gap-3 p-5" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                  <div className="w-11 h-11 rounded-[13px] flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.26)" }}>
                    <FileText className="w-5 h-5 text-white" strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] px-[9px] py-[3px] rounded-full"
                        style={{ background: "rgba(0,85,255,0.10)", color: dB1, border: "0.5px solid rgba(0,85,255,0.20)" }}>
                        {classLabel}
                      </span>
                      {s.subject && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em] px-[9px] py-[3px] rounded-full"
                          style={{ background: "rgba(123,63,244,0.10)", color: dVIOLET, border: "0.5px solid rgba(123,63,244,0.22)" }}>
                          {s.subject}
                        </span>
                      )}
                    </div>
                    <h3 className="text-[14px] font-bold leading-tight line-clamp-2" style={{ color: dT1, letterSpacing: "-0.2px" }}>{title}</h3>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: dT3 }}>
                    <FileText className="w-[12px] h-[12px] shrink-0" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.4} />
                    <span className="truncate">{s.fileName || "file.pdf"}</span>
                    <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-full shrink-0"
                      style={{ background: dBG, color: dT2 }}>
                      {formatFileSize(s.fileSize)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: dT3 }}>
                    <div className="w-5 h-5 rounded-[6px] flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})` }}>
                      {(s.uploadedByName || "U").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <span className="truncate" style={{ color: dT2, fontWeight: 600 }}>{s.uploadedByName || "Unknown"}</span>
                    <span className="text-[10px]" style={{ color: dT4 }}>·</span>
                    <span>{formatRelativeTime(s.uploadedAt)}</span>
                  </div>
                  {s.academicYear && (
                    <div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-[9px] py-[3px] rounded-full uppercase tracking-[0.08em]"
                        style={{ background: "rgba(255,170,0,0.10)", color: "#884400", border: "0.5px solid rgba(255,170,0,0.22)" }}>
                        <Calendar className="w-[11px] h-[11px]" strokeWidth={2.4} />
                        {s.academicYear}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-4" style={{ borderTop: `0.5px solid ${dSEP}`, background: dBG }}>
                  <button onClick={() => handleView(s.fileUrl)}
                    className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] font-bold text-white transition-transform hover:scale-[1.02] relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.26)" }}>
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 52%)" }} />
                    <Eye className="w-[13px] h-[13px] relative z-10" strokeWidth={2.3} />
                    <span className="relative z-10">View PDF</span>
                  </button>
                  <button onClick={() => handleDelete(s)} disabled={deletingId === s.id}
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center bg-white disabled:opacity-50 transition-transform hover:scale-[1.04]"
                    style={{ border: `0.5px solid rgba(255,51,85,0.20)`, color: dRED }}
                    title="Delete syllabus">
                    {deletingId === s.id
                      ? <Loader2 className="w-[13px] h-[13px] animate-spin" />
                      : <Trash2 className="w-[13px] h-[13px]" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Intelligence Card */}
      {!loading && totalCount > 0 && lastUploadRel && (
        <div className="mt-5 rounded-[22px] px-7 py-6 relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-2 mb-3 relative z-10">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Sparkles className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Syllabus Intelligence</span>
          </div>
          <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
            Your library has <strong style={{ color: "#fff", fontWeight: 700 }}>{totalCount} syllabi</strong> across <strong style={{ color: "#fff", fontWeight: 700 }}>{classesCount} class{classesCount === 1 ? "" : "es"}</strong> and <strong style={{ color: "#fff", fontWeight: 700 }}>{subjectsCount} subject{subjectsCount === 1 ? "" : "s"}</strong>.
            Latest upload by <strong style={{ color: "#fff", fontWeight: 700 }}>{lastUploadRel.by}</strong> was <strong style={{ color: "#fff", fontWeight: 700 }}>{lastUploadRel.rel}</strong>.
            {updatedThisWeek > 0 && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{updatedThisWeek}</strong> new document{updatedThisWeek === 1 ? "" : "s"} added this week.</>}
          </p>
          <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
            <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: dB4 }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated · Real-time data</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Syllabus;