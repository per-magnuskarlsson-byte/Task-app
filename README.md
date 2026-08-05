# Team Tasks

A small task manager and document library for a team of ~2-10 people. Works as a
regular website and installs to an iPhone home screen like an app (PWA) — the
same site works on your laptop too.

## What's included

- **Login** — email/password auth via Supabase (`src/pages/Login.jsx`)
- **Tasks** — create tasks, assign to a teammate, track status (`src/pages/Tasks.jsx`)
- **Documents** — upload process definitions / checklists, open them via secure links (`src/pages/Documents.jsx`)
- **Database schema + security rules** — `supabase/schema.sql`

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. In the SQL editor, paste and run everything in `supabase/schema.sql`.
   This creates the `profiles`, `tasks`, `documents` tables, a private
   `documents` storage bucket, and the security rules that make sure only
   logged-in team members can read or write data. Every document requires a
   linked task (`documents.task_id`, not nullable) — a task can't be deleted
   while documents still reference it.
   - Already have a project running the old schema? Run
     `supabase/migrations/002_require_document_task.sql` instead — see the
     comments at the top of that file first.
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
`role` to `admin` for yourself if you want an admin flag to build on later.

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
- **Admin-only actions**: the `profiles.role` column is already there;
  add a check in your RLS policies (e.g. only admins can delete tasks) once
  you know who should have that power.
