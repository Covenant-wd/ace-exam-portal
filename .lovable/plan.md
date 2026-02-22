
# School Name Branding - Admin Configurable

## Overview
Add a settings system where the admin can set the school name, which will then appear throughout the app (sidebar header, page titles, browser tab, login page) instead of the generic "CBT Portal".

## What will change

### 1. New database table: `school_settings`
A simple key-value settings table to store the school name (and potentially other settings later).

| Column | Type | Details |
|--------|------|---------|
| id | uuid | Primary key |
| key | text | Unique setting key (e.g. `school_name`) |
| value | text | The setting value |
| updated_at | timestamp | Auto-updated |

RLS: Admins can read/write, all authenticated users can read.

### 2. New admin page: Settings
- Accessible from the sidebar under a new "Settings" link
- Simple form with a text input for the school name
- Save button that updates the `school_settings` table
- Could later be extended with logo upload, school motto, etc.

### 3. Custom hook: `useSchoolSettings`
- Fetches `school_name` from the `school_settings` table
- Provides a default fallback ("CBT Portal") if not yet configured
- Used across the app for consistent branding

### 4. Updated branding across the app
Places where the school name will appear:
- **Sidebar header** (`DashboardLayout.tsx`) -- replaces "CBT Portal"
- **Login page** (`Auth.tsx`) -- replaces "CBT Portal" in the card header
- **Browser tab title** (`index.html`) -- updated dynamically
- **Student panel** -- same sidebar branding

## Technical Details

**New files:**
- `src/hooks/useSchoolSettings.ts` -- hook to fetch and cache school settings
- `src/pages/admin/Settings.tsx` -- admin settings page

**Modified files:**
- `src/components/DashboardLayout.tsx` -- use school name from hook, add Settings nav link
- `src/pages/Auth.tsx` -- use school name from hook
- `src/App.tsx` -- add Settings route
- `index.html` -- default title updated

**Database migration:**
- Create `school_settings` table with RLS policies
- Seed a default row with key `school_name` and value `CBT Portal`
