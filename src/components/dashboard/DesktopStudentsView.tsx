import {
  Sparkles, Search, AlertTriangle, Plus, Upload, Archive,
  MapPin, GraduationCap, Loader2, ChevronLeft, ChevronRight,
  User as UserIcon, Download, MessageSquare, MoreHorizontal,
  CheckCircle, X,
} from "lucide-react";
import { tilt3D, tilt3DProfile, tilt3DStyle } from "@/lib/use3DTilt";

// ── Palette ───────────────────────────────────────────────────────────────────
const B1 = "#0055FF";
const B2 = "#1166FF";
const B3 = "#2277FF";
const BG = "#EEF4FF";
const BG2 = "#E0ECFF";
const T1 = "#001040";
const T2 = "#002080";
const T4 = "#99AACC";
const SEP = "rgba(0,85,255,0.07)";
const GREEN = "#00C853";
const RED = "#FF3355";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const GRAD_FAC_ICO = `linear-gradient(135deg, ${B1}, ${B3})`;

// Soft uniform blue halo — dimmed per user; applied to every card across
// Dashboard, Students, and StudentIntelligence.
const SHADOW_SM = "0 0 0 .5px rgba(0,85,255,.09), 0 2px 10px rgba(0,85,255,.10), 0 10px 26px rgba(0,85,255,.12)";
const SHADOW_LG = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)";
const SHADOW_BTN = "0 5px 18px rgba(0,85,255,.34), 0 2px 5px rgba(0,85,255,.18)";

const AV_PALETTE = [
  "linear-gradient(135deg, #0044EE, #2277FF)",
  "linear-gradient(135deg, #002DBB, #0055FF)",
  "linear-gradient(135deg, #1A3090, #2277FF)",
  "linear-gradient(135deg, #0066FF, #4499FF)",
  "linear-gradient(135deg, #002080, #0044EE)",
  "linear-gradient(135deg, #0055FF, #66BBFF)",
];
const avGrad = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) & 0xff;
  return AV_PALETTE[h % AV_PALETTE.length];
};

interface DesktopStudentsViewProps {
  studentsData: any[];
  paginated: any[];
  filtered: any[];
  loading: boolean;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  atRiskFilter: boolean;
  atRiskCount: number;
  setAtRiskFilter: (fn: (prev: boolean) => boolean) => void;
  classFilter: string;
  setClassFilter: (v: string) => void;
  classOptions: string[];
  currentPage: number;
  setCurrentPage: (p: number | ((prev: number) => number)) => void;
  totalPages: number;
  itemsPerPage: number;
  onAdd: () => void;
  onExport: () => void;
  onBulk: () => void;
  onArchive: () => void;
  onProfileClick: (s: any) => void;
  onMessageClick: (s: any) => void;
  defaultBranchId?: string;
}

