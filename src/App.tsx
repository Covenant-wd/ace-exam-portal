import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Subjects from "./pages/admin/Subjects";
import Exams from "./pages/admin/Exams";
import Questions from "./pages/admin/Questions";
import Results from "./pages/admin/Results";
import Students from "./pages/admin/Students";
import Settings from "./pages/admin/Settings";
import Sessions from "./pages/admin/Sessions";
import Classes from "./pages/admin/Classes";
import StudentExams from "./pages/student/StudentExams";
import TakeExam from "./pages/student/TakeExam";
import StudentResults from "./pages/student/StudentResults";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole: "admin" | "student" }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (role !== requiredRole) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><AdminDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/sessions" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Sessions /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/classes" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Classes /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Students /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/subjects" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Subjects /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/exams" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Exams /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/exams/:examId/questions" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Questions /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/results" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Results /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><DashboardLayout><Settings /></DashboardLayout></ProtectedRoute>} />

      {/* Student routes */}
      <Route path="/student" element={<ProtectedRoute requiredRole="student"><DashboardLayout><StudentExams /></DashboardLayout></ProtectedRoute>} />
      <Route path="/student/exam/:examId" element={<ProtectedRoute requiredRole="student"><TakeExam /></ProtectedRoute>} />
      <Route path="/student/results" element={<ProtectedRoute requiredRole="student"><DashboardLayout><StudentResults /></DashboardLayout></ProtectedRoute>} />

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
