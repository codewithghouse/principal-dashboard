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
  FileText,
  BarChart3,
  Settings,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const { logout } = useAuth();

  return (
    <aside className="w-64 h-[calc(100vh-64px)] sticky top-16 bg-card border-r border-border flex flex-col shrink-0 overflow-y-auto shadow-sm">
      <div className="px-4 py-3 border-b border-slate-50">
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
          Navigation
        </span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                isActive
                  ? "bg-[#1e3a8a] text-white shadow-lg shadow-blue-900/10 scale-[1.02]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-[#1e3a8a]"
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span className="flex-1">{item.title}</span>
              {item.badge && (
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    isActive
                      ? "bg-white/20 text-white"
                      : item.title === "Risk Students"
                      ? "bg-rose-500 text-white"
                      : "bg-amber-500 text-white"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

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
