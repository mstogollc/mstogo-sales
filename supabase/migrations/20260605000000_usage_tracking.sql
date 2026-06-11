-- =============================================================================
-- MS2GO Sales Command Center — Usage / Cost Tracking
-- Target project: izoveptctxypwmyvavyg
-- Idempotent: safe to re-run.
--
-- Tracks portal-side usage events and the *estimated* external API usage
-- categories they trigger (DataForSEO, Google Places, OpenAI, Resend, etc.).
-- This is portal activity + estimated vendor usage — it is NOT a vendor
-- billing feed. Final vendor invoices may vary.
-- =============================================================================

-- =============================================================================
-- USAGE EVENTS (append-only activity / estimated-cost ledger)
-- =============================================================================
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references public.profiles(id) on delete set null,
  rep_email text,
  rep_name text,
  action_type text not null,
  provider text not null,
  units numeric(12,2) not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_rep_idx on public.usage_events(rep_id);
create index if not exists usage_events_action_idx on public.usage_events(action_type);
create index if not exists usage_events_provider_idx on public.usage_events(provider);
create index if not exists usage_events_created_idx on public.usage_events(created_at desc);

-- =============================================================================
-- PER-REP MONTHLY LIMITS (limits-ready scaffold — not yet enforced)
-- =============================================================================
-- Admins can set soft monthly caps per rep + action_type. Nothing in the app
-- enforces these yet; the table exists so a future change can read a cap and
-- decide whether to warn or block. Leaving monthly_limit null = unlimited.
create table if not exists public.rep_usage_limits (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  monthly_limit integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, action_type)
);
create index if not exists rep_usage_limits_rep_idx on public.rep_usage_limits(rep_id);

drop trigger if exists trg_rep_usage_limits_updated_at on public.rep_usage_limits;
create trigger trg_rep_usage_limits_updated_at
  before update on public.rep_usage_limits
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Reps must NOT see usage data. Only super admins + managers can read it.
-- Inserts are performed by Netlify Functions using the service-role key, which
-- bypasses RLS — so we deliberately do NOT grant an insert policy to ordinary
-- authenticated users. This keeps reps from forging or reading usage rows.
alter table public.usage_events     enable row level security;
alter table public.rep_usage_limits enable row level security;

drop policy if exists usage_events_select on public.usage_events;
create policy usage_events_select on public.usage_events
  for select using (
    public.is_super_admin(auth.uid()) or public.is_manager(auth.uid())
  );

-- No insert/update/delete policy for usage_events => only the service role
-- (used by server functions) can write. This is intentional.

drop policy if exists rep_usage_limits_select on public.rep_usage_limits;
create policy rep_usage_limits_select on public.rep_usage_limits
  for select using (
    public.is_super_admin(auth.uid()) or public.is_manager(auth.uid())
  );

drop policy if exists rep_usage_limits_admin on public.rep_usage_limits;
create policy rep_usage_limits_admin on public.rep_usage_limits
  for all using (public.is_super_admin(auth.uid()))
          with check (public.is_super_admin(auth.uid()));

-- =============================================================================
-- DASHBOARD VIEWS (admin-only via underlying table RLS)
-- =============================================================================
create or replace view public.v_usage_by_rep as
select
  rep_id,
  max(rep_email) as rep_email,
  max(rep_name)  as rep_name,
  count(*)       as event_count,
  sum(units)     as total_units,
  max(created_at) as last_event_at
from public.usage_events
group by rep_id;

create or replace view public.v_usage_by_provider as
select
  provider,
  count(*)   as event_count,
  sum(units) as total_units
from public.usage_events
group by provider;
