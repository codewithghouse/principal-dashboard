import { useState, useEffect, useRef } from "react";
import {
  BookOpen, Plus, Trash2, Save, Loader2, CheckCircle,
  ClipboardList, Percent, Award, ChevronDown, ChevronUp, X,
  Sparkles, Layers, ClipboardCheck, Tag,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, setDoc, deleteDoc, query, where, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types ─────────────────────────────────────────────────────────────────────
interface GradeRule {
  id: string;
  label: string;   // e.g. "A+"
  minPct: number;
  maxPct: number;
  color: string;
}

interface ExamType {
  id: string;
  name: string;         // e.g. "Unit Test", "Mid Term"
  maxMarks: number;
  passingMarks: number;
  weightPct: number;    // contribution to final grade %
  applicableClasses: string; // "All" or comma list
  gradingScale: GradeRule[];
  createdAt?: any;
}

const DEFAULT_GRADING: GradeRule[] = [
  { id: "1", label: "A+", minPct: 90, maxPct: 100, color: "#16a34a" },
  { id: "2", label: "A",  minPct: 80, maxPct: 89,  color: "#22c55e" },
  { id: "3", label: "B+", minPct: 70, maxPct: 79,  color: "#3b82f6" },
  { id: "4", label: "B",  minPct: 60, maxPct: 69,  color: "#6366f1" },
  { id: "5", label: "C",  minPct: 50, maxPct: 59,  color: "#f59e0b" },
  { id: "6", label: "D",  minPct: 40, maxPct: 49,  color: "#f97316" },
  { id: "7", label: "F",  minPct: 0,  maxPct: 39,  color: "#ef4444" },
];

const PRESET_TYPES = ["Unit Test", "Mid Term", "Final Exam", "Assignment", "Practical", "Viva"];

const emptyExam = (): Omit<ExamType, "id" | "createdAt"> => ({
  name: "",
  maxMarks: 100,
  passingMarks: 35,
  weightPct: 100,
  applicableClasses: "All",
  gradingScale: DEFAULT_GRADING.map(g => ({ ...g })),
});

// ── Validation ────────────────────────────────────────────────────────────────
// Returns null when valid, or a human-readable error string for the toast.
// Validates EVERY rule that protects downstream consumers — teacher's
// CreateTest auto-fills marks=maxMarks, parent's grade-display reads the
// gradingScale ranges. A bad save here breaks both dashboards silently.
function validateExam(
  exam: { name: string; maxMarks: number; passingMarks: number; weightPct: number; gradingScale: GradeRule[] },
): string | null {
  const name = (exam.name || "").trim();
  if (!name) return "Exam name is required.";

  if (!Number.isFinite(exam.maxMarks) || exam.maxMarks <= 0) {
    return "Max marks must be a positive number.";
  }
  if (!Number.isFinite(exam.passingMarks) || exam.passingMarks < 0) {
    return "Passing marks must be 0 or positive.";
  }
  if (exam.passingMarks > exam.maxMarks) {
    return `Passing marks (${exam.passingMarks}) cannot exceed max marks (${exam.maxMarks}).`;
  }
  if (!Number.isFinite(exam.weightPct) || exam.weightPct < 0 || exam.weightPct > 100) {
    return "Weight % must be between 0 and 100.";
  }

  // gradingScale validation
  if (!Array.isArray(exam.gradingScale) || exam.gradingScale.length === 0) {
    return "Add at least one grading rule.";
  }
  for (const g of exam.gradingScale) {
    const lbl = String(g?.label || "").trim();
    if (!lbl) return "Each grade rule needs a label (e.g. A+, B, F).";
    if (!Number.isFinite(g.minPct) || !Number.isFinite(g.maxPct)) {
      return `Grade "${lbl}": min% and max% must be numbers.`;
    }
    if (g.minPct < 0 || g.maxPct > 100) {
      return `Grade "${lbl}": ranges must be within 0–100 (got ${g.minPct}–${g.maxPct}).`;
    }
    if (g.minPct > g.maxPct) {
      return `Grade "${lbl}": min ${g.minPct}% cannot be greater than max ${g.maxPct}%.`;
    }
  }
  // Overlap check (sort by minPct and ensure no two ranges overlap)
  const sorted = [...exam.gradingScale].sort((a, b) => a.minPct - b.minPct);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPct <= sorted[i - 1].maxPct) {
      return `Grade ranges overlap: "${sorted[i - 1].label}" (${sorted[i - 1].minPct}–${sorted[i - 1].maxPct}%) and "${sorted[i].label}" (${sorted[i].minPct}–${sorted[i].maxPct}%).`;
    }
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
const ExamStructure = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

  const [examTypes, setExamTypes]       = useState<ExamType[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState<string | null>(null); // id being saved
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newExam, setNewExam]           = useState(emptyExam());
  // Dirty tracking — per-row "modified, not yet saved" flag drives the
  // "Modified" badge + helps the listener avoid clobbering in-progress edits
  // when a remote snapshot fires concurrently.
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  // Delete confirmation modal target. Uses a controlled modal instead of
  // window.confirm() so the UX matches the rest of the dashboard + works
  // properly on mobile.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const dirtyIdsRef = useRef(dirtyIds);
  dirtyIdsRef.current = dirtyIds;

  // ── Live subscription ─────────────────────────────────────────────────────
  // schoolId-only server-side; branchId in-memory (memory:
  // branchid_inference_lag). Real-time onSnapshot replaces the prior one-shot
  // getDocs — concurrent edits by other principals/admins now show up
  // without a manual refresh, AND the dirty-row guard prevents the listener
  // from reverting in-progress unsaved edits when a remote snapshot fires.
  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) { setLoading(false); return; }
    const branchId = userData?.branchId || "";
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    const unsub = onSnapshot(
      query(collection(db, "exam_structure"), where("schoolId", "==", schoolId)),
      (snap) => {
        const fromDb = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as ExamType & { branchId?: string }))
          .filter(inBranch);
        // Merge: for rows the user is currently editing (dirty), keep their
        // local edits. Rows that were dirty but no longer exist on the
        // server (e.g., still being typed for a never-saved new entry) are
        // also preserved via the prev-state union below.
        setExamTypes(prev => {
          const dirty = dirtyIdsRef.current;
          const out: ExamType[] = fromDb.map(dbDoc =>
            dirty.has(dbDoc.id)
              ? (prev.find(p => p.id === dbDoc.id) ?? dbDoc)
              : dbDoc,
          );
          // Preserve locally-added rows not yet on server (rare but safe).
          for (const local of prev) {
            if (!fromDb.some(d => d.id === local.id) && dirty.has(local.id)) {
              out.push(local);
            }
          }
          return out;
        });
        setLoading(false);
      },
      (err) => {
        console.error("[ExamStructure] listener failed:", err);
        toast.error("Failed to load exam structure.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  // ── Save single exam type ─────────────────────────────────────────────────
  // Pre-flight validation prevents illogical saves (passing > max, weight out
  // of 0–100, overlapping/empty grading scale) — these silently broke the
  // teacher's CreateTest auto-fill + parent's grade display before. Post-save
  // info-toast nudges the principal to rebalance other exam weights when the
  // total drifts away from 100%.
  const handleSave = async (exam: ExamType) => {
    const schoolId = userData?.schoolId;
    if (!schoolId) {
      toast.error("School context missing — please re-login.");
      return;
    }
    const validationError = validateExam(exam);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const branchId = userData?.branchId || null;

    setSaving(exam.id);
    try {
      await setDoc(doc(db, "exam_structure", exam.id), {
        ...exam,
        name: exam.name.trim(),
        applicableClasses: (exam.applicableClasses || "").trim() || "All",
        schoolId,
        branchId,
        updatedAt: serverTimestamp(),
      });
      // Clear dirty flag for this row
      setDirtyIds(prev => {
        const next = new Set(prev);
        next.delete(exam.id);
        return next;
      });
      toast.success(`"${exam.name.trim()}" saved.`);
      // Total-weight rebalance hint (informational — does NOT block save)
      const newTotal = examTypes.reduce(
        (sum, e) => sum + (e.id === exam.id ? exam.weightPct : (e.weightPct || 0)),
        0,
      );
      if (newTotal !== 100) {
        const delta = newTotal > 100 ? `${newTotal - 100}% over` : `${100 - newTotal}% short`;
        toast.message(`Total weight is ${newTotal}% (${delta}). Adjust other exam types to reach 100%.`);
      }
    } catch (e: any) {
      toast.error("Save failed: " + e.message);
    }
    setSaving(null);
  };

  // ── Add new exam type ─────────────────────────────────────────────────────
  // Same validation as handleSave + a case-insensitive duplicate-name guard
  // (otherwise the teacher's CreateTest dropdown ends up with two identical
  // entries — confusing UX, downstream attribution gets ambiguous too).
  const handleAdd = async () => {
    const schoolId = userData?.schoolId;
    if (!schoolId) {
      toast.error("School context missing — please re-login.");
      return;
    }
    const validationError = validateExam(newExam);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const trimmedName = newExam.name.trim();
    const lowerName = trimmedName.toLowerCase();
    const isDuplicate = examTypes.some(
      e => (e.name || "").trim().toLowerCase() === lowerName,
    );
    if (isDuplicate) {
      toast.error(`Exam type "${trimmedName}" already exists. Pick a different name or edit the existing one.`);
      return;
    }
    const branchId = userData?.branchId || null;

    setSaving("new");
    try {
      const ref = doc(collection(db, "exam_structure"));
      const entry: ExamType = {
        id: ref.id,
        ...newExam,
        name: trimmedName,
        applicableClasses: (newExam.applicableClasses || "").trim() || "All",
      };
      await setDoc(ref, { ...entry, schoolId, branchId, createdAt: serverTimestamp() });
      // No need to setExamTypes manually — onSnapshot will deliver the new doc.
      setNewExam(emptyExam());
      setShowAddModal(false);
      setExpandedId(ref.id);
      toast.success(`"${entry.name}" created.`);
    } catch (e: any) {
      toast.error("Create failed: " + e.message);
    }
    setSaving(null);
  };

  // ── Delete exam type ──────────────────────────────────────────────────────
  // Two-step delete: handleDelete opens the confirmation modal,
  // confirmDelete actually executes (when user clicks the modal's Delete
  // button). Replaces the prior window.confirm() which broke design
  // consistency + had poor mobile UX.
  const handleDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteDoc(doc(db, "exam_structure", id));
      // onSnapshot will remove the row; clear any dirty flag.
      setDirtyIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success(`"${name}" deleted.`);
    } catch (e: any) {
      toast.error("Delete failed: " + e.message);
    }
  };

  // ── Update field in state ─────────────────────────────────────────────────
  // Each editor mutation also marks the row dirty — the listener uses this
  // to skip overwriting in-progress edits when a remote snapshot arrives,
  // and the UI uses it to show a "Modified" badge until the user saves.
  const markDirty = (id: string) =>
    setDirtyIds(prev => prev.has(id) ? prev : new Set(prev).add(id));

  const updateExam = (id: string, patch: Partial<ExamType>) => {
    setExamTypes(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    markDirty(id);
  };

  const updateGrade = (examId: string, gradeId: string, patch: Partial<GradeRule>) => {
    setExamTypes(prev => prev.map(e =>
      e.id === examId
        ? { ...e, gradingScale: e.gradingScale.map(g => g.id === gradeId ? { ...g, ...patch } : g) }
        : e
    ));
    markDirty(examId);
  };

  const addGradeRow = (examId: string) => {
    setExamTypes(prev => prev.map(e =>
      e.id === examId
        ? { ...e, gradingScale: [...e.gradingScale, { id: Date.now().toString(), label: "", minPct: 0, maxPct: 0, color: "#6366f1" }] }
        : e
    ));
    markDirty(examId);
  };

  const removeGradeRow = (examId: string, gradeId: string) => {
    setExamTypes(prev => prev.map(e =>
      e.id === examId
        ? { ...e, gradingScale: e.gradingScale.filter(g => g.id !== gradeId) }
        : e
    ));
    markDirty(examId);
  };

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const GREEN = "#00C853";
    const GREEN_D = "#007830";
    const RED = "#FF3355";
    const RED_D = "#B01030";
    const GOLD = "#FFAA00";
    const VIOLET = "#7B3FF4";
    const VIOLET_D = "#5023B0";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const totalWeight = examTypes.reduce((a, e) => a + (e.weightPct || 0), 0);
    const avgMaxMarks = examTypes.length
      ? Math.round(examTypes.reduce((a, e) => a + e.maxMarks, 0) / examTypes.length)
      : 0;
    const avgPassPct = examTypes.length
      ? Math.round(examTypes.reduce((a, e) => a + (e.maxMarks ? (e.passingMarks / e.maxMarks) * 100 : 0), 0) / examTypes.length)
      : 0;
    const totalGradeRows = examTypes.reduce((a, e) => a + e.gradingScale.length, 0);

    const weightChip =
      totalWeight === 100
        ? { label: "Balanced", bg: "rgba(0,200,83,.22)", border: "rgba(0,200,83,.4)", color: "#66FFAA" }
        : totalWeight > 100
        ? { label: `+${totalWeight - 100}% Over`, bg: "rgba(255,51,85,.22)", border: "rgba(255,51,85,.4)", color: "#FF99AA" }
        : totalWeight > 0
        ? { label: `${100 - totalWeight}% Short`, bg: "rgba(255,170,0,.22)", border: "rgba(255,170,0,.4)", color: "#FFDD88" }
        : { label: "Empty", bg: "rgba(153,170,204,.18)", border: "rgba(153,170,204,.32)", color: "#CCDDEE" };

    return (
      <div
        style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          background: "#EEF4FF",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* Page Head */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${VIOLET}, #A075FF)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(123,63,244,.32)",
                }}
              >
                <ClipboardList size={16} color="#fff" strokeWidth={2.4} />
              </div>
              Exam Structure
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span>Exam Types</span>
              <span style={{ color: T4, fontWeight: 700 }}>·</span>
              <span>Marking</span>
              <span style={{ color: T4, fontWeight: 700 }}>·</span>
              <span>Grading</span>
            </div>
          </div>
        </div>

        {/* Add Exam Type button */}
        <button
          onClick={() => {
            setNewExam(emptyExam());
            setShowAddModal(true);
          }}
          style={{
            margin: "12px 20px 0",
            width: "calc(100% - 40px)",
            height: 44,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${B1}, ${B2})`,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            border: "none",
            boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
            letterSpacing: "0.02em",
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Add Exam Type
        </button>

        {/* Hero */}
        <div
          style={{
            margin: "14px 20px 0",
            background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
            borderRadius: 22,
            padding: "16px 18px",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -36,
              right: -24,
              width: 150,
              height: 150,
              background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: "rgba(255,255,255,.16)",
                  border: "0.5px solid rgba(255,255,255,.24)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Layers size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                  Total Weight
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1 }}>
                  {totalWeight}%
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 100,
                background: weightChip.bg,
                border: `0.5px solid ${weightChip.border}`,
                fontSize: 11,
                fontWeight: 700,
                color: weightChip.color,
              }}
            >
              {totalWeight === 100 ? (
                <CheckCircle size={11} strokeWidth={2.5} />
              ) : (
                <Percent size={11} strokeWidth={2.5} />
              )}
              {weightChip.label}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "rgba(255,255,255,.12)",
              borderRadius: 14,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
            }}
          >
            {[
              { v: examTypes.length, l: "Exam Types", c: "#fff" },
              { v: totalGradeRows, l: "Grades", c: "#FFDD88" },
              { v: examTypes.length ? `${avgPassPct}%` : "—", l: "Avg Pass", c: "#66EE88" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "11px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.c, letterSpacing: "-0.3px", lineHeight: 1, marginBottom: 3 }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bright stat grid 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
          {[
            {
              label: "Exam Types",
              value: examTypes.length,
              sub: examTypes.length > 0 ? "Active configs" : "None configured",
              bg: "linear-gradient(140deg,#DDEAFF 0%,#A8C5FF 55%,#7AA5FF 100%)",
              border: "0.5px solid rgba(0,85,255,.4)",
              lblColor: "#002080",
              valColor: "#001055",
              subColor: "#002080",
              icon: <BookOpen size={14} color="#001055" strokeWidth={2.5} />,
            },
            {
              label: "Avg Max Marks",
              value: examTypes.length ? avgMaxMarks : "—",
              sub: examTypes.length ? "Per exam type" : "—",
              bg: "linear-gradient(140deg,#EEE0FF 0%,#C9A8FF 55%,#A880FF 100%)",
              border: "0.5px solid rgba(123,63,244,.4)",
              lblColor: "#3A1580",
              valColor: "#280C5C",
              subColor: "#3A1580",
              icon: <Award size={14} color="#3A1580" strokeWidth={2.5} />,
            },
            {
              label: "Avg Pass %",
              value: examTypes.length ? `${avgPassPct}%` : "—",
              sub: "Threshold",
              bg: "linear-gradient(140deg,#DEFCE8 0%,#8CF0B0 55%,#50E088 100%)",
              border: "0.5px solid rgba(0,200,83,.4)",
              lblColor: "#005A20",
              valColor: "#004018",
              subColor: "#005A20",
              icon: <Percent size={14} color="#005A20" strokeWidth={2.5} />,
            },
            {
              label: "Total Weight",
              value: `${totalWeight}%`,
              sub: "Of final grade",
              bg: "linear-gradient(140deg,#FFF6D1 0%,#FFE488 55%,#FFCC33 100%)",
              border: "0.5px solid rgba(255,170,0,.4)",
              lblColor: "#664400",
              valColor: "#472A00",
              subColor: "#664400",
              icon: <ClipboardCheck size={14} color="#664400" strokeWidth={2.5} />,
            },
          ].map((c, i) => (
            <div
              key={i}
              style={{
                borderRadius: 20,
                padding: 15,
                position: "relative",
                overflow: "hidden",
                background: c.bg,
                border: c.border,
                boxShadow: "0 10px 28px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -20,
                  right: -18,
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(255,255,255,.65) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,.75)",
                  border: "0.5px solid rgba(255,255,255,.95)",
                  zIndex: 1,
                  boxShadow: "0 2px 6px rgba(0,0,0,.05)",
                }}
              >
                {c.icon}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.lblColor, marginBottom: 8, position: "relative", zIndex: 1 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: c.valColor, letterSpacing: "-0.9px", lineHeight: 1, marginBottom: 4, position: "relative", zIndex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: c.subColor, position: "relative", zIndex: 1 }}>
                {c.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Section label */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: T4,
            padding: "16px 20px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Exam Types</span>
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 100,
              background: "rgba(0,85,255,.10)",
              border: "0.5px solid rgba(0,85,255,.16)",
              fontSize: 9,
              fontWeight: 700,
              color: B1,
              textTransform: "none",
              letterSpacing: "0.04em",
            }}
          >
            {examTypes.length} configured
          </span>
          <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
        </div>

        {/* Exam cards */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "50px 0" }}>
            <Loader2 size={28} color={B1} style={{ animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
            <div style={{ fontSize: 10, fontWeight: 700, color: T4, letterSpacing: "0.10em", textTransform: "uppercase" }}>
              Loading exam structure...
            </div>
          </div>
        ) : examTypes.length === 0 ? (
          <div
            style={{
              margin: "12px 20px 0",
              background: "#fff",
              borderRadius: 22,
              padding: "36px 20px",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
              border: "0.5px dashed rgba(0,85,255,.22)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              textAlign: "center",
            }}
          >
            <BookOpen size={44} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T1, letterSpacing: "0.10em", textTransform: "uppercase" }}>
              No exam types configured
            </div>
            <div style={{ fontSize: 11, color: T4, maxWidth: 260, lineHeight: 1.5 }}>
              Tap "Add Exam Type" above to create your first exam structure.
            </div>
          </div>
        ) : (
          examTypes.map((exam) => {
            const isExpanded = expandedId === exam.id;
            return (
              <div
                key={exam.id}
                style={{
                  margin: "10px 20px 0",
                  background: "#fff",
                  borderRadius: 22,
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                  border: "0.5px solid rgba(0,85,255,.10)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Card header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : exam.id)}
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    borderBottom: isExpanded ? `0.5px solid ${SEP}` : "none",
                    background: "linear-gradient(90deg, rgba(0,85,255,.04), transparent)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: "linear-gradient(135deg,#E5EEFF,#C8D8FF)",
                      border: "0.5px solid rgba(0,85,255,.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <BookOpen size={18} color={B1} strokeWidth={2.2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T1, letterSpacing: "-0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                        {exam.name || "Untitled Exam"}
                      </div>
                      {dirtyIds.has(exam.id) && (
                        <span style={{
                          padding: "2px 7px",
                          borderRadius: 100,
                          background: "rgba(255,170,0,.15)",
                          border: "0.5px solid rgba(255,170,0,.32)",
                          fontSize: 8,
                          fontWeight: 800,
                          color: GOLD,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          flexShrink: 0,
                        }}>● Modified</span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {[
                        { l: "Max", v: exam.maxMarks },
                        { l: "Pass", v: exam.passingMarks },
                        { l: "Wt", v: `${exam.weightPct}%` },
                      ].map((m, mi) => (
                        <span
                          key={mi}
                          style={{
                            padding: "2px 7px",
                            borderRadius: 100,
                            background: "rgba(0,85,255,.08)",
                            border: "0.5px solid rgba(0,85,255,.14)",
                            fontSize: 9,
                            fontWeight: 700,
                            color: B1,
                            letterSpacing: "0.02em",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          {m.l}: <strong style={{ color: T1, fontWeight: 700 }}>{m.v}</strong>
                        </span>
                      ))}
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 100,
                          background: "rgba(0,85,255,.08)",
                          border: "0.5px solid rgba(0,85,255,.14)",
                          fontSize: 9,
                          fontWeight: 700,
                          color: B1,
                          letterSpacing: "0.02em",
                          maxWidth: 70,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {exam.applicableClasses || "All"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSave(exam);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 10,
                        background: `linear-gradient(135deg, ${B1}, ${B2})`,
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        cursor: saving === exam.id ? "not-allowed" : "pointer",
                        boxShadow: "0 3px 10px rgba(0,85,255,.32)",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        opacity: saving === exam.id ? 0.6 : 1,
                      }}
                    >
                      {saving === exam.id ? (
                        <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Save size={11} strokeWidth={2.5} />
                      )}
                      Save
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(exam.id, exam.name);
                      }}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9,
                        background: "rgba(255,51,85,.10)",
                        border: "0.5px solid rgba(255,51,85,.22)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={12} color={RED} strokeWidth={2.4} />
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={16} color={T4} strokeWidth={2.3} />
                    ) : (
                      <ChevronDown size={16} color={T4} strokeWidth={2.3} />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <>
                    {/* Basic fields 2×2 */}
                    <div
                      style={{
                        padding: "14px 16px",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        borderBottom: `0.5px solid ${SEP}`,
                      }}
                    >
                      {[
                        { label: "Exam Name", key: "name" as const, val: exam.name, type: "text" as const },
                        { label: "Max Marks", key: "maxMarks" as const, val: exam.maxMarks, type: "number" as const },
                        { label: "Passing Marks", key: "passingMarks" as const, val: exam.passingMarks, type: "number" as const },
                        { label: "Weight % (of Final)", key: "weightPct" as const, val: exam.weightPct, type: "number" as const },
                      ].map((f) => (
                        <div key={f.key} style={{ display: "flex", flexDirection: "column" }}>
                          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
                            {f.label}
                          </div>
                          <input
                            type={f.type}
                            value={f.val as string | number}
                            onChange={(e) =>
                              updateExam(exam.id, {
                                [f.key]: f.type === "number" ? parseInt(e.target.value) || 0 : e.target.value,
                              } as Partial<ExamType>)
                            }
                            style={{
                              padding: "10px 12px",
                              background: "#EEF4FF",
                              borderRadius: 11,
                              border: "0.5px solid rgba(0,85,255,.12)",
                              fontFamily: "inherit",
                              fontSize: 13,
                              color: T1,
                              fontWeight: 700,
                              outline: "none",
                              letterSpacing: "-0.1px",
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Applicable Classes full row */}
                    <div style={{ padding: "14px 16px", borderBottom: `0.5px solid ${SEP}` }}>
                      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
                        Applicable Classes
                      </div>
                      <input
                        type="text"
                        value={exam.applicableClasses}
                        onChange={(e) => updateExam(exam.id, { applicableClasses: e.target.value })}
                        placeholder='e.g. "All" or "8-A, 9-B, 10-C"'
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#EEF4FF",
                          borderRadius: 11,
                          border: "0.5px solid rgba(0,85,255,.12)",
                          fontFamily: "inherit",
                          fontSize: 13,
                          color: T1,
                          fontWeight: 700,
                          outline: "none",
                          letterSpacing: "-0.1px",
                        }}
                      />
                    </div>

                    {/* Grading scale */}
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4 }}>
                          Grading Scale · {exam.gradingScale.length} {exam.gradingScale.length === 1 ? "row" : "rows"}
                        </div>
                        <button
                          onClick={() => addGradeRow(exam.id)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 9,
                            background: "#fff",
                            border: "0.5px dashed rgba(0,85,255,.3)",
                            fontSize: 9,
                            fontWeight: 700,
                            color: B1,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            cursor: "pointer",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                            fontFamily: "inherit",
                          }}
                        >
                          <Plus size={9} strokeWidth={2.6} />
                          Add Row
                        </button>
                      </div>
                      <div
                        style={{
                          background: "#EEF4FF",
                          borderRadius: 14,
                          overflow: "hidden",
                          border: "0.5px solid rgba(0,85,255,.1)",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "42px 1fr 1fr 38px 42px 24px",
                            gap: 4,
                            padding: "8px 10px",
                            background: "rgba(0,85,255,.08)",
                            borderBottom: "0.5px solid rgba(0,85,255,.1)",
                          }}
                        >
                          {["Grade", "Min %", "Max %", "Clr", "Prev", ""].map((h, hi) => (
                            <div
                              key={hi}
                              style={{
                                fontSize: 8,
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: B1,
                                textAlign: hi === 0 ? "left" : "center",
                                paddingLeft: hi === 0 ? 4 : 0,
                              }}
                            >
                              {h}
                            </div>
                          ))}
                        </div>
                        {exam.gradingScale.map((g, gi) => {
                          const isLast = gi === exam.gradingScale.length - 1;
                          return (
                            <div
                              key={g.id}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "42px 1fr 1fr 38px 42px 24px",
                                gap: 4,
                                padding: "8px 10px",
                                alignItems: "center",
                                borderBottom: isLast ? "none" : `0.5px solid ${SEP}`,
                              }}
                            >
                              <input
                                value={g.label}
                                onChange={(e) => updateGrade(exam.id, g.id, { label: e.target.value })}
                                style={{
                                  padding: "5px 0",
                                  borderRadius: 8,
                                  background: "#fff",
                                  border: "0.5px solid rgba(0,85,255,.15)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: T1,
                                  textAlign: "center",
                                  letterSpacing: "-0.1px",
                                  outline: "none",
                                  fontFamily: "inherit",
                                }}
                              />
                              <input
                                type="number"
                                value={g.minPct}
                                onChange={(e) => updateGrade(exam.id, g.id, { minPct: parseInt(e.target.value) || 0 })}
                                style={{
                                  padding: "5px 0",
                                  borderRadius: 8,
                                  background: "#fff",
                                  border: "0.5px solid rgba(0,85,255,.12)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: T1,
                                  textAlign: "center",
                                  outline: "none",
                                  width: "100%",
                                  fontFamily: "inherit",
                                }}
                              />
                              <input
                                type="number"
                                value={g.maxPct}
                                onChange={(e) => updateGrade(exam.id, g.id, { maxPct: parseInt(e.target.value) || 0 })}
                                style={{
                                  padding: "5px 0",
                                  borderRadius: 8,
                                  background: "#fff",
                                  border: "0.5px solid rgba(0,85,255,.12)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: T1,
                                  textAlign: "center",
                                  outline: "none",
                                  width: "100%",
                                  fontFamily: "inherit",
                                }}
                              />
                              <input
                                type="color"
                                value={g.color}
                                onChange={(e) => updateGrade(exam.id, g.id, { color: e.target.value })}
                                style={{
                                  width: "100%",
                                  height: 22,
                                  borderRadius: 6,
                                  border: "0.5px solid rgba(0,0,0,.08)",
                                  cursor: "pointer",
                                  padding: 0,
                                  background: "#fff",
                                }}
                              />
                              <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                <div
                                  style={{
                                    padding: "3px 9px",
                                    borderRadius: 100,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: "-0.1px",
                                    background: g.color + "20",
                                    color: g.color,
                                  }}
                                >
                                  {g.label || "—"}
                                </div>
                              </div>
                              <div
                                onClick={() => removeGradeRow(exam.id, g.id)}
                                style={{
                                  display: "flex",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  cursor: "pointer",
                                }}
                              >
                                <X size={11} color={RED} strokeWidth={2.4} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 9, fontSize: 9, color: T4, fontWeight: 500, textAlign: "center", lineHeight: 1.4, padding: "0 4px" }}>
                        Ranges should cover 0–100 without gaps. Lower grades should have lower min %.
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}

        {/* AI Card */}
        {!loading && (
          <div
            style={{
              margin: "12px 20px 0",
              background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
              borderRadius: 22,
              padding: "18px 20px",
              boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -34,
                right: -22,
                width: 140,
                height: 140,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.18)",
                  border: "0.5px solid rgba(255,255,255,.26)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                AI Exam Intelligence
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
              {examTypes.length === 0 ? (
                <>No exam types configured yet. Tap <strong style={{ color: "#fff", fontWeight: 700 }}>"Add Exam Type"</strong> to create your first structure using quick presets like Unit Test, Mid Term, or Final Exam.</>
              ) : (
                <>
                  <strong style={{ color: "#fff", fontWeight: 700 }}>
                    {examTypes.length} exam type{examTypes.length === 1 ? "" : "s"}
                  </strong>{" "}
                  configured, carrying{" "}
                  <strong style={{ color: "#fff", fontWeight: 700 }}>{totalWeight}% total weight</strong>.{" "}
                  {totalGradeRows > 0 && (
                    <>
                      Grading scale spans{" "}
                      <strong style={{ color: "#fff", fontWeight: 700 }}>{totalGradeRows} row{totalGradeRows === 1 ? "" : "s"}</strong>
                      {" "}with avg{" "}
                      <strong style={{ color: "#fff", fontWeight: 700 }}>{avgPassPct}% pass threshold</strong>.{" "}
                    </>
                  )}
                  {totalWeight < 100 && totalWeight > 0 && (
                    <>
                      <strong style={{ color: "#FFDD88", fontWeight: 700 }}>{100 - totalWeight}% short</strong> — add more exam types to reach full weight.
                    </>
                  )}
                  {totalWeight > 100 && (
                    <>
                      <strong style={{ color: "#FF99AA", fontWeight: 700 }}>{totalWeight - 100}% over</strong> — rebalance weights.
                    </>
                  )}
                  {totalWeight === 100 && (
                    <>Weight distribution is <strong style={{ color: "#66EE88", fontWeight: 700 }}>balanced</strong>. Consider diversifying by adding Mid Term + Final Exam if needed.</>
                  )}
                </>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1,
                background: "rgba(255,255,255,.12)",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
                marginTop: 12,
              }}
            >
              {[
                { v: examTypes.length, l: "Types", c: "#fff" },
                { v: totalGradeRows, l: "Grades", c: "#FFDD88" },
                { v: `${totalWeight}%`, l: "Weight", c: totalWeight === 100 ? "#66EE88" : totalWeight > 100 ? "#FF99AA" : "#FFDD88" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: s.c, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 20 }} />

        {/* ─── Mobile Bottom Sheet Modal ─── */}
        {showAddModal && (
          <div
            onClick={() => setShowAddModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,10,60,.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              zIndex: 300,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                background: "#fff",
                borderRadius: "28px 28px 0 0",
                overflow: "hidden",
                boxShadow: "0 -12px 40px rgba(0,8,64,.24)",
                display: "flex",
                flexDirection: "column",
                maxHeight: "90vh",
                animation: "slideUpSheet .4s cubic-bezier(.34,1.26,.64,1) both",
              }}
            >
              <style>{`@keyframes slideUpSheet{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
              <div style={{ width: 44, height: 5, background: "rgba(0,85,255,.18)", borderRadius: 3, margin: "14px auto 0", flexShrink: 0 }} />

              {/* Hero header */}
              <div
                style={{
                  padding: "16px 18px",
                  background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 0,
                  marginTop: 12,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -36,
                    right: -24,
                    width: 150,
                    height: 150,
                    background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                    borderRadius: "50%",
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    position: "relative",
                    zIndex: 1,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  }}
                >
                  <ClipboardList size={20} color="#1e3a8a" strokeWidth={2.6} />
                </div>
                <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px", marginBottom: 2 }}>
                    New Exam Type
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.62)", fontWeight: 500 }}>
                    Configure exam structure &amp; grading
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="custom-chrome"
                  style={{
                    // .custom-chrome zeroes padding so the global
                    // `button { padding: 8px 16px !important }` doesn't
                    // squash the X icon. Solid white background + dark
                    // navy icon for guaranteed contrast.
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    position: "relative",
                    zIndex: 1,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    border: "none",
                  }}
                  aria-label="Close"
                >
                  <X size={16} color="#1e3a8a" strokeWidth={2.8} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: "16px 16px 14px", overflowY: "auto" }}>
                {/* Preset grid */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 2, background: B1, borderRadius: 2, display: "inline-block" }} />
                    Quick Preset
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {PRESET_TYPES.map((p) => {
                      const isActive = newExam.name === p;
                      return (
                        <button
                          key={p}
                          onClick={() => setNewExam((e) => ({ ...e, name: p }))}
                          style={{
                            padding: "7px 11px",
                            borderRadius: 100,
                            background: isActive ? `linear-gradient(135deg, ${B1}, ${B2})` : "#EEF4FF",
                            border: isActive ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,.14)",
                            fontSize: 10,
                            fontWeight: 700,
                            color: isActive ? "#fff" : T2,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            boxShadow: isActive ? "0 3px 10px rgba(0,85,255,.32)" : "none",
                          }}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Exam Name */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
                    Exam Name <span style={{ color: RED, marginLeft: 2 }}>*</span>
                  </div>
                  <input
                    value={newExam.name}
                    onChange={(e) => setNewExam((n) => ({ ...n, name: e.target.value }))}
                    placeholder="e.g. Unit Test 1"
                    style={{
                      width: "100%",
                      padding: "11px 13px",
                      background: "#EEF4FF",
                      borderRadius: 12,
                      border: "0.5px solid rgba(0,85,255,.14)",
                      fontFamily: "inherit",
                      fontSize: 13,
                      color: T1,
                      fontWeight: 500,
                      outline: "none",
                    }}
                  />
                </div>

                {/* Max / Pass / Weight grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    { label: "Max Marks", key: "maxMarks" as const, val: newExam.maxMarks },
                    { label: "Pass Marks", key: "passingMarks" as const, val: newExam.passingMarks },
                    { label: "Weight %", key: "weightPct" as const, val: newExam.weightPct },
                  ].map((f) => (
                    <div key={f.key}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
                        {f.label}
                      </div>
                      <input
                        type="number"
                        value={f.val}
                        onChange={(e) => setNewExam((n) => ({ ...n, [f.key]: parseInt(e.target.value) || 0 }))}
                        style={{
                          width: "100%",
                          padding: "11px 13px",
                          background: "#EEF4FF",
                          borderRadius: 12,
                          border: "0.5px solid rgba(0,85,255,.14)",
                          fontFamily: "inherit",
                          fontSize: 13,
                          color: T1,
                          fontWeight: 500,
                          outline: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Applicable Classes */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
                    Applicable Classes
                  </div>
                  <input
                    value={newExam.applicableClasses}
                    onChange={(e) => setNewExam((n) => ({ ...n, applicableClasses: e.target.value }))}
                    placeholder='e.g. "All" or "8-A, 9-B"'
                    style={{
                      width: "100%",
                      padding: "11px 13px",
                      background: "#EEF4FF",
                      borderRadius: 12,
                      border: "0.5px solid rgba(0,85,255,.14)",
                      fontFamily: "inherit",
                      fontSize: 13,
                      color: T1,
                      fontWeight: 500,
                      outline: "none",
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: "9px 12px",
                    background: "rgba(0,85,255,.04)",
                    borderRadius: 10,
                    border: "0.5px dashed rgba(0,85,255,.18)",
                    fontSize: 10,
                    color: T3,
                    fontWeight: 500,
                    lineHeight: 1.5,
                    marginTop: 4,
                  }}
                >
                  Default grading scale (<strong style={{ color: B1, fontWeight: 700 }}>A+→F</strong>) will be applied — customise after creation.
                </div>
              </div>

              {/* Footer buttons */}
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: `0.5px solid ${SEP}`,
                  display: "flex",
                  gap: 8,
                  background: "#EEF4FF",
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 13,
                    background: "#fff",
                    color: T2,
                    boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                    border: "0.5px solid rgba(0,85,255,.14)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving === "new" || !newExam.name.trim()}
                  style={{
                    flex: 1.2,
                    height: 44,
                    borderRadius: 13,
                    background: `linear-gradient(135deg, ${B1}, ${B2})`,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving === "new" || !newExam.name.trim() ? "not-allowed" : "pointer",
                    border: "none",
                    boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    letterSpacing: "0.02em",
                    fontFamily: "inherit",
                    opacity: saving === "new" || !newExam.name.trim() ? 0.55 : 1,
                  }}
                >
                  {saving === "new" ? (
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <CheckCircle size={14} strokeWidth={2.4} />
                  )}
                  {saving === "new" ? "Creating..." : "Create Exam Type"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* keep Tag referenced (unused placeholder) */}
        <span style={{ display: "none" }}><Tag size={1} /></span>

        {/* ── Delete confirmation modal (mobile) ── */}
        {deleteTarget && (
          <div
            onClick={() => setDeleteTarget(null)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,16,64,.45)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60,
            }}
          >
            <div onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff", borderRadius: 18, width: "100%", maxWidth: 360,
                boxShadow: "0 24px 60px rgba(0,8,60,.40)", overflow: "hidden",
              }}
            >
              <div style={{ padding: "18px 18px 12px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,51,85,.10)", border: "0.5px solid rgba(255,51,85,.20)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Trash2 size={17} color={RED} strokeWidth={2.3} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T1, marginBottom: 4 }}>Delete exam type?</div>
                  <div style={{ fontSize: 11, color: T3, fontWeight: 500, lineHeight: 1.5 }}>
                    "{deleteTarget.name}" will be removed for everyone in your school. Teachers + parents will no longer see this exam type. This cannot be undone.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "0 18px 18px" }}>
                <button onClick={() => setDeleteTarget(null)}
                  style={{ flex: 1, padding: "10px", borderRadius: 11, background: "#EEF4FF", border: `0.5px solid rgba(0,85,255,.14)`, color: T2, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={confirmDelete}
                  style={{ flex: 1, padding: "10px", borderRadius: 11, background: `linear-gradient(135deg, ${RED}, #FF6677)`, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(255,51,85,0.32)" }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render (desktop) ──────────────────────────────────────────────────────
  const dTotalWeight = examTypes.reduce((a, e) => a + e.weightPct, 0);
  const dAvgMax = examTypes.length ? Math.round(examTypes.reduce((a, e) => a + e.maxMarks, 0) / examTypes.length) : 0;
  const dAvgPass = examTypes.length ? Math.round(examTypes.reduce((a, e) => a + (e.passingMarks / e.maxMarks) * 100, 0) / examTypes.length) : 0;
  const dWeightChip = dTotalWeight === 0 ? { label: "Empty", c: "#FFCC44", bg: "rgba(255,136,0,0.22)", bdr: "rgba(255,136,0,0.4)" }
    : dTotalWeight === 100 ? { label: "Balanced", c: "#66EE88", bg: "rgba(0,200,83,0.22)", bdr: "rgba(0,200,83,0.4)" }
    : dTotalWeight > 100 ? { label: `+${dTotalWeight - 100}% Over`, c: "#FF99AA", bg: "rgba(255,51,85,0.22)", bdr: "rgba(255,51,85,0.4)" }
    : { label: `${100 - dTotalWeight}% Short`, c: "#FFDD88", bg: "rgba(255,170,0,0.22)", bdr: "rgba(255,170,0,0.4)" };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* ── Top toolbar ── */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.7px] flex items-center gap-[10px]" style={{ color: "#001040" }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
              <ClipboardList className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Exam Structure
          </div>
          <div className="text-[12px] font-normal mt-[6px] ml-[46px] flex items-center gap-[6px]" style={{ color: "#5070B0" }}>
            <span>Exam Types</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Marking Schemes</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Grading Scales</span>
          </div>
        </div>
        <button onClick={() => { setNewExam(emptyExam()); setShowAddModal(true); }}
          className="h-[44px] px-5 rounded-[12px] flex items-center gap-[7px] text-[12px] font-bold text-white uppercase tracking-[0.06em] transition-transform active:scale-[0.97] hover:scale-[1.02] relative overflow-hidden flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)" }}>
          <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          <Plus className="w-[14px] h-[14px] relative z-10" strokeWidth={2.4} />
          <span className="relative z-10">Add Exam Type</span>
        </button>
      </div>

      {/* ── Hero banner ── */}
      <div className="rounded-[22px] px-6 py-5 relative overflow-hidden flex items-center justify-between gap-5 mb-4"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[12px] min-w-0 relative z-10">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
            <BookOpen className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] mb-[5px]" style={{ color: "rgba(255,255,255,0.50)" }}>
              Total Weight · {examTypes.length} Exam Type{examTypes.length === 1 ? "" : "s"}
            </div>
            <div className="text-[34px] font-bold text-white leading-none tracking-[-1px]">
              {dTotalWeight}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          <div className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-full"
            style={{ background: dWeightChip.bg, border: `0.5px solid ${dWeightChip.bdr}` }}>
            <span className="text-[12px] font-bold" style={{ color: dWeightChip.c }}>{dWeightChip.label}</span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: examTypes.length, label: "Types", color: "#fff" },
              { val: dAvgMax || "—", label: "Avg Max", color: "#66EE88" },
              { val: dAvgPass ? `${dAvgPass}%` : "—", label: "Avg Pass", color: "#FFDD88" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[10px] px-[14px] text-center min-w-[72px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[17px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[8px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bright stat cards 4-wide ── */}
      {/* 4 Stat Cards — dashboard-style */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Exam Types", val: examTypes.length, sub: "Configured", Icon: BookOpen,
            cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
            tileGrad: "linear-gradient(135deg, #0055FF, #1166FF)",
            tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
            valColor: "#0055FF", decorColor: "#0055FF",
          },
          {
            label: "Avg Max Marks", val: dAvgMax || "—", sub: "Per exam", Icon: Award,
            cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            tileGrad: "linear-gradient(135deg, #7B3FF4, #A07CF8)",
            tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
            valColor: "#7B3FF4", decorColor: "#7B3FF4",
          },
          {
            label: "Avg Pass %", val: dAvgPass ? `${dAvgPass}%` : "—", sub: "Required to pass", Icon: Percent,
            cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
            tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
            tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
            valColor: "#007830", decorColor: "#00C853",
          },
          {
            label: "Total Weight", val: `${dTotalWeight}%`, sub: dWeightChip.label, Icon: ClipboardList,
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

      {/* ── Section label ── */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
        Your Exam Types
        <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
          {examTypes.length} {examTypes.length === 1 ? "type" : "types"}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* ── Exam cards ── */}
      {loading ? (
        <div className="rounded-[22px] py-16 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <Loader2 className="w-9 h-9 animate-spin mx-auto mb-3" style={{ color: "#0055FF" }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#99AACC" }}>Loading exam structure…</p>
        </div>
      ) : examTypes.length === 0 ? (
        <div className="rounded-[22px] py-16 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-16 h-16 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
            <BookOpen className="w-7 h-7" style={{ color: "rgba(0,85,255,0.45)" }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-bold mb-1" style={{ color: "#001040" }}>No exam types configured</p>
          <p className="text-[12px]" style={{ color: "#99AACC" }}>Click "Add Exam Type" to create your first exam structure.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {examTypes.map(exam => {
            const isExp = expandedId === exam.id;
            const wChip = exam.weightPct === 0 ? { bg: "rgba(255,136,0,0.10)", c: "#884400", bdr: "rgba(255,136,0,0.22)" }
              : exam.weightPct >= 50 ? { bg: "rgba(0,200,83,0.10)", c: "#007830", bdr: "rgba(0,200,83,0.22)" }
              : { bg: "rgba(0,85,255,0.10)", c: "#0055FF", bdr: "rgba(0,85,255,0.22)" };
            return (
              <div key={exam.id} className="rounded-[22px] overflow-hidden transition-all"
                style={{
                  background: isExp ? "linear-gradient(180deg, #FFFFFF 0%, #F7FAFF 100%)" : "#fff",
                  boxShadow: isExp ? "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)" : "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09), 0 8px 24px rgba(0,85,255,.10)",
                  border: isExp ? "1px solid rgba(0,85,255,0.25)" : "0.5px solid rgba(0,85,255,0.08)",
                }}>
                {/* Header */}
                <div className="flex items-center gap-4 px-6 py-[18px] cursor-pointer"
                  onClick={() => setExpandedId(isExp ? null : exam.id)}
                  style={isExp ? { borderBottom: "0.5px solid rgba(0,85,255,0.07)" } : {}}>
                  <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
                    style={isExp
                      ? { background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }
                      : { background: "linear-gradient(135deg, #E5EEFF, #D4E4FF)", border: "0.5px solid rgba(0,85,255,0.15)" }}>
                    <BookOpen className="w-[19px] h-[19px]" style={{ color: isExp ? "#fff" : "#0055FF" }} strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[17px] font-bold tracking-[-0.3px] truncate" style={{ color: "#001040" }}>{exam.name}</div>
                      {dirtyIds.has(exam.id) && (
                        <span className="px-[8px] py-[2px] rounded-full text-[9px] font-extrabold uppercase tracking-[0.06em] flex-shrink-0"
                          style={{ background: "rgba(255,170,0,0.15)", color: "#B07000", border: "0.5px solid rgba(255,170,0,0.36)" }}>
                          ● Modified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-[10px] mt-[3px] flex-wrap">
                      <span className="text-[11px] font-semibold" style={{ color: "#5070B0" }}>Max {exam.maxMarks}</span>
                      <span className="w-[3px] h-[3px] rounded-full" style={{ background: "#99AACC" }} />
                      <span className="text-[11px] font-semibold" style={{ color: "#5070B0" }}>Pass {exam.passingMarks}</span>
                      <span className="w-[3px] h-[3px] rounded-full" style={{ background: "#99AACC" }} />
                      <span className="text-[11px] font-semibold" style={{ color: "#5070B0" }}>Classes: {exam.applicableClasses}</span>
                    </div>
                  </div>
                  <div className="px-[12px] py-[6px] rounded-full text-[11px] font-bold flex-shrink-0"
                    style={{ background: wChip.bg, color: wChip.c, border: `0.5px solid ${wChip.bdr}` }}>
                    {exam.weightPct}% weight
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleSave(exam); }}
                    disabled={saving === exam.id}
                    className="h-9 px-[14px] rounded-[11px] flex items-center gap-[6px] text-[11px] font-bold text-white uppercase tracking-[0.05em] transition-transform active:scale-95 hover:scale-[1.03] disabled:opacity-60 relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 3px 10px rgba(0,85,255,0.26)" }}>
                    <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                    {saving === exam.id ? <Loader2 className="w-[13px] h-[13px] relative z-10 animate-spin" /> : <Save className="w-[13px] h-[13px] relative z-10" strokeWidth={2.4} />}
                    <span className="relative z-10">Save</span>
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(exam.id, exam.name); }}
                    aria-label="Delete exam type"
                    className="w-9 h-9 rounded-[11px] flex items-center justify-center transition-transform active:scale-90 hover:scale-105"
                    style={{ background: "rgba(255,51,85,0.08)", border: "0.5px solid rgba(255,51,85,0.18)" }}>
                    <Trash2 className="w-[15px] h-[15px]" style={{ color: "#FF3355" }} strokeWidth={2.2} />
                  </button>
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={isExp ? { background: "linear-gradient(135deg, #0055FF, #1166FF)" } : { background: "#EEF4FF", border: "0.5px solid rgba(0,85,255,0.10)" }}>
                    {isExp ? <ChevronUp className="w-[14px] h-[14px] text-white" strokeWidth={2.4} /> : <ChevronDown className="w-[14px] h-[14px]" style={{ color: "#5070B0" }} strokeWidth={2.4} />}
                  </div>
                </div>

                {/* Expanded editor */}
                {isExp && (
                  <div className="px-6 py-5 space-y-5">
                    {/* Basic fields */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Exam Name",      key: "name" as keyof ExamType,         type: "text",   val: exam.name },
                        { label: "Max Marks",      key: "maxMarks" as keyof ExamType,     type: "number", val: exam.maxMarks },
                        { label: "Passing Marks",  key: "passingMarks" as keyof ExamType, type: "number", val: exam.passingMarks },
                        { label: "Weight % of final", key: "weightPct" as keyof ExamType, type: "number", val: exam.weightPct },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="text-[9px] font-bold uppercase tracking-[0.09em] mb-1.5 block" style={{ color: "#99AACC" }}>{f.label}</label>
                          <input type={f.type} value={f.val as string | number}
                            onChange={e => updateExam(exam.id, { [f.key]: f.type === "number" ? parseInt(e.target.value) || 0 : e.target.value })}
                            className="w-full h-10 px-3 rounded-[10px] text-[12px] font-semibold outline-none"
                            style={{ background: "#F5F9FF", border: "0.5px solid rgba(0,85,255,0.14)", color: "#001040" }} />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-[0.09em] mb-1.5 block" style={{ color: "#99AACC" }}>Applicable Classes</label>
                      <input type="text" value={exam.applicableClasses}
                        onChange={e => updateExam(exam.id, { applicableClasses: e.target.value })}
                        placeholder='e.g. "All" or "8-A, 9-B, 10-C"'
                        className="w-1/2 h-10 px-3 rounded-[10px] text-[12px] font-semibold outline-none"
                        style={{ background: "#F5F9FF", border: "0.5px solid rgba(0,85,255,0.14)", color: "#001040" }} />
                    </div>

                    {/* Grading scale */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Layers className="w-[15px] h-[15px]" style={{ color: "#0055FF" }} strokeWidth={2.3} />
                          <label className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "#002080" }}>Grading Scale</label>
                          <span className="px-[8px] py-[2px] rounded-full text-[9px] font-bold"
                            style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
                            {exam.gradingScale.length} rows
                          </span>
                        </div>
                        <button onClick={() => addGradeRow(exam.id)}
                          className="h-8 px-[12px] rounded-[10px] flex items-center gap-[5px] text-[10px] font-bold uppercase tracking-[0.05em] transition-transform active:scale-95 hover:scale-[1.03]"
                          style={{ background: "linear-gradient(135deg, #EEF4FF, #DDEAFF)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.22)" }}>
                          <Plus className="w-3 h-3" strokeWidth={2.6} /> Add Row
                        </button>
                      </div>
                      <div className="rounded-[14px] overflow-hidden" style={{ border: "0.5px solid rgba(0,85,255,0.10)", background: "#fff" }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "rgba(0,85,255,0.04)", borderBottom: "0.5px solid rgba(0,85,255,0.07)" }}>
                              {["Grade", "Min %", "Max %", "Color", "Preview", ""].map(h => (
                                <th key={h} className="px-3 py-[10px] text-left text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "#99AACC" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {exam.gradingScale.map((g, i, arr) => (
                              <tr key={g.id} style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(0,85,255,0.05)" } : {}}>
                                <td className="px-3 py-[10px]">
                                  <input value={g.label} onChange={e => updateGrade(exam.id, g.id, { label: e.target.value })}
                                    className="w-14 h-8 px-2 rounded-[8px] text-[11px] font-bold text-center outline-none"
                                    style={{ background: "#F5F9FF", border: "0.5px solid rgba(0,85,255,0.14)", color: "#001040" }} />
                                </td>
                                <td className="px-3 py-[10px]">
                                  <input type="number" value={g.minPct} onChange={e => updateGrade(exam.id, g.id, { minPct: parseInt(e.target.value) || 0 })}
                                    className="w-16 h-8 px-2 rounded-[8px] text-[11px] font-semibold text-center outline-none"
                                    style={{ background: "#F5F9FF", border: "0.5px solid rgba(0,85,255,0.14)", color: "#001040" }} />
                                </td>
                                <td className="px-3 py-[10px]">
                                  <input type="number" value={g.maxPct} onChange={e => updateGrade(exam.id, g.id, { maxPct: parseInt(e.target.value) || 0 })}
                                    className="w-16 h-8 px-2 rounded-[8px] text-[11px] font-semibold text-center outline-none"
                                    style={{ background: "#F5F9FF", border: "0.5px solid rgba(0,85,255,0.14)", color: "#001040" }} />
                                </td>
                                <td className="px-3 py-[10px]">
                                  <input type="color" value={g.color} onChange={e => updateGrade(exam.id, g.id, { color: e.target.value })}
                                    className="w-10 h-8 rounded-[8px] cursor-pointer p-0.5"
                                    style={{ background: "#fff", border: "0.5px solid rgba(0,85,255,0.14)" }} />
                                </td>
                                <td className="px-3 py-[10px]">
                                  <span className="px-3 py-1 rounded-full text-[11px] font-bold"
                                    style={{ background: g.color + "20", color: g.color, border: `0.5px solid ${g.color}40` }}>
                                    {g.label || "—"}
                                  </span>
                                </td>
                                <td className="px-3 py-[10px] text-right">
                                  <button
                                    onClick={() => removeGradeRow(exam.id, g.id)}
                                    aria-label="Remove grade row"
                                    title="Remove this grade row"
                                    className="custom-chrome rounded-[9px] flex items-center justify-center transition-transform active:scale-90 hover:scale-[1.06]"
                                    style={{
                                      // .custom-chrome zeroes padding via index.css. Without it
                                      // the global `button { padding: 8px 16px !important }` shrinks
                                      // the 28×28 button's content area to a negative width and the
                                      // trash icon disappears (which is why this column looked empty).
                                      width: 28,
                                      height: 28,
                                      background: "rgba(255,51,85,0.10)",
                                      border: "0.5px solid rgba(255,51,85,0.28)",
                                      cursor: "pointer",
                                    }}>
                                    <Trash2 size={14} color="#FF3355" strokeWidth={2.5} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] mt-2" style={{ color: "#99AACC" }}>Ranges should cover 0–100 without gaps. Lower grades should have lower min %.</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── AI Intelligence ── */}
      {!loading && examTypes.length > 0 && (
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
                  AI Exam Structure Intelligence
                </span>
              </div>
              <div className="text-[13px] leading-[1.72] max-w-[720px]" style={{ color: "rgba(255,255,255,0.85)" }}>
                {dTotalWeight === 100 ? (
                  <><strong style={{ color: "#fff", fontWeight: 700 }}>Perfectly balanced</strong> — your {examTypes.length} exam type{examTypes.length === 1 ? "" : "s"} sum to 100%. Average pass threshold is <strong style={{ color: "#fff", fontWeight: 700 }}>{dAvgPass}%</strong>.</>
                ) : dTotalWeight > 100 ? (
                  <>Weights <strong style={{ color: "#fff", fontWeight: 700 }}>exceed 100% by {dTotalWeight - 100}%</strong> — reduce individual exam weights to balance. Target: 100% total.</>
                ) : dTotalWeight === 0 ? (
                  <>No weights assigned yet — set <strong style={{ color: "#fff", fontWeight: 700 }}>Weight %</strong> on each exam so they sum to 100%.</>
                ) : (
                  <>Weights are <strong style={{ color: "#fff", fontWeight: 700 }}>{100 - dTotalWeight}% short of 100%</strong> — add missing weight across exams, or create an additional exam type.</>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }}>
              {[
                { val: `${dTotalWeight}%`, label: "Weight", color: "#fff" },
                { val: examTypes.length, label: "Types", color: "#FFDD88" },
                { val: dWeightChip.label, label: "Status", color: dWeightChip.c },
              ].map(({ val, label, color }) => (
                <div key={label} className="py-[14px] px-5 text-center min-w-[96px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[20px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.5px" }}>{val}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* ── Add Exam Type Modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

            <div className="bg-[#1e3a8a] px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Solid white container + dark navy icon = guaranteed
                    contrast against the navy header. The previous
                    bg-white/25 + white icon combo had ~3:1 contrast
                    on the mid-blend, making both icons invisible. */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  }}
                >
                  <ClipboardList size={22} color="#1e3a8a" strokeWidth={2.6} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">New Exam Type</h2>
                  <p className="text-xs text-blue-200">Configure exam structure & grading</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="custom-chrome"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9999,
                  background: "#ffffff",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#EFF6FF"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; }}
              >
                <X size={20} color="#1e3a8a" strokeWidth={2.8} />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Quick presets */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Quick Preset</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TYPES.map(p => (
                    <button key={p} onClick={() => setNewExam(e => ({ ...e, name: p }))}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors border ${
                        newExam.name === p ? "bg-[#1e3a8a] text-white border-[#1e3a8a]" : "bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-300"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fields */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Exam Name *</label>
                <input value={newExam.name} onChange={e => setNewExam(n => ({ ...n, name: e.target.value }))}
                  placeholder="e.g. Unit Test 1"
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-300 transition-all" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Max Marks",     key: "maxMarks"     as const, val: newExam.maxMarks },
                  { label: "Pass Marks",    key: "passingMarks" as const, val: newExam.passingMarks },
                  { label: "Weight %",      key: "weightPct"    as const, val: newExam.weightPct },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">{f.label}</label>
                    <input type="number" value={f.val}
                      onChange={e => setNewExam(n => ({ ...n, [f.key]: parseInt(e.target.value) || 0 }))}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-300 transition-all" />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Applicable Classes</label>
                <input value={newExam.applicableClasses} onChange={e => setNewExam(n => ({ ...n, applicableClasses: e.target.value }))}
                  placeholder='e.g. "All" or "8-A, 9-B"'
                  className="w-full h-10 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-300 transition-all" />
                <p className="text-[9px] text-slate-300 mt-1">Default grading scale (A+→F) will be applied — customise after creation.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAddModal(false)}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={saving === "new" || !newExam.name.trim()}
                  className="flex-1 h-11 rounded-xl bg-[#1e3a8a] text-white text-xs font-black hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving === "new" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {saving === "new" ? "Creating..." : "Create Exam Type"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal (desktop) ── */}
      {deleteTarget && (
        <div
          onClick={() => setDeleteTarget(null)}
          className="fixed inset-0 flex items-center justify-center p-4 z-[60]"
          style={{ background: "rgba(0,16,64,.45)", backdropFilter: "blur(4px)" }}
        >
          <div onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-[420px] overflow-hidden"
            style={{ boxShadow: "0 24px 60px rgba(0,8,60,.40)" }}
          >
            <div className="flex items-start gap-3 p-5 pb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,51,85,.10)", border: "0.5px solid rgba(255,51,85,.20)" }}>
                <Trash2 className="w-[18px] h-[18px]" style={{ color: "#FF3355" }} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold mb-1" style={{ color: "#001040" }}>
                  Delete exam type?
                </div>
                <div className="text-[12px] font-medium leading-relaxed" style={{ color: "#5070B0" }}>
                  "<strong style={{ color: "#001040" }}>{deleteTarget.name}</strong>" will be removed for everyone in your school. Teachers + parents will no longer see this exam type. This cannot be undone.
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 h-11 rounded-xl text-xs font-bold transition-colors"
                style={{ background: "#EEF4FF", border: "0.5px solid rgba(0,85,255,.14)", color: "#002080" }}>
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="flex-1 h-11 rounded-xl text-xs font-bold text-white transition-transform active:scale-95"
                style={{ background: "linear-gradient(135deg, #FF3355, #FF6677)", boxShadow: "0 4px 12px rgba(255,51,85,0.32)" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamStructure;
