# Grant Dashboard

A local-first grant pipeline dashboard for small nonprofit teams.

## Features

- Password-protected local accounts and workspaces
- Optional Supabase Auth/Postgres mode for shared logins across browsers
- Grant lead tracker with status, priority, deadlines, fit scores, notes, and source links
- Answer bank for verbatim previous grant answers, sorted by question type
- Document checklist and task queue
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

With Supabase env vars, the app uses Supabase Auth and stores the workspace JSON in Postgres behind Row Level Security.

The public repository does not contain Pluto Foundation grant records, passwords, service-role keys, or other private credentials. A Supabase anon key is public by design; keep the service-role key out of the app and GitHub.

Use the Settings view to import or export workspace JSON.

## Shared Login Setup

1. Run `supabase-schema.sql` in the Supabase SQL editor.
2. Set `VITE_SUPABASE_URL` and either `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` for the GitHub Pages build.
3. Redeploy.
4. Create the shared workspace account in the app.
