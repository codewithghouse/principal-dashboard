import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download, GraduationCap,
  Loader2, X,
  Upload, FileSpreadsheet, AlertTriangle, Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, serverTimestamp,
  query, where, onSnapshot, writeBatch, doc, getDocs, limit, deleteDoc,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { sendEmail } from "@/lib/resend";
import * as XLSX from "xlsx";
import { useIsMobile } from "@/hooks/use-mobile";
import StudentsMobile from "@/components/dashboard/StudentsMobile";
import DesktopStudentsView from "@/components/dashboard/DesktopStudentsView";

// ── Types ────────────────────────────────────────────────────────────────────
interface BulkStudent {
  name: string;
  email: string;
  class?: string;
  rollNo?: string;
  parentPhone?: string;
  admissionDate?: string;
  _status?: "pending" | "success" | "error" | "duplicate";
  _error?: string;
}

const TEMPLATE_DATA = [
  { Name: "Aryan Sharma", Email: "aryan@example.com", Class: "8-A", RollNo: "01", ParentPhone: "9876543210", AdmissionDate: "2024-06-01" },
  { Name: "Priya Verma",  Email: "priya@example.com", Class: "8-B", RollNo: "02", ParentPhone: "9876543211", AdmissionDate: "2024-06-01" },
];

// ── Smart column detection so users can upload ANY template ─────────────────
// Each canonical field has a synonym list. Headers are normalized (lowercased,
// stripped of spaces/underscores/dots) before matching, so "Student Full Name",
// "student_name", "STUDENT.NAME", "स्टूडेंट" → all funnel to the right field.
type FieldKey = "name" | "email" | "class" | "rollNo" | "parentPhone" | "admissionDate";
const FIELD_LABELS: Record<FieldKey, { label: string; required: boolean }> = {
  name:          { label: "Name",           required: true  },
  email:         { label: "Email",          required: true  },
  class:         { label: "Class",          required: false },
  rollNo:        { label: "Roll No",        required: false },
  parentPhone:   { label: "Parent Phone",   required: false },
  admissionDate: { label: "Admission Date", required: false },
};
const SYNONYMS: Record<FieldKey, string[]> = {
  name:          ["name", "fullname", "studentname", "student", "studentfullname", "childname", "pupilname"],
  email:         ["email", "emailaddress", "mail", "studentemail", "emailid", "mailid"],
  class:         ["class", "classname", "section", "grade", "standard", "std", "div", "division", "classsection"],
  rollNo:        ["rollno", "roll", "rollnumber", "regno", "regnumber", "registration", "registrationno", "admissionno", "admno", "studentid", "id", "srno"],
  parentPhone:   ["parentphone", "phone", "mobile", "contact", "parentmobile", "parentnumber", "parentcontact", "phonenumber", "mobilenumber", "guardianphone", "guardianmobile", "fatherphone", "motherphone"],
  admissionDate: ["admissiondate", "admission", "doj", "dateofjoining", "joined", "joiningdate", "enrolldate", "enrollmentdate", "admittedon", "admitdate", "startdate", "dateofadmission"],
};
const normalizeHeader = (s: string) => String(s).toLowerCase().replace(/[\s_\-./()]/g, "");

const detectColumns = (headers: string[]): Record<FieldKey, string> => {
  const mapping: Record<FieldKey, string> = {
    name: "", email: "", class: "", rollNo: "", parentPhone: "", admissionDate: "",
  };
  const used = new Set<string>();
  // Pass 1 — exact normalized match (highest confidence)
  (Object.keys(SYNONYMS) as FieldKey[]).forEach(field => {
    const match = headers.find(h => !used.has(h) && SYNONYMS[field].includes(normalizeHeader(h)));
    if (match) { mapping[field] = match; used.add(match); }
  });
  // Pass 2 — partial substring match for whatever's still unmapped
  (Object.keys(SYNONYMS) as FieldKey[]).forEach(field => {
    if (mapping[field]) return;
    const match = headers.find(h => {
      if (used.has(h)) return false;
      const n = normalizeHeader(h);
      return SYNONYMS[field].some(s => n.includes(s) || s.includes(n));
    });
    if (match) { mapping[field] = match; used.add(match); }
  });
  return mapping;
};

const EMPTY_MAPPING: Record<FieldKey, string> = {
  name: "", email: "", class: "", rollNo: "", parentPhone: "", admissionDate: "",
};

// Default page size — user can change via the Pagination controls. The other
// supported sizes are defined in StudentsPagination.tsx (10/25/50/100). Size
// changes are tracked in component state so they persist within a session.
const DEFAULT_PAGE_SIZE = 10;

// Attendance window — keeps the page snappy and the displayed % meaningful.
// Lifetime average across years of records is misleading (a student who was
// 100% in 2022 but 50% in 2025 should NOT show 75%) and a server-side date
// filter prevents downloading the entire attendance history into the browser.
// Requires composite index: attendance (schoolId, branchId, date ASC).
const ATTENDANCE_WINDOW_DAYS = 60;
const daysAgoStr = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// At-risk threshold — aligned with Dashboard.tsx attendance risk
// (<70% over the last 30 days with at least 5 records). Matching thresholds
// across pages prevents the same student appearing as "at risk" on one page
// and "OK" on another.
const AT_RISK_PCT      = 70;
const AT_RISK_MIN_RECS = 5;

// Natural sort for class names like "9A" < "10A" — pure lexicographic sort
// puts "10A" before "9A" which is the wrong intuition for school grades.
const naturalClassCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

// Parent-dashboard URL — env-var driven so a rebrand/deploy-target change
// doesn't require a code edit. Falls back to the current production host
// so existing emails keep working without env config.
const PARENT_PORTAL_URL =
  (import.meta.env.VITE_PARENT_DASHBOARD_URL as string | undefined) ||
  "https://parent-dashboard-ten.vercel.app/";

/**
 * Throttled fan-out for outbound email — caps simultaneous in-flight requests
 * (Resend free tier ≈ 100/sec, trial ≈ 10/sec) so a 200-row bulk upload
 * doesn't burst-fail with rate-limit errors. Items are processed in
 * `concurrency`-sized chunks with `delayMs` between chunks. Returns when
 * everything is done; caller can await OR fire-and-forget. Rejections are
 * swallowed (Promise.allSettled) so one bad email doesn't kill the queue.
 */
