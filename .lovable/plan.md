
# Multi-Tenant School Platform - Academia

## Overview
Converted from a single-school CBT portal to a multi-tenant platform where a Super Admin manages many schools, each with their own admin, data, branding, and login URL.

## Architecture

### Roles
- **super_admin**: Platform-level. Creates schools, assigns school admins.
- **admin**: School-level. Manages their school's classes, students, instructors, exams.
- **instructor**: School-level. Manages exams/subjects per permissions.
- **student**: School-level. Takes exams, views results.

### Routing
- `/` — Platform homepage with school finder
- `/school/:slug` — School-specific login (student + staff tabs)
- `/super-admin/login` — Super admin login
- `/super-admin` — Super admin dashboard (manage schools)
- `/admin/*` — School admin dashboard (scoped by school_id)
- `/instructor/*` — Instructor dashboard
- `/student/*` — Student dashboard

### Database
- `schools` table: id, name, slug, logo_url
- `school_id` column added to: user_roles, profiles, classes, subjects, exams, sessions, terms, school_settings, instructor_classes, instructor_permissions
- `get_user_school_id()` function for RLS
- `handle_new_user()` trigger updated to accept school_id from metadata

### Edge Functions
- `manage-school-admin`: Super admin creates school admin accounts
- `manage-instructor`: Admin manages instructors (existing)
- `manage-student`: Admin manages students (existing)

## TODO
- [ ] Update all admin/instructor pages to filter queries by school_id
- [ ] Update RLS policies to scope by school_id
- [ ] Update manage-student and manage-instructor edge functions to include school_id
- [ ] Add school logo upload for super admin
- [ ] Add school admin management (list/remove admins per school)
