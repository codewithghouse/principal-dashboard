import { useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  LayoutGrid,
  Users,
  Brain,
  AlertTriangle,
  Monitor,
  GraduationCap,
  BookOpen,
  AlignLeft,
  CalendarCheck,
  ShieldAlert,
  MessageSquare,
  MessageCircle,
  FileText,
  ClipboardList,
  TrendingUp,
  Trophy,
  Award,
  DollarSign,
  Bookmark,
  Clock,
  Shield,
  BarChart2,
  Settings,
  type LucideIcon,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  accent:      "#1C0770",
  accentLight: "#EDE9FF",
  sidebar:     "#ffffff",
  pageBg:      "#ECEEF5",
  textMuted:   "#8A94A6",
  textBody:    "#4A5568",
  textDark:    "#1A202C",
  border:      "#ECEEF4",
  CURVE:       16,
  ITEM_H:      36,
  ICON:        17,
  LEFT_PAD:    16,
  GAP:         10,
  RADIUS:      16,
} as const;

// ── Nav data ──────────────────────────────────────────────────────────────────
type NavItem = {
  label: string;
  icon: LucideIcon;
  path: string;
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
      { label: "Dashboard",             icon: LayoutGrid,    path: "/" },
    ],
  },
  {
    id: "students", label: "Students",
    items: [
      { label: "Students",              icon: Users,         path: "/students" },
      { label: "Student Intelligence",  icon: Brain,         path: "/student-intelligence" },
      { label: "Risk Students",         icon: AlertTriangle, path: "/risk-students" },
    ],
  },
  {
    id: "academic", label: "Academic Setup",
    items: [
      { label: "Classes & Sections",    icon: Monitor,       path: "/classes" },
      { label: "Academics",             icon: BookOpen,      path: "/academics" },
      { label: "Syllabus",              icon: AlignLeft,     path: "/syllabus" },
      { label: "Timetable Setup",       icon: Clock,         path: "/timetable" },
      { label: "Exam Structure",        icon: Bookmark,      path: "/exam-structure" },
    ],
  },
  {
    id: "staff", label: "Staff",
    items: [
      { label: "Teachers",              icon: GraduationCap, path: "/teachers" },
      { label: "Teacher Notes",         icon: MessageCircle, path: "/teacher-notes" },
      { label: "Teacher Performance",   icon: TrendingUp,    path: "/teacher-performance" },
      { label: "Teacher Leaderboard",   icon: Trophy,        path: "/teacher-leaderboard" },
      { label: "Principal Leaderboards",icon: Award,         path: "/principal-leaderboards" },
      { label: "Staff Access",          icon: Shield,        path: "/access-requests", badge: true },
    ],
  },
  {
    id: "assessment", label: "Assessment",
    items: [
      { label: "Attendance",            icon: CalendarCheck, path: "/attendance" },
      { label: "Exams & Results",       icon: FileText,      path: "/exams" },
      { label: "Assignments & Marks",   icon: ClipboardList, path: "/assignments" },
    ],
  },
  {
    id: "comms", label: "Communication",
    items: [
      { label: "Discipline & Incidents",icon: ShieldAlert,   path: "/discipline" },
      { label: "Parent Communication",  icon: MessageSquare, path: "/parent-communication" },
    ],
  },
  {
    id: "admin", label: "Administration",
    items: [
      { label: "Fee Structure",         icon: DollarSign,    path: "/fee-structure" },
      { label: "Reports",               icon: BarChart2,     path: "/reports" },
      { label: "Settings",              icon: Settings,      path: "/settings", special: true },
    ],
  },
];

// ── Concave notch ─────────────────────────────────────────────────────────────
function Notch({ top }: { top: boolean }) {
  const wrapStyle: CSSProperties = {
    position: "absolute",
    right: 0,
    ...(top ? { bottom: "100%" } : { top: "100%" }),
    width: T.CURVE,
    height: T.CURVE,
    background: T.accentLight,
    zIndex: 3,
    pointerEvents: "none",
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
      <div style={innerStyle} />
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────
interface ItemProps {
  item: NavItem;
  active: boolean;
  onSelect: (path: string) => void;
}

function Item({ item, active, onSelect }: ItemProps) {
  const [hov, setHov] = useState(false);
  const Ico = item.icon;

  /* Settings */
  if (item.special) {
    return (
      <div style={{ padding: `0 ${T.GAP}px`, marginTop: 4 }}>
        <button onClick={() => onSelect(item.path)} style={{
          display: "flex", alignItems: "center", gap: 10,
          height: T.ITEM_H + 4,
          paddingLeft: T.LEFT_PAD, paddingRight: 14,
          width: "100%", borderRadius: 10,
          border: "none", cursor: "pointer",
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
        <button onClick={() => onSelect(item.path)} style={{
          display: "flex", alignItems: "center", gap: 10,
          height: T.ITEM_H,
          paddingLeft: T.LEFT_PAD + T.GAP,
          paddingRight: 14,
          width: "100%",
          /* only left corners round — right side is flush with sidebar edge */
          borderRadius: `${T.CURVE / 2}px 0 0 ${T.CURVE / 2}px`,
          border: "none", cursor: "pointer",
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
        onClick={() => onSelect(item.path)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          height: T.ITEM_H,
          paddingLeft: T.LEFT_PAD, paddingRight: 14,
          width: "100%", borderRadius: 8,
          border: "none", cursor: "pointer",
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
interface SectionProps {
  section: NavSection;
  activePath: string;
  onSelect: (path: string) => void;
}

function Section({ section, activePath, onSelect }: SectionProps) {
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
          <Item key={item.path} item={item} active={activePath === item.path} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
interface AppSidebarProps {
  onClose?: () => void;
}

const AppSidebar = ({ onClose }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userData } = useAuth();

  const isDeo = userData?.role === "data_entry";
  const allowed: string[] | undefined = userData?.allowedPages;

  // DEO sees only items the principal has granted; empty sections drop out.
  const sections = useMemo<NavSection[]>(() => {
    if (!isDeo) return SECTIONS;
    return SECTIONS
      .map(s => ({ ...s, items: s.items.filter(it => allowed?.includes(it.path)) }))
      .filter(s => s.items.length > 0);
  }, [isDeo, allowed]);

  const handleSelect = (path: string) => {
    navigate(path);
    onClose?.();
  };

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
        boxShadow: "0 4px 24px rgba(28,7,112,0.10), 0 1px 4px rgba(28,7,112,0.06)",
      }}>
        {/* Logo */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          height: 64,
          paddingLeft: T.LEFT_PAD + T.GAP,
          paddingRight: 16,
          borderBottom: `1px solid ${T.border}`,
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
            <Section key={s.id} section={s} activePath={location.pathname} onSelect={handleSelect} />
          ))}
        </nav>
      </aside>
    </div>
  );
};

export default AppSidebar;
