import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, doc,
  setDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import TimetableSetupMobile from "@/components/dashboard/TimetableSetupMobile";
import TimetableSetupDesktop from "@/components/dashboard/TimetableSetupDesktop";

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

// ── Component ─────────────────────────────────────────────────────────────────
const TimetableSetup = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

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

  const addBreak = (day: string) => {
    const b: Period = { ...emptyPeriod(), isBreak: true, subject: "Break" };
    setSchedule(s => ({
      ...s,
      [day]: [...(s[day] || []), b],
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

  // ── Render — route mobile → TimetableSetupMobile, desktop → TimetableSetupDesktop ──
  const sharedProps = {
    loading,
    saving,
    classes,
    selectedClass,
    setSelectedClass,
    schedule,
    teachers,
    viewMode,
    setViewMode,
    expandedDay,
    setExpandedDay,
    onSave: handleSave,
    onAddPeriod: addPeriod,
    onAddBreak: addBreak,
    onRemovePeriod: removePeriod,
    onUpdatePeriod: updatePeriod,
    onTeacherChange: handleTeacherChange,
    getTeacherSubjects,
    onCopyDay: copyDaySchedule,
  };

  return isMobile
    ? <TimetableSetupMobile {...sharedProps} />
    : <TimetableSetupDesktop {...sharedProps} />;
};

export default TimetableSetup;
