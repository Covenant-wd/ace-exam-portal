# Academia HQ

**A complete, multi-school management platform for Nigerian schools** — CBT examinations, student management, attendance, fee tracking, grade reports, timetable scheduling and real-time email notifications, all in one production-ready web application.

🌐 **Live:** [academiahq.pro](https://academiahq.pro)
📞 **Support:** [+2349039580317](https://wa.me/2349039580317)
📧 **Email:** support@academiahq.pro

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [User Roles](#user-roles)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Edge Functions](#edge-functions)
- [Email Notifications](#email-notifications)
- [Deployment](#deployment)
- [Database Migrations](#database-migrations)
- [Contact](#contact--support)

---

## Overview

Academia HQ is a multi-tenant SaaS platform where each school gets its own branded portal, isolated data and unique login URL (`/school/:slug`). A single Super Admin manages all schools, subscriptions and outreach officers from a central dashboard, while each school's admin manages everything within their own school independently.

The platform supports both **objective (MCQ) CBT exams** and **theory-based exams**, with anti-cheat enforcement, automatic grading, result publication and email notifications at every step.

---

## Features

### Multi-School Architecture
- Each school has a unique slug-based login URL and fully isolated data
- Super admin creates and manages all schools from one dashboard
- Per-school branding: custom name and logo
- Subscription management with `active`, `grace`, `restricted` and `suspended` states

### CBT Examinations
- Create timed objective (MCQ) and theory exams per subject and class
- Rich question editor with LaTeX/KaTeX math support
- Anti-cheat enforcement: fullscreen lock, tab-switch detection, right-click and keyboard shortcut blocking
- Configurable violation limit before auto-submit (default: 3)
- Automatic grading for objective exams; manual marking for theory
- Exam review panel for instructors to grade theory submissions

### Student & User Management
- Enroll students with class assignment, username/password login and profile details
- Manage instructors with granular permission control (subject-scoped or class-scoped)
- Manage parents and link them to their children for notifications
- Welcome emails sent automatically on account creation

### Timetable & Attendance
- Build weekly class timetables per session and term
- Mark daily attendance per class; absent notifications sent to parents instantly
- Attendance history viewable by admin and instructors

### Fee Management
- Define fee types and record payments per student
- Track outstanding balances and generate debtor lists
- Payment confirmation emails sent to students and parents
- Student fee drawer for quick per-student fee history

### Grades & Report Cards
- Record grades per subject, class and term
- Generate printable PDF report cards per student
- Grade publication triggers email notifications to students and parents

### Announcements
- Post announcements school-wide or targeted to specific classes
- Supports rich text content via built-in editor
- Announcement emails sent to all relevant users instantly

### Email Notifications (via Resend)
- All notifications are toggleable per school via the Settings panel
- Covers: announcements, exam published, exam result, fee payment, attendance absent, grades published (students), grades published (parents), welcome email
- Powered by Supabase Edge Functions and the Resend API

### Role-Based Access Control
- `super_admin` — platform-wide control
- `admin` — full school management
- `instructor` — subject or class scoped (configurable)
- `student` — exam taking, results, timetable, fees view
- `parent` — child performance, attendance, fee status
- `outreach_officer` — school acquisition tracking and earnings

### Subscription System
- Plans: Basic, Standard, Premium
- Status auto-computed from expiry date: active → grace (7 days) → restricted (14 days) → suspended
- Super admin can manually override subscription status
- Subscription history logged per school

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite (SWC) |
| Routing | React Router v6 |
| UI Components | shadcn/ui + Radix UI primitives |
| Styling | Tailwind CSS v3 |
| Animations | Framer Motion |
| Forms | React Hook Form + Zod |
| Data Fetching | TanStack Query v5 |
| Charts | Recharts |
| Math Rendering | KaTeX |
| Backend / DB | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth |
| Edge Functions | Deno (Supabase Edge Functions) |
| Email | Resend API |
| File Storage | Supabase Storage |
| Deployment | Vercel |
| Service Worker | Custom offline-first PWA shell |

---

## User Roles

| Role | Login URL | Access |
|---|---|---|
| Super Admin | `/super-admin/login` | All schools, subscriptions, outreach officers, implementation requests |
| School Admin | `/school/:slug` → admin login | Full school: students, instructors, exams, fees, grades, settings |
| Instructor | `/school/:slug` → admin login | Subject/class scoped: exams, grades, attendance, announcements |
| Student | `/school/:slug` → student login | Exams, results, timetable, fee status, announcements |
| Parent | `/school/:slug` → admin login | Child's attendance, grades, fees, announcements |
| Outreach Officer | `/outreach/login` | Schools acquired, commission earnings |

---

## Project Structure

```
ace-exam-portal/
├── public/
│   ├── favicon.ico
│   ├── robots.txt
│   ├── sitemap.xml
│   └── sw.js                        # Service worker (offline-first PWA)
├── src/
│   ├── components/
│   │   ├── ui/                      # shadcn/ui component library
│   │   ├── Calculator.tsx           # In-exam scientific calculator
│   │   ├── DashboardLayout.tsx      # Shared admin/instructor layout
│   │   ├── InstructorAssignments.tsx
│   │   ├── ReportCard.tsx           # Printable PDF report card
│   │   ├── RequestDemoSection.tsx   # Homepage implementation request form
│   │   ├── RichTextEditor.tsx       # Announcement rich text editor
│   │   ├── SubscriptionGuard.tsx    # Blocks restricted schools
│   │   └── SuperAdminLayout.tsx
│   ├── hooks/
│   │   ├── useInstructorPermissions.ts
│   │   ├── useInstructorRoles.ts
│   │   ├── useSchoolSettings.ts
│   │   └── useSubscription.ts
│   ├── lib/
│   │   ├── auth.tsx                 # Auth context and role resolution
│   │   ├── email.ts                 # All email template functions + sendEmail()
│   │   └── utils.ts
│   ├── pages/
│   │   ├── Index.tsx                # Public homepage
│   │   ├── admin/                   # School admin pages
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── Announcements.tsx
│   │   │   ├── Attendance.tsx
│   │   │   ├── Classes.tsx
│   │   │   ├── Debtors.tsx
│   │   │   ├── ExamReview.tsx
│   │   │   ├── Exams.tsx
│   │   │   ├── Fees.tsx
│   │   │   ├── Grades.tsx
│   │   │   ├── Instructors.tsx
│   │   │   ├── Parents.tsx
│   │   │   ├── Questions.tsx
│   │   │   ├── Results.tsx
│   │   │   ├── Sessions.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── Students.tsx
│   │   │   ├── Subjects.tsx
│   │   │   ├── TheoryQuestions.tsx
│   │   │   └── Timetable.tsx
│   │   ├── student/                 # Student portal
│   │   │   ├── StudentDashboard.tsx
│   │   │   ├── StudentExams.tsx
│   │   │   ├── StudentResults.tsx
│   │   │   ├── TakeExam.tsx
│   │   │   └── ViewTheoryExam.tsx
│   │   ├── super-admin/             # Platform admin
│   │   │   ├── ImplementationRequests.tsx
│   │   │   ├── OutreachOfficers.tsx
│   │   │   ├── SuperAdminDashboard.tsx
│   │   │   ├── SuperAdminSubscriptions.tsx
│   │   │   └── SuperAdminUsers.tsx
│   │   ├── instructor/
│   │   ├── parent/
│   │   └── outreach/
│   └── integrations/
│       └── supabase/
│           ├── client.ts
│           └── types.ts             # Auto-generated DB types
├── supabase/
│   ├── functions/
│   │   ├── send-email/              # Resend email dispatcher
│   │   ├── manage-student/          # Creates student auth accounts
│   │   ├── manage-instructor/       # Creates instructor auth accounts
│   │   ├── manage-parent/           # Creates parent auth accounts
│   │   └── manage-school-admin/     # Creates school admin auth accounts
│   └── migrations/                  # 29 sequential SQL migrations
├── index.html                       # SEO-optimised entry point
├── vercel.json                      # SPA rewrite rules for Vercel
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+ or [Bun](https://bun.sh)
- A [Supabase](https://supabase.com) project
- A [Resend](https://resend.com) account with a verified sending domain

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ace-exam-portal.git
cd ace-exam-portal

# 2. Install dependencies
npm install
# or
bun install

# 3. Configure environment variables
cp .env.example .env
# Then edit .env with your Supabase credentials

# 4. Start the development server
npm run dev
# or
bun dev
```

The app will be available at `http://localhost:8080`.

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

> The Supabase anon key is safe to expose in the browser. All data access is controlled by Row Level Security (RLS) policies in PostgreSQL — never by the client key.

---

## Supabase Setup

### 1. Run all migrations

In the Supabase Dashboard → **SQL Editor**, run each file from `supabase/migrations/` in chronological order. The timestamp prefix in each filename ensures correct ordering.

### 2. Set Edge Function secrets

In **Supabase Dashboard → Project Settings → Edge Functions → Secrets**, add:

| Key | Value |
|---|---|
| `RESEND_API_KEY` | Your Resend API key (starts with `re_`) |

### 3. Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Authenticate
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy all functions
supabase functions deploy send-email
supabase functions deploy manage-student
supabase functions deploy manage-instructor
supabase functions deploy manage-parent
supabase functions deploy manage-school-admin
```

### 4. Create storage bucket

In Supabase Dashboard → **Storage**, create a public bucket named `school-assets`. This stores school logo uploads.

---

## Edge Functions

All functions are written in Deno TypeScript and run on the Supabase Edge runtime.

| Function | Purpose |
|---|---|
| `send-email` | Dispatches transactional emails via the Resend API. Accepts `to`, `subject`, `html`. Returns `{ success: true }` on success. |
| `manage-student` | Creates a student auth account in `auth.users`, inserts their profile and assigns the `student` role. |
| `manage-instructor` | Creates an instructor auth account with configurable subject and class permissions. |
| `manage-parent` | Creates a parent account and links them to student children. |
| `manage-school-admin` | Creates a school admin account scoped to a specific school. |

All user-management functions use the **service role key** server-side so they can write to `auth.users` securely without exposing the key to the browser.

---

## Email Notifications

### How the flow works

1. An action occurs (e.g. admin marks a student absent)
2. The frontend checks `isNotificationEnabled(schoolId, "notify_attendance_absent")`
3. If enabled, it fetches recipient emails via Supabase RPC: `get_user_emails_by_ids`, `get_email_by_user_id`, or `get_school_students_only`
4. Calls `sendEmail({ to, subject, html })` in `src/lib/email.ts`
5. `sendEmail` invokes the `send-email` Edge Function in batches of up to 45 recipients
6. The Edge Function sends via Resend using `Academia HQ <support@academiahq.pro>`

### Notification settings

| Setting Key | Trigger Event |
|---|---|
| `notify_announcement` | Announcement posted |
| `notify_exam_published` | Exam published to students |
| `notify_exam_result` | Exam results released |
| `notify_fee_payment` | Fee payment recorded |
| `notify_attendance_absent` | Student marked absent |
| `notify_grades_published` | Grades entered — student notification |
| `notify_grades_parent` | Grades entered — parent notification |
| `notify_welcome_email` | New instructor or student account created |

All settings are toggled per school under **Admin → Settings → Email Notifications**.

---

## Deployment

The app deploys to **Vercel** as a static SPA. The `vercel.json` at the project root rewrites all routes to `index.html` so React Router handles client-side navigation:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Deploy via CLI

```bash
npm install -g vercel
vercel --prod
```

Or connect the GitHub repository in the [Vercel Dashboard](https://vercel.com/dashboard) for automatic deployments on every push to `main`.

### Production build

```bash
npm run build
# Output: dist/
```

---

## Database Migrations

There are **29 SQL migrations** in `supabase/migrations/`, covering:

- Core schema: `schools`, `profiles`, `user_roles`, `classes`, `subjects`, `sessions`
- Exam system: `exams`, `questions`, `exam_attempts`, theory submissions
- Academic: `grades`, `attendance`, `announcements`, `timetable`
- Financial: `fees`, `subscriptions`, debtor tracking
- Permissions: `instructor_permissions`, `instructor_subjects`, `class_instructors`
- Email helpers: `get_user_emails_by_ids`, `get_email_by_user_id`, `get_school_students_only` (SECURITY DEFINER RPCs)
- Subscription system: status computation and refresh functions
- Row Level Security policies for every table

To apply migrations to an existing Supabase project, run each `.sql` file in the Supabase SQL Editor in timestamp order.

---

## Contact & Support

| Channel | Details |
|---|---|
| WhatsApp | [+2349039580317](https://wa.me/2349039580317) |
| Email | support@academiahq.pro |
| Website | [academiahq.pro](https://academiahq.pro) |

---

*© 2026 Academia HQ. All rights reserved.*
