import { useState, useEffect } from "react";
import {
  FileText, Download, GraduationCap, Calendar, Shield,
  Settings, UserCheck, Layout, CalendarCheck, AlertTriangle, Trophy,
  Users2, MessageSquare, LineChart, Trash2, ArrowRight, Plus, Loader2, Clock,
  BarChart3,
} from "lucide-react";
import GenerateReport from "@/components/GenerateReport";
import { buildReport, openReportWindow } from "@/lib/reportTemplate";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  doc, writeBatch, getDoc,
} from "firebase/firestore";
import { toast } from "sonner";

type CategoryId = "academic" | "attendance" | "discipline" | "communication" | "custom";

const reportCategories: {
  id: CategoryId; label: string; icon: any; tone: "blue" | "green" | "red" | "orange" | "violet";
}[] = [
  { id: "academic",      label: "Academic",      icon: GraduationCap, tone: "blue"   },
  { id: "attendance",    label: "Attendance",    icon: CalendarCheck, tone: "green"  },
  { id: "discipline",    label: "Discipline",    icon: Shield,        tone: "red"    },
  { id: "communication", label: "Communication", icon: MessageSquare, tone: "orange" },
  { id: "custom",        label: "Custom",        icon: Settings,      tone: "violet" },
];

// Each pre-built template belongs to ONE category. Per-category count is
// derived from this mapping (no fabricated numbers — memory:
// bug_pattern_fabricated_fallback). Click on a category card filters
// the templates grid to just that category's templates.
const templates: Array<{
  title: string; desc: string; icon: any; tone: string; categoryId: Exclude<CategoryId, "custom">;
}> = [
  { title: "Student Progress",     desc: "Individual performance", icon: UserCheck,     tone: "violet", categoryId: "academic"      },
  { title: "Class Performance",    desc: "Section-wise analysis",  icon: Layout,        tone: "blue",   categoryId: "academic"      },
  { title: "Exam Results",         desc: "Comprehensive report",   icon: Trophy,        tone: "gold",   categoryId: "academic"      },
  { title: "Teacher Performance",  desc: "Staff evaluation",       icon: Users2,        tone: "blue",   categoryId: "academic"      },
  { title: "Monthly Attendance",   desc: "Attendance summary",     icon: CalendarCheck, tone: "green",  categoryId: "attendance"    },
  { title: "Risk Students",        desc: "At-risk student list",   icon: AlertTriangle, tone: "red",    categoryId: "discipline"    },
  { title: "School Overview",      desc: "Complete analytics",     icon: LineChart,     tone: "orange", categoryId: "communication" },
];

