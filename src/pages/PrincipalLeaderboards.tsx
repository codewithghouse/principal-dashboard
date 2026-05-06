/**
 * PrincipalLeaderboards.tsx — Network-wide leaderboards across branches,
 * principals, teachers, and students within the principal's school.
 *
 * Live Firestore subscriptions feed buildLeaderboards() which produces
 * deterministic, render-ready rows. AI insights ("why this rank" + "how to
 * improve") are fetched lazily per row on first expand and cached weekly.
 *
 * REAL DATA ONLY — no mocks, no placeholders.
 */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, AlertTriangle, Filter, Loader2, Sparkles, RefreshCw, Inbox } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  collection, doc, query, where, onSnapshot, QueryConstraint,
} from "firebase/firestore";
import {
  buildLeaderboards, BranchRow, PrincipalRow, TeacherRow, StudentRow, LeaderboardOutput,
  PrincipalDoc, StudentDoc, BranchDoc,
} from "@/lib/leaderboardData";
import {
  TeacherDoc, ScoreDoc, AttendanceDoc, AssignmentDoc, TeacherAttendanceDoc,
} from "@/lib/teacherScorer";
import { getBranchInsight, getPrincipalInsight, LeaderboardInsight } from "@/lib/leaderboardAI";

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const FONT = "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif";
const T = {
  pageBg: "#EEF4FF", cardBg: "#FFFFFF",
  B1: "#0055FF", B2: "#1166FF",
  T1: "#001040", T3: "#5070B0", T4: "#99AACC",
  GREEN: "#34C759", GREEN_BG: "rgba(52,199,89,0.10)", GREEN_TEXT: "#00833A",
  RED: "#FF453A", RED_BG: "rgba(255,69,58,0.08)", RED_TEXT: "#C71F2D",
  ORANGE: "#FF8800", ORANGE_BG: "rgba(255,136,0,0.08)", ORANGE_TEXT: "#C26A00",
  VIOLET: "#7B3FF4", VIOLET_BG: "rgba(123,63,244,0.08)",
  GOLD: "#FFD700", GOLD_DARK: "#B8860B",
  SILVER: "#A8A8B5", BRONZE: "#8B5A2B",
  SH: "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 8px rgba(0,85,255,0.08)",
  SH_LG: "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 16px 40px rgba(0,85,255,0.12)",
  BORDER: "0.5px solid rgba(0,85,255,0.10)",
  BORDER_SOFT: "0.5px solid rgba(0,85,255,0.06)",
};

// ─────────────────────────────────────────────────────────────
// SHARED ATOMS
// ─────────────────────────────────────────────────────────────
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = T.T4 }) => (
  <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.6px", color, margin: 0, textTransform: "uppercase", fontFamily: FONT }}>{children}</p>
);

const PoolBall: React.FC<{ rank: number; isMe?: boolean; size?: number }> = ({ rank, isMe = false, size = 40 }) => {
  const ballStyle: Record<number, { bg: string; shadow: string; color: string }> = {
    1: { bg: "linear-gradient(135deg, #FFD700 0%, #B8860B 100%)", shadow: "0 3px 10px rgba(184,134,11,0.40)", color: "#fff" },
    2: { bg: "linear-gradient(135deg, #C0C0C0 0%, #808080 100%)", shadow: "0 3px 10px rgba(128,128,128,0.35)", color: "#fff" },
    3: { bg: "linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)", shadow: "0 3px 10px rgba(139,69,19,0.35)", color: "#fff" },
  };
  const s = isMe
    ? { bg: `linear-gradient(135deg, ${T.B1} 0%, ${T.B2} 100%)`, shadow: `0 0 0 2.5px ${T.B1}, 0 0 0 5px rgba(0,85,255,0.18)`, color: "#fff" }
    : (ballStyle[rank] || { bg: "rgba(0,85,255,0.06)", shadow: "none", color: rank > 5 ? T.T3 : T.T1 });

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: s.bg, boxShadow: s.shadow,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: rank > 9 ? 11 : 13, fontWeight: 800, color: s.color, fontFamily: FONT,
      position: "relative",
    }}>
      {rank}
      {!isMe && rank > 3 && rank % 2 === 0 && (
        <div style={{ position: "absolute", top: "30%", bottom: "30%", left: 0, right: 0, background: "rgba(255,255,255,0.12)", borderRadius: 0 }} />
      )}
    </div>
  );
};

const EntityAvatar: React.FC<{ initials: string; bg: string; color: string; size?: number }> = ({ initials, bg, color, size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, fontFamily: FONT }}>
    {initials}
  </div>
);

