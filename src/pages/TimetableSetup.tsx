import { useState, useEffect } from "react";
import {
  Clock, Save, Loader2, Plus, Trash2, BookOpen,
  User, ChevronDown, ChevronUp, Grid3x3
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, doc,
  setDoc, serverTimestamp, getDocs
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Period {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  isBreak: boolean;
}

interface DaySchedule {
  [day: string]: Period[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const emptyPeriod = (): Period => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  startTime: "08:00",
  endTime: "08:45",
  subject: "",
  teacherId: "",
  teacherName: "",
  isBreak: false,
});

const SUBJECT_COLORS: Record<string, string> = {
  Math: "bg-blue-100 text-blue-700 border-blue-200",
  Science: "bg-emerald-100 text-emerald-700 border-emerald-200",
  English: "bg-purple-100 text-purple-700 border-purple-200",
  Hindi: "bg-orange-100 text-orange-700 border-orange-200",
  History: "bg-amber-100 text-amber-700 border-amber-200",
  Geography: "bg-teal-100 text-teal-700 border-teal-200",
  PE: "bg-rose-100 text-rose-700 border-rose-200",
  Art: "bg-pink-100 text-pink-700 border-pink-200",
  Computer: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Break: "bg-slate-100 text-slate-500 border-slate-200",
  Lunch: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const subjectColor = (subject: string) => {
  for (const key of Object.keys(SUBJECT_COLORS)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) return SUBJECT_COLORS[key];
  }
  return "bg-slate-50 text-slate-600 border-slate-100";
};

// ── Component ─────────────────────────────────────────────────────────────────
const TimetableSetup = () => {
  const { userData } = useAuth();

  const [classes, setClasses]             = useState<any[]>([]);
  const [teachers, setTeachers]           = useState<any[]>([]);
  // teacherSubjectsMap: teacherId → string[] (subjects from teaching_assignments)
  const [teacherSubjectsMap, setTeacherSubjectsMap] = useState<Map<string, string[]>>(new Map());
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [schedule, setSchedule]           = useState<DaySchedule>({});
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [expandedDay, setExpandedDay]     = useState<string>("Monday");
  const [viewMode, setViewMode]           = useState<"edit" | "grid">("edit");

  // ── Firestore listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];

    const unsubCls = onSnapshot(query(collection(db, "classes"), ...C), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClasses(list);
      if (list.length > 0 && !selectedClass) setSelectedClass(list[0].id);
      setLoading(false);
    });

    const unsubT = onSnapshot(query(collection(db, "teachers"), ...C), snap => {
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // teaching_assignments → build teacherId → subjects[] map
    // Each assignment doc has: teacherId, classId, subjectId / subject / subjectName
    const unsubAssign = onSnapshot(
      query(collection(db, "teaching_assignments"), ...C),
      snap => {
        const map = new Map<string, string[]>();
        snap.docs.forEach(d => {
          const a = d.data();
          const tid = a.teacherId;
          if (!tid) return;
          // Try every possible field name for subject
          const sub: string = (
            a.subjectId || a.subject || a.subjectName || a.subjects || ""
          ).toString().trim();
          if (!sub) return;
          // subjectId might be comma-separated or a single name
          const parts = sub.includes(",")
            ? sub.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [sub];
          const existing = map.get(tid) || [];
          const merged = Array.from(new Set([...existing, ...parts]));
          map.set(tid, merged);
        });
        setTeacherSubjectsMap(new Map(map));
      }
    );

    return () => { unsubCls(); unsubT(); unsubAssign(); };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Load timetable when class changes ────────────────────────────────────
  useEffect(() => {
    if (!selectedClass || !userData?.schoolId) return;

    const ttRef = doc(db, "timetable", `${userData.schoolId}_${userData.branchId}_${selectedClass}`);
    const unsub = onSnapshot(ttRef, snap => {
      if (snap.exists()) {
        setSchedule(snap.data()?.schedule || {});
      } else {
        // Initialise empty schedule for each day
        const empty: DaySchedule = {};
        DAYS.forEach(d => { empty[d] = []; });
        setSchedule(empty);
      }
    });
    return () => unsub();
  }, [selectedClass, userData?.schoolId, userData?.branchId]);

  // ── Save timetable ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedClass) return toast.error("Select a class first.");
    setSaving(true);
    try {
      const ttId  = `${userData!.schoolId}_${userData!.branchId}_${selectedClass}`;
      const cls   = classes.find(c => c.id === selectedClass);
      await setDoc(doc(db, "timetable", ttId), {
        classId:   selectedClass,
        className: cls?.name || selectedClass,
        schoolId:  userData!.schoolId,
        branchId:  userData!.branchId,
        schedule,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Timetable for ${cls?.name || selectedClass} saved!`);
    } catch (e: any) {
      toast.error("Save failed: " + e.message);
    }
    setSaving(false);
  };

  // ── Helpers for period management ──────────────────────────────────────────
  const addPeriod = (day: string) => {
    setSchedule(s => ({
      ...s,
      [day]: [...(s[day] || []), emptyPeriod()],
    }));
  };

  const removePeriod = (day: string, periodId: string) => {
    setSchedule(s => ({
      ...s,
      [day]: (s[day] || []).filter(p => p.id !== periodId),
    }));
  };

  const updatePeriod = (day: string, periodId: string, patch: Partial<Period>) => {
    setSchedule(s => ({
      ...s,
      [day]: (s[day] || []).map(p => p.id === periodId ? { ...p, ...patch } : p),
    }));
  };

  // Get subjects for a teacher: teaching_assignments map first, teacher doc as fallback
  const getTeacherSubjects = (teacherId: string): string[] => {
    // 1. From teaching_assignments (most accurate — what they actually teach)
    const fromAssignments = teacherSubjectsMap.get(teacherId) || [];
    if (fromAssignments.length > 0) return fromAssignments;

    // 2. Fallback: teacher document fields
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return [];
    const raw =
      teacher.subjects ??
      teacher.subject ??
      teacher.subjectName ??
      teacher.primarySubject ??
      "";
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === "string" && raw.trim()) {
      return raw.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  };

  const handleTeacherChange = (day: string, periodId: string, teacherId: string) => {
    const teacher  = teachers.find(t => t.id === teacherId);
    const subjects = getTeacherSubjects(teacherId);
    updatePeriod(day, periodId, {
      teacherId,
      teacherName: teacher?.name || "",
      // Auto-select first subject; user can change from dropdown
      subject: subjects.length > 0 ? subjects[0] : "",
    });
  };

  const copyDaySchedule = (fromDay: string, toDay: string) => {
    const src = schedule[fromDay] || [];
    const copied = src.map(p => ({
      ...p,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
    }));
    setSchedule(s => ({ ...s, [toDay]: copied }));
    toast.success(`Copied ${fromDay}'s schedule to ${toDay}`);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const allPeriods = Object.values(schedule).flat();
  const totalPeriods  = allPeriods.filter(p => !p.isBreak).length;
  const uniqueSubjects = new Set(allPeriods.filter(p => !p.isBreak && p.subject).map(p => p.subject)).size;
  const teachersUsed  = new Set(allPeriods.filter(p => p.teacherId).map(p => p.teacherId)).size;
  const cls = classes.find(c => c.id === selectedClass);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 text-left">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Timetable Setup</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#1e3a8a]" /> Period Configuration · Teacher Assignments
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-2xl p-1">
            {(["edit", "grid"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  viewMode === m ? "bg-white text-[#1e3a8a] shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}>
                {m === "edit" ? "Edit" : "Grid View"}
              </button>
            ))}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !selectedClass}
            className="flex items-center gap-2 px-8 py-4 bg-[#1e3a8a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Timetable"}
          </button>
        </div>
      </div>

      {/* Class selector + stats */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="bg-white rounded-2xl border-2 border-slate-50 p-5 shadow-sm min-w-[220px]">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Select Class</label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : (
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-300 transition-all appearance-none"
            >
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 flex-1">
          {[
            { label: "Total Periods",  value: totalPeriods,   icon: <Clock className="w-4 h-4 text-blue-500" />,   bg: "bg-blue-50",   txt: "text-blue-700" },
            { label: "Subjects",       value: uniqueSubjects,  icon: <BookOpen className="w-4 h-4 text-purple-500" />, bg: "bg-purple-50", txt: "text-purple-700" },
            { label: "Teachers Used",  value: teachersUsed,    icon: <User className="w-4 h-4 text-emerald-500" />,  bg: "bg-emerald-50", txt: "text-emerald-700" },
            { label: "Working Days",   value: DAYS.filter(d => (schedule[d] || []).length > 0).length, icon: <Grid3x3 className="w-4 h-4 text-amber-500" />, bg: "bg-amber-50", txt: "text-amber-700" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl px-5 py-4 flex items-center gap-3 flex-1 min-w-[130px]`}>
              <div className="w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center shadow-sm shrink-0">{s.icon}</div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                <p className={`text-xl font-black ${s.txt}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── GRID VIEW ──────────────────────────────────────────────────────────── */}
      {viewMode === "grid" ? (
        <div className="bg-white rounded-3xl border-2 border-slate-50 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-2">
            <Grid3x3 className="w-4 h-4 text-[#1e3a8a]" />
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
              {cls?.name || "Class"} — Weekly Timetable
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest w-20">Period</th>
                  {DAYS.map(d => (
                    <th key={d} className="px-3 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">{d.slice(0,3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(() => {
                  // Get max period count across days
                  const maxPeriods = Math.max(...DAYS.map(d => (schedule[d] || []).length), 0);
                  if (maxPeriods === 0) {
                    return (
                      <tr><td colSpan={DAYS.length + 1} className="py-16 text-center text-slate-400 text-[10px] font-black">
                        No periods added yet. Switch to Edit mode to add periods.
                      </td></tr>
                    );
                  }
                  return Array.from({ length: maxPeriods }, (_, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-[10px] font-black text-slate-400">{i + 1}</td>
                      {DAYS.map(day => {
                        const period = (schedule[day] || [])[i];
                        if (!period) return <td key={day} className="px-3 py-3"></td>;
                        return (
                          <td key={day} className="px-2 py-2">
                            <div className={`rounded-xl px-3 py-2 border text-center ${period.isBreak ? SUBJECT_COLORS.Break : subjectColor(period.subject)}`}>
                              <p className="font-black text-[10px] leading-tight">
                                {period.isBreak ? "Break" : (period.subject || "—")}
                              </p>
                              {!period.isBreak && period.teacherName && (
                                <p className="text-[8px] opacity-70 mt-0.5 truncate">{period.teacherName}</p>
                              )}
                              <p className="text-[8px] opacity-60 mt-0.5">{period.startTime}–{period.endTime}</p>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── EDIT VIEW ───────────────────────────────────────────────────────── */
        <div className="space-y-3">
          {DAYS.map(day => {
            const periods = schedule[day] || [];
            const isExpanded = expandedDay === day;

            return (
              <div key={day} className="bg-white rounded-3xl border-2 border-slate-50 overflow-hidden shadow-sm">
                {/* Day header */}
                <div
                  className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                  onClick={() => setExpandedDay(isExpanded ? "" : day)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-[#1e3a8a]/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-[#1e3a8a]" />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm">{day}</p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {periods.length} period{periods.length !== 1 ? "s" : ""}
                        {periods.filter(p => !p.isBreak && p.subject).length > 0 &&
                          ` · ${periods.filter(p => !p.isBreak && p.subject).map(p => p.subject).join(", ").slice(0, 60)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {periods.length > 0 && day !== "Monday" && (
                      <button
                        onClick={e => { e.stopPropagation(); copyDaySchedule("Monday", day); }}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-[9px] font-black text-slate-500 hover:bg-slate-200 transition-colors uppercase tracking-widest"
                        title="Copy Monday's schedule"
                      >
                        Copy Mon
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Periods list */}
                {isExpanded && (
                  <div className="border-t border-slate-50 px-6 pb-5 pt-4 space-y-3">
                    {periods.length === 0 && (
                      <p className="text-xs text-slate-400 font-bold text-center py-4">No periods added — click "Add Period" below</p>
                    )}
                    {periods.map((period, idx) => (
                      <div key={period.id} className={`rounded-2xl border p-4 ${period.isBreak ? "bg-slate-50 border-slate-100" : "bg-white border-slate-100"}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-6 h-6 rounded-lg bg-[#1e3a8a]/10 text-[#1e3a8a] text-[10px] font-black flex items-center justify-center">{idx + 1}</span>
                          <div className="flex items-center gap-2 ml-auto">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={period.isBreak}
                                onChange={e => updatePeriod(day, period.id, { isBreak: e.target.checked, subject: e.target.checked ? "Break" : "" })}
                                className="rounded"
                              />
                              Break / Recess
                            </label>
                            <button onClick={() => removePeriod(day, period.id)}
                              className="w-7 h-7 rounded-lg hover:bg-rose-50 text-rose-400 flex items-center justify-center transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {/* Start time */}
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Start</label>
                            <input type="time" value={period.startTime}
                              onChange={e => updatePeriod(day, period.id, { startTime: e.target.value })}
                              className="w-full h-9 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-300 transition-all" />
                          </div>
                          {/* End time */}
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">End</label>
                            <input type="time" value={period.endTime}
                              onChange={e => updatePeriod(day, period.id, { endTime: e.target.value })}
                              className="w-full h-9 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-300 transition-all" />
                          </div>
                          {/* Subject — dropdown from teaching_assignments, else free text */}
                          {!period.isBreak && (
                            <div>
                              {(() => {
                                const subs = period.teacherId ? getTeacherSubjects(period.teacherId) : [];
                                return (
                                  <>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block flex items-center gap-1">
                                      Subject
                                      {subs.length > 0 && (
                                        <span className="text-[8px] text-blue-400 normal-case tracking-normal font-bold">
                                          · {subs.length} from Firebase
                                        </span>
                                      )}
                                    </label>
                                    {subs.length > 0 ? (
                                      <select
                                        value={period.subject}
                                        onChange={e => updatePeriod(day, period.id, { subject: e.target.value })}
                                        className="w-full h-9 px-2 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-800 outline-none focus:border-blue-400 transition-all"
                                      >
                                        <option value="">— Select Subject —</option>
                                        {subs.map(s => (
                                          <option key={s} value={s}>{s}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        value={period.subject}
                                        onChange={e => updatePeriod(day, period.id, { subject: e.target.value })}
                                        placeholder={period.teacherId ? "No subjects in Firebase — type manually" : "Select teacher first"}
                                        className="w-full h-9 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-300 transition-all placeholder:text-slate-300"
                                      />
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          {/* Teacher */}
                          {!period.isBreak && (
                            <div>
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Teacher</label>
                              <select
                                value={period.teacherId}
                                onChange={e => handleTeacherChange(day, period.id, e.target.value)}
                                className="w-full h-9 px-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-300 transition-all"
                              >
                                <option value="">— Assign —</option>
                                {teachers.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add period / break */}
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => addPeriod(day)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#1e3a8a]/30 text-[#1e3a8a] text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Add Period
                      </button>
                      <button onClick={() => {
                        const breakPeriod = emptyPeriod();
                        breakPeriod.isBreak = true;
                        breakPeriod.subject = "Break";
                        setSchedule(s => ({ ...s, [day]: [...(s[day] || []), breakPeriod] }));
                      }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-amber-200 text-amber-600 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Add Break
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TimetableSetup;
