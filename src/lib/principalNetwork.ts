/**
 * principalNetwork.ts
 * --------------------------------------------------------------------------
 * Data layer for the Principal Network dashboard (Leaderboard + Insights).
 *
 * This app is single-school. To run the locked Network UI we:
 *   1. Compute the principal's REAL branch composite from live Firestore
 *      (teachers + students) via the same scoring model used elsewhere.
 *   2. Generate a synthetic 5-branch peer network with the principal's
 *      branch slotted in by composite. Peer rows are deterministic
 *      (seeded by schoolId) so the same principal sees the same network
 *      week to week.
 *   3. Call /api/ai-insights (existing OpenAI proxy) for diagnosis +
 *      actions on the Insights screens.
 *
 * Synthetic peer rows are clearly typed `isSynthetic: true` so future
 * multi-tenant work can swap them out without touching UI.
 */

import { auth } from "./firebase";
import {
  scoreTeachers,
  TeacherScore,
  TeacherDoc,
  ScoreDoc,
  AttendanceDoc,
  AssignmentDoc,
  TeacherAttendanceDoc,
  TeachingAssignmentDoc,
} from "./teacherScorer";

// ── Types ─────────────────────────────────────────────────────────────────
export interface BranchComposite {
  branchName: string;
  schoolId: string;
  composite: number;       // 0-100
  studentsAvg: number;     // 0-100 — avg student score
  teachersAvg: number;     // 0-100 — avg teacher composite
  improvement: number;     // 0-100 — normalized week-over-week delta proxy
  atRiskPct: number;       // 0-100 — % students with score < 50
  totalStudents: number;
  totalTeachers: number;
  totalSections: number;
  topTeachers: TeacherScore[];     // top 3
  weakTeachers: TeacherScore[];    // bottom 3-6 (composite < 70)
  midTeachers: TeacherScore[];
  studentClusters: StudentCluster[];
}

export interface StudentCluster {
  classId: string;
  className: string;
  teacherName: string;
  atRisk: number;
  total: number;
  pct: number;
  severity: "critical" | "warning" | "okay";
  avg: number;
  issues: string[];
}

export interface NetworkPrincipalRow {
  rank: number;
  name: string;
  initials: string;
  branchName: string;
  composite: number;
  context: string;
  avatarBg: string;
  avatarText: string;
  isCurrent: boolean;
  isSynthetic: boolean;
}

export interface NetworkBranchRow {
  rank: number;
  city: string;
  name: string;
  initial: string;
  students: number;
  composite: number;
  context: string;
  avatarBg: string;
  avatarText: string;
  isCurrent: boolean;
  isSynthetic: boolean;
}

export interface NetworkLeaderboard {
  ownerNetwork: string;
  myPrincipalRow: NetworkPrincipalRow;
  myBranchRow: NetworkBranchRow;
  principals: NetworkPrincipalRow[];
  branches: NetworkBranchRow[];
  networkAvg: number;
  totalPrincipals: number;
  totalBranches: number;
  totalStudents: number;
  totalTeachers: number;
}

// ── Branch composite calculator ───────────────────────────────────────────
export interface ComputeBranchInput {
  branchName: string;
  schoolId: string;
  teachers: TeacherDoc[];
  students: any[];
  scores: ScoreDoc[];
  attendance: AttendanceDoc[];
  assignments: AssignmentDoc[];
  teacherAttendance: TeacherAttendanceDoc[];
  classes: any[];
  teachingAssignments: TeachingAssignmentDoc[];
}

