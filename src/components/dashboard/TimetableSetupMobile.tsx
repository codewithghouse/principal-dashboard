import {
  Clock, Save, Loader2, Plus, Trash2, BookOpen, User,
  ChevronDown, Sparkles, Grid3x3, AlertTriangle, Coffee,
  GraduationCap,
} from "lucide-react";

// ── Types (mirror TimetableSetup.tsx) ─────────────────────────────────────────
export interface PeriodMobile {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  isBreak: boolean;
}
export type DayScheduleMobile = { [day: string]: PeriodMobile[] };

export interface TimetableSetupMobileProps {
  loading: boolean;
  saving: boolean;
  classes: any[];
  selectedClass: string;
  setSelectedClass: (id: string) => void;
  schedule: DayScheduleMobile;
  teachers: any[];
  viewMode: "edit" | "grid";
  setViewMode: (m: "edit" | "grid") => void;
  expandedDay: string;
  setExpandedDay: (d: string) => void;
  onSave: () => void;
  onAddPeriod: (day: string) => void;
  onAddBreak: (day: string) => void;
  onRemovePeriod: (day: string, periodId: string) => void;
  onUpdatePeriod: (day: string, periodId: string, patch: Partial<PeriodMobile>) => void;
  onTeacherChange: (day: string, periodId: string, teacherId: string) => void;
  getTeacherSubjects: (teacherId: string) => string[];
  onCopyDay: (fromDay: string, toDay: string) => void;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Day accent colours matching design
const DAY_DOT: Record<string, string> = {
  Monday: "#0055FF",
  Tuesday: "#7B3FF4",
  Wednesday: "#00C853",
  Thursday: "#FFAA00",
  Friday: "#FF8800",
  Saturday: "#FF3355",
};

// ── Palette ───────────────────────────────────────────────────────────────────
const B1 = "#0055FF", B2 = "#1166FF";
const BG = "#EEF4FF", BG2 = "#E0ECFF";
const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
const SEP = "rgba(0,85,255,0.07)";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const SHADOW_SM  = "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)";
const SHADOW_LG  = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)";
const SHADOW_BTN = "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)";

