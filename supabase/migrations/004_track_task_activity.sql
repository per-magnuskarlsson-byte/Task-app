-- Migration: keep tasks.updated_at accurate.
--
-- tasks.updated_at has existed since the original schema but nothing ever
-- set it on UPDATE — it stayed frozen at creation time. This adds:
--  * A trigger so any change to a task row bumps updated_at automatically
--    (status change, reassignment, edit — whoever's allowed to make it).
--  * A trigger so uploading, deleting, or relinking a document counts as
--    an update to the task(s) it's attached to, even though that's a
--    write to the `documents` table, not `tasks`.

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

-- security definer + set search_path so this always succeeds regardless
-- of which caller's RLS context triggered it (matches the pattern used by
-- is_admin() and the other trigger functions in this schema).
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