export function computeBranchComposite(input: ComputeBranchInput): BranchComposite {
  const {
    branchName, schoolId, teachers, students,
    scores, attendance, assignments, teacherAttendance,
    classes, teachingAssignments,
  } = input;

  const ranked = scoreTeachers({
    teachers, scores, attendance, assignments,
    teacherAttendance, teachingAssignments,
  });

  const withData = ranked.filter(r => r.testCount > 0 || r.assignments > 0 || r.attendance !== null);

  const teachersAvg = withData.length
    ? withData.reduce((a, b) => a + b.composite, 0) / withData.length
    : 0;

  // Students avg from score docs (each score doc → percent normalized)
  const pctOf = (s: ScoreDoc): number | null => {
    const p = parseFloat(String(s.percentage));
    if (Number.isFinite(p)) return Math.max(0, Math.min(100, p));
    const sc = parseFloat(String(s.score ?? s.marks ?? s.obtainedMarks));
    const mx = parseFloat(String(s.maxScore ?? s.totalMarks ?? s.maxMarks));
    if (Number.isFinite(sc) && Number.isFinite(mx) && mx > 0) {
      return Math.max(0, Math.min(100, (sc / mx) * 100));
    }
    return null;
  };
  const studentScoreMap = new Map<string, number[]>();
  scores.forEach(s => {
    const sid = s.studentId;
    const p = pctOf(s);
    if (!sid || p === null) return;
    if (!studentScoreMap.has(sid)) studentScoreMap.set(sid, []);
    studentScoreMap.get(sid)!.push(p);
  });
  const studentAvgs: number[] = [];
  studentScoreMap.forEach(arr => {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    studentAvgs.push(avg);
  });
  const studentsAvg = studentAvgs.length
    ? studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length
    : 0;

  // At-risk = students whose avg < 50
  const atRiskCount = studentAvgs.filter(a => a < 50).length;
  const atRiskPct = studentAvgs.length ? (atRiskCount / studentAvgs.length) * 100 : 0;

  // Improvement proxy: percentage of teachers with assignments > 0 + activity > 50
  // (we lack week-over-week history in this single-school app; approximate engagement)
  const activeRatio = withData.length ? withData.filter(r => (r.punctuality ?? 0) >= 70 && r.assignments > 0).length / withData.length : 0;
  const improvement = Math.round(60 + activeRatio * 35);

  // Tiers (top/mid/weak)
  const sortedDesc = [...withData].sort((a, b) => b.composite - a.composite);
  const topTeachers = sortedDesc.slice(0, 3);
  const weakTeachers = sortedDesc.filter(t => t.composite < 70).slice(-6);
  const weakIds = new Set(weakTeachers.map(t => t.teacher.id));
  const topIds = new Set(topTeachers.map(t => t.teacher.id));
  const midTeachers = sortedDesc.filter(t => !weakIds.has(t.teacher.id) && !topIds.has(t.teacher.id));

  // Student clusters by class
  const classNameOf = (cid: string) => {
    const c = classes.find((x: any) => x.id === cid);
    if (!c) return cid;
    return c.name || c.className || `${c.grade ?? ""}-${c.section ?? ""}` || cid;
  };
  const teacherOf = (cid: string): string => {
    const ta = teachingAssignments.find((x: any) => x.classId === cid);
    if (!ta) return "—";
    const t = teachers.find((x: any) => x.id === ta.teacherId);
    return t?.name || "—";
  };

  const studentByClass = new Map<string, any[]>();
  students.forEach(st => {
    const cid = (st as any).classId || (st as any).class || "unknown";
    if (!studentByClass.has(cid)) studentByClass.set(cid, []);
    studentByClass.get(cid)!.push(st);
  });

  const studentClusters: StudentCluster[] = [];
  studentByClass.forEach((list, cid) => {
    if (cid === "unknown" || list.length === 0) return;
    const avgs = list
      .map((st: any) => {
        const arr = studentScoreMap.get(st.id);
        if (!arr || !arr.length) return null;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      })
      .filter((x): x is number => x !== null);

    const total = list.length;
    const atRisk = avgs.filter(a => a < 50).length;
    const pct = total > 0 ? Math.round((atRisk / total) * 100) : 0;
    const avg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;

    const severity: StudentCluster["severity"] =
      pct >= 30 ? "critical" : pct >= 18 ? "warning" : "okay";

    const issues: string[] = [];
    if (avg < 60) issues.push(`Avg score ${avg}`);
    if (atRisk > 0) issues.push(`${atRisk} below 50%`);
    if (issues.length === 0) issues.push("On track");

    studentClusters.push({
      classId: cid,
      className: classNameOf(cid),
      teacherName: teacherOf(cid),
      atRisk, total, pct, severity, avg, issues,
    });
  });
  studentClusters.sort((a, b) => b.pct - a.pct);

  // Branch composite formula:
  //   students × 0.45 + improvement × 0.25 + teachers × 0.20 + (100 - atRiskPct) × 0.10
  const composite = Math.round(
    (studentsAvg * 0.45) +
    (improvement * 0.25) +
    (teachersAvg * 0.20) +
    ((100 - Math.min(atRiskPct, 100)) * 0.10)
  );

  return {
    branchName, schoolId,
    composite,
    studentsAvg: Math.round(studentsAvg * 10) / 10,
    teachersAvg: Math.round(teachersAvg * 10) / 10,
    improvement,
    atRiskPct: Math.round(atRiskPct * 10) / 10,
    totalStudents: students.length,
    totalTeachers: teachers.length,
    totalSections: classes.length,
    topTeachers, weakTeachers, midTeachers,
    studentClusters: studentClusters.slice(0, 8),
  };
}

