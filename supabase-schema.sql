create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.workspaces add column if not exists mission text not null default '';
alter table public.workspaces add column if not exists service_area text not null default '';
alter table public.workspaces add column if not exists profile_notes text not null default '';

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_members add column if not exists email text not null default '';
alter table public.workspace_members add column if not exists display_name text not null default '';

create table if not exists public.workspace_data (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, label)
);

create table if not exists public.grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  funder text not null default '',
  grant_name text not null default '',
  category text not null default 'General',
  amount text not null default '',
  deadline text not null default '',
  deadline_label text not null default '',
  deadline_status text not null default 'Open',
  geography text not null default '',
  folder_id uuid references public.folders(id) on delete set null,
  priority text not null default 'Medium',
  fit_score integer not null default 50,
  status text not null default 'Prospect',
  source_url text not null default '',
  source_label text not null default '',
  eligibility text not null default '',
  fit_reason text not null default '',
  next_action text not null default '',
  notes text not null default '',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists grants_workspace_id_idx on public.grants(workspace_id);

create table if not exists public.grant_applications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  name text not null default 'Grant application',
  cycle text not null default '',
  status text not null default 'Drafting',
  owner text not null default '',
  portal_url text not null default '',
  deadline text not null default '',
  submitted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists grant_applications_workspace_id_idx on public.grant_applications(workspace_id);
create index if not exists grant_applications_grant_id_idx on public.grant_applications(grant_id);

create table if not exists public.application_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_id uuid not null references public.grant_applications(id) on delete cascade,
  position integer not null default 0,
  exact_question text not null default '',
  category text not null default 'Other',
  word_limit integer not null default 0,
  response text not null default '',
  response_status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists application_questions_workspace_id_idx on public.application_questions(workspace_id);
create index if not exists application_questions_application_id_idx on public.application_questions(application_id);

create table if not exists public.answer_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  grant_id uuid references public.grants(id) on delete set null,
  application_id uuid references public.grant_applications(id) on delete set null,
  question_id uuid references public.application_questions(id) on delete set null,
  question_type text not null default 'Other',
  exact_question text not null default '',
  word_limit integer not null default 0,
  final_answer text not null,
  source_status text not null default 'Final',
  legacy_funder text not null default '',
  legacy_grant_name text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists answer_history_workspace_id_idx on public.answer_history(workspace_id);
create index if not exists answer_history_question_type_idx on public.answer_history(workspace_id, question_type);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default '',
  category text not null default 'General',
  status text not null default 'Needed',
  owner text not null default '',
  notes text not null default '',
  related_grant_id uuid references public.grants(id) on delete set null,
  related_application_id uuid references public.grant_applications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists documents_workspace_id_idx on public.documents(workspace_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default '',
  related_grant_id uuid references public.grants(id) on delete set null,
  related_application_id uuid references public.grant_applications(id) on delete set null,
  due_date date,
  status text not null default 'Open',
  owner text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists tasks_workspace_id_idx on public.tasks(workspace_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  role text not null default 'member' check (role in ('admin', 'member')),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_id_idx on public.workspace_invites(workspace_id);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

create or replace function public.accept_workspace_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.workspace_invites%rowtype;
  current_user_id uuid := auth.uid();
  current_email text := coalesce(auth.jwt() ->> 'email', '');
  current_name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'display_name', current_email);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into invite_row
  from public.workspace_invites
  where token = invite_token
    and revoked_at is null
    and expires_at > now();

  if invite_row.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, email, display_name)
  values (invite_row.workspace_id, current_user_id, invite_row.role, current_email, current_name)
  on conflict (workspace_id, user_id)
  do update set email = excluded.email, display_name = excluded.display_name;

  return invite_row.workspace_id;
end;
$$;

revoke all on function public.accept_workspace_invite(uuid) from public;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;

create or replace function public.set_record_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists grants_set_audit_fields on public.grants;
create trigger grants_set_audit_fields before update on public.grants
for each row execute function public.set_record_audit_fields();

drop trigger if exists grant_applications_set_audit_fields on public.grant_applications;
create trigger grant_applications_set_audit_fields before update on public.grant_applications
for each row execute function public.set_record_audit_fields();

drop trigger if exists application_questions_set_audit_fields on public.application_questions;
create trigger application_questions_set_audit_fields before update on public.application_questions
for each row execute function public.set_record_audit_fields();

drop trigger if exists documents_set_audit_fields on public.documents;
create trigger documents_set_audit_fields before update on public.documents
for each row execute function public.set_record_audit_fields();

