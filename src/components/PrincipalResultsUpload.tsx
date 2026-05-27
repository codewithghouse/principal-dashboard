/**
 * PrincipalResultsUpload.tsx — Shared upload page for K-12 + Pre-Primary results.
 *
 * Principal picks a class + exam metadata, uploads:
 *   • 1 class-wide PDF (visible to all teachers + parents of the class)
 *   • N per-student PDFs (each parent sees only their own child's PDF)
 *
 * Auto-matches uploaded PDFs to students via roll-number digits embedded
 * in the filename. Unmatched files fall back to manual per-row assignment.
 *
 * Two surfaces consume this:
 *   • PrincipalResultsK12 (mode='k12') → `principal_results` collection
 *   • PrincipalResultsPP  (mode='pp')  → `pp_principal_results` collection
 *
 * Data shape locked in [[project-results-module]] memory.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Plus, Loader2, Upload, X, CheckCircle2, AlertCircle,
  Trash2, Download, Calendar as CalendarIcon, Users, Sparkles,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { db, storage } from "@/lib/firebase";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, where, orderBy, serverTimestamp, type DocumentData,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useAuth } from "@/lib/AuthContext";
import { format } from "date-fns";

// Pre-primary stage detection — canonical `stage` field + legacy name-token fallback.
const PP_NAME_TOKENS = ["playgroup", "nursery", "lkg", "ukg", "pre"];
const MAX_PDF_BYTES = 10 * 1024 * 1024; // mirrors storage.rules image cap

type Mode = "k12" | "pp";

interface ModeConfig {
  collectionName: string;
  storageBase: string;
  pageTitle: string;
  pageSubtitle: string;
  examTypes: { key: string; label: string }[];
  termOptions: { key: string; label: string }[];
  defaultExamName: string;
  isClassEligible: (c: ClassRow) => boolean;
  emptyLabel: string;
}

const CFG: Record<Mode, ModeConfig> = {
  k12: {
    collectionName: "principal_results",
    storageBase: "principal_results",
    pageTitle: "K-12 Results",
    pageSubtitle: "Upload and publish K-12 exam result PDFs across classes",
    examTypes: [
      { key: "mid_term",   label: "Mid-Term" },
      { key: "final",      label: "Final" },
      { key: "unit_test",  label: "Unit Test" },
      { key: "pre_board",  label: "Pre-Board" },
      { key: "annual",     label: "Annual" },
      { key: "other",      label: "Other" },
    ],
    termOptions: [
      { key: "term1",  label: "Term 1" },
      { key: "term2",  label: "Term 2" },
      { key: "term3",  label: "Term 3" },
      { key: "annual", label: "Annual" },
    ],
    defaultExamName: "Mid-Term Exam",
    isClassEligible: (c) =>
      c.stage !== "pre_primary"
      && !PP_NAME_TOKENS.some(tok => (c.name || "").toLowerCase().includes(tok)),
    emptyLabel: "No K-12 classes found. Create classes in Classes & Sections first.",
  },
  pp: {
    collectionName: "pp_principal_results",
    storageBase: "pp_principal_results",
    pageTitle: "Pre-Primary Results",
    pageSubtitle: "Upload and publish Pre-Primary report cards (Playgroup / Nursery / LKG / UKG)",
    examTypes: [
      { key: "quarterly", label: "Quarterly Report" },
      { key: "mid_term",  label: "Mid-Term Report" },
      { key: "annual",    label: "Annual Report" },
      { key: "progress",  label: "Progress Report" },
    ],
    termOptions: [
      { key: "q1",     label: "Q1" },
      { key: "q2",     label: "Q2" },
      { key: "q3",     label: "Q3" },
      { key: "q4",     label: "Q4" },
      { key: "annual", label: "Annual" },
    ],
    defaultExamName: "Quarterly Report",
    isClassEligible: (c) =>
      c.stage === "pre_primary"
      || PP_NAME_TOKENS.some(tok => (c.name || "").toLowerCase().includes(tok)),
    emptyLabel: "No Pre-Primary classes found. Add classes from Pre-Students setup.",
  },
};

interface ClassRow extends DocumentData {
  id: string;
  schoolId?: string;
  name?: string;
  section?: string;
  stage?: string;
}

interface StudentRow extends DocumentData {
  id: string;
  schoolId?: string;
  classId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  rollNumber?: string | number;
  rollNo?: string | number;
}

interface ResultDoc extends DocumentData {
  id: string;
  schoolId: string;
  classId: string;
  className: string;
  section?: string;
  examName: string;
  examType: string;
  academicYear: string;
  term: string;
  examDate?: string;
  classPdfUrl?: string;
  classPdfName?: string;
  classPdfSize?: number;
  studentResults: {
    studentId: string;
    studentName: string;
    rollNumber?: string;
    pdfUrl: string;
    pdfName: string;
    pdfSize: number;
  }[];
  notes?: string;
  publishedAt?: any;
  publishedBy?: { uid: string; name: string; role: string };
  status: "draft" | "published";
  visibleToParents: boolean;
}

// Per-student row in the upload dialog — tracks the file picked (or auto-matched)
// for each student, the match source, and any per-row error during upload.
interface StudentSlot {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  file: File | null;
  source: "auto" | "manual" | null;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface Props {
  mode: Mode;
}

export default function PrincipalResultsUpload({ mode }: Props) {
  const { userData } = useAuth();
  const cfg = CFG[mode];

  const schoolId = userData?.schoolId || (userData as any)?.school || (userData as any)?.schoolID || "";

  // ── State ──────────────────────────────────────────────────────────────────
  const [classes, setClasses]               = useState<ClassRow[]>([]);
  const [classesLoaded, setClassesLoaded]   = useState(false);
  const [pastResults, setPastResults]       = useState<ResultDoc[]>([]);
  const [pastLoaded, setPastLoaded]         = useState(false);

  const [open, setOpen]                     = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [examName, setExamName]             = useState(cfg.defaultExamName);
  const [examType, setExamType]             = useState(cfg.examTypes[0].key);
  const [term, setTerm]                     = useState(cfg.termOptions[0].key);
  const [academicYear, setAcademicYear]     = useState(() => {
    const y = new Date().getFullYear();
    // Indian academic year typically spans Apr-Mar; pick current spanning pair.
    return new Date().getMonth() >= 3 ? `${y}-${(y + 1) % 100}` : `${y - 1}-${y % 100}`;
  });
  const [examDate, setExamDate]             = useState("");
  const [notes, setNotes]                   = useState("");
  const [classPdf, setClassPdf]             = useState<File | null>(null);
  const [studentSlots, setStudentSlots]     = useState<StudentSlot[]>([]);
  const [uploading, setUploading]           = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const classFileInputRef    = useRef<HTMLInputElement | null>(null);
  const batchFileInputRef    = useRef<HTMLInputElement | null>(null);

  // ── Subscriptions ──────────────────────────────────────────────────────────
  // Classes — same-school, filtered by mode (K-12 vs PP).
  useEffect(() => {
    if (!schoolId) { setClassesLoaded(true); return; }
    const q = query(collection(db, "classes"), where("schoolId", "==", schoolId));
    const unsub = onSnapshot(q, snap => {
      const rows: ClassRow[] = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ClassRow))
        .filter(cfg.isClassEligible);
      // Sort by name + section for stable rendering.
      rows.sort((a, b) => `${a.name}-${a.section}`.localeCompare(`${b.name}-${b.section}`));
      setClasses(rows);
      setClassesLoaded(true);
    }, () => setClassesLoaded(true));
    return () => unsub();
  }, [schoolId, cfg.isClassEligible]);

  // Past results — same-school, latest first.
  useEffect(() => {
    if (!schoolId) { setPastLoaded(true); return; }
    const q = query(
      collection(db, cfg.collectionName),
      where("schoolId", "==", schoolId),
      orderBy("publishedAt", "desc"),
    );
    const unsub = onSnapshot(q, snap => {
      setPastResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as ResultDoc)));
      setPastLoaded(true);
    }, err => {
      // Index missing fires here on the very first deploy — surface to console
      // so we know to deploy the composite index from firestore.indexes.json.
      console.warn(`[${cfg.collectionName}] subscription error:`, err);
      setPastLoaded(true);
    });
    return () => unsub();
  }, [schoolId, cfg.collectionName]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedClass = useMemo(
    () => classes.find(c => c.id === selectedClassId),
    [classes, selectedClassId],
  );

  // Load students for the picked class — one-shot fetch, not a subscription
  // (students rarely change mid-upload; live sub would create flicker as slots
  // re-key whenever an unrelated student doc updated).
  const [classStudents, setClassStudents] = useState<StudentRow[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  useEffect(() => {
    if (!schoolId || !selectedClassId) {
      setClassStudents([]); setStudentsLoaded(false); return;
    }
    setStudentsLoaded(false);
    (async () => {
      try {
        const snap = await import("firebase/firestore").then(({ getDocs }) =>
          getDocs(query(
            collection(db, "students"),
            where("schoolId", "==", schoolId),
            where("classId",  "==", selectedClassId),
          ))
        );
        const rows: StudentRow[] = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as StudentRow))
          .sort((a, b) => {
            // Sort by numeric roll where possible, else by name.
            const ar = Number(a.rollNumber ?? a.rollNo);
            const br = Number(b.rollNumber ?? b.rollNo);
            if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
            const an = (a.firstName || a.name || "").toLowerCase();
            const bn = (b.firstName || b.name || "").toLowerCase();
            return an.localeCompare(bn);
          });
        setClassStudents(rows);
        // Seed slots with empty file picks (one slot per student).
        setStudentSlots(rows.map(s => ({
          studentId: s.id,
          studentName: [s.firstName || s.name || "", s.lastName || ""].join(" ").trim() || `Student ${s.id.slice(-4)}`,
          rollNumber: String(s.rollNumber ?? s.rollNo ?? ""),
          file: null,
          source: null,
          status: "pending",
        })));
      } catch (err) {
        console.error("[students fetch]", err);
        toast.error("Could not load students for this class.");
      } finally {
        setStudentsLoaded(true);
      }
    })();
  }, [schoolId, selectedClassId]);

  // ── Auto-match logic ───────────────────────────────────────────────────────
  // Given a set of files + the student slot list, assign each file to a student.
  // Strategy: roll-number digits in filename → exact roll match.
  // Returns: { matchedSlots (new array), unmatchedFiles (array) }.
  function autoMatchFiles(files: File[]): { matchedSlots: StudentSlot[]; unmatchedFiles: File[] } {
    const taken = new Set<string>(); // studentIds already filled
    const next = studentSlots.map(s => ({ ...s }));
    const unmatched: File[] = [];

    // Preserve existing manual selections — don't overwrite them on a re-batch.
    next.forEach(s => { if (s.file && s.source === "manual") taken.add(s.studentId); });

    for (const file of files) {
      const stem = file.name.toLowerCase().replace(/\.pdf$/i, "");
      // Find all digit groups; try each against roll numbers (longest first to
      // avoid matching "1" inside "10" when both 1 and 10 exist).
      const digitGroups = (stem.match(/\d+/g) || []).sort((a, b) => b.length - a.length);

      let matched: StudentSlot | null = null;
      for (const grp of digitGroups) {
        const target = next.find(s =>
          !taken.has(s.studentId)
          && s.rollNumber
          && (s.rollNumber === grp || s.rollNumber === grp.replace(/^0+/, ""))
        );
        if (target) { matched = target; break; }
      }
      // Fallback: token-overlap name match (≥50% overlap = auto).
      if (!matched) {
        const fileTokens = stem.split(/[\s\-_.]+/).filter(w => w.length > 2);
        let best: { slot: StudentSlot; score: number } | null = null;
        for (const slot of next) {
          if (taken.has(slot.studentId)) continue;
          const nameTokens = slot.studentName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          if (!nameTokens.length || !fileTokens.length) continue;
          const overlap = fileTokens.filter(w => nameTokens.some(nt => nt === w || nt.startsWith(w) || w.startsWith(nt))).length;
          const score = overlap / Math.max(fileTokens.length, nameTokens.length);
          if (score >= 0.5 && (!best || score > best.score)) best = { slot, score };
        }
        if (best) matched = best.slot;
      }

      if (matched) {
        matched.file = file;
        matched.source = "auto";
        matched.status = "pending";
        matched.error = undefined;
        taken.add(matched.studentId);
      } else {
        unmatched.push(file);
      }
    }

    return { matchedSlots: next, unmatchedFiles: unmatched };
  }

  function handleBatchFilesPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const oversized = files.filter(f => f.size > MAX_PDF_BYTES);
    if (oversized.length) {
      toast.error(`${oversized.length} file(s) over 10 MB — please compress and retry.`);
      return;
    }
    const eligible = files.filter(f => f.size <= MAX_PDF_BYTES);
    if (eligible.length === 0) {
      toast.error("No valid PDF files selected.");
      return;
    }
    const { matchedSlots, unmatchedFiles } = autoMatchFiles(eligible);
    setStudentSlots(matchedSlots);
    const matchCount = matchedSlots.filter(s => s.file && s.source === "auto").length;
    if (unmatchedFiles.length === 0) {
      toast.success(`${matchCount} files auto-matched ✓`);
    } else {
      toast.message(`${matchCount} auto-matched · ${unmatchedFiles.length} need manual assignment`);
    }
  }

  function handleSlotFilePicked(studentId: string, file: File | null) {
    if (file && file.size > MAX_PDF_BYTES) {
      toast.error(`${file.name} is over 10 MB — please compress.`);
      return;
    }
    setStudentSlots(prev => prev.map(s =>
      s.studentId === studentId
        ? { ...s, file, source: file ? "manual" : null, status: "pending", error: undefined }
        : s
    ));
  }

  // ── Reset dialog state ─────────────────────────────────────────────────────
  function resetForm() {
    setSelectedClassId("");
    setExamName(cfg.defaultExamName);
    setExamType(cfg.examTypes[0].key);
    setTerm(cfg.termOptions[0].key);
    setExamDate("");
    setNotes("");
    setClassPdf(null);
    setStudentSlots([]);
    setUploadProgress({ done: 0, total: 0 });
    setClassStudents([]);
    setStudentsLoaded(false);
  }

  // ── Publish flow ───────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!schoolId) return toast.error("School context missing — please re-login.");
    if (!selectedClass) return toast.error("Pick a class first.");
    if (!examName.trim()) return toast.error("Exam name is required.");

    const filledSlots = studentSlots.filter(s => s.file);
    if (filledSlots.length === 0 && !classPdf) {
      return toast.error("Upload at least one PDF (class-wide or per-student).");
    }

    setUploading(true);
    setUploadProgress({ done: 0, total: filledSlots.length + (classPdf ? 1 : 0) });

    try {
      // Step 1 — create a draft doc to get a stable resultId for storage paths.
      const draftRef = await addDoc(collection(db, cfg.collectionName), {
        schoolId,
        classId: selectedClass.id,
        className: selectedClass.name || "Class",
        section: selectedClass.section || "",
        examName: examName.trim(),
        examType,
        academicYear,
        term,
        examDate: examDate || undefined,
        notes: notes.trim() || undefined,
        studentResults: [],
        publishedBy: {
          uid:  userData?.id || "",
          name: userData?.name || "Principal",
          role: userData?.role || "principal",
        },
        status: "draft",
        visibleToParents: false,
        publishedAt: serverTimestamp(),
      });
      const resultId = draftRef.id;

      // Step 2 — upload all files in parallel.
      const uploads: Promise<void>[] = [];
      let classPdfUrl: string | undefined;
      let classPdfName: string | undefined;
      let classPdfSize: number | undefined;

      if (classPdf) {
        uploads.push((async () => {
          const r = storageRef(storage, `${cfg.storageBase}/${schoolId}/${resultId}/class.pdf`);
          await uploadBytes(r, classPdf, { contentType: "application/pdf" });
          classPdfUrl  = await getDownloadURL(r);
          classPdfName = classPdf.name;
          classPdfSize = classPdf.size;
          setUploadProgress(p => ({ ...p, done: p.done + 1 }));
        })());
      }

      const studentResults: ResultDoc["studentResults"] = [];
      for (const slot of filledSlots) {
        uploads.push((async () => {
          try {
            setStudentSlots(prev => prev.map(s => s.studentId === slot.studentId ? { ...s, status: "uploading" } : s));
            const r = storageRef(storage, `${cfg.storageBase}/${schoolId}/${resultId}/${slot.studentId}.pdf`);
            await uploadBytes(r, slot.file!, { contentType: "application/pdf" });
            const url = await getDownloadURL(r);
            studentResults.push({
              studentId:   slot.studentId,
              studentName: slot.studentName,
              rollNumber:  slot.rollNumber || undefined,
              pdfUrl:      url,
              pdfName:     slot.file!.name,
              pdfSize:     slot.file!.size,
            });
            setStudentSlots(prev => prev.map(s => s.studentId === slot.studentId ? { ...s, status: "done" } : s));
          } catch (err: any) {
            setStudentSlots(prev => prev.map(s => s.studentId === slot.studentId ? { ...s, status: "error", error: err?.message?.slice(0, 80) } : s));
            throw err;
          } finally {
            setUploadProgress(p => ({ ...p, done: p.done + 1 }));
          }
        })());
      }

      // Wait for everything — `Promise.allSettled` so partial failures still publish what worked.
      const settled = await Promise.allSettled(uploads);
      const failed = settled.filter(r => r.status === "rejected").length;

      // Step 3 — patch the doc with URLs + flip status to published.
      await updateDoc(doc(db, cfg.collectionName, resultId), {
        classPdfUrl, classPdfName, classPdfSize,
        studentResults,
        status: "published",
        visibleToParents: true,
      });

      if (failed > 0) {
        toast.warning(`Published with ${failed} upload error(s). Check the rows marked red and re-upload those students.`);
      } else {
        toast.success(`Results published — ${studentResults.length} student PDF${studentResults.length !== 1 ? "s" : ""}${classPdfUrl ? " + class summary" : ""}.`);
      }

      setOpen(false);
      resetForm();
    } catch (err: any) {
      console.error("[principal results publish]", err);
      toast.error(err?.message || "Failed to publish. Please retry.");
    } finally {
      setUploading(false);
    }
  }

  // ── Delete a past result ───────────────────────────────────────────────────
  async function handleDelete(resultId: string) {
    if (!schoolId) return;
    if (!confirm("Delete this published result? Parents + teachers will lose access to the PDFs.")) return;
    try {
      const target = pastResults.find(r => r.id === resultId);
      // Best-effort storage cleanup — ignore individual failures since the
      // Firestore doc delete is the source of truth for visibility.
      if (target) {
        const cleanup: Promise<void>[] = [];
        if (target.classPdfUrl) {
          cleanup.push(deleteObject(storageRef(storage, `${cfg.storageBase}/${schoolId}/${resultId}/class.pdf`)).catch(() => {}));
        }
        target.studentResults?.forEach(sr => {
          cleanup.push(deleteObject(storageRef(storage, `${cfg.storageBase}/${schoolId}/${resultId}/${sr.studentId}.pdf`)).catch(() => {}));
        });
        await Promise.all(cleanup);
      }
      await deleteDoc(doc(db, cfg.collectionName, resultId));
      toast.success("Result deleted.");
    } catch (err: any) {
      toast.error(err?.message || "Delete failed.");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const autoMatched   = studentSlots.filter(s => s.source === "auto").length;
  const manualMatched = studentSlots.filter(s => s.source === "manual").length;
  const unmatched     = studentSlots.filter(s => !s.file).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-[#1e3a8a] text-white flex items-center justify-center shadow-lg shadow-blue-900/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#1e294b] tracking-tight">{cfg.pageTitle}</h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">{cfg.pageSubtitle}</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => { resetForm(); setOpen(true); }}
          className="h-11 px-5 rounded-xl bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-bold shadow-lg shadow-blue-900/15"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Upload New Result
        </Button>
      </div>

      {/* ── Past results list ─────────────────────────────────────────────── */}
      {!pastLoaded ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#1e3a8a]" /></div>
      ) : pastResults.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500 mb-1">No results published yet</p>
          <p className="text-xs text-slate-400">Click "Upload New Result" to publish your first set of result PDFs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pastResults.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-base font-bold text-[#1e294b] truncate">{r.examName}</h3>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      r.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    {r.className}{r.section ? ` · ${r.section}` : ""} · {cfg.termOptions.find(t => t.key === r.term)?.label || r.term} · {r.academicYear}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="shrink-0 w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors flex items-center justify-center"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {r.classPdfUrl && (
                  <a href={r.classPdfUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1e3a8a] text-xs font-bold transition-colors">
                    <Download className="w-3 h-3" /> Class PDF
                  </a>
                )}
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                  <Users className="w-3 h-3" /> {r.studentResults?.length || 0} student PDF{(r.studentResults?.length || 0) !== 1 ? "s" : ""}
                </span>
                {r.publishedAt?.toDate && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <CalendarIcon className="w-3 h-3" /> {format(r.publishedAt.toDate(), "MMM d, yyyy")}
                  </span>
                )}
              </div>
              {r.studentResults && r.studentResults.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 font-bold hover:text-[#1e3a8a]">
                    View per-student PDFs
                  </summary>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 pr-1">
                    {r.studentResults.map(sr => (
                      <a key={sr.studentId} href={sr.pdfUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                        <span className="text-xs font-medium text-slate-600 truncate">
                          {sr.rollNumber ? `#${sr.rollNumber} ` : ""}{sr.studentName}
                        </span>
                        <Download className="w-3 h-3 text-slate-400 shrink-0" />
                      </a>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Upload Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={o => { if (!uploading) setOpen(o); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[#1e294b]">Upload New Result</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Class-wide PDF goes to teachers; per-student PDFs go individually to each parent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Class picker */}
            <div>
              <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Class</Label>
              {!classesLoaded ? (
                <div className="h-11 rounded-xl bg-slate-50 animate-pulse" />
              ) : classes.length === 0 ? (
                <p className="text-xs text-amber-600 font-medium">{cfg.emptyLabel}</p>
              ) : (
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  disabled={uploading}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-[#1e3a8a]/30 focus:outline-none"
                >
                  <option value="">— Pick a class —</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.section ? ` · ${c.section}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Exam meta — 2-col grid on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Exam name</Label>
                <Input value={examName} onChange={e => setExamName(e.target.value)} disabled={uploading}
                  placeholder={cfg.defaultExamName} className="h-11 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Exam type</Label>
                <select value={examType} onChange={e => setExamType(e.target.value)} disabled={uploading}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-[#1e3a8a]/30 focus:outline-none">
                  {cfg.examTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Term</Label>
                <select value={term} onChange={e => setTerm(e.target.value)} disabled={uploading}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-[#1e3a8a]/30 focus:outline-none">
                  {cfg.termOptions.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Academic year</Label>
                <Input value={academicYear} onChange={e => setAcademicYear(e.target.value)} disabled={uploading}
                  placeholder="2026-27" className="h-11 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Exam date (optional)</Label>
                <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} disabled={uploading}
                  className="h-11 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Note to parents (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} disabled={uploading}
                  placeholder="e.g. PTM scheduled for next Saturday — please collect physical copy." className="h-11 rounded-xl" />
              </div>
            </div>

            {/* Class-wide PDF */}
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-700">Class summary PDF</p>
                  <p className="text-[11px] text-slate-400">Visible to all teachers + parents of this class. Optional.</p>
                </div>
                <input ref={classFileInputRef} type="file" accept="application/pdf" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > MAX_PDF_BYTES) { toast.error("Over 10 MB"); return; } setClassPdf(f); } }} />
                <Button type="button" variant="outline" size="sm" disabled={uploading}
                  onClick={() => classFileInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> {classPdf ? "Replace" : "Pick PDF"}
                </Button>
              </div>
              {classPdf && (
                <div className="flex items-center justify-between gap-2 mt-2 px-3 py-2 rounded-lg bg-slate-50 text-xs">
                  <span className="font-medium text-slate-600 truncate">📄 {classPdf.name} ({(classPdf.size / 1024).toFixed(0)} KB)</span>
                  <button onClick={() => setClassPdf(null)} className="text-slate-400 hover:text-rose-500" disabled={uploading}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Per-student batch upload */}
            {selectedClassId && (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Per-student PDFs</p>
                    <p className="text-[11px] text-slate-400">
                      Multi-select all student PDFs at once. System matches by roll number in filename (e.g.
                      <code className="bg-slate-100 rounded px-1 ml-1">aarav-12.pdf</code> → roll 12).
                    </p>
                  </div>
                  <input ref={batchFileInputRef} type="file" accept="application/pdf" multiple hidden
                    onChange={e => handleBatchFilesPicked(e.target.files)} />
                  <Button type="button" variant="outline" size="sm" disabled={uploading || !studentsLoaded}
                    onClick={() => batchFileInputRef.current?.click()}>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Pick all PDFs
                  </Button>
                </div>

                {!studentsLoaded ? (
                  <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading students…
                  </div>
                ) : studentSlots.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No students in this class.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3 text-[11px] font-bold mb-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> {autoMatched} auto-matched
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                        {manualMatched} manual
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 text-slate-500">
                        <AlertCircle className="w-3 h-3" /> {unmatched} unmatched
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                      {studentSlots.map(slot => (
                        <SlotRow key={slot.studentId} slot={slot} uploading={uploading} onPick={handleSlotFilePicked} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Upload progress */}
            {uploading && (
              <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-[#1e3a8a]" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-[#1e3a8a]">Uploading {uploadProgress.done} / {uploadProgress.total}…</p>
                  <div className="h-1.5 rounded-full bg-blue-100 mt-1.5 overflow-hidden">
                    <div className="h-full bg-[#1e3a8a] transition-all duration-300"
                      style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={uploading} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={uploading || !selectedClassId} onClick={handlePublish}
              className="bg-[#10b981] hover:bg-emerald-600 text-white font-bold">
              {uploading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Publishing…</> : <><Upload className="w-4 h-4 mr-1.5" /> Publish to Parents</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Per-student row — extracted for keyed re-renders on file pick ────────────
function SlotRow({ slot, uploading, onPick }: {
  slot: StudentSlot;
  uploading: boolean;
  onPick: (studentId: string, file: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  // Background tint by slot state — gives the user an at-a-glance view of
  // what's done / what's pending without having to read every status pill.
  const tint =
    slot.status === "done"      ? "bg-emerald-50/50 border-emerald-200" :
    slot.status === "error"     ? "bg-rose-50/50 border-rose-200" :
    slot.status === "uploading" ? "bg-blue-50/50 border-blue-200" :
    slot.file                   ? "bg-slate-50 border-slate-200" :
                                  "bg-white border-slate-100";
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${tint} transition-colors`}>
      <div className="w-8 text-center text-[10px] font-black text-slate-400 shrink-0">
        {slot.rollNumber ? `#${slot.rollNumber}` : "—"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-700 truncate">{slot.studentName}</p>
        {slot.file && (
          <p className="text-[10px] text-slate-400 truncate">
            📄 {slot.file.name}
            {slot.source === "auto" && <span className="ml-1.5 inline-block px-1 rounded bg-emerald-100 text-emerald-700 font-bold">AUTO</span>}
            {slot.source === "manual" && <span className="ml-1.5 inline-block px-1 rounded bg-blue-100 text-blue-700 font-bold">MANUAL</span>}
          </p>
        )}
        {slot.error && <p className="text-[10px] text-rose-500 font-bold">⚠ {slot.error}</p>}
      </div>
      <input ref={ref} type="file" accept="application/pdf" hidden
        onChange={e => onPick(slot.studentId, e.target.files?.[0] || null)} />
      {slot.status === "done" ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
      ) : slot.status === "uploading" ? (
        <Loader2 className="w-4 h-4 animate-spin text-[#1e3a8a] shrink-0" />
      ) : (
        <>
          <button onClick={() => ref.current?.click()} disabled={uploading}
            className="text-[10px] font-bold text-[#1e3a8a] hover:underline px-2 py-1 shrink-0">
            {slot.file ? "Change" : "Pick"}
          </button>
          {slot.file && (
            <button onClick={() => onPick(slot.studentId, null)} disabled={uploading}
              className="text-slate-300 hover:text-rose-500 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
