import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";
import SuperAdminLayout from "./components/SuperAdminLayout";
import OutreachOfficerLayout from "./components/OutreachOfficerLayout";
import SuperAdminLogin from "./pages/super-admin/SuperAdminLogin";
import SuperAdminDashboard from "./pages/super-admin/SuperAdminDashboard";
import SuperAdminUsers from "./pages/super-admin/SuperAdminUsers";
import OutreachOfficers from "./pages/super-admin/OutreachOfficers";
import OutreachLogin from "./pages/outreach/OutreachLogin";
import OutreachDashboard from "./pages/outreach/OutreachDashboard";
import OutreachSchools from "./pages/outreach/OutreachSchools";
import OutreachEarnings from "./pages/outreach/OutreachEarnings";
import SchoolLogin from "./pages/school/SchoolLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Subjects from "./pages/admin/Subjects";
import Exams from "./pages/admin/Exams";
import Questions from "./pages/admin/Questions";
import Results from "./pages/admin/Results";
import Students from "./pages/admin/Students";
import Settings from "./pages/admin/Settings";
import Sessions from "./pages/admin/Sessions";
import Classes from "./pages/admin/Classes";
import Instructors from "./pages/admin/Instructors";
import Attendance from "./pages/admin/Attendance";
import Timetable from "./pages/admin/Timetable";
import Grades from "./pages/admin/Grades";
import Fees from "./pages/admin/Fees";
import Announcements from "./pages/admin/Announcements";
import StudentDashboard from "./pages/student/StudentDashboard";
import StudentExams from "./pages/student/StudentExams";
import TakeExam from "./pages/student/TakeExam";
import StudentResults from "./pages/student/StudentResults";
import InstructorDashboard from "./pages/instructor/InstructorDashboard";
import Parents from "./pages/admin/Parents";
import ParentDashboard from "./pages/parent/ParentDashboard";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole: "admin" | "student" | "instructor" | "super_admin" | "parent" | "outreach_officer" }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) {
    if (requiredRole === "super_admin") return <Navigate to="/super-admin/login" replace />;
    if (requiredRole === "outreach_officer") return <Navigate to="/outreach/login" replace />;
    if (requiredRole === "student") return <Navigate to="/" replace />;
    return <Navigate to="/" replace />;
  }
  if (role !== requiredRole) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />

      {/* School-specific login */}
      <Route path="/school/:slug" element={<SchoolLogin />} />

      {/* Super Admin */}
      <Route path="/super-admin/login" element={<SuperAdminLogin />} />
      <Route path="/super-admin" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminLayout><SuperAdminDashboard /></SuperAdminLayout></ProtectedRoute>} />
      <Route path="/super-admin/users" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminLayout><SuperAdminUsers /></SuperAdminLayout></ProtectedRoute>} />

      {/* Legacy auth routes - redirect to home */}
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="/auth/admin" element={<Navigate to="/" replace />} />
      <Route path="/auth/student" element={<Navigate to="/" replace />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><AdminDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/sessions" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Sessions /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/classes" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Classes /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Students /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/instructors" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Instructors /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/subjects" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Subjects /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/exams" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Exams /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/exams/:examId/questions" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Questions /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/results" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Results /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Settings /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/attendance" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Attendance /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/timetable" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Timetable /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/grades" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Grades /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/fees" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Fees /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/announcements" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Announcements /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/parents" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Parents /></DashboardLayout></ProtectedRoute>} />

      {/* Instructor routes */}
      <Route path="/instructor" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><InstructorDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/subjects" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Subjects /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/exams" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Exams /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/exams/:examId/questions" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Questions /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/results" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Results /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/students" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Students /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/attendance" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Attendance /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/grades" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Grades /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/timetable" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Timetable /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/fees" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Fees /></DashboardLayout></ProtectedRoute>} />
      <Route path="/instructor/announcements" element={<ProtectedRoute requiredRole="instructor"><DashboardLayout><Announcements /></DashboardLayout></ProtectedRoute>} />

      {/* Student routes */}
      <Route path="/student" element={<ProtectedRoute requiredRole="student"><DashboardLayout><StudentDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/student/exams" element={<ProtectedRoute requiredRole="student"><DashboardLayout><StudentExams /></DashboardLayout></ProtectedRoute>} />
      <Route path="/student/exam/:examId" element={<ProtectedRoute requiredRole="student"><TakeExam /></ProtectedRoute>} />
      <Route path="/student/results" element={<ProtectedRoute requiredRole="student"><DashboardLayout><StudentResults /></DashboardLayout></ProtectedRoute>} />

      {/* Parent routes */}
      <Route path="/parent" element={<ProtectedRoute requiredRole="parent"><DashboardLayout><ParentDashboard /></DashboardLayout></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
