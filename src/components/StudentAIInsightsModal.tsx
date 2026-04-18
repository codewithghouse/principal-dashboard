import { useEffect, useState } from "react";
import {
  X, Sparkles, Loader2, RefreshCw, AlertCircle, Target, GraduationCap,
  Users, Zap, Calendar, CalendarClock, TrendingUp, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import type { ClassifiedStudent } from "@/lib/classifyStudent";
import { CATEGORY_META } from "@/lib/classifyStudent";
import { getStudentInsight, type CachedInsight } from "@/lib/aiInsights";

interface Props {
  student: ClassifiedStudent;
  onClose: () => void;
}

const URGENCY_META = {
  critical: { label: "CRITICAL", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  high:     { label: "HIGH",     color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  medium:   { label: "MEDIUM",   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  low:      { label: "LOW",      color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
} as const;

const CONFIDENCE_META = {
  high:   { label: "High confidence",   color: "#059669" },
  medium: { label: "Medium confidence", color: "#d97706" },
  low:    { label: "Low confidence — more data needed", color: "#6b7280" },
} as const;

/**
 * StudentAIInsightsModal
 * Calls OpenAI (via /api/ai-insights) to produce root-cause analysis + actionable
 * plans for the student's current performance tier. Results cached 24h in
 * Firestore for zero-latency repeat views.
 */
export default function StudentAIInsightsModal({ student, onClose }: Props) {
  const { userData } = useAuth();
  const catMeta = CATEGORY_META[student.category];

  const [insight, setInsight]     = useState<CachedInsight | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [regenerating, setRegen]  = useState(false);

  // Initial fetch — use cache where possible for instant display
  useEffect(() => {
    if (!userData?.schoolId) {
      setError("Session lost — please log in again.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const result = await getStudentInsight(student, userData.schoolId);
        if (!cancelled) setInsight(result);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load insight.";
        console.error("[StudentAIInsightsModal] load failed:", err);
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [student.studentId, userData?.schoolId]);

  const handleRegenerate = async () => {
    if (!userData?.schoolId) return;
    setRegen(true);
    setError(null);
    try {
      const result = await getStudentInsight(student, userData.schoolId, { force: true });
      setInsight(result);
      toast.success("Fresh AI analysis generated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Regenerate failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRegen(false);
    }
  };

  const urgency    = insight?.urgency    ? URGENCY_META[insight.urgency]    : null;
  const confidence = insight?.confidence ? CONFIDENCE_META[insight.confidence] : null;

  // Cache age (only shown when result is from cache)
  const cacheAgeHrs = insight?._fromCache && insight._cachedAt
    ? Math.floor((Date.now() - insight._cachedAt.toMillis()) / 3_600_000)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: catMeta.bg }}
            >
              <Sparkles className="w-5 h-5" style={{ color: catMeta.color }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                AI Analysis — {student.studentName}
              </h2>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: catMeta.bg, color: catMeta.color, border: `1px solid ${catMeta.border}` }}
                >
                  {catMeta.label}
                </span>
                <span className="text-[11px] text-slate-500">
                  Class {student.className || "—"} · Roll {student.rollNo || "—"}
                </span>
                {urgency && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: urgency.bg, color: urgency.color, border: `1px solid ${urgency.border}` }}
                  >
                    <AlertCircle className="w-2.5 h-2.5" />
                    {urgency.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-40"
              title="Regenerate with fresh AI analysis"
            >
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#1e3a8a]" />
              <p className="text-xs font-semibold text-slate-500">
                Analyzing {student.studentName}'s performance...
              </p>
              <p className="text-[11px] text-slate-400">This takes 5-10 seconds on first run</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center px-6">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-900 mb-1">Couldn't generate analysis</p>
              <p className="text-xs text-slate-500 mb-4">{error}</p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-4 py-2 rounded-xl bg-[#1e3a8a] text-white text-xs font-semibold hover:bg-[#1e4fc0] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Try Again
              </button>
            </div>
          ) : insight ? (
            <div className="p-6 space-y-5">
              {/* Summary card */}
              <div
                className="rounded-xl p-4 border"
                style={{ background: catMeta.bg, borderColor: catMeta.border }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: catMeta.color }}>
                  Summary
                </p>
                <p className="text-sm text-slate-800 leading-relaxed">{insight.summary}</p>
                {confidence && (
                  <p className="text-[10px] font-semibold mt-2.5 flex items-center gap-1" style={{ color: confidence.color }}>
                    <Zap className="w-2.5 h-2.5" />
                    {confidence.label}
                  </p>
                )}
              </div>

              {/* Root causes */}
              <InsightSection
                icon={<Target className="w-4 h-4 text-rose-500" />}
                title="Why is the student in this tier?"
                items={insight.rootCauses}
                bullet="●"
                bulletColor="#dc2626"
              />

              {/* For teacher */}
              <InsightSection
                icon={<GraduationCap className="w-4 h-4 text-[#1e3a8a]" />}
                title="Action plan for the teacher"
                items={insight.forTeacher}
                bullet="→"
                bulletColor="#1e3a8a"
              />

              {/* For parent */}
              <InsightSection
                icon={<Users className="w-4 h-4 text-emerald-600" />}
                title="Suggestions for the parent"
                items={insight.forParent}
                bullet="→"
                bulletColor="#059669"
              />

              {/* Next steps timeline */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Timeline</span>
                </div>
                <div className="divide-y divide-slate-100">
                  <TimelineRow
                    icon={<Zap className="w-3.5 h-3.5 text-rose-500" />}
                    label="This week"
                    text={insight.nextSteps.immediate}
                  />
                  <TimelineRow
                    icon={<Calendar className="w-3.5 h-3.5 text-amber-500" />}
                    label="This month"
                    text={insight.nextSteps.shortTerm}
                  />
                  <TimelineRow
                    icon={<CalendarClock className="w-3.5 h-3.5 text-emerald-500" />}
                    label="This semester"
                    text={insight.nextSteps.longTerm}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            {insight?._fromCache
              ? `Cached ${cacheAgeHrs === 0 ? "just now" : `${cacheAgeHrs}h ago`} · click ↻ to regenerate`
              : insight
                ? "Just generated · cached for 24 hours"
                : ""}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════════════════════════════════════

function InsightSection({
  icon, title, items, bullet, bulletColor,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  bullet: string;
  bulletColor: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className="text-xs font-bold mt-0.5 flex-shrink-0"
              style={{ color: bulletColor, minWidth: 12 }}
            >
              {bullet}
            </span>
            <span className="text-sm text-slate-700 leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineRow({
  icon, label, text,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-800 mt-0.5 leading-relaxed">{text}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-1" />
    </div>
  );
}