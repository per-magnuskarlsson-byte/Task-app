# KungsAir Tasks

A small task manager and document library for a team of ~2-10 people. Works as a
regular website and installs to an iPhone home screen like an app (PWA) — the
same site works on your laptop too.

## What's included

- **Login** — email/password auth via Supabase (`src/pages/Login.jsx`)
- **Tasks** — superusers create tasks, assign a teammate, edit details, and
  delete; the assignee tracks status. Each person only sees tasks assigned
  to them; superusers see everything (`src/pages/Tasks.jsx`)
- **Documents** — uploaded per task, from that task's page: multiple files
  at once, process definitions / checklists, opened via secure links,
  deletable. A document is only visible to its task's assignee or a
  superuser (`src/pages/TaskDetail.jsx`)
- **Database schema + security rules** — `supabase/schema.sql`

## Roles

`profiles.role` is `'member'` or `'admin'` — `admin` is the superuser role.
Superusers can create/edit/reassign/delete tasks, see every task, and manage
any document. A member only sees tasks assigned to them (and those tasks'
documents), and can update a task's status or upload/delete documents on
their own tasks. There's no in-app way to promote someone — open the
`profiles` table in the Supabase dashboard and set `role` to `admin` for
whoever should have it.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. In the SQL editor, paste and run everything in `supabase/schema.sql`.
   This creates the `profiles`, `tasks`, `documents` tables, a private
   `documents` storage bucket, and the security rules described above
   (role-based visibility, and documents requiring a linked task —
   `documents.task_id` is not nullable, and a task can't be deleted while
   documents still reference it).
   - Already have a project running an older version of this schema? Run,
     in order, whichever of the files in `supabase/migrations/` you haven't
     applied yet — each one's header comment explains what it does and any
     manual steps needed first.
3. In **Project settings → API**, copy the **Project URL** and **anon public key**.

## 2. Configure the app

```bash
cp .env.example .env
```

Paste your Project URL and anon key into `.env`.

## 3. Run it locally

```bash
npm install
npm run dev
```

Open the printed local URL. Sign up with your email — the first account you
create is a normal team member; open the `profiles` table in Supabase and set
`role` to `admin` for yourself so you can create and assign tasks (see
[Roles](#roles) above).

## 4. Use it on your iPhone

Once deployed (see below), open the site in Safari on your iPhone, tap the
Share icon, then **Add to Home Screen**. It'll behave like an installed app.

## 5. Deploy

Push this folder to GitHub and import it into [Vercel](https://vercel.com) or
[Netlify](https://netlify.com) — both auto-detect Vite. Add the same two
environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the
hosting provider's dashboard. Every team member then just visits the same URL
and logs in — no App Store install needed.

## Extending it

- **Checklists as structured data**: right now checklists are uploaded as
  files. If you want people to check items off inside the app, add a
  `checklist_items` table (`document_id`, `label`, `sort_order`) and a
  `task_checklist_progress` table to track completion per task.
- **Notifications**: Supabase supports realtime subscriptions — you could
  notify a user the moment a task is assigned to them.
- **More admin-only actions**: `is_admin()` (defined in `supabase/schema.sql`)
  is available to reuse in any new RLS policy or trigger you add.
