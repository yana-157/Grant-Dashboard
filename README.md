# Grant Dashboard

A shared grant pipeline and application workspace for small nonprofit teams.

## Features

- Password-protected local accounts and workspaces
- Optional Supabase Auth/Postgres mode with individual teammate accounts
- Grant lead tracker with status, priority, deadlines, fit scores, notes, and source links
- In-dashboard application cycles with ordered questions, response drafting, word limits, and progress tracking
- Automatic Answer Bank with current responses and immutable final/submitted versions
- Rule-based question categorization and verbatim answer reuse with no AI
- Document checklist and task queue linked to applications
- Expiring workspace invitation links for collaborators
- JSON import/export for moving workspace data between browsers or backing it up
- Static GitHub Pages deployment with no private keys

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Data

Without Supabase env vars, workspace data is stored in the browser using `localStorage`.

With Supabase env vars, the app uses Supabase Auth and normalized Postgres tables behind Row Level Security. Grants, applications, questions, answer history, documents, and tasks are saved independently to avoid whole-workspace overwrite conflicts.

The public repository does not contain Pluto Foundation grant records, passwords, service-role keys, or other private credentials. A Supabase anon key is public by design; keep the service-role key out of the app and GitHub.

Use the Settings view to import or export workspace JSON.

## Shared Workspace Setup

1. Run `supabase-schema.sql` in the Supabase SQL editor.
2. Set `VITE_SUPABASE_URL` and either `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` for the GitHub Pages build.
3. Redeploy.
4. Create the workspace owner account in the app.
5. Create teammate invitation links in Settings. Each collaborator signs in with their own password-protected account.

The schema is idempotent and migrates records from the original `workspace_data` JSON table into normalized tables without deleting the legacy backup row.