// ── Synthetic peer network ────────────────────────────────────────────────
// Deterministic from schoolId so the same principal sees the same peers each visit.
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const PEER_CITIES = ["Bangalore", "Delhi", "Chennai", "Mumbai", "Pune", "Kolkata", "Ahmedabad", "Jaipur"];
const PEER_FIRST_NAMES = ["Deepa", "Akash", "Priya", "Suresh", "Anita", "Vikram", "Meera", "Rohit"];
const PEER_LAST_NAMES = ["Sharma", "Mehta", "Iyer", "Nair", "Krishnan", "Bose", "Reddy", "Patel"];

const PEER_PALETTES: { bg: string; fg: string }[] = [
  { bg: "rgba(0,200,83,0.12)", fg: "#00C853" },
  { bg: "rgba(123,63,244,0.12)", fg: "#7B3FF4" },
  { bg: "rgba(255,136,0,0.12)", fg: "#C26A00" },
  { bg: "rgba(255,69,58,0.10)", fg: "#C71F2D" },
  { bg: "rgba(0,85,255,0.12)", fg: "#0055FF" },
];

interface PeerSeed {
  city: string;
  brandPrefix: string;       // e.g. "DPS"
  principalName: string;
  composite: number;
  studentsAvg: number;
  teachersAvg: number;
  improvement: number;
  atRiskPct: number;
  students: number;
  weakTeacherCount: number;
  topTeacherCount: number;
  prevAvg: number;
}

function generatePeers(rand: () => number, myComposite: number, myBranchName: string): PeerSeed[] {
  const usedNames = new Set<string>();
  const usedCities = new Set<string>();
  // Best guess at brand prefix from the principal's branch name (e.g. "DPS Hyderabad" → "DPS").
  const myBrand = (myBranchName.split(/\s+/)[0] || "School").trim();

  const peers: PeerSeed[] = [];
  // Generate 4 peers (we'll have 5 total with the principal's branch).
  // Composite spread: ~ ±12 around current composite, distributed across rank slots.
  const offsets = [+8, +4, -4, -10];
  for (let i = 0; i < 4; i++) {
    let city: string;
    do { city = PEER_CITIES[Math.floor(rand() * PEER_CITIES.length)]; } while (usedCities.has(city));
    usedCities.add(city);

    const fn = PEER_FIRST_NAMES[Math.floor(rand() * PEER_FIRST_NAMES.length)];
    const ln = PEER_LAST_NAMES[Math.floor(rand() * PEER_LAST_NAMES.length)];
    const honorific = i % 2 === 0 ? "Mrs." : "Mr.";
    let principalName = `${honorific} ${fn} ${ln}`;
    let safety = 0;
    while (usedNames.has(principalName) && safety < 8) {
      principalName = `${honorific} ${PEER_FIRST_NAMES[Math.floor(rand() * PEER_FIRST_NAMES.length)]} ${PEER_LAST_NAMES[Math.floor(rand() * PEER_LAST_NAMES.length)]}`;
      safety++;
    }
    usedNames.add(principalName);

    const composite = Math.max(58, Math.min(95, myComposite + offsets[i] + Math.round(rand() * 4 - 2)));
    const studentsAvg = Math.max(58, Math.min(95, composite - 4 + rand() * 6));
    const teachersAvg = Math.max(60, Math.min(95, composite - 1 + rand() * 4));
    const improvement = 70 + Math.round(rand() * 18);
    const atRiskPct = Math.max(0.5, 8 - composite / 12 + rand() * 2);
    const students = 880 + Math.floor(rand() * 220);
    const prevAvg = Math.max(55, studentsAvg - 4 - rand() * 4);
    peers.push({
      city,
      brandPrefix: myBrand,
      principalName,
      composite,
      studentsAvg: Math.round(studentsAvg * 10) / 10,
      teachersAvg: Math.round(teachersAvg * 10) / 10,
      improvement,
      atRiskPct: Math.round(atRiskPct * 10) / 10,
      students,
      weakTeacherCount: 1 + Math.floor(rand() * 4),
      topTeacherCount: 2 + Math.floor(rand() * 4),
      prevAvg: Math.round(prevAvg),
    });
  }
  return peers;
}

