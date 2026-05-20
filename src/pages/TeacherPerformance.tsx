import { useState, useEffect, useMemo } from "react";
import {
  GraduationCap, TrendingUp, TrendingDown, Minus,
  BarChart3, ChevronRight, Loader2,
  Users, Star, AlertTriangle, Sparkles, Search,
  MessageSquare, ArrowRight,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import TeacherProfile from "@/components/TeacherProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { pctOfDoc } from "@/lib/scoreUtils";

// ── helpers ──────────────────────────────────────────────────────────────────
// Memory: bug_pattern_score_zero_no_data — every tier-classifier on this
// page funnels through `classifyScore()` (defined below), so the stat-card
// filter, row badge, and row color can never drift apart.

// Robust score parser — uses shared `pctOfDoc` which returns null on missing
// data (was: a local impl that returned 0 → fed false low scores into avgs
// and biased school average up after `filter(n>0)` dropped them entirely;
// memory: bug_pattern_score_zero_no_data).
const getScoreOrNull = (r: any): number | null => pctOfDoc(r);

// Robust initials — "Aamir Khan" → "AK", "Aamir" → "A", "" → "??". Was:
// `name.substring(0, 2)` which produced "AA" for single-name teachers.
const safeInitials = (name: string | null | undefined): string => {
  const parts = (name || "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v?.seconds) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// Canonical writer-timestamp resolution for any doc on this page. Mirrors
// the filterByTime field drift across collections — tests/assignments use
// createdAt; parent_notes uses createdAt; scores use a mix of
// timestamp/uploadedAt/date; some legacy docs only have updatedAt. Memory:
// bug_pattern_filterbytime_field_drift. The fingerprint dedup AND the
// activity-recency check both funnel through this — was: each derived its
// own field-priority order and could drop ~10% of edge-case docs apart.
const writerTs = (d: any): Date | null =>
  toDate(d?.timestamp || d?.createdAt || d?.date || d?.uploadedAt || d?.updatedAt);

const lastActivityMs = (d: any): number => writerTs(d)?.getTime() ?? 0;

// "YYYY-MM-DD" key for fingerprint dedup — same field priority as writerTs.
const tsDateKey = (d: any): string => {
  const ts = writerTs(d);
  if (!ts) return "";
  const yyyy = ts.getFullYear();
  const mm   = String(ts.getMonth() + 1).padStart(2, "0");
  const dd   = String(ts.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// ── tier classification (shared mobile + desktop) ───────────────────────────
// Single source of truth so the same school renders the same tier label
// regardless of screen size (memory: bug_pattern_score_zero_no_data — same
// failure mode applies cross-viewport when two tier-ladders drift).
type SchoolAvgTier = {
  label: string;
  // mobile palette (translucent on dark gradient bg)
  bg: string; border: string; color: string;
  // desktop palette (translucent on dark gradient bg)
  dBg: string; dBdr: string; dC: string;
  // accent color for plain text on white surfaces
  accent: string;
  // sub-text color for stat-card "sub" row
  subColor: string;
};
const TIER_NO_DATA:    SchoolAvgTier = { label: "No Data",         bg: "rgba(153,170,204,.18)", border: "rgba(153,170,204,.32)", color: "#CCDDEE", dBg: "rgba(153,170,204,0.20)", dBdr: "rgba(153,170,204,0.36)", dC: "#CCDDEE", accent: "#99AACC", subColor: "#99AACC" };
const TIER_EXCELLENT:  SchoolAvgTier = { label: "Excellent",       bg: "rgba(0,200,83,.20)",    border: "rgba(0,200,83,.35)",    color: "#66EE88", dBg: "rgba(0,200,83,0.22)",    dBdr: "rgba(0,200,83,0.4)",     dC: "#66EE88", accent: "#00C853", subColor: "#007830" };
const TIER_STRONG:     SchoolAvgTier = { label: "Strong",          bg: "rgba(0,85,255,.20)",    border: "rgba(0,85,255,.35)",    color: "#99BBFF", dBg: "rgba(0,85,255,0.22)",    dBdr: "rgba(0,85,255,0.4)",     dC: "#99BBFF", accent: "#0055FF", subColor: "#0055FF" };
const TIER_AVERAGE:    SchoolAvgTier = { label: "Average",         bg: "rgba(255,136,0,.20)",   border: "rgba(255,136,0,.35)",   color: "#FFCC44", dBg: "rgba(255,170,0,0.22)",   dBdr: "rgba(255,170,0,0.4)",    dC: "#FFDD88", accent: "#FF8800", subColor: "#884400" };
const TIER_WEAK:       SchoolAvgTier = { label: "Needs Attention", bg: "rgba(255,51,85,.20)",   border: "rgba(255,51,85,.35)",   color: "#FF99AA", dBg: "rgba(255,51,85,0.22)",   dBdr: "rgba(255,51,85,0.4)",    dC: "#FF99AA", accent: "#FF3355", subColor: "#FF3355" };

const getSchoolAvgTier = (avg: number | null): SchoolAvgTier => {
  if (avg == null) return TIER_NO_DATA;
  if (avg >= 85) return TIER_EXCELLENT;
  if (avg >= 75) return TIER_STRONG;
  if (avg >= 60) return TIER_AVERAGE;
  return TIER_WEAK;
};

// ── per-teacher row score classification — keeps grade letter, row color,
// and badge color in lockstep with the same A/B/C/D ladder. Was: 3 different
// threshold tables drove letter, color, and badge — A 60% teacher could
// render as a "C" letter with a "B" (blue) score color.
type ScoreClass = {
  letter: "A" | "B" | "C" | "D" | "—";
  // row text color
  color: string;
  // badge bg / border / text
  badgeBg: string; badgeBorder: string; badgeColor: string;
  // bar gradient (90deg)
  barGrad: string;
  // avatar gradient (135deg)
  avatarGrad: string;
  // mobile sidebar accent gradient (180deg)
  accentGrad: string;
  // mobile avatar shadow
  avatarShadow: string;
};
const SC_NO_DATA: ScoreClass = {
  letter: "—",
  color: "#99AACC",
  badgeBg: "rgba(153,170,204,0.10)", badgeBorder: "rgba(153,170,204,0.22)", badgeColor: "#5070B0",
  barGrad: "linear-gradient(90deg, #FF8800, #FFCC22)",
  avatarGrad: "linear-gradient(135deg, #FF8800, #FFCC22)",
  accentGrad: "linear-gradient(180deg, #FF8800, #FFCC22)",
  avatarShadow: "0 4px 14px rgba(255,136,0,.28)",
};
const SC_A: ScoreClass = {
  letter: "A",
  color: "#00C853",
  badgeBg: "rgba(0,200,83,0.10)", badgeBorder: "rgba(0,200,83,0.22)", badgeColor: "#007830",
  barGrad: "linear-gradient(90deg, #00C853, #66EE88)",
  avatarGrad: "linear-gradient(135deg, #00C853, #22EE66)",
  accentGrad: "linear-gradient(180deg, #00C853, #66EE88)",
  avatarShadow: "0 4px 14px rgba(0,200,83,.28)",
};
const SC_B: ScoreClass = {
  letter: "B",
  color: "#0055FF",
  badgeBg: "rgba(0,85,255,0.10)", badgeBorder: "rgba(0,85,255,0.22)", badgeColor: "#0055FF",
  barGrad: "linear-gradient(90deg, #0055FF, #4499FF)",
  avatarGrad: "linear-gradient(135deg, #0055FF, #2277FF)",
  accentGrad: "linear-gradient(180deg, #0055FF, #4499FF)",
  avatarShadow: "0 4px 14px rgba(0,85,255,.28)",
};
const SC_C: ScoreClass = {
  letter: "C",
  color: "#FF8800",
  badgeBg: "rgba(255,170,0,0.10)", badgeBorder: "rgba(255,170,0,0.22)", badgeColor: "#884400",
  barGrad: "linear-gradient(90deg, #FF8800, #FFCC22)",
  avatarGrad: "linear-gradient(135deg, #FF8800, #FFCC22)",
  accentGrad: "linear-gradient(180deg, #FF8800, #FFCC22)",
  avatarShadow: "0 4px 14px rgba(255,136,0,.28)",
};
const SC_D: ScoreClass = {
  letter: "D",
  color: "#FF3355",
  badgeBg: "rgba(255,51,85,0.10)", badgeBorder: "rgba(255,51,85,0.22)", badgeColor: "#FF3355",
  barGrad: "linear-gradient(90deg, #FF3355, #FF88AA)",
  avatarGrad: "linear-gradient(135deg, #FF3355, #FF6688)",
  accentGrad: "linear-gradient(180deg, #FF3355, #FF88AA)",
  avatarShadow: "0 4px 14px rgba(255,51,85,.28)",
};

const classifyScore = (score: number | null): ScoreClass => {
  if (score == null) return SC_NO_DATA;
  if (score >= 85) return SC_A;
  if (score >= 75) return SC_B;
  if (score >= 60) return SC_C;
  return SC_D;
};

// 14d activity window for "Active" pill (memory: bug_pattern_fabricated_fallback
// — was: every teacher rendered "Active" unconditionally regardless of whether
// they'd touched the system in months).
const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// TeacherStat is intentionally narrow — only the fields rendered on this
// page. <TeacherProfile /> receives `raw` (the original teacher doc) and
// recomputes its own deeper aggregations; we don't pre-compute drawer-only
// fields here. Earlier versions stored topSubject/weakSubject/monthlyScores/
// subjectBreakdown/testsCreated/etc. but never displayed them — pure waste
// on every snapshot tick.
interface TeacherStat {
  id: string;
  name: string;
  raw: any;               // original teacher doc for TeacherProfile component
  subjects: string[];
  classes: string[];      // human-readable class names
  classIds: string[];     // underlying ids for joins
  avgScore: number | null;        // lifetime avg (headline metric)
  currAvgScore: number | null;    // last-30d avg (used for trend only)
  prevAvgScore: number | null;    // 30-60d avg (used for trend only)
  studentCount: number;
  classCount: number;
  vsSchoolAvg: number | null;
  // real activity flag — true if the teacher created/wrote anything in the
  // last 14 days (memory: bug_pattern_fabricated_fallback).
  isActive: boolean;
}

const TeacherPerformance = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Per-collection live state. Was: single onSnapshot(teachers) + Promise.all
  // of getDocs for every other collection — meant the page only refreshed when
  // a teacher doc changed, so newly-uploaded scores / assignments / notes were
  // invisible until reload. Now every read is a live listener; React derives
  // teachers + schoolAvg from these via useMemo.
  const [teacherDocs,   setTeacherDocs]   = useState<any[]>([]);
  const [scoreDocs,     setScoreDocs]     = useState<any[]>([]);
  const [resultDocs,    setResultDocs]    = useState<any[]>([]);
  const [gradebookDocs, setGradebookDocs] = useState<any[]>([]);
  const [taDocs,        setTaDocs]        = useState<any[]>([]);   // teaching_assignments
  const [classDocs,     setClassDocs]     = useState<any[]>([]);
  const [testDocs,      setTestDocs]      = useState<any[]>([]);
  const [asgnDocs,      setAsgnDocs]      = useState<any[]>([]);   // assignments
  const [lessonDocs,    setLessonDocs]    = useState<any[]>([]);
  const [noteDocs,      setNoteDocs]      = useState<any[]>([]);

  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<TeacherStat | null>(null);
  const [search,     setSearch]     = useState("");
  // A failure on ANY of the 11 listeners is recorded here so the UI can
  // surface a mappingIssue banner with a Retry button. We hold the last
  // error rather than the full list — a single visible signal is enough;
  // DevTools console has the full per-collection breakdown.
  const [loadError,  setLoadError]  = useState<{ collection: string; code?: string; message?: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);
    setLoadError(null);

    const schoolId = userData.schoolId;
    const branchId = userData?.branchId || "";
    // schoolId-only server-side; branchId in-memory (memory:
    // branchid_inference_lag — server-side branchId silently drops freshly
    // written records during the enforceBranchId trigger backfill window).
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    // `cancelled` guards against late updates after a deps-change tear-down
    // (e.g. principal flips branchId). Per-collection listeners are already
    // unsubscribed in cleanup, but a snapshot in flight on the network when
    // unsubscribe runs can still call its callback once. The flag drops
    // those stragglers so we never write stale-branch data into state.
    let cancelled = false;
    const setIf = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
      if (!cancelled) setter(value);
    };

    // Two listener flavors:
    //
    //   subEntity — applies the inBranch filter. Used for *resolution*
    //     entities (teachers, classes, teaching_assignments) so we don't
    //     show teachers / classes from other branches.
    //
    //   subEvent — schoolId-only, NO branch filter. Used for score and
    //     activity event streams (test_scores, results, gradebook_scores,
    //     tests, assignments, lessonPlans, parent_notes). This matches
    //     `TeacherProfile.tsx`'s strategy and fixes a silent data-drop:
    //     a score's branchId reflects whichever branch context the writer
    //     was in, which can drift across migrations / multi-branch teachers.
    //     Once a teacher is in the resolution scope, ALL their scores
    //     should attribute regardless of where the score was written from.
    //     Teacher attribution (teacherId / teacherEmail / classId match)
    //     is the real isolation — branch doesn't add useful filtering here.
    const subEntity = (col: string, setter: React.Dispatch<React.SetStateAction<any[]>>) =>
      onSnapshot(
        query(collection(db, col), where("schoolId", "==", schoolId)),
        (snap) => setIf(
          setter,
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter(inBranch),
        ),
        (err: any) => {
          console.warn(`[TeacherPerformance] ${col} listener error:`, err);
          if (!cancelled) setLoadError({ collection: col, code: err?.code, message: err?.message });
        },
      );

    const subEvent = (col: string, setter: React.Dispatch<React.SetStateAction<any[]>>) =>
      onSnapshot(
        query(collection(db, col), where("schoolId", "==", schoolId)),
        (snap) => setIf(
          setter,
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
        ),
        (err: any) => {
          console.warn(`[TeacherPerformance] ${col} listener error:`, err);
          if (!cancelled) setLoadError({ collection: col, code: err?.code, message: err?.message });
        },
      );

    // Teachers listener doubles as the page-loading signal — first snapshot
    // unlocks the UI even if other collections are still streaming.
    let teachersInitialised = false;
    const teacherUnsub = onSnapshot(
      query(collection(db, "teachers"), where("schoolId", "==", schoolId)),
      (snap) => {
        setIf(
          setTeacherDocs,
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter(inBranch),
        );
        if (!cancelled && !teachersInitialised) { teachersInitialised = true; setLoading(false); }
      },
      (err: any) => {
        console.warn("[TeacherPerformance] teachers listener error:", err);
        if (cancelled) return;
        setLoadError({ collection: "teachers", code: err?.code, message: err?.message });
        if (!teachersInitialised) { teachersInitialised = true; setLoading(false); }
      },
    );

    const unsubs: Array<() => void> = [
      teacherUnsub,
      // Score event streams — schoolId-only, no branch filter (see above).
      subEvent("test_scores",      setScoreDocs),
      subEvent("results",          setResultDocs),
      subEvent("gradebook_scores", setGradebookDocs),
      // Teacher activity — same: a teacher's tests / assignments / lessons /
      // notes count regardless of which branch they were authored in.
      subEvent("tests",            setTestDocs),
      subEvent("assignments",      setAsgnDocs),
      subEvent("lessonPlans",      setLessonDocs),
      subEvent("parent_notes",     setNoteDocs),
      // Resolution entities — branch-filtered so other branches' records
      // don't pollute the page.
      subEntity("teaching_assignments", setTaDocs),
      subEntity("classes",              setClassDocs),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [userData?.schoolId, userData?.branchId, refreshKey]);

  const retry = () => setRefreshKey((k) => k + 1);

  // ── Derive teachers + schoolAvg from collection state ───────────────────
  // schoolAvg is `number | null` so the UI can distinguish "school average is
  // 0%" (catastrophic) from "no scores uploaded yet" (no-data) — memory:
  // bug_pattern_score_zero_no_data.
  const { teachers, schoolAvg } = useMemo<{ teachers: TeacherStat[]; schoolAvg: number | null }>(() => {
    // classId → name lookup
    const classNameById = new Map<string, string>();
    classDocs.forEach((c: any) => {
      const label = c.name || [c.grade, c.section].filter(Boolean).join(" ") || c.className;
      if (label) classNameById.set(c.id, label);
    });

    const nowMs          = Date.now();
    const cutoff30Ms     = nowMs - 30 * 24 * 60 * 60 * 1000;
    const cutoff60Ms     = nowMs - 60 * 24 * 60 * 60 * 1000;
    const activeCutoffMs = nowMs - ACTIVE_WINDOW_MS;

    // Multi-source merge: test_scores + results + gradebook_scores.
    // Content-fingerprint dedup (student|subject|date|pct rounded to 0.1%)
    // collapses the same exam mirrored across collections. The fingerprint
    // date AND the activity timestamp both go through `tsDateKey` /
    // `lastActivityMs`, so a doc with only `updatedAt` (legacy) is never
    // treated as "no date" by the fingerprint while still recognised by the
    // recency window — memory: bug_pattern_filterbytime_field_drift.
    //
    // Sparse-key safety: if a doc has no studentId/email AND no date AND
    // no subject, the fingerprint collapses to just "||X.X" — every such
    // doc would map to the same key and 19 of 20 valid scores would be
    // dropped as "duplicates". When key is too sparse to distinguish
    // legitimate distinct rows, we keep the doc unconditionally.
    const fpSeen = new Set<string>();
    const allScoreRows: { row: any; pct: number; ts: number }[] = [];
    [...scoreDocs, ...resultDocs, ...gradebookDocs].forEach((r) => {
      const p = getScoreOrNull(r);
      if (p === null) return;
      const subjKey = String(r.subject ?? r.subjectName ?? "").toLowerCase();
      const dateK   = tsDateKey(r);
      const sKey    = String(r.studentId || (r.studentEmail || "").toLowerCase() || "").trim();
      const ts      = lastActivityMs(r);
      // Need at least 2 of {student, date, subject} to dedup safely.
      const keyParts = [sKey, dateK, subjKey].filter(Boolean).length;
      if (keyParts < 2) {
        allScoreRows.push({ row: r, pct: p, ts });
        return;
      }
      const fp = `${sKey}|${subjKey}|${dateK}|${Math.round(p * 10)}`;
      if (fpSeen.has(fp)) return;
      fpSeen.add(fp);
      allScoreRows.push({ row: r, pct: p, ts });
    });

    // School-wide average — null when there are no scores at all (so the UI
    // can distinguish "no data" from "actual 0%"). Memory:
    // bug_pattern_score_zero_no_data.
    const overallAvg = allScoreRows.length
      ? Math.round(allScoreRows.reduce((a, b) => a + b.pct, 0) / allScoreRows.length)
      : null;

    const stats: TeacherStat[] = teacherDocs.map((t: any) => {
      // Classes & subjects from teaching_assignments + fallback to teacher
      // doc. Email match normalised to lowercase — case-sensitive match
      // missed `John@x.com` vs `john@x.com`.
      const tEmail = String(t.email || "").toLowerCase();
      const tAssigns = taDocs.filter((a: any) =>
        a.teacherId === t.id ||
        (tEmail && String(a.teacherEmail || "").toLowerCase() === tEmail),
      );

      const subjectsSet = new Set<string>();
      tAssigns.forEach((a: any) => a.subject && subjectsSet.add(a.subject));
      if (t.subject) subjectsSet.add(t.subject);
      if (Array.isArray(t.subjects)) t.subjects.forEach((s: string) => s && subjectsSet.add(s));
      const subjects = [...subjectsSet];
      const teacherSubjectKeys = new Set(subjects.map((s) => s.toLowerCase()));

      const classIdsSet = new Set<string>();
      tAssigns.forEach((a: any) => a.classId && classIdsSet.add(a.classId));
      // Also pull classes where teacherId / teacherEmail matches directly.
      // Email fallback handles legacy class docs that store the teacher as
      // an email instead of the canonical doc id.
      classDocs.forEach((c: any) => {
        if (c.teacherId === t.id) { classIdsSet.add(c.id); return; }
        const cEmail = String(c.teacherEmail || "").toLowerCase();
        if (tEmail && cEmail && cEmail === tEmail) classIdsSet.add(c.id);
      });
      const classIds = [...classIdsSet];

      // Resolve to human-readable names — prefer classes collection, then teaching_assignments className
      const classes = classIds.map((cid) => {
        if (classNameById.has(cid)) return classNameById.get(cid)!;
        const ta = tAssigns.find((a: any) => a.classId === cid);
        return ta?.className || cid;
      });

      // Score attribution — three-tier match. Earlier version was too strict:
      // "if teacherId is set but != t.id → drop entirely" silently broke
      // attribution whenever the score writer stored teacherId in a different
      // format than `teachers/{doc_id}` (e.g. auth uid, email-as-id). Result
      // visible to the user: school avg shows 60% (raw rows summed) but
      // Top/Support stat cards both show 0 (no teacher attributed any rows).
      //
      //   1. teacherId match — most authoritative
      //   2. teacherEmail match — covers legacy/auth-uid-as-id writers
      //   3. classId fallback — bidirectional substring subject match defends
      //      against co-teaching attribution leak (Math/Mathematics drift too)
      const tScores = allScoreRows.filter(({ row: s }) => {
        if (s.teacherId && s.teacherId === t.id) return true;
        const sEmail = String(s.teacherEmail || "").toLowerCase();
        if (tEmail && sEmail && sEmail === tEmail) return true;
        if (!s.classId || !classIds.includes(s.classId)) return false;
        const sub = String(s.subject || s.subjectName || "").toLowerCase().trim();
        if (!sub) return true;                    // no subject → attribute by classId alone
        if (teacherSubjectKeys.size === 0) return true; // teacher has no subject metadata → can't filter
        // Bidirectional substring match — handles "Math" vs "Mathematics",
        // "English" vs "English Language", "Sci" vs "Science", etc.
        for (const key of teacherSubjectKeys) {
          if (key === sub || key.includes(sub) || sub.includes(key)) return true;
        }
        return false;
      });

      // Lifetime avg = headline metric.
      const avgScore = tScores.length
        ? Math.round(tScores.reduce((a, b) => a + b.pct, 0) / tScores.length)
        : null;

      // Trend = currAvg (last 30d) vs prevAvg (30-60d ago). Was: lifetime
      // avgScore − prev30-60d → apples-to-oranges (lifetime contains scores
      // BOTH inside and outside the prev window, so even a perfectly stable
      // teacher rendered fake +/- deltas).
      const currScores = tScores.filter(({ ts }) => ts && ts >= cutoff30Ms);
      const prevScores = tScores.filter(({ ts }) => ts && ts >= cutoff60Ms && ts < cutoff30Ms);
      const currAvg = currScores.length
        ? Math.round(currScores.reduce((a, b) => a + b.pct, 0) / currScores.length)
        : null;
      const prevAvg = prevScores.length
        ? Math.round(prevScores.reduce((a, b) => a + b.pct, 0) / prevScores.length)
        : null;

      const studentCount = new Set(
        tScores
          .map(({ row: s }) => String(s.studentId || (s.studentEmail || "").toLowerCase() || "").trim())
          .filter(Boolean),
      ).size;

      // Real "Active" signal — any scoring/test/assignment/lesson/note write
      // in the last 14 days. Memory: bug_pattern_fabricated_fallback — every
      // teacher used to render "Active" unconditionally regardless of whether
      // they'd touched the system in months. Reviews aren't included because
      // they're written BY parents, not BY the teacher. Dual-key (teacherId
      // OR teacherEmail) so writers that store auth uid / email as the
      // teacher reference don't silently flag everyone Inactive.
      const ownsActivity = (d: any): boolean => {
        if (d?.teacherId && d.teacherId === t.id) return true;
        const dEmail = String(d?.teacherEmail || "").toLowerCase();
        return !!(tEmail && dEmail && dEmail === tEmail);
      };
      const teacherActivityCandidates: number[] = [
        ...tScores.map((s) => s.ts || 0),
      ];
      for (const d of testDocs)   if (ownsActivity(d)) teacherActivityCandidates.push(lastActivityMs(d));
      for (const d of asgnDocs)   if (ownsActivity(d)) teacherActivityCandidates.push(lastActivityMs(d));
      for (const d of lessonDocs) if (ownsActivity(d)) teacherActivityCandidates.push(lastActivityMs(d));
      for (const d of noteDocs)   if (ownsActivity(d)) teacherActivityCandidates.push(lastActivityMs(d));
      const lastActiveTs = teacherActivityCandidates.length
        ? Math.max(0, ...teacherActivityCandidates)
        : 0;
      const isActive = lastActiveTs > 0 && lastActiveTs >= activeCutoffMs;

      return {
        id: t.id,
        // "Unnamed Teacher" placeholder so principal can SEE that the teacher
        // exists and fix the data. Was: filtered out by `t.name !== "Unknown"`
        // — silently hid teachers entirely.
        name: t.name || t.teacherName || "Unnamed Teacher",
        raw: t,
        subjects,
        classes,
        classIds,
        avgScore,
        currAvgScore: currAvg,
        prevAvgScore: prevAvg,
        studentCount,
        classCount: classes.length,
        // vsSchoolAvg is meaningless when school-wide avg is null/0 (no
        // scores anywhere). Was: a teacher with avg 85 in such a school
        // showed "+85% vs school" — bogus signal.
        vsSchoolAvg: (avgScore != null && overallAvg != null && overallAvg > 0) ? avgScore - overallAvg : null,
        isActive,
      };
    });

    return { teachers: stats, schoolAvg: overallAvg };
  }, [
    teacherDocs, scoreDocs, resultDocs, gradebookDocs,
    taDocs, classDocs,
    testDocs, asgnDocs, lessonDocs, noteDocs,
  ]);

  // useMemo so the filter doesn't recompute on every unrelated re-render —
  // search isn't a hot path but the loop runs across every teacher and their
  // subjects, so memoising avoids needless work when scrolling/clicking.
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return teachers;
    return teachers.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.subjects.some(s => s.toLowerCase().includes(q)),
    );
  }, [teachers, search]);

  // Trend = current 30d avg vs prior 30-60d avg. Both windows must have data
  // for the comparison to be meaningful — otherwise return null and let the
  // UI render "—".
  const trend = (t: TeacherStat) => {
    if (t.currAvgScore == null || t.prevAvgScore == null) return null;
    const delta = t.currAvgScore - t.prevAvgScore;
    if (delta > 2)  return { icon: TrendingUp,   color: "text-green-500", label: `+${delta}%` };
    if (delta < -2) return { icon: TrendingDown, color: "text-red-500",   label: `${delta}%` };
    return                 { icon: Minus,        color: "text-slate-400", label: "Stable" };
  };

  // Page-wide derived counts — single source of truth so mobile and desktop
  // strips render identical numbers (memory: bug_pattern_score_zero_no_data
  // — stat-card filter must equal row-badge classifier).
  const topPerformersCount = teachers.filter((t) => (t.avgScore ?? 0) >= 80).length;
  const needsSupportCount  = teachers.filter((t) => t.avgScore != null && t.avgScore < 60).length;

  // AI insight payload — derived once, rendered by both mobile and desktop
  // AI cards. Was: this logic lived inline inside the mobile-only render
  // block, so desktop principals saw no AI summary at all (P2-2).
  const aiInsight = useMemo(() => {
    const filteredList = filtered;
    const withData     = filteredList.filter((t) => t.avgScore != null);
    const withoutData  = filteredList.filter((t) => t.avgScore == null);
    const topT         = withData.length > 0
      ? [...withData].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))[0]
      : null;
    return {
      hasAny: filteredList.length > 0,
      hasScored: withData.length > 0,
      total: filteredList.length,
      topT,
      withoutData: withoutData.length,
    };
  }, [filtered]);

  // ── When a teacher is selected, render the full TeacherProfile page (same layout as existing profile)
  if (selected) {
    return (
      <div className="animate-in fade-in duration-200">
        <TeacherProfile teacher={selected.raw} onBack={() => setSelected(null)} />
      </div>
    );
  }

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const GREEN = "#00C853";
    const RED = "#FF3355";
    const GOLD = "#FFAA00";
    const T1 = "#001040";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const avgTier = getSchoolAvgTier(schoolAvg);
    const schoolAvgDisplay = schoolAvg == null ? "—" : `${schoolAvg}%`;
    const schoolAvgColor = avgTier.accent;

    const subjectTagStyle = (subject: string) => {
      const s = (subject || "").toLowerCase();
      if (s.includes("math")) return { bg: "rgba(255,136,0,.10)", color: "#884400", border: "0.5px solid rgba(255,136,0,.22)" };
      if (s.includes("english") || s.includes("lang")) return { bg: "rgba(0,85,255,.10)", color: B1, border: "0.5px solid rgba(0,85,255,.20)" };
      if (s.includes("sci") || s.includes("chem") || s.includes("phy") || s.includes("bio")) return { bg: "rgba(123,63,244,.10)", color: "#7B3FF4", border: "0.5px solid rgba(123,63,244,.22)" };
      if (s.includes("social") || s.includes("hist") || s.includes("geo")) return { bg: "rgba(255,170,0,.10)", color: "#884400", border: "0.5px solid rgba(255,170,0,.22)" };
      return { bg: "rgba(0,85,255,.10)", color: B1, border: "0.5px solid rgba(0,85,255,.20)" };
    };

    const avatarGradFor = (avg: number | null) => classifyScore(avg).avatarGrad;
    const accentFor     = (avg: number | null) => classifyScore(avg).accentGrad;
    const avShadowFor   = (avg: number | null) => classifyScore(avg).avatarShadow;

    return (
      <div
        style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          background: "#EEF4FF",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* PAGE HEAD */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3 }}>
              Teacher Performance
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5 }}>
              Impact analysis — same subject across teachers,<br />same teacher across classes
            </div>
          </div>
          <button
            onClick={() => {
              document.getElementById("mobile-tp-search")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              borderRadius: 14,
              background: "#fff",
              border: "0.5px solid rgba(0,85,255,.14)",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
              flexShrink: 0,
              marginTop: 4,
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 2 }}>
                School Avg
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: schoolAvgColor, letterSpacing: "-0.3px", lineHeight: 1 }}>
                {schoolAvgDisplay}
              </div>
            </div>
            <BarChart3 size={14} color={schoolAvgColor} strokeWidth={2.4} />
          </button>
        </div>

        {/* Listener-failure banner — surfaces permission-denied / network /
            FAILED_PRECONDITION errors with a Retry instead of silently
            rendering empty state. Pattern mirrors RisksAlerts mappingIssue. */}
        {loadError && (
          <div
            role="alert"
            style={{
              margin: "12px 20px 0",
              background: "rgba(255,170,0,.10)",
              border: "0.5px solid rgba(255,170,0,.32)",
              borderRadius: 14,
              padding: "11px 14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <AlertTriangle size={16} color="#FFAA00" strokeWidth={2.4} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#884400", marginBottom: 2 }}>
                Could not load all data
              </div>
              <div style={{ fontSize: 11, color: T3, lineHeight: 1.4 }}>
                {loadError.code === "permission-denied"
                  ? `Permission denied on ${loadError.collection} — check your role's read access.`
                  : `${loadError.collection}: ${loadError.message || "network error"}`}
              </div>
            </div>
            <button
              onClick={retry}
              style={{
                flexShrink: 0,
                background: "#fff",
                border: "0.5px solid rgba(255,170,0,.42)",
                borderRadius: 10,
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: 700,
                color: "#884400",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={28} color={B1} style={{ animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <>
            {/* HERO */}
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
                    <GraduationCap size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                      Avg Class Score
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1 }}>
                      {schoolAvgDisplay}
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
                    background: avgTier.bg,
                    border: `0.5px solid ${avgTier.border}`,
                    fontSize: 11,
                    fontWeight: 700,
                    color: avgTier.color,
                  }}
                >
                  <BarChart3 size={11} strokeWidth={2.5} />
                  {avgTier.label}
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
                  { v: teachers.length, l: "Teachers", c: "#fff" },
                  { v: topPerformersCount, l: "Top Perf.", c: "#66EE88" },
                  { v: needsSupportCount, l: "Needs Support", c: needsSupportCount > 0 ? "#FF8899" : "#fff" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "11px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.c, letterSpacing: "-0.4px", lineHeight: 1, marginBottom: 3 }}>
                      {s.v}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* STAT GRID */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
              {[
                {
                  label: "Total Teachers",
                  value: teachers.length,
                  sub: "Active faculty",
                  color: B1,
                  subColor: T4,
                  icon: <Users size={13} color={B1} strokeWidth={2.4} />,
                  bg: "rgba(0,85,255,.10)",
                  border: "rgba(0,85,255,.18)",
                  glow: "rgba(0,85,255,.10)",
                },
                {
                  label: "Avg Class Score",
                  value: schoolAvgDisplay,
                  sub: avgTier.label,
                  color: schoolAvgColor,
                  subColor: avgTier.subColor,
                  icon: <BarChart3 size={13} color={schoolAvgColor} strokeWidth={2.4} />,
                  bg: avgTier.bg,
                  border: avgTier.border,
                  glow: avgTier.bg,
                },
                {
                  label: "Top Performers",
                  value: topPerformersCount,
                  sub: topPerformersCount === 0 ? "No records" : topPerformersCount === 1 ? "1 standout" : `${topPerformersCount} standouts`,
                  color: topPerformersCount > 0 ? "#007830" : T3,
                  subColor: topPerformersCount > 0 ? "#007830" : T4,
                  icon: <Star size={13} color={GREEN} strokeWidth={2.4} />,
                  bg: "rgba(0,200,83,.10)",
                  border: "rgba(0,200,83,.22)",
                  glow: "rgba(0,200,83,.10)",
                },
                {
                  label: "Needs Support",
                  value: needsSupportCount,
                  sub: needsSupportCount === 0 ? "All clear" : needsSupportCount === 1 ? "1 teacher" : `${needsSupportCount} teachers`,
                  color: needsSupportCount > 0 ? RED : T3,
                  subColor: needsSupportCount > 0 ? RED : T4,
                  icon: <AlertTriangle size={13} color={RED} strokeWidth={2.4} />,
                  bg: "rgba(255,51,85,.10)",
                  border: "rgba(255,51,85,.22)",
                  glow: "rgba(255,51,85,.10)",
                },
              ].map((c, i) => (
                <div
                  key={i}
                  style={{
                    background: "#fff",
                    borderRadius: 20,
                    padding: 15,
                    boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                    border: "0.5px solid rgba(0,85,255,.10)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -18,
                      right: -14,
                      width: 65,
                      height: 65,
                      background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
                      borderRadius: "50%",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 13,
                      right: 13,
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      background: c.bg,
                      border: `0.5px solid ${c.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {c.icon}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T4, marginBottom: 9 }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1, marginBottom: 4, color: c.color }}>
                    {c.value}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: c.subColor }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* SEARCH */}
            <div style={{ margin: "12px 20px 0", position: "relative" }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
                <Search size={15} color="rgba(0,85,255,.42)" strokeWidth={2.2} />
              </div>
              <input
                id="mobile-tp-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by teacher or subject..."
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 42px",
                  background: "#fff",
                  borderRadius: 14,
                  border: "0.5px solid rgba(0,85,255,.12)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  color: T1,
                  fontWeight: 400,
                  outline: "none",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                }}
              />
            </div>

            {/* SECTION LABEL */}
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
              <span>Faculty Performance</span>
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
                {filtered.length} teacher{filtered.length === 1 ? "" : "s"}
              </span>
              <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
            </div>

            {/* TEACHER CARDS */}
            {filtered.length === 0 ? (
              <div
                style={{
                  margin: "12px 20px 0",
                  background: "#fff",
                  borderRadius: 22,
                  padding: "32px 20px",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <GraduationCap size={44} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
                <div style={{ fontSize: 14, fontWeight: 700, color: T1 }}>No teacher data found</div>
                <div style={{ fontSize: 11, color: T4, textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
                  Assign teachers to classes to see performance metrics.
                </div>
              </div>
            ) : (
              filtered.map((t) => {
                const hasScoreData = t.avgScore != null;
                const tr = trend(t);
                const sc = classifyScore(t.avgScore);
                const tLetter = sc.letter;
                const primarySubject = t.subjects[0] || "Teacher";
                const initText = safeInitials(t.name);

                const avgBarColor = sc.barGrad;
                const avgValColor = sc.color;

                let trendIconEl = <Minus size={12} color={T4} strokeWidth={2.4} />;
                let trendColor = T4;
                let trendLabel = "—";
                let trendBg = "#EEF4FF";
                let trendBorder = "rgba(153,170,204,.22)";
                if (tr) {
                  trendLabel = tr.label;
                  if (tr.label.startsWith("+")) {
                    trendColor = GREEN;
                    trendBg = "rgba(0,200,83,.10)";
                    trendBorder = "rgba(0,200,83,.22)";
                    trendIconEl = <TrendingUp size={12} color={GREEN} strokeWidth={2.4} />;
                  } else if (tr.label.startsWith("-")) {
                    trendColor = RED;
                    trendBg = "rgba(255,51,85,.10)";
                    trendBorder = "rgba(255,51,85,.22)";
                    trendIconEl = <TrendingDown size={12} color={RED} strokeWidth={2.4} />;
                  } else {
                    trendColor = T3;
                    trendBg = "rgba(153,170,204,.12)";
                    trendBorder = "rgba(153,170,204,.22)";
                    trendIconEl = <Minus size={12} color={T3} strokeWidth={2.4} />;
                  }
                }

                return (
                  <div
                    key={t.id}
                    style={{
                      margin: "12px 20px 0",
                      background: "#fff",
                      borderRadius: 24,
                      overflow: "hidden",
                      boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                      border: "0.5px solid rgba(0,85,255,.10)",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        background: accentFor(t.avgScore),
                      }}
                    />

                    {/* Card top */}
                    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "17px 18px 15px 22px", borderBottom: `0.5px solid ${SEP}` }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 15,
                          background: avatarGradFor(t.avgScore),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          fontWeight: 700,
                          color: "#fff",
                          flexShrink: 0,
                          boxShadow: avShadowFor(t.avgScore),
                        }}
                      >
                        {initText}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T1, letterSpacing: "-0.3px", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          {t.subjects.slice(0, 2).map((s, si) => {
                            const sst = subjectTagStyle(s);
                            return (
                              <span
                                key={si}
                                style={{
                                  padding: "4px 11px",
                                  borderRadius: 100,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: sst.bg,
                                  color: sst.color,
                                  border: sst.border,
                                }}
                              >
                                {s}
                              </span>
                            );
                          })}
                          {t.subjects.length > 2 && (
                            <span style={{ fontSize: 9, color: T4, fontWeight: 700 }}>+{t.subjects.length - 2}</span>
                          )}
                          {t.subjects.length === 0 && (
                            <span
                              style={{
                                padding: "4px 11px",
                                borderRadius: 100,
                                fontSize: 10,
                                fontWeight: 700,
                                background: "rgba(0,85,255,.10)",
                                color: B1,
                                border: "0.5px solid rgba(0,85,255,.20)",
                              }}
                            >
                              Teacher
                            </span>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: t.isActive ? "#007830" : T4 }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: t.isActive ? GREEN : "#CCDDEE" }} />
                            {t.isActive ? "Active" : "Inactive"}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                        <div
                          style={{
                            padding: "4px 10px",
                            borderRadius: 100,
                            background: t.classCount > 0 ? `linear-gradient(135deg, ${B1}, ${B2})` : "rgba(0,85,255,.10)",
                            border: t.classCount > 0 ? "none" : "0.5px solid rgba(0,85,255,.18)",
                            fontSize: 10,
                            fontWeight: 700,
                            color: t.classCount > 0 ? "#fff" : B1,
                            boxShadow: t.classCount > 0 ? "0 2px 7px rgba(0,85,255,.26)" : "none",
                          }}
                        >
                          {t.classCount} {t.classCount === 1 ? "Class" : "Classes"}
                        </div>
                        {hasScoreData && tr ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 10px",
                              borderRadius: 100,
                              background: trendBg,
                              border: `0.5px solid ${trendBorder}`,
                              fontSize: 10,
                              fontWeight: 700,
                              color: trendColor,
                            }}
                          >
                            {trendIconEl}
                            {trendLabel}
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "4px 10px",
                              borderRadius: 100,
                              background: "rgba(255,136,0,.10)",
                              border: "0.5px solid rgba(255,136,0,.22)",
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#884400",
                            }}
                          >
                            No data yet
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metrics strip */}
                    <div style={{ display: "flex", borderBottom: `0.5px solid ${SEP}` }}>
                      {[
                        {
                          val: t.classCount > 0 ? t.classCount : "—",
                          lbl: "Classes",
                          color: t.classCount > 0 ? B1 : T4,
                        },
                        {
                          val: t.studentCount > 0 ? t.studentCount : "—",
                          lbl: "Students",
                          color: t.studentCount > 0 ? B1 : T4,
                        },
                        {
                          val: hasScoreData ? `${t.avgScore}%` : "—",
                          lbl: "Avg Score",
                          color: avgValColor,
                          sub: hasScoreData ? `Grade ${tLetter}` : null,
                        },
                        {
                          val: hasScoreData && tr ? tr.label : "—",
                          lbl: "Trend",
                          color: hasScoreData && tr ? trendColor : T4,
                          trendIcon: hasScoreData && tr ? trendIconEl : null,
                        },
                      ].map((m, mi) => (
                        <div
                          key={mi}
                          style={{
                            flex: 1,
                            padding: "12px 10px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            position: "relative",
                            borderRight: mi < 3 ? "0.5px solid rgba(0,85,255,.10)" : "none",
                          }}
                        >
                          {m.trendIcon ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              {m.trendIcon}
                              <div style={{ fontSize: 14, fontWeight: 700, color: m.color, letterSpacing: "-0.4px", lineHeight: 1 }}>
                                {m.val}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 18, fontWeight: 700, color: m.color, letterSpacing: "-0.4px", lineHeight: 1 }}>
                              {m.val}
                            </div>
                          )}
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: T4 }}>
                            {m.lbl}
                          </div>
                          {m.sub && (
                            <div style={{ fontSize: 9, fontWeight: 600, color: T4, marginTop: 1 }}>{m.sub}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Progress bar (when scored) */}
                    {hasScoreData && (
                      <div style={{ padding: "10px 16px", borderBottom: `0.5px solid ${SEP}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T4 }}>
                          <span>Class Performance</span>
                          <span style={{ color: avgValColor }}>{t.avgScore}%</span>
                        </div>
                        <div style={{ height: 8, background: "#E0ECFF", borderRadius: 4, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 4,
                              background: avgBarColor,
                              width: `${Math.min(100, Math.max(0, t.avgScore!))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* vs School Avg row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "11px 18px",
                        borderBottom: `0.5px solid ${SEP}`,
                        background: "rgba(0,85,255,.03)",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: T3, display: "flex", alignItems: "center", gap: 6 }}>
                        <BarChart3 size={12} strokeWidth={2.3} />
                        vs School Avg{hasScoreData && schoolAvg != null ? ` (${schoolAvg}%)` : ""}
                      </div>
                      {t.vsSchoolAvg != null ? (
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            color: t.vsSchoolAvg > 2 ? GREEN : t.vsSchoolAvg < -2 ? RED : GOLD,
                          }}
                        >
                          {t.vsSchoolAvg > 2 ? (
                            <TrendingUp size={12} strokeWidth={2.4} />
                          ) : t.vsSchoolAvg < -2 ? (
                            <TrendingDown size={12} strokeWidth={2.4} />
                          ) : (
                            <Minus size={12} strokeWidth={2.4} />
                          )}
                          <span>
                            {t.vsSchoolAvg >= 0 ? "+" : ""}
                            {t.vsSchoolAvg}%
                            {" "}
                            <span style={{ fontSize: 11, fontWeight: 600, color: T3 }}>
                              {t.vsSchoolAvg > 2 ? "Above" : t.vsSchoolAvg < -2 ? "Below" : "On Par"}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 700, color: T4, display: "flex", alignItems: "center", gap: 5 }}>
                          —{" "}
                          <span style={{ fontSize: 11, color: T4, fontStyle: "italic", fontWeight: 500 }}>No data</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, padding: "13px 16px" }}>
                      <button
                        onClick={() => setSelected(t)}
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          background: `linear-gradient(135deg, ${B1}, ${B2})`,
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
                        }}
                      >
                        <ArrowRight size={13} strokeWidth={2.2} />
                        View Details
                      </button>
                      <button
                        // Deep-link to the teacher-notes chat with this
                        // teacher's chat auto-opened. TeacherNotes accepts
                        // `{ teacherId, prefillMessage? }` via router state
                        // (same pattern ParentCommunication uses for parent
                        // deep-links). Was: bare navigate(...) dumped the
                        // user on the page with no teacher selected, so they
                        // had to find this teacher again manually.
                        onClick={() => navigate("/teacher-notes", {
                          state: { teacherId: t.id },
                        })}
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          background: "#EEF4FF",
                          color: "#002080",
                          border: "0.5px solid rgba(0,85,255,.16)",
                          cursor: "pointer",
                          boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                        }}
                      >
                        <MessageSquare size={13} color="rgba(0,85,255,.6)" strokeWidth={2.2} />
                        Note
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* AI CARD */}
            {filtered.length > 0 && (
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
                    AI Performance Intelligence
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
                  {!aiInsight.hasScored ? (
                    <>
                      No teacher has recorded score data yet.{" "}
                      <strong style={{ color: "#fff", fontWeight: 700 }}>
                        Schedule assessments
                      </strong>{" "}
                      to enable proper impact analysis across {aiInsight.total} teacher{aiInsight.total === 1 ? "" : "s"}.
                    </>
                  ) : (
                    <>
                      {aiInsight.topT && (
                        <>
                          <strong style={{ color: "#fff", fontWeight: 700 }}>{aiInsight.topT.name}</strong>{" "}
                          leads with{" "}
                          <strong style={{ color: "#fff", fontWeight: 700 }}>{aiInsight.topT.avgScore}%</strong>
                          {aiInsight.topT.subjects[0] ? ` in ${aiInsight.topT.subjects[0]}` : ""}.{" "}
                        </>
                      )}
                      {schoolAvg != null && (
                        <>
                          School averages{" "}
                          <strong style={{ color: "#fff", fontWeight: 700 }}>{schoolAvg}%</strong>{" "}
                          across graded scores.{" "}
                        </>
                      )}
                      {aiInsight.withoutData > 0 && (
                        <>
                          <strong style={{ color: "#fff", fontWeight: 700 }}>
                            {aiInsight.withoutData} teacher{aiInsight.withoutData === 1 ? "" : "s"}
                          </strong>{" "}
                          have no performance data — consider scheduling assessments to enable proper impact analysis.
                        </>
                      )}
                      {needsSupportCount > 0 && (
                        <>
                          {" "}
                          <strong style={{ color: "#FF8899", fontWeight: 700 }}>
                            {needsSupportCount} teacher{needsSupportCount === 1 ? "" : "s"}
                          </strong>{" "}
                          below 60% need support.
                        </>
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
                    { v: teachers.length, l: "Teachers", c: "#fff" },
                    { v: schoolAvgDisplay,  l: "School Avg", c: "#FFDD44" },
                    { v: needsSupportCount, l: "At Risk", c: needsSupportCount > 0 ? "#FF8899" : "#fff" },
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
          </>
        )}

        <div style={{ height: 20 }} />
      </div>
    );
  }

  // Desktop derived stats — share the same counts/thresholds as mobile via
  // top-level constants (memory: bug_pattern_score_zero_no_data — was: desktop
  // tiered at 80/65/50 while mobile tiered at 85/75/60 → same school showed
  // different labels on different screens).
  const dFiltered      = filtered;
  const dSchoolAvgTier = getSchoolAvgTier(schoolAvg);
  const dSchoolAvgDisp = schoolAvg == null ? "—" : `${schoolAvg}%`;

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* Listener-failure banner (desktop) — same retry contract as mobile.
          Surfaces silent permission-denied / network failures so the page
          doesn't render empty state when data IS theoretically available. */}
      {loadError && (
        <div role="alert" className="mt-2 mb-3 rounded-[14px] flex items-start gap-3 px-4 py-3"
          style={{ background: "rgba(255,170,0,0.10)", border: "0.5px solid rgba(255,170,0,0.32)" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-[2px]" style={{ color: "#FFAA00" }} strokeWidth={2.4} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold mb-[2px]" style={{ color: "#884400" }}>Could not load all data</div>
            <div className="text-[11px]" style={{ color: "#5070B0", lineHeight: 1.4 }}>
              {loadError.code === "permission-denied"
                ? `Permission denied on ${loadError.collection} — check your role's read access.`
                : `${loadError.collection}: ${loadError.message || "network error"}`}
            </div>
          </div>
          <button onClick={retry}
            className="flex-shrink-0 rounded-[10px] text-[11px] font-bold px-[12px] py-[5px] transition-transform active:scale-95"
            style={{ background: "#fff", border: "0.5px solid rgba(255,170,0,0.42)", color: "#884400", boxShadow: "0 0 0 .5px rgba(255,170,0,.10), 0 1px 4px rgba(255,170,0,.12)" }}>
            Retry
          </button>
        </div>
      )}

      {/* Top toolbar */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.7px] flex items-center gap-[10px]" style={{ color: "#001040" }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
              <GraduationCap className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Teacher Performance
          </div>
          <div className="text-[12px] font-normal mt-[6px] ml-[46px] flex items-center gap-[6px]" style={{ color: "#5070B0" }}>
            <span>Impact Analysis</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Same Subject Across Teachers</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Same Teacher Across Classes</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search — slimmer flex-cell pill (was visually chunky at 12px
              vertical padding × 1.5 line-height). 8px + 18.2px + 8px ≈ 34px
              height now — same height as the page's other chips. */}
          <div className="flex items-center bg-white rounded-[10px] min-w-[260px]"
            style={{ border: "0.5px solid rgba(0,85,255,0.14)", boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 1px 4px rgba(0,85,255,.06)", height: 36 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                alignSelf: "stretch",
                flexShrink: 0,
                pointerEvents: "none",
              }}
            >
              <Search size={15} color="rgba(0,85,255,0.78)" strokeWidth={2.5} />
            </span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search teacher or subject…"
              className="flex-1 min-w-0 bg-transparent outline-none custom-chrome"
              style={{
                "--cc-padding": "8px 14px 8px 0",
                "--cc-font-size": "12.5px",
                "--cc-font-weight": "500",
                "--cc-line-height": "1.4",
                color: "#001040",
                fontFamily: "inherit",
                border: "none",
              } as any} />
          </div>
        </div>
      </div>

      {/* Dark hero banner */}
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
            <BarChart3 className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] mb-[5px]" style={{ color: "rgba(255,255,255,0.50)" }}>
              School Avg{loading ? "" : ` · ${teachers.length} Teacher${teachers.length === 1 ? "" : "s"}`}
            </div>
            <div className="text-[34px] font-bold text-white leading-none tracking-[-1px]">
              {loading ? "—" : dSchoolAvgDisp}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          <div className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-full"
            style={{ background: dSchoolAvgTier.dBg, border: `0.5px solid ${dSchoolAvgTier.dBdr}` }}>
            <span className="text-[12px] font-bold" style={{ color: dSchoolAvgTier.dC }}>{dSchoolAvgTier.label} tier</span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: loading ? "—" : teachers.length,         label: "Teachers", color: "#fff" },
              { val: loading ? "—" : topPerformersCount,      label: "Top Tier", color: "#66EE88" },
              { val: loading ? "—" : needsSupportCount,       label: "Support",  color: needsSupportCount > 0 ? "#FF99AA" : "#FFDD88" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[10px] px-[14px] text-center min-w-[72px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[17px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[8px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bright stat cards 4-wide */}
      {/* 4 Stat Cards — dashboard-style */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Total Teachers",
            val: loading ? "—" : teachers.length,
            sub: "In branch",
            Icon: Users,
            cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
            tileGrad: "linear-gradient(135deg, #0055FF, #1166FF)",
            tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
            valColor: "#0055FF",
            decorColor: "#0055FF",
          },
          {
            label: "Avg Class Score",
            val: loading ? "—" : dSchoolAvgDisp,
            sub: dSchoolAvgTier.label,
            Icon: BarChart3,
            cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            tileGrad: "linear-gradient(135deg, #7B3FF4, #A07CF8)",
            tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
            valColor: "#7B3FF4",
            decorColor: "#7B3FF4",
          },
          {
            label: "Top Performers",
            val: loading ? "—" : topPerformersCount,
            sub: "Score ≥ 80%",
            Icon: Star,
            cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
            tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
            tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
            valColor: "#007830",
            decorColor: "#00C853",
          },
          {
            label: "Needs Support",
            val: loading ? "—" : needsSupportCount,
            sub: "Score < 60%",
            Icon: AlertTriangle,
            cardGrad: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
            tileGrad: "linear-gradient(135deg, #FFAA00, #FFDD44)",
            tileShadow: "0 4px 14px rgba(255,170,0,0.28)",
            valColor: "#FFAA00",
            decorColor: "#FFAA00",
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

      {/* Section label */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
        Faculty Performance Roster
        <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
          {dFiltered.length} {dFiltered.length === 1 ? "teacher" : "teachers"}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* Teacher table */}
      {loading ? (
        <div className="rounded-[22px] py-16 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <Loader2 className="w-9 h-9 animate-spin mx-auto mb-3" style={{ color: "#0055FF" }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#99AACC" }}>Loading teacher performance…</p>
        </div>
      ) : dFiltered.length === 0 ? (
        <div className="rounded-[22px] py-16 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-16 h-16 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
            <GraduationCap className="w-7 h-7" style={{ color: "rgba(0,85,255,0.45)" }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-bold mb-1" style={{ color: "#001040" }}>No teacher data found</p>
          <p className="text-[12px]" style={{ color: "#99AACC" }}>{search ? "Try a different search term." : "Assign teachers to classes to see performance."}</p>
        </div>
      ) : (
        <div className="rounded-[22px] bg-white overflow-hidden"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr style={{ background: "rgba(0,85,255,0.04)", borderBottom: "0.5px solid rgba(0,85,255,0.07)" }}>
                  {["Teacher", "Subjects", "Classes", "Students", "Avg Score", "vs School", "Trend", "Actions"].map(h => (
                    <th key={h} className="py-[14px] px-5 text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "#99AACC" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dFiltered.map((t, i, arr) => {
                  const T     = trend(t);
                  const TIcon = T?.icon;
                  // Single classifier — keeps row score color, grade letter,
                  // grade pill bg, AND avatar gradient in lockstep across
                  // mobile + desktop. Was: desktop avatar was hardcoded blue
                  // regardless of the teacher's tier — visually inconsistent
                  // with mobile and obscured at-a-glance performance read.
                  const sc = classifyScore(t.avgScore);
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-[#F5F9FF]"
                      style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(0,85,255,0.05)" } : {}}>
                      <td className="py-[14px] px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                            style={{ background: sc.avatarGrad, boxShadow: sc.avatarShadow }}>
                            {safeInitials(t.name)}
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[13px] font-bold tracking-[-0.2px]" style={{ color: "#001040" }}>{t.name}</span>
                            <span className="flex items-center gap-[4px] text-[10px] font-semibold" style={{ color: t.isActive ? "#007830" : "#99AACC" }}>
                              <span className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: t.isActive ? "#00C853" : "#CCDDEE" }} />
                              {t.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-[14px] px-5">
                        <div className="flex flex-wrap gap-[5px]">
                          {t.subjects.slice(0, 2).map(s => (
                            <span key={s} className="text-[10px] font-bold px-[10px] py-[3px] rounded-full"
                              style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.18)" }}>{s}</span>
                          ))}
                          {t.subjects.length > 2 && <span className="text-[10px] font-bold self-center" style={{ color: "#99AACC" }}>+{t.subjects.length - 2}</span>}
                          {t.subjects.length === 0 && <span className="text-[11px]" style={{ color: "#99AACC" }}>—</span>}
                        </div>
                      </td>
                      <td className="py-[14px] px-5 text-[12px] font-semibold" style={{ color: "#5070B0" }}>{t.classCount || "—"}</td>
                      <td className="py-[14px] px-5 text-[12px] font-semibold" style={{ color: "#5070B0" }}>{t.studentCount || "—"}</td>
                      <td className="py-[14px] px-5">
                        {t.avgScore != null ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold" style={{ color: sc.color, letterSpacing: "-0.2px" }}>{t.avgScore}%</span>
                            <span className="px-[8px] py-[2px] rounded-full text-[10px] font-bold"
                              style={{ background: sc.badgeBg, color: sc.badgeColor, border: `0.5px solid ${sc.badgeBorder}` }}>{sc.letter}</span>
                          </div>
                        ) : <span className="text-[11px]" style={{ color: "#99AACC" }}>No data</span>}
                      </td>
                      <td className="py-[14px] px-5">
                        {t.vsSchoolAvg != null ? (
                          <span className="text-[12px] font-bold" style={{ color: t.vsSchoolAvg >= 0 ? "#00C853" : "#FF3355" }}>
                            {t.vsSchoolAvg >= 0 ? "+" : ""}{t.vsSchoolAvg}%
                          </span>
                        ) : <span className="text-[11px]" style={{ color: "#99AACC" }}>—</span>}
                      </td>
                      <td className="py-[14px] px-5">
                        {T && TIcon ? (
                          <div className="flex items-center gap-[5px]">
                            <TIcon className={`w-[14px] h-[14px] ${T.color}`} strokeWidth={2.3} />
                            <span className={`text-[11px] font-bold ${T.color}`}>{T.label}</span>
                          </div>
                        ) : <span className="text-[11px]" style={{ color: "#99AACC" }}>—</span>}
                      </td>
                      <td className="py-[14px] px-5">
                        <div className="flex items-center gap-[6px]">
                          <button onClick={() => setSelected(t)}
                            className="h-8 px-[12px] rounded-[10px] flex items-center gap-[5px] text-[11px] font-bold text-white transition-transform active:scale-95 hover:scale-[1.03] relative overflow-hidden"
                            style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 3px 10px rgba(0,85,255,0.26)" }}>
                            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                            <span className="relative z-10">View</span>
                            <ChevronRight className="w-3 h-3 relative z-10" strokeWidth={2.5} />
                          </button>
                          {/* Deep-link to TeacherNotes — same `{ teacherId }`
                              router-state contract as the mobile Note button.
                              Was: desktop view had no way to message a teacher
                              from the performance table. */}
                          <button onClick={() => navigate("/teacher-notes", { state: { teacherId: t.id } })}
                            className="h-8 px-[12px] rounded-[10px] flex items-center gap-[5px] text-[11px] font-bold transition-transform active:scale-95 hover:scale-[1.03]"
                            style={{ background: "#EEF4FF", color: "#002080", border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 6px rgba(0,85,255,.08)" }}>
                            <MessageSquare className="w-3 h-3" style={{ color: "rgba(0,85,255,0.7)" }} strokeWidth={2.3} />
                            <span>Note</span>
                          </button>
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

      {/* AI Performance Intelligence — desktop. Was: this card lived only
          inside the mobile branch, so desktop principals saw no top-line
          summary at all (P2-2). Same `aiInsight` payload feeds both. */}
      {!loading && dFiltered.length > 0 && (
        <div
          className="rounded-[22px] mt-6 p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}
        >
          <div className="absolute -top-10 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />

          <div className="relative z-10 flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-[9px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Sparkles className="w-[15px] h-[15px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.3} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              AI Performance Intelligence
            </span>
          </div>

          <div className="relative z-10 text-[13px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.88)" }}>
            {!aiInsight.hasScored ? (
              <>
                No teacher has recorded score data yet.{" "}
                <strong style={{ color: "#fff", fontWeight: 700 }}>Schedule assessments</strong>{" "}
                to enable proper impact analysis across {aiInsight.total} teacher{aiInsight.total === 1 ? "" : "s"}.
              </>
            ) : (
              <>
                {aiInsight.topT && (
                  <>
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{aiInsight.topT.name}</strong>{" "}
                    leads with{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{aiInsight.topT.avgScore}%</strong>
                    {aiInsight.topT.subjects[0] ? ` in ${aiInsight.topT.subjects[0]}` : ""}.{" "}
                  </>
                )}
                {schoolAvg != null && (
                  <>
                    School averages{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{schoolAvg}%</strong>{" "}
                    across graded scores.{" "}
                  </>
                )}
                {aiInsight.withoutData > 0 && (
                  <>
                    <strong style={{ color: "#fff", fontWeight: 700 }}>
                      {aiInsight.withoutData} teacher{aiInsight.withoutData === 1 ? "" : "s"}
                    </strong>{" "}
                    have no performance data — consider scheduling assessments to enable proper impact analysis.
                  </>
                )}
                {needsSupportCount > 0 && (
                  <>
                    {" "}
                    <strong style={{ color: "#FF8899", fontWeight: 700 }}>
                      {needsSupportCount} teacher{needsSupportCount === 1 ? "" : "s"}
                    </strong>{" "}
                    below 60% need support.
                  </>
                )}
              </>
            )}
          </div>

          <div className="relative z-10 mt-4 grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden"
            style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { v: teachers.length,           l: "Teachers",   c: "#fff" },
              { v: dSchoolAvgDisp,             l: "School Avg", c: "#FFDD44" },
              { v: needsSupportCount,         l: "At Risk",    c: needsSupportCount > 0 ? "#FF8899" : "#fff" },
            ].map((s, i) => (
              <div key={i} className="text-center py-[14px] px-3" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[20px] font-bold leading-none mb-1" style={{ color: s.c, letterSpacing: "-0.5px" }}>{s.v}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default TeacherPerformance;
