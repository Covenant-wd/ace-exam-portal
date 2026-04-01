

# Add School Outreach Officer Role

## Overview
Add a new **"outreach_officer"** role to the platform. These are platform-level workers who refer schools to Academia. They earn per school referred, can manage and communicate with their referred schools, and have a dedicated dashboard showing their referrals and earnings.

## What Gets Built

### 1. Database Changes

**Add `outreach_officer` to the `app_role` enum**
- Alter the existing `app_role` enum to include `outreach_officer`

**New table: `school_referrals`**
- Tracks which outreach officer referred which school
- Columns: `id`, `officer_id` (uuid), `school_id` (uuid), `commission_amount` (numeric), `commission_paid` (boolean), `created_at`
- RLS: Officers see only their own referrals; Super Admins see all

**New table: `officer_earnings`** (optional — can be derived from `school_referrals`, but a summary table simplifies queries)
- Or we calculate earnings dynamically from `school_referrals`

**Update `get_all_school_users` function** to include outreach officers (currently excludes only `super_admin`)

**Update `create_school_user` function** to support the new role (it already accepts any `app_role` text, so this should work after the enum update)

### 2. Super Admin Dashboard Updates

**Outreach Officers management page** (`/super-admin/outreach-officers`)
- Create outreach officer accounts (name, email, password)
- View list of all officers with their referral counts and total earnings
- Set commission amount per referral
- Assign/link schools to officers as referrals

**Add nav link** in `SuperAdminLayout` for "Outreach Officers"

### 3. Outreach Officer Dashboard

**New layout**: `OutreachOfficerLayout` (similar to `SuperAdminLayout` but branded for the officer role)

**Login**: Officers log in via `/super-admin/login` or a new `/outreach/login` page

**Dashboard page** (`/outreach`):
- Summary cards: Total schools referred, total earnings, pending payouts
- List of referred schools with stats (student count, status)
- Ability to view school details

**Routes and protected pages**:
- `/outreach` — Dashboard
- `/outreach/schools` — Manage referred schools
- `/outreach/earnings` — Earnings breakdown

### 4. Auth & Routing Updates

- Add `outreach_officer` to the `AppRole` type in `auth.tsx`
- Add `ProtectedRoute` entries for the outreach officer routes in `App.tsx`
- Update the `ProtectedRoute` component to redirect outreach officers to their login page

### 5. Fix Existing Build Errors

- **Settings.tsx**: Remove duplicate imports (`useState`, `useEffect` imported twice)
- **Announcements.tsx**: Cast the role array to the proper type

## Technical Details

- The `app_role` Postgres enum needs `ALTER TYPE app_role ADD VALUE 'outreach_officer'`
- The `school_referrals` table links officers to schools with commission tracking
- Earnings are computed as `SUM(commission_amount)` from `school_referrals` where `commission_paid = true`
- RLS on `school_referrals`: officer sees own rows, super_admin sees all
- The outreach officer has **no direct access** to school admin features — they only see aggregate data about their referred schools

## Implementation Order

1. Fix existing build errors (Settings.tsx, Announcements.tsx)
2. Database migration: add enum value, create `school_referrals` table with RLS
3. Create Outreach Officer layout and dashboard pages
4. Add Super Admin management UI for outreach officers
5. Update auth types and routing