const DesktopStudentsView = ({
  studentsData, paginated, filtered, loading,
  searchTerm, setSearchTerm,
  atRiskFilter, atRiskCount, setAtRiskFilter,
  classFilter, setClassFilter, classOptions,
  currentPage, setCurrentPage, totalPages, itemsPerPage,
  onAdd, onExport, onBulk, onArchive,
  onProfileClick, onMessageClick,
  defaultBranchId,
}: DesktopStudentsViewProps) => {
  const activeCount = studentsData.filter((s: any) => (s.status || "Active") === "Active").length;
  const _validAtt = studentsData
    .map((s: any) => s.attPct)
    .filter((p: any): p is number => typeof p === "number");
  const avgAttendance = _validAtt.length > 0
    ? Math.round(_validAtt.reduce((a: number, b: number) => a + b, 0) / _validAtt.length)
    : null;
  const teachersCount = new Set(
    studentsData.map((s: any) => s.faculty).filter((f: any) => f && f !== "—")
  ).size;
  const gradesCount = new Set(
    studentsData.map((s: any) => s.gradeDisplay).filter(Boolean)
  ).size;

  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const pageEnd = Math.min(currentPage * itemsPerPage, filtered.length);

  const groupedByClass = paginated.reduce<Record<string, any[]>>((acc, s) => {
    const key = s.gradeDisplay || "—";
    (acc[key] = acc[key] || []).push(s);
    return acc;
  }, {});
  const groupOrder = Object.keys(groupedByClass).sort();

  return (
    <div
      style={{
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        background: BG,
        minHeight: "100vh",
        margin: "-16px -24px 0",
        padding: "20px 28px 40px",
      }}
    >
      {/* ── Page Head ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: T1, letterSpacing: "-0.8px", margin: 0, lineHeight: 1.1 }}>
            Student Directory
          </h1>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: B1,
            }}
          >
            <Sparkles size={12} strokeWidth={2.5} />
            Real-Time Enrollment Audit Engine
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "10px 22px",
            borderRadius: 18,
            background: "rgba(0,85,255,0.08)",
            border: "0.5px solid rgba(0,85,255,0.18)",
            boxShadow: "0 0 0 .5px rgba(0,85,255,.06), 0 2px 10px rgba(0,85,255,.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T4, marginBottom: 3 }}>
            Total Scholars
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: B1, letterSpacing: "-0.6px", lineHeight: 1 }}>
            {loading ? "—" : studentsData.length}
          </div>
        </div>
      </div>

      {/* ── Search + Action Row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 320, maxWidth: 560 }}>
          <Search
            size={16}
            color="rgba(0,85,255,0.42)"
            strokeWidth={2.2}
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Student"
            style={{
              width: "100%",
              padding: "14px 18px 14px 46px",
              borderRadius: 16,
              background: "#fff",
              fontSize: 14,
              fontWeight: 500,
              color: T1,
              outline: "none",
              border: "0.5px solid rgba(0,85,255,0.12)",
              boxShadow: SHADOW_SM,
              letterSpacing: "-0.1px",
              fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <select
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setCurrentPage(1); }}
            style={{
              height: 44,
              padding: "0 38px 0 36px",
              borderRadius: 14,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
              background: classFilter !== "ALL" ? B1 : "rgba(0,85,255,0.10)",
              color: classFilter !== "ALL" ? "#fff" : B1,
              border: `0.5px solid ${classFilter !== "ALL" ? B1 : "rgba(0,85,255,0.22)"}`,
              outline: "none",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
            }}
          >
            <option value="ALL">All Classes</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <GraduationCap
            size={14}
            strokeWidth={2.4}
            color={classFilter !== "ALL" ? "#fff" : B1}
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <ChevronRight
            size={13}
            strokeWidth={2.6}
            color={classFilter !== "ALL" ? "#fff" : B1}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%) rotate(90deg)", pointerEvents: "none" }}
          />
        </div>

        <button
          onClick={() => { setAtRiskFilter((f: boolean) => !f); setCurrentPage(1); }}
          style={{
            height: 44,
            padding: "0 18px",
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "inherit",
            background: atRiskFilter ? RED : "rgba(255,51,85,0.10)",
            color: atRiskFilter ? "#fff" : RED,
            border: `0.5px solid ${atRiskFilter ? RED : "rgba(255,51,85,0.22)"}`,
            transition: "transform .15s",
          }}
        >
          <AlertTriangle size={13} strokeWidth={2.5} />
          AT RISK{atRiskCount > 0 ? ` ${atRiskCount}` : ""}
        </button>

        {(searchTerm || classFilter !== "ALL" || atRiskFilter) && (
          <button
            onClick={() => {
              setSearchTerm("");
              setClassFilter("ALL");
              setAtRiskFilter(() => false);
              setCurrentPage(1);
            }}
            style={{
              height: 44,
              padding: "0 16px",
              borderRadius: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
              background: "#fff",
              color: T2,
              border: "0.5px solid rgba(0,85,255,0.16)",
              boxShadow: SHADOW_SM,
            }}
          >
            <X size={13} strokeWidth={2.6} />
            Reset
          </button>
        )}

        <button
          onClick={onAdd}
          style={{
            height: 44,
            padding: "0 22px",
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#fff",
            background: GRAD_PRIMARY,
            boxShadow: SHADOW_BTN,
            border: "none",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            fontFamily: "inherit",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)",
              pointerEvents: "none",
            }}
          />
          <Plus size={14} strokeWidth={2.5} style={{ position: "relative", zIndex: 1 }} />
          <span style={{ position: "relative", zIndex: 1 }}>ADD SCHOLAR</span>
        </button>

        <button
          onClick={onExport}
          style={{
            height: 44,
            padding: "0 18px",
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            background: "#fff",
            color: T2,
            border: "0.5px solid rgba(0,85,255,0.14)",
            boxShadow: SHADOW_SM,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Download size={13} strokeWidth={2.5} />
          EXPORT
        </button>

        <button
          onClick={onBulk}
          style={{
            height: 44,
            padding: "0 18px",
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            background: "rgba(0,200,83,0.10)",
            color: "#007830",
            border: "0.5px solid rgba(0,200,83,0.22)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Upload size={13} strokeWidth={2.5} />
          BULK UPLOAD
        </button>

        <button
          onClick={onArchive}
          style={{
            height: 44,
            padding: "0 18px",
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            background: "rgba(255,136,0,0.10)",
            color: "#884400",
            border: "0.5px solid rgba(255,136,0,0.22)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Archive size={13} strokeWidth={2.5} />
          ARCHIVE
        </button>
      </div>

      {/* ── Stats Strip ── */}
      <div style={{ perspective: "1200px", marginBottom: 18 }}>
      <div
        {...tilt3D}
        style={{
          display: "flex",
          borderRadius: 20,
          overflow: "hidden",
          background: "#fff",
          boxShadow: SHADOW_LG,
          border: "0.5px solid rgba(0,85,255,0.10)",
          position: "relative",
          ...tilt3DStyle,
        }}
      >
        <div data-glow style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, transition: "opacity 0.3s" }} />
        {[
          { val: loading ? "—" : studentsData.length, label: "Scholars", color: B1 },
          { val: loading ? "—" : activeCount, label: "Active", color: "#007830" },
          { val: loading ? "—" : atRiskCount, label: "At Risk", color: RED },
          {
            val: loading || avgAttendance === null ? "—" : `${avgAttendance}%`,
            label: "Avg Attendance",
            color: "#884400",
          },
        ].map((s, i, arr) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              padding: "18px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              borderRight: i < arr.length - 1 ? "0.5px solid rgba(0,85,255,0.10)" : "none",
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: "-0.7px", lineHeight: 1 }}>
              {s.val}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
      </div>

      {/* ── Section label ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: T4,
          marginBottom: 12,
        }}
      >
        Scholar Details
        <div style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* ── Body: loading / empty / cards grid ── */}
      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <Loader2 size={32} color={B1} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T4, margin: 0 }}>
            Loading roster...
          </p>
        </div>
      ) : paginated.length === 0 ? (
        <div
          style={{
            padding: "60px 24px",
            borderRadius: 24,
            background: "#fff",
            textAlign: "center",
            boxShadow: SHADOW_SM,
            border: "0.5px solid rgba(0,85,255,0.10)",
          }}
        >
          <UserIcon size={48} color="rgba(0,85,255,0.22)" strokeWidth={1.8} style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5070B0", margin: 0 }}>
            {searchTerm || atRiskFilter ? "No matching scholars" : "No scholars enrolled"}
          </p>
          {(searchTerm || atRiskFilter) && (
            <p style={{ fontSize: 12, color: T4, marginTop: 8 }}>
              Try clearing your search or At Risk filter.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {groupOrder.map((cls) => (
            <div key={cls}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                  padding: "0 4px",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 14px",
                    borderRadius: 12,
                    background: "rgba(0,85,255,0.10)",
                    border: "0.5px solid rgba(0,85,255,0.18)",
                    color: B1,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  <GraduationCap size={13} strokeWidth={2.4} />
                  {cls}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: T4,
                  }}
                >
                  {groupedByClass[cls].length} {groupedByClass[cls].length === 1 ? "Scholar" : "Scholars"}
                </span>
                <div style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,0.10)" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, perspective: "1200px" }}>
                {groupedByClass[cls].map((s: any) => {
            const email = s.email || s.studentEmail || "";
            const isActive = (s.status || "Active") === "Active";
            const attValid = s.attendance !== "—" && s.attPct !== null;
            const attGood = s.attPct !== null && s.attPct >= 75;

            return (
              <div
                key={s.id}
                {...tilt3DProfile}
                style={{
                  borderRadius: 24,
                  background: "#fff",
                  overflow: "hidden",
                  position: "relative",
                  boxShadow: SHADOW_LG,
                  border: "0.5px solid rgba(0,85,255,0.10)",
                  ...tilt3DStyle,
                }}
              >
                <div data-glow style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, transition: "opacity 0.3s", zIndex: 0 }} />
                {/* Top: avatar + name/email + status badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "18px 20px 14px",
                    borderBottom: `0.5px solid ${SEP}`,
                  }}
                >
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 17,
                      background: avGrad(s.initials || s.name),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                      boxShadow: "0 4px 14px rgba(0,85,255,0.28)",
                    }}
                  >
                    {s.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 700,
                        color: T1,
                        letterSpacing: "-0.3px",
                        textTransform: "uppercase",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: T4,
                        letterSpacing: "0.04em",
                        marginTop: 4,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ color: B3, fontWeight: 700 }}>#</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {email || s.id.slice(0, 20)}
                      </span>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {s.isAtRisk ? (
                      <span
                        style={{
                          padding: "6px 14px",
                          borderRadius: 100,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          background: "rgba(255,51,85,0.10)",
                          color: RED,
                          border: "0.5px solid rgba(255,51,85,0.22)",
                        }}
                      >
                        At Risk
                      </span>
                    ) : isActive ? (
                      <span
                        style={{
                          padding: "6px 14px",
                          borderRadius: 100,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          background: "rgba(0,200,83,0.10)",
                          color: "#007830",
                          border: "0.5px solid rgba(0,200,83,0.22)",
                        }}
                      >
                        Active
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: "6px 14px",
                          borderRadius: 100,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          background: "rgba(0,85,255,0.10)",
                          color: B1,
                          border: "0.5px solid rgba(0,85,255,0.20)",
                        }}
                      >
                        Invited
                      </span>
                    )}
                  </div>
                </div>

                {/* Meta grid 2×2 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  <div
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      borderRight: `0.5px solid ${SEP}`,
                      borderBottom: `0.5px solid ${SEP}`,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
                      Campus Branch
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T1, display: "flex", alignItems: "center", gap: 7, letterSpacing: "-0.1px" }}>
                      <MapPin size={13} color="rgba(0,85,255,0.6)" strokeWidth={2.3} />
                      {s.branchId || defaultBranchId || "—"}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      borderBottom: `0.5px solid ${SEP}`,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
                      Institutional Grade
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                      <span
                        style={{
                          padding: "4px 14px",
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#fff",
                          background: GRAD_PRIMARY,
                          boxShadow: "0 2px 7px rgba(0,85,255,0.28)",
                        }}
                      >
                        {s.gradeDisplay || "—"}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      borderRight: `0.5px solid ${SEP}`,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
                      Assigned Faculty
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: T1,
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        minWidth: 0,
                        letterSpacing: "-0.1px",
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 7,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          background: GRAD_FAC_ICO,
                        }}
                      >
                        <GraduationCap size={12} color="#fff" strokeWidth={2.3} />
                      </div>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.faculty || "—"}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
                      Attendance
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: attValid ? (attGood ? "#007830" : RED) : T4,
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        letterSpacing: "-0.1px",
                      }}
                    >
                      <CheckCircle
                        size={13}
                        strokeWidth={2.5}
                        color={attValid ? (attGood ? GREEN : RED) : T4}
                      />
                      {s.attendance}
                    </div>
                  </div>
                </div>

                {/* Action bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 18px",
                    background: "rgba(238,244,255,0.50)",
                  }}
                >
                  <button
                    onClick={() => onProfileClick(s)}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#fff",
                      letterSpacing: "0.04em",
                      background: GRAD_PRIMARY,
                      boxShadow: SHADOW_BTN,
                      border: "none",
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                      fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)",
                        pointerEvents: "none",
                      }}
                    />
                    <UserIcon size={14} strokeWidth={2.2} style={{ position: "relative", zIndex: 1 }} />
                    <span style={{ position: "relative", zIndex: 1 }}>View Profile</span>
                  </button>
                  <button
                    onClick={() => onMessageClick(s)}
                    aria-label={`Message ${s.name}`}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#fff",
                      border: "0.5px solid rgba(0,85,255,0.16)",
                      boxShadow: SHADOW_SM,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <MessageSquare size={15} color="rgba(0,85,255,0.7)" strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={() => onProfileClick(s)}
                    aria-label={`More options for ${s.name}`}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#fff",
                      border: "0.5px solid rgba(0,85,255,0.16)",
                      boxShadow: SHADOW_SM,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <MoreHorizontal size={15} color="rgba(0,85,255,0.7)" strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && filtered.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: "14px 22px",
            borderRadius: 18,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            boxShadow: SHADOW_SM,
            border: "0.5px solid rgba(0,85,255,0.10)",
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, margin: 0 }}>
            Showing {pageStart}–{pageEnd} of {filtered.length} {filtered.length === 1 ? "Student" : "Students"}
          </p>
          {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              style={{
                padding: 8,
                borderRadius: 10,
                border: "0.5px solid rgba(0,85,255,0.12)",
                background: BG2,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.3 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} color={T2} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const page = currentPage <= 4 ? i + 1 : currentPage - 3 + i;
              if (page > totalPages) return null;
              const active = currentPage === page;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    fontSize: 12,
                    fontWeight: 700,
                    color: active ? "#fff" : T4,
                    background: active ? GRAD_PRIMARY : "#fff",
                    border: active ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,0.12)",
                    boxShadow: active ? SHADOW_BTN : "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {page}
                </button>
              );
            })}
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: 8,
                borderRadius: 10,
                border: "0.5px solid rgba(0,85,255,0.12)",
                background: BG2,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.3 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Next page"
            >
              <ChevronRight size={15} color={T2} />
            </button>
          </div>
          )}
        </div>
      )}

      {/* ── Enrollment Registry dark card ── */}
      {!loading && studentsData.length > 0 && (
        <div style={{ marginTop: 14, perspective: "1200px" }}>
        <div
          {...tilt3D}
          style={{
            padding: "22px 26px",
            borderRadius: 24,
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.14)",
            ...tilt3DStyle,
          }}
        >
          <div data-glow style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, transition: "opacity 0.3s" }} />
          <div
            style={{
              position: "absolute",
              top: -40,
              right: -30,
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.48)",
              marginBottom: 14,
              position: "relative",
              zIndex: 1,
            }}
          >
            Enrollment Registry · Academic Year {new Date().getFullYear()}–{String(new Date().getFullYear() + 1).slice(2)}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              borderRadius: 16,
              overflow: "hidden",
              background: "rgba(255,255,255,0.12)",
              position: "relative",
              zIndex: 1,
            }}
          >
            {[
              { val: studentsData.length, label: "Scholars" },
              { val: teachersCount, label: "Teachers" },
              { val: gradesCount, label: "Grades" },
            ].map(({ val, label }) => (
              <div
                key={label}
                style={{
                  padding: "16px 14px",
                  textAlign: "center",
                  background: "rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1, marginBottom: 4, letterSpacing: "-0.8px" }}>
                  {val}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.40)",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      )}
    </div>
  );
};

export default DesktopStudentsView;