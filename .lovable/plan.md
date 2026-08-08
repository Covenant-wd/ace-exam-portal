# Compare live database against GitHub migrations

You asked to restore the database from the migrations stored in GitHub, but also said to "compare first." That's the right call — doing a destructive rebuild blindly could break things that are working. Here's the two-phase approach.

## Phase 1 — Audit (read-only, no changes)

I'll inspect the live database and diff it against everything in `supabase/migrations/` (the same files that live in your GitHub repo, since GitHub is two-way synced with this project). Specifically I'll compare:

- **Tables** — names and columns
- **Row Level Security policies** — names and definitions per table
- **Database functions** — the `public.*` functions like `has_role`, `create_school_user`, `handle_new_user`, etc.
- **Triggers** — currently the live DB reports none; migrations expect at least `on_auth_user_created` on `auth.users` and `updated_at` triggers — likely drift
- **Enums** — `app_role` values
- **Storage buckets** — `question-images`, `school-logo`
- **GRANT statements** — common source of "permission denied" errors

I'll write the findings to `/mnt/documents/db-audit.md` and summarise in chat: what's missing, what's extra, what differs.

What I already see at a glance:
- 27 public tables in the live DB, which lines up with the migration set.
- One extra object: `student_list_view` (a view) — present live, may or may not be in migrations.
- Live DB reports **zero triggers**, but migrations create several. This is suspicious and likely the real source of any bug you're chasing.

## Phase 2 — Decide based on the audit

After you read the audit, you pick one of:

1. **Targeted fix** — I write a single new migration that adds only the missing pieces (e.g. recreate the triggers). Keeps all data. Lowest risk. This is almost certainly what you'll actually want.
2. **Full wipe and rebuild** — Drop the `public` schema, then re-run every file in `supabase/migrations/` in order. You confirmed data can be wiped, but this also wipes every school, student, exam, grade, fee record, and every auth user's role mapping. Auth users themselves live in `auth.users` and would survive, but they'd lose all role/school links and be effectively locked out until re-provisioned.

I will **not** execute Phase 2 without you explicitly approving it after seeing the audit.

## Technical notes

- Migration files in `supabase/migrations/` are the source of truth for the GitHub-tracked schema (the repo is two-way synced).
- The audit runs via `psql` (read-only, already authenticated in this sandbox) plus parsing the migration `.sql` files. No writes.
- A "full rebuild" cannot be done with the standard migration tool's incremental model — it requires a single migration that does `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` followed by concatenated migration contents, replayed in order. I'd prepare that for your review before running.

## Deliverable from this plan

`/mnt/documents/db-audit.md` plus a chat summary of drift, ending with a recommendation (targeted fix vs full rebuild) for you to approve.
