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