

## 📚 CBT Web Application for Schools

A modern Computer-Based Testing platform built with React + Supabase, designed for large schools with 500+ students.

---

### 🔐 1. Authentication & Roles
- Secure login/signup with email & password via Supabase Auth
- Two roles: **Admin** and **Student** (stored in a secure `user_roles` table)
- Role-based routing — Admins see the dashboard, Students see exams
- Profile creation on signup (name, school/class info)

### 👨‍💼 2. Admin Dashboard
- **Overview page** with stats: total students, exams, subjects, recent activity
- **Subject Management**: Create, edit, delete subjects
- **Exam Management**: Create exams tied to subjects, set duration (minutes), set start/end availability dates, publish/unpublish exams
- **Question Management**: Add multiple-choice questions (4 options, mark correct answer) to each exam, with bulk question entry
- **Results Viewer**: View all student results by exam, filter/sort by score, export-ready table view

### 🎓 3. Student Portal
- **Available Exams**: Browse exams grouped by subject, see duration & status
- **Take Exam**: 
  - Full-screen exam interface with one question at a time or all at once
  - **Countdown timer** prominently displayed
  - Navigate between questions, flag questions for review
  - **Auto-submit on timeout** — exam submits automatically when time runs out
  - Confirmation before manual submission
- **Results Page**: View past exam scores, correct/incorrect breakdown, pass/fail status

### 🎨 4. Design & UX
- Modern, colorful UI with Tailwind CSS
- Vibrant accent colors (blues, greens, purples) with clean card-based layouts
- Fully responsive — works on desktop, tablet, and mobile
- Smooth animations and transitions
- Clear visual feedback (toasts, progress indicators)

### 🔒 5. Security
- Row-Level Security (RLS) on all database tables
- Students can only see their own results
- Admins have full management access
- Exam answers secured — students can't access correct answers before submission

### 📊 6. Database Structure
- **profiles** — user info (name, class)
- **user_roles** — admin/student role assignment
- **subjects** — subject names
- **exams** — linked to subjects, with duration & availability
- **questions** — multiple-choice questions linked to exams
- **exam_attempts** — student exam submissions with scores
- **student_answers** — individual answer records

---

This will be built incrementally: authentication first, then admin features, then the student exam experience.

