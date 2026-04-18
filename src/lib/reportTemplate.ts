/**
 * Professional Report HTML Template — matching Student Profile design
 * Used by all report generators across the dashboard.
 *
 * Usage:
 *   const html = buildReport({ title, subtitle, sections, footer });
 *   openReportWindow(html);
 */

// ── Color tokens (same as student profile) ───────────────────────────────────
const C = {
  bg: "#f8fafc", white: "#ffffff", ink: "#0f172a", ink2: "#475569", ink3: "#94a3b8",
  bdr: "#e2e8f0", s1: "#f1f5f9", s2: "#e2e8f0",
  blue: "#3B5BDB", blBg: "#EDF2FF",
  grn: "#16a34a", glBg: "#f0fdf4",
  red: "#dc2626", rlBg: "#fef2f2",
  amb: "#d97706", alBg: "#fffbeb",
};

// ── Section types ────────────────────────────────────────────────────────────
export interface ReportStat {
  label: string;
  value: string | number;
  color?: string; // hex
}

export interface ReportTableRow {
  cells: (string | number)[];
  highlight?: boolean; // red/warning row
}

export interface ReportSection {
  title: string;
  type: "stats" | "table" | "bars" | "text" | "list" | "grid-stats";
  // For stats: array of { label, value, color }
  stats?: ReportStat[];
  // For table: headers + rows
  headers?: string[];
  rows?: ReportTableRow[];
  // For bars: array of { label, value (0-100), color }
  bars?: { label: string; value: number; color?: string; rightLabel?: string }[];
  // For text: paragraph
  text?: string;
  // For list: bullet items
  items?: string[];
}

export interface ReportConfig {
  title: string;
  subtitle?: string;
  badge?: string; // e.g. "CBSE", "Class 10B"
  heroStats?: ReportStat[]; // top-level stats in hero
  sections: ReportSection[];
  footer?: string;
  schoolName?: string;
  generatedBy?: string;
}

