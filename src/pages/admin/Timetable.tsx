import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, Clock, Trash2, Edit } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Period {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  period_order: number;
}

interface TimetableEntry {
  id: string;
  class_id: string;
  subject_id: string;
  instructor_id: string | null;
  period_id: string;
  day_of_week: number;
}

interface ClassItem { id: string; name: string; }
interface Subject { id: string; name: string; }

export default function Timetable() {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [loading, setLoading] = useState(true);

  // Period dialog
  const [periodDialog, setPeriodDialog] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [periodName, setPeriodName] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  // Entry dialog
  const [entryDialog, setEntryDialog] = useState(false);
  const [entryDay, setEntryDay] = useState(0);
  const [entryPeriod, setEntryPeriod] = useState("");
  const [entrySubject, setEntrySubject] = useState("");

  const [schoolId, setSchoolId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const [classRes, subjectRes] = await Promise.all([
        supabase.from("classes").select("id, name").order("name"),
        supabase.from("subjects").select("id, name").order("name"),
      ]);
      setClasses((classRes.data as ClassItem[]) || []);
      setSubjects((subjectRes.data as Subject[]) || []);

      if (user) {
        const { data: profile } = await supabase.from("profiles").select("school_id").eq("user_id", user.id).single();
        if (profile?.school_id) {
          setSchoolId(profile.school_id);
          const { data: periodData } = await supabase.from("timetable_periods").select("*").eq("school_id", profile.school_id).order("period_order");
          setPeriods((periodData as Period[]) || []);
        }
      }
      setLoading(false);
    };
    init();
  }, [user]);

  useEffect(() => {
    if (!selectedClass) return;
    supabase.from("timetable_entries").select("*").eq("class_id", selectedClass).then(({ data }) => {
      setEntries((data as TimetableEntry[]) || []);
    });
  }, [selectedClass]);

  const handleSavePeriod = async () => {
    if (!periodName || !schoolId) return;
    setSaving(true);
    try {
      if (editingPeriod) {
        const { error } = await supabase.from("timetable_periods").update({ name: periodName, start_time: startTime, end_time: endTime }).eq("id", editingPeriod.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("timetable_periods").insert({
          school_id: schoolId, name: periodName, start_time: startTime, end_time: endTime,
          period_order: periods.length,
        } as any);
        if (error) throw error;
      }
      toast.success("Period saved");
      setPeriodDialog(false);
      // Reload periods
      const { data } = await supabase.from("timetable_periods").select("*").eq("school_id", schoolId).order("period_order");
      setPeriods((data as Period[]) || []);
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleDeletePeriod = async (id: string) => {
    if (!confirm("Delete this period?")) return;
    await supabase.from("timetable_periods").delete().eq("id", id);
    setPeriods(periods.filter((p) => p.id !== id));
    toast.success("Period deleted");
  };

  const handleAddEntry = async () => {
    if (!selectedClass || !entryPeriod || !entrySubject || !schoolId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("timetable_entries").insert({
        school_id: schoolId, class_id: selectedClass, subject_id: entrySubject,
        period_id: entryPeriod, day_of_week: entryDay,
      } as any);
      if (error) throw error;
      toast.success("Entry added");
      setEntryDialog(false);
      const { data } = await supabase.from("timetable_entries").select("*").eq("class_id", selectedClass);
      setEntries((data as TimetableEntry[]) || []);
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleDeleteEntry = async (id: string) => {
    await supabase.from("timetable_entries").delete().eq("id", id);
    setEntries(entries.filter((e) => e.id !== id));
    toast.success("Entry removed");
  };

  const getSubjectName = (id: string) => subjects.find((s) => s.id === id)?.name || "—";
  const getPeriodName = (id: string) => {
    const p = periods.find((p) => p.id === id);
    return p ? `${p.name} (${p.start_time.slice(0, 5)} - ${p.end_time.slice(0, 5)})` : "—";
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Timetable</h1>
        <p className="text-muted-foreground">Manage periods and class schedules</p>
      </div>

      {/* Periods Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Periods</CardTitle>
          <Button size="sm" onClick={() => { setEditingPeriod(null); setPeriodName(""); setStartTime("08:00"); setEndTime("09:00"); setPeriodDialog(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add Period
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No periods configured</TableCell></TableRow>
              ) : (
                periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.start_time.slice(0, 5)}</TableCell>
                    <TableCell>{p.end_time.slice(0, 5)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingPeriod(p); setPeriodName(p.name); setStartTime(p.start_time.slice(0, 5)); setEndTime(p.end_time.slice(0, 5)); setPeriodDialog(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeletePeriod(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Class Schedule</CardTitle>
          <div className="flex gap-2">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select Class" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedClass && (
              <Button size="sm" onClick={() => { setEntryDay(0); setEntryPeriod(""); setEntrySubject(""); setEntryDialog(true); }}>
                <Plus className="mr-1 h-4 w-4" /> Add Entry
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedClass ? (
            <p className="text-center text-muted-foreground py-8">Select a class to view/manage its timetable</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    {DAYS.slice(0, 5).map((d) => <TableHead key={d}>{d}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Add periods first</TableCell></TableRow>
                  ) : (
                    periods.map((period) => (
                      <TableRow key={period.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {period.name}<br />
                          <span className="text-xs text-muted-foreground">{period.start_time.slice(0, 5)} - {period.end_time.slice(0, 5)}</span>
                        </TableCell>
                        {DAYS.slice(0, 5).map((_, dayIdx) => {
                          const entry = entries.find((e) => e.period_id === period.id && e.day_of_week === dayIdx);
                          return (
                            <TableCell key={dayIdx} className="min-w-[100px]">
                              {entry ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-medium">{getSubjectName(entry.subject_id)}</span>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDeleteEntry(entry.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Period Dialog */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPeriod ? "Edit Period" : "Add Period"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Period Name</Label><Input value={periodName} onChange={(e) => setPeriodName(e.target.value)} placeholder="Period 1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
              <div className="space-y-2"><Label>End Time</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
            </div>
            <Button onClick={handleSavePeriod} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry Dialog */}
      <Dialog open={entryDialog} onOpenChange={setEntryDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Timetable Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Day</Label>
              <Select value={String(entryDay)} onValueChange={(v) => setEntryDay(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.slice(0, 5).map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={entryPeriod} onValueChange={setEntryPeriod}>
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.start_time.slice(0, 5)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={entrySubject} onValueChange={setEntrySubject}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddEntry} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