function principalContext(p: PeerSeed | "current", branch: BranchComposite | null): string {
  if (p === "current" && branch) {
    if (branch.composite >= 85) return `Students avg ${branch.studentsAvg} · Teachers avg ${branch.teachersAvg}`;
    if (branch.atRiskPct > 5) return `Teachers avg ${branch.teachersAvg} · ${Math.round(branch.atRiskPct * branch.totalStudents / 100)} at-risk students dragging`;
    return `Improving · Teachers avg ${branch.teachersAvg} (gap closing)`;
  }
  const peer = p as PeerSeed;
  if (peer.composite >= 85) return `Students avg ${Math.round(peer.studentsAvg)} · Teachers avg ${Math.round(peer.teachersAvg)}`;
  if (peer.composite >= 75) return `Strong improvement +${peer.composite - peer.prevAvg} · Teachers avg ${Math.round(peer.teachersAvg)}`;
  if (peer.composite >= 70) return `Assignment completion low · ${peer.weakTeacherCount} weak teachers`;
  return `Branch avg ${Math.round(peer.studentsAvg)} · Attendance crisis`;
}

function branchContext(p: PeerSeed | "current", branch: BranchComposite | null): string {
  if (p === "current" && branch) {
    if (branch.composite >= 85) return `Students avg ${branch.studentsAvg} · ${branch.topTeachers.length} top teachers · Zero at-risk trend`;
    if (branch.atRiskPct > 5) return `Improving · Teacher avg ${branch.teachersAvg} (gap −${(89.6 - branch.teachersAvg).toFixed(1)})`;
    return `Strong trajectory · Teachers avg ${branch.teachersAvg}`;
  }
  const peer = p as PeerSeed;
  if (peer.composite >= 85) return `Students avg ${Math.round(peer.studentsAvg)} · ${peer.topTeacherCount} top teachers · Zero at-risk trend`;
  if (peer.composite >= 75) return `Strong trajectory · +${peer.composite - peer.prevAvg} this month · Teachers avg ${Math.round(peer.teachersAvg)}`;
  if (peer.composite >= 70) return `At-risk ${peer.atRiskPct}% · ${peer.weakTeacherCount} underperforming teachers`;
  return `Attendance crisis ${Math.max(60, 75 - Math.round((75 - peer.composite) * 0.4))}% · Students avg ${Math.round(peer.studentsAvg)}`;
}

