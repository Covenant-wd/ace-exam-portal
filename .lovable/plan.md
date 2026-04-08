

# Add Theory Exam Mode (Display-Only Questions)

## Overview
Add a new exam type called **"Theory"** alongside the existing MCQ type. Theory exams display questions set by admins/instructors (with instructions, sub-questions like 1a, 1b, 1c, 1a(i), etc.) on the student's screen with a countdown timer. Students write answers on physical answer sheets — the system only displays questions, no online answer submission.

## What Changes

### 1. Database Migration
- Add `exam_type` column to `exams` table: `'mcq'` (default) or `'theory'`
- Create new `theory_questions` table:
  - `id` (uuid, PK)
  - `exam_id` (uuid, references exams)
  - `question_number` (text) — e.g. "1", "2", "3"
  - `sub_label` (text, nullable) — e.g. "a", "b", "c", "a(i)", "a(ii)"
  - `question_text` (text) — rich text content
  - `marks` (integer, default 1)
  - `question_order` (integer)
  - `created_at` (timestamptz)
- Add `instructions` column to `exams` table (text, nullable) — general exam instructions displayed to students
- RLS: same pattern as `questions` table (admin/instructor manage, students read published)

### 2. Admin: Exam Creation (Exams.tsx)
- Add **Exam Type** selector (MCQ / Theory) in the create/edit exam dialog
- Add **Instructions** textarea field (shown for both types but especially useful for theory)
- "Manage Questions" link routes to different pages based on exam type

### 3. Admin: Theory Questions Page (new: TheoryQuestions.tsx)
- Route: `/admin/exams/:examId/theory-questions`
- Form to add questions with:
  - **Question Number** (text input: "1", "2", etc.)
  - **Sub-label** (optional: "a", "b", "a(i)", etc.)
  - **Question Text** (rich text editor — supports images, math, phonics)
  - **Marks** (number input)
- Display questions grouped by number, with sub-questions indented
- Edit and delete support

### 4. Student: Exam List (StudentExams.tsx)
- Show a badge indicating exam type (MCQ / Theory)
- Both types link to their respective exam pages

### 5. Student: View Theory Exam (new: ViewTheoryExam.tsx)
- Route: `/student/theory-exam/:examId`
- Display-only page — no answer input fields
- Shows:
  - Exam title and subject at top
  - General instructions (if set)
  - Countdown timer (same as MCQ)
  - All questions displayed in order with numbering (1a, 1b, 1c, 2a, etc.)
  - Marks per question shown beside each
- Timer auto-ends the exam (shows "Time's Up" message)
- No submission logic — student simply views questions and writes on paper
- Creates an `exam_attempt` record to track that the student viewed/took the exam

### 6. Routing (App.tsx)
- Add routes:
  - `/admin/exams/:examId/theory-questions` → TheoryQuestions
  - `/instructor/exams/:examId/theory-questions` → TheoryQuestions
  - `/student/theory-exam/:examId` → ViewTheoryExam

## Technical Details

```text
New DB columns:
  exams.exam_type       text  DEFAULT 'mcq'
  exams.instructions    text  DEFAULT ''

New table: theory_questions
  id                uuid  PK  DEFAULT gen_random_uuid()
  exam_id           uuid  NOT NULL
  question_number   text  NOT NULL  (e.g. "1", "2")
  sub_label         text  DEFAULT ''  (e.g. "a", "b", "a(i)")
  question_text     text  NOT NULL
  marks             integer  DEFAULT 1
  question_order    integer  DEFAULT 0
  created_at        timestamptz  DEFAULT now()
```

**New files:**
- `src/pages/admin/TheoryQuestions.tsx` — admin question management
- `src/pages/student/ViewTheoryExam.tsx` — student display-only view

**Modified files:**
- `src/pages/admin/Exams.tsx` — exam type selector, instructions field, conditional routing
- `src/pages/student/StudentExams.tsx` — type badge, conditional link
- `src/App.tsx` — new routes

## Implementation Order
1. Database migration (add columns + new table + RLS)
2. Update exam creation UI with type selector and instructions
3. Build theory questions management page
4. Build student theory exam view page
5. Update routing and exam list

