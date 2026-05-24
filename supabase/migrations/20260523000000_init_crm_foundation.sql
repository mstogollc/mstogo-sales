-- =============================================================================
-- MS2GO Sales Command Center — CRM Foundation
-- Target project: izoveptctxypwmyvavyg
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- =============================================================================
-- ENUMS
-- =============================================================================
do $$ begin
  create type ms2go_package as enum ('basic', 'growth', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status as enum (
    'new', 'contacted', 'qualified', 'analyzed', 'demoed',
    'proposal_sent', 'won', 'lost', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospect_status as enum (
    'new', 'engaged', 'qualified', 'opportunity', 'closed_won', 'closed_lost'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_status as enum ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sale_status as enum ('pending', 'active', 'churned', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type commission_status as enum ('pending', 'approved', 'paid', 'reversed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum ('scheduled', 'completed', 'no_show', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rep_role as enum ('rep', 'senior_rep', 'manager', 'super_admin');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- PROFILES / REPS
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  role rep_role not null default 'rep',
  is_active boolean not null default true,
  sponsor_id uuid references public.profiles(id) on delete set null,
  commission_rate numeric(5,4) not null default 0.15,
  override_rate numeric(5,4) not null default 0.00,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_sponsor_idx on public.profiles(sponsor_id);
create index if not exists profiles_role_idx on public.profiles(role);

-- =============================================================================
-- LEADS
-- =============================================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  address text,
  city text,
  state text,
  zip text,
  industry text,
  source text,
  status lead_status not null default 'new',
  score int,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_owner_idx on public.leads(owner_id);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_created_idx on public.leads(created_at desc);

-- =============================================================================
-- PROSPECTS
-- =============================================================================
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  status prospect_status not null default 'new',
  recommended_package ms2go_package,
  last_activity_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospects_owner_idx on public.prospects(owner_id);
create index if not exists prospects_status_idx on public.prospects(status);

-- =============================================================================
-- QUALIFICATION SUBMISSIONS
-- =============================================================================
create table if not exists public.qualification_submissions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  qualified boolean,
  score int,
  recommended_package ms2go_package,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists qual_lead_idx on public.qualification_submissions(lead_id);
create index if not exists qual_prospect_idx on public.qualification_submissions(prospect_id);

-- =============================================================================
-- ANALYSES (output of analyze-lead)
-- =============================================================================
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  source text,
  summary text,
  strengths jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analyses_lead_idx on public.analyses(lead_id);

-- =============================================================================
-- DEMOS
-- =============================================================================
create table if not exists public.demos (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  outcome text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists demos_prospect_idx on public.demos(prospect_id);

-- =============================================================================
-- APPOINTMENTS
-- =============================================================================
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  status appointment_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_owner_idx on public.appointments(owner_id);
create index if not exists appointments_starts_idx on public.appointments(starts_at);

-- =============================================================================
-- PROPOSALS
-- =============================================================================
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  package ms2go_package not null,
  monthly_price numeric(10,2) not null,
  setup_fee numeric(10,2) not null default 0,
  status proposal_status not null default 'draft',
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  document_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proposals_owner_idx on public.proposals(owner_id);
create index if not exists proposals_status_idx on public.proposals(status);

-- =============================================================================
-- SALES
-- =============================================================================
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  package ms2go_package not null,
  monthly_amount numeric(10,2) not null,
  setup_amount numeric(10,2) not null default 0,
  status sale_status not null default 'pending',
  closed_at timestamptz not null default now(),
  started_at timestamptz,
  churned_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_owner_idx on public.sales(owner_id);
create index if not exists sales_status_idx on public.sales(status);

-- =============================================================================
-- COMMISSIONS
-- =============================================================================
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('direct','override')),
  rate numeric(5,4) not null,
  base_amount numeric(10,2) not null,
  amount numeric(10,2) not null,
  status commission_status not null default 'pending',
  period_month date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commissions_rep_idx on public.commissions(rep_id);
create index if not exists commissions_sale_idx on public.commissions(sale_id);
create index if not exists commissions_status_idx on public.commissions(status);

-- =============================================================================
-- TRAINING
-- =============================================================================
create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  order_index int not null default 0,
  is_required boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.training_progress (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  progress numeric(5,2) not null default 0,
  completed_at timestamptz,
  certificate_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, module_id)
);
create index if not exists training_progress_rep_idx on public.training_progress(rep_id);

-- =============================================================================
-- SALES MATERIALS / TEMPLATES
-- =============================================================================
create table if not exists public.sales_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('one_pager','deck','case_study','video','script','other')),
  url text,
  body text,
  package ms2go_package,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  subject text not null,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- OUTREACH ACTIVITY
-- =============================================================================
create table if not exists public.outreach_activity (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('email','sms','call','meeting','note')),
  direction text not null check (direction in ('outbound','inbound')),
  subject text,
  body text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists outreach_prospect_idx on public.outreach_activity(prospect_id);
create index if not exists outreach_owner_idx on public.outreach_activity(owner_id);

-- =============================================================================
-- AUDIT LOG (append-only, immutable)
-- =============================================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  context jsonb not null default '{}'::jsonb
);
create index if not exists audit_entity_idx on public.audit_log(entity_type, entity_id);
create index if not exists audit_occurred_idx on public.audit_log(occurred_at desc);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================
create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = uid),
    false
  )
  or coalesce(
    (select email in ('mstogollc@gmail.com','admin@mstogo.com') from public.profiles where id = uid),
    false
  );