// ── Build CSS ────────────────────────────────────────────────────────────────
const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    background: ${C.bg}; color: ${C.ink}; padding: 32px; max-width: 900px; margin: 0 auto;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @media print {
    body { padding: 16px; background: #fff; }
    .no-print { display: none !important; }
    .card { break-inside: avoid; box-shadow: none !important; border: 1px solid ${C.bdr} !important; }
  }
  .hero {
    background: linear-gradient(135deg, #1e3a8a, ${C.blue});
    border-radius: 16px; padding: 28px 32px; color: #fff; margin-bottom: 24px;
  }
  .hero h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .hero .sub { font-size: 12px; opacity: 0.7; margin-bottom: 16px; }
  .hero .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; background: rgba(255,255,255,0.15); font-size: 10px; font-weight: 600; margin-right: 6px; }
  .hero-stats { display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap; }
  .hero-stat { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 12px 16px; min-width: 120px; }
  .hero-stat .val { font-size: 22px; font-weight: 800; }
  .hero-stat .lbl { font-size: 10px; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  .card {
    background: ${C.white}; border: 1px solid ${C.bdr}; border-radius: 16px;
    margin-bottom: 16px; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .card-header {
    padding: 14px 20px; border-bottom: 1px solid ${C.s2};
    font-size: 14px; font-weight: 600; color: ${C.ink};
    display: flex; align-items: center; gap: 8px;
  }
  .card-header .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .card-body { padding: 16px 20px; }
  .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .stat-box {
    background: ${C.s1}; border: 1px solid ${C.s2}; border-radius: 12px;
    padding: 14px 16px; text-align: center;
  }
  .stat-box .val { font-size: 24px; font-weight: 800; }
  .stat-box .lbl { font-size: 10px; color: ${C.ink3}; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 600;
    color: ${C.ink3}; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 2px solid ${C.s2}; background: ${C.s1};
  }
  td { padding: 10px 12px; border-bottom: 1px solid ${C.s2}; color: ${C.ink2}; }
  tr:hover td { background: rgba(59,91,219,0.02); }
  .highlight td { background: ${C.rlBg}; color: ${C.red}; font-weight: 500; }
  .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .bar-label { font-size: 12px; color: ${C.ink3}; width: 120px; flex-shrink: 0; }
  .bar-track { flex: 1; height: 8px; background: ${C.s1}; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
  .bar-value { font-size: 12px; font-weight: 600; width: 50px; text-align: right; }
  .text-block { font-size: 13px; color: ${C.ink2}; line-height: 1.7; }
  .list-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid ${C.s2}; font-size: 12px; color: ${C.ink2}; }
  .list-item:last-child { border-bottom: none; }
  .list-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.blue}; margin-top: 5px; flex-shrink: 0; }
  .footer {
    margin-top: 24px; padding: 14px 20px; background: ${C.white}; border: 1px solid ${C.bdr};
    border-radius: 12px; display: flex; justify-content: space-between; align-items: center;
    font-size: 10px; color: ${C.ink3};
  }
  .print-btn {
    padding: 10px 24px; background: ${C.blue}; color: #fff; border: none;
    border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
    font-family: inherit; margin-bottom: 20px;
  }
  .print-btn:hover { background: #2b4ac7; }
`;

// ── Build HTML ───────────────────────────────────────────────────────────────
export function buildReport(config: ReportConfig): string {
  const { title, subtitle, badge, heroStats, sections, footer, schoolName, generatedBy } = config;
  const now = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const heroStatsHtml = heroStats?.length ? `
    <div class="hero-stats">
      ${heroStats.map(s => `
        <div class="hero-stat">
          <div class="val" style="color:${s.color || "#fff"}">${s.value}</div>
          <div class="lbl">${s.label}</div>
        </div>
      `).join("")}
    </div>` : "";

  const badgeHtml = badge ? `<span class="badge">${badge}</span>` : "";

  const sectionsHtml = sections.map(sec => {
    let bodyHtml = "";

    if (sec.type === "grid-stats" && sec.stats) {
      bodyHtml = `<div class="grid-stats">${sec.stats.map(s => `
        <div class="stat-box">
          <div class="val" style="color:${s.color || C.blue}">${s.value}</div>
          <div class="lbl">${s.label}</div>
        </div>`).join("")}</div>`;
    }

    if (sec.type === "stats" && sec.stats) {
      bodyHtml = sec.stats.map(s => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${C.s2}">
          <span style="color:${C.ink3};font-size:12px">${s.label}</span>
          <span style="font-weight:600;color:${s.color || C.ink};font-size:13px">${s.value}</span>
        </div>`).join("");
    }

    if (sec.type === "table" && sec.headers && sec.rows) {
      bodyHtml = `<table>
        <thead><tr>${sec.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${sec.rows.map(r => `<tr${r.highlight ? ' class="highlight"' : ""}>${r.cells.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`;
    }

    if (sec.type === "bars" && sec.bars) {
      bodyHtml = sec.bars.map(b => {
        const color = b.color || (b.value >= 75 ? C.grn : b.value >= 50 ? C.amb : C.red);
        return `<div class="bar-row">
          <span class="bar-label">${b.label}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, b.value)}%;background:${color}"></div></div>
          <span class="bar-value" style="color:${color}">${b.rightLabel || b.value + "%"}</span>
        </div>`;
      }).join("");
    }

    if (sec.type === "text" && sec.text) {
      bodyHtml = `<div class="text-block">${sec.text}</div>`;
    }

    if (sec.type === "list" && sec.items) {
      bodyHtml = sec.items.map(item => `
        <div class="list-item"><div class="list-dot"></div><span>${item}</span></div>
      `).join("");
    }

    return `<div class="card">
      <div class="card-header"><div class="dot" style="background:${C.blue}"></div>${sec.title}</div>
      <div class="card-body">${bodyHtml}</div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Edullent Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <style>${CSS}</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="hero">
    ${badgeHtml}
    <h1>${title}</h1>
    ${subtitle ? `<div class="sub">${subtitle}</div>` : ""}
    ${heroStatsHtml}
  </div>

  ${sectionsHtml}

  <div class="footer">
    <span>★ ${schoolName || "Edullent"}</span>
    <span>Generated: ${now}</span>
    <span>${generatedBy ? `By: ${generatedBy}` : "Edullent Platform"}</span>
  </div>
