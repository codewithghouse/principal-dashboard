/**
 * PreTeachers.tsx — Principal-side invite + management for pre-primary
 * teachers (Playgroup, Nursery, LKG, UKG).
 *
 * Why a separate page (vs extending Teachers.tsx):
 *   • Visual + UX separation — pre-primary teachers' "subject" is a
 *     CLASS LEVEL, not a subject. The Subjects filter in Teachers.tsx
 *     doesn't apply.
 *   • Invite email CTA points to the PRE-PRIMARY dashboard URL (separate
 *     Vercel deploy), not the K-12 teacher-dashboard URL.
 *   • Class creation here always stamps `stage: "pre_primary"` so
 *     downstream code (pre-primary-teacher-dashboard AuthContext stage
 *     gate, dashboards filtering by stage) can route correctly.
 *
 * Data model: same `teachers` / `classes` / `teaching_assignments`
 * collections — pre-primary teachers are distinguished by:
 *   - teachers.stage === "pre_primary"  (canonical)
 *   - OR teachers.assignedClass contains Playgroup/Nursery/LKG/UKG (legacy fallback)
 */
import { useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  Sprout,
  Users,
  Search,
  Plus,
  Upload,
  Loader2,
  Activity,
  CalendarCheck,
  Star,
  CheckCircle,
  Pencil,
  Trash2,
  Check,
  X,
  Settings2,
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
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { sendGenericInviteEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";

// ─── Types + constants ────────────────────────────────────────────────────
// Default levels — seeded once per school on first visit. After that, the
// principal can add / rename / soft-delete via the "Manage levels" dialog.
const DEFAULT_LEVELS: Array<{ key: string; name: string; order: number }> = [
  { key: "playgroup", name: "Playgroup", order: 10 },
  { key: "nursery", name: "Nursery", order: 20 },
  { key: "lkg", name: "LKG", order: 30 },
  { key: "ukg", name: "UKG", order: 40 },
];

interface ClassLevel {
  id: string;
  schoolId: string;
  name: string;
  order: number;
  active: boolean;
  isDefault?: boolean;
  createdAt?: any;
}

// "Looks like pre-primary" — used to filter teachers from the shared
// `teachers` collection. Combines the canonical `stage` field with a token
// match across the school's CURRENT level names + the legacy default set
// (so renaming a level doesn't orphan old teachers).
const buildPpDetector = (levelNames: string[]) => {
  const tokens = [
    ...DEFAULT_LEVELS.map((l) => l.key), // legacy defaults always match
    ...levelNames.map((n) => n.toLowerCase()),
  ];
  return {
    isPrePrimary: (teacher: any): boolean => {
      if (teacher?.stage === "pre_primary") return true;
      const lc = String(teacher?.assignedClass ?? "").toLowerCase();
      return tokens.some((tok) => tok && lc.includes(tok));
    },
    detectLevel: (assignedClass?: string): string => {
      const lc = String(assignedClass ?? "").toLowerCase();
      // Prefer the longest match so "Pre-Nursery" wins over "Nursery"
      const candidates = [...tokens].sort((a, b) => b.length - a.length);
      for (const tok of candidates) {
        if (tok && lc.includes(tok)) {
          // Return the canonical display name (look up first in current levels,
          // fall back to title-cased token).
          const match = levelNames.find((n) => n.toLowerCase() === tok);
          if (match) return match;
          const defMatch = DEFAULT_LEVELS.find((d) => d.key === tok);
          if (defMatch) return defMatch.name;
          return tok.charAt(0).toUpperCase() + tok.slice(1);
        }
      }
      return "";
    },
  };
};

// Hardcoded inline like the other dashboards' invite emails — matches the
// K-12 Teachers.tsx pattern (which hardcodes teacher-dashboard-ochre.vercel.app
// directly in the email HTML). Update this constant when the deployment URL
// changes.
const PRE_PRIMARY_DASHBOARD_URL = "https://pre-primary-teacher.vercel.app";

// ─── Component ────────────────────────────────────────────────────────────
const PreTeachers = () => {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId || userData?.school || (userData as any)?.schoolID;
  const branchId = userData?.branchId || "";

  // Data
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Class levels — Firestore-backed, school-scoped, principal-editable
  const [levels, setLevels] = useState<ClassLevel[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(true);

  // Filters / search
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Invite dialog
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    level: "",
    section: "A",
  });
  const [isSending, setIsSending] = useState(false);

  // "Add custom level" inline input (inside invite dialog)
  const [showCustomLevelInput, setShowCustomLevelInput] = useState(false);
  const [customLevelDraft, setCustomLevelDraft] = useState("");

  // Manage levels dialog state
  const [isLevelManagerOpen, setIsLevelManagerOpen] = useState(false);
  const [renamingLevelId, setRenamingLevelId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Token-based pre-primary detection (rebuilt when levels change so a newly
  // created custom level instantly classifies teachers correctly).
  const { isPrePrimary, detectLevel } = useMemo(
    () => buildPpDetector(levels.map((l) => l.name)),
    [levels]
  );

  // Real-time teacher fetch (scoped by school) — filter pre-primary
  // client-side to keep the query simple + use existing indexes. We refilter
  // whenever the levels list changes so newly-added custom levels classify
  // the right teachers as pre-primary.
  const [allTeachers, setAllTeachers] = useState<any[]>([]);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);

    const unsub = onSnapshot(
      query(collection(db, "teachers"), where("schoolId", "==", schoolId)),
      (snap) => {
        setAllTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("[PreTeachers] teachers fetch failed:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [schoolId]);

  // Reclassify when teacher list or levels change. Always exclude archived
  // teachers from the active directory (mirrors K-12 Teachers.tsx).
  useEffect(() => {
    setTeachers(
      allTeachers.filter((t) => t.status !== "Archived" && isPrePrimary(t))
    );
  }, [allTeachers, isPrePrimary]);

  // Subscribe to school's configurable class levels. Seeds the 4 defaults
  // on first visit (idempotent via deterministic doc IDs).
  useEffect(() => {
    if (!schoolId) return;
    setLevelsLoading(true);

    const unsub = onSnapshot(
      query(
        collection(db, "pp_class_levels"),
        where("schoolId", "==", schoolId),
        where("active", "==", true)
      ),
      async (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as ClassLevel)
        );
        list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        if (list.length === 0 && userData) {
          // No levels yet for this school → seed defaults once.
          try {
            await seedDefaultLevels(schoolId, userData.id || userData.uid);
          } catch (err) {
            console.error("[PreTeachers] seed defaults failed:", err);
          }
          // Listener will fire again with the seeded docs; don't setLevels here.
          return;
        }

        setLevels(list);
        setLevelsLoading(false);

        // If the current invite-form level was deleted, reset it
        setInviteForm((prev) => {
          if (prev.level && !list.some((l) => l.name === prev.level)) {
            return { ...prev, level: list[0]?.name || "" };
          }
          if (!prev.level && list[0]) {
            return { ...prev, level: list[0].name };
          }
          return prev;
        });
      },
      (err) => {
        console.error("[PreTeachers] levels fetch failed:", err);
        setLevelsLoading(false);
      }
    );

    return () => unsub();
  }, [schoolId, userData]);

  // Filtered + searched
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return teachers.filter((t) => {
      const lvl = detectLevel(t.assignedClass);
      if (levelFilter && lvl !== levelFilter) return false;
      if (statusFilter) {
        const s = String(t.status || "").toLowerCase();
        if (s !== statusFilter.toLowerCase()) return false;
      }
      if (q) {
        const hay = `${t.name || ""} ${t.email || ""} ${t.assignedClass || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [teachers, search, levelFilter, statusFilter, detectLevel]);

  // Counters for hero + stat cards
  const stats = useMemo(() => {
    const active = teachers.filter(
      (t) => String(t.status || "").toLowerCase() === "active"
    ).length;
    const invited = teachers.filter(
      (t) => String(t.status || "").toLowerCase() === "invited"
    ).length;
    return { total: teachers.length, active, invited };
  }, [teachers]);

  // ── Invite handler ──────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) {
      toast.error("No school context — sign in again.");
      return;
    }
    const { name, email, level, section } = inviteForm;
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    if (!level) {
      toast.error("Please pick a class level (or add a custom one).");
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanSection = section.trim().toUpperCase() || "A";
    const className = `${level}-${cleanSection}`;

    setIsSending(true);
    try {
      const now = serverTimestamp();
      const audit = {
        _lastModifiedBy: userData?.id || userData?.uid || "principal",
        _lastModifiedAt: now,
      };

      const batch = writeBatch(db);
      const classRef = doc(collection(db, "classes"));
      const teacherRef = doc(collection(db, "teachers"));
      const assignmentRef = doc(collection(db, "teaching_assignments"));

      // 1. Class — features.diaperLog auto-enabled for "younger" levels
      // (Playgroup, Pre-Nursery, Nursery, Toddler, etc.). Principal can
      // toggle later from the class detail page (V3).
      const lvlLC = level.toLowerCase();
      const isYoungerLevel =
        lvlLC.includes("play") ||
        lvlLC.includes("nursery") ||
        lvlLC.includes("toddler") ||
        lvlLC.includes("pre-n") ||
        lvlLC.includes("pre nursery");

      batch.set(classRef, {
        schoolId,
        branchId,
        name: className,
        section: cleanSection,
        level,
        stage: "pre_primary",
        classTeacherEmail: cleanEmail,
        classTeacherName: name.trim(),
        teacherEmail: cleanEmail,
        teacherName: name.trim(),
        studentCount: 0,
        academicYear: currentAcademicYear(),
        features: {
          diaperLog: isYoungerLevel,
          napTracker: true,
          photoStudio: true,
          pickupVerification: true,
        },
        createdAt: now,
        updatedAt: now,
        ...audit,
      });

      // 2. Teacher (status Invited — auto-promotes on first login via
      // pre-primary-teacher-dashboard AuthContext).
      batch.set(teacherRef, {
        schoolId,
        branchId,
        email: cleanEmail,
        name: name.trim(),
        displayName: name.trim(),
        assignedClass: className,
        subject: "Class Teacher",
        status: "Invited",
        isActive: true,
        isPrimarySchool: true,
        stage: "pre_primary",
        classId: classRef.id,
        createdAt: now,
        invitedBy: userData?.id || userData?.uid || "",
        invitedAt: now,
        ...audit,
      });

      // 3. teaching_assignments
      batch.set(assignmentRef, {
        schoolId,
        branchId,
        teacherId: teacherRef.id,
        teacherEmail: cleanEmail,
        teacherName: name.trim(),
        classId: classRef.id,
        className,
        subject: "Class Teacher",
        subjectName: "Class Teacher",
        role: "class",
        status: "Active",
        createdAt: now,
        ...audit,
      });

      await batch.commit();

      // 4. Send invite email — points to PRE-PRIMARY dashboard, not K-12.
      try {
        await sendGenericInviteEmail({
          to: cleanEmail,
          name: name.trim(),
          schoolName: userData?.schoolName || "the institution",
          subject: `You're invited to ${userData?.schoolName || "Edullent"} as ${className} class teacher`,
          heading: `Welcome to ${className} 🌱`,
          bodyText: `You've been invited by ${userData?.schoolName || "your school"} as the class teacher for ${className} (Pre-Primary). Click below to sign in with this Google account and start your day.`,
          ctaUrl: PRE_PRIMARY_DASHBOARD_URL,
          ctaLabel: "Open Pre-Primary Dashboard",
        });
        toast.success(`${name.trim()} invited — email sent ✓`);
      } catch (mailErr) {
        console.error("[PreTeachers] email send failed:", mailErr);
        toast.warning(
          `${name.trim()} added to roster but invite email failed. Resend manually.`
        );
      }

      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", level: "UKG", section: "A" });
    } catch (err) {
      console.error("[PreTeachers] invite failed:", err);
      toast.error("Failed to invite teacher. Check permissions & try again.");
    } finally {
      setIsSending(false);
    }
  };

  // ── Archive (soft-delete) teacher ──────────────────────────────────────
  // Mirrors K-12 Teachers.tsx#handleDeleteTeacher: updates the teacher doc
  // (status="Archived", isActive=false, archivedAt=now) AND deactivates all
  // their teaching_assignments rows. Records stay intact for audit + re-
  // invite (the K-12 invite path has a "restore archived" branch keyed off
  // status === "Archived").
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const archiveTeacher = async (teacher: any) => {
    if (!schoolId) {
      toast.error("School context missing — re-login and try again.");
      return;
    }
    if (
      !window.confirm(
        `Remove ${teacher.name} from the system?\n\nTheir records (class assignments, attendance writes, observations) stay intact. They can be re-invited later using the same email.`
      )
    )
      return;

    setArchivingId(teacher.id);
    try {
      // Pre-fetch all teaching_assignments rows for this teacher so we can
      // deactivate them in the same batch — no orphan inconsistency.
      const aSnap = await getDocs(
        query(
          collection(db, "teaching_assignments"),
          where("schoolId", "==", schoolId),
          where("teacherId", "==", teacher.id)
        )
      );

      type Op = { ref: any; data: any };
      const ops: Op[] = [
        {
          ref: doc(db, "teachers", teacher.id),
          data: {
            status: "Archived",
            isActive: false,
            archivedAt: serverTimestamp(),
            _lastModifiedBy: userData?.id || userData?.uid || "",
            _lastModifiedAt: serverTimestamp(),
          },
        },
        ...aSnap.docs.map((d) => ({
          ref: d.ref,
          data: {
            teacherId: null,
            status: "inactive",
            deactivatedAt: serverTimestamp(),
            _lastModifiedBy: userData?.id || userData?.uid || "",
            _lastModifiedAt: serverTimestamp(),
          },
        })),
      ];

      // Chunk at 450 ops/batch (Firestore caps at 500) — matches the K-12
      // pattern, future-proofs against teachers with many assignments.
      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const slice = ops.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach((op) => batch.update(op.ref, op.data));
        await batch.commit();
      }

      toast.success(`${teacher.name} archived. Records stay intact.`);
    } catch (err) {
      console.error("[PreTeachers] archive failed:", err);
      toast.error("Failed to archive teacher.");
    } finally {
      setArchivingId(null);
    }
  };

  // ── Level management handlers ──────────────────────────────────────────
  const addCustomLevel = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    if (!schoolId || !userData) {
      toast.error("Sign-in lost. Refresh and try again.");
      return;
    }
    // Reject duplicates (case-insensitive)
    if (levels.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists.`);
      return;
    }
    const newRef = doc(collection(db, "pp_class_levels"));
    const maxOrder = levels.reduce((m, l) => Math.max(m, l.order || 0), 0);
    try {
      await setDoc(newRef, {
        schoolId,
        name,
        order: maxOrder + 10,
        active: true,
        isDefault: false,
        createdAt: serverTimestamp(),
        createdBy: userData.id || userData.uid || "",
        _lastModifiedBy: userData.id || userData.uid || "",
        _lastModifiedAt: serverTimestamp(),
      });
      toast.success(`"${name}" added`);
      // If the invite form had no level selected, pre-select the new one
      setInviteForm((prev) => (prev.level ? prev : { ...prev, level }));
      setCustomLevelDraft("");
      setShowCustomLevelInput(false);
    } catch (err) {
      console.error("[PreTeachers] addCustomLevel failed:", err);
      toast.error("Could not add level — check permissions & try again.");
    }
  };

  const renameLevel = async (levelId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (levels.some((l) => l.id !== levelId && l.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`"${trimmed}" already exists.`);
      return;
    }
    try {
      await updateDoc(doc(db, "pp_class_levels", levelId), {
        name: trimmed,
        _lastModifiedBy: userData?.id || userData?.uid || "",
        _lastModifiedAt: serverTimestamp(),
      });
      toast.success("Renamed");
      setRenamingLevelId(null);
      setRenameDraft("");
    } catch (err) {
      console.error("[PreTeachers] renameLevel failed:", err);
      toast.error("Rename failed.");
    }
  };

  const deleteLevel = async (levelId: string, levelName: string) => {
    // Soft-delete only. Existing teachers / classes that already use this
    // level name keep their `assignedClass` — they're still discoverable via
    // the legacy default-tokens matcher.
    if (!window.confirm(
      `Remove "${levelName}" from the picker?\n\nThis won't delete any existing teacher or class — they'll keep their current assigned class name. You're only removing it from the dropdown.`
    )) return;
    try {
      await updateDoc(doc(db, "pp_class_levels", levelId), {
        active: false,
        deactivatedAt: serverTimestamp(),
        _lastModifiedBy: userData?.id || userData?.uid || "",
        _lastModifiedAt: serverTimestamp(),
      });
      toast.success(`"${levelName}" removed`);
    } catch (err) {
      console.error("[PreTeachers] deleteLevel failed:", err);
      toast.error("Could not remove level.");
    }
  };

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: "#EEF4FF" }}>
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "#0055FF" }}
          >
            <Sprout className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "#001040" }}>
              Pre-Teachers
            </h1>
            <p className="text-sm" style={{ color: "#5070B0" }}>
              Pre-Primary teaching staff (Playgroup · Nursery · LKG · UKG)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toast.message("Bulk import — coming in next iteration")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border-2 transition active:scale-95"
            style={{
              borderColor: "#D7F5E3",
              background: "#E8FBEF",
              color: "#00834D",
            }}
          >
            <Upload className="w-4 h-4" />
            Bulk Import
          </button>
          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition active:scale-95 shadow-md"
            style={{ background: "#0055FF" }}
          >
            <Plus className="w-4 h-4" />
            Add Teacher
          </button>
        </div>
      </div>

      {/* ─── Hero card ─────────────────────────────────────────────────── */}
      <div
        className="rounded-3xl p-6 text-white relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #000A33 0%, #001A66 35%, #0044CC 70%, #0055FF 100%)",
        }}
      >
        <div className="flex items-center gap-4 justify-between flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">
                Faculty Directory
              </p>
              <p className="text-5xl font-black leading-none mt-1">{stats.total}</p>
              <p className="text-sm font-semibold opacity-80 mt-1">
                pre-primary teacher{stats.total === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-right">
            <HeroStat icon={<CheckCircle className="w-5 h-5" />} label="Active" value={String(stats.active)} />
            <HeroStat icon={<Sprout className="w-5 h-5" />} label="Invited" value={String(stats.invited)} />
          </div>
        </div>
      </div>

      {/* ─── Stat cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Avg Activity Completion"
          value="—"
          subline="Daily slots logged"
          icon={<Activity className="w-5 h-5 text-white" />}
          iconBg="#0055FF"
        />
        <StatCard
          label="Teacher Attendance"
          value="—"
          subline="Pre-primary section"
          icon={<CalendarCheck className="w-5 h-5 text-white" />}
          iconBg="#00C853"
        />
        <StatCard
          label="Parent Feedback"
          value="—"
          subline="Awaiting reviews"
          icon={<Star className="w-5 h-5 text-white" />}
          iconBg="#FFAA00"
        />
        <StatCard
          label="Active Teachers"
          value={`${stats.active}/${stats.total || "—"}`}
          subline="Currently signed in"
          icon={<Users className="w-5 h-5 text-white" />}
          iconBg="#7B3FF4"
        />
      </div>

      {/* ─── Search + filter row ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "#99AACC" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, class..."
            className="w-full h-11 pl-10 pr-3 rounded-xl border focus:outline-none focus:ring-2"
            style={{
              borderColor: "#E0E7FF",
              background: "#F4F7FE",
              color: "#001040",
            }}
          />
        </div>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="h-11 px-4 rounded-xl border bg-white text-sm font-semibold cursor-pointer min-w-[160px]"
          style={{ borderColor: "#E0E7FF", color: "#001040" }}
        >
          <option value="">All Levels</option>
          {levels.map((l) => (
            <option key={l.id} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-11 px-4 rounded-xl border bg-white text-sm font-semibold cursor-pointer min-w-[140px]"
          style={{ borderColor: "#E0E7FF", color: "#001040" }}
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Invited">Invited</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      {/* ─── Faculty Directory ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "#E0E7FF" }}
          >
            <GraduationCap className="w-5 h-5" style={{ color: "#0055FF" }} />
          </div>
          <h2 className="text-base font-black" style={{ color: "#001040" }}>
            Faculty Directory
          </h2>
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "#E0E7FF", color: "#0055FF" }}
          >
            {filtered.length} teacher{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl p-12 flex flex-col items-center gap-3" style={{ color: "#5070B0" }}>
            <Loader2 className="w-7 h-7 animate-spin" />
            <p className="text-xs">Loading pre-primary teachers…</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasAny={teachers.length > 0}
            onAdd={() => setIsInviteOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((t) => (
              <TeacherCard
                key={t.id}
                teacher={t}
                detectLevel={detectLevel}
                onArchive={() => archiveTeacher(t)}
                archiving={archivingId === t.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Invite Dialog ────────────────────────────────────────────── */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sprout className="w-5 h-5" style={{ color: "#00C853" }} />
              Invite Pre-Primary Teacher
            </DialogTitle>
            <DialogDescription>
              Creates a new pre-primary class and invites the teacher via email.
              They'll log in with their Google account at the Pre-Primary
              Dashboard.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pp-name">Teacher's full name</Label>
              <Input
                id="pp-name"
                required
                value={inviteForm.name}
                onChange={(e) =>
                  setInviteForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Priya Kapoor"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pp-email">Google email (they'll sign in with this)</Label>
              <Input
                id="pp-email"
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="priya.kapoor@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Class level</Label>
                <button
                  type="button"
                  onClick={() => setIsLevelManagerOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold"
                  style={{ color: "#0055FF" }}
                >
                  <Settings2 className="w-3 h-3" />
                  Manage levels
                </button>
              </div>
              {levelsLoading ? (
                <div className="h-10 flex items-center justify-center text-xs" style={{ color: "#5070B0" }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {levels.map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() =>
                        setInviteForm((p) => ({ ...p, level: lvl.name }))
                      }
                      className="h-10 px-3 rounded-xl text-xs font-bold transition active:scale-95"
                      style={
                        inviteForm.level === lvl.name
                          ? { background: "#0055FF", color: "#fff" }
                          : {
                              background: "#F4F7FE",
                              color: "#001040",
                              border: "1px solid #E0E7FF",
                            }
                      }
                    >
                      {lvl.name}
                    </button>
                  ))}
                  {!showCustomLevelInput ? (
                    <button
                      type="button"
                      onClick={() => setShowCustomLevelInput(true)}
                      className="h-10 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1 border-2 border-dashed"
                      style={{
                        borderColor: "#0055FF",
                        color: "#0055FF",
                        background: "#fff",
                      }}
                    >
                      <Plus className="w-3 h-3" />
                      Custom
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 h-10 px-2 rounded-xl border-2 bg-white" style={{ borderColor: "#0055FF" }}>
                      <input
                        autoFocus
                        type="text"
                        value={customLevelDraft}
                        onChange={(e) => setCustomLevelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomLevel(customLevelDraft);
                          } else if (e.key === "Escape") {
                            setShowCustomLevelInput(false);
                            setCustomLevelDraft("");
                          }
                        }}
                        placeholder="e.g., Pre-Nursery"
                        className="w-32 text-xs font-bold outline-none"
                        style={{ color: "#001040" }}
                      />
                      <button
                        type="button"
                        onClick={() => addCustomLevel(customLevelDraft)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                        style={{ background: "#0055FF" }}
                        title="Add"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomLevelInput(false);
                          setCustomLevelDraft("");
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: "#F4F7FE", color: "#5070B0" }}
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px]" style={{ color: "#5070B0" }}>
                Different schools use different names. Add what your school calls it.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pp-section">Section</Label>
              <Input
                id="pp-section"
                required
                maxLength={2}
                value={inviteForm.section}
                onChange={(e) =>
                  setInviteForm((p) => ({
                    ...p,
                    section: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="A"
                className="uppercase max-w-[100px]"
              />
              <p className="text-[11px]" style={{ color: "#5070B0" }}>
                Class will be created as{" "}
                <strong>
                  {inviteForm.level}-{inviteForm.section.toUpperCase() || "A"}
                </strong>
              </p>
            </div>

            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                disabled={isSending}
                className="px-4 py-2 rounded-xl font-semibold text-sm border-2"
                style={{ borderColor: "#E0E7FF", color: "#5070B0" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-5 py-2 rounded-xl font-bold text-sm text-white inline-flex items-center gap-2 disabled:opacity-50"
                style={{ background: "#0055FF" }}
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create class + send invite
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Manage Levels Dialog ──────────────────────────────────────── */}
      <Dialog open={isLevelManagerOpen} onOpenChange={setIsLevelManagerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" style={{ color: "#0055FF" }} />
              Manage Class Levels
            </DialogTitle>
            <DialogDescription>
              Rename or remove the class levels used in your school's invite
              picker. Removing a level only hides it from the dropdown — existing
              teachers + classes keep their current names.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {levels.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "#5070B0" }}>
                No levels yet.
              </p>
            )}
            {levels.map((lvl) => {
              const isRenaming = renamingLevelId === lvl.id;
              return (
                <div
                  key={lvl.id}
                  className="flex items-center gap-2 p-3 rounded-xl border"
                  style={{ background: "#F4F7FE", borderColor: "#E0E7FF" }}
                >
                  {isRenaming ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            renameLevel(lvl.id, renameDraft);
                          } else if (e.key === "Escape") {
                            setRenamingLevelId(null);
                            setRenameDraft("");
                          }
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg border text-sm font-semibold outline-none"
                        style={{ borderColor: "#0055FF", color: "#001040" }}
                      />
                      <button
                        type="button"
                        onClick={() => renameLevel(lvl.id, renameDraft)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                        style={{ background: "#0055FF" }}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingLevelId(null);
                          setRenameDraft("");
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "#fff", color: "#5070B0" }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: "#001040" }}>
                          {lvl.name}
                        </p>
                        {lvl.isDefault && (
                          <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "#5070B0" }}>
                            Default
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingLevelId(lvl.id);
                          setRenameDraft(lvl.name);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "#fff", color: "#0055FF" }}
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLevel(lvl.id, lvl.name)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "#FEE2E2", color: "#C92A2A" }}
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}

            <div className="pt-2 border-t mt-2" style={{ borderColor: "#E0E7FF" }}>
              <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: "#5070B0" }}>
                Add new level
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customLevelDraft}
                  onChange={(e) => setCustomLevelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomLevel(customLevelDraft);
                    }
                  }}
                  placeholder="e.g., Pre-Nursery, Junior KG, Toddler Group"
                  className="flex-1 h-10 px-3 rounded-xl border bg-white text-sm outline-none focus:ring-2"
                  style={{ borderColor: "#E0E7FF", color: "#001040" }}
                />
                <button
                  type="button"
                  onClick={() => addCustomLevel(customLevelDraft)}
                  disabled={!customLevelDraft.trim()}
                  className="px-4 h-10 rounded-xl font-bold text-sm text-white inline-flex items-center gap-1 disabled:opacity-40"
                  style={{ background: "#0055FF" }}
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsLevelManagerOpen(false)}
              className="px-4 py-2 rounded-xl font-semibold text-sm border-2"
              style={{ borderColor: "#E0E7FF", color: "#5070B0" }}
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PreTeachers;

