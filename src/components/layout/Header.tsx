import { Bell, GraduationCap } from "lucide-react";

const Header = () => {
  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-primary">EDUINTELLECT</span>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative p-2 rounded-full hover:bg-secondary">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
            SP
          </div>
          <span className="text-sm font-medium text-foreground">Principal</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
