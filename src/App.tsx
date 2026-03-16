import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
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
import LoginPage from "./pages/Login";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { Loader2, GraduationCap } from "lucide-react";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-[#1e3a8a] flex items-center justify-center text-white animate-bounce shadow-xl">
          <GraduationCap className="w-8 h-8" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Loader2 className="w-6 h-6 animate-spin text-[#1e3a8a]" />
          <p className="text-xs font-black text-[#1e294b] uppercase tracking-widest mt-2">Verifying Credentials</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/students" element={<Students />} />
        <Route path="/risk-students" element={<RiskStudents />} />
        <Route path="/classes" element={<ClassesSections />} />
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/academics" element={<Academics />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/discipline" element={<Discipline />} />
        <Route path="/parent-communication" element={<ParentCommunication />} />
        <Route path="/exams" element={<ExamsResults />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  );
};

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
