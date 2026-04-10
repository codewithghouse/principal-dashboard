import { useState, useEffect } from "react";
import {
  BookOpen, Plus, Trash2, Save, Loader2, CheckCircle,
  ClipboardList, Percent, Award, ChevronDown, ChevronUp, X
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

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
