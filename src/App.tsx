import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2, GraduationCap } from "lucide-react";

import { AuthProvider, useAuth } from "./lib/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import LoginPage from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import RiskStudents from "./pages/RiskStudents";
import ClassesSections from "./pages/ClassesSections";
import Teachers from "./pages/Teachers";
import Academics from "./pages/Academics";
import Attendance from "./pages/Attendance";
import Discipline from "./pages/Discipline";
import ParentCommunication from "./pages/ParentCommunication";
import ExamsResults from "./pages/ExamsResults";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// ─── Splash Screen ────────────────────────────────────────────────────────────
const SplashScreen = () => (
  <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
    <div className="w-16 h-16 rounded-3xl bg-[#1e3a8a] flex items-center justify-center text-white shadow-2xl animate-bounce">
      <GraduationCap className="w-8 h-8" />
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader2 className="w-6 h-6 animate-spin text-[#1e3a8a]" />
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
        Verifying Identity...
      </p>
    </div>
  </div>
);

// ─── Route Guard ──────────────────────────────────────────────────────────────
const AppRoutes = () => {
  const { user, userData, loading } = useAuth();

  // 1. Block ALL rendering until Firebase finishes restoring session
  //    This is the single fix that kills the redirect loop
  if (loading) return <SplashScreen />;

  // 2. Not authenticated OR not in the whitelist → show Login
  //    No useEffect, no navigate() — purely declarative
  if (!user || !userData) return <LoginPage />;

  // 3. Auth confirmed + role verified → show Dashboard
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/"                     element={<Dashboard />} />
        <Route path="/students"             element={<Students />} />
        <Route path="/risk-students"        element={<RiskStudents />} />
        <Route path="/classes"              element={<ClassesSections />} />
        <Route path="/teachers"             element={<Teachers />} />
        <Route path="/academics"            element={<Academics />} />
        <Route path="/attendance"           element={<Attendance />} />
        <Route path="/discipline"           element={<Discipline />} />
        <Route path="/parent-communication" element={<ParentCommunication />} />
        <Route path="/exams"                element={<ExamsResults />} />
        <Route path="/reports"              element={<Reports />} />
        <Route path="/settings"             element={<SettingsPage />} />
        <Route path="*"                     element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────
const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
