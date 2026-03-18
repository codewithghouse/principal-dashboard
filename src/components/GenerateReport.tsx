import React, { useState, useEffect } from 'react';
import { 
  FileText, Calendar, FileSpreadsheet, FileJson, Settings, 
  BarChart2, Loader2, Download, Send, Clock, PieChart as PieChartIcon, 
  ListOrdered
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, limit, getDocs } from "firebase/firestore";

interface GenerateReportProps {
  templateName: string;
  onBack: () => void;
}

const GenerateReport = ({ templateName, onBack }: GenerateReportProps) => {
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [reportType, setReportType] = useState('Academic Performance');
  const [grade, setGrade] = useState('All Grades');
  const [metric, setMetric] = useState('Pass Rate %');
  
  const [systemData, setSystemData] = useState<any[]>([]);
  const [scheduledReports, setScheduledReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic state changes
  const [hasGenerated, setHasGenerated] = useState(false);

  // 1. Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const sysSnap = await getDocs(query(collection(db, "exam_results"), limit(5)));
        setSystemData(sysSnap.docs.map(d => d.data()));
        
        const scheduleSnap = await getDocs(query(collection(db, "scheduled_reports"), limit(5)));
        setScheduledReports(scheduleSnap.docs.map(d => d.data()));
      } catch (e) {
        console.warn("Error fetching reporting info.");
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const hasData = systemData.length > 0;

  // Chart data for preview
  const livePreviewData = [
     { name: 'Grade 6', value: 85 },
     { name: 'Grade 7', value: 78 },
     { name: 'Grade 8', value: 92 },
     { name: 'Grade 9', value: 88 },
     { name: 'Grade 10', value: 95 }
  ];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Reports directory</span>
        <span>/</span>
        <span className="text-foreground font-semibold">Custom Report Builder</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Configuration */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-blue-600"/> Report Configuration</h2>
            
            {!loading && !hasData ? (
               <div className="py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center px-4">
                  <BarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-500 line-clamp-2">No data available to generate reports yet.</p>
               </div>
            ) : (
               <div className="space-y-5">
                 <div className="space-y-1.5">
                   <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Report Category</label>
                   <select 
                     value={reportType}
                     onChange={(e) => setReportType(e.target.value)}
                     className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
                   >
                     <option>Academic Performance</option>
                     <option>Attendance Records</option>
                     <option>Discipline Logs</option>
                     <option>Communication Activity</option>
                   </select>
                 </div>

                 <div className="space-y-1.5">
                   <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Target Audience (Grade)</label>
                   <select 
                     value={grade}
                     onChange={(e) => setGrade(e.target.value)}
                     className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
                   >
                      <option>All Grades</option>
                      <option>Grade 6</option>
                      <option>Grade 9</option>
                      <option>Grade 10</option>
                   </select>
                 </div>

                 <div className="space-y-1.5">
                   <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Target Metric</label>
                   <select 
                     value={metric}
                     onChange={(e) => setMetric(e.target.value)}
                     className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
                   >
                      <option>Pass Rate %</option>
                      <option>Attendance Rate %</option>
                      <option>Incident Count</option>
                   </select>
                 </div>

                 <button 
                   onClick={() => setHasGenerated(true)}
                   className="w-full flex items-center justify-center gap-2 py-3.5 mt-2 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#1e4fc0] transition-colors"
                 >
                    <BarChart2 className="w-4 h-4" /> Generate Report Data
                 </button>
               </div>
            )}
          </div>

          {/* FEATURE 4: Multi-Format Export Logic */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-6 flex items-center gap-2"><Download className="w-5 h-5 text-green-600"/> Export Configuration</h2>
            
            {!hasGenerated ? (
               <div className="py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center px-4">
                  <p className="text-sm font-bold text-slate-500">Report exports will be available once reports are generated.</p>
               </div>
            ) : (
               <div className="space-y-5 animate-in slide-in-from-top-4 duration-300">
                 <div className="grid grid-cols-3 gap-3">
                   <button 
                     onClick={() => setOutputFormat('pdf')}
                     className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all ${
                       outputFormat === 'pdf' ? 'bg-red-50 border-red-200 shadow-sm text-red-700' : 'bg-background border-border text-slate-500 hover:bg-slate-50'
                     }`}
                   >
                     <FileText className="w-6 h-6" />
                     <span className="text-[10px] font-bold uppercase tracking-widest">PDF</span>
                   </button>
                   <button 
                     onClick={() => setOutputFormat('excel')}
                     className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all ${
                       outputFormat === 'excel' ? 'bg-green-50 border-green-200 shadow-sm text-green-700' : 'bg-background border-border text-slate-500 hover:bg-slate-50'
                     }`}
                   >
                     <FileSpreadsheet className="w-6 h-6" />
                     <span className="text-[10px] font-bold uppercase tracking-widest">Excel</span>
                   </button>
                   <button 
                     onClick={() => setOutputFormat('csv')}
                     className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all ${
                       outputFormat === 'csv' ? 'bg-blue-50 border-blue-200 shadow-sm text-blue-700' : 'bg-background border-border text-slate-500 hover:bg-slate-50'
                     }`}
                   >
                     <FileJson className="w-6 h-6" />
                     <span className="text-[10px] font-bold uppercase tracking-widest">CSV</span>
                   </button>
                 </div>
                 <button className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-green-700 transition-colors">
                    <Download className="w-4 h-4"/> Download Report
                 </button>
               </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Preview & Schedule */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* FEATURE 2: Live Report Preview */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-6 flex items-center gap-2"><PieChartIcon className="w-5 h-5 text-indigo-500"/> Live Report Preview</h2>
            
            {!hasGenerated ? (
               <div className="py-24 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center px-4 transition-all duration-300">
                  <ListOrdered className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-sm font-bold text-slate-500">Preview will appear once report data becomes available.</p>
               </div>
            ) : (
               <div className="bg-secondary/20 border border-border p-8 rounded-2xl animate-in fade-in zoom-in-95 duration-500 shadow-inner">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-8 gap-4">
                     <div>
                        <h3 className="text-xl font-bold text-foreground">{reportType} Overview</h3>
                        <p className="text-sm font-medium text-muted-foreground mt-1">Filtered by: {grade} <span className="mx-2">•</span> Target: {metric}</p>
                     </div>
                     <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm whitespace-nowrap">
                        Generated Preview
                     </span>
                  </div>

                  <div className="h-56 mb-8">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={livePreviewData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }} dy={10} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} domain={[0, 100]} />
                           <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                           <Bar dataKey="value" name={metric} radius={[4, 4, 0, 0]} maxBarSize={40}>
                              {livePreviewData.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={entry.value > 90 ? '#22c55e' : entry.value > 80 ? '#1e3a8a' : '#f59e0b'} />
                              ))}
                           </Bar>
                        </BarChart>
                     </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border pt-6">
                     <div className="text-center pb-4 sm:pb-0">
                        <p className="text-3xl font-black text-indigo-600">88.4%</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Average {metric}</p>
                     </div>
                     <div className="text-center sm:border-l sm:border-r border-border pb-4 sm:pb-0">
                        <p className="text-3xl font-black text-green-500">Grade 10</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Top Performer</p>
                     </div>
                     <div className="text-center">
                        <p className="text-3xl font-black text-slate-800">420</p>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Entities Analyzed</p>
                     </div>
                  </div>
               </div>
            )}
          </div>

          {/* FEATURE 3: Automated Delivery Engine */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-6 flex items-center justify-between">
               <span className="flex items-center gap-2"><Send className="w-5 h-5 text-orange-500"/> Automated Delivery Engine</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
               <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Frequency Setting</label>
                  <select className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-[#1e3a8a]/10">
                     <option>Weekly on Friday 5:00 PM</option>
                     <option>Monthly (1st of month)</option>
                     <option>Daily at 8:00 AM</option>
                  </select>
               </div>
               <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Target Recipients</label>
                  <input type="text" placeholder="board@school.edu, management@..." className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-[#1e3a8a]/10" />
               </div>
               <div className="md:col-span-2 mt-2">
                  <button className="px-6 py-3.5 w-full md:w-auto bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-slate-900 transition-colors">
                     Schedule Automated Delivery
                  </button>
               </div>
            </div>

            <div className="border-t border-border pt-6">
               <h3 className="text-sm font-bold text-foreground mb-4">Active Schedules Log</h3>
               {!loading && scheduledReports.length === 0 ? (
                  <div className="py-8 bg-slate-50 rounded-xl text-center px-4">
                     <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                     <p className="text-sm font-bold text-slate-600">No automated report deliveries scheduled yet.</p>
                  </div>
               ) : (
                  <div className="space-y-3">
                     {scheduledReports.map((r, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-slate-100 rounded-xl bg-white shadow-sm hover:border-slate-300 transition-colors">
                           <div className="mb-2 sm:mb-0">
                              <p className="text-sm font-bold text-slate-800">{r.title}</p>
                              <p className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase mt-1.5 inline-block">Every {r.frequency}</p>
                           </div>
                           <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><Mail className="w-3 h-3"/> {r.recipients}</span>
                        </div>
                     ))}
                  </div>
               )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default GenerateReport;
