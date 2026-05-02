import React, { useState, useEffect } from "react";
import { ShieldAlert, Clock, AlertTriangle, AlertCircle, Plus, FileText, Calendar, X, Sparkles, ChevronRight, BookOpen } from "lucide-react";
import DisciplineIntelligence from "@/components/DisciplineIntelligence";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Label } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, where, addDoc, Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import IncidentDetail from "@/components/IncidentDetail";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, outerRadius, name }: any) => {
  const radius = outerRadius + 22;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      fontSize={10} fontWeight={700} fill="#64748b">
      {name}
    </text>
  );
};

const PIE_COLORS: Record<string, string> = {
  Behavioral: "#f59e0b", Academic: "#1e3a8a", Safety: "#ef4444",
  Property: "#94a3b8", Other: "#64748b"
};

const getSeverityBadge = (severity: string) => {
  const s = (severity || '').toUpperCase();
  if (s === 'CRITICAL') return <span className="px-2.5 py-1 bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-wider rounded-md">CRITICAL</span>;
  if (s === 'HIGH')     return <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-[10px] font-black uppercase tracking-wider rounded-md">HIGH</span>;
  if (s === 'MEDIUM')   return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider rounded-md">MEDIUM</span>;
  return <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-md">LOW</span>;
};

const getStatusColor = (status: string) => {
  if (status === 'Resolved')     return 'text-green-600';
  if (status === 'Under Review') return 'text-amber-500';
  if (status === 'Open')         return 'text-blue-500';
  return 'text-slate-600';
};

const fieldInputStyle = (t1: string, t4: string): React.CSSProperties => ({
  width: "100%",
  padding: "12px 14px",
  background: "#EEF4FF",
  borderRadius: 13,
  border: "0.5px solid rgba(0,85,255,.12)",
  fontFamily: "inherit",
  fontSize: 13,
  color: t1,
  fontWeight: 400,
  outline: "none",
  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
  // placeholder handled via pseudo; fallback: rely on browser defaults
  ...({} as any),
  // keep t4 referenced
  caretColor: t4 ? undefined : undefined,
});

const selectInputStyle = (t1: string): React.CSSProperties => ({
  width: "100%",
  padding: "12px 14px",
  background: "#EEF4FF",
  borderRadius: 13,
  border: "0.5px solid rgba(0,85,255,.12)",
  fontFamily: "inherit",
  fontSize: 13,
  color: t1,
  fontWeight: 400,
  outline: "none",
  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
});

const BLANK_FORM = {
  title: '', type: 'Behavioral', severity: 'Medium',
  date: new Date().toLocaleDateString('en-CA'),
  time: new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }),
  location: '', description: '', studentName: '', studentGrade: '', reportedBy: ''
};