const Reports = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const [activeCategory,    setActiveCategory]    = useState<CategoryId>("academic");
  const [selectedTemplate,  setSelectedTemplate]  = useState<string | null>(null);
  const [recentReports,     setRecentReports]     = useState<any[]>([]);
  const [isLoading,         setIsLoading]         = useState(true);
  const [deletingId,        setDeletingId]        = useState<string | null>(null);
  // Two-step delete confirm — first click arms, second click within 4s
  // actually deletes. Avoids accidental loss without needing a modal.
  const [confirmDeleteId,   setConfirmDeleteId]   = useState<string | null>(null);

  /* ── listen for principal's generated reports ── */
  // schoolId-only at server; branchId in-memory (memory:
  // bug_pattern_branch_filter_on_event_streams + branchid_inference_lag).
  // Reports are events — server-side branchId filter silently dropped
  // every doc whose branchId field was missing or hadn't yet been
  // backfilled by the enforceBranchId trigger.
  useEffect(() => {
    if (!userData?.schoolId) return;
    const branchId = userData.branchId as string | undefined;
    const inBranch = (raw: any) => !branchId || !raw?.branchId || raw.branchId === branchId;

    const q = query(
      collection(db, "principal_reports"),
      where("schoolId", "==", userData.schoolId),
    );
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(inBranch)
        .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setRecentReports(docs.slice(0, 10));
      setIsLoading(false);
    }, err => {
      console.error("[Reports] listener failed:", err);
      setIsLoading(false);
    });
    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  /* ── delete a report — two-step confirm + atomic two-doc delete ── */
  // First click: arm confirm (button morphs to "Confirm?"). Auto-clears
  // after 4s if the user does nothing.
  // Second click within the window: writeBatch deletes from BOTH
  // principal_reports AND reports (mirror) so the report disappears
  // everywhere — without the mirror delete, parents/teachers would
  // keep seeing the report forever.
  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      // Auto-disarm after 4s.
      window.setTimeout(() => {
        setConfirmDeleteId(curr => (curr === id ? null : curr));
      }, 4000);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "principal_reports", id));
      // Mirror in `reports` uses the SAME id (post-fix). For OLD reports
      // that pre-date the same-id write, the mirror has a different id —
      // skip silently rather than throwing (best-effort).
      const mirrorRef = doc(db, "reports", id);
      const mirrorSnap = await getDoc(mirrorRef);
      if (mirrorSnap.exists()) batch.delete(mirrorRef);
      await batch.commit();
      toast.success("Report deleted.");
    } catch (e) {
      console.error("[Reports] delete failed:", e);
      toast.error("Failed to delete. Try again.");
    }
    setDeletingId(null);
  };

  /* ── download: open print view (professional template) ── */
  // Brand fields passed to every report:
  //   logoUrl     → principal's uploaded logo (Settings → Branding)
  //   schoolName  → school's display name
  //   themeColor  → app primary OR principal-set brand color
  // safeImageUrl + safeColor on the template side reject malformed values.
  const handleDownload = (report: any) => {
    const d = report.data || {};
    // Prefer template-specific heroStats + sections saved at generate-time
    // (new flow). Fall back to legacy hardcoded shape for old reports
    // generated before buildPayload was introduced.
    const heroStats = Array.isArray(d.heroStats) && d.heroStats.length > 0
      ? d.heroStats
      : [
          { label: "Total Students", value: d.totalStudents ?? "—" },
          { label: "Avg Attendance", value: `${d.avgAttendance ?? 0}%`, color: (d.avgAttendance ?? 0) >= 85 ? "#4ade80" : "#fbbf24" },
          { label: "Avg Marks",      value: `${d.avgMarks ?? 0}%`,      color: (d.avgMarks ?? 0) >= 75 ? "#4ade80" : "#fbbf24" },
          { label: "At-Risk",        value: d.atRisk ?? "—",            color: (d.atRisk ?? 0) > 0 ? "#f87171" : "#4ade80" },
        ];
    const sections = Array.isArray(d.sections) && d.sections.length > 0
      ? d.sections
      : [
          {
            title: "Performance Overview",
            type: "bars" as const,
            bars: [
              { label: "Average Attendance", value: d.avgAttendance ?? 0 },
              { label: "Average Marks",      value: d.avgMarks ?? 0 },
              { label: "Pass Rate",          value: d.passRate ?? 0 },
            ],
          },
          {
            title: "Key Metrics",
            type: "stats" as const,
            stats: [
              { label: "Total Students",       value: d.totalStudents ?? "—" },
              { label: "At-Risk Students",     value: d.atRisk ?? "0", color: "#dc2626" },
              { label: "Discipline Incidents", value: d.incidents ?? "0" },
              { label: "Report Type",          value: report.type || "General" },
              { label: "Status",               value: report.status || "Draft" },
            ],
          },
        ];

    const html = buildReport({
      title: report.title || "Report",
      subtitle: `Generated by ${report.generatedBy || "Principal"} · ${report.format || "PDF"} Format`,
      badge: report.className || report.grade || "",
      schoolName:
        report.branchName
        || (userData as any)?.branchName
        || (userData as any)?.branch
        || (userData as any)?.branchTitle
        || report.schoolName
        || userData?.schoolName
        || "Edullent",
      generatedBy: userData?.name || "Principal",
      logoUrl: (userData as any)?.logoUrl || "",
      themeColor: (userData as any)?.themeColor || "#0055FF",
      heroStats,
      sections,
    });
    openReportWindow(html);
  };

  /* ── if generate view open ── */
  if (selectedTemplate) {
    return (
      <GenerateReport
        templateName={selectedTemplate}
        onBack={() => setSelectedTemplate(null)}
      />
    );
  }

  // Design tokens
  const B1 = "#0055FF", B2 = "#1166FF", B4 = "#4499FF";
  const BG = "#EEF4FF";
  const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
  const SEP = "rgba(0,85,255,0.08)";
  const GREEN = "#00C853", GREEN_D = "#007830", GREEN_S = "rgba(0,200,83,0.10)", GREEN_B = "rgba(0,200,83,0.22)";
  const RED = "#FF3355", RED_S = "rgba(255,51,85,0.10)", RED_B = "rgba(255,51,85,0.22)";
  const ORANGE = "#FF8800", ORANGE_S = "rgba(255,136,0,0.10)", ORANGE_B = "rgba(255,136,0,0.22)";
  const GOLD = "#FFAA00", GOLD_S = "rgba(255,170,0,0.10)", GOLD_B = "rgba(255,170,0,0.22)";
  const VIOLET = "#7B3FF4", VIOLET_S = "rgba(123,63,244,0.10)", VIOLET_B = "rgba(123,63,244,0.22)";
  const SH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
  const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";
  const SH_BTN = "0 6px 22px rgba(0,85,255,0.38), 0 2px 5px rgba(0,85,255,0.18)";

  const toneStyles = {
    blue:   { card: "linear-gradient(135deg,#DDEAFF 0%,#A8C5FF 55%,#7AA5FF 100%)", border: "rgba(0,85,255,.40)", nameColor: "#001055", countColor: "#002080", iconColor: "#001055" },
    green:  { card: "linear-gradient(135deg,#DEFCE8 0%,#8CF0B0 55%,#50E088 100%)", border: "rgba(0,200,83,.40)", nameColor: "#004018", countColor: "#005A20", iconColor: "#004018" },
    red:    { card: "linear-gradient(135deg,#FFE3E8 0%,#FFA8B8 55%,#FF7085 100%)", border: "rgba(255,51,85,.40)", nameColor: "#60081A", countColor: "#8A0A22", iconColor: "#60081A" },
    orange: { card: "linear-gradient(135deg,#FFEED1 0%,#FFCC77 55%,#FFAA33 100%)", border: "rgba(255,136,0,.40)", nameColor: "#472200", countColor: "#663300", iconColor: "#472200" },
    violet: { card: "linear-gradient(135deg,#EEE0FF 0%,#C9A8FF 55%,#A880FF 100%)", border: "rgba(123,63,244,.40)", nameColor: "#280C5C", countColor: "#3A1580", iconColor: "#280C5C" },
  } as const;

  // Shared category-card palette so mobile + desktop render with the same vibe.
  // Bright accent name color (with green darkened for legibility on pale green).
  const categoryPalette: Record<string, { cardGrad: string; tileGrad: string; tileShadow: string; nameColor: string; decorColor: string; ringColor: string }> = {
    blue: {
      cardGrad: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
      tileGrad: `linear-gradient(135deg, ${B1}, ${B2})`,
      tileShadow: "0 4px 14px rgba(0,85,255,0.28)",
      nameColor: B1,
      decorColor: B1,
      ringColor: "rgba(0,85,255,0.42)",
    },
    green: {
      cardGrad: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
      tileGrad: `linear-gradient(135deg, ${GREEN}, #22EE66)`,
      tileShadow: "0 4px 14px rgba(0,200,83,0.26)",
      nameColor: GREEN_D,
      decorColor: GREEN,
      ringColor: "rgba(0,200,83,0.42)",
    },
    red: {
      cardGrad: "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)",
      tileGrad: `linear-gradient(135deg, ${RED}, #FF6688)`,
      tileShadow: "0 4px 14px rgba(255,51,85,0.28)",
      nameColor: RED,
      decorColor: RED,
      ringColor: "rgba(255,51,85,0.42)",
    },
    orange: {
      cardGrad: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
      tileGrad: `linear-gradient(135deg, ${GOLD}, #FFDD44)`,
      tileShadow: "0 4px 14px rgba(255,170,0,0.28)",
      nameColor: GOLD,
      decorColor: GOLD,
      ringColor: "rgba(255,170,0,0.42)",
    },
    violet: {
      cardGrad: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
      tileGrad: `linear-gradient(135deg, ${VIOLET}, #A07CF8)`,
      tileShadow: "0 4px 14px rgba(123,63,244,0.26)",
      nameColor: VIOLET,
      decorColor: VIOLET,
      ringColor: "rgba(123,63,244,0.42)",
    },
  };

  const templateToneGrad = (tone: string) => {
    if (tone === "blue")   return { bg: "rgba(0,85,255,0.10)", border: "rgba(0,85,255,0.22)", color: B1 };
    if (tone === "green")  return { bg: GREEN_S, border: GREEN_B, color: GREEN };
    if (tone === "red")    return { bg: RED_S, border: RED_B, color: RED };
    if (tone === "orange") return { bg: ORANGE_S, border: ORANGE_B, color: ORANGE };
    if (tone === "violet") return { bg: VIOLET_S, border: VIOLET_B, color: VIOLET };
    if (tone === "gold")   return { bg: GOLD_S, border: GOLD_B, color: GOLD };
    return { bg: "rgba(0,85,255,0.10)", border: "rgba(0,85,255,0.22)", color: B1 };
  };

  // Dashboard-mobile card vibe per tone — pastel gradient bg + bold brand-gradient
  // icon tile + tinted name color for legibility on the pastel.
  const vibeFor = (tone: string) => {
    switch (tone) {
      case "blue":
        return {
          cardBg: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
          iconBg: `linear-gradient(135deg, ${B1}, ${B2})`,
          iconShadow: "0 4px 14px rgba(0,85,255,0.28)",
          accent: B1, nameColor: "#001055", subColor: T3,
        };
      case "green":
        return {
          cardBg: "linear-gradient(135deg, #D6ECDD 0%, #F7FBF8 100%)",
          iconBg: `linear-gradient(135deg, ${GREEN}, #22EE66)`,
          iconShadow: "0 4px 14px rgba(0,200,83,0.26)",
          accent: GREEN, nameColor: GREEN_D, subColor: GREEN_D,
        };
      case "red":
        return {
          cardBg: "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)",
          iconBg: `linear-gradient(135deg, ${RED}, #FF6688)`,
          iconShadow: "0 4px 14px rgba(255,51,85,0.28)",
          accent: RED, nameColor: "#8A0A22", subColor: "#8A0A22",
        };
      case "orange":
        return {
          cardBg: "linear-gradient(135deg, #FBDDC4 0%, #FEF3EB 100%)",
          iconBg: `linear-gradient(135deg, ${ORANGE}, #FFB044)`,
          iconShadow: "0 4px 14px rgba(255,136,0,0.28)",
          accent: ORANGE, nameColor: "#663300", subColor: "#663300",
        };
      case "violet":
        return {
          cardBg: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
          iconBg: `linear-gradient(135deg, ${VIOLET}, #A07CF8)`,
          iconShadow: "0 4px 14px rgba(123,63,244,0.26)",
          accent: VIOLET, nameColor: "#280C5C", subColor: "#280C5C",
        };
      case "gold":
        return {
          cardBg: "linear-gradient(135deg, #FBE5B6 0%, #FEFAEE 100%)",
          iconBg: `linear-gradient(135deg, ${GOLD}, #FFDD44)`,
          iconShadow: "0 4px 14px rgba(255,170,0,0.28)",
          accent: GOLD, nameColor: "#A86A00", subColor: "#A86A00",
        };
      default:
        return {
          cardBg: "linear-gradient(135deg, #DEE6F8 0%, #F8FAFE 100%)",
          iconBg: `linear-gradient(135deg, ${B1}, ${B2})`,
          iconShadow: "0 4px 14px rgba(0,85,255,0.28)",
          accent: B1, nameColor: "#001055", subColor: T3,
        };
    }
  };

  // Real counts derived from data — NEVER fabricate (memory:
  // bug_pattern_fabricated_fallback). totalTemplates = pre-built only;
  // "Custom" is a builder, not a counted template.
  const totalTemplates = templates.length;
  const categoriesCount = reportCategories.length;
  const preBuiltCount = templates.length;
  const countByCategory: Record<CategoryId, number> = {
    academic: 0, attendance: 0, discipline: 0, communication: 0, custom: 0,
  };
  templates.forEach(t => { countByCategory[t.categoryId]++; });
  const categoryCountLabel = (id: CategoryId) =>
    id === "custom"
      ? "Build your own"
      : `${countByCategory[id]} template${countByCategory[id] === 1 ? "" : "s"}`;
  // Filtered templates for the active category. Custom is special-cased
  // in the render — shows a "build any report" CTA, not a templates list.
  const visibleTemplates =
    activeCategory === "custom"
      ? []
      : templates.filter(t => t.categoryId === activeCategory);

  // ═══════════════════════════════════════════════════════════════
  //  MOBILE
  // ═══════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: BG, minHeight: "100vh" }}>

        {/* Page head */}
        <div className="px-5 pt-4 flex items-center gap-3">
          <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
            <FileText className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[22px] font-bold leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>Reports</div>
            <div className="text-[11px] mt-1" style={{ color: T3 }}>Generate and manage school reports</div>
          </div>
        </div>

        {/* Hero */}
        <div className="mx-5 mt-[14px] rounded-[22px] px-[18px] py-4 relative overflow-hidden text-white"
          style={{
            background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
            boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-9 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center justify-between mb-[14px] relative z-10">
            <div className="flex items-center gap-[10px]">
              <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
                <BarChart3 className="w-[18px] h-[18px] text-white" strokeWidth={2.1} />
              </div>
              <div>
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.50)" }}>Available Reports</div>
                <div className="text-[26px] font-bold leading-none" style={{ letterSpacing: "-0.8px" }}>{totalTemplates} Templates</div>
              </div>
            </div>
            <div className="flex items-center gap-[5px] px-3 py-[5px] rounded-full text-[11px] font-bold"
              style={{ background: "rgba(0,200,83,0.22)", border: "0.5px solid rgba(0,200,83,0.40)", color: "#66FFAA" }}>
              <div className="w-[6px] h-[6px] rounded-full" style={{ background: "#66FFAA", boxShadow: "0 0 8px rgba(102,255,170,0.8)" }} />
              Ready
            </div>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: categoriesCount, lbl: "Categories", color: "#fff" },
              { val: preBuiltCount,   lbl: "Pre-built",  color: "#FFDD88" },
              { val: recentReports.length, lbl: "Generated", color: "#66EE88" },
            ].map(x => (
              <div key={x.lbl} className="text-center py-[11px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[16px] font-bold leading-none mb-[3px]" style={{ color: x.color, letterSpacing: "-0.3px" }}>{x.val}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{x.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category cards */}
        <div className="grid grid-cols-2 gap-[10px] px-5 pt-[14px]">
          {reportCategories.map(cat => {
            const v = vibeFor(cat.tone);
            const active = activeCategory === cat.id;
            const isCustom = cat.id === "custom";
            const Icon = cat.icon;
            return (
              <button key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`${isCustom ? "col-span-2" : ""} rounded-[20px] p-4 relative overflow-hidden active:scale-[0.96] transition-transform text-left min-h-[110px]`}
                style={{
                  background: v.cardBg,
                  border: active ? `1.5px solid ${v.accent}` : "0.5px solid rgba(0,85,255,0.10)",
                  boxShadow: active
                    ? `0 0 0 3px ${v.accent}22, 0 8px 22px rgba(0,0,0,0.10)`
                    : SH_LG,
                  transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                <div className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center mb-[10px] relative z-10"
                  style={{ background: v.iconBg, boxShadow: v.iconShadow }}>
                  <Icon className="w-[22px] h-[22px] text-white" strokeWidth={2.3} />
                </div>
                <div className="relative z-10">
                  <div className="text-[14px] font-bold leading-[1.15] mb-[3px]" style={{ color: v.nameColor, letterSpacing: "-0.2px" }}>
                    {cat.label}
                  </div>
                  <div className="text-[11px] font-semibold" style={{ color: v.subColor }}>{categoryCountLabel(cat.id)}</div>
                </div>
                <Icon className="absolute bottom-[10px] right-[10px] w-12 h-12 pointer-events-none"
                  style={{ color: v.accent, opacity: 0.18 }} strokeWidth={2} />
              </button>
            );
          })}
        </div>

        {/* Pre-built label */}
        <div className="flex items-center gap-2 px-5 pt-4 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
          <span>{activeCategory === "custom" ? "Custom Builder" : `${reportCategories.find(c => c.id === activeCategory)?.label} Templates`}</span>
          <span className="px-[9px] py-[3px] rounded-full ml-1" style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.16)", color: B1 }}>
            {activeCategory === "custom" ? "Build your own" : `${visibleTemplates.length} template${visibleTemplates.length === 1 ? "" : "s"}`}
          </span>
          <span className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
        </div>

        {/* Templates grid 2-col — filtered by activeCategory */}
        {activeCategory === "custom" ? (
          <div className="px-5 pt-3">
            <button
              onClick={() => setSelectedTemplate("Custom")}
              className="w-full rounded-[18px] p-5 active:scale-[0.98] transition-transform text-left relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
                border: "0.5px solid rgba(123,63,244,0.18)",
                boxShadow: SH_LG,
                transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
              }}>
              <div className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center mb-3 relative z-10"
                style={{ background: `linear-gradient(135deg, ${VIOLET}, #A07CF8)`, boxShadow: "0 4px 14px rgba(123,63,244,0.26)" }}>
                <Settings className="w-[22px] h-[22px] text-white" strokeWidth={2.3} />
              </div>
              <div className="text-[14px] font-bold leading-[1.15] mb-1 relative z-10" style={{ color: "#280C5C", letterSpacing: "-0.2px" }}>Build your own report</div>
              <div className="text-[11px] font-semibold relative z-10" style={{ color: "#280C5C", opacity: 0.7 }}>Pick any report type with custom date range, grade & section</div>
            </button>
          </div>
        ) : visibleTemplates.length === 0 ? (
          <div className="mx-5 mt-3 bg-white rounded-[18px] py-8 text-center" style={{ border: "0.5px dashed rgba(0,85,255,0.22)", boxShadow: SH }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: T3 }}>No templates yet in this category</div>
            <div className="text-[10px] mt-1" style={{ color: T4 }}>Use Custom builder to generate one</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-[10px] px-5 pt-3">
            {visibleTemplates.map((tpl, i) => {
              const v = vibeFor(tpl.tone);
              const Icon = tpl.icon;
              return (
                <button key={i}
                  onClick={() => setSelectedTemplate(tpl.title)}
                  className="rounded-[18px] p-[14px] active:scale-[0.97] transition-transform text-left relative overflow-hidden min-h-[100px]"
                  style={{
                    background: v.cardBg,
                    border: "0.5px solid rgba(0,85,255,0.10)",
                    boxShadow: SH,
                    transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                  }}>
                  <div className="w-[36px] h-[36px] rounded-[11px] flex items-center justify-center mb-[8px] relative z-10"
                    style={{ background: v.iconBg, boxShadow: v.iconShadow }}>
                    <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
                  </div>
                  <div className="text-[12px] font-bold leading-[1.2] mb-[3px] relative z-10" style={{ color: v.nameColor, letterSpacing: "-0.1px" }}>{tpl.title}</div>
                  <div className="text-[10px] font-semibold leading-[1.4] relative z-10" style={{ color: v.subColor }}>{tpl.desc}</div>
                  <Icon className="absolute bottom-[8px] right-[8px] w-9 h-9 pointer-events-none"
                    style={{ color: v.accent, opacity: 0.18 }} strokeWidth={2} />
                </button>
              );
            })}
          </div>
        )}

        {/* Recents label */}
        <div className="flex items-center gap-2 px-5 pt-4 text-[9px] font-bold uppercase tracking-[0.10em]" style={{ color: T4 }}>
          <span>Recently Generated</span>
          <span className="px-[9px] py-[3px] rounded-full ml-1" style={{ background: "rgba(0,85,255,0.10)", border: "0.5px solid rgba(0,85,255,0.16)", color: B1 }}>
            {recentReports.length} report{recentReports.length === 1 ? "" : "s"}
          </span>
          <span className="flex-1 h-[0.5px]" style={{ background: "rgba(0,85,255,0.12)" }} />
        </div>

        {/* Recents body */}
        {isLoading ? (
          <div className="mx-5 mt-[10px] bg-white rounded-[18px] py-10 flex flex-col items-center gap-3" style={{ border: "0.5px dashed rgba(0,85,255,0.22)", boxShadow: SH }}>
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: B1 }} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T4 }}>Loading reports…</p>
          </div>
        ) : recentReports.length === 0 ? (
          <div className="mx-5 mt-[10px] bg-white rounded-[18px] py-6 px-4 text-center" style={{ border: "0.5px dashed rgba(0,85,255,0.22)", boxShadow: SH }}>
            <div className="w-[46px] h-[46px] rounded-[14px] mx-auto mb-[10px] flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#E5EEFF,#D4E4FF)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
              <Clock className="w-[22px] h-[22px]" style={{ color: B1 }} strokeWidth={2.2} />
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: T3 }}>No reports generated yet</div>
            <div className="text-[10px] font-medium" style={{ color: T4 }}>Start by picking a template above</div>
          </div>
        ) : (
          <div className="px-5 pt-3 space-y-2">
            {recentReports.map(report => (
              <div key={report.id} className="bg-white rounded-[14px] p-3 flex items-center gap-3"
                style={{ border: `0.5px solid ${SEP}`, boxShadow: SH }}>
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0"
                  style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 3px 10px rgba(0,85,255,0.22)" }}>
                  <FileText className="w-4 h-4 text-white" strokeWidth={2.3} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold truncate" style={{ color: T1 }}>{report.title}</p>
                  <p className="text-[10px] font-medium mt-0.5" style={{ color: T3 }}>
                    {report.createdAt?.toDate?.().toLocaleDateString("en-IN", { day: "numeric", month: "short" }) || "—"} · {report.format || "PDF"}
                  </p>
                </div>
                <button onClick={() => handleDownload(report)}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(0,85,255,0.10)", color: B1 }}>
                  <Download className="w-[13px] h-[13px]" strokeWidth={2.3} />
                </button>
                <button onClick={() => handleDelete(report.id)} disabled={deletingId === report.id}
                  className={`${confirmDeleteId === report.id ? "px-2 w-auto" : "w-8"} h-8 rounded-[10px] flex items-center justify-center gap-1 disabled:opacity-50 transition-all`}
                  style={{
                    background: confirmDeleteId === report.id ? RED : RED_S,
                    color: confirmDeleteId === report.id ? "#fff" : RED,
                  }}>
                  {deletingId === report.id ? (
                    <Loader2 className="w-[13px] h-[13px] animate-spin" />
                  ) : confirmDeleteId === report.id ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.06em]">Confirm?</span>
                  ) : (
                    <Trash2 className="w-[13px] h-[13px]" strokeWidth={2.3} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Action stack */}
        <div className="px-5 pt-3">
          <button onClick={() => setSelectedTemplate("Custom")}
            className="w-full h-[46px] rounded-[14px] flex items-center justify-center gap-[7px] text-[13px] font-bold text-white relative overflow-hidden active:scale-[0.97] transition-transform"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[15px] h-[15px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Generate New Report</span>
          </button>
          <div className="flex gap-2 mt-2">
            <button onClick={() => toast.info("Scheduling panel coming soon")}
              className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-[6px] text-[11px] font-bold bg-white active:scale-[0.96] transition-transform"
              style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <Calendar className="w-[12px] h-[12px]" strokeWidth={2.3} />
              Schedule
            </button>
            <button onClick={() => toast.info("Export kicked off")}
              className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-[6px] text-[11px] font-bold bg-white active:scale-[0.96] transition-transform"
              style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <Download className="w-[12px] h-[12px]" strokeWidth={2.3} />
              Export Data
            </button>
          </div>
        </div>

        <div className="h-6" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 6px 18px rgba(0,85,255,0.28)" }}>
            <FileText className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-bold leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>Reports</div>
            <div className="text-[12px] mt-1" style={{ color: T3 }}>Generate and manage school reports</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Scheduling panel coming soon")}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH }}>
            <Calendar className="w-[14px] h-[14px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
            Schedule
          </button>
          <button onClick={() => toast.info("Export kicked off")}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-bold bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH }}>
            <Download className="w-[14px] h-[14px]" style={{ color: "rgba(0,85,255,0.6)" }} strokeWidth={2.3} />
            Export Data
          </button>
          <button onClick={() => setSelectedTemplate("Custom")}
            className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[14px] h-[14px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Generate New Report</span>
          </button>
        </div>
      </div>

      {/* Dark Hero */}
      <div className="rounded-[22px] px-7 py-6 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <BarChart3 className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-[6px]" style={{ color: "rgba(255,255,255,0.55)" }}>Available Reports</div>
              <div className="flex items-baseline gap-3">
                <span className="text-[48px] font-bold leading-none tracking-tight">{totalTemplates}</span>
                <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>templates</span>
                <span className="flex items-center gap-[5px] px-3 py-[6px] rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(0,200,83,0.22)", border: "0.5px solid rgba(0,200,83,0.40)", color: "#66FFAA" }}>
                  <div className="w-[6px] h-[6px] rounded-full" style={{ background: "#66FFAA", boxShadow: "0 0 8px rgba(102,255,170,0.8)" }} />
                  Ready
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            {[
              { val: categoriesCount, lbl: "Categories", color: "#fff" },
              { val: preBuiltCount,   lbl: "Pre-built",  color: "#FFDD88" },
              { val: recentReports.length, lbl: "Generated", color: "#66EE88" },
            ].map(x => (
              <div key={x.lbl} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <span className="text-[14px] font-bold" style={{ color: x.color }}>{x.val}</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>{x.lbl}</div>
                  <div className="text-[18px] font-bold leading-none" style={{ letterSpacing: "-0.3px", color: x.color }}>{x.val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category cards 5-col — dashboard-style */}
      <div className="grid grid-cols-5 gap-4 mt-5">
        {reportCategories.map(cat => {
          const active = activeCategory === cat.id;
          const p = categoryPalette[cat.tone];
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="rounded-[20px] p-5 relative overflow-hidden transition-transform hover:-translate-y-0.5 text-left flex flex-col min-h-[150px]"
              style={{
                background: p.cardGrad,
                border: `0.5px solid ${active ? p.ringColor : "rgba(0,85,255,0.08)"}`,
                boxShadow: active
                  ? `0 0 0 2px ${p.ringColor}, 0 6px 20px rgba(0,85,255,0.10), 0 22px 56px rgba(0,85,255,0.10)`
                  : "0 0 0 0.5px rgba(0,85,255,0.14), 0 6px 20px rgba(0,85,255,0.10), 0 22px 56px rgba(0,85,255,0.10)",
              }}>
              <div
                className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
                style={{ background: p.tileGrad, boxShadow: p.tileShadow }}
              >
                <cat.icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
              </div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.10em] mb-1.5" style={{ color: "#99AACC" }}>{cat.id === "custom" ? "Custom" : "Category"}</span>
              <p className="text-[20px] font-bold tracking-tight leading-tight mb-1" style={{ color: p.nameColor, letterSpacing: "-0.5px" }}>{cat.label}</p>
              <p className="text-[11px] font-semibold truncate" style={{ color: "#5070B0" }}>{categoryCountLabel(cat.id)}</p>
              <cat.icon
                className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                style={{ color: p.decorColor, opacity: 0.18 }}
                strokeWidth={2}
              />
            </button>
          );
        })}
      </div>

      {/* Pre-built templates — filtered by activeCategory */}
      <div className="mt-5 bg-white rounded-[20px] p-6"
        style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
        <div className="flex items-center gap-[10px] mb-4">
          <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.26)" }}>
            <Layout className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <h2 className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>
            {activeCategory === "custom"
              ? "Custom Builder"
              : `${reportCategories.find(c => c.id === activeCategory)?.label} Templates`}
          </h2>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full"
            style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
            {activeCategory === "custom"
              ? "Build your own"
              : `${visibleTemplates.length} template${visibleTemplates.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {activeCategory === "custom" ? (
          <button
            onClick={() => setSelectedTemplate("Custom")}
            className="w-full rounded-[14px] p-5 flex items-center gap-4 text-left transition-all hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #DDD0EF 0%, #F8F4FD 100%)",
              border: "0.5px solid rgba(123,63,244,0.20)",
              boxShadow: SH,
            }}>
            <div className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${VIOLET}, #A07CF8)`, boxShadow: "0 4px 14px rgba(123,63,244,0.26)" }}>
              <Settings className="w-[22px] h-[22px] text-white" strokeWidth={2.3} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold mb-1" style={{ color: "#280C5C", letterSpacing: "-0.2px" }}>Build your own report</div>
              <div className="text-[12px] font-medium" style={{ color: "#280C5C", opacity: 0.75 }}>
                Pick any report type with custom date range, grade & section filters.
              </div>
            </div>
          </button>
        ) : visibleTemplates.length === 0 ? (
          <div className="py-10 text-center rounded-[14px]" style={{ border: `0.5px dashed ${SEP}`, background: BG }}>
            <p className="text-[12px] font-bold mb-1" style={{ color: T2 }}>No templates yet in this category</p>
            <p className="text-[11px]" style={{ color: T4 }}>Use Custom builder to generate one</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {visibleTemplates.map((tpl, i) => {
              const theme = templateToneGrad(tpl.tone);
              return (
                <button key={i}
                  onClick={() => setSelectedTemplate(tpl.title)}
                  className="rounded-[14px] px-4 py-4 flex items-center gap-3 text-left transition-all hover:-translate-y-0.5 hover:bg-white"
                  style={{ background: BG, border: `0.5px solid ${SEP}` }}>
                  <div className="w-10 h-10 rounded-[11px] flex items-center justify-center shrink-0"
                    style={{ background: theme.bg, border: `0.5px solid ${theme.border}` }}>
                    <tpl.icon className="w-[18px] h-[18px]" style={{ color: theme.color }} strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold mb-0.5" style={{ color: T1, letterSpacing: "-0.2px" }}>{tpl.title}</div>
                    <div className="text-[11px] font-medium truncate" style={{ color: T4 }}>{tpl.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently generated */}
      <div className="mt-5 bg-white rounded-[20px] overflow-hidden"
        style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
        <div className="flex items-center justify-between px-6 py-[18px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
          <div className="flex items-center gap-[10px]">
            <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
              style={{ background: VIOLET_S, border: `0.5px solid ${VIOLET_B}` }}>
              <Clock className="w-4 h-4" style={{ color: VIOLET }} strokeWidth={2.4} />
            </div>
            <h2 className="text-[15px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>Recently Generated</h2>
            <span className="text-[11px] font-bold px-3 py-1 rounded-full"
              style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.18)" }}>
              {recentReports.length}
            </span>
          </div>
          {recentReports.length > 0 && (
            <button className="text-[12px] font-bold flex items-center gap-1 transition-colors" style={{ color: B1 }}>
              View All <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T4 }}>Loading reports…</p>
          </div>
        ) : recentReports.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <div className="w-[54px] h-[54px] rounded-[16px] flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#E5EEFF,#D4E4FF)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
              <Clock className="w-6 h-6" style={{ color: B1 }} strokeWidth={2.2} />
            </div>
            <p className="text-[13px] font-bold" style={{ color: T1 }}>No reports generated yet</p>
            <p className="text-[11px]" style={{ color: T4 }}>Click "Generate New Report" above to create one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ background: BG, borderBottom: `0.5px solid ${SEP}` }}>
                  {["Report Name", "Type", "Generated On", "Format", "Actions"].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: T4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentReports.map(report => {
                  const fmt = (report.format || "PDF") as "PDF" | "Excel" | "CSV";
                  const fmtTheme = fmt === "Excel" ? { bg: GREEN_S, color: GREEN_D, border: GREEN_B } :
                                   fmt === "CSV"   ? { bg: "rgba(0,85,255,0.10)", color: B1, border: "rgba(0,85,255,0.20)" } :
                                                     { bg: RED_S, color: RED, border: RED_B };
                  return (
                    <tr key={report.id} className="transition-colors hover:bg-[#F8FAFF]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 3px 10px rgba(0,85,255,0.22)" }}>
                            <FileText className="w-4 h-4 text-white" strokeWidth={2.3} />
                          </div>
                          <div>
                            <p className="text-[13px] font-bold" style={{ color: T1 }}>{report.title}</p>
                            <p className="text-[11px] font-medium" style={{ color: T3 }}>{report.generatedBy || "System"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-[4px] rounded-full text-[11px] font-bold"
                          style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.20)" }}>
                          {report.reportType || "General"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[12px] font-medium" style={{ color: T3 }}>
                        {report.createdAt?.toDate?.().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-[4px] rounded-full text-[10px] font-bold uppercase tracking-[0.08em]"
                          style={{ background: fmtTheme.bg, color: fmtTheme.color, border: `0.5px solid ${fmtTheme.border}` }}>
                          {fmt}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDownload(report)}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[11px] text-[11px] font-bold text-white transition-transform hover:scale-[1.04]"
                            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 3px 10px rgba(0,85,255,0.22)" }}>
                            <Download className="w-[13px] h-[13px]" strokeWidth={2.4} />
                            Download
                          </button>
                          <button onClick={() => handleDelete(report.id)} disabled={deletingId === report.id}
                            className={`${confirmDeleteId === report.id ? "px-3 w-auto" : "w-9"} h-9 rounded-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all hover:scale-[1.04]`}
                            style={{
                              background: confirmDeleteId === report.id ? RED : "#fff",
                              border: `0.5px solid ${confirmDeleteId === report.id ? RED : "rgba(255,51,85,0.20)"}`,
                              color: confirmDeleteId === report.id ? "#fff" : RED,
                            }}>
                            {deletingId === report.id ? (
                              <Loader2 className="w-[13px] h-[13px] animate-spin" />
                            ) : confirmDeleteId === report.id ? (
                              <span className="text-[11px] font-bold uppercase tracking-[0.06em]">Confirm Delete?</span>
                            ) : (
                              <Trash2 className="w-[13px] h-[13px]" strokeWidth={2.3} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Card */}
      <div className="mt-5 rounded-[22px] px-7 py-6 relative overflow-hidden"
        style={{
          background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-2 mb-3 relative z-10">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
            <BarChart3 className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Reports Intelligence</span>
        </div>
        <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
          <strong style={{ color: "#fff", fontWeight: 700 }}>{totalTemplates} templates</strong> available across <strong style={{ color: "#fff", fontWeight: 700 }}>{categoriesCount} categories</strong>, with <strong style={{ color: "#fff", fontWeight: 700 }}>{preBuiltCount} ready-to-use pre-built reports</strong>.
          {recentReports.length > 0 ? <> You've generated <strong style={{ color: "#fff", fontWeight: 700 }}>{recentReports.length} report{recentReports.length === 1 ? "" : "s"}</strong> recently — downloads publish to both teachers and parents automatically.</> : <> Generate your first report to publish insights to teachers and parents.</>}
        </p>
        <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
          <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: B4 }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-scoped to {userData?.schoolName || "your school"}</span>
        </div>
      </div>
    </div>
  );
};

export default Reports;