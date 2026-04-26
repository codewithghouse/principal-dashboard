import { Home, BarChart3, Users, MessageSquare, User } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";

const GRAD_PILL = "linear-gradient(105deg, #4cb1dd 0%, #4cb1dd 6%, #111FA2 45%, #0a1570 100%)";

interface TabDef {
  key: string;
  label: string;
  icon: typeof Home;
  /** Either a route to navigate to, or a dashboard tab to set via ?tab= */
  route?: string;
  dashTab?: "home" | "analytics" | "teachers";
}

const TABS: TabDef[] = [
  { key: "home",      label: "Home",      icon: Home,           dashTab: "home" },
  { key: "analytics", label: "Analytics", icon: BarChart3,      dashTab: "analytics" },
  { key: "students",  label: "Students",  icon: Users,          route: "/students" },
  { key: "messages",  label: "Messages",  icon: MessageSquare,  route: "/parent-communication" },
  { key: "profile",   label: "Profile",   icon: User,           route: "/settings" },
];

const MobileTabBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const onDashboard = location.pathname === "/";
  const currentDashTab = (searchParams.get("tab") as "home" | "analytics" | "teachers") || "home";

  const isActive = (t: TabDef) => {
    if (t.dashTab) return onDashboard && currentDashTab === t.dashTab;
    if (t.route)   return location.pathname === t.route;
    return false;
  };

  const handleClick = (t: TabDef) => {
    if (t.dashTab) {
      const params = t.dashTab === "home" ? "" : `?tab=${t.dashTab}`;
      navigate(`/${params}`);
    } else if (t.route) {
      navigate(t.route);
    }
  };

  return (
    <nav
      className="md:hidden fixed inset-x-0 z-40 flex justify-center px-3 pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <div
        className="flex items-center w-full max-w-[440px] pointer-events-auto"
        style={{
          height: 68,
          padding: "0 6px",
          borderRadius: 28,
          background: "rgba(255,255,255,0.62)",
          backdropFilter: "saturate(220%) blur(28px)",
          WebkitBackdropFilter: "saturate(220%) blur(28px)",
          border: "0.5px solid rgba(255,255,255,0.85)",
          boxShadow:
            "0 0 0 0.5px rgba(17,31,162,0.10), 0 2px 6px rgba(17,31,162,0.08), 0 12px 28px rgba(17,31,162,0.18), 0 28px 64px rgba(17,31,162,0.22)",
        }}
      >
        {TABS.map(t => {
          const active = isActive(t);
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleClick(t)}
              className="flex-1 h-full flex flex-col items-center justify-center gap-[3px] transition-transform active:scale-[0.92]"
              style={{ transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
              aria-label={t.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className="w-[20px] h-[20px] transition-colors"
                style={{ color: active ? "#111FA2" : "#94A3B8" }}
                strokeWidth={active ? 2.4 : 2}
              />
              <span
                className="text-[10px] tracking-tight leading-tight transition-colors"
                style={{
                  color: active ? "#111FA2" : "#94A3B8",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileTabBar;