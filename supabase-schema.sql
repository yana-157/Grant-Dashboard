create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_data (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_data enable row level security;

drop policy if exists "members can read workspaces" on public.workspaces;
create policy "members can read workspaces"
on public.workspaces
for select
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "users can create own workspaces" on public.workspaces;
create policy "users can create own workspaces"
on public.workspaces
for insert
with check (created_by = auth.uid());

drop policy if exists "owners can update workspaces" on public.workspaces;
create policy "owners can update workspaces"
on public.workspaces
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists "members can read memberships" on public.workspace_members;
create policy "members can read memberships"
on public.workspace_members
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "users can add self as owner" on public.workspace_members;
create policy "users can add self as owner"
on public.workspace_members
for insert
with check (user_id = auth.uid() and role = 'owner');

drop policy if exists "owners can manage memberships" on public.workspace_members;
create policy "owners can manage memberships"
on public.workspace_members
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists "members can read workspace data" on public.workspace_data;
create policy "members can read workspace data"
on public.workspace_data
for select
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_data.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "members can insert workspace data" on public.workspace_data;
create policy "members can insert workspace data"
on public.workspace_data
for insert
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_data.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "members can update workspace data" on public.workspace_data;
create policy "members can update workspace data"
on public.workspace_data
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_data.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_data.workspace_id
      and wm.user_id = auth.uid()
  )
);