const Discipline = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pieData, setPieData] = useState<any[]>([]);
  const [stats, setStats] = useState({ todayCount: 0, pendingCount: 0, weekCount: 0, criticalCount: 0 });

  // Filters
  const [filterType, setFilterType]     = useState<'all' | 'week' | 'critical'>('all');
  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Log Incident modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [form, setForm]                 = useState(BLANK_FORM);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);

    const constraints: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) constraints.push(where("branchId", "==", userData.branchId));

    const unsub = onSnapshot(query(collection(db, "incidents"), ...constraints), (snap) => {
      const data: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setIncidents(data);

      const today   = new Date().toLocaleDateString('en-CA');
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toLocaleDateString('en-CA');

      setStats({
        todayCount:    data.filter(i => i.date === today).length,
        pendingCount:  data.filter(i => (i.status || '').toLowerCase() !== 'resolved').length,
        weekCount:     data.filter(i => i.date && i.date >= weekAgoStr).length,
        criticalCount: data.filter(i => ['HIGH', 'CRITICAL'].includes((i.severity || '').toUpperCase())).length
      });

      const typeMap: Record<string, number> = {};
      data.forEach(i => {
        const t = i.type || i.incidentType || 'Other';
        typeMap[t] = (typeMap[t] || 0) + 1;
      });
      const total = data.length || 1;
      setPieData(Object.entries(typeMap).map(([name, count]) => ({
        name, value: Math.round((count / total) * 100), color: PIE_COLORS[name] || '#94a3b8'
      })));

      setLoading(false);
    });

    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  // ── Filtered incidents ──
  const filteredIncidents = incidents.filter(i => {
    if (filterType === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      if (!i.date || i.date < weekAgo.toLocaleDateString('en-CA')) return false;
    }
    if (filterType === 'critical') {
      if (!['HIGH', 'CRITICAL'].includes((i.severity || '').toUpperCase())) return false;
    }
    if (statusFilter !== 'all' && (i.status || 'Open').toLowerCase() !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (
        !i.student?.name?.toLowerCase().includes(q) &&
        !i.type?.toLowerCase().includes(q) &&
        !i.title?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // ── Log new incident ──
  const handleLogIncident = async () => {
    if (!form.studentName || !form.title || !form.type) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'incidents'), {
        title:       form.title,
        type:        form.type,
        severity:    form.severity,
        date:        form.date,
        time:        form.time,
        location:    form.location,
        description: form.description,
        student:     { name: form.studentName, grade: form.studentGrade },
        reportedBy:  form.reportedBy || userData?.name || 'Principal',
        status:      'Open',
        schoolId:    userData?.schoolId || '',
        branchId:    userData?.branchId || '',
        actionLog:   [{
          action: 'Incident Reported',
          time:   new Date().toLocaleString(),
          by:     form.reportedBy || userData?.name || 'Principal',
          color:  'bg-green-500'
        }],
        witnesses:   [],
        attachments: [],
        createdAt:   Timestamp.now()
      });
      setForm(BLANK_FORM);
      setShowLogModal(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Generate Report ──
  const generateReport = () => {
    const html = buildReport({
      title: "Discipline & Incidents Report",
      badge: "Discipline",
      heroStats: [
        { label: "Today",    value: stats.todayCount,    color: "#f87171" },
        { label: "Pending",  value: stats.pendingCount,  color: "#fbbf24" },
        { label: "This Week", value: stats.weekCount },
        { label: "Critical", value: stats.criticalCount, color: stats.criticalCount > 0 ? "#f87171" : "#4ade80" },
      ],
      sections: [
        {
          title: "Incident List",
          type: "table",
          headers: ["Date", "Student", "Type", "Severity", "Status"],
          rows: filteredIncidents.map((i: any) => ({
            cells: [i.date || "—", i.student?.name || "Unknown", i.type || "—", i.severity || "—", i.status || "Open"],
            highlight: ["HIGH", "CRITICAL"].includes((i.severity || "").toUpperCase()),
          })),
        },
      ],
    });
    openReportWindow(html);
  };

  if (selectedIncident) {
    return <IncidentDetail incident={selectedIncident} onBack={() => setSelectedIncident(null)} />;
  }

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const B3 = "#2277FF";
    const GREEN = "#00C853";
    const RED = "#FF3355";
    const GOLD = "#FFAA00";
    const ORANGE = "#FF8800";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const resolvedCount = incidents.filter((i) => (i.status || "").toLowerCase() === "resolved").length;
    const openCount = incidents.length - resolvedCount;

    const handleReportEmpty = () => {
      if (incidents.length === 0) {
        toast.info("No incidents to export yet.");
        return;
      }
      generateReport();
    };

    const avGrad = [
      `linear-gradient(135deg, ${B1}, ${B3})`,
      `linear-gradient(135deg, #7B3FF4, #AA77FF)`,
      `linear-gradient(135deg, ${GREEN}, #22EE66)`,
      `linear-gradient(135deg, ${GOLD}, #FFCC55)`,
      `linear-gradient(135deg, ${RED}, #FF6688)`,
    ];

    const sevStyle = (sev: string) => {
      const s = (sev || "").toUpperCase();
      if (s === "CRITICAL")
        return {
          label: "CRITICAL",
          bg: RED,
          color: "#fff",
          border: "none",
          shadow: "0 2px 7px rgba(255,51,85,.28)",
          stripe: "linear-gradient(180deg,#FF3355,#FF6688)",
        };
      if (s === "HIGH")
        return {
          label: "HIGH",
          bg: "rgba(255,136,0,.10)",
          color: "#884400",
          border: "0.5px solid rgba(255,136,0,.22)",
          shadow: "none",
          stripe: `linear-gradient(180deg,${ORANGE},#FFB344)`,
        };
      if (s === "MEDIUM")
        return {
          label: "MEDIUM",
          bg: "rgba(255,170,0,.10)",
          color: "#884400",
          border: "0.5px solid rgba(255,170,0,.22)",
          shadow: "none",
          stripe: `linear-gradient(180deg,${GOLD},#FFCC55)`,
        };
      return {
        label: "LOW",
        bg: "rgba(80,112,176,.10)",
        color: T3,
        border: "0.5px solid rgba(80,112,176,.22)",
        shadow: "none",
        stripe: `linear-gradient(180deg,${T3},${T4})`,
      };
    };

    const statusStyle = (status: string) => {
      const s = status || "Open";
      if (s === "Resolved") return { bg: "rgba(0,200,83,.10)", color: "#007830", border: "0.5px solid rgba(0,200,83,.22)" };
      if (s === "Under Review") return { bg: "rgba(255,136,0,.10)", color: "#884400", border: "0.5px solid rgba(255,136,0,.22)" };
      return { bg: "rgba(0,85,255,.10)", color: B1, border: "0.5px solid rgba(0,85,255,.22)" };
    };

    const PIE_MOBILE_COLOR: Record<string, string> = {
      Behavioral: RED,
      Academic: B1,
      Safety: "#CC2244",
      Property: T3,
      Other: GOLD,
    };

    // donut circumference
    const donutR = 48;
    const donutC = 2 * Math.PI * donutR;
    let donutOffset = 0;
    const donutSegments = pieData.map((p) => {
      const len = (p.value / 100) * donutC;
      const seg = { ...p, color: PIE_MOBILE_COLOR[p.name] || p.color || B1, dash: len, offset: -donutOffset };
      donutOffset += len;
      return seg;
    });
    const biggestPie = pieData.length > 0 ? [...pieData].sort((a, b) => b.value - a.value)[0] : null;

    const scrollToIncidents = () => {
      requestAnimationFrame(() => {
        document.getElementById("mobile-incident-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

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
              Discipline & Incidents
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400 }}>
              Track and manage disciplinary incidents
            </div>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 14,
              background: `linear-gradient(135deg, ${RED}, #FF6688)`,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 5px 18px rgba(255,51,85,.32)",
              marginTop: 4,
              flexShrink: 0,
            }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Log New
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
                  right: -22,
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
                    <AlertTriangle size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                      Critical Cases
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>
                      {stats.criticalCount}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    padding: "6px 12px",
                    borderRadius: 100,
                    background: "rgba(255,51,85,.26)",
                    border: "0.5px solid rgba(255,51,85,.40)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#FF8899",
                  }}
                >
                  {stats.criticalCount > 0 ? "High Priority" : "All Clear"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
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
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: RED }} />
                  {openCount} active
                </div>
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
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN }} />
                  {resolvedCount} resolved
                </div>
              </div>
            </div>

            {/* STAT GRID */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
              {[
                {
                  label: "Today's Incidents",
                  value: stats.todayCount,
                  sub: "Logged today",
                  color: T1,
                  subColor: T4,
                  icon: <AlertCircle size={14} color={B1} strokeWidth={2.4} />,
                  bg: "rgba(0,85,255,.10)",
                  border: "rgba(0,85,255,.18)",
                  glow: "rgba(0,85,255,.10)",
                  filter: null,
                },
                {
                  label: "Pending Actions",
                  value: stats.pendingCount,
                  sub: "Require follow-up",
                  color: GOLD,
                  subColor: "#884400",
                  icon: <Clock size={14} color={GOLD} strokeWidth={2.4} />,
                  bg: "rgba(255,170,0,.10)",
                  border: "rgba(255,170,0,.22)",
                  glow: "rgba(255,170,0,.10)",
                  filter: "pending",
                },
                {
                  label: "This Week",
                  value: stats.weekCount,
                  sub: "Total incidents",
                  color: B1,
                  subColor: T4,
                  icon: <Calendar size={14} color={B1} strokeWidth={2.4} />,
                  bg: "rgba(0,85,255,.10)",
                  border: "rgba(0,85,255,.18)",
                  glow: "rgba(0,85,255,.10)",
                  filter: "week",
                },
                {
                  label: "Critical Cases",
                  value: stats.criticalCount,
                  sub: "High priority",
                  color: RED,
                  subColor: RED,
                  icon: <AlertTriangle size={14} color={RED} strokeWidth={2.4} />,
                  bg: "rgba(255,51,85,.10)",
                  border: "rgba(255,51,85,.22)",
                  glow: "rgba(255,51,85,.10)",
                  filter: "critical",
                },
              ].map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (c.filter === "week") setFilterType("week");
                    else if (c.filter === "critical") setFilterType("critical");
                    else if (c.filter === "pending") setStatusFilter("open");
                    scrollToIncidents();
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

            {/* FILTER CHIPS */}
            <div
              style={{
                display: "flex",
                gap: 7,
                padding: "12px 20px 0",
                overflowX: "auto",
                scrollbarWidth: "none",
              }}
            >
              {[
                { key: "all" as const, label: "All Types", red: false, active: filterType === "all" },
                { key: "week" as const, label: "This Week", red: false, active: filterType === "week" },
                { key: "critical" as const, label: "Critical Only", red: true, active: filterType === "critical" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setFilterType(f.key); scrollToIncidents(); }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 13,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    border: f.active
                      ? "none"
                      : f.red
                      ? "0.5px solid rgba(255,51,85,.22)"
                      : "0.5px solid rgba(0,85,255,.12)",
                    background: f.active
                      ? `linear-gradient(135deg, ${B1}, ${B2})`
                      : f.red
                      ? "rgba(255,51,85,.10)"
                      : "#fff",
                    color: f.active ? "#fff" : f.red ? RED : T3,
                    boxShadow: f.active
                      ? "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)"
                      : "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  }}
                >
                  {f.label}
                </button>
              ))}

              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); scrollToIncidents(); }}
                style={{
                  padding: "0 12px",
                  borderRadius: 13,
                  fontSize: 12,
                  fontWeight: 700,
                  color: T2,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  border: "0.5px solid rgba(0,85,255,.12)",
                  background: "#fff",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  fontFamily: "inherit",
                  height: 36,
                  appearance: "none",
                  WebkitAppearance: "none",
                  outline: "none",
                }}
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="under review">Under Review</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* SEARCH */}
            <div style={{ padding: "10px 20px 0" }}>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search student, type, title..."
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "#fff",
                  borderRadius: 13,
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

            {/* BREAKDOWN LABEL */}
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
              <span>Incident Type Breakdown</span>
              <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
            </div>

            {/* DONUT CARD */}
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
              <div style={{ fontSize: 15, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 16 }}>
                Incident Type Breakdown
              </div>

              {donutSegments.length === 0 ? (
                <div style={{ fontSize: 12, color: T3, textAlign: "center", padding: "24px 0" }}>
                  No incident data yet.
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ position: "relative", width: 130, height: 130, flexShrink: 0 }}>
                    <svg width="130" height="130" viewBox="0 0 130 130">
                      <circle cx="65" cy="65" r={donutR} fill="none" stroke="#E0ECFF" strokeWidth="18" />
                      <g transform="rotate(-90 65 65)">
                        {donutSegments.map((seg, i) => (
                          <circle
                            key={i}
                            cx="65"
                            cy="65"
                            r={donutR}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="18"
                            strokeDasharray={`${seg.dash} ${donutC}`}
                            strokeDashoffset={seg.offset}
                          />
                        ))}
                      </g>
                    </svg>
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%,-50%)",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 22, fontWeight: 700, color: B1, letterSpacing: "-0.5px", lineHeight: 1 }}>
                        {biggestPie ? `${biggestPie.value}%` : "0%"}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: T4, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
                        {biggestPie ? biggestPie.name : "—"}
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                    {donutSegments.map((p, i) => {
                      const count = incidents.filter((inc) => (inc.type || inc.incidentType || "Other") === p.name).length;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, opacity: p.value === 0 ? 0.45 : 1 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T1, marginBottom: 1 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: T4, fontWeight: 500 }}>
                              {count} incident{count === 1 ? "" : "s"}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: p.color }}>{p.value}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RECENT LABEL */}
            <div
              id="mobile-incident-list"
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
              <span>Recent Incidents</span>
              <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
            </div>

            {/* INCIDENT CARD */}
            <div
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
                <div style={{ fontSize: 15, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>Recent Incidents</div>
                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: 100,
                    background: "rgba(0,85,255,.10)",
                    border: "0.5px solid rgba(0,85,255,.18)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: B1,
                  }}
                >
                  {filteredIncidents.length} record{filteredIncidents.length === 1 ? "" : "s"}
                </div>
              </div>

              {filteredIncidents.length === 0 ? (
                <div style={{ padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <ShieldAlert size={48} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: T1 }}>No incidents found</div>
                  <div style={{ fontSize: 11, color: T4 }}>Try adjusting your filters</div>
                </div>
              ) : (
                filteredIncidents.slice(0, 20).map((inc, i) => {
                  const sev = sevStyle(inc.severity);
                  const st = statusStyle(inc.status || "Open");
                  const name = inc.student?.name || "Unknown";
                  const initials = name.substring(0, 2).toUpperCase();
                  const grade = inc.student?.grade || inc.grade || "";
                  const dateLabel = inc.date
                    ? new Date(inc.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "—";
                  const typeLabel = inc.type || inc.title || "—";
                  return (
                    <button
                      key={inc.id || i}
                      onClick={() => setSelectedIncident(inc)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 13,
                        padding: "15px 18px 15px 22px",
                        borderBottom: i === Math.min(filteredIncidents.length, 20) - 1 ? "none" : `0.5px solid ${SEP}`,
                        background: "#fff",
                        border: "none",
                        borderRadius: 0,
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                        position: "relative",
                      }}
                    >
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3.5, background: sev.stripe }} />
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 13,
                          background: avGrad[i % avGrad.length],
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#fff",
                          flexShrink: 0,
                          boxShadow: "0 3px 10px rgba(0,85,255,.26)",
                        }}
                      >
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T3, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <BookOpen size={11} strokeWidth={2.4} />
                            {typeLabel}
                            {grade && ` · ${grade}`}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Calendar size={10} strokeWidth={2.4} />
                            {dateLabel}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span
                            style={{
                              padding: "4px 9px",
                              borderRadius: 100,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              background: sev.bg,
                              color: sev.color,
                              border: sev.border,
                              boxShadow: sev.shadow,
                            }}
                          >
                            {sev.label}
                          </span>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: 100,
                              fontSize: 10,
                              fontWeight: 700,
                              background: st.bg,
                              color: st.color,
                              border: st.border,
                            }}
                          >
                            {inc.status || "Open"}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: B1, display: "flex", alignItems: "center", gap: 3 }}>
                          View
                          <ChevronRight size={12} strokeWidth={2.5} />
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* ACTION ROW */}
            <div style={{ display: "flex", gap: 8, padding: "14px 20px 0" }}>
              <button
                onClick={() => {
                  setFilterType("all");
                  setStatusFilter("all");
                  setSearchTerm("");
                  scrollToIncidents();
                }}
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
                <AlertCircle size={13} strokeWidth={2.2} />
                View All Incidents
              </button>
              <button
                onClick={handleReportEmpty}
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
                  cursor: "pointer",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                }}
              >
                <FileText size={13} color="rgba(0,85,255,.6)" strokeWidth={2.2} />
                Generate Report
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
                  AI Discipline Intelligence
                </span>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
                <strong style={{ color: "#fff", fontWeight: 700 }}>
                  {stats.criticalCount} critical incident{stats.criticalCount === 1 ? "" : "s"}
                </strong>{" "}
                recorded{incidents.length > 0 ? " this term" : ""}.{" "}
                <strong style={{ color: "#fff", fontWeight: 700 }}>{resolvedCount} resolved</strong>,{" "}
                <strong style={{ color: "#fff", fontWeight: 700 }}>{openCount} open</strong>.{" "}
                {stats.todayCount === 0 ? "No new incidents today." : `${stats.todayCount} new today.`}
                {biggestPie && (
                  <>
                    {" "}<strong style={{ color: "#fff", fontWeight: 700 }}>{biggestPie.name}</strong> is the dominant type at{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>{biggestPie.value}%</strong>.
                  </>
                )}{" "}
                Maintain monitoring and follow up on pending cases to ensure a safe learning environment.
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
                  { v: incidents.length, l: "Total" },
                  { v: resolvedCount, l: "Resolved" },
                  { v: openCount, l: "Pending" },
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

        {/* ─── MOBILE LOG NEW INCIDENT BOTTOM SHEET ─── */}
        {showLogModal && (
          <div
            onClick={() => setShowLogModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,8,40,.55)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 300,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                background: "#fff",
                borderRadius: "28px 28px 0 0",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 -12px 40px rgba(0,8,64,.24)",
                paddingBottom: 24,
                animation: "slideUp .38s cubic-bezier(.34,1.26,.64,1) both",
              }}
            >
              <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
              <div style={{ width: 44, height: 5, background: "rgba(0,85,255,.18)", borderRadius: 3, margin: "14px auto 0" }} />

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 16px", borderBottom: `0.5px solid ${SEP}` }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T1, letterSpacing: "-0.4px" }}>Log New Incident</div>
                  <div style={{ fontSize: 11, color: T4, marginTop: 2 }}>Fill in the details below to record an incident</div>
                </div>
                <button
                  onClick={() => setShowLogModal(false)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: "rgba(0,85,255,.10)",
                    border: "0.5px solid rgba(0,85,255,.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <X size={13} color="rgba(0,85,255,.6)" strokeWidth={2.5} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: "18px 22px 0" }}>
                {/* Title */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                    Incident Title<span style={{ color: RED, marginLeft: 2 }}>*</span>
                  </div>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Bullying Incident – Physical Altercation"
                    style={fieldInputStyle(T1, T4)}
                  />
                </div>

                {/* Student Name + Grade */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                      Student Name<span style={{ color: RED, marginLeft: 2 }}>*</span>
                    </div>
                    <input
                      value={form.studentName}
                      onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
                      placeholder="Full name"
                      style={fieldInputStyle(T1, T4)}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                      Grade / Class
                    </div>
                    <input
                      value={form.studentGrade}
                      onChange={(e) => setForm((f) => ({ ...f, studentGrade: e.target.value }))}
                      placeholder="e.g. 9A"
                      style={fieldInputStyle(T1, T4)}
                    />
                  </div>
                </div>

                {/* Type + Severity */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                      Incident Type<span style={{ color: RED, marginLeft: 2 }}>*</span>
                    </div>
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      style={selectInputStyle(T1)}
                    >
                      <option>Behavioral</option>
                      <option>Academic</option>
                      <option>Safety</option>
                      <option>Property</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                      Severity
                    </div>
                    <select
                      value={form.severity}
                      onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                      style={selectInputStyle(T1)}
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>
                </div>

                {/* Date + Time */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                      Date
                    </div>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      style={fieldInputStyle(T1, T4)}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                      Time
                    </div>
                    <input
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                      style={fieldInputStyle(T1, T4)}
                    />
                  </div>
                </div>

                {/* Location */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                    Location
                  </div>
                  <input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. School Playground, Classroom 5B"
                    style={fieldInputStyle(T1, T4)}
                  />
                </div>

                {/* Reported By */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                    Reported By
                  </div>
                  <input
                    value={form.reportedBy}
                    onChange={(e) => setForm((f) => ({ ...f, reportedBy: e.target.value }))}
                    placeholder="Teacher / Staff name"
                    style={fieldInputStyle(T1, T4)}
                  />
                </div>

                {/* Description */}
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: T4, marginBottom: 7 }}>
                    Description
                  </div>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Describe what happened..."
                    style={{ ...fieldInputStyle(T1, T4), minHeight: 90, resize: "none", lineHeight: 1.6 }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: "flex", gap: 10, padding: "18px 22px 0", borderTop: `0.5px solid ${SEP}`, marginTop: 18 }}>
                <button
                  onClick={() => setShowLogModal(false)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 15,
                    background: "#EEF4FF",
                    border: "0.5px solid rgba(0,85,255,.16)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: T2,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!form.studentName || !form.title) {
                      toast.error("Student Name aur Incident Title required hain.");
                      return;
                    }
                    await handleLogIncident();
                    toast.success("Incident logged successfully.");
                  }}
                  disabled={saving || !form.studentName || !form.title}
                  style={{
                    flex: 1.3,
                    height: 48,
                    borderRadius: 15,
                    background: `linear-gradient(135deg, ${RED}, #FF6688)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    border: "none",
                    cursor: saving ? "not-allowed" : "pointer",
                    boxShadow: "0 5px 18px rgba(255,51,85,.30)",
                    opacity: saving || !form.studentName || !form.title ? 0.55 : 1,
                  }}
                >
                  <AlertTriangle size={14} strokeWidth={2.3} />
                  {saving ? "Saving..." : "Log Incident"}
                </button>
              </div>
            </div>
          </div>
        )}
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

  const sevTheme = (sev: string) => {
    const s = (sev || "").toUpperCase();
    if (s === "CRITICAL") return { grad: `linear-gradient(135deg, ${dRED}, #FF6688)`, bg: dRED_S, color: dRED, border: dRED_B };
    if (s === "HIGH")     return { grad: `linear-gradient(135deg, ${dORANGE}, #FFAA66)`, bg: "rgba(255,136,0,0.10)", color: dORANGE, border: "rgba(255,136,0,0.22)" };
    if (s === "MEDIUM")   return { grad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`, bg: "rgba(255,170,0,0.10)", color: "#884400", border: "rgba(255,170,0,0.22)" };
    return                  { grad: `linear-gradient(135deg, ${dT3}, ${dT4})`, bg: "rgba(153,170,204,0.10)", color: dT3, border: "rgba(153,170,204,0.22)" };
  };

  const statusTheme = (status: string) => {
    if (status === "Resolved")     return { bg: dGREEN_S, color: dGREEN_D, border: dGREEN_B, dot: dGREEN };
    if (status === "Under Review") return { bg: "rgba(255,170,0,0.10)", color: "#884400", border: "rgba(255,170,0,0.22)", dot: dGOLD };
    if (status === "Open")         return { bg: "rgba(0,85,255,0.10)", color: dB1, border: "rgba(0,85,255,0.20)", dot: dB1 };
    return                             { bg: "rgba(153,170,204,0.10)", color: dT3, border: "rgba(153,170,204,0.22)", dot: dT4 };
  };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 6px 18px rgba(255,51,85,0.28)" }}>
            <ShieldAlert className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-bold leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Discipline & Incidents</div>
            <div className="text-[12px] mt-1" style={{ color: dT3 }}>Track and manage disciplinary incidents</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generateReport}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${dSEP}`, color: dT2, boxShadow: dSH }}>
            <FileText className="w-[14px] h-[14px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
            Generate Report
          </button>
          <button
            onClick={() => setShowLogModal(true)}
            className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 6px 22px rgba(255,51,85,0.36), 0 2px 5px rgba(255,51,85,0.18)" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[14px] h-[14px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Log New Incident</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-[20px] py-24 flex flex-col items-center gap-3" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-10 h-10 rounded-full border-[3px] border-t-transparent animate-spin" style={{ borderColor: dB1, borderTopColor: "transparent" }} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: dT4 }}>Loading incidents…</p>
        </div>
      ) : (
        <>
          {/* Red Hero Banner */}
          <div className="rounded-[22px] px-7 py-6 relative overflow-hidden text-white"
            style={{
              background: "linear-gradient(135deg, #660011 0%, #990022 35%, #CC0033 70%, #FF3355 100%)",
              boxShadow: "0 10px 36px rgba(204,0,51,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
            }}>
            <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
            <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <AlertTriangle className="w-7 h-7 text-white" strokeWidth={2.2} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>This Week's Incidents</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[48px] font-bold leading-none tracking-tight">{stats.weekCount}</span>
                    <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>logged · {stats.pendingCount} pending</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold"
                  style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.28)" }}>
                  <Sparkles className="w-[13px] h-[13px]" strokeWidth={2.4} />
                  {stats.criticalCount > 0 ? `${stats.criticalCount} Critical` : "All Clear"}
                </div>
                <div className="flex items-center gap-2 text-[12px] font-bold" style={{ color: "rgba(255,255,255,0.82)" }}>
                  <AlertCircle className="w-[14px] h-[14px]" strokeWidth={2.4} />
                  {stats.todayCount} today
                </div>
              </div>
            </div>
          </div>

          {/* 4 Stat Cards — dashboard-style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
            {[
              {
                title: "Today's Incidents", val: stats.todayCount, valColor: dRED, sub: "Logged today", Icon: AlertCircle,
                cardGrad: "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)",
                tileGrad: `linear-gradient(135deg, ${dRED}, #FF6688)`,
                tileShadow: "0 4px 14px rgba(255,51,85,0.28)",
                decorColor: dRED,
              },
              {
                title: "Pending Actions", val: stats.pendingCount, valColor: dGOLD, sub: "Require follow-up", Icon: Clock,
                cardGrad: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
                tileGrad: `linear-gradient(135deg, ${dGOLD}, #FFDD44)`,
                tileShadow: "0 4px 14px rgba(255,170,0,0.28)",
                decorColor: dGOLD,
              },
              {
                title: "This Week", val: stats.weekCount, valColor: dB1, sub: "Total incidents", Icon: Calendar,
                cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
                tileGrad: `linear-gradient(135deg, ${dB1}, ${dB2})`,
                tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
                decorColor: dB1,
              },
              {
                title: "Critical Cases", val: stats.criticalCount, valColor: dVIOLET, sub: "High priority", Icon: AlertTriangle,
                cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
                tileGrad: `linear-gradient(135deg, ${dVIOLET}, #A07CF8)`,
                tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
                decorColor: dVIOLET,
              },
            ].map(({ title, val, valColor, sub, Icon, cardGrad, tileGrad, tileShadow, decorColor }) => (
              <div
                key={title}
                className="rounded-[20px] p-5 relative overflow-hidden"
                style={{ background: cardGrad, boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}
              >
                <div
                  className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
                  style={{ background: tileGrad, boxShadow: tileShadow }}
                >
                  <Icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
                </div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: dT4 }}>{title}</span>
                <p className="text-[34px] font-bold tracking-tight leading-none mb-1.5" style={{ color: valColor, letterSpacing: "-1.2px" }}>{val}</p>
                <p className="text-[11px] font-semibold truncate" style={{ color: dT3 }}>{sub}</p>
                <Icon
                  className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                  style={{ color: decorColor, opacity: 0.18 }}
                  strokeWidth={2}
                />
              </div>
            ))}
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-2 mt-5 flex-wrap">
            {(['all', 'week', 'critical'] as const).map((f, i) => {
              const active = filterType === f;
              return (
                <button key={f}
                  onClick={() => setFilterType(f)}
                  className="h-10 px-5 rounded-[13px] text-[12px] font-bold transition-transform hover:scale-[1.02]"
                  style={{
                    background: active ? `linear-gradient(135deg, ${dB1}, ${dB2})` : "#FFFFFF",
                    color: active ? "#fff" : dT3,
                    border: active ? "0.5px solid transparent" : `0.5px solid ${dSEP}`,
                    boxShadow: active ? dSH_BTN : dSH,
                  }}>
                  {['All Types', 'This Week', 'Critical Only'][i]}
                </button>
              );
            })}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-10 px-4 pr-9 rounded-[13px] text-[12px] font-bold bg-white outline-none appearance-none cursor-pointer"
              style={{
                border: `0.5px solid ${dSEP}`,
                color: dT2,
                boxShadow: dSH,
                fontFamily: "inherit",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
              }}>
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="under review">Under Review</option>
              <option value="resolved">Resolved</option>
            </select>
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <input
                type="text"
                placeholder="Search student / type..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 px-4 rounded-[13px] bg-white text-[12px] font-medium outline-none"
                style={{ border: `0.5px solid ${dSEP}`, color: dT1, boxShadow: dSH, fontFamily: "inherit" }}
              />
            </div>
          </div>

          {/* Pie Chart + Recent Incidents */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5">
            {/* Pie */}
            <div className="lg:col-span-4 bg-white rounded-[20px] overflow-hidden"
              style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center gap-[10px] px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(123,63,244,0.10)", border: "0.5px solid rgba(123,63,244,0.22)" }}>
                  <BookOpen className="w-4 h-4" style={{ color: dVIOLET }} strokeWidth={2.4} />
                </div>
                <h3 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Incident Types</h3>
              </div>
              <div className="p-6">
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-[220px]">
                    <p className="text-[13px] font-bold" style={{ color: dT4 }}>No data available</p>
                  </div>
                ) : (() => {
                  const totalIncidents = pieData.reduce((acc: number, c: any) => acc + (Number(c.value) || 0), 0);
                  const chartData = pieData.map((p: any, i: number) => ({
                    key: `t${i}`,
                    name: p.name,
                    value: p.value,
                    fill: p.color,
                  }));
                  const chartConfig: ChartConfig = {
                    value: { label: "Share %" },
                    ...Object.fromEntries(
                      chartData.map((d: any) => [d.key, { label: d.name, color: d.fill }])
                    ),
                  };
                  return (
                    <>
                      <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[240px]">
                        <PieChart>
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent hideLabel formatter={(v: any, n: any) => [`${v}%`, n]} />}
                          />
                          <Pie
                            data={chartData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={60}
                            strokeWidth={5}
                            animationDuration={1000}
                          >
                            <Label
                              content={({ viewBox }: any) => {
                                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                  return (
                                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                      <tspan
                                        x={viewBox.cx}
                                        y={viewBox.cy}
                                        style={{ fill: dT1, fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}
                                      >
                                        {totalIncidents}%
                                      </tspan>
                                      <tspan
                                        x={viewBox.cx}
                                        y={(viewBox.cy || 0) + 22}
                                        style={{ fill: dT4, fontSize: 11, fontWeight: 600 }}
                                      >
                                        Total Share
                                      </tspan>
                                    </text>
                                  );
                                }
                                return null;
                              }}
                            />
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                      <div className="space-y-2 mt-4">
                        {pieData.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-[10px]"
                            style={{ background: dBG, border: `0.5px solid ${dSEP}` }}>
                            <div className="flex items-center gap-2">
                              <div className="w-[10px] h-[10px] rounded-[3px]" style={{ background: p.color }} />
                              <span className="text-[12px] font-bold" style={{ color: dT2 }}>{p.name}</span>
                            </div>
                            <span className="text-[13px] font-bold" style={{ color: p.color }}>{p.value}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Table */}
            <div className="lg:col-span-8 bg-white rounded-[20px] overflow-hidden"
              style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
              <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                <div className="flex items-center gap-[10px]">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${dRED}, #FF6688)`, boxShadow: "0 4px 14px rgba(255,51,85,0.26)" }}>
                    <ShieldAlert className="w-4 h-4 text-white" strokeWidth={2.4} />
                  </div>
                  <h3 className="text-[15px] font-bold" style={{ color: dT1, letterSpacing: "-0.2px" }}>Recent Incidents</h3>
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                    style={{ background: "rgba(0,85,255,0.10)", color: dB1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
                    {filteredIncidents.length}
                  </span>
                </div>
              </div>
              {filteredIncidents.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
                    style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}`, boxShadow: "0 0 0 8px rgba(0,200,83,0.05)" }}>
                    <ShieldAlert className="w-8 h-8" style={{ color: dGREEN }} strokeWidth={2.2} />
                  </div>
                  <p className="text-[14px] font-bold" style={{ color: dT1 }}>No incidents found</p>
                  <p className="text-[11px]" style={{ color: dT4 }}>Try adjusting your filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[580px]">
                    <thead>
                      <tr style={{ background: dBG, borderBottom: `0.5px solid ${dSEP}` }}>
                        {["Date", "Student", "Type", "Severity", "Status", ""].map((h, i) => (
                          <th key={i} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.10em] ${i === 5 ? "text-right" : "text-left"}`}
                            style={{ color: dT4 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncidents.slice(0, 20).map((inc, i) => {
                        const sev = sevTheme(inc.severity);
                        const st = statusTheme(inc.status || "Open");
                        const isSevere = ['HIGH', 'CRITICAL'].includes((inc.severity || '').toUpperCase());
                        return (
                          <tr key={inc.id || i}
                            className="transition-colors hover:bg-[#F8FAFF] cursor-pointer"
                            style={{ borderBottom: `0.5px solid ${dSEP}`, background: isSevere ? "rgba(255,51,85,0.02)" : "transparent" }}
                            onClick={() => setSelectedIncident(inc)}>
                            <td className="px-5 py-4 whitespace-nowrap text-[12px] font-medium" style={{ color: dT3 }}>
                              {inc.date ? new Date(inc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                  style={{ background: sev.grad, boxShadow: "0 3px 10px rgba(0,85,255,0.22)" }}>
                                  {(inc.student?.name || 'UK').split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[13px] font-bold truncate" style={{ color: dT1 }}>{inc.student?.name || 'Unknown'}</p>
                                  {inc.student?.grade && <p className="text-[10px] font-medium mt-0.5" style={{ color: dT3 }}>{inc.student.grade}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[12px] font-bold" style={{ color: dT2 }}>{inc.type || inc.title || '—'}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center px-[10px] py-[4px] rounded-full text-[10px] font-bold uppercase tracking-[0.08em]"
                                style={{ background: sev.bg, color: sev.color, border: `0.5px solid ${sev.border}` }}>
                                {(inc.severity || 'LOW').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1.5 px-3 py-[4px] rounded-full text-[10px] font-bold uppercase tracking-[0.08em]"
                                style={{ background: st.bg, color: st.color, border: `0.5px solid ${st.border}` }}>
                                <span className="w-[6px] h-[6px] rounded-full" style={{ background: st.dot }} />
                                {inc.status || 'Open'}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                              <button onClick={() => setSelectedIncident(inc)}
                                className="inline-flex items-center gap-1 h-9 px-3 rounded-[11px] text-[11px] font-bold text-white transition-transform hover:scale-[1.04]"
                                style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 3px 10px rgba(0,85,255,0.22)" }}>
                                View <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Discipline Intelligence</span>
            </div>
            <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
              <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.weekCount} incident{stats.weekCount === 1 ? "" : "s"}</strong> logged this week with <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.pendingCount}</strong> awaiting follow-up.
              {stats.criticalCount > 0 && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.criticalCount} critical case{stats.criticalCount === 1 ? "" : "s"}</strong> require immediate attention.</>}
              {pieData.length > 0 && <> Most common type: <strong style={{ color: "#fff", fontWeight: 700 }}>{pieData[0].name}</strong> at <strong style={{ color: "#fff", fontWeight: 700 }}>{pieData[0].value}%</strong>.</>}
              {" "}Review pending cases and schedule counseling sessions for chronic offenders.
            </p>
            <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
              <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: dB4 }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-generated · Real-time data</span>
            </div>
          </div>
        </>
      )}

      {/* System-driven discipline analytics (was AI proxy, now deterministic — see ai/system/discipline-intelligence.ts) */}
      <DisciplineIntelligence />

      {/* ===== LOG NEW INCIDENT MODAL ===== */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Log New Incident</h2>
              <button onClick={() => setShowLogModal(false)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-7 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Incident Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Bullying Incident – Physical Altercation"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                />
              </div>

              {/* Student */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Student Name *</label>
                  <input
                    value={form.studentName}
                    onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))}
                    placeholder="Full name"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Grade / Class</label>
                  <input
                    value={form.studentGrade}
                    onChange={e => setForm(f => ({ ...f, studentGrade: e.target.value }))}
                    placeholder="e.g. 9A"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                  />
                </div>
              </div>

              {/* Type + Severity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Incident Type *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                  >
                    <option>Behavioral</option>
                    <option>Academic</option>
                    <option>Safety</option>
                    <option>Property</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Severity</label>
                  <select
                    value={form.severity}
                    onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                </div>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Time</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Location</label>
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. School Playground, Classroom 5B"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                />
              </div>

              {/* Reported By */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Reported By</label>
                <input
                  value={form.reportedBy}
                  onChange={e => setForm(f => ({ ...f, reportedBy: e.target.value }))}
                  placeholder="Teacher / Staff name"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe what happened..."
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 bg-background resize-none"
                />
              </div>
            </div>

            <div className="px-7 py-5 border-t border-border flex gap-3">
              <button
                onClick={() => setShowLogModal(false)}
                className="flex-1 py-2.5 border border-border rounded-xl text-sm font-bold text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogIncident}
                disabled={saving || !form.studentName || !form.title}
                className="flex-1 py-2.5 bg-[#e11d48] text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Log Incident'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Discipline;
