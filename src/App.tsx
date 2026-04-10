import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2, GraduationCap } from "lucide-react";

import { AuthProvider, useAuth } from "./lib/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import LoginPage from "./pages/Login";
import RequestAccess from "./pages/RequestAccess";

import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import RiskStudents from "./pages/RiskStudents";
import ClassesSections from "./pages/ClassesSections";
import Teachers from "./pages/Teachers";
import Academics from "./pages/Academics";
import Attendance from "./pages/Attendance";
import Discipline from "./pages/Discipline";
import ParentCommunication from "./pages/ParentCommunication";
import TeacherNotes from "./pages/TeacherNotes";
import ExamsResults from "./pages/ExamsResults";
import AssignmentMarks from "./pages/AssignmentMarks";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import TeacherPerformance from "./pages/TeacherPerformance";
import ExamStructure from "./pages/ExamStructure";
import TimetableSetup from "./pages/TimetableSetup";
import AccessRequests from "./pages/AccessRequests";

// Pages data entry operators are allowed to navigate to
const DEO_ALLOWED = ["/students", "/attendance", "/assignments", "/exams", "/teacher-notes", "/classes"];

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

// ─── DEO Route Guard — blocks restricted pages for data entry operators ───────
const DeoGuard = ({ children }: { children: React.ReactNode }) => {
  const { userData } = useAuth();
  const location = useLocation();
  if (userData?.role !== "data_entry") return <>{children}</>;

  const allowed: string[] = userData?.allowedPages || DEO_ALLOWED;
  if (allowed.includes(location.pathname)) return <>{children}</>;
  // Redirect to first allowed page
  return <Navigate to={allowed[0] || "/students"} replace />;
};

// ─── Route Guard ──────────────────────────────────────────────────────────────
const AppRoutes = () => {
  const { user, userData, loading } = useAuth();

  // 1. Public route — always accessible regardless of auth
  if (window.location.pathname === "/request-access") {
    return (
      <Routes>
        <Route path="/request-access" element={<RequestAccess />} />
      </Routes>
    );
  }

  // 2. Block ALL rendering until Firebase finishes restoring session
  if (loading) return <SplashScreen />;

  // 3. Not authenticated OR not in the whitelist → show Login
  if (!user || !userData) return <LoginPage />;

  // 4. Auth confirmed — show dashboard (role-filtered via DeoGuard + sidebar)
  return (
    <DashboardLayout>
      <DeoGuard>
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
          <Route path="/teacher-notes"        element={<TeacherNotes />} />
          <Route path="/exams"                element={<ExamsResults />} />
          <Route path="/assignments"          element={<AssignmentMarks />} />
          <Route path="/reports"              element={<Reports />} />
          <Route path="/settings"             element={<SettingsPage />} />
          <Route path="/teacher-performance"  element={<TeacherPerformance />} />
          <Route path="/exam-structure"       element={<ExamStructure />} />
          <Route path="/timetable"            element={<TimetableSetup />} />
          <Route path="/access-requests"      element={<AccessRequests />} />
          <Route path="/request-access"       element={<RequestAccess />} />
          <Route path="*"                     element={<NotFound />} />
        </Routes>
      </DeoGuard>
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
