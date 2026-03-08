import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: "success" | "destructive" | "warning" | "muted";
  icon?: LucideIcon;
  iconColor?: string;
}

const subtitleColors = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

const StatCard = ({ title, value, subtitle, subtitleColor = "muted", icon: Icon, iconColor }: StatCardProps) => {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>
        {Icon && <Icon className={`w-5 h-5 ${iconColor || "text-muted-foreground"}`} />}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtitle && (
        <span className={`text-xs ${subtitleColors[subtitleColor]}`}>{subtitle}</span>
      )}
    </div>
  );
};

export default StatCard;
