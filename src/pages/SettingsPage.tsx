import { Settings, School, Users, Bell, Shield } from "lucide-react";

const SettingsPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage portal settings and preferences</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { icon: School, title: "School Profile", desc: "Update school information and branding" },
          { icon: Users, title: "User Management", desc: "Manage staff accounts and permissions" },
          { icon: Bell, title: "Notifications", desc: "Configure alert preferences" },
          { icon: Shield, title: "Security", desc: "Password policies and access control" },
        ].map((item) => (
          <div key={item.title} className="bg-card rounded-lg border border-border p-5 hover:border-primary transition-colors cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <item.icon className="w-6 h-6 text-primary" />
              <h3 className="font-semibold text-foreground">{item.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
