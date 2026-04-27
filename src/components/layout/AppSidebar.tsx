import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Monitor,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  ShieldAlert,
  MessageSquare,
  MessageCircle,
  FileText,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  TrendingUp,
  Clock,
  Award,
  ShieldCheck,
  KeyRound,
  Brain,
  DollarSign,
  Library,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Full principal menu
const PRINCIPAL_MENU = [
  { title: "Dashboard",              icon: LayoutDashboard, path: "/" },
  { title: "Students",               icon: Users,           path: "/students" },
  { title: "Student Intelligence",   icon: Brain,           path: "/student-intelligence" },
  { title: "Risk Students",          icon: AlertTriangle,   path: "/risk-students", badge: true },
  { title: "Classes & Sections",     icon: Monitor,         path: "/classes" },
  { title: "Teachers",               icon: GraduationCap,   path: "/teachers" },
  { title: "Academics",              icon: BookOpen,        path: "/academics" },
  { title: "Syllabus",               icon: Library,         path: "/syllabus" },
  { title: "Attendance",             icon: CalendarCheck,   path: "/attendance" },
  { title: "Discipline & Incidents", icon: ShieldAlert,     path: "/discipline" },
  { title: "Parent Communication",   icon: MessageSquare,   path: "/parent-communication" },
  { title: "Teacher Notes",          icon: MessageCircle,   path: "/teacher-notes" },
  { title: "Exams & Results",        icon: FileText,        path: "/exams" },
  { title: "Assignments & Marks",    icon: ClipboardList,   path: "/assignments" },
  { title: "Teacher Performance",    icon: TrendingUp,      path: "/teacher-performance" },
  { title: "Teacher Leaderboard",    icon: Trophy,          path: "/teacher-leaderboard" },
  { title: "Principal Leaderboards", icon: Award,           path: "/principal-leaderboards" },
  { title: "Fee Structure",          icon: DollarSign,      path: "/fee-structure" },
  { title: "Exam Structure",         icon: Award,           path: "/exam-structure" },
  { title: "Timetable Setup",        icon: Clock,           path: "/timetable" },
  { title: "Staff Access",           icon: ShieldCheck,     path: "/access-requests" },
  { title: "Reports",                icon: BarChart3,       path: "/reports" },
  { title: "Settings",               icon: Settings,        path: "/settings" },
];

/* DEO menu = filtered subset of PRINCIPAL_MENU.
   Principal can now assign ANY of the principal pages to a DEO —
   so we filter PRINCIPAL_MENU directly instead of maintaining a
   separate (stale) DEO_MENU list. */

interface AppSidebarProps {
  onClose?: () => void;
}

const AppSidebar = ({ onClose }: AppSidebarProps) => {
  const location = useLocation();
  const { logout, userData } = useAuth();

  const isDeo      = userData?.role === "data_entry";
  const menuItems  = isDeo
    // DEO sees only pages the principal has allowed — filtered from full PRINCIPAL_MENU
    // so any principal-assigned page appears with proper icon & title.
    ? PRINCIPAL_MENU.filter(item =>
        userData?.allowedPages?.includes(item.path)
      )
    : PRINCIPAL_MENU;

  return (
    <aside className="w-[calc(100%-10px)] h-[calc(100%-20px)] mt-[10px] mb-[10px] ml-[10px] bg-card flex flex-col shrink-0 overflow-y-auto rounded-2xl shadow-[0_8px_28px_rgba(15,23,42,0.18)] md:shadow-[0_8px_28px_rgba(15,23,42,0.08)]">

      {/* Role badge */}
      <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
          Navigation
        </span>
        {isDeo && (
          <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-[8px] font-black uppercase tracking-widest">
            <KeyRound className="w-2.5 h-2.5" /> Data Entry
          </span>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                isActive
                  ? "bg-[#1e3a8a] text-white shadow-lg shadow-blue-900/10 scale-[1.02]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-[#1e3a8a]"
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span className="flex-1">{item.title}</span>
              {/* Staff Access pending badge */}
              {item.path === "/access-requests" && !isActive && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">!</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* DEO info panel */}
      {isDeo && (
        <div className="mx-3 mb-3 p-3 bg-amber-50 border border-amber-100 rounded-2xl">
          <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Limited Access</p>
          <p className="text-[10px] text-amber-600 mt-0.5">
            {userData?.allowedPages?.length || 0} pages granted by principal
          </p>
        </div>
      )}

      <div className="p-4 border-t border-slate-100 mt-auto">
        <Button
          variant="ghost"
          onClick={logout}
          className="w-full justify-start gap-3 h-12 rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-600 font-bold transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </Button>
      </div>
    </aside>
  );
};

export default AppSidebar;
