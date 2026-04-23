import {
  Sparkles, Search, AlertTriangle, Plus, Upload, Archive,
  MapPin, GraduationCap, Loader2, ChevronLeft, ChevronRight,
  User as UserIcon, Download, MessageSquare, MoreHorizontal,
  CheckCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ── Palette ───────────────────────────────────────────────────────────────────
const B1 = "#0055FF";
const B2 = "#1166FF";
const B3 = "#2277FF";
const BG = "#EEF4FF";
const BG2 = "#E0ECFF";
const T1 = "#001040";
const T2 = "#002080";
const T3 = "#5070B0";
const T4 = "#99AACC";
const SEP = "rgba(0,85,255,0.07)";
const GREEN = "#00C853";
const RED = "#FF3355";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const GRAD_FAC_ICO = `linear-gradient(135deg, ${B1}, ${B3})`;

const SHADOW_SM = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)";
const SHADOW_LG = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)";
const SHADOW_BTN = "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)";

// Avatar gradient palette — deterministic by initials hash
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

export interface StudentRow {
  id: string;
  name: string;
  email?: string;
  studentEmail?: string;
  initials: string;
  gradeDisplay: string;
  faculty: string;
  attendance: string;
  attPct: number | null;
  status?: string;
  isAtRisk?: boolean;
  branchId?: string;
}

export interface StudentsMobileProps {
  studentsTotal: number;
  loading: boolean;
  searchTerm: string;
  setSearchTerm: (v: string) => void;

  atRiskFilter: boolean;
  atRiskCount: number;
  toggleAtRisk: () => void;

  filteredCount: number;
  paginated: StudentRow[];
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  setCurrentPage: (p: number | ((prev: number) => number)) => void;

  onAddClick: () => void;
  onExportClick: () => void;
  onBulkClick: () => void;
  onArchiveClick: () => void;
  onProfileClick: (s: StudentRow) => void;

  defaultBranchId?: string;

  // Optional aggregate stats — supplied by Students.tsx for accurate strip values
  activeCount?: number;
  avgAttendance?: number | null;
  teachersCount?: number;
  gradesCount?: number;
}

