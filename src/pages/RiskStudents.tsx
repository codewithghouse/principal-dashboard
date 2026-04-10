import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, Flame, Bell, UserPlus, ChevronRight,
  Loader2, ShieldAlert, Filter
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import RiskIntervention from "@/components/RiskIntervention";

type RiskLevel = "CRITICAL" | "WARNING" | "MONITORING";
type FilterTab = "All" | RiskLevel;

interface RiskStudent {
  id: string;
  name: string;
  email: string;
  className: string;
  teacherName: string;
  teacherId: string;
  schoolId: string;
  branchId: string;
  attPct: number | null;
  avgScore: number | null;
  incidentCount: number;
  parentEngagement: number; // 0-100 score based on notes/meetings
  riskLevel: RiskLevel;
  riskFactors: string[];
  lastAction: string;
  assignedTo: string;
  daysFlagged: number;
  flaggedSince: string; // ISO date string
}

// ── helpers ────────────────────────────────────────────────────────────────────

const toDateStr = (d: any): string => {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return "";
};

const daysBetween = (isoA: string, isoB: string): number => {
  if (!isoA || !isoB) return 0;
  return Math.max(0, Math.round((new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000));
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const startOfWeekStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────────────────────

const RiskStudents = () => {
  const { userData } = useAuth();

  const [riskStudents, setRiskStudents] = useState<RiskStudent[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterTab, setFilterTab]       = useState<FilterTab>("All");
  const [selectedStudent, setSelectedStudent] = useState<RiskStudent | null>(null);

  // Cross-listener refs
  const studentsRef    = useRef<any[]>([]);
  const enrollmentsRef = useRef<any[]>([]);
  const attRef         = useRef<any[]>([]);
  const resultsRef     = useRef<any[]>([]);
  const incidentsRef   = useRef<any[]>([]);
  const parentNotesRef = useRef<any[]>([]);
  const interventionsRef = useRef<any[]>([]);
  const flagsRef       = useRef<any[]>([]);

  // ── compute all at-risk students from current refs ──────────────────────────
  const compute = () => {
    // Build unique student map: id → base info
    const map = new Map<string, any>();

    studentsRef.current.forEach(s => {
      const key = s.id;
      map.set(key, { ...s, _source: "students" });
    });
    enrollmentsRef.current.forEach(e => {
      const key = e.studentId || e.id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: e.studentName || e.name || "Unknown",
          email: e.studentEmail || e.email || "",
          className: e.className || "",
          teacherName: e.teacherName || "",
          teacherId: e.teacherId || "",
          schoolId: e.schoolId || "",
          branchId: e.branchId || "",
          _source: "enrollments",
        });
      }
    });

    const today = todayStr();
    const results: RiskStudent[] = [];

    map.forEach((s) => {
      const email = (s.email || s.studentEmail || "").toLowerCase();
      const sid   = s.id;

      // ── Attendance ──
      const attRecs = attRef.current.filter(r =>
        (sid   && r.studentId === sid) ||
        (email && r.studentEmail?.toLowerCase() === email)
      );
      let attPct: number | null = null;
      if (attRecs.length > 0) {
        const present = attRecs.filter(r => r.status === "present" || r.status === "late").length;
        attPct = Math.round((present / attRecs.length) * 100);
      }

      // ── Academic ──
      const resultRecs = resultsRef.current.filter(r =>
        (sid   && r.studentId === sid) ||
        (email && r.studentEmail?.toLowerCase() === email)
      );
      let avgScore: number | null = null;
      if (resultRecs.length > 0) {
        const sum = resultRecs.reduce((a, r) => a + Number(r.percentage || r.score || 0), 0);
        avgScore = Math.round(sum / resultRecs.length);
      }

      // ── Incidents ──
      const incRecs = incidentsRef.current.filter(r =>
        (sid   && r.studentId === sid) ||
        (email && r.studentEmail?.toLowerCase() === email)
      );

      // ── Parent engagement score (0-100) ──
      const notes = parentNotesRef.current.filter(r =>
        (sid && r.studentId === sid) ||
        (email && r.studentEmail?.toLowerCase() === email)
      );
      const parentEngagement = Math.min(100, notes.length * 20); // 5+ notes = 100%

      // ── Determine risk level ──
      const factors: string[] = [];
      let riskLevel: RiskLevel | null = null;

      if (attPct !== null && attPct < 60) { factors.push("Attendance"); riskLevel = "CRITICAL"; }
      else if (attPct !== null && attPct < 75) { factors.push("Attendance"); if (!riskLevel) riskLevel = "WARNING"; }

      if (avgScore !== null && avgScore < 40) { factors.push("Academics"); riskLevel = "CRITICAL"; }
      else if (avgScore !== null && avgScore < 55) { factors.push("Academics"); if (!riskLevel) riskLevel = "WARNING"; }

      const criticalInc = incRecs.filter(i => i.severity === "critical" || i.severity === "high").length;
      if (criticalInc >= 2) { factors.push("Discipline"); riskLevel = "CRITICAL"; }
      else if (incRecs.length >= 1) { factors.push("Discipline"); if (!riskLevel) riskLevel = "WARNING"; }

      // MONITORING: no critical/warning factors but still has some data
      if (!riskLevel && (attPct !== null || avgScore !== null)) {
        if (attPct !== null && attPct < 85) { factors.push("Attendance trend"); riskLevel = "MONITORING"; }
      }

      if (!riskLevel || factors.length === 0) return; // Not at risk

      // ── Days flagged (from earliest at-risk indicator) ──
      const earliestAttDate = attRecs
        .filter(r => r.status === "absent")
        .map(r => toDateStr(r.date))
        .filter(Boolean)
        .sort()[0];
      const flaggedSince = earliestAttDate || today;
      const daysFlagged  = daysBetween(flaggedSince, today);

      // ── Last action from interventions ──
      const studentInterventions = interventionsRef.current
        .filter(i => i.studentId === sid)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const lastAction = studentInterventions[0]?.actionTitle || "—";

      // ── Assigned counselor from flags ──
      const counselorFlag = flagsRef.current.find(f =>
        f.studentId === sid && f.type === "counselor_assigned" && f.status === "active"
      );
      const assignedTo = counselorFlag?.counselorName || s.teacherName || "—";

      results.push({
        id: sid,
        name: s.name || s.studentName || "Unknown",
        email,
        className: s.className || "",
        teacherName: s.teacherName || "",
        teacherId: s.teacherId || "",
        schoolId: s.schoolId || userData?.schoolId || "",
        branchId: s.branchId || userData?.branchId || "",
        attPct,
        avgScore,
        incidentCount: incRecs.length,
        parentEngagement,
        riskLevel,
        riskFactors: factors,
        lastAction,
        assignedTo,
        daysFlagged,
        flaggedSince,
      });
    });

    // Sort: CRITICAL first, then WARNING, then MONITORING; within level by daysFlagged desc
    results.sort((a, b) => {
      const order = { CRITICAL: 0, WARNING: 1, MONITORING: 2 };
      if (order[a.riskLevel] !== order[b.riskLevel]) return order[a.riskLevel] - order[b.riskLevel];
      return b.daysFlagged - a.daysFlagged;
    });

    setRiskStudents(results);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    setLoading(true);
    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(query(collection(db, "students"),       ...C), snap => { studentsRef.current    = snap.docs.map(d => ({ id: d.id, ...d.data() })); compute(); }));
    unsubs.push(onSnapshot(query(collection(db, "enrollments"),    ...C), snap => { enrollmentsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() })); compute(); }));
    unsubs.push(onSnapshot(query(collection(db, "attendance"),     ...C), snap => { attRef.current         = snap.docs.map(d => d.data()); compute(); }));
    unsubs.push(onSnapshot(query(collection(db, "results"),        ...C), snap => { resultsRef.current     = snap.docs.map(d => d.data()); compute(); }));
    unsubs.push(onSnapshot(query(collection(db, "incidents"),      ...C), snap => { incidentsRef.current   = snap.docs.map(d => ({ id: d.id, ...d.data() })); compute(); }));
    unsubs.push(onSnapshot(query(collection(db, "parent_notes"),   ...C), snap => { parentNotesRef.current = snap.docs.map(d => d.data()); compute(); }));
    unsubs.push(onSnapshot(query(collection(db, "interventions"),  ...C), snap => { interventionsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() })); compute(); }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "student_flags"),  ...C), snap => { flagsRef.current       = snap.docs.map(d => ({ id: d.id, ...d.data() })); compute(); }, () => {}));

    return () => unsubs.forEach(u => u());
  }, [userData?.schoolId, userData?.branchId]);

  // ── Derived counts ───────────────────────────────────────────────────────────
  const criticalCount  = riskStudents.filter(s => s.riskLevel === "CRITICAL").length;
  const warningCount   = riskStudents.filter(s => s.riskLevel === "WARNING").length;
  const weekStart      = startOfWeekStr();
  const newThisWeek    = riskStudents.filter(s => s.flaggedSince >= weekStart).length;

  const filtered = filterTab === "All"
    ? riskStudents
    : riskStudents.filter(s => s.riskLevel === filterTab);

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selectedStudent) {
    return (
      <RiskIntervention
        student={selectedStudent}
        onBack={() => setSelectedStudent(null)}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Risk Students</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">Monitor and intervene with at-risk students</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total At-Risk"
          value={loading ? "—" : riskStudents.length}
          sub={!loading && riskStudents.length > 0 ? `↑ ${newThisWeek} from last week` : "No flagged students"}
          subColor={riskStudents.length > 0 ? "text-rose-500" : "text-slate-400"}
          icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
          iconBg="bg-rose-100"
        />
        <StatCard
          label="Critical"
          value={loading ? "—" : criticalCount}
          sub="Immediate action"
          subColor="text-slate-400"
          icon={<Flame className="w-5 h-5 text-orange-500" />}
          iconBg="bg-orange-100"
          valueColor="text-rose-600"
        />
        <StatCard
          label="Warning"
          value={loading ? "—" : warningCount}
          sub="Monitor closely"
          subColor="text-slate-400"
          icon={<Bell className="w-5 h-5 text-amber-500" />}
          iconBg="bg-amber-100"
          valueColor="text-amber-500"
        />
        <StatCard
          label="New This Week"
          value={loading ? "—" : newThisWeek}
          sub="Since Monday"
          subColor="text-slate-400"
          icon={<UserPlus className="w-5 h-5 text-blue-500" />}
          iconBg="bg-blue-100"
          valueColor="text-blue-600"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["All", "CRITICAL", "WARNING", "MONITORING"] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all border ${
              filterTab === tab
                ? tab === "CRITICAL" ? "bg-rose-500 text-white border-rose-500"
                  : tab === "WARNING" ? "bg-amber-500 text-white border-amber-500"
                  : "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {tab === "All"
              ? `All (${riskStudents.length})`
              : tab === "CRITICAL" ? `Critical (${criticalCount})`
              : tab === "WARNING"  ? `Warning (${warningCount})`
              : `Monitoring (${riskStudents.filter(s => s.riskLevel === "MONITORING").length})`
            }
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-slate-300 animate-spin mb-4" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analyzing Student Risk Data...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-32 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
              <ShieldAlert className="w-10 h-10 text-slate-200" />
            </div>
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
              {filterTab === "All" ? "No at-risk students detected" : `No ${filterTab.toLowerCase()} students`}
            </p>
            <p className="text-xs text-slate-300 font-medium mt-2">
              {filterTab === "All"
                ? "Risk factors appear when attendance or results data is recorded"
                : "Try switching to All to see the full list"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Level</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Factors</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Days Flagged</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Action</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned To</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(s => (
                  <tr key={s.id} className={`hover:bg-slate-50/40 transition-colors ${s.riskLevel === "CRITICAL" ? "bg-rose-50/20" : ""}`}>
                    {/* Student */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm ${
                          s.riskLevel === "CRITICAL" ? "bg-rose-500" :
                          s.riskLevel === "WARNING"  ? "bg-amber-500" : "bg-slate-500"
                        }`}>
                          {s.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{s.name}</p>
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {s.className || "—"}
                            {s.attPct !== null && ` • Att: ${s.attPct}%`}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Risk Level */}
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        s.riskLevel === "CRITICAL" ? "bg-rose-500 text-white" :
                        s.riskLevel === "WARNING"  ? "bg-amber-100 text-amber-700 border border-amber-200" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {s.riskLevel}
                      </span>
                    </td>

                    {/* Risk Factors */}
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-1.5">
                        {s.riskFactors.map((f, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Days Flagged */}
                    <td className="px-6 py-5">
                      <span className={`font-bold text-sm ${s.daysFlagged >= 10 ? "text-rose-600" : s.daysFlagged >= 5 ? "text-amber-600" : "text-slate-600"}`}>
                        {s.daysFlagged > 0 ? `${s.daysFlagged} days` : "Today"}
                      </span>
                    </td>

                    {/* Last Action */}
                    <td className="px-6 py-5">
                      <span className="text-sm text-slate-500 font-medium">{s.lastAction}</span>
                    </td>

                    {/* Assigned To */}
                    <td className="px-6 py-5">
                      <span className="text-sm text-slate-700 font-medium">{s.assignedTo}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-5 text-right">
                      <button
                        onClick={() => setSelectedStudent(s)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-[#1e3a8a] transition-colors shadow-sm"
                      >
                        View Action <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Shared components ──────────────────────────────────────────────────────────

const StatCard = ({
  label, value, sub, subColor, icon, iconBg, valueColor = "text-slate-900"
}: {
  label: string; value: any; sub: string; subColor: string;
  icon: React.ReactNode; iconBg: string; valueColor?: string;
}) => (
  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-xs text-slate-500 font-medium mb-2">{label}</p>
      <p className={`text-4xl font-black tracking-tight ${valueColor}`}>{value}</p>
      <p className={`text-[11px] font-semibold mt-1.5 ${subColor}`}>{sub}</p>
    </div>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
      {icon}
    </div>
  </div>
);

export default RiskStudents;
