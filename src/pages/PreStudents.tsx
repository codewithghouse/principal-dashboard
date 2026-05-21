/**
 * PreStudents.tsx — Principal-side student management for pre-primary classes.
 *
 * Single page handles:
 *   • Listing all pre-primary students (filtered via classes where
 *     stage === "pre_primary" or class-name token match).
 *   • Adding a new student with class assignment, parent contact, medical
 *     alerts, diet, comfort cue, authorized pickup.
 *   • Editing / reassigning a student to a different pre-primary class.
 *   • Archiving (soft-delete via status="Archived" + isActive=false).
 *   • Optionally sending the parent invite email at the same time.
 *
 * Atomic writes via writeBatch:
 *   • Create:  students/{id} + enrollments/{id} + (optional) class.studentCount++
 *   • Edit:    students/{id} update; if classId changed, enrollment moves too
 *              + studentCount adjusts on both classes.
 *   • Archive: students/{id} status flip + enrollment status flip.
 *
 * Mirrors PreTeachers + PreParents visual + interaction patterns so the
 * principal has a single mental model for pre-primary administration.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Backpack,
  Users,
  Search,
  Plus,
  Loader2,
  CheckCircle,
  Sparkles,
  Pencil,
  Trash2,
  AlertTriangle,
  Save,
  Mail,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { sendGenericInviteEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";

const PRE_PARENT_DASHBOARD_URL = "https://pre-parent-dashboard.vercel.app";

const PP_TOKENS = ["playgroup", "nursery", "lkg", "ukg", "pre"];

interface ClassRow extends DocumentData {
  id: string;
  schoolId?: string;
  name?: string;
  section?: string;
  stage?: string;
  level?: string;
  studentCount?: number;
}

interface StudentRow extends DocumentData {
  id: string;
  schoolId?: string;
  name?: string;
  classId?: string;
  className?: string;
  rollNo?: string | number;
  gender?: "M" | "F" | "Other";
  ageMonths?: number;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  allergies?: string[];
  medical?: string;
  diet?: string;
  comfortCue?: string;
  status?: string;
  isActive?: boolean;
  inviteSentAt?: any;
}

interface FormState {
  name: string;
  gender: "M" | "F" | "Other";
  ageMonths: string;
  classId: string;
  rollNo: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  diet: string;
  allergies: string;
  medical: string;
  comfortCue: string;
  inviteParentNow: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  gender: "M",
  ageMonths: "",
  classId: "",
  rollNo: "",
  parentName: "",
  parentEmail: "",
  parentPhone: "",
  diet: "Veg",
  allergies: "",
  medical: "",
  comfortCue: "",
  inviteParentNow: true,
};

const PreStudents = () => {
  const { userData } = useAuth();
  const schoolId =
    userData?.schoolId || userData?.school || (userData as any)?.schoolID;
  const branchId = userData?.branchId || "";

  // Live data
  const [allClasses, setAllClasses] = useState<ClassRow[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  // Dialog state
  type DialogMode = { type: "add" } | { type: "edit"; student: StudentRow };
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Resend the parent invite email for a student who already has parentEmail
  // on file. Also bumps inviteSentAt / inviteCount on the student doc so
  // principal can see the trail.
  const resendParentInvite = async (student: StudentRow) => {
    if (!student.parentEmail) return;
    setResendingId(student.id);
    try {
      const cls = ppClasses.find((c) => c.id === student.classId);
      await sendParentInvite({
        schoolName: userData?.schoolName,
        parentEmail: student.parentEmail,
        parentName: student.parentName || "",
        childName: student.name || "",
        className: cls?.name || student.className || "",
      });
      // Stamp the resend on the student doc (audit trail).
      try {
        const now = serverTimestamp();
        const batch = writeBatch(db);
        batch.update(doc(db, "students", student.id), {
          inviteSentAt: now,
          inviteCount: (Number(student.inviteCount) || 0) + 1,
          _lastModifiedBy: userData?.id || userData?.uid || "",
          _lastModifiedAt: now,
        });
        await batch.commit();
      } catch (auditErr) {
        // Don't fail the toast if just the audit-stamp failed.
        console.warn("[PreStudents] audit-stamp failed:", auditErr);
      }
    } finally {
      setResendingId(null);
    }
  };

  // Subscribe to classes
  useEffect(() => {
    if (!schoolId) return;
    setLoadingClasses(true);
    const unsub = onSnapshot(
      query(collection(db, "classes"), where("schoolId", "==", schoolId)),
      (snap) => {
        const rows: ClassRow[] = snap.docs.map((d) => ({
          ...(d.data() as DocumentData),
          id: d.id,
        }));
        setAllClasses(rows);
        setLoadingClasses(false);
      },
      (err) => {
        console.error("[PreStudents] classes:", err);
        setLoadingClasses(false);
      }
    );
    return () => unsub();
  }, [schoolId]);

  // Subscribe to students
  useEffect(() => {
    if (!schoolId) return;
    setLoadingStudents(true);
    const unsub = onSnapshot(
      query(collection(db, "students"), where("schoolId", "==", schoolId)),
      (snap) => {
        const rows: StudentRow[] = snap.docs.map((d) => ({
          ...(d.data() as DocumentData),
          id: d.id,
        }));
        setAllStudents(rows);
        setLoadingStudents(false);
      },
      (err) => {
        console.error("[PreStudents] students:", err);
        setLoadingStudents(false);
      }
    );
    return () => unsub();
  }, [schoolId]);

  const loading = loadingClasses || loadingStudents;

  // Pre-primary classes (canonical: stage; legacy: name-token)
  const ppClasses = useMemo<ClassRow[]>(() => {
    return allClasses
      .filter((c) => {
        if (c.stage === "pre_primary") return true;
        const lc = String(c.name ?? "").toLowerCase();
        return PP_TOKENS.some((t) => lc.includes(t));
      })
      .sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, { numeric: true })
      );
  }, [allClasses]);

  const ppClassIds = useMemo(
    () => new Set(ppClasses.map((c) => c.id)),
    [ppClasses]
  );

  // Pre-primary students = students in pp classes, excluding Archived
  const ppStudents = useMemo<StudentRow[]>(() => {
    return allStudents
      .filter((s) => s.classId && ppClassIds.has(s.classId))
      .filter((s) => s.status !== "Archived");
  }, [allStudents, ppClassIds]);

  // Filtered + searched
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ppStudents.filter((s) => {
      if (classFilter && s.classId !== classFilter) return false;
      if (q) {
        const hay = `${s.name || ""} ${s.parentName || ""} ${s.parentEmail || ""} ${s.className || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ppStudents, search, classFilter]);

  const stats = useMemo(() => {
    const withParent = ppStudents.filter((s) => !!s.parentEmail).length;
    const byClass = ppClasses.map((c) => ({
      ...c,
      count: ppStudents.filter((s) => s.classId === c.id).length,
    }));
    return { total: ppStudents.length, withParent, byClass };
  }, [ppStudents, ppClasses]);

  // ── Dialog handlers ─────────────────────────────────────────────────────

  const openAddDialog = () => {
    if (ppClasses.length === 0) {
      toast.error(
        "No pre-primary classes exist yet. Add a class via Pre-Teachers first."
      );
      return;
    }
    setForm({
      ...EMPTY_FORM,
      classId: ppClasses[0].id,
    });
    setDialog({ type: "add" });
  };

  const openEditDialog = (student: StudentRow) => {
    setForm({
      name: student.name || "",
      gender: (student.gender as FormState["gender"]) || "M",
      ageMonths: student.ageMonths != null ? String(student.ageMonths) : "",
      classId: student.classId || "",
      rollNo: student.rollNo != null ? String(student.rollNo) : "",
      parentName: student.parentName || "",
      parentEmail: student.parentEmail || "",
      parentPhone: student.parentPhone || "",
      diet: student.diet || "Veg",
      allergies: (student.allergies || []).join(", "),
      medical: student.medical || "",
      comfortCue: student.comfortCue || "",
      inviteParentNow: false,
    });
    setDialog({ type: "edit", student });
  };

  const closeDialog = () => {
    if (saving) return;
    setDialog(null);
    setForm(EMPTY_FORM);
  };

  // Auto-suggest next roll no when class changes in the form
  useEffect(() => {
    if (dialog?.type !== "add") return;
    if (!form.classId) return;
    if (form.rollNo) return; // don't overwrite manual entry
    const maxRoll = ppStudents
      .filter((s) => s.classId === form.classId)
      .reduce((m, s) => {
        const n = Number(s.rollNo);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
    setForm((p) => (p.rollNo ? p : { ...p, rollNo: String(maxRoll + 1) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.classId, dialog?.type]);

  // ── Save handler ────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !dialog) return;
    if (!form.name.trim()) {
      toast.error("Child's name is required.");
      return;
    }
    if (!form.classId) {
      toast.error("Pick a class.");
      return;
    }
    if (form.parentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parentEmail.trim())) {
      toast.error("Parent email is invalid.");
      return;
    }

    setSaving(true);
    try {
      const cls = ppClasses.find((c) => c.id === form.classId);
      if (!cls) {
        toast.error("Class not found.");
        setSaving(false);
        return;
      }
      const now = serverTimestamp();
      const audit = {
        _lastModifiedBy: userData?.id || userData?.uid || "",
        _lastModifiedAt: now,
      };
      const allergyList = form.allergies
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ageMonthsNum = form.ageMonths ? Number(form.ageMonths) : null;
      const rollNoNum = form.rollNo ? Number(form.rollNo) : null;
      const parentEmail = form.parentEmail.trim().toLowerCase();

      if (dialog.type === "add") {
        // CREATE flow — atomic batch:
        //   1. students/{newId}
        //   2. enrollments/{newId} (separate id)
        //   3. classes/{classId} increment studentCount
        const batch = writeBatch(db);
        const studentRef = doc(collection(db, "students"));
        const enrollRef = doc(collection(db, "enrollments"));

        batch.set(studentRef, {
          schoolId,
          branchId,
          name: form.name.trim(),
          gender: form.gender,
          ageMonths: ageMonthsNum,
          classId: cls.id,
          className: cls.name || "",
          rollNo: rollNoNum,
          parentName: form.parentName.trim() || "",
          parentEmail: parentEmail || "",
          // Mirror parentEmail into `email` so syncUserClaimsV2 (which
          // recognises K-12 parents via students.email) also recognises
          // pre-primary parents. Pre-primary kids don't have their own
          // email at 3-6 yrs, so reusing the field is safe + matches the
          // K-12 parent-dashboard auth pattern.
          email: parentEmail || "",
          parentPhone: form.parentPhone.trim() || "",
          allergies: allergyList,
          medical: form.medical.trim() || "",
          diet: form.diet || "Veg",
          comfortCue: form.comfortCue.trim() || "",
          status: "active",
          isActive: true,
          stage: "pre_primary",
          admissionDate: now,
          createdAt: now,
          ...audit,
        });

        batch.set(enrollRef, {
          schoolId,
          branchId,
          classId: cls.id,
          className: cls.name || "",
          studentId: studentRef.id,
          studentName: form.name.trim(),
          studentEmail: parentEmail || "",
          rollNo: rollNoNum,
          status: "active",
          enrolledAt: now,
          ...audit,
        });

        // Increment class.studentCount (compute new value locally — Firestore
        // increment() would be safer with concurrent writes, but matches K-12
        // pattern which avoids the dependency)
        batch.update(doc(db, "classes", cls.id), {
          studentCount: (Number(cls.studentCount) || 0) + 1,
          updatedAt: now,
          ...audit,
        });

        await batch.commit();
        toast.success(`${form.name.trim()} added to ${cls.name || "class"} 🎒`);

        // Optional: send parent invite email at the same time
        if (form.inviteParentNow && parentEmail) {
          await sendParentInvite({
            schoolName: userData?.schoolName,
            parentEmail,
            parentName: form.parentName.trim(),
            childName: form.name.trim(),
            className: cls.name || "",
          });
        }
      } else {
        // EDIT flow — possibly reassigns to a different class.
        const original = dialog.student;
        const classChanged = original.classId !== cls.id;

        const batch = writeBatch(db);

        batch.update(doc(db, "students", original.id), {
          name: form.name.trim(),
          gender: form.gender,
          ageMonths: ageMonthsNum,
          classId: cls.id,
          className: cls.name || "",
          rollNo: rollNoNum,
          parentName: form.parentName.trim() || "",
          parentEmail: parentEmail || "",
          // Keep `email` mirrored — see note in create flow above.
          email: parentEmail || "",
          parentPhone: form.parentPhone.trim() || "",
          allergies: allergyList,
          medical: form.medical.trim() || "",
          diet: form.diet || "Veg",
          comfortCue: form.comfortCue.trim() || "",
          updatedAt: now,
          ...audit,
        });

        if (classChanged) {
          // Find existing enrollment row(s) for this student — there should
          // only be one active, but defensive loop in case of stale rows.
          const enrolls = await getDocs(
            query(
              collection(db, "enrollments"),
              where("schoolId", "==", schoolId),
              where("studentId", "==", original.id)
            )
          );
          enrolls.docs.forEach((d) => {
            const data = d.data() as DocumentData;
            const isActive =
              !data.status ||
              (typeof data.status === "string" &&
                data.status.toLowerCase() === "active");
            if (isActive) {
              batch.update(d.ref, {
                classId: cls.id,
                className: cls.name || "",
                rollNo: rollNoNum,
                updatedAt: now,
                ...audit,
              });
            }
          });

          // Adjust both class counts
          if (original.classId) {
            const oldCls = allClasses.find((c) => c.id === original.classId);
            if (oldCls) {
              batch.update(doc(db, "classes", original.classId), {
                studentCount: Math.max(
                  0,
                  (Number(oldCls.studentCount) || 1) - 1
                ),
                updatedAt: now,
                ...audit,
              });
            }
          }
          batch.update(doc(db, "classes", cls.id), {
            studentCount: (Number(cls.studentCount) || 0) + 1,
            updatedAt: now,
            ...audit,
          });
        }

        await batch.commit();
        toast.success(
          classChanged
            ? `${form.name.trim()} moved to ${cls.name}`
            : `${form.name.trim()} updated`
        );

        if (form.inviteParentNow && parentEmail) {
          await sendParentInvite({
            schoolName: userData?.schoolName,
            parentEmail,
            parentName: form.parentName.trim(),
            childName: form.name.trim(),
            className: cls.name || "",
          });
        }
      }

      closeDialog();
    } catch (err) {
      console.error("[PreStudents] save failed:", err);
      toast.error("Save failed. Check permissions & try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Archive handler ─────────────────────────────────────────────────────

  const archiveStudent = async (student: StudentRow) => {
    if (!schoolId) return;
    if (
      !window.confirm(
        `Remove ${student.name} from the system?\n\nTheir records (attendance, observations) stay intact for audit. They can be re-admitted later.`
      )
    )
      return;
    setArchivingId(student.id);
    try {
      const now = serverTimestamp();
      const audit = {
        _lastModifiedBy: userData?.id || userData?.uid || "",
        _lastModifiedAt: now,
      };

      // Find related active enrollments to deactivate
      const enrolls = await getDocs(
        query(
          collection(db, "enrollments"),
          where("schoolId", "==", schoolId),
          where("studentId", "==", student.id)
        )
      );

      const batch = writeBatch(db);
      batch.update(doc(db, "students", student.id), {
        status: "Archived",
        isActive: false,
        archivedAt: now,
        ...audit,
      });

      enrolls.docs.forEach((d) => {
        batch.update(d.ref, {
          status: "inactive",
          deactivatedAt: now,
          ...audit,
        });
      });

      if (student.classId) {
        const cls = allClasses.find((c) => c.id === student.classId);
        if (cls) {
          batch.update(doc(db, "classes", student.classId), {
            studentCount: Math.max(0, (Number(cls.studentCount) || 1) - 1),
            updatedAt: now,
            ...audit,
          });
        }
      }

      await batch.commit();
      toast.success(`${student.name} archived. Records preserved.`);
    } catch (err) {
      console.error("[PreStudents] archive failed:", err);
      toast.error("Could not archive student.");
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: "#EEF4FF" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "#0055FF" }}
          >
            <Backpack className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "#001040" }}>
              Pre-Students
            </h1>
            <p className="text-sm" style={{ color: "#5070B0" }}>
              Add and assign students to Playgroup, Nursery, LKG, UKG classes
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openAddDialog}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition active:scale-95 shadow-md"
          style={{ background: "#0055FF" }}
        >
          <Plus className="w-4 h-4" />
          Add Student
        </button>
      </div>

      {/* Hero */}
      <div
        className="rounded-3xl p-6 text-white relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #000A33 0%, #001A66 35%, #0044CC 70%, #0055FF 100%)",
        }}
      >
        <div className="flex items-center gap-4 justify-between flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
              <Backpack className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">
                Pre-Primary Roster
              </p>
              <p className="text-5xl font-black leading-none mt-1">{stats.total}</p>
              <p className="text-sm font-semibold opacity-80 mt-1">
                active children
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-right">
            <HeroStat
              icon={<CheckCircle className="w-5 h-5" />}
              label="With Parent Email"
              value={String(stats.withParent)}
            />
            <HeroStat
              icon={<Users className="w-5 h-5" />}
              label="Classes"
              value={String(ppClasses.length)}
            />
          </div>
        </div>
      </div>

      {/* Per-class breakdown */}
      {stats.byClass.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats.byClass.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() =>
                setClassFilter(classFilter === c.id ? "" : c.id)
              }
              className={`rounded-2xl p-4 text-left transition active:scale-95 ${
                classFilter === c.id
                  ? "bg-edu-navy text-white shadow-lg"
                  : "bg-white hover:shadow-md"
              }`}
              style={
                classFilter === c.id
                  ? { background: "#0055FF" }
                  : { background: "#fff" }
              }
            >
              <p
                className="text-[10px] uppercase tracking-widest font-bold opacity-70"
                style={{ color: classFilter === c.id ? "#fff" : "#5070B0" }}
              >
                {c.level || "Class"}
              </p>
              <p
                className="text-lg font-black mt-1 truncate"
                style={{ color: classFilter === c.id ? "#fff" : "#001040" }}
              >
                {c.name}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: classFilter === c.id ? "#bfdbfe" : "#5070B0" }}
              >
                {c.count} student{c.count === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "#99AACC" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by child, parent, email, class..."
            className="w-full h-11 pl-10 pr-3 rounded-xl border focus:outline-none focus:ring-2"
            style={{
              borderColor: "#E0E7FF",
              background: "#F4F7FE",
              color: "#001040",
            }}
          />
        </div>
        {classFilter && (
          <button
            type="button"
            onClick={() => setClassFilter("")}
            className="text-xs font-bold px-3 py-2 rounded-lg"
            style={{ background: "#F4F7FE", color: "#0055FF" }}
          >
            Clear filter
          </button>
        )}
      </div>

      {/* List */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "#E0E7FF" }}
          >
            <Backpack className="w-5 h-5" style={{ color: "#0055FF" }} />
          </div>
          <h2 className="text-base font-black" style={{ color: "#001040" }}>
            Student Directory
          </h2>
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "#E0E7FF", color: "#0055FF" }}
          >
            {filtered.length}
          </span>
        </div>

        {loading ? (
          <div
            className="bg-white rounded-2xl p-12 flex flex-col items-center gap-3"
            style={{ color: "#5070B0" }}
          >
            <Loader2 className="w-7 h-7 animate-spin" />
            <p className="text-xs">Loading pre-primary students…</p>
          </div>
        ) : ppClasses.length === 0 ? (
          <EmptyHintNoClasses />
        ) : ppStudents.length === 0 ? (
          <EmptyHintNoStudents onAdd={openAddDialog} />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-sm font-bold" style={{ color: "#001040" }}>
              No matches
            </p>
            <p className="text-xs mt-1" style={{ color: "#5070B0" }}>
              Try clearing search / class filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((s) => (
              <StudentCard
                key={s.id}
                student={s}
                onEdit={() => openEditDialog(s)}
                onArchive={() => archiveStudent(s)}
                onResendInvite={() => resendParentInvite(s)}
                archiving={archivingId === s.id}
                resending={resendingId === s.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={!!dialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Backpack className="w-5 h-5" style={{ color: "#0055FF" }} />
              {dialog?.type === "edit" ? "Edit Student" : "Add Student"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === "edit"
                ? "Update child profile or reassign to a different pre-primary class."
                : "Create student record + enrollment in one atomic write. Class can be changed anytime via Edit."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSave}
            className="space-y-4 max-h-[60vh] overflow-y-auto pr-1"
          >
            <FormSection title="Child Profile">
              <Field label="Full name *">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Aanya Sharma"
                />
              </Field>

              <Field label="Gender">
                <div className="grid grid-cols-3 gap-2">
                  {(["M", "F", "Other"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, gender: g }))}
                      className="h-10 rounded-xl text-xs font-bold transition active:scale-95"
                      style={
                        form.gender === g
                          ? { background: "#0055FF", color: "#fff" }
                          : { background: "#F4F7FE", color: "#001040", border: "1px solid #E0E7FF" }
                      }
                    >
                      {g === "M" ? "Boy" : g === "F" ? "Girl" : "Other"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Age in months" hint="e.g. 48 = 4 years old">
                <Input
                  type="number"
                  min={12}
                  max={84}
                  value={form.ageMonths}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, ageMonths: e.target.value }))
                  }
                  placeholder="48"
                />
              </Field>
            </FormSection>

            <FormSection title="Class Assignment *">
              <Field label="Class">
                <select
                  required
                  value={form.classId}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, classId: e.target.value }))
                  }
                  className="w-full h-11 px-3 rounded-xl border bg-white text-sm font-semibold cursor-pointer"
                  style={{ borderColor: "#E0E7FF", color: "#001040" }}
                >
                  {ppClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.level ? `(${c.level})` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Roll number">
                <Input
                  type="number"
                  min={1}
                  value={form.rollNo}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, rollNo: e.target.value }))
                  }
                  placeholder="Auto-suggested"
                />
              </Field>
            </FormSection>

            <FormSection title="Parent Contact">
              <Field label="Parent name">
                <Input
                  value={form.parentName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, parentName: e.target.value }))
                  }
                  placeholder="e.g. Priyanka Sharma"
                />
              </Field>
              <Field label="Parent Gmail (for parent app)">
                <Input
                  type="email"
                  value={form.parentEmail}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, parentEmail: e.target.value }))
                  }
                  placeholder="parent@example.com"
                />
              </Field>
              <Field label="Parent phone">
                <Input
                  type="tel"
                  value={form.parentPhone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, parentPhone: e.target.value }))
                  }
                  placeholder="+91 98XXX XXXXX"
                />
              </Field>

              {form.parentEmail.trim() && (
                <label className="flex items-center gap-2 mt-1 p-2.5 rounded-lg cursor-pointer" style={{ background: "#F4F7FE" }}>
                  <input
                    type="checkbox"
                    checked={form.inviteParentNow}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, inviteParentNow: e.target.checked }))
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-xs" style={{ color: "#001040" }}>
                    Send parent invite email now (CTA →{" "}
                    <code className="text-edu-blue">pre-parent-dashboard.vercel.app</code>)
                  </span>
                </label>
              )}
            </FormSection>

            <FormSection title="Safety & Care (optional)">
              <Field label="Diet">
                <select
                  value={form.diet}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, diet: e.target.value }))
                  }
                  className="w-full h-11 px-3 rounded-xl border bg-white text-sm cursor-pointer"
                  style={{ borderColor: "#E0E7FF", color: "#001040" }}
                >
                  <option value="Veg">Veg</option>
                  <option value="Non-veg">Non-veg</option>
                  <option value="Jain">Jain</option>
                  <option value="Veg (no dairy)">Veg (no dairy)</option>
                  <option value="Gluten-free">Gluten-free</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Allergies" hint="Comma-separated (e.g. Peanuts, Dairy)">
                <Input
                  value={form.allergies}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, allergies: e.target.value }))
                  }
                  placeholder="Peanuts, Dairy"
                />
              </Field>
              <Field label="Medical notes">
                <textarea
                  value={form.medical}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, medical: e.target.value }))
                  }
                  rows={2}
                  placeholder="e.g. Mild asthma — inhaler in school bag"
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ borderColor: "#E0E7FF", color: "#001040" }}
                />
              </Field>
              <Field label="Comfort cue (from parent)" hint="What helps them feel safe?">
                <textarea
                  value={form.comfortCue}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, comfortCue: e.target.value }))
                  }
                  rows={2}
                  placeholder="e.g. Loves rhymes, soothed by humming"
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ borderColor: "#E0E7FF", color: "#001040" }}
                />
              </Field>
            </FormSection>

            <DialogFooter className="gap-2 sticky bottom-0 bg-white pt-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className="px-4 py-2 rounded-xl font-semibold text-sm border-2"
                style={{ borderColor: "#E0E7FF", color: "#5070B0" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl font-bold text-sm text-white inline-flex items-center gap-2 disabled:opacity-50"
                style={{ background: "#0055FF" }}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : dialog?.type === "edit" ? (
                  <Save className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {dialog?.type === "edit" ? "Save changes" : "Add student"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PreStudents;

// ─── Helpers + sub-components ───────────────────────────────────────────

async function sendParentInvite({
  schoolName,
  parentEmail,
  parentName,
  childName,
  className,
}: {
  schoolName?: string;
  parentEmail: string;
  parentName: string;
  childName: string;
  className: string;
}) {
  try {
    const firstName = (parentName || "Parent").split(" ")[0];
    const childFirst = (childName || "your child").split(" ")[0];
    await sendGenericInviteEmail({
      to: parentEmail,
      name: parentName || "Parent",
      schoolName: schoolName || "your school",
      subject: `${schoolName || "Edullent"} — ${childFirst}'s Pre-Primary Parent Portal`,
      heading: `Welcome, ${firstName} 🌱`,
      bodyText: `${childFirst} is enrolled in ${className || "the pre-primary class"} at ${schoolName || "our school"}. Sign in with this Gmail address (${parentEmail}) to see ${childFirst}'s mood, daily activities, photos, and pickup updates — live as they happen.`,
      ctaUrl: PRE_PARENT_DASHBOARD_URL,
      ctaLabel: "Open Parent Dashboard",
    });
    toast.success(`Parent invite emailed to ${parentEmail}`);
  } catch (err) {
    console.error("[PreStudents] parent invite email failed:", err);
    toast.warning(
      "Student saved but parent invite email failed. Resend from Pre-Parents page."
    );
  }
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
        {icon}
      </div>
      <div className="text-left">
        <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">
          {label}
        </p>
        <p className="text-2xl font-black leading-none mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function EmptyHintNoClasses() {
  return (
    <div className="bg-white rounded-2xl p-10 flex flex-col items-center text-center gap-3">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "#FFF9DB" }}
      >
        <AlertTriangle className="w-8 h-8" style={{ color: "#C87014" }} />
      </div>
      <h3 className="text-base font-black" style={{ color: "#001040" }}>
        No pre-primary classes yet
      </h3>
      <p className="text-xs max-w-sm" style={{ color: "#5070B0" }}>
        First invite a Pre-Primary teacher via the <strong>Pre-Teachers</strong>{" "}
        page — that creates the class. Then come back here to add students to it.
      </p>
    </div>
  );
}

function EmptyHintNoStudents({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-white rounded-2xl p-10 flex flex-col items-center text-center gap-3">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "#E0E7FF" }}
      >
        <Sparkles className="w-8 h-8" style={{ color: "#0055FF" }} />
      </div>
      <h3 className="text-base font-black" style={{ color: "#001040" }}>
        No students yet
      </h3>
      <p className="text-xs max-w-sm" style={{ color: "#5070B0" }}>
        Add your first pre-primary child. You can assign their class, enter
        parent contact, allergies, medical notes, and optionally email the parent invite right away.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white"
        style={{ background: "#0055FF" }}
      >
        <Plus className="w-4 h-4" />
        Add first student
      </button>
    </div>
  );
}

function StudentCard({
  student,
  onEdit,
  onArchive,
  onResendInvite,
  archiving,
  resending,
}: {
  student: StudentRow;
  onEdit: () => void;
  onArchive: () => void;
  onResendInvite: () => void;
  archiving: boolean;
  resending: boolean;
}) {
  const initials = String(student.name || "?")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hasAlert = (student.allergies?.length || 0) > 0 || !!student.medical;
  const ageYears = student.ageMonths ? Math.floor(student.ageMonths / 12) : null;
  const ageMonths = student.ageMonths ? student.ageMonths % 12 : null;

  // Avatar palette deterministic by name
  const palette = [
    { bg: "#E0E7FF", fg: "#0055FF" },
    { bg: "#FEF3C7", fg: "#C87014" },
    { bg: "#D1FAE5", fg: "#00834D" },
    { bg: "#FCE7F3", fg: "#BE185D" },
    { bg: "#EDE9FE", fg: "#6741D9" },
    { bg: "#E0F2FE", fg: "#0369A1" },
  ];
  const hash = String(student.name || "")
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  const av = palette[hash % palette.length];

  return (
    <div className="group relative bg-white rounded-2xl p-4 hover:shadow-md transition">
      {/* Top-right actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        {student.parentEmail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResendInvite();
            }}
            disabled={resending}
            title={`Resend invite to ${student.parentEmail}`}
            className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-95 disabled:opacity-50"
            style={{ background: "#D1FAE5", color: "#00834D" }}
          >
            {resending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Mail className="w-3 h-3" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit / reassign"
          className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-95"
          style={{ background: "#E0E7FF", color: "#0055FF" }}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          disabled={archiving}
          title="Archive"
          className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-95 disabled:opacity-50"
          style={{ background: "#FEE2E2", color: "#C92A2A" }}
        >
          {archiving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </button>
      </div>

      <div className="flex items-start gap-3 pr-12">
        <div className="relative">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black"
            style={{ background: av.bg, color: av.fg }}
          >
            {initials}
          </div>
          {hasAlert && (
            <div
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white"
              style={{ background: "#FFAA00", color: "#fff" }}
            >
              <AlertTriangle className="w-2 h-2" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="font-bold text-sm truncate"
            style={{ color: "#001040" }}
          >
            {student.name || "—"}
          </h3>
          <p className="text-[11px] truncate" style={{ color: "#5070B0" }}>
            {student.className || "—"}
            {student.rollNo != null && ` · Roll ${student.rollNo}`}
            {ageYears !== null && ` · ${ageYears}y ${ageMonths}m`}
          </p>
        </div>
      </div>

      <div
        className="mt-3 pt-3 border-t border-dashed space-y-1.5"
        style={{ borderColor: "#E0E7FF" }}
      >
        <Row label="Parent" value={student.parentName || "—"} />
        <Row
          label="Email"
          value={student.parentEmail || "Not set"}
          muted={!student.parentEmail}
        />
        {student.allergies && student.allergies.length > 0 && (
          <Row label="Allergies" value={student.allergies.join(", ")} warning />
        )}
      </div>

      {/* Parent link status pill */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "#E0E7FF" }}>
        {student.parentEmail ? (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
            style={{ background: "#D1FAE5", color: "#00834D" }}
          >
            <CheckCircle className="w-3 h-3" />
            Parent linked
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
            style={{ background: "#FFF9DB", color: "#C87014" }}
          >
            <AlertTriangle className="w-3 h-3" />
            Parent contact missing
          </span>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  warning,
  muted,
}: {
  label: string;
  value: string;
  warning?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "#5070B0" }}>{label}</span>
      <span
        className="font-semibold truncate ml-2 max-w-[60%] text-right"
        style={{
          color: warning ? "#C92A2A" : muted ? "#99AACC" : "#001040",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="text-[10px] font-black uppercase tracking-widest mb-2"
        style={{ color: "#5070B0" }}
      >
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
      {hint && (
        <p className="text-[10px]" style={{ color: "#5070B0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
