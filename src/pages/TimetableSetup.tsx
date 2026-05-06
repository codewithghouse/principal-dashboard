/**
 * TimetableSetup.tsx (principal) — WYSIWYG Excel-driven timetable.
 *
 * Format-agnostic: whatever the principal uploads (any column layout, any
 * sheet structure), teachers + parents see the SAME structure rendered
 * as HTML tables. No schema enforcement, no template lock-in — every
 * school's timetable looks different and we honour that.
 *
 * Convention: one sheet per class (sheet name = class name) so parent's
 * "my child's class" auto-filter works. But this is just a soft
 * convention; if a school uses one big grid sheet, that also works —
 * teacher/parent just see the whole thing.
 *
 * Storage:
 *   timetable_documents/{schoolId}_{branchSeg} — singleton doc per
 *     school+branch. Schema: { fileName, sheets: [{name,headers,rows}],
 *     uploadedAt, uploadedBy, uploadedByName }.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Calendar, Upload, Download, Trash2, Loader2, AlertTriangle, CheckCircle2,
  X, FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

// Firestore does NOT allow nested arrays (array-of-array). We wrap each
// row in `{cells: string[]}` so the outer `rows` field becomes an
// array-of-objects, which IS allowed. Render layer transparently maps
// rows[i].cells to display cells.
interface TimetableSheet {
  name: string;
  headers: string[];
  rows: { cells: string[] }[];
}

interface TimetableDoc {
  schoolId: string;
  branchId: string | null;
  fileName: string;
  sheets: TimetableSheet[];
  uploadedAt: any;
  uploadedBy: string;
  uploadedByName: string;
}

const T = {
  FONT: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
  BG: "#EEF4FF", CARD: "#FFFFFF",
  T1: "#001040", T2: "#002080", T3: "#5070B0", T4: "#99AACC",
  P: "#0055FF",
  GREEN: "#00C853", RED: "#FF3355", ORANGE: "#FF8800",
  SH: "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.12), 0 18px 44px rgba(0,85,255,0.15)",
  BDR: "0.5px solid rgba(0,85,255,0.10)",
};

// Cell rendering — handle Excel time fractions, dates, plain values
const renderCell = (v: any): string => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    // Excel time-of-day fraction (0..1)
    if (v > 0 && v < 1) {
      const totalMin = Math.round(v * 24 * 60);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return String(v);
  }
  return String(v);
};

const TimetableSetup = () => {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId as string | undefined;
  const branchId = (userData?.branchId as string | undefined) || null;
  const branchSeg = branchId || "_default";
  const docId = schoolId ? `${schoolId}_${branchSeg}` : "";

  const [tt, setTt] = useState<TimetableDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [draft, setDraft] = useState<{ fileName: string; sheets: TimetableSheet[]; warnings: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Live subscription (singleton doc) ───────────────────────────────────
  useEffect(() => {
    if (!docId) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, "timetable_documents", docId),
      (s) => {
        setTt(s.exists() ? (s.data() as TimetableDoc) : null);
        setLoading(false);
      },
      (err) => {
        console.warn("[TimetableSetup] listener failed:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [docId]);

  // ── Sample template (3 example classes; structure is just suggestion) ──
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const sample = [
      { Day: "Monday",    Period: 1, "Start Time": "09:00", "End Time": "09:45", Subject: "Mathematics", Teacher: "Mr. Khan" },
      { Day: "Monday",    Period: 2, "Start Time": "09:50", "End Time": "10:35", Subject: "English",     Teacher: "Mrs. Sharma" },
      { Day: "Monday",    Period: 3, "Start Time": "10:40", "End Time": "11:25", Subject: "Science",     Teacher: "Dr. Patel" },
      { Day: "Tuesday",   Period: 1, "Start Time": "09:00", "End Time": "09:45", Subject: "English",     Teacher: "Mrs. Sharma" },
      { Day: "Wednesday", Period: 1, "Start Time": "09:00", "End Time": "09:45", Subject: "Hindi",       Teacher: "Ms. Verma" },
    ];
    ["Class 10A", "Class 10B", "Class 11 Science"].forEach((name) => {
      const ws = XLSX.utils.json_to_sheet(sample);
      ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    XLSX.writeFile(wb, "timetable_template.xlsx");
    toast.success("Sample template downloaded — feel free to use any column layout you prefer.");
  };

  // ── Parse uploaded file (format-agnostic) ──────────────────────────────
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error("Only .xlsx / .xls / .csv files are accepted.");
      return;
    }
    setParsing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheets: TimetableSheet[] = [];
        const warnings: string[] = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          // header:1 → array-of-arrays preserving column order + empty cells
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
          // Drop trailing empty rows
          while (aoa.length > 0 && aoa[aoa.length - 1].every(c => c === "" || c === null || c === undefined)) {
            aoa.pop();
          }
          if (aoa.length === 0) {
            warnings.push(`Sheet "${sheetName}" is empty — skipped.`);
            continue;
          }
          const headers = (aoa[0] || []).map((h: any) => renderCell(h));
          const cellRows = aoa.slice(1).map(r => r.map((c: any) => renderCell(c)));
          // Drop completely-empty rows + wrap each in {cells: ...} so
          // Firestore's no-nested-arrays rule is satisfied.
          const wrapped = cellRows
            .filter(r => r.some(c => c !== ""))
            .map(cells => ({ cells }));
          sheets.push({ name: sheetName.trim() || "Sheet", headers, rows: wrapped });
        }

        if (sheets.length === 0) {
          toast.error("No sheets with data found in the file.");
          setParsing(false);
          return;
        }

        setDraft({ fileName: file.name, sheets, warnings });
        const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
        toast.success(`Parsed ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} · ${totalRows} row${totalRows === 1 ? "" : "s"}`);
      } catch (err: any) {
        console.error("[TimetableSetup] parse failed:", err);
        toast.error("Could not parse the file: " + (err?.message || "unknown"));
      } finally {
        setParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file.");
      setParsing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Publish (singleton overwrite) ──────────────────────────────────────
  const publish = async () => {
    if (!draft || !docId || !schoolId) return;
    setSaving(true);
    try {
      // Sanity check: Firestore doc size limit is ~1 MB. Estimate JSON size.
      const json = JSON.stringify(draft.sheets);
      if (json.length > 900_000) {
        toast.error("Timetable too large for a single doc (>900 KB). Reduce sheets or split into multiple uploads.");
        setSaving(false);
        return;
      }
      await setDoc(doc(db, "timetable_documents", docId), {
        schoolId,
        branchId: branchId || null,
        fileName: draft.fileName,
        sheets: draft.sheets,
        uploadedAt: serverTimestamp(),
        uploadedBy: userData?.id || "",
        uploadedByName: (userData as any)?.fullName || (userData as any)?.name || "Principal",
      });
      toast.success(`Timetable published — ${draft.sheets.length} sheet${draft.sheets.length === 1 ? "" : "s"} live for teachers + parents.`);
      setDraft(null);
      setConfirmReplace(false);
    } catch (e: any) {
      console.error("[TimetableSetup] publish failed:", e);
      toast.error("Publish failed: " + (e?.message || "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    if (!docId) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "timetable_documents", docId));
      toast.success("Timetable cleared.");
      setConfirmClear(false);
    } catch (e: any) {
      toast.error("Clear failed: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: T.BG, minHeight: "100vh", padding: "24px 16px 40px", fontFamily: T.FONT }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.6px", color: T.T4, margin: "0 0 4px", textTransform: "uppercase" }}>
          School configuration
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", color: T.T1, margin: 0, lineHeight: 1.1, display: "flex", alignItems: "center", gap: 10 }}>
          <Calendar size={26} color={T.P} />
          Timetable Setup
        </h1>
        <p style={{ fontSize: 12, color: T.T3, fontWeight: 500, marginTop: 6, margin: "6px 0 0", lineHeight: 1.5 }}>
          Upload your school's existing Excel timetable in <strong>any format</strong>. Teachers + parents see exactly what you upload — no schema, no template lock-in. Tip: name each sheet after a class (e.g. "Class 10A") so parents can auto-filter.
        </p>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={downloadTemplate}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "10px 16px", borderRadius: 12,
            background: T.CARD, color: T.P, border: `0.5px solid rgba(0,85,255,0.22)`,
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.FONT, boxShadow: T.SH,
          }}>
          <Download size={14} /> Sample (optional)
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "10px 16px", borderRadius: 12,
            background: `linear-gradient(135deg, ${T.P}, #1166FF)`,
            color: "#fff", border: "none", cursor: parsing ? "wait" : "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: T.FONT,
            boxShadow: "0 6px 18px rgba(0,85,255,0.30)",
            opacity: parsing ? 0.6 : 1,
          }}
        >
          {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {parsing ? "Parsing…" : "Upload Excel"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          hidden
          onChange={onPickFile}
        />
        {tt && (
          <button onClick={() => setConfirmClear(true)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 14px", borderRadius: 12,
              background: "rgba(255,51,85,.08)", color: T.RED,
              border: "0.5px solid rgba(255,51,85,.22)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.FONT,
            }}>
            <Trash2 size={13} /> Clear timetable
          </button>
        )}
      </div>

      {/* States */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Loader2 size={26} className="animate-spin" style={{ color: T.P }} />
        </div>
      ) : tt && !draft ? (
        <PublishedView tt={tt} />
      ) : !tt && !draft ? (
        <div style={{ background: T.CARD, borderRadius: 18, padding: "44px 22px", boxShadow: T.SH, border: T.BDR, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,85,255,.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Calendar size={26} color={T.P} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: T.T1, margin: "0 0 6px" }}>No timetable published yet</p>
          <p style={{ fontSize: 12, color: T.T3, fontWeight: 500, margin: "0 0 4px", lineHeight: 1.55, maxWidth: 460, marginInline: "auto" }}>
            Upload your school's existing Excel timetable. Whatever columns and rows you have will show up exactly the same way for teachers and parents.
          </p>
        </div>
      ) : null}

      {/* Draft preview */}
      {draft && (
        <DraftPreview
          draft={draft}
          saving={saving}
          onCancel={() => setDraft(null)}
          onPublish={() => setConfirmReplace(true)}
          isReplacing={!!tt}
        />
      )}

      {/* Confirm modals */}
      {confirmReplace && draft && (
        <ConfirmModal
          icon={<AlertTriangle size={20} color={T.ORANGE} />}
          iconBg="rgba(255,170,0,.10)"
          iconBorder="rgba(255,170,0,.22)"
          title={tt ? "Replace existing timetable?" : "Publish this timetable?"}
          body={
            tt
              ? `The current timetable (${tt.sheets.length} sheet${tt.sheets.length === 1 ? "" : "s"}, "${tt.fileName}") will be REPLACED with this upload (${draft.sheets.length} sheet${draft.sheets.length === 1 ? "" : "s"}, "${draft.fileName}"). Teachers + parents will see the new version immediately.`
              : `${draft.sheets.length} sheet${draft.sheets.length === 1 ? "" : "s"} will be published. Teachers + parents will see them immediately.`
          }
          cancelText="Cancel"
          confirmText="Publish"
          confirming={saving}
          confirmColor={T.P}
          onCancel={() => setConfirmReplace(false)}
          onConfirm={publish}
        />
      )}
      {confirmClear && (
        <ConfirmModal
          icon={<Trash2 size={20} color={T.RED} />}
          iconBg="rgba(255,51,85,.10)"
          iconBorder="rgba(255,51,85,.22)"
          title="Clear the entire timetable?"
          body="The published timetable will be deleted. Teachers + parents will see 'no timetable published' until you upload a new one. This cannot be undone."
          cancelText="Cancel"
          confirmText="Clear"
          confirming={saving}
          confirmColor={T.RED}
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearAll}
        />
      )}
    </div>
  );
};

