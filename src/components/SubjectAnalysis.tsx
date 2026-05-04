import React, { useState, useEffect, useRef } from "react";
import {
  ChevronLeft, Download, TrendingUp, TrendingDown,
  Loader2, User, Users, Printer,
} from "lucide-react";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { pctOfDoc } from "@/lib/scoreUtils";

// ─── helpers ─────────────────────────────────────────────────────────────────
// Wraps shared `pctOfDoc` (returns null for missing data, handles all 4 score
// schemas). Was: defaulted to 0 → fabricated low-end bucket counts and
// dragged subject averages toward zero (memory: bug_pattern_score_zero_no_data).
const getScore = (r: any): number | null => pctOfDoc(r);

const barColor = (v: number) => v >= 75 ? "#22c55e" : v >= 55 ? "#f59e0b" : "#ef4444";

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
  const [insights,         setInsights]         = useState<{ top: any; weak: any; issues: string[] } | null>(null);
  const [totalStudents,    setTotalStudents]    = useState(subject.totalStudents || 0);
  const [loading,          setLoading]          = useState(true);

  const resultsRef    = useRef<any[]>([]);
  const testScoresRef = useRef<any[]>([]);
  const gradebookRef  = useRef<any[]>([]);

  const schoolId = userData?.schoolId || userData?.school || "";
  const branchId = userData?.branchId || "";

  // ── load data ─────────────────────────────────────────────────────────────
  // P0 fixes:
  //  - schoolId-only server-side; branchId in-memory (memory: branchid_inference_lag)
  //  - 3 score collections live-merged (results + test_scores + gradebook_scores)
  //    — bulk-upload schools used to see "No data" because they write to
  //    test_scores/gradebook_scores instead of results.
  //  - Real errLog handlers replace silent .then() / no-error onSnapshot.
  //  - Subject-match fallback covers BOTH teacherIds-strict AND result-subject-loose
  //    so a substitute teacher's score isn't lost just because they're not in
  //    the original assignment list.
  useEffect(() => {
    if (!schoolId) return;

    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    // Step 1: Build teacher → subject map for this school
    const teacherMapLocal: Record<string, { name: string; subject: string }> = {};
    let mapReady = false;
    let pendingRecompute = false;

    const subjectMatches = (r: any): boolean => {
      // Match by EITHER teacherIds list OR subject field — accept whichever
      // hits (was: strict precedence which made substitute teachers' scores
      // invisible if they weren't on the original assignment list).
      const tid = r.teacherId;
      if (tid && subject.teacherIds?.includes(tid)) return true;
      const subj = String(r.subject ?? r.subjectName ?? teacherMapLocal[tid]?.subject ?? "").toLowerCase();
      return subj === subject.name.toLowerCase();
    };

    const recompute = () => {
      if (!mapReady) { pendingRecompute = true; return; }
      const merged = [
        ...resultsRef.current.filter(inBranch),
        ...testScoresRef.current.filter(inBranch),
        ...gradebookRef.current.filter(inBranch),
      ];
      const subjectResults = merged.filter(subjectMatches);
      computeFromResults(subjectResults, teacherMapLocal);
    };

    getDocs(query(collection(db, "teachers"), where("schoolId", "==", schoolId)))
      .then((snap) => {
        snap.docs.forEach((d) => {
          const t = d.data();
          if (!inBranch(t)) return;
          teacherMapLocal[d.id] = {
            name:    t.name    || t.teacherName || "Teacher",
            // Don't fabricate "General" — let downstream check actual presence.
            subject: t.subject || t.subjectName || "",
          };
        });
        mapReady = true;
        if (pendingRecompute) recompute();
      })
      .catch((err) => console.warn("[SubjectAnalysis] teacher map fetch failed:", err));

    const u1 = onSnapshot(
      query(collection(db, "results"), where("schoolId", "==", schoolId)),
      (snap) => { resultsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); recompute(); },
      (err) => console.warn("[SubjectAnalysis] results listener failed:", err),
    );
    const u2 = onSnapshot(
      query(collection(db, "test_scores"), where("schoolId", "==", schoolId)),
      (snap) => { testScoresRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); recompute(); },
      (err) => console.warn("[SubjectAnalysis] test_scores listener failed:", err),
    );
    const u3 = onSnapshot(
      query(collection(db, "gradebook_scores"), where("schoolId", "==", schoolId)),
      (snap) => { gradebookRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); recompute(); },
      (err) => console.warn("[SubjectAnalysis] gradebook_scores listener failed:", err),
    );

    // Safety timer — unblock spinner after 5s if all listeners denied/empty
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    return () => { clearTimeout(safetyTimer); u1(); u2(); u3(); };
  }, [schoolId, branchId, subject.name]);

  const computeFromResults = (
    results: any[],
    teacherMap: Record<string, { name: string; subject: string }>
  ) => {
    // Cross-collection dedup (memory: same exam mirrored to results +
    // test_scores wouldn't double-count). Also drops null-pct docs entirely
    // — never feeds fabricated 0s into averages or distribution buckets.
    const fpSeen = new Set<string>();
    const deduped: { raw: any; _pct: number }[] = [];
    results.forEach((r) => {
      const p = getScore(r);
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
      setTotalStudents(subject.totalStudents || 0);
      setLoading(false);
      return;
    }

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
    if (sections.length > 0) {
      const top  = sections[sections.length - 1];
      const weak = sections[0];

      const issues: string[] = [];
      const lowSections = sections.filter((s) => s.value < 60);
      if (lowSections.length > 0) {
        // Truncate the section list at 4 names to avoid an overflowing comma-list
        const names = lowSections.map(s => s.section);
        const shown = names.slice(0, 4).join(", ") + (names.length > 4 ? `, +${names.length - 4} more` : "");
        issues.push(`${lowSections.length} section(s) scoring below 60% (${shown})`);
      }
      const allScores = deduped.map((d) => d._pct);
      const passRate  = Math.round(allScores.filter((s) => s >= 40).length / allScores.length * 100);
      if (passRate < 80) issues.push(`Pass rate is ${passRate}% — ${100 - passRate}% students below passing marks`);
      const avgScore  = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
      if (avgScore < 60) issues.push(`Overall subject average (${avgScore}%) needs improvement`);
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
    // Skip phantom "unknown" teacher — was rendering as a row before, now
    // only real teacherIds with a name make the list.
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
      return {
        id:       tid,
        name:     data.name,
        grades:   Array.from(data.grades).slice(0, 3).join(", ") || "—",
        avg,
        avgColor: avg < 60 ? "#ef4444" : avg < 75 ? "#f59e0b" : "#22c55e",
        initials: data.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
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
    setTotalStudents(uniqueStudents.size || subject.totalStudents || 0);

    setLoading(false);
  };

  // ── export PDF ─────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    const allScores = sectionData.map(s => s.value);
    const overallAvg = allScores.length
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : subject.avgNum ?? 0;
    const html = buildReport({
      title: `${subject.name} — Subject Analysis`,
      subtitle: `Overall Average: ${subject.avg} · ${totalStudents} students`,
      badge: subject.name,
      heroStats: [
        { label: "Overall Average", value: subject.avg, color: overallAvg >= 75 ? "#4ade80" : overallAvg >= 55 ? "#fbbf24" : "#f87171" },
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
            highlight: s.value < 60,
          })),
        },
        {
          title: "Teacher Effectiveness",
          type: "table",
          headers: ["Teacher", "Classes", "Avg Score"],
          rows: teacherData.map(t => ({
            cells: [t.name, t.grades, `${t.avg}%`],
            highlight: t.avg < 60,
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
  const avgNum = subject.avgNum ?? parseInt(subject.avg) ?? 0;
  const headerBg = avgNum < 60 ? "bg-red-50 border-red-100" : avgNum < 75 ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100";
  const avgColor = avgNum < 60 ? "text-red-500" : avgNum < 75 ? "text-amber-500" : "text-green-600";

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
              Overall Average: <span className={`font-black ${avgColor}`}>{subject.avg}</span>
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
                      cursor={{ fill: "rgba(0,0,0,0.02)" }}
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
              {/* Top Performing Section */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">Top Performing Section</h4>
                    {insights?.top ? (
                      <p className="text-sm text-muted-foreground font-medium">
                        <span className="font-black text-foreground">{insights.top.section}</span> with{" "}
                        <span className="text-green-600 font-black">{insights.top.value}%</span> average
                        {insights.top.teacherName !== "—" && ` (${insights.top.teacherName})`}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">No section data yet</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Weakest Section */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">Weakest Section</h4>
                    {insights?.weak ? (
                      <p className="text-sm text-muted-foreground font-medium">
                        <span className="font-black text-foreground">{insights.weak.section}</span> with{" "}
                        <span className="text-red-500 font-black">{insights.weak.value}%</span> average
                        {insights.weak.teacherName !== "—" && ` (${insights.weak.teacherName})`}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">No section data yet</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Key Issues */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex-1">
                <h4 className="text-sm font-bold text-foreground mb-3">Key Issues Identified</h4>
                <ul className="space-y-2.5">
                  {(insights?.issues || ["No issues to report"]).map((issue, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground font-medium">
                      <span className="text-slate-400 mt-1.5 shrink-0">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
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
                      cursor={{ fill: "rgba(0,0,0,0.02)" }}
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
