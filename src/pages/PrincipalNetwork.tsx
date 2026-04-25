/**
 * PrincipalNetwork.tsx — Locked Edullent design (4 screens, single page).
 *
 * The visual primitives, design tokens, layout and copy come from the
 * locked spec at EdullentPrincipalDashboard.jsx. Mock data has been
 * replaced with live Firestore reads (current school's teachers +
 * students, scored via teacherScorer) and synthetic peer rows for the
 * network leaderboard. Diagnosis + action plan are streamed from
 * /api/ai-insights (existing OpenAI proxy).
 */

import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Loader2 } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  TeacherDoc, ScoreDoc, AttendanceDoc, AssignmentDoc, TeacherAttendanceDoc,
} from "@/lib/teacherScorer";
import {
  computeBranchComposite,
  buildNetworkLeaderboard,
  buildTrajectory,
  buildRankTrajectory,
  fetchPrincipalInsights,
  fetchBranchInsights,
  BranchComposite,
  NetworkLeaderboard,
  AIInsightsResult,
  AIAction,
} from "@/lib/principalNetwork";

// ──────────────────────────────────────────────────────────────────────────
// LOCKED DESIGN TOKENS
// ──────────────────────────────────────────────────────────────────────────
const FONT = "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif";
const T = {
  pageBg: "#EEF4FF", cardBg: "#FFFFFF",
  B1: "#0055FF", B2: "#1166FF", IND3: "#4499FF",
  T1: "#001040", T3: "#5070B0", T4: "#99AACC",
  GREEN: "#34C759", GREEN_DEEP: "#00C853",
  RED: "#FF453A", RED_DEEP: "#C71F2D",
  ORANGE: "#FF8800", ORANGE_DEEP: "#C26A00",
  AMBER: "#B47A00", VIOLET: "#7B3FF4", VIOLET_LIGHT: "#B79FFF",
  GOLD: "#FFD700", GOLD_DEEP: "#FFAA00",
  SILVER: "#A8A8B5", BRONZE: "#8B5A2B",
  SH: "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 8px rgba(0,85,255,0.10)",
  SH_LG: "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.12), 0 20px 48px rgba(0,85,255,0.14)",
  SH_HERO: "0 0 0 0.5px rgba(0,85,255,0.10), 0 8px 24px rgba(0,85,255,0.18), 0 24px 60px rgba(0,85,255,0.22)",
  SH_BTN: "0 8px 24px rgba(0,0,0,0.20), 0 2px 6px rgba(0,0,0,0.10)",
  BORDER: "0.5px solid rgba(0,85,255,0.10)",
  BORDER_SOFT: "0.5px solid rgba(0,85,255,0.06)",
  BORDER_USER: "2px solid #0055FF",
  HERO_GRADIENT: "linear-gradient(135deg, #000A33 0%, #001A66 32%, #0044CC 68%, #0055FF 100%)",
  HERO_FORECAST: "linear-gradient(135deg, #001040 0%, #001A66 50%, #0055FF 100%)",
} as const;

// ──────────────────────────────────────────────────────────────────────────
// LIVE DATA HOOK — pulls the principal's school-wide data from Firestore
// ──────────────────────────────────────────────────────────────────────────
function useBranchLiveData() {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId as string | undefined;
  const branchId = userData?.branchId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherDoc[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [testScores, setTestScores] = useState<ScoreDoc[]>([]);
  const [results, setResults] = useState<ScoreDoc[]>([]);
  const [gradebook, setGradebook] = useState<ScoreDoc[]>([]);
  const [attendance, setAttendance] = useState<AttendanceDoc[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDoc[]>([]);
  const [tAttendance, setTAttendance] = useState<TeacherAttendanceDoc[]>([]);
  const [teachingAssignments, setTeachingAssignments] = useState<any[]>([]);

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }

    let loaded = 0;
    const total = 10;
    const mark = () => { loaded++; if (loaded >= total) setLoading(false); };

    const scoped = (col: string) => {
      const base = [where("schoolId", "==", schoolId)];
      if (branchId) base.push(where("branchId", "==", branchId));
      return query(collection(db, col), ...base);
    };

    const unsubs = [
      onSnapshot(scoped("teachers"),            (s) => { setTeachers(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); mark(); }, () => mark()),
      onSnapshot(scoped("students"),            (s) => { setStudents(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); mark(); }, () => mark()),
      onSnapshot(scoped("classes"),             (s) => { setClasses(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); mark(); }, () => mark()),
      onSnapshot(scoped("test_scores"),         (s) => { setTestScores(s.docs.map(d => d.data() as ScoreDoc)); mark(); }, () => mark()),
      onSnapshot(scoped("results"),             (s) => { setResults(s.docs.map(d => d.data() as ScoreDoc)); mark(); }, () => mark()),
      onSnapshot(scoped("gradebook_scores"),    (s) => { setGradebook(s.docs.map(d => d.data() as ScoreDoc)); mark(); }, () => mark()),
      onSnapshot(scoped("attendance"),          (s) => { setAttendance(s.docs.map(d => d.data() as AttendanceDoc)); mark(); }, () => mark()),
      onSnapshot(scoped("assignments"),         (s) => { setAssignments(s.docs.map(d => d.data() as AssignmentDoc)); mark(); }, () => mark()),
      onSnapshot(scoped("teacher_attendance"),  (s) => { setTAttendance(s.docs.map(d => d.data() as TeacherAttendanceDoc)); mark(); }, () => mark()),
      onSnapshot(scoped("teaching_assignments"),(s) => { setTeachingAssignments(s.docs.map(d => d.data() as any)); mark(); }, () => mark()),
    ];

    return () => unsubs.forEach(u => u());
  }, [schoolId, branchId]);

  const branch: BranchComposite | null = useMemo(() => {
    if (loading || !schoolId) return null;
    const branchName = (userData?.branchName as string)
      || (userData?.schoolName as string)
      || "Your Branch";
    return computeBranchComposite({
      branchName,
      schoolId,
      teachers, students, classes,
      scores: [...testScores, ...results, ...gradebook],
      attendance, assignments,
      teacherAttendance: tAttendance,
      teachingAssignments,
    });
  }, [loading, schoolId, userData, teachers, students, classes,
      testScores, results, gradebook, attendance, assignments,
      tAttendance, teachingAssignments]);

  return { loading, branch, schoolId, userData };
}

// ──────────────────────────────────────────────────────────────────────────
// PRIMITIVES (locked design, identical to spec)
// ──────────────────────────────────────────────────────────────────────────
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = T.T4 }) => (
  <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.6px", color, margin: 0, textTransform: "uppercase", fontFamily: FONT }}>{children}</p>
);

const SectionHead: React.FC<{ eyebrow: string; title: string; subtitle?: string }> = ({ eyebrow, title, subtitle }) => (
  <div style={{ marginBottom: 14 }}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.9px", color: T.T1, margin: "4px 0 4px", lineHeight: 1.1, fontFamily: FONT }}>{title}</h2>
    {subtitle && <p style={{ fontSize: 13, fontWeight: 500, color: T.T3, margin: 0, fontFamily: FONT }}>{subtitle}</p>}
  </div>
);

const BackButton: React.FC<{ label?: string; onClick: () => void }> = ({ label = "Back", onClick }) => (
  <button onClick={onClick} style={{
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px 8px 10px",
    borderRadius: 999, background: T.cardBg, border: T.BORDER, cursor: "pointer",
    fontFamily: FONT, boxShadow: T.SH,
  }}>
    <ArrowLeft size={14} color={T.B1} strokeWidth={2.2} />
    <span style={{ fontSize: 12, fontWeight: 700, color: T.B1 }}>{label}</span>
  </button>
);

const Avatar: React.FC<{ initials: string; bg: string; color: string; size?: number }> = ({ initials, bg, color, size = 38 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", background: bg, color,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: size > 36 ? 13 : 12, flexShrink: 0, fontFamily: FONT,
  }}>{initials}</div>
);