$$;

create or replace function public.is_manager(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('manager','super_admin') from public.profiles where id = uid),
    false
  );
$$;

create or replace function public.can_view_owner(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    viewer = owner
    or public.is_super_admin(viewer)
    or public.is_manager(viewer)
    or exists (
      select 1 from public.profiles p
      where p.id = owner and p.sponsor_id = viewer
    );
$$;

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'profiles','leads','prospects','demos','appointments',
      'proposals','sales','commissions','training_progress',
      'sales_materials','email_templates'
    ])
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- =============================================================================
-- AUDIT TRIGGER
-- =============================================================================
create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_status_changed boolean := false;
  v_action text := lower(tg_op);
begin
  begin
    select email into v_email from public.profiles where id = v_actor;
  exception when others then v_email := null;
  end;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) ? 'status') and (to_jsonb(new)->>'status') is distinct from (to_jsonb(old)->>'status') then
      v_status_changed := true;
    end if;
    if not v_status_changed then
      return new;
    end if;
    v_action := 'status_change';
  end if;

  insert into public.audit_log (actor_id, actor_email, entity_type, entity_id, action, before, after)
  values (
    v_actor,
    v_email,
    tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(new)->>'id')::uuid end,
    v_action,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  for t in
    select unnest(array['leads','prospects','proposals','sales','commissions'])
  loop
    execute format('drop trigger if exists trg_%I_audit_iud on public.%I', t, t);
    execute format(
      'create trigger trg_%I_audit_iud
       after insert or update or delete on public.%I
       for each row execute function public.write_audit()', t, t);
  end loop;
end $$;

-- =============================================================================
-- PROFILE BOOTSTRAP
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role rep_role := 'rep';
  v_rate numeric(5,4) := 0.15;
  v_override numeric(5,4) := 0.00;
begin
  if new.email in ('mstogollc@gmail.com','admin@mstogo.com') then
    v_role := 'super_admin';
    v_rate := 0.25;
    v_override := 0.10;
  elsif new.email = 'joe@mstogo.com' then
    v_rate := 0.25;
    v_override := 0.10;
  end if;

  insert into public.profiles (id, email, full_name, role, commission_rate, override_rate)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    v_role,
    v_rate,
    v_override
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- COMMISSION GENERATION ON SALE
-- =============================================================================
create or replace function public.generate_commissions_for_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.profiles;
  v_sponsor public.profiles;
begin
  select * into v_rep from public.profiles where id = new.owner_id;
  if v_rep.id is null then
    return new;
  end if;

  insert into public.commissions (sale_id, rep_id, kind, rate, base_amount, amount, status, period_month)
  values (
    new.id, v_rep.id, 'direct', v_rep.commission_rate,
    new.monthly_amount,
    round(new.monthly_amount * v_rep.commission_rate, 2),
    'pending',
    date_trunc('month', coalesce(new.closed_at, now()))::date
  );

  if v_rep.sponsor_id is not null then
    select * into v_sponsor from public.profiles where id = v_rep.sponsor_id;
    if v_sponsor.id is not null and v_sponsor.override_rate > 0 then
      insert into public.commissions (sale_id, rep_id, kind, rate, base_amount, amount, status, period_month)
      values (
        new.id, v_sponsor.id, 'override', v_sponsor.override_rate,
        new.monthly_amount,
        round(new.monthly_amount * v_sponsor.override_rate, 2),
        'pending',
        date_trunc('month', coalesce(new.closed_at, now()))::date
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sales_generate_commissions on public.sales;
create trigger trg_sales_generate_commissions
  after insert on public.sales
  for each row execute function public.generate_commissions_for_sale();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles                  enable row level security;
alter table public.leads                     enable row level security;
alter table public.prospects                 enable row level security;
alter table public.qualification_submissions enable row level security;
alter table public.analyses                  enable row level security;
alter table public.demos                     enable row level security;
alter table public.appointments              enable row level security;
alter table public.proposals                 enable row level security;
alter table public.sales                     enable row level security;
alter table public.commissions               enable row level security;
alter table public.training_modules          enable row level security;
alter table public.training_progress         enable row level security;
alter table public.sales_materials           enable row level security;
alter table public.email_templates           enable row level security;
alter table public.outreach_activity         enable row level security;
alter table public.audit_log                 enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
    or sponsor_id = auth.uid()
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid() or public.is_super_admin(auth.uid()))
             with check (id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert with check (public.is_super_admin(auth.uid()) or id = auth.uid());

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'leads','prospects','demos','appointments','proposals','sales','outreach_activity'
    ])
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format($f$
      create policy %I_select on public.%I
        for select using (public.can_view_owner(auth.uid(), owner_id))
    $f$, t, t);

    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format($f$
      create policy %I_insert on public.%I
        for insert with check (
          owner_id = auth.uid()
          or public.is_super_admin(auth.uid())
          or public.is_manager(auth.uid())
        )
    $f$, t, t);

    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format($f$
      create policy %I_update on public.%I
        for update using (public.can_view_owner(auth.uid(), owner_id))
                   with check (public.can_view_owner(auth.uid(), owner_id))
    $f$, t, t);

    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format($f$
      create policy %I_delete on public.%I
        for delete using (public.is_super_admin(auth.uid()))
    $f$, t, t);
  end loop;