drop trigger if exists tasks_set_audit_fields on public.tasks;
create trigger tasks_set_audit_fields before update on public.tasks
for each row execute function public.set_record_audit_fields();

-- One-time, idempotent migration from the original workspace JSON record.
create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.safe_timestamp(value text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

update public.workspaces w
set
  name = coalesce(nullif(wd.data -> 'workspace' ->> 'name', ''), w.name),
  mission = coalesce(wd.data -> 'workspace' ->> 'mission', w.mission),
  service_area = coalesce(wd.data -> 'workspace' ->> 'serviceArea', w.service_area),
  profile_notes = coalesce(wd.data -> 'workspace' ->> 'profileNotes', w.profile_notes)
from public.workspace_data wd
where wd.workspace_id = w.id;

insert into public.folders (id, workspace_id, label)
select
  coalesce(public.safe_uuid(folder ->> 'id'), gen_random_uuid()),
  wd.workspace_id,
  folder ->> 'label'
from public.workspace_data wd
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(wd.data -> 'folders') = 'array' then wd.data -> 'folders' else '[]'::jsonb end
) folder
where nullif(folder ->> 'label', '') is not null
on conflict (id) do update set label = excluded.label;

insert into public.grants (
  id, workspace_id, funder, grant_name, category, amount, deadline, deadline_label, deadline_status,
  geography, folder_id, priority, fit_score, status, source_url, source_label, eligibility, fit_reason,
  next_action, notes, tags, updated_at
)
select
  coalesce(public.safe_uuid(grant_item ->> 'id'), gen_random_uuid()),
  wd.workspace_id,
  coalesce(grant_item ->> 'funder', ''),
  coalesce(grant_item ->> 'grantName', ''),
  coalesce(grant_item ->> 'category', 'General'),
  coalesce(grant_item ->> 'amount', ''),
  coalesce(grant_item ->> 'deadline', ''),
  coalesce(grant_item ->> 'deadlineLabel', ''),
  coalesce(grant_item ->> 'deadlineStatus', 'Open'),
  coalesce(grant_item ->> 'geography', ''),
  case
    when exists (
      select 1 from public.folders f
      where f.id = public.safe_uuid(grant_item ->> 'folderId') and f.workspace_id = wd.workspace_id
    ) then public.safe_uuid(grant_item ->> 'folderId')
    else null
  end,
  coalesce(grant_item ->> 'priority', 'Medium'),
  coalesce((grant_item ->> 'fitScore')::integer, 50),
  coalesce(grant_item ->> 'status', 'Prospect'),
  coalesce(grant_item ->> 'sourceUrl', ''),
  coalesce(grant_item ->> 'sourceLabel', ''),
  coalesce(grant_item ->> 'eligibility', ''),
  coalesce(grant_item ->> 'fitReason', ''),
  coalesce(grant_item ->> 'nextAction', ''),
  coalesce(grant_item ->> 'notes', ''),
  case when jsonb_typeof(grant_item -> 'tags') = 'array' then grant_item -> 'tags' else '[]'::jsonb end,
  coalesce(public.safe_timestamp(grant_item ->> 'updatedAt'), now())
from public.workspace_data wd
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(wd.data -> 'grants') = 'array' then wd.data -> 'grants' else '[]'::jsonb end
) grant_item
on conflict (id) do nothing;

insert into public.answer_history (
  id, workspace_id, question_type, exact_question, word_limit, final_answer, source_status,
  legacy_funder, legacy_grant_name, created_at
)
select
  coalesce(public.safe_uuid(answer_item ->> 'id'), gen_random_uuid()),
  wd.workspace_id,
  coalesce(answer_item ->> 'questionType', 'Other'),
  coalesce(answer_item ->> 'exactQuestion', ''),
  case when coalesce(answer_item ->> 'wordLimit', '') ~ '^\d+$' then (answer_item ->> 'wordLimit')::integer else 0 end,
  coalesce(answer_item ->> 'finalAnswer', ''),
  'Legacy',
  coalesce(answer_item ->> 'funder', ''),
  coalesce(answer_item ->> 'grantName', ''),
  now()
from public.workspace_data wd
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(wd.data -> 'answers') = 'array' then wd.data -> 'answers' else '[]'::jsonb end
) answer_item
where nullif(answer_item ->> 'finalAnswer', '') is not null
on conflict (id) do nothing;

