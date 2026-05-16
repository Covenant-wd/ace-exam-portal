// Academia HQ Email Utility — sends via secure edge function
import { supabase } from "@/integrations/supabase/client";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const recipients = Array.from(new Set((Array.isArray(to) ? to : [to]).map((email) => email.trim().toLowerCase()).filter(Boolean)));
  if (recipients.length === 0) return true;

  try {
    const batchSize = 45;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { to: batch, subject, html },
      });
      if (error) {
        // FIX: Log the full Supabase FunctionsHttpError detail so it's visible
        // in the browser console. Previously only "error" was logged which
        // truncated the Resend error message (e.g. "API key invalid").
        console.error("[sendEmail] Edge function invocation error:", error?.message, error);
        return false;
      }
      if (data?.success !== true) {
        // FIX: Log the actual Resend error body returned by the edge function
        console.error("[sendEmail] Edge function returned failure:", JSON.stringify(data));
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("[sendEmail] Unexpected exception:", err);
    return false;
  }
}

// Helper to check if a notification type is enabled for a school
export async function isNotificationEnabled(schoolId: string, key: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("school_settings")
      .select("value")
      .eq("school_id", schoolId)
      .eq("key", key)
      .maybeSingle();
    // Default to true if no setting exists
    if (!data) return true;
    return data.value === "true";
  } catch {
    return true; // Default to enabled
  }
}

// ─────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────

function baseTemplate(content: string, schoolName: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:32px 40px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${schoolName}</p>
          <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">Powered by Academia HQ</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#999;">This is an automated message from ${schoolName} via Academia HQ.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string) {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">${text}</a>`;
}

function heading(text: string) {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.5px;">${text}</h1>`;
}

function para(text: string) {
  return `<p style="margin:8px 0;font-size:15px;color:#444;line-height:1.6;">${text}</p>`;
}

function infoBox(rows: { label: string; value: string }[]) {
  const cells = rows.map(r =>
    `<tr>
      <td style="padding:8px 16px;font-size:13px;color:#666;font-weight:500;width:40%;">${r.label}</td>
      <td style="padding:8px 16px;font-size:13px;color:#111;font-weight:600;">${r.value}</td>
    </tr>`
  ).join("");
  return `<table style="width:100%;background:#f8f8fc;border-radius:10px;margin:16px 0;border-collapse:collapse;">${cells}</table>`;
}

// ─────────────────────────────────────────────
// 1. Welcome — New School Admin
// ─────────────────────────────────────────────
export async function sendAdminWelcomeEmail({
  to, adminName, schoolName, loginUrl, password,
}: { to: string; adminName: string; schoolName: string; loginUrl: string; password: string }) {
  const html = baseTemplate(`
    ${heading(`Welcome to ${schoolName}! 🎉`)}
    ${para(`Hi ${adminName}, your admin account has been created for <strong>${schoolName}</strong> on Academia HQ.`)}
    ${infoBox([
      { label: "Role", value: "School Admin" },
      { label: "Email", value: to },
      { label: "Password", value: password },
      { label: "School", value: schoolName },
    ])}
    ${para("Use the button below to log in and start setting up your school.")}
    ${btn("Log In to Admin Panel", loginUrl)}
    ${para(`<span style="color:#999;font-size:13px;">Please change your password after your first login.</span>`)}
  `, schoolName);

  return sendEmail({ to, subject: `Welcome to ${schoolName} — Admin Account Created`, html });
}

