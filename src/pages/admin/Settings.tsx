import { useState, useEffect } from "react";
import { useSchoolName, useUpdateSchoolName } from "@/hooks/useSchoolSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, School } from "lucide-react";

export default function Settings() {
  const { schoolName, isLoading } = useSchoolName();
  const updateMutation = useUpdateSchoolName();
  const [name, setName] = useState("");

  useEffect(() => {
    if (schoolName) setName(schoolName);
  }, [schoolName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("School name cannot be empty");
      return;
    }
    try {
      await updateMutation.mutateAsync(name.trim());
      toast.success("School name updated successfully");
    } catch {
      toast.error("Failed to update school name");
    }
  };

  if (isLoading) {
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
          <form onSubmit={handleSave} className="flex flex-col gap-4 sm:flex-row sm:items-end">
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
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
