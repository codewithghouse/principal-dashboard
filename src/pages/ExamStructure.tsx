import { useState, useEffect } from "react";
import {
  BookOpen, Plus, Trash2, Save, Loader2, CheckCircle,
  ClipboardList, Percent, Award, ChevronDown, ChevronUp, X,
  Sparkles, Layers, ClipboardCheck, Tag,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp } from "firebase/firestore";
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

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    getDocs(query(
      collection(db, "exam_structure"),
      where("schoolId", "==", schoolId),
      where("branchId", "==", branchId)
    )).then(snap => {
      setExamTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExamType)));
    }).finally(() => setLoading(false));
  }, [userData?.schoolId, userData?.branchId]);

  // ── Save single exam type ─────────────────────────────────────────────────
  const handleSave = async (exam: ExamType) => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return;

    setSaving(exam.id);
    try {
      await setDoc(doc(db, "exam_structure", exam.id), {
        ...exam,
        schoolId,
        branchId,
        updatedAt: serverTimestamp(),
      });
      toast.success(`"${exam.name}" saved.`);
    } catch (e: any) {
      toast.error("Save failed: " + e.message);
    }
    setSaving(null);
  };

  // ── Add new exam type ─────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newExam.name.trim()) return toast.error("Exam name is required.");
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return;

    setSaving("new");
    try {
      const ref = doc(collection(db, "exam_structure"));
      const entry: ExamType = { id: ref.id, ...newExam };
      await setDoc(ref, { ...entry, schoolId, branchId, createdAt: serverTimestamp() });
      setExamTypes(prev => [...prev, entry]);
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
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "exam_structure", id));
      setExamTypes(prev => prev.filter(e => e.id !== id));
      toast.success(`"${name}" deleted.`);
    } catch (e: any) {
      toast.error("Delete failed: " + e.message);
    }
  };

  // ── Update field in state ─────────────────────────────────────────────────
  const updateExam = (id: string, patch: Partial<ExamType>) =>
    setExamTypes(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const updateGrade = (examId: string, gradeId: string, patch: Partial<GradeRule>) =>
    setExamTypes(prev => prev.map(e =>
      e.id === examId
        ? { ...e, gradingScale: e.gradingScale.map(g => g.id === gradeId ? { ...g, ...patch } : g) }
        : e
    ));

  const addGradeRow = (examId: string) =>
    setExamTypes(prev => prev.map(e =>
      e.id === examId
        ? { ...e, gradingScale: [...e.gradingScale, { id: Date.now().toString(), label: "", minPct: 0, maxPct: 0, color: "#6366f1" }] }
        : e
    ));

  const removeGradeRow = (examId: string, gradeId: string) =>
    setExamTypes(prev => prev.map(e =>
      e.id === examId
        ? { ...e, gradingScale: e.gradingScale.filter(g => g.id !== gradeId) }
        : e
    ));

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
                    <div style={{ fontSize: 15, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {exam.name || "Untitled Exam"}
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
                    background: "rgba(255,255,255,.16)",
                    border: "0.5px solid rgba(255,255,255,.24)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <BookOpen size={18} color="#fff" strokeWidth={2.2} />
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
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: "rgba(255,255,255,.14)",
                    border: "0.5px solid rgba(255,255,255,.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <X size={14} color="#fff" strokeWidth={2.3} />
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
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 text-left">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Exam Structure</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#1e3a8a]" /> Exam Types · Marking Schemes · Grading Scales
          </p>
        </div>
        <button
          onClick={() => { setNewExam(emptyExam()); setShowAddModal(true); }}
          className="flex items-center gap-2 px-8 py-4 bg-[#1e3a8a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
        >
          <Plus className="w-4 h-4" /> Add Exam Type
        </button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Exam Types",      value: examTypes.length,                          icon: <BookOpen className="w-4 h-4 text-blue-500" />,   bg: "bg-blue-50",   txt: "text-blue-600" },
          { label: "Avg Max Marks",   value: examTypes.length ? Math.round(examTypes.reduce((a, e) => a + e.maxMarks, 0) / examTypes.length) : "—", icon: <Award className="w-4 h-4 text-purple-500" />, bg: "bg-purple-50", txt: "text-purple-600" },
          { label: "Avg Pass %",      value: examTypes.length ? Math.round(examTypes.reduce((a, e) => a + (e.passingMarks / e.maxMarks) * 100, 0) / examTypes.length) + "%" : "—", icon: <Percent className="w-4 h-4 text-emerald-500" />, bg: "bg-emerald-50", txt: "text-emerald-600" },
          { label: "Total Weight",    value: examTypes.reduce((a, e) => a + e.weightPct, 0) + "%",    icon: <ClipboardList className="w-4 h-4 text-amber-500" />, bg: "bg-amber-50",  txt: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-5 flex items-center gap-4`}>
            <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">{s.icon}</div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
              <p className={`text-xl font-black ${s.txt}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Exam type cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading exam structure...</p>
        </div>
      ) : examTypes.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-100 p-16 text-center">
          <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No exam types configured</p>
          <p className="text-xs text-slate-300 mt-1">Click "Add Exam Type" to create your first exam structure</p>
        </div>
      ) : (
        <div className="space-y-4">
          {examTypes.map(exam => (
            <div key={exam.id} className="bg-white rounded-3xl border-2 border-slate-50 overflow-hidden shadow-sm hover:shadow-md transition-shadow">

              {/* Card header */}
              <div className="px-6 py-5 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === exam.id ? null : exam.id)}>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-[#1e3a8a]/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-[#1e3a8a]" />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 text-base">{exam.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max: {exam.maxMarks}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pass: {exam.passingMarks}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weight: {exam.weightPct}%</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Classes: {exam.applicableClasses}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); handleSave(exam); }}
                    disabled={saving === exam.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a8a] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-800 transition-colors disabled:opacity-60"
                  >
                    {saving === exam.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(exam.id, exam.name); }}
                    className="w-9 h-9 rounded-xl border border-rose-100 text-rose-400 hover:bg-rose-50 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedId === exam.id
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {/* Expanded editor */}
              {expandedId === exam.id && (
                <div className="border-t border-slate-50 px-6 pb-6 pt-5 space-y-6">

                  {/* Basic fields */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Exam Name",         key: "name"              as keyof ExamType, type: "text",   val: exam.name },
                      { label: "Max Marks",         key: "maxMarks"          as keyof ExamType, type: "number", val: exam.maxMarks },
                      { label: "Passing Marks",     key: "passingMarks"      as keyof ExamType, type: "number", val: exam.passingMarks },
                      { label: "Weight % (of final)",key:"weightPct"         as keyof ExamType, type: "number", val: exam.weightPct },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">{f.label}</label>
                        <input
                          type={f.type}
                          value={f.val as string | number}
                          onChange={e => updateExam(exam.id, { [f.key]: f.type === "number" ? parseInt(e.target.value) || 0 : e.target.value })}
                          className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-300 transition-all"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Applicable Classes</label>
                    <input
                      type="text"
                      value={exam.applicableClasses}
                      onChange={e => updateExam(exam.id, { applicableClasses: e.target.value })}
                      placeholder='e.g. "All" or "8-A, 9-B, 10-C"'
                      className="w-full md:w-1/2 h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-300 transition-all"
                    />
                  </div>

                  {/* Grading scale */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Grading Scale</label>
                      <button
                        onClick={() => addGradeRow(exam.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-200 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Row
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="px-4 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Grade</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Min %</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Max %</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Color</th>
                            <th className="px-4 py-2.5 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest">Preview</th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {exam.gradingScale.map(g => (
                            <tr key={g.id}>
                              <td className="px-3 py-2">
                                <input value={g.label} onChange={e => updateGrade(exam.id, g.id, { label: e.target.value })}
                                  className="w-14 h-8 px-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-black text-center outline-none focus:border-blue-300" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" value={g.minPct} onChange={e => updateGrade(exam.id, g.id, { minPct: parseInt(e.target.value) || 0 })}
                                  className="w-16 h-8 px-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-center outline-none focus:border-blue-300" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" value={g.maxPct} onChange={e => updateGrade(exam.id, g.id, { maxPct: parseInt(e.target.value) || 0 })}
                                  className="w-16 h-8 px-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-center outline-none focus:border-blue-300" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="color" value={g.color} onChange={e => updateGrade(exam.id, g.id, { color: e.target.value })}
                                  className="w-10 h-8 rounded-lg border border-slate-100 cursor-pointer p-0.5 bg-white" />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className="px-3 py-1 rounded-lg text-[10px] font-black" style={{ background: g.color + "20", color: g.color }}>
                                  {g.label || "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => removeGradeRow(exam.id, g.id)}
                                  className="w-7 h-7 rounded-lg hover:bg-rose-50 text-rose-400 flex items-center justify-center transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[9px] text-slate-300 mt-1.5">Ranges should cover 0–100 without gaps. Lower grades should have lower min %.</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add Exam Type Modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

            <div className="bg-[#1e3a8a] px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">New Exam Type</h2>
                  <p className="text-xs text-blue-200">Configure exam structure & grading</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
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
    </div>
  );
};

export default ExamStructure;