function initialsOf(name: string): string {
  const parts = name.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s+/i, "").trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function buildNetworkLeaderboard(
  branch: BranchComposite,
  myPrincipalName: string,
  myBranchName: string,
  ownerNetwork: string,
): NetworkLeaderboard {
  const rand = seededRandom(branch.schoolId || myBranchName);
  const peers = generatePeers(rand, branch.composite, myBranchName);

  // Compose principal rows
  const myComposite = branch.composite;
  const allPrincipals = peers.map(p => ({
    name: p.principalName,
    composite: p.composite,
    branchName: `${p.brandPrefix} ${p.city}`,
    isCurrent: false,
  } as { name: string; composite: number; branchName: string; isCurrent: boolean }));
  allPrincipals.push({
    name: myPrincipalName,
    composite: myComposite,
    branchName: myBranchName,
    isCurrent: true,
  });
  allPrincipals.sort((a, b) => b.composite - a.composite);

  const principals: NetworkPrincipalRow[] = allPrincipals.map((p, i) => {
    const palette = PEER_PALETTES[i % PEER_PALETTES.length];
    const peerForCtx = peers.find(x => x.principalName === p.name);
    return {
      rank: i + 1,
      name: p.name,
      initials: initialsOf(p.name),
      branchName: p.branchName,
      composite: Math.round(p.composite * 10) / 10,
      context: p.isCurrent
        ? principalContext("current", branch)
        : peerForCtx ? principalContext(peerForCtx, null) : "",
      avatarBg: p.isCurrent ? "#0055FF" : palette.bg,
      avatarText: p.isCurrent ? "#FFFFFF" : palette.fg,
      isCurrent: p.isCurrent,
      isSynthetic: !p.isCurrent,
    };
  });

  // Branch rows mirror the same composite ordering
  const allBranches = peers.map(p => ({
    name: `${p.brandPrefix} ${p.city}`,
    city: p.city,
    composite: p.composite,
    students: p.students,
    isCurrent: false,
    peer: p,
  })) as { name: string; city: string; composite: number; students: number; isCurrent: boolean; peer: PeerSeed | null }[];
  allBranches.push({
    name: myBranchName,
    city: (myBranchName.split(/\s+/).slice(1).join(" ") || myBranchName).trim(),
    composite: myComposite,
    students: branch.totalStudents,
    isCurrent: true,
    peer: null,
  });
  allBranches.sort((a, b) => b.composite - a.composite);

  const branches: NetworkBranchRow[] = allBranches.map((b, i) => {
    const palette = PEER_PALETTES[i % PEER_PALETTES.length];
    return {
      rank: i + 1,
      name: b.name,
      city: b.city,
      initial: (b.city[0] || b.name[0] || "?").toUpperCase(),
      students: b.students,
      composite: Math.round(b.composite * 10) / 10,
      context: b.isCurrent
        ? branchContext("current", branch)
        : b.peer ? branchContext(b.peer, null) : "",
      avatarBg: b.isCurrent ? "#0055FF" : palette.bg,
      avatarText: b.isCurrent ? "#FFFFFF" : palette.fg,
      isCurrent: b.isCurrent,
      isSynthetic: !b.isCurrent,
    };
  });

  const myPrincipalRow = principals.find(p => p.isCurrent)!;
  const myBranchRow = branches.find(b => b.isCurrent)!;

  const networkAvg = Math.round((principals.reduce((a, b) => a + b.composite, 0) / principals.length) * 10) / 10;
  const totalStudents = branches.reduce((a, b) => a + b.students, 0);
  const totalTeachers = branch.totalTeachers + peers.reduce((a, p) => a + 22 + Math.floor((p.composite - 70) / 2), 0);

  return {
    ownerNetwork,
    myPrincipalRow, myBranchRow,
    principals, branches,
    networkAvg,
    totalPrincipals: principals.length,
    totalBranches: branches.length,
    totalStudents,
    totalTeachers,
  };
}

// ── AI insights via /api/ai-insights ──────────────────────────────────────
export interface AIDiagnosisItem { type: "good" | "concern" | "note"; text: string; }
export interface AIAction {
  id: string;
  num: string;
  title: string;
  reason: string;
  tracking: "auto" | "auto_pct" | "manual";
  status: "pending" | "in_progress" | "completed";
  progress?: { current: number; target: number };
  current?: number;
  target?: number;
  unit?: string;
  reward?: string;
  subStatus?: string;
}
export interface AIForecast {
  projectedLabel: string;
  changeLabel: string;
  changeSubtitle: string;
  scenarios: { label: string; outcome: string; highlight?: boolean }[];
  confidence: number;
}
export interface AIInsightsResult {
  diagnosis: AIDiagnosisItem[];
  actions: AIAction[];
  forecast: AIForecast;
}

const SESSION_CACHE = new Map<string, AIInsightsResult>();

async function callInsights(instructions: string, data: any, cacheKey: string): Promise<AIInsightsResult> {
  if (SESSION_CACHE.has(cacheKey)) return SESSION_CACHE.get(cacheKey)!;
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch("/api/ai-insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ instructions, data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `AI proxy failed (${res.status})`);
  }
  const raw = await res.json();
  const normalised = normaliseInsights(raw);
  SESSION_CACHE.set(cacheKey, normalised);
  return normalised;
}

