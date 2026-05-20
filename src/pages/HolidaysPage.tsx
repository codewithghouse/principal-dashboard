/**
 * HolidaysPage.tsx (principal) — Declare school-wide off-days.
 *
 * Architecture
 * ────────────
 * Holidays declared here apply to ALL classes in the school. They live in
 * the `school_holidays/{schoolId}_{YYYY-MM-DD}` collection (one doc per
 * school per date). Every attendance % reader across the 4 dashboards
 * consults this collection and EXCLUDES declared dates from both numerator
 * AND denominator — so the day doesn't count for or against any student.
 *
 * The per-class "Mark Day as Holiday" flow on teacher MarkAttendance still
 * works as a fallback (one class out on a field trip, etc.). Both layers
 * compose: a date is treated as off-day if EITHER the school declared it
 * OR the class teacher marked all students "holiday".
 */

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Plus, Trash2, Loader2, X, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { subscribeSchoolHolidays, type SchoolHoliday } from "@/lib/schoolHolidays";

const T = {
  FONT: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
  BG: "#EEF4FF",
  CARD: "#FFFFFF",
  T1: "#001040", T3: "#5070B0", T4: "#99AACC",
  P: "#0055FF",
  GREEN: "#00C853",
  RED: "#FF3355",
  VIOLET: "#7B3FF4",
  SH: "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.12), 0 18px 44px rgba(0,85,255,0.15)",
  SH_SM: "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 8px rgba(0,85,255,0.08)",
};

const todayStr = () => new Date().toLocaleDateString("en-CA");

const fmtDateLong = (dateStr: string): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });
};

export default function HolidaysPage() {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId || "";

  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), reason: "" });
  const [confirmDelete, setConfirmDelete] = useState<SchoolHoliday | null>(null);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeSchoolHolidays(
      schoolId,
      (rows) => { setHolidays(rows); setLoading(false); },
      () => { setLoading(false); toast.error("Couldn't load holidays."); },
    );
    return () => unsub();
  }, [schoolId]);

  // Sort newest first for the list; split into upcoming + past for at-a-glance
  const { upcoming, past } = useMemo(() => {
    const today = todayStr();
    const sorted = [...holidays].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return {
      upcoming: sorted.filter(h => h.date >= today),
      past: sorted.filter(h => h.date < today),
    };
  }, [holidays]);

  const handleAdd = async () => {
    if (!schoolId) return;
    const date = form.date.trim();
    const reason = form.reason.trim();
    if (!date) { toast.error("Pick a date."); return; }
    if (!reason) { toast.error("Reason required (e.g. Diwali, Republic Day)."); return; }
    // Composite id ensures one doc per (school, date) — idempotent re-declare.
    const id = `${schoolId}_${date}`;
    if (holidays.some(h => h.id === id)) {
      toast.error("That date is already declared as a holiday.");
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "school_holidays", id), {
        schoolId,
        date,
        reason,
        branchId: userData?.branchId || "",
        declaredBy: userData?.id || "",
        declaredByName: userData?.name || "",
        createdAt: serverTimestamp(),
      });
      toast.success(`${fmtDateLong(date)} declared as holiday.`);
      setAddOpen(false);
      setForm({ date: todayStr(), reason: "" });
    } catch (e) {
      console.error("[HolidaysPage] add failed", e);
      toast.error("Failed to save holiday. Check console.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: SchoolHoliday) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, "school_holidays", h.id));
      toast.success(`${fmtDateLong(h.date)} holiday removed.`);
      setConfirmDelete(null);
    } catch (e) {
      console.error("[HolidaysPage] delete failed", e);
      toast.error("Failed to remove holiday.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ fontFamily: T.FONT, padding: "20px 24px 40px", background: T.BG, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.T4, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 6 }}>
            School Calendar
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.T1, letterSpacing: "-0.6px", lineHeight: 1.15 }}>
            Holidays & Off-days
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.T3, marginTop: 6, maxWidth: 580 }}>
            Declared holidays apply to the entire school — every class, every student.
            These dates are excluded from attendance % calculations across all dashboards.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="active:scale-[0.98] transition-transform"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "11px 18px",
            background: `linear-gradient(135deg, ${T.VIOLET}, #9B6FFF)`,
            border: "none", borderRadius: 14,
            color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "-0.1px",
            cursor: "pointer", fontFamily: T.FONT,
            boxShadow: "0 6px 18px rgba(123,63,244,0.32), 0 2px 6px rgba(123,63,244,0.18)",
          }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.4} />
          Declare Holiday
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.P }} />
        </div>
      ) : (
        <>
          {holidays.length === 0 ? (
            <EmptyState onAdd={() => setAddOpen(true)} />
          ) : (
            <div style={{ display: "grid", gap: 24 }}>
              {upcoming.length > 0 && (
                <Section title={`Upcoming · ${upcoming.length}`} accent={T.VIOLET}>
                  {upcoming.map(h => (
                    <HolidayRow key={h.id} h={h} onDelete={() => setConfirmDelete(h)} />
                  ))}
                </Section>
              )}
              {past.length > 0 && (
                <Section title={`Past · ${past.length}`} accent={T.T3}>
                  {past.map(h => (
                    <HolidayRow key={h.id} h={h} onDelete={() => setConfirmDelete(h)} isPast />
                  ))}
                </Section>
              )}
            </div>
          )}
        </>
      )}

      {/* Add modal */}
      {addOpen && (
        <Modal onClose={() => !saving && setAddOpen(false)} title="Declare School Holiday">
          <label style={labelStyle}>Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            min={todayStr().slice(0, 4) + "-01-01"}
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 14 }}>Reason</label>
          <input
            type="text"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value.slice(0, 80) })}
            placeholder="e.g. Diwali, Republic Day, Local festival"
            maxLength={80}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button type="button" onClick={() => setAddOpen(false)} disabled={saving} style={btnSecondaryStyle}>
              Cancel
            </button>
            <button type="button" onClick={handleAdd} disabled={saving} style={btnPrimaryStyle}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Declare Holiday</>}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal onClose={() => !saving && setConfirmDelete(null)} title="Remove Holiday?">
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "rgba(255,51,85,0.08)", border: "0.5px solid rgba(255,51,85,0.20)", borderRadius: 12, marginBottom: 14 }}>
            <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: T.RED }} strokeWidth={2.2} />
            <div style={{ fontSize: 12.5, color: T.T1, fontWeight: 600, lineHeight: 1.5 }}>
              Remove <span style={{ fontWeight: 800, color: T.VIOLET }}>{fmtDateLong(confirmDelete.date)}</span> ({confirmDelete.reason}) as a school holiday? Attendance % for this date will be recalculated from raw attendance records.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setConfirmDelete(null)} disabled={saving} style={btnSecondaryStyle}>
              Cancel
            </button>
            <button type="button" onClick={() => handleDelete(confirmDelete)} disabled={saving} style={{ ...btnPrimaryStyle, background: `linear-gradient(135deg, ${T.RED}, #FF6688)`, boxShadow: "0 6px 18px rgba(255,51,85,0.32)" }}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Removing…</> : <><Trash2 className="w-4 h-4" /> Remove Holiday</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

