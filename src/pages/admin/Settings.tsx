import { useState, useEffect, useRef } from "react";
import { useSchoolName, useSchoolLogo, useUpdateSchoolName, useUpdateSchoolLogo } from "@/hooks/useSchoolSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, School, ImagePlus, Trash2, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";


export default function Settings() {
  const { schoolId } = useAuth();
  const { schoolName, isLoading: nameLoading } = useSchoolName();
  const [notifyAnnouncement, setNotifyAnnouncement] = useState(true);
  const [notifyExamResult, setNotifyExamResult] = useState(true);
  const [notifyFeePayment, setNotifyFeePayment] = useState(true);
  const [notifyAttendanceAbsent, setNotifyAttendanceAbsent] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const loadNotifSettings = async () => {
      const { data } = await supabase.from("school_settings")
        .select("key, value")
        .eq("school_id", schoolId)
        .in("key", ["notify_announcement", "notify_exam_result", "notify_fee_payment", "notify_attendance_absent"]);
      (data || []).forEach((s: any) => {
        const val = s.value === "true";
        if (s.key === "notify_announcement") setNotifyAnnouncement(val);
        if (s.key === "notify_exam_result") setNotifyExamResult(val);
        if (s.key === "notify_fee_payment") setNotifyFeePayment(val);
        if (s.key === "notify_attendance_absent") setNotifyAttendanceAbsent(val);
      });
    };
    loadNotifSettings();
  }, [schoolId]);

  const saveNotifSetting = async (key: string, value: boolean) => {
    if (!schoolId) return;
    await supabase.from("school_settings").upsert(
      { key, value: String(value), school_id: schoolId },
      { onConflict: "school_id,key" }
    );
  };
  const { logoUrl, isLoading: logoLoading } = useSchoolLogo();
  const updateNameMutation = useUpdateSchoolName();
  const updateLogoMutation = useUpdateSchoolLogo();
  const [name, setName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (schoolName) setName(schoolName);
  }, [schoolName]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("School name cannot be empty");
      return;
    }
    try {
      await updateNameMutation.mutateAsync(name.trim());
      toast.success("School name updated successfully");
    } catch {
      toast.error("Failed to update school name");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }
    try {
      await updateLogoMutation.mutateAsync(file);
      toast.success("School logo updated successfully");
    } catch {
      toast.error("Failed to upload logo");
    }
  };

  if (nameLoading || logoLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your school branding and configuration.</p>
      </div>

      {/* School Name */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <School className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>School Name</CardTitle>
              <CardDescription>This name appears across the app — sidebar, login page, and browser tab.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="school-name">School Name</Label>
              <Input
                id="school-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your school name"
                maxLength={100}
              />
            </div>
            <Button type="submit" disabled={updateNameMutation.isPending}>
              {updateNameMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* School Logo */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ImagePlus className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>School Logo</CardTitle>
              <CardDescription>Upload your school logo. It will appear in the sidebar, login page, and as the browser tab icon.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Logo preview */}
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/50 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="School logo" className="h-full w-full object-contain p-1" />
              ) : (
                <ImagePlus className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Recommended: Square image, at least 128×128px. PNG or JPG, max 2MB.
              </p>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={updateLogoMutation.isPending}
                >
                  {updateLogoMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-4 w-4" />
                  )}
                  {logoUrl ? "Change Logo" : "Upload Logo"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Choose which activities trigger automatic email alerts.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "New Announcement", desc: "Notify all relevant users when an announcement is posted", value: notifyAnnouncement, key: "notify_announcement", set: setNotifyAnnouncement },
            { label: "Exam Result Available", desc: "Notify students and parents when exam results are published", value: notifyExamResult, key: "notify_exam_result", set: setNotifyExamResult },
            { label: "Fee Payment Recorded", desc: "Notify students and parents when a fee payment is recorded", value: notifyFeePayment, key: "notify_fee_payment", set: setNotifyFeePayment },
            { label: "Attendance Absent", desc: "Notify parents when their child is marked absent", value: notifyAttendanceAbsent, key: "notify_attendance_absent", set: setNotifyAttendanceAbsent },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <Switch
                checked={item.value}
                onCheckedChange={async (v) => {
                  item.set(v);
                  await saveNotifSetting(item.key, v);
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
