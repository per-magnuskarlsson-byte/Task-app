-- Migration for an EXISTING Supabase project that already ran the original
-- schema.sql (documents.task_id nullable, or the older task_documents join
-- table). Enforces the new rule: every document must link to exactly one
-- task. Fresh projects should just use supabase/schema.sql instead.

-- 1. Drop the old many-to-many join table, if this project ever had it —
--    superseded by documents.task_id (a single required foreign key).
drop table if exists task_documents;

-- 2. Before making task_id required, resolve any documents that don't have
--    one yet. Check first:
--      select id, title from documents where task_id is null;
--    Then either delete those rows or UPDATE ... SET task_id = '<some task
--    id>' for each. The ALTER TABLE below fails until none remain.
alter table documents
  alter column task_id set not null;

-- 3. Tighten the delete behavior: a task can no longer be deleted while
--    documents still reference it (previously: on delete set null, which
--    would have orphaned the now-required task_id).
alter table documents
  drop constraint if exists documents_task_id_fkey;
alter table documents
  add constraint documents_task_id_fkey
  foreign key (task_id) references tasks(id) on delete restrict;

-- 4. Make sure relinking a document to a different task is allowed.
drop policy if exists "authenticated users can update documents" on documents;
create policy "authenticated users can update documents"
  on documents for update using (auth.role() = 'authenticated');