end $$;

drop policy if exists qualification_submissions_select on public.qualification_submissions;
create policy qualification_submissions_select on public.qualification_submissions
  for select using (
    submitted_by = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
    or exists (
      select 1 from public.prospects p
       where p.id = qualification_submissions.prospect_id
         and public.can_view_owner(auth.uid(), p.owner_id)
    )
    or exists (
      select 1 from public.leads l
       where l.id = qualification_submissions.lead_id
         and public.can_view_owner(auth.uid(), l.owner_id)
    )
  );

drop policy if exists qualification_submissions_insert on public.qualification_submissions;
create policy qualification_submissions_insert on public.qualification_submissions
  for insert with check (
    submitted_by = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
  );

drop policy if exists analyses_select on public.analyses;
create policy analyses_select on public.analyses
  for select using (
    created_by = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
    or exists (
      select 1 from public.leads l
       where l.id = analyses.lead_id and public.can_view_owner(auth.uid(), l.owner_id)
    )
  );

drop policy if exists analyses_insert on public.analyses;
create policy analyses_insert on public.analyses
  for insert with check (
    created_by = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
  );

drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions
  for select using (
    rep_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
  );

drop policy if exists commissions_modify on public.commissions;
create policy commissions_modify on public.commissions
  for all using (public.is_super_admin(auth.uid()))
          with check (public.is_super_admin(auth.uid()));