const TrendIndicator: React.FC<{ change: number; trend: "up" | "down" | "same" }> = ({ change, trend }) => {
  const isUp = trend === "up"; const isFlat = trend === "same";
  const color = isFlat ? T.T4 : isUp ? T.GREEN : T.RED;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: FONT }}>
      {isFlat ? "—" : isUp ? "▲" : "▼"} {isFlat ? "0.0" : Math.abs(change).toFixed(1)}
    </span>
  );
};

const AIChip: React.FC<{ label?: string }> = ({ label = "Edullent AI" }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: T.VIOLET_BG, border: `0.5px solid rgba(123,63,244,0.25)`, marginBottom: 10 }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.VIOLET, display: "inline-block" }} />
    <span style={{ fontSize: 9, fontWeight: 800, color: T.VIOLET, letterSpacing: "0.8px", textTransform: "uppercase", fontFamily: FONT }}>{label}</span>
  </div>
);

const YouBadge: React.FC = () => (
  <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: T.B1, color: "#fff", textTransform: "uppercase", letterSpacing: "0.6px", fontFamily: FONT, marginLeft: 6 }}>You</span>
);

const MyBranchBadge: React.FC = () => (
  <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: T.B1, color: "#fff", textTransform: "uppercase", letterSpacing: "0.6px", fontFamily: FONT, marginLeft: 6 }}>Your branch</span>
);

// ─────────────────────────────────────────────────────────────
// DETAIL PANEL — lazy AI insight loader
// ─────────────────────────────────────────────────────────────
type DetailEntity =
  | { type: "branch";    row: BranchRow;    top: BranchRow | null;    ctx: { totalBranches: number; networkBranchAvg: number } }
  | { type: "principal"; row: PrincipalRow; top: PrincipalRow | null; ctx: { totalPrincipals: number; networkPrincipalAvg: number } };