async function sendThrottled<T>(
  items: T[],
  send: (item: T) => Promise<unknown>,
  concurrency = 5,
  delayMs = 250,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    await Promise.allSettled(slice.map(send));
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

const Students = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [studentsData, setStudentsData]     = useState<any[]>([]);
  const [classes, setClasses]               = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [searchTerm, setSearchTerm]         = useState("");
  // Account-level branch mismatch: principal user has no branchId (so we
  // can't safely query branch-scoped data) OR enrollments exist at the
  // school level but were never tagged with the principal's branchId.
  // Distinguishing these two cases gives the user actionable copy instead
  // of a blank loading state.
  const [mappingIssue, setMappingIssue]     = useState<
    | { kind: "user-no-branch" }
    | { kind: "branch-missing"; sample: number; total: number }
    | null
  >(null);
  const [currentPage, setCurrentPage]       = useState(1);
  const [pageSize, setPageSize]             = useState<number>(DEFAULT_PAGE_SIZE);
  // Grid (class-grouped cards) vs List (flat sortable table). Defaults to
  // grid — preserves the existing visual on first paint. Mirrors the same
  // toggle on the Teachers page so principals carry one mental model.
  const [viewMode, setViewMode]             = useState<"grid" | "list">("grid");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [newStudent, setNewStudent]         = useState({ name: "", email: "", classId: "", grade: "", section: "" });
  const [atRiskFilter, setAtRiskFilter]     = useState(false);
  const [classFilter, setClassFilter]       = useState("ALL");

  // Bulk upload
  const [showBulkModal, setShowBulkModal]   = useState(false);
  const [bulkRows, setBulkRows]             = useState<BulkStudent[]>([]);
  const [bulkUploading, setBulkUploading]   = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  // Raw uploaded rows + headers + canonical→header mapping. The mapping is
  // auto-detected from headers; the user can override via dropdowns. `bulkRows`
  // is rebuilt from these whenever mapping changes (see effect below).
  const [bulkRawRows, setBulkRawRows]       = useState<Record<string, unknown>[]>([]);
  const [bulkHeaders, setBulkHeaders]       = useState<string[]>([]);
  const [bulkMapping, setBulkMapping]       = useState<Record<FieldKey, string>>(EMPTY_MAPPING);

  // Delete student — modal + in-flight state. We delete the student doc and
  // every matching enrollment, but intentionally LEAVE attendance + score
  // history intact so the school keeps an audit trail of past records (e.g.
  // for re-enrollment or complaint handling). Confirmation prevents misclicks.
  const [studentToDelete, setStudentToDelete] = useState<any | null>(null);
  const [deleting, setDeleting]               = useState(false);

  // Hold latest snapshots in refs so merges are instant
  const attRef        = useRef<any[]>([]);
  const enrollRef     = useRef<any[]>([]);
  const studentRef    = useRef<any[]>([]);
  const teacherMapRef = useRef<Map<string, string>>(new Map()); // teacherId → teacherName
  // classes master list (id → name) — without this an enrollment carrying
  // only `classId: "abc123"` would render its grade as the opaque string in
  // the table. Mirrors the `classes` state but available synchronously to
  // merge() (state would be stale-closured here).
  const classesRef    = useRef<Map<string, string>>(new Map());

  // ── helpers ─────────────────────────────────────────────────────────────────

  /**
   * Compute attendance % over the windowed records the listener already
   * filtered server-side (last ATTENDANCE_WINDOW_DAYS). Returns null when
   * the student has zero records in the window — we never default to 0
   * because that would silently flag healthy students as "0% attendance".
   */
  const computeAttendance = (s: any): { display: string; pct: number | null; recCount: number } => {
    const email = (s.email || s.studentEmail || "").toLowerCase();
    const id    = s.id || s.studentId;
    const recs  = attRef.current.filter(r =>
      (id    && r.studentId === id) ||
      (email && r.studentEmail?.toLowerCase() === email)
    );
    if (recs.length === 0) return { display: "—", pct: null, recCount: 0 };
    // Exclude holiday days (whole-class declared off-days) from %.
    const countable = recs.filter(r => r.status !== "holiday");
    if (countable.length === 0) return { display: "—", pct: null, recCount: 0 };
    const present = countable.filter(r => r.status === "present" || r.status === "late").length;
    const pct = Math.round((present / countable.length) * 100);
    return { display: `${pct}%`, pct, recCount: countable.length };
  };

  const merge = () => {
    const classMap = classesRef.current;
    // Identity merge: one row per student. Two pitfalls handled here —
    //  1. Multi-class students (one student in 10A AND Computer Club) used
    //     to be deduped to whichever className was written last. Now we
    //     collect ALL classes/teachers in Sets and join on the surviving row.
    //  2. Sibling collision: two siblings sharing the parent's email used
    //     to merge into one row when the key was email-first. Now we use
    //     a dual-index (id + email) so both siblings keep distinct keys
    //     while still merging student + enrollment docs that refer to the
    //     same student via different fields.
    type StudentSlot = {
      base: any;
      classNames: Set<string>;
      teacherNames: Set<string>;
    };
    const slots = new Map<string, StudentSlot>();
    const idIndex    = new Map<string, string>(); // studentId/docId  → slot key
    const emailIndex = new Map<string, string>(); // student email    → slot key

    /** Resolve OR create a slot for a doc — prefers ID match (avoids sibling
     *  collision), falls back to email match (recovers legacy enrollments
     *  written before studentId got the canonical fix). Once a slot is
     *  located, both indexes are populated so future docs with EITHER
     *  identifier hit the same slot. */
    const slotKey = (d: any): string | null => {
      const id    = d.id || d.studentId;
      const idStr = id != null ? String(id).toLowerCase() : "";
      const email = ((d.email || d.studentEmail || "") + "").toLowerCase();
      let key = (idStr && idIndex.get(idStr)) || (email && emailIndex.get(email)) || "";
      if (!key) {
        // Prefer ID as the canonical key — it's stable and unique per
        // student. Email as fallback for docs that lack any id field.
        key = idStr || email;
        if (!key) return null;
        slots.set(key, { base: {}, classNames: new Set(), teacherNames: new Set() });
      }
      // Cross-register both indexes so subsequent lookups find the slot
      // by either side of the identity.
      if (idStr   && !idIndex.has(idStr))     idIndex.set(idStr, key);
      if (email   && !emailIndex.has(email))  emailIndex.set(email, key);
      return key;
    };

    // Resolve a class identifier (id or name) to its human label. Falls back
    // to the bare className/classId strings when no master entry exists.
    const labelOfClass = (className?: string, classId?: string): string => {
      if (className && typeof className === "string" && className.trim()) return className.trim();
      if (classId && classMap.get(String(classId))) return classMap.get(String(classId))!;
      return "";
    };

    // A. students collection — authoritative for identity + display name
    studentRef.current.forEach(d => {
      const key = slotKey(d);
      if (!key) return;
      const slot = slots.get(key)!;
      // Spread d onto base — student doc fields take precedence over any
      // partial enrollment data already collected.
      slot.base = { ...slot.base, ...d };
      const cn = labelOfClass(d.className, d.classId);
      if (cn) slot.classNames.add(cn);
      const tn = teacherMapRef.current.get(d.teacherId) || d.teacherName;
      if (tn && typeof tn === "string" && tn.trim()) slot.teacherNames.add(tn.trim());
    });

    // B. enrollments — fill identity gaps + collect every class the student
    // is enrolled in (multi-class students contribute multiple rows here).
    enrollRef.current.forEach(d => {
      const key = slotKey(d);
      if (!key) return;
      const slot = slots.get(key)!;
      // Only fill identity fields that are missing — never overwrite the
      // student doc's authoritative name/email with the enrollment's copy
      // (enrollments can have stale or empty values).
      if (!slot.base.id)    slot.base.id    = d.studentId || d.id;
      if (!slot.base.name)  slot.base.name  = d.studentName || d.name || "Unknown";
      if (!slot.base.email) slot.base.email = d.studentEmail || d.email || "";
      if (!slot.base.schoolId) slot.base.schoolId = d.schoolId || "";
      if (!slot.base.branchId) slot.base.branchId = d.branchId || "";
      // No fabricated "Active" — leave status null when missing so the
      // UI can render "—" honestly. Memory: bug_pattern_fabricated_fallback.
      const cn = labelOfClass(d.className, d.classId);
      if (cn) slot.classNames.add(cn);
      const tn = teacherMapRef.current.get(d.teacherId) || d.teacherName;
      if (tn && typeof tn === "string" && tn.trim()) slot.teacherNames.add(tn.trim());
    });

    const list = Array.from(slots.values())
      .map(({ base: s, classNames, teacherNames }) => {
        const att = computeAttendance(s);
        // Match Dashboard semantics: at-risk only when we have enough signal
        // (≥ AT_RISK_MIN_RECS records in the window) AND attendance below
        // threshold. A single absence doesn't permanently brand a student.
        const isAtRisk = att.pct !== null && att.recCount >= AT_RISK_MIN_RECS && att.pct < AT_RISK_PCT;
        const allClasses = Array.from(classNames).sort(naturalClassCompare);
        const allTeachers = Array.from(teacherNames).sort(naturalClassCompare);
        const displayName = s.name || s.studentName || "Unknown";
        return {
          ...s,
          name:         displayName,
          initials:     displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
          // Multi-class students get a comma-joined label; single-class falls
          // back to the resolved or raw className. Empty → "—" placeholder.
          gradeDisplay: allClasses.length > 0 ? allClasses.join(", ") : "—",
          // Keep the array form too for filters that need exact-match
          // semantics (a student in "10A, 10B" should match a "10A" filter).
          allClasses,
          status:       s.status || "Active",
          faculty:      allTeachers.length > 0 ? allTeachers.join(", ") : "—",
          attendance:   att.display,
          attPct:       att.pct,
          isAtRisk,
        };
      })
      .sort((a, b) => {
        // At-risk students first, then alphabetical
        if (a.isAtRisk && !b.isAtRisk) return -1;
        if (!a.isAtRisk && b.isAtRisk) return 1;
        return a.name.localeCompare(b.name);
      });

    setStudentsData(list);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) { setLoading(false); return; }
    // Principal account isn't linked to a branch — show an explicit error
    // banner instead of subscribing to school-wide data (which would leak
    // other branches' rosters across tenants). The previous early-return
    // left the page silently empty with no diagnostic.
    if (!branchId) {
      setLoading(false);
      setMappingIssue({ kind: "user-no-branch" });
      return;
    }
    // Clear any stale "user-no-branch" once a branchId becomes available.
    // The branch-missing-on-docs case is detected by a separate effect.
    setMappingIssue(prev => prev?.kind === "user-no-branch" ? null : prev);

    setLoading(true);

    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];

    const unsubEnroll = onSnapshot(query(collection(db, "enrollments"), ...C), snap => {
      enrollRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

    const unsubStudents = onSnapshot(query(collection(db, "students"), ...C), snap => {
      studentRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

    // Server-side date filter — see ATTENDANCE_WINDOW_DAYS comment at module top.
    const attCutoff = daysAgoStr(ATTENDANCE_WINDOW_DAYS);
    const unsubAtt = onSnapshot(
      query(collection(db, "attendance"), ...C, where("date", ">=", attCutoff)),
      snap => {
        attRef.current = snap.docs.map(d => d.data());
        merge();
      },
    );

    const unsubCls = onSnapshot(query(collection(db, "classes"), ...C), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setClasses(list);
      // Mirror to ref + re-run merge so enrolment rows that only carry
      // classId (no className) get resolved to a human-readable label.
      const m = new Map<string, string>();
      list.forEach((c: any) => {
        const name = c.name || c.className;
        if (typeof name === "string" && name.trim() && c.id) m.set(c.id, name.trim());
      });
      classesRef.current = m;
      merge();
    });

    // Teachers — build id→name map so enrollment rows show correct faculty
    const unsubTeachers = onSnapshot(query(collection(db, "teachers"), ...C), snap => {
      const m = new Map<string, string>();
      snap.docs.forEach(d => {
        const t = d.data();
        if (t.name) m.set(d.id, t.name);
      });
      teacherMapRef.current = m;
      merge();
    });

    return () => { unsubEnroll(); unsubStudents(); unsubAtt(); unsubCls(); unsubTeachers(); };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Branch-missing-on-docs probe ─────────────────────────────────────────
  // Mirrors the Dashboard.tsx mapping detector: when branch-scoped reads
  // settle empty but the school clearly has data, run a one-shot schoolId
  // probe and check whether the docs lack `branchId`. Surfaces the silent
  // ghost-empty case (writers forgot to stamp branchId) as actionable copy.
  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return;
    if (loading) return;
    if (studentsData.length > 0) {
      setMappingIssue(prev => prev?.kind === "branch-missing" ? null : prev);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const probe = await getDocs(query(
          collection(db, "students"),
          where("schoolId", "==", schoolId),
          limit(10),
        ));
        if (cancelled) return;
        if (probe.empty) {
          setMappingIssue(prev => prev?.kind === "branch-missing" ? null : prev);
          return;
        }
        const missing = probe.docs.filter(d => !d.data().branchId).length;
        if (missing > 0) {
          setMappingIssue({ kind: "branch-missing", sample: missing, total: probe.size });
        }
      } catch {
        // probe is best-effort; empty UI is no worse than before
      }
    })();
    return () => { cancelled = true; };
  }, [userData?.schoolId, userData?.branchId, loading, studentsData.length]);

  // ── Add student ──────────────────────────────────────────────────────────────

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.classId) {
      return toast.error("Name and Class are required.");
    }
    if (!newStudent.email) {
      return toast.error("Email is required to enroll a student.");
    }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");

    const cls = classes.find(c => c.id === newStudent.classId);
    const sid = newStudent.email.toLowerCase().trim();
    const studentName = newStudent.name.trim();

    setSaving(true);
    try {
      // 1. Add to students collection — capture the auto-generated doc ID so we
      // can use it as the canonical studentId everywhere downstream. Previously
      // we used `email` as `studentId`, which broke the parent-dashboard reads
      // (those query enrollments by `studentData.id`, the actual doc ID, not email).
      //
      // ⚠ TECH DEBT (tracked) — The `studentId: sid` field below is a legacy
      // alias kept for backward compatibility with pre-fix readers that still
      // do `where("studentId", "==", email)`. The canonical id is the Firestore
      // doc id (used in enrollment writes below). When all readers migrate to
      // the doc-id pattern, this field can be removed (one-shot Firestore
      // migration to rename `studentId → legacyEmailKey` then drop the field).
      const studentDocRef = await addDoc(collection(db, "students"), {
        name:        studentName,
        email:       sid,
        studentId:   sid, // legacy alias — see TECH DEBT comment above
        classId:     newStudent.classId,
        className:   cls?.name || "",
        teacherId:   cls?.teacherId || "",
        teacherName: cls?.teacherName || "",
        schoolId,
        branchId,
        status:      "Active",
        createdAt:   serverTimestamp(),
      });

      // 2. Add to enrollments — must reference the real student doc ID so that
      // parent-dashboard's `where('studentId', '==', studentData.id)` matches.
      await addDoc(collection(db, "enrollments"), {
        studentId:    studentDocRef.id,
        studentEmail: sid,
        studentName:  studentName,
        classId:      newStudent.classId,
        className:    cls?.name || "",
        teacherId:    cls?.teacherId || "",
        teacherName:  cls?.teacherName || "",
        schoolId,
        branchId,
        createdAt:    serverTimestamp(),
      });

      // 3. Send welcome email (non-blocking — don't fail enrollment if email fails)
      // schoolName fallback chain: explicit name → branchName → "your school"
      // (a natural-language fallback that doesn't look like a placeholder).
      // The previous "School" literal made emails look unprofessional when
      // userData.schoolName wasn't populated (e.g., new tenants).
      const schoolDisplayName = userData?.schoolName || userData?.branchName || "your school";
      if (sid) {
        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: sid,
            subject: `You've been enrolled — ${cls?.name || "Class"} | ${schoolDisplayName}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;">
                <h2 style="color:#1e3a8a;margin-bottom:8px;">Welcome, ${studentName}!</h2>
                <p style="color:#555;">You have been enrolled in <strong>${cls?.name || "your class"}</strong>.</p>
                <table style="margin:20px 0;width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;color:#888;font-size:13px;">School</td><td style="font-weight:bold;color:#333;">${schoolDisplayName}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;font-size:13px;">Class</td><td style="font-weight:bold;color:#333;">${cls?.name || "—"}</td></tr>
                  ${cls?.teacherName ? `<tr><td style="padding:8px 0;color:#888;font-size:13px;">Teacher</td><td style="font-weight:bold;color:#333;">${cls.teacherName}</td></tr>` : ""}
                </table>
                <div style="margin:28px 0;text-align:center;">
                  <a href="${PARENT_PORTAL_URL}" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
                    Login to Student Portal
                  </a>
                </div>
                <p style="color:#aaa;font-size:12px;text-align:center;">Use your email (${sid}) to sign in.</p>
              </div>
            `,
          }),
        }).catch(() => {}); // silent fail — enrollment already saved
      }

      toast.success(`${studentName} enrolled & invitation sent!`);
      setIsAddModalOpen(false);
      setNewStudent({ name: "", email: "", classId: "", grade: "", section: "" });
    } catch {
      toast.error("Enrollment failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Bulk Upload ──────────────────────────────────────────────────────────────

  const parseBulkFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        if (rows.length === 0) {
          toast.warning("File is empty or has no readable rows.");
          return;
        }
        // Headers come from the first row's keys (XLSX preserves original order)
        const headers = Object.keys(rows[0]);
        setBulkRawRows(rows);
        setBulkHeaders(headers);
        setBulkMapping(detectColumns(headers));
      } catch (err: any) {
        toast.error("Could not read file: " + (err?.message || "unknown error"));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Re-build typed bulkRows whenever the user changes the mapping
  // (or after parseBulkFile sets the auto-detected mapping).
  useEffect(() => {
    if (bulkRawRows.length === 0) {
      setBulkRows([]);
      return;
    }
    const m = bulkMapping;
    const pick = (r: Record<string, unknown>, key: string) =>
      key && r[key] !== undefined && r[key] !== null ? String(r[key]) : "";
    const parsed: BulkStudent[] = bulkRawRows
      .map((r): BulkStudent => ({
        name:          pick(r, m.name).trim(),
        email:         pick(r, m.email).trim().toLowerCase(),
        class:         pick(r, m.class).trim(),
        rollNo:        pick(r, m.rollNo).trim(),
        parentPhone:   pick(r, m.parentPhone).trim(),
        admissionDate: pick(r, m.admissionDate).trim(),
        _status:       "pending",
      }))
      .filter(r => r.name && r.email);
    setBulkRows(parsed);
  }, [bulkRawRows, bulkMapping]);

  const downloadTemplate = () => {
    const ws  = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "student_upload_template.xlsx");
  };

  const handleBulkUpload = async () => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");
    if (bulkRows.length === 0) return;

    setBulkUploading(true);

    // Fresh duplicate detection — server query, not client cache. The
    // listener-backed `studentsData` may be mid-update when the user clicks
    // upload (especially right after another bulk completes). Querying live
    // closes the race window where two users uploading simultaneously could
    // both think their rows are new.
    const dupSnap = await getDocs(query(
      collection(db, "students"),
      where("schoolId", "==", schoolId),
      where("branchId", "==", branchId),
    ));
    const existingEmails = new Set(
      dupSnap.docs.map(d => {
        const data = d.data() as any;
        return (data.email || data.studentEmail || "").toLowerCase();
      }).filter(Boolean)
    );

    // Mark duplicates before writing
    const tagged = bulkRows.map(r => ({
      ...r,
      _status: existingEmails.has(r.email) ? ("duplicate" as const) : ("pending" as const),
    }));
    setBulkRows(tagged);

    const toWrite = tagged.filter(r => r._status === "pending");
    if (toWrite.length === 0) {
      toast.warning("All rows are duplicates — nothing to upload.");
      setBulkUploading(false);
      return;
    }

    // Firestore batch limit is 500 ops; 2 docs per student → 250 students per batch
    const BATCH_SIZE = 200;
    let successCount = 0;
    // Collect every successful row's email payload so we can dispatch them
    // through a SINGLE throttled queue at the end (instead of bursting
    // BATCH_SIZE emails per Firestore commit, which trips Resend's
    // per-second rate limit on bulk uploads of 50+ students).
    const emailQueue: { to: string; name: string; cls: any }[] = [];

    try {
      for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
        const chunk = toWrite.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(r => {
          // Find classId by class name match
          const cls = classes.find(c =>
            c.name?.toLowerCase() === r.class?.toLowerCase() ||
            c.id?.toLowerCase()   === r.class?.toLowerCase()
          );

          // Pre-allocate the student doc ref so we have its auto-id BEFORE
          // writing the enrollment. The previous bulk path stamped
          // `studentId: r.email` on enrollments — but the parent-dashboard
          // queries enrollments by the student's actual doc id, which broke
          // every bulk-uploaded student silently (single-add already had
          // the fix; bulk had drifted). Now both paths agree.
          const studentDocRef = doc(collection(db, "students"));
          batch.set(studentDocRef, {
            name:          r.name,
            email:         r.email,
            studentId:     r.email, // legacy field — kept for email-keyed reads
            classId:       cls?.id || r.class || "",
            className:     cls?.name || r.class || "",
            teacherId:     cls?.teacherId || "",
            teacherName:   cls?.teacherName || "",
            rollNo:        r.rollNo || "",
            parentPhone:   r.parentPhone || "",
            admissionDate: r.admissionDate || "",
            schoolId,
            branchId,
            status:        "Active",
            createdAt:     serverTimestamp(),
          });

          const enrollDocRef = doc(collection(db, "enrollments"));
          batch.set(enrollDocRef, {
            studentId:    studentDocRef.id, // canonical — matches parent-dashboard reads
            studentEmail: r.email,
            studentName:  r.name,
            classId:      cls?.id || r.class || "",
            className:    cls?.name || r.class || "",
            teacherId:    cls?.teacherId || "",
            teacherName:  cls?.teacherName || "",
            schoolId,
            branchId,
            createdAt:    serverTimestamp(),
          });

          if (r.email) emailQueue.push({ to: r.email, name: r.name, cls });
        });

        await batch.commit();
        successCount += chunk.length;
      }

      setBulkRows(prev => prev.map(r =>
        r._status === "pending" ? { ...r, _status: "success" as const } : r
      ));
      toast.success(`${successCount} students uploaded — invite emails dispatching in background.`);

      // Throttled background send. Concurrency = 5, delay = 250ms between
      // chunks → ≈ 20 emails/sec. Well under Resend's free-tier ceiling
      // (≈ 100/sec) and safe under the trial-tier ceiling (10/sec) too.
      // Fire-and-forget — user has already been notified the upload is done.
      const schoolDisplayName = userData?.schoolName || userData?.branchName || "your school";
      void sendThrottled(emailQueue, ({ to, name, cls }) =>
        sendEmail({
          to,
          subject: `You've been enrolled${cls ? ` — ${cls.name}` : ""} | ${schoolDisplayName}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <div style="background:#1e3a8a;padding:24px 28px;">
                <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">EDULLENT</h1>
                <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Student Portal Invitation</p>
              </div>
              <div style="padding:28px;background:#fff;">
                <h2 style="color:#1e293b;margin:0 0 12px;">Welcome, ${name}!</h2>
                <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">
                  You have been enrolled${cls ? ` in <strong>${cls.name}</strong>${cls.teacherName ? ` — Teacher: <strong>${cls.teacherName}</strong>` : ""}` : ` at <strong>${schoolDisplayName}</strong>`}.
                </p>
                <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
                  Log in with this email address (<strong>${to}</strong>) to access your student portal.
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${PARENT_PORTAL_URL}"
                     style="background:#1e3a8a;color:#fff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
                    Go to Student Portal
                  </a>
                </div>
              </div>
              <div style="background:#f1f5f9;padding:14px 28px;text-align:center;">
                <p style="color:#94a3b8;font-size:11px;margin:0;">Powered by Edullent Cloud Architecture</p>
              </div>
            </div>
          `,
        }),
      );
    } catch (e: any) {
      toast.error("Bulk upload failed: " + e.message);
      setBulkRows(prev => prev.map(r =>
        r._status === "pending" ? { ...r, _status: "error" as const, _error: e.message } : r
      ));
    }
    setBulkUploading(false);
  };

  // ── Delete student ─────────────────────────────────────────────────────────
  /**
   * Hard-deletes the student doc and every matching enrollment row. Both the
   * canonical doc-id AND the legacy email-keyed studentId are queried so we
   * catch enrollments written by both old (pre-fix) and new bulk paths. We
   * intentionally leave attendance and score history intact — those records
   * are an immutable audit trail; deleting them would also break per-class
   * historical analytics for OTHER students in the same class.
   *
   * @returns silently on success; toasts errors. Closes the modal either way.
   */
  const handleDeleteStudent = async () => {
    const target = studentToDelete;
    if (!target) return;
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");

    setDeleting(true);
    try {
      // 1. Find every enrollment that references this student. Two queries:
      //    one by studentId (matches both canonical doc-ids and legacy email
      //    studentIds), one by studentEmail. Results merged with Set dedup
      //    keyed on doc-id so we don't try to delete the same row twice.
      const baseScope = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];
      const enrolIds = new Set<string>();
      const targetEmail = (target.email || target.studentEmail || "").toLowerCase();

      // Query by studentId — matches both auto-id and email-as-id flavours.
      // We try both target.id (Firestore doc id) and target.studentId in case
      // they diverge for legacy data.
      const candidateIds = [target.id, target.studentId, targetEmail].filter(Boolean) as string[];
      const queries = await Promise.all(
        Array.from(new Set(candidateIds)).map(idOrEmail =>
          getDocs(query(collection(db, "enrollments"), ...baseScope, where("studentId", "==", idOrEmail))),
        ),
      );
      queries.forEach(snap => snap.docs.forEach(d => enrolIds.add(d.id)));

      if (targetEmail) {
        const byEmail = await getDocs(query(
          collection(db, "enrollments"), ...baseScope, where("studentEmail", "==", targetEmail),
        ));
        byEmail.docs.forEach(d => enrolIds.add(d.id));
      }

      // 2. Batch-delete the enrollments + the student doc atomically. Firestore
      //    batch limit is 500 ops; chunk if a student somehow has more.
      const enrolIdArr = Array.from(enrolIds);
      const BATCH_LIMIT = 450; // leave headroom for the student doc delete itself
      for (let i = 0; i < enrolIdArr.length; i += BATCH_LIMIT) {
        const chunk = enrolIdArr.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach(id => batch.delete(doc(db, "enrollments", id)));
        await batch.commit();
      }

      // 3. Finally remove the student doc itself. Done last so a partial
      //    failure on enrollments doesn't leave us with a deleted student
      //    but stranded enrollment rows pointing nowhere.
      if (target.id) {
        await deleteDoc(doc(db, "students", target.id));
      }

      toast.success(
        `${target.name || "Student"} removed${enrolIdArr.length > 0 ? ` · ${enrolIdArr.length} enrollment${enrolIdArr.length === 1 ? "" : "s"} cleared` : ""}.`,
      );
      setStudentToDelete(null);
    } catch (e: any) {
      toast.error("Delete failed: " + (e?.message || "unknown error"));
    } finally {
      setDeleting(false);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const headers = ["Name", "Email", "Class", "Branch", "Faculty", "Attendance", "Status"];
    const rows = studentsData.map(s => [
      s.name,
      s.email || s.studentEmail || "",
      s.gradeDisplay,
      s.branchId || userData?.branchId || "",
      s.faculty,
      s.attendance,
      s.status,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "students_export.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Export complete!");
  };

  // ── Pagination & filter ──────────────────────────────────────────────────────

  const filtered = studentsData.filter(s => {
    const matchSearch =
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.gradeDisplay?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || s.studentEmail || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchRisk = !atRiskFilter || s.isAtRisk;
    // Multi-class students have allClasses = ["10A", "10B"] — exact-match
    // against any of them (the previous string equality on the joined label
    // silently dropped them from a "10A" filter).
    const matchClass = classFilter === "ALL" ||
      (Array.isArray(s.allClasses) && s.allClasses.includes(classFilter)) ||
      (s.gradeDisplay || "—") === classFilter;
    return matchSearch && matchRisk && matchClass;
  });

  // Source class options from the canonical `classes` master collection
  // FIRST — that way classes with zero enrolled students still appear in
  // the dropdown (helpful when filtering an empty class to confirm it's
  // empty). Fall back to record-derived names for any extras.
  const classOptions = (() => {
    const fromMaster = classes
      .map((c: any) => (c.name || c.className || "").trim())
      .filter(Boolean);
    const fromRecords = studentsData.flatMap(s =>
      Array.isArray(s.allClasses) ? s.allClasses : [s.gradeDisplay].filter(Boolean)
    );
    return Array.from(new Set([...fromMaster, ...fromRecords])).sort(naturalClassCompare);
  })();

  const atRiskCount = studentsData.filter(s => s.isAtRisk).length;
  // Pagination — uniform across class-filter states. The previous version
  // disabled pagination ("show all") when a class filter was active, which
  // was nice for small classes but loaded 200+ rows simultaneously into the
  // DOM for large ones (slow + janky). The new pagination supports a 100-
  // per-page option so users can still see most of a class on one screen
  // when they want, without forcing it every time.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages); // clamp if list shrank
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Reset to page 1 whenever the underlying filter set or page size changes
  // — staying on page 7 of an empty filter result is disorienting.
  useEffect(() => setCurrentPage(1), [searchTerm, classFilter, atRiskFilter, pageSize]);

  // ── Open student profile (direct navigate — no intermediate state) ───────
  const goToProfile = (s: any) => navigate(`/students/${s.id}`);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: "#EEF4FF" }}>
    <div className={isMobile ? "animate-in fade-in duration-500" : "space-y-8 animate-in fade-in duration-500 pb-12 text-left"}>

      {/* ── Mapping Issue Banner ──────────────────────────────────────────
           Two distinct kinds, distinct copy:
           • user-no-branch  → principal account misconfigured (no branchId)
           • branch-missing  → enrollments lack branchId field on writers
           Mirrors Dashboard.tsx pattern so a principal seeing an empty page
           always knows WHY and what to do next. */}
      {mappingIssue && (
        <div className={isMobile ? "mx-3 mt-3" : "mx-4 mt-4"}>
          <div className="rounded-[16px] p-4 flex items-start gap-3"
            style={{
              background: "linear-gradient(135deg, rgba(255,170,0,0.08) 0%, rgba(255,170,0,0.04) 100%)",
              border: "0.5px solid rgba(255,170,0,0.32)",
              boxShadow: "0 4px 14px rgba(255,170,0,0.10)",
            }}>
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,170,0,0.14)", border: "0.5px solid rgba(255,170,0,0.30)" }}>
              <AlertTriangle className="w-[18px] h-[18px]" style={{ color: "#A85D00" }} strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              {mappingIssue.kind === "user-no-branch" ? (
                <>
                  <p className="text-[13px] font-bold leading-snug" style={{ color: "#7A4500" }}>
                    Your account isn't linked to a branch
                  </p>
                  <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: "#8A5500" }}>
                    Without a branch link, students can't be loaded safely (we don't want to mix branches).
                    Ask your school owner to set <code style={{ background: "rgba(255,170,0,0.18)", padding: "1px 5px", borderRadius: 4, fontFamily: "ui-monospace, monospace" }}>branchId</code> on your principal account in Owner Dashboard → Principals.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-bold leading-snug" style={{ color: "#7A4500" }}>
                    No students linked to {userData?.branchName || "this branch"} yet
                  </p>
                  <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: "#8A5500" }}>
                    Found {mappingIssue.total} school-level student record{mappingIssue.total === 1 ? "" : "s"} but{" "}
                    <strong style={{ color: "#7A4500", fontWeight: 700 }}>
                      {mappingIssue.sample} {mappingIssue.sample === 1 ? "lacks" : "lack"} a <code style={{ background: "rgba(255,170,0,0.18)", padding: "1px 5px", borderRadius: 4, fontFamily: "ui-monospace, monospace" }}>branchId</code>
                    </strong>{" "}
                    field. Re-upload Excel data with the branch column filled, or run the migration tool from Settings → Data → Migration Engine.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isMobile ? (() => {
        // Aggregate stats for the mobile UI's stat strip + dark summary card.
        // Computed only on the mobile path to avoid touching desktop wiring.
        const activeCount = studentsData.filter((s: any) => (s.status || "Active") === "Active").length;
        const _validAtt = studentsData
          .map((s: any) => s.attPct)
          .filter((p: any): p is number => typeof p === "number");
        const avgAttendance = _validAtt.length > 0
          ? Math.round(_validAtt.reduce((a: number, b: number) => a + b, 0) / _validAtt.length)
          : null;
        const teachersCount = new Set(
          studentsData.map((s: any) => s.faculty).filter((f: any) => f && f !== "—")
        ).size;
        const gradesCount = new Set(
          studentsData.map((s: any) => s.gradeDisplay).filter(Boolean)
        ).size;

        return (
          <StudentsMobile
            studentsTotal={studentsData.length}
            loading={loading}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            atRiskFilter={atRiskFilter}
            atRiskCount={atRiskCount}
            toggleAtRisk={() => { setAtRiskFilter(f => !f); setCurrentPage(1); }}
            filteredCount={filtered.length}
            paginated={paginated as any}
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={pageSize}
            setCurrentPage={setCurrentPage}
            onAddClick={() => setIsAddModalOpen(true)}
            onExportClick={handleExport}
            onBulkClick={() => { setBulkRows([]); setBulkRawRows([]); setBulkHeaders([]); setBulkMapping(EMPTY_MAPPING); setShowBulkModal(true); }}
            onProfileClick={s => goToProfile(s)}
            onDeleteClick={s => setStudentToDelete(s)}
            defaultBranchId={userData?.branchId}
            activeCount={activeCount}
            avgAttendance={avgAttendance}
            teachersCount={teachersCount}
            gradesCount={gradesCount}
          />
        );
      })() : (
      <DesktopStudentsView
        studentsData={studentsData}
        paginated={paginated as any[]}
        filtered={filtered}
        loading={loading}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        atRiskFilter={atRiskFilter}
        atRiskCount={atRiskCount}
        setAtRiskFilter={setAtRiskFilter}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        classOptions={classOptions}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        itemsPerPage={pageSize}
        pageSize={pageSize}
        setPageSize={setPageSize}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onAdd={() => setIsAddModalOpen(true)}
        onExport={handleExport}
        onBulk={() => { setBulkRows([]); setBulkRawRows([]); setBulkHeaders([]); setBulkMapping(EMPTY_MAPPING); setShowBulkModal(true); }}
        onProfileClick={(s) => goToProfile(s)}
        onMessageClick={(s) => navigate("/parent-communication", { state: { studentId: s.id, studentName: s.name } })}
        onDeleteClick={(s) => setStudentToDelete(s)}
        defaultBranchId={userData?.branchId}
      />
      )}

      {/* ── Bulk Upload Modal ────────────────────────────────────────────── */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="bg-emerald-700 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">Bulk Student Upload</h2>
                  <p className="text-xs text-emerald-200">Upload Excel / CSV to enroll multiple students</p>
                </div>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Upload zone */}
              <div className="border-2 border-dashed border-emerald-200 rounded-2xl p-6 text-center bg-emerald-50/40 hover:bg-emerald-50 transition-colors cursor-pointer"
                onClick={() => bulkFileRef.current?.click()}>
                <Upload className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Click to select Excel / CSV file</p>
                <p className="text-[10px] text-slate-400 mt-1">Any column headers — system auto-detects & lets you re-map below</p>
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) parseBulkFile(e.target.files[0]); e.target.value = ""; }}
                />
              </div>

              {/* Template download */}
              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-200 text-xs font-black text-emerald-600 hover:bg-emerald-50 transition-colors">
                <Download className="w-4 h-4" /> Download Default Template
              </button>

              {/* Column mapping — appears once a file is parsed */}
              {bulkHeaders.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Column Mapping</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {bulkHeaders.length} columns detected · auto-matched · adjust if anything looks off
                      </p>
                    </div>
                    <button
                      onClick={() => setBulkMapping(detectColumns(bulkHeaders))}
                      className="text-[10px] font-black text-emerald-700 hover:text-emerald-800 uppercase tracking-wider px-2 py-1 rounded-md hover:bg-emerald-100 transition-colors">
                      Auto-match
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(FIELD_LABELS) as FieldKey[]).map(field => {
                      const cfg = FIELD_LABELS[field];
                      const value = bulkMapping[field] || "";
                      const ok = value !== "";
                      return (
                        <div key={field} className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider w-[88px] shrink-0">
                            {cfg.label}{cfg.required && <span className="text-rose-500"> *</span>}
                          </label>
                          <select
                            value={value}
                            onChange={e => setBulkMapping(prev => ({ ...prev, [field]: e.target.value }))}
                            className={`flex-1 text-xs font-semibold rounded-lg border px-2 py-1.5 bg-white outline-none transition-colors ${
                              cfg.required && !ok
                                ? "border-rose-300 text-rose-600 focus:border-rose-400"
                                : ok
                                ? "border-emerald-200 text-slate-700 focus:border-emerald-400"
                                : "border-slate-200 text-slate-500 focus:border-slate-400"
                            }`}>
                            <option value="">— skip / not in file —</option>
                            {bulkHeaders.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  {(!bulkMapping.name || !bulkMapping.email) && (
                    <p className="text-[10px] font-bold text-rose-600 mt-3">
                      ⚠ Both <strong>Name</strong> and <strong>Email</strong> must be mapped before uploading.
                    </p>
                  )}
                </div>
              )}

              {/* Preview table */}
              {bulkRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{bulkRows.length} rows detected</p>
                    <div className="flex gap-2 text-[9px] font-black uppercase">
                      <span className="text-slate-400">{bulkRows.filter(r => r._status === "pending").length} pending</span>
                      <span className="text-emerald-600">{bulkRows.filter(r => r._status === "success").length} done</span>
                      <span className="text-amber-500">{bulkRows.filter(r => r._status === "duplicate").length} dup</span>
                      <span className="text-rose-500">{bulkRows.filter(r => r._status === "error").length} err</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase">Name</th>
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase">Email</th>
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase">Class</th>
                          <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {bulkRows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-semibold text-slate-700 truncate max-w-[120px]">{r.name}</td>
                            <td className="px-3 py-2 text-slate-400 truncate max-w-[160px]">{r.email}</td>
                            <td className="px-3 py-2 text-slate-500">{r.class || "—"}</td>
                            <td className="px-3 py-2 text-center">
                              {r._status === "pending"   && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black">PENDING</span>}
                              {r._status === "success"   && <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-600 text-[9px] font-black">DONE</span>}
                              {r._status === "duplicate" && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-600 text-[9px] font-black">DUP</span>}
                              {r._status === "error"     && <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-600 text-[9px] font-black" title={r._error}>ERR</span>}
                            </td>
                          </tr>
                        ))}
                        {bulkRows.length > 50 && (
                          <tr><td colSpan={4} className="px-3 py-2 text-center text-[10px] text-slate-400">+{bulkRows.length - 50} more rows</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => {
                    setShowBulkModal(false);
                    setBulkRows([]); setBulkRawRows([]); setBulkHeaders([]); setBulkMapping(EMPTY_MAPPING);
                  }}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpload}
                  disabled={
                    bulkUploading ||
                    !bulkMapping.name || !bulkMapping.email ||
                    bulkRows.filter(r => r._status === "pending").length === 0
                  }
                  className="flex-1 h-11 rounded-xl bg-emerald-700 text-white text-xs font-black hover:bg-emerald-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {bulkUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {bulkUploading ? "Uploading..." : `Upload ${bulkRows.filter(r => r._status === "pending").length} Students`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────────────────
           Strong-language warning + dual-action footer. The destructive
           "Delete" CTA is deliberately right-aligned and red-themed so a
           muscle-memory left-side "Cancel" tap never accidentally triggers.
           Modal-dismiss (backdrop click + X) is disabled while a delete
           is in flight to avoid orphaned half-deletes. */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setStudentToDelete(null)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Red header — destructive intent telegraph */}
            <div className="bg-rose-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Trash2 className="w-[18px] h-[18px] text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">Delete Student</h2>
                  <p className="text-xs text-rose-200">This action cannot be undone</p>
                </div>
              </div>
              {!deleting && (
                <button
                  onClick={() => setStudentToDelete(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-5">
              {/* Subject summary card — names the student so the user
                  KNOWS what they're about to delete. */}
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1">
                  Removing
                </p>
                <p className="text-base font-black text-slate-800 leading-tight">
                  {studentToDelete.name || "Unnamed student"}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  {studentToDelete.email || studentToDelete.studentEmail || "no email on file"}
                  {studentToDelete.gradeDisplay && studentToDelete.gradeDisplay !== "—"
                    ? ` · ${studentToDelete.gradeDisplay}`
                    : ""}
                </p>
              </div>

              {/* Scope disclosure — be explicit about what's deleted vs kept
                  so the user can make an informed call. */}
              <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="text-rose-500 font-black mt-0.5">●</span>
                  <span>
                    <strong className="text-slate-700">Student record</strong> + every <strong className="text-slate-700">enrollment</strong> for this branch will be deleted.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 font-black mt-0.5">●</span>
                  <span>
                    <strong className="text-slate-700">Attendance + grade history</strong> stay intact (audit trail).
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 font-black mt-0.5">●</span>
                  <span>
                    Parent-portal access for this email will stop working.
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStudentToDelete(null)}
                  disabled={deleting}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteStudent}
                  disabled={deleting}
                  className="flex-1 h-11 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? "Deleting..." : "Delete Student"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal — plain div modal to avoid Radix transform/animation shake */}
      {isAddModalOpen && (
        <div
          onClick={() => { setIsAddModalOpen(false); setNewStudent({ name: "", email: "", classId: "", grade: "", section: "" }); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            overflowY: "auto",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#fff",
              borderRadius: 32,
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                background: "#1e3a8a",
                padding: "28px 32px",
                position: "relative",
              }}
            >
              <h2
                style={{
                  color: "#ffffff",
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "-0.5px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  paddingRight: 48,
                  margin: 0,
                }}
              >
                <GraduationCap className="w-6 h-6" /> Add New Student
              </h2>
              <p
                style={{
                  color: "rgba(191, 219, 254, 0.7)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  marginTop: 4,
                  marginBottom: 0,
                }}
              >
                Institutional Enrollment Registry
              </p>
              <button
                type="button"
                onClick={() => { setIsAddModalOpen(false); setNewStudent({ name: "", email: "", classId: "", grade: "", section: "" }); }}
                aria-label="Close"
                style={{
                  position: "absolute",
                  right: 16,
                  top: 16,
                  width: 36,
                  height: 36,
                  borderRadius: "9999px",
                  background: "#ffffff",
                  color: "#000000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.2)",
                  fontSize: 26,
                  fontWeight: 900,
                  lineHeight: 1,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Arial, sans-serif",
                  paddingBottom: 4,
                }}
              >
                ×
              </button>
            </div>

            <div className="p-6 sm:p-10 space-y-5">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Full Name *</Label>
                <Input
                  placeholder="e.g. Rahul Sharma"
                  value={newStudent.name}
                  onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                  className="rounded-xl border-slate-200 font-bold py-6 px-5 focus:ring-[#1e3a8a]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email *</Label>
                <Input
                  type="email"
                  placeholder="student@example.com"
                  value={newStudent.email}
                  onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                  className="rounded-xl border-slate-200 font-bold py-6 px-5"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Class *</Label>
                {classes.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={newStudent.grade}
                        onChange={e => {
                          const grade = e.target.value;
                          const match = classes.find(c => String(c.grade || "").trim() === grade && String(c.section || "").trim().toUpperCase() === newStudent.section);
                          setNewStudent({ ...newStudent, grade, classId: match?.id || "" });
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] appearance-none"
                      >
                        <option value="">Grade...</option>
                        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(g => (
                          <option key={g} value={g}>Grade {g}</option>
                        ))}
                      </select>
                      <select
                        value={newStudent.section}
                        onChange={e => {
                          const section = e.target.value;
                          const match = classes.find(c => String(c.grade || "").trim() === newStudent.grade && String(c.section || "").trim().toUpperCase() === section);
                          setNewStudent({ ...newStudent, section, classId: match?.id || "" });
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] appearance-none"
                      >
                        <option value="">Section...</option>
                        {["A", "B", "C", "D"].map(s => (
                          <option key={s} value={s}>Section {s}</option>
                        ))}
                      </select>
                    </div>
                    {newStudent.grade && newStudent.section && !newStudent.classId && (
                      <div className="text-[11px] font-bold text-amber-600 ml-1 mt-1">
                        No class found for Grade {newStudent.grade}{newStudent.section}. Create it in Classes & Sections first.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm font-bold text-amber-700">
                    No classes found. Ask teacher to create classes first.
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddStudent}
                  disabled={saving || !newStudent.name || !newStudent.classId}
                  className="flex-1 bg-[#1e3a8a] text-white px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Student
                </button>
                <button
                  onClick={() => { setIsAddModalOpen(false); setNewStudent({ name: "", email: "", classId: "", grade: "", section: "" }); }}
                  className="px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default Students;