// ─── Sub-components ────────────────────────────────────────────────────────

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

function StatCard({
  label,
  value,
  subline,
  icon,
  iconBg,
}: {
  label: string;
  value: string;
  subline: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 relative overflow-hidden">
      <div
        className="absolute top-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <p className="text-[10px] uppercase tracking-widest font-bold pr-12" style={{ color: "#5070B0" }}>
        {label}
      </p>
      <p className="text-3xl font-black mt-2 leading-none" style={{ color: iconBg }}>
        {value}
      </p>
      <p className="text-xs mt-2" style={{ color: "#5070B0" }}>
        {subline}
      </p>
    </div>
  );
}

function EmptyState({
  hasAny,
  onAdd,
}: {
  hasAny: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-12 flex flex-col items-center text-center gap-3">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "#E0E7FF" }}
      >
        <Sprout className="w-8 h-8" style={{ color: "#0055FF" }} />
      </div>
      <h3 className="text-base font-black" style={{ color: "#001040" }}>
        {hasAny ? "No matches for your filters" : "No pre-primary teachers yet"}
      </h3>
      <p className="text-xs max-w-sm" style={{ color: "#5070B0" }}>
        {hasAny
          ? "Try clearing the level or status filter, or search by a different term."
          : "Add your first Playgroup / Nursery / LKG / UKG class teacher. They'll receive an email invite to the Pre-Primary Dashboard."}
      </p>
      {!hasAny && (
        <button
          onClick={onAdd}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "#0055FF" }}
        >
          <Plus className="w-4 h-4" />
          Add first teacher
        </button>
      )}
    </div>
  );
}

