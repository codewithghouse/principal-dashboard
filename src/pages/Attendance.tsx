import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CheckCircle, XCircle, Clock, TrendingUp, Send, Edit3, Bell, FileText } from "lucide-react";
import ClassAttendanceDetail from "@/components/ClassAttendanceDetail";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
        Day {payload[0].payload.day}: {payload[0].value}%
      </div>
    );
  }
  return null;
};

const Attendance = () => {
  const { userData } = useAuth();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ presentToday: 0, absentToday: 0, lateToday: 0, monthlyAvg: "0%", totalToday: 0 });
  const [trendData, setTrendData] = useState<any[]>([]);
  const [gradeHeatmap, setGradeHeatmap] = useState<any[]>([]);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);

    const attConstraints: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) attConstraints.push(where("branchId", "==", userData.branchId));

    const unsub = onSnapshot(query(collection(db, "attendance"), ...attConstraints), (snap) => {
      const records: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const today = new Date().toLocaleDateString('en-CA');

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toLocaleDateString('en-CA');

      // ── Today's counts ──
      const todayRecs = records.filter(r => r.date === today);
      const presentToday = todayRecs.filter(r => r.status === 'present').length;
      const absentToday  = todayRecs.filter(r => r.status === 'absent').length;
      const lateToday    = todayRecs.filter(r => r.status === 'late').length;
      const totalToday   = presentToday + absentToday + lateToday;

      // ── Monthly avg ──
      const monthlyRecs    = records.filter(r => r.date && r.date >= cutoffStr);
      const monthlyPresent = monthlyRecs.filter(r => r.status === 'present').length;
      const monthlyAvgVal  = monthlyRecs.length === 0 ? 0 : Math.round((monthlyPresent / monthlyRecs.length) * 100);

      // ── Grade heatmap – group by gradeLevel or className ──
      const gradeGroups: Record<string, { present: number; total: number }> = {};
      records.forEach(r => {
        const g = r.gradeLevel || r.className || null;
        if (!g) return;
        if (!gradeGroups[g]) gradeGroups[g] = { present: 0, total: 0 };
        gradeGroups[g].total++;
        if (r.status === 'present') gradeGroups[g].present++;
      });

      const heatmap = Object.entries(gradeGroups)
        .map(([grade, { present, total }]) => {
          const pct = Math.round((present / total) * 100);
          return {
            grade,
            pct: `${pct}%`,
            value: pct,
            color: pct >= 90 ? "#22c55e" : pct >= 80 ? "#f59e0b" : "#ef4444"
          };
        })
        .sort((a, b) => a.grade.localeCompare(b.grade))
        .slice(0, 8);

      // ── 30-Day trend ──
      const trend: any[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr  = d.toLocaleDateString('en-CA');
        const dRecs = records.filter(r => r.date === dStr);
        if (dRecs.length > 0) {
          const p = dRecs.filter(r => r.status === 'present').length;
          trend.push({ day: d.getDate(), value: parseFloat(((p / dRecs.length) * 100).toFixed(1)) });
        }
      }

      // ── Per-student records for consecutive / monthly % ──
      const studentMap: Record<string, any[]> = {};
      records.forEach(r => {
        const sid = r.studentId || r.studentName || null;
        if (!sid) return;
        if (!studentMap[sid]) studentMap[sid] = [];
        studentMap[sid].push(r);
      });

      const absents = todayRecs
        .filter(r => r.status === 'absent')
        .map(r => {
          const sid  = r.studentId || r.studentName || null;
          const sRec = (sid ? studentMap[sid] || [] : [])
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

          // Consecutive absents counting back from today
          let consecutive = 0;
          for (const rec of sRec) {
            if (rec.status === 'absent') consecutive++;
            else break;
          }

          // Monthly % for this student
          const sMonthly  = sRec.filter(rec => rec.date && rec.date >= cutoffStr);
          const sPresent  = sMonthly.filter(rec => rec.status === 'present').length;
          const monthlyPct = sMonthly.length === 0 ? 0 : Math.round((sPresent / sMonthly.length) * 100);
          const statusLabel = monthlyPct < 60 ? 'Chronic' : monthlyPct < 75 ? 'Warning' : 'Active';

          return {
            initials:    (r.studentName || "ST").substring(0, 2).toUpperCase(),
            name:        r.studentName || "Unknown",
            grade:       r.className || r.gradeLevel || "N/A",
            contact:     r.parentPhone || "—",
            consecutive: `${consecutive} day${consecutive !== 1 ? 's' : ''}`,
            consecutiveNum: consecutive,
            monthly:     `${monthlyPct}%`,
            monthlyVal:  monthlyPct,
            status:      statusLabel
          };
        });

      setStats({ presentToday, absentToday, lateToday, monthlyAvg: `${monthlyAvgVal}%`, totalToday });
      setGradeHeatmap(heatmap);
      setTrendData(trend);
      setAbsentStudents(absents);
      setLoading(false);
    });

    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  const pct = (n: number) => stats.totalToday > 0 ? `${Math.round((n / stats.totalToday) * 100)}%` : "—";

  const generateReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    w.document.write(`<html><head><title>Monthly Attendance Report</title><style>
      body{font-family:Arial,sans-serif;padding:40px;color:#1e293b}
      h1{color:#1e3a8a}h2{color:#334155;margin-top:32px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th{background:#1e3a8a;color:#fff;padding:10px 14px;text-align:left;font-size:12px}
      td{padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px}
      .stats{display:flex;gap:40px;margin:24px 0}
      .stat-box{text-align:center}
      .stat-val{font-size:32px;font-weight:900;color:#1e3a8a}
      .stat-label{font-size:12px;color:#64748b;font-weight:600}
    </style></head><body>
      <h1>Monthly Attendance Report</h1>
      <p style="color:#64748b">Generated: ${dateStr}</p>
      <div class="stats">
        <div class="stat-box"><div class="stat-val">${stats.presentToday}</div><div class="stat-label">Present Today</div></div>
        <div class="stat-box"><div class="stat-val">${stats.absentToday}</div><div class="stat-label">Absent Today</div></div>
        <div class="stat-box"><div class="stat-val">${stats.lateToday}</div><div class="stat-label">Late Today</div></div>
        <div class="stat-box"><div class="stat-val">${stats.monthlyAvg}</div><div class="stat-label">Monthly Avg</div></div>
      </div>
      <h2>Grade-wise Summary</h2>
      <table><thead><tr><th>Grade/Class</th><th>Attendance %</th><th>Status</th></tr></thead><tbody>
        ${gradeHeatmap.map(g => `<tr><td>${g.grade}</td><td>${g.pct}</td><td>${g.value >= 90 ? 'Good' : g.value >= 80 ? 'Average' : 'Critical'}</td></tr>`).join('')}
      </tbody></table>
      <h2>Absent Students Today</h2>
      <table><thead><tr><th>Student</th><th>Class</th><th>Contact</th><th>Consecutive</th><th>Monthly %</th><th>Status</th></tr></thead><tbody>
        ${absentStudents.map(s => `<tr><td>${s.name}</td><td>${s.grade}</td><td>${s.contact}</td><td>${s.consecutive}</td><td>${s.monthly}</td><td>${s.status}</td></tr>`).join('')}
      </tbody></table>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  if (selectedClass) {
    return <ClassAttendanceDetail className={selectedClass} onBack={() => setSelectedClass(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground">Monitor student attendance patterns and trends</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#1e3a8a] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* ===== 4 STAT CARDS ===== */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
            {/* Today's Present */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Today's Present</span>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-4xl font-black text-[#1e3a8a] mb-1">{stats.presentToday}</p>
              <p className="text-xs text-muted-foreground font-medium">
                {stats.totalToday > 0 ? `${pct(stats.presentToday)} attendance` : "No records today"}
              </p>
            </div>

            {/* Absent Today */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Absent Today</span>
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-4xl font-black text-red-500 mb-1">{stats.absentToday}</p>
              <p className="text-xs text-muted-foreground font-bold">
                {stats.totalToday > 0 ? `${pct(stats.absentToday)} of total` : "Requires attention"}
              </p>
            </div>

            {/* Late Arrivals */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Late Arrivals</span>
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-4xl font-black text-amber-500 mb-1">{stats.lateToday}</p>
              <p className="text-xs text-muted-foreground font-medium">
                {stats.totalToday > 0 ? `${pct(stats.lateToday)} of total` : "No late arrivals"}
              </p>
            </div>

            {/* Monthly Avg */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">Monthly Avg</span>
                <TrendingUp className="w-5 h-5 text-[#1e3a8a]" />
              </div>
              <p className="text-4xl font-black text-foreground mb-1">{stats.monthlyAvg}</p>
              <p className="text-xs text-green-500 font-bold">Global Institution Average</p>
            </div>
          </div>

          {/* ===== HEATMAP + TREND ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Grade-wise Heatmap */}
            <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
              <h2 className="text-base font-bold text-foreground mb-6">Grade-wise Attendance Heatmap</h2>
              {gradeHeatmap.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No attendance data available</p>
              ) : (
                <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
                  {gradeHeatmap.map((g, i) => (
                    <div
                      key={i}
                      className="flex-1 min-w-[70px] text-center cursor-pointer"
                      onClick={() => setSelectedClass(g.grade)}
                    >
                      <p className="text-xs font-bold text-muted-foreground mb-2">{g.grade}</p>
                      <div
                        className="rounded-xl py-4 px-2 hover:scale-105 transition-transform shadow-sm"
                        style={{ backgroundColor: g.color }}
                      >
                        <p className="text-lg font-black text-white">{g.pct}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-6 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
                  <span className="text-[10px] font-bold text-muted-foreground">90-100%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                  <span className="text-[10px] font-bold text-muted-foreground">80-89%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                  <span className="text-[10px] font-bold text-muted-foreground">Below 80%</span>
                </div>
              </div>
            </div>

            {/* 30-Day Trend */}
            <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
              <h2 className="text-base font-bold text-foreground mb-2">30-Day Attendance Trend</h2>
              {trendData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-20">No trend data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#64748b" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      interval={4}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#475569"
                      strokeWidth={2}
                      fill="url(#trendGradient)"
                      dot={{ r: 3, fill: '#ffffff', stroke: '#475569', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#475569', stroke: '#ffffff', strokeWidth: 2 }}
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ===== ABSENT STUDENTS TABLE ===== */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Absent Students Today</h2>
              <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
                <Send className="w-4 h-4" /> Alert Parents
              </button>
            </div>

            {absentStudents.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-muted-foreground">No absent students today</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Student</th>
                      <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Grade-Section</th>
                      <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Parent Contact</th>
                      <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Consecutive Absent</th>
                      <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Monthly %</th>
                      <th className="text-left px-7 py-4 text-[#1e3a8a] font-bold text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {absentStudents.map((s, i) => (
                      <tr key={i} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-7 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {s.initials}
                            </div>
                            <span className="font-bold text-foreground text-sm">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-7 py-5 font-bold text-foreground text-sm">{s.grade}</td>
                        <td className="px-7 py-5 text-muted-foreground text-sm font-medium">{s.contact}</td>
                        <td className="px-7 py-5">
                          <span className={`font-bold text-sm ${s.consecutiveNum >= 3 ? 'text-red-500' : s.consecutiveNum >= 2 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                            {s.consecutive}
                          </span>
                        </td>
                        <td className="px-7 py-5">
                          <span className={`font-bold text-sm ${s.monthlyVal < 60 ? 'text-red-500' : s.monthlyVal < 80 ? 'text-amber-500' : 'text-green-500'}`}>
                            {s.monthly}
                          </span>
                        </td>
                        <td className="px-7 py-5">
                          <span className={`text-sm font-bold ${s.status === 'Chronic' ? 'text-red-500' : s.status === 'Warning' ? 'text-amber-500' : 'text-foreground'}`}>
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

          {/* ===== ACTION BUTTONS ===== */}
          <div className="flex flex-wrap items-center gap-3">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md">
              <Edit3 className="w-4 h-4" /> Mark Attendance
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors">
              <Bell className="w-4 h-4 text-muted-foreground" /> Send Absence Alerts
            </button>
            <button
              onClick={generateReport}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors"
            >
              <FileText className="w-4 h-4 text-muted-foreground" /> Generate Monthly Report
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Attendance;
