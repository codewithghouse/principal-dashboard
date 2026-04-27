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
  KeyRound,
  LogOut,
  type LucideIcon,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  accent: "#1C0770",
  accentLight: "#EDE9FF",
  sidebar: "#ffffff",
  textMuted: "#8A94A6",
  textBody: "#4A5568",
  textDark: "#1A202C",
  border: "#ECEEF4",
  CURVE: 16,
  ITEM_H: 36,
  ICON: 17,
  LEFT_PAD: 16,
  GAP: 10,
  RADIUS: 16,
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
    id: "overview",
    label: "Overview",
    items: [{ label: "Dashboard", icon: LayoutGrid, path: "/" }],
  },
  {
    id: "students",
    label: "Students",
    items: [
      { label: "Students", icon: Users, path: "/students" },
      { label: "Student Intelligence", icon: Brain, path: "/student-intelligence" },
      { label: "Risk Students", icon: AlertTriangle, path: "/risk-students" },
    ],
  },
  {
    id: "academic",
    label: "Academic Setup",
    items: [
      { label: "Classes & Sections", icon: Monitor, path: "/classes" },
      { label: "Academics", icon: BookOpen, path: "/academics" },
      { label: "Syllabus", icon: AlignLeft, path: "/syllabus" },
      { label: "Timetable Setup", icon: Clock, path: "/timetable" },
      { label: "Exam Structure", icon: Bookmark, path: "/exam-structure" },
    ],
  },
  {
    id: "staff",
    label: "Staff",
    items: [
      { label: "Teachers", icon: GraduationCap, path: "/teachers" },
      { label: "Teacher Notes", icon: MessageCircle, path: "/teacher-notes" },
      { label: "Teacher Performance", icon: TrendingUp, path: "/teacher-performance" },
      { label: "Teacher Leaderboard", icon: Trophy, path: "/teacher-leaderboard" },
      { label: "Principal Leaderboards", icon: Award, path: "/principal-leaderboards" },
      { label: "Staff Access", icon: Shield, path: "/access-requests", badge: true },
    ],
  },
  {
    id: "assessment",
    label: "Assessment",
    items: [
      { label: "Attendance", icon: CalendarCheck, path: "/attendance" },
      { label: "Exams & Results", icon: FileText, path: "/exams" },
      { label: "Assignments & Marks", icon: ClipboardList, path: "/assignments" },
    ],
  },
  {
    id: "comms",
    label: "Communication",
    items: [
      { label: "Discipline & Incidents", icon: ShieldAlert, path: "/discipline" },
      { label: "Parent Communication", icon: MessageSquare, path: "/parent-communication" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { label: "Fee Structure", icon: DollarSign, path: "/fee-structure" },
      { label: "Reports", icon: BarChart2, path: "/reports" },
      { label: "Settings", icon: Settings, path: "/settings", special: true },
    ],
  },
];

// ── Concave notch ─────────────────────────────────────────────────────────────
function Notch({ position }: { position: "top" | "bottom" }) {
  const wrapStyle: CSSProperties = {
    position: "absolute",
    right: 0,
    width: T.CURVE,
    height: T.CURVE,
    background: T.accentLight,
    zIndex: 3,
    pointerEvents: "none",
    ...(position === "top" ? { bottom: "100%" } : { top: "100%" }),
  };
  const innerStyle: CSSProperties = {
    position: "absolute",
    width: "100%",
    height: "100%",
    background: T.sidebar,
    ...(position === "top"
      ? { borderBottomRightRadius: T.CURVE }
      : { borderTopRightRadius: T.CURVE }),
  };
  return (
    <div style={wrapStyle}>
      <div style={innerStyle} />
    </div>
  );
}

