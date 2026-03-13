import React, { useState } from 'react';
import { FileText, Download, Calendar, Mail, FileSpreadsheet, FileJson, ChevronLeft, Send, Clock, Info, Settings, Trash2 } from 'lucide-react';

interface GenerateReportProps {
  templateName: string;
  onBack: () => void;
}

const GenerateReport = ({ templateName, onBack }: GenerateReportProps) => {
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Reports</span>
        <span>/</span>
        <span className="text-foreground font-semibold">Generate Report</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Configuration */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-6">Report Configuration</h2>
            
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1 font-inter">Report Type</label>
                <input 
                  type="text" 
                  defaultValue={templateName}
                  placeholder="Select Report Type"
                  className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Date Range</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="text" 
                    placeholder="From Date"
                    className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-muted-foreground outline-none"
                  />
                  <span className="text-sm font-semibold text-muted-foreground italic">to</span>
                  <input 
                    type="text" 
                    placeholder="To Date"
                    className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-muted-foreground outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Grade</label>
                <input 
                  type="text" 
                  placeholder="Select Grade"
                  className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-foreground outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Section</label>
                <input 
                  type="text" 
                  placeholder="Select Section"
                  className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-foreground outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Subject (Optional)</label>
                <input 
                  type="text" 
                  placeholder="Select Subject"
                  className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium text-foreground outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-6">Output Format</h2>
            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => setOutputFormat('pdf')}
                className={`flex items-center justify-center gap-3 py-4 rounded-xl border transition-all ${
                  outputFormat === 'pdf' ? 'bg-secondary/50 border-[#1e3a8a] ring-2 ring-[#1e3a8a]/10' : 'bg-background border-border text-muted-foreground'
                }`}
              >
                <FileText className={`w-5 h-5 ${outputFormat === 'pdf' ? 'text-red-500' : 'text-red-500'}`} />
                <span className="text-sm font-bold uppercase">PDF</span>
              </button>
              <button 
                onClick={() => setOutputFormat('excel')}
                className={`flex items-center justify-center gap-3 py-4 rounded-xl border transition-all ${
                  outputFormat === 'excel' ? 'bg-secondary/50 border-[#1e3a8a] ring-2 ring-[#1e3a8a]/10' : 'bg-background border-border text-muted-foreground'
                }`}
              >
                <FileSpreadsheet className={`w-5 h-5 ${outputFormat === 'excel' ? 'text-green-600' : 'text-green-600'}`} />
                <span className="text-sm font-bold uppercase">Excel</span>
              </button>
              <button 
                onClick={() => setOutputFormat('csv')}
                className={`flex items-center justify-center gap-3 py-4 rounded-xl border transition-all ${
                  outputFormat === 'csv' ? 'bg-secondary/50 border-[#1e3a8a] ring-2 ring-[#1e3a8a]/10' : 'bg-background border-border text-muted-foreground'
                }`}
              >
                <FileJson className={`w-5 h-5 ${outputFormat === 'csv' ? 'text-blue-700' : 'text-blue-700'}`} />
                <span className="text-sm font-bold uppercase">CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Preview & Schedule */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-6">Report Preview</h2>
            
            <div className="bg-secondary/20 rounded-2x border border-border p-8 rounded-2xl">
               <div className="text-center mb-10">
                  <h3 className="text-xl font-bold text-foreground">Student Progress Report</h3>
                  <p className="text-sm font-medium text-muted-foreground mt-1">January 2026</p>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center justify-between py-2.5 border-b border-border">
                     <span className="text-sm font-medium text-muted-foreground">Total Students</span>
                     <span className="text-sm font-bold text-foreground">847</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5 border-b border-border">
                     <span className="text-sm font-medium text-muted-foreground">Average Attendance</span>
                     <span className="text-sm font-bold text-foreground">89.4%</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5 border-b border-border">
                     <span className="text-sm font-medium text-muted-foreground">Average Marks</span>
                     <span className="text-sm font-bold text-foreground">68.2%</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5 border-b border-border">
                     <span className="text-sm font-medium text-muted-foreground">At-Risk Students</span>
                     <span className="text-sm font-bold text-red-500">12</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                     <span className="text-sm font-medium text-muted-foreground">Discipline Incidents</span>
                     <span className="text-sm font-bold text-foreground">8</span>
                  </div>
               </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-1">Schedule Delivery (Optional)</h2>
            <p className="text-[11px] font-medium text-muted-foreground italic mb-6">Schedule recurring report</p>
            
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Frequency</label>
                <input 
                   type="text"
                   placeholder="Select Frequency"
                   className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Email To</label>
                <input 
                   type="text" 
                   placeholder="Enter email addresses"
                   className="w-full bg-background border border-border rounded-xl p-3.5 text-sm font-medium outline-none"
                />
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                <input type="checkbox" className="w-4 h-4 rounded border-border text-[#1e3a8a]" />
                <span className="text-sm font-medium text-muted-foreground">Save as template for future use</span>
             </div>
             
             <div className="flex items-center gap-3">
                <button className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#1e4fc0]">
                   <Settings className="w-4 h-4" /> Generate Report
                </button>
                <button onClick={onBack} className="px-6 py-3.5 bg-background border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors">
                   Cancel
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerateReport;
