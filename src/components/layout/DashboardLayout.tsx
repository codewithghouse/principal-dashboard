import { ReactNode } from "react";
import Header from "./Header";
import AppSidebar from "./AppSidebar";

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-y-auto h-[calc(100vh-64px)]">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
