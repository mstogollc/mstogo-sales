-- =============================================================================
-- MS2GO Sales Command Center — Website Build Requests
-- Target project: izoveptctxypwmyvavyg
-- Idempotent: safe to re-run.
--
-- A rep submits a request to have MS2GO build a demo / first website for a
-- prospect. The row is the durable record of that request and carries a simple,
-- sales-facing status the rep can track: requested -> in_progress -> ready,
-- with needs_info as the "we need more from you" state.
-- =============================================================================

do $$ begin
  create type website_build_status as enum (
    'requested', 'in_progress', 'ready', 'needs_info', 'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.website_build_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  business_name text not null,
  current_website text,
  no_website boolean not null default false,
  contact_name text,
  contact_email text,
  city text,
  state text,
  industry text,
  goals text,
  status website_build_status not null default 'requested',
  preview_url text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wbr_owner_idx on public.website_build_requests(owner_id);
create index if not exists wbr_status_idx on public.website_build_requests(status);
create index if not exists wbr_prospect_idx on public.website_build_requests(prospect_id);
create index if not exists wbr_created_idx on public.website_build_requests(created_at desc);

drop trigger if exists trg_website_build_requests_updated_at on public.website_build_requests;
create trigger trg_website_build_requests_updated_at
  before update on public.website_build_requests
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- A rep can see and create their own requests; managers / super admins and a
-- rep's sponsor can see them too. Status changes (fulfilling the build) are
-- performed by the team via the service-role client, mirroring how usage
-- events are written, so reps never forge a "ready" status themselves.
-- =============================================================================
alter table public.website_build_requests enable row level security;

drop policy if exists website_build_requests_select on public.website_build_requests;
create policy website_build_requests_select on public.website_build_requests
  for select using (public.can_view_owner(auth.uid(), owner_id));

drop policy if exists website_build_requests_insert on public.website_build_requests;
create policy website_build_requests_insert on public.website_build_requests
  for insert with check (
    owner_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or public.is_manager(auth.uid())
  );

drop policy if exists website_build_requests_update on public.website_build_requests;
create policy website_build_requests_update on public.website_build_requests
  for update using (public.is_super_admin(auth.uid()) or public.is_manager(auth.uid()))
             with check (public.is_super_admin(auth.uid()) or public.is_manager(auth.uid()));

drop policy if exists website_build_requests_delete on public.website_build_requests;
create policy website_build_requests_delete on public.website_build_requests
  for delete using (public.is_super_admin(auth.uid()));
