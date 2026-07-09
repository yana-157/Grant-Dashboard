# Grant Dashboard

A local-first grant pipeline dashboard for small nonprofit teams.

## Features

- Password-protected local accounts and workspaces
- Grant lead tracker with status, priority, deadlines, fit scores, notes, and source links
- Answer bank for verbatim previous grant answers, sorted by question type
- Document checklist and task queue
- JSON import/export for moving workspace data between browsers or backing it up
- Static GitHub Pages deployment with no embedded API keys

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

Workspace data is stored in the browser using `localStorage`. The public repository does not contain Pluto Foundation grant records, passwords, Supabase keys, or other credentials.

Use the Settings view to import or export workspace JSON.
