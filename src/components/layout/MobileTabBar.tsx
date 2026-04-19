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
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex pt-2 pb-[max(env(safe-area-inset-bottom),12px)] px-2.5"
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "saturate(180%) blur(24px)",
        WebkitBackdropFilter: "saturate(180%) blur(24px)",
        borderTop: "0.5px solid rgba(0,0,0,0.06)",
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
            className={`flex-1 flex flex-col items-center justify-center gap-[3px] py-1 px-1 ${
              active ? "" : "text-slate-400"
            }`}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
          >
            <div
              className={`w-[38px] h-[30px] rounded-[10px] grid place-items-center transition-all ${
                active ? "text-white" : "text-slate-500"
              }`}
              style={
                active
                  ? { background: GRAD_PILL, boxShadow: "0 4px 12px -2px rgba(17,31,162,0.5)" }
                  : undefined
              }
            >
              <Icon className="w-[18px] h-[18px]" />
            </div>
            <span
              className="text-[10px] font-semibold tracking-tight"
              style={active ? { color: "#111FA2" } : undefined}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileTabBar;