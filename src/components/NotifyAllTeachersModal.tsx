import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, Loader2, Users, AlertTriangle, TrendingUp, Award } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { CATEGORY_META, type Category, type ClassifiedStudent } from "@/lib/classifyStudent";

interface Props {
  classified: ClassifiedStudent[];
  onClose: () => void;
}

interface TeacherDoc {
  id: string;
  name?: string;
  email?: string;
  subject?: string;
  schoolId?: string;
  branchId?: string;
  classId?: string;
}

interface AssignmentDoc {
  teacherId?: string;
  classId?: string;
  schoolId?: string;
}

/**
 * NotifyAllTeachersModal
 * Bulk-notify every class teacher with a bundled message scoped to their
 * own class(es). Each teacher only sees info about students they teach.
 *
 * Flow:
 *   1. Fetch teachers + teaching_assignments for this school
 *   2. Build teacher → classIds map
 *   3. Filter classified students by selected categories
 *   4. For each teacher, compute their students across their classes
 *   5. Preview → principal reviews → click Send All
 *   6. Batch addDoc to principal_to_teacher_notes (one per teacher)
 */

interface TeacherBundle {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  classIds: string[];
  students: ClassifiedStudent[];
  counts: { weak: number; developing: number; smart: number };
}

export default function NotifyAllTeachersModal({ classified, onClose }: Props) {
  const { userData } = useAuth();

  // Category toggles — default all 3 on
  const [includeWeak,       setIncludeWeak]       = useState(true);
  const [includeDeveloping, setIncludeDeveloping] = useState(true);
  const [includeSmart,      setIncludeSmart]      = useState(true);

  // Editable intro / outro
  const [intro, setIntro] = useState(DEFAULT_INTRO);
  const [outro, setOutro] = useState(DEFAULT_OUTRO);

  // Loading / send state
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [teachers, setTeachers] = useState<TeacherDoc[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDoc[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Throttle progress UI updates to at most one React render per ~150ms during
  // bulk send — avoids hundreds of setState calls when 100+ teachers are being
  // notified.
  const progressBuffer = useRef<{ done: number; total: number } | null>(null);
  const progressTick = useRef<number | null>(null);
  const scheduleProgressFlush = () => {
    if (progressTick.current != null) return;
    progressTick.current = window.setTimeout(() => {
      progressTick.current = null;
      if (progressBuffer.current) setProgress({ ...progressBuffer.current });
    }, 150);
  };

  // ── Fetch teachers + teaching assignments ────────────────────────────────
  useEffect(() => {
    if (!userData?.schoolId) return;

    let cancelled = false;
    setLoadingTeachers(true);

    (async () => {
      try {
        const tc = [where("schoolId", "==", userData.schoolId)];
        if (userData.branchId) tc.push(where("branchId", "==", userData.branchId));
        const [tSnap, aSnap] = await Promise.all([
          getDocs(query(collection(db, "teachers"), ...tc)),
          getDocs(query(collection(db, "teaching_assignments"), ...tc)),
        ]);
        if (cancelled) return;
        setTeachers(tSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TeacherDoc, "id">) })));
        setAssignments(aSnap.docs.map(d => d.data() as AssignmentDoc));
      } catch (err) {
        if (cancelled) return;
        console.error("[NotifyAllTeachersModal] fetch failed:", err);
        toast.error("Couldn't load teachers. Please try again.");
      } finally {
        if (!cancelled) setLoadingTeachers(false);
      }
    })();

    return () => {
      cancelled = true;
      if (progressTick.current != null) {
        window.clearTimeout(progressTick.current);
        progressTick.current = null;
      }
    };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Build bundles — one entry per teacher who has matching students ────
  const bundles = useMemo<TeacherBundle[]>(() => {
    if (teachers.length === 0) return [];

    const activeCategories = new Set<Category>();
    if (includeWeak)       activeCategories.add("weak");
    if (includeDeveloping) activeCategories.add("developing");
    if (includeSmart)      activeCategories.add("smart");

    // teacherId → classIds[]
    const teacherClasses = new Map<string, Set<string>>();
    assignments.forEach(a => {
      const tid = a.teacherId as string;
      const cid = a.classId as string;
      if (!tid || !cid) return;
      if (!teacherClasses.has(tid)) teacherClasses.set(tid, new Set());
      teacherClasses.get(tid)!.add(cid);
    });

    // Fallback — teachers with `classId` field directly on their doc
    teachers.forEach(t => {
      const cid = (t as any).classId;
      if (cid) {
        if (!teacherClasses.has(t.id)) teacherClasses.set(t.id, new Set());
        teacherClasses.get(t.id)!.add(cid);
      }
    });

    // classId → students of that class (filtered by selected categories)
    const classStudents = new Map<string, ClassifiedStudent[]>();
    classified.forEach(s => {
      if (!s.classId) return;
      if (!activeCategories.has(s.category)) return;
      if (!classStudents.has(s.classId)) classStudents.set(s.classId, []);
      classStudents.get(s.classId)!.push(s);
    });

    // For each teacher, bundle their students
    const out: TeacherBundle[] = [];
    teachers.forEach(t => {
      const classIds = Array.from(teacherClasses.get(t.id) || []);
      if (classIds.length === 0) return; // no class mapping — skip

      const studs: ClassifiedStudent[] = [];
      const seen = new Set<string>();
      classIds.forEach(cid => {
        (classStudents.get(cid) || []).forEach(s => {
          if (!seen.has(s.studentId)) {
            seen.add(s.studentId);
            studs.push(s);
          }
        });
      });

      if (studs.length === 0) return; // nothing to send to this teacher

      out.push({
        teacherId: t.id,
        teacherName: (t as any).name || "Teacher",
        teacherEmail: (t as any).email || "",
        classIds,
        students: studs,
        counts: {
          weak:       studs.filter(s => s.category === "weak").length,
          developing: studs.filter(s => s.category === "developing").length,
          smart:      studs.filter(s => s.category === "smart").length,
        },
      });
    });

    // Sort: teachers with more weak students first (most urgent)
    return out.sort((a, b) =>
      (b.counts.weak * 3 + b.counts.developing * 2 + b.counts.smart)
      - (a.counts.weak * 3 + a.counts.developing * 2 + a.counts.smart),
    );
  }, [teachers, assignments, classified, includeWeak, includeDeveloping, includeSmart]);

  const totalStudents = useMemo(() => {
    const set = new Set<string>();
    bundles.forEach(b => b.students.forEach(s => set.add(s.studentId)));
    return set.size;
  }, [bundles]);

  const anyCategory = includeWeak || includeDeveloping || includeSmart;

  // ── Send all ────────────────────────────────────────────────────────────
  const handleSendAll = async () => {
    if (!anyCategory) {
      toast.error("Select at least one category to notify.");
      return;
    }
    if (bundles.length === 0) {
      toast.error("No teachers with matching students to notify.");
      return;
    }
    if (!userData?.schoolId) {
      toast.error("Session lost. Please log in again.");
      return;
    }
    const principalUid = auth.currentUser?.uid || (userData as { id?: string }).id;
    if (!principalUid) {
      toast.error("Unable to verify principal identity. Please log in again.");
      return;
    }
    if (!confirm(`Send ${bundles.length} message(s) to teachers covering ${totalStudents} student(s)?`)) return;

    setSending(true);
    setProgress({ done: 0, total: bundles.length });
    progressBuffer.current = { done: 0, total: bundles.length };
    const failed: string[] = [];
    let successCount = 0;

    for (const bundle of bundles) {
      try {
        const msgText = buildTeacherMessage(bundle, intro, outro);
        await addDoc(collection(db, "principal_to_teacher_notes"), {
          schoolId: userData.schoolId,
          branchId: userData.branchId || null,
          teacherId: bundle.teacherId,
          teacherName: bundle.teacherName,
          // Write BOTH field names — teacher dashboard reads `message`,
          // other code paths read `content`.
          message: msgText,
          content: msgText,
          from: "principal",
          bulk: true,
          bulkStudentIds: bundle.students.map(s => s.studentId),
          bulkCounts: bundle.counts,
          principalId: principalUid,
          principalName: (userData as { name?: string }).name || "Principal",
          read: false,
          timestamp: serverTimestamp(),
          _lastModifiedBy: principalUid,
        });
        successCount++;
      } catch (err) {
        console.error("[NotifyAllTeachersModal] send failed for", bundle.teacherName, err);
        failed.push(bundle.teacherName);
      }

      // Throttled progress — commit state at most ~7 times/sec regardless of
      // how fast individual writes resolve.
      if (progressBuffer.current) {
        progressBuffer.current.done++;
        scheduleProgressFlush();
      }
    }

    // Final flush so the last value is guaranteed visible before we clear
    if (progressBuffer.current) setProgress({ ...progressBuffer.current });
    setSending(false);
    setProgress(null);
    progressBuffer.current = null;

    if (failed.length === 0) {
      toast.success(`Notified ${successCount} teacher(s) about ${totalStudents} student(s).`);
    } else {
      // Surface WHICH teachers failed (not just a count) so principal can retry
      const failedNames = failed.slice(0, 3).join(", ") + (failed.length > 3 ? `, +${failed.length - 3} more` : "");
      toast.warning(
        `Sent to ${successCount}/${bundles.length}. Failed: ${failedNames}. Check console for details.`,
        { duration: 7000 },
      );
    }
    if (successCount > 0) onClose();
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#1e3a8a]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notify All Class Teachers</h2>
              <p className="text-xs text-slate-500">Each teacher gets info only about their own class students</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto">

          {/* Category toggles */}
          <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Include categories
            </p>
            <div className="grid grid-cols-3 gap-2">
              <CategoryToggle
                label="Weak"
                icon={AlertTriangle}
                meta={CATEGORY_META.weak}
                count={classified.filter(s => s.category === "weak").length}
                checked={includeWeak}
                onChange={setIncludeWeak}
              />
              <CategoryToggle
                label="Developing"
                icon={TrendingUp}
                meta={CATEGORY_META.developing}
                count={classified.filter(s => s.category === "developing").length}
                checked={includeDeveloping}
                onChange={setIncludeDeveloping}
              />
              <CategoryToggle
                label="Smart"
                icon={Award}
                meta={CATEGORY_META.smart}
                count={classified.filter(s => s.category === "smart").length}
                checked={includeSmart}
                onChange={setIncludeSmart}
              />
            </div>
          </div>

          {/* Editable intro / outro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                Intro (prepended to each message)
              </label>
              <textarea
                value={intro}
                onChange={e => setIntro(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                Outro (appended to each message)
              </label>
              <textarea
                value={outro}
                onChange={e => setOutro(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none"
              />
            </div>
          </div>

          {/* Preview list */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Preview — who will receive
              </span>
              <span className="text-xs font-semibold text-slate-600">
                {loadingTeachers ? "..." : `${bundles.length} teacher${bundles.length !== 1 ? "s" : ""} · ${totalStudents} student${totalStudents !== 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="max-h-[260px] overflow-y-auto divide-y divide-slate-100">
              {loadingTeachers ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : bundles.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-500">
                    {!anyCategory
                      ? "Select at least one category above."
                      : "No teachers have students matching the selected filters."}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Ensure teachers have class assignments in Teaching Assignments.
                  </p>
                </div>
              ) : (
                bundles.map(b => (
                  <div key={b.teacherId} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-bold text-[#1e3a8a]">
                        {initials(b.teacherName)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{b.teacherName}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {b.classIds.length} class{b.classIds.length !== 1 ? "es" : ""} · {b.students.length} student{b.students.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {b.counts.weak > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: CATEGORY_META.weak.bg, color: CATEGORY_META.weak.color }}>
                          🔴 {b.counts.weak}
                        </span>
                      )}
                      {b.counts.developing > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: CATEGORY_META.developing.bg, color: CATEGORY_META.developing.color }}>
                          🟡 {b.counts.developing}
                        </span>
                      )}
                      {b.counts.smart > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: CATEGORY_META.smart.bg, color: CATEGORY_META.smart.color }}>
                          🟢 {b.counts.smart}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Warnings */}
          {!loadingTeachers && teachers.length > 0 && bundles.length < teachers.length && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠ {teachers.length - bundles.length} teacher(s) not shown — they have no class assignments or no students matching filters.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {sending && progress
              ? `Sending ${progress.done} / ${progress.total}...`
              : `Will send ${bundles.length} customized message${bundles.length !== 1 ? "s" : ""}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSendAll}
              disabled={sending || bundles.length === 0 || !anyCategory}
              className="px-5 py-2 rounded-xl bg-[#1e3a8a] text-white text-sm font-semibold hover:bg-[#1e4fc0] disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send to {bundles.length} teacher{bundles.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Subcomponents + helpers
// ═══════════════════════════════════════════════════════════════════════════

function CategoryToggle({
  label, icon: Icon, meta, count, checked, onChange,
}: {
  label: string;
  icon: any;
  meta: typeof CATEGORY_META[Category];
  count: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
        checked ? "" : "bg-white border-slate-200"
      }`}
      style={checked ? { background: meta.bg, borderColor: meta.border } : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded"
        style={{ accentColor: meta.color }}
      />
      <Icon className="w-4 h-4" style={{ color: meta.color }} />
      <span className="text-sm font-bold text-slate-900 flex-1">{label}</span>
      <span className="text-xs font-bold" style={{ color: meta.color }}>{count}</span>
    </label>
  );
}

function initials(name: string): string {
  return (name || "T")
    .trim()
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const DEFAULT_INTRO =
  "ACTION REQUIRED — STUDENT PERFORMANCE REVIEW\n\nThe system has auto-flagged students in your class based on attendance and academic performance. Review each case below and respond with a concrete intervention plan within 48 hours. No delays will be accepted.";

const DEFAULT_OUTRO =
  "Submit your intervention plan for the flagged students within 48 hours. Parent meetings for Weak-tier students are mandatory within this week.\n\nYour timely response is expected.\n\n— Principal";

function buildTeacherMessage(bundle: TeacherBundle, intro: string, outro: string): string {
  const lines: string[] = [
    intro.trim(),
    "",
    `Teacher: ${bundle.teacherName}`,
    `Students under your class: ${bundle.students.length}`,
    "",
  ];

  const byCat = (cat: Category) => bundle.students.filter(s => s.category === cat);
  const MIN_ATT_RECORDS = 5;   // attendance is meaningless with very few entries

  const formatAvg = (s: ClassifiedStudent) =>
    s.scores.length === 0
      ? "NO SCORES RECORDED"
      : `${s.avgScore}% (over ${s.scores.length} test${s.scores.length !== 1 ? "s" : ""})`;

  const formatAtt = (s: ClassifiedStudent) =>
    s.totalAttendance === 0
      ? "NO ATTENDANCE DATA"
      : s.totalAttendance < MIN_ATT_RECORDS
        ? `${s.attendancePct}% (only ${s.totalAttendance} day${s.totalAttendance !== 1 ? "s" : ""} — insufficient)`
        : `${s.attendancePct}% (over ${s.totalAttendance} days)`;

  const formatRoll = (s: ClassifiedStudent) =>
    s.rollNo && s.rollNo.toString().trim() ? `Roll ${s.rollNo}` : "Roll NOT ASSIGNED";

  const block = (cat: Category, heading: string) => {
    const list = byCat(cat);
    if (list.length === 0) return;
    lines.push(heading);
    list.forEach(s => {
      lines.push(`  • ${s.studentName} (${formatRoll(s)}) — Avg: ${formatAvg(s)} · Attendance: ${formatAtt(s)}`);
    });
    lines.push("");
  };

  block("weak",       `${CATEGORY_META.weak.emoji} CRITICAL — ACTION REQUIRED WITHIN 48 HOURS (${byCat("weak").length}):`);
  block("developing", `${CATEGORY_META.developing.emoji} UNDERPERFORMING — IMPROVEMENT PLAN NEEDED (${byCat("developing").length}):`);
  block("smart",      `${CATEGORY_META.smart.emoji} TOP PERFORMERS — MAINTAIN STANDARD (${byCat("smart").length}):`);

  lines.push(outro.trim());
  return lines.join("\n");
}