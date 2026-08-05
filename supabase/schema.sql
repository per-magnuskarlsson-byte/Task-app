-- Run this in the Supabase SQL editor once, on a fresh project.

-- 1. Profiles: one row per user, auto-created on sign-up
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  role text default 'member', -- 'admin' or 'member'
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
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text default 'other' check (category in ('process_definition', 'checklist', 'other')),
  file_path text not null,      -- path inside the "documents" storage bucket
  file_name text,
  version int default 1,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- 4. Optional: link documents to specific tasks (e.g. attach a checklist to a task)
create table if not exists task_documents (
  task_id uuid references tasks(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  primary key (task_id, document_id)
);

-- ── Row Level Security ──────────────────────────────────────────
-- Everyone who is logged in can see everything (small trusted team).
-- Only signed-in users can write. Adjust if you need per-user restrictions.

alter table profiles enable row level security;
alter table tasks enable row level security;
alter table documents enable row level security;
alter table task_documents enable row level security;

create policy "profiles are viewable by authenticated users"
  on profiles for select using (auth.role() = 'authenticated');
create policy "users can update their own profile"
  on profiles for update using (auth.uid() = id);

create policy "tasks are viewable by authenticated users"
  on tasks for select using (auth.role() = 'authenticated');
create policy "authenticated users can create tasks"
  on tasks for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can update tasks"
  on tasks for update using (auth.role() = 'authenticated');
create policy "authenticated users can delete tasks"
  on tasks for delete using (auth.role() = 'authenticated');

create policy "documents are viewable by authenticated users"
  on documents for select using (auth.role() = 'authenticated');
create policy "authenticated users can add documents"
  on documents for insert with check (auth.role() = 'authenticated');
create policy "authenticated users can delete documents"
  on documents for delete using (auth.role() = 'authenticated');

create policy "task_documents viewable by authenticated users"
  on task_documents for select using (auth.role() = 'authenticated');
create policy "authenticated users can link documents to tasks"
  on task_documents for insert with check (auth.role() = 'authenticated');

-- ── Storage bucket for uploaded files ───────────────────────────
-- Run once: creates a private bucket. Files are only reachable via
-- signed URLs generated for logged-in users (see Documents.jsx).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "authenticated users can read documents bucket"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "authenticated users can upload to documents bucket"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');