type RankVariant = 1 | 2 | 3 | "user" | "amber" | "red" | "default";
const RankBadge: React.FC<{ rank: number; variant?: RankVariant; size?: number }> = ({ rank, variant = "default", size = 38 }) => {
  const styles: Record<string, { bg: string; color: string; shadow: string }> = {
    "1": { bg: `linear-gradient(135deg, ${T.GOLD} 0%, ${T.GOLD_DEEP} 100%)`, color: "#FFF", shadow: "0 6px 16px rgba(255,170,0,0.35)" },
    "2": { bg: "linear-gradient(135deg, #E8E8F0 0%, #A8A8B5 100%)", color: "#FFF", shadow: "0 6px 16px rgba(168,168,181,0.35)" },
    "3": { bg: "linear-gradient(135deg, #D89060 0%, #8B5A2B 100%)", color: "#FFF", shadow: "0 6px 16px rgba(139,90,43,0.35)" },
    user: { bg: `linear-gradient(135deg, ${T.B1} 0%, ${T.B2} 100%)`, color: "#FFF", shadow: "0 4px 12px rgba(0,85,255,0.35)" },
    amber: { bg: `linear-gradient(135deg, ${T.ORANGE} 0%, ${T.GOLD_DEEP} 100%)`, color: "#FFF", shadow: "0 4px 12px rgba(255,136,0,0.35)" },
    red: { bg: "linear-gradient(135deg, #FF453A 0%, #E5304A 100%)", color: "#FFF", shadow: "0 4px 12px rgba(255,69,58,0.35)" },
    default: { bg: "rgba(0,85,255,0.06)", color: T.T3, shadow: "none" },
  };
  const s = styles[String(variant)] || styles.default;
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, background: s.bg, color: s.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size >= 38 ? 15 : 13, boxShadow: s.shadow, flexShrink: 0, fontFamily: FONT,
    }}>{rank}</div>
  );
};

const TrendPill: React.FC<{ trend: "up" | "down"; label: string }> = ({ trend, label }) => {
  const isUp = trend === "up";
  const color = isUp ? T.GREEN : T.RED;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px",
      borderRadius: 999, background: isUp ? "rgba(52,199,89,0.18)" : "rgba(255,69,58,0.25)",
      border: `0.5px solid ${isUp ? "rgba(52,199,89,0.3)" : "rgba(255,69,58,0.5)"}`,
    }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        {isUp ? <path d="M4.5 1.5L7.5 6.5H1.5L4.5 1.5Z" fill={color}/> : <path d="M4.5 7.5L1.5 2.5H7.5L4.5 7.5Z" fill={color}/>}
      </svg>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1px", color, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
};

const DiagnosisCard: React.FC<{ items: { type: "good" | "concern" | "note"; text: string }[] }> = ({ items }) => {
  const renderText = (text: string) => text.split(/(\*\*.*?\*\*)/).map((p, i) =>
    p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
  const colorMap: Record<string, string> = { good: T.GREEN, concern: T.RED, note: T.T1 };
  return (
    <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "rgba(123,63,244,0.10)", border: "0.5px solid rgba(123,63,244,0.3)" }}>
          <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: T.VIOLET }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: T.VIOLET, letterSpacing: "1.4px", textTransform: "uppercase", fontFamily: FONT }}>Edullent AI · Data backed</span>
        </div>
      </div>
      {items.length === 0 && (
        <p style={{ fontSize: 13, color: T.T3, margin: 0, fontFamily: FONT }}>AI diagnosis loading…</p>
      )}
      {items.map((item, i) => (
        <p key={i} style={{ fontSize: 15, fontWeight: 500, color: T.T1, margin: i < items.length - 1 ? "0 0 14px" : 0, lineHeight: 1.65, letterSpacing: "-0.1px", fontFamily: FONT }}>
          {item.type !== "note" && <strong style={{ color: colorMap[item.type] }}>{item.type === "good" ? "Achhi khabar: " : "Issue: "}</strong>}
          {renderText(item.text)}
        </p>
      ))}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: number | string; suffix?: string; vs?: string; severity?: "okay" | "weak" | "strong" | "critical" }> = ({ label, value, suffix, vs, severity = "okay" }) => {
  const sMap = {
    okay:     { bar: T.B1, text: T.T3, val: T.T1, border: "rgba(0,85,255,0.10)" },
    weak:     { bar: T.ORANGE, text: T.RED, val: T.T1, border: "rgba(255,136,0,0.18)" },
    strong:   { bar: `linear-gradient(90deg, ${T.GREEN} 0%, ${T.GREEN_DEEP} 100%)`, text: T.GREEN, val: T.GREEN, border: "rgba(0,85,255,0.10)" },
    critical: { bar: `linear-gradient(90deg, ${T.ORANGE} 0%, ${T.RED} 100%)`, text: T.RED, val: T.RED, border: "rgba(255,69,58,0.18)" },
  } as const;
  const s = sMap[severity];

  return (
    <div style={{ background: T.cardBg, border: `0.5px solid ${s.border}`, borderRadius: 18, padding: 16, boxShadow: T.SH }}>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.4px", color: T.T4, margin: "0 0 8px", textTransform: "uppercase", fontFamily: FONT }}>{label}</p>
      <p style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-1px", color: s.val, margin: 0, lineHeight: 1, fontFamily: FONT }}>
        {value}{suffix && <span style={{ fontSize: 18, color: T.T3 }}>{suffix}</span>}
      </p>
      {vs && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          <div style={{ flex: 1, height: 4, background: "rgba(0,85,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(typeof value === "number" ? value : parseFloat(String(value)) || 0, 100)}%`, background: s.bar, borderRadius: 999 }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: s.text, fontFamily: FONT }}>{vs}</span>
        </div>
      )}
    </div>
  );
};

const TrajectoryChart: React.FC<{ data: any[]; valueKey?: string; isRank?: boolean; color?: string }> = ({ data, valueKey = "value", isRank = false, color = T.B1 }) => {
  const vals = data.map(d => d[valueKey] as number);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const pad = (maxV - minV) * 0.2 || 1;
  const yMin = isRank ? 1 : minV - pad, yMax = isRank ? maxV + 2 : maxV + pad;
  const xStep = 330 / (data.length - 1 || 1);
  const pts = data.map((d: any, i: number) => ({
    x: 50 + i * xStep,
    y: 40 + ((isRank ? d[valueKey] - yMin : yMax - d[valueKey]) / (yMax - yMin || 1)) * 120,
    label: d.week as string, value: d[valueKey] as number,
  }));
  const pathD = pts.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : ` L ${p.x},${p.y}`)).join("");
  const fillD = `${pathD} L ${pts[pts.length - 1].x},200 L ${pts[0].x},200 Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 400 220" style={{ width: "100%", height: "auto", display: "block" }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pfill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map(i => <line key={i} x1="30" y1={40 + i * 60} x2="380" y2={40 + i * 60} stroke="rgba(0,85,255,0.06)" strokeWidth="0.5" strokeDasharray="2 4"/>)}
      <path d={fillD} fill="url(#pfill)" />
      <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.slice(0, -1).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#FFF" stroke={color} strokeWidth="2" />)}
      <circle cx={last.x} cy={last.y} r="6" fill={color} />
      <text x={last.x} y={last.y - 14} textAnchor="middle" fill={color} fontSize="11" fontWeight="800" fontFamily="Montserrat, sans-serif">
        {isRank ? `#${last.value}` : last.value}
      </text>
      {pts.map((p, i) => (
        <text key={i} x={p.x} y="195" textAnchor="middle" fill={i === pts.length - 1 ? color : T.T4} fontSize="9" fontWeight="700" fontFamily="Montserrat, sans-serif">{p.label}</text>
      ))}
      <text x={last.x} y="216" textAnchor="middle" fill={color} fontSize="10" fontWeight="800" fontFamily="Montserrat, sans-serif">Now</text>
    </svg>
  );
};