insert into public.documents (id, workspace_id, name, category, status, owner, notes)
select
  coalesce(public.safe_uuid(document_item ->> 'id'), gen_random_uuid()),
  wd.workspace_id,
  coalesce(document_item ->> 'name', ''),
  coalesce(document_item ->> 'category', 'General'),
  coalesce(document_item ->> 'status', 'Needed'),
  coalesce(document_item ->> 'owner', ''),
  coalesce(document_item ->> 'notes', '')
from public.workspace_data wd
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(wd.data -> 'documents') = 'array' then wd.data -> 'documents' else '[]'::jsonb end
) document_item
on conflict (id) do nothing;

insert into public.tasks (id, workspace_id, title, due_date, status, owner)
select
  coalesce(public.safe_uuid(task_item ->> 'id'), gen_random_uuid()),
  wd.workspace_id,
  coalesce(task_item ->> 'title', ''),
  case when coalesce(task_item ->> 'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (task_item ->> 'dueDate')::date else null end,
  coalesce(task_item ->> 'status', 'Open'),
  coalesce(task_item ->> 'owner', '')
from public.workspace_data wd
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(wd.data -> 'tasks') = 'array' then wd.data -> 'tasks' else '[]'::jsonb end
) task_item
on conflict (id) do nothing;

update public.workspace_members wm
set
  email = coalesce(u.email, wm.email),
  display_name = coalesce(u.raw_user_meta_data ->> 'display_name', u.email, wm.display_name)
from auth.users u
where u.id = wm.user_id;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_data enable row level security;
alter table public.folders enable row level security;
alter table public.grants enable row level security;
alter table public.grant_applications enable row level security;
alter table public.application_questions enable row level security;
alter table public.answer_history enable row level security;
alter table public.documents enable row level security;
alter table public.tasks enable row level security;
alter table public.workspace_invites enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

drop policy if exists "members can read workspaces" on public.workspaces;
create policy "members can read workspaces" on public.workspaces for select
using (created_by = auth.uid() or public.is_workspace_member(id));

drop policy if exists "users can create own workspaces" on public.workspaces;
create policy "users can create own workspaces" on public.workspaces for insert
with check (created_by = auth.uid());

drop policy if exists "owners can update workspaces" on public.workspaces;
create policy "owners can update workspaces" on public.workspaces for update
using (created_by = auth.uid() or public.is_workspace_admin(id))
with check (created_by = auth.uid() or public.is_workspace_admin(id));

drop policy if exists "members can read memberships" on public.workspace_members;
create policy "members can read memberships" on public.workspace_members for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "users can add self as owner" on public.workspace_members;
create policy "users can add self as owner" on public.workspace_members for insert
with check (
  user_id = auth.uid()
  and role = 'owner'
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
);

drop policy if exists "owners can manage memberships" on public.workspace_members;
create policy "owners can manage memberships" on public.workspace_members for update
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists "owners can remove memberships" on public.workspace_members;
create policy "owners can remove memberships" on public.workspace_members for delete
using (public.is_workspace_admin(workspace_id) and user_id <> auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspace_data', 'folders', 'grants', 'grant_applications', 'application_questions',
    'answer_history', 'documents', 'tasks'
  ]
  loop
    execute format('drop policy if exists "workspace members select" on public.%I', table_name);
    execute format(
      'create policy "workspace members select" on public.%I for select using (public.is_workspace_member(workspace_id))',
      table_name
    );
    execute format('drop policy if exists "workspace members insert" on public.%I', table_name);
    execute format(
      'create policy "workspace members insert" on public.%I for insert with check (public.is_workspace_member(workspace_id))',
      table_name
    );
    execute format('drop policy if exists "workspace members update" on public.%I', table_name);
    execute format(
      'create policy "workspace members update" on public.%I for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))',
      table_name
    );
    execute format('drop policy if exists "workspace members delete" on public.%I', table_name);
    execute format(
      'create policy "workspace members delete" on public.%I for delete using (public.is_workspace_member(workspace_id))',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists "admins can read invites" on public.workspace_invites;
create policy "admins can read invites" on public.workspace_invites for select
using (public.is_workspace_admin(workspace_id));

drop policy if exists "admins can create invites" on public.workspace_invites;
create policy "admins can create invites" on public.workspace_invites for insert
with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());

drop policy if exists "admins can update invites" on public.workspace_invites;
create policy "admins can update invites" on public.workspace_invites for update
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists "admins can delete invites" on public.workspace_invites;
create policy "admins can delete invites" on public.workspace_invites for delete
using (public.is_workspace_admin(workspace_id));