function normaliseInsights(raw: any): AIInsightsResult {
  const diagnosis: AIDiagnosisItem[] = Array.isArray(raw?.diagnosis)
    ? raw.diagnosis.filter((d: any) => d && typeof d.text === "string").map((d: any) => ({
        type: (d.type === "good" || d.type === "concern" || d.type === "note") ? d.type : "note",
        text: String(d.text),
      }))
    : [];
  const actionsRaw = Array.isArray(raw?.actions) ? raw.actions : [];
  const actions: AIAction[] = actionsRaw.slice(0, 6).map((a: any, i: number) => ({
    id: typeof a?.id === "string" ? a.id : `a${i + 1}`,
    num: String(i + 1).padStart(2, "0"),
    title: String(a?.title ?? "Action item"),
    reason: String(a?.reason ?? ""),
    tracking: (a?.tracking === "auto_pct" || a?.tracking === "manual" || a?.tracking === "auto") ? a.tracking : "manual",
    status: (a?.status === "in_progress" || a?.status === "completed") ? a.status : "pending",
    progress: a?.progress && typeof a.progress.current === "number" && typeof a.progress.target === "number"
      ? { current: a.progress.current, target: a.progress.target } : undefined,
    current: typeof a?.current === "number" ? a.current : undefined,
    target: typeof a?.target === "number" ? a.target : undefined,
    unit: typeof a?.unit === "string" ? a.unit : undefined,
    reward: typeof a?.reward === "string" ? a.reward : undefined,
    subStatus: typeof a?.subStatus === "string" ? a.subStatus : undefined,
  }));
  const f = raw?.forecast ?? {};
  const scenarios = Array.isArray(f?.scenarios) ? f.scenarios.slice(0, 4).map((s: any) => ({
    label: String(s?.label ?? ""),
    outcome: String(s?.outcome ?? ""),
    highlight: !!s?.highlight,
  })) : [];
  const forecast: AIForecast = {
    projectedLabel: String(f?.projectedLabel ?? "—"),
    changeLabel: String(f?.changeLabel ?? "Same"),
    changeSubtitle: String(f?.changeSubtitle ?? ""),
    scenarios,
    confidence: typeof f?.confidence === "number" ? Math.max(0, Math.min(100, f.confidence)) : 70,
  };
  return { diagnosis, actions, forecast };
}

export async function fetchPrincipalInsights(input: {
  principalName: string;
  branchName: string;
  ownerNetwork: string;
  rank: number;
  totalPrincipals: number;
  composite: number;
  networkAvg: number;
  branch: BranchComposite;
  topPrincipal: { name: string; branch: string; composite: number };
}): Promise<AIInsightsResult> {
  const instructions = `You are a senior school network analyst and principal performance coach. Analyze this principal's metrics and explain WHY they are at their current rank, then provide SPECIFIC, actionable steps to climb.

Respond ONLY in valid JSON. Mix Hindi and English naturally (Hinglish) in diagnosis text and action reason fields. Keep action titles in English. Reference SPECIFIC numbers in every diagnosis bullet. Never give generic advice — always name the specific teacher (use real names from the data) or class.

Output schema:
{
  "diagnosis": [
    { "type": "good" | "concern" | "note", "text": "Hinglish diagnosis with specific numbers" }
  ],
  "actions": [
    {
      "id": "p1",
      "title": "English action title",
      "reason": "Hinglish reason citing specific data",
      "tracking": "auto" | "auto_pct" | "manual",
      "status": "pending",
      "progress": { "current": 0, "target": 6 }
    }
  ],
  "forecast": {
    "projectedLabel": "#2",
    "changeLabel": "Up 1 spot",
    "changeSubtitle": "Composite: 82.4 → 87.5",
    "scenarios": [{ "label": "...", "outcome": "...", "highlight": true }],
    "confidence": 75
  }
}

Generate 3 diagnosis bullets (good/concern/note) and 4-5 actions.`;

  const payload = {
    principal: {
      name: input.principalName,
      branch: input.branchName,
      network: input.ownerNetwork,
      rank: input.rank,
      totalPrincipals: input.totalPrincipals,
      composite: input.composite,
      networkAvg: input.networkAvg,
    },
    branchMetrics: {
      studentsAvg: input.branch.studentsAvg,
      teachersAvg: input.branch.teachersAvg,
      improvement: input.branch.improvement,
      atRiskPct: input.branch.atRiskPct,
      totalStudents: input.branch.totalStudents,
      totalTeachers: input.branch.totalTeachers,
    },
    topTeachers: input.branch.topTeachers.map(t => ({
      name: t.teacher.name, composite: t.composite,
      classAvg: t.classAvg, attendance: t.attendance,
    })),
    weakTeachers: input.branch.weakTeachers.map(t => ({
      name: t.teacher.name, composite: t.composite,
      issues: t.reasons.map(r => `${r.label} ${r.value}`).join(" · "),
    })),
    studentClusters: input.branch.studentClusters,
    topPrincipal: input.topPrincipal,
  };

  return callInsights(instructions, payload, `principal:${input.principalName}:${Math.round(input.composite)}`);
}

