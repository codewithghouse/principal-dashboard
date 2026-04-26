import {
  Clock, Save, Loader2, Plus, Trash2, BookOpen, User,
  ChevronDown, Sparkles, Grid3x3, AlertTriangle, Coffee,
  GraduationCap, Edit3, LayoutGrid, Copy,
} from "lucide-react";
import type { TimetableSetupMobileProps, PeriodMobile } from "./TimetableSetupMobile";

// Desktop uses the same prop contract as mobile — one data layer, two presentations.
export type TimetableSetupDesktopProps = TimetableSetupMobileProps;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Day accent colours — match mobile
const DAY_DOT: Record<string, string> = {
  Monday: "#0055FF",
  Tuesday: "#7B3FF4",
  Wednesday: "#00C853",
  Thursday: "#FFAA00",
  Friday: "#FF8800",
  Saturday: "#FF3355",
};

// Subject accent — colour cell pills in grid view by subject hash
const SUBJECT_PALETTE = [
  { bg: "rgba(0,85,255,0.10)",   bdr: "rgba(0,85,255,0.22)",  text: "#002080" },
  { bg: "rgba(123,63,244,0.10)", bdr: "rgba(123,63,244,0.22)", text: "#3A1580" },
  { bg: "rgba(0,200,83,0.10)",   bdr: "rgba(0,200,83,0.22)",   text: "#005A20" },
  { bg: "rgba(255,170,0,0.10)",  bdr: "rgba(255,170,0,0.22)",  text: "#664400" },
  { bg: "rgba(255,51,85,0.10)",  bdr: "rgba(255,51,85,0.22)",  text: "#B01030" },
  { bg: "rgba(0,204,221,0.10)",  bdr: "rgba(0,204,221,0.22)",  text: "#055A66" },
  { bg: "rgba(255,85,153,0.10)", bdr: "rgba(255,85,153,0.22)", text: "#881B57" },
];
const subjectStyle = (s: string) => {
  if (!s) return SUBJECT_PALETTE[0];
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return SUBJECT_PALETTE[h % SUBJECT_PALETTE.length];
};

// ── Palette (identical to mobile for continuity) ─────────────────────────────
const B1 = "#0055FF", B2 = "#1166FF";
const BG = "#EEF4FF", BG2 = "#E0ECFF";
const T1 = "#001040", T3 = "#5070B0", T4 = "#99AACC";
const SEP = "rgba(0,85,255,0.07)";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const SHADOW_SM  = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)";
const SHADOW_LG  = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)";
const SHADOW_BTN = "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)";