</body>
</html>`;
}

// ── Open in new window ───────────────────────────────────────────────────────
export function openReportWindow(html: string) {
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow popups for report generation."); return; }
  w.document.write(html);
  w.document.close();
}

// ── Quick student report builder ─────────────────────────────────────────────
export function buildStudentReport(data: {
  name: string; className: string; rollNo: string;
  avgScore: number; attendanceRate: number; passRate: number;
  subjects: { name: string; score: number }[];
  assignments: { title: string; status: string; score?: string }[];
  incidents: { type: string; description: string; date: string }[];
  riskLevel: string;
  schoolName?: string; generatedBy?: string;
}): string {
  const { name, className, rollNo, avgScore, attendanceRate, subjects, assignments, incidents, riskLevel, schoolName, generatedBy } = data;

  return buildReport({
    title: `${name} — Progress Report`,
    subtitle: `${className} · Roll: ${rollNo}`,
    badge: riskLevel,
    schoolName, generatedBy,
    heroStats: [
      { label: "Average Score", value: `${Math.round(avgScore)}%`, color: avgScore >= 75 ? "#4ade80" : "#fbbf24" },
      { label: "Attendance", value: `${Math.round(attendanceRate)}%`, color: attendanceRate >= 85 ? "#4ade80" : "#fbbf24" },
      { label: "Subjects", value: subjects.length },
      { label: "Risk Level", value: riskLevel, color: riskLevel === "STABLE" ? "#4ade80" : "#fbbf24" },
    ],
    sections: [
      {
        title: "Subject Performance",
        type: "bars",
        bars: subjects.map(s => ({ label: s.name, value: s.score })),
      },
      {
        title: "Assignments",
        type: "table",
        headers: ["Title", "Status", "Score"],
        rows: assignments.map(a => ({
          cells: [a.title, a.status, a.score || "—"],
          highlight: a.status === "OVERDUE",
        })),
      },
      ...(incidents.length > 0 ? [{
        title: "Incidents",
        type: "table" as const,
        headers: ["Type", "Description", "Date"],
        rows: incidents.map(i => ({
          cells: [i.type, i.description, i.date],
          highlight: true,
        })),
      }] : []),
      {
        title: "Risk Assessment",
        type: "bars",
        bars: [
          { label: "Academic", value: avgScore, color: avgScore >= 75 ? C.grn : avgScore >= 50 ? C.amb : C.red },
          { label: "Attendance", value: attendanceRate, color: attendanceRate >= 85 ? C.grn : C.amb },
        ],
      },
    ],
  });
}

// ── Quick teacher report builder ─────────────────────────────────────────────
export function buildTeacherReport(data: {
  name: string; subject: string; email: string;
  classAvg: number; passRate: number; attendance: number;
  classes: { name: string; students: number; avg: string; status: string }[];
  rating: number; reviewCount: number;
  schoolName?: string; generatedBy?: string;
}): string {
  return buildReport({
    title: `${data.name} — Teacher Report`,
    subtitle: `${data.subject} Teacher · ${data.email}`,
    schoolName: data.schoolName, generatedBy: data.generatedBy,
    heroStats: [
      { label: "Class Average", value: `${data.classAvg}%` },
      { label: "Pass Rate", value: `${data.passRate}%` },
      { label: "Attendance", value: `${data.attendance}%` },
      { label: "Rating", value: `${data.rating}/5` },
    ],
    sections: [
      {
        title: "Performance Metrics",
        type: "bars",
        bars: [
          { label: "Class Average", value: data.classAvg },
          { label: "Pass Rate", value: data.passRate },
          { label: "Attendance", value: data.attendance },
          { label: "Satisfaction", value: Math.round(data.rating * 20) },
        ],
      },
      {
        title: "Assigned Classes",
        type: "table",
        headers: ["Class", "Students", "Avg Score", "Status"],
        rows: data.classes.map(c => ({ cells: [c.name, c.students, c.avg, c.status] })),
      },
      {
        title: "Overview",
        type: "stats",
        stats: [
          { label: "Total Classes", value: data.classes.length },
          { label: "Total Students", value: data.classes.reduce((a, c) => a + c.students, 0) },
          { label: "Reviews", value: data.reviewCount },
          { label: "Parent Rating", value: `${data.rating.toFixed(1)}/5`, color: C.amb },
        ],
      },
    ],
  });
}

// ── Quick class report builder ───────────────────────────────────────────────
export function buildClassReport(data: {
  className: string; teacherName: string; totalStudents: number;
  avgScore: number; passRate: number; attendanceRate: number;
  students: { name: string; score: string; attendance: string; grade: string }[];
  schoolName?: string; generatedBy?: string;
}): string {
  return buildReport({
    title: `${data.className} — Class Report`,
    subtitle: `Teacher: ${data.teacherName} · ${data.totalStudents} Students`,
    schoolName: data.schoolName, generatedBy: data.generatedBy,
    heroStats: [
      { label: "Class Average", value: `${data.avgScore}%` },
      { label: "Pass Rate", value: `${data.passRate}%` },
      { label: "Attendance", value: `${data.attendanceRate}%` },
      { label: "Students", value: data.totalStudents },
    ],
    sections: [
      {
        title: "Class Performance",
        type: "bars",
        bars: [
          { label: "Average Score", value: data.avgScore },
          { label: "Pass Rate", value: data.passRate },
          { label: "Attendance Rate", value: data.attendanceRate },
        ],
      },
      {
        title: "Student Breakdown",
        type: "table",
        headers: ["Name", "Score", "Attendance", "Grade"],
        rows: data.students.map(s => ({
          cells: [s.name, s.score, s.attendance, s.grade],
          highlight: parseInt(s.score) < 40,
        })),
      },
    ],
  });
}