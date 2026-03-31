import { useState, useEffect } from "react";
import { Users, GraduationCap, CalendarCheck, AlertCircle, Heart, ArrowUp, ArrowDown, Star, MessageSquare } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import StatCard from "@/components/dashboard/StatCard";
import AcademicAnalytics from "@/components/AcademicAnalytics";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, limit, orderBy, getDocs } from "firebase/firestore";

const Dashboard = () => {
  const { userData } = useAuth();
  const [studentsCount, setStudentsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [incidentsCount, setIncidentsCount] = useState(0);
  const [todayAttendanceRate, setTodayAttendanceRate] = useState("0%");
  const [academicHealth, setAcademicHealth] = useState(0);
  const [riskAlerts, setRiskAlerts] = useState<any[]>([]);
  const [urgentComms, setUrgentComms] = useState<any[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<any[]>([]);
  const [topTeachers, setTopTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID || userData?.school_id;
    const branch = userData?.branch || userData?.branchName || "";

    if (!schoolId) return;


    const constraints = [where("schoolId", "==", schoolId)];
    if (branch) constraints.push(where("branch", "==", branch));

    // 1. Basic Stats with Real-time Counters
    const uStudents = onSnapshot(query(collection(db, "students"), ...constraints), async (snap) => {
        if (snap.empty) {
            const fallback = await getDocs(query(collection(db, "students"), where("school", "==", schoolId)));
            setStudentsCount(fallback.size);
        } else {
            setStudentsCount(snap.size);
        }
    });
    const uTeachers = onSnapshot(query(collection(db, "teachers"), ...constraints), (snap) => {
        setTeachersCount(snap.size);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 3)
            .map((t: any) => ({
                name: t.name,
                sub: t.subject || "Faculty",
                pts: t.rating || 5.0,
                color: t.color || "bg-indigo-600",
                ini: t.name?.substring(0, 2).toUpperCase() || "T"
            }));
        setTopTeachers(list);
    });
    const uIncidents = onSnapshot(query(collection(db, "incidents"), ...constraints, where("status", "==", "Pending")), (snap) => setIncidentsCount(snap.size));

    // 2. Today's Attendance Aggregation
    const today = new Date().toLocaleDateString('en-CA');
    const uTodayAtnd = onSnapshot(query(collection(db, "attendance"), ...constraints, where("date", "==", today)), (snap) => {
        if (snap.empty) {
            setTodayAttendanceRate("0%");
            return;
        }
        const total = snap.size;
        const present = snap.docs.filter(d => d.data().status === 'present').length;
        setTodayAttendanceRate(`${((present / total) * 100).toFixed(1)}%`);
    });

    // 3. Academic Health Index (Avg Scores for all valid results)
    const uResults = onSnapshot(query(collection(db, "results"), ...constraints, limit(1000)), (snap) => {
        if (snap.empty) {
            setAcademicHealth(85.0); 
            return;
        }
        const totalScore = snap.docs.reduce((acc, doc) => acc + (parseFloat(doc.data().score) || 0), 0);
        setAcademicHealth(parseFloat((totalScore / snap.size).toFixed(1)));
    });

    // 4. Strategic Risk Alerts
    const uRisks = onSnapshot(query(collection(db, "risks"), ...constraints, limit(5)), (snap) => {
      setRiskAlerts(snap.docs.map(doc => {
        const d = doc.data();
        return {
          name: d.studentName || d.className || "Alert",
          detail: d.description || d.riskType || "Threshold Violation Detected",
          level: d.severity || "HIGH",
          color: d.severity === "CRITICAL" ? "#ef4444" : "#f59e0b"
        };
      }));
    });

    // 5. Attendance Trend Analysis (Last 30 Days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const uTrend = onSnapshot(query(collection(db, "attendance"), ...constraints, where("timestamp", ">=", thirtyDaysAgo)), (snap) => {
        const dailyData: Record<string, { total: number, present: number }> = {};
        snap.docs.forEach(doc => {
            const d = doc.data();
            const date = d.date;
            if (!date) return;
            if (!dailyData[date]) dailyData[date] = { total: 0, present: 0 };
            dailyData[date].total++;
            if (d.status === 'present') dailyData[date].present++;
        });
        
        const trend = Object.entries(dailyData)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, stats]) => ({
                day: date.split('-')[2], // Day of month
                value: parseFloat(((stats.present / stats.total) * 100).toFixed(1))
            }));
        if (trend.length > 0) setAttendanceTrend(trend);
    });

    // 6. Urgent Communications
    const uComms = onSnapshot(query(collection(db, "communications"), ...constraints, where("priority", "in", ["CRITICAL", "HIGH"]), limit(3)), (snap) => {
      setUrgentComms(snap.docs.map(doc => {
        const d = doc.data();
        return {
          title: d.subject || "Message from Parent",
          from: d.senderName || d.parentName || "Unknown",
          time: d.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || "Recently",
          color: d.priority === "CRITICAL" ? "#ef4444" : "#f59e0b"
        };
      }));
    });

    setLoading(false);
    return () => { 
      uStudents(); uTeachers(); uIncidents(); uRisks(); uComms(); uTodayAtnd(); uResults(); uTrend();
    };
  }, [userData?.schoolId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Executive Command Center</h1>
        <p className="text-sm text-slate-500 font-bold">Welcome back, Principal. Monitoring your institution's vital signs.</p>
      </div>

      {/* Academic Health Index */}
      <div className="bg-[#1e3a8a] text-white p-8 rounded-[2rem] flex items-center justify-between shadow-2xl shadow-indigo-100 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-white/5 rounded-full blur-3xl"></div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
            <Heart className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white/60 mb-1">Academic Health Index</p>
            <div className="flex items-baseline gap-2">
               <p className="text-5xl font-black">{academicHealth}</p>
               <span className="text-xl font-bold text-white/40">/100</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-8 relative z-10">
          <div className="text-right">
            <div className="flex items-center gap-1 text-green-400">
              {academicHealth >= 80 ? <ArrowUp className="w-5 h-5 font-black" /> : <ArrowDown className="w-5 h-5 font-black text-red-400" />}
              <span className="text-xl font-black">{academicHealth >= 80 ? "Good" : "Low"}</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Score Benchmark</p>
          </div>
          <div className="h-12 w-px bg-white/10"></div>
          <div className="text-right">
            <span className="text-xl font-black text-white px-4 py-1.5 rounded-xl bg-white/10 backdrop-blur-md uppercase tracking-widest">
              {academicHealth >= 85 ? "Excellent" : academicHealth >= 75 ? "Stable" : academicHealth >= 60 ? "Moderate" : "At Risk"}
            </span>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mt-1">Overall Status</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Total Students" value={studentsCount} subtitle="Active Enrollment" icon={Users} iconColor="text-indigo-600" />
        <StatCard title="Teachers" value={teachersCount} subtitle="Academic Staff" icon={GraduationCap} iconColor="text-slate-900" />
        <StatCard title="School Attendance" value={todayAttendanceRate} subtitle="Live Institutional Registry" icon={CalendarCheck} iconColor="text-emerald-600" />
        <StatCard title="Pending Incidents" value={incidentsCount} subtitle={incidentsCount > 0 ? "Requires Attention" : "Safe Environment"} icon={AlertCircle} iconColor={incidentsCount > 0 ? "text-red-500" : "text-slate-500"} />
      </div>

      <AcademicAnalytics />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Today's Risk Alerts */}
        <div className="lg:col-span-3 bg-card rounded-[2rem] border border-border p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-600" />
               </div>
               <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Strategic Risk Alerts</h2>
            </div>
            <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest px-4 py-2 rounded-lg bg-indigo-50 border border-indigo-100">Full Audit →</button>
          </div>
          <div className="space-y-4">
            {riskAlerts.length > 0 ? (
              riskAlerts.map((alert, i) => (
                <div key={i} className="flex items-center justify-between p-5 rounded-[1.5rem] bg-slate-50 border border-slate-100 hover:shadow-md transition-all group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-2.5 h-10 rounded-full" style={{ backgroundColor: alert.color }} />
                    <div>
                      <p className="text-base font-black text-slate-800">{alert.name}</p>
                      <p className="text-xs text-slate-500 font-bold">{alert.detail}</p>
                    </div>
                  </div>
                  <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl`} style={{ backgroundColor: alert.color }}>
                    {alert.level}
                  </span>
                </div>
              ))
            ) : (
                <div className="py-20 text-center flex flex-col items-center justify-center opacity-40 italic">
                  <AlertCircle className="w-12 h-12 mb-3 text-slate-300" />
                  <p className="text-sm font-black uppercase tracking-widest">No strategic risks detected</p>
                </div>
            )}
          </div>
        </div>

        {/* Attendance Trend */}
        <div className="lg:col-span-2 bg-card rounded-[2rem] border border-border p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
             <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight text-center">Faculty Attendance Trend</h2>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={attendanceTrend}>
              <defs>
                <linearGradient id="attendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis domain={[80, 100]} tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Attendance"]} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: '900' }} />
              <Area type="monotone" dataKey="value" stroke="#1e3a8a" strokeWidth={5} fill="url(#attendGrad)" dot={{ r: 4, strokeWidth: 3, fill: '#fff', stroke: '#1e3a8a' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Teacher Performance + Urgent Comms */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Urgent Communications */}
          <div className="lg:col-span-3 bg-card rounded-[2rem] border border-border p-8 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Urgent Directives</h2>
              <span className={`px-4 py-1.5 rounded-xl ${urgentComms.length > 0 ? "bg-red-500 animate-pulse" : "bg-slate-200"} text-white text-[10px] font-black uppercase tracking-widest border shadow-xl`}>
                {urgentComms.length} NEW
              </span>
            </div>
            <div className="space-y-4 flex-1">
              {urgentComms.length > 0 ? (
                urgentComms.map((msg, i) => (
                  <div key={i} className="flex items-start gap-4 p-5 bg-white border border-slate-100 rounded-[1.5rem] hover:shadow-lg transition-all cursor-pointer">
                    <div className="w-1.5 h-12 rounded-full shrink-0" style={{ backgroundColor: msg.color }} />
                    <div className="flex-1">
                      <p className="text-base font-black text-slate-800">{msg.title}</p>
                      <p className="text-xs text-slate-500 font-bold">From: {msg.from}  •  {msg.time}</p>
                    </div>
                    <button className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:text-indigo-600 transition-colors">
                       <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-xs font-black text-slate-300 uppercase tracking-widest italic flex flex-col items-center">
                  <MessageSquare className="w-10 h-10 mb-2" />
                  No urgent messages
                </div>
              )}
            </div>
          </div>

          {/* Teacher Performance Board */}
          <div className="lg:col-span-2 bg-card rounded-[2rem] border border-border p-8 shadow-sm overflow-hidden relative">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
            <div className="flex items-center justify-between mb-8 relative z-10">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Faculty Star Power</h2>
            </div>
            <div className="space-y-6 relative z-10">
               {topTeachers.length > 0 ? topTeachers.map((t, i) => (
                  <div key={i} className="flex items-center gap-4 group cursor-pointer hover:translate-x-1 transition-transform">
                    <div className={`w-14 h-14 rounded-2xl ${t.color} flex items-center justify-center text-white text-base font-black shadow-lg ring-4 ring-white`}>
                      {t.ini}
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-black text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{t.sub}</p>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 bg-indigo-50 rounded-xl border border-indigo-100">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-black text-indigo-900">{t.pts}</span>
                    </div>
                  </div>
               )) : (
                 <p className="text-xs font-black text-slate-400 uppercase tracking-widest py-10 text-center italic">No performance logs</p>
               )}
               <button className="w-full py-4 mt-2 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:shadow-xl transition-all">Review Faculty Metrics</button>
            </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
