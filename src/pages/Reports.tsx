import { useState, useEffect } from "react";
import { 
  FileText, Download, GraduationCap, Calendar, Shield, IndianRupee, 
  Settings, UserCheck, Layout, CalendarCheck, AlertTriangle, Trophy, 
  Users2, MessageSquare, LineChart, Trash2, ArrowRight, Plus, Loader2, Clock
} from "lucide-react";
import GenerateReport from "@/components/GenerateReport";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";

const reportCategories = [
  { id: 'academic', label: "Academic", count: "12 templates", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50" },
  { id: 'attendance', label: "Attendance", count: "8 templates", icon: CalendarCheck, color: "text-green-600", bg: "bg-green-50" },
  { id: 'discipline', label: "Discipline", count: "5 templates", icon: Shield, color: "text-red-600", bg: "bg-red-50" },
  { id: 'financial', label: "Financial", count: "6 templates", icon: IndianRupee, color: "text-orange-600", bg: "bg-orange-50" },
  { id: 'custom', label: "Custom", count: "Build your own", icon: Settings, color: "text-indigo-600", bg: "bg-indigo-50" },
];

const templates = [
  { title: "Student Progress", desc: "Individual student performance", icon: UserCheck, color: "text-blue-600", bg: "bg-blue-50" },
  { title: "Class Performance", desc: "Section-wise analysis", icon: Layout, color: "text-blue-900", bg: "bg-blue-50" },
  { title: "Monthly Attendance", desc: "Attendance summary report", icon: CalendarCheck, color: "text-green-600", bg: "bg-green-50" },
  { title: "Risk Students", desc: "At-risk student list", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50" },
  { title: "Exam Results", desc: "Comprehensive exam report", icon: Trophy, color: "text-yellow-600", bg: "bg-yellow-50" },
  { title: "Teacher Performance", desc: "Staff evaluation report", icon: Users2, color: "text-blue-800", bg: "bg-blue-50" },
  { title: "Parent Communication", desc: "Communication log", icon: MessageSquare, color: "text-green-500", bg: "bg-green-50" },
  { title: "School Overview", desc: "Complete school analytics", icon: LineChart, color: "text-orange-500", bg: "bg-orange-50" },
];

const Reports = () => {
  const { userData } = useAuth();
  const [activeCategory, setActiveCategory] = useState('academic');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userData?.schoolId) return;

    const q = query(
      collection(db, "principal_reports"),
      where("schoolId", "==", userData.schoolId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort client-side if needed, but here we can just trust the stream
      const sorted = reports.sort((a: any, b: any) => 
        (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
      );

      setRecentReports(sorted.slice(0, 10));
      setIsLoading(false);
    }, (error) => {
      console.error("Principal Reports Sync Error:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [userData?.schoolId]);

  if (selectedTemplate) {
    return (
      <GenerateReport 
        templateName={selectedTemplate} 
        onBack={() => setSelectedTemplate(null)} 
      />
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e293b]">Reports</h1>
          <p className="text-sm text-slate-400 font-medium tracking-tight">Generate and manage school reports</p>
        </div>
        <button 
          onClick={() => setSelectedTemplate("Custom")}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-[#1e4fc0] transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Create Custom Report
        </button>
      </div>

      {/* Category Selection Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {reportCategories.map((cat) => (
          <button 
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`p-6 rounded-[2rem] border transition-all text-left group ${
              activeCategory === cat.id 
              ? 'bg-[#1e3a8a] border-blue-900 shadow-xl shadow-blue-900/10' 
              : 'bg-white border-slate-100 hover:border-blue-200 shadow-sm'
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${
              activeCategory === cat.id ? 'bg-white/10 text-white' : `${cat.bg} ${cat.color}`
            }`}>
              <cat.icon className="w-6 h-6" />
            </div>
            <p className={`font-black text-base ${activeCategory === cat.id ? 'text-white' : 'text-[#1e293b]'}`}>
              {cat.label}
            </p>
            <p className={`text-[11px] font-bold ${activeCategory === cat.id ? 'text-blue-200' : 'text-slate-400'}`}>
              {cat.count}
            </p>
          </button>
        ))}
      </div>

      {/* Pre-built Templates Grid */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
        <h2 className="text-xl font-black text-[#1e293b] mb-8">Pre-built Report Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {templates.map((tpl, i) => (
            <div 
              key={i} 
              onClick={() => setSelectedTemplate(tpl.title)}
              className="p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:bg-white hover:border-blue-100 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-xl ${tpl.bg} ${tpl.color}`}>
                  <tpl.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#1e293b] group-hover:text-[#1e3a8a] transition-colors">{tpl.title}</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{tpl.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recently Generated Reports Table */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden min-h-[400px]">
        <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between">
          <h2 className="text-xl font-black text-[#1e293b]">Recently Generated Reports</h2>
          <button className="text-xs font-black text-[#1e3a8a] flex items-center gap-1 hover:underline tracking-widest uppercase">
            View All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Report Name</th>
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Generated On</th>
                <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Format</th>
                <th className="px-10 py-5 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Loader2 className="w-8 h-8 text-[#1e3a8a] animate-spin mx-auto mb-2" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accessing records...</p>
                  </td>
                </tr>
              ) : recentReports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-inner">
                       <Clock className="w-5 h-5 text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 italic px-10 leading-relaxed">No reports have been transmitted by the faculty recently.</p>
                  </td>
                </tr>
              ) : (
                recentReports.map((report, i) => (
                  <tr key={report.id || i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-10 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#1e293b]">{report.title}</span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{report.teacherName || 'System Generated'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-sm font-bold text-slate-500 uppercase tracking-tight">{report.reportType?.replace('_', ' ') || 'GENERAL'}</td>
                    <td className="px-6 py-6 text-sm font-medium text-slate-400 italic">
                      {report.createdAt?.toDate?.().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) || "Recently"}
                    </td>
                    <td className="px-6 py-6 font-black text-[#1e293b]">
                      <span className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[9px]">PDF</span>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex items-center justify-center gap-6">
                        <button className="text-[11px] font-black text-[#1e3a8a] uppercase tracking-widest hover:underline transition-colors flex items-center gap-2">
                          <Download className="w-4 h-4" /> Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
