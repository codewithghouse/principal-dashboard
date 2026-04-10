import { useState, useEffect } from "react";
import { ShieldAlert, Clock, AlertTriangle, AlertCircle, Plus, FileText, Calendar, X } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, where, addDoc, Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import IncidentDetail from "@/components/IncidentDetail";

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

const BLANK_FORM = {
  title: '', type: 'Behavioral', severity: 'Medium',
  date: new Date().toLocaleDateString('en-CA'),
  time: new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }),
  location: '', description: '', studentName: '', studentGrade: '', reportedBy: ''
};

const Discipline = () => {
  const { userData } = useAuth();
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
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    const w = window.open('', '_blank');
    if (!w) return;
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    w.document.write(`<html><head><title>Discipline Report</title><style>
      body{font-family:Arial,sans-serif;padding:40px;color:#1e293b}
      h1{color:#1e3a8a}h2{color:#334155;margin-top:28px}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th{background:#1e3a8a;color:#fff;padding:10px 14px;text-align:left;font-size:12px}
      td{padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px}
      .stats{display:flex;gap:40px;margin:24px 0}
      .sv{font-size:30px;font-weight:900;color:#1e3a8a}
      .sl{font-size:12px;color:#64748b;font-weight:600}
    </style></head><body>
      <h1>Discipline & Incidents Report</h1>
      <p style="color:#64748b">Generated: ${dateStr}</p>
      <div class="stats">
        <div><div class="sv">${stats.todayCount}</div><div class="sl">Today</div></div>
        <div><div class="sv">${stats.pendingCount}</div><div class="sl">Pending</div></div>
        <div><div class="sv">${stats.weekCount}</div><div class="sl">This Week</div></div>
        <div><div class="sv">${stats.criticalCount}</div><div class="sl">Critical</div></div>
      </div>
      <h2>Incident List</h2>
      <table><thead><tr><th>Date</th><th>Student</th><th>Type</th><th>Severity</th><th>Status</th></tr></thead>
      <tbody>${filteredIncidents.map(i =>
        `<tr><td>${i.date||'—'}</td><td>${i.student?.name||'Unknown'}</td><td>${i.type||'—'}</td><td>${i.severity||'—'}</td><td>${i.status||'Open'}</td></tr>`
      ).join('')}</tbody></table>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  if (selectedIncident) {
    return <IncidentDetail incident={selectedIncident} onBack={() => setSelectedIncident(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Discipline & Incidents</h1>
        <p className="text-sm text-muted-foreground">Track and manage disciplinary incidents</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#1e3a8a] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* ===== 4 STAT CARDS ===== */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Today's Incidents</span>
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
              </div>
              <p className="text-4xl font-black text-foreground mb-1">{stats.todayCount}</p>
              <p className="text-xs text-muted-foreground font-medium">Logged today</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Pending Actions</span>
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <p className="text-4xl font-black text-amber-500 mb-1">{stats.pendingCount}</p>
              <p className="text-xs text-muted-foreground font-medium">Require follow-up</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">This Week</span>
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <p className="text-4xl font-black text-foreground mb-1">{stats.weekCount}</p>
              <p className="text-xs text-muted-foreground font-medium">Total incidents</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Critical Cases</span>
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
              </div>
              <p className="text-4xl font-black text-red-500 mb-1">{stats.criticalCount}</p>
              <p className="text-xs text-muted-foreground font-medium">High priority</p>
            </div>
          </div>

          {/* ===== FILTER ROW + LOG BUTTON ===== */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Quick filters */}
              {(['all', 'week', 'critical'] as const).map((f, i) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    filterType === f ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-card border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {['All Types', 'This Week', 'Critical Only'][i]}
                </button>
              ))}
              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-border bg-card text-muted-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="under review">Under Review</option>
                <option value="resolved">Resolved</option>
              </select>
              {/* Search */}
              <input
                type="text"
                placeholder="Search student / type..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 placeholder:text-muted-foreground w-48"
              />
            </div>
            <button
              onClick={() => setShowLogModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#e11d48] text-white rounded-xl text-sm font-bold shadow-lg shadow-red-200 hover:bg-red-600 transition-all"
            >
              <Plus className="w-4 h-4" /> Log New Incident
            </button>
          </div>

          {/* ===== PIE CHART + RECENT INCIDENTS ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Incident Type Breakdown */}
            <div className="lg:col-span-4 bg-card border border-border rounded-2xl p-7 shadow-sm">
              <h3 className="text-base font-bold text-foreground mb-2">Incident Type Breakdown</h3>
              {pieData.length === 0 ? (
                <div className="flex items-center justify-center h-60">
                  <p className="text-sm text-muted-foreground">No data available</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={renderLabel}
                        labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                        animationBegin={0}
                        animationDuration={1200}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value}%`, name]}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Legend */}
                  <div className="space-y-2 mt-2">
                    {pieData.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="font-medium text-muted-foreground">{p.name}</span>
                        </div>
                        <span className="font-black text-foreground">{p.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Recent Incidents Table */}
            <div className="lg:col-span-8 bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-7 py-5 border-b border-border">
                <h3 className="text-base font-bold text-foreground">Recent Incidents</h3>
              </div>
              {filteredIncidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <ShieldAlert className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-muted-foreground">No incidents found</p>
                  <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-border bg-secondary/20">
                        <th className="text-left px-6 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Date</th>
                        <th className="text-left px-6 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Student</th>
                        <th className="text-left px-6 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Type</th>
                        <th className="text-left px-6 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Severity</th>
                        <th className="text-left px-6 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Status</th>
                        <th className="text-left px-6 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredIncidents.slice(0, 20).map((inc, i) => (
                        <tr
                          key={inc.id || i}
                          className={`hover:bg-secondary/30 transition-colors ${
                            ['HIGH','CRITICAL'].includes((inc.severity||'').toUpperCase()) ? 'bg-red-50/30' : ''
                          }`}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                            {inc.date ? new Date(inc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                {(inc.student?.name || 'UK').substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-foreground">{inc.student?.name || 'Unknown'}</p>
                                {inc.student?.grade && <p className="text-[10px] text-muted-foreground font-medium">{inc.student.grade}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-foreground">{inc.type || inc.title || '—'}</td>
                          <td className="px-6 py-4">{getSeverityBadge(inc.severity)}</td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-bold ${getStatusColor(inc.status)}`}>
                              {inc.status || 'Open'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setSelectedIncident(inc)}
                              className="px-3 py-1.5 text-xs font-bold text-[#1e3a8a] border border-[#1e3a8a]/30 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                              View
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

          {/* ===== ACTION BUTTONS ===== */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setFilterType('all')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors"
            >
              <ShieldAlert className="w-4 h-4 text-muted-foreground" /> View All Incidents
            </button>
            <button
              onClick={generateReport}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors"
            >
              <FileText className="w-4 h-4 text-muted-foreground" /> Generate Report
            </button>
          </div>
        </>
      )}

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
