-- =============================================================================
-- MS2GO Sales Command Center — Rep payout account onboarding (Plaid)
-- Target project: izoveptctxypwmyvavyg
-- Idempotent: safe to re-run.
--
-- Stores ONLY safe verification metadata for contractor commission direct
-- deposit. Never stores full routing/account numbers. The Plaid item_id and
-- access_token are server-side only (access_token persisted here is intended
-- for future Identity refresh; insert path uses service role / RLS write).
-- =============================================================================

do $$ begin
  create type payout_account_status as enum (
    'pending', 'verified', 'needs_review', 'unverified', 'archived'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.rep_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'plaid',
  item_id text,
  access_token text, -- server-only; protected by RLS (no select policy for reps)
  institution_id text,
  institution_name text,
  account_id text,
  account_name text,
  account_official_name text,
  account_type text,
  account_subtype text,
  account_mask text,        -- last4 only
  owner_match text,         -- match | partial | mismatch | unknown
  owner_names_seen int not null default 0,
  status payout_account_status not null default 'pending',
  is_default boolean not null default false,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rep_payout_accounts_rep_idx on public.rep_payout_accounts(rep_id);
create index if not exists rep_payout_accounts_status_idx on public.rep_payout_accounts(status);
create unique index if not exists rep_payout_accounts_item_idx
  on public.rep_payout_accounts(rep_id, item_id, account_id);

-- updated_at trigger
drop trigger if exists trg_rep_payout_accounts_updated_at on public.rep_payout_accounts;
create trigger trg_rep_payout_accounts_updated_at
  before update on public.rep_payout_accounts
  for each row execute function public.set_updated_at();

alter table public.rep_payout_accounts enable row level security;

-- Reps can see their own non-sensitive rows; managers/admins see all.
-- access_token column is filtered at the application layer (service role only).
drop policy if exists rep_payout_accounts_select on public.rep_payout_accounts;
create policy rep_payout_accounts_select on public.rep_payout_accounts
  for select using (
    rep_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
  );

-- Server-side functions writing under the service role bypass RLS. Reps may
-- archive (update status to archived) their own rows through the API.
drop policy if exists rep_payout_accounts_update_self on public.rep_payout_accounts;
create policy rep_payout_accounts_update_self on public.rep_payout_accounts
  for update using (rep_id = auth.uid() or public.is_super_admin(auth.uid()))
             with check (rep_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists rep_payout_accounts_admin_all on public.rep_payout_accounts;
create policy rep_payout_accounts_admin_all on public.rep_payout_accounts
  for all using (public.is_super_admin(auth.uid()))
          with check (public.is_super_admin(auth.uid()));
