-- Run this in the Supabase SQL editor once, on a fresh project.

-- 1. Profiles: one row per user, auto-created on sign-up
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  role text default 'member', -- 'admin' (superuser) or 'member'
  created_at timestamptz default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 2. Tasks
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  status text default 'open' check (status in ('open', 'in_progress', 'done')),
  priority text default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_to uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Documents (process definitions, checklists, etc.)
-- Every document belongs to exactly one task: task_id is a required single
-- foreign key (not a join table), so a document can never be stored without
-- a link, and can never link to more than one task. A task with documents
-- attached can't be deleted until those documents are removed or relinked.
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text default 'other' check (category in ('process_definition', 'checklist', 'other')),
  file_path text not null,      -- path inside the "documents" storage bucket
  file_name text,
  version int default 1,
  task_id uuid not null references tasks(id) on delete restrict,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ── Row Level Security ──────────────────────────────────────────
-- A task is visible only to the profile it's assigned to, and to
-- superusers (profiles.role = 'admin'). Only superusers can create, edit,
-- reassign, or delete tasks — the assignee can still flip its status. A
-- document is visible/manageable by its task's assignee or a superuser;
-- relinking a document to a different task is superuser-only.

alter table profiles enable row level security;
alter table tasks enable row level security;
alter table documents enable row level security;

-- Helper: is the current user a superuser? security definer so it can
-- read `profiles` regardless of the caller's own RLS visibility into it.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "profiles are viewable by authenticated users" on profiles;
drop policy if exists "users can update their own profile" on profiles;
create policy "profiles are viewable by authenticated users"
  on profiles for select using (auth.role() = 'authenticated');
create policy "users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- Close a self-escalation gap: the policy above lets a user UPDATE their
-- own row with no column restriction, which would let them set their own
-- role to 'admin'. Only a superuser may change `role`.
create or replace function prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() and new.role is distinct from old.role then
    raise exception 'Only a superuser can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_role_self_escalation on profiles;
create trigger prevent_role_self_escalation
  before update on profiles
  for each row execute procedure prevent_role_self_escalation();

drop policy if exists "tasks are viewable by their assignee or a superuser" on tasks;
drop policy if exists "only superusers can create tasks" on tasks;
drop policy if exists "assignee or superuser can update a task" on tasks;
drop policy if exists "only superusers can delete tasks" on tasks;
create policy "tasks are viewable by their assignee or a superuser"
  on tasks for select
  using (is_admin() or assigned_to = auth.uid());
create policy "only superusers can create tasks"
  on tasks for insert
  with check (is_admin());
create policy "assignee or superuser can update a task"
  on tasks for update
  using (is_admin() or assigned_to = auth.uid())
  with check (is_admin() or assigned_to = auth.uid());
create policy "only superusers can delete tasks"
  on tasks for delete
  using (is_admin());

-- Column-level guard: a non-superuser assignee may only flip `status` —
-- everything else on a task is superuser-only, even though the row-level
-- policy above would otherwise let the assignee UPDATE the row.
create or replace function enforce_task_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.due_date is distinct from old.due_date
       or new.priority is distinct from old.priority
       or new.assigned_to is distinct from old.assigned_to
       or new.created_by is distinct from old.created_by then
      raise exception 'Only a superuser can edit, reassign, or delete tasks';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_task_update on tasks;
create trigger enforce_task_update
  before update on tasks
  for each row execute procedure enforce_task_update_permissions();

-- Keep updated_at accurate: bump it on any change to the row (status,
-- reassignment, edit), and treat uploading, deleting, or relinking a
-- document as an update to the task(s) it's attached to.
create or replace function set_task_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tasks_updated_at on tasks;
create trigger set_tasks_updated_at
  before update on tasks
  for each row execute procedure set_task_updated_at();

create or replace function bump_task_updated_at_from_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update tasks set updated_at = now() where id = old.task_id;
    return old;
  end if;

  update tasks set updated_at = now() where id = new.task_id;
  if tg_op = 'UPDATE' and new.task_id is distinct from old.task_id then
    update tasks set updated_at = now() where id = old.task_id;
  end if;
  return new;
end;
$$;

drop trigger if exists bump_task_updated_at_on_document_insert on documents;
drop trigger if exists bump_task_updated_at_on_document_update on documents;
drop trigger if exists bump_task_updated_at_on_document_delete on documents;
create trigger bump_task_updated_at_on_document_insert
  after insert on documents
  for each row execute procedure bump_task_updated_at_from_document();
create trigger bump_task_updated_at_on_document_update
  after update on documents
  for each row execute procedure bump_task_updated_at_from_document();
create trigger bump_task_updated_at_on_document_delete
  after delete on documents
  for each row execute procedure bump_task_updated_at_from_document();

drop policy if exists "documents are viewable by their task's assignee or a superuser" on documents;
drop policy if exists "assignee or superuser can upload a document to their task" on documents;
drop policy if exists "assignee or superuser can delete a document on their task" on documents;
drop policy if exists "only superusers can edit or relink a document" on documents;
create policy "documents are viewable by their task's assignee or a superuser"
  on documents for select
  using (
    is_admin()
    or exists (select 1 from tasks t where t.id = documents.task_id and t.assigned_to = auth.uid())
  );
create policy "assignee or superuser can upload a document to their task"
  on documents for insert
  with check (
    is_admin()
    or exists (select 1 from tasks t where t.id = task_id and t.assigned_to = auth.uid())
  );
create policy "assignee or superuser can delete a document on their task"
  on documents for delete
  using (
    is_admin()
    or exists (select 1 from tasks t where t.id = documents.task_id and t.assigned_to = auth.uid())
  );
create policy "only superusers can edit or relink a document"
  on documents for update
  using (is_admin())
  with check (is_admin());

-- ── Storage bucket for uploaded files ───────────────────────────
-- Run once: creates a private bucket. Files are only reachable via
-- signed URLs generated for logged-in users (see Documents.jsx).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "authenticated users can read documents bucket" on storage.objects;
drop policy if exists "authenticated users can upload to documents bucket" on storage.objects;

create policy "authenticated users can read documents bucket"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "authenticated users can upload to documents bucket"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');
