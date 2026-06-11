# Applying the MS2GO CRM Foundation Migration

**Migration file:** `supabase/migrations/20260523000000_init_crm_foundation.sql`
**Target Supabase project:** `izoveptctxypwmyvavyg`

This migration is **idempotent** — safe to re-run. It creates every table, enum,
helper function, RLS policy, audit trigger, and seed required to run the MS2GO
Sales Command Center.

---

## Option A — Supabase SQL Editor (fastest)

1. Open the Supabase dashboard for project `izoveptctxypwmyvavyg`.
2. Go to **SQL Editor → New query**.
3. Paste the entire contents of
   `supabase/migrations/20260523000000_init_crm_foundation.sql`.
4. Click **Run**. You should see "Success. No rows returned."
5. Open **Authentication → Providers → Email** and ensure **Magic Link** is
   enabled (the sign-in screen uses OTP).
6. Add the production site URL under **Authentication → URL Configuration →
   Site URL** and **Redirect URLs**.

## Option B — Supabase CLI

```bash
supabase link --project-ref izoveptctxypwmyvavyg
supabase db push
```

The CLI will detect `supabase/migrations/20260523000000_init_crm_foundation.sql`
and apply it.

## Option C — `psql`

```bash
psql "$SUPABASE_DB_URL" \
  -f supabase/migrations/20260523000000_init_crm_foundation.sql
```

---

## Bootstrapping super admins

The `handle_new_user()` trigger automatically promotes the two configured
super-admin emails the first time they sign in:

- `mstogollc@gmail.com` — Justin Pearce
- `admin@mstogo.com`

Both are created with role `super_admin`, 25% direct commission and 10%
override. If they already existed in `auth.users` before the migration was
applied, run this once to upgrade them:

```sql
update public.profiles
   set role = 'super_admin',
       commission_rate = 0.25,
       override_rate   = 0.10
 where email in ('mstogollc@gmail.com','admin@mstogo.com');
```

## Bootstrapping Joe Pearce

Joe is the primary sales rep — 25% direct on his own sales + 10% override on
sponsored reps. The `handle_new_user()` trigger applies these rates
automatically the first time `joe@mstogo.com` signs in. If his profile already
exists, run this once to align his rates:

```sql
update public.profiles
   set commission_rate = 0.25,
       override_rate   = 0.10
 where email = 'joe@mstogo.com';
```

New reps default to **15% direct, 0% override**.

## Sponsorship (override eligibility)

When a new rep is recruited under Joe (or any sponsor), set their `sponsor_id`:

```sql
update public.profiles
   set sponsor_id = (select id from public.profiles where email = 'joe@mstogo.com')
 where email = '<new-rep>';
```

The `sales` insert trigger automatically writes a `direct` commission row for
the rep and an `override` commission row for their sponsor at the sponsor's
`override_rate`.

---

## What the migration creates

**Tables:** `profiles, leads, prospects, qualification_submissions, analyses,
demos, appointments, proposals, sales, commissions, training_modules,
training_progress, sales_materials, email_templates, outreach_activity,
audit_log, package_pricing`.

**Enums:** `ms2go_package, lead_status, prospect_status, proposal_status,
sale_status, commission_status, appointment_status, rep_role`.

**Helper functions:** `is_super_admin(uid)`, `is_manager(uid)`,
`can_view_owner(viewer, owner)`, `set_updated_at()`, `write_audit()`,
`handle_new_user()`, `generate_commissions_for_sale()`, `audit_log_no_modify()`.

**Views:** `v_pipeline_summary`, `v_commission_summary` (rep-scoped via
underlying RLS).

**RLS rules:**
- Reps see their own records + records owned by reps they sponsor.
- Managers / super admins see everything.
- `audit_log` is append-only: no UPDATE / DELETE policy granted **and** a
  `before update/delete` trigger raises an exception even for direct
  connections.
- Commissions: reps see their own; only super admins can modify.
- Email templates and sales materials are readable by any authenticated user;
  only super admins can edit.

**Package pricing seed:**

| package | monthly |
|---------|---------|
| basic   | $300    |
| growth  | $750    |
| premium | $2,000  |

---

## Verification queries

```sql
-- All MS2GO tables exist
select tablename from pg_tables where schemaname = 'public' order by 1;

-- RLS enabled everywhere
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' order by 1;

-- Audit log immutability check (this should ERROR)
insert into public.audit_log (entity_type, action) values ('test','noop');
update public.audit_log set action = 'mutated' where action = 'noop';
-- ERROR: audit_log is append-only and cannot be modified or deleted
```

## Required Netlify env vars

Server-side (Functions only — never exposed to the browser):

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | https://izoveptctxypwmyvavyg.supabase.co |
| `SUPABASE_ANON_KEY` | for RLS-respecting reads/writes on behalf of the user |
| `SUPABASE_SERVICE_ROLE_KEY` | only for trusted server jobs; do **not** ship to client |

Browser-side (Vite — public):

| Var | Purpose |
|-----|---------|
| `VITE_SUPABASE_URL` | same URL as above |
| `VITE_SUPABASE_ANON_KEY` | same anon key |

All five are already configured in Netlify per the task brief. No secret values
are committed to the repository.

## Usage / Cost tracking migration

**Migration file:** `supabase/migrations/20260605000000_usage_tracking.sql`

Apply it the same way (SQL Editor / CLI / `psql`) after the foundation
migration. It is idempotent.

It creates:

- `usage_events` — append-only ledger of portal activity + estimated external
  API usage (DataForSEO, Google Places, OpenAI, Resend, ...). RLS: **only super
  admins and managers can SELECT; no insert/update/delete policy** — rows are
  written exclusively by Netlify Functions using the service-role key.
- `rep_usage_limits` — per-rep monthly caps scaffold (not yet enforced). Super
  admins can manage; admins/managers can read.
- Views `v_usage_by_rep`, `v_usage_by_provider` (admin-only via underlying RLS).

> **Service-role key required.** Usage logging inserts through
> `SUPABASE_SERVICE_ROLE_KEY`. If that env var is unset, logging silently
> no-ops (the rep-facing flow is never affected) and the Usage & Cost
> dashboard will simply show no events.

The admin dashboard lives at **`/sales-ops/admin/usage`** and is hidden from
non-admin reps in the sidebar; the route and its data are gated server-side as
well (a rep hitting the API gets `403`).

## Rollback

There is no automated rollback (these are foundational tables). To rebuild
from scratch in a dev project:

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
```

Then re-run the migration.