const ActionCard: React.FC<{ action: AIAction }> = ({ action }) => {
  const isCompleted = action.status === "completed";
  const isInProgress = action.status === "in_progress";
  const isManual = action.tracking === "manual";

  if (isCompleted) {
    return (
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, padding: 18, boxShadow: T.SH_LG, position: "relative" }}>
        <div style={{ position: "absolute", top: 14, right: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.GREEN, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(52,199,89,0.4)" }}>
            <Check size={12} color="#FFF" strokeWidth={2.5} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
          <span style={{ flexShrink: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-1.2px", color: T.B1, lineHeight: 1, minWidth: 36, fontFamily: FONT }}>{action.num}</span>
          <div style={{ flex: 1, paddingRight: 28 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: T.T1, margin: "0 0 4px", letterSpacing: "-0.2px", lineHeight: 1.3, fontFamily: FONT }}>{action.title}</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.GREEN, margin: 0, lineHeight: 1.5, fontFamily: FONT }}>{action.reward} — achieved</p>
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "rgba(0,85,255,0.04)", border: "0.5px solid rgba(0,85,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: T.GREEN, textTransform: "uppercase", fontFamily: FONT }}>Completed</span>
            <div style={{ flex: 1, height: 4, borderRadius: 999, background: `linear-gradient(90deg, ${T.GREEN} 0%, ${T.GREEN_DEEP} 100%)`, boxShadow: "0 0 10px rgba(52,199,89,0.45)" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, padding: 18, boxShadow: T.SH_LG }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
        <span style={{ flexShrink: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-1.2px", color: T.B1, lineHeight: 1, minWidth: 36, fontFamily: FONT }}>{action.num}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: T.T1, margin: "0 0 4px", letterSpacing: "-0.2px", lineHeight: 1.3, fontFamily: FONT }}>{action.title}</p>
          <p style={{ fontSize: 12, fontWeight: 500, color: T.T3, margin: 0, lineHeight: 1.5, fontFamily: FONT }}>{action.reason}</p>
        </div>
      </div>
      <div style={{ padding: 12, borderRadius: 12, background: isManual ? "rgba(123,63,244,0.04)" : "rgba(0,85,255,0.04)", border: isManual ? "0.5px solid rgba(123,63,244,0.10)" : "0.5px solid rgba(0,85,255,0.08)" }}>
        {isInProgress && action.progress ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.GREEN, boxShadow: `0 0 6px ${T.GREEN}` }} />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: T.GREEN, textTransform: "uppercase", fontFamily: FONT }}>Live · Auto-tracked</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: T.GREEN, fontFamily: FONT }}>{action.progress.current} / {action.progress.target} done</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: Math.min(action.progress.target, 8) }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: i < action.progress!.current ? `linear-gradient(90deg, ${T.GREEN} 0%, ${T.GREEN_DEEP} 100%)` : "rgba(0,85,255,0.10)", boxShadow: i < action.progress!.current ? "0 0 8px rgba(52,199,89,0.45)" : "none" }} />
              ))}
            </div>
          </>
        ) : action.tracking === "auto_pct" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.B1 }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: T.B1, textTransform: "uppercase", fontFamily: FONT }}>Auto-tracked</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.T3, marginLeft: "auto", fontFamily: FONT }}>Now {action.current}{action.unit} → Goal {action.target}{action.unit}</span>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: isManual ? T.VIOLET : T.B1 }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: isManual ? T.VIOLET : T.B1, textTransform: "uppercase", fontFamily: FONT }}>{isManual ? "Self-tracked" : "Auto-tracked"}</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: isManual ? T.VIOLET : T.B1, fontFamily: FONT }}>{isManual ? "Manual log" : (action.subStatus || "")}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const ForecastCard: React.FC<{
  projectedLabel: string; changeLabel: string; changeSubtitle: string;
  scenarios: { label: string; outcome: string; highlight?: boolean }[];
  confidence: number; note?: string;
}> = ({ projectedLabel, changeLabel, changeSubtitle, scenarios, confidence, note }) => (
  <div style={{ background: T.HERO_FORECAST, borderRadius: 24, padding: 24, boxShadow: T.SH_HERO, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", bottom: "-50%", left: "-20%", width: "80%", height: "140%", background: "radial-gradient(circle, rgba(123,63,244,0.18) 0%, transparent 60%)", pointerEvents: "none" }} />
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, position: "relative" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "rgba(123,63,244,0.20)", border: "0.5px solid rgba(123,63,244,0.4)" }}>
        <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: T.VIOLET_LIGHT }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: T.VIOLET_LIGHT, letterSpacing: "1.4px", textTransform: "uppercase", fontFamily: FONT }}>Edullent AI</span>
      </div>
    </div>
    <div style={{ marginBottom: 18, position: "relative" }}>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "2px", color: "rgba(255,255,255,0.55)", margin: "0 0 8px", textTransform: "uppercase", fontFamily: FONT }}>Predicted next week</p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-3.5px", lineHeight: 0.9, background: "linear-gradient(180deg, #FFF 0%, rgba(255,255,255,0.7) 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{projectedLabel}</div>
        <div style={{ paddingTop: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", margin: "0 0 2px", fontFamily: FONT }}>{changeLabel}</p>
          {changeSubtitle && <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.55)", margin: 0, fontFamily: FONT }}>{changeSubtitle}</p>}
        </div>
      </div>
    </div>
    <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.12)", overflow: "hidden", position: "relative" }}>
      {scenarios.map((s, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: i < scenarios.length - 1 ? "0.5px solid rgba(255,255,255,0.08)" : "none" }}>
          <span style={{ fontSize: 11, fontWeight: s.highlight ? 800 : 700, color: s.highlight ? T.VIOLET_LIGHT : "rgba(255,255,255,0.7)", fontFamily: FONT }}>{s.label}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: s.highlight ? T.VIOLET_LIGHT : "#FFF", letterSpacing: "-0.2px", fontFamily: FONT }}>{s.outcome}</span>
        </div>
      ))}
      {scenarios.length === 0 && (
        <div style={{ padding: "18px 14px", color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: FONT }}>Forecast generating…</div>
      )}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "0.5px solid rgba(255,255,255,0.10)", position: "relative" }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.5)", fontFamily: FONT }}>Confidence</span>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.10)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${confidence}%`, background: T.VIOLET_LIGHT, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color: T.VIOLET_LIGHT, fontFamily: FONT }}>{confidence}%</span>
    </div>
    {note && <p style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.4)", margin: "8px 0 0", position: "relative", fontFamily: FONT }}>{note}</p>}
  </div>
);

