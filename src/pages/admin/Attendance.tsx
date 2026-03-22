import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sendAbsentNotificationEmail } from "@/lib/email";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle, Save } from "lucide-react";

interface StudentProfile { user_id: string; full_name: string; class_id: string | null; }
interface ClassItem { id: string; name: string; }
type AttendanceStatus = "present" | "absent" | "late" | "excused";
interface AttendanceRecord { student_id: string; status: AttendanceStatus; notes: string; }

const statusConfig: Record<AttendanceStatus, { label: string; icon: any; color: string }> = {
  present: { label: "Present", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  absent: { label: "Absent", icon: XCircle, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  late: { label: "Late", icon: Clock, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  excused: { label: "Excused", icon: AlertCircle, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

export default function Attendance() {
  const { user, schoolId } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingRecords, setExistingRecords] = useState(false);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, late: 0, excused: 0 });

  useEffect(() => {
    if (!schoolId) return;
    supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name").then(({ data }) => {
      setClasses((data as ClassItem[]) || []);
      setLoading(false);
    });
  }, [schoolId]);

  useEffect(() => {
    if (!selectedClass || !schoolId) return;
    loadStudentsAndAttendance();
  }, [selectedClass, selectedDate]);

  const loadStudentsAndAttendance = async () => {
    setLoading(true);
    // Use SECURITY DEFINER function - guaranteed to only return this school's students
    const { data: allStudents } = await supabase
      .rpc("get_school_students_only", { _school_id: schoolId! });
    const studentList = ((allStudents as any[]) || [])
      .filter((s: any) => s.class_id === selectedClass)
      .map((s: any) => ({ user_id: s.user_id, full_name: s.full_name, class_id: s.class_id }));
    setStudents(studentList as StudentProfile[]);

    const { data: attendanceData } = await supabase
      .from("attendance").select("*")
      .eq("class_id", selectedClass).eq("date", selectedDate).eq("school_id", schoolId!);

    const recordMap = new Map<string, AttendanceRecord>();
    if (attendanceData && attendanceData.length > 0) {
      setExistingRecords(true);
      attendanceData.forEach((a: any) => {
        recordMap.set(a.student_id, { student_id: a.student_id, status: a.status, notes: a.notes || "" });
      });
    } else {
      setExistingRecords(false);
      studentList.forEach((s) => {
        recordMap.set(s.user_id, { student_id: s.user_id, status: "present", notes: "" });
      });
    }
    setRecords(recordMap);
    updateStats(recordMap);
    setLoading(false);
  };

  const updateStats = (recordMap: Map<string, AttendanceRecord>) => {
    const values = Array.from(recordMap.values());
    setStats({
      total: values.length,
      present: values.filter((r) => r.status === "present").length,
      absent: values.filter((r) => r.status === "absent").length,
      late: values.filter((r) => r.status === "late").length,
      excused: values.filter((r) => r.status === "excused").length,
    });
  };

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    const newRecords = new Map(records);
    const existing = newRecords.get(studentId) || { student_id: studentId, status: "present", notes: "" };
    newRecords.set(studentId, { ...existing, status });
    setRecords(newRecords);
    updateStats(newRecords);
  };

  const markAll = (status: AttendanceStatus) => {
    const newRecords = new Map(records);
    students.forEach((s) => {
      const existing = newRecords.get(s.user_id) || { student_id: s.user_id, status: "present", notes: "" };
      newRecords.set(s.user_id, { ...existing, status });
    });
    setRecords(newRecords);
    updateStats(newRecords);
  };

  const handleSave = async () => {
    if (!selectedClass || !user || !schoolId) return;
    setSaving(true);
    try {
      await supabase.from("attendance").delete().eq("class_id", selectedClass).eq("date", selectedDate).eq("school_id", schoolId);
      const inserts = Array.from(records.values()).map((r) => ({
        student_id: r.student_id, class_id: selectedClass, school_id: schoolId,
        date: selectedDate, status: r.status as any, marked_by: user.id, notes: r.notes,
      }));
      const { error } = await supabase.from("attendance").insert(inserts as any);
      if (error) throw error;
      toast.success("Attendance saved successfully");
      setExistingRecords(true);
      // Send absent notifications to parents
      try {
        const absentStudents = Array.from(records.values()).filter(r => r.status === "absent");
        for (const absent of absentStudents) {
          const { data: parentLinks } = await supabase.from("parent_students").select("parent_id").eq("student_id", absent.student_id);
          if (!parentLinks || parentLinks.length === 0) continue;
          const parentIds = parentLinks.map((p: any) => p.parent_id);
          const { data: parentEmailRows } = await supabase.rpc("get_user_emails_by_ids", { _user_ids: parentIds });
          const parentEmails = (parentEmailRows || []).map((r: any) => r.email).filter(Boolean);
          if (parentEmails.length === 0) continue;
          const studentProfile = students.find(s => s.user_id === absent.student_id);
          const className = classes.find(c => c.id === selectedClass)?.name || "";
          // Get parent names
          const { data: parentProfiles } = await supabase.from("profiles").select("full_name").in("user_id", parentIds);
          const parentName = parentProfiles?.[0]?.full_name || "Parent";
          if (studentProfile) {
            await sendAbsentNotificationEmail({
              to: parentEmails,
              parentName,
              studentName: studentProfile.full_name,
              schoolName: document.title || "School",
              className,
              date: selectedDate,
              loginUrl: window.location.origin,
            });
          }
        }
      } catch {}
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  if (loading && !selectedClass) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground">Mark and track daily student attendance</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-48">
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-48" />
      </div>

      {selectedClass && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{stats.present}</p><p className="text-xs text-muted-foreground">Present</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{stats.absent}</p><p className="text-xs text-muted-foreground">Absent</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-600">{stats.late}</p><p className="text-xs text-muted-foreground">Late</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{stats.excused}</p><p className="text-xs text-muted-foreground">Excused</p></CardContent></Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => markAll("present")}>Mark All Present</Button>
            <Button variant="outline" size="sm" onClick={() => markAll("absent")}>Mark All Absent</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {existingRecords ? "Update Attendance" : "Save Attendance"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No students in this class</TableCell></TableRow>
                  ) : (
                    students.map((student, idx) => {
                      const record = records.get(student.user_id);
                      const currentStatus = record?.status || "present";
                      return (
                        <TableRow key={student.user_id}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{student.full_name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(Object.keys(statusConfig) as AttendanceStatus[]).map((status) => {
                                const config = statusConfig[status];
                                const Icon = config.icon;
                                return (
                                  <button
                                    key={status}
                                    onClick={() => setStatus(student.user_id, status)}
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                                      currentStatus === status ? config.color + " ring-2 ring-offset-1 ring-current" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    <Icon className="h-3 w-3" />
                                    <span className="hidden sm:inline">{config.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {selectedClass && loading && (
        <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      )}
    </div>
  );
}
