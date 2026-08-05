-- Migration: role-based task/document access.
--
-- Rules enforced from here on:
--  * A task is visible only to the profile it's assigned to, and to
--    superusers (profiles.role = 'admin').
--  * Only superusers can create, edit (title/description/due date),
--    reassign, or delete tasks. The assignee can still change a task's
--    status.
--  * A document is visible only to people who can see its linked task
--    (i.e. its assignee, or a superuser).
--  * A document can be uploaded or deleted by the task's assignee or a
--    superuser. Relinking a document to a *different* task, and any other
--    edit, is superuser-only.
--  * Only a superuser can change anyone's role (closes a pre-existing gap
--    where a user could set their own profiles.role via the "update own
--    profile" policy).

-- ── Helper: is the current user a superuser? ────────────────────
-- security definer so it can read `profiles` regardless of the caller's
-- own RLS visibility into that table (there's none currently, but this
-- keeps the check robust either way).
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

-- ── Tasks ────────────────────────────────────────────────────────
drop policy if exists "tasks are viewable by authenticated users" on tasks;
drop policy if exists "authenticated users can create tasks" on tasks;
drop policy if exists "authenticated users can update tasks" on tasks;
drop policy if exists "authenticated users can delete tasks" on tasks;

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

-- Column-level guard: a non-superuser assignee may only flip `status`.
-- Everything else (title, description, due_date, priority, assigned_to,
-- created_by) is superuser-only, even though the row-level policy above
-- would otherwise let the assignee UPDATE the row.
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

-- ── Documents ────────────────────────────────────────────────────
drop policy if exists "documents are viewable by authenticated users" on documents;
drop policy if exists "authenticated users can add documents" on documents;
drop policy if exists "authenticated users can update documents" on documents;
drop policy if exists "authenticated users can delete documents" on documents;

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

-- Relinking a document to a different task, or any other edit, is
-- superuser-only (relinking moves it into someone else's task, which is
-- effectively a reassignment).
create policy "only superusers can edit or relink a document"
  on documents for update
  using (is_admin())
  with check (is_admin());

-- ── Profiles: close the role self-escalation gap ────────────────
-- The existing "users can update their own profile" policy lets any user
-- UPDATE their own row, with no column restriction — meaning a user could
-- currently set their own role to 'admin' directly via the API. Block
-- that: only a superuser may change `role`.
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
