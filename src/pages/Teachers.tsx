import { useState, useEffect, useRef } from "react";
import {
  CalendarCheck, Star, Users, Search, List,
  Plus, Upload, Download, FileSpreadsheet, CheckCircle,
  Loader2, GraduationCap, Eye, Trash2, Edit3, Save, Check, X,
  TrendingUp, MessageSquare, LayoutGrid, MoreHorizontal, BookOpen, MapPin
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import TeacherProfile from "@/components/TeacherProfile";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, serverTimestamp, query, where,
  onSnapshot, doc, updateDoc, getDocs, writeBatch
} from "firebase/firestore";
import { sendEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";
import { pctOfDoc, isPresent } from "@/lib/scoreUtils";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BulkTeacher {
  name: string;
  email: string;
  subject?: string;
  phone?: string;
  experience?: string;
  _status?: "pending" | "success" | "error" | "duplicate";
  _error?: string;
}

const TEMPLATE_DATA = [
  { Name: "Mrs. Kavita Sharma", Email: "kavita@example.com", Subject: "Mathematics", Phone: "9876543210", Experience: "5 years" },
  { Name: "Dr. Rajesh Kumar",   Email: "rajesh@example.com", Subject: "Physics",     Phone: "9876543211", Experience: "8 years" },
];

// ─── Component ────────────────────────────────────────────────────────────────
const Teachers = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI State ─────────────────────────────────────────────────────────────
  const [teachersData,     setTeachersData]     = useState<any[]>([]);
  const [selectedTeacher,  setSelectedTeacher]  = useState<any | null>(null);
  const [searchQuery,      setSearchQuery]      = useState("");
  const [subjectFilter,    setSubjectFilter]    = useState("");
  const [statusFilter,     setStatusFilter]     = useState("");
  const [viewMode,         setViewMode]         = useState<"grid" | "list">("grid");

  // ── Dialog State ──────────────────────────────────────────────────────────
  const [isInviteOpen,       setIsInviteOpen]       = useState(false);
  const [isBulkOpen,         setIsBulkOpen]         = useState(false);
  const [isRosterOpen,       setIsRosterOpen]       = useState(false);
  const [teacherToAssign,    setTeacherToAssign]    = useState<any | null>(null);
  const [teacherRoster,      setTeacherRoster]      = useState<any[]>([]);
  const [loadingRoster,      setLoadingRoster]      = useState(false);
  const [isSending,          setIsSending]          = useState(false);

  // ── Edit State ────────────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editName,   setEditName]   = useState("");

  // ── Bulk State ────────────────────────────────────────────────────────────
  const [bulkData,         setBulkData]         = useState<BulkTeacher[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkDone,         setBulkDone]         = useState(false);

  const [inviteForm,       setInviteForm]       = useState({ name: "", email: "", subject: "", assignClassId: "" });
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const availableClassesRef = useRef<any[]>([]); // ref so onSnapshot closures see latest value

  // ── Aggregated Stats State ────────────────────────────────────────────────
  const [avgRating,       setAvgRating]       = useState<number | null>(null);
  const [reviewCount,     setReviewCount]     = useState(0);
  const [avgClassPerf,    setAvgClassPerf]    = useState<number | null>(null);
  const [teacherAttPct,   setTeacherAttPct]   = useState<number | null>(null);
  // Per-teacher attendance map — keyed by teacherId. Built from
  // teacher_attendance so each card shows its OWN attendance instead of
  // displaying the org-wide value for every teacher (B7 silent bug).
  const [perTeacherAtt,   setPerTeacherAtt]   = useState<Record<string, number>>({});
  // Per-teacher review map — keyed by teacherId. Avoids the fake "5.0 ★"
  // default that used to show on EVERY teacher regardless of real reviews.
  const [perTeacherRating, setPerTeacherRating] = useState<Record<string, { rating: number; count: number }>>({});

  // ── Teacher Real-time Fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;

    // P0: schoolId-only server-side, branchId client-side. Server-side
    // branchId filter would silently hide teachers/classes whose branchId
    // hasn't been backfilled by the trigger yet (memory: branchid_inference_lag).
    const constraints: any[] = [where("schoolId", "==", schoolId)];
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    const q = query(collection(db, "teachers"), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const COLORS = [
          "bg-[#1e3a8a]", "bg-emerald-600", "bg-amber-500",
          "bg-rose-500",  "bg-indigo-600",  "bg-teal-600",
        ];
        const teachers = snap.docs
          .filter(d => inBranch(d.data()))
          .map((d, i) => {
            const data = d.data();
            return {
              id:          d.id,
              ...data,
              initials:    data.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "T",
              color:       COLORS[i % COLORS.length],
              // No fabricated defaults — UI now renders "—" for missing data.
              // (Step 3 of P0 will update the UI consumers.)
              experience:  data.experience ?? null,
              rating:      data.rating     ?? null,
              // Honest status — null when teacher record has no status set.
               // Memory: bug_pattern_fabricated_fallback (no fake "Active").
              status:      data.status     ?? null,
              subject:     data.subject    ?? null,
              classCount:  null as number | null,   // filled async below
              classNames:  "Fetching…",
            };
          });
        setTeachersData(teachers);

        // ONE batch fetch for all teaching_assignments, then join in memory.
        // Replaces the previous N+1 pattern (one getDocs + one getDoc per teacher).
        getDocs(query(collection(db, "teaching_assignments"), ...constraints))
          .then(taSnap => {
            const allAssignments = taSnap.docs
              .filter(d => inBranch(d.data()))
              .map(d => ({ ...d.data(), id: d.id }));
            const classMap = new Map(
              availableClassesRef.current.map((c: any) => [c.id as string, c.name as string])
            );
            setTeachersData(prev => prev.map(t => {
              const tAssignments = allAssignments.filter((a: any) => a.teacherId === t.id);
              const classIds = [...new Set(tAssignments.map((a: any) => a.classId).filter(Boolean))];
              if (classIds.length === 0) return { ...t, classCount: 0, classNames: "Unassigned" };
              const names = classIds.map(id => classMap.get(id as string) || "").filter(Boolean);
              return {
                ...t,
                classCount: classIds.length,
                classNames: names.join(", ") || "No Classes",
                // Fall back to assignment subjectName / subjectId only when
                // teacher doc has no subject. NEW writers store `subjectName`
                // (per recent fixes); older docs may still carry `subjectId`.
                subject: t.subject || (tAssignments[0] as any)?.subjectName || (tAssignments[0] as any)?.subjectId || null,
              };
            }));
          })
          .catch(err => {
            // Was: silent .catch(()=>{}) which left teachers stuck on
            // "Fetching…" with no console hint. Now logs + falls back to
            // a definitive empty state so UI doesn't hang.
            console.warn("[Teachers] teaching_assignments fetch failed:", err);
            setTeachersData(prev => prev.map(t => (
              { ...t, classCount: 0, classNames: "Unable to load" }
            )));
          });
      },
      (err) => console.warn("[Teachers] teachers listener failed:", err),
    );

    const unsubClasses = onSnapshot(
      query(collection(db, "classes"), ...constraints),
      (snap) => {
        const cls = snap.docs
          .filter(d => inBranch(d.data()))
          .map(d => ({ id: d.id, ...d.data() }));
        availableClassesRef.current = cls;
        setAvailableClasses(cls);
      },
      (err) => console.warn("[Teachers] classes listener failed:", err),
    );

    return () => { unsub(); unsubClasses(); };
  }, [userData]);

  // ── Avg Class Performance — multi-source merge ───────────────────────────
  // Pulls from all 3 score collections (results + test_scores +
  // gradebook_scores) and uses `pctOfDoc` so all 4 score schemas are
  // recognized. Old version only read `results` with `marksObtained/totalMarks`,
  // missing the `percentage`/`score` schemas + bulk-upload schools entirely.
  // Cross-collection dedup via content fingerprint prevents the same exam
  // recorded in multiple collections from double-counting.
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    // Three live source arrays — re-aggregate when any of them updates.
    let results: any[] = [];
    let testScores: any[] = [];
    let gradebook: any[] = [];

    const recompute = () => {
      const fpSeen = new Set<string>();
      const validPcts: number[] = [];
      [...results, ...testScores, ...gradebook].forEach(d => {
        if (!inBranch(d)) return;
        const pct = pctOfDoc(d);
        if (pct === null) return;
        const subj = String(d.subject ?? d.subjectName ?? "").toLowerCase();
        const dateK = (() => {
          const v = d.timestamp ?? d.createdAt ?? d.date;
          if (!v) return "";
          if (typeof v === "string") return v.slice(0, 10);
          if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
          return "";
        })();
        const studentKey = String(d.studentId || d.studentEmail || "").toLowerCase();
        const fp = `${studentKey}|${subj}|${dateK}|${Math.round(pct * 10)}`;
        if (fpSeen.has(fp)) return;
        fpSeen.add(fp);
        validPcts.push(pct);
      });
      if (validPcts.length === 0) { setAvgClassPerf(null); return; }
      const avg = validPcts.reduce((a, b) => a + b, 0) / validPcts.length;
      setAvgClassPerf(Math.round(avg * 10) / 10);
    };

    const u1 = onSnapshot(
      query(collection(db, "results"), where("schoolId", "==", schoolId)),
      (snap) => { results = snap.docs.map(d => d.data()); recompute(); },
      (err) => console.warn("[Teachers] results listener failed:", err),
    );
    const u2 = onSnapshot(
      query(collection(db, "test_scores"), where("schoolId", "==", schoolId)),
      (snap) => { testScores = snap.docs.map(d => d.data()); recompute(); },
      (err) => console.warn("[Teachers] test_scores listener failed:", err),
    );
    const u3 = onSnapshot(
      query(collection(db, "gradebook_scores"), where("schoolId", "==", schoolId)),
      (snap) => { gradebook = snap.docs.map(d => d.data()); recompute(); },
      (err) => console.warn("[Teachers] gradebook_scores listener failed:", err),
    );
    return () => { u1(); u2(); u3(); };
  }, [userData]);

  // ── Teacher Attendance % — org-wide AND per-teacher ──────────────────────
  // Builds two maps in one pass:
  //   1. Org-wide aggregate (used in stat cards)
  //   2. Per-teacher map (used on each teacher card to show THEIR own
  //      attendance rate, not the same org number on every card — B7 fix)
  // Uses `isPresent` helper for case-insensitive late-counts-as-present.
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;
    const unsub = onSnapshot(
      query(collection(db, "teacher_attendance"), where("schoolId", "==", schoolId)),
      (snap) => {
        const docs = snap.docs.map(d => d.data()).filter(inBranch);
        if (docs.length === 0) {
          setTeacherAttPct(null);
          setPerTeacherAtt({});
          return;
        }

        // Org-wide
        const orgPresent = docs.filter(isPresent).length;
        setTeacherAttPct(Math.round((orgPresent / docs.length) * 100));

        // Per-teacher: { tid → { present, total } } → percentage map
        const perTeacher: Record<string, { present: number; total: number }> = {};
        docs.forEach(d => {
          const tid = String(d.teacherId || "").trim();
          if (!tid) return;
          if (!perTeacher[tid]) perTeacher[tid] = { present: 0, total: 0 };
          perTeacher[tid].total += 1;
          if (isPresent(d)) perTeacher[tid].present += 1;
        });
        const map: Record<string, number> = {};
        Object.entries(perTeacher).forEach(([tid, v]) => {
          map[tid] = Math.round((v.present / v.total) * 100);
        });
        setPerTeacherAtt(map);
      },
      (err) => console.warn("[Teachers] teacher_attendance listener failed:", err),
    );
    return () => unsub();
  }, [userData]);

  // ── Parent Reviews Aggregate — org-wide AND per-teacher ──────────────────
  // Per-teacher map prevents the fake "5.0 ★" default that used to show on
  // every teacher card regardless of whether they had real reviews (B10 fix).
  useEffect(() => {
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;
    const unsub = onSnapshot(
      query(collection(db, "teacher_reviews"), where("schoolId", "==", schoolId)),
      (snap) => {
        const docs = snap.docs.map(d => d.data()).filter(inBranch);
        setReviewCount(docs.length);
        if (docs.length > 0) {
          const avg = docs.reduce((s, d) => s + (d.rating || 0), 0) / docs.length;
          setAvgRating(Math.round(avg * 10) / 10);
        } else {
          setAvgRating(null);
        }

        // Per-teacher rating map for accurate card display
        const perTeacher: Record<string, { sum: number; count: number }> = {};
        docs.forEach(d => {
          const tid = String(d.teacherId || "").trim();
          if (!tid) return;
          const r = Number(d.rating) || 0;
          if (!perTeacher[tid]) perTeacher[tid] = { sum: 0, count: 0 };
          perTeacher[tid].sum += r;
          perTeacher[tid].count += 1;
        });
        const map: Record<string, { rating: number; count: number }> = {};
        Object.entries(perTeacher).forEach(([tid, v]) => {
          map[tid] = { rating: Math.round((v.sum / v.count) * 10) / 10, count: v.count };
        });
        setPerTeacherRating(map);
      },
      (err) => console.warn("[Teachers] teacher_reviews listener failed:", err),
    );
    return () => unsub();
  }, [userData]);

  // ── Actions ───────────────────────────────────────────────────────────────
  // Atomic: teacher write + (optional) teaching_assignment in a single
  // writeBatch. Sequential addDocs left orphan teachers when the
  // teaching_assignment write failed mid-flow. Also fixes the field-name
  // inconsistency: `subjectId` → `subjectName` matches what other writers
  // (ClassesSections, NotifyClassTeachersModal) expect.
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.name || !inviteForm.email) return;

    setIsSending(true);
    try {
      const emailObj = inviteForm.email.toLowerCase().trim();
      const schoolId = userData?.schoolId || userData?.school || "";
      const branchId = userData?.branchId || "";

      // Email-shape validation before any DB write
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailObj)) {
        toast.error("Please enter a valid email address.");
        setIsSending(false);
        return;
      }

      const qCheck = query(collection(db, "teachers"),
        where("email", "==", emailObj), where("schoolId", "==", schoolId));
      const snap = await getDocs(qCheck);

      // Find the matching class doc once (used for className denorm).
      const classDoc = inviteForm.assignClassId
        ? availableClassesRef.current.find((c: any) => c.id === inviteForm.assignClassId)
        : null;
      const classDocName = classDoc ? (classDoc as any).name || "" : "";

      // Build the teaching_assignment payload once — used by both the
      // "restore archived" and "fresh invite" branches.
      // S2 designation fields (memory: session_2026-05-19_holiday_architecture):
      // invite-with-class implies the teacher IS the class teacher for that
      // class — role:"class" matches pre-migration intent. Principal can later
      // re-designate via ClassesSections role-aware modal.
      const buildAssignment = (teacherId: string) => ({
        teacherId,
        teacherEmail: emailObj,             // S2 — used by attendance rule gate
        teacherName: inviteForm.name,
        classId: inviteForm.assignClassId,
        className: classDocName,
        subjectName: inviteForm.subject || "",   // legacy
        subject:     inviteForm.subject || "",   // S2 canonical
        role:        "class" as const,            // S2 — invite assigns class teacher
        schoolId,
        branchId,
        status: "active",
        createdAt: serverTimestamp(),
      });

      if (!snap.empty) {
        const existing = snap.docs[0];
        if (existing.data().status === "Archived") {
          // Atomic restore: teacher update + (optional) assignment in one batch
          const batch = writeBatch(db);
          batch.update(doc(db, "teachers", existing.id), {
            status: "Invited", isActive: true,
            name: inviteForm.name,
            subject: inviteForm.subject || existing.data().subject,
            reactivatedAt: serverTimestamp(),
          });
          if (inviteForm.assignClassId) {
            batch.set(doc(collection(db, "teaching_assignments")), buildAssignment(existing.id));
          }
          await batch.commit();

          try {
            await sendEmail({
              to: emailObj,
              subject: `Welcome Back to ${userData?.schoolName || "Edullent"}`,
              html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#1e3a8a">Welcome Back, ${inviteForm.name}!</h2><p>Your account has been restored at <strong>${userData?.schoolName || "the institution"}</strong>.</p><div style="margin:24px 0"><a href="https://teacher-dashboard-ochre.vercel.app" style="background:#1e3a8a;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Open Teacher Dashboard</a></div></div>`,
            });
            toast.success("Teacher restored & re-invited!");
          } catch (emailErr: any) {
            toast.warning(`Teacher restored, but email failed: ${emailErr?.message || "Unknown error"}`);
          }
        } else {
          toast.error("A teacher with this email is already active.");
        }
        setIsInviteOpen(false);
        setInviteForm({ name: "", email: "", subject: "", assignClassId: "" });
        setIsSending(false);
        return;
      }

      // Fresh invite — atomic write of teacher + (optional) assignment
      const teacherRef = doc(collection(db, "teachers"));
      const batch = writeBatch(db);
      batch.set(teacherRef, {
        name: inviteForm.name,
        subject: inviteForm.subject,
        email: emailObj,
        schoolId,
        branchId,
        status: "Invited",
        isActive: true,
        createdAt: serverTimestamp(),
        // No fabricated rating / experience defaults — let the UI render
        // "—" for genuinely missing data instead of "5.0 ★" / "N/A".
      });
      if (inviteForm.assignClassId) {
        batch.set(doc(collection(db, "teaching_assignments")), buildAssignment(teacherRef.id));
      }
      await batch.commit();

      try {
        await sendEmail({
          to: emailObj,
          subject: `Invitation to join ${userData?.schoolName || "Edullent"}`,
          html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#1e3a8a">Welcome, ${inviteForm.name}!</h2><p>You have been invited to <strong>${userData?.schoolName || "the institution"}</strong>.</p><div style="margin:24px 0"><a href="https://teacher-dashboard-ochre.vercel.app" style="background:#1e3a8a;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Login to Teacher Portal</a></div></div>`,
        });
        toast.success("Teacher invited & email sent successfully!");
      } catch (emailErr: any) {
        toast.warning(`Teacher added to system, but email failed: ${emailErr?.message || "Unknown error"}`);
      }
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", subject: "", assignClassId: "" });
    } catch (err) {
      console.error("[Teachers] invite failed:", err);
      toast.error("Failed to invite teacher.");
    } finally {
      setIsSending(false);
    }
  };

  // Atomic archive + assignment cleanup. Prior code did:
  //   updateDoc(teacher) → getDocs → Promise.all(updateDoc...)
  // If the second batch failed, teacher stayed archived but assignments
  // still pointed to them — orphan inconsistency. Now: pre-fetch all
  // assignments, then commit ONE batch (chunked at 450 ops). Assignment
  // query also scoped by schoolId for cross-tenant defense.
  const handleDeleteTeacher = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the system? Their records stay intact.`)) return;
    const schoolId = userData?.schoolId || "";
    if (!schoolId) {
      toast.error("School context missing — please re-login.");
      return;
    }
    try {
      const aSnap = await getDocs(query(
        collection(db, "teaching_assignments"),
        where("schoolId", "==", schoolId),
        where("teacherId", "==", id),
      ));

      type Op = { ref: any; data: any; kind: "update" };
      const ops: Op[] = [
        { kind: "update", ref: doc(db, "teachers", id), data: { status: "Archived", isActive: false, archivedAt: serverTimestamp() } },
        ...aSnap.docs.map(d => ({
          kind: "update" as const,
          ref: d.ref,
          data: { teacherId: null, status: "inactive", deactivatedAt: serverTimestamp() },
        })),
      ];

      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const slice = ops.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(op => batch.update(op.ref, op.data));
        await batch.commit();
      }

      toast.success("Teacher archived successfully.");
    } catch (err) {
      console.error("[Teachers] archive failed:", err);
      toast.error("Failed to archive teacher.");
    }
  };

  const handleStartEdit = (t: any) => { setEditingId(t.id); setEditName(t.name); };
  const handleSaveName  = async (id: string) => {
    if (!editName.trim()) return setEditingId(null);
    try {
      await updateDoc(doc(db, "teachers", id), { name: editName.trim() });
      toast.success("Name updated.");
      setEditingId(null);
    } catch (err) {
      // Was: silent `catch {}` — Firestore rule denials never surfaced.
      console.error("[Teachers] save name failed:", err);
      toast.error("Failed to update name.");
    }
  };

  // Toggle primary-school flag. A teacher who works at multiple schools logs in
  // to the school they marked as primary by default.
  const handleTogglePrimary = async (teacher: any) => {
    try {
      await updateDoc(doc(db, "teachers", teacher.id), {
        isPrimarySchool: !teacher.isPrimarySchool,
      });
      toast.success(
        teacher.isPrimarySchool
          ? "Removed as primary school."
          : "Marked as teacher's primary school.",
      );
    } catch (err) {
      console.error("[Teachers] toggle primary failed:", err);
      toast.error("Failed to update primary-school flag.");
    }
  };

  // P0: schoolId-scoped enrollments query (was unscoped — cross-tenant leak
  // risk). Branch filtered client-side to avoid branchid lag (memory:
  // bug_pattern_unscoped_collection_reads + branchid_inference_lag).
  const handleOpenRoster = async (teacher: any) => {
    setTeacherToAssign(teacher);
    setIsRosterOpen(true);
    setLoadingRoster(true);
    const schoolId = userData?.schoolId || "";
    if (!schoolId) {
      toast.error("School context missing — please re-login.");
      setLoadingRoster(false);
      return;
    }
    const branchId = userData?.branchId || "";
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;
    try {
      const snap = await getDocs(query(
        collection(db, "enrollments"),
        where("schoolId", "==", schoolId),
        where("teacherId", "==", teacher.id),
      ));
      setTeacherRoster(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(inBranch),
      );
    } catch (err) {
      console.error("[Teachers] roster fetch failed:", err);
      toast.error("Failed to fetch roster.");
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb   = XLSX.read(bstr, { type: "binary" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws) as any[];
      setBulkData(
        data.map(item => ({
          name:       item.Name       || item.name       || "",
          email:      (item.Email     || item.email      || "").toString().toLowerCase().trim(),
          subject:    item.Subject    || item.subject    || "",
          phone:      item.Phone      || item.phone      || "",
          experience: item.Experience || item.experience || "",
          _status:    "pending" as const,
        })).filter(t => !!t.email)
      );
    };
    reader.readAsBinaryString(file);
  };

  // Bulk import — single existing-emails fetch + chunked writeBatch.
  // Old version did 2 round-trips per row (200 round-trips for 100 rows)
  // and lied "success" when the email API silently 5xx'd. Now:
  //   1. ONE getDocs to fetch all existing emails for this school
  //   2. Validate email shape per row → mark "error" with reason
  //   3. Mark duplicates from in-memory existing-set
  //   4. WriteBatch the writes for valid+non-duplicate rows
  //   5. Send invite emails in parallel WITH response check; mark
  //      individual row "success" or "error" based on email result
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const buildInviteEmail = (name: string, subject: string) => ({
    subject: `Invitation to join ${userData?.schoolName || "Edullent"}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#1e3a8a;padding:24px 28px;">
          <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">EDULLENT</h1>
          <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Teacher Dashboard Invitation</p>
        </div>
        <div style="padding:28px;background:#fff;">
          <h2 style="color:#1e293b;margin:0 0 12px;">Welcome, ${name}!</h2>
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">
            You have been invited to join <strong>${userData?.schoolName || "Edullent"}</strong> as a
            <strong>${subject ? `${subject} Teacher` : "Teacher"}</strong>.
          </p>
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
            Log in with this email address to access your dashboard.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="https://teacher-dashboard-ochre.vercel.app"
               style="background:#1e3a8a;color:#fff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
              Open Teacher Dashboard
            </a>
          </div>
        </div>
        <div style="background:#f1f5f9;padding:14px 28px;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">Powered by Edullent Cloud Architecture</p>
        </div>
      </div>
    `,
  });

  const handleBulkImport = async () => {
    setIsBulkProcessing(true);
    const rows = [...bulkData];
    const schoolId = userData?.schoolId || "";
    const branchId = userData?.branchId || "";
    if (!schoolId) {
      toast.error("School context missing — please re-login.");
      setIsBulkProcessing(false);
      return;
    }

    try {
      // Step 1: ONE query for all existing teacher emails in this school.
      // Replaces the prior N-query-per-row pattern (100 rows = 100 selects).
      const existingSnap = await getDocs(
        query(collection(db, "teachers"), where("schoolId", "==", schoolId)),
      );
      const existingEmails = new Set(
        existingSnap.docs.map(d => String(d.data().email || "").toLowerCase().trim()),
      );

      // Step 2: validate + classify each row, build write list
      type WritePlan = { rowIdx: number; teacherRef: any; data: any };
      const plans: WritePlan[] = [];
      const successRowIdxs: number[] = [];

      rows.forEach((t, i) => {
        const email = (t.email || "").toLowerCase().trim();
        if (!email || !EMAIL_RE.test(email)) {
          rows[i]._status = "error";
          rows[i]._error = "Invalid email format";
          return;
        }
        if (existingEmails.has(email)) {
          rows[i]._status = "duplicate";
          return;
        }
        // Reserve doc ref now so we can batch + still know each row's id.
        const teacherRef = doc(collection(db, "teachers"));
        plans.push({
          rowIdx: i,
          teacherRef,
          data: {
            name: t.name,
            email,
            subject: t.subject || "",
            phone: t.phone || "",
            experience: t.experience || "",
            schoolId,
            branchId,
            status: "Invited",
            isActive: true,
            createdAt: serverTimestamp(),
            // No fabricated rating/experience defaults — let UI render "—".
          },
        });
        // Add to existingEmails so a duplicate within the SAME bulk file
        // is caught as duplicate on its 2nd occurrence (not silently
        // double-imported).
        existingEmails.add(email);
      });

      // Step 3: chunked writeBatch (Firestore 500-op cap → 450 safety margin)
      const CHUNK = 450;
      for (let i = 0; i < plans.length; i += CHUNK) {
        const slice = plans.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(p => batch.set(p.teacherRef, p.data));
        try {
          await batch.commit();
          slice.forEach(p => {
            rows[p.rowIdx]._status = "success";
            successRowIdxs.push(p.rowIdx);
          });
        } catch (err) {
          // Whole chunk failed — mark all rows in chunk as error.
          slice.forEach(p => {
            rows[p.rowIdx]._status = "error";
            rows[p.rowIdx]._error = `Batch write failed: ${String(err)}`;
          });
        }
        setBulkData([...rows]);
      }

      // Step 4: send invite emails in parallel WITH response check.
      // Email failures DON'T downgrade the row from "success" (the teacher
      // IS in the system) but emit a warning so the principal knows to
      // re-send manually.
      let emailFailedCount = 0;
      const emailPromises = successRowIdxs.map(async idx => {
        const t = rows[idx];
        const tpl = buildInviteEmail(t.name, t.subject || "");
        try {
          await sendEmail({ to: t.email, subject: tpl.subject, html: tpl.html });
        } catch (err) {
          console.warn(`[Teachers] bulk invite email failed for ${t.email}:`, err);
          emailFailedCount++;
        }
      });
      await Promise.all(emailPromises);

      const successCount = successRowIdxs.length;
      const dupCount = rows.filter(r => r._status === "duplicate").length;
      const errCount = rows.filter(r => r._status === "error").length;
      let msg = `Imported ${successCount} teacher${successCount === 1 ? "" : "s"}`;
      if (dupCount > 0) msg += `, ${dupCount} duplicate${dupCount === 1 ? "" : "s"} skipped`;
      if (errCount > 0) msg += `, ${errCount} error${errCount === 1 ? "" : "s"}`;
      if (emailFailedCount > 0) {
        toast.warning(`${msg}. ${emailFailedCount} invite email${emailFailedCount === 1 ? "" : "s"} failed — re-send manually.`);
      } else {
        toast.success(msg);
      }
    } catch (err) {
      console.error("[Teachers] bulk import failed:", err);
      toast.error("Bulk import failed. Check console.");
    } finally {
      setBulkData([...rows]);
      setIsBulkProcessing(false);
      setBulkDone(true);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TeachersTemplate");
    XLSX.writeFile(wb, "Teacher_Import_Template.xlsx");
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const allSubjects = [...new Set(teachersData.map(t => t.subject).filter(Boolean))];
  const filtered = teachersData.filter(t =>
    t.status !== "Archived" &&
    (t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.email?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!subjectFilter || t.subject === subjectFilter) &&
    (!statusFilter  || t.status  === statusFilter)
  );

  const activeCount  = teachersData.filter(t => t.status === "Active").length;
  const totalCount   = teachersData.filter(t => t.status !== "Archived").length;
  const onLeaveCount = teachersData.filter(t => t.status === "On Leave").length;

  // ── If profile is open, render it ────────────────────────────────────────
  if (selectedTeacher) {
    return <TeacherProfile teacher={selectedTeacher} onBack={() => setSelectedTeacher(null)} />;
  }

  /* ═══════════════════════════════════════════════════════════════
     MOBILE — Bright Blue Apple UI
     ═══════════════════════════════════════════════════════════════ */
  if (isMobile) {
    const B1 = "#0055FF", B2 = "#1166FF", B4 = "#4499FF";
    const BG = "#EEF4FF", BG2 = "#E0ECFF";
    const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
    const SEP = "rgba(0,85,255,0.07)";
    const GREEN = "#00C853", GREEN_D = "#007830", GREEN_S = "rgba(0,200,83,0.10)", GREEN_B = "rgba(0,200,83,0.22)";
    const RED = "#FF3355", RED_S = "rgba(255,51,85,0.10)", RED_B = "rgba(255,51,85,0.22)";
    const ORANGE = "#FF8800";
    const GOLD = "#FFAA00";
    const SH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 8px rgba(0,85,255,0.08), 0 10px 26px rgba(0,85,255,0.10)";
    const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.11), 0 18px 44px rgba(0,85,255,0.13)";
    const SH_BTN = "0 6px 22px rgba(0,85,255,0.40), 0 2px 5px rgba(0,85,255,0.20)";

    // Avatar gradient mapping (from existing tailwind color classes)
    const avatarGradient = (color: string) => {
      if (color?.includes("emerald"))  return { bg: `linear-gradient(135deg, ${GREEN}, #22EE66)`,       shadow: "0 4px 14px rgba(0,200,83,0.28)" };
      if (color?.includes("amber"))    return { bg: `linear-gradient(135deg, ${ORANGE}, #FFCC22)`,       shadow: "0 4px 14px rgba(255,136,0,0.28)" };
      if (color?.includes("rose"))     return { bg: `linear-gradient(135deg, ${RED}, #FF88AA)`,           shadow: "0 4px 14px rgba(255,51,85,0.28)" };
      if (color?.includes("indigo"))   return { bg: "linear-gradient(135deg, #5B6FD4, #8A9AF0)",          shadow: "0 4px 14px rgba(91,111,212,0.28)" };
      if (color?.includes("teal"))     return { bg: "linear-gradient(135deg, #00C4B4, #22DDCC)",          shadow: "0 4px 14px rgba(0,196,180,0.24)" };
      return                             { bg: `linear-gradient(135deg, ${B1}, ${B2})`,                 shadow: "0 4px 14px rgba(0,85,255,0.28)" };
    };
    const accentBar = (color: string) => {
      if (color?.includes("emerald")) return `linear-gradient(180deg, ${GREEN}, #22EE66)`;
      if (color?.includes("amber"))   return `linear-gradient(180deg, ${ORANGE}, #FFCC22)`;
      if (color?.includes("rose"))    return `linear-gradient(180deg, ${RED}, #FF88AA)`;
      return `linear-gradient(180deg, ${B1}, ${B4})`;
    };

    // Status chip
    const statusChip = (status: string) => {
      if (status === "Active")   return { bg: GREEN_S,                       color: GREEN_D, border: GREEN_B,                         dotColor: GREEN };
      if (status === "On Leave") return { bg: "rgba(255,136,0,0.10)",         color: "#884400", border: "rgba(255,136,0,0.22)",         dotColor: ORANGE };
      if (status === "Invited")  return { bg: "rgba(0,85,255,0.10)",          color: B1,       border: "rgba(0,85,255,0.20)",           dotColor: B1 };
      return                     { bg: "rgba(153,170,204,0.10)",              color: T3,       border: "rgba(153,170,204,0.22)",        dotColor: T4 };
    };

    return (
      <>
        <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
          style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>

          {/* Page head */}
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <div className="text-[24px] font-bold mb-[3px]" style={{ color: T1, letterSpacing: "-0.6px" }}>Teachers</div>
              <div className="text-[11px] font-normal" style={{ color: T3 }}>Manage teaching staff and monitor performance</div>
            </div>
            <button
              onClick={() => setIsInviteOpen(true)}
              className="h-10 px-[15px] rounded-[14px] flex items-center gap-[6px] text-[12px] font-bold text-white cursor-pointer whitespace-nowrap shrink-0 mt-1 relative overflow-hidden active:scale-[0.95] transition-transform"
              style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
              <Plus className="w-[13px] h-[13px] relative z-10" strokeWidth={2.5} />
              <span className="relative z-10">Add Teacher</span>
            </button>
          </div>

          {/* Stat grid 2x2 — null values render as "—" instead of fake 0%/100% */}
          <div className="grid grid-cols-2 gap-[10px] px-5 pt-[14px]">
            {[
              { title: "Avg Class Performance", val: avgClassPerf !== null ? `${avgClassPerf}%` : "—", valColor: avgClassPerf !== null ? B1 : T4,    sub: avgClassPerf !== null ? "Based on recorded results" : "No exams recorded yet",    subColor: T3,      icon: TrendingUp,   iconBg: "rgba(0,85,255,0.10)",  iconBorder: "rgba(0,85,255,0.18)",  iconColor: B1,     glow: "rgba(0,85,255,0.10)",    onClick: () => navigate("/teacher-performance") },
              { title: "Teacher Attendance",    val: teacherAttPct !== null ? `${teacherAttPct}%` : "—", valColor: teacherAttPct !== null ? GREEN : T4, sub: teacherAttPct === null ? "No attendance tracked" : teacherAttPct >= 95 ? "Excellent" : teacherAttPct >= 80 ? "Good" : "Needs attention", subColor: GREEN_D, icon: CalendarCheck, iconBg: "rgba(0,200,83,0.10)",  iconBorder: "rgba(0,200,83,0.20)",  iconColor: GREEN,  glow: "rgba(0,200,83,0.10)",    onClick: () => navigate("/attendance") },
              { title: "Parent Feedback",       val: avgRating !== null ? `${avgRating}/5` : "—",        valColor: avgRating !== null ? GOLD : T4,     sub: reviewCount > 0 ? `Based on ${reviewCount} review${reviewCount === 1 ? "" : "s"}` : "No reviews yet", subColor: T3, icon: Star,          iconBg: "rgba(255,170,0,0.12)", iconBorder: "rgba(255,170,0,0.22)", iconColor: GOLD,   glow: "rgba(255,170,0,0.10)",   onClick: () => navigate("/teacher-leaderboard") },
              { title: "Active Teachers",       val: totalCount > 0 ? `${activeCount}/${totalCount}` : "0", valColor: totalCount > 0 ? GREEN_D : T4,   sub: totalCount === 0 ? "No teachers yet" : onLeaveCount > 0 ? `${onLeaveCount} on leave` : activeCount === totalCount ? "All present" : "—", subColor: GREEN_D, icon: Users,         iconBg: "rgba(0,85,255,0.10)",  iconBorder: "rgba(0,85,255,0.18)",  iconColor: B1,     glow: "rgba(0,200,83,0.10)",    onClick: () => navigate("/teacher-performance") },
            ].map(({ title, val, valColor, sub, subColor, icon: Icon, iconBg, iconBorder, iconColor, glow, onClick }) => (
              <button
                key={title}
                onClick={onClick}
                className="bg-white rounded-[20px] p-4 relative overflow-hidden cursor-pointer active:scale-[0.96] transition-transform text-left"
                style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                <div className="absolute -top-5 -right-4 w-[70px] h-[70px] rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, opacity: 0.5 }} />
                <div className="flex items-start justify-between mb-[10px]">
                  <div className="text-[9px] font-bold uppercase tracking-[0.07em] leading-[1.4]" style={{ color: T4 }}>{title}</div>
                  <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0"
                    style={{ background: iconBg, border: `0.5px solid ${iconBorder}` }}>
                    <Icon className="w-[14px] h-[14px]" style={{ color: iconColor }} strokeWidth={2.4} />
                  </div>
                </div>
                <div className="text-[26px] font-bold leading-none mb-1" style={{ color: valColor, letterSpacing: "-1px" }}>{val}</div>
                <div className="text-[11px] font-semibold truncate" style={{ color: subColor }}>{sub}</div>
              </button>
            ))}
          </div>

          {/* Search + Subject filter */}
          <div className="flex gap-2 px-5 pt-3">
            <div className="flex-1 relative">
              <div className="absolute left-[13px] top-1/2 -translate-y-1/2 pointer-events-none">
                <Search className="w-[15px] h-[15px]" style={{ color: "rgba(0,85,255,0.42)" }} strokeWidth={2.2} />
              </div>
              <input
                type="text"
                placeholder="Search teachers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-[14px] outline-none bg-white custom-chrome"
                style={{
                  // .custom-chrome dodges the global `input { padding/font !important }`
                  // rules in index.css so the magnifier icon doesn't overlap the text.
                  "--cc-padding": "12px 14px 12px 40px",
                  "--cc-font-size": "13px",
                  "--cc-font-weight": "400",
                  "--cc-line-height": "1.4",
                  border: "0.5px solid rgba(0,85,255,0.12)",
                  color: T1,
                  boxShadow: SH,
                  fontFamily: "inherit",
                } as any}
              />
            </div>
            <select
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
              className="px-3 rounded-[14px] text-[11px] font-bold bg-white cursor-pointer appearance-none h-11"
              style={{
                border: "0.5px solid rgba(0,85,255,0.12)",
                color: T2,
                boxShadow: SH,
                fontFamily: "inherit",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
                paddingRight: "32px",
              }}>
              <option value="">All Subjects</option>
              {allSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>

          {/* Action row — Grid/List toggle + Bulk Import */}
          <div className="flex gap-2 px-5 pt-[10px]">
            <button
              onClick={() => setViewMode("grid")}
              className="h-[38px] px-[14px] rounded-[13px] flex items-center justify-center gap-[6px] text-[11px] font-bold cursor-pointer active:scale-[0.94] transition-transform"
              style={{
                background: viewMode === "grid" ? `linear-gradient(135deg, ${B1}, ${B2})` : "#FFFFFF",
                color: viewMode === "grid" ? "#fff" : T2,
                border: viewMode === "grid" ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,0.14)",
                boxShadow: viewMode === "grid" ? SH_BTN : SH,
                transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
              }}>
              <LayoutGrid className="w-[13px] h-[13px]" strokeWidth={2.3} />
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="h-[38px] px-[14px] rounded-[13px] flex items-center justify-center gap-[6px] text-[11px] font-bold cursor-pointer active:scale-[0.94] transition-transform"
              style={{
                background: viewMode === "list" ? `linear-gradient(135deg, ${B1}, ${B2})` : "#FFFFFF",
                color: viewMode === "list" ? "#fff" : T2,
                border: viewMode === "list" ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,0.14)",
                boxShadow: viewMode === "list" ? SH_BTN : SH,
                transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
              }}>
              <List className="w-[13px] h-[13px]" style={{ color: viewMode === "list" ? "#fff" : "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
              List
            </button>
            <button
              onClick={() => setIsBulkOpen(true)}
              className="h-[38px] px-[14px] rounded-[13px] flex items-center justify-center gap-[6px] text-[11px] font-bold cursor-pointer active:scale-[0.94] transition-transform"
              style={{ background: GREEN_S, border: `0.5px solid ${GREEN_B}`, color: GREEN_D, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <Upload className="w-[13px] h-[13px]" strokeWidth={2.3} />
              Bulk Import
            </button>
          </div>

          {/* Section label */}
          <div className="flex items-center gap-2 px-5 pt-4 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
            <span>Faculty Directory</span>
            <span className="px-[9px] py-[3px] rounded-full ml-1" style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.16)", color: B1 }}>
              {filtered.length} teacher{filtered.length === 1 ? "" : "s"}
            </span>
            <span className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
          </div>

          {/* Teacher cards */}
          {filtered.length === 0 ? (
            <div className="mx-5 mt-3 bg-white rounded-[24px] py-12 flex flex-col items-center gap-2"
              style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
              <GraduationCap className="w-12 h-12" style={{ color: T4 }} strokeWidth={1.8} />
              <div className="text-[14px] font-bold" style={{ color: T2 }}>No teachers found</div>
              <div className="text-[11px]" style={{ color: T4 }}>Try changing your search or filters</div>
            </div>
          ) : (
            filtered.map(t => {
              const av = avatarGradient(t.color);
              const chip = statusChip(t.status);
              const subjectChipColor = t.subject === "Math" || t.subject?.toLowerCase().includes("math")
                ? { bg: "rgba(255,136,0,0.10)", color: "#884400", border: "rgba(255,136,0,0.22)" }
                : { bg: "rgba(0,85,255,0.10)", color: B1,          border: "rgba(0,85,255,0.20)" };
              return (
                <div key={t.id} className="mx-5 mt-3 bg-white rounded-[24px] overflow-hidden relative"
                  style={{ boxShadow: SH_LG, border: "0.5px solid rgba(0,85,255,0.10)" }}>
                  {/* Left accent */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[2px]" style={{ background: accentBar(t.color) }} />

                  {/* Card header — restructured: Row 1 (avatar + name, full width)
                      and Row 2 (icon tray, own row). Old absolute-positioned tray
                      stole horizontal width from the name causing truncation. */}
                  <div className="px-[18px] pt-[18px] pb-[14px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                    {/* Row 1: Avatar + Info — name now has full width */}
                    <div className="flex items-start gap-[14px]">
                      {/* Avatar */}
                      <div className="w-[52px] h-[52px] rounded-[17px] flex items-center justify-center text-[18px] font-bold text-white shrink-0"
                        style={{ background: av.bg, boxShadow: av.shadow }}>
                        {t.initials}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {editingId === t.id ? (
                          <div className="flex items-center gap-[6px] mb-[3px]">
                            <input
                              autoFocus
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleSaveName(t.id);
                                if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                              }}
                              className="flex-1 text-[15px] font-bold px-2 py-1 rounded-[8px] outline-none"
                              style={{ border: `1px solid ${B1}66`, color: T1 }}
                            />
                            <button onClick={() => handleSaveName(t.id)} className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white shrink-0 active:scale-95 transition-transform"
                              style={{ background: GREEN, boxShadow: "0 2px 6px rgba(0,200,83,0.30)" }}
                              title="Save">
                              <Check className="w-[15px] h-[15px]" strokeWidth={3} />
                            </button>
                            <button onClick={() => { setEditingId(null); setEditName(""); }} className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                              style={{ background: "rgba(255,51,85,0.10)", border: "0.5px solid rgba(255,51,85,0.22)", color: RED }}
                              title="Cancel">
                              <X className="w-[15px] h-[15px]" strokeWidth={3} />
                            </button>
                          </div>
                        ) : (
                          <div className="text-[17px] font-bold mb-[3px] truncate" style={{ color: T1, letterSpacing: "-0.3px" }}>{t.name}</div>
                        )}
                        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: t.subject ? T3 : T4 }}>{t.subject || "No subject"}</div>
                        <div className="inline-flex items-center gap-1 px-[11px] py-[4px] rounded-full text-[10px] font-bold"
                          style={{ background: chip.bg, color: chip.color, border: `0.5px solid ${chip.border}` }}>
                          <span className="w-[5px] h-[5px] rounded-full" style={{ background: chip.dotColor, boxShadow: `0 0 0 1.5px ${chip.dotColor}33` }} />
                          {t.status}
                        </div>
                      </div>
                    </div>
                    {/* Row 2: Icon tray — own row, larger taps, evenly distributed.
                        SOLID color buttons + WHITE icons for max contrast. */}
                    <div className="flex gap-[10px] mt-[14px] pl-[66px]">
                      <button
                        onClick={() => setSelectedTeacher(t)}
                        className="flex-1 h-[40px] rounded-[12px] flex items-center justify-center active:scale-[0.92] transition-transform"
                        style={{ background: B1, boxShadow: "0 3px 10px rgba(0,85,255,0.32)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                        aria-label="View">
                        <Eye size={20} color="#FFFFFF" strokeWidth={2.6} />
                      </button>
                      <button
                        onClick={() => handleTogglePrimary(t)}
                        className="flex-1 h-[40px] rounded-[12px] flex items-center justify-center active:scale-[0.92] transition-transform"
                        style={{
                          background: t.isPrimarySchool ? GOLD : "#94A3B8",
                          boxShadow: t.isPrimarySchool
                            ? "0 3px 10px rgba(255,170,0,0.40)"
                            : "0 3px 10px rgba(148,163,184,0.32)",
                          transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                        }}
                        aria-label="Primary">
                        <Star
                          size={20}
                          color="#FFFFFF"
                          fill={t.isPrimarySchool ? "#FFFFFF" : "none"}
                          strokeWidth={2.6}
                        />
                      </button>
                      <button
                        onClick={() => handleStartEdit(t)}
                        className="flex-1 h-[40px] rounded-[12px] flex items-center justify-center active:scale-[0.92] transition-transform"
                        style={{ background: T2, boxShadow: "0 3px 10px rgba(0,32,128,0.32)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                        aria-label="Edit">
                        <Edit3 size={20} color="#FFFFFF" strokeWidth={2.6} />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(t.id, t.name)}
                        className="flex-1 h-[40px] rounded-[12px] flex items-center justify-center active:scale-[0.92] transition-transform"
                        style={{ background: RED, boxShadow: "0 3px 10px rgba(255,51,85,0.36)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                        aria-label="Archive">
                        <Trash2 size={20} color="#FFFFFF" strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>

                  {/* Metrics strip — per-teacher attendance + rating, null-safe */}
                  {(() => {
                    const myAtt = perTeacherAtt[t.id];
                    const myRating = perTeacherRating[t.id]?.rating;
                    return (
                  <div className="flex" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                    <div className="flex-1 px-3 py-[14px] flex flex-col items-center gap-[5px] relative">
                      <div className="text-[20px] font-bold leading-none" style={{ color: B1, letterSpacing: "-0.5px" }}>
                        {t.classCount === null ? <Loader2 className="w-4 h-4 animate-spin inline" /> : t.classCount}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Classes</div>
                      <span className="absolute right-0 top-3 bottom-3 w-[0.5px]" style={{ background: "rgba(0,85,255,0.10)" }} />
                    </div>
                    <div className="flex-1 px-3 py-[14px] flex flex-col items-center gap-[5px] relative">
                      <div className="text-[20px] font-bold leading-none" style={{ color: myAtt !== undefined ? GREEN_D : T4, letterSpacing: "-0.5px" }}>
                        {myAtt !== undefined ? `${myAtt}%` : "—"}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Attendance</div>
                      <span className="absolute right-0 top-3 bottom-3 w-[0.5px]" style={{ background: "rgba(0,85,255,0.10)" }} />
                    </div>
                    <div className="flex-1 px-3 py-[14px] flex flex-col items-center gap-[5px]">
                      {myRating !== undefined ? (
                        <div className="flex items-center gap-[3px]">
                          <Star className="w-[14px] h-[14px]" fill={GOLD} stroke={GOLD} />
                          <span className="text-[20px] font-bold" style={{ color: GOLD, letterSpacing: "-0.5px" }}>{myRating}</span>
                        </div>
                      ) : (
                        <div className="text-[20px] font-bold leading-none" style={{ color: T4, letterSpacing: "-0.5px" }}>—</div>
                      )}
                      <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: T4 }}>Rating</div>
                    </div>
                  </div>
                    );
                  })()}

                  {/* Detail rows — null-safe ("—") + branch-primary campus */}
                  <div className="py-1">
                    <div className="flex items-center justify-between px-[18px] py-3" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: T3 }}>
                        <CalendarCheck className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.2} />
                        Experience
                      </div>
                      <div className="text-[13px] font-bold" style={{ color: t.experience ? T1 : T4, letterSpacing: "-0.1px" }}>{t.experience || "—"}</div>
                    </div>
                    <div className="flex items-center justify-between px-[18px] py-3" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: T3 }}>
                        <BookOpen className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.2} />
                        Subject
                      </div>
                      {t.subject ? (
                        <span className="px-[9px] py-[3px] rounded-full text-[11px] font-bold"
                          style={{ background: subjectChipColor.bg, color: subjectChipColor.color, border: `0.5px solid ${subjectChipColor.border}` }}>
                          {t.subject}
                        </span>
                      ) : (
                        <span className="text-[13px] font-bold" style={{ color: T4 }}>—</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-[18px] py-3">
                      <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: T3 }}>
                        <MapPin className="w-[13px] h-[13px]" style={{ color: "rgba(0,85,255,0.5)" }} strokeWidth={2.2} />
                        Campus
                      </div>
                      <div className="text-[13px] font-bold truncate max-w-[140px]" style={{ color: T1, letterSpacing: "-0.1px" }}>
                        {/* B21: branch primary, school as fallback — matches Header's identity rule */}
                        {userData?.branchName || userData?.branch || userData?.branchId || userData?.schoolName || "—"}
                      </div>
                    </div>
                  </div>

                  {/* Action bar */}
                  <div className="flex gap-2 px-4 py-[13px]" style={{ background: "rgba(238,244,255,0.50)" }}>
                    <button
                      onClick={() => setSelectedTeacher(t)}
                      className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[7px] text-[12px] font-bold text-white active:scale-[0.95] transition-transform relative overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                      <Eye className="w-[13px] h-[13px] relative z-10" strokeWidth={2.2} />
                      <span className="relative z-10">View Profile</span>
                    </button>
                    <button
                      onClick={() => navigate("/teacher-notes")}
                      className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[7px] text-[12px] font-bold text-white active:scale-[0.95] transition-transform"
                      style={{ background: "linear-gradient(135deg, #001040, #001888)", boxShadow: "0 4px 14px rgba(0,8,64,0.24)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                      <MessageSquare className="w-[13px] h-[13px]" strokeWidth={2.2} />
                      Message
                    </button>
                    <button
                      onClick={() => handleOpenRoster(t)}
                      className="w-[48px] h-[42px] rounded-[13px] flex items-center justify-center active:scale-[0.90] transition-transform"
                      style={{ background: T2, boxShadow: "0 4px 14px rgba(0,32,128,0.32)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                      aria-label="More">
                      <MoreHorizontal size={20} color="#FFFFFF" strokeWidth={2.6} />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* AI Faculty Summary */}
          {totalCount > 0 && (
            <div className="mx-5 mt-3 rounded-[24px] px-[22px] py-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
                boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
              }}>
              <div className="absolute -top-9 -right-6 w-[155px] h-[155px] rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: "linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }} />
              <div className="flex items-center gap-[6px] mb-3 relative z-10">
                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <TrendingUp className="w-[14px] h-[14px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Faculty Intelligence</span>
              </div>
              <p className="text-[13px] leading-[1.72] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
                <strong style={{ color: "#fff", fontWeight: 700 }}>{totalCount} teacher{totalCount === 1 ? "" : "s"}</strong> on faculty · {activeCount === totalCount ? "All active" : `${activeCount} active`}{onLeaveCount > 0 && `, ${onLeaveCount} on leave`}.
                {teacherAttPct !== null && <> Teacher attendance is <strong style={{ color: "#fff", fontWeight: 700 }}>{teacherAttPct}%</strong>.</>}
                {avgRating !== null && <> Average rating from parent feedback: <strong style={{ color: "#fff", fontWeight: 700 }}>{avgRating}/5 stars</strong>.</>}
                {avgClassPerf !== null && <> Avg class performance across results: <strong style={{ color: "#fff", fontWeight: 700 }}>{avgClassPerf}%</strong>.</>}
              </p>
              <div className="grid grid-cols-3 rounded-[16px] overflow-hidden mt-[14px] relative z-10" style={{ gap: "1px", background: "rgba(255,255,255,0.12)" }}>
                <div className="py-[13px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[22px] font-bold text-white leading-none mb-1" style={{ letterSpacing: "-0.6px" }}>{totalCount}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>Teachers</div>
                </div>
                <div className="py-[13px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[22px] font-bold text-white leading-none mb-1" style={{ letterSpacing: "-0.6px" }}>{avgRating !== null ? `${avgRating} ★` : "—"}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>Avg Rating</div>
                </div>
                <div className="py-[13px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[22px] font-bold text-white leading-none mb-1" style={{ letterSpacing: "-0.6px" }}>{teacherAttPct !== null ? `${teacherAttPct}%` : "—"}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>Attendance</div>
                </div>
              </div>
            </div>
          )}

          <div className="h-6" />
        </div>

        {/* ── INVITE DIALOG (shared with desktop state) ──────────────────── */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[440px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Invite Teacher</DialogTitle>
              <DialogDescription className="text-slate-500">Send an email invitation to a new faculty member.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name</Label>
                <Input placeholder="Mrs. Kavita Sharma" className="h-11 rounded-xl"
                  value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email Address</Label>
                <Input type="email" placeholder="teacher@school.edu" className="h-11 rounded-xl"
                  value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</Label>
                <Input placeholder="e.g. Mathematics" className="h-11 rounded-xl"
                  value={inviteForm.subject} onChange={e => setInviteForm({ ...inviteForm, subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign Class (Optional)</Label>
                <select
                  value={inviteForm.assignClassId}
                  onChange={e => setInviteForm({ ...inviteForm, assignClassId: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                >
                  <option value="">— Not assigned —</option>
                  {availableClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={isSending}
                className="w-full h-11 rounded-xl bg-[#1e3a8a] text-white font-semibold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><CheckCircle className="w-4 h-4" /> Send Invitation</>}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── BULK IMPORT DIALOG (shared) ──────────────────────────────── */}
        <Dialog open={isBulkOpen} onOpenChange={(v) => { setIsBulkOpen(v); if (!v) { setBulkData([]); setBulkDone(false); } }}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[85vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#1e3a8a] flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Bulk Import Teachers
              </DialogTitle>
              <DialogDescription className="text-slate-500">Upload an Excel/CSV file to import multiple teachers at once.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              {bulkData.length === 0 ? (
                <div className="space-y-3">
                  <button onClick={downloadTemplate}
                    className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-100">
                    <Download className="w-4 h-4" /> Download Template
                  </button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full h-12 rounded-xl bg-[#1e3a8a] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90">
                    <Upload className="w-4 h-4" /> Choose Excel / CSV File
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-100 overflow-hidden max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-slate-500">Name</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-slate-500">Email</th>
                          <th className="px-3 py-2 text-right text-[10px] font-bold uppercase text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {bulkData.map((t, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-semibold text-slate-800 text-xs">{t.name}</td>
                            <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[140px]">{t.email}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                t._status === "success" ? "bg-green-100 text-green-700" :
                                t._status === "duplicate" ? "bg-amber-100 text-amber-700" :
                                t._status === "error" ? "bg-rose-100 text-rose-700" :
                                "bg-slate-100 text-slate-500"
                              }`}>
                                {t._status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!bulkDone && (
                      <button onClick={handleBulkImport} disabled={isBulkProcessing}
                        className="flex-1 h-11 rounded-xl bg-[#1e3a8a] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        {isBulkProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Import {bulkData.length} Teachers</>}
                      </button>
                    )}
                    <button onClick={() => { setBulkData([]); setBulkDone(false); }}
                      className="px-4 h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold">
                      Clear
                    </button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── ROSTER DIALOG (shared) ────────────────────────────────────── */}
        <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[80vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Class Roster — {teacherToAssign?.name}</DialogTitle>
              <DialogDescription className="text-slate-500">Students currently enrolled under this teacher.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              {loadingRoster ? (
                <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#1e3a8a]" /></div>
              ) : teacherRoster.length > 0 ? (
                <div className="rounded-xl overflow-hidden border border-slate-100">
                  <div className="divide-y divide-slate-50">
                    {teacherRoster.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-sm truncate">{s.studentName}</p>
                          <p className="text-[11px] text-slate-400 truncate">{s.studentEmail}</p>
                        </div>
                        <span className="font-semibold text-[#1e3a8a] text-xs shrink-0">{s.className || "General"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-400">No enrollment records found</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP — Blue Apple Design
  // ═══════════════════════════════════════════════════════════════
  const dB1 = "#0055FF", dB2 = "#1166FF", dB4 = "#4499FF";
  const dBG = "#EEF4FF", dBG2 = "#E0ECFF";
  const dT1 = "#001040", dT2 = "#002080", dT3 = "#5070B0", dT4 = "#99AACC";
  const dSEP = "rgba(0,85,255,0.08)";
  const dGREEN = "#00C853", dGREEN_D = "#007830", dGREEN_S = "rgba(0,200,83,0.10)", dGREEN_B = "rgba(0,200,83,0.22)";
  const dRED = "#FF3355";
  const dORANGE = "#FF8800";
  const dGOLD = "#FFAA00";
  const dVIOLET = "#7B3FF4";
  const dSH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const dSH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";
  const dSH_BTN = "0 6px 22px rgba(0,85,255,0.38), 0 2px 5px rgba(0,85,255,0.18)";

  // Avatar gradient
  const avatarGradD = (color: string) => {
    if (color?.includes("emerald"))  return { bg: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, shadow: "0 4px 14px rgba(0,200,83,0.26)" };
    if (color?.includes("amber"))    return { bg: `linear-gradient(135deg, ${dORANGE}, #FFCC22)`, shadow: "0 4px 14px rgba(255,136,0,0.26)" };
    if (color?.includes("rose"))     return { bg: `linear-gradient(135deg, ${dRED}, #FF88AA)`, shadow: "0 4px 14px rgba(255,51,85,0.26)" };
    if (color?.includes("indigo"))   return { bg: `linear-gradient(135deg, ${dVIOLET}, #A07CF8)`, shadow: "0 4px 14px rgba(123,63,244,0.26)" };
    if (color?.includes("teal"))     return { bg: "linear-gradient(135deg, #00C4B4, #22DDCC)", shadow: "0 4px 14px rgba(0,196,180,0.22)" };
    return                            { bg: `linear-gradient(135deg, ${dB1}, ${dB2})`, shadow: "0 4px 14px rgba(0,85,255,0.26)" };
  };

  const statusChipD = (status: string) => {
    if (status === "Active")   return { bg: dGREEN_S, color: dGREEN_D, border: dGREEN_B };
    if (status === "On Leave") return { bg: "rgba(255,136,0,0.10)", color: "#884400", border: "rgba(255,136,0,0.22)" };
    if (status === "Invited")  return { bg: "rgba(0,85,255,0.10)", color: dB1, border: "rgba(0,85,255,0.20)" };
    return                     { bg: "rgba(153,170,204,0.10)", color: dT3, border: "rgba(153,170,204,0.22)" };
  };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
            <GraduationCap className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Teachers</div>
            <div className="text-[12px] mt-1" style={{ color: dT3 }}>Manage teaching staff and monitor performance</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBulkOpen(true)}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold transition-transform hover:scale-[1.02]"
            style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}`, color: dGREEN_D }}>
            <Upload className="w-[14px] h-[14px]" strokeWidth={2.3} />
            Bulk Import
          </button>
          <button
            onClick={() => setIsInviteOpen(true)}
            className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: dSH_BTN }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[14px] h-[14px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Add Teacher</span>
          </button>
        </div>
      </div>

      {/* Dark Hero */}
      <div className="rounded-[22px] px-7 py-6 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Users className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>Faculty Directory</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[48px] font-bold leading-none tracking-tight">{totalCount}</span>
                <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>active teachers</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <CheckCircle className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>Active</div>
                <div className="text-[22px] font-bold leading-none" style={{ letterSpacing: "-0.5px" }}>{activeCount}</div>
              </div>
            </div>
            <div className="w-px h-10" style={{ background: "rgba(255,255,255,0.18)" }} />
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <Star className="w-[18px] h-[18px] text-white" strokeWidth={2.3} fill="white" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>Avg Rating</div>
                <div className="text-[22px] font-bold leading-none" style={{ letterSpacing: "-0.5px" }}>{avgRating !== null ? `${avgRating}/5` : "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards — valColor mutes to slate when value is "—" so empty
          stats don't visually scream "real data" with their full color. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        {[
          { title: "Avg Class Performance", val: avgClassPerf !== null ? `${avgClassPerf}%` : "—", valColor: avgClassPerf !== null ? dB1 : dT4,        sub: avgClassPerf !== null ? "Based on recorded results" : "No results yet", subColor: dT3, Icon: TrendingUp, grad: `linear-gradient(135deg, ${dB1}, ${dB2})`, glow: "rgba(0,85,255,0.10)", shadow: "0 4px 14px rgba(0,85,255,0.26)", onClick: () => navigate("/teacher-performance") },
          { title: "Teacher Attendance",    val: teacherAttPct !== null ? `${teacherAttPct}%` : "—", valColor: teacherAttPct !== null ? dGREEN_D : dT4, sub: teacherAttPct !== null ? (teacherAttPct >= 90 ? "Excellent" : teacherAttPct >= 75 ? "Good" : "Needs attention") : "No records yet", subColor: dGREEN_D, Icon: CalendarCheck, grad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, glow: "rgba(0,200,83,0.10)", shadow: "0 4px 14px rgba(0,200,83,0.22)", onClick: () => navigate("/attendance") },
          { title: "Parent Feedback",       val: avgRating !== null ? `${avgRating}/5` : "—",       valColor: avgRating !== null ? dGOLD : dT4,         sub: reviewCount > 0 ? `Based on ${reviewCount} reviews` : "No reviews yet", subColor: dT3, Icon: Star, grad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`, glow: "rgba(255,170,0,0.12)", shadow: "0 4px 14px rgba(255,170,0,0.26)", onClick: () => navigate("/teacher-leaderboard") },
          { title: "Active Teachers",       val: totalCount > 0 ? `${activeCount}/${totalCount}` : "0", valColor: totalCount > 0 ? dVIOLET : dT4,       sub: totalCount === 0 ? "No teachers yet" : onLeaveCount > 0 ? `${onLeaveCount} on leave` : activeCount === totalCount ? "All present" : "—", subColor: onLeaveCount > 0 ? dORANGE : dGREEN_D, Icon: Users, grad: `linear-gradient(135deg, ${dVIOLET}, #A07CF8)`, glow: "rgba(123,63,244,0.10)", shadow: "0 4px 14px rgba(123,63,244,0.24)", onClick: () => navigate("/teacher-performance") },
        ].map(({ title, val, valColor, sub, subColor, Icon, grad, glow, shadow, onClick }) => (
          <button key={title} onClick={onClick}
            className="bg-white rounded-[20px] p-5 relative overflow-hidden text-left transition-transform hover:scale-[1.02]"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
            <div className="absolute -top-6 -right-6 w-[100px] h-[100px] rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }} />
            <div className="flex items-center justify-between mb-4 relative">
              <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: dT4 }}>{title}</span>
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: grad, boxShadow: shadow }}>
                <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
            </div>
            <p className="text-[30px] font-bold tracking-tight leading-none mb-1.5" style={{ color: valColor, letterSpacing: "-1px" }}>{val}</p>
            <p className="text-[11px] font-semibold truncate" style={{ color: subColor }}>{sub}</p>
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 mt-5 flex-wrap">
        {/* Search input — flex row with the icon in its OWN cell to the
            left of the input. The input itself sits in a separate flex
            cell so the global `input { padding/font !important }` in
            index.css cannot push text onto the icon (different boxes,
            no overlap is physically possible). custom-chrome lets us
            zero out the input's left padding (icon cell already has
            44px of space) while leaving font/line-height at the
            global defaults so the placeholder renders cleanly. */}
        <div className="flex-1 min-w-[220px] flex items-center bg-white rounded-[14px]"
          style={{ border: `0.5px solid ${dSEP}`, boxShadow: dSH }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              alignSelf: "stretch",
              flexShrink: 0,
              pointerEvents: "none",
            }}
          >
            <Search size={17} color="rgba(0,85,255,0.78)" strokeWidth={2.5} />
          </span>
          <input
            type="text"
            placeholder="Search teachers…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none custom-chrome"
            style={{
              // Container is `items-center` (was `items-stretch` which
              // stretched the input to 44px and shifted the baseline).
              // Natural-size input now: 13 + 13 vertical padding + 19.5
              // line-box (13×1.5) = 45.5px — close to the 44px selects/
              // view-toggle and the text sits dead-center vertically.
              "--cc-padding": "13px 16px 13px 0",
              "--cc-font-size": "13px",
              "--cc-font-weight": "500",
              "--cc-line-height": "1.5",
              color: dT1,
              fontFamily: "inherit",
              border: "none",
            } as any}
          />
        </div>
        {[
          { value: subjectFilter, set: setSubjectFilter, all: "All Subjects", opts: allSubjects.map(s => ({ value: s, label: s })) },
          { value: statusFilter, set: setStatusFilter, all: "All Status", opts: [{ value: "Active", label: "Active" }, { value: "On Leave", label: "On Leave" }, { value: "Invited", label: "Invited" }] },
        ].map((f, i) => (
          <select key={i}
            value={f.value}
            onChange={e => f.set(e.target.value)}
            className="custom-chrome bg-white rounded-[14px] outline-none cursor-pointer"
            style={{
              // .custom-chrome opts out of the global `select { ... !important }`
              // rules in index.css. Padding bumped 12→13 vertical so
              // descenders like the "j" in "Subjects" have room to render
              // (was clipping at the bottom). Line-height 1.5 (the global
              // default) matches the search input's baseline so all four
              // filter-row boxes share the same visual baseline.
              "--cc-padding": "13px 40px 13px 16px",
              "--cc-line-height": "1.5",
              "--cc-font-size": "13px",
              "--cc-font-weight": "600",
              // Triple-vendor appearance reset (Tailwind's `appearance-none`
              // alone doesn't suppress Edge/Firefox native arrows).
              WebkitAppearance: "none",
              MozAppearance: "none",
              appearance: "none",
              minWidth: 160,
              flexShrink: 0,
              border: `0.5px solid ${dSEP}`,
              color: dT2,
              boxShadow: dSH,
              fontFamily: "inherit",
              textIndent: 0,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 14px center",
            } as any}>
            <option value="" style={{ color: "#000" }}>{f.all}</option>
            {f.opts.map(o => <option key={o.value} value={o.value} style={{ color: "#000" }}>{o.label}</option>)}
          </select>
        ))}
        <div className="flex items-center gap-1 bg-white rounded-[13px] p-1" style={{ border: `0.5px solid ${dSEP}`, boxShadow: dSH }}>
          <button
            onClick={() => setViewMode("grid")}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-transform hover:scale-[1.06]"
            style={{
              background: viewMode === "grid" ? `linear-gradient(135deg, ${dB1}, ${dB2})` : "transparent",
              color: viewMode === "grid" ? "#fff" : dT4,
            }}>
            <LayoutGrid className="w-4 h-4" strokeWidth={2.3} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-transform hover:scale-[1.06]"
            style={{
              background: viewMode === "list" ? `linear-gradient(135deg, ${dB1}, ${dB2})` : "transparent",
              color: viewMode === "list" ? "#fff" : dT4,
            }}>
            <List className="w-4 h-4" strokeWidth={2.3} />
          </button>
        </div>
      </div>

      {/* ── BULK IMPORT DIALOG ────────────────────────────────────────────── */}
      <Dialog open={isBulkOpen} onOpenChange={(o) => { if (!o) { setIsBulkOpen(false); setBulkDone(false); setBulkData([]); } else setIsBulkOpen(true); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Bulk Import Teachers</DialogTitle>
            <DialogDescription className="text-slate-500">Upload an Excel (.xlsx) file to invite multiple teachers at once.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!bulkDone && (
              <div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#1e3a8a]/40 hover:bg-slate-50 transition-all"
                >
                  <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">Click to upload Excel file</p>
                  <p className="text-xs text-slate-400 mt-1">.xlsx or .xls format</p>
                  <input type="file" hidden ref={fileInputRef} accept=".xlsx,.xls" onChange={handleFileUpload} />
                </div>
                <button onClick={downloadTemplate} className="mt-2 text-xs font-semibold text-[#1e3a8a] flex items-center gap-1.5 mx-auto hover:underline">
                  <Download className="w-3 h-3" /> Download template
                </button>
              </div>
            )}
            {bulkData.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[240px] overflow-y-auto">
                {bulkData.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0 bg-white">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.email}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                      t._status === "success"   ? "bg-green-50 text-green-600"  :
                      t._status === "duplicate" ? "bg-amber-50 text-amber-600"  :
                      t._status === "error"     ? "bg-red-50 text-red-600"      :
                      "bg-blue-50 text-blue-600"
                    }`}>{t._status}</span>
                  </div>
                ))}
              </div>
            )}
            {bulkDone && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Invited",    color: "bg-green-50 text-green-600",  count: bulkData.filter(t => t._status === "success").length   },
                  { label: "Duplicates", color: "bg-amber-50 text-amber-600",  count: bulkData.filter(t => t._status === "duplicate").length  },
                  { label: "Failed",     color: "bg-red-50 text-red-600",      count: bulkData.filter(t => t._status === "error").length      },
                ].map(({ label, color, count }) => (
                  <div key={label} className={`p-4 rounded-xl border text-center ${color.replace("text-", "border-").replace("600", "100")}`}>
                    <p className={`text-2xl font-black ${color.split(" ")[1]}`}>{count}</p>
                    <p className={`text-[10px] font-bold uppercase ${color.split(" ")[1]}`}>{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            {!bulkDone ? (
              <button
                onClick={handleBulkImport}
                disabled={bulkData.length === 0 || isBulkProcessing}
                className="w-full h-11 rounded-xl bg-[#1e3a8a] text-white font-semibold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBulkProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Import & Invite All</>}
              </button>
            ) : (
              <button
                onClick={() => { setIsBulkOpen(false); setBulkDone(false); setBulkData([]); }}
                className="w-full h-11 rounded-xl bg-green-600 text-white font-semibold hover:opacity-90 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Done
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── INVITE DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Add Teacher</DialogTitle>
            <DialogDescription className="text-slate-500">
              They'll receive an email invitation to join {userData?.schoolName || "the school"}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name</Label>
              <Input placeholder="Mrs. Kavita Sharma" className="h-11 rounded-xl"
                value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email Address</Label>
              <Input type="email" placeholder="teacher@school.edu" className="h-11 rounded-xl"
                value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</Label>
              <Input placeholder="e.g. Mathematics" className="h-11 rounded-xl"
                value={inviteForm.subject} onChange={e => setInviteForm({ ...inviteForm, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign Class (Optional)</Label>
              <select
                value={inviteForm.assignClassId}
                onChange={e => setInviteForm({ ...inviteForm, assignClassId: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
              >
                <option value="">— Not assigned —</option>
                {availableClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={isSending}
              className="w-full h-11 rounded-xl bg-[#1e3a8a] text-white font-semibold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><CheckCircle className="w-4 h-4" /> Send Invitation</>}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── ROSTER DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e3a8a]">Class Roster — {teacherToAssign?.name}</DialogTitle>
            <DialogDescription className="text-slate-500">Students currently enrolled under this teacher.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {loadingRoster ? (
              <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#1e3a8a]" /></div>
            ) : teacherRoster.length > 0 ? (
              <div className="rounded-xl overflow-hidden border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-[#1e3a8a] text-white">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Student</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Class</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {teacherRoster.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-800">{s.studentName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{s.studentEmail}</p>
                        </td>
                        <td className="px-5 py-3 font-semibold text-[#1e3a8a]">{s.className || "General"}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                            s.status === "Active" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                          }`}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-400">No enrollment records found</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Section Label */}
      <div className="flex items-center gap-3 mt-6 mb-3">
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
          style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.22)" }}>
          <GraduationCap className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.4} />
        </div>
        <div className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Faculty Directory</div>
        <span className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{ background: "rgba(0,85,255,0.10)", color: dB1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
          {filtered.length} teacher{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Teacher Grid / List / Empty */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-[20px] py-20 flex flex-col items-center gap-3 text-center" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.22)" }}>
            <GraduationCap className="w-8 h-8" style={{ color: dB1 }} strokeWidth={2} />
          </div>
          <p className="text-[14px] font-bold" style={{ color: dT1 }}>No teachers found</p>
          <p className="text-[11px]" style={{ color: dT4 }}>Try changing your search or filters</p>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(t => {
            const av = avatarGradD(t.color);
            const chip = statusChipD(t.status);
            return (
              <div key={t.id}
                onClick={() => setSelectedTeacher(t)}
                className="bg-white rounded-[20px] p-5 cursor-pointer group relative overflow-hidden transition-transform hover:scale-[1.02]"
                style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>

                {/* Hover actions used to live here as `absolute top-3 right-3`
                    and overlapped the teacher's name on narrow cards (4-col
                    grid + long names like "moeimajaaz"). Moved into the
                    Status row below where they share horizontal space with
                    the status badge — no more overlap, layout is predictable.
                    See: render block right after the Status Badge. */}

                {/* Avatar row */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-[14px] flex items-center justify-center text-white text-[15px] font-bold shrink-0"
                    style={{ background: av.bg, boxShadow: av.shadow }}>
                    {t.initials}
                  </div>
                  <div className="min-w-0">
                    {editingId === t.id ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <input autoFocus value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleSaveName(t.id);
                            if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                          }}
                          className="flex-1 min-w-0 text-[14px] font-bold rounded-[8px] px-2 py-1 outline-none"
                          style={{ border: `1px solid ${dB1}66`, color: dT1 }} />
                        {/* Save = green Check (✓ is universally save/confirm).
                            Cancel = neutral X. Both labelled via title for
                            tooltip discoverability + larger 28x28 hit target. */}
                        <button onClick={() => handleSaveName(t.id)}
                          className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white shrink-0 hover:scale-110 transition-transform"
                          style={{ background: dGREEN, boxShadow: "0 2px 6px rgba(0,200,83,0.30)" }}
                          title="Save (Enter)">
                          <Check className="w-4 h-4" strokeWidth={3} />
                        </button>
                        <button onClick={() => { setEditingId(null); setEditName(""); }}
                          className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 hover:scale-110 transition-transform"
                          style={{ background: "rgba(255,51,85,0.10)", border: "0.5px solid rgba(255,51,85,0.22)", color: dRED }}
                          title="Cancel (Esc)">
                          <X className="w-4 h-4" strokeWidth={3} />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-[14px] font-bold truncate leading-tight" style={{ color: dT1, letterSpacing: "-0.1px" }}>{t.name}</h3>
                    )}
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: t.subject ? dT3 : dT4 }}>{t.subject || "No subject"}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-[10px] pt-3" style={{ borderTop: `0.5px solid ${dSEP}` }}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: dT3 }}>
                      <BookOpen className="w-[12px] h-[12px]" strokeWidth={2.2} />
                      Classes
                    </span>
                    <span className="text-[13px] font-bold" style={{ color: dT1 }}>
                      {t.classCount === null ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" style={{ color: dT4 }} /> : t.classCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: dT3 }}>
                      <MapPin className="w-[12px] h-[12px]" strokeWidth={2.2} />
                      Experience
                    </span>
                    <span className="text-[13px] font-bold" style={{ color: t.experience ? dT1 : dT4 }}>{t.experience || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: dT3 }}>
                      <Star className="w-[12px] h-[12px]" strokeWidth={2.2} />
                      Rating
                    </span>
                    {(() => {
                      const myRating = perTeacherRating[t.id]?.rating;
                      return myRating !== undefined ? (
                        <span className="flex items-center gap-1 px-2 py-[2px] rounded-full"
                          style={{ background: "rgba(255,170,0,0.10)", border: "0.5px solid rgba(255,170,0,0.22)" }}>
                          <Star className="w-[11px] h-[11px]" style={{ color: dGOLD, fill: dGOLD }} />
                          <span className="text-[12px] font-bold" style={{ color: "#884400" }}>{myRating}</span>
                        </span>
                      ) : (
                        <span className="text-[13px] font-bold" style={{ color: dT4 }}>—</span>
                      );
                    })()}
                  </div>
                </div>

                {/* Status Badge + hover-revealed action buttons. Buttons sit
                    on the right side of this footer row instead of being
                    absolute-positioned over the avatar/name — fixes the
                    overlap bug where icons hid the teacher name on hover. */}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-[5px] rounded-full text-[10px] font-bold uppercase tracking-[0.08em] shrink-0"
                    style={{ background: chip.bg, color: chip.color, border: `0.5px solid ${chip.border}` }}>
                    <span className="w-[6px] h-[6px] rounded-full" style={{ background: chip.color }} />
                    {t.status}
                  </span>
                  {editingId !== t.id && (
                    <div className="flex gap-1.5 shrink-0 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleOpenRoster(t)}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:scale-110 transition-transform"
                        style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.22)", boxShadow: dSH }}
                        title="View Roster">
                        <Eye size={16} strokeWidth={2.6} color={dB1} />
                      </button>
                      <button onClick={() => handleTogglePrimary(t)}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:scale-110 transition-transform"
                        style={{
                          background: t.isPrimarySchool ? "rgba(255,170,0,0.22)" : "rgba(255,170,0,0.10)",
                          border: `0.5px solid ${t.isPrimarySchool ? "rgba(255,170,0,0.40)" : "rgba(255,170,0,0.22)"}`,
                          boxShadow: dSH,
                        }}
                        title={t.isPrimarySchool ? "Primary school" : "Mark as primary"}>
                        <Star size={16} strokeWidth={2.6} color={dGOLD} fill={t.isPrimarySchool ? dGOLD : "none"} />
                      </button>
                      <button onClick={() => handleStartEdit(t)}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:scale-110 transition-transform"
                        style={{ background: "rgba(255,136,0,0.10)", border: "0.5px solid rgba(255,136,0,0.22)", boxShadow: dSH }}
                        title="Edit Name">
                        <Edit3 size={16} strokeWidth={2.6} color={dORANGE} />
                      </button>
                      <button onClick={() => handleDeleteTeacher(t.id, t.name)}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:scale-110 transition-transform"
                        style={{ background: "rgba(255,51,85,0.10)", border: "0.5px solid rgba(255,51,85,0.22)", boxShadow: dSH }}
                        title="Archive">
                        <Trash2 size={16} strokeWidth={2.6} color={dRED} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST */
        <div className="bg-white rounded-[20px] overflow-hidden"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ background: dBG, borderBottom: `0.5px solid ${dSEP}` }}>
                  {["Teacher", "Subject", "Classes", "Experience", "Rating", "Status", "Actions"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.10em] ${i >= 2 && i <= 5 ? "text-center" : i === 6 ? "text-right" : "text-left"}`}
                      style={{ color: dT4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const av = avatarGradD(t.color);
                  const chip = statusChipD(t.status);
                  return (
                    <tr key={t.id}
                      onClick={() => setSelectedTeacher(t)}
                      className="cursor-pointer transition-colors hover:bg-[#F8FAFF]"
                      style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                            style={{ background: av.bg, boxShadow: av.shadow }}>
                            {t.initials}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold" style={{ color: dT1 }}>{t.name}</p>
                            <p className="text-[11px] font-medium" style={{ color: dT3 }}>{t.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {t.subject ? (
                          <span className="inline-flex items-center px-3 py-[4px] rounded-full text-[11px] font-bold"
                            style={{ background: "rgba(0,85,255,0.10)", color: dB1, border: "0.5px solid rgba(0,85,255,0.20)" }}>
                            {t.subject}
                          </span>
                        ) : (
                          <span className="text-[13px]" style={{ color: dT4 }}>—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center text-[13px] font-bold" style={{ color: dT1 }}>
                        {t.classCount === null ? "…" : t.classCount}
                      </td>
                      <td className="px-5 py-4 text-center text-[12px] font-medium" style={{ color: t.experience ? dT3 : dT4 }}>{t.experience || "—"}</td>
                      <td className="px-5 py-4 text-center">
                        {(() => {
                          const myRating = perTeacherRating[t.id]?.rating;
                          return myRating !== undefined ? (
                            <span className="inline-flex items-center justify-center gap-1 px-3 py-[4px] rounded-full"
                              style={{ background: "rgba(255,170,0,0.10)", border: "0.5px solid rgba(255,170,0,0.22)" }}>
                              <Star className="w-[11px] h-[11px]" style={{ color: dGOLD, fill: dGOLD }} />
                              <span className="text-[12px] font-bold" style={{ color: "#884400" }}>{myRating}</span>
                            </span>
                          ) : (
                            <span className="text-[13px] font-bold" style={{ color: dT4 }}>—</span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-[4px] rounded-full text-[10px] font-bold uppercase tracking-[0.08em]"
                          style={{ background: chip.bg, color: chip.color, border: `0.5px solid ${chip.border}` }}>
                          <span className="w-[6px] h-[6px] rounded-full" style={{ background: chip.color }} />
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {[
                            { onClick: () => handleOpenRoster(t),                Icon: Eye,    title: "View Roster",                                              color: dB1 },
                            { onClick: () => handleTogglePrimary(t),             Icon: Star,   title: t.isPrimarySchool ? "Primary school" : "Mark as primary",   color: dGOLD,   active: t.isPrimarySchool },
                            { onClick: () => handleStartEdit(t),                 Icon: Edit3,  title: "Edit Name",                                                color: dORANGE },
                            { onClick: () => handleDeleteTeacher(t.id, t.name),  Icon: Trash2, title: "Archive",                                                  color: dRED },
                          ].map(({ onClick, Icon, title, color, active }, i) => (
                            <button key={i} onClick={onClick}
                              className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors hover:bg-[#F0F5FF]"
                              title={title}>
                              {/* Pass color directly to Lucide — CSS color
                                  inheritance was unreliable here. */}
                              <Icon
                                size={14}
                                strokeWidth={2.4}
                                color={color}
                                fill={active ? color : "none"}
                              />
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teachers;
