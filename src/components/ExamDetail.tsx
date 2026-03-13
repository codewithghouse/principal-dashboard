import React from 'react';
import { ChevronLeft, ArrowRight, Download, Printer, Share2, BarChart2 } from 'lucide-react';

interface ExamDetailProps {
  exam: {
    name: string;
    date: string;
    totalStudents: number;
    passRate: string;
    average: string;
  };
  onBack: () => void;
}

const classSummary = [
  { section: "6A", appeared: 71, passed: 68, failed: 3, passPercentage: "95.8%", topper: "Rohan K (86%)", avgPercentage: "72.4%", color: "green" },
  { section: "7A", appeared: 68, passed: 54, failed: 14, passPercentage: "79.4%", topper: "Meera S (78%)", avgPercentage: "64.2%", color: "orange" },
  { section: "9A", appeared: 67, passed: 42, failed: 25, passPercentage: "62.7%", topper: "Aarav R (76%)", avgPercentage: "52.8%", color: "red", highlight: true },
  { section: "10B", appeared: 70, passed: 64, failed: 6, passPercentage: "91.4%", topper: "Sneha N (98%)", avgPercentage: "76.5%", color: "green" },
];

const meritList = [
  { name: "Sneha Nair (10B)", score: "98.2%", rank: 1, rankColor: "bg-amber-400" },
  { name: "Aarav Reddy (9A)", score: "96.4%", rank: 2, rankColor: "bg-slate-300" },
  { name: "Vikram Kumar (10A)", score: "95.8%", rank: 3, rankColor: "bg-orange-300" },
];

const failList = [
  { name: "Rahul Sharma (9A)", score: "42%", initials: "RS", highlight: true },
  { name: "Ankit Kumar (10C)", score: "38%", initials: "AK" },
  { name: "Neha Gupta (7A)", score: "35%", initials: "NG" },
];

const ExamDetail = ({ exam, onBack }: ExamDetailProps) => {
  const getValueColor = (val: string | number, colorType: string) => {
    if (colorType === 'green') return 'text-green-600';
    if (colorType === 'orange') return 'text-amber-500';
    if (colorType === 'red') return 'text-red-500';
    return 'text-foreground';
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Exams & Results</button>
        <span>/</span>
        <span className="text-foreground font-semibold">View Exam Results</span>
      </div>

      {/* ===== HEADER CARD ===== */}
      <div className="bg-card border border-border rounded-2xl p-7 mb-6 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Unit Test 2 - January 2026</h1>
            <p className="text-sm font-medium text-muted-foreground">
              Date: Jan 10-12, 2026  •  Total Students: 824
            </p>
          </div>
          <div className="flex gap-10">
            <div className="text-right">
              <p className="text-3xl font-black text-green-500">78.5%</p>
              <p className="text-xs font-medium text-muted-foreground">Pass Rate</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-amber-500">68.2%</p>
              <p className="text-xs font-medium text-muted-foreground">Average</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CLASS-WISE SUMMARY TABLE ===== */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-8 py-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground font-inter">Class-wise Results Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-8 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Section</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Appeared</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Passed</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Failed</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Pass %</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Topper</th>
                <th className="px-8 py-4 text-left text-xs font-bold text-[#1e3a8a] uppercase tracking-wider">Avg %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classSummary.map((item, i) => (
                <tr key={i} className={`hover:bg-secondary/20 transition-colors ${item.highlight ? 'bg-red-50/50' : ''}`}>
                  <td className="px-8 py-5 text-sm font-bold text-foreground">{item.section}</td>
                  <td className="px-6 py-5 text-sm font-medium text-muted-foreground">{item.appeared}</td>
                  <td className={`px-6 py-5 text-sm font-bold ${getValueColor(item.passed, item.color)}`}>{item.passed}</td>
                  <td className="px-6 py-5 text-sm font-bold text-red-500">{item.failed}</td>
                  <td className={`px-6 py-5 text-sm font-bold ${getValueColor(item.passPercentage, item.color)}`}>{item.passPercentage}</td>
                  <td className="px-6 py-5 text-sm font-medium text-muted-foreground">{item.topper}</td>
                  <td className={`px-8 py-5 text-sm font-bold ${getValueColor(item.avgPercentage, item.color)}`}>{item.avgPercentage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== BOTTOM TWO COLUMNS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Merit List */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-foreground">School Merit List (Top 5)</h3>
            <button className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {meritList.map((student, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-green-50/20 border border-green-100 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${student.rankColor}`}>
                    {student.rank}
                  </div>
                  <span className="text-sm font-bold text-slate-600">{student.name}</span>
                </div>
                <span className="text-sm font-bold text-green-600">{student.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fail List */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-foreground">Fail List (Needs Attention)</h3>
            <button className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {failList.map((student, i) => (
              <div key={i} className={`flex items-center justify-between p-4 border rounded-xl ${student.highlight ? 'bg-red-50/50 border-red-100' : 'bg-red-50/20 border-red-50'}`}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                    {student.initials}
                  </div>
                  <span className="text-sm font-bold text-slate-600">{student.name}</span>
                </div>
                <span className="text-sm font-bold text-red-500">{student.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="flex items-center gap-2 px-6 py-2.5 bg-[#1e3a8a] text-white rounded-lg text-sm font-bold shadow-md hover:bg-[#1e4fc0] transition-colors">
          <Download className="w-4 h-4" /> Download Results
        </button>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-background border border-border text-foreground rounded-lg text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <Printer className="w-4 h-4 text-muted-foreground" /> Print Report Cards
        </button>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-background border border-border text-foreground rounded-lg text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <Share2 className="w-4 h-4 text-muted-foreground" /> Share with Parents
        </button>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-background border border-border text-foreground rounded-lg text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <BarChart2 className="w-4 h-4 text-muted-foreground" /> Compare with Previous
        </button>
      </div>

      {/* Back Button */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Exams
        </button>
      </div>
    </div>
  );
};

export default ExamDetail;
