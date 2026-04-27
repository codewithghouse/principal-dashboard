import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2, GraduationCap } from "lucide-react";

import { AuthProvider, useAuth } from "./lib/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SplashScreen from "@/components/SplashScreen";
import { InstallBanner } from "@/components/InstallBanner";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
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
import TeacherLeaderboard from "./pages/TeacherLeaderboard";
import PrincipalLeaderboards from "./pages/PrincipalLeaderboards";
import ExamStructure from "./pages/ExamStructure";
import TimetableSetup from "./pages/TimetableSetup";
import AccessRequests from "./pages/AccessRequests";
import StudentProfilePage from "./pages/StudentProfilePage";
import StudentIntelligence from "./pages/StudentIntelligence";
import FeeStructure from "./pages/FeeStructure";
import Syllabus from "./pages/Syllabus";

// Legacy fallback for very old DEO records missing `allowedPages` field.
// Normal DEOs use `userData.allowedPages` which the principal sets in Staff Access.
const DEO_ALLOWED = ["/students", "/attendance", "/assignments", "/exams", "/teacher-notes", "/classes", "/fee-structure"];

const queryClient = new QueryClient();

// ─── Auth Loader — shown while Firebase restores session ──────────────────────
const AuthLoader = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#EEF4FF" }}>
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
  if (loading) return <AuthLoader />;

  // 3. Not authenticated OR not in the whitelist → show Login
  if (!user || !userData) return <LoginPage />;

  // 4. Auth confirmed — show dashboard (role-filtered via DeoGuard + sidebar)
  return (
    <DashboardLayout>
      <DeoGuard>
        <Routes>
          <Route path="/"                     element={<Dashboard />} />
          <Route path="/students"             element={<Students />} />
          <Route path="/students/:studentId"  element={<StudentProfilePage />} />
          <Route path="/student-intelligence" element={<StudentIntelligence />} />
          <Route path="/risk-students"        element={<RiskStudents />} />
          <Route path="/classes"              element={<ClassesSections />} />
          <Route path="/teachers"             element={<Teachers />} />
          <Route path="/academics"            element={<Academics />} />
          <Route path="/syllabus"             element={<Syllabus />} />
          <Route path="/attendance"           element={<Attendance />} />
          <Route path="/discipline"           element={<Discipline />} />
          <Route path="/parent-communication" element={<ParentCommunication />} />
          <Route path="/teacher-notes"        element={<TeacherNotes />} />
          <Route path="/exams"                element={<ExamsResults />} />
          <Route path="/assignments"          element={<AssignmentMarks />} />
          <Route path="/reports"              element={<Reports />} />
          <Route path="/settings"             element={<SettingsPage />} />
          <Route path="/teacher-performance"  element={<TeacherPerformance />} />
          <Route path="/teacher-leaderboard"  element={<TeacherLeaderboard />} />
          <Route path="/principal-leaderboards" element={<PrincipalLeaderboards />} />
          <Route path="/exam-structure"       element={<ExamStructure />} />
          <Route path="/timetable"            element={<TimetableSetup />} />
          <Route path="/access-requests"      element={<AccessRequests />} />
          <Route path="/fee-structure"        element={<FeeStructure />} />
          <Route path="/request-access"       element={<RequestAccess />} />
          <Route path="*"                     element={<NotFound />} />
        </Routes>
      </DeoGuard>
    </DashboardLayout>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────
const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <ErrorBoundary>
                <AppRoutes />
                {/* PWA: Android/desktop install banner + iOS Add-to-Home-Screen hint */}
                <InstallBanner />
                {/* PWA: SW update notification (production only) */}
                <PWAUpdatePrompt />
                {/* Mobile-only brand splash — shows once per session, above everything */}
                <SplashScreen />
              </ErrorBoundary>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