const TimetableSetupMobile = ({
  loading, saving, classes, selectedClass, setSelectedClass,
  schedule, teachers, viewMode, setViewMode,
  expandedDay, setExpandedDay,
  onSave, onAddPeriod, onAddBreak, onRemovePeriod, onUpdatePeriod,
  onTeacherChange, getTeacherSubjects, onCopyDay,
}: TimetableSetupMobileProps) => {

  // Derived stats
  const allPeriods = Object.values(schedule).flat();
  const totalPeriods = allPeriods.filter(p => !p.isBreak).length;
  const uniqueSubjects = new Set(allPeriods.filter(p => !p.isBreak && p.subject).map(p => p.subject)).size;
  const teachersUsed = new Set(allPeriods.filter(p => p.teacherId).map(p => p.teacherId)).size;
  const workingDays = DAYS.filter(d => (schedule[d] || []).length > 0).length;
  const cls = classes.find(c => c.id === selectedClass);
  const className = cls?.name || "Select class";

  const toggleDay = (day: string) => {
    setExpandedDay(expandedDay === day ? "" : day);
  };

  return (
    <div
      className="pb-6"
      style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}
    >

      {/* Page head */}
      <div className="px-5 pt-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[24px] font-bold leading-tight tracking-[-0.6px] flex items-center gap-2" style={{ color: T1 }}>
            <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{ background: GRAD_PRIMARY, boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
              <Clock className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            Timetable Setup
          </div>
          <div className="text-[11px] font-normal mt-1 flex items-center gap-[5px]" style={{ color: T3 }}>
            <span>Period Config</span>
            <span className="font-bold" style={{ color: T4 }}>·</span>
            <span>Teacher Assignments</span>
          </div>
        </div>
      </div>

      {/* Action row: view toggle + save */}
      <div className="flex gap-[7px] px-5 pt-3 items-center">
        <div className="flex bg-white rounded-[11px] p-[3px] flex-shrink-0"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.12)" }}>
          {(["edit", "grid"] as const).map(m => {
            const active = viewMode === m;
            return (
              <button key={m} onClick={() => setViewMode(m)}
                className="px-[11px] py-[6px] rounded-[8px] text-[10px] font-bold uppercase tracking-[0.06em] transition-all"
                style={active
                  ? { background: "#fff", color: B1, boxShadow: "0 2px 6px rgba(0,85,255,0.18)" }
                  : { background: "transparent", color: T4 }}>
                {m}
              </button>
            );
          })}
        </div>
        <button onClick={onSave} disabled={saving || !selectedClass || loading}
          className="flex-1 h-[38px] rounded-[12px] flex items-center justify-center gap-[6px] text-[11px] font-bold text-white uppercase tracking-[0.04em] transition-transform active:scale-[0.97] disabled:opacity-50 relative overflow-hidden"
          style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
          <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          {saving
            ? <><Loader2 className="w-[13px] h-[13px] relative z-10 animate-spin" /><span className="relative z-10">Saving…</span></>
            : <><Save className="w-[13px] h-[13px] relative z-10" strokeWidth={2.4} /><span className="relative z-10">Save Timetable</span></>}
        </button>
      </div>

      {/* Hero banner */}
      <div className="mx-5 mt-3.5 rounded-[22px] px-[18px] py-4 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-9 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between mb-[14px] relative z-10 gap-2">
          <div className="flex items-center gap-[10px] min-w-0">
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
              <Grid3x3 className="w-[18px] h-[18px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px] truncate" style={{ color: "rgba(255,255,255,0.50)" }}>
                {className} · Total Periods
              </div>
              <div className="text-[26px] font-bold text-white leading-none tracking-[-0.8px]">
                {totalPeriods}
              </div>
            </div>
          </div>
          {totalPeriods === 0 ? (
            <div className="flex items-center gap-[5px] px-3 py-[5px] rounded-full flex-shrink-0"
              style={{ background: "rgba(255,136,0,0.22)", border: "0.5px solid rgba(255,136,0,0.4)" }}>
              <AlertTriangle className="w-[11px] h-[11px]" style={{ color: "#FFCC44" }} strokeWidth={2.5} />
              <span className="text-[11px] font-bold" style={{ color: "#FFCC44" }}>Empty</span>
            </div>
          ) : (
            <div className="flex items-center gap-[5px] px-3 py-[5px] rounded-full flex-shrink-0"
              style={{ background: "rgba(0,200,83,0.22)", border: "0.5px solid rgba(0,200,83,0.4)" }}>
              <span className="text-[11px] font-bold" style={{ color: "#66EE88" }}>{workingDays}/6 Days</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
          {[
            { val: uniqueSubjects, label: "Subjects", color: "#fff" },
            { val: teachersUsed, label: "Teachers", color: "#66EE88" },
            { val: workingDays, label: "Days Set", color: "#FFDD88" },
          ].map(({ val, label, color }) => (
            <div key={label} className="py-[11px] px-[10px] text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="text-[16px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.3px" }}>{val}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Class picker */}
      <div className="mx-5 mt-3.5 rounded-[18px] bg-white p-[14px] px-4 flex items-center gap-3 relative overflow-hidden"
        style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
        <div className="absolute -top-5 -right-5 w-[90px] h-[90px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0,85,255,0.08) 0%, transparent 70%)" }} />
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 relative z-10"
          style={{ background: GRAD_PRIMARY, boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
          <GraduationCap className="w-[18px] h-[18px] text-white" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0 relative z-10">
          <div className="text-[9px] font-bold uppercase tracking-[0.10em] mb-[3px]" style={{ color: T4 }}>Select Class</div>
          <div className="text-[18px] font-bold leading-none tracking-[-0.3px] truncate" style={{ color: T1 }}>
            {className}
          </div>
        </div>
        <div className="relative z-10 flex-shrink-0">
          <ChevronDown className="w-4 h-4" style={{ color: T3 }} strokeWidth={2.4} />
          <select
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            style={{ width: "100%", height: "100%" }}>
            {classes.length === 0 && <option value="">No classes</option>}
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Bright stat cards 2x2 */}
      <div className="grid grid-cols-2 gap-[10px] px-5 pt-3.5">
        {[
          { label: "Total Periods", val: totalPeriods, sub: "Across 6 days", variant: "blue" },
          { label: "Subjects", val: uniqueSubjects, sub: "Assigned", variant: "violet" },
          { label: "Teachers Used", val: teachersUsed, sub: "Faculty linked", variant: "green" },
          { label: "Working Days", val: workingDays, sub: "Of 6 scheduled", variant: "gold" },
        ].map((s, i) => {
          const styles: Record<string, { bg: string; bdr: string; lbl: string; val: string; ico: React.ReactNode }> = {
            blue: {
              bg: "linear-gradient(140deg, #DDEAFF 0%, #A8C5FF 55%, #7AA5FF 100%)",
              bdr: "rgba(0,85,255,0.4)", lbl: "#002080", val: "#001055",
              ico: <Clock className="w-[14px] h-[14px]" style={{ color: "#001055" }} strokeWidth={2.5} />,
            },
            violet: {
              bg: "linear-gradient(140deg, #EEE0FF 0%, #C9A8FF 55%, #A880FF 100%)",
              bdr: "rgba(123,63,244,0.4)", lbl: "#3A1580", val: "#280C5C",
              ico: <BookOpen className="w-[14px] h-[14px]" style={{ color: "#3A1580" }} strokeWidth={2.5} />,
            },
            green: {
              bg: "linear-gradient(140deg, #DEFCE8 0%, #8CF0B0 55%, #50E088 100%)",
              bdr: "rgba(0,200,83,0.4)", lbl: "#005A20", val: "#004018",
              ico: <User className="w-[14px] h-[14px]" style={{ color: "#005A20" }} strokeWidth={2.5} />,
            },
            gold: {
              bg: "linear-gradient(140deg, #FFF6D1 0%, #FFE488 55%, #FFCC33 100%)",
              bdr: "rgba(255,170,0,0.4)", lbl: "#664400", val: "#472A00",
              ico: <Grid3x3 className="w-[14px] h-[14px]" style={{ color: "#664400" }} strokeWidth={2.5} />,
            },
          };
          const st = styles[s.variant];
          return (
            <div key={i} className="rounded-[20px] p-[15px] relative overflow-hidden"
              style={{ background: st.bg, border: `0.5px solid ${st.bdr}`, boxShadow: "0 10px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>
              <div className="absolute -top-5 -right-4 w-20 h-20 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)" }} />
              <div className="absolute top-3 right-3 w-[30px] h-[30px] rounded-[10px] flex items-center justify-center z-[1]"
                style={{ background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(255,255,255,0.95)", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                {st.ico}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-2 relative z-[1]" style={{ color: st.lbl }}>{s.label}</div>
              <div className="text-[28px] font-bold leading-none tracking-[-0.9px] mb-1 relative z-[1]" style={{ color: st.val }}>{s.val}</div>
              <div className="text-[10px] font-semibold relative z-[1]" style={{ color: st.lbl }}>{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Weekly Schedule section label */}
      <div className="px-5 pt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
        Weekly Schedule
        <span className="px-[9px] py-[3px] rounded-full text-[9px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.16)" }}>
          6 days{cls ? ` · ${cls.name}` : ""}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3" style={{ color: B1 }} />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: T4 }}>Loading timetable…</p>
        </div>
      ) : !selectedClass ? (
        <div className="mx-5 mt-3 rounded-[22px] py-10 px-5 bg-white text-center"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <GraduationCap className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
          <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: T3 }}>No class selected</p>
          <p className="text-[11px] mt-2" style={{ color: T4 }}>Add a class via Classes & Sections first.</p>
        </div>
      ) : (
        /* DAY ROWS */
        DAYS.map(day => {
          const periods = schedule[day] || [];
          const isExpanded = expandedDay === day;
          const dayDot = DAY_DOT[day];
          const periodCount = periods.filter(p => !p.isBreak).length;
          const needsSetup = periods.length === 0;

          return (
            <div key={day} className="mx-5 mt-[10px] rounded-[18px] overflow-hidden transition-all"
              style={{
                background: isExpanded ? "linear-gradient(180deg, #FFFFFF 0%, #F7FAFF 100%)" : "#fff",
                boxShadow: isExpanded ? SHADOW_LG : SHADOW_SM,
                border: isExpanded ? "1px solid rgba(0,85,255,0.25)" : "0.5px solid rgba(0,85,255,0.08)",
              }}>
              {/* Day head */}
              <button onClick={() => toggleDay(day)}
                className="w-full px-[14px] pr-4 py-3 flex items-center gap-[11px] active:scale-[0.99] transition-transform"
                style={isExpanded ? { borderBottom: `0.5px solid ${SEP}` } : {}}>
                <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
                  style={isExpanded
                    ? { background: GRAD_PRIMARY, boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }
                    : { background: "linear-gradient(135deg, #E5EEFF, #D4E4FF)", border: "0.5px solid rgba(0,85,255,0.15)" }}>
                  <Clock className="w-4 h-4" style={{ color: isExpanded ? "#fff" : T3 }} strokeWidth={2.3} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[15px] font-bold tracking-[-0.2px] flex items-center gap-[5px]" style={{ color: T1 }}>
                    <span className="w-[7px] h-[7px] rounded-full inline-block flex-shrink-0" style={{ background: dayDot }} />
                    {day}
                  </div>
                  <div className="text-[10px] font-medium mt-[2px] flex items-center gap-[5px]" style={{ color: T4 }}>
                    <span className="px-[7px] py-[2px] rounded-full text-[8px] font-bold"
                      style={isExpanded
                        ? { background: "rgba(255,136,0,0.10)", color: "#884400", border: "0.5px solid rgba(255,136,0,0.22)" }
                        : { background: "rgba(0,85,255,0.08)", color: B1, border: "0.5px solid rgba(0,85,255,0.14)", letterSpacing: "0.02em" }}>
                      {periodCount} {periodCount === 1 ? "Period" : "Periods"}
                    </span>
                    {isExpanded && needsSetup && <span style={{ color: "#884400" }}>· Needs setup</span>}
                  </div>
                </div>
                <div className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-shrink-0 transition-transform"
                  style={isExpanded
                    ? { background: GRAD_PRIMARY, border: "0.5px solid transparent", transform: "rotate(180deg)" }
                    : { background: BG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
                  <ChevronDown className="w-[14px] h-[14px]" style={{ color: isExpanded ? "#fff" : T3 }} strokeWidth={2.4} />
                </div>
              </button>

              {/* Day body */}
              {isExpanded && (
                <div className="px-4 pt-[14px] pb-4">
                  {periods.length === 0 ? (
                    <div className="py-[26px] px-5 text-center rounded-[14px] relative overflow-hidden mb-3"
                      style={{ background: "linear-gradient(135deg, rgba(0,85,255,0.03), rgba(123,63,244,0.03))", border: "0.5px dashed rgba(0,85,255,0.22)" }}>
                      <div className="absolute -top-7 -right-7 w-[100px] h-[100px] rounded-full pointer-events-none"
                        style={{ background: "radial-gradient(circle, rgba(0,85,255,0.05) 0%, transparent 70%)" }} />
                      <div className="w-11 h-11 rounded-[14px] flex items-center justify-center mx-auto mb-[10px] relative z-[1]"
                        style={{ background: "linear-gradient(135deg, #E5EEFF, #D4E4FF)", border: "0.5px solid rgba(0,85,255,0.15)" }}>
                        <Plus className="w-5 h-5" style={{ color: B1 }} strokeWidth={2.2} />
                      </div>
                      <div className="text-[12px] font-semibold leading-[1.55] relative z-[1]" style={{ color: T3 }}>
                        No periods added —<br />
                        tap <strong style={{ color: T1, fontWeight: 700 }}>"Add Period"</strong> below
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 mb-3">
                      {periods.map((p, idx) => {
                        const teacherSubjects = p.teacherId ? getTeacherSubjects(p.teacherId) : [];
                        return (
                          <div key={p.id} className="rounded-[14px] p-3"
                            style={{
                              background: p.isBreak ? "rgba(255,136,0,0.06)" : "#fff",
                              border: `0.5px solid ${p.isBreak ? "rgba(255,136,0,0.22)" : "rgba(0,85,255,0.10)"}`,
                              boxShadow: SHADOW_SM,
                            }}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-[10px] font-bold w-[18px] flex-shrink-0" style={{ color: T4 }}>
                                #{idx + 1}
                              </div>
                              {p.isBreak ? (
                                <div className="flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[10px] font-bold flex-shrink-0"
                                  style={{ background: "rgba(255,136,0,0.12)", color: "#884400", border: "0.5px solid rgba(255,136,0,0.22)" }}>
                                  <Coffee className="w-[11px] h-[11px]" strokeWidth={2.5} />
                                  Break
                                </div>
                              ) : null}
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
                                className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
                                style={{ background: "rgba(255,51,85,0.08)", border: "0.5px solid rgba(255,51,85,0.18)" }}>
                                <Trash2 className="w-[14px] h-[14px]" style={{ color: "#FF3355" }} strokeWidth={2.2} />
                              </button>
                            </div>
                            {!p.isBreak && (
                              <div className="flex flex-col gap-[6px]">
                                <select value={p.teacherId}
                                  onChange={e => onTeacherChange(day, p.id, e.target.value)}
                                  className="w-full h-9 px-2 rounded-[9px] text-[11px] font-semibold outline-none"
                                  style={{ background: "#fff", border: "0.5px solid rgba(0,85,255,0.16)", color: p.teacherId ? T1 : T4 }}>
                                  <option value="">Select teacher…</option>
                                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <select value={p.subject}
                                  onChange={e => onUpdatePeriod(day, p.id, { subject: e.target.value })}
                                  disabled={!p.teacherId}
                                  className="w-full h-9 px-2 rounded-[9px] text-[11px] font-semibold outline-none disabled:opacity-50"
                                  style={{ background: "#fff", border: "0.5px solid rgba(0,85,255,0.16)", color: p.subject ? T1 : T4 }}>
                                  <option value="">{p.teacherId ? "Select subject…" : "Pick teacher first"}</option>
                                  {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button onClick={() => onAddPeriod(day)}
                      className="flex-1 h-[42px] rounded-[12px] flex items-center justify-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.04em] transition-transform active:scale-[0.96]"
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
                      className="flex-1 h-[42px] rounded-[12px] flex items-center justify-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.04em] transition-transform active:scale-[0.96]"
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

                  {/* Copy to another day — only when this day has periods */}
                  {periods.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                      <span className="text-[9px] font-bold uppercase tracking-[0.10em] flex-shrink-0" style={{ color: T4 }}>
                        Copy to:
                      </span>
                      {DAYS.filter(d => d !== day).map(d => (
                        <button key={d} onClick={() => onCopyDay(day, d)}
                          className="flex-shrink-0 px-[10px] py-[5px] rounded-full text-[10px] font-bold active:scale-95 transition-transform"
                          style={{ background: "#fff", color: T2, border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: SHADOW_SM }}>
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* AI Timetable Intelligence */}
      {selectedClass && !loading && (
        <div className="mx-5 mt-3 rounded-[22px] px-5 py-[18px] relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}>
          <div className="absolute -top-9 -right-5 w-[140px] h-[140px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-[6px] mb-[10px] relative z-10">
            <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Sparkles className="w-[13px] h-[13px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              AI Timetable Intelligence
            </span>
          </div>
          <div className="text-[12px] leading-[1.72] relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
            {totalPeriods === 0 ? (
              <>
                <strong style={{ color: "#fff", fontWeight: 700 }}>{className} timetable is empty</strong> — 0 periods across 6 days.
                Start with <strong style={{ color: "#fff", fontWeight: 700 }}>Monday</strong>, add 6–8 periods + 1–2 breaks,
                then tap a day's <strong style={{ color: "#fff", fontWeight: 700 }}>Copy to</strong> chip to duplicate.
                Typical CBSE Class 10 runs <strong style={{ color: "#fff", fontWeight: 700 }}>8 periods × 40 min</strong> with a 20-min break after period 3.
              </>
            ) : workingDays < 6 ? (
              <>
                <strong style={{ color: "#fff", fontWeight: 700 }}>{6 - workingDays} day{6 - workingDays === 1 ? "" : "s"} still empty</strong> —
                fastest path: pick the day with <strong style={{ color: "#fff", fontWeight: 700 }}>{totalPeriods} periods</strong> already set,
                and use <strong style={{ color: "#fff", fontWeight: 700 }}>"Copy to"</strong> to seed the rest.
                You can adjust per-day afterwards.
              </>
            ) : (
              <>
                <strong style={{ color: "#fff", fontWeight: 700 }}>All 6 days configured</strong> with
                <strong style={{ color: "#fff", fontWeight: 700 }}> {totalPeriods} periods</strong> across
                <strong style={{ color: "#fff", fontWeight: 700 }}> {uniqueSubjects} subject{uniqueSubjects === 1 ? "" : "s"}</strong>.
                Tap <strong style={{ color: "#fff", fontWeight: 700 }}>Save Timetable</strong> to publish.
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden mt-3 relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: totalPeriods, label: "Periods", color: "#fff" },
              { val: `${workingDays}/6`, label: "Days", color: "#FFDD88" },
              { val: totalPeriods === 0 ? "Empty" : workingDays < 6 ? "Partial" : "Ready", label: "Status", color: totalPeriods === 0 ? "#FF99AA" : workingDays < 6 ? "#FFDD88" : "#66EE88" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-3 px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[19px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.5px" }}>{val}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default TimetableSetupMobile;