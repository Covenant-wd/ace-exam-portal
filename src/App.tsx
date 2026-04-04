import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages for faster initial load
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DashboardLayout = lazy(() => import("./components/DashboardLayout"));
const SuperAdminLayout = lazy(() => import("./components/SuperAdminLayout"));
const OutreachOfficerLayout = lazy(() => import("./components/OutreachOfficerLayout"));
const SuperAdminLogin = lazy(() => import("./pages/super-admin/SuperAdminLogin"));
const SuperAdminDashboard = lazy(() => import("./pages/super-admin/SuperAdminDashboard"));
const SuperAdminUsers = lazy(() => import("./pages/super-admin/SuperAdminUsers"));
const OutreachOfficers = lazy(() => import("./pages/super-admin/OutreachOfficers"));
const OutreachLogin = lazy(() => import("./pages/outreach/OutreachLogin"));
const OutreachDashboard = lazy(() => import("./pages/outreach/OutreachDashboard"));
const OutreachSchools = lazy(() => import("./pages/outreach/OutreachSchools"));
const OutreachEarnings = lazy(() => import("./pages/outreach/OutreachEarnings"));
const SchoolLogin = lazy(() => import("./pages/school/SchoolLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const Subjects = lazy(() => import("./pages/admin/Subjects"));
const Exams = lazy(() => import("./pages/admin/Exams"));
const Questions = lazy(() => import("./pages/admin/Questions"));
const Results = lazy(() => import("./pages/admin/Results"));
const Students = lazy(() => import("./pages/admin/Students"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const Sessions = lazy(() => import("./pages/admin/Sessions"));
const Classes = lazy(() => import("./pages/admin/Classes"));
const Instructors = lazy(() => import("./pages/admin/Instructors"));
const Attendance = lazy(() => import("./pages/admin/Attendance"));
const Timetable = lazy(() => import("./pages/admin/Timetable"));
const Grades = lazy(() => import("./pages/admin/Grades"));
const Fees = lazy(() => import("./pages/admin/Fees"));
const Announcements = lazy(() => import("./pages/admin/Announcements"));
const StudentDashboard = lazy(() => import("./pages/student/StudentDashboard"));
const StudentExams = lazy(() => import("./pages/student/StudentExams"));
const TakeExam = lazy(() => import("./pages/student/TakeExam"));
const StudentResults = lazy(() => import("./pages/student/StudentResults"));
const InstructorDashboard = lazy(() => import("./pages/instructor/InstructorDashboard"));
const Parents = lazy(() => import("./pages/admin/Parents"));
const ParentDashboard = lazy(() => import("./pages/parent/ParentDashboard"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole: "admin" | "student" | "instructor" | "super_admin" | "parent" | "outreach_officer" }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    if (requiredRole === "super_admin") return <Navigate to="/super-admin/login" replace />;
    if (requiredRole === "outreach_officer") return <Navigate to="/outreach/login" replace />;
    return <Navigate to="/" replace />;
  }

  if (!role) {
    return <Navigate to="/" replace />;
  }

  if (role !== requiredRole) {
    if (role === "super_admin") return <Navigate to="/super-admin" replace />;
    if (role === "outreach_officer") return <Navigate to="/outreach" replace />;
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "instructor") return <Navigate to="/instructor" replace />;
    if (role === "parent") return <Navigate to="/parent" replace />;
    if (role === "student") return <Navigate to="/student" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Index />} />

        {/* School-specific login */}
        <Route path="/school/:slug" element={<SchoolLogin />} />

        {/* Super Admin */}
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />
        <Route path="/super-admin" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminLayout><SuperAdminDashboard /></SuperAdminLayout></ProtectedRoute>} />
        <Route path="/super-admin/users" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminLayout><SuperAdminUsers /></SuperAdminLayout></ProtectedRoute>} />
        <Route path="/super-admin/outreach-officers" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminLayout><OutreachOfficers /></SuperAdminLayout></ProtectedRoute>} />

        {/* Outreach Officer */}
        <Route path="/outreach/login" element={<OutreachLogin />} />
        <Route path="/outreach" element={<ProtectedRoute requiredRole="outreach_officer"><OutreachOfficerLayout><OutreachDashboard /></OutreachOfficerLayout></ProtectedRoute>} />
        <Route path="/outreach/schools" element={<ProtectedRoute requiredRole="outreach_officer"><OutreachOfficerLayout><OutreachSchools /></OutreachOfficerLayout></ProtectedRoute>} />
        <Route path="/outreach/earnings" element={<ProtectedRoute requiredRole="outreach_officer"><OutreachOfficerLayout><OutreachEarnings /></OutreachOfficerLayout></ProtectedRoute>} />

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
    </Suspense>
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