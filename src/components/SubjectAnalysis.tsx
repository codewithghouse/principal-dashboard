import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ChevronLeft, TrendingUp, TrendingDown,
  Loader2, User, Printer,
} from "lucide-react";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { pctOfDoc } from "@/lib/scoreUtils";

// ─── helpers ─────────────────────────────────────────────────────────────────
// Tier thresholds — kept consistent across barColor + headerColor + teacher
// avgColor (B16: was three different cutoffs, leading to amber bars under a
// "green" header).
const TIER_GREEN = 75;
const TIER_AMBER = 60;

const barColor = (v: number): string =>
  v >= TIER_GREEN ? "#22c55e" : v >= TIER_AMBER ? "#f59e0b" : "#ef4444";

const tierTextColor = (v: number): string =>
  v >= TIER_GREEN ? "text-green-600" : v >= TIER_AMBER ? "text-amber-500" : "text-red-500";

const tierHeaderBg = (v: number): string =>
  v >= TIER_GREEN ? "bg-green-50 border-green-100"
  : v >= TIER_AMBER ? "bg-amber-50 border-amber-100"
  : "bg-red-50 border-red-100";

// Robust initials — strips whitespace, filters falsy chars (B15: "" or " "
// previously yielded "UNDEFINED").
const safeInitials = (name: string): string =>
  (name || "")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// ─── props ────────────────────────────────────────────────────────────────────
interface SubjectAnalysisProps {
  subject: {
    name: string;
    avg: string;
    avgNum?: number;
    icon: any;
    iconBg?: string;
    iconColor?: string;
    teacherIds?: string[];
    totalStudents?: number;
  };
  onBack: () => void;
}