// ─────────────────────────────────────────────
// 2. Welcome — New Instructor
// ─────────────────────────────────────────────
export async function sendInstructorWelcomeEmail({
  to, instructorName, schoolName, loginUrl, password,
}: { to: string; instructorName: string; schoolName: string; loginUrl: string; password: string }) {
  const html = baseTemplate(`
    ${heading(`You've been added as an Instructor! 👋`)}
    ${para(`Hi ${instructorName}, your instructor account has been created for <strong>${schoolName}</strong>.`)}
    ${infoBox([
      { label: "Role", value: "Instructor" },
      { label: "Email", value: to },
      { label: "Password", value: password },
      { label: "School", value: schoolName },
    ])}
    ${para("Click below to log in and view your assigned classes and permissions.")}
    ${btn("Log In as Instructor", loginUrl)}
    ${para(`<span style="color:#999;font-size:13px;">Please change your password after your first login.</span>`)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — Instructor Account Created`, html });
}

// ─────────────────────────────────────────────
// 3. Welcome — New Parent
// ─────────────────────────────────────────────
export async function sendParentWelcomeEmail({
  to, parentName, schoolName, loginUrl, username, childNames,
}: { to: string; parentName: string; schoolName: string; loginUrl: string; username: string; childNames: string[] }) {
  const html = baseTemplate(`
    ${heading(`Welcome to ${schoolName} Parent Portal! 👨‍👩‍👧`)}
    ${para(`Hi ${parentName}, your parent account has been created on Academia HQ for <strong>${schoolName}</strong>.`)}
    ${infoBox([
      { label: "Username", value: username },
      { label: "Child(ren)", value: childNames.join(", ") || "To be assigned" },
      { label: "School", value: schoolName },
    ])}
    ${para("You can now track your child's attendance, grades, exam results, and fee payments.")}
    ${btn("Log In to Parent Portal", loginUrl)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — Parent Portal Access`, html });
}

// ─────────────────────────────────────────────
// 4. New Announcement
// ─────────────────────────────────────────────
export async function sendAnnouncementEmail({
  to, schoolName, title, content, loginUrl,
}: { to: string[]; schoolName: string; title: string; content: string; loginUrl: string }) {
  if (to.length === 0) return true;
  const html = baseTemplate(`
    ${heading(`📢 New Announcement`)}
    ${para(`<strong>${schoolName}</strong> has posted a new announcement:`)}
    <div style="background:#f8f8fc;border-left:4px solid #7c3aed;border-radius:0 10px 10px 0;padding:16px 20px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#111;">${title}</p>
      <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">${content}</p>
    </div>
    ${btn("View on Portal", loginUrl)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — ${title}`, html });
}

// ─────────────────────────────────────────────
// 5. Exam Result Available
// ─────────────────────────────────────────────
export async function sendExamResultEmail({
  to, recipientName, studentName, schoolName, examTitle,
  score, totalQuestions, loginUrl,
}: {
  to: string[]; recipientName: string; studentName: string; schoolName: string;
  examTitle: string; score: number; totalQuestions: number; loginUrl: string;
}) {
  if (to.length === 0) return true;
  const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const passed = pct >= 50;
  const resultColor = passed ? "#10b981" : "#ef4444";
  const resultText = passed ? "PASS ✅" : "FAIL ❌";

  const html = baseTemplate(`
    ${heading(`Exam Result Available 📝`)}
    ${para(`Hi ${recipientName}, the result for <strong>${examTitle}</strong> is now available.`)}
    ${infoBox([
      { label: "Student", value: studentName },
      { label: "Exam", value: examTitle },
      { label: "Score", value: `${score} / ${totalQuestions}` },
      { label: "Percentage", value: `${pct}%` },
      { label: "Result", value: resultText },
    ])}
    <div style="text-align:center;margin:20px 0;">
      <span style="font-size:48px;font-weight:800;color:${resultColor};">${pct}%</span>
    </div>
    ${btn("View Full Result", loginUrl)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — Exam Result: ${examTitle}`, html });
}

// ─────────────────────────────────────────────
// 6. Fee Payment Recorded
// ─────────────────────────────────────────────
export async function sendFeePaymentEmail({
  to, recipientName, studentName, schoolName, feeName,
  amountPaid, paymentDate, receiptNumber, loginUrl,
}: {
  to: string[]; recipientName: string; studentName: string; schoolName: string;
  feeName: string; amountPaid: number; paymentDate: string; receiptNumber: string; loginUrl: string;
}) {
  if (to.length === 0) return true;
  const html = baseTemplate(`
    ${heading(`Fee Payment Recorded 💳`)}
    ${para(`Hi ${recipientName}, a fee payment has been recorded for <strong>${studentName}</strong>.`)}
    ${infoBox([
      { label: "Student", value: studentName },
      { label: "Fee", value: feeName },
      { label: "Amount Paid", value: `₦${Number(amountPaid).toLocaleString()}` },
      { label: "Date", value: new Date(paymentDate).toLocaleDateString() },
      ...(receiptNumber ? [{ label: "Receipt No.", value: receiptNumber }] : []),
    ])}
    ${btn("View Payment Details", loginUrl)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — Fee Payment: ${feeName}`, html });
}

// ─────────────────────────────────────────────
// 7. Attendance — Absent Notification (to parents)
// ─────────────────────────────────────────────
export async function sendAbsentNotificationEmail({
  to, parentName, studentName, schoolName, className, date, loginUrl,
}: {
  to: string[]; parentName: string; studentName: string; schoolName: string;
  className: string; date: string; loginUrl: string;
}) {
  if (to.length === 0) return true;
  const html = baseTemplate(`
    ${heading(`Absence Notification ⚠️`)}
    ${para(`Dear ${parentName}, this is to inform you that <strong>${studentName}</strong> was marked absent today.`)}
    ${infoBox([
      { label: "Student", value: studentName },
      { label: "Class", value: className },
      { label: "Date", value: new Date(date).toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) },
      { label: "Status", value: "Absent ❌" },
    ])}
    ${para("If this is an error or your child was excused, please contact the school.")}
    ${btn("View Attendance Record", loginUrl)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — Absence Alert: ${studentName}`, html });
}

// ─────────────────────────────────────────────
// 8. Welcome — New Student
// ─────────────────────────────────────────────
export async function sendStudentWelcomeEmail({
  to, studentName, schoolName, loginUrl, password, username,
}: { to: string; studentName: string; schoolName: string; loginUrl: string; password: string; username?: string }) {
  const html = baseTemplate(`
    ${heading(`Welcome to ${schoolName}! 🎓`)}
    ${para(`Hi ${studentName}, your student account has been created on <strong>${schoolName}</strong>.`)}
    ${infoBox([
      { label: "Role", value: "Student" },
      { label: "Email", value: to },
      ...(username ? [{ label: "Username", value: username }] : []),
      { label: "Password", value: password },
      { label: "School", value: schoolName },
    ])}
    ${para("Use the button below to log in and access your exams, grades, and timetable.")}
    ${btn("Log In to Student Portal", loginUrl)}
    ${para(`<span style="color:#999;font-size:13px;">Please change your password after your first login.</span>`)}
  `, schoolName);

  return sendEmail({ to, subject: `Welcome to ${schoolName} — Student Account Created`, html });
}

// ─────────────────────────────────────────────
// 9. Exam Published — Notify Students
// ─────────────────────────────────────────────
export async function sendExamPublishedEmail({
  to, schoolName, examTitle, subjectName, durationMinutes, loginUrl,
}: { to: string[]; schoolName: string; examTitle: string; subjectName: string; durationMinutes: number; loginUrl: string }) {
  if (to.length === 0) return true;
  const html = baseTemplate(`
    ${heading(`New Exam Available 📝`)}
    ${para(`A new exam has been published on <strong>${schoolName}</strong>.`)}
    ${infoBox([
      { label: "Exam", value: examTitle },
      { label: "Subject", value: subjectName },
      { label: "Duration", value: `${durationMinutes} minutes` },
    ])}
    ${para("Log in to your student portal to view and take the exam.")}
    ${btn("View Exams", loginUrl)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — New Exam: ${examTitle}`, html });
}

// ─────────────────────────────────────────────
// 10. Grades Published — Notify Students/Parents
// ─────────────────────────────────────────────
export async function sendGradesPublishedEmail({
  to, recipientName, schoolName, subjectName, categoryName, className, loginUrl,
}: { to: string[]; recipientName: string; schoolName: string; subjectName: string; categoryName: string; className: string; loginUrl: string }) {
  if (to.length === 0) return true;
  const html = baseTemplate(`
    ${heading(`Grades Updated 📊`)}
    ${para(`Hi ${recipientName}, grades have been published for <strong>${schoolName}</strong>.`)}
    ${infoBox([
      { label: "Subject", value: subjectName },
      { label: "Category", value: categoryName },
      { label: "Class", value: className },
    ])}
    ${para("Log in to view the detailed scores and report card.")}
    ${btn("View Grades", loginUrl)}
  `, schoolName);

  return sendEmail({ to, subject: `${schoolName} — Grades Published: ${subjectName}`, html });
}

// ─────────────────────────────────────────────
// 11. Welcome — New Outreach Officer
// ─────────────────────────────────────────────
export async function sendOutreachOfficerWelcomeEmail({
  to, officerName, loginUrl, password,
}: { to: string; officerName: string; loginUrl: string; password: string }) {
  const html = baseTemplate(`
    ${heading(`Welcome to Academia HQ! 🤝`)}
    ${para(`Hi ${officerName}, you've been added as an <strong>Outreach Officer</strong> on Academia HQ.`)}
    ${infoBox([
      { label: "Role", value: "Outreach Officer" },
      { label: "Email", value: to },
      { label: "Password", value: password },
    ])}
    ${para("You can now manage school referrals, track your earnings, and communicate with schools.")}
    ${btn("Log In to Outreach Portal", loginUrl)}
    ${para(`<span style="color:#999;font-size:13px;">Please change your password after your first login.</span>`)}
  `, "Academia HQ");

  return sendEmail({ to, subject: `Welcome to Academia HQ — Outreach Officer Account Created`, html });
}

// ─────────────────────────────────────────────
// 12. Implementation / Demo Request — Super Admin notification
// ─────────────────────────────────────────────
export async function sendImplementationRequestEmail({
  to,
  schoolName,
  contactName,
  phone,
  email,
  schoolType,
  studentCount,
  location,
  servicesNeeded,
  message,
  bookVisit,
}: {
  to: string | string[];
  schoolName: string;
  contactName: string;
  phone: string;
  email: string;
  schoolType: string;
  studentCount: string;
  location: string;
  servicesNeeded: string[];
  message?: string;
  bookVisit?: boolean;
}) {
  const html = baseTemplate(`
    ${heading("📋 New Implementation Request")}
    ${para(`A school has submitted an implementation / demo request on <strong>Academia HQ</strong>.`)}
    ${infoBox([
      { label: "School Name",    value: schoolName    },
      { label: "Contact Person", value: contactName   },
      { label: "Phone",          value: phone         },
      { label: "Email",          value: email         },
      { label: "School Type",    value: schoolType    },
      { label: "No. of Students",value: studentCount  },
      { label: "Location",       value: location      },
      { label: "Services Needed",value: servicesNeeded.join(", ") || "Not specified" },
      { label: "Book Visit",     value: bookVisit ? "Yes" : "No" },
    ])}
    ${message ? `<div style="background:#f8f8fc;border-radius:10px;padding:16px 20px;margin:12px 0;"><p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Message</p><p style="margin:0;font-size:14px;color:#333;line-height:1.6;">${message}</p></div>` : ""}
    ${btn("View All Requests", `${typeof window !== "undefined" ? window.location.origin : ""}/super-admin/implementation-requests`)}
    ${para(`<span style="color:#999;font-size:13px;">Log in to the Super Admin panel to manage this request.</span>`)}
  `, "Academia HQ");

  return sendEmail({
    to,
    subject: `New Implementation Request — ${schoolName}`,
    html,
  });
}

// ─────────────────────────────────────────────
// 13. Implementation / Demo Request — Confirmation to school
// ─────────────────────────────────────────────
export async function sendImplementationConfirmationEmail({
  to,
  contactName,
  schoolName,
  servicesNeeded,
}: {
  to: string;
  contactName: string;
  schoolName: string;
  servicesNeeded: string[];
}) {
  const html = baseTemplate(`
    ${heading("Thank You for Reaching Out! 🎉")}
    ${para(`Hi <strong>${contactName}</strong>, we've received your implementation request for <strong>${schoolName}</strong>.`)}
    ${para("The Academia HQ team will review your request and reach out to you shortly to discuss next steps, scheduling, and how we can best support your school.")}
    ${infoBox([
      { label: "School",          value: schoolName },
      { label: "Services",        value: servicesNeeded.join(", ") || "Not specified" },
      { label: "Expected Response", value: "Within 24 – 48 hours" },
    ])}
    ${para("While you wait, feel free to reach us directly via WhatsApp for faster assistance.")}
    ${btn("Chat on WhatsApp", "https://wa.me/2349039580317")}
    ${para(`<span style="color:#999;font-size:13px;">If you did not submit this request, please disregard this email.</span>`)}
  `, "Academia HQ");

  return sendEmail({
    to,
    subject: `We Received Your Request — Academia HQ`,
    html,
  });
}
