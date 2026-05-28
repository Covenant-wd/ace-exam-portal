import { useState, useEffect, useRef } from "react";
import {
  useSchoolName, useSchoolLogo,
  useUpdateSchoolName, useUpdateSchoolLogo,
  useSchoolCbtLink, useUpdateCbtLink,
} from "@/hooks/useSchoolSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, School, ImagePlus, Bell, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export default function Settings() {
  const { schoolId } = useAuth();
  const { schoolName, isLoading: nameLoading } = useSchoolName();
  const { cbtLink } = useSchoolCbtLink();
  const updateCbtLinkMutation = useUpdateCbtLink();
  const [cbtUrl, setCbtUrl] = useState("");

  const [notifyAnnouncement, setNotifyAnnouncement] = useState(true);
  const [notifyFeePayment, setNotifyFeePayment] = useState(true);
  const [notifyAttendanceAbsent, setNotifyAttendanceAbsent] = useState(true);
  const [notifyGradesPublished, setNotifyGradesPublished] = useState(true);
  const [notifyGradesParent, setNotifyGradesParent] = useState(true);
  const [notifyWelcomeEmail, setNotifyWelcomeEmail] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);

  useEffect(() => {
    if (cbtLink !== null) setCbtUrl(cbtLink ?? "");
  }, [cbtLink]);

  useEffect(() => {
    if (!schoolId) return;
    const loadNotifSettings = async () => {
      const { data } = await supabase.from("school_settings")
        .select("key, value")
        .eq("school_id", schoolId)
        .in("key", [
          "notify_announcement", "notify_fee_payment", "notify_attendance_absent",
          "notify_grades_published", "notify_grades_parent", "notify_welcome_email",
        ]);
      (data || []).forEach((s: any) => {
        const val = s.value === "true";
        if (s.key === "notify_announcement")    setNotifyAnnouncement(val);
        if (s.key === "notify_fee_payment")     setNotifyFeePayment(val);
        if (s.key === "notify_attendance_absent") setNotifyAttendanceAbsent(val);
        if (s.key === "notify_grades_published") setNotifyGradesPublished(val);
        if (s.key === "notify_grades_parent")   setNotifyGradesParent(val);
        if (s.key === "notify_welcome_email")   setNotifyWelcomeEmail(val);
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

  const handleSaveCbtUrl = async () => {
    try {
      // Basic URL validation when a value is provided
      if (cbtUrl.trim() && !cbtUrl.trim().startsWith("http")) {
        toast.error("Please enter a valid URL starting with http:// or https://");
        return;
      }
      await updateCbtLinkMutation.mutateAsync(cbtUrl.trim());
      toast.success(cbtUrl.trim() ? "CBT portal link saved" : "CBT portal link removed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save CBT portal link");
    }
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
    } catch (err: any) {
      toast.error(err?.message || "Failed to update school name");
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
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload logo");
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

      {/* External CBT Portal */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>External CBT Portal</CardTitle>
              <CardDescription>
                Link your school's external CBT (Computer Based Testing) platform. When set, a
                "CBT Portal" launch button will appear in the sidebar and header for all users.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="cbt-url">CBT Portal URL</Label>
              <Input
                id="cbt-url"
                type="url"
                value={cbtUrl}
                onChange={(e) => setCbtUrl(e.target.value)}
                placeholder="https://cbt.yourschool.com"
              />
            </div>
            <Button onClick={handleSaveCbtUrl} disabled={updateCbtLinkMutation.isPending}>
              {updateCbtLinkMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
            {[
              "Students, instructors, and admins see a &quot;CBT Portal&quot; button in their sidebar",
              "Clicking the button opens your external CBT platform in a new tab",
              "Leave the URL blank to hide the CBT Portal button entirely",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-blue-500 font-bold mt-0.5">→</span>
                <span>{item}</span>
              </div>
            ))}
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
            { label: "Fee Payment Recorded", desc: "Notify students and parents when a fee payment is recorded", value: notifyFeePayment, key: "notify_fee_payment", set: setNotifyFeePayment },
            { label: "Attendance Absent", desc: "Notify parents when their child is marked absent", value: notifyAttendanceAbsent, key: "notify_attendance_absent", set: setNotifyAttendanceAbsent },
            { label: "Grades Published (Students)", desc: "Notify students when grades are entered", value: notifyGradesPublished, key: "notify_grades_published", set: setNotifyGradesPublished },
            { label: "Grades Published (Parents)", desc: "Notify parents when grades are entered for their children", value: notifyGradesParent, key: "notify_grades_parent", set: setNotifyGradesParent },
            { label: "Welcome Email (New Users)", desc: "Send a welcome email with login credentials when an instructor or student account is created", value: notifyWelcomeEmail, key: "notify_welcome_email", set: setNotifyWelcomeEmail },
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
