import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CheckCircle, XCircle, Clock, TrendingUp, Send, Edit3, Bell, FileText, TrendingDown, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import ClassAttendanceDetail from "@/components/ClassAttendanceDetail";
import { db, auth } from "@/lib/firebase";
import { collection, query, onSnapshot, where, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

// ─── Centralised tier scheme ─────────────────────────────────────────────────
// Mobile + desktop previously used different attendance-pct thresholds (90/75/60
// vs 90/80/70) — same school could read "Good" on mobile and "Average" on
// desktop. Single source of truth now.
const TIER_EXCELLENT = 90;
const TIER_GOOD = 80;
const TIER_AVERAGE = 70;

type Tier = "excellent" | "good" | "average" | "needs-attention" | "no-data";

const tierFor = (pct: number | null): Tier => {
  if (pct === null) return "no-data";
  if (pct >= TIER_EXCELLENT) return "excellent";
  if (pct >= TIER_GOOD) return "good";
  if (pct >= TIER_AVERAGE) return "average";
  return "needs-attention";
};

const tierLabel = (t: Tier): string => ({
  excellent: "Excellent",
  good: "Good",
  average: "Average",
  "needs-attention": "Needs Attention",
  "no-data": "No data",
}[t]);

// Robust initials — "Aamir Khan" → "AK", "Aamir" → "A", "" → "?". Was:
// `substring(0, 2)` which produced "AA" for single-name students.
const safeInitials = (name: string | null | undefined): string => {
  const parts = (name || "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const v = payload[0].value;
    return (
      <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
        Day {payload[0].payload.day}: {v === null || v === undefined ? "no data" : `${v}%`}
      </div>
    );
  }
  return null;
};

const Attendance = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // monthlyAvg is now string with "—" sentinel when no data exists. Tier
  // badge reads from `monthlyAvgVal` (number | null) — never `parseInt`s the
  // formatted string back, which used to silently coerce "—" → 0 → red tier.
  const [stats, setStats] = useState<{
    presentToday: number;
    absentToday: number;
    lateToday: number;
    monthlyAvg: string;
    monthlyAvgVal: number | null;
    totalToday: number;
  }>({ presentToday: 0, absentToday: 0, lateToday: 0, monthlyAvg: "—", monthlyAvgVal: null, totalToday: 0 });
  const [trendData, setTrendData] = useState<{ day: number; value: number | null }[]>([]);
  const [gradeHeatmap, setGradeHeatmap] = useState<{ grade: string; pct: string; value: number; color: string }[]>([]);
  const [hiddenGradesCount, setHiddenGradesCount] = useState(0);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);
  // Delta-drop: classes/grades that dropped ≥15% vs last 7 days
  const [suddenDrops, setSuddenDrops] = useState<{ grade: string; drop: number; recent: number; prev: number }[]>([]);
  const [sendingAlerts, setSendingAlerts] = useState(false);

  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) {
      // No school context — bail with empty state instead of leaving the
      // spinner on (B7). Was: silent return.
      setLoading(false);
      return;
    }
    setLoading(true);

    // schoolId-only server-side; branchId in-memory (memory:
    // branchid_inference_lag — `where branchId == X` server-side may skip
    // freshly-created records during the 1-2s enforceBranchId trigger
    // backfill window). Was: server-side branchId filter.
    const branchId = userData?.branchId || "";
    const inBranch = (raw: any): boolean =>
      !branchId || !raw?.branchId || raw.branchId === branchId;

    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("schoolId", "==", schoolId)),
      (snap) => {
        const records: any[] = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(inBranch);
        const today = new Date().toLocaleDateString('en-CA');

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toLocaleDateString('en-CA');

        // Stable per-student key — prefer studentId, then studentEmail
        // (lowercased). Was: `studentId || studentName` which collided when
        // two students shared a name (memory: dual_query_pattern).
        const keyFor = (r: any): string =>
          String(r.studentId || (r.studentEmail || "").toLowerCase() || "");

        // Stable per-class key — prefer className over gradeLevel so
        // streams stay separate (memory: bug_pattern_class_label_normalization).
        // Was: `gradeLevel || className` collapsed "Class 11 Science" and
        // "Class 11 Commerce" into a single "11" bucket.
        const classKeyFor = (r: any): string =>
          String(r.className || r.gradeLevel || "");

        // ── Today's counts (deduped per student to avoid double-count when
        //   the same student has 2 records for today, e.g. teacher correction). ──
        const todayRecs = records.filter(r => r.date === today);
        const todaySeen = new Map<string, string>(); // studentKey → final status
        todayRecs.forEach(r => {
          const k = keyFor(r);
          if (!k) return;
          // Last write wins (Firestore returns docs in arbitrary order, so
          // we'd ideally pick by timestamp — for parity with the existing
          // teacher mark-attendance flow which overwrites a single doc per
          // (student, day), last-seen here is good enough).
          todaySeen.set(k, r.status);
        });
        const todayStatuses = Array.from(todaySeen.values());
        const presentToday = todayStatuses.filter(s => s === 'present').length;
        const absentToday  = todayStatuses.filter(s => s === 'absent').length;
        const lateToday    = todayStatuses.filter(s => s === 'late').length;
        const totalToday   = presentToday + absentToday + lateToday;

        // ── Monthly avg ──
        const monthlyRecs    = records.filter(r => r.date && r.date >= cutoffStr);
        // "late" counts as present in the dashboard tier scheme — must match
        // the rest of the codebase (memory: pattern_3tier_attribution).
        const monthlyPresent = monthlyRecs.filter(r => r.status === 'present' || r.status === 'late').length;
        const monthlyAvgVal  = monthlyRecs.length === 0 ? null : Math.round((monthlyPresent / monthlyRecs.length) * 100);
        const monthlyAvgStr  = monthlyAvgVal === null ? "—" : `${monthlyAvgVal}%`;

        // ── Grade heatmap (className-first, streams preserved) ──
        const gradeGroups: Record<string, { present: number; total: number }> = {};
        records.forEach(r => {
          const g = classKeyFor(r);
          if (!g) return;
          if (!gradeGroups[g]) gradeGroups[g] = { present: 0, total: 0 };
          gradeGroups[g].total++;
          if (r.status === 'present' || r.status === 'late') gradeGroups[g].present++;
        });

        const heatmapAll = Object.entries(gradeGroups)
          .map(([grade, { present, total }]) => {
            const pct = Math.round((present / total) * 100);
            return {
              grade,
              pct: `${pct}%`,
              value: pct,
              color: pct >= TIER_EXCELLENT ? "#22c55e" : pct >= TIER_GOOD ? "#f59e0b" : "#ef4444"
            };
          })
          .sort((a, b) => a.grade.localeCompare(b.grade));
        const HEATMAP_CAP = 8;
        const heatmap = heatmapAll.slice(0, HEATMAP_CAP);
        const hidden = Math.max(0, heatmapAll.length - HEATMAP_CAP);

        // ── Delta-based sudden drop detection per class ──────────────────────
        const sevenAgo     = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
        const fourteenAgo  = new Date(); fourteenAgo.setDate(fourteenAgo.getDate() - 14);
        const sevenAgoStr  = sevenAgo.toLocaleDateString('en-CA');
        const fourteenAgoStr = fourteenAgo.toLocaleDateString('en-CA');

        const gradeDeltaGroups: Record<string, { recent: number[]; prev: number[] }> = {};
        records.forEach(r => {
          const g = classKeyFor(r);
          if (!g || !r.date) return;
          if (!gradeDeltaGroups[g]) gradeDeltaGroups[g] = { recent: [], prev: [] };
          if (r.date >= sevenAgoStr) gradeDeltaGroups[g].recent.push((r.status === 'present' || r.status === 'late') ? 1 : 0);
          else if (r.date >= fourteenAgoStr) gradeDeltaGroups[g].prev.push((r.status === 'present' || r.status === 'late') ? 1 : 0);
        });
        const drops = Object.entries(gradeDeltaGroups)
          .map(([grade, { recent, prev }]) => {
            if (recent.length < 3 || prev.length < 3) return null;
            const recentPct = Math.round((recent.reduce((a,b)=>a+b,0)/recent.length)*100);
            const prevPct   = Math.round((prev.reduce((a,b)=>a+b,0)/prev.length)*100);
            const drop = prevPct - recentPct;
            return drop >= 15 ? { grade, drop, recent: recentPct, prev: prevPct } : null;
          })
          .filter(Boolean) as { grade: string; drop: number; recent: number; prev: number }[];
        setSuddenDrops(drops);

        // ── 30-Day trend — push EVERY day, null for no-data so the chart
        //   renders gaps honestly instead of pretending day 12 is adjacent
        //   to day 28 (B13). Recharts is given `connectNulls={false}`. ──
        const trend: { day: number; value: number | null }[] = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dStr  = d.toLocaleDateString('en-CA');
          const dRecs = records.filter(r => r.date === dStr);
          if (dRecs.length > 0) {
            const p = dRecs.filter(r => r.status === 'present' || r.status === 'late').length;
            trend.push({ day: d.getDate(), value: parseFloat(((p / dRecs.length) * 100).toFixed(1)) });
          } else {
            trend.push({ day: d.getDate(), value: null });
          }
        }

        // ── Per-student records (dual-key) ──
        const studentMap: Record<string, any[]> = {};
        records.forEach(r => {
          const sid = keyFor(r);
          if (!sid) return;
          if (!studentMap[sid]) studentMap[sid] = [];
          studentMap[sid].push(r);
        });

        const absents = todayRecs
          .filter(r => r.status === 'absent')
          .map(r => {
            const sid  = keyFor(r);
            const sRec = (sid ? studentMap[sid] || [] : [])
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            // Consecutive absents counting back from today
            let consecutive = 0;
            for (const rec of sRec) {
              if (rec.status === 'absent') consecutive++;
              else break;
            }

            // Monthly % for this student. Null when student has no records
            // in the cutoff window — was: 0 → wrongly tagged "Chronic".
            const sMonthly   = sRec.filter(rec => rec.date && rec.date >= cutoffStr);
            const sPresent   = sMonthly.filter(rec => rec.status === 'present').length;
            const monthlyPct = sMonthly.length === 0 ? null : Math.round((sPresent / sMonthly.length) * 100);
            const statusLabel = monthlyPct === null
              ? 'New'
              : monthlyPct < 60 ? 'Chronic' : monthlyPct < 75 ? 'Warning' : 'Active';

            return {
              studentId:   r.studentId || null,
              studentEmail: r.studentEmail || null,
              parentEmail: r.parentEmail || null,
              parentPhone: r.parentPhone || null,
              initials:    safeInitials(r.studentName), // B10
              name:        r.studentName || "Unknown",
              grade:       r.className || r.gradeLevel || "N/A",
              classId:     r.classId || null,
              contact:     r.parentPhone || "—",
              consecutive: `${consecutive} day${consecutive !== 1 ? 's' : ''}`,
              consecutiveNum: consecutive,
              monthly:     monthlyPct === null ? "—" : `${monthlyPct}%`,
              monthlyVal:  monthlyPct,                        // null when new student
              status:      statusLabel
            };
          });

        setStats({
          presentToday, absentToday, lateToday,
          monthlyAvg: monthlyAvgStr,
          monthlyAvgVal,
          totalToday,
        });
        setGradeHeatmap(heatmap);
        setHiddenGradesCount(hidden);
        setTrendData(trend);
        setAbsentStudents(absents);
        setLoading(false);
      },
      // Real error handler so a permission denial / network drop doesn't
      // leave the spinner stuck forever (B5). Was: missing.
      (err) => {
        console.error("[Attendance] listener failed:", err);
        toast.error("Failed to load attendance data — please refresh.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  const pct = (n: number) => stats.totalToday > 0 ? `${Math.round((n / stats.totalToday) * 100)}%` : "—";

  // ── Real "Send Alerts" wiring (B2) ──────────────────────────────────────
  // Was: toast.success(...) only — no Firestore write, parents never saw
  // anything. Now writes one principal_to_parent_notes doc per absent
  // student via a chunked writeBatch (450 ops per chunk to stay under
  // Firestore's 500-op limit), exactly the pattern NotifyClassParentsModal
  // uses. Parent-dashboard reads this collection for in-app alerts.
  const sendAbsenceAlerts = async () => {
    if (!userData?.schoolId) {
      toast.error("School context missing — please re-login.");
      return;
    }
    if (absentStudents.length === 0) {
      toast.success("No absent students today — no alerts needed. 🎉");
      return;
    }
    // Only notify students we can actually identify in the parent-side
    // collection (need studentId or studentEmail to match).
    const recipients = absentStudents.filter(s => s.studentId || s.studentEmail);
    if (recipients.length === 0) {
      toast.error("Cannot send alerts — absent records are missing studentId/email.");
      return;
    }

    setSendingAlerts(true);
    try {
      const principalUid = auth.currentUser?.uid || (userData as any)?.id || "";
      const principalName = (userData as any)?.fullName || (userData as any)?.name || "Principal";
      const today = new Date().toLocaleDateString("en-CA");
      const branchId = userData.branchId || null;

      const CHUNK = 450;
      let written = 0;
      for (let i = 0; i < recipients.length; i += CHUNK) {
        const slice = recipients.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(s => {
          const ref = doc(collection(db, "principal_to_parent_notes"));
          const msg =
            `Attendance alert: ${s.name} was marked absent today (${today}).` +
            (s.consecutiveNum >= 3 ? ` This is day ${s.consecutiveNum} of a continued absence.` : "") +
            (s.monthlyVal !== null && s.monthlyVal < 75
              ? ` Monthly attendance is ${s.monthlyVal}% — please reach out if there are any concerns.`
              : "");
          batch.set(ref, {
            schoolId: userData.schoolId,
            branchId,
            studentId: s.studentId,
            studentEmail: s.studentEmail || null,
            studentName: s.name,
            parentEmail: s.parentEmail || null,
            category: "attendance",
            // Write BOTH field names so either dashboard render path works
            // (matches NotifyParentModal convention).
            message: msg,
            content: msg,
            from: "principal",
            principalId: principalUid,
            principalName,
            read: false,
            timestamp: serverTimestamp(),
            _lastModifiedBy: principalUid,
          });
        });
        await batch.commit();
        written += slice.length;
      }

      toast.success(`Alert sent to ${written} parent${written === 1 ? "" : "s"}.`, {
        description: "Notification posted to Parent Communication.",
      });
    } catch (err: any) {
      console.error("[Attendance] sendAbsenceAlerts failed:", err);
      toast.error(`Failed to send alerts: ${err?.message || "Unknown error"}`);
    } finally {
      setSendingAlerts(false);
    }
  };

  const generateReport = () => {
    const html = buildReport({
      title: "Monthly Attendance Report",
      badge: "Attendance",
      heroStats: [
        { label: "Present Today", value: stats.presentToday, color: "#4ade80" },
        { label: "Absent Today",  value: stats.absentToday,  color: "#f87171" },
        { label: "Late Today",    value: stats.lateToday,    color: "#fbbf24" },
        { label: "Monthly Avg",   value: stats.monthlyAvg },
      ],
      sections: [
        {
          title: "Grade-wise Attendance Summary",
          type: "table",
          headers: ["Grade / Class", "Attendance %", "Status"],
          rows: gradeHeatmap.map(g => ({
            // Status labels come from the central tier scheme — was: ad-hoc
            // 90/80 cutoffs with different labels ("Good"/"Average"/"Critical")
            // than the dashboard, so the same class showed different tiers
            // in the UI vs the printed report.
            cells: [g.grade, g.pct, tierLabel(tierFor(g.value))],
            highlight: g.value < TIER_GOOD,
          })),
        },
        {
          title: "Absent Students Today",
          type: "table",
          headers: ["Student", "Class", "Contact", "Consecutive", "Monthly %", "Status"],
          rows: absentStudents.map(s => ({
            cells: [s.name, s.grade, s.contact, s.consecutive, s.monthly, s.status],
            highlight: s.status === "Chronic",
          })),
        },
      ],
    });
    openReportWindow(html);
  };

  if (selectedClass) {
    return <ClassAttendanceDetail className={selectedClass} onBack={() => setSelectedClass(null)} />;
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

    // Tier from the central scheme — same buckets as desktop (B8). When
    // monthlyAvgVal is null (no records in 30-day window) we surface a
    // neutral "No data" chip instead of falling through to a red "Critical"
    // tag (B6/B9).
    const tierMobile = tierFor(stats.monthlyAvgVal);
    const statusChip = (() => {
      switch (tierMobile) {
        case "excellent":       return { label: "Excellent",       bg: "rgba(0,200,83,.22)",  border: "rgba(0,200,83,.36)",  color: "#66EE88" };
        case "good":            return { label: "Good",            bg: "rgba(0,85,255,.22)",  border: "rgba(0,85,255,.36)",  color: "#99BBFF" };
        case "average":         return { label: "Average",         bg: "rgba(255,170,0,.22)", border: "rgba(255,170,0,.36)", color: "#FFDD88" };
        case "needs-attention": return { label: "Needs Attention", bg: "rgba(255,51,85,.22)", border: "rgba(255,51,85,.36)", color: "#FF99AA" };
        case "no-data":         return { label: "No data",         bg: "rgba(255,255,255,.16)", border: "rgba(255,255,255,.24)", color: "rgba(255,255,255,.72)" };
      }
    })();

    const heatmapColor = (v: number) =>
      v >= 90
        ? "linear-gradient(135deg,#00A842,#00C853,#22EE66)"
        : v >= 80
        ? "linear-gradient(135deg,#CC7700,#FFAA00,#FFDD44)"
        : "linear-gradient(135deg,#CC2244,#FF3355,#FF6688)";
    const heatmapShadow = (v: number) =>
      v >= 90
        ? "0 4px 14px rgba(0,200,83,.28)"
        : v >= 80
        ? "0 4px 14px rgba(255,170,0,.28)"
        : "0 4px 14px rgba(255,51,85,.28)";
    const heatmapTextColor = (v: number) => (v >= 90 ? GREEN : v >= 80 ? GOLD : RED);

    // Honest UX: principals don't mark attendance themselves (teachers do).
    // The button now scrolls to the class heatmap so the principal can drill
    // into a class for review/correction instead of claiming a write action
    // it never performed.
    const handleMark = () => {
      if (gradeHeatmap.length === 0) {
        toast.info("No classes have recorded attendance yet.", {
          description: "Classes will appear here once teachers start marking.",
        });
        return;
      }
      toast.info("Tap a class below to view its attendance sheet.");
      requestAnimationFrame(() => {
        document.getElementById("mobile-att-heatmap")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    // Wired to the real chunked writeBatch defined above (B2). Was: only a
    // toast — parents never received anything.
    const handleSendAlerts = () => { void sendAbsenceAlerts(); };

    // Single sort, then index from both ends. Hide worst when there's only
    // one class (otherwise best === worst and the AI card prints the same
    // class as both leader and lagger). B11 + same single-section UX bug
    // fixed in SubjectAnalysis.
    //
    // Plain const (not useMemo) — useMemo would be conditionally called
    // since the entire mobile branch is inside `if (isMobile) { ... return }`,
    // violating the rules of hooks if isMobile flips between renders. The
    // sort is over <=8 items, so the cost is negligible.
    const sortedHeatmap = [...gradeHeatmap].sort((a, b) => b.value - a.value);
    const bestClass  = sortedHeatmap[0] || null;
    const worstClass = sortedHeatmap.length >= 2 ? sortedHeatmap[sortedHeatmap.length - 1] : null;

    const avatarGrad = [
      `linear-gradient(135deg, ${B1}, ${B2})`,
      `linear-gradient(135deg, #7B3FF4, #AA77FF)`,
      `linear-gradient(135deg, ${GREEN}, #22EE66)`,
      `linear-gradient(135deg, ${GOLD}, #FFCC55)`,
      `linear-gradient(135deg, ${RED}, #FF6688)`,
    ];

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
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3 }}>
              Attendance
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400 }}>
              Monitor student attendance patterns and trends
            </div>
          </div>
          <button
            onClick={handleMark}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 14,
              background: `linear-gradient(135deg, ${B1}, ${B2})`,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
              marginTop: 4,
              flexShrink: 0,
            }}
          >
            <Edit3 className="w-3.5 h-3.5" strokeWidth={2.5} />
            Mark
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: `3px solid rgba(0,85,255,.2)`,
                borderTopColor: B1,
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <>
            {/* HERO ATTENDANCE BANNER */}
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
                  width: 140,
                  height: 140,
                  background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1, marginBottom: 12 }}>
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
                    <CheckCircle size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                      Monthly Average
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>
                      {stats.monthlyAvg}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    padding: "6px 12px",
                    borderRadius: 100,
                    background: statusChip.bg,
                    border: `0.5px solid ${statusChip.border}`,
                    fontSize: 11,
                    fontWeight: 700,
                    color: statusChip.color,
                  }}
                >
                  {statusChip.label}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 12px",
                    borderRadius: 100,
                    background: "rgba(255,255,255,.12)",
                    border: "0.5px solid rgba(255,255,255,.18)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(255,255,255,.75)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: GREEN }} />
                  Global Institution Avg
                </div>
                <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,.16)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      background: "linear-gradient(90deg,#4499FF,#00C853)",
                      borderRadius: 3,
                      width: `${Math.min(100, Math.max(0, monthlyAvgVal))}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* STAT GRID */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
              {[
                {
                  label: "Today's Present",
                  value: stats.presentToday,
                  sub: stats.totalToday > 0 ? `${pct(stats.presentToday)} attendance` : "No records today",
                  color: "#007830",
                  icon: <CheckCircle size={14} color={GREEN} strokeWidth={2.4} />,
                  bg: "rgba(0,200,83,.10)",
                  border: "rgba(0,200,83,.22)",
                  glow: "rgba(0,200,83,.10)",
                  subColor: stats.totalToday > 0 ? "#007830" : T4,
                },
                {
                  label: "Absent Today",
                  value: stats.absentToday,
                  sub: stats.totalToday > 0 ? `${pct(stats.absentToday)} of total` : "Requires attention",
                  color: RED,
                  icon: <XCircle size={14} color={RED} strokeWidth={2.4} />,
                  bg: "rgba(255,51,85,.10)",
                  border: "rgba(255,51,85,.22)",
                  glow: "rgba(255,51,85,.10)",
                  subColor: RED,
                },
                {
                  label: "Late Arrivals",
                  value: stats.lateToday,
                  sub: stats.totalToday > 0 ? `${pct(stats.lateToday)} of total` : "No late arrivals",
                  color: GOLD,
                  icon: <Clock size={14} color={GOLD} strokeWidth={2.4} />,
                  bg: "rgba(255,170,0,.10)",
                  border: "rgba(255,170,0,.22)",
                  glow: "rgba(255,170,0,.10)",
                  subColor: T4,
                },
                {
                  label: "Monthly Avg",
                  value: stats.monthlyAvg,
                  sub: "Global Inst. Avg",
                  color: B1,
                  icon: <TrendingUp size={14} color={B1} strokeWidth={2.4} />,
                  bg: "rgba(0,85,255,.10)",
                  border: "rgba(0,85,255,.18)",
                  glow: "rgba(0,85,255,.10)",
                  subColor: "#007830",
                },
              ].map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (i === 1 && absentStudents.length > 0) {
                      document.getElementById("mobile-absent-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else if (i === 0) {
                      toast.info(
                        stats.totalToday > 0
                          ? `${stats.presentToday} of ${stats.totalToday} students present today (${pct(stats.presentToday)}).`
                          : "No attendance records today."
                      );
                    } else if (i === 1) {
                      toast.info(
                        absentStudents.length === 0
                          ? "No absent students today. 🎉"
                          : `${absentStudents.length} student${absentStudents.length === 1 ? "" : "s"} absent today.`
                      );
                    } else if (i === 2) {
                      toast.info(
                        stats.lateToday > 0
                          ? `${stats.lateToday} late arrival${stats.lateToday === 1 ? "" : "s"} today.`
                          : "No late arrivals today."
                      );
                    } else {
                      toast.info(`30-day rolling average: ${stats.monthlyAvg}.`);
                    }
                  }}
                  style={{
                    background: "#fff",
                    borderRadius: 20,
                    padding: 16,
                    boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                    border: "none",
                    position: "relative",
                    overflow: "hidden",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -20,
                      right: -16,
                      width: 70,
                      height: 70,
                      background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
                      borderRadius: "50%",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 14,
                      width: 30,
                      height: 30,
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
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T4, marginBottom: 10 }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1, marginBottom: 5, color: c.color }}>
                    {c.value}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: c.subColor }}>{c.sub}</div>
                </button>
              ))}
            </div>

            {/* SUDDEN DROPS */}
            {suddenDrops.length > 0 && (
              <div style={{ padding: "16px 20px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <TrendingDown size={14} color={RED} strokeWidth={2.4} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#B8002D", textTransform: "uppercase", letterSpacing: "0.10em" }}>
                    Sudden Drop Detected
                  </span>
                </div>
                {suddenDrops.map((d) => (
                  <button
                    key={d.grade}
                    onClick={() => setSelectedClass(d.grade)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "rgba(255,51,85,.06)",
                      border: "0.5px solid rgba(255,51,85,.20)",
                      borderRadius: 14,
                      padding: "11px 14px",
                      marginBottom: 6,
                      width: "100%",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <AlertTriangle size={16} color={RED} strokeWidth={2.3} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#B8002D", marginBottom: 1 }}>{d.grade}</div>
                      <div style={{ fontSize: 10, color: RED, fontWeight: 500 }}>
                        Dropped {d.drop}% ({d.prev}% → {d.recent}%)
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: B1 }}>View →</span>
                  </button>
                ))}
              </div>
            )}

            {/* HEATMAP */}
            <div
              id="mobile-att-heatmap"
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
              <span>Grade-wise Heatmap</span>
              {/* B12 — count of classes hidden by the 8-cap. */}
              {hiddenGradesCount > 0 && (
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
                  title={`Showing top 8 classes — ${hiddenGradesCount} more not displayed`}
                >
                  +{hiddenGradesCount} more
                </span>
              )}
              <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
            </div>

            <div
              style={{
                margin: "12px 20px 0",
                background: "#fff",
                borderRadius: 24,
                padding: 20,
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                border: "0.5px solid rgba(0,85,255,.10)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: T1, marginBottom: 16, letterSpacing: "-0.2px" }}>
                Grade-wise Attendance Heatmap
              </div>

              {gradeHeatmap.length === 0 ? (
                <div style={{ fontSize: 12, color: T3, textAlign: "center", padding: "24px 0" }}>
                  No attendance data available yet.
                </div>
              ) : (
                <div>
                  {gradeHeatmap.map((g, i) => (
                    <div key={i} style={{ marginBottom: i === gradeHeatmap.length - 1 ? 0 : 12 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: T4,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          marginBottom: 7,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>{g.grade}</span>
                        <span style={{ color: heatmapTextColor(g.value), fontWeight: 700 }}>{g.pct}</span>
                      </div>
                      <button
                        onClick={() => setSelectedClass(g.grade)}
                        style={{
                          width: "100%",
                          height: 48,
                          borderRadius: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#fff",
                          position: "relative",
                          overflow: "hidden",
                          cursor: "pointer",
                          border: "none",
                          background: heatmapColor(g.value),
                          boxShadow: heatmapShadow(g.value),
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "linear-gradient(135deg,rgba(255,255,255,.18) 0%,transparent 52%)",
                            pointerEvents: "none",
                          }}
                        />
                        <span style={{ position: "relative", zIndex: 1 }}>{g.pct}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  paddingTop: 14,
                  borderTop: `0.5px solid ${SEP}`,
                  marginTop: 14,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { color: GREEN, label: "90–100%" },
                  { color: GOLD, label: "80–89%" },
                  { color: RED, label: "Below 80%" },
                ].map((l, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: T3 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 3, background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* CHART */}
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
              <span>30-Day Trend</span>
              <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
            </div>

            <div
              style={{
                margin: "12px 20px 0",
                background: "#fff",
                borderRadius: 24,
                padding: 20,
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                border: "0.5px solid rgba(0,85,255,.10)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>30-Day Attendance Trend</div>
                <div
                  style={{
                    padding: "4px 11px",
                    borderRadius: 100,
                    background: "rgba(0,85,255,.10)",
                    border: "0.5px solid rgba(0,85,255,.18)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: B1,
                  }}
                >
                  {stats.monthlyAvg} avg
                </div>
              </div>

              {trendData.length === 0 ? (
                <div style={{ fontSize: 12, color: T3, textAlign: "center", padding: "40px 0" }}>
                  No trend data available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={trendData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mobTrendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={B1} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={B1} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,85,255,.06)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fontWeight: 700, fill: T4 }}
                      interval={5}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fontWeight: 700, fill: T4 }}
                      tickFormatter={(v) => `${v}%`}
                      width={38}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {/* connectNulls={false} so days with no records render
                        as gaps instead of pretending day 12 is adjacent to
                        day 28 (B13). */}
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={B1}
                      strokeWidth={2.5}
                      fill="url(#mobTrendGradient)"
                      connectNulls={false}
                      dot={{ r: 3, fill: "#ffffff", stroke: B1, strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: B1, stroke: "#ffffff", strokeWidth: 2 }}
                      animationDuration={1200}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ABSENT STUDENTS */}
            <div
              id="mobile-absent-card"
              style={{
                margin: "12px 20px 0",
                background: "#fff",
                borderRadius: 24,
                overflow: "hidden",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                border: "0.5px solid rgba(0,85,255,.10)",
              }}
            >
              <div
                style={{
                  padding: "16px 18px 12px",
                  borderBottom: `0.5px solid ${SEP}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>Absent Students Today</div>
                <button
                  onClick={handleSendAlerts}
                  style={{
                    height: 36,
                    padding: "0 13px",
                    borderRadius: 12,
                    background: "linear-gradient(135deg,#FF3355,#FF6688)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(255,51,85,.28)",
                  }}
                >
                  <Send size={12} strokeWidth={2.3} />
                  Alert Parents
                </button>
              </div>

              {absentStudents.length === 0 ? (
                <div style={{ padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 18,
                      background: "rgba(0,200,83,.10)",
                      border: "0.5px solid rgba(0,200,83,.22)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 0 8px rgba(0,200,83,.05)",
                    }}
                  >
                    <CheckCircle size={26} color={GREEN} strokeWidth={2.2} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>
                    No absent students today
                  </div>
                  <div style={{ fontSize: 12, color: T4, fontWeight: 400 }}>
                    All students are present today 🎉
                  </div>
                </div>
              ) : (
                absentStudents.map((s, i) => {
                  const statusColor =
                    s.status === "Chronic" ? RED : s.status === "Warning" ? GOLD : GREEN;
                  const statusBg =
                    s.status === "Chronic"
                      ? "rgba(255,51,85,.10)"
                      : s.status === "Warning"
                      ? "rgba(255,170,0,.10)"
                      : "rgba(0,200,83,.10)";
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedClass(s.grade)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 18px",
                        borderBottom: i === absentStudents.length - 1 ? "none" : `0.5px solid ${SEP}`,
                        background: "#fff",
                        border: "none",
                        borderRadius: 0,
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 13,
                          background: avatarGrad[i % avatarGrad.length],
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {s.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 11, color: T3, fontWeight: 500 }}>
                          {s.grade} · {s.consecutive} · Monthly {s.monthly}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "5px 10px",
                          borderRadius: 100,
                          fontSize: 10,
                          fontWeight: 700,
                          color: statusColor,
                          background: statusBg,
                          border: `0.5px solid ${statusColor}33`,
                          flexShrink: 0,
                        }}
                      >
                        {s.status}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* ACTION ROW */}
            <div style={{ display: "flex", gap: 8, padding: "14px 20px 0" }}>
              <button
                onClick={handleMark}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  fontSize: 12,
                  fontWeight: 700,
                  background: `linear-gradient(135deg, ${B1}, ${B2})`,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
                }}
              >
                <Edit3 size={13} strokeWidth={2.2} />
                Mark Attendance
              </button>
              <button
                onClick={handleSendAlerts}
                disabled={sendingAlerts}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "#fff",
                  color: "#002080",
                  border: "0.5px solid rgba(0,85,255,.16)",
                  cursor: sendingAlerts ? "not-allowed" : "pointer",
                  opacity: sendingAlerts ? 0.6 : 1,
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                }}
              >
                {sendingAlerts
                  ? <Loader2 size={13} color="rgba(0,85,255,.6)" className="animate-spin" />
                  : <Bell size={13} color="rgba(0,85,255,.6)" strokeWidth={2.2} />}
                {sendingAlerts ? "Sending…" : "Send Alerts"}
              </button>
              <button
                onClick={generateReport}
                style={{
                  flex: 0.7,
                  height: 44,
                  borderRadius: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "#fff",
                  color: "#002080",
                  border: "0.5px solid rgba(0,85,255,.16)",
                  cursor: "pointer",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                }}
              >
                <FileText size={13} color="rgba(0,85,255,.6)" strokeWidth={2.2} />
                Report
              </button>
            </div>

            {/* AI CARD */}
            <div
              style={{
                margin: "12px 20px 0",
                background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
                borderRadius: 24,
                padding: "20px 22px",
                boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -36,
                  right: -24,
                  width: 155,
                  height: 155,
                  background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 11, position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9,
                    background: "rgba(255,255,255,.18)",
                    border: "0.5px solid rgba(255,255,255,.26)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Sparkles size={14} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                  AI Attendance Intelligence
                </span>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
                {stats.monthlyAvgVal === null ? (
                  <>No attendance has been recorded yet — once teachers start marking, the 30-day overview and today's counts will appear here.</>
                ) : stats.totalToday === 0 ? (
                  <>30-day overall attendance is{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>
                      {statusChip.label} at {stats.monthlyAvg}
                    </strong>. <strong style={{ color: "#fff", fontWeight: 700 }}>No attendance marked yet today</strong> — figures will populate as teachers record.
                  </>
                ) : (
                  <>Overall attendance is{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>
                      {statusChip.label} at {stats.monthlyAvg}
                    </strong>
                    . Today: <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.absentToday} absence{stats.absentToday === 1 ? "" : "s"}</strong>
                    {stats.lateToday > 0 ? (
                      <>{" "}and <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.lateToday} late arrival{stats.lateToday === 1 ? "" : "s"}</strong></>
                    ) : (
                      <>, no late arrivals</>
                    )}
                    .
                  </>
                )}
                {bestClass && stats.monthlyAvgVal !== null && (
                  <>
                    {" "}<strong style={{ color: "#fff", fontWeight: 700 }}>{bestClass.grade}</strong> leads with{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{bestClass.pct}</strong> attendance.
                  </>
                )}
                {worstClass && worstClass.value < 85 && (
                  <>
                    {" "}<strong style={{ color: "#fff", fontWeight: 700 }}>{worstClass.grade}</strong> at{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{worstClass.pct}</strong> should be monitored.
                  </>
                )}
                {suddenDrops.length > 0 && (
                  <>
                    {" "}<strong style={{ color: "#fff", fontWeight: 700 }}>{suddenDrops.length} sudden drop{suddenDrops.length === 1 ? "" : "s"}</strong> flagged this week.
                  </>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 1,
                  background: "rgba(255,255,255,.12)",
                  borderRadius: 16,
                  overflow: "hidden",
                  position: "relative",
                  zIndex: 1,
                  marginTop: 14,
                }}
              >
                {[
                  { v: stats.monthlyAvg, l: "Monthly" },
                  { v: stats.absentToday, l: "Absent" },
                  { v: bestClass ? bestClass.pct : "—", l: "Best Class" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "13px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 4 }}>
                      {s.v}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={{ height: 20 }} />
      </div>
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
  const dRED = "#FF3355", dRED_S = "rgba(255,51,85,0.10)", dRED_B = "rgba(255,51,85,0.22)";
  const dORANGE = "#FF8800";
  const dGOLD = "#FFAA00";
  const dVIOLET = "#7B3FF4";
  const dSH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const dSH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";
  const dSH_BTN = "0 6px 22px rgba(0,85,255,0.38), 0 2px 5px rgba(0,85,255,0.18)";

  // Tier comes from the central helper — no more `parseInt(...) || 0` which
  // silently coerced the "—" no-data sentinel to 0 → wrongly painted everything
  // red (B6/B9). When stats.monthlyAvgVal is null the badge reads "No data".
  const tierKeyDesktop = tierFor(stats.monthlyAvgVal);
  const tier = tierLabel(tierKeyDesktop);
  const tierColor =
    tierKeyDesktop === "excellent"       ? dGREEN
    : tierKeyDesktop === "good"          ? dGOLD
    : tierKeyDesktop === "average"       ? dORANGE
    : tierKeyDesktop === "needs-attention" ? dRED
    : dT4; // no-data → muted slate

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
            <CheckCircle className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Attendance</div>
            <div className="text-[12px] mt-1" style={{ color: dT3 }}>Monitor student attendance patterns and trends</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* B2 — was: toast-only ("Mark attendance — navigate to class
              detail to record"). Principals don't mark attendance themselves
              (teachers do). The button now jumps the user to the heatmap to
              drill into a class for review/correction. */}
          <button
            onClick={() => {
              if (gradeHeatmap.length === 0) {
                toast.info("No classes have recorded attendance yet.");
                return;
              }
              toast.info("Click a bar in the heatmap to open the class attendance sheet.");
              requestAnimationFrame(() => {
                document.getElementById("desktop-att-heatmap")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${dSEP}`, color: dT2, boxShadow: dSH }}>
            <Edit3 className="w-[14px] h-[14px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
            Mark Attendance
          </button>
          {/* B2 — was: toast.success("queued") with no Firestore write.
              Now writes principal_to_parent_notes via chunked writeBatch. */}
          <button
            onClick={sendAbsenceAlerts}
            disabled={sendingAlerts}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02] disabled:opacity-60"
            style={{ border: `0.5px solid ${dSEP}`, color: dT2, boxShadow: dSH }}>
            {sendingAlerts
              ? <Loader2 className="w-[14px] h-[14px] animate-spin" style={{ color: dORANGE }} />
              : <Bell className="w-[14px] h-[14px]" style={{ color: dORANGE }} strokeWidth={2.3} />}
            {sendingAlerts ? "Sending…" : "Send Alerts"}
          </button>
          <button onClick={generateReport}
            className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: dSH_BTN }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <FileText className="w-[14px] h-[14px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Monthly Report</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-[20px] py-24 flex flex-col items-center gap-3" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-10 h-10 rounded-full border-[3px] border-t-transparent animate-spin" style={{ borderColor: dB1, borderTopColor: "transparent" }} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: dT4 }}>Loading attendance data…</p>
        </div>
      ) : (
        <>
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
                  <TrendingUp className="w-7 h-7 text-white" strokeWidth={2.2} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>Monthly Average</div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[48px] font-bold leading-none tracking-tight">{stats.monthlyAvg}</span>
                    <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                      style={{
                        background: "rgba(255,255,255,0.18)",
                        border: `0.5px solid ${tierColor === dT4 ? "rgba(255,255,255,0.28)" : tierColor + "55"}`,
                        color: tierColor === dT4 ? "rgba(255,255,255,0.85)" : "#fff",
                      }}>
                      {tier}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                {[
                  { label: "Present",  val: stats.presentToday, color: "#66EE88" },
                  { label: "Absent",   val: stats.absentToday,  color: "#FF88AA" },
                  { label: "Late",     val: stats.lateToday,    color: "#FFDD44" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-[10px] h-[10px] rounded-full" style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}33` }} />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>{s.label}</div>
                      <div className="text-[22px] font-bold leading-none" style={{ letterSpacing: "-0.5px" }}>{s.val}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
            {[
              { title: "Today's Present", val: stats.presentToday, valColor: dGREEN_D, sub: stats.totalToday > 0 ? `${pct(stats.presentToday)} attendance` : "No records today", Icon: CheckCircle, grad: `linear-gradient(135deg, ${dGREEN}, #22EE66)`, glow: "rgba(0,200,83,0.10)", shadow: "0 4px 14px rgba(0,200,83,0.22)" },
              { title: "Absent Today", val: stats.absentToday, valColor: dRED, sub: stats.totalToday > 0 ? `${pct(stats.absentToday)} of total` : "Requires attention", Icon: XCircle, grad: `linear-gradient(135deg, ${dRED}, #FF6688)`, glow: "rgba(255,51,85,0.12)", shadow: "0 4px 14px rgba(255,51,85,0.26)" },
              { title: "Late Arrivals", val: stats.lateToday, valColor: dGOLD, sub: stats.totalToday > 0 ? `${pct(stats.lateToday)} of total` : "No late arrivals", Icon: Clock, grad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`, glow: "rgba(255,170,0,0.12)", shadow: "0 4px 14px rgba(255,170,0,0.26)" },
              { title: "Monthly Avg", val: stats.monthlyAvg, valColor: dB1, sub: `${tier} tier`, Icon: TrendingUp, grad: `linear-gradient(135deg, ${dB1}, ${dB2})`, glow: "rgba(0,85,255,0.10)", shadow: "0 4px 14px rgba(0,85,255,0.26)" },
            ].map(({ title, val, valColor, sub, Icon, grad, glow, shadow }) => (
              <div key={title} className="bg-white rounded-[20px] p-5 relative overflow-hidden"
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
                <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: valColor, letterSpacing: "-1.2px" }}>{val}</p>
                <p className="text-[11px] font-semibold truncate" style={{ color: dT3 }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Sudden Drop Alerts */}
          {suddenDrops.length > 0 && (
            <div className="mt-5 rounded-[20px] overflow-hidden"
              style={{ background: "linear-gradient(145deg, rgba(255,51,85,0.04) 0%, rgba(255,255,255,0.6) 100%)", border: `0.5px solid ${dRED_B}`, boxShadow: dSH_LG }}>
              <div className="flex items-center gap-[10px] px-6 py-[18px] bg-white" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 4px 14px rgba(255,51,85,0.26)" }}>
                  <TrendingDown className="w-4 h-4 text-white" strokeWidth={2.4} />
                </div>
                <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Sudden Drop Detected</h2>
                <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                  style={{ background: dRED_S, color: dRED, border: `0.5px solid ${dRED_B}` }}>
                  {suddenDrops.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
                {suddenDrops.map(d => (
                  <div key={d.grade} className="bg-white rounded-[14px] p-4 flex items-center gap-3"
                    style={{ border: `0.5px solid ${dRED_B}`, boxShadow: dSH }}>
                    <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                      style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 3px 10px rgba(255,51,85,0.22)" }}>
                      <AlertTriangle className="w-[18px] h-[18px] text-white" strokeWidth={2.4} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold" style={{ color: dT1 }}>{d.grade}</p>
                      <p className="text-[11px] font-medium mt-0.5" style={{ color: dRED }}>
                        dropped {d.drop}% ({d.prev}% → {d.recent}%)
                      </p>
                    </div>
                    <button onClick={() => setSelectedClass(d.grade)}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-[10px] transition-transform hover:scale-[1.04]"
                      style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, color: "#fff", boxShadow: dSH }}>
                      View →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Heatmap + Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            {/* Grade Heatmap */}
            <div id="desktop-att-heatmap" className="bg-white rounded-[20px] overflow-hidden"
              style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center gap-[10px] px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(123,63,244,0.10)", border: "0.5px solid rgba(123,63,244,0.22)" }}>
                  <CheckCircle className="w-4 h-4" style={{ color: dVIOLET }} strokeWidth={2.4} />
                </div>
                <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Grade-wise Heatmap</h2>
                {/* B12 — surface the count of classes hidden by the 8-cap so
                    a school with more sections doesn't silently lose data
                    from the heatmap. */}
                {hiddenGradesCount > 0 && (
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: dBG2, color: dT3, border: `0.5px solid ${dSEP}` }}
                    title={`Showing top 8 classes — ${hiddenGradesCount} more not displayed`}
                  >
                    +{hiddenGradesCount} more
                  </span>
                )}
              </div>
              <div className="p-6">
                {gradeHeatmap.length === 0 ? (
                  <div className="flex items-center justify-center h-48">
                    <p className="text-[13px] font-bold" style={{ color: dT4 }}>No attendance data available</p>
                  </div>
                ) : (() => {
                  const barData = gradeHeatmap.map((g) => ({
                    grade: g.grade,
                    value: g.value,
                    fill: g.value >= 90 ? dGREEN : g.value >= 80 ? dGOLD : dRED,
                  }));
                  const chartConfig: ChartConfig = {
                    value: { label: "Attendance %" },
                  };
                  return (
                    <>
                      <ChartContainer config={chartConfig} className="h-[260px] w-full">
                        <BarChart accessibilityLayer data={barData}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="grade"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            tick={{ fontSize: 11, fontWeight: 700, fill: dT3 }}
                          />
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="dashed" formatter={(v: any) => [`${v}%`, "Attendance"]} />}
                          />
                          <Bar
                            dataKey="value"
                            radius={4}
                            maxBarSize={56}
                            onClick={(d: any) => d?.grade && setSelectedClass(d.grade)}
                            className="cursor-pointer"
                          >
                            {barData.map((d, i) => (
                              <Cell key={i} fill={d.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                      <div className="flex items-center gap-5 pt-4 mt-2" style={{ borderTop: `0.5px solid ${dSEP}` }}>
                        {[
                          { color: dGREEN, label: "90-100%" },
                          { color: dGOLD,  label: "80-89%" },
                          { color: dRED,   label: "Below 80%" },
                        ].map(({ color, label }) => (
                          <div key={label} className="flex items-center gap-[6px]">
                            <span className="w-3 h-3 rounded-[4px]" style={{ background: color }} />
                            <span className="text-[11px] font-semibold" style={{ color: dT3 }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* 30-Day Trend */}
            <div className="bg-white rounded-[20px] overflow-hidden"
              style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center gap-[10px] px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.20)" }}>
                  <TrendingUp className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.4} />
                </div>
                <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>30-Day Trend</h2>
              </div>
              <div className="px-4 pt-5 pb-4">
                {trendData.length === 0 ? (
                  <div className="flex items-center justify-center h-[260px]">
                    <p className="text-[13px] font-bold" style={{ color: dT4 }}>No trend data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={dB1} stopOpacity={0.30} />
                          <stop offset="95%" stopColor={dB1} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,85,255,0.08)" vertical={false} />
                      <XAxis dataKey="day" axisLine={false} tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 700, fill: dT4 }} interval={4} />
                      <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 700, fill: dT4 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip content={<CustomTooltip />} />
                      {/* connectNulls={false} so days with no records render
                          as gaps instead of pretending day 12 is adjacent to
                          day 28 (B13). */}
                      <Area type="monotone" dataKey="value" stroke={dB1} strokeWidth={2.5} fill="url(#trendGrad)" dot={false}
                        connectNulls={false}
                        activeDot={{ r: 5, fill: dB1, stroke: "#fff", strokeWidth: 2 }} animationDuration={1200} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Absent Students Table */}
          <div className="mt-5 bg-white rounded-[20px] overflow-hidden"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
            <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center gap-[10px]">
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 4px 14px rgba(255,51,85,0.26)" }}>
                  <XCircle className="w-4 h-4 text-white" strokeWidth={2.4} />
                </div>
                <h2 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Absent Students Today</h2>
                <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                  style={{ background: dRED_S, color: dRED, border: `0.5px solid ${dRED_B}` }}>
                  {absentStudents.length}
                </span>
              </div>
              {absentStudents.length > 0 && (
                <button
                  onClick={sendAbsenceAlerts}
                  disabled={sendingAlerts}
                  className="h-10 px-4 rounded-[12px] flex items-center gap-1.5 text-[12px] font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.26)" }}>
                  {sendingAlerts
                    ? <Loader2 className="w-[13px] h-[13px] animate-spin" />
                    : <Send className="w-[13px] h-[13px]" strokeWidth={2.4} />}
                  {sendingAlerts ? "Sending…" : "Alert Parents"}
                </button>
              )}
            </div>

            {absentStudents.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
                  style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}`, boxShadow: "0 0 0 8px rgba(0,200,83,0.05)" }}>
                  <CheckCircle className="w-8 h-8" style={{ color: dGREEN }} strokeWidth={2.2} />
                </div>
                <p className="text-[14px] font-bold" style={{ color: dT1 }}>No absent students today</p>
                <p className="text-[11px]" style={{ color: dT4 }}>All students present or late</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr style={{ background: dBG, borderBottom: `0.5px solid ${dSEP}` }}>
                      {["Student", "Class", "Contact", "Consecutive", "Monthly %", "Status"].map((h, i) => (
                        <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.10em] ${i >= 3 && i <= 4 ? "text-center" : "text-left"}`}
                          style={{ color: dT4 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {absentStudents.map((s, i) => (
                      <tr key={i} className="transition-colors hover:bg-[#F8FAFF]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                              style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 3px 10px rgba(255,51,85,0.22)" }}>
                              {s.initials}
                            </div>
                            <p className="text-[13px] font-bold" style={{ color: dT1 }}>{s.name}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-3 py-[4px] rounded-full text-[11px] font-bold"
                            style={{ background: "rgba(0,85,255,0.10)", color: dB1, border: "0.5px solid rgba(0,85,255,0.20)" }}>
                            {s.grade}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[12px] font-medium" style={{ color: dT3 }}>{s.contact}</td>
                        <td className="px-5 py-4 text-center text-[13px] font-bold"
                          style={{ color: s.consecutiveNum >= 3 ? dRED : s.consecutiveNum >= 2 ? dORANGE : dT1 }}>
                          {s.consecutive}
                        </td>
                        <td className="px-5 py-4 text-center text-[13px] font-bold"
                          style={{ color: s.monthlyVal < 60 ? dRED : s.monthlyVal < 80 ? dORANGE : dGREEN_D }}>
                          {s.monthly}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 px-3 py-[4px] rounded-full text-[10px] font-bold uppercase tracking-[0.08em]"
                            style={{
                              background: s.status === "Chronic" ? dRED_S : s.status === "Warning" ? "rgba(255,170,0,0.10)" : dGREEN_S,
                              color: s.status === "Chronic" ? dRED : s.status === "Warning" ? "#884400" : dGREEN_D,
                              border: `0.5px solid ${s.status === "Chronic" ? dRED_B : s.status === "Warning" ? "rgba(255,170,0,0.22)" : dGREEN_B}`,
                            }}>
                            <span className="w-[6px] h-[6px] rounded-full"
                              style={{ background: s.status === "Chronic" ? dRED : s.status === "Warning" ? dGOLD : dGREEN }} />
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI Intelligence */}
          <div className="mt-5 rounded-[22px] px-7 py-6 relative overflow-hidden"
            style={{
              background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
              boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
            }}>
            <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <Sparkles className="w-4 h-4 text-white" strokeWidth={2.4} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Attendance Intelligence</span>
            </div>
            <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
              {stats.monthlyAvgVal === null ? (
                // No 30-day data at all — don't pretend a tier or list 0/0/0 today.
                <>No attendance has been recorded yet — once teachers start marking, the 30-day average and today's counts will appear here.</>
              ) : stats.totalToday === 0 ? (
                // Have monthly history, but no records for TODAY yet — surface
                // that explicitly instead of saying "0 present, 0 absent, 0 late
                // today" alongside a 92% average (which reads as a contradiction).
                <>30-day attendance is tracking at <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.monthlyAvg}</strong> ({tier}). <strong style={{ color: "#fff", fontWeight: 700 }}>No attendance has been marked yet today</strong> — figures will populate as teachers record.</>
              ) : (
                <>30-day attendance is tracking at <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.monthlyAvg}</strong> ({tier}). Today: <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.presentToday} present</strong>, <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.absentToday} absent</strong>, <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.lateToday} late</strong> (out of {stats.totalToday} marked).</>
              )}
              {suddenDrops.length > 0 && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{suddenDrops.length} class{suddenDrops.length === 1 ? "" : "es"}</strong> showed a sudden 15%+ drop this week — immediate review recommended.</>}
              {absentStudents.filter(s => s.status === "Chronic").length > 0 && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{absentStudents.filter(s => s.status === "Chronic").length} student{absentStudents.filter(s => s.status === "Chronic").length === 1 ? "" : "s"}</strong> flagged as chronic absentees.</>}
            </p>
            <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
              <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: dB4 }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated · Real-time data</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Attendance;
