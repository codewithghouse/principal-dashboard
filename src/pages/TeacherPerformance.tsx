import { useState, useEffect } from "react";
import {
  GraduationCap, TrendingUp, TrendingDown, Minus,
  BarChart3, ChevronRight, Loader2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import TeacherProfile from "@/components/TeacherProfile";

// ── helpers ──────────────────────────────────────────────────────────────────
const grade = (pct: number) => pct >= 85 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : "D";
const gradeColor = (g: string) => g === "A" ? "text-green-600 bg-green-50" : g === "B" ? "text-blue-600 bg-blue-50" : g === "C" ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";

// robust score parser matches TeacherProfile.tsx pattern — handles percentage, marks/totalMarks, etc.
const getScore = (r: any): number => {
  if (typeof r.percentage === "number" && r.percentage > 0) return Math.round(r.percentage);
  const pctStr = parseFloat(r.percentage ?? "");
  if (!isNaN(pctStr) && pctStr > 0) return Math.round(pctStr);
  const raw = r.marksObtained ?? r.marks ?? r.score ?? null;
  if (raw === null || raw === undefined || raw === "") return 0;
  const total = r.totalMarks ?? r.maxMarks ?? r.outOf ?? 100;
  const rawN = Number(raw), totN = Number(total);
  if (isNaN(rawN)) return 0;
  return totN > 0 ? Math.round((rawN / totN) * 100) : Math.min(100, Math.round(rawN));
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v?.seconds) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

interface TeacherStat {
  id: string;
  name: string;
  raw: any;               // original teacher doc for TeacherProfile component
  subjects: string[];
  classes: string[];      // human-readable class names
  classIds: string[];     // underlying ids for joins
  avgScore: number | null;
  prevAvgScore: number | null;
  studentCount: number;
  classCount: number;
  topSubject: string;
  weakSubject: string;
  monthlyScores: { month: string; avg: number }[];
  vsSchoolAvg: number | null;
  // activity & feedback
  testsCreated: number;
  assignmentsCreated: number;
  lessonPlansCount: number;
  parentNotesCount: number;
  rating: number | null;      // 0-5
  reviewCount: number;
  reviews: { parentName?: string; studentName?: string; rating?: number; review?: string; comment?: string; createdAt?: any }[];
  // subject breakdown for drawer chart
  subjectBreakdown: { subject: string; avg: number; count: number }[];
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TeacherPerformance = () => {
  const { userData } = useAuth();
  const [teachers,    setTeachers]    = useState<TeacherStat[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<TeacherStat | null>(null);
  const [schoolAvg,   setSchoolAvg]   = useState<number>(0);
  const [search,      setSearch]      = useState("");

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);

    const schoolId = userData.schoolId;
    const branchId = userData?.branchId || "";
    const C: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) C.push(where("branchId", "==", branchId));

    // Some collections (tests, assignments, lessonPlans, parent_notes, teacher_reviews, results)
    // may not carry branchId — so only schoolId filter is safe there.
    const CS: any[] = [where("schoolId", "==", schoolId)];

    // ── Listen to teachers ────────────────────────────────────────────────
    const tUnsub = onSnapshot(
      query(collection(db, "teachers"), ...C),
      async (tSnap) => {
        const teacherDocs = tSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        // ── Fetch every relevant collection in parallel ───────────────────
        const safeGet = async (q: any) => {
          try { return await getDocs(q); } catch { return { docs: [] as any[] }; }
        };
        const [
          scoresSnap, assignSnap, classesSnap,
          testsSnap, assignmentsSnap, lessonsSnap,
          notesSnap, reviewsSnap, resultsSnap,
        ] = await Promise.all([
          safeGet(query(collection(db, "test_scores"),          ...C)),
          safeGet(query(collection(db, "teaching_assignments"), ...C)),
          safeGet(query(collection(db, "classes"),              ...C)),
          safeGet(query(collection(db, "tests"),                ...CS)),
          safeGet(query(collection(db, "assignments"),          ...CS)),
          safeGet(query(collection(db, "lessonPlans"),          ...CS)),
          safeGet(query(collection(db, "parent_notes"),         ...CS)),
          safeGet(query(collection(db, "teacher_reviews"),      ...CS)),
          safeGet(query(collection(db, "results"),              ...CS)),
        ]);

        const scores      = scoresSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const assigns     = assignSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const classDocs   = classesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const testDocs    = testsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const asgnDocs    = assignmentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const lessonDocs  = lessonsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const noteDocs    = notesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const reviewDocs  = reviewsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const resultDocs  = resultsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));

        // classId → name lookup
        const classNameById = new Map<string, string>();
        classDocs.forEach((c: any) => {
          const label = c.name || [c.grade, c.section].filter(Boolean).join(" ") || c.className;
          if (label) classNameById.set(c.id, label);
        });

        const now      = new Date();
        const cutoff30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        const cutoff60 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60);

        // Combine test_scores + results — both represent graded assessments created by teacher
        const allScoreRows = [...scores, ...resultDocs];

        // School-wide average (uses richer getScore — handles marks/totalMarks)
        const allPcts = allScoreRows.map(s => getScore(s)).filter(n => n > 0);
        const overallAvg = allPcts.length ? Math.round(allPcts.reduce((a,b)=>a+b,0) / allPcts.length) : 0;
        setSchoolAvg(overallAvg);

        const stats: TeacherStat[] = teacherDocs.map((t: any) => {
          // Classes & subjects from teaching_assignments + fallback to teacher doc
          const tAssigns = assigns.filter((a: any) => a.teacherId === t.id || a.teacherEmail === t.email);

          const subjectsSet = new Set<string>();
          tAssigns.forEach((a: any) => a.subject && subjectsSet.add(a.subject));
          if (t.subject) subjectsSet.add(t.subject);
          if (Array.isArray(t.subjects)) t.subjects.forEach((s: string) => s && subjectsSet.add(s));
          const subjects = [...subjectsSet];

          const classIdsSet = new Set<string>();
          tAssigns.forEach((a: any) => a.classId && classIdsSet.add(a.classId));
          // also pull classes where teacherId matches directly
          classDocs.forEach((c: any) => { if (c.teacherId === t.id) classIdsSet.add(c.id); });
          const classIds = [...classIdsSet];

          // Resolve to human-readable names — prefer classes collection, then teaching_assignments className
          const classes = classIds.map(cid => {
            if (classNameById.has(cid)) return classNameById.get(cid)!;
            const ta = tAssigns.find((a: any) => a.classId === cid);
            return ta?.className || cid;
          });

          // All score rows attributable to this teacher — match by teacherId OR classId
          const tScores = allScoreRows.filter(s =>
            s.teacherId === t.id ||
            (s.classId && classIds.includes(s.classId))
          );

          const pcts = tScores.map(s => getScore(s)).filter(n => n > 0);
          const avgScore = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0) / pcts.length) : null;

          // Previous 30-60 day avg for trend delta
          const prevScores = tScores.filter(s => {
            const d = toDate(s.createdAt || s.timestamp || s.date);
            return d && d >= cutoff60 && d < cutoff30;
          });
          const prevPcts = prevScores.map(s => getScore(s)).filter(n => n > 0);
          const prevAvg  = prevPcts.length ? Math.round(prevPcts.reduce((a,b)=>a+b,0) / prevPcts.length) : null;

          // Monthly trend (last 4 months) — use any available timestamp
          const months = Array.from({length:4}, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth()-3+i, 1);
            return { label: MONTH_NAMES[d.getMonth()], month: d.getMonth(), year: d.getFullYear() };
          });
          const monthlyScores = months.map(({ label, month, year }) => {
            const mScores = tScores.filter(s => {
              const ts = toDate(s.createdAt || s.timestamp || s.date);
              return ts && ts.getMonth() === month && ts.getFullYear() === year;
            });
            const mPcts = mScores.map(s => getScore(s)).filter(n => n > 0);
            return { month: label, avg: mPcts.length ? Math.round(mPcts.reduce((a,b)=>a+b,0)/mPcts.length) : 0 };
          });

          // Per-subject breakdown — consider subjectName / subject fallback
          const subjectMap: Record<string, number[]> = {};
          tScores.forEach(s => {
            const sub = s.subjectName || s.subject || (subjects[0] || "General");
            if (!subjectMap[sub]) subjectMap[sub] = [];
            const sc = getScore(s);
            if (sc > 0) subjectMap[sub].push(sc);
          });
          const subjectBreakdown = Object.entries(subjectMap)
            .map(([subject, vals]) => ({
              subject,
              count: vals.length,
              avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),
            }))
            .sort((a,b)=>b.avg-a.avg);
          const topSubject  = subjectBreakdown.length ? subjectBreakdown[0].subject : "—";
          const weakSubject = subjectBreakdown.length ? subjectBreakdown[subjectBreakdown.length-1].subject : "—";

          const studentCount = [...new Set(tScores.map(s => s.studentId || s.studentEmail).filter(Boolean))].length;

          // Activity counts — everything this teacher created
          const testsCreated       = testDocs.filter((d: any) => d.teacherId === t.id).length;
          const assignmentsCreated = asgnDocs.filter((d: any) => d.teacherId === t.id).length;
          const lessonPlansCount   = lessonDocs.filter((d: any) => d.teacherId === t.id).length;
          const parentNotesCount   = noteDocs.filter((d: any) => d.teacherId === t.id).length;

          // Ratings & reviews
          const tReviews = reviewDocs
            .filter((r: any) => r.teacherId === t.id)
            .sort((a: any, b: any) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
          const ratingVals = tReviews.map((r: any) => Number(r.rating)).filter(n => !isNaN(n) && n > 0);
          const rating = ratingVals.length
            ? Math.round((ratingVals.reduce((a,b)=>a+b,0) / ratingVals.length) * 10) / 10
            : (t.rating ? Number(t.rating) : null);

          return {
            id: t.id,
            name: t.name || t.teacherName || "Unknown",
            raw: t,
            subjects,
            classes,
            classIds,
            avgScore,
            prevAvgScore: prevAvg,
            studentCount,
            classCount: classes.length,
            topSubject,
            weakSubject,
            monthlyScores,
            vsSchoolAvg: avgScore != null ? avgScore - overallAvg : null,
            testsCreated,
            assignmentsCreated,
            lessonPlansCount,
            parentNotesCount,
            rating,
            reviewCount: tReviews.length,
            reviews: tReviews.slice(0, 5),
            subjectBreakdown,
          };
        });

        setTeachers(stats.filter(t => t.name !== "Unknown"));
        setLoading(false);
      }
    );
    return () => tUnsub();
  }, [userData?.schoolId, userData?.branchId]);

  const filtered = teachers.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subjects.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  const trend = (t: TeacherStat) => {
    if (t.avgScore == null || t.prevAvgScore == null) return null;
    const delta = t.avgScore - t.prevAvgScore;
    if (delta > 2)  return { icon: TrendingUp,   color: "text-green-500", label: `+${delta}%` };
    if (delta < -2) return { icon: TrendingDown,  color: "text-red-500",   label: `${delta}%` };
    return               { icon: Minus,          color: "text-slate-400",  label: "Stable" };
  };

  // ── When a teacher is selected, render the full TeacherProfile page (same layout as existing profile)
  if (selected) {
    return (
      <div className="animate-in fade-in duration-200">
        <TeacherProfile teacher={selected.raw} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e294b] tracking-tight">Teacher Performance</h1>
          <p className="text-sm text-slate-400 font-medium mt-0.5">Impact analysis — same subject across teachers, same teacher across classes</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2 border border-slate-100">
          <BarChart3 className="w-4 h-4 text-[#1e3a8a]" />
          <span className="text-xs font-bold text-[#1e294b]">School Avg: {schoolAvg}%</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by teacher or subject..."
          className="w-full pl-10 pr-4 h-10 bg-white border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 shadow-sm transition-all" />
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Teachers", value: teachers.length,  color: "text-blue-600",  bg: "bg-blue-50"  },
          { label: "Avg Class Score", value: `${schoolAvg}%`, color: "text-green-600", bg: "bg-green-50" },
          { label: "Top Performers", value: teachers.filter(t => (t.avgScore ?? 0) >= 80).length, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Needs Support",  value: teachers.filter(t => t.avgScore != null && t.avgScore < 60).length, color: "text-red-600", bg: "bg-red-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className={`text-2xl font-bold ${s.color}`}>{loading ? "—" : s.value}</div>
            <div className="text-xs text-slate-400 font-semibold mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Teacher Cards / Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-slate-100">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-100 text-center">
          <GraduationCap className="w-8 h-8 text-slate-200 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No teacher data found</p>
          <p className="text-xs text-slate-300 mt-1">Assign teachers to classes to see performance</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="bg-slate-50/50">
                  {["Teacher", "Subjects", "Classes", "Students", "Avg Score", "vs School", "Trend", "Detail"].map(h => (
                    <th key={h} className="py-4 px-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(t => {
                  const T     = trend(t);
                  const TIcon = T?.icon;
                  const g     = t.avgScore != null ? grade(t.avgScore) : "—";
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#1e3a8a]/10 flex items-center justify-center text-[11px] font-black text-[#1e3a8a]">
                            {t.name.substring(0,2).toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-[#1e294b]">{t.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex flex-wrap gap-1">
                          {t.subjects.slice(0,2).map(s => (
                            <span key={s} className="text-[9px] font-bold text-[#1e3a8a] bg-blue-50 px-2 py-0.5 rounded-full">{s}</span>
                          ))}
                          {t.subjects.length > 2 && <span className="text-[9px] text-slate-400 font-bold">+{t.subjects.length-2}</span>}
                          {t.subjects.length === 0 && <span className="text-[10px] text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-xs font-semibold text-slate-500">{t.classCount || "—"}</td>
                      <td className="py-4 px-5 text-xs font-semibold text-slate-500">{t.studentCount || "—"}</td>
                      <td className="py-4 px-5">
                        {t.avgScore != null ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1e294b]">{t.avgScore}%</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${gradeColor(g)}`}>{g}</span>
                          </div>
                        ) : <span className="text-xs text-slate-300">No data</span>}
                      </td>
                      <td className="py-4 px-5">
                        {t.vsSchoolAvg != null ? (
                          <span className={`text-xs font-bold ${t.vsSchoolAvg >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {t.vsSchoolAvg >= 0 ? "+" : ""}{t.vsSchoolAvg}%
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-4 px-5">
                        {T && TIcon ? (
                          <div className={`flex items-center gap-1 ${T.color}`}>
                            <TIcon className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-black">{T.label}</span>
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-4 px-5">
                        <button onClick={() => setSelected(t)}
                          className="flex items-center gap-1 text-[10px] font-black text-[#1e3a8a] hover:underline">
                          View <ChevronRight className="w-3 h-3" />
                        </button>
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

export default TeacherPerformance;