// ─── component ────────────────────────────────────────────────────────────────
const SubjectAnalysis = ({ subject, onBack }: SubjectAnalysisProps) => {
  const { userData } = useAuth();

  // ── state ──────────────────────────────────────────────────────────────────
  const [sectionData,      setSectionData]      = useState<any[]>([]);
  const [marksDistData,    setMarksDistData]    = useState<any[]>([]);
  const [teacherData,      setTeacherData]      = useState<any[]>([]);
  const [insights,         setInsights]         = useState<{ top: any; weak: any | null; issues: string[] } | null>(null);
  const [totalStudents,    setTotalStudents]    = useState(subject.totalStudents || 0);
  const [computedAvg,      setComputedAvg]      = useState<number | null>(null);
  const [hasData,          setHasData]          = useState(false);
  const [loading,          setLoading]          = useState(true);

  const resultsRef    = useRef<any[]>([]);
  const testScoresRef = useRef<any[]>([]);
  const gradebookRef  = useRef<any[]>([]);
  // Debounce token for the burst-coalescing recompute (memory:
  // 80ms debounced compute pattern eliminates initial-burst thrash).
  const recomputeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schoolId = userData?.schoolId || userData?.school || "";
  const branchId = userData?.branchId || "";

  // Stable key for the assigned-teachers list — used as a stable useEffect dep
  // so a teacher reassignment in the parent triggers re-evaluation (B1).
  const teacherIdsKey = useMemo(
    () => (subject.teacherIds || []).slice().sort().join("|"),
    [subject.teacherIds],
  );

  // ── load data ─────────────────────────────────────────────────────────────
  // - schoolId-only server-side; branchId in-memory (memory: branchid_inference_lag)
  // - 3 score collections live-merged (results + test_scores + gradebook_scores)
  // - Teachers via onSnapshot (B4: was getDocs once, leaving stale names when
  //   a teacher was added or their subject field updated post-mount)
  // - 80ms debounced recompute (B3: prevents 3-listener initial-burst thrash)
  // - useEffect deps include teacherIdsKey + subject.name (B1)
  useEffect(() => {
    if (!schoolId) {
      // No school context — bail early, leave UI in empty state. Was: silent
      // return left the spinner spinning forever (B21).
      setLoading(false);
      setHasData(false);
      return;
    }

    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    const teacherMapLocal: Record<string, { name: string; subject: string }> = {};
    let mapReady = false;

    const subjectMatches = (r: any): boolean => {
      // Match by EITHER teacherIds list OR subject field — accept whichever
      // hits (was: strict precedence which made substitute teachers' scores
      // invisible if they weren't on the original assignment list).
      const tid = r.teacherId;
      if (tid && subject.teacherIds?.includes(tid)) return true;
      const subj = String(r.subject ?? r.subjectName ?? teacherMapLocal[tid]?.subject ?? "").toLowerCase();
      return subj === subject.name.toLowerCase();
    };

    const runRecompute = () => {
      if (!mapReady) return;
      const merged = [
        ...resultsRef.current.filter(inBranch),
        ...testScoresRef.current.filter(inBranch),
        ...gradebookRef.current.filter(inBranch),
      ];
      const subjectResults = merged.filter(subjectMatches);
      computeFromResults(subjectResults, teacherMapLocal);
    };

    const scheduleRecompute = () => {
      if (recomputeTimer.current) clearTimeout(recomputeTimer.current);
      recomputeTimer.current = setTimeout(runRecompute, 80);
    };

    const uTeachers = onSnapshot(
      query(collection(db, "teachers"), where("schoolId", "==", schoolId)),
      (snap) => {
        Object.keys(teacherMapLocal).forEach((k) => delete teacherMapLocal[k]);
        snap.docs.forEach((d) => {
          const t = d.data() as any;
          if (!inBranch(t)) return;
          teacherMapLocal[d.id] = {
            name:    t.name    || t.teacherName || "Teacher",
            // Don't fabricate "General" — let downstream check actual presence.
            subject: t.subject || t.subjectName || "",
          };
        });
        mapReady = true;
        scheduleRecompute();
      },
      (err) => console.warn("[SubjectAnalysis] teachers listener failed:", err),
    );

    const u1 = onSnapshot(
      query(collection(db, "results"), where("schoolId", "==", schoolId)),
      (snap) => { resultsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); scheduleRecompute(); },
      (err) => console.warn("[SubjectAnalysis] results listener failed:", err),
    );
    const u2 = onSnapshot(
      query(collection(db, "test_scores"), where("schoolId", "==", schoolId)),
      (snap) => { testScoresRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); scheduleRecompute(); },
      (err) => console.warn("[SubjectAnalysis] test_scores listener failed:", err),
    );
    const u3 = onSnapshot(
      query(collection(db, "gradebook_scores"), where("schoolId", "==", schoolId)),
      (snap) => { gradebookRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); scheduleRecompute(); },
      (err) => console.warn("[SubjectAnalysis] gradebook_scores listener failed:", err),
    );

    // Safety timer — unblock spinner after 5s if all listeners denied/empty.
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    return () => {
      clearTimeout(safetyTimer);
      if (recomputeTimer.current) clearTimeout(recomputeTimer.current);
      uTeachers(); u1(); u2(); u3();
    };
  }, [schoolId, branchId, subject.name, teacherIdsKey]);

  const computeFromResults = (
    results: any[],
    teacherMap: Record<string, { name: string; subject: string }>
  ) => {
    // Cross-collection dedup (memory: same exam mirrored to results +
    // test_scores wouldn't double-count). Drops null-pct docs entirely —
    // never feeds fabricated 0s into averages or distribution buckets.
    const fpSeen = new Set<string>();
    const deduped: { raw: any; _pct: number }[] = [];
    results.forEach((r) => {
      const p = pctOfDoc(r);
      if (p === null) return;
      const subjKey = String(r.subject ?? r.subjectName ?? "").toLowerCase();
      const ts = r.timestamp ?? r.createdAt ?? r.date;
      const dateK = (() => {
        if (!ts) return "";
        if (typeof ts === "string") return ts.slice(0, 10);
        if (ts?.toDate) return ts.toDate().toISOString().slice(0, 10);
        return "";
      })();
      const studentKey = String(r.studentId || r.studentEmail || "").toLowerCase();
      const fp = `${studentKey}|${subjKey}|${dateK}|${Math.round(p * 10)}`;
      if (fpSeen.has(fp)) return;
      fpSeen.add(fp);
      deduped.push({ raw: r, _pct: p });
    });

    if (deduped.length === 0) {
      setSectionData([]);
      setMarksDistData([]);
      setTeacherData([]);
      setInsights(null);
      setComputedAvg(null);
      setTotalStudents(0); // B18: don't fall back to parent prop when zero data
      setHasData(false);
      setLoading(false);
      return;
    }
    setHasData(true);

    // ── 1. Section-wise performance ─────────────────────────────────────────
    const classGroups: Record<string, { scores: number[]; className: string; teacherName: string }> = {};
    deduped.forEach(({ raw, _pct }) => {
      const cid   = raw.classId   || "Unknown";
      const cName = raw.className || cid;
      const tName = teacherMap[raw.teacherId]?.name || raw.teacherName || "—";
      if (!classGroups[cid]) classGroups[cid] = { scores: [], className: cName, teacherName: tName };
      classGroups[cid].scores.push(_pct);
    });

    const sections = Object.entries(classGroups).map(([, cb]) => {
      const avg = Math.round(cb.scores.reduce((a, b) => a + b, 0) / cb.scores.length);
      return { section: cb.className, value: avg, color: barColor(avg), teacherName: cb.teacherName };
    }).sort((a, b) => a.value - b.value);

    setSectionData(sections);

    // ── 2. Performance Insights ─────────────────────────────────────────────
    // Top vs Weakest only makes sense with ≥2 sections — with a single
    // section the two pointers collapse to the same row and the UI shows the
    // same name as both "Top Performing" and "Weakest" (B29). When that
    // happens we surface ONE card; the renderer keys off `weak == null`.
    if (sections.length > 0) {
      const top  = sections[sections.length - 1];
      const weak = sections.length >= 2 ? sections[0] : null;

      const issues: string[] = [];
      const lowSections = sections.filter((s) => s.value < TIER_AMBER);
      if (lowSections.length > 0) {
        // Truncate the section list at 4 names to avoid an overflowing comma-list
        const names = lowSections.map(s => s.section);
        const shown = names.slice(0, 4).join(", ") + (names.length > 4 ? `, +${names.length - 4} more` : "");
        issues.push(`${lowSections.length} section(s) scoring below ${TIER_AMBER}% (${shown})`);
      }
      const allScoresLocal = deduped.map((d) => d._pct);
      const passRate  = Math.round(allScoresLocal.filter((s) => s >= 40).length / allScoresLocal.length * 100);
      if (passRate < 80) issues.push(`Pass rate is ${passRate}% — ${100 - passRate}% students below passing marks`);
      const avgScore  = Math.round(allScoresLocal.reduce((a, b) => a + b, 0) / allScoresLocal.length);
      if (avgScore < TIER_AMBER) issues.push(`Overall subject average (${avgScore}%) needs improvement`);
      if (issues.length === 0) issues.push(`Performance is stable — maintain assessment frequency`);

      setInsights({ top, weak, issues });
    }

    // ── 3. Marks distribution ───────────────────────────────────────────────
    const allScores = deduped.map((d) => d._pct);
    setMarksDistData([
      { range: "0-20",   students: allScores.filter((s) => s <= 20).length,            color: "#ef4444" },
      { range: "21-40",  students: allScores.filter((s) => s > 20 && s <= 40).length,  color: "#f97316" },
      { range: "41-60",  students: allScores.filter((s) => s > 40 && s <= 60).length,  color: "#f59e0b" },
      { range: "61-80",  students: allScores.filter((s) => s > 60 && s <= 80).length,  color: "#1e3a8a" },
      { range: "81-100", students: allScores.filter((s) => s > 80).length,             color: "#22c55e" },
    ]);

    // ── 4. Teacher effectiveness ────────────────────────────────────────────
    // Skip phantom "unknown" teacher — only real teacherIds with a name make
    // the list. Grades are sorted alphabetically (B28) and shown with a "+N"
    // overflow indicator so a teacher with many classes doesn't visually
    // overflow the row (B14).
    const teacherGroups: Record<string, { name: string; scores: number[]; grades: Set<string> }> = {};
    deduped.forEach(({ raw, _pct }) => {
      const tid = raw.teacherId;
      if (!tid) return;
      const tName = teacherMap[tid]?.name || raw.teacherName || "";
      if (!tName) return; // skip teachers we can't identify
      const cName = raw.className || "—";
      if (!teacherGroups[tid]) teacherGroups[tid] = { name: tName, scores: [], grades: new Set() };
      teacherGroups[tid].scores.push(_pct);
      teacherGroups[tid].grades.add(cName);
    });

    const colors = ["#1e3a8a", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"];
    const teachers = Object.entries(teacherGroups).map(([tid, data], idx) => {
      const avg = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
      const allGrades = Array.from(data.grades).sort((a, b) => a.localeCompare(b));
      const shownGrades = allGrades.slice(0, 3).join(", ");
      const extra = allGrades.length - 3;
      return {
        id:       tid,
        name:     data.name,
        grades:   allGrades.length === 0 ? "—" : extra > 0 ? `${shownGrades} · +${extra}` : shownGrades,
        avg,
        avgColor: barColor(avg), // B16: align with the bar tier scheme
        initials: safeInitials(data.name), // B15: tolerates empty/whitespace names
        avatarBg: colors[idx % colors.length],
      };
    }).sort((a, b) => b.avg - a.avg); // highest-performing teacher first
    setTeacherData(teachers);

    // ── 5. Total students — dual-key (studentId OR studentEmail) ────────────
    // Was: only `studentId` set membership which silently missed legacy
    // email-keyed bulk imports.
    const uniqueStudents = new Set(
      deduped
        .map((d) => d.raw.studentId || (d.raw.studentEmail || "").toLowerCase())
        .filter(Boolean)
    );
    setTotalStudents(uniqueStudents.size); // B18: drop fabricated parent-prop fallback

    // Live overall average (B9, B10): single source of truth for header colour
    // AND export — was: header used parent-passed `subject.avg` while exporter
    // recomputed from sectionData (different weighting), so the two could
    // disagree. Now both read `computedAvg` derived from real per-student
    // dedup'd scores.
    const overall = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    setComputedAvg(Math.round(overall));

    setLoading(false);
  };

  // ── export PDF ─────────────────────────────────────────────────────────────
  // Uses the live `computedAvg` (derived from deduped per-student scores) as
  // the single source of truth — was: subtitle showed parent prop avg while
  // hero color was recomputed from section averages (different weightings),
  // so the two could disagree.
  const handleExportPDF = () => {
    const avgLabel = computedAvg !== null ? `${computedAvg}%` : "—";
    const html = buildReport({
      title: `${subject.name} — Subject Analysis`,
      subtitle: `Overall Average: ${avgLabel} · ${totalStudents} students`,
      badge: subject.name,
      heroStats: [
        { label: "Overall Average", value: avgLabel, color: computedAvg === null ? "#9ca3af" : barColor(computedAvg) },
        { label: "Total Students",  value: totalStudents },
        { label: "Sections",        value: sectionData.length },
        { label: "Teachers",        value: teacherData.length },
      ],
      sections: [
        {
          title: "Section-wise Performance",
          type: "table",
          headers: ["Section", "Avg Score", "Teacher"],
          rows: sectionData.map(s => ({
            cells: [s.section, `${s.value}%`, s.teacherName],
            highlight: s.value < TIER_AMBER,
          })),
        },
        {
          title: "Teacher Effectiveness",
          type: "table",
          headers: ["Teacher", "Classes", "Avg Score"],
          rows: teacherData.map(t => ({
            cells: [t.name, t.grades, `${t.avg}%`],
            highlight: t.avg < TIER_AMBER,
          })),
        },
        ...(insights?.issues?.length ? [{
          title: "Key Issues Identified",
          type: "list" as const,
          items: insights.issues,
        }] : []),
      ],
    });
    openReportWindow(html);
  };

  // ── render ────────────────────────────────────────────────────────────────
  // Header colour + label use the LIVE computed average so it matches what's
  // actually plotted. Falls back to the parent-passed `subject.avgNum` only
  // when we genuinely have no data yet (e.g. first paint before listeners
  // settle). `parseInt` was using `?? 0` which is broken for NaN — now we
  // explicitly Number-coerce and isFinite-check (B8/B19).
  const parsePropAvg = (): number | null => {
    if (typeof subject.avgNum === "number" && Number.isFinite(subject.avgNum)) return subject.avgNum;
    const n = Number.parseFloat(String(subject.avg ?? ""));
    return Number.isFinite(n) ? n : null;
  };
  const propAvg = parsePropAvg();
  const displayAvg = computedAvg ?? propAvg;        // null when we truly have nothing
  const displayAvgLabel = displayAvg === null ? "—" : `${displayAvg}%`;
  const headerBg = displayAvg === null ? "bg-slate-50 border-slate-100" : tierHeaderBg(displayAvg);
  const avgColor = displayAvg === null ? "text-slate-400" : tierTextColor(displayAvg);

  return (
    <div className="animate-in fade-in duration-500 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <button onClick={onBack} className="hover:text-foreground transition-colors">Academics</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Subject Analysis</span>
      </div>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={`rounded-2xl p-6 mb-6 flex items-center justify-between border shadow-sm ${headerBg}`}>
        <div className="flex items-center gap-5">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm ${subject.iconBg || "bg-slate-100"}`}>
            <subject.icon className={`w-7 h-7 ${subject.iconColor || "text-slate-500"}`} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">{subject.name}</h1>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              Overall Average: <span className={`font-black ${avgColor}`}>{displayAvgLabel}</span>
              {totalStudents > 0 && <><span className="mx-2">•</span>{totalStudents} students</>}
            </p>
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-bold bg-card text-foreground hover:bg-secondary transition-colors"
          >
            <Printer className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" />
        </div>
      ) : (
        <>
          {/* ── TOP ROW: Section Performance + Insights ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Section-wise Performance */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-foreground mb-5">Section-wise Performance</h3>
              {sectionData.length === 0 ? (
                <div className="flex items-center justify-center h-52 text-slate-400 text-sm font-bold">
                  No section data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, sectionData.length * 42)}>
                  <BarChart data={sectionData} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 5 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis
                      type="number" domain={[0, 100]}
                      axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category" dataKey="section"
                      axisLine={false} tickLine={false}
                      tick={{ fontSize: 12, fontWeight: 700, fill: "#64748b" }}
                      width={40}
                    />
                    <Tooltip
                      content={({ active, payload }: any) =>
                        active && payload?.length ? (
                          <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
                            {payload[0].payload.section}: {payload[0].value}%
                          </div>
                        ) : null
                      }
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={1000} barSize={20}
                      label={{ position: "right", fontSize: 11, fontWeight: 700, fill: "#64748b", formatter: (v: number) => `${v}%` }}
                    >
                      {sectionData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Performance Insights */}
            <div className="space-y-4">
              {/* Top / Single Section card.
                  When only one section has data, label it "Section
                  Performance" and use a tier-coloured icon — was: showed
                  the same row twice as both "Top" and "Weakest". */}
              {(() => {
                const isSingle = !!insights?.top && !insights?.weak;
                const top = insights?.top;
                const tierClr = top ? barColor(top.value) : "#94a3b8";
                return (
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: isSingle ? `${tierClr}15` : "#f0fdf4" }}
                      >
                        <TrendingUp className="w-4 h-4" style={{ color: isSingle ? tierClr : "#22c55e" }} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground mb-1">
                          {isSingle ? "Section Performance" : "Top Performing Section"}
                        </h4>
                        {top ? (
                          <p className="text-sm text-muted-foreground font-medium">
                            <span className="font-black text-foreground">{top.section}</span> with{" "}
                            <span className="font-black" style={{ color: isSingle ? tierClr : "#16a34a" }}>{top.value}%</span> average
                            {top.teacherName !== "—" && ` (${top.teacherName})`}
                            {isSingle && (
                              <span className="block text-xs text-slate-400 mt-1 font-medium">
                                Only one section has data so far — comparison unavailable.
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-400">No section data yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Weakest Section — rendered only when ≥2 sections exist. */}
              {insights?.weak && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground mb-1">Weakest Section</h4>
                      <p className="text-sm text-muted-foreground font-medium">
                        <span className="font-black text-foreground">{insights.weak.section}</span> with{" "}
                        <span className="text-red-500 font-black">{insights.weak.value}%</span> average
                        {insights.weak.teacherName !== "—" && ` (${insights.weak.teacherName})`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Key Issues */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex-1">
                <h4 className="text-sm font-bold text-foreground mb-3">Key Issues Identified</h4>
                {/* B13: distinguish "no issues found" (good news) from "no
                    data uploaded yet" (neutral). Was: showed "No issues to
                    report" in both cases, masking missing data. */}
                {!hasData ? (
                  <p className="text-sm text-slate-400 font-medium">
                    No exam scores recorded for this subject yet.
                  </p>
                ) : insights?.issues?.length ? (
                  <ul className="space-y-2.5">
                    {insights.issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground font-medium">
                        <span className="text-slate-400 mt-1.5 shrink-0">•</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 font-medium">
                    No issues to report — performance is stable.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── BOTTOM ROW: Marks Distribution + Teacher Effectiveness ─────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Student Marks Distribution */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-foreground mb-5">Student Marks Distribution</h3>
              {marksDistData.every((d) => d.students === 0) ? (
                <div className="flex items-center justify-center h-52 text-slate-400 text-sm font-bold">
                  No marks data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={marksDistData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="range" axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }}
                    />
                    <YAxis
                      axisLine={false} tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                    />
                    <Tooltip
                      content={({ active, payload }: any) =>
                        active && payload?.length ? (
                          <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
                            {payload[0].payload.range}: {payload[0].value} students
                          </div>
                        ) : null
                      }
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    />
                    <Bar dataKey="students" radius={[4, 4, 0, 0]} animationDuration={1000}>
                      {marksDistData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Teacher Effectiveness */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-foreground mb-5">Teacher Effectiveness</h3>
              {teacherData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                  <User className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm font-bold">No teacher data found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teacherData.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-4 border border-border rounded-xl bg-secondary/20 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-sm"
                          style={{ backgroundColor: t.avatarBg }}
                        >
                          {t.initials}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{t.name}</p>
                          <p className="text-xs text-muted-foreground font-medium">{t.grades}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black" style={{ color: t.avgColor }}>{t.avg}%</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">avg</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Back button */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Academics
        </button>
      </div>
    </div>
  );
};

export default SubjectAnalysis;
