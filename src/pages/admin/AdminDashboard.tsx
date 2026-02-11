import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, FileText, Users, ClipboardList } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ students: 0, subjects: 0, exams: 0, attempts: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const [students, subjects, exams, attempts] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }).eq("is_submitted", true),
      ]);
      setStats({
        students: students.count ?? 0,
        subjects: subjects.count ?? 0,
        exams: exams.count ?? 0,
        attempts: attempts.count ?? 0,
      });
    };
    fetchStats();
  }, []);

  const cards = [
    { label: "Students", value: stats.students, icon: Users, color: "bg-primary" },
    { label: "Subjects", value: stats.subjects, icon: BookOpen, color: "bg-secondary" },
    { label: "Exams", value: stats.exams, icon: FileText, color: "bg-accent" },
    { label: "Submissions", value: stats.attempts, icon: ClipboardList, color: "bg-destructive" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.color} text-white`}>
                <c.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
