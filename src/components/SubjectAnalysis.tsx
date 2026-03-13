import React from 'react';
import { ChevronLeft, Download, Lightbulb, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface SubjectAnalysisProps {
  subject: {
    name: string;
    avg: string;
    icon: any;
    iconBg?: string;
    iconColor?: string;
  };
  onBack: () => void;
}

const SubjectAnalysis = ({ subject, onBack }: SubjectAnalysisProps) => {
  const sectionsPerformance = [
    { section: "10B", value: 68, color: "#22c55e" },
    { section: "10A", value: 72, color: "#22c55e" },
    { section: "8B", value: 62, color: "#f59e0b" },
    { section: "8A", value: 58, color: "#f59e0b" },
    { section: "9C", value: 55, color: "#f59e0b" },
    { section: "9B", value: 48, color: "#ef4444" },
    { section: "9A", value: 42, color: "#ef4444" },
  ];

  const marksDistData = [
    { range: '0-20', students: 35, color: '#ef4444' },
    { range: '21-40', students: 110, color: '#ef4444' },
    { range: '41-60', students: 300, color: '#f59e0b' },
    { range: '61-80', students: 270, color: '#1e3a8a' },
    { range: '81-100', students: 45, color: '#22c55e' },
  ];

  const teachers = [
    { name: "Mrs. Kavita", grades: "Grades 8-10", avg: "58%", avgColor: "#ef4444", initials: "MK", avatarBg: "#1e3a8a" },
    { name: "Mr. Verma", grades: "Grades 6-7", avg: "68%", avgColor: "#f59e0b", initials: "RV", avatarBg: "#22c55e" },
  ];

  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
          {payload[0].payload.range}: {payload[0].value} students
        </div>
      );
    }
    return null;
  };

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Academics</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Subject Analysis</span>
      </div>

      {/* ===== SUBJECT HEADER ===== */}
      <div className="rounded-2xl p-6 mb-8 flex items-center justify-between shadow-sm border" style={{ backgroundColor: '#fff5f5', borderColor: '#fecaca' }}>
        <div className="flex items-center gap-5">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm ${subject.iconBg || 'bg-red-50'}`}>
            <subject.icon className={`w-7 h-7 ${subject.iconColor || 'text-red-500'}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{subject.name}</h1>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              Overall Average: <span className="text-red-500 font-bold">{subject.avg}</span>
              <span className="mx-2">•</span>
              847 students
            </p>
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          <button className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-bold text-foreground bg-card hover:bg-secondary transition-colors">
            <Download className="w-4 h-4 text-red-500" /> Export PDF
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] rounded-xl text-sm font-bold text-white hover:bg-[#1e4fc0] transition-colors shadow-md">
            <Lightbulb className="w-4 h-4" /> View Recommendations
          </button>
        </div>
      </div>

      {/* ===== TOP ROW: Section Performance + Insights ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Section-wise Performance - Horizontal Bar Chart (recharts) */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-2">Section-wise Performance</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={sectionsPerformance}
              layout="vertical"
              margin={{ top: 5, right: 40, left: 5, bottom: 5 }}
              barCategoryGap="22%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="section"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }}
                width={35}
              />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#1e293b] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
                        {payload[0].payload.section}: {payload[0].value}%
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={1200} barSize={22}>
                {sectionsPerformance.map((entry, index) => (
                  <Cell key={`section-bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Insights */}
        <div className="space-y-4">
          {/* Top Performing Section */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-foreground mb-1">Top Performing Section</h4>
                <p className="text-sm text-muted-foreground font-medium">10A with 72% average (Mrs. Kavita)</p>
              </div>
            </div>
          </div>

          {/* Weakest Section */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <TrendingDown className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-foreground mb-1">Weakest Section</h4>
                <p className="text-sm text-muted-foreground font-medium">9A with 42% average (Mrs. Kavita)</p>
              </div>
            </div>
          </div>

          {/* Key Issues Identified */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h4 className="text-sm font-bold text-foreground mb-3">Key Issues Identified</h4>
            <ul className="space-y-2.5">
              {[
                "Algebra concepts weak across grades 8-9",
                "Geometry application problems",
                "Time management in exams"
              ].map((issue, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground font-medium">
                  <span className="text-foreground mt-1.5">•</span>
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ===== BOTTOM ROW: Marks Distribution + Teacher Effectiveness ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Student Marks Distribution - Bar Chart */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-4">Student Marks Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={marksDistData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="range"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
              />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
              <Bar dataKey="students" radius={[4, 4, 0, 0]} animationDuration={1200}>
                {marksDistData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Teacher Effectiveness */}
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-6">Teacher Effectiveness</h3>
          <div className="space-y-4">
            {teachers.map((t, i) => (
              <div key={i} className="flex items-center justify-between p-5 border border-border rounded-xl hover:shadow-sm transition-all cursor-pointer bg-secondary/20">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md" style={{ backgroundColor: t.avatarBg }}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-medium">{t.grades}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black" style={{ color: t.avgColor }}>{t.avg}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">avg</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== IMPROVEMENT RECOMMENDATIONS ===== */}
      <div className="mt-6 rounded-2xl p-7 shadow-sm" style={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
        <div className="flex items-center gap-3 mb-5">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-bold text-foreground">Improvement Recommendations</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Extra Practice Sessions", desc: "Schedule 2 additional math practice classes per week for grades 8-9" },
            { title: "Teacher Training", desc: "Organize workshop on innovative teaching methods for algebra" },
            { title: "Parent Engagement", desc: "Conduct parent-teacher meetings focused on math support at home" },
          ].map((rec, i) => (
            <div key={i} className="bg-card rounded-xl p-5 shadow-sm border border-border hover:shadow-md transition-all cursor-pointer">
              <h4 className="text-sm font-bold text-foreground mb-2">{rec.title}</h4>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">{rec.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Academics
        </button>
      </div>
    </div>
  );
};

export default SubjectAnalysis;
