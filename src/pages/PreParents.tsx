/**
 * PreParents.tsx — Principal-side parent management for pre-primary children.
 *
 * Lists every pre-primary student in the school (via classes where
 * stage === "pre_primary", then enrollments / students in those classes).
 * Per student: parent contact + invite status + invite button.
 *
 * Invite flow:
 *   1. Open dialog → name + email
 *   2. Atomic write parentName / parentEmail onto /students/{id}
 *   3. Send invite email via existing /api/send-email with CTA pointing to
 *      https://pre-parent-dashboard.vercel.app
 *
 * Teachers can ALSO invite parents (from pre-primary-teacher-dashboard
 * Roster bottom sheet), but they only set the email — they don't trigger
 * the actual email send because that app doesn't have the email API.
 * Principal-side here is the canonical email-send path.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Baby,
  Users,
  Search,
  Plus,
  Loader2,
  CheckCircle,
  Mail,
  Send,
  Sparkles,
  Phone,
  RefreshCw,
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
  updateDoc,
  where,
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
  stage?: string;
  level?: string;
}

interface StudentRow extends DocumentData {
  id: string;
  schoolId?: string;
  name?: string;
  classId?: string;
  className?: string;
  rollNo?: string | number;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  inviteSentAt?: any;
  inviteCount?: number;
}

const PreParents = () => {
  const { userData } = useAuth();
  const schoolId =
    userData?.schoolId || userData?.school || (userData as any)?.schoolID;

  // Data
  const [allClasses, setAllClasses] = useState<ClassRow[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "Invited" | "Not invited">(
    ""
  );

  // Invite dialog
  const [inviteFor, setInviteFor] = useState<StudentRow | null>(null);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "" });
  const [sending, setSending] = useState(false);

  // Subscribe to all classes for this school — narrow to pre-primary
  // client-side (handles both canonical stage===pre_primary and legacy
  // class-name-token-match cases).
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
        console.error("[PreParents] classes:", err);
        setLoadingClasses(false);
      }
    );
    return () => unsub();
  }, [schoolId]);

  // Subscribe to all students for this school. We filter to pre-primary
  // students by joining with the classes set above.
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
        console.error("[PreParents] students:", err);
        setLoadingStudents(false);
      }
    );
    return () => unsub();
  }, [schoolId]);

  const loading = loadingClasses || loadingStudents;

  // Build the set of pre-primary classIds, then the pre-primary student list.
  const ppStudents = useMemo<StudentRow[]>(() => {
    const isPp = (c: ClassRow): boolean => {
      if (c.stage === "pre_primary") return true;
      const lc = String(c.name ?? "").toLowerCase();
      return PP_TOKENS.some((t) => lc.includes(t));
    };
    const ppClassIds = new Set(allClasses.filter(isPp).map((c) => c.id));
    return allStudents.filter((s) => s.classId && ppClassIds.has(s.classId));
  }, [allClasses, allStudents]);

  // Filtered + searched
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ppStudents.filter((s) => {
      if (statusFilter === "Invited" && !s.parentEmail) return false;
      if (statusFilter === "Not invited" && s.parentEmail) return false;
      if (q) {
        const hay = `${s.name || ""} ${s.parentName || ""} ${s.parentEmail || ""} ${s.className || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ppStudents, search, statusFilter]);

  const stats = useMemo(() => {
    const invited = ppStudents.filter((s) => !!s.parentEmail).length;
    return { total: ppStudents.length, invited, missing: ppStudents.length - invited };
  }, [ppStudents]);

  const openInvite = (student: StudentRow) => {
    setInviteFor(student);
    setInviteForm({
      name: student.parentName || "",
      email: student.parentEmail || "",
    });
  };

  const closeInvite = () => {
    setInviteFor(null);
    setInviteForm({ name: "", email: "" });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFor || !schoolId) return;
    const cleanEmail = inviteForm.email.trim().toLowerCase();
    const cleanName = inviteForm.name.trim();
    if (!cleanEmail) {
      toast.error("Parent email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Enter a valid email.");
      return;
    }

    setSending(true);
    try {
      // STEP 1: write parent contact onto the student doc atomically.
      await updateDoc(doc(db, "students", inviteFor.id), {
        parentEmail: cleanEmail,
        parentName: cleanName || inviteFor.parentName || "",
        inviteSentAt: serverTimestamp(),
        inviteCount: (Number(inviteFor.inviteCount) || 0) + 1,
        _lastModifiedBy: userData?.id || userData?.uid || "",
        _lastModifiedAt: serverTimestamp(),
      });

      // STEP 2: send invite email via the established /api/send-email path.
      try {
        const firstName = (cleanName || "Parent").split(" ")[0];
        const childFirst = (inviteFor.name || "your child").split(" ")[0];
        await sendGenericInviteEmail({
          to: cleanEmail,
          name: cleanName || "Parent",
          schoolName: userData?.schoolName || "your school",
          subject: `${userData?.schoolName || "Edullent"} — ${childFirst}'s Pre-Primary Parent Portal`,
          heading: `Welcome, ${firstName} 🌱`,
          bodyText: `${childFirst} is enrolled in ${inviteFor.className || "the pre-primary class"} at ${userData?.schoolName || "our school"}. Sign in with this Gmail address (${cleanEmail}) to see ${childFirst}'s mood, daily activities, photos, and pickup updates — live as they happen.`,
          ctaUrl: PRE_PARENT_DASHBOARD_URL,
          ctaLabel: "Open Parent Dashboard",
        });
        toast.success(
          `Invite sent to ${cleanEmail} for ${inviteFor.name || "student"} ✓`
        );
      } catch (mailErr) {
        console.error("[PreParents] email send failed:", mailErr);
        toast.warning(
          `Saved parent contact but email failed. Share manually: ${PRE_PARENT_DASHBOARD_URL}`
        );
      }

      closeInvite();
    } catch (err) {
      console.error("[PreParents] invite failed:", err);
      toast.error("Failed to save parent contact.");
    } finally {
      setSending(false);
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
            <Baby className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "#001040" }}>
              Pre-Parents
            </h1>
            <p className="text-sm" style={{ color: "#5070B0" }}>
              Invite parents of your pre-primary children · {PRE_PARENT_DASHBOARD_URL.replace("https://", "")}
            </p>
          </div>
        </div>
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
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">
                Pre-Primary Students
              </p>
              <p className="text-5xl font-black leading-none mt-1">{stats.total}</p>
              <p className="text-sm font-semibold opacity-80 mt-1">
                children across pre-primary classes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-right">
            <HeroStat
              icon={<CheckCircle className="w-5 h-5" />}
              label="Invited"
              value={String(stats.invited)}
            />
            <HeroStat
              icon={<Mail className="w-5 h-5" />}
              label="Pending"
              value={String(stats.missing)}
            />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Pre-Primary"
          value={String(stats.total)}
          subline="Across all PP classes"
          icon={<Baby className="w-5 h-5 text-white" />}
          iconBg="#0055FF"
        />
        <StatCard
          label="Parents Invited"
          value={String(stats.invited)}
          subline="Have parent email on file"
          icon={<CheckCircle className="w-5 h-5 text-white" />}
          iconBg="#00C853"
        />
        <StatCard
          label="Invites Pending"
          value={String(stats.missing)}
          subline="Need parent contact"
          icon={<Mail className="w-5 h-5 text-white" />}
          iconBg="#FFAA00"
        />
      </div>

      {/* Search + filter */}
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
            placeholder="Search by child, parent, email, class..."
            className="w-full h-11 pl-10 pr-3 rounded-xl border focus:outline-none focus:ring-2"
            style={{
              borderColor: "#E0E7FF",
              background: "#F4F7FE",
              color: "#001040",
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "" | "Invited" | "Not invited")
          }
          className="h-11 px-4 rounded-xl border bg-white text-sm font-semibold cursor-pointer min-w-[160px]"
          style={{ borderColor: "#E0E7FF", color: "#001040" }}
        >
          <option value="">All Parents</option>
          <option value="Invited">Invited</option>
          <option value="Not invited">Not invited</option>
        </select>
      </div>

      {/* List */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "#E0E7FF" }}
          >
            <Users className="w-5 h-5" style={{ color: "#0055FF" }} />
          </div>
          <h2 className="text-base font-black" style={{ color: "#001040" }}>
            Parent Directory
          </h2>
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "#E0E7FF", color: "#0055FF" }}
          >
            {filtered.length} student{filtered.length === 1 ? "" : "s"}
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
        ) : ppStudents.length === 0 ? (
          <EmptyHint />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-sm font-bold" style={{ color: "#001040" }}>
              No matches for your filters
            </p>
            <p className="text-xs mt-1" style={{ color: "#5070B0" }}>
              Try clearing the status filter or search term.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <StudentRowCard
                key={s.id}
                student={s}
                onInvite={() => openInvite(s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Invite Dialog */}
      <Dialog open={!!inviteFor} onOpenChange={(open) => !open && closeInvite()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" style={{ color: "#0055FF" }} />
              Invite parent of {inviteFor?.name}
            </DialogTitle>
            <DialogDescription>
              Saves the parent's contact onto the student record + sends them a
              Welcome email with sign-in instructions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pp-parent-name">Parent's full name</Label>
              <Input
                id="pp-parent-name"
                value={inviteForm.name}
                onChange={(e) =>
                  setInviteForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Priya Sharma"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pp-parent-email">
                Parent's Google email (they'll sign in with this)
              </Label>
              <Input
                id="pp-parent-email"
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="parent@example.com"
                autoFocus
              />
            </div>

            <div
              className="text-[11px] rounded-lg p-3"
              style={{ background: "#F4F7FE", color: "#5070B0" }}
            >
              <p className="font-semibold mb-0.5" style={{ color: "#001040" }}>
                The email will include:
              </p>
              <ul className="list-disc list-inside leading-relaxed">
                <li>
                  Child name (<strong>{inviteFor?.name}</strong>) + class (
                  <strong>{inviteFor?.className || "—"}</strong>)
                </li>
                <li>School name: {userData?.schoolName || "—"}</li>
                <li>
                  CTA → <code className="text-edu-blue">{PRE_PARENT_DASHBOARD_URL.replace("https://", "")}</code>
                </li>
              </ul>
            </div>

            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={closeInvite}
                disabled={sending}
                className="px-4 py-2 rounded-xl font-semibold text-sm border-2"
                style={{ borderColor: "#E0E7FF", color: "#5070B0" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="px-5 py-2 rounded-xl font-bold text-sm text-white inline-flex items-center gap-2 disabled:opacity-50"
                style={{ background: "#0055FF" }}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {inviteFor?.parentEmail ? "Resend invite" : "Send invite"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PreParents;

// ─── Sub-components ───────────────────────────────────────────────────────

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
      <p
        className="text-[10px] uppercase tracking-widest font-bold pr-12"
        style={{ color: "#5070B0" }}
      >
        {label}
      </p>
      <p
        className="text-3xl font-black mt-2 leading-none"
        style={{ color: iconBg }}
      >
        {value}
      </p>
      <p className="text-xs mt-2" style={{ color: "#5070B0" }}>
        {subline}
      </p>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="bg-white rounded-2xl p-10 flex flex-col items-center text-center gap-3">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "#E0E7FF" }}
      >
        <Sparkles className="w-8 h-8" style={{ color: "#0055FF" }} />
      </div>
      <h3 className="text-base font-black" style={{ color: "#001040" }}>
        No pre-primary students yet
      </h3>
      <p className="text-xs max-w-sm" style={{ color: "#5070B0" }}>
        Once teachers are invited via the Pre-Teachers page and students are
        added to their classes (via the existing Students page), they'll
        appear here for parent invite.
      </p>
    </div>
  );
}

function StudentRowCard({
  student,
  onInvite,
}: {
  student: StudentRow;
  onInvite: () => void;
}) {
  const initials = String(student.name || "?")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const invited = !!student.parentEmail;

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
          style={{ background: "#E0E7FF", color: "#0055FF" }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="font-bold text-sm truncate"
            style={{ color: "#001040" }}
          >
            {student.name || "—"}
          </h3>
          <p className="text-[11px]" style={{ color: "#5070B0" }}>
            {student.className || "—"}
            {student.rollNo ? ` · Roll ${student.rollNo}` : ""}
          </p>
        </div>
      </div>

      <div
        className="mt-3 pt-3 border-t border-dashed space-y-1.5"
        style={{ borderColor: "#E0E7FF" }}
      >
        {invited ? (
          <>
            <Row label="Parent" value={student.parentName || "—"} />
            <Row label="Email" value={student.parentEmail || "—"} />
            {student.parentPhone && <Row label="Phone" value={student.parentPhone} />}
          </>
        ) : (
          <div
            className="text-[11px] text-center py-2 rounded-lg"
            style={{ background: "#FFF9DB", color: "#C87014" }}
          >
            Parent contact not added yet
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t" style={{ borderColor: "#E0E7FF" }}>
        <button
          type="button"
          onClick={onInvite}
          className="w-full h-9 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition active:scale-95"
          style={
            invited
              ? { background: "#F4F7FE", color: "#0055FF", border: "1px solid #E0E7FF" }
              : { background: "#0055FF", color: "#fff" }
          }
        >
          {invited ? (
            <>
              <RefreshCw className="w-3 h-3" />
              Resend invite
            </>
          ) : (
            <>
              <Send className="w-3 h-3" />
              Invite parent
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "#5070B0" }}>{label}</span>
      <span
        className="font-semibold truncate ml-2 max-w-[60%] text-right"
        style={{ color: "#001040" }}
      >
        {value}
      </span>
    </div>
  );
}
