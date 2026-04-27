import { useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  LayoutGrid, Users, Brain, AlertTriangle, Monitor,
  GraduationCap, BookOpen, AlignLeft, CalendarCheck,
  ShieldAlert, MessageSquare, MessageCircle, FileText,
  ClipboardList, TrendingUp, Trophy, Award, DollarSign,
  Bookmark, Clock, Shield, BarChart2, Settings,
  type LucideIcon,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  accent:      "#1C0770",
  accentLight: "#EDE9FF",
  sidebar:     "#ffffff",
  pageBg:      "#ECEEF5",   // outer background behind the floating sidebar
  textMuted:   "#8A94A6",
  textBody:    "#4A5568",
  textDark:    "#1A202C",
  border:      "#ECEEF4",
  CURVE:       16,
  ITEM_H:      36,
  ICON:        17,
  LEFT_PAD:    16,
  GAP:         10,          // gap around sidebar (top / left / bottom)
  RADIUS:      16,          // sidebar card border-radius
};

// ── Nav data ──────────────────────────────────────────────────────────────────
type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
  special?: boolean;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    id: "overview", label: "Overview",
    items: [
      { id: "dashboard",   label: "Dashboard",             icon: LayoutGrid },
    ],
  },
  {
    id: "students", label: "Students",
    items: [
      { id: "students",    label: "Students",              icon: Users         },
      { id: "intelligence",label: "Student Intelligence",  icon: Brain         },
      { id: "risk",        label: "Risk Students",         icon: AlertTriangle },
    ],
  },
  {
    id: "academic", label: "Academic Setup",
    items: [
      { id: "classes",     label: "Classes & Sections",    icon: Monitor       },
      { id: "academics",   label: "Academics",             icon: BookOpen      },
      { id: "syllabus",    label: "Syllabus",              icon: AlignLeft     },
      { id: "timetable",   label: "Timetable Setup",       icon: Clock         },
      { id: "examStruct",  label: "Exam Structure",        icon: Bookmark      },
    ],
  },
  {
    id: "staff", label: "Staff",
    items: [
      { id: "teachers",    label: "Teachers",              icon: GraduationCap },
      { id: "tNotes",      label: "Teacher Notes",         icon: MessageCircle },
      { id: "performance", label: "Teacher Performance",   icon: TrendingUp    },
      { id: "leaderboard", label: "Teacher Leaderboard",   icon: Trophy        },
      { id: "principal",   label: "Principal Leaderboards",icon: Award         },
      { id: "staffAccess", label: "Staff Access",          icon: Shield, badge: true },
    ],
  },
  {
    id: "assessment", label: "Assessment",
    items: [
      { id: "attendance",  label: "Attendance",            icon: CalendarCheck },
      { id: "exams",       label: "Exams & Results",       icon: FileText      },
      { id: "assignments", label: "Assignments & Marks",   icon: ClipboardList },
    ],
  },
  {
    id: "comms", label: "Communication",
    items: [
      { id: "discipline",  label: "Discipline & Incidents",icon: ShieldAlert   },
      { id: "parentComm",  label: "Parent Communication",  icon: MessageSquare },
    ],
  },
  {
    id: "admin", label: "Administration",
    items: [
      { id: "fee",         label: "Fee Structure",         icon: DollarSign    },
      { id: "reports",     label: "Reports",               icon: BarChart2     },
      { id: "settings",    label: "Settings",              icon: Settings, special: true },
    ],
  },
];

// id → route path glue (kept outside the design code; visually irrelevant)
const ID_TO_PATH: Record<string, string> = {
  dashboard:    "/",
  students:     "/students",
  intelligence: "/student-intelligence",
  risk:         "/risk-students",
  classes:      "/classes",
  academics:    "/academics",
  syllabus:     "/syllabus",
  timetable:    "/timetable",
  examStruct:   "/exam-structure",
  teachers:     "/teachers",
  tNotes:       "/teacher-notes",
  performance:  "/teacher-performance",
  leaderboard:  "/teacher-leaderboard",
  principal:    "/principal-leaderboards",
  staffAccess:  "/access-requests",
  attendance:   "/attendance",
  exams:        "/exams",
  assignments:  "/assignments",
  discipline:   "/discipline",
  parentComm:   "/parent-communication",
  fee:          "/fee-structure",
  reports:      "/reports",
  settings:     "/settings",
};

const PATH_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(ID_TO_PATH).map(([id, p]) => [p, id])
);

