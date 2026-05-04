/**
 * StudentsPagination — single pagination control reused by Desktop + Mobile.
 *
 * Behaviors:
 *  • Smart sliding window: always renders up to `windowSize` page buttons
 *    centered around currentPage, with "…" gaps + first/last shortcuts when
 *    there are more pages than the window can fit.
 *  • Prev / Next stays visible; disabled at edges.
 *  • Optional page-size selector lets the user load 10 / 25 / 50 / 100 rows
 *    at a time. Triggers a controlled callback so the parent can reset to
 *    page 1 on size change.
 *  • Always renders the "Showing X–Y of Z" footer — useful even when there's
 *    only one page so the user knows the total at a glance.
 *  • Two visual variants: "desktop" (full 36px buttons + page-size pill) and
 *    "mobile" (compact 30px buttons, no size selector by default).
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface StudentsPaginationProps {
  totalItems: number;
  currentPage: number;
  setCurrentPage: (p: number | ((prev: number) => number)) => void;
  pageSize: number;
  /** Optional — when provided, renders a "Show N per page" selector. */
  setPageSize?: (n: number) => void;
  pageSizeOptions?: number[];
  variant?: "desktop" | "mobile";
  windowSize?: number;
  /** Singular/plural noun for the footer ("Student" / "Students"). */
  itemNoun?: { one: string; other: string };
}

const DEFAULT_SIZES = [10, 25, 50, 100];

// Theme tokens — kept local to stay self-contained. Match Students view palette.
const B1     = "#0055FF";
const T2     = "#002080";
const T4     = "#99AACC";
const BG2    = "#E0ECFF";
const GRAD   = "linear-gradient(135deg, #0055FF 0%, #1166FF 100%)";
const SH_BTN = "0 4px 14px rgba(0,85,255,0.30)";
const SH_SM  = "0 0 0 0.5px rgba(0,85,255,0.10), 0 1px 4px rgba(0,85,255,0.06), 0 6px 16px rgba(0,85,255,0.10)";

/**
 * Build the visible page-number sequence with ellipsis sentinels.
 * For 7 or fewer pages: [1,2,3,4,5,6,7].
 * Otherwise: always include first + last + a window around current, with "…"
 * as a string sentinel where pages are skipped.
 *
 * Examples (windowSize=5, totalPages=20):
 *   currentPage=1  → [1,2,3,4,5, "…", 20]
 *   currentPage=10 → [1, "…", 8,9,10,11,12, "…", 20]
 *   currentPage=20 → [1, "…", 16,17,18,19,20]
 */
function buildPageSequence(currentPage: number, totalPages: number, windowSize: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const half = Math.floor(windowSize / 2);
  let start = Math.max(2, currentPage - half);
  let end   = Math.min(totalPages - 1, currentPage + half);

  // If we're near an edge, expand the other side so the visible window stays
  // the same size (otherwise the bar visibly shrinks at the end of the list,
  // which is the bug the previous inline pagination had).
  if (currentPage - half < 2) end = Math.min(totalPages - 1, end + (2 - (currentPage - half)));
  if (currentPage + half > totalPages - 1) start = Math.max(2, start - ((currentPage + half) - (totalPages - 1)));

  const seq: (number | "…")[] = [1];
  if (start > 2) seq.push("…");
  for (let p = start; p <= end; p++) seq.push(p);
  if (end < totalPages - 1) seq.push("…");
  seq.push(totalPages);
  return seq;
}