const StudentsMobile = ({
  studentsTotal, loading,
  searchTerm, setSearchTerm,
  atRiskFilter, atRiskCount, toggleAtRisk,
  filteredCount, paginated, currentPage, totalPages, itemsPerPage, setCurrentPage,
  onAddClick, onExportClick, onBulkClick, onArchiveClick, onProfileClick,
  defaultBranchId,
  activeCount, avgAttendance, teachersCount, gradesCount,
}: StudentsMobileProps) => {
  const navigate = useNavigate();

  const pageStart = filteredCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredCount);

  // Fallbacks if parent didn't pass aggregate props — derive from paginated (current page only).
  const activeFallback = paginated.filter(s => (s.status || "Active") === "Active").length;
  const validAtt = paginated.map(s => s.attPct).filter((p): p is number => typeof p === "number");
  const avgAttFallback = validAtt.length > 0 ? Math.round(validAtt.reduce((a, b) => a + b, 0) / validAtt.length) : null;
  const teachersFallback = new Set(paginated.map(s => s.faculty).filter(f => f && f !== "—")).size;
  const gradesFallback = new Set(paginated.map(s => s.gradeDisplay).filter(Boolean)).size;

  const aActive = typeof activeCount === "number" ? activeCount : activeFallback;
  const aAvg = typeof avgAttendance !== "undefined" ? avgAttendance : avgAttFallback;
  const aTeachers = typeof teachersCount === "number" ? teachersCount : teachersFallback;
  const aGrades = typeof gradesCount === "number" ? gradesCount : gradesFallback;

  const goMessages = (s: StudentRow) => {
    navigate("/parent-communication", { state: { studentId: s.id, studentName: s.name } });
  };

  return (
    <div className="pb-6" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}>
      <div className="px-5 pt-3">

        {/* ── Page Head ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight tracking-[-0.6px]" style={{ color: T1 }}>
              Student Directory
            </h1>
            <div className="inline-flex items-center gap-1.5 mt-1 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: B1 }}>
              <Sparkles className="w-[11px] h-[11px]" strokeWidth={2.5} />
              Real-Time Enrollment Audit Engine
            </div>
          </div>
          <div className="flex flex-col items-center px-[14px] py-2 rounded-[16px] flex-shrink-0"
            style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
            <div className="text-[8px] font-bold uppercase tracking-[0.10em] mb-[2px]" style={{ color: T4 }}>Total Scholars</div>
            <div className="text-[22px] font-bold leading-none tracking-[-0.5px]" style={{ color: B1 }}>
              {loading ? "—" : studentsTotal}
            </div>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="mt-3.5 relative">
          <Search
            className="absolute left-[15px] top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "rgba(0,85,255,0.42)" }}
            strokeWidth={2.2}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search roster..."
            className="w-full pl-11 pr-4 py-[13px] rounded-[16px] bg-white text-[14px] font-medium outline-none"
            style={{ color: T1, border: "0.5px solid rgba(0,85,255,0.12)", boxShadow: SHADOW_SM, letterSpacing: "-0.1px" }}
          />
        </div>

        {/* ── Action Row (horizontal scroll) ── */}
        <div className="mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={toggleAtRisk}
            className="h-10 px-[14px] rounded-[13px] flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.04em] whitespace-nowrap flex-shrink-0 transition-transform active:scale-95"
            style={{
              background: atRiskFilter ? RED : "rgba(255,51,85,0.10)",
              color: atRiskFilter ? "#fff" : RED,
              border: `0.5px solid ${atRiskFilter ? RED : "rgba(255,51,85,0.22)"}`,
            }}>
            <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
            AT RISK{atRiskCount > 0 ? ` ${atRiskCount}` : ""}
          </button>

          <button
            onClick={onAddClick}
            className="h-10 px-[18px] rounded-[13px] flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.04em] whitespace-nowrap text-white flex-shrink-0 transition-transform active:scale-95 relative overflow-hidden"
            style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[13px] h-[13px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">ADD SCHOLAR</span>
          </button>

          <button
            onClick={onExportClick}
            className="h-10 px-[14px] rounded-[13px] flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.04em] whitespace-nowrap bg-white flex-shrink-0 transition-transform active:scale-95"
            style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: SHADOW_SM }}>
            <Download className="w-3 h-3" strokeWidth={2.5} />
            EXPORT
          </button>

          <button
            onClick={onBulkClick}
            className="h-10 px-[14px] rounded-[13px] flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.04em] whitespace-nowrap flex-shrink-0 transition-transform active:scale-95"
            style={{ background: "rgba(0,200,83,0.10)", color: "#007830", border: "0.5px solid rgba(0,200,83,0.22)" }}>
            <Upload className="w-3 h-3" strokeWidth={2.5} />
            BULK UPLOAD
          </button>

          <button
            onClick={onArchiveClick}
            className="h-10 px-[14px] rounded-[13px] flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.04em] whitespace-nowrap flex-shrink-0 transition-transform active:scale-95"
            style={{ background: "rgba(255,136,0,0.10)", color: "#884400", border: "0.5px solid rgba(255,136,0,0.22)" }}>
            <Archive className="w-3 h-3" strokeWidth={2.5} />
            ARCHIVE
          </button>
        </div>

        {/* ── Stats Strip ── */}
        <div className="mt-3.5 flex rounded-[20px] overflow-hidden bg-white"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          {[
            { val: loading ? "—" : studentsTotal, label: "Scholars", color: B1 },
            { val: loading ? "—" : aActive, label: "Active", color: "#007830" },
            { val: loading ? "—" : atRiskCount, label: "At Risk", color: RED },
            { val: loading || aAvg === null || typeof aAvg === "undefined" ? "—" : `${aAvg}%`, label: "Avg Attend.", color: "#884400" },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex-1 py-[14px] px-3 flex flex-col items-center gap-1 relative"
              style={i < arr.length - 1 ? { borderRight: "0.5px solid rgba(0,85,255,0.10)" } : {}}>
              <div className="text-[20px] font-bold leading-none tracking-[-0.5px]" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: T4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Section label ── */}
        <div className="pt-4 pb-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
          Scholar Details
          <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
        </div>
      </div>

      {/* ── Body: loading / empty / cards ── */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3" style={{ color: B1 }} />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>
            Loading roster...
          </p>
        </div>
      ) : paginated.length === 0 ? (
        <div className="mx-5 mt-3 rounded-[22px] py-12 px-5 bg-white text-center"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <UserIcon className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
          <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: T3 }}>
            {searchTerm || atRiskFilter ? "No matching scholars" : "No scholars enrolled"}
          </p>
          {(searchTerm || atRiskFilter) && (
            <p className="text-[11px] mt-2" style={{ color: T4 }}>
              Try clearing your search or At Risk filter.
            </p>
          )}
        </div>
      ) : (
        paginated.map(s => {
          const email = s.email || s.studentEmail || "";
          const isActive = (s.status || "Active") === "Active";
          const attValid = s.attendance !== "—" && s.attPct !== null;
          const attGood = s.attPct !== null && s.attPct >= 75;

          return (
            <div key={s.id} className="mx-5 mt-3 rounded-[24px] bg-white overflow-hidden relative transition-transform active:scale-[0.99]"
              style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>

              {/* Top: avatar + name/email + status badge */}
              <div className="flex items-center gap-[14px] px-[18px] pt-[18px] pb-4" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                <div className="w-[50px] h-[50px] rounded-[16px] flex items-center justify-center text-[17px] font-bold text-white flex-shrink-0"
                  style={{ background: avGrad(s.initials || s.name), boxShadow: "0 4px 14px rgba(0,85,255,0.28)" }}>
                  {s.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold uppercase tracking-[-0.3px] truncate" style={{ color: T1 }}>
                    {s.name}
                  </div>
                  <div className="text-[10px] font-semibold tracking-[0.04em] mt-1 flex items-center gap-1 truncate" style={{ color: T4 }}>
                    <span style={{ color: B3, fontWeight: 700 }}>#</span>
                    <span className="truncate">{email || s.id.slice(0, 14)}</span>
                  </div>
                </div>
                <div className="flex flex-shrink-0">
                  {s.isAtRisk ? (
                    <span className="px-3 py-[5px] rounded-full text-[10px] font-bold tracking-[0.04em]"
                      style={{ background: "rgba(255,51,85,0.10)", color: RED, border: "0.5px solid rgba(255,51,85,0.22)" }}>
                      At Risk
                    </span>
                  ) : isActive ? (
                    <span className="px-3 py-[5px] rounded-full text-[10px] font-bold tracking-[0.04em]"
                      style={{ background: "rgba(0,200,83,0.10)", color: "#007830", border: "0.5px solid rgba(0,200,83,0.22)" }}>
                      Active
                    </span>
                  ) : (
                    <span className="px-3 py-[5px] rounded-full text-[10px] font-bold tracking-[0.04em]"
                      style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.20)" }}>
                      Invited
                    </span>
                  )}
                </div>
              </div>

              {/* Meta grid 2×2 */}
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="px-4 py-[13px] flex flex-col gap-[3px]" style={{ borderRight: `0.5px solid ${SEP}`, borderBottom: `0.5px solid ${SEP}` }}>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Campus Branch</div>
                  <div className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: T1, letterSpacing: "-0.1px" }}>
                    <MapPin className="w-3 h-3" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
                    {s.branchId || defaultBranchId || "—"}
                  </div>
                </div>
                <div className="px-4 py-[13px] flex flex-col gap-[3px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Institutional Grade</div>
                  <div className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: T1 }}>
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white"
                      style={{ background: GRAD_PRIMARY, boxShadow: "0 2px 7px rgba(0,85,255,0.28)" }}>
                      {s.gradeDisplay || "—"}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-[13px] flex flex-col gap-[3px]" style={{ borderRight: `0.5px solid ${SEP}` }}>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Assigned Faculty</div>
                  <div className="text-[13px] font-bold flex items-center gap-1.5 min-w-0" style={{ color: T1, letterSpacing: "-0.1px" }}>
                    <div className="w-5 h-5 rounded-[6px] flex items-center justify-center flex-shrink-0"
                      style={{ background: GRAD_FAC_ICO }}>
                      <GraduationCap className="w-[11px] h-[11px] text-white" strokeWidth={2.3} />
                    </div>
                    <span className="truncate">{s.faculty || "—"}</span>
                  </div>
                </div>
                <div className="px-4 py-[13px] flex flex-col gap-[3px]">
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Attendance</div>
                  <div className="text-[13px] font-bold flex items-center gap-1.5"
                    style={{ color: attValid ? (attGood ? "#007830" : RED) : T4, letterSpacing: "-0.1px" }}>
                    <CheckCircle className="w-3 h-3" strokeWidth={2.5}
                      style={{ color: attValid ? (attGood ? GREEN : RED) : T4 }} />
                    {s.attendance}
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-[10px] px-[18px] py-[14px]" style={{ background: "rgba(238,244,255,0.50)" }}>
                <button
                  onClick={() => onProfileClick(s)}
                  className="flex-1 h-11 rounded-[14px] flex items-center justify-center gap-[7px] text-[13px] font-bold text-white tracking-[0.04em] transition-transform active:scale-95 relative overflow-hidden"
                  style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
                  <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                  <UserIcon className="w-[14px] h-[14px] relative z-10" strokeWidth={2.2} />
                  <span className="relative z-10">View Profile</span>
                </button>
                <button
                  onClick={() => goMessages(s)}
                  aria-label={`Message ${s.name}`}
                  className="w-11 h-11 rounded-[14px] flex items-center justify-center bg-white flex-shrink-0 transition-transform active:scale-90"
                  style={{ border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SHADOW_SM }}>
                  <MessageSquare className="w-[15px] h-[15px]" style={{ color: "rgba(0,85,255,0.7)" }} strokeWidth={2.2} />
                </button>
                <button
                  onClick={() => onProfileClick(s)}
                  aria-label={`More options for ${s.name}`}
                  className="w-11 h-11 rounded-[14px] flex items-center justify-center bg-white flex-shrink-0 transition-transform active:scale-90"
                  style={{ border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SHADOW_SM }}>
                  <MoreHorizontal className="w-[15px] h-[15px]" style={{ color: "rgba(0,85,255,0.7)" }} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* ── Pagination ── */}
      {!loading && filteredCount > itemsPerPage && (
        <div className="mx-5 mt-3 px-[18px] py-3 rounded-[18px] bg-white flex items-center justify-between gap-2"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T4 }}>
            {pageStart}–{pageEnd} of {filteredCount}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg disabled:opacity-30 transition-transform active:scale-95"
              style={{ border: "0.5px solid rgba(0,85,255,0.12)", background: BG2 }}
              aria-label="Previous page">
              <ChevronLeft className="w-[14px] h-[14px]" style={{ color: T2 }} />
            </button>
            <span className="text-[11px] font-bold px-2" style={{ color: T1 }}>
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg disabled:opacity-30 transition-transform active:scale-95"
              style={{ border: "0.5px solid rgba(0,85,255,0.12)", background: BG2 }}
              aria-label="Next page">
              <ChevronRight className="w-[14px] h-[14px]" style={{ color: T2 }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Enrollment summary dark card ── */}
      {!loading && studentsTotal > 0 && (
        <div className="mx-5 mt-3.5 rounded-[24px] px-[22px] py-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}>
          <div className="absolute -top-9 -right-6 w-[160px] h-[160px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] mb-3 relative z-10" style={{ color: "rgba(255,255,255,0.48)" }}>
            Enrollment Registry · Academic Year {new Date().getFullYear()}–{String(new Date().getFullYear() + 1).slice(2)}
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[16px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: studentsTotal, label: "Scholars" },
              { val: aTeachers, label: "Teachers" },
              { val: aGrades, label: "Grades" },
            ].map(({ val, label }) => (
              <div key={label} className="py-[14px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[24px] font-bold text-white leading-none mb-1" style={{ letterSpacing: "-0.7px" }}>{val}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default StudentsMobile;