function Dot() {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#F59E0B",
        flexShrink: 0,
      }}
    />
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

  // Settings — always-on dark pill (preserved from design)
  if (item.special) {
    return (
      <div style={{ padding: `0 ${T.GAP}px`, marginTop: 4 }}>
        <button
          onClick={() => onSelect(item.path)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: T.ITEM_H + 4,
            paddingLeft: T.LEFT_PAD,
            paddingRight: 14,
            width: "100%",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            background: "#1e3a5f",
            color: "#fff",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 500,
            boxSizing: "border-box",
          }}
        >
          <Ico size={T.ICON} strokeWidth={1.6} style={{ flexShrink: 0 }} />
          <span>{item.label}</span>
        </button>
      </div>
    );
  }

  // Active — flush right with concave notches above and below
  if (active) {
    return (
      <div style={{ position: "relative" }}>
        <Notch position="top" />
        <button
          onClick={() => onSelect(item.path)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: T.ITEM_H,
            paddingLeft: T.LEFT_PAD + T.GAP,
            paddingRight: 14,
            width: "100%",
            borderRadius: `${T.CURVE / 2}px 0 0 ${T.CURVE / 2}px`,
            border: "none",
            cursor: "pointer",
            background: T.accentLight,
            color: T.accent,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            position: "relative",
            zIndex: 1,
            boxSizing: "border-box",
          }}
        >
          <Ico size={T.ICON} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span
            style={{
              flex: 1,
              textAlign: "left",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.label}
          </span>
        </button>
        <Notch position="bottom" />
      </div>
    );
  }

  // Regular
  return (
    <div style={{ padding: `0 ${T.GAP}px` }}>
      <button
        onClick={() => onSelect(item.path)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: T.ITEM_H,
          paddingLeft: T.LEFT_PAD,
          paddingRight: 14,
          width: "100%",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          background: hov ? "#F0F1F8" : "transparent",
          color: hov ? T.textDark : T.textBody,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 400,
          transition: "background 0.1s, color 0.1s",
          boxSizing: "border-box",
        }}
      >
        <Ico size={T.ICON} strokeWidth={1.6} style={{ flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: "left",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.label}
        </span>
        {item.badge && <Dot />}
      </button>
    </div>
  );
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
      <p
        style={{
          margin: 0,
          paddingLeft: T.LEFT_PAD + T.GAP,
          paddingTop: 12,
          paddingBottom: 5,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: T.textMuted,
          fontFamily: "inherit",
        }}
      >
        {section.label}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {section.items.map((item) => (
          <Item
            key={item.path}
            item={item}
            active={activePath === item.path}
            onSelect={onSelect}
          />
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
  const { logout, userData } = useAuth();

  const isDeo = userData?.role === "data_entry";
  const allowed: string[] | undefined = userData?.allowedPages;

  // DEO sees only items the principal has granted; empty sections are dropped.
  const sections = useMemo<NavSection[]>(() => {
    if (!isDeo) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((it) => allowed?.includes(it.path)),
    })).filter((s) => s.items.length > 0);
  }, [isDeo, allowed]);

  const handleSelect = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleLogout = () => {
    void logout();
    onClose?.();
  };

  return (
    <div
      style={{
        padding: `${T.GAP}px 0 ${T.GAP}px ${T.GAP}px`,
        height: "100%",
        width: "100%",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      <aside
        style={{
          width: 240,
          height: "100%",
          background: T.sidebar,
          borderRadius: T.RADIUS,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow:
            "0 4px 24px rgba(28,7,112,0.10), 0 1px 4px rgba(28,7,112,0.06)",
        }}
      >
        {/* Logo header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 64,
            paddingLeft: T.LEFT_PAD + T.GAP,
            paddingRight: 16,
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: T.accent,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GraduationCap size={16} color="#fff" strokeWidth={1.8} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: T.textDark,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              SchoolOS
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: T.textMuted,
                lineHeight: 1.3,
              }}
            >
              {isDeo ? "Data Entry" : "Admin Panel"}
            </p>
          </div>
          {isDeo && (
            <KeyRound size={14} style={{ color: "#D97706", flexShrink: 0 }} />
          )}
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            paddingTop: 6,
            paddingBottom: 12,
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
          }}
        >
          {sections.map((s) => (
            <Section
              key={s.id}
              section={s}
              activePath={location.pathname}
              onSelect={handleSelect}
            />
          ))}
        </nav>

        {/* Footer: DEO info panel + Sign Out */}
        <div
          style={{
            flexShrink: 0,
            padding: `8px ${T.GAP}px 12px`,
            borderTop: `1px solid ${T.border}`,
          }}
        >
          {isDeo && (
            <div
              style={{
                padding: "8px 10px",
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: 10,
                marginBottom: 8,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#B45309",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Limited Access
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#92400E" }}>
                {allowed?.length || 0} pages granted by principal
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: T.ITEM_H,
              paddingLeft: T.LEFT_PAD - T.GAP / 2,
              paddingRight: 14,
              width: "100%",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: "#E11D48",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              boxSizing: "border-box",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#FFF1F2";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <LogOut size={T.ICON} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </div>
  );
};

export default AppSidebar;
