import { useState, ReactNode } from "react";
import Header from "./Header";
import AppSidebar from "./AppSidebar";
import MobileTabBar from "./MobileTabBar";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col bg-[#EEF4FF]">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed top-14 inset-x-0 bottom-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <div
          className={`fixed top-14 bottom-0 left-0 z-50 w-64 transition-transform duration-300 ease-in-out md:sticky md:top-16 md:h-[calc(100vh-64px)] md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <AppSidebar onClose={() => setSidebarOpen(false)} />
        </div>
        <main className="flex-1 px-3 pt-3 sm:px-4 sm:py-4 md:px-5 md:py-6 overflow-y-auto md:h-[calc(100vh-64px)] min-w-0">
          {children}
          {/* Mobile-only bottom safe-zone for the floating MobileTabBar.
             Bar consumes ~80px+safe-area (12px gap + 68px height) plus
             ~30px shadow/blur halo. 160px+safe gives the last card on
             ANY page comfortable clearance with no overlap when fully
             scrolled. Rendered as a plain div (not padding-bottom +
             useIsMobile JS gate) to avoid hydration race conditions
             and Tailwind JIT stripping `env()` inside arbitrary calc. */}
          <div
            className="md:hidden"
            aria-hidden
            style={{ height: "calc(160px + env(safe-area-inset-bottom))" }}
          />
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
};

export default DashboardLayout;