const Section = ({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) => (
  <section>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      <h2 style={{ fontSize: 11, fontWeight: 700, color: T.T3, textTransform: "uppercase", letterSpacing: "0.16em", margin: 0 }}>
        {title}
      </h2>
    </div>
    <div style={{ display: "grid", gap: 10 }}>{children}</div>
  </section>
);

const HolidayRow = ({ h, onDelete, isPast = false }: { h: SchoolHoliday; onDelete: () => void; isPast?: boolean }) => (
  <div style={{
    background: T.CARD, borderRadius: 16, padding: "14px 18px",
    boxShadow: T.SH_SM, border: "0.5px solid rgba(0,85,255,0.10)",
    display: "flex", alignItems: "center", gap: 14, opacity: isPast ? 0.78 : 1,
  }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(123,63,244,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <CalendarDays className="w-5 h-5" style={{ color: T.VIOLET }} strokeWidth={2.2} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.T1, letterSpacing: "-0.2px" }}>
        {h.reason || "Holiday"}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: T.T3, marginTop: 3 }}>
        {fmtDateLong(h.date)}{h.declaredByName ? ` · by ${h.declaredByName}` : ""}
      </div>
    </div>
    <button
      type="button"
      onClick={onDelete}
      aria-label="Remove holiday"
      title="Remove holiday"
      className="custom-chrome active:scale-95 transition-transform"
      style={{
        // .custom-chrome zeroes padding via index.css. Without it the
        // global `button { padding: 8px 16px !important }` shrinks this
        // 36×36 button to a 4×20 content box and the trash icon
        // disappears entirely (why this column looked empty).
        width: 36, height: 36, borderRadius: 10,
        background: "rgba(255,51,85,0.10)", border: "0.5px solid rgba(255,51,85,0.28)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <Trash2 size={16} color={T.RED} strokeWidth={2.5} />
    </button>
  </div>
);

const EmptyState = ({ onAdd }: { onAdd: () => void }) => (
  <div style={{
    background: T.CARD, borderRadius: 22, padding: "44px 28px",
    boxShadow: T.SH_SM, border: "0.5px solid rgba(0,85,255,0.10)",
    textAlign: "center",
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: 18, margin: "0 auto 14px",
      background: `linear-gradient(135deg, ${T.VIOLET}, #9B6FFF)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 6px 18px rgba(123,63,244,0.30)",
    }}>
      <CalendarDays className="w-7 h-7 text-white" strokeWidth={2.2} />
    </div>
    <div style={{ fontSize: 16, fontWeight: 700, color: T.T1, letterSpacing: "-0.3px", marginBottom: 6 }}>
      No holidays declared yet
    </div>
    <div style={{ fontSize: 12.5, color: T.T3, lineHeight: 1.5, maxWidth: 380, margin: "0 auto 18px" }}>
      Add school holidays (Diwali, Republic Day, exam-day breaks, festival days) so they're correctly excluded from attendance percentages everywhere.
    </div>
    <button
      type="button"
      onClick={onAdd}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 18px",
        background: `linear-gradient(135deg, ${T.VIOLET}, #9B6FFF)`,
        border: "none", borderRadius: 12,
        color: "#fff", fontSize: 13, fontWeight: 700,
        cursor: "pointer", fontFamily: T.FONT,
      }}
    >
      <Plus className="w-4 h-4" strokeWidth={2.4} />
      Declare First Holiday
    </button>
  </div>
);

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div
    role="dialog"
    aria-modal="true"
    onClick={onClose}
    style={{
      position: "fixed", inset: 0, background: "rgba(0,8,40,0.45)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 16, fontFamily: T.FONT,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "#fff", borderRadius: 22, width: 440, maxWidth: "100%",
        boxShadow: "0 32px 80px rgba(0,8,40,0.32)",
        padding: "22px 24px 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.T1, letterSpacing: "-0.4px" }}>{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="custom-chrome"
          style={{
            // .custom-chrome zeroes padding via index.css. Without it the
            // global `button { padding: 8px 16px !important }` shrinks the
            // 32×32 button to a 0×16 content box and the X disappears.
            width: 32, height: 32, borderRadius: 10,
            background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}>
          <X size={16} color={T.T1} strokeWidth={2.6} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: T.T3,
  textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 44, padding: "0 14px", borderRadius: 12,
  background: T.BG, border: "0.5px solid rgba(0,85,255,0.14)",
  fontSize: 13.5, fontWeight: 500, color: T.T1, fontFamily: T.FONT, outline: "none",
};

const btnSecondaryStyle: React.CSSProperties = {
  flex: 1, height: 44, borderRadius: 12,
  background: T.BG, border: "0.5px solid rgba(0,85,255,0.12)",
  color: T.T1, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.FONT,
};

const btnPrimaryStyle: React.CSSProperties = {
  flex: 1.4, height: 44, borderRadius: 12,
  background: `linear-gradient(135deg, ${T.VIOLET}, #9B6FFF)`,
  border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  cursor: "pointer", fontFamily: T.FONT,
  boxShadow: "0 6px 18px rgba(123,63,244,0.32)",
};