// ═════════════════════════════════════════════════════════════════════════════
// DAY CARD — expanded, always-visible editor. Used in Edit view.
// ═════════════════════════════════════════════════════════════════════════════
interface DayCardProps {
  day: string;
  periods: PeriodMobile[];
  teachers: any[];
  onAddPeriod: (d: string) => void;
  onAddBreak: (d: string) => void;
  onRemovePeriod: (d: string, id: string) => void;
  onUpdatePeriod: (d: string, id: string, patch: Partial<PeriodMobile>) => void;
  onTeacherChange: (d: string, id: string, tid: string) => void;
  getTeacherSubjects: (tid: string) => string[];
  onCopyDay: (from: string, to: string) => void;
}
const DayCard = ({
  day, periods, teachers,
  onAddPeriod, onAddBreak, onRemovePeriod, onUpdatePeriod,
  onTeacherChange, getTeacherSubjects, onCopyDay,
}: DayCardProps) => {
  const dot = DAY_DOT[day];
  const count = periods.filter(p => !p.isBreak).length;
  const breakCount = periods.filter(p => p.isBreak).length;

  return (
    <div className="rounded-[22px] overflow-hidden flex flex-col"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #F7FAFF 100%)",
        boxShadow: SHADOW_LG,
        border: "1px solid rgba(0,85,255,0.14)",
      }}>
      {/* Day header */}
      <div className="flex items-center gap-3 px-5 py-[14px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
          style={{ background: GRAD_PRIMARY, boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
          <Clock className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-bold tracking-[-0.2px] flex items-center gap-[6px]" style={{ color: T1 }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
            {day}
          </div>
          <div className="text-[10px] font-medium mt-[2px] flex items-center gap-[5px]" style={{ color: T4 }}>
            <span className="px-[8px] py-[2px] rounded-full text-[9px] font-bold"
              style={{ background: count > 0 ? "rgba(0,85,255,0.08)" : "rgba(255,136,0,0.10)", color: count > 0 ? B1 : "#884400", border: `0.5px solid ${count > 0 ? "rgba(0,85,255,0.14)" : "rgba(255,136,0,0.22)"}` }}>
              {count} {count === 1 ? "Period" : "Periods"}
            </span>
            {breakCount > 0 && (
              <span className="px-[8px] py-[2px] rounded-full text-[9px] font-bold"
                style={{ background: "rgba(255,136,0,0.10)", color: "#884400", border: "0.5px solid rgba(255,136,0,0.22)" }}>
                {breakCount} Break{breakCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        {/* Copy dropdown */}
        {periods.length > 0 && (
          <div className="relative flex-shrink-0">
            <Copy className="w-[14px] h-[14px] absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: B1 }} strokeWidth={2.3} />
            <select
              onChange={e => { if (e.target.value) { onCopyDay(day, e.target.value); e.target.value = ""; } }}
              defaultValue=""
              className="h-8 pl-[30px] pr-[26px] rounded-[10px] text-[11px] font-bold outline-none cursor-pointer appearance-none"
              style={{ background: "rgba(0,85,255,0.08)", color: B1, border: "0.5px solid rgba(0,85,255,0.18)" }}
              aria-label={`Copy ${day} to another day`}
            >
              <option value="" disabled>Copy to…</option>
              {DAYS.filter(d => d !== day).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown className="w-[11px] h-[11px] absolute right-[8px] top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: B1 }} strokeWidth={2.4} />
          </div>
        )}
      </div>

      {/* Periods list */}
      <div className="p-4 flex-1 flex flex-col gap-[10px]">
        {periods.length === 0 ? (
          <div className="py-6 px-5 text-center rounded-[14px] relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, rgba(0,85,255,0.03), rgba(123,63,244,0.03))", border: "0.5px dashed rgba(0,85,255,0.22)" }}>
            <div className="absolute -top-7 -right-7 w-[100px] h-[100px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(0,85,255,0.05) 0%, transparent 70%)" }} />
            <div className="w-11 h-11 rounded-[14px] flex items-center justify-center mx-auto mb-[10px] relative z-[1]"
              style={{ background: "linear-gradient(135deg, #E5EEFF, #D4E4FF)", border: "0.5px solid rgba(0,85,255,0.15)" }}>
              <Plus className="w-5 h-5" style={{ color: B1 }} strokeWidth={2.2} />
            </div>
            <div className="text-[12px] font-semibold leading-[1.55] relative z-[1]" style={{ color: T3 }}>
              No periods added —<br />
              use the buttons below
            </div>
          </div>
        ) : (
          periods.map((p, idx) => {
            const teacherSubjects = p.teacherId ? getTeacherSubjects(p.teacherId) : [];
            return (
              <div key={p.id} className="rounded-[14px] p-3"
                style={{
                  background: p.isBreak ? "rgba(255,136,0,0.06)" : "#fff",
                  border: `0.5px solid ${p.isBreak ? "rgba(255,136,0,0.22)" : "rgba(0,85,255,0.12)"}`,
                  boxShadow: SHADOW_SM,
                }}>
                <div className="flex items-center gap-2 mb-[10px]">
                  <div className="text-[10px] font-bold w-[18px] flex-shrink-0" style={{ color: T4 }}>#{idx + 1}</div>
                  {p.isBreak && (
                    <div className="flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[10px] font-bold flex-shrink-0"
                      style={{ background: "rgba(255,136,0,0.12)", color: "#884400", border: "0.5px solid rgba(255,136,0,0.22)" }}>
                      <Coffee className="w-[11px] h-[11px]" strokeWidth={2.5} />
                      Break
                    </div>
                  )}
                  <div className="flex items-center gap-[6px] flex-1">
                    <input type="time" value={p.startTime}
                      onChange={e => onUpdatePeriod(day, p.id, { startTime: e.target.value })}
                      className="flex-1 min-w-0 h-8 px-2 rounded-[8px] text-[11px] font-semibold outline-none"
                      style={{ background: BG2, border: "0.5px solid rgba(0,85,255,0.12)", color: T1 }} />
                    <span className="text-[10px] font-bold" style={{ color: T4 }}>→</span>
                    <input type="time" value={p.endTime}
                      onChange={e => onUpdatePeriod(day, p.id, { endTime: e.target.value })}
                      className="flex-1 min-w-0 h-8 px-2 rounded-[8px] text-[11px] font-semibold outline-none"
                      style={{ background: BG2, border: "0.5px solid rgba(0,85,255,0.12)", color: T1 }} />
                  </div>
                  <button onClick={() => onRemovePeriod(day, p.id)}
                    aria-label="Remove period"
                    className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 transition-transform active:scale-90 hover:scale-105"
                    style={{ background: "rgba(255,51,85,0.08)", border: "0.5px solid rgba(255,51,85,0.18)" }}>
                    <Trash2 className="w-[14px] h-[14px]" style={{ color: "#FF3355" }} strokeWidth={2.2} />
                  </button>
                </div>
                {!p.isBreak && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <User className="w-[13px] h-[13px] absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T4 }} strokeWidth={2.3} />
                      <select value={p.teacherId}
                        onChange={e => onTeacherChange(day, p.id, e.target.value)}
                        className="w-full h-9 pl-[30px] pr-2 rounded-[9px] text-[11px] font-semibold outline-none appearance-none"
                        style={{ background: "#fff", border: "0.5px solid rgba(0,85,255,0.16)", color: p.teacherId ? T1 : T4 }}>
                        <option value="">Teacher…</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="relative">
                      <BookOpen className="w-[13px] h-[13px] absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T4 }} strokeWidth={2.3} />
                      <select value={p.subject}
                        onChange={e => onUpdatePeriod(day, p.id, { subject: e.target.value })}
                        disabled={!p.teacherId}
                        className="w-full h-9 pl-[30px] pr-2 rounded-[9px] text-[11px] font-semibold outline-none appearance-none disabled:opacity-50"
                        style={{ background: "#fff", border: "0.5px solid rgba(0,85,255,0.16)", color: p.subject ? T1 : T4 }}>
                        <option value="">{p.teacherId ? "Subject…" : "Pick teacher first"}</option>
                        {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 pb-4">
        <button onClick={() => onAddPeriod(day)}
          className="flex-1 h-[40px] rounded-[12px] flex items-center justify-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.04em] transition-transform active:scale-[0.96] hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #EEF4FF, #DDEAFF)",
            color: B1,
            border: "0.5px solid rgba(0,85,255,0.22)",
            boxShadow: "0 3px 10px rgba(0,85,255,0.14)",
          }}>
          <Plus className="w-3 h-3" strokeWidth={2.6} />
          Add Period
        </button>
        <button onClick={() => onAddBreak(day)}
          className="flex-1 h-[40px] rounded-[12px] flex items-center justify-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.04em] transition-transform active:scale-[0.96] hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #FFF4E0, #FFDB99)",
            color: "#884400",
            border: "0.5px solid rgba(255,136,0,0.3)",
            boxShadow: "0 3px 10px rgba(255,136,0,0.18)",
          }}>
          <Plus className="w-3 h-3" strokeWidth={2.6} />
          Add Break
        </button>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// GRID VIEW — traditional weekly timetable visualization
// ═════════════════════════════════════════════════════════════════════════════
interface GridViewProps {
  schedule: TimetableSetupMobileProps["schedule"];
  onJumpToDay: (day: string) => void;
}
const GridView = ({ schedule, onJumpToDay }: GridViewProps) => {
  // Align rows by period index across days
  const maxRows = Math.max(0, ...DAYS.map(d => (schedule[d] || []).length));
  const anyData = maxRows > 0;

  return (
    <div className="rounded-[22px] overflow-hidden"
      style={{ background: "#fff", boxShadow: SHADOW_LG, border: "1px solid rgba(0,85,255,0.14)" }}>
      {/* Day header row */}
      <div className="grid" style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}>
        <div className="py-[14px] px-3 text-center text-[10px] font-bold uppercase tracking-[0.10em]"
          style={{ background: "rgba(0,85,255,0.05)", color: T4, borderRight: `1px solid ${SEP}`, borderBottom: `1px solid ${SEP}` }}>
          Slot
        </div>
        {DAYS.map((d, i) => (
          <button key={d}
            onClick={() => onJumpToDay(d)}
            className="py-[14px] px-2 text-center text-[12px] font-bold transition-colors hover:bg-[#F5F9FF]"
            style={{
              background: "rgba(0,85,255,0.04)", color: T1,
              borderRight: i < DAYS.length - 1 ? `1px solid ${SEP}` : undefined,
              borderBottom: `1px solid ${SEP}`,
            }}>
            <div className="flex items-center justify-center gap-[6px]">
              <span className="w-2 h-2 rounded-full" style={{ background: DAY_DOT[d] }} />
              {d}
            </div>
            <div className="text-[9px] font-semibold mt-[3px]" style={{ color: T4 }}>
              {(schedule[d] || []).filter(p => !p.isBreak).length} periods
            </div>
          </button>
        ))}
      </div>

      {/* Period rows */}
      {!anyData ? (
        <div className="py-16 text-center">
          <div className="w-16 h-16 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
            <Grid3x3 className="w-7 h-7" style={{ color: "rgba(0,85,255,0.45)" }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-bold mb-1" style={{ color: T1 }}>Empty timetable</p>
          <p className="text-[11px]" style={{ color: T4 }}>Switch to Edit view and add periods to any day.</p>
        </div>
      ) : (
        Array.from({ length: maxRows }, (_, rowIdx) => (
          <div key={rowIdx} className="grid" style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}>
            <div className="py-3 px-3 text-center text-[11px] font-bold flex items-center justify-center"
              style={{ background: "rgba(0,85,255,0.02)", color: T3, borderRight: `1px solid ${SEP}`, borderBottom: rowIdx < maxRows - 1 ? `0.5px solid ${SEP}` : undefined }}>
              {rowIdx + 1}
            </div>
            {DAYS.map((d, i) => {
              const p = (schedule[d] || [])[rowIdx];
              const sty = p?.subject ? subjectStyle(p.subject) : null;
              return (
                <div key={d}
                  className="py-[10px] px-[10px] min-h-[70px] flex items-center justify-center"
                  style={{
                    borderRight: i < DAYS.length - 1 ? `1px solid ${SEP}` : undefined,
                    borderBottom: rowIdx < maxRows - 1 ? `0.5px solid ${SEP}` : undefined,
                  }}>
                  {!p ? (
                    <span className="text-[10px] font-medium opacity-40" style={{ color: T4 }}>—</span>
                  ) : p.isBreak ? (
                    <div className="w-full rounded-[10px] px-2 py-[6px] text-center text-[10px] font-bold"
                      style={{ background: "rgba(255,136,0,0.10)", color: "#884400", border: "0.5px solid rgba(255,136,0,0.22)" }}>
                      <div className="flex items-center justify-center gap-1 mb-[2px]">
                        <Coffee className="w-[11px] h-[11px]" strokeWidth={2.5} />
                        Break
                      </div>
                      <div className="text-[9px] font-semibold opacity-80">{p.startTime}–{p.endTime}</div>
                    </div>
                  ) : (
                    <div className="w-full rounded-[10px] px-2 py-[6px] text-center"
                      style={{ background: sty!.bg, border: `0.5px solid ${sty!.bdr}` }}>
                      <div className="text-[11px] font-bold truncate" style={{ color: sty!.text }}>
                        {p.subject || "—"}
                      </div>
                      <div className="text-[9px] font-semibold mt-[2px] truncate" style={{ color: T3 }}>
                        {p.teacherName || "No teacher"}
                      </div>
                      <div className="text-[9px] font-medium mt-[1px]" style={{ color: T4 }}>
                        {p.startTime}–{p.endTime}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN DESKTOP COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const TimetableSetupDesktop = (props: TimetableSetupDesktopProps) => {
  const {
    loading, saving, classes, selectedClass, setSelectedClass,
    schedule, teachers, viewMode, setViewMode,
    setExpandedDay,
    onSave, onAddPeriod, onAddBreak, onRemovePeriod, onUpdatePeriod,
    onTeacherChange, getTeacherSubjects, onCopyDay,
  } = props;

  // Derived
  const allPeriods = Object.values(schedule).flat();
  const totalPeriods = allPeriods.filter(p => !p.isBreak).length;
  const uniqueSubjects = new Set(allPeriods.filter(p => !p.isBreak && p.subject).map(p => p.subject)).size;
  const teachersUsed = new Set(allPeriods.filter(p => p.teacherId).map(p => p.teacherId)).size;
  const workingDays = DAYS.filter(d => (schedule[d] || []).length > 0).length;
  const cls = classes.find(c => c.id === selectedClass);
  const className = cls?.name || "Select class";

  const jumpToDayEditor = (day: string) => {
    // Switch to edit view and flag which day the user wanted (mobile uses expandedDay;
    // on desktop all days are visible so we just switch mode and scroll)
    setViewMode("edit");
    setExpandedDay(day);
    // Scroll to anchor
    requestAnimationFrame(() => {
      document.getElementById(`ttd-day-${day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="pb-10 w-full px-2" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* ── Top toolbar ── */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.7px] flex items-center gap-[10px]" style={{ color: T1 }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: GRAD_PRIMARY, boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
              <Clock className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Timetable Setup
          </div>
          <div className="text-[12px] font-normal mt-[6px] ml-[46px] flex items-center gap-[6px]" style={{ color: T3 }}>
            <span>Period Config</span>
            <span className="font-bold" style={{ color: T4 }}>·</span>
            <span>Teacher Assignments</span>
            {cls && (
              <>
                <span className="font-bold" style={{ color: T4 }}>·</span>
                <span className="font-semibold" style={{ color: B1 }}>{cls.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex bg-white rounded-[12px] p-[3px]"
            style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.12)" }}>
            {([
              { k: "edit" as const, label: "Edit", Icon: Edit3 },
              { k: "grid" as const, label: "Grid", Icon: LayoutGrid },
            ]).map(({ k, label, Icon }) => {
              const active = viewMode === k;
              return (
                <button key={k} onClick={() => setViewMode(k)}
                  className="px-[13px] py-[7px] rounded-[9px] text-[11px] font-bold uppercase tracking-[0.06em] transition-all flex items-center gap-[5px]"
                  style={active
                    ? { background: "#fff", color: B1, boxShadow: "0 2px 6px rgba(0,85,255,0.18)" }
                    : { background: "transparent", color: T4 }}>
                  <Icon className="w-[13px] h-[13px]" strokeWidth={2.3} />
                  {label}
                </button>
              );
            })}
          </div>
          <button onClick={onSave} disabled={saving || !selectedClass || loading}
            className="h-[44px] px-5 rounded-[12px] flex items-center gap-[7px] text-[12px] font-bold text-white uppercase tracking-[0.06em] transition-transform active:scale-[0.97] hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden"
            style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            {saving
              ? <><Loader2 className="w-[14px] h-[14px] relative z-10 animate-spin" /><span className="relative z-10">Saving…</span></>
              : <><Save className="w-[14px] h-[14px] relative z-10" strokeWidth={2.3} /><span className="relative z-10">Save Timetable</span></>}
          </button>
        </div>
      </div>

      {/* ── Row 2: Hero (2/3) + Class picker (1/3) ── */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Hero banner */}
        <div className="col-span-2 rounded-[22px] px-6 py-5 relative overflow-hidden flex items-center justify-between gap-5"
          style={{
            background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
            boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-[12px] min-w-0 relative z-10">
            <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
              <Grid3x3 className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] mb-[5px]" style={{ color: "rgba(255,255,255,0.50)" }}>
                {className} · Total Periods
              </div>
              <div className="text-[34px] font-bold text-white leading-none tracking-[-1px]">
                {totalPeriods}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
            {totalPeriods === 0 ? (
              <div className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-full"
                style={{ background: "rgba(255,136,0,0.22)", border: "0.5px solid rgba(255,136,0,0.4)" }}>
                <AlertTriangle className="w-[13px] h-[13px]" style={{ color: "#FFCC44" }} strokeWidth={2.5} />
                <span className="text-[12px] font-bold" style={{ color: "#FFCC44" }}>Empty</span>
              </div>
            ) : workingDays < 6 ? (
              <div className="px-[14px] py-[7px] rounded-full"
                style={{ background: "rgba(255,170,0,0.22)", border: "0.5px solid rgba(255,170,0,0.4)" }}>
                <span className="text-[12px] font-bold" style={{ color: "#FFDD88" }}>{workingDays}/6 days set</span>
              </div>
            ) : (
              <div className="px-[14px] py-[7px] rounded-full"
                style={{ background: "rgba(0,200,83,0.22)", border: "0.5px solid rgba(0,200,83,0.4)" }}>
                <span className="text-[12px] font-bold" style={{ color: "#66EE88" }}>All 6 days ready</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
              {[
                { val: uniqueSubjects, label: "Subjects", color: "#fff" },
                { val: teachersUsed, label: "Teachers", color: "#66EE88" },
                { val: workingDays, label: "Days", color: "#FFDD88" },
              ].map(({ val, label, color }) => (
                <div key={label} className="py-[10px] px-[14px] text-center min-w-[70px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[17px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                  <div className="text-[8px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Class picker */}
        <div className="rounded-[22px] bg-white p-[18px] flex items-center gap-3 relative overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="absolute -top-6 -right-6 w-[100px] h-[100px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(0,85,255,0.08) 0%, transparent 70%)" }} />
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0 relative z-10"
            style={{ background: GRAD_PRIMARY, boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
            <GraduationCap className="w-[19px] h-[19px] text-white" strokeWidth={2.3} />
          </div>
          <div className="flex-1 min-w-0 relative z-10">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] mb-[4px]" style={{ color: T4 }}>Select Class</div>
            <div className="relative">
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full h-[30px] pr-[22px] text-[18px] font-bold tracking-[-0.3px] bg-transparent outline-none appearance-none cursor-pointer truncate"
                style={{ color: T1 }}>
                {classes.length === 0 && <option value="">No classes</option>}
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T3 }} strokeWidth={2.4} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 Stat Cards — dashboard-style ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Total Periods", val: totalPeriods, sub: "Across 6 days", Icon: Clock,
            cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
            tileGrad: "linear-gradient(135deg, #0055FF, #1166FF)",
            tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
            valColor: "#0055FF", decorColor: "#0055FF",
          },
          {
            label: "Subjects", val: uniqueSubjects, sub: "Assigned", Icon: BookOpen,
            cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            tileGrad: "linear-gradient(135deg, #7B3FF4, #A07CF8)",
            tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
            valColor: "#7B3FF4", decorColor: "#7B3FF4",
          },
          {
            label: "Teachers Used", val: teachersUsed, sub: "Faculty linked", Icon: User,
            cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
            tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
            tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
            valColor: "#007830", decorColor: "#00C853",
          },
          {
            label: "Working Days", val: `${workingDays}/6`, sub: "Days scheduled", Icon: Grid3x3,
            cardGrad: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
            tileGrad: "linear-gradient(135deg, #FFAA00, #FFDD44)",
            tileShadow: "0 4px 14px rgba(255,170,0,0.28)",
            valColor: "#FFAA00", decorColor: "#FFAA00",
          },
        ].map((s, i) => {
          const Icon = s.Icon;
          return (
            <div
              key={i}
              className="rounded-[20px] p-5 relative overflow-hidden"
              style={{
                background: s.cardGrad,
                boxShadow: "0 0 0 0.5px rgba(0,85,255,0.14), 0 6px 20px rgba(0,85,255,0.10), 0 22px 56px rgba(0,85,255,0.10)",
                border: "0.5px solid rgba(0,85,255,0.08)",
              }}
            >
              <div
                className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
                style={{ background: s.tileGrad, boxShadow: s.tileShadow }}
              >
                <Icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
              </div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: "#99AACC" }}>{s.label}</span>
              <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: s.valColor, letterSpacing: "-1.2px" }}>{s.val}</p>
              <p className="text-[11px] font-semibold truncate" style={{ color: "#5070B0" }}>{s.sub}</p>
              <Icon
                className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                style={{ color: s.decorColor, opacity: 0.18 }}
                strokeWidth={2}
              />
            </div>
          );
        })}
      </div>

      {/* ── Weekly Schedule section label ── */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: T4 }}>
        Weekly Schedule
        <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.16)" }}>
          {viewMode === "grid" ? "Grid view" : "Edit view"}{cls ? ` · ${cls.name}` : ""}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* ── Content switch ── */}
      {loading ? (
        <div className="rounded-[22px] py-20 text-center bg-white"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <Loader2 className="w-9 h-9 animate-spin mx-auto mb-3" style={{ color: B1 }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>Loading timetable…</p>
        </div>
      ) : !selectedClass ? (
        <div className="rounded-[22px] py-16 bg-white text-center"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <GraduationCap className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
          <p className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: T3 }}>No class selected</p>
          <p className="text-[12px] mt-2" style={{ color: T4 }}>Pick a class from the selector above to begin.</p>
        </div>
      ) : viewMode === "grid" ? (
        <GridView schedule={schedule} onJumpToDay={jumpToDayEditor} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {DAYS.map(day => (
            <div key={day} id={`ttd-day-${day}`}>
              <DayCard
                day={day}
                periods={schedule[day] || []}
                teachers={teachers}
                onAddPeriod={onAddPeriod}
                onAddBreak={onAddBreak}
                onRemovePeriod={onRemovePeriod}
                onUpdatePeriod={onUpdatePeriod}
                onTeacherChange={onTeacherChange}
                getTeacherSubjects={getTeacherSubjects}
                onCopyDay={onCopyDay}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── AI Intelligence ── */}
      {selectedClass && !loading && (
        <div className="mt-6 rounded-[22px] px-6 py-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}>
          <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center justify-between gap-6 relative z-10">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[6px] mb-[10px]">
                <div className="w-[28px] h-[28px] rounded-[9px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <Sparkles className="w-[14px] h-[14px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.55)" }}>
                  AI Timetable Intelligence
                </span>
              </div>
              <div className="text-[13px] leading-[1.72] max-w-[720px]" style={{ color: "rgba(255,255,255,0.85)" }}>
                {totalPeriods === 0 ? (
                  <>
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{className} timetable is empty</strong> — 0 periods across 6 days.
                    Start with <strong style={{ color: "#fff", fontWeight: 700 }}>Monday</strong>, add 6–8 periods + 1–2 breaks,
                    then use <strong style={{ color: "#fff", fontWeight: 700 }}>"Copy to"</strong> on that day's header to duplicate.
                    Typical CBSE Class 10 runs <strong style={{ color: "#fff", fontWeight: 700 }}>8 periods × 40 min</strong> with a 20-min break after period 3.
                  </>
                ) : workingDays < 6 ? (
                  <>
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{6 - workingDays} day{6 - workingDays === 1 ? "" : "s"} still empty</strong> —
                    fastest path: pick a day with periods already set and use <strong style={{ color: "#fff", fontWeight: 700 }}>"Copy to"</strong> to seed the rest.
                    Per-day adjustments remain possible afterwards.
                  </>
                ) : (
                  <>
                    <strong style={{ color: "#fff", fontWeight: 700 }}>All 6 days configured</strong> with
                    <strong style={{ color: "#fff", fontWeight: 700 }}> {totalPeriods} periods</strong> across
                    <strong style={{ color: "#fff", fontWeight: 700 }}> {uniqueSubjects} subject{uniqueSubjects === 1 ? "" : "s"}</strong>
                    and <strong style={{ color: "#fff", fontWeight: 700 }}>{teachersUsed} teacher{teachersUsed === 1 ? "" : "s"}</strong>.
                    Tap <strong style={{ color: "#fff", fontWeight: 700 }}>Save Timetable</strong> to publish.
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }}>
              {[
                { val: totalPeriods, label: "Periods", color: "#fff" },
                { val: `${workingDays}/6`, label: "Days", color: "#FFDD88" },
                { val: totalPeriods === 0 ? "Empty" : workingDays < 6 ? "Partial" : "Ready", label: "Status", color: totalPeriods === 0 ? "#FF99AA" : workingDays < 6 ? "#FFDD88" : "#66EE88" },
              ].map(({ val, label, color }) => (
                <div key={label} className="py-[14px] px-5 text-center min-w-[90px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[22px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.5px" }}>{val}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimetableSetupDesktop;