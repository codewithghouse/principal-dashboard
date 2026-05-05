import { useState, useEffect, useMemo } from "react";
import {
  FileText, Users, Percent, Trophy, AlertTriangle,
  ChevronRight, Loader2, Calendar, TrendingDown, TrendingUp
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where } from "firebase/firestore";
import { pctOfDoc } from "@/lib/scoreUtils";
import ExamDetail from "@/components/ExamDetail";
import ExamsResultsMobile from "@/components/dashboard/ExamsResultsMobile";

/* ══════════════════════════════════════════════════════════════
   Shared types  (imported by ExamDetail)
══════════════════════════════════════════════════════════════ */
export interface ClassRow {
  section: string; appeared: number; passed: number; failed: number;
  passRate: number; topper: string; topperPct: number; avgPct: number;
}
export interface MeritEntry { rank: number; name: string; className: string; avgPct: number; }
export interface FailEntry  { name: string; className: string; avgPct: number; initials: string; }
export interface ExamGroup {
  name: string; dateLabel: string; totalStudents: number;
  passRate: number; avgPct: number; scores: any[];
  classSummary: ClassRow[]; meritList: MeritEntry[]; failList: FailEntry[];
}

/* ──────────────────────────────────────────────────────────── */
function chunk<T>(arr: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function fmtDate(str: string) {
  if (!str) return "";
  const d = new Date(str);
  return isNaN(d.getTime()) ? str
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Robust initials — "Aamir Khan" → "AK", "Aamir" → "A", "" → "??". Was:
// `name.substring(0, 2)` which produced "AA" for single-name students.
const safeInitials = (name: string | null | undefined): string => {
  const parts = (name || "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
};

// Stable per-student key — prefer studentId, then lowercased studentEmail.
// Memory: dual_query_pattern_studentid_email — single-key dedup silently
// drops legacy email-keyed rows.
const studentKey = (s: any): string =>
  String(s.studentId || (s.studentEmail || "").toLowerCase() || "").trim();

export function buildExamGroup(name: string, scores: any[]): ExamGroup {
  // "Appeared" = not absent AND has a usable percentage (post-pctOfDoc
  // normalisation by the parent fetcher). Was: filtered by `s.score !==
  // null` which dropped marks-format rows (only `marksObtained`/`totalMarks`,
  // no `score` field) even though their percentage was already computed.
  const appeared = scores.filter(s => !s.isAbsent && typeof s.percentage === "number" && !isNaN(s.percentage));

  const classMap = new Map<string, any[]>();
  appeared.forEach(s => {
    const cls = s.className || s.classId || "Unknown";
    if (!classMap.has(cls)) classMap.set(cls, []);
    classMap.get(cls)!.push(s);
  });

  const classSummary: ClassRow[] = Array.from(classMap.entries()).map(([cls, rows]) => {
    const passed = rows.filter(r => r.percentage >= 50);
    const avg    = rows.reduce((a, r) => a + r.percentage, 0) / rows.length;
    const top    = [...rows].sort((a, b) => b.percentage - a.percentage)[0];
    return {
      section: cls, appeared: rows.length,
      passed: passed.length, failed: rows.length - passed.length,
      passRate: Math.round(passed.length / rows.length * 100),
      topper: top ? `${top.studentName} (${Math.round(top.percentage)}%)` : "—",
      // `??` not `||` — a real 0% topper (everyone failed) shouldn't fall
      // through to the "missing data" branch. With `||`, both null and 0
      // collapsed to 0 indistinguishably.
      topperPct: top?.percentage ?? 0, avgPct: Math.round(avg),
    };
  }).sort((a, b) => a.section.localeCompare(b.section));

  // Dual-key student aggregation — was: studentId-only Map key dropped
  // legacy email-keyed students.
  const stMap = new Map<string, { name: string; className: string; total: number; count: number }>();
  appeared.forEach(s => {
    const k = studentKey(s);
    if (!k) return;
    if (!stMap.has(k))
      stMap.set(k, { name: s.studentName || "Unknown", className: s.className || s.classId || "", total: 0, count: 0 });
    const e = stMap.get(k)!; e.total += s.percentage; e.count++;
  });
  const meritList: MeritEntry[] = Array.from(stMap.values())
    .map(v => ({ name: v.name, className: v.className, avgPct: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avgPct - a.avgPct).slice(0, 5)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const fMap = new Map<string, { name: string; className: string; total: number; count: number }>();
  appeared.filter(s => s.percentage < 50).forEach(s => {
    const k = studentKey(s);
    if (!k) return;
    if (!fMap.has(k))
      fMap.set(k, { name: s.studentName || "Unknown", className: s.className || s.classId || "", total: 0, count: 0 });
    const e = fMap.get(k)!; e.total += s.percentage; e.count++;
  });
  const failList: FailEntry[] = Array.from(fMap.values())
    .map(v => ({ name: v.name, className: v.className, avgPct: Math.round(v.total / v.count), initials: safeInitials(v.name) }))
    .sort((a, b) => a.avgPct - b.avgPct).slice(0, 8);

  const dates = [...new Set(scores.map(s => s.testDate || s.date || "").filter(Boolean))].sort();
  const dateLabel = dates.length === 0 ? "—"
    : dates.length === 1 ? fmtDate(dates[0])
    : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`;

  const totalPassed = appeared.filter(s => s.percentage >= 50).length;
  const totalAvg    = appeared.length ? appeared.reduce((a, s) => a + s.percentage, 0) / appeared.length : 0;

  return { name, dateLabel, totalStudents: appeared.length,
    passRate: appeared.length ? Math.round(totalPassed / appeared.length * 100) : 0,
    avgPct: Math.round(totalAvg), scores, classSummary, meritList, failList };
}

/* ══════════════════════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════════════════════ */
const BORDER_COLORS = ["#1e3a8a", "#d97706", "#16a34a"];
const GRADE_COLORS  = ["#16a34a", "#1d4ed8", "#d97706", "#ef4444"];

export default function ExamsResults() {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

  const [allScores,      setAllScores]      = useState<any[]>([]);
  const [upcomingExams,  setUpcomingExams]  = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [selectedExam,   setSelectedExam]   = useState<ExamGroup | null>(null);

  /* ── fetch data ──
     - schoolId-only server-side; branchId in-memory (memory:
       branchid_inference_lag).
     - Multi-source merge: test_scores + results + gradebook_scores. Bulk-
       upload schools were missing ~40% of scores when only test_scores was
       read (memory: owner_dashboard_alternate_data_sources).
     - Each row's percentage normalised via pctOfDoc — was: relied on raw
       `s.percentage` field which is NaN/undefined for marks-format rows. */
  useEffect(() => {
    if (!userData?.schoolId) {
      setLoading(false);
      return;
    }
    const schoolId = userData.schoolId;
    const branchId = userData?.branchId || "";
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    const go = async () => {
      try {
        /* 1. Score sources — fetch all 3, merge with content-fingerprint dedup. */
        const onlySchool = (col: string) =>
          query(collection(db, col), where("schoolId", "==", schoolId));
        const [testScoresSnap, resultsSnap, gradebookSnap] = await Promise.all([
          getDocs(onlySchool("test_scores")),
          getDocs(onlySchool("results")),
          getDocs(onlySchool("gradebook_scores")),
        ]);
        const fpSeen = new Set<string>();
        const rawScores: any[] = [];
        [...testScoresSnap.docs, ...resultsSnap.docs, ...gradebookSnap.docs].forEach(d => {
          const data = { id: d.id, ...d.data() } as any;
          if (!inBranch(data)) return;
          const pct = pctOfDoc(data);
          // Keep `isAbsent` rows even when pct is null — the exam list needs
          // them in totalStudents counts.
          const subjKey = String(data.subject ?? data.subjectName ?? "").toLowerCase();
          const dateRaw = data.testDate || data.date || data.createdAt || data.uploadedAt;
          const dateK = (() => {
            if (!dateRaw) return "";
            if (typeof dateRaw === "string") return dateRaw.slice(0, 10);
            if (dateRaw?.toDate) return dateRaw.toDate().toISOString().slice(0, 10);
            return "";
          })();
          const sKey = String(data.studentId || (data.studentEmail || "").toLowerCase() || "").trim();
          const fp = `${sKey}|${subjKey}|${dateK}|${pct === null ? "x" : Math.round(pct * 10)}`;
          if (fpSeen.has(fp)) return;
          fpSeen.add(fp);
          // Normalise percentage so downstream `s.percentage` reads work.
          rawScores.push({ ...data, percentage: pct === null ? data.percentage : pct });
        });

        /* 2. enrich with className from tests (max 10 per "in" query) */
        const testIds = [...new Set(rawScores.map(s => s.testId).filter(Boolean))] as string[];
        const testsMap = new Map<string, any>();
        for (const ids of chunk(testIds, 10)) {
          if (!ids.length) continue;
          const tSnap = await getDocs(query(collection(db, "tests"), where("__name__", "in", ids)));
          tSnap.docs.forEach(d => testsMap.set(d.id, { id: d.id, ...d.data() }));
        }
        const enriched = rawScores.map(s => {
          const t = testsMap.get(s.testId);
          return { ...s, className: s.className || t?.className || "", testDate: s.testDate || t?.testDate || t?.date || "" };
        });
        setAllScores(enriched);

        /* 3. upcoming tests via teachers (schoolId-only + in-memory branch) */
        const tSnap = await getDocs(onlySchool("teachers"));
        const tIds = tSnap.docs.filter(d => inBranch(d.data() as any)).map(d => d.id);
        const upcoming: any[] = [];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (const ids of chunk(tIds, 10)) {
          if (!ids.length) continue;
          const uSnap = await getDocs(
            query(collection(db, "tests"),
              where("schoolId", "==", schoolId),
              where("teacherId", "in", ids))
          );
          uSnap.docs.forEach(d => {
            const data = { id: d.id, ...d.data() } as any;
            if (!inBranch(data)) return;
            const examDate = new Date(data.testDate || data.date || 0);
            if (examDate >= today && data.status !== "Completed")
              upcoming.push(data);
          });
        }
        upcoming.sort((a, b) =>
          new Date(a.testDate || a.date || 0).getTime() - new Date(b.testDate || b.date || 0).getTime()
        );
        setUpcomingExams(upcoming);
      } catch (e) {
        console.error("[ExamsResults] fetch failed:", e);
      }
      setLoading(false);
    };
    go();
  }, [userData?.schoolId, userData?.branchId]);

  /* ── derived: exam groups ── */
  const examGroups = useMemo<ExamGroup[]>(() => {
    const map = new Map<string, any[]>();
    allScores.forEach(s => {
      const key = s.testName || s.testId || "Unnamed Exam";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    // Sort by actual exam date (not the formatted dateLabel string — was:
    // localeCompare which gave wrong order for "5 Mar 2026" vs "12 Mar 2026").
    const groups = Array.from(map.entries()).map(([name, scores]) => buildExamGroup(name, scores));
    const latestDateMs = (g: ExamGroup) => {
      let max = 0;
      g.scores.forEach((s: any) => {
        const raw = s.testDate || s.date;
        if (!raw) return;
        const d = raw?.toDate ? raw.toDate() : new Date(raw);
        const ms = d?.getTime?.() || 0;
        if (ms > max) max = ms;
      });
      return max;
    };
    return groups.sort((a, b) => latestDateMs(b) - latestDateMs(a));
  }, [allScores]);

  /* ── derived: latest exam ── */
  const latestExam = examGroups[0] || null;
  const prevExam   = examGroups[1] || null;

  /* ── derived: subject pass rates ──
     - Filters by normalised `s.percentage` (was: `s.score !== null` which
       missed marks-format rows even after normalisation).
     - Skips rows without a real subject (was: bucketed under "Unknown" which
       fabricated a subject row that doesn't exist). */
  const subjectData = useMemo(() => {
    const map = new Map<string, { passed: number; total: number }>();
    allScores
      .filter(s => !s.isAbsent && typeof s.percentage === "number" && !isNaN(s.percentage))
      .forEach(s => {
        const subj = String(s.subject || s.subjectName || "").trim();
        if (!subj) return;
        if (!map.has(subj)) map.set(subj, { passed: 0, total: 0 });
        const e = map.get(subj)!; e.total++;
        if (s.percentage >= 50) e.passed++;
      });
    return Array.from(map.entries())
      .map(([name, { passed, total }]) => ({ name: name.length > 8 ? name.slice(0, 8) : name, passRate: Math.round(passed / total * 100) }))
      .sort((a, b) => a.passRate - b.passRate);
  }, [allScores]);

  /* ── derived: grade distribution ──
     Driven by the normalised percentage tier (was: anything without a literal
     "A"/"B"/"C" letter — including ungraded rows — was bucketed as "Failed",
     which conflated genuine fails with missing-grade rows). */
  const gradeData = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, Failed: 0 };
    (latestExam?.scores || [])
      .filter(s => !s.isAbsent && typeof s.percentage === "number" && !isNaN(s.percentage))
      .forEach(s => {
        const p = s.percentage;
        if (p >= 75)      counts.A++;
        else if (p >= 60) counts.B++;
        else if (p >= 50) counts.C++;
        else              counts.Failed++;
      });
    return [
      { name: "A Grade", value: counts.A,      color: GRADE_COLORS[0] },
      { name: "B Grade", value: counts.B,      color: GRADE_COLORS[1] },
      { name: "C Grade", value: counts.C,      color: GRADE_COLORS[2] },
      { name: "Failed",  value: counts.Failed, color: GRADE_COLORS[3] },
    ].filter(d => d.value > 0);
  }, [latestExam]);

  /* ── derived: failed students by subject ──
     Same percentage check + skip-unknown-subject rule as subjectData above. */
  const failedBySubject = useMemo(() => {
    const map = new Map<string, any[]>();
    (latestExam?.scores || [])
      .filter(s => !s.isAbsent && typeof s.percentage === "number" && s.percentage < 50)
      .forEach(s => {
        const subj = String(s.subject || s.subjectName || "").trim();
        if (!subj) return;
        if (!map.has(subj)) map.set(subj, []);
        map.get(subj)!.push(s);
      });
    return Array.from(map.entries())
      .map(([subject, students]) => ({ subject, students: students.sort((a, b) => a.percentage - b.percentage) }))
      .sort((a, b) => b.students.length - a.students.length);
  }, [latestExam]);

  /* ── derived: pass rate trend ── */
  const passRateDiff = latestExam && prevExam
    ? latestExam.passRate - prevExam.passRate : null;

  /* ── school topper ── */
  const topper = latestExam?.meritList[0] || null;

  /* ── detail view (desktop only — mobile handles its own detail inside ExamsResultsMobile) ── */
  if (selectedExam && !isMobile) {
    return <ExamDetail exam={selectedExam} allExams={examGroups} onBack={() => setSelectedExam(null)} userData={userData} />;
  }

  /* ── mobile render (dashboard + detail both handled inside ExamsResultsMobile) ── */
  if (isMobile) {
    return (
      <ExamsResultsMobile
        loading={loading}
        upcomingExams={upcomingExams}
        examGroups={examGroups}
        latestExam={latestExam}
        subjectData={subjectData}
        gradeData={gradeData}
        topper={topper}
        selectedExam={selectedExam}
        onSelectExam={exam => setSelectedExam(exam)}
        onBackFromDetail={() => setSelectedExam(null)}
        userData={userData}
      />
    );
  }

  /* ══ MAIN RENDER ══════════════════════════════════════════════ */
  const dPassTier = !latestExam ? { label: "No data", c: "#CCDDEE", bg: "rgba(153,170,204,.18)", bdr: "rgba(153,170,204,.32)" }
    : latestExam.passRate >= 75 ? { label: "Excellent", c: "#66EE88", bg: "rgba(0,200,83,0.22)", bdr: "rgba(0,200,83,0.4)" }
    : latestExam.passRate >= 50 ? { label: "Average", c: "#FFDD88", bg: "rgba(255,170,0,0.22)", bdr: "rgba(255,170,0,0.4)" }
    : { label: "Weak", c: "#FF99AA", bg: "rgba(255,51,85,0.22)", bdr: "rgba(255,51,85,0.4)" };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* Top toolbar */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.7px] flex items-center gap-[10px]" style={{ color: "#001040" }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
              <FileText className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Exams &amp; Results
          </div>
          <div className="text-[12px] font-normal mt-[6px] ml-[46px] flex items-center gap-[6px]" style={{ color: "#5070B0" }}>
            <span>Results Analysis</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Subject Performance</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Merit &amp; Fail Lists</span>
          </div>
        </div>
      </div>

      {/* Dark hero banner */}
      <div className="rounded-[22px] px-6 py-5 relative overflow-hidden flex items-center justify-between gap-5 mb-4 cursor-pointer transition-transform active:scale-[0.995] hover:scale-[1.005]"
        onClick={() => latestExam && setSelectedExam(latestExam)}
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[12px] min-w-0 relative z-10">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
            <FileText className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] mb-[5px]" style={{ color: "rgba(255,255,255,0.50)" }}>
              Latest Exam {latestExam?.dateLabel && `· ${latestExam.dateLabel}`}
            </div>
            <div className="text-[34px] font-bold text-white leading-none tracking-[-1px] truncate">
              {loading ? "…" : latestExam?.name || "No exam results yet"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          <div className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-full"
            style={{ background: dPassTier.bg, border: `0.5px solid ${dPassTier.bdr}` }}>
            <span className="text-[12px] font-bold" style={{ color: dPassTier.c }}>{dPassTier.label}</span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: latestExam?.totalStudents ?? "—", label: "Students", color: "#fff" },
              { val: latestExam ? `${latestExam.passRate}%` : "—", label: "Pass Rate", color: "#66EE88" },
              { val: latestExam ? `${latestExam.avgPct}%` : "—", label: "Avg %", color: "#FFDD88" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[10px] px-[14px] text-center min-w-[72px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[17px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[8px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4 Stat Cards — dashboard-style */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          {
            label: "Latest Exam",
            val: latestExam?.name || "—",
            sub: latestExam?.dateLabel || "No data",
            isText: true,
            Icon: FileText,
            cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
            tileGrad: "linear-gradient(135deg, #0055FF, #1166FF)",
            tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
            valColor: "#0055FF",
            decorColor: "#0055FF",
            onClick: () => latestExam && setSelectedExam(latestExam),
          },
          {
            label: "Students Appeared",
            val: latestExam?.totalStudents ?? "—",
            sub: latestExam ? `${latestExam.scores.filter(s => !s.isAbsent).length} of ${latestExam.scores.length} total` : "—",
            Icon: Users,
            cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
            tileGrad: "linear-gradient(135deg, #7B3FF4, #A07CF8)",
            tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
            valColor: "#7B3FF4",
            decorColor: "#7B3FF4",
          },
          {
            label: "Pass Rate",
            val: latestExam ? `${latestExam.passRate}%` : "—",
            sub: passRateDiff !== null ? `${passRateDiff >= 0 ? "+" : ""}${passRateDiff}% vs prev` : dPassTier.label,
            Icon: Percent,
            cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
            tileGrad: "linear-gradient(135deg, #00C853, #22EE66)",
            tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
            valColor: "#007830",
            decorColor: "#00C853",
          },
          {
            label: "School Topper",
            val: topper?.name || "—",
            sub: topper ? `${topper.className || ""} · ${topper.avgPct}%` : "No data",
            isText: true,
            Icon: Trophy,
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
              onClick={s.onClick}
              className={`rounded-[20px] p-5 relative overflow-hidden ${s.onClick ? "cursor-pointer transition-transform active:scale-[0.98] hover:-translate-y-[1px]" : ""}`}
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
              {s.isText ? (
                <p className="text-[20px] font-bold tracking-tight leading-tight mb-1.5 truncate" style={{ color: s.valColor, letterSpacing: "-0.5px" }}>{s.val}</p>
              ) : (
                <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: s.valColor, letterSpacing: "-1.2px" }}>{s.val}</p>
              )}
              <p className="text-[11px] font-semibold truncate flex items-center gap-1" style={{ color: i === 2 && passRateDiff !== null ? (passRateDiff >= 0 ? "#007830" : "#FF3355") : "#5070B0" }}>
                {i === 2 && passRateDiff !== null && (passRateDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                {s.sub}
              </p>
              <Icon
                className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                style={{ color: s.decorColor, opacity: 0.18 }}
                strokeWidth={2}
              />
            </div>
          );
        })}
      </div>

      {/* Upcoming exams section */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
        Upcoming Exams
        <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
          style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
          {upcomingExams.length} scheduled
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      <div className="rounded-[22px] bg-white p-5 mb-5"
        style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#0055FF" }} /></div>
        ) : upcomingExams.length === 0 ? (
          <div className="flex items-center gap-3 py-4 px-2">
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
              <Calendar className="w-[18px] h-[18px]" style={{ color: "rgba(0,85,255,0.45)" }} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[13px] font-bold" style={{ color: "#001040" }}>No upcoming exams scheduled</p>
              <p className="text-[11px] mt-1" style={{ color: "#99AACC" }}>Teachers can create exams from the Teacher Dashboard.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {upcomingExams.slice(0, 6).map((exam, i) => {
              const color = BORDER_COLORS[i % BORDER_COLORS.length];
              const dateStr = fmtDate(exam.testDate || exam.date || "");
              return (
                <div key={exam.id} className="rounded-[14px] px-4 py-3 relative overflow-hidden transition-transform active:scale-[0.98] hover:scale-[1.02]"
                  style={{ background: "#F5F9FF", border: "0.5px solid rgba(0,85,255,0.10)", borderLeftWidth: "4px", borderLeftColor: color }}>
                  <p className="text-[13px] font-bold truncate" style={{ color: "#001040" }}>{exam.title || exam.testName}</p>
                  <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#5070B0" }}>
                    <Calendar className="w-3 h-3" strokeWidth={2.3} /> {dateStr || "Date TBD"}
                  </p>
                  <p className="text-[11px] font-semibold mt-[2px]" style={{ color: "#99AACC" }}>
                    {exam.className ? `Class ${exam.className}` : exam.subject || ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Analytics section label */}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
        Analytics
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Subject-wise Pass Rates */}
        <div className="rounded-[22px] bg-white p-5"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[14px] font-bold tracking-[-0.2px]" style={{ color: "#001040" }}>Subject-wise Pass Rates</div>
            <span className="px-[9px] py-[3px] rounded-full text-[10px] font-bold"
              style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
              {subjectData.length} subjects
            </span>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#0055FF" }} /></div>
          ) : subjectData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="w-10 h-10 mb-2" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
              <p className="text-[12px] font-semibold" style={{ color: "#99AACC" }}>No subject data yet</p>
            </div>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0ECFF" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "#5070B0", fontWeight: 600 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "#99AACC" }} domain={[0, 100]} />
                  <RechartsTip
                    formatter={(v: any) => [`${v}%`, "Pass Rate"]}
                    contentStyle={{ borderRadius: "10px", border: "0.5px solid rgba(0,85,255,0.14)", fontSize: 12, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px rgba(0,85,255,0.12)" }}
                  />
                  <Bar dataKey="passRate" radius={[6, 6, 0, 0]} maxBarSize={52} label={{ position: "top", fontSize: 11, fontWeight: 700, fill: "#001040", formatter: (v: any) => `${v}%` }}>
                    {subjectData.map((d, i) => (
                      <Cell key={i} fill={d.passRate >= 80 ? "#00C853" : d.passRate >= 60 ? "#FF8800" : "#FF3355"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Grade Distribution */}
        <div className="rounded-[22px] bg-white p-5"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[14px] font-bold tracking-[-0.2px]" style={{ color: "#001040" }}>Grade Distribution</div>
            <span className="px-[9px] py-[3px] rounded-full text-[10px] font-bold"
              style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
              Latest exam
            </span>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#0055FF" }} /></div>
          ) : gradeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="w-10 h-10 mb-2" style={{ color: "rgba(0,85,255,0.20)" }} strokeWidth={1.8} />
              <p className="text-[12px] font-semibold" style={{ color: "#99AACC" }}>No grade data yet</p>
            </div>
          ) : (() => {
            const slugify = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "g";
            const chartData = gradeData.map((d, i) => ({
              key: `${slugify(d.name)}-${i}`,
              name: d.name,
              value: d.value,
              fill: d.color,
            }));
            const chartConfig: ChartConfig = {
              value: { label: "Students" },
              ...Object.fromEntries(chartData.map(d => [d.key, { label: d.name, color: d.fill }])),
            };
            return (
              <>
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[260px] px-0"
                >
                  <PieChart>
                    <ChartTooltip
                      content={<ChartTooltipContent nameKey="value" hideLabel formatter={(v: any, n: any) => [`${v} students`, n]} />}
                    />
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="key"
                      animationDuration={1000}
                      labelLine={false}
                      label={({ payload, ...props }: any) => {
                        if (!payload?.value) return null;
                        return (
                          <text
                            cx={props.cx}
                            cy={props.cy}
                            x={props.x}
                            y={props.y}
                            textAnchor={props.textAnchor}
                            dominantBaseline={props.dominantBaseline}
                            fill="#ffffff"
                            style={{ fontSize: 14, fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}
                          >
                            {payload.value}
                          </text>
                        );
                      }}
                    />
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-3">
                  {gradeData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-[12px] font-semibold" style={{ color: "#5070B0", fontFamily: "'DM Sans', sans-serif" }}>{d.name}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Failed students by subject */}
      {!loading && failedBySubject.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
            Failed Students by Subject
            {latestExam && (
              <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
                style={{ background: "rgba(255,51,85,0.10)", color: "#FF3355", border: "0.5px solid rgba(255,51,85,0.22)" }}>
                {latestExam.name}
              </span>
            )}
            <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
          </div>
          <div className="grid grid-cols-4 gap-4 mb-5">
            {failedBySubject.slice(0, 4).map(({ subject, students }) => (
              <div key={subject} className="rounded-[18px] bg-white overflow-hidden"
                style={{ boxShadow: "0 0 0 .5px rgba(255,51,85,.08), 0 4px 16px rgba(255,51,85,.09), 0 16px 40px rgba(255,51,85,.12)", border: "0.5px solid rgba(255,51,85,0.18)" }}>
                <div className="flex items-center justify-between px-4 py-[10px]"
                  style={{ background: "linear-gradient(135deg, rgba(255,51,85,0.08), rgba(255,51,85,0.04))", borderBottom: "0.5px solid rgba(255,51,85,0.14)" }}>
                  <div className="flex items-center gap-[6px]">
                    <AlertTriangle className="w-[13px] h-[13px]" style={{ color: "#FF3355" }} strokeWidth={2.4} />
                    <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: "#B01030" }}>{subject}</span>
                  </div>
                  <span className="px-[8px] py-[2px] rounded-full text-[10px] font-bold"
                    style={{ background: "rgba(255,51,85,0.12)", color: "#FF3355", border: "0.5px solid rgba(255,51,85,0.22)" }}>
                    {students.length} failed
                  </span>
                </div>
                <div>
                  {students.slice(0, 5).map((s: any, i: number, arr: any[]) => (
                    <div key={i} className="flex items-center justify-between px-4 py-[10px]"
                      style={i < Math.min(arr.length, 5) - 1 ? { borderBottom: "0.5px solid rgba(255,51,85,0.05)" } : {}}>
                      <div className="flex items-center gap-[8px] min-w-0">
                        <div className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ background: "linear-gradient(135deg, #FF3355, #FF6688)", boxShadow: "0 2px 6px rgba(255,51,85,0.22)" }}>
                          {s.studentName?.substring(0, 2).toUpperCase()}
                        </div>
                        <p className="text-[12px] font-semibold truncate" style={{ color: "#001040" }}>{s.studentName}</p>
                      </div>
                      <span className="text-[12px] font-bold shrink-0 ml-2" style={{ color: "#FF3355" }}>{Math.round(s.percentage)}%</span>
                    </div>
                  ))}
                  {students.length > 5 && (
                    <p className="px-4 py-[7px] text-[10px] font-semibold" style={{ color: "#99AACC" }}>+{students.length - 5} more</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* All exams */}
      {!loading && examGroups.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: "#99AACC" }}>
            All Exams
            <span className="px-[10px] py-[3px] rounded-full text-[10px] font-bold ml-1"
              style={{ background: "rgba(0,85,255,0.10)", color: "#0055FF", border: "0.5px solid rgba(0,85,255,0.16)" }}>
              {examGroups.length} {examGroups.length === 1 ? "exam" : "exams"}
            </span>
            <div className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
          </div>
          <div className="rounded-[22px] bg-white overflow-hidden"
            style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr style={{ background: "rgba(0,85,255,0.04)", borderBottom: "0.5px solid rgba(0,85,255,0.07)" }}>
                    {["Exam Name", "Date", "Students", "Pass Rate", "Avg %", ""].map(h => (
                      <th key={h} className="px-6 py-[14px] text-left text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "#99AACC" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {examGroups.map((exam, i, arr) => {
                    const passColor = exam.passRate >= 75 ? "#00C853" : exam.passRate >= 50 ? "#FF8800" : "#FF3355";
                    const avgColor = exam.avgPct >= 70 ? "#00C853" : exam.avgPct >= 50 ? "#FF8800" : "#FF3355";
                    return (
                      <tr key={i} className="transition-colors hover:bg-[#F5F9FF]"
                        style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(0,85,255,0.05)" } : {}}>
                        <td className="px-6 py-[14px]">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0"
                              style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 3px 10px rgba(0,85,255,0.28)" }}>
                              <FileText className="w-[16px] h-[16px] text-white" strokeWidth={2.3} />
                            </div>
                            <span className="text-[13px] font-bold tracking-[-0.2px] capitalize" style={{ color: "#001040" }}>{exam.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-[14px] text-[12px] font-semibold" style={{ color: "#5070B0" }}>{exam.dateLabel || "—"}</td>
                        <td className="px-6 py-[14px] text-[13px] font-bold" style={{ color: "#001040" }}>{exam.totalStudents}</td>
                        <td className="px-6 py-[14px]">
                          <span className="px-[10px] py-[4px] rounded-full text-[12px] font-bold"
                            style={{ background: `${passColor}15`, color: passColor, border: `0.5px solid ${passColor}35` }}>
                            {exam.passRate}%
                          </span>
                        </td>
                        <td className="px-6 py-[14px]">
                          <span className="text-[13px] font-bold" style={{ color: avgColor }}>{exam.avgPct}%</span>
                        </td>
                        <td className="px-6 py-[14px]">
                          <button onClick={() => setSelectedExam(exam)}
                            className="h-9 px-4 rounded-[11px] flex items-center gap-[5px] text-[11px] font-bold text-white transition-transform active:scale-95 hover:scale-[1.03] relative overflow-hidden whitespace-nowrap"
                            style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 3px 10px rgba(0,85,255,0.26)" }}>
                            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                            <span className="relative z-10">View Results</span>
                            <ChevronRight className="w-3 h-3 relative z-10" strokeWidth={2.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && examGroups.length === 0 && (
        <div className="rounded-[22px] py-16 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 16px 40px rgba(0,85,255,.13)", border: "0.5px solid rgba(0,85,255,0.10)" }}>
          <div className="w-16 h-16 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.14)" }}>
            <FileText className="w-7 h-7" style={{ color: "rgba(0,85,255,0.45)" }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-bold mb-1" style={{ color: "#001040" }}>No exam results yet</p>
          <p className="text-[12px]" style={{ color: "#99AACC" }}>Teachers submit scores via Teacher Dashboard → Tests &amp; Exams.</p>
        </div>
      )}
    </div>
  );
}