// ── Concave notch ─────────────────────────────────────────────────────────────
function Notch({ top }: { top?: boolean }) {
  const wrapStyle: CSSProperties = {
    position: "absolute",
    right: 0,
    ...(top ? { bottom: "100%" } : { top: "100%" }),
    width: T.CURVE,
    height: T.CURVE,
    background: T.accentLight,        // match active item bg — not sidebar bg
    zIndex: 3, pointerEvents: "none",
  };
  const innerStyle: CSSProperties = {
    position: "absolute",
    width: "100%", height: "100%",
    background: T.sidebar,
    ...(top
      ? { borderBottomRightRadius: T.CURVE }
      : { borderTopRightRadius: T.CURVE }),
  };
  return (
    <div style={wrapStyle}>
      {/* Inner white circle that creates the concave cutout */}
      <div style={innerStyle} />
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────
function Item({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (id: string) => void }) {
  const [hov, setHov] = useState(false);
  const Ico = item.icon;

  /* Settings */
  if (item.special) {
    return (
      <div style={{ padding: `0 ${T.GAP}px`, marginTop: 4 }}>
        <button onClick={() => onSelect(item.id)} style={{
          display: "flex", alignItems: "center", gap: 10,
          height: T.ITEM_H + 4,
          paddingLeft: T.LEFT_PAD, paddingRight: 14,
          width: "100%", borderRadius: 10,
          border: "none", outline: "none", boxShadow: "none", cursor: "pointer",
          background: "#1e3a5f", color: "#fff",
          fontFamily: "inherit", fontSize: 13, fontWeight: 500,
          boxSizing: "border-box",
        }}>
          <Ico size={T.ICON} strokeWidth={1.6} style={{ flexShrink: 0 }} />
          <span>{item.label}</span>
        </button>
      </div>
    );
  }

  /* Active */
  if (active) {
    return (
      <div style={{ position: "relative" }}>
        <Notch top />
        <button onClick={() => onSelect(item.id)} style={{
          display: "flex", alignItems: "center", gap: 10,
          height: T.ITEM_H,
          paddingLeft: T.LEFT_PAD + T.GAP,
          paddingRight: 14,
          width: "100%",
          /* only left corners round — right side is flush with sidebar edge */
          borderRadius: `${T.CURVE / 2}px 0 0 ${T.CURVE / 2}px`,
          border: "none", outline: "none", boxShadow: "none", cursor: "pointer",
          background: T.accentLight,
          color: T.accent,
          fontFamily: "inherit", fontSize: 13, fontWeight: 600,
          position: "relative", zIndex: 1,
          boxSizing: "border-box",
        }}>
          <Ico size={T.ICON} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: "left", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.label}
          </span>
          {item.badge && <Dot />}
        </button>
        <Notch top={false} />
      </div>
    );
  }

  /* Regular */
  return (
    <div style={{ padding: `0 ${T.GAP}px` }}>
      <button
        onClick={() => onSelect(item.id)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          height: T.ITEM_H,
          paddingLeft: T.LEFT_PAD, paddingRight: 14,
          width: "100%", borderRadius: 8,
          border: "none", outline: "none", boxShadow: "none", cursor: "pointer",
          background: hov ? "#F0F1F8" : "transparent",
          color: hov ? T.textDark : T.textBody,
          fontFamily: "inherit", fontSize: 13, fontWeight: 400,
          transition: "background 0.1s, color 0.1s",
          boxSizing: "border-box",
        }}
      >
        <Ico size={T.ICON} strokeWidth={1.6} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.label}
        </span>
        {item.badge && <Dot />}
      </button>
    </div>
  );
}

function Dot() {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />;
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ section, activeId, onSelect }: { section: NavSection; activeId: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <p style={{
        margin: 0,
        paddingLeft: T.LEFT_PAD + T.GAP,
        paddingTop: 12, paddingBottom: 5,
        fontSize: 10, fontWeight: 700,
        letterSpacing: "0.09em", textTransform: "uppercase",
        color: T.textMuted, fontFamily: "inherit",
      }}>
        {section.label}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {section.items.map(item => (
          <Item key={item.id} item={item} active={activeId === item.id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ activeId, onSelect, sections = SECTIONS }: { activeId: string; onSelect: (id: string) => void; sections?: NavSection[] }) {
  return (
    /* Outer wrapper — adds the gap around the sidebar card */
    <div style={{
      padding: `${T.GAP}px 0 ${T.GAP}px ${T.GAP}px`,
      background: T.pageBg,
      flexShrink: 0,
      height: "100%",
      boxSizing: "border-box",
    }}>
      {/* The floating card */}
      <aside style={{
        width: 240,
        height: "100%",
        background: T.sidebar,
        borderRadius: T.RADIUS,
        display: "flex", flexDirection: "column",
        overflowY: "auto", overflowX: "hidden",
        scrollbarWidth: "none",
      }}>
        {/* Logo */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          height: 64,
          paddingLeft: T.LEFT_PAD + T.GAP,
          paddingRight: 16,
          flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: T.accent, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <GraduationCap size={16} color="#fff" strokeWidth={1.8} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.textDark, lineHeight: 1.2 }}>SchoolOS</p>
            <p style={{ margin: 0, fontSize: 11, color: T.textMuted, lineHeight: 1.3 }}>Admin Panel</p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, paddingTop: 6, paddingBottom: 20, overflowY: "auto", scrollbarWidth: "none" }}>
          {sections.map(s => (
            <Section key={s.id} section={s} activeId={activeId} onSelect={onSelect} />
          ))}
        </nav>
      </aside>
    </div>
  );
}

// ── Router-aware wrapper (default export for the app) ─────────────────────────
interface AppSidebarProps {
  onClose?: () => void;
}

const AppSidebar = ({ onClose }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userData } = useAuth();

  const activeId = PATH_TO_ID[location.pathname] ?? "";

  const isDeo = userData?.role === "data_entry";
  const allowed: string[] | undefined = userData?.allowedPages;

  // DEO sees only items the principal has granted; empty sections drop out.
  const sections = useMemo<NavSection[]>(() => {
    if (!isDeo) return SECTIONS;
    return SECTIONS
      .map(s => ({ ...s, items: s.items.filter(it => allowed?.includes(ID_TO_PATH[it.id])) }))
      .filter(s => s.items.length > 0);
  }, [isDeo, allowed]);

  const handleSelect = (id: string) => {
    const path = ID_TO_PATH[id];
    if (!path) return;
    navigate(path);
    onClose?.();
  };

  return <Sidebar activeId={activeId} onSelect={handleSelect} sections={sections} />;
};

export default AppSidebar;