const DetailPanel: React.FC<{ entity: DetailEntity; schoolId: string }> = ({ entity, schoolId }) => {
  const [insight, setInsight] = useState<LeaderboardInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsight = async (force = false) => {
    setErr(null);
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const result = entity.type === "branch"
        ? await getBranchInsight(entity.row, entity.top, schoolId, { force, ctx: entity.ctx })
        : await getPrincipalInsight(entity.row, entity.top, schoolId, { force, ctx: entity.ctx });
      setInsight(result);
    } catch (e: any) {
      setErr(e?.message || "Could not load AI analysis.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchInsight(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.type, entity.row.id]);

  const isTop = entity.row.rank === 1;
  // Solutions render for ANY rank — even #1 may have weak teachers /
  // subjects to lift, or maintenance routines to protect the lead. The
  // `solutionLabel` from the AI/fallback distinguishes "What to keep
  // doing" (healthy top) vs "Lift the floor" (struggling top) vs
  // "How to climb to #N-1" (non-top).
  const hasSolutions = (insight?.solutions?.length ?? 0) > 0;

  return (
    <div style={{ background: T.cardBg, border: `0.5px solid rgba(0,85,255,0.12)`, borderRadius: 16, margin: "0 0 4px", overflow: "hidden", boxShadow: T.SH_LG }}>
      <div style={{ padding: "16px 18px", borderBottom: hasSolutions ? T.BORDER_SOFT : "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <AIChip label={
            insight?.isFallback
              ? "Stat-based analysis (AI offline)"
              : entity.type === "branch"
                ? "Edullent AI · Branch + Teacher + Student data"
                : "Edullent AI · Principal + Branch performance data"
          } />
          {!loading && (
            <button
              onClick={() => fetchInsight(true)}
              disabled={refreshing}
              title="Regenerate"
              style={{ background: "transparent", border: "none", cursor: refreshing ? "wait" : "pointer", padding: 4, display: "flex", alignItems: "center", color: T.T4 }}
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>

        {!loading && !err && insight?.isFallback && insight.fallbackReason && (
          <div style={{ padding: "8px 12px", background: T.ORANGE_BG, border: `0.5px solid rgba(255,136,0,0.20)`, borderRadius: 10, color: T.ORANGE_TEXT, fontSize: 11, fontWeight: 600, fontFamily: FONT, marginBottom: 10 }}>
            {insight.fallbackReason}
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: T.T3, fontSize: 12, fontWeight: 600, fontFamily: FONT }}>
            <Loader2 size={14} className="animate-spin" />
            Analysing performance signals…
          </div>
        )}

        {err && !loading && (
          <div style={{ padding: "10px 12px", background: T.RED_BG, border: `0.5px solid rgba(255,69,58,0.20)`, borderRadius: 10, color: T.RED_TEXT, fontSize: 12, fontWeight: 600, fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ flex: 1 }}>{err}</span>
            <button
              onClick={() => fetchInsight(true)}
              style={{ background: "rgba(255,69,58,0.12)", border: `0.5px solid rgba(255,69,58,0.28)`, color: T.RED_TEXT, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !err && insight && (
          <>
            <Eyebrow color={T.T4}>{isTop ? "Why #1 — what makes this the top" : `Why #${entity.row.rank} — root causes`}</Eyebrow>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {insight.whyPosition.length === 0 ? (
                <p style={{ fontSize: 12, color: T.T3, fontFamily: FONT, margin: 0, lineHeight: 1.55 }}>
                  Rank <strong style={{ color: T.T1 }}>#{entity.row.rank}</strong> with composite{" "}
                  <strong style={{ color: T.T1 }}>{entity.row.composite.toFixed(1)}</strong>. Add more
                  scores or attendance for richer analysis.
                </p>
              ) : (
                insight.whyPosition.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: item.color, marginTop: 7, flexShrink: 0 }} />
                    <p style={{ fontSize: 13, fontWeight: 500, color: T.T1, margin: 0, lineHeight: 1.65, fontFamily: FONT }}>
                      <strong style={{ color: T.T1 }}>{item.bold}</strong>{item.rest}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {hasSolutions && insight && (
        <div style={{ padding: "14px 18px" }}>
          <Eyebrow color={T.T4}>{insight.solutionLabel || "How to improve"}</Eyebrow>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {insight.solutions.map((sol, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "11px 14px", borderRadius: 12,
                background: sol.urgent ? T.RED_BG : "rgba(0,85,255,0.04)",
                border: sol.urgent ? "0.5px solid rgba(255,69,58,0.20)" : T.BORDER,
              }}>
                {sol.urgent && <AlertTriangle size={12} color={T.RED} strokeWidth={2.5} style={{ marginTop: 3, flexShrink: 0 }} />}
                <span style={{ flexShrink: 0, fontSize: 18, fontWeight: 800, color: sol.urgent ? T.RED : T.B1, lineHeight: 1, minWidth: 26, fontFamily: FONT }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p style={{ fontSize: 13, fontWeight: 500, color: T.T1, margin: 0, lineHeight: 1.6, fontFamily: FONT }}>{sol.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// POOL ROW
// ─────────────────────────────────────────────────────────────
interface PoolRowProps {
  rank: number;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  name: string;
  subLine: string;
  composite: number;
  weekChange: number;
  trend: "up" | "down" | "same";
  isHighlighted: boolean;
  totalRows?: number;
  badges?: React.ReactNode;
  expandable?: boolean;
  isExpanded?: boolean;
  onClick?: () => void;
  isLast?: boolean;
}

const PoolRow: React.FC<PoolRowProps> = ({
  rank, initials, avatarBg, avatarColor, name, subLine, composite, weekChange, trend,
  isHighlighted, totalRows, badges = null, expandable = false, isExpanded = false, onClick, isLast = false,
}) => {
  const isLastRank = totalRows !== undefined && rank === totalRows;
  const scoreColor = isLastRank ? T.RED : isHighlighted ? T.B1 : T.T1;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 16px",
        borderBottom: isLast ? "none" : T.BORDER_SOFT,
        background: isHighlighted ? `linear-gradient(90deg, rgba(0,85,255,0.06) 0%, rgba(0,85,255,0.02) 100%)` : "transparent",
        cursor: expandable ? "pointer" : "default",
        position: "relative", transition: "background 0.12s",
        ...(isHighlighted ? { boxShadow: `inset 3px 0 0 ${T.B1}` } : {}),
      }}
    >
      <PoolBall rank={rank} isMe={isHighlighted} size={38} />
      <EntityAvatar initials={initials} bg={avatarBg} color={avatarColor} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: isHighlighted ? T.B1 : T.T1, margin: 0, letterSpacing: "-0.2px", fontFamily: FONT }}>{name}</p>
          {badges}
        </div>
        <p style={{ fontSize: 11, fontWeight: 500, color: T.T3, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: FONT }}>{subLine}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor, letterSpacing: "-0.5px", fontFamily: FONT }}>{composite.toFixed(1)}</span>
        <TrendIndicator change={weekChange} trend={trend} />
      </div>
      {expandable && (
        <div style={{ marginLeft: 6, color: T.T4, flexShrink: 0 }}>
          {isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SUMMARY STATS BAR
// ─────────────────────────────────────────────────────────────
const StatBar: React.FC<{ stats: { label: string; value: string; color: string }[] }> = ({ stats }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length},1fr)`, gap: 8, marginBottom: 16 }}>
    {stats.map((s, i) => (
      <div key={i} style={{ background: T.cardBg, borderRadius: 14, padding: "10px 8px", border: T.BORDER, textAlign: "center", boxShadow: T.SH }}>
        <p style={{ fontSize: 8, fontWeight: 800, letterSpacing: "1.2px", color: T.T4, margin: "0 0 4px", textTransform: "uppercase", fontFamily: FONT }}>{s.label}</p>
        <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0, letterSpacing: "-0.6px", fontFamily: FONT }}>{s.value}</p>
      </div>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────
// EMPTY STATE (single-branch / no-data)
// ─────────────────────────────────────────────────────────────
const EmptyTab: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, padding: "44px 22px", textAlign: "center", boxShadow: T.SH }}>
    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(0,85,255,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
      <Inbox size={22} color={T.B1} />
    </div>
    <p style={{ fontSize: 15, fontWeight: 800, color: T.T1, margin: "0 0 6px", fontFamily: FONT }}>{title}</p>
    <p style={{ fontSize: 12, fontWeight: 500, color: T.T3, margin: 0, lineHeight: 1.5, fontFamily: FONT, maxWidth: 360, marginInline: "auto" }}>{body}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────
// TAB 1 — BRANCH LEADERBOARD
// ─────────────────────────────────────────────────────────────
const BranchLeaderboard: React.FC<{ data: LeaderboardOutput; schoolId: string }> = ({ data, schoolId }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id);

  if (data.branches.length === 0) {
    return <EmptyTab title="No branches yet" body="Branches will appear here once teachers and students are assigned to a branchId in your school." />;
  }
  if (data.branches.length === 1) {
    return <EmptyTab title="Single branch — no comparison available" body="Branch leaderboard requires 2 or more branches in your school. Add another branch to start ranking." />;
  }

  const top = data.branches[0];

  return (
    <div>
      <StatBar stats={[
        { label: "Branches",     value: String(data.meta.totalBranches), color: T.B1 },
        { label: "Network avg",  value: data.meta.networkBranchAvg.toFixed(1), color: T.T1 },
        { label: "Total at-risk", value: String(data.meta.totalAtRisk), color: T.RED },
      ]} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, paddingLeft: 2 }}>
        <Eyebrow>All branches · tap to expand analysis</Eyebrow>
      </div>

      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, overflow: "hidden", boxShadow: T.SH_LG }}>
        {data.branches.map((branch, i) => (
          <React.Fragment key={branch.id}>
            <PoolRow
              rank={branch.rank} initials={branch.initial}
              avatarBg={branch.avatarBg} avatarColor={branch.avatarColor}
              name={branch.name}
              subLine={`${branch.students.toLocaleString()} students · ${branch.teachers} teachers · ${branch.city}`}
              composite={branch.composite} weekChange={branch.weekChange} trend={branch.trend}
              isHighlighted={branch.isMyBranch}
              totalRows={data.branches.length}
              badges={branch.isMyBranch ? <MyBranchBadge /> : null}
              expandable isExpanded={expanded === branch.id}
              onClick={() => toggle(branch.id)}
              isLast={i === data.branches.length - 1 && expanded !== branch.id}
            />
            {expanded === branch.id && (
              <div style={{ padding: "4px 12px 12px" }}>
                <DetailPanel
                  entity={{
                    type: "branch",
                    row: branch,
                    top: top.id === branch.id ? null : top,
                    ctx: { totalBranches: data.meta.totalBranches, networkBranchAvg: data.meta.networkBranchAvg },
                  }}
                  schoolId={schoolId}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TAB 2 — PRINCIPAL LEADERBOARD
// ─────────────────────────────────────────────────────────────
const PrincipalLeaderboardView: React.FC<{ data: LeaderboardOutput; schoolId: string; myPrincipalId?: string }> = ({ data, schoolId, myPrincipalId }) => {
  // Default-expand current principal's row (if present)
  const [expanded, setExpanded] = useState<string | null>(myPrincipalId || null);
  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id);

  if (data.principals.length === 0) {
    return <EmptyTab title="No principals yet" body="Principal leaderboard appears once your school has principals registered." />;
  }
  if (data.principals.length === 1) {
    return <EmptyTab title="Single principal — no comparison available" body="Principal leaderboard requires 2 or more principals in your school." />;
  }

  const top = data.principals[0];
  const myRank = data.meta.myRank.principal;

  return (
    <div>
      <StatBar stats={[
        { label: "Principals",   value: String(data.meta.totalPrincipals), color: T.B1 },
        { label: "Network avg",  value: data.meta.networkPrincipalAvg.toFixed(1), color: T.T1 },
        { label: "Your rank",    value: myRank ? `#${myRank}` : "—", color: T.B1 },
      ]} />

      <div style={{ marginBottom: 10, paddingLeft: 2 }}>
        <Eyebrow>All principals · tap to expand analysis</Eyebrow>
      </div>

      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, overflow: "hidden", boxShadow: T.SH_LG }}>
        {data.principals.map((prin, i) => (
          <React.Fragment key={prin.id}>
            <PoolRow
              rank={prin.rank} initials={prin.initials}
              avatarBg={prin.avatarBg} avatarColor={prin.avatarColor}
              name={prin.name} subLine={prin.subLine}
              composite={prin.composite} weekChange={prin.weekChange} trend={prin.trend}
              isHighlighted={prin.isMe}
              totalRows={data.principals.length}
              badges={prin.isMe ? <YouBadge /> : null}
              expandable isExpanded={expanded === prin.id}
              onClick={() => toggle(prin.id)}
              isLast={i === data.principals.length - 1 && expanded !== prin.id}
            />
            {expanded === prin.id && (
              <div style={{ padding: "4px 12px 12px" }}>
                <DetailPanel
                  entity={{
                    type: "principal",
                    row: prin,
                    top: top.id === prin.id ? null : top,
                    ctx: { totalPrincipals: data.meta.totalPrincipals, networkPrincipalAvg: data.meta.networkPrincipalAvg },
                  }}
                  schoolId={schoolId}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TAB 3 — TEACHER LEADERBOARD (positions only)
// ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const TeacherLeaderboardView: React.FC<{ data: LeaderboardOutput; myBranchId?: string }> = ({ data, myBranchId }) => {
  const [branchFilter, setBranchFilter] = useState<"all" | "my">("all");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    if (branchFilter === "my" && myBranchId) return data.teachers.filter(t => t.branchId === myBranchId);
    return data.teachers;
  }, [branchFilter, data.teachers, myBranchId]);

  // Re-rank within the filtered subset so #1 reflects the current view
  const reRanked = useMemo(() => filtered.map((t, i) => ({ ...t, rank: i + 1 })), [filtered]);
  const visible = reRanked.slice(0, shown);

  if (data.teachers.length === 0) {
    return <EmptyTab title="No teacher data yet" body="Teacher leaderboard appears once test scores, attendance or assignments are recorded." />;
  }

  return (
    <div>
      <StatBar stats={[
        { label: "Total teachers", value: String(data.meta.totalTeachers), color: T.B1 },
        { label: "Network avg",    value: data.meta.networkTeacherAvg.toFixed(1), color: T.T1 },
        { label: "My branch avg",  value: data.meta.myBranchAvg > 0 ? data.meta.myBranchAvg.toFixed(1) : "—", color: data.meta.myBranchAvg > 0 && data.meta.myBranchAvg < 75 ? T.ORANGE : T.T1 },
      ]} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <Eyebrow>{`All ${data.teachers.length} teachers · positions only`}</Eyebrow>
        {myBranchId && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Filter size={11} color={T.T4} />
            {(["all", "my"] as const).map(f => (
              <button key={f} onClick={() => { setBranchFilter(f); setShown(PAGE_SIZE); }} style={{
                padding: "4px 10px", borderRadius: 999, border: branchFilter === f ? `1.5px solid ${T.B1}` : T.BORDER,
                background: branchFilter === f ? "rgba(0,85,255,0.08)" : T.cardBg,
                color: branchFilter === f ? T.B1 : T.T3, fontSize: 10, fontWeight: 800,
                cursor: "pointer", fontFamily: FONT, letterSpacing: "0.3px",
              }}>
                {f === "all" ? "All branches" : "My branch"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, overflow: "hidden", boxShadow: T.SH_LG }}>
        {visible.map((t, i) => (
          <PoolRow
            key={t.id}
            rank={t.rank} initials={t.initials}
            avatarBg={t.avatarBg} avatarColor={t.avatarColor}
            name={t.name} subLine={`${t.subject} · ${t.branch} · ${t.classes}`}
            composite={t.composite} weekChange={t.weekChange} trend={t.trend}
            isHighlighted={false}
            totalRows={reRanked.length}
            expandable={false}
            isLast={i === visible.length - 1 && shown >= reRanked.length}
          />
        ))}
        {shown < reRanked.length && (
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", borderTop: T.BORDER_SOFT }}>
            <button onClick={() => setShown(s => s + PAGE_SIZE)} style={{ fontSize: 12, fontWeight: 700, color: T.B1, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>
              Show more ({reRanked.length - shown} remaining) ↓
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TAB 4 — STUDENT LEADERBOARD (positions only)
// ─────────────────────────────────────────────────────────────
const StudentLeaderboardView: React.FC<{ data: LeaderboardOutput; myBranchId?: string }> = ({ data, myBranchId }) => {
  const [branchFilter, setBranchFilter] = useState<"all" | "my">("all");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    if (branchFilter === "my" && myBranchId) return data.students.filter(s => s.branchId === myBranchId);
    return data.students;
  }, [branchFilter, data.students, myBranchId]);

  const reRanked = useMemo(() => filtered.map((s, i) => ({ ...s, rank: i + 1 })), [filtered]);
  const visible = reRanked.slice(0, shown);

  if (data.students.length === 0) {
    return <EmptyTab title="No student data yet" body="Student leaderboard appears once scores or attendance are recorded for at least one student." />;
  }

  return (
    <div>
      <StatBar stats={[
        { label: "Total students", value: data.meta.totalStudents.toLocaleString(), color: T.B1 },
        { label: "Network avg",    value: data.meta.networkStudentAvg.toFixed(1), color: T.T1 },
        { label: "At-risk total",  value: String(data.meta.totalAtRisk), color: T.RED },
      ]} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <Eyebrow>{`All ${data.students.length} students · positions only`}</Eyebrow>
        {myBranchId && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Filter size={11} color={T.T4} />
            {(["all", "my"] as const).map(f => (
              <button key={f} onClick={() => { setBranchFilter(f); setShown(PAGE_SIZE); }} style={{
                padding: "4px 10px", borderRadius: 999, border: branchFilter === f ? `1.5px solid ${T.B1}` : T.BORDER,
                background: branchFilter === f ? "rgba(0,85,255,0.08)" : T.cardBg,
                color: branchFilter === f ? T.B1 : T.T3, fontSize: 10, fontWeight: 800,
                cursor: "pointer", fontFamily: FONT, letterSpacing: "0.3px",
              }}>
                {f === "all" ? "All branches" : "My branch"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, overflow: "hidden", boxShadow: T.SH_LG }}>
        {visible.map((s, i) => (
          <PoolRow
            key={s.id}
            rank={s.rank} initials={s.initials}
            avatarBg={s.avatarBg} avatarColor={s.avatarColor}
            name={s.name} subLine={`Class ${s.class} · ${s.branch} · Roll ${s.roll}`}
            composite={s.composite} weekChange={s.weekChange} trend={s.trend}
            isHighlighted={false}
            totalRows={reRanked.length}
            expandable={false}
            isLast={i === visible.length - 1 && shown >= reRanked.length}
          />
        ))}
        {shown < reRanked.length && (
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", borderTop: T.BORDER_SOFT }}>
            <button onClick={() => setShown(s => s + PAGE_SIZE)} style={{ fontSize: 12, fontWeight: 700, color: T.B1, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>
              Show more ({reRanked.length - shown} remaining) ↓
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────────────────────
const SkeletonRow: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: T.BORDER_SOFT }}>
    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(0,85,255,0.06)", flexShrink: 0 }} />
    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(0,85,255,0.06)", flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <div style={{ width: "55%", height: 12, background: "rgba(0,85,255,0.10)", borderRadius: 4, marginBottom: 6 }} />
      <div style={{ width: "75%", height: 9,  background: "rgba(0,85,255,0.06)", borderRadius: 4 }} />
    </div>
    <div style={{ width: 40, height: 22, background: "rgba(0,85,255,0.08)", borderRadius: 6 }} />
  </div>
);

const LoadingState: React.FC = () => (
  <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ background: T.cardBg, borderRadius: 14, padding: "10px 8px", border: T.BORDER, height: 60, boxShadow: T.SH }} />
      ))}
    </div>
    <div style={{ background: T.cardBg, border: T.BORDER, borderRadius: 20, overflow: "hidden", boxShadow: T.SH_LG }}>
      {[0,1,2,3,4].map(i => <SkeletonRow key={i} />)}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
type TabId = "branch" | "principal" | "teacher" | "student";

const PrincipalLeaderboards: React.FC = () => {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId as string | undefined;
  const branchId = userData?.branchId as string | undefined;
  const myPrincipalId = userData?.id as string | undefined;
  const schoolName = (userData?.schoolName || userData?.school || "Your School Network") as string;

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherDoc[]>([]);
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [principals, setPrincipals] = useState<PrincipalDoc[]>([]);
  const [testScores, setTestScores] = useState<ScoreDoc[]>([]);
  const [results, setResults] = useState<ScoreDoc[]>([]);
  const [gradebook, setGradebook] = useState<ScoreDoc[]>([]);
  const [attendance, setAttendance] = useState<AttendanceDoc[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDoc[]>([]);
  const [tAttendance, setTAttendance] = useState<TeacherAttendanceDoc[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachingAssignments, setTeachingAssignments] = useState<any[]>([]);
  const [branchDocs, setBranchDocs] = useState<BranchDoc[]>([]);

  const [activeTab, setActiveTab] = useState<TabId>("branch");
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});

  // ── Load Firestore data (always schoolId-scoped — never branch-scoped here,
  // because the leaderboard is intentionally cross-branch within the school).
  // Errors are surfaced (console + state) so silent rule/index failures don't
  // masquerade as "no data".
  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }

    setFetchErrors({});
    let loadedCount = 0;
    const total = 12;
    const markLoaded = () => { loadedCount++; if (loadedCount >= total) setLoading(false); };

    const onErr = (col: string) => (err: any) => {
      const msg = err?.code ? `${err.code}: ${err.message || ""}`.trim() : (err?.message || String(err));
      console.error(`[PrincipalLeaderboards] ${col} query failed:`, err);
      setFetchErrors(prev => ({ ...prev, [col]: msg }));
      markLoaded();
    };

    const scoped: QueryConstraint[] = [where("schoolId", "==", schoolId)];
    const q = (col: string) => query(collection(db, col), ...scoped);

    const unsubs = [
      onSnapshot(q("teachers"),             (s) => { setTeachers(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); markLoaded(); }, onErr("teachers")),
      onSnapshot(q("students"),             (s) => { setStudents(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); markLoaded(); }, onErr("students")),
      onSnapshot(q("principals"),           (s) => { setPrincipals(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); markLoaded(); }, onErr("principals")),
      onSnapshot(q("test_scores"),          (s) => { setTestScores(s.docs.map((d) => d.data() as ScoreDoc)); markLoaded(); }, onErr("test_scores")),
      onSnapshot(q("results"),              (s) => { setResults(s.docs.map((d) => d.data() as ScoreDoc)); markLoaded(); }, onErr("results")),
      onSnapshot(q("gradebook_scores"),     (s) => { setGradebook(s.docs.map((d) => d.data() as ScoreDoc)); markLoaded(); }, onErr("gradebook_scores")),
      onSnapshot(q("attendance"),           (s) => { setAttendance(s.docs.map((d) => d.data() as AttendanceDoc)); markLoaded(); }, onErr("attendance")),
      onSnapshot(q("assignments"),          (s) => { setAssignments(s.docs.map((d) => d.data() as AssignmentDoc)); markLoaded(); }, onErr("assignments")),
      onSnapshot(q("teacher_attendance"),   (s) => { setTAttendance(s.docs.map((d) => d.data() as TeacherAttendanceDoc)); markLoaded(); }, onErr("teacher_attendance")),
      onSnapshot(q("classes"),              (s) => { setClasses(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); markLoaded(); }, onErr("classes")),
      onSnapshot(q("teaching_assignments"), (s) => { setTeachingAssignments(s.docs.map((d) => d.data() as any)); markLoaded(); }, onErr("teaching_assignments")),
      // Optional master branches list. Most schools don't populate this; the
      // aggregator falls back to deriving branches from principal/teacher/
      // student docs. Failure here is non-fatal.
      onSnapshot(
        collection(doc(db, "schools", schoolId), "branches"),
        (s) => { setBranchDocs(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); markLoaded(); },
        (err) => { console.warn("[PrincipalLeaderboards] schools/{id}/branches subcollection unavailable (falling back to derived branches):", err); markLoaded(); },
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [schoolId]);

  const data: LeaderboardOutput | null = useMemo(() => {
    if (!schoolId) return null;
    return buildLeaderboards({
      schoolId,
      myBranchId: branchId,
      myPrincipalId,
      teachers,
      students,
      principals,
      scores: [...testScores, ...results, ...gradebook],
      attendance,
      assignments,
      teacherAttendance: tAttendance,
      teachingAssignments,
      classes,
      branches: branchDocs,
    });
  }, [schoolId, branchId, myPrincipalId, teachers, students, principals, testScores, results, gradebook, attendance, assignments, tAttendance, teachingAssignments, classes, branchDocs]);

  // Tab counts (live)
  const tabs = [
    { id: "branch"    as TabId, label: "Branches",   count: data?.meta.totalBranches    ?? 0 },
    { id: "principal" as TabId, label: "Principals", count: data?.meta.totalPrincipals  ?? 0 },
    { id: "teacher"   as TabId, label: "Teachers",   count: data?.meta.totalTeachers    ?? 0 },
    { id: "student"   as TabId, label: "Students",   count: data?.meta.totalStudents    ?? 0 },
  ];

  // ── Render gates
  if (!schoolId) {
    return (
      <div style={{ background: T.pageBg, minHeight: "100vh", padding: "28px 16px 40px", fontFamily: FONT }}>
        <EmptyTab title="No school context" body="Could not determine your school. Please log out and back in." />
      </div>
    );
  }

  return (
    <div style={{ background: T.pageBg, minHeight: "100vh", padding: "28px 16px 40px", fontFamily: FONT }}>
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "2px", color: T.T4, margin: "0 0 4px", textTransform: "uppercase", fontFamily: FONT }}>
          {schoolName} {data ? `· Week ${data.meta.weekNumber}` : ""}
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1.1px", color: T.T1, margin: 0, lineHeight: 1, fontFamily: FONT }}>
          Leaderboards
        </h1>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, padding: 4, borderRadius: 16, background: "rgba(0,85,255,0.06)", border: T.BORDER }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: "9px 4px", borderRadius: 11,
                border: active ? T.BORDER : "none",
                background: active ? T.cardBg : "transparent",
                cursor: "pointer", fontFamily: FONT,
                boxShadow: active ? T.SH : "none",
                transition: "all .15s",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 800, color: active ? T.B1 : T.T3, margin: 0, letterSpacing: "-0.1px", fontFamily: FONT }}>
                {tab.label}
              </p>
              <p style={{ fontSize: 10, fontWeight: 700, color: active ? T.T3 : T.T4, margin: "1px 0 0", fontFamily: FONT }}>
                {loading ? "…" : tab.count >= 1000 ? `${(tab.count / 1000).toFixed(1)}K` : tab.count}
              </p>
            </button>
          );
        })}
      </div>

      {Object.keys(fetchErrors).length > 0 && (
        <div style={{
          background: T.RED_BG, border: `0.5px solid rgba(255,69,58,0.25)`, borderRadius: 14,
          padding: "11px 14px", marginBottom: 14, color: T.RED_TEXT,
          fontSize: 11, fontWeight: 600, fontFamily: FONT, lineHeight: 1.5,
        }}>
          <strong style={{ fontWeight: 800 }}>Partial data — {Object.keys(fetchErrors).length} collection(s) failed to load:</strong>{" "}
          {Object.keys(fetchErrors).join(", ")}. Check console for the Firestore error (usually missing rule, missing index, or schoolId field mismatch). Rankings shown reflect only the data that loaded.
        </div>
      )}

      {loading || !data ? (
        <LoadingState />
      ) : (
        <>
          {activeTab === "branch"    && <BranchLeaderboard         data={data} schoolId={schoolId} />}
          {activeTab === "principal" && <PrincipalLeaderboardView  data={data} schoolId={schoolId} myPrincipalId={myPrincipalId} />}
          {activeTab === "teacher"   && <TeacherLeaderboardView    data={data} myBranchId={branchId} />}
          {activeTab === "student"   && <StudentLeaderboardView    data={data} myBranchId={branchId} />}
        </>
      )}

      <div style={{ marginTop: 28, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 999, background: T.VIOLET_BG, border: "0.5px solid rgba(123,63,244,0.20)" }}>
          <Sparkles size={11} color={T.VIOLET} />
          <span style={{ fontSize: 10, fontWeight: 700, color: T.VIOLET, fontFamily: FONT }}>
            Live data · AI insights cached weekly
          </span>
        </div>
      </div>
    </div>
  );
};

export default PrincipalLeaderboards;
