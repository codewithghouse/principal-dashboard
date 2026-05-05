import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Download, MessageSquare, FileText, Loader2 } from 'lucide-react';
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { db, auth } from "@/lib/firebase";
import { collection, query, onSnapshot, where, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// ─── Central tier scheme (mirrors Attendance.tsx so the dashboard, this
// drill-in detail view, and the printed report all read the same buckets) ──
const TIER_EXCELLENT = 90;
const TIER_GOOD = 80;
const TIER_AVERAGE = 70;

type Tier = "excellent" | "good" | "average" | "needs-attention" | "no-data";

const tierFor = (pct: number | null): Tier => {
  if (pct === null) return "no-data";
  if (pct >= TIER_EXCELLENT) return "excellent";
  if (pct >= TIER_GOOD) return "good";
  if (pct >= TIER_AVERAGE) return "average";
  return "needs-attention";
};

const tierLabel = (t: Tier): string => ({
  excellent: "Excellent",
  good: "Good",
  average: "Average",
  "needs-attention": "Needs Attention",
  "no-data": "No data",
}[t]);

const tierColor = (t: Tier): string => ({
  excellent: "#22c55e",
  good: "#84cc16",
  average: "#f59e0b",
  "needs-attention": "#ef4444",
  "no-data": "#94a3b8",
}[t]);

// Robust initials — "Aamir Khan" → "AK", "Aamir" → "A", "" → "?". Was:
// `substring(0, 2)` which produced "AA" for single-name students.
const safeInitials = (name: string | null | undefined): string => {
  const parts = (name || "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
};

interface ClassAttendanceDetailProps {
  className: string;
  onBack: () => void;
}

interface StudentRow {
  studentId: string | null;
  studentEmail: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  initials: string;
  name: string;
  totalDays: number;
  present: number;
  absent: number;
  pct: string;
  pctVal: number | null;        // null when no recorded days (don't tier-flag as Chronic)
  status: string;
  notified: boolean;            // true when an attendance-category note exists
}

const ClassAttendanceDetail = ({ className, onBack }: ClassAttendanceDetailProps) => {
  const { userData } = useAuth();

  const [loading, setLoading] = useState(true);
  // Use state (not useRef) so a teacher reassignment / late-arriving teacher
  // record actually re-renders the header (B17). Was: useRef → no re-render.
  const [teacherName, setTeacherName] = useState("—");
  const [classInfo, setClassInfo] = useState<{
    totalStudents: number;
    monthlyAvg: number | null;   // null when no records in 30-day window (B11)
    chronicCount: number;
  }>({ totalStudents: 0, monthlyAvg: null, chronicCount: 0 });
  const [calendarData, setCalendarData] = useState<any[]>([]);
  // Raw aggregations from the attendance listener — does NOT include
  // `notified`. The view-ready `students` array is derived below via useMemo
  // by merging rawStudents with the live notifiedKeys set, so a notes-listener
  // update doesn't tear down the attendance subscription.
  const [rawStudents, setRawStudents] = useState<Omit<StudentRow, "notified">[]>([]);
  const [monthLabel, setMonthLabel] = useState('');
  const [sendingAlerts, setSendingAlerts] = useState(false);

  // ── Live teacher listener (B16) ─────────────────────────────────────────
  // Was: one-time getDocs → stale on reassignment. Now an onSnapshot resolves
  // the teaching_assignments row and (if needed) the teachers doc, both
  // schoolId-scoped (server) + branchId-aware (memory). Errors are surfaced
  // via console (B15) instead of swallowed.
  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) return;
    const branchId = userData?.branchId || "";
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    let teachersIndex: Record<string, string> = {};
    const applyFromAssignment = (assignment: any) => {
      if (!assignment) return;
      if (assignment.teacherName) {
        setTeacherName(assignment.teacherName);
        return;
      }
      if (assignment.teacherId && teachersIndex[assignment.teacherId]) {
        setTeacherName(teachersIndex[assignment.teacherId]);
      }
    };

    let lastAssignment: any = null;

    const unsubAssign = onSnapshot(
      query(
        collection(db, 'teaching_assignments'),
        where('schoolId', '==', schoolId),
        where('className', '==', className),
      ),
      (snap) => {
        const matched = snap.docs
          .map(d => d.data())
          .filter(inBranch);
        lastAssignment = matched[0] || null;
        applyFromAssignment(lastAssignment);
      },
      (err) => {
        console.warn("[ClassAttendanceDetail] teaching_assignments listener failed:", err);
      },
    );

    const unsubTeachers = onSnapshot(
      query(collection(db, 'teachers'), where('schoolId', '==', schoolId)),
      (snap) => {
        const next: Record<string, string> = {};
        snap.docs.forEach(d => {
          const t = d.data() as any;
          if (!inBranch(t)) return;
          next[d.id] = t.name || t.teacherName || "—";
        });
        teachersIndex = next;
        // Re-apply in case the assignment row only carried a teacherId.
        if (lastAssignment) applyFromAssignment(lastAssignment);
      },
      (err) => {
        console.warn("[ClassAttendanceDetail] teachers listener failed:", err);
      },
    );

    return () => { unsubAssign(); unsubTeachers(); };
  }, [userData?.schoolId, userData?.branchId, className]);

  // ── Notified-by-principal index (B12) ───────────────────────────────────
  // Replaces the misleading `r.parentNotified` field that was almost never
  // written. Treats a student as "notified" when an attendance-category note
  // exists in `principal_to_parent_notes` for them in the current 30-day
  // window — same collection the Send Alerts button writes to.
  const [notifiedKeys, setNotifiedKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) return;
    const branchId = userData?.branchId || "";
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const unsub = onSnapshot(
      query(collection(db, 'principal_to_parent_notes'), where('schoolId', '==', schoolId)),
      (snap) => {
        const next = new Set<string>();
        snap.docs.forEach(d => {
          const n = d.data() as any;
          if (!inBranch(n)) return;
          if (n.category !== "attendance") return;
          const ts = (n.timestamp as any)?.toMillis?.() ?? 0;
          if (ts && ts < cutoff) return;
          const k = String(n.studentId || (n.studentEmail || "").toLowerCase() || "");
          if (k) next.add(k);
        });
        setNotifiedKeys(next);
      },
      (err) => console.warn("[ClassAttendanceDetail] notes listener failed:", err),
    );
    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  // ── Realtime attendance listener (data layer) ───────────────────────────
  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) {
      // No school context — empty state instead of stuck spinner (B14).
      setLoading(false);
      return;
    }
    setLoading(true);

    const branchId = userData?.branchId || "";
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    // schoolId-only server-side; branchId in-memory (memory:
    // branchid_inference_lag, B1). Was: server-side branchId filter.
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("schoolId", "==", schoolId)),
      (snap) => {
        const allRecords: any[] = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(inBranch);

        // EXACT class match only (B2/B16). Was: a fuzzy
        // `r.className.includes(gradeNum)` fallback that catastrophically
        // pulled "Class 10/11/12/…" records into a "Class 1" view.
        const classRecords = allRecords.filter(r =>
          r.className === className || r.gradeLevel === className
        );

        const now = new Date();          // recomputed per snapshot so a session
                                         // open past midnight stays correct
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toLocaleDateString('en-CA');

        // ── Build calendar for current month ──
        const year  = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth    = new Date(year, month + 1, 0).getDate();
        const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
        // Monday-based offset: Mon=0, Sun=6
        const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

        const calDays: any[] = [];
        for (let i = 0; i < startOffset; i++) {
          calDays.push({ day: null, pct: null, weekend: false, filler: true });
        }
        for (let d = 1; d <= daysInMonth; d++) {
          const dow     = new Date(year, month, d).getDay();
          const isWkEnd = dow === 0 || dow === 6;
          const dateStr = new Date(year, month, d).toLocaleDateString('en-CA');

          if (isWkEnd) {
            calDays.push({ day: d, pct: null, weekend: true, filler: false });
          } else {
            const dayRecs = classRecords.filter(r => r.date === dateStr);
            const pct = dayRecs.length === 0
              ? null
              : Math.round((dayRecs.filter(r => r.status === 'present').length / dayRecs.length) * 100);
            calDays.push({ day: d, pct, weekend: false, filler: false });
          }
        }
        setCalendarData(calDays);

        // ── Student-wise aggregation (dual-key, no 'unknown' bucket) ──
        const keyFor = (r: any): string =>
          String(r.studentId || (r.studentEmail || "").toLowerCase() || "");

        const studentMap: Record<string, {
          name: string;
          present: number; absent: number; late: number;
          studentId: string | null;
          studentEmail: string | null;
          parentEmail: string | null;
          parentPhone: string | null;
        }> = {};

        classRecords.forEach(r => {
          const sid = keyFor(r);
          if (!sid) return; // skip rows we cannot identify (was: collapsed
                            // into 'unknown' fake-student which then showed
                            // up in the table) — B5.
          if (!studentMap[sid]) {
            studentMap[sid] = {
              name: r.studentName || sid,
              present: 0, absent: 0, late: 0,
              studentId: r.studentId || null,
              studentEmail: r.studentEmail || null,
              parentEmail: r.parentEmail || null,
              parentPhone: r.parentPhone || null,
            };
          }
          if (r.status === 'present') studentMap[sid].present++;
          else if (r.status === 'absent') studentMap[sid].absent++;
          else if (r.status === 'late') studentMap[sid].late++;
        });

        const studentList = Object.entries(studentMap).map(([_sid, s]) => {
          const total = s.present + s.absent + s.late;
          const pctVal = total === 0 ? null : Math.round((s.present / total) * 100);
          const tier = tierFor(pctVal);
          return {
            studentId: s.studentId,
            studentEmail: s.studentEmail,
            parentEmail: s.parentEmail,
            parentPhone: s.parentPhone,
            initials:  safeInitials(s.name),  // B6
            name:      s.name,
            totalDays: total,
            present:   s.present,
            absent:    s.absent,
            pct:       pctVal === null ? "—" : `${pctVal}%`,
            pctVal,
            status:    tierLabel(tier),       // B8/B9/B10 — central scheme
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // ── Class-level stats ──
        const monthlyRecs    = classRecords.filter(r => r.date && r.date >= cutoffStr);
        const monthlyPresent = monthlyRecs.filter(r => r.status === 'present').length;
        const monthlyAvg     = monthlyRecs.length === 0 ? null : Math.round((monthlyPresent / monthlyRecs.length) * 100);
        // chronicCount only counts students with recorded days — was:
        // included no-data students (pctVal=0) as "Chronic" (B7).
        const chronicCount   = studentList.filter(s => s.pctVal !== null && s.pctVal < TIER_AVERAGE).length;

        setRawStudents(studentList);
        setClassInfo({
          totalStudents:  studentList.length,
          monthlyAvg,
          chronicCount,
        });
        setMonthLabel(now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
        setLoading(false);
      },
      // Real error handler so a permission/network failure surfaces and the
      // spinner clears (B13). Was: missing.
      (err) => {
        console.error("[ClassAttendanceDetail] attendance listener failed:", err);
        toast.error("Failed to load class attendance — please refresh.");
        setLoading(false);
      }
    );

    return () => unsub();
    // notifiedKeys deliberately NOT in deps — see students useMemo below.
  }, [userData?.schoolId, userData?.branchId, className]);

  // View-ready rows = raw aggregations + live notified flag. Recomputes when
  // EITHER input changes, without tearing down the attendance subscription.
  const students: StudentRow[] = useMemo(
    () => rawStudents.map(s => ({
      ...s,
      notified: notifiedKeys.has(String(s.studentId || (s.studentEmail || "").toLowerCase() || "")),
    })),
    [rawStudents, notifiedKeys],
  );

  // Calendar uses the central tier; 80→excellent green, 70→good lime,
  // 60→amber, <60→red. Was: 80/70 cutoffs that didn't match anything else.
  const getDayStyle = (d: any) => {
    if (d.filler || d.weekend || d.pct === null) return { bg: '#f8fafc', text: '#94a3b8' };
    return { bg: tierColor(tierFor(d.pct)), text: '#ffffff' };
  };

  const getPctColor = (pct: number | null) => tierColor(tierFor(pct));

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Excellent':       return 'text-green-600 font-bold';
      case 'Good':            return 'text-lime-600 font-bold';
      case 'Average':         return 'text-amber-500 font-bold';
      case 'Needs Attention': return 'text-red-500 font-bold';
      default:                return 'text-slate-400 font-bold';
    }
  };

  // ── Real "Bulk SMS to Absentee Parents" wiring (B3) ─────────────────────
  // Was: button had no onClick at all — pure decorative. Now writes one
  // principal_to_parent_notes doc per absentee in the class via a chunked
  // writeBatch (450 ops per chunk, identical pattern to NotifyClassParentsModal
  // and Attendance.tsx). Despite the legacy "SMS" label, the canonical
  // delivery channel is in-app Parent Communication — copy the existing
  // notification stack rather than introducing a separate SMS gateway.
  const bulkNotifyAbsentees = async () => {
    if (!userData?.schoolId) {
      toast.error("School context missing — please re-login.");
      return;
    }
    // Anyone whose attendance % is below the average tier OR who has any
    // absences this month qualifies for the "absentee parents" alert.
    const targets = students.filter(s =>
      (s.pctVal !== null && s.pctVal < TIER_AVERAGE) || s.absent > 0
    );
    const recipients = targets.filter(s => s.studentId || s.studentEmail);
    if (recipients.length === 0) {
      toast.success("No absentees to notify in this class. 🎉");
      return;
    }

    setSendingAlerts(true);
    try {
      const principalUid = auth.currentUser?.uid || (userData as any)?.id || "";
      const principalName = (userData as any)?.fullName || (userData as any)?.name || "Principal";
      const branchId = userData.branchId || null;

      const CHUNK = 450;
      let written = 0;
      for (let i = 0; i < recipients.length; i += CHUNK) {
        const slice = recipients.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(s => {
          const ref = doc(collection(db, "principal_to_parent_notes"));
          const monthlyTxt = s.pctVal === null ? "—" : `${s.pctVal}%`;
          const msg =
            `Attendance update for ${s.name} (${className}): ` +
            `${s.absent} absence${s.absent === 1 ? "" : "s"} this month, ` +
            `monthly attendance ${monthlyTxt}. ` +
            `Please reach out if there are any concerns.`;
          batch.set(ref, {
            schoolId: userData.schoolId,
            branchId,
            studentId: s.studentId,
            studentEmail: s.studentEmail || null,
            studentName: s.name,
            parentEmail: s.parentEmail || null,
            category: "attendance",
            message: msg,
            content: msg,
            from: "principal",
            principalId: principalUid,
            principalName,
            read: false,
            timestamp: serverTimestamp(),
            _lastModifiedBy: principalUid,
          });
        });
        await batch.commit();
        written += slice.length;
      }
      toast.success(`Alert sent to ${written} parent${written === 1 ? "" : "s"}.`, {
        description: "Notification posted to Parent Communication.",
      });
    } catch (err: any) {
      console.error("[ClassAttendanceDetail] bulkNotifyAbsentees failed:", err);
      toast.error(`Failed to send alerts: ${err?.message || "Unknown error"}`);
    } finally {
      setSendingAlerts(false);
    }
  };

  const exportRegister = () => {
    const monthlyAvgLabel = classInfo.monthlyAvg === null ? "—" : `${classInfo.monthlyAvg}%`;
    const monthlyTier = tierFor(classInfo.monthlyAvg);
    const html = buildReport({
      title: `Attendance Register — ${className}`,
      subtitle: `Teacher: ${teacherName} · ${classInfo.totalStudents} Students`,
      badge: "Attendance",
      heroStats: [
        { label: "Monthly Avg",      value: monthlyAvgLabel, color: tierColor(monthlyTier) },
        { label: "Total Students",   value: classInfo.totalStudents },
        { label: "Chronic Absentees", value: classInfo.chronicCount, color: classInfo.chronicCount > 0 ? "#f87171" : "#4ade80" },
      ],
      sections: [
        {
          title: "Student-wise Attendance",
          type: "table",
          headers: ["Student", "Total Days", "Present", "Absent", "%", "Status", "Parent Notified"],
          rows: students.map(s => ({
            cells: [s.name, s.totalDays, s.present, s.absent, s.pct, s.status, s.notified ? "Yes" : "—"],
            highlight: s.pctVal !== null && s.pctVal < TIER_AVERAGE,
          })),
        },
      ],
    });
    openReportWindow(html);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-[#1e3a8a] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">
          Attendance
        </button>
        <span>/</span>
        <span className="text-foreground font-semibold">Class Attendance Detail</span>
      </div>

      {/* ===== HEADER CARD ===== */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{className} Attendance</h1>
            <p className="text-sm text-muted-foreground font-medium">
              Class Teacher: {teacherName} &bull; {classInfo.totalStudents} Students
            </p>
          </div>
          <div className="flex items-center gap-10">
            <div className="text-right">
              <p className="text-4xl font-black" style={{ color: getPctColor(classInfo.monthlyAvg) }}>
                {classInfo.monthlyAvg === null ? "—" : `${classInfo.monthlyAvg}%`}
              </p>
              <p className="text-xs font-medium text-muted-foreground">Monthly Average</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black text-[#ef4444]">{classInfo.chronicCount}</p>
              <p className="text-xs font-medium text-muted-foreground">Chronic Absentees</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CALENDAR VIEW ===== */}
      <div className="bg-card border border-border rounded-2xl p-7 shadow-sm mb-6">
        <h3 className="text-base font-bold text-foreground mb-6">{monthLabel} Calendar View</h3>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-3 mb-3">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-3">
          {calendarData.map((d, i) => {
            const style = getDayStyle(d);
            return (
              <div
                key={i}
                className="h-[72px] rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-sm transition-all hover:scale-105"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {!d.filler && (
                  <span className="text-sm font-bold" style={{ opacity: 0.8 }}>{d.day}</span>
                )}
                {!d.filler && !d.weekend && d.pct !== null && (
                  <span className="text-xs font-black">{d.pct}%</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend — uses the central tier scheme so labels here match the
            student-status column and the dashboard's heatmap colours. */}
        <div className="flex items-center gap-6 mt-6 pt-5 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: tierColor("excellent") }} />
            <span className="text-[10px] font-bold text-muted-foreground">{TIER_EXCELLENT}-100% Excellent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: tierColor("good") }} />
            <span className="text-[10px] font-bold text-muted-foreground">{TIER_GOOD}-{TIER_EXCELLENT - 1}% Good</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: tierColor("average") }} />
            <span className="text-[10px] font-bold text-muted-foreground">{TIER_AVERAGE}-{TIER_GOOD - 1}% Average</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: tierColor("needs-attention") }} />
            <span className="text-[10px] font-bold text-muted-foreground">Below {TIER_AVERAGE}%</span>
          </div>
        </div>
      </div>

      {/* ===== STUDENT-WISE TABLE ===== */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-7 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Student-wise Attendance</h2>
          {/* B4 — "Filter" button removed (had no onClick, no filter UI ever
              existed). Only the real Export action stays. */}
          <button
            onClick={exportRegister}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-secondary transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>

        {students.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground font-medium">
            No attendance records found for this class
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Student</th>
                  <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Total Days</th>
                  <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Present</th>
                  <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Absent</th>
                  <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">%</th>
                  <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Status</th>
                  <th className="px-7 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Parent Notified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((s, idx) => (
                  <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-7 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                          {s.initials}
                        </div>
                        <span className="font-bold text-foreground text-sm">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-7 py-5 text-sm font-medium text-muted-foreground">{s.totalDays}</td>
                    <td className="px-7 py-5 text-sm font-medium text-muted-foreground">{s.present}</td>
                    <td className="px-7 py-5">
                      <span className={`text-sm font-bold ${s.absent >= 5 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {s.absent}
                      </span>
                    </td>
                    <td className="px-7 py-5">
                      <span className="text-sm font-bold" style={{ color: getPctColor(s.pctVal) }}>{s.pct}</span>
                    </td>
                    <td className="px-7 py-5">
                      <span className={`text-sm ${getStatusStyle(s.status)}`}>{s.status}</span>
                    </td>
                    <td className="px-7 py-5">
                      <span className={`text-sm font-medium ${s.notified ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                        {s.notified ? 'Yes' : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        {/* B3 — was: no onClick, pure decoration. Now writes
            principal_to_parent_notes via chunked writeBatch (450 ops/chunk).
            Renamed to "Notify Absentee Parents" since the actual delivery
            channel is in-app Parent Communication, not SMS. */}
        <button
          onClick={bulkNotifyAbsentees}
          disabled={sendingAlerts || students.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ef4444] text-white text-sm font-bold hover:bg-red-600 transition-colors shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sendingAlerts
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <MessageSquare className="w-4 h-4" />}
          {sendingAlerts ? "Sending…" : "Notify Absentee Parents"}
        </button>
        <button
          onClick={exportRegister}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors"
        >
          <FileText className="w-4 h-4 text-muted-foreground" /> Export Attendance Register
        </button>
      </div>

      {/* Back */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Attendance
        </button>
      </div>
    </div>
  );
};

export default ClassAttendanceDetail;