// ── Published / current timetable view ─────────────────────────────────────
const PublishedView = ({ tt }: { tt: TimetableDoc }) => {
  const [activeSheet, setActiveSheet] = useState<string>(tt.sheets[0]?.name || "");
  // If active sheet is no longer present after a re-publish, default to first.
  useEffect(() => {
    if (!tt.sheets.some(s => s.name === activeSheet) && tt.sheets[0]) {
      setActiveSheet(tt.sheets[0].name);
    }
  }, [tt.sheets, activeSheet]);
  const current = tt.sheets.find(s => s.name === activeSheet);

  return (
    <div style={{ background: T.CARD, borderRadius: 18, padding: 18, boxShadow: T.SH, border: T.BDR }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(0,200,83,.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={20} color={T.GREEN} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.T1 }}>Timetable published</div>
          <div style={{ fontSize: 11, color: T.T3, fontWeight: 500 }}>
            {tt.sheets.length} sheet{tt.sheets.length === 1 ? "" : "s"} · {tt.fileName}
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.T4, textAlign: "right" }}>
          {tt.uploadedAt?.toDate?.()?.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) || "—"}
          {tt.uploadedByName ? ` · by ${tt.uploadedByName}` : ""}
        </div>
      </div>

      <SheetTabs sheets={tt.sheets} active={activeSheet} onChange={setActiveSheet} />
      {current && <SheetTable sheet={current} />}
    </div>
  );
};

// ── Draft preview (mirror of published view) ───────────────────────────────
const DraftPreview = ({
  draft, saving, onCancel, onPublish, isReplacing,
}: {
  draft: { fileName: string; sheets: TimetableSheet[]; warnings: string[] };
  saving: boolean;
  onCancel: () => void;
  onPublish: () => void;
  isReplacing: boolean;
}) => {
  const [activeSheet, setActiveSheet] = useState<string>(draft.sheets[0]?.name || "");
  useEffect(() => {
    if (!draft.sheets.some(s => s.name === activeSheet) && draft.sheets[0]) {
      setActiveSheet(draft.sheets[0].name);
    }
  }, [draft.sheets, activeSheet]);
  const current = draft.sheets.find(s => s.name === activeSheet);

  return (
    <div style={{ background: T.CARD, borderRadius: 18, padding: 18, boxShadow: T.SH, border: T.BDR, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,170,0,.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <FileSpreadsheet size={20} color={T.ORANGE} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.T1, marginBottom: 2 }}>
            Preview — {draft.fileName}
          </div>
          <div style={{ fontSize: 11, color: T.T3, fontWeight: 600 }}>
            {draft.sheets.length} sheet{draft.sheets.length === 1 ? "" : "s"} · {draft.sheets.reduce((sum, s) => sum + s.rows.length, 0)} row{draft.sheets.reduce((sum, s) => sum + s.rows.length, 0) === 1 ? "" : "s"} total
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={onCancel} disabled={saving}
            style={{ padding: "8px 12px", borderRadius: 10, background: T.CARD, border: T.BDR, color: T.T2, fontSize: 11, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: T.FONT }}>
            Cancel
          </button>
          <button onClick={onPublish} disabled={saving}
            style={{ padding: "8px 14px", borderRadius: 10, background: `linear-gradient(135deg, ${T.P}, #1166FF)`, color: "#fff", border: "none", fontSize: 11, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: T.FONT, opacity: saving ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {isReplacing ? "Publish (replace)" : "Publish"}
          </button>
        </div>
      </div>
      {draft.warnings.length > 0 && (
        <div style={{ background: "rgba(255,170,0,.08)", border: "0.5px solid rgba(255,170,0,.22)", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
          {draft.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: T.T2, fontWeight: 500, lineHeight: 1.5, display: "flex", gap: 6, alignItems: "flex-start" }}>
              <AlertTriangle size={11} color={T.ORANGE} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <SheetTabs sheets={draft.sheets} active={activeSheet} onChange={setActiveSheet} />
      {current && <SheetTable sheet={current} />}
    </div>
  );
};

// ── Sheet tabs ─────────────────────────────────────────────────────────────
const SheetTabs = ({ sheets, active, onChange }: {
  sheets: TimetableSheet[]; active: string; onChange: (n: string) => void;
}) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
    {sheets.map(s => {
      const isActive = s.name === active;
      return (
        <button key={s.name} onClick={() => onChange(s.name)}
          style={{
            padding: "7px 14px", borderRadius: 999,
            background: isActive ? `linear-gradient(135deg, ${T.P}, #1166FF)` : T.BG,
            color: isActive ? "#fff" : T.T2,
            border: isActive ? "0.5px solid transparent" : T.BDR,
            fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.FONT,
            letterSpacing: "0.04em",
            boxShadow: isActive ? "0 4px 12px rgba(0,85,255,0.28)" : "none",
          }}>
          {s.name}
          <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 9, fontWeight: 600 }}>
            {s.rows.length}r
          </span>
        </button>
      );
    })}
  </div>
);

// ── Render a sheet as an HTML table (WYSIWYG) ──────────────────────────────
const SheetTable = ({ sheet }: { sheet: TimetableSheet }) => {
  if (sheet.rows.length === 0 && sheet.headers.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.T3, fontSize: 12, fontWeight: 600 }}>
        This sheet is empty.
      </div>
    );
  }
  return (
    <div style={{ background: "rgba(0,85,255,.04)", border: "0.5px solid rgba(0,85,255,.10)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.FONT, minWidth: "max-content" }}>
          {sheet.headers.length > 0 && (
            <thead>
              <tr style={{ background: "rgba(0,85,255,.08)" }}>
                {sheet.headers.map((h, i) => (
                  <th key={i} style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.4px", color: T.T1,
                    padding: "10px 12px", textAlign: "left", borderRight: "0.5px solid rgba(0,85,255,.10)",
                    whiteSpace: "nowrap", textTransform: "uppercase",
                  }}>
                    {h || "—"}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {sheet.rows.map((row, ri) => {
              const cells = row.cells || [];
              return (
                <tr key={ri} style={{ borderTop: "0.5px solid rgba(0,85,255,.06)" }}>
                  {/* Pad to header length so columns align even if a row is short */}
                  {Array.from({ length: Math.max(sheet.headers.length, cells.length) }, (_, ci) => {
                    const cell = cells[ci] ?? "";
                    return (
                      <td key={ci} style={{
                        fontSize: 12, color: T.T1,
                        padding: "9px 12px",
                        borderRight: "0.5px solid rgba(0,85,255,.06)",
                        background: T.CARD,
                        verticalAlign: "top",
                        whiteSpace: "pre-wrap",
                      }}>
                        {cell === "" ? <span style={{ color: T.T4 }}>—</span> : cell}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Reusable confirm modal ─────────────────────────────────────────────────
const ConfirmModal = ({
  icon, iconBg, iconBorder, title, body, cancelText, confirmText, confirming, confirmColor, onCancel, onConfirm,
}: {
  icon: React.ReactNode; iconBg: string; iconBorder: string;
  title: string; body: string;
  cancelText: string; confirmText: string;
  confirming: boolean;
  confirmColor: string;
  onCancel: () => void; onConfirm: () => void;
}) => (
  <div onClick={onCancel}
    style={{ position: "fixed", inset: 0, background: "rgba(0,16,64,.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60, fontFamily: T.FONT }}>
    <div onClick={(e) => e.stopPropagation()}
      style={{ background: T.CARD, borderRadius: 18, width: "100%", maxWidth: 420, boxShadow: "0 24px 60px rgba(0,8,60,.40)", overflow: "hidden" }}>
      <div style={{ padding: "18px 18px 12px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: iconBg, border: `0.5px solid ${iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.T1, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 11, color: T.T3, fontWeight: 500, lineHeight: 1.55 }}>{body}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 18px" }}>
        <button onClick={onCancel} disabled={confirming}
          style={{ flex: 1, padding: "10px", borderRadius: 11, background: T.BG, border: T.BDR, color: T.T2, fontSize: 12, fontWeight: 700, cursor: confirming ? "wait" : "pointer", fontFamily: T.FONT }}>
          {cancelText}
        </button>
        <button onClick={onConfirm} disabled={confirming}
          style={{ flex: 1, padding: "10px", borderRadius: 11, background: confirming ? T.T4 : confirmColor, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: confirming ? "wait" : "pointer", fontFamily: T.FONT, opacity: confirming ? 0.7 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {confirming ? <Loader2 size={12} className="animate-spin" /> : null}
          {confirmText}
        </button>
      </div>
    </div>
  </div>
);

// Re-export X to keep import (lucide tree-shake doesn't drop unused).
export { X };
export default TimetableSetup;