function TeacherCard({
  teacher,
  detectLevel,
  onArchive,
  archiving,
}: {
  teacher: any;
  detectLevel: (assignedClass?: string) => string;
  onArchive: () => void;
  archiving: boolean;
}) {
  const initials = String(teacher.name || "T")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const level = detectLevel(teacher.assignedClass);
  const statusLower = String(teacher.status || "").toLowerCase();
  const isActive = statusLower === "active";
  const isInvited = statusLower === "invited";

  // Avatar palette — deterministic from name so each card has a stable colour
  const palette = [
    { bg: "#E0E7FF", fg: "#0055FF" },
    { bg: "#FEF3C7", fg: "#C87014" },
    { bg: "#D1FAE5", fg: "#00834D" },
    { bg: "#FCE7F3", fg: "#BE185D" },
    { bg: "#EDE9FE", fg: "#6741D9" },
    { bg: "#E0F2FE", fg: "#0369A1" },
  ];
  const hash = String(teacher.name || "")
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  const av = palette[hash % palette.length];

  return (
    <div className="group relative bg-white rounded-2xl p-4 hover:shadow-md transition">
      {/* Archive button — top-right, visible on hover, always visible on touch */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
        disabled={archiving}
        title="Archive teacher"
        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100 active:scale-95 disabled:opacity-50"
        style={{ background: "#FEE2E2", color: "#C92A2A" }}
      >
        {archiving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-black shrink-0"
          style={{ background: av.bg, color: av.fg }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base truncate" style={{ color: "#001040" }}>
            {teacher.name || "—"}
          </h3>
          <p className="text-xs truncate" style={{ color: "#5070B0" }}>
            {teacher.assignedClass || "Unassigned"}
            {level && (
              <span className="ml-1.5 text-[10px] uppercase font-bold opacity-70">
                · {level}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-dashed space-y-1.5" style={{ borderColor: "#E0E7FF" }}>
        <Row label="Email" value={teacher.email || "—"} />
        <Row label="Section" value={teacher.section || teacher.assignedClass?.split("-")[1] || "—"} />
      </div>

      <div className="mt-3 pt-3 border-t" style={{ borderColor: "#E0E7FF" }}>
        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
          style={
            isActive
              ? { background: "#D1FAE5", color: "#00834D" }
              : isInvited
              ? { background: "#FEF3C7", color: "#C87014" }
              : { background: "#FEE2E2", color: "#C92A2A" }
          }
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isActive ? "#00C853" : isInvited ? "#FFAA00" : "#EF4444",
            }}
          />
          {teacher.status || "Unknown"}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "#5070B0" }}>{label}</span>
      <span className="font-semibold truncate ml-2 max-w-[60%] text-right" style={{ color: "#001040" }}>
        {value}
      </span>
    </div>
  );
}

function currentAcademicYear(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}-${year.toString().slice(-2)}`;
}

/**
 * Seed the 4 default class levels for a school. Idempotent via deterministic
 * doc IDs (`${schoolId}_${levelKey}`) so concurrent first-load triggers from
 * multiple principal sessions just overwrite with the same data.
 */
async function seedDefaultLevels(schoolId: string, principalUid: string) {
  const batch = writeBatch(db);
  DEFAULT_LEVELS.forEach((lvl) => {
    const ref = doc(db, "pp_class_levels", `${schoolId}_${lvl.key}`);
    batch.set(ref, {
      schoolId,
      name: lvl.name,
      order: lvl.order,
      active: true,
      isDefault: true,
      createdAt: serverTimestamp(),
      createdBy: principalUid,
      _lastModifiedBy: principalUid,
      _lastModifiedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}
