import { Bell, GraduationCap, LogOut, Menu } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";

interface HeaderProps {
  onMenuClick?: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const { userData, user, logout } = useAuth();

  return (
    <header className="h-14 md:h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-50">
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-primary uppercase leading-tight truncate max-w-[120px] sm:max-w-none">
            {userData?.schoolName || "EDULLENT"}
          </span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
            {userData?.branchName || userData?.branch || userData?.branchId || "Portal"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <button className="relative p-2 rounded-full hover:bg-secondary">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
        </button>
        <div className="h-8 w-[1px] bg-border mx-1 hidden sm:block" />
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-bold text-foreground leading-none">
              {userData?.name || user?.displayName || "User"}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase">
              {userData?.role || "Administrator"}
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shadow-md shrink-0">
            {userData?.avatar || user?.displayName?.substring(0, 2).toUpperCase() || "U"}
          </div>
          <button
            onClick={logout}
            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