const HeroRankCard: React.FC<{
  rank: number; label: string; composite: number | string; networkAvg: number | string; percentile: number | string;
  trend: "up" | "down"; trendLabel: string; subtitle: string; ctaText: string; onCta: () => void;
}> = ({ rank, label, composite, networkAvg, percentile, trend, trendLabel, subtitle, ctaText, onCta }) => (
  <div style={{ background: T.HERO_GRADIENT, borderRadius: 26, padding: "24px 22px", boxShadow: T.SH_HERO, marginBottom: 22, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: "-40%", right: "-20%", width: "80%", height: "140%", background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18, position: "relative" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,0.10)", border: "0.5px solid rgba(255,255,255,0.15)" }}>
        <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: T.GREEN, boxShadow: `0 0 6px ${T.GREEN}` }} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.4px", color: "#FFF", textTransform: "uppercase", fontFamily: FONT }}>Live</span>
      </div>
      <TrendPill trend={trend} label={trendLabel} />
    </div>
    <div style={{ textAlign: "center", marginBottom: 22, position: "relative" }}>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "2px", color: "rgba(255,255,255,0.55)", margin: "0 0 2px", textTransform: "uppercase", fontFamily: FONT }}>{label}</p>
      <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: "-5px", lineHeight: 0.9, background: "linear-gradient(180deg, #FFF 0%, rgba(255,255,255,0.7) 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>#{rank}</div>
      <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)", margin: "4px 0 0", fontFamily: FONT }}>{subtitle}</p>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "16px 0", borderTop: "0.5px solid rgba(255,255,255,0.12)", borderBottom: "0.5px solid rgba(255,255,255,0.12)", marginBottom: 18, position: "relative" }}>
      {[{ label: "Score", value: composite }, { label: "Network avg", value: networkAvg }, { label: "Percentile", value: `${percentile}%` }].map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div style={{ width: 0.5, background: "rgba(255,255,255,0.12)" }} />}
          <div style={{ flex: 1, textAlign: "center" }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.4px", color: "rgba(255,255,255,0.5)", margin: "0 0 4px", textTransform: "uppercase", fontFamily: FONT }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.6px", color: "#FFF", margin: 0, fontFamily: FONT }}>{s.value}</p>
          </div>
        </React.Fragment>
      ))}
    </div>
    <button onClick={onCta} style={{ width: "100%", padding: 15, background: "#FFF", border: "none", borderRadius: 14, fontSize: 13, color: T.B1, cursor: "pointer", fontFamily: FONT, fontWeight: 800, letterSpacing: "-0.1px", boxShadow: T.SH_BTN }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{ctaText}<ArrowRight size={13} color={T.B1} strokeWidth={2.2} /></span>
    </button>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// SCREEN 1 — PRINCIPAL LEADERBOARD
// ──────────────────────────────────────────────────────────────────────────
const PrincipalLeaderboardScreen: React.FC<{
  net: NetworkLeaderboard; principalName: string; trendLabel: string;
  onInsightsClick: () => void; onBranchLeaderboardClick: () => void;
}> = ({ net, principalName, trendLabel, onInsightsClick, onBranchLeaderboardClick }) => {
  const my = net.myPrincipalRow;
  const percentile = Math.round(((net.totalPrincipals - my.rank) / Math.max(1, net.totalPrincipals - 1)) * 100);
  return (
    <div style={{ background: T.pageBg, padding: "28px 18px 32px", borderRadius: 28, fontFamily: FONT }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <Eyebrow>This Week · {net.ownerNetwork}</Eyebrow>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-1.4px", color: T.T1, margin: "8px 0", lineHeight: 1, fontFamily: FONT }}>Principal Leaderboard</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.12)" }}>
          <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: T.B1 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.B1, fontFamily: FONT }}>{net.totalPrincipals} principals · {net.totalBranches} branches · Live</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 22, padding: 4, borderRadius: 12, background: "rgba(0,85,255,0.06)", border: T.BORDER }}>
        <div style={{ flex: 1, padding: 10, textAlign: "center", borderRadius: 8, background: T.cardBg, boxShadow: "0 1px 3px rgba(0,85,255,0.10)" }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: T.B1, margin: 0, fontFamily: FONT }}>Principals</p>
        </div>
        <button onClick={onBranchLeaderboardClick} style={{ flex: 1, padding: 10, textAlign: "center", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.T3, margin: 0 }}>Branches</p>
        </button>
      </div>

      <HeroRankCard
        rank={my.rank} label="Your rank" composite={my.composite}
        networkAvg={net.networkAvg} percentile={percentile}
        trend="up" trendLabel={trendLabel}
        subtitle={`${principalName} · ${my.branchName}`}
        ctaText={`View detailed insights — why #${my.rank} & how to climb`}
        onCta={onInsightsClick}
      />

      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 24, padding: "14px 12px 8px", boxShadow: T.SH_LG, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 14px", borderBottom: T.BORDER_SOFT }}>
          <Eyebrow>Network rankings</Eyebrow>
          <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: 0, fontFamily: FONT }}>{net.totalPrincipals} principals</p>
        </div>

        {net.principals.map((p, i) => {
          const variant: RankVariant = p.rank <= 3 ? (p.rank as 1 | 2 | 3) : (p.isCurrent ? "user" : "default");
          const size = p.rank <= 3 || p.isCurrent ? 38 : 34;
          if (p.isCurrent) {
            return (
              <div key={p.rank} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 12px", borderRadius: 16, background: "linear-gradient(90deg, rgba(0,85,255,0.08) 0%, rgba(0,85,255,0.04) 100%)", border: T.BORDER_USER, margin: "6px 0", boxShadow: "0 4px 16px rgba(0,85,255,0.18)" }}>
                <RankBadge rank={p.rank} variant="user" size={36} />
                <Avatar initials={p.initials} bg={p.avatarBg} color={p.avatarText} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: T.T1, letterSpacing: "-0.3px", fontFamily: FONT }}>{p.name}</p>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: T.B1, color: "#FFF", textTransform: "uppercase", fontFamily: FONT }}>You</span>
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: T.ORANGE, margin: "1px 0 0", fontFamily: FONT }}>{p.branchName} · {p.context}</p>
                </div>
                <span style={{ fontSize: 19, fontWeight: 800, color: T.B1, letterSpacing: "-0.6px", fontFamily: FONT }}>{p.composite.toFixed(1)}</span>
              </div>
            );
          }
          const contextColor = p.rank <= 2 ? T.GREEN : (p.rank === 4 ? T.ORANGE : T.RED);
          return (
            <div key={p.rank} style={{ display: "flex", alignItems: "center", gap: 14, padding: p.rank <= 3 ? "14px 10px" : "12px 10px", borderRadius: p.rank <= 3 ? 16 : 14, borderTop: i > 0 ? T.BORDER_SOFT : "none" }}>
              <RankBadge rank={p.rank} variant={variant} size={size} />
              <Avatar initials={p.initials} bg={p.avatarBg} color={p.avatarText} size={size} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: p.rank <= 3 ? 15 : 14, fontWeight: 700, margin: 0, color: T.T1, letterSpacing: p.rank <= 3 ? "-0.3px" : "-0.2px", fontFamily: FONT }}>{p.name}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: contextColor, margin: "1px 0 0", fontFamily: FONT }}>{p.branchName} · {p.context}</p>
              </div>
              <span style={{ fontSize: p.rank <= 3 ? 19 : 17, fontWeight: 800, color: T.T1, letterSpacing: "-0.5px", fontFamily: FONT }}>{p.composite.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 500, color: T.T4, margin: 0, fontFamily: FONT }}>Live · powered by Edullent AI</p>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// SCREEN 2 — BRANCH LEADERBOARD
// ──────────────────────────────────────────────────────────────────────────
const BranchLeaderboardScreen: React.FC<{
  net: NetworkLeaderboard; trendLabel: string;
  onBranchInsightsClick: () => void; onPrincipalLeaderboardClick: () => void;
}> = ({ net, trendLabel, onBranchInsightsClick, onPrincipalLeaderboardClick }) => {
  const my = net.myBranchRow;
  const percentile = Math.round(((net.totalBranches - my.rank) / Math.max(1, net.totalBranches - 1)) * 100);
  return (
    <div style={{ background: T.pageBg, padding: "28px 18px 32px", borderRadius: 28, fontFamily: FONT }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <Eyebrow>This Week · {net.ownerNetwork}</Eyebrow>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-1.4px", color: T.T1, margin: "8px 0", lineHeight: 1, fontFamily: FONT }}>Branch Leaderboard</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(0,85,255,0.08)", border: "0.5px solid rgba(0,85,255,0.12)" }}>
          <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: T.B1 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.B1, fontFamily: FONT }}>{net.totalBranches} branches · {net.totalStudents.toLocaleString()} students · {net.totalTeachers} teachers</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 22, padding: 4, borderRadius: 12, background: "rgba(0,85,255,0.06)", border: T.BORDER }}>
        <button onClick={onPrincipalLeaderboardClick} style={{ flex: 1, padding: 10, textAlign: "center", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.T3, margin: 0 }}>Principals</p>
        </button>
        <div style={{ flex: 1, padding: 10, textAlign: "center", borderRadius: 8, background: T.cardBg, boxShadow: "0 1px 3px rgba(0,85,255,0.10)" }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: T.B1, margin: 0, fontFamily: FONT }}>Branches</p>
        </div>
      </div>

      <HeroRankCard
        rank={my.rank} label="Branch rank" composite={my.composite}
        networkAvg={net.networkAvg} percentile={percentile}
        trend="up" trendLabel={trendLabel}
        subtitle={`${my.name} · ${my.students} students`}
        ctaText="View branch deep dive — teacher & student insights"
        onCta={onBranchInsightsClick}
      />

      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 24, padding: "14px 12px 8px", boxShadow: T.SH_LG, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 14px", borderBottom: T.BORDER_SOFT }}>
          <Eyebrow>All branches</Eyebrow>
          <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: 0, fontFamily: FONT }}>Tap your branch for deep dive</p>
        </div>

        {net.branches.map((b, i) => {
          const variant: RankVariant = b.rank <= 3 ? (b.rank as 1 | 2 | 3) : (b.isCurrent ? "user" : "default");
          const size = b.rank <= 3 || b.isCurrent ? 38 : 34;
          const contextColor = b.rank <= 2 ? T.GREEN : (b.isCurrent ? T.ORANGE : (b.rank === 4 ? T.ORANGE : T.RED));
          if (b.isCurrent) {
            return (
              <div key={b.rank} onClick={onBranchInsightsClick} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 12px", borderRadius: 16, background: "linear-gradient(90deg, rgba(0,85,255,0.08) 0%, rgba(0,85,255,0.04) 100%)", border: T.BORDER_USER, margin: "6px 0", boxShadow: "0 4px 16px rgba(0,85,255,0.18)", cursor: "pointer" }}>
                <RankBadge rank={b.rank} variant="user" size={36} />
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: b.avatarBg, color: b.avatarText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0, fontFamily: FONT }}>{b.initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: T.T1, fontFamily: FONT }}>{b.name}</p>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: T.B1, color: "#FFF", textTransform: "uppercase", fontFamily: FONT }}>Your branch</span>
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: T.ORANGE, margin: "1px 0 0", fontFamily: FONT }}>{b.students} students · {b.context}</p>
                </div>
                <span style={{ fontSize: 19, fontWeight: 800, color: T.B1, fontFamily: FONT }}>{b.composite.toFixed(1)}</span>
              </div>
            );
          }
          return (
            <div key={b.rank} style={{ display: "flex", alignItems: "center", gap: 14, padding: b.rank <= 3 ? "14px 10px" : "12px 10px", borderRadius: b.rank <= 3 ? 16 : 14, borderTop: i > 0 ? T.BORDER_SOFT : "none" }}>
              <RankBadge rank={b.rank} variant={variant} size={size} />
              <div style={{ width: size, height: size, borderRadius: "50%", background: b.avatarBg, color: b.avatarText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size > 36 ? 14 : 12, flexShrink: 0, fontFamily: FONT }}>{b.initial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: b.rank <= 3 ? 15 : 14, fontWeight: 700, margin: 0, color: T.T1, fontFamily: FONT }}>{b.name}</p>
                <p style={{ fontSize: 11, fontWeight: 500, color: contextColor, margin: "1px 0 0", fontFamily: FONT }}>{b.students} students · {b.context}</p>
              </div>
              <span style={{ fontSize: b.rank <= 3 ? 19 : 17, fontWeight: 800, color: b.rank === net.totalBranches ? T.RED : T.T1, fontFamily: FONT }}>{b.composite.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 500, color: T.T4, margin: 0, fontFamily: FONT }}>Live · powered by Edullent AI</p>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// SCREEN 3 — PRINCIPAL INSIGHTS
// ──────────────────────────────────────────────────────────────────────────
const PrincipalInsightsScreen: React.FC<{
  net: NetworkLeaderboard; branch: BranchComposite; principalName: string;
  insights: AIInsightsResult | null; insightsLoading: boolean; insightsError: string | null;
  schoolId: string; onBack: () => void;
}> = ({ net, branch, principalName, insights, insightsLoading, insightsError, schoolId, onBack }) => {
  const my = net.myPrincipalRow;
  const top = net.principals[0];
  const trajectory = useMemo(() => buildRankTrajectory(my.rank, schoolId, net.totalPrincipals), [my.rank, schoolId, net.totalPrincipals]);
  const compContrib = {
    studentAvg: { value: branch.studentsAvg, weight: 0.40, contribution: branch.studentsAvg * 0.40 },
    improvement: { value: branch.improvement, weight: 0.25, contribution: branch.improvement * 0.25 },
    teacherAvg: { value: branch.teachersAvg, weight: 0.20, contribution: branch.teachersAvg * 0.20 },
    activity: { value: branch.improvement, weight: 0.15, contribution: branch.improvement * 0.15 },
  };
  const totalCompositeApprox = Math.round(
    (compContrib.studentAvg.contribution + compContrib.improvement.contribution +
     compContrib.teacherAvg.contribution + compContrib.activity.contribution) * 10) / 10;

  const at = branch.studentClusters.reduce((a, c) => a + c.atRisk, 0);
  const critical = branch.studentClusters[0];

  return (
    <div style={{ background: T.pageBg, padding: "20px 16px 32px", borderRadius: 28, fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "0 4px" }}>
        <BackButton label="Leaderboard" onClick={onBack} />
        <Eyebrow>Principal insights</Eyebrow>
      </div>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1.4px", color: T.T1, margin: "0 0 6px", lineHeight: 1, fontFamily: FONT }}>Your deep dive</h1>
        <p style={{ fontSize: 13, fontWeight: 500, color: T.T3, margin: 0, fontFamily: FONT }}>{principalName} · {my.branchName} · {branch.totalStudents} students</p>
      </div>

      <div style={{ background: T.HERO_GRADIENT, borderRadius: 22, padding: "18px 20px", boxShadow: T.SH_HERO, marginBottom: 32, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40%", right: "-20%", width: "80%", height: "140%", background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", gap: 14, alignItems: "center", position: "relative" }}>
          <div><p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.6px", color: "rgba(255,255,255,0.55)", margin: "0 0 2px", textTransform: "uppercase", fontFamily: FONT }}>Network rank</p><p style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1.6px", color: "#FFF", margin: 0, lineHeight: 1, fontFamily: FONT }}>#{my.rank}</p></div>
          <div style={{ width: 0.5, alignSelf: "stretch", background: "rgba(255,255,255,0.15)" }} />
          <div><p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.6px", color: "rgba(255,255,255,0.55)", margin: "0 0 2px", textTransform: "uppercase", fontFamily: FONT }}>Composite</p><p style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1px", color: "#FFF", margin: 0, lineHeight: 1, fontFamily: FONT }}>{my.composite.toFixed(1)}</p></div>
          <div style={{ flex: 1 }} />
          <TrendPill trend="up" label="Live" />
        </div>
      </div>

      <SectionHead eyebrow="01 · Composite breakdown" title={`How ${my.composite.toFixed(1)} builds up`} subtitle="4 weighted components — principal level" />
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32 }}>
        {([
          { key: "studentAvg",  label: "Branch student avg",  sub: "40% weight · avg of all students in branch", weak: branch.studentsAvg < net.networkAvg - 4 },
          { key: "improvement", label: "Branch improvement",  sub: "25% weight · platform engagement & momentum",  weak: branch.improvement < 75 },
          { key: "teacherAvg",  label: "Branch teacher avg",  sub: "20% weight · avg of all teacher composites",   weak: branch.teachersAvg < 78 },
          { key: "activity",    label: "Principal activity",  sub: "15% weight · reviews, observations, meetings", weak: false },
        ] as const).map(row => {
          const data = compContrib[row.key];
          const isWeak = row.weak;
          const isStrong = !isWeak && data.value >= 85;
          const barColor = isStrong ? `linear-gradient(90deg, ${T.GREEN} 0%, ${T.GREEN_DEEP} 100%)` : isWeak ? `linear-gradient(90deg, ${T.ORANGE} 0%, ${T.RED} 100%)` : T.B1;
          const valColor = isStrong ? T.GREEN : isWeak ? T.RED : T.T1;
          return (
            <div key={row.key} style={{ marginBottom: 18, ...(isWeak ? { padding: 12, borderRadius: 12, background: "rgba(255,69,58,0.06)", border: "0.5px solid rgba(255,69,58,0.15)" } : {}) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: T.T1, margin: 0, letterSpacing: "-0.2px", fontFamily: FONT }}>{row.label}</p>
                  <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: "1px 0 0", fontFamily: FONT }}>{row.sub}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: valColor, margin: 0, letterSpacing: "-0.5px", lineHeight: 1, fontFamily: FONT }}>{data.value.toFixed(1)}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: valColor, margin: "1px 0 0", fontFamily: FONT }}>→ contributes {data.contribution.toFixed(1)}</p>
                </div>
              </div>
              <div style={{ height: 6, background: "rgba(0,85,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, data.value)}%`, background: barColor, borderRadius: 999 }} />
              </div>
              {isWeak && <p style={{ fontSize: 11, fontWeight: 700, color: T.RED, margin: "6px 0 0", fontFamily: FONT }}>Biggest leverage area — fixing this = biggest rank jump</p>}
            </div>
          );
        })}
        <div style={{ padding: "14px 0 0", borderTop: T.BORDER_SOFT, display: "flex", justifyContent: "space-between" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: T.T3, margin: 0, fontFamily: FONT }}>Total composite</p>
          <p style={{ fontSize: 26, fontWeight: 800, color: T.T1, margin: 0, letterSpacing: "-0.7px", fontFamily: FONT }}>{totalCompositeApprox.toFixed(1)}</p>
        </div>
      </div>

      <SectionHead eyebrow="02 · Diagnosis" title={`Why you're at #${my.rank}`} subtitle="AI analysis from your live branch data" />
      {insightsError ? (
        <div style={{ padding: 16, marginBottom: 32, background: "rgba(255,69,58,0.06)", border: "0.5px solid rgba(255,69,58,0.20)", borderRadius: 16, color: T.RED, fontSize: 13, fontFamily: FONT }}>
          AI diagnosis unavailable: {insightsError}
        </div>
      ) : insightsLoading ? (
        <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32, display: "flex", alignItems: "center", gap: 12 }}>
          <Loader2 size={16} color={T.VIOLET} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13, color: T.T3, fontFamily: FONT }}>Generating AI diagnosis from {branch.totalTeachers} teachers + {branch.totalStudents} students…</span>
        </div>
      ) : (
        <DiagnosisCard items={insights?.diagnosis ?? []} />
      )}

      <SectionHead eyebrow="03 · Teacher analysis" title="Your top 3 and bottom 3" subtitle="Biggest lever to climb — teacher quality" />
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32 }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", color: T.GREEN, margin: "0 0 12px", textTransform: "uppercase", fontFamily: FONT }}>Top performers</p>
        {branch.topTeachers.length === 0 && <p style={{ fontSize: 12, color: T.T3, fontFamily: FONT }}>No scored teachers yet.</p>}
        {branch.topTeachers.map(t => {
          const initials = (t.teacher.name || "?")
            .split(/\s+/).map(n => n[0]).join("").slice(0, 2).toUpperCase();
          return (
            <div key={t.teacher.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <Avatar initials={initials} bg="rgba(0,200,83,0.12)" color="#00C853" size={34} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: T.T1, fontFamily: FONT }}>{t.teacher.name || "Unnamed"}</p>
                <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: 0, fontFamily: FONT }}>{(t.teacher.subjects || []).slice(0, 2).join(", ") || "—"}</p>
              </div>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.GREEN, fontFamily: FONT }}>{t.composite.toFixed(1)}</span>
            </div>
          );
        })}
        <div style={{ height: 0.5, background: "rgba(255,69,58,0.25)", margin: "14px 0", borderRadius: 1 }} />
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", color: T.RED, margin: "0 0 12px", textTransform: "uppercase", fontFamily: FONT }}>Need coaching urgently</p>
        {branch.weakTeachers.length === 0 && <p style={{ fontSize: 12, color: T.T3, fontFamily: FONT }}>No teachers below 70 — strong tier.</p>}
        {branch.weakTeachers.slice(0, 3).map(t => {
          const initials = (t.teacher.name || "?")
            .split(/\s+/).map(n => n[0]).join("").slice(0, 2).toUpperCase();
          const issue = t.reasons[0] ? `${t.reasons[0].label} ${t.reasons[0].value}` : "Below threshold";
          return (
            <div key={t.teacher.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,69,58,0.05)", border: "0.5px solid rgba(255,69,58,0.15)" }}>
              <Avatar initials={initials} bg="rgba(255,69,58,0.10)" color="#C71F2D" size={34} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: T.T1, fontFamily: FONT }}>{t.teacher.name || "Unnamed"} · {(t.teacher.subjects || ["—"])[0]}</p>
                <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: "1px 0 0", fontFamily: FONT }}>{issue}</p>
              </div>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.RED, fontFamily: FONT }}>{t.composite.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      <SectionHead eyebrow="04 · Student analysis" title={`${at} at-risk across ${branch.totalStudents} students`} subtitle={critical ? `${critical.className} is most critical` : "Across all classes"} />
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
          <div style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "rgba(255,69,58,0.06)", border: "0.5px solid rgba(255,69,58,0.15)" }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.4px", color: T.T4, margin: "0 0 4px", textTransform: "uppercase", fontFamily: FONT }}>At-risk</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: T.RED, margin: 0, letterSpacing: "-0.8px", fontFamily: FONT }}>{at}</p>
          </div>
          <div style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "rgba(0,85,255,0.06)", border: T.BORDER }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.4px", color: T.T4, margin: "0 0 4px", textTransform: "uppercase", fontFamily: FONT }}>On track</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: T.B1, margin: 0, letterSpacing: "-0.8px", fontFamily: FONT }}>{Math.max(0, branch.totalStudents - at)}</p>
          </div>
          <div style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "rgba(52,199,89,0.06)", border: "0.5px solid rgba(52,199,89,0.15)" }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.4px", color: T.T4, margin: "0 0 4px", textTransform: "uppercase", fontFamily: FONT }}>Top tier</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: T.GREEN, margin: 0, letterSpacing: "-0.8px", fontFamily: FONT }}>{Math.round(branch.totalStudents * Math.max(0.1, branch.studentsAvg / 200))}</p>
          </div>
        </div>
        {critical && critical.severity === "critical" && (
          <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,69,58,0.06)", border: "1px solid rgba(255,69,58,0.20)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={14} color={T.RED} strokeWidth={2.2} />
              <p style={{ fontSize: 13, fontWeight: 800, color: T.T1, margin: 0, fontFamily: FONT }}>Critical: Class {critical.className} — {critical.atRisk} of {critical.total} at-risk ({critical.pct}%)</p>
            </div>
            <p style={{ fontSize: 12, fontWeight: 500, color: T.T3, margin: 0, lineHeight: 1.5, fontFamily: FONT }}>{critical.teacherName}'s class · avg {critical.avg}. {critical.issues.join(" · ")}.</p>
          </div>
        )}
      </div>

      <SectionHead eyebrow="05 · Trajectory" title="Your 8-week rank journey" subtitle={`Currently #${my.rank}`} />
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: "20px 16px", boxShadow: T.SH_LG, marginBottom: 32 }}>
        <TrajectoryChart data={trajectory} valueKey="rank" isRank />
      </div>

      <SectionHead eyebrow="06 · The gap" title={`You vs ${top.name} (#1)`} subtitle={`Where the ${(top.composite - my.composite).toFixed(1)}-point gap lives`} />
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "linear-gradient(135deg, rgba(255,170,0,0.08) 0%, rgba(255,136,0,0.04) 100%)", border: "0.5px solid rgba(255,170,0,0.18)" }}>
            <RankBadge rank={1} variant={1} size={28} />
            <p style={{ fontSize: 12, fontWeight: 700, color: T.T1, margin: "6px 0 4px", fontFamily: FONT }}>{top.name}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: T.T1, margin: 0, fontFamily: FONT }}>{top.composite.toFixed(1)}</p>
          </div>
          <div style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "linear-gradient(135deg, rgba(0,85,255,0.10) 0%, rgba(17,102,255,0.05) 100%)", border: `1.5px solid ${T.B1}` }}>
            <RankBadge rank={my.rank} variant="user" size={28} />
            <p style={{ fontSize: 12, fontWeight: 700, color: T.T1, margin: "6px 0 4px", fontFamily: FONT }}>You</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: T.B1, margin: 0, fontFamily: FONT }}>{my.composite.toFixed(1)}</p>
          </div>
        </div>
      </div>

      <SectionHead eyebrow="07 · Your action plan" title="AI-generated principal moves" subtitle="Focus on teachers → fixes students automatically" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
        {(insights?.actions ?? []).map(a => <ActionCard key={a.id} action={a} />)}
        {!insights?.actions?.length && !insightsLoading && (
          <div style={{ padding: 18, background: T.cardBg, borderRadius: 18, border: T.BORDER, textAlign: "center", color: T.T3, fontFamily: FONT, fontSize: 13 }}>
            No action plan yet. Re-open this screen once AI has finished generating.
          </div>
        )}
        {insightsLoading && (
          <div style={{ padding: 18, background: T.cardBg, borderRadius: 18, border: T.BORDER, display: "flex", alignItems: "center", gap: 10 }}>
            <Loader2 size={14} color={T.B1} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, color: T.T3, fontFamily: FONT }}>AI is drafting your action plan…</span>
          </div>
        )}
      </div>

      <SectionHead eyebrow="08 · Forecast" title="If you complete this plan" subtitle="Your projected network rank" />
      {insights?.forecast && (
        <ForecastCard {...insights.forecast} />
      )}
      {insightsLoading && !insights?.forecast && (
        <div style={{ padding: 18, background: T.cardBg, borderRadius: 18, border: T.BORDER, display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 size={14} color={T.B1} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13, color: T.T3, fontFamily: FONT }}>Forecast generating…</span>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// SCREEN 4 — BRANCH INSIGHTS
// ──────────────────────────────────────────────────────────────────────────
const BranchInsightsScreen: React.FC<{
  net: NetworkLeaderboard; branch: BranchComposite;
  insights: AIInsightsResult | null; insightsLoading: boolean; insightsError: string | null;
  schoolId: string; onBack: () => void;
}> = ({ net, branch, insights, insightsLoading, insightsError, schoolId, onBack }) => {
  const my = net.myBranchRow;
  const top = net.branches[0];
  const trajectory = useMemo(() => buildTrajectory(branch.composite, schoolId), [branch.composite, schoolId]);

  return (
    <div style={{ background: T.pageBg, padding: "20px 16px 32px", borderRadius: 28, fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "0 4px" }}>
        <BackButton label="Branch rankings" onClick={onBack} />
        <Eyebrow>Branch deep dive</Eyebrow>
      </div>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-1.4px", color: T.T1, margin: "0 0 6px", lineHeight: 1, fontFamily: FONT }}>{my.name}</h1>
        <p style={{ fontSize: 13, fontWeight: 500, color: T.T3, margin: 0, fontFamily: FONT }}>Branch rank #{my.rank} · {branch.totalStudents} students · {branch.totalTeachers} teachers · {branch.totalSections} sections</p>
      </div>

      <div style={{ background: T.HERO_GRADIENT, borderRadius: 22, padding: "18px 20px", boxShadow: T.SH_HERO, marginBottom: 32, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40%", right: "-20%", width: "80%", height: "140%", background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", gap: 14, alignItems: "center", position: "relative" }}>
          <div><p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.6px", color: "rgba(255,255,255,0.55)", margin: "0 0 2px", textTransform: "uppercase", fontFamily: FONT }}>Branch score</p><p style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1.6px", color: "#FFF", margin: 0, lineHeight: 1, fontFamily: FONT }}>{my.composite.toFixed(1)}</p></div>
          <div style={{ width: 0.5, alignSelf: "stretch", background: "rgba(255,255,255,0.15)" }} />
          <div><p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.6px", color: "rgba(255,255,255,0.55)", margin: "0 0 2px", textTransform: "uppercase", fontFamily: FONT }}>Network rank</p><p style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1.4px", color: "#FFF", margin: 0, lineHeight: 1, fontFamily: FONT }}>#{my.rank}<span style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>/{net.totalBranches}</span></p></div>
          <div style={{ flex: 1 }} />
          <TrendPill trend="up" label="Live" />
        </div>
      </div>

      <SectionHead eyebrow="01 · Branch breakdown" title={`Where ${my.name} stands`} subtitle="Branch metrics vs network average" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 32 }}>
        <MetricCard label="Students avg" value={branch.studentsAvg} vs={`vs net ${net.networkAvg}`} severity={branch.studentsAvg < net.networkAvg ? "weak" : "strong"} />
        <MetricCard label="Teachers avg" value={branch.teachersAvg} vs={`vs top ${top.composite.toFixed(0)}`} severity={branch.teachersAvg < 78 ? "critical" : "okay"} />
        <MetricCard label="Improvement" value={branch.improvement} vs="Engagement proxy" severity={branch.improvement >= 80 ? "strong" : "okay"} />
        <MetricCard label="At-risk %" value={branch.atRiskPct} suffix="%" vs="of students" severity={branch.atRiskPct > 6 ? "weak" : "okay"} />
      </div>

      <SectionHead eyebrow="02 · AI diagnosis" title={`Why ${my.name} is at #${my.rank}`} subtitle={`Real data from ${branch.totalTeachers} teachers + ${branch.totalStudents} students`} />
      {insightsError ? (
        <div style={{ padding: 16, marginBottom: 32, background: "rgba(255,69,58,0.06)", border: "0.5px solid rgba(255,69,58,0.20)", borderRadius: 16, color: T.RED, fontSize: 13, fontFamily: FONT }}>
          AI diagnosis unavailable: {insightsError}
        </div>
      ) : insightsLoading ? (
        <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32, display: "flex", alignItems: "center", gap: 12 }}>
          <Loader2 size={16} color={T.VIOLET} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13, color: T.T3, fontFamily: FONT }}>Analysing teachers + student clusters…</span>
        </div>
      ) : (
        <DiagnosisCard items={insights?.diagnosis ?? []} />
      )}

      <SectionHead eyebrow="03 · Teacher analysis" title={`${branch.totalTeachers} teachers · full breakdown`} subtitle="Performance tiers with real composite + specific issues" />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        <div style={{ background: "linear-gradient(135deg, rgba(52,199,89,0.06) 0%, rgba(0,200,83,0.03) 100%)", border: "0.5px solid rgba(52,199,89,0.20)", borderRadius: 18, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 10, background: `linear-gradient(135deg, ${T.GREEN} 0%, ${T.GREEN_DEEP} 100%)`, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: FONT }}>{branch.topTeachers.length}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: T.T1, margin: 0, fontFamily: FONT }}>Top performers · 85+ tier</p>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: "1px 0 0", fontFamily: FONT }}>Leverage for peer teaching</p>
            </div>
            {branch.topTeachers.length > 0 && (
              <span style={{ fontSize: 18, fontWeight: 800, color: T.GREEN, fontFamily: FONT }}>
                avg {(branch.topTeachers.reduce((a, b) => a + b.composite, 0) / branch.topTeachers.length).toFixed(1)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {branch.topTeachers.map(t => (
              <span key={t.teacher.id} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(52,199,89,0.12)", color: "#00833A", fontFamily: FONT }}>
                {t.teacher.name} {t.composite.toFixed(1)}
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 18, padding: 16, boxShadow: T.SH }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 10, background: `linear-gradient(135deg, ${T.B1} 0%, ${T.B2} 100%)`, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: FONT }}>{branch.midTeachers.length}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: T.T1, margin: 0, fontFamily: FONT }}>Middle range · 70-85 tier</p>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: "1px 0 0", fontFamily: FONT }}>On track — monitor monthly</p>
            </div>
            {branch.midTeachers.length > 0 && (
              <span style={{ fontSize: 18, fontWeight: 800, color: T.B1, fontFamily: FONT }}>
                avg {(branch.midTeachers.reduce((a, b) => a + b.composite, 0) / branch.midTeachers.length).toFixed(1)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {branch.midTeachers.slice(0, 6).map(t => (
              <span key={t.teacher.id} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(0,85,255,0.08)", color: "#003ACC", fontFamily: FONT }}>
                {t.teacher.name} {t.composite.toFixed(1)}
              </span>
            ))}
            {branch.midTeachers.length > 6 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(0,85,255,0.06)", color: T.T3, fontFamily: FONT }}>
                +{branch.midTeachers.length - 6} more
              </span>
            )}
          </div>
        </div>

        <div style={{ background: "linear-gradient(135deg, rgba(255,69,58,0.07) 0%, rgba(255,136,0,0.04) 100%)", border: "0.5px solid rgba(255,69,58,0.25)", borderRadius: 18, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 10, background: "linear-gradient(135deg, #FF453A 0%, #E5304A 100%)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: FONT }}>{branch.weakTeachers.length}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: T.T1, margin: 0, fontFamily: FONT }}>Need coaching · &lt; 70 tier</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: T.RED, margin: "1px 0 0", fontFamily: FONT }}>Dragging branch — every 5-pt improvement = +0.5 branch score</p>
            </div>
            {branch.weakTeachers.length > 0 && (
              <span style={{ fontSize: 18, fontWeight: 800, color: T.RED, fontFamily: FONT }}>
                avg {(branch.weakTeachers.reduce((a, b) => a + b.composite, 0) / branch.weakTeachers.length).toFixed(1)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {branch.weakTeachers.slice(0, 6).map(t => {
              const initials = (t.teacher.name || "?").split(/\s+/).map(n => n[0]).join("").slice(0, 2).toUpperCase();
              const subj = (t.teacher.subjects || ["—"])[0];
              const issue = t.reasons.slice(0, 2).map(r => `${r.label} ${r.value}`).join(" · ") || "Below threshold";
              return (
                <div key={t.teacher.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.70)", borderRadius: 12, border: "0.5px solid rgba(255,69,58,0.15)" }}>
                  <Avatar initials={initials} bg="rgba(255,69,58,0.10)" color="#C71F2D" size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.T1, margin: 0, fontFamily: FONT }}>{t.teacher.name || "Unnamed"} · {subj}</p>
                    <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: "1px 0 0", fontFamily: FONT }}>{issue}</p>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: T.RED, fontFamily: FONT }}>{t.composite.toFixed(1)}</span>
                </div>
              );
            })}
            {branch.weakTeachers.length === 0 && (
              <p style={{ fontSize: 12, fontWeight: 500, color: T.T3, margin: 0, padding: "0 4px", fontFamily: FONT }}>No teachers below 70 — strong tier overall.</p>
            )}
          </div>
        </div>
      </div>

      <SectionHead eyebrow="04 · Student analysis" title={`${branch.totalStudents} students · class-wise clusters`} subtitle="At-risk mapped to specific teachers + classes" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        {branch.studentClusters.length === 0 && (
          <div style={{ padding: 18, background: T.cardBg, border: T.BORDER, borderRadius: 16, color: T.T3, fontSize: 13, fontFamily: FONT }}>
            No class-level data yet — once test scores are uploaded for each class, clusters will appear here.
          </div>
        )}
        {branch.studentClusters.map((cluster, i) => {
          const isCritical = cluster.severity === "critical";
          const isWarning = cluster.severity === "warning";
          const isOkay = cluster.severity === "okay";
          const bg = isCritical ? "linear-gradient(90deg, rgba(255,69,58,0.08) 0%, rgba(255,69,58,0.04) 100%)" : isWarning ? "linear-gradient(90deg, rgba(255,136,0,0.07) 0%, rgba(255,136,0,0.03) 100%)" : T.cardBg;
          const border = isCritical ? "1px solid rgba(255,69,58,0.30)" : isWarning ? "0.5px solid rgba(255,136,0,0.25)" : T.BORDER;
          const avgColor = isCritical ? T.RED : isWarning ? T.ORANGE : T.B1;
          const labelColor = isCritical ? T.RED : isWarning ? T.ORANGE : T.T3;
          return (
            <div key={i} style={{ background: bg, border, borderRadius: 16, padding: 14, boxShadow: isOkay ? T.SH : "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: cluster.issues.length ? 8 : 0 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: T.T1, margin: 0, fontFamily: FONT }}>Class {cluster.className}{isCritical ? " ⚠ Critical" : isWarning ? " ⚠ Concern" : ""}</p>
                  <p style={{ fontSize: 11, fontWeight: isOkay ? 500 : 700, color: labelColor, margin: "1px 0 0", fontFamily: FONT }}>
                    {cluster.atRisk} at-risk of {cluster.total} ({cluster.pct}%) · {cluster.teacherName}'s class
                  </p>
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: avgColor, fontFamily: FONT }}>avg {cluster.avg}</span>
              </div>
              {cluster.issues.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {cluster.issues.map(issue => (
                    <span key={issue} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: isCritical ? "rgba(255,69,58,0.10)" : "rgba(255,136,0,0.12)", color: isCritical ? T.RED_DEEP : T.ORANGE_DEEP, fontFamily: FONT }}>{issue}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SectionHead eyebrow="05 · Trajectory" title="Branch score: 8 weeks" subtitle={`Now at ${branch.composite.toFixed(1)}`} />
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: "20px 16px", boxShadow: T.SH_LG, marginBottom: 32 }}>
        <TrajectoryChart data={trajectory} valueKey="value" />
      </div>

      <SectionHead eyebrow="06 · The gap" title={`${my.name} vs ${top.name} (#1)`} subtitle={`Where the ${(top.composite - my.composite).toFixed(1)}-point gap lives`} />
      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 22, padding: 22, boxShadow: T.SH_LG, marginBottom: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "linear-gradient(135deg, rgba(255,170,0,0.08) 0%, rgba(255,136,0,0.04) 100%)", border: "0.5px solid rgba(255,170,0,0.18)" }}>
            <RankBadge rank={1} variant={1} size={28} />
            <p style={{ fontSize: 12, fontWeight: 700, color: T.T1, margin: "6px 0 4px", fontFamily: FONT }}>{top.name} (#1)</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: T.T1, margin: 0, fontFamily: FONT }}>{top.composite.toFixed(1)}</p>
          </div>
          <div style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "linear-gradient(135deg, rgba(0,85,255,0.10) 0%, rgba(17,102,255,0.05) 100%)", border: `1.5px solid ${T.B1}` }}>
            <RankBadge rank={my.rank} variant="user" size={28} />
            <p style={{ fontSize: 12, fontWeight: 700, color: T.T1, margin: "6px 0 4px", fontFamily: FONT }}>{my.name} (#{my.rank})</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: T.B1, margin: 0, fontFamily: FONT }}>{my.composite.toFixed(1)}</p>
          </div>
        </div>
      </div>

      <SectionHead eyebrow="07 · Action plan" title="Six priority interventions" subtitle="AI-generated · teacher-specific + class-specific" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
        {(insights?.actions ?? []).map(a => <ActionCard key={a.id} action={a} />)}
        {!insights?.actions?.length && !insightsLoading && (
          <div style={{ padding: 18, background: T.cardBg, borderRadius: 18, border: T.BORDER, textAlign: "center", color: T.T3, fontFamily: FONT, fontSize: 13 }}>
            Action plan will appear here once AI has finished generating.
          </div>
        )}
        {insightsLoading && (
          <div style={{ padding: 18, background: T.cardBg, borderRadius: 18, border: T.BORDER, display: "flex", alignItems: "center", gap: 10 }}>
            <Loader2 size={14} color={T.B1} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, color: T.T3, fontFamily: FONT }}>AI is drafting branch interventions…</span>
          </div>
        )}
      </div>

      <SectionHead eyebrow="08 · Forecast" title="If you implement this plan" subtitle="Projected branch rank next week" />
      {insights?.forecast && <ForecastCard {...insights.forecast} />}
      {insightsLoading && !insights?.forecast && (
        <div style={{ padding: 18, background: T.cardBg, borderRadius: 18, border: T.BORDER, display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 size={14} color={T.B1} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13, color: T.T3, fontFamily: FONT }}>Forecast generating…</span>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// MAIN PAGE — state-based router (matches the locked spec)
// ──────────────────────────────────────────────────────────────────────────
type Screen = "principal-leaderboard" | "branch-leaderboard" | "principal-insights" | "branch-insights";

const PrincipalNetworkPage: React.FC = () => {
  const { loading, branch, schoolId, userData } = useBranchLiveData();
  const [screen, setScreen] = useState<Screen>("principal-leaderboard");

  const principalName = (userData?.name as string) || (userData?.fullName as string) || "Principal";
  const branchName = (userData?.branchName as string) || (userData?.schoolName as string) || "Your Branch";
  const ownerNetwork = (userData?.networkName as string) || (userData?.organisationName as string) || "Edullent Network";

  const net = useMemo<NetworkLeaderboard | null>(() => {
    if (!branch) return null;
    return buildNetworkLeaderboard(branch, principalName, branchName, ownerNetwork);
  }, [branch, principalName, branchName, ownerNetwork]);

  // Principal AI insights
  const [pInsights, setPInsights] = useState<AIInsightsResult | null>(null);
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState<string | null>(null);

  // Branch AI insights
  const [bInsights, setBInsights] = useState<AIInsightsResult | null>(null);
  const [bLoading, setBLoading] = useState(false);
  const [bError, setBError] = useState<string | null>(null);

  // Trigger AI fetches lazily when entering the corresponding screen
  useEffect(() => {
    if (screen !== "principal-insights" || !net || !branch) return;
    if (pInsights || pLoading) return;
    setPLoading(true);
    setPError(null);
    fetchPrincipalInsights({
      principalName,
      branchName,
      ownerNetwork,
      rank: net.myPrincipalRow.rank,
      totalPrincipals: net.totalPrincipals,
      composite: net.myPrincipalRow.composite,
      networkAvg: net.networkAvg,
      branch,
      topPrincipal: { name: net.principals[0].name, branch: net.principals[0].branchName, composite: net.principals[0].composite },
    })
      .then(setPInsights)
      .catch(err => setPError(err?.message || "AI request failed"))
      .finally(() => setPLoading(false));
  }, [screen, net, branch, pInsights, pLoading, principalName, branchName, ownerNetwork]);

  useEffect(() => {
    if (screen !== "branch-insights" || !net || !branch) return;
    if (bInsights || bLoading) return;
    setBLoading(true);
    setBError(null);
    fetchBranchInsights({
      branchName,
      ownerNetwork,
      rank: net.myBranchRow.rank,
      totalBranches: net.totalBranches,
      branch,
      networkAvg: net.networkAvg,
      topBranchName: net.branches[0].name,
      topBranchComposite: net.branches[0].composite,
    })
      .then(setBInsights)
      .catch(err => setBError(err?.message || "AI request failed"))
      .finally(() => setBLoading(false));
  }, [screen, net, branch, bInsights, bLoading, branchName, ownerNetwork]);

  if (loading || !branch || !net || !schoolId) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, fontFamily: FONT }}>
        <Loader2 size={28} color={T.B1} style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: 12, fontWeight: 700, color: T.T3, letterSpacing: "1.4px", textTransform: "uppercase" }}>
          Loading your branch data…
        </p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const trendLabel = net.myPrincipalRow.rank <= 2 ? "Holding" : `Up potential`;

  return (
    <div style={{ minHeight: "100vh", background: T.pageBg, padding: "20px 0", fontFamily: FONT }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {screen === "principal-leaderboard" && (
          <PrincipalLeaderboardScreen
            net={net} principalName={principalName} trendLabel={trendLabel}
            onInsightsClick={() => setScreen("principal-insights")}
            onBranchLeaderboardClick={() => setScreen("branch-leaderboard")}
          />
        )}
        {screen === "branch-leaderboard" && (
          <BranchLeaderboardScreen
            net={net} trendLabel={trendLabel}
            onBranchInsightsClick={() => setScreen("branch-insights")}
            onPrincipalLeaderboardClick={() => setScreen("principal-leaderboard")}
          />
        )}
        {screen === "principal-insights" && (
          <PrincipalInsightsScreen
            net={net} branch={branch} principalName={principalName}
            insights={pInsights} insightsLoading={pLoading} insightsError={pError}
            schoolId={schoolId}
            onBack={() => setScreen("principal-leaderboard")}
          />
        )}
        {screen === "branch-insights" && (
          <BranchInsightsScreen
            net={net} branch={branch}
            insights={bInsights} insightsLoading={bLoading} insightsError={bError}
            schoolId={schoolId}
            onBack={() => setScreen("branch-leaderboard")}
          />
        )}
      </div>
    </div>
  );
};

export default PrincipalNetworkPage;