const StudentsPagination = ({
  totalItems,
  currentPage,
  setCurrentPage,
  pageSize,
  setPageSize,
  pageSizeOptions = DEFAULT_SIZES,
  variant = "desktop",
  windowSize = 5,
  itemNoun = { one: "Student", other: "Students" },
}: StudentsPaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pageStart  = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd    = Math.min(currentPage * pageSize, totalItems);
  const sequence   = buildPageSequence(currentPage, totalPages, windowSize);

  const isDesktop  = variant === "desktop";
  const btnSize    = isDesktop ? 36 : 30;
  const fontPx     = isDesktop ? 12 : 11;
  const gap        = isDesktop ? 6 : 4;
  const radius     = isDesktop ? 11 : 9;
  const arrowPad   = isDesktop ? 8 : 6;
  const arrowSz    = isDesktop ? 15 : 14;

  const goto = (p: number) => setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  const arrowBtn = (
    onClick: () => void,
    disabled: boolean,
    icon: JSX.Element,
    label: string,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        padding: arrowPad,
        borderRadius: 10,
        border: "0.5px solid rgba(0,85,255,0.12)",
        background: BG2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      style={{
        marginTop: isDesktop ? 14 : 10,
        padding: isDesktop ? "12px 16px" : "10px 12px",
        borderRadius: isDesktop ? 18 : 16,
        background: "#fff",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        boxShadow: SH_SM,
        border: "0.5px solid rgba(0,85,255,0.10)",
      }}
    >
      {/* Footer info — always visible, even with one page */}
      <p
        style={{
          fontSize: isDesktop ? 11 : 10,
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: T4,
          margin: 0,
          flex: "0 0 auto",
        }}
      >
        Showing {pageStart}–{pageEnd} of {totalItems} {totalItems === 1 ? itemNoun.one : itemNoun.other}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {/* Page-size selector — desktop only, optional */}
        {isDesktop && setPageSize && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
              Per page
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "0.5px solid rgba(0,85,255,0.18)",
                background: "#fff",
                fontSize: 12,
                fontWeight: 700,
                color: T2,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}

        {/* Page navigation — only if there's more than one page */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap }}>
            {/* First — only when worth showing */}
            {isDesktop && totalPages > 7 &&
              arrowBtn(() => goto(1), currentPage === 1,
                <ChevronsLeft size={arrowSz} color={T2} />, "First page")}
            {/* Prev */}
            {arrowBtn(() => goto(currentPage - 1), currentPage === 1,
              <ChevronLeft size={arrowSz} color={T2} />, "Previous page")}

            {/* Page buttons + ellipsis */}
            {sequence.map((entry, i) => {
              if (entry === "…") {
                return (
                  <span
                    key={`ellipsis-${i}`}
                    style={{
                      width: btnSize,
                      height: btnSize,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: T4,
                      fontSize: fontPx,
                      fontWeight: 700,
                      userSelect: "none",
                    }}
                  >
                    …
                  </span>
                );
              }
              const active = currentPage === entry;
              return (
                <button
                  key={entry}
                  onClick={() => goto(entry)}
                  aria-current={active ? "page" : undefined}
                  style={{
                    width: btnSize,
                    height: btnSize,
                    borderRadius: radius,
                    fontSize: fontPx,
                    fontWeight: 700,
                    color: active ? "#fff" : T4,
                    background: active ? GRAD : "#fff",
                    border: active ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,0.12)",
                    boxShadow: active ? SH_BTN : "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {entry}
                </button>
              );
            })}

            {/* Next */}
            {arrowBtn(() => goto(currentPage + 1), currentPage === totalPages,
              <ChevronRight size={arrowSz} color={T2} />, "Next page")}
            {/* Last — only when worth showing */}
            {isDesktop && totalPages > 7 &&
              arrowBtn(() => goto(totalPages), currentPage === totalPages,
                <ChevronsRight size={arrowSz} color={T2} />, "Last page")}
          </div>
        )}

        {/* Single-page hint for mobile (no buttons rendered above) */}
        {!isDesktop && totalPages === 1 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: T4, letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Page 1 of 1
          </span>
        )}
      </div>
    </div>
  );
};

// Inline reference — used by parents that want to know what `B1` points to
// without importing the whole token table. (Kept here for token discoverability.)
export { B1 as STUDENTS_PAGINATION_ACCENT };

export default StudentsPagination;
