import {
  Star, Search, AlertTriangle, Plus, Upload, Archive,
  MapPin, GraduationCap, Loader2, ChevronLeft, ChevronRight,
  User as UserIcon, Download,
} from "lucide-react";

// ── Palette (from the new mockup) ──────────────────────────────────────────
const B1 = "#0055FF";
const B2 = "#1166FF";
const B3 = "#2277FF";
const T1 = "#001040";
const T2 = "#002080";
const T4 = "#99AACC";
const GREEN = "#00C853";
const RED = "#FF3355";
const ORANGE = "#FF8800";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const GRAD_HEADER = `linear-gradient(135deg, ${B1}, ${B2})`;
const GRAD_FAC_ICO = `linear-gradient(135deg, ${B1}, ${B3})`;

const SHADOW_SM = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)";
const SHADOW_LG = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)";
const SHADOW_BTN = "0 6px 20px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.22)";

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
}

const StudentsMobile = ({
  studentsTotal, loading,
  searchTerm, setSearchTerm,
  atRiskFilter, atRiskCount, toggleAtRisk,
  filteredCount, paginated, currentPage, totalPages, itemsPerPage, setCurrentPage,
  onAddClick, onExportClick, onBulkClick, onArchiveClick, onProfileClick,
  defaultBranchId,
}: StudentsMobileProps) => {
  const pageStart = filteredCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredCount);

  // Top 2 students for avatar pills on the Total Scholars card
  const topAvatars = paginated.slice(0, 2);

  return (
    <div className="pb-6" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* ── Page head ── */}
      <div className="pt-2">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.7px]" style={{ color: T1 }}>
          Student Directory
        </h1>
        <div
          className="inline-flex items-center gap-1.5 mt-1 text-[9px] font-bold uppercase tracking-[0.10em]"
          style={{ color: B1 }}
        >
          <Star className="w-3.5 h-3.5" strokeWidth={2.2} />
          Real-Time Enrollment Audit Engine
        </div>
      </div>

      {/* ── Total Scholars card ── */}
      <div
        className="mt-3.5 rounded-[20px] px-5 py-4 flex items-center justify-between relative overflow-hidden bg-white"
        style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}
      >
        <div
          className="pointer-events-none absolute -right-5 -top-7 w-[120px] h-[120px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,85,255,0.07) 0%, transparent 70%)" }}
        />
        <div className="relative">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: T4 }}>
            Total Scholars
          </div>
          <div className="text-[42px] font-bold leading-none tracking-[-1.5px]" style={{ color: B1 }}>
            {loading ? "—" : studentsTotal.toLocaleString()}
          </div>
        </div>
        {topAvatars.length > 0 && (
          <div className="relative flex items-center">
            {topAvatars.map((s, i) => (
              <div
                key={s.id}
                className="w-9 h-9 rounded-[12px] flex items-center justify-center text-[13px] font-bold text-white border-2 border-white"
                style={{
                  background: avGrad(s.initials || s.name),
                  marginLeft: i === 0 ? 0 : -10,
                  boxShadow: "0 2px 8px rgba(0,85,255,0.28)",
                }}
              >
                {s.initials}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Search ── */}
      <div className="mt-3 relative">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] pointer-events-none"
          style={{ color: "rgba(0,85,255,0.4)" }}
          strokeWidth={2.2}
        />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search roster..."
          className="w-full pl-10 pr-4 py-3 rounded-[16px] bg-white text-sm font-medium outline-none"
          style={{
            color: T1,
            border: "0.5px solid rgba(0,85,255,0.12)",
            boxShadow: SHADOW_SM,
          }}
        />
      </div>

      {/* ── Action row: At Risk / Add Scholar / Export ── */}
      <div className="mt-3 flex gap-2 items-center">
        <button
          onClick={toggleAtRisk}
          className="h-11 rounded-[14px] flex items-center justify-center gap-1.5 text-[12px] font-bold tracking-[0.04em] whitespace-nowrap transition-transform active:scale-95"
          style={{
            flex: 0.8,
            background: atRiskFilter ? RED : "rgba(255,51,85,0.10)",
            color: atRiskFilter ? "#fff" : RED,
            border: `0.5px solid ${atRiskFilter ? RED : "rgba(255,51,85,0.22)"}`,
          }}
        >
          <AlertTriangle className="w-[13px] h-[13px]" strokeWidth={2.5} />
          AT RISK{atRiskCount > 0 ? ` ${atRiskCount}` : ""}
        </button>

        <button
          onClick={onAddClick}
          className="h-11 rounded-[14px] flex items-center justify-center gap-1.5 text-[12px] font-bold tracking-[0.04em] whitespace-nowrap text-white transition-transform active:scale-95"
          style={{
            flex: 1.4,
            background: GRAD_PRIMARY,
            border: "0.5px solid rgba(255,255,255,0.15)",
            boxShadow: SHADOW_BTN,
          }}
        >
          <Plus className="w-[14px] h-[14px]" strokeWidth={2.5} />
          ADD SCHOLAR
        </button>

        <button
          onClick={onExportClick}
          className="h-11 rounded-[14px] flex items-center justify-center gap-1.5 text-[12px] font-bold tracking-[0.04em] whitespace-nowrap bg-white transition-transform active:scale-95"
          style={{
            flex: 0.8,
            color: T2,
            border: "0.5px solid rgba(0,85,255,0.14)",
            boxShadow: SHADOW_SM,
          }}
        >
          <Download className="w-[13px] h-[13px]" strokeWidth={2.5} />
          EXPORT
        </button>
      </div>

      {/* ── Sub row: Bulk Upload / Archive Year ── */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onBulkClick}
          className="flex-1 h-10 rounded-[14px] bg-white flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          style={{ border: "0.5px solid rgba(0,85,255,0.10)", boxShadow: SHADOW_SM }}
        >
          <Upload className="w-[13px] h-[13px]" strokeWidth={2.5} style={{ color: GREEN }} />
          <span className="text-[11px] font-bold tracking-[0.04em]" style={{ color: GREEN }}>
            BULK UPLOAD
          </span>
        </button>
        <button
          onClick={onArchiveClick}
          className="flex-1 h-10 rounded-[14px] bg-white flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          style={{ border: "0.5px solid rgba(0,85,255,0.10)", boxShadow: SHADOW_SM }}
        >
          <Archive className="w-[13px] h-[13px]" strokeWidth={2.5} style={{ color: ORANGE }} />
          <span className="text-[11px] font-bold tracking-[0.04em]" style={{ color: ORANGE }}>
            ARCHIVE YEAR
          </span>
        </button>
      </div>

      {/* ── Table card ── */}
      <div
        className="mt-3.5 rounded-[22px] bg-white overflow-hidden"
        style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}
      >
        {/* Horizontal scroll wrapper */}
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-w-[780px]">

            {/* Header row */}
            <div
              className="grid gap-3 px-4 py-3 relative overflow-hidden"
              style={{
                gridTemplateColumns: "200px 90px 90px 120px 90px 90px 100px",
                background: GRAD_HEADER,
              }}
            >
              <div
                className="pointer-events-none absolute -top-5 -right-2.5 w-20 h-20 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }}
              />
              <span className="text-[9px] font-bold uppercase tracking-[0.09em] relative" style={{ color: "rgba(255,255,255,0.60)" }}>Scholar Details</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.09em] relative" style={{ color: "rgba(255,255,255,0.60)" }}>Campus</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.09em] relative" style={{ color: "rgba(255,255,255,0.60)" }}>Grade</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.09em] relative" style={{ color: "rgba(255,255,255,0.60)" }}>Faculty</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.09em] relative" style={{ color: "rgba(255,255,255,0.60)" }}>Attendance</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.09em] relative" style={{ color: "rgba(255,255,255,0.60)" }}>Identity</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.09em] relative" style={{ color: "rgba(255,255,255,0.60)" }}>Action</span>
            </div>

            {/* Body */}
            <div>
              {loading ? (
                <div className="py-16 text-center">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3" style={{ color: B1 }} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>
                    Loading roster...
                  </p>
                </div>
              ) : paginated.length === 0 ? (
                <div className="py-16 text-center">
                  <UserIcon className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(0,85,255,0.15)" }} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>
                    {searchTerm ? "No search results" : "No scholars found"}
                  </p>
                </div>
              ) : (
                paginated.map(s => {
                  const email = s.email || s.studentEmail || "";
                  const isActive = (s.status || "Active") === "Active";
                  const attValid = s.attendance !== "—" && s.attPct !== null;
                  const attGood = s.attPct !== null && s.attPct >= 75;
                  return (
                    <div
                      key={s.id}
                      onClick={() => onProfileClick(s)}
                      className="grid gap-3 px-4 py-3.5 items-center cursor-pointer active:bg-[#EEF4FF] transition-colors"
                      style={{
                        gridTemplateColumns: "200px 90px 90px 120px 90px 90px 100px",
                        borderBottom: "0.5px solid rgba(0,85,255,0.07)",
                      }}
                    >
                      {/* Scholar Details */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-[38px] h-[38px] rounded-[13px] flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                          style={{
                            background: avGrad(s.initials || s.name),
                            boxShadow: "0 2px 8px rgba(0,85,255,0.22)",
                          }}
                        >
                          {s.initials}
                        </div>
                        <div className="min-w-0">
                          <div
                            className="text-[12px] font-bold leading-tight uppercase tracking-[-0.1px] truncate"
                            style={{ color: T1 }}
                          >
                            {s.name}
                          </div>
                          <div className="text-[9px] font-semibold mt-0.5 flex items-center gap-1 truncate" style={{ color: T4 }}>
                            <span style={{ color: B3, fontWeight: 700 }}>#</span>
                            <span className="truncate">{email || s.id.slice(0, 10)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Campus */}
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" strokeWidth={2.2} style={{ color: B1 }} />
                        <span className="text-[11px] font-bold truncate" style={{ color: T2 }}>
                          {s.branchId || defaultBranchId || "Main"}
                        </span>
                      </div>

                      {/* Grade */}
                      <div>
                        <span
                          className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-bold text-white tracking-[0.02em]"
                          style={{
                            background: GRAD_PRIMARY,
                            boxShadow: "0 2px 8px rgba(0,85,255,0.28)",
                          }}
                        >
                          {s.gradeDisplay}
                        </span>
                      </div>

                      {/* Faculty */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-shrink-0"
                          style={{
                            background: GRAD_FAC_ICO,
                            boxShadow: "0 1px 4px rgba(0,85,255,0.22)",
                          }}
                        >
                          <GraduationCap className="w-[11px] h-[11px] text-white" strokeWidth={2.3} />
                        </div>
                        <span className="text-[11px] font-bold truncate" style={{ color: T2 }}>
                          {s.faculty}
                        </span>
                      </div>

                      {/* Attendance */}
                      <div>
                        <span
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-bold"
                          style={{
                            background: attValid
                              ? attGood ? "rgba(0,200,83,0.10)" : "rgba(255,51,85,0.10)"
                              : "rgba(0,85,255,0.06)",
                            color: attValid
                              ? attGood ? "#007830" : RED
                              : T4,
                            border: `0.5px solid ${
                              attValid
                                ? attGood ? "rgba(0,200,83,0.22)" : "rgba(255,51,85,0.22)"
                                : "rgba(0,85,255,0.12)"
                            }`,
                          }}
                        >
                          {s.attendance}
                        </span>
                      </div>

                      {/* Identity */}
                      <div>
                        <span
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-bold"
                          style={{
                            background: isActive ? "rgba(0,200,83,0.10)" : "rgba(0,85,255,0.10)",
                            color: isActive ? "#007830" : B1,
                            border: `0.5px solid ${isActive ? "rgba(0,200,83,0.22)" : "rgba(0,85,255,0.22)"}`,
                          }}
                        >
                          {isActive ? "ACTIVE" : "INVITED"}
                        </span>
                      </div>

                      {/* Profile action */}
                      <div>
                        <button
                          onClick={e => { e.stopPropagation(); onProfileClick(s); }}
                          className="inline-flex items-center justify-center gap-1 px-3.5 py-2 rounded-[12px] text-[11px] font-bold text-white tracking-[0.02em] transition-transform active:scale-90"
                          style={{
                            background: GRAD_PRIMARY,
                            boxShadow: "0 3px 10px rgba(0,85,255,0.28)",
                          }}
                        >
                          <UserIcon className="w-3 h-3" strokeWidth={2.3} />
                          PROFILE
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* Pagination */}
        {!loading && filteredCount > itemsPerPage && (
          <div
            className="flex items-center justify-between gap-2 px-4 py-3"
            style={{ borderTop: "0.5px solid rgba(0,85,255,0.07)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T4 }}>
              {pageStart}–{pageEnd} of {filteredCount}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-1.5 rounded-lg disabled:opacity-30 transition-transform active:scale-95"
                style={{ border: "0.5px solid rgba(0,85,255,0.12)", background: "#fff" }}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" style={{ color: T2 }} />
              </button>
              <span className="text-[11px] font-bold px-2" style={{ color: T1 }}>
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-1.5 rounded-lg disabled:opacity-30 transition-transform active:scale-95"
                style={{ border: "0.5px solid rgba(0,85,255,0.12)", background: "#fff" }}
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" style={{ color: T2 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentsMobile;