import React, { useState } from 'react';
import { FileText, Download, Calendar, Mail, FileSpreadsheet, FileJson, ChevronLeft, Send, Clock, Info } from 'lucide-react';

interface GenerateReportProps {
  templateName: string;
  onBack: () => void;
}

const GenerateReport = ({ templateName, onBack }: GenerateReportProps) => {
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');

  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Reports</span>
        <span>/</span>
        <span className="text-foreground font-medium">Generate Report</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-black text-[#1e293b]">Generate: {templateName}</h1>
        <p className="text-sm text-slate-400 font-medium">Configure and preview your school report</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-8">Report Configuration</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Report Type</label>
                <div className="relative">
                  <input 
                    type="text" 
                    defaultValue={templateName}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-[#1e293b] focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Date Range</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-400 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1 invisible">To</label>
                  <div className="flex items-center gap-4 h-[54px]">
                    <span className="text-xs font-bold text-slate-300">to</span>
                    <input 
                      type="date" 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-400 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Grade</label>
                  <select className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-[#1e293b] outline-none appearance-none cursor-pointer">
                    <option>All Grades</option>
                    <option>Grade 6</option>
                    <option>Grade 9</option>
                    <option>Grade 10</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Section</label>
                  <select className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-[#1e293b] outline-none appearance-none cursor-pointer">
                    <option>All Sections</option>
                    <option>Section A</option>
                    <option>Section B</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Subject (Optional)</label>
                <select className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-[#1e293b] outline-none appearance-none cursor-pointer">
                   <option>Select Subject</option>
                   <option>Mathematics</option>
                   <option>Science</option>
                   <option>English</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-8">Output Format</h2>
            <div className="grid grid-cols-3 gap-6">
              <button 
                onClick={() => setOutputFormat('pdf')}
                className={`flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${
                  outputFormat === 'pdf' ? 'bg-blue-50 border-blue-200 text-[#1e3a8a]' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-100'
                }`}
              >
                <FileText className={`w-5 h-5 ${outputFormat === 'pdf' ? 'text-red-500' : ''}`} />
                <span className="text-sm font-black uppercase tracking-wider">PDF</span>
              </button>
              <button 
                onClick={() => setOutputFormat('excel')}
                className={`flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${
                  outputFormat === 'excel' ? 'bg-blue-50 border-blue-200 text-[#1e3a8a]' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-100'
                }`}
              >
                <FileSpreadsheet className={`w-5 h-5 ${outputFormat === 'excel' ? 'text-green-500' : ''}`} />
                <span className="text-sm font-black uppercase tracking-wider">Excel</span>
              </button>
              <button 
                onClick={() => setOutputFormat('csv')}
                className={`flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${
                  outputFormat === 'csv' ? 'bg-blue-50 border-blue-200 text-[#1e3a8a]' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-100'
                }`}
              >
                <FileJson className={`w-5 h-5 ${outputFormat === 'csv' ? 'text-blue-500' : ''}`} />
                <span className="text-sm font-black uppercase tracking-wider">CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Preview & Schedule */}
        <div className="lg:col-span-5 space-y-8">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-1">Report Preview</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
              <Info className="w-3 h-3" /> Live preview of report contents
            </p>

            <div className="bg-slate-50 rounded-[2rem] p-8 border border-slate-100">
               <div className="text-center mb-10">
                  <h3 className="text-xl font-black text-[#1e293b]">{templateName} Report</h3>
                  <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-tight">January 2026</p>
               </div>

               <div className="space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200/50">
                     <span className="text-sm font-bold text-slate-500">Total Students</span>
                     <span className="text-lg font-black text-[#1e293b]">847</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200/50">
                     <span className="text-sm font-bold text-slate-500">Average Attendance</span>
                     <span className="text-lg font-black text-[#1e293b]">89.4%</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200/50">
                     <span className="text-sm font-bold text-slate-500">Average Marks</span>
                     <span className="text-lg font-black text-[#1e293b]">68.2%</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200/50">
                     <span className="text-sm font-bold text-slate-500">At-Risk Students</span>
                     <span className="text-lg font-black text-red-500">12</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-sm font-bold text-slate-500">Discipline Incidents</span>
                     <span className="text-lg font-black text-[#1e293b]">8</span>
                  </div>
               </div>
            </div>

            <button className="w-full mt-10 py-5 bg-[#1e3a8a] text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-100 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all">
               <Download className="w-5 h-5" /> GENEREATE REPORT
            </button>
          </div>

          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-1">Schedule Delivery (Optional)</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Schedule recurring report</p>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase pl-1">Frequency</label>
                <select className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-400 outline-none appearance-none cursor-pointer">
                  <option>Never (Once only)</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase pl-1">Email To</label>
                <div className="relative">
                  <input 
                    type="email" 
                    placeholder="Enter email address"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold outline-none placeholder:text-slate-300"
                  />
                  <Mail className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerateReport;