drop policy if exists training_modules_select on public.training_modules;
create policy training_modules_select on public.training_modules
  for select using (auth.uid() is not null);
drop policy if exists training_modules_admin on public.training_modules;
create policy training_modules_admin on public.training_modules
  for all using (public.is_super_admin(auth.uid()))
          with check (public.is_super_admin(auth.uid()));

drop policy if exists training_progress_select on public.training_progress;
create policy training_progress_select on public.training_progress
  for select using (
    rep_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
  );

drop policy if exists training_progress_upsert on public.training_progress;
create policy training_progress_upsert on public.training_progress
  for insert with check (rep_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists training_progress_update on public.training_progress;
create policy training_progress_update on public.training_progress
  for update using (rep_id = auth.uid() or public.is_super_admin(auth.uid()))
             with check (rep_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists sales_materials_select on public.sales_materials;
create policy sales_materials_select on public.sales_materials
  for select using (auth.uid() is not null and is_active);
drop policy if exists sales_materials_admin on public.sales_materials;
create policy sales_materials_admin on public.sales_materials
  for all using (public.is_super_admin(auth.uid()))
          with check (public.is_super_admin(auth.uid()));

drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates
  for select using (auth.uid() is not null and is_active);
drop policy if exists email_templates_admin on public.email_templates;
create policy email_templates_admin on public.email_templates
  for all using (public.is_super_admin(auth.uid()))
          with check (public.is_super_admin(auth.uid()));

-- =============================================================================
-- AUDIT LOG IMMUTABILITY
-- =============================================================================
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (
    public.is_super_admin(auth.uid()) or public.is_manager(auth.uid())
  );

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (true);

-- No UPDATE/DELETE policy => denied under RLS.

create or replace function public.audit_log_no_modify()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only and cannot be modified or deleted';
  return null;
end;
$$;

drop trigger if exists trg_audit_log_no_update on public.audit_log;
create trigger trg_audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_no_modify();

drop trigger if exists trg_audit_log_no_delete on public.audit_log;
create trigger trg_audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_no_modify();

-- =============================================================================
-- DASHBOARD VIEWS
-- =============================================================================
create or replace view public.v_pipeline_summary as
select
  p.owner_id,
  count(*) filter (where p.status = 'new')        as new_count,
  count(*) filter (where p.status = 'engaged')    as engaged_count,
  count(*) filter (where p.status = 'qualified')  as qualified_count,
  count(*) filter (where p.status = 'opportunity') as opportunity_count,
  count(*) filter (where p.status = 'closed_won') as won_count,
  count(*) filter (where p.status = 'closed_lost') as lost_count
from public.prospects p
group by p.owner_id;

create or replace view public.v_commission_summary as
select
  rep_id,
  date_trunc('month', period_month)::date as month,
  sum(amount) filter (where status in ('approved','paid')) as earned,
  sum(amount) filter (where status = 'pending') as pending,
  sum(amount) filter (where status = 'paid') as paid
from public.commissions
group by rep_id, date_trunc('month', period_month);

-- =============================================================================
-- PACKAGE PRICING
-- =============================================================================
create table if not exists public.package_pricing (
  package ms2go_package primary key,
  monthly_price numeric(10,2) not null,
  display_name text not null,
  description text
);

insert into public.package_pricing (package, monthly_price, display_name, description) values
  ('basic',   300.00,  'Basic',   'Foundational MS2GO presence + lead capture'),
  ('growth',  750.00,  'Growth',  'Growth package with automation + outreach'),
  ('premium', 2000.00, 'Premium', 'Full-stack MS2GO suite with concierge support')
on conflict (package) do update set
  monthly_price = excluded.monthly_price,
  display_name  = excluded.display_name,
  description   = excluded.description;

alter table public.package_pricing enable row level security;
drop policy if exists package_pricing_select on public.package_pricing;
create policy package_pricing_select on public.package_pricing
  for select using (true);
drop policy if exists package_pricing_admin on public.package_pricing;
create policy package_pricing_admin on public.package_pricing
  for all using (public.is_super_admin(auth.uid()))
          with check (public.is_super_admin(auth.uid()));
