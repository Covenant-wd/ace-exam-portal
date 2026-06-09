import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, GraduationCap, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function SchoolRegistration() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "success">("form");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    school_name: "",
    contact_person: "",
    phone: "",
    address: "",
    website: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.email.trim() || !formData.school_name.trim() || !formData.contact_person.trim()) {
        toast.error("Please fill in all required fields");
        setLoading(false);
        return;
      }

      // Call edge function to handle registration
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-school-registration`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Registration failed. Please try again.");
        setLoading(false);
        return;
      }

      toast.success(data.message || "Registration submitted successfully!");
      setStep("success");
    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-2">Registration Submitted</h2>
                <p className="text-muted-foreground">
                  Thank you for registering {formData.school_name}. We've received your application.
                </p>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 p-4 text-left space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">What happens next:</p>
                  <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
                    <li>Our team will review your application</li>
                    <li>We'll send you an email with approval status</li>
                    <li>Once approved, you'll receive admin login credentials</li>
                    <li>You can then start setting up your school</li>
                  </ol>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-600">
                    We'll review your application within <strong>24-48 hours</strong>. Check your email ({formData.email}) for updates.
                  </p>
                </div>
              </div>

              <Button
                onClick={() => navigate("/")}
                className="w-full"
              >
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4 py-12">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <GraduationCap className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">Register Your School</CardTitle>
          <CardDescription>
            Join Academia HQ and start managing your school digitally
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* School Name */}
            <div className="space-y-2">
              <Label htmlFor="school_name">
                School Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="school_name"
                name="school_name"
                value={formData.school_name}
                onChange={handleChange}
                placeholder="e.g., Excellent Academy"
                required
              />
            </div>

            {/* Contact Person */}
            <div className="space-y-2">
              <Label htmlFor="contact_person">
                Contact Person <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contact_person"
                name="contact_person"
                value={formData.contact_person}
                onChange={handleChange}
                placeholder="e.g., John Doe"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">
                Email Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="principal@school.com"
                required
              />
              <p className="text-xs text-muted-foreground">
                We'll send approval updates to this email
              </p>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+234-903-958-0317"
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address">School Address</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="123 Education Street, Lagos"
              />
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label htmlFor="website">School Website</Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://yourschool.com"
              />
            </div>

            {/* Disclaimer */}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
              <p>
                <strong>Note:</strong> Your registration will be reviewed by our admin team. We may request additional information if needed.
              </p>
              <p>
                Once approved, you'll receive login credentials and can start configuring your school dashboard.
              </p>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Registration"
              )}
            </Button>

            {/* Terms */}
            <p className="text-center text-xs text-muted-foreground">
              By registering, you agree to our Terms of Service and Privacy Policy
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
