import { NavLink, useLocation } from "react-router-dom";
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
  FileText,
  BarChart3,
  Settings,
} from "lucide-react";

const menuItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/" },
  { title: "Students", icon: Users, path: "/students" },
  { title: "Risk Students", icon: AlertTriangle, path: "/risk-students", badge: 12 },
  { title: "Classes & Sections", icon: Monitor, path: "/classes" },
  { title: "Teachers", icon: GraduationCap, path: "/teachers" },
  { title: "Academics", icon: BookOpen, path: "/academics" },
  { title: "Attendance", icon: CalendarCheck, path: "/attendance" },
  { title: "Discipline & Incidents", icon: ShieldAlert, path: "/discipline" },
  { title: "Parent Communication", icon: MessageSquare, path: "/parent-communication", badge: 5 },
  { title: "Exams & Results", icon: FileText, path: "/exams" },
  { title: "Reports", icon: BarChart3, path: "/reports" },
  { title: "Settings", icon: Settings, path: "/settings" },
];

const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col shrink-0">
      <div className="px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Main Menu
        </span>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-secondary"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              <span className="flex-1">{item.title}</span>
              {item.badge && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : item.title === "Risk Students"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-warning text-warning-foreground"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};

export default AppSidebar;
