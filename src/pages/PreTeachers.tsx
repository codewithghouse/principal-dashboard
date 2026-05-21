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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GraduationCap,
  Sprout,
  Users,
  Search,
  Plus,
  Upload,
  Loader2,
  X,
  Activity,
  CalendarCheck,
  Star,
  CheckCircle,
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
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { sendGenericInviteEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────
const LEVELS = ["Playgroup", "Nursery", "LKG", "UKG"] as const;
type Level = (typeof LEVELS)[number];

const PP_TOKENS = ["playgroup", "nursery", "lkg", "ukg"];

const isPrePrimary = (teacher: any): boolean => {
  if (teacher?.stage === "pre_primary") return true;
  const lc = String(teacher?.assignedClass ?? "").toLowerCase();
  return PP_TOKENS.some((tok) => lc.includes(tok));
};

const detectLevel = (assignedClass?: string): Level | "" => {
  const lc = String(assignedClass ?? "").toLowerCase();
  if (lc.includes("playgroup")) return "Playgroup";
  if (lc.includes("nursery")) return "Nursery";
  if (lc.includes("lkg")) return "LKG";
  if (lc.includes("ukg")) return "UKG";
  return "";
};

// Configurable per env so a new Vercel deploy doesn't require a code edit.
const PRE_PRIMARY_DASHBOARD_URL =
  (import.meta as any).env?.VITE_PREPRIMARY_DASHBOARD_URL ||
  "https://pre-primary-teacher-dashboard.vercel.app";

// ─── Component ────────────────────────────────────────────────────────────
const PreTeachers = () => {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId || userData?.school || (userData as any)?.schoolID;
  const branchId = userData?.branchId || "";

  // Data
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters / search
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"" | Level>("");
  const [statusFilter, setStatusFilter] = useState("");

  // Invite dialog
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    level: "UKG" as Level,
    section: "A",
  });
  const [isSending, setIsSending] = useState(false);

  // Real-time teacher fetch (scoped by school) — filter pre-primary
  // client-side to keep the query simple + use existing indexes.
  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);

    const constraints = [where("schoolId", "==", schoolId)] as const;
    const unsub = onSnapshot(
      query(collection(db, "teachers"), ...constraints),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const pp = all.filter(isPrePrimary);
        setTeachers(pp);
        setLoading(false);
      },
      (err) => {
        console.error("[PreTeachers] teachers fetch failed:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [schoolId]);

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
  }, [teachers, search, levelFilter, statusFilter]);

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

      // 1. Class
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
          diaperLog: level === "Playgroup" || level === "Nursery",
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
          onChange={(e) => setLevelFilter(e.target.value as "" | Level)}
          className="h-11 px-4 rounded-xl border bg-white text-sm font-semibold cursor-pointer min-w-[160px]"
          style={{ borderColor: "#E0E7FF", color: "#001040" }}
        >
          <option value="">All Levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
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
              <TeacherCard key={t.id} teacher={t} />
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
              <Label>Class level</Label>
              <div className="grid grid-cols-4 gap-2">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setInviteForm((p) => ({ ...p, level: lvl }))}
                    className="h-10 rounded-xl text-xs font-bold transition active:scale-95"
                    style={
                      inviteForm.level === lvl
                        ? { background: "#0055FF", color: "#fff" }
                        : { background: "#F4F7FE", color: "#001040", border: "1px solid #E0E7FF" }
                    }
                  >
                    {lvl}
                  </button>
                ))}
              </div>
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

function TeacherCard({ teacher }: { teacher: any }) {
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
    <div className="bg-white rounded-2xl p-4 hover:shadow-md transition">
      <div className="flex items-start gap-3">
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