export async function fetchBranchInsights(input: {
  branchName: string;
  ownerNetwork: string;
  rank: number;
  totalBranches: number;
  branch: BranchComposite;
  networkAvg: number;
  topBranchName: string;
  topBranchComposite: number;
}): Promise<AIInsightsResult> {
  const instructions = `You are a school branch performance analyst with access to real teacher and student data. Generate a brutally honest diagnosis of WHY this branch is at its current rank, and provide SPECIFIC interventions naming the actual teachers and classes from the data.

Respond ONLY in valid JSON. Use Hinglish (natural mix of Hindi and English) in diagnosis text and action reason fields. Keep action titles in English. Every diagnosis bullet and action reason MUST cite specific numbers and named entities from the data.

Output schema:
{
  "diagnosis": [
    { "type": "good" | "concern" | "note", "text": "Hinglish diagnosis citing teacher names + numbers" }
  ],
  "actions": [
    {
      "id": "b1",
      "title": "English action naming a specific teacher or class",
      "reason": "Hinglish reason citing exact data",
      "tracking": "auto" | "auto_pct" | "manual",
      "status": "pending" | "in_progress",
      "progress": { "current": 0, "target": 6 }
    }
  ],
  "forecast": {
    "projectedLabel": "#2",
    "changeLabel": "Up 1 spot",
    "changeSubtitle": "Branch score: 79.8 → 85.2",
    "scenarios": [{ "label": "...", "outcome": "...", "highlight": true }],
    "confidence": 80
  }
}

Generate 3 diagnosis bullets and 5-6 actions. At least one action must name a specific weak teacher; at least one must address a specific at-risk class.`;

  const payload = {
    branch: {
      name: input.branchName,
      network: input.ownerNetwork,
      rank: input.rank,
      totalBranches: input.totalBranches,
      composite: input.branch.composite,
      networkAvg: input.networkAvg,
    },
    metrics: {
      studentsAvg: input.branch.studentsAvg,
      teachersAvg: input.branch.teachersAvg,
      improvement: input.branch.improvement,
      atRiskPct: input.branch.atRiskPct,
      totalStudents: input.branch.totalStudents,
      totalTeachers: input.branch.totalTeachers,
      totalSections: input.branch.totalSections,
    },
    topTeachers: input.branch.topTeachers.map(t => ({
      name: t.teacher.name, subjects: t.teacher.subjects, composite: t.composite,
    })),
    weakTeachers: input.branch.weakTeachers.map(t => ({
      name: t.teacher.name, subjects: t.teacher.subjects,
      composite: t.composite,
      classAvg: t.classAvg, passRate: t.passRate, attendance: t.attendance,
      assignments: t.assignments, punctuality: t.punctuality,
      issues: t.reasons.map(r => `${r.label} ${r.value}`).join(" · "),
    })),
    studentClusters: input.branch.studentClusters,
    topBranch: { name: input.topBranchName, composite: input.topBranchComposite },
  };

  return callInsights(instructions, payload, `branch:${input.branchName}:${Math.round(input.branch.composite)}`);
}

// ── Trajectory builder (synthetic when no week-over-week history exists) ──
export function buildTrajectory(currentComposite: number, schoolId: string): { week: string; value: number }[] {
  const rand = seededRandom(`${schoolId}:traj`);
  const start = Math.max(60, currentComposite - 8 - Math.round(rand() * 4));
  const arr: { week: string; value: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const noise = (rand() - 0.5) * 1.6;
    const v = start + (currentComposite - start) * t + noise;
    arr.push({ week: `W${10 + i}`, value: Math.round(v * 10) / 10 });
  }
  arr[arr.length - 1].value = Math.round(currentComposite * 10) / 10;
  return arr;
}

export function buildRankTrajectory(currentRank: number, schoolId: string, totalRanks: number): { week: string; rank: number }[] {
  const rand = seededRandom(`${schoolId}:rank`);
  const startRank = Math.min(totalRanks, currentRank + 2);
  const arr: { week: string; rank: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const v = startRank - (startRank - currentRank) * t + (rand() - 0.5) * 0.4;
    arr.push({ week: `W${10 + i}`, rank: Math.max(1, Math.min(totalRanks, Math.round(v))) });
  }
  arr[arr.length - 1].rank = currentRank;
  return arr;
}